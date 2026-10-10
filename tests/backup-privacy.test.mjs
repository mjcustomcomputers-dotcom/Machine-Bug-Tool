import test from 'node:test';
import assert from 'node:assert/strict';
import {callTool,toolList} from '../lib/tools.mjs';
import {digest} from '../lib/universal.mjs';
import {prepareResearchBackup} from '../lib/backup.mjs';
import {handleMcp} from '../lib/mcp.mjs';

const clone=value=>structuredClone(value);
const ref=(namespace,native_id)=>({namespace,native_id_type:typeof native_id==='number'?'integer':'string',native_id});
const makeRecord=(id,ordinal,native_id=id)=>({id,category:'EVIDENCE',title:'private-title-canary',source_ref:'https://private.invalid/source-canary',source_version:'private-version-canary',observed_at:'2026-10-08T21:00:00Z',state:'OBSERVED',classifier_ids:[],method_ids:[],parent_record_ids:[],notes:'private-notes-canary',typed:{identity:{namespace:'private-native-namespace-canary',native_id_type:typeof native_id==='number'?'integer':'string',native_id},ordinal,classifier_refs:[ref('MAXVAR',31),ref('BL','BL01.01'),ref('NESTMAX','A.01'),ref('MBSS','MBSS-B01-L01'),ref('EXT','EXT:MB49.01')],method_refs:[ref('METHOD','conservation')]}});
const input=()=>({project_id:'private-project-canary',checkpoint_id:'private-checkpoint-canary',record_contract:'TYPED_V2',records:[makeRecord('02',20,'02'),makeRecord('10',30,'2'),makeRecord('2',10,2)],next_action:'private-next-action-canary',stop_condition:'private-stop-canary'});
const createInput=()=>({...input(),export_profile:'PRIVATE_WITH_DASH_REFERENCES',resolver_action:'CREATE'});
const run=args=>callTool('prepare_research_backup',args);
const reuse=(base,result,action='REUSE')=>({...base,resolver_action:action,dash_resolver:clone(result.private_resolver),expected_resolver_fingerprint:result.private_resolver_fingerprint});

test('Legacy default remains private with original manifest hash and no Dash artifact',async()=>{
 const r=makeRecord('02',0);delete r.typed;r.classifier_ids=['historical-unverified-reference'];
 const source={project_id:'p',checkpoint_id:'c',records:[r],next_action:'n',stop_condition:'s'};
 const result=await run(source);
 const original={format_version:'RESEARCH-BACKUP-1.0',project_id:'p',checkpoint_id:'c',records:[{...r,record_fingerprint:await digest(r)}],next_action:'n',stop_condition:'s'};
 assert.deepEqual(result.manifest,original);assert.equal(result.backup_fingerprint,await digest(original));
 assert.equal(result.disclosure.entire_tool_result,'PRIVATE_NOT_DASH_EXPORTABLE');assert.equal(result.disclosure.reference_validation,'LEGACY_REFERENCES_UNVERIFIED');
 assert.equal(Object.hasOwn(result,'dash_projection'),false);assert.equal(result.persisted,false);
});

test('Typed identities preserve 02, 2 and numeric 2 while ordinal controls ordering',async()=>{
 const result=await run(input());
 assert.equal(result.manifest.format_version,'RESEARCH-BACKUP-2.0');
 assert.deepEqual(result.manifest.records.map(r=>r.id),['2','02','10']);
 assert.deepEqual(result.manifest.records.map(r=>r.typed.identity.native_id),[2,'02','2']);
 assert.deepEqual(result.manifest.records.map(r=>r.typed.identity.native_id_type),['integer','string','string']);
 const index=result.spreadsheet.columns.indexOf('native_id_json');
 assert.deepEqual(result.spreadsheet.rows.map(r=>r[index]),['2','"02"','"2"']);
 assert.equal(result.disclosure.reference_validation,'REGISTERED_NAMESPACE_AND_NATIVE_TYPE_VERIFIED');
});

