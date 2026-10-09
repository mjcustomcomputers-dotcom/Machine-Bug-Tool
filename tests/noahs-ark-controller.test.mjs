import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync,symlinkSync,mkdtempSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {evaluateMethod} from '../lib/methods.mjs';
import {controllerHash,createController,reconcileController,nextControllerAction,acceptControllerReceipt,verifyControllerState} from '../lib/noahs-ark-controller.mjs';
import fixture from './fixtures/noahs-ark-controller-synthetic.json' with {type:'json'};
import base from '../method-atlas/candidates.json' with {type:'json'};
import v2 from '../method-atlas/expansion-2026-v2.json' with {type:'json'};
import v3 from '../method-atlas/expansion-evidence-intent-v3.json' with {type:'json'};
import v4 from '../method-atlas/expansion-computation-schools-v4.json' with {type:'json'};
import v5 from '../method-atlas/expansion-nasa-chip-cloud-v5.json' with {type:'json'};
import v6 from '../method-atlas/expansion-abnormal-meta-v6.json' with {type:'json'};
import v8 from '../method-atlas/expansion-optical-v8.json' with {type:'json'};
import links from '../method-atlas/method-relations.json' with {type:'json'};
const methods=[base,v2,v3,v4,v5,v6,v8].flatMap(x=>x.methods),relations=links.relationships;
const copy=x=>JSON.parse(JSON.stringify(x));
const make=(config=copy(fixture),catalog=methods)=>createController({config,methods:catalog,relations});
const adapter=(c,id='MHA-0053')=>c.adapters.find(x=>x.candidate_method_id===id);
const mutate=(fn)=>{const c=copy(fixture);fn(c);return c};
const expectedBlock=(config,pattern)=>{
 const n=nextControllerAction(make(config));assert.equal(n.status,'BLOCKED');assert.equal(n.action,null);
 assert.match(n.blockers.join('\n'),pattern);
};
async function evaluationReceipt(state){
 const action=nextControllerAction(state).action;
 return {kind:action.kind,action_id:action.action_id,tool:action.tool,
  call_ref:'fixture:evaluate:'+action.action_id,session_id:state.config.capabilities.session_id,
  request_sha256:action.request_sha256,response:await evaluateMethod(action.arguments)};
}
const hashReceipt=r=>({...r,response_sha256:controllerHash(r.response)});
async function finishModels(state){
 let s=state;
 while(nextControllerAction(s).status==='AWAITING_HOST_EVALUATION')s=acceptControllerReceipt(s,hashReceipt(await evaluationReceipt(s)));
 return s;
}
function nativeReceipt(state,{content=null,version='a'.repeat(40)}={}){
 const a=nextControllerAction(state).action;
 const receipt={kind:a.kind,action_id:a.action_id,tool:a.tool,
  call_ref:'fixture:native:'+a.action_id,session_id:state.config.capabilities.session_id,
  native:{namespace:a.target.namespace,native_id_type:a.target.native_id_type,native_id:a.target.native_id,version},
  response:{status:'SYNTHETIC_NATIVE_RESPONSE',native_version:version}};
 if(a.kind==='NATIVE_CHECKPOINT_WRITE')Object.assign(receipt,{status:'NATIVE_WRITE_SUPPLIED',expected_previous_version:a.target.version,content_sha256:a.content_sha256});
 else Object.assign(receipt,{status:'NATIVE_READBACK_SUPPLIED',content});
 return hashReceipt(receipt);
}

