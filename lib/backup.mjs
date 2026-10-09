import {canonical,digest} from './universal.mjs';
import {validate} from './schema.mjs';
import {typedRecordSchema,nativeIdentitySchema,validateNativeIdentity,validateTypedRecords} from './typed-references.mjs';
const s={type:'string',minLength:1,maxLength:2000},short={...s,maxLength:200};
const arr=(items,min=0,max=16)=>({type:'array',items,minItems:min,maxItems:max});
const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const handle={type:'string',minLength:36,maxLength:36};
const contract={type:'string',enum:['LEGACY_V1','TYPED_V2']};
export const resolverSchema=obj({
 format_version:{type:'string',enum:['DASH-PRIVATE-RESOLVER-1.0']},record_contract:contract,
 project_id:short,project_handle:handle,
 checkpoints:arr(obj({checkpoint_id:short,checkpoint_handle:handle,record_ids:arr(short,1,64)}),1,128),
 records:arr(obj({record_id:short,record_handle:handle,identity:nativeIdentitySchema}),1,512)
});
const recordProperties={
 id:short,category:{type:'string',enum:['EVIDENCE','CLASSIFIER','METHOD','PROGRAM_RULE','TERMS_OF_SERVICE','REPORT_DRAFT','CHECKPOINT']},
 title:short,source_ref:s,source_version:short,observed_at:short,
 state:{type:'string',enum:['DECLARED','OBSERVED','REVIEWED','DISPUTED','UNKNOWN','SUPERSEDED']},
 classifier_ids:arr(short),method_ids:arr(short),parent_record_ids:arr(short),notes:{type:'string',maxLength:4000}
};
export const backupSchema=obj({
 project_id:short,checkpoint_id:short,records:arr(obj({...recordProperties,typed:typedRecordSchema},Object.keys(recordProperties)),1,64),
 next_action:s,stop_condition:s,record_contract:contract,
 export_profile:{type:'string',enum:['PRIVATE','PRIVATE_WITH_DASH_REFERENCES']},
 resolver_action:{type:'string',enum:['CREATE','REUSE','ADVANCE']},dash_resolver:resolverSchema,
 expected_resolver_fingerprint:{type:'string',minLength:64,maxLength:64}
},['project_id','checkpoint_id','records','next_action','stop_condition']);
export const backupContract={version:'RESEARCH-STORAGE-2.0',input_schema:backupSchema,
 default_profile:'PRIVATE',default_record_contract:'LEGACY_V1',new_work_record_contract:'TYPED_V2',
 dash_export_profile:'PRIVATE_WITH_DASH_REFERENCES',dash_artifact_fields:['dash_projection','dash_csv'],
 resolver_actions:{CREATE:'Explicit initial alias allocation; save private resolver and checksum.',REUSE:'Exact checkpoint membership with saved resolver and expected checksum.',ADVANCE:'New checkpoint; preserve existing project/record handles and typed identity, add only new handles.'},
 resolver_limits:{records:512,checkpoints:128,records_per_call:64},encryption:false,persistence_hosted:false,
 identity_rule:'Native namespace and ID type are exact; numeric MAXVAR is distinct from string registry IDs. Ordinal is separate. TYPED_V2 uses empty legacy classifier_ids/method_ids and registered typed references.'};
const fail=message=>{throw Error(message)};
const safeCell=value=>{
 let cell=Array.isArray(value)?value.join(' | '):String(value);
 if(/^[\s]*[=+@-]/u.test(cell))cell="'"+cell;
 return '"'+cell.replaceAll('"','""')+'"';
};
const toCsv=(columns,rows)=>[columns.map(safeCell).join(','),...rows.map(row=>row.map(safeCell).join(','))].join('\r\n');
const compareText=(a,b)=>a<b?-1:a>b?1:0;
const uuidV4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const identityFor=(record,typed)=>typed?{...record.typed.identity}:{namespace:'LEGACY_RECORD_ID',native_id_type:'string',native_id:record.id};
const sameSet=(a,b)=>a.length===b.size&&new Set(a).size===a.length&&a.every(id=>b.has(id));

