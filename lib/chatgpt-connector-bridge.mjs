// Portable, pure connector bridge. Host/client performs actual connector calls.
// Native identity/capability/source-state normalization without network dispatch.
const SURFACES=new Set(['GOOGLE_DRIVE','DROPBOX_DASH','DROPBOX','GITHUB','MPC_BUGTOOLS','MPC_LEGAL']);
const ID=/^[A-Za-z0-9_.:\/-]{1,300}$/u;
const HASH=/^[a-f0-9]{40,64}$/u;
const fail=x=>{throw Error(x)};
function checkRecord(r){
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['surface','native_source','native_id','projection_of','version','observed_at','source_owner','epistemic_state','content_digest','pointer'].includes(k)))fail('BRIDGE_RECORD_FIELDS');
 if(!SURFACES.has(r.surface)||!SURFACES.has(r.native_source)||typeof r.native_id!=='string'||!ID.test(r.native_id))fail('BRIDGE_NATIVE_ID');
 if(r.projection_of!==null&&r.projection_of!==undefined){
  if(!r.projection_of||!SURFACES.has(r.projection_of.native_source)||typeof r.projection_of.native_id!=='string'||!ID.test(r.projection_of.native_id))fail('INVALID_NATIVE_PROJECTION');
 }
 if(typeof r.version!=='string'||!r.version.trim()||typeof r.source_owner!=='string'||!r.source_owner.trim())fail('BRIDGE_OWNER_VERSION');
 if(!['OBSERVED','DERIVED','INFERRED','UNKNOWN','SYNTHETIC'].includes(r.epistemic_state))fail('BRIDGE_EPISTEMIC_STATE');
 if(r.content_digest!==null&&r.content_digest!==undefined&&!HASH.test(r.content_digest))fail('BRIDGE_DIGEST');
 if(typeof r.pointer!=='string'||!r.pointer.trim()||r.pointer.length>2000)fail('BRIDGE_POINTER');
}
function nativeKey(r){
 const p=r.projection_of??r;
 return p.native_source+':'+p.native_id;
}
const CANONICAL_AUTHORITIES=new Set(['GOOGLE_DRIVE','DROPBOX','GITHUB']);
export function reconcileConnectorRecords(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['records','current_pointer','objective'].includes(k)))fail('BRIDGE_INPUT_FIELDS');
 if(!Array.isArray(input.records)||input.records.length>32)fail('BRIDGE_RECORD_LIMIT');
 if(typeof input.objective!=='string'||!input.objective.trim()||input.objective.length>2000)fail('BRIDGE_OBJECTIVE');
 for(const x of input.records)checkRecord(x);
 const keys=new Set(),nativeGroups=new Map();
 for(const record of input.records){
  const ident=[record.surface,record.native_source,record.native_id,record.version].join('|');
  if(keys.has(ident))fail('DUPLICATE_TRANSPORT_RECORD');
  keys.add(ident);
  const k=nativeKey(record);if(!nativeGroups.has(k))nativeGroups.set(k,[]);nativeGroups.get(k).push(record);
 }
 const groups=[...nativeGroups.entries()].map(([key,records])=>{
  const direct=records.filter(r=>r.surface===r.native_source&&CANONICAL_AUTHORITIES.has(r.native_source));
  const projections=records.filter(r=>r.surface!==r.native_source);
  const conflictingVersions=new Set(direct.map(x=>x.version)).size>1;
  const conflictingDigests=new Set(direct.map(x=>x.content_digest).filter(Boolean)).size>1;
  const status=conflictingVersions||conflictingDigests?'CONFLICTING_NATIVE_VERSIONS':
   direct.length?'NATIVE_SOURCE_PRESENT':'PROJECTION_ONLY_UNVERIFIED';
  return {native_key:key,status,direct_source_count:direct.length,projection_count:projections.length,
   distinct_evidence_sources:direct.length?1:0,
   native_pointers:direct.map(x=>x.pointer),
   projection_pointers:projections.map(x=>x.pointer),
   versions:[...new Set(records.map(x=>x.version))].sort(),
   effect:'SEARCH_DUPLICATES_DO_NOT_INCREASE_EVIDENCE_WEIGHT'};
 }).sort((a,b)=>a.native_key.localeCompare(b.native_key));
 const current=input.current_pointer;
 if(current!==null&&current!==undefined&&(typeof current!=='string'||!current.trim()||current.length>400))fail('BRIDGE_CURRENT_POINTER');
 const pointerGroup=current?groups.find(g=>g.native_key===current):null;
 return {version:'MPC_CONNECTOR_BRIDGE_1.0',status:current&&!pointerGroup?'BLOCKED_POINTER_NOT_IN_SUPPLIED_RECORDS':
  groups.some(x=>x.status==='CONFLICTING_NATIVE_VERSIONS')?'BLOCKED_CONFLICTING_NATIVE_STATE':'READ_ONLY_SOURCE_MAP',
  objective:input.objective,current_pointer:current??null,groups,
  evidence_source_count:groups.reduce((sum,g)=>sum+g.distinct_evidence_sources,0),
  unresolved_native_keys:groups.filter(g=>g.status!=='NATIVE_SOURCE_PRESENT').map(g=>g.native_key),
  external_actions_performed:false,source_authentication:false,canonical_promotion:false,
  exact_next_action:current&&!pointerGroup?'Fetch the current native controller by the exact owner-supplied ID': 'Verify current native control pointer and one source owner before any state advancement.'};
}
export function planConnectorDispatch({capabilities,operation,surface,object_id}){
 if(!Array.isArray(capabilities)||capabilities.length>12||typeof operation!=='string'||!['DISCOVER','READ','ANALYZE','WRITE_CHECKPOINT','CODE_UPDATE','TARGET_TEST'].includes(operation)||!SURFACES.has(surface)||typeof object_id!=='string'||!object_id.trim())fail('BRIDGE_DISPATCH_INPUT');
 const c=capabilities.find(x=>x.surface===surface);
 const explicit=!!c&&Array.isArray(c.operations)&&c.operations.includes(operation)&&c.available===true;
 const consequential=['WRITE_CHECKPOINT','CODE_UPDATE','TARGET_TEST'].includes(operation);
 return {surface,object_id,operation,state:!explicit?'UNAVAILABLE_IN_SESSION':consequential?'HUMAN_AUTHORIZATION_AND_NATIVE_RECEIPT_REQUIRED':'SUPPORTED_CONNECTOR_ACTION_NOT_EXECUTED',
  source_authentication:false,host_action_called:false,write_performed:false,authorization_conferred:false,
  next_step:!explicit?'Preserve OPEN capability and use available source surface only':'Call an actual registered connector schema through ChatGPT host, then read back exact native receipt.'};
}