test('operative controller considers the exact source catalog and queues bounded primary/challenger models',()=>{
 const s=make(),n=nextControllerAction(s);
 assert.equal(s.plan.method_consideration.length,239);
 assert.deepEqual(s.tasks.map(t=>t.role),['PRIMARY_NEGATIVE_CONTROL','PRIMARY_MODEL','CHALLENGER_NEGATIVE_CONTROL','CHALLENGER_MODEL']);
 assert.equal(n.status,'AWAITING_HOST_EVALUATION');
 assert.equal(n.action.candidate_method_id,'MHA-0053');assert.equal(n.action.native_method_id,'finite_invariant');
 assert.equal(s.tasks[2].candidate_method_id,'MHA-0035');
 for(const t of s.tasks)for(const k of ['method_fingerprint','schema_fingerprint','model_fingerprint','dependency_fingerprint'])assert.match(t[k],/^[a-f0-9]{64}$/u);
 assert.equal(s.source_authentication,false);assert.equal(s.canonical_promotion,false);
 assert.ok(s.config.mode==='SYNTHETIC_ONLY');
});
test('controller/native source identities, versions and content must agree with supplied read receipts',()=>{
 for(const edit of [c=>delete c.native_controller.version,c=>c.sources[0].version='other',
  c=>c.sources[0].read_receipt.native.native_id='unrelated',c=>c.sources[0].content.primary_model.states[0].id='tampered'])
  expectedBlock(mutate(edit),/SOURCE|VERSION|IDENTITY/u);
 expectedBlock(mutate(c=>c.sources=[]),/UNRESOLVED_ATOM_SOURCE/u);
 expectedBlock(mutate(c=>c.mode='SUPPLIED_RECORD_REVIEW'),/SYNTHETIC_SOURCE_NOT_NATIVE_RECORD/u);
});
test('missing current-session capability and stale catalog receipts block computation',()=>{
 expectedBlock(mutate(c=>c.capabilities.available_tools=[]),/CAPABILITY_UNAVAILABLE/u);
 expectedBlock(mutate(c=>c.capabilities.catalogs[0].session_id='another-chat'),/CATALOG_SESSION_MISMATCH/u);
 expectedBlock(mutate(c=>c.capabilities.protected_evaluator.response.model_fingerprint='0'.repeat(64)),/INVALID_HOST_RECEIPT/u);
});
test('selected MHA rows require explicit adaptation, supported method and unchanged strict native schema',()=>{
 expectedBlock(mutate(c=>c.adapters=c.adapters.filter(a=>a.candidate_method_id!=='MHA-0053')),/MISSING_EXPLICIT_ADAPTER/u);
 expectedBlock(mutate(c=>adapter(c).binding_kind='NATIVE_EQUIVALENT'),/EXPLICIT_ADAPTATION/u);
 expectedBlock(mutate(c=>adapter(c).native_method_id='MHA-0053'),/INVALID_HOST_RECEIPT/u);
 expectedBlock(mutate(c=>adapter(c).schema_fingerprint='0'.repeat(64)),/SCHEMA_FINGERPRINT/u);
 const c=mutate(c=>{const r=c.capabilities.catalogs[0];r.response.input_schemas.finite_invariant.additionalProperties=true;r.response_sha256=controllerHash(r.response)});
 expectedBlock(c,/NATIVE_SCHEMA_OR_METHOD_MISMATCH/u);
});
test('all model input leaves need exact source/value/version bindings',()=>{
 expectedBlock(mutate(c=>adapter(c).model.proof_inputs=[]),/MISSING_MODEL_PROOF_INPUTS/u);
 expectedBlock(mutate(c=>adapter(c).model.proof_inputs[0].source_version='stale'),/MODEL_SOURCE_VERSION/u);
 expectedBlock(mutate(c=>adapter(c).model.input.max_states_examined=1),/MODEL_SOURCE_BINDING/u);
 expectedBlock(mutate(c=>{const b=adapter(c).model.proof_inputs[0];b.source_pointer='/primary_model/states';b.model_pointer='/states'}),/UNBOUND_MODEL_INPUT/u);
 expectedBlock(mutate(c=>adapter(c).model.model_fingerprint='0'.repeat(64)),/MODEL_FINGERPRINT/u);
});
test('planner review readiness alone cannot bypass proof, control and falsifier gates',()=>{
 for(const field of ['input_state','negative_control_state','falsifier_state'])for(const missing of ['UNKNOWN','MISSING'])
  expectedBlock(mutate(c=>{c.method_readiness.find(x=>x.method_id==='MHA-0053')[field]=missing}),/BLOCKED|MISSING|ADAPTER|CHALLENGER/u);
 expectedBlock(mutate(c=>delete adapter(c).negative_control.expected),/EXECUTABLE_NEGATIVE_CONTROL/u);
 expectedBlock(mutate(c=>adapter(c).falsifier.source_refs=['missing:source']),/EXPLICIT_ADAPTATION/u);
});
test('strict model receipt envelope rejects wrong method, version, hash and promotion flags',async()=>{
 const s=make(),good=await evaluationReceipt(s);
 for(const edit of [r=>r.response.status='Action completed.',r=>r.response.method='nash',
  r=>r.response.implementation_version='unknown',r=>r.response.model_fingerprint='0'.repeat(64),
  r=>r.response.source_authentication=true,r=>r.response.canonical_promotion=true,
  r=>delete r.response.external_action_authorized,r=>r.response.result=null]){
  const bad=copy(good);edit(bad);assert.throws(()=>acceptControllerReceipt(s,hashReceipt(bad)),/INVALID_BOUNDED_MODEL_RESULT/u);
 }
 const bad=hashReceipt(copy(good));bad.response.result.status='tampered';
 assert.throws(()=>acceptControllerReceipt(s,bad),/INVALID_ACTION_RECEIPT/u);
 assert.equal(nextControllerAction(s).action.action_id,good.action_id);
});
test('unexpected, old-session and mismatched request receipts cannot advance the controller',async()=>{
 const s=make(),r=hashReceipt(await evaluationReceipt(s));
 assert.throws(()=>acceptControllerReceipt(s,{...r,action_id:'f'.repeat(64)}),/UNEXPECTED_OR_STALE/u);
 assert.throws(()=>acceptControllerReceipt(s,{...r,session_id:'wrong-session'}),/INVALID_ACTION_RECEIPT/u);
 assert.throws(()=>acceptControllerReceipt(s,{...r,request_sha256:'f'.repeat(64)}),/REQUEST_RECEIPT_MISMATCH/u);
});
test('actual negative-control failure blocks subsequent native models',async()=>{
 const c=mutate(c=>{
  const a=adapter(c);a.negative_control.input=copy(a.model.input);
  a.negative_control.proof_inputs=copy(a.model.proof_inputs);
  a.negative_control.model_fingerprint=controllerHash({method:a.native_method_id,input:a.negative_control.input});
 });
 const s=make(c),next=acceptControllerReceipt(s,hashReceipt(await evaluationReceipt(s)));
 assert.equal(nextControllerAction(next).status,'BLOCKED');
 assert.match(nextControllerAction(next).blockers[0],/NEGATIVE_CONTROL_NOT_DETECTED/u);
 assert.equal(Object.keys(next.completed_actions).length,1);
});
test('negative-control predicates cannot be satisfied by envelope metadata or a nonfailure status',()=>{
 expectedBlock(mutate(c=>adapter(c).negative_control.expected={pointer:'/status',equals:'BOUNDED_MODEL_RESULT'}),/EXECUTABLE_NEGATIVE_CONTROL/u);
 expectedBlock(mutate(c=>adapter(c).negative_control.expected={pointer:'/result/status',equals:'FINITE_GRAPH_VERIFIED'}),/MUST_EXPECT_COUNTEREXAMPLE/u);
});
test('checkpoint target cannot overwrite a native controller or an input source',()=>{
 for(const which of ['native_controller','source'])expectedBlock(mutate(c=>{
  const s=which==='source'?c.sources[0]:c.native_controller;
  c.checkpoint_target={namespace:s.namespace,native_id_type:s.native_id_type,native_id:s.native_id,version:s.version};
 }),/CANNOT_OVERWRITE_NATIVE_CONTROLLER_OR_SOURCE/u);
});
test('native aliases cannot assert conflicting content at one exact version and reads must be current-session',()=>{
 expectedBlock(mutate(c=>{
  const s=copy(c.sources[0]);s.ref='fixture:alias';s.content={different:true};s.content_sha256=controllerHash(s.content);
  s.read_receipt.native.content_sha256=s.content_sha256;c.sources.push(s);
 }),/CONFLICTING_NATIVE_SOURCE_VERSION/u);
 expectedBlock(mutate(c=>c.sources[0].read_receipt.session_id='previous-session'),/SOURCE_RECEIPT_SESSION_MISMATCH/u);
});
test('rehashed task forgery and rehashed false completions fail semantic admission',async()=>{
 const rehash=s=>{delete s.integrity_sha256;s.integrity_sha256=controllerHash(s);return s};
 const injected=make();injected.tasks[0].kind='ARBITRARY';injected.tasks[0].tool='unregistered_tool';
 assert.throws(()=>nextControllerAction(rehash(injected)),/SEMANTIC_STATE_MISMATCH/u);
 const skipped=make();skipped.tasks=[];assert.throws(()=>nextControllerAction(rehash(skipped)),/SEMANTIC_STATE_MISMATCH/u);
 const start=make(),receipt=hashReceipt(await evaluationReceipt(start)),complete=acceptControllerReceipt(start,receipt);
 const saved=complete.completed_actions[receipt.action_id];saved.receipt.response.result={};
 saved.receipt.response_sha256=controllerHash(saved.receipt.response);saved.receipt_sha256=controllerHash(saved.receipt);
 assert.throws(()=>nextControllerAction(rehash(complete)),/INVALID_NATIVE_RESULT_BODY/u);
});
test('rehashed revision and event counters must agree with retained controller history',async()=>{
 const initial=make(),r=hashReceipt(await evaluationReceipt(initial)),s=acceptControllerReceipt(initial,r);
 for(const edit of [x=>x.event_sequence=0,x=>x.revision=999,x=>x.revision=2]){
  const bad=copy(s);edit(bad);delete bad.integrity_sha256;bad.integrity_sha256=controllerHash(bad);
  assert.throws(()=>verifyControllerState(bad),/INVALID_CONTROLLER_(HISTORY|STATE_SHAPE)/u);
 }
});
test('an identical native request can explicitly reuse its original receipt without another evaluator call',async()=>{
 let s=make();
 const first=hashReceipt(await evaluationReceipt(s));s=acceptControllerReceipt(s,first);
 s=acceptControllerReceipt(s,hashReceipt(await evaluationReceipt(s)));
 const next=nextControllerAction(s);
 assert.equal(next.action.role,'CHALLENGER_NEGATIVE_CONTROL');
 assert.equal(next.receipt_reuse_candidate.action_id,first.action_id);
 const reuse={...first,action_id:next.action.action_id,request_sha256:next.action.request_sha256,
  reused_from_action_id:first.action_id,originating_session_id:first.session_id};
 s=acceptControllerReceipt(s,reuse);
 assert.equal(nextControllerAction(s).action.role,'CHALLENGER_MODEL');
 assert.equal(s.completed_actions[reuse.action_id].receipt.call_ref,first.call_ref);
 verifyControllerState(s);
});
test('complete bounded calculations stop before a checkpoint unless a native write is authorized and available',async()=>{
 const s=await finishModels(make());
 assert.equal(Object.keys(s.completed_actions).length,4);
 assert.equal(nextControllerAction(s).status,'AWAITING_CHECKPOINT_WRITE_CAPABILITY');
 const c=copy(s.config);c.checkpoint_write_authorized=true;c.capabilities.available_tools=c.capabilities.available_tools.filter(x=>x!==c.capabilities.native_write_tool);
 const revised=reconcileController(s,{config:c,methods,relations});
 assert.equal(nextControllerAction(revised).status,'AWAITING_CHECKPOINT_WRITE_CAPABILITY');
 assert.equal(revised.tasks.filter(t=>revised.completed_actions[t.action_id]).length,4);
});
test('COMPLETE requires matching native write identity, returned version and full text readback',async()=>{
 const c=mutate(c=>c.checkpoint_write_authorized=true);
 let s=await finishModels(make(c));
 const write=nextControllerAction(s).action;
 assert.equal(write.kind,'NATIVE_CHECKPOINT_WRITE');
 assert.equal(JSON.parse(write.content).target_finding,false);
 const wrong=nativeReceipt(s);wrong.native.native_id='another:file';
 assert.throws(()=>acceptControllerReceipt(s,wrong),/NATIVE_IDENTITY_MISMATCH/u);
 const noWrite=hashReceipt({...nativeReceipt(s),status:'NATIVE_READBACK_SUPPLIED'});
 assert.throws(()=>acceptControllerReceipt(s,noWrite),/WRITE_RECEIPT_MISMATCH/u);
 s=acceptControllerReceipt(s,nativeReceipt(s));
 assert.equal(nextControllerAction(s).status,'AWAITING_NATIVE_CHECKPOINT_READBACK');
 assert.throws(()=>acceptControllerReceipt(s,nativeReceipt(s,{content:write.content+'changed'})),/READBACK_CONTENT_OR_VERSION/u);
 assert.throws(()=>acceptControllerReceipt(s,nativeReceipt(s,{content:write.content,version:'b'.repeat(40)})),/READBACK_CONTENT_OR_VERSION/u);
 s=acceptControllerReceipt(s,nativeReceipt(s,{content:write.content}));
 const done=nextControllerAction(s);
 assert.equal(done.status,'COMPLETE');assert.equal(done.source_authentication,false);assert.equal(done.target_finding,false);
 assert.equal(done.native_checkpoint.version,'a'.repeat(40));
 assert.equal(done.content_sha256,controllerHash(write.content));
});
test('exact completed receipt and exact reconcile are no-ops across serialized restarts',async()=>{
 const initial=make(),r=hashReceipt(await evaluationReceipt(initial)),s=acceptControllerReceipt(initial,r),saved=copy(s);
 verifyControllerState(saved);
 assert.deepEqual(acceptControllerReceipt(saved,r),saved);
 assert.deepEqual(reconcileController(saved,{config:copy(fixture),methods,relations}),saved);
 assert.notEqual(nextControllerAction(saved).action.action_id,r.action_id);
 assert.throws(()=>acceptControllerReceipt(saved,{...r,call_ref:'new-call-attempt'}),/CONFLICTING_COMPLETED_ACTION_RECEIPT/u);
});
test('configuration/catalog input order does not change the executable task identities',()=>{
 const c=copy(fixture);c.sources.reverse();c.adapters.reverse();c.method_readiness.reverse();c.atom.dimensions.reverse();
 const a=make(),b=createController({config:c,methods:[...methods].reverse(),relations:[...relations].reverse()});
 assert.equal(a.configuration_fingerprint,b.configuration_fingerprint);
 assert.deepEqual(a.tasks,b.tasks);
});
test('changed adapter or method definition reopens only its dependent actions and preserves old receipts',async()=>{
 const s=await finishModels(make()),c=copy(fixture);adapter(c).adapter_version='2';
 const next=reconcileController(s,{config:c,methods,relations});
 assert.equal(next.revision,2);assert.equal(Object.keys(next.completed_actions).length,4);
 assert.equal(next.tasks.filter(t=>next.completed_actions[t.action_id]).length,2);
 assert.equal(nextControllerAction(next).action.role,'PRIMARY_NEGATIVE_CONTROL');
 const changed=copy(methods);changed.find(m=>m.method_id==='MHA-0053').mechanism+=' Revised source definition.';
 const byMethod=reconcileController(s,{config:copy(fixture),methods:changed,relations});
 assert.equal(byMethod.tasks.filter(t=>byMethod.completed_actions[t.action_id]).length,2);
 assert.equal(byMethod.revision_history[0].integrity_sha256,s.integrity_sha256);
});
test('changed source version invalidates dependent computation while a stale binding blocks it',async()=>{
 const s=await finishModels(make()),c=copy(fixture);
 c.sources[0].version='fixture-v2';c.sources[0].read_receipt.native.version='fixture-v2';
 let next=reconcileController(s,{config:c,methods,relations});
 assert.equal(nextControllerAction(next).status,'BLOCKED');
 for(const a of c.adapters)for(const m of [a.model,a.negative_control])m.proof_inputs[0].source_version='fixture-v2';
 next=reconcileController(s,{config:c,methods,relations});
 assert.equal(next.tasks.filter(t=>next.completed_actions[t.action_id]).length,0);
 assert.equal(Object.keys(next.completed_actions).length,4);
});
test('a new GitHub catalog row is considered without becoming executable or repeating completed work',async()=>{
 const s=await finishModels(make()),added=copy(methods[0]);added.method_id='MHA-9998';added.method_name='Synthetic added candidate';
 added.dimensions=['MONEY'];
 const next=reconcileController(s,{config:copy(fixture),methods:[...methods,added],relations});
 assert.equal(next.plan.method_consideration.length,240);
 assert.equal(next.plan.method_consideration.find(x=>x.method_id==='MHA-9998').execution_performed,false);
 assert.equal(next.tasks.filter(t=>next.completed_actions[t.action_id]).length,4);
 assert.equal(next.tasks.length,4);
});
test('state corruption, unsafe object properties, oversized data and missing commit are rejected',()=>{
 const s=make();s.event_sequence=999;assert.throws(()=>verifyControllerState(s),/STATE_PARITY_MISMATCH/u);
 const malicious=copy(fixture);malicious.payload=JSON.parse('{"__proto__":{"bad":true}}');assert.throws(()=>make(malicious),/UNSAFE_PROPERTY/u);
 assert.throws(()=>make(mutate(c=>c.note='x'.repeat(2_000_000))),/JSON_SIZE/u);
 assert.throws(()=>make(mutate(c=>c.source_revision.commit='main')),/SOURCE_COMMIT_REQUIRED/u);
});
test('CLI stores immutable revisions, restores next action, and leaves bytes unchanged on rejected receipt',async()=>{
 const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'.sites-runtime','controller-test-'+randomUUID());
 mkdirSync(dir,{recursive:true});
 const cli=resolve(root,'scripts/noahs-ark-controller-cli.mjs'),statePath=resolve(dir,'state.json'),configPath=resolve(dir,'config.json'),receiptPath=resolve(dir,'receipt.json');
 const run=(...args)=>JSON.parse(execFileSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8'}));
 try{
  const currentFixture=copy(fixture);currentFixture.source_revision.commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  writeFileSync(configPath,JSON.stringify(currentFixture));const first=run('init',configPath,statePath);
  const state=JSON.parse(readFileSync(statePath,'utf8'));
  assert.equal(first.candidates_considered,239);assert.equal(readdirSync(statePath+'.history').length,1);
  const receipt=hashReceipt(await evaluationReceipt(state));writeFileSync(receiptPath,JSON.stringify(receipt));
  const second=run('receipt',receiptPath,statePath);assert.equal(second.completed_current_tasks,1);
  assert.equal(readdirSync(statePath+'.history').length,2);
  assert.equal(run('next',statePath).action.action_id,second.action.action_id);
  assert.equal(run('verify',statePath).status,'LOCAL_CONTROLLER_PARITY_PASS');
  const bytes=readFileSync(statePath,'utf8');receipt.action_id='0'.repeat(64);writeFileSync(receiptPath,JSON.stringify(receipt));
  const bad=spawnSync(process.execPath,[cli,'receipt',receiptPath,statePath],{cwd:root,encoding:'utf8'});
  assert.equal(bad.status,1);assert.equal(readFileSync(statePath,'utf8'),bytes);
  const outside=spawnSync(process.execPath,[cli,'init',configPath,resolve(root,'controller-unsafe.json')],{cwd:root,encoding:'utf8'});
  assert.equal(outside.status,1);assert.match(outside.stderr,/STATE_MUST_BE_JSON/u);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('CLI rejects symlink escapes and refuses a stale source commit before writing state',()=>{
 const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'.sites-runtime','controller-test-'+randomUUID());
 const outside=mkdtempSync(resolve(tmpdir(),'mpc-controller-outside-'));
 mkdirSync(dir,{recursive:true});
 const cli=resolve(root,'scripts/noahs-ark-controller-cli.mjs'),configPath=resolve(dir,'config.json');
 try{
  const current=copy(fixture);current.source_revision.commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  writeFileSync(configPath,JSON.stringify(current));symlinkSync(outside,resolve(dir,'escape'),process.platform==='win32'?'junction':'dir');
  const escaped=spawnSync(process.execPath,[cli,'init',configPath,resolve(dir,'escape/state.json')],{cwd:root,encoding:'utf8'});
  assert.equal(escaped.status,1);assert.match(escaped.stderr,/SYMLINK_PATH_REJECTED/u);assert.equal(existsSync(resolve(outside,'state.json')),false);
  current.source_revision.commit='0'.repeat(40);writeFileSync(configPath,JSON.stringify(current));
  const stale=spawnSync(process.execPath,[cli,'init',configPath,resolve(dir,'state.json')],{cwd:root,encoding:'utf8'});
  assert.equal(stale.status,1);assert.match(stale.stderr,/CHECKOUT_COMMIT_MISMATCH/u);assert.equal(existsSync(resolve(dir,'state.json')),false);
 }finally{rmSync(dir,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true})}
});