function validateResolver(resolver,input){
 if(resolver.project_id!==input.project_id||resolver.record_contract!==(input.record_contract??'LEGACY_V1'))fail('DASH_RESOLVER_SCOPE_MISMATCH');
 const seenIds=new Set(),seenCheckpoints=new Set(),seenHandles=new Set(),referencedIds=new Set();
 for(const value of [resolver.project_handle,...resolver.checkpoints.map(c=>c.checkpoint_handle),...resolver.records.map(r=>r.record_handle)]){
  if(!uuidV4.test(value))fail('DASH_HANDLE_MUST_BE_CANONICAL_UUID_V4');
  if(seenHandles.has(value))fail('DASH_HANDLE_COLLISION');seenHandles.add(value);
 }
 for(const row of resolver.records){
  if(seenIds.has(row.record_id))fail('DASH_RESOLVER_DUPLICATE_RECORD');seenIds.add(row.record_id);
  validateNativeIdentity(row.identity);
  if(resolver.record_contract==='LEGACY_V1'&&canonical(row.identity)!==canonical(identityFor({id:row.record_id},false)))fail('DASH_RESOLVER_IDENTITY_MISMATCH');
 }
 for(const checkpoint of resolver.checkpoints){
  if(seenCheckpoints.has(checkpoint.checkpoint_id))fail('DASH_RESOLVER_DUPLICATE_CHECKPOINT');seenCheckpoints.add(checkpoint.checkpoint_id);
  if(new Set(checkpoint.record_ids).size!==checkpoint.record_ids.length||checkpoint.record_ids.some(id=>!seenIds.has(id)))fail('DASH_RESOLVER_RECORD_SET_MISMATCH');
  checkpoint.record_ids.forEach(id=>referencedIds.add(id));
 }
 if(referencedIds.size!==seenIds.size)fail('DASH_RESOLVER_ORPHAN_RECORD');
 const privateText=JSON.stringify({project_id:input.project_id,checkpoint_id:input.checkpoint_id,records:input.records,next_action:input.next_action,stop_condition:input.stop_condition,
  prior_ids:resolver.records.map(r=>({record_id:r.record_id,identity:r.identity})),prior_checkpoints:resolver.checkpoints.map(c=>c.checkpoint_id)});
 if([...seenHandles].some(value=>privateText.includes(value)))fail('DASH_HANDLE_REUSES_PRIVATE_CONTENT');
}

async function prepareResolver(input,ids,typed){
 const action=input.resolver_action;
 if(!action)fail('EXPLICIT_DASH_RESOLVER_ACTION_REQUIRED');
 let resolver;
 if(action==='CREATE'){
  if(input.dash_resolver||input.expected_resolver_fingerprint)fail('CREATE_MUST_NOT_REPLACE_EXISTING_RESOLVER');
  resolver={format_version:'DASH-PRIVATE-RESOLVER-1.0',record_contract:input.record_contract??'LEGACY_V1',project_id:input.project_id,project_handle:crypto.randomUUID(),
   checkpoints:[{checkpoint_id:input.checkpoint_id,checkpoint_handle:crypto.randomUUID(),record_ids:[...ids].sort(compareText)}],
   records:input.records.map(r=>({record_id:r.id,record_handle:crypto.randomUUID(),identity:identityFor(r,typed)}))};
 }else{
  if(!input.dash_resolver||!input.expected_resolver_fingerprint)fail('SAVED_RESOLVER_AND_FINGERPRINT_REQUIRED');
  if(!/^[0-9a-f]{64}$/.test(input.expected_resolver_fingerprint)||await digest(input.dash_resolver)!==input.expected_resolver_fingerprint)fail('DASH_RESOLVER_FINGERPRINT_MISMATCH');
  resolver=structuredClone(input.dash_resolver);validateResolver(resolver,input);
  const checkpoint=resolver.checkpoints.find(c=>c.checkpoint_id===input.checkpoint_id),known=new Map(resolver.records.map(r=>[r.record_id,r]));
  for(const record of input.records)if(known.has(record.id)&&canonical(known.get(record.id).identity)!==canonical(identityFor(record,typed)))fail('DASH_RESOLVER_IDENTITY_MISMATCH');
  if(action==='REUSE'){
   if(!checkpoint||!sameSet(checkpoint.record_ids,ids))fail('DASH_RESOLVER_CHECKPOINT_RECORD_SET_MISMATCH');
  }else{
   if(checkpoint)fail('ADVANCE_REQUIRES_NEW_CHECKPOINT');
   if(resolver.checkpoints.length>=128)fail('DASH_RESOLVER_CHECKPOINT_CAPACITY');
   const additions=input.records.filter(r=>!known.has(r.id));
   if(resolver.records.length+additions.length>512)fail('DASH_RESOLVER_RECORD_CAPACITY');
   resolver.records.push(...additions.map(r=>({record_id:r.id,record_handle:crypto.randomUUID(),identity:identityFor(r,typed)})));
   resolver.checkpoints.push({checkpoint_id:input.checkpoint_id,checkpoint_handle:crypto.randomUUID(),record_ids:[...ids].sort(compareText)});
  }
 }
 validateResolver(resolver,input);
 resolver.records.sort((a,b)=>compareText(a.record_id,b.record_id));
 resolver.checkpoints.sort((a,b)=>compareText(a.checkpoint_id,b.checkpoint_id));
 resolver.checkpoints.forEach(c=>c.record_ids.sort(compareText));
 return resolver;
}