test('Typed contract rejects unknown, mis-typed, duplicate and cross-namespace references',async()=>{
 const mutate=[
  a=>a.records[0].typed.classifier_refs.push(ref('MAXVAR','31')),
  a=>a.records[0].typed.classifier_refs.push(ref('MAXVAR',257)),
  a=>a.records[0].typed.classifier_refs.push(ref('NESTMAX',1)),
  a=>a.records[0].typed.classifier_refs.push(ref('BL','BL99.99')),
  a=>a.records[0].typed.classifier_refs.push(ref('MBSS','BL01.01')),
  a=>a.records[0].typed.classifier_refs.push(ref('EXT','MB49.01')),
  a=>a.records[0].typed.classifier_refs.push(ref('MAXVAR',31)),
  a=>a.records[0].typed.method_refs.push(ref('METHOD','unimplemented-method')),
  a=>a.records[0].typed.identity.native_id_type='integer',
  a=>a.records[0].typed.identity={namespace:'test',native_id_type:'integer',native_id:-0},
  a=>a.records[0].typed.ordinal=10,
  a=>a.records[0].classifier_ids=['BL01.01'],
  a=>delete a.records[0].typed,
  a=>a.records[0].typed.unrecognized='must fail',
  a=>delete a.record_contract
 ];
 for(const mutation of mutate){const args=input();mutation(args);await assert.rejects(()=>run(args));}
});