export async function prepareResearchBackup(input){
 validate(input,backupSchema);
 const profile=input.export_profile??'PRIVATE',typed=input.record_contract==='TYPED_V2';
 if(profile!=='PRIVATE_WITH_DASH_REFERENCES'&&(input.dash_resolver||input.resolver_action||input.expected_resolver_fingerprint))fail('DASH_FIELDS_REQUIRE_EXPLICIT_EXPORT_PROFILE');
 if(!typed&&input.records.some(r=>r.typed))fail('TYPED_METADATA_REQUIRES_TYPED_V2_CONTRACT');
 const referenceBinding=typed?await validateTypedRecords(input.records):null;
 const ids=new Set(input.records.map(r=>r.id));if(ids.size!==input.records.length)fail('DUPLICATE_RECORD_ID');
 for(const r of input.records)if(r.parent_record_ids.some(id=>!ids.has(id)))fail('UNRESOLVED_PARENT_RECORD');
 const map=new Map(input.records.map(r=>[r.id,r])),active=new Set(),done=new Set();
 function visit(id){if(active.has(id))fail('RECORD_DEPENDENCY_CYCLE');if(done.has(id))return;active.add(id);map.get(id).parent_record_ids.forEach(visit);active.delete(id);done.add(id)}
 input.records.forEach(r=>visit(r.id));
 const ordered=[...input.records].sort(typed?(a,b)=>a.typed.ordinal-b.typed.ordinal:(a,b)=>a.category.localeCompare(b.category)||a.id.localeCompare(b.id));
 const records=await Promise.all(ordered.map(async r=>({...r,record_fingerprint:await digest(r)})));
 const columns=['id','category','title','source_ref','source_version','observed_at','state','classifier_ids','method_ids','parent_record_ids','notes','record_fingerprint'];
 if(typed)columns.push('native_namespace','native_id_type','native_id_json','ordinal','classifier_refs_json','method_refs_json');
 const rows=records.map(r=>columns.map(k=>{
  if(k==='native_namespace')return r.typed.identity.namespace;
  if(k==='native_id_type')return r.typed.identity.native_id_type;
  if(k==='native_id_json')return JSON.stringify(r.typed.identity.native_id);
  if(k==='ordinal')return r.typed.ordinal;
  if(k==='classifier_refs_json')return JSON.stringify(r.typed.classifier_refs);
  if(k==='method_refs_json')return JSON.stringify(r.typed.method_refs);
  return r[k];
 }));
 const manifest={format_version:typed?'RESEARCH-BACKUP-2.0':'RESEARCH-BACKUP-1.0',project_id:input.project_id,checkpoint_id:input.checkpoint_id,records,next_action:input.next_action,stop_condition:input.stop_condition,...(typed?{reference_registry_binding:referenceBinding}:{})};
 const fingerprint=await digest(manifest);let dash={};
 if(profile==='PRIVATE_WITH_DASH_REFERENCES'){
  const resolver=await prepareResolver(input,ids,typed),checkpoint=resolver.checkpoints.find(c=>c.checkpoint_id===input.checkpoint_id);
  // Construct the entire Dash artifact from a positive allowlist. Never spread private data here.
  const projection={format_version:'DASH-REFERENCE-1.0',project_handle:resolver.project_handle,checkpoint_handle:checkpoint.checkpoint_handle,
   records:resolver.records.filter(r=>ids.has(r.record_id)).map(r=>({record_handle:r.record_handle})).sort((a,b)=>compareText(a.record_handle,b.record_handle))};
  const dashColumns=['format_version','project_handle','checkpoint_handle','record_handle'];
  dash={private_resolver:resolver,private_resolver_fingerprint:await digest(resolver),dash_projection:projection,
   dash_csv:toCsv(dashColumns,projection.records.map(r=>[projection.format_version,projection.project_handle,projection.checkpoint_handle,r.record_handle]))};
 }
 return {status:'BACKUP_PREPARED_NOT_SAVED',backup_fingerprint:fingerprint,manifest,
  spreadsheet:{columns,rows,csv:toCsv(columns,rows),formula_cells_escaped:true},
  groups:Object.fromEntries([...new Set(records.map(r=>r.category))].map(category=>[category,records.filter(r=>r.category===category).map(r=>r.id)])),...dash,
  disclosure:{export_profile:profile,entire_tool_result:'PRIVATE_NOT_DASH_EXPORTABLE',private_manifest_field:'manifest',
   private_artifacts:['manifest','spreadsheet','groups',...(dash.private_resolver?['private_resolver','private_resolver_fingerprint']:[])],dash_artifacts:dash.dash_projection?['dash_projection','dash_csv']:[],
   reference_validation:typed?'REGISTERED_NAMESPACE_AND_NATIVE_TYPE_VERIFIED':'LEGACY_REFERENCES_UNVERIFIED',identifier_coercion:false,
   alias_generation:dash.private_resolver?(input.resolver_action==='CREATE'?'CSPRNG_UUID_V4_NEW_RESOLVER':input.resolver_action==='ADVANCE'?'VALIDATED_RESOLVER_ADVANCED_NEW_HANDLES_ONLY':'VALIDATED_CALLER_RESOLVER_REUSED'):'NONE',
   encryption:false,access_control_changed:false,existing_indexed_content_changed:false,confidentiality_guaranteed:false,
   visible_dash_metadata:'Opaque handle equality, record count and export structure remain visible.',
   resolver_trust:'Caller-supplied private crosswalk and expected checksum; structural validation does not authenticate its history. Save and reload the same resolver to preserve aliases.',
   timestamp_validation:'observed_at is retained verbatim; timestamp semantics are not validated.'},
  storage_handoff:{
   private_canonical:'Save manifest, private spreadsheet and private_resolver only in an owner-controlled location excluded from Dash indexing. Verify saved content and retain native file IDs privately.',
   google_drive:'A private Drive file may still be readable through the owner\'s Dash connector. Verify indexing exclusion before saving private method or source content there; file ACL alone is not an indexing exclusion.',
   dash:dash.dash_projection?'Only dash_projection or dash_csv is the Dash artifact. Never upload the entire tool result, manifest, private_resolver, source content or private spreadsheet to Dash.':'No Dash artifact was requested. Full outputs remain private; select PRIVATE_WITH_DASH_REFERENCES to prepare a minimal reference projection.',
   spreadsheets:'Private CSV is formula-escaped but may be auto-typed by spreadsheet software. Use literal RAW/text for native IDs and JSON columns; ordinal is a separate numeric field. JSON manifest is the lossless record.',
   docs_notebook:'Keep executable notebooks, models, methods and source bindings private and excluded from indexing; derive review tables from the same manifest.',
   github:'Keep private artifacts in the existing intended private repository only after removing credentials and unnecessary personal data; check connected indexing exposure.',
   resume:'Reload private manifest and verify backup fingerprint. REUSE the saved resolver/checksum for a checkpoint; ADVANCE it for the next checkpoint, preserving prior record handles and typed identities. CREATE is only the explicit initial setup.'},
  persisted:false,rule_currentness_verified:false,submission_ready:false,external_action_authorized:false,canonical_promotion:false};
}