test('Projection is a positive allowlist and excludes every private sentinel and source hash',async()=>{
 const args=createInput();args.records[1].parent_record_ids=['02'];const result=await run(args);
 assert.deepEqual(Object.keys(result.dash_projection).sort(),['checkpoint_handle','format_version','project_handle','records']);
 result.dash_projection.records.forEach(row=>assert.deepEqual(Object.keys(row),['record_handle']));
 const exported=JSON.stringify(result.dash_projection)+'\n'+result.dash_csv;
 for(const secret of ['private-title-canary','https://private.invalid/source-canary','private-version-canary','2026-10-08T21:00:00Z','private-notes-canary','private-native-namespace-canary','private-project-canary','private-checkpoint-canary','private-next-action-canary','private-stop-canary','MAXVAR','BL01.01','A.01','MBSS-B01-L01','EXT:MB49.01','conservation',result.backup_fingerprint,result.private_resolver_fingerprint,...result.manifest.records.map(r=>r.record_fingerprint)])assert.equal(exported.includes(secret),false,secret);
 const handles=[result.dash_projection.project_handle,result.dash_projection.checkpoint_handle,...result.dash_projection.records.map(r=>r.record_handle)];
 assert.equal(new Set(handles).size,handles.length);handles.forEach(h=>assert.match(h,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
 assert.equal(result.disclosure.encryption,false);assert.equal(result.disclosure.confidentiality_guaranteed,false);assert.equal(result.disclosure.existing_indexed_content_changed,false);
 assert.equal(result.persisted,false);assert.equal(result.submission_ready,false);
});

test('Explicit profile and resolver action prevent accidental export or replacement',async()=>{
 const original=await run(createInput());
 for(const changes of [
  {export_profile:'PUBLIC'},
  {export_profile:'PRIVATE_WITH_DASH_REFERENCES'},
  {export_profile:'PRIVATE',resolver_action:'CREATE'},
  {export_profile:'PRIVATE_WITH_DASH_REFERENCES',resolver_action:'REUSE'},
  {export_profile:'PRIVATE_WITH_DASH_REFERENCES',resolver_action:'CREATE',dash_resolver:original.private_resolver},
  {export_profile:'PRIVATE_WITH_DASH_REFERENCES',resolver_action:'EVIL'}
 ])await assert.rejects(()=>run({...input(),...changes}));
 await assert.rejects(()=>prepareResearchBackup({...input(),unexpected:true}));
 assert.equal(toolList.find(t=>t.name==='prepare_research_backup').annotations.idempotentHint,false);
});

test('Resolver reuse preserves aliases, fingerprint and projection after record reordering',async()=>{
 const args=createInput(),first=await run(args),secondArgs=reuse(args,first);secondArgs.records.reverse();
 const second=await run(secondArgs);
 assert.deepEqual(second.dash_projection,first.dash_projection);assert.equal(second.dash_csv,first.dash_csv);
 assert.equal(second.private_resolver_fingerprint,first.private_resolver_fingerprint);assert.equal(second.backup_fingerprint,first.backup_fingerprint);
 assert.deepEqual(first.private_resolver,secondArgs.dash_resolver);
});

test('Resolver checksum, exact scope, membership, role separation and UUID syntax fail closed',async()=>{
 const args=createInput(),first=await run(args);
 const mutations=[
  r=>r.project_id='another-project',
  r=>r.project_handle='00000000-0000-0000-0000-000000000000',
  r=>r.records[0].record_handle=r.project_handle,
  r=>r.checkpoints[0].checkpoint_handle=r.records[0].record_handle,
  r=>r.records[0].record_id=r.records[1].record_id,
  r=>r.records.pop(),
  r=>r.records.push({...r.records[0],record_id:'unreferenced',record_handle:crypto.randomUUID()}),
  r=>r.checkpoints[0].record_ids.pop(),
  r=>r.checkpoints[0].record_ids.push('unknown'),
  r=>r.records[0].identity.native_id='different-native-id',
  r=>r.records[0].extra='private-data-must-fail'
 ];
 for(const mutation of mutations){const next=reuse(args,first);mutation(next.dash_resolver);next.expected_resolver_fingerprint=await digest(next.dash_resolver);await assert.rejects(()=>run(next));}
 const corrupted=reuse(args,first);corrupted.dash_resolver.records[0].record_handle=crypto.randomUUID();await assert.rejects(()=>run(corrupted),/FINGERPRINT/);
 const wrongScope=reuse({...args,checkpoint_id:'another-checkpoint'},first);await assert.rejects(()=>run(wrongScope),/CHECKPOINT_RECORD_SET/);
});

test('Forward continuation preserves project and existing record handles with a new checkpoint',async()=>{
 const args=createInput(),first=await run(args);
 const advancedArgs=reuse({...args,checkpoint_id:'private-next-checkpoint-canary',records:[clone(args.records[0]),makeRecord('new-record',40,'new-native-id')]},first,'ADVANCE');
 advancedArgs.records[0].source_version='revision-2';
 const advanced=await run(advancedArgs),before=new Map(first.private_resolver.records.map(r=>[r.record_id,r.record_handle])),after=new Map(advanced.private_resolver.records.map(r=>[r.record_id,r.record_handle]));
 assert.equal(advanced.dash_projection.project_handle,first.dash_projection.project_handle);
 assert.notEqual(advanced.dash_projection.checkpoint_handle,first.dash_projection.checkpoint_handle);
 for(const [id,alias]of before)assert.equal(after.get(id),alias);
 assert.equal(advanced.private_resolver.records.length,4);assert.equal(advanced.private_resolver.checkpoints.length,2);
 assert.equal(advanced.dash_projection.records.length,2);assert.equal(advanced.manifest.records[0].source_version,'revision-2');
 const oldAgain=await run(reuse(args,advanced));assert.deepEqual(oldAgain.dash_projection,first.dash_projection);
 await assert.rejects(()=>run(reuse(args,advanced,'ADVANCE')),/NEW_CHECKPOINT/);
 const rebound=reuse({...advancedArgs,records:[makeRecord('02',0,'replacement-identity')]},first,'ADVANCE');await assert.rejects(()=>run(rebound),/IDENTITY_MISMATCH/);
});

test('Private content revisions alter manifest hash without changing identity aliases',async()=>{
 const args=createInput(),first=await run(args),next=reuse(args,first);next.records[0].notes+=' revised';
 const second=await run(next);assert.notEqual(second.backup_fingerprint,first.backup_fingerprint);assert.deepEqual(second.dash_projection,first.dash_projection);
 const altered=await run(input());altered.manifest.reference_registry_binding.method_catalog_version='tampered';
 assert.equal((await run(input())).manifest.reference_registry_binding.method_catalog_version,'1.2.0');
});

test('Registry and contract data require both trusted identity headers; discovery remains usable',async()=>{
 const req=(name,headers={},args={})=>new Request('https://test.local/mcp',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
 for(const tool of toolList.filter(t=>t.name!=='runtime_status'))for(const headers of [{},{'oai-authenticated-user-id':'id'},{'oai-authenticated-user-email':'owner@example.invalid'},{'oai-authenticated-user-id':'  ','oai-authenticated-user-email':'owner@example.invalid'}])assert.equal((await handleMcp(req(tool.name,headers))).status,401,tool.name);
 const identity={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.invalid'};
 assert.equal((await handleMcp(req('get_registry',identity,{ids:[31]}))).status,200);
 const contract=await(await handleMcp(req('get_universal_contract',identity))).json();assert.equal(contract.result.structuredContent.research_storage.version,'RESEARCH-STORAGE-2.0');
 const runtime=await(await handleMcp(req('runtime_status'))).json();assert.equal(runtime.result.structuredContent.runtime_version,'0.10.1-http.1');assert.equal(runtime.result.structuredContent.registry_authenticated_identity_required,true);
});
