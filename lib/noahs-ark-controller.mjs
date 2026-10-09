// Operative, host-driven controller for the development V13 planner.
// This reducer performs no network I/O. Receipts are supplied by the chat host;
// hashes establish content parity, never source authenticity or a finding.
import {createHash} from 'node:crypto';
import {canonical} from './universal.mjs';
import {validate} from './schema.mjs';
import {getMethodCatalog} from './methods.mjs';
import {planNoahsArkReasoning} from './noahs-ark-reasoning.mjs';

export const controllerContract=Object.freeze({version:'MPC_OPERATIVE_CONTROLLER_V13_1',
 max_json_bytes:2_000_000,max_tasks:32,max_completed_actions:512,max_revisions:128,
 receipt_trust:'HOST_SUPPLIED_CONTENT_PARITY_ONLY',source_authentication:false,
 canonical_promotion:false,target_actions:false,network_dispatch:false});
const fail=(code)=>{throw Error(code)};
const str=(x)=>typeof x==='string'&&x.trim().length>0&&x.length<=2000;
const hashPattern=/^[a-f0-9]{64}$/u;
const clone=(x)=>JSON.parse(JSON.stringify(x));
const same=(a,b)=>canonical(a)===canonical(b);
const identity=(s)=>({namespace:s.namespace,native_id_type:s.native_id_type,native_id:s.native_id});
const sourceKey=(s)=>({...identity(s),version:s.version,owner:s.owner,content_sha256:s.content_sha256});
const order=(a,b)=>canonical(a).localeCompare(canonical(b));
export function controllerHash(value){return createHash('sha256').update(typeof value==='string'?value:canonical(value),'utf8').digest('hex')}
function jsonBound(value){
 let count=0;
 const walk=(v,depth)=>{
  if(++count>50000||depth>64)fail('CONTROLLER_JSON_COMPLEXITY');
  if(v===null||typeof v==='boolean'||typeof v==='string')return;
  if(typeof v==='number'){if(!Number.isFinite(v))fail('CONTROLLER_NONFINITE_NUMBER');return}
  if(Array.isArray(v)){for(const x of v)walk(x,depth+1);return}
  if(!v||typeof v!=='object'||Object.getPrototypeOf(v)!==Object.prototype)fail('CONTROLLER_NON_JSON_VALUE');
  for(const [k,x] of Object.entries(v)){
   if(['__proto__','prototype','constructor'].includes(k))fail('CONTROLLER_UNSAFE_PROPERTY');
   walk(x,depth+1);
  }
 };
 walk(value,0);
 if(Buffer.byteLength(JSON.stringify(value),'utf8')>controllerContract.max_json_bytes)fail('CONTROLLER_JSON_SIZE');
}
function pointer(value,path){
 if(typeof path!=='string'||(path!==''&&!path.startsWith('/'))||path.length>2000)fail('INVALID_JSON_POINTER');
 let node=value;
 for(const raw of path===''?[]:path.slice(1).split('/')){
  if(/~(?![01])/u.test(raw))fail('INVALID_JSON_POINTER');
  const key=raw.replace(/~1/gu,'/').replace(/~0/gu,'~');
  if(['__proto__','prototype','constructor'].includes(key)||node===null||typeof node!=='object'||!Object.hasOwn(node,key))fail('UNRESOLVED_JSON_POINTER');
  node=node[key];
 }
 return node;
}
function leafPaths(value,path=''){
 if(value===null||typeof value!=='object'||Object.keys(value).length===0)return [path];
 return Object.entries(value).flatMap(([k,v])=>leafPaths(v,path+'/'+k.replace(/~/gu,'~0').replace(/\//gu,'~1')));
}
function nativeIdentity(s){
 if(!s||!str(s.namespace)||!['string','integer'].includes(s.native_id_type)||
 (s.native_id_type==='string'?!str(s.native_id):!Number.isSafeInteger(s.native_id)))fail('INVALID_NATIVE_IDENTITY');
}
function receiptEnvelope(r,tool){
 if(!r||r.tool!==tool||!str(r.call_ref)||!str(r.session_id)||!r.response||r.response.isError===true||
 !hashPattern.test(r.response_sha256)||controllerHash(r.response)!==r.response_sha256)fail('INVALID_HOST_RECEIPT:'+tool);
}
function sourceRecord(s){
 nativeIdentity(s);
 if(!str(s.ref)||!str(s.version)||!str(s.owner)||!hashPattern.test(s.content_sha256)||
 !Object.hasOwn(s,'content')||controllerHash(s.content)!==s.content_sha256)fail('MISSING_OR_CHANGED_NATIVE_SOURCE');
 const r=s.read_receipt;
 if(!r||!str(r.tool)||!str(r.call_ref)||!str(r.session_id)||r.status!=='NATIVE_READ_SUPPLIED'||
 !same(r.native,sourceKey(s)))fail('SOURCE_READBACK_IDENTITY_OR_VERSION_MISMATCH');
 return s;
}
function modelResult(response,method,modelHash,version){
 if(!response||response.status!=='BOUNDED_MODEL_RESULT'||response.method!==method||
 response.implementation_version!==version||response.model_fingerprint!==modelHash||
 !response.result||typeof response.result!=='object'||Array.isArray(response.result)||
 response.source_authentication!==false||response.canonical_promotion!==false||
 response.court_release_allowed!==false||response.external_action_authorized!==false||
 !str(response.limitations))fail('INVALID_BOUNDED_MODEL_RESULT');
 const required={
  claw_accumulator:['unit','closing_accumulator','trace'],coin_pusher_deferred:['unit','pending','released','trace'],
  casino_meter_finality:['unit','records'],ledger:['accounts','units','transfers'],relational:['rules','rows'],
  partial_order:['violations','events','observed_order'],metamorphic:['changed_control','observations'],
  temporal:['checks','events','rules'],identity_graph:['links','nodes','parent_cycle'],authority_graph:['records','rules'],
  propositional_entailment:['status','entails'],finite_invariant:['status','states_examined','state_ids_examined','induction_obligations'],
  abductive_cover:['status','minimal_explanations'],minimal_cut_sets:['status','minimal_cut_sets'],
  nash:['pure_equilibria','mixed_status'],harsanyi:['values','maximizers'],selten:['root_payoffs','choices'],
  conservation:['expected_closing','observed_closing','residual','within_supplied_tolerance'],
  identity:['comparisons','native_key_match','version_match'],state_trace:['trace_matches','reviewed_events','remaining_events'],
  fault_tree:['root_value','nodes_evaluated'],fmea:['rows'],ach:['hypotheses'],coverage:['checks','counts','input_fingerprint']
 }[method];
 if(!required||required.some(k=>!Object.hasOwn(response.result,k)))fail('INVALID_NATIVE_RESULT_BODY');
 if(method==='finite_invariant'){
  const r=response.result;
  if(!['COUNTEREXAMPLE_FOUND','UNKNOWN_RESOURCE_LIMIT','UNKNOWN_INVARIANT_LABELS','FINITE_GRAPH_VERIFIED'].includes(r.status)||
   !Number.isInteger(r.states_examined)||!Array.isArray(r.state_ids_examined)||
   !['PASS','FAIL','UNKNOWN'].includes(r.induction_obligations?.base?.status)||
   !['PASS','FAIL','UNKNOWN'].includes(r.induction_obligations?.step?.status)||
   (r.status==='COUNTEREXAMPLE_FOUND'&&(!r.counterexample||!Array.isArray(r.counterexample.state_path)||!r.counterexample.state_path.length)))fail('INVALID_NATIVE_RESULT_BODY');
 }
}
function sessionGate(c){
 const cap=c.capabilities;
 if(!cap||!str(cap.session_id)||!Array.isArray(cap.available_tools)||
 !cap.available_tools.includes('evaluate_method')||!cap.available_tools.includes('get_method_catalog'))fail('MPC_CAPABILITY_UNAVAILABLE');
 receiptEnvelope(cap.runtime,'runtime_status');receiptEnvelope(cap.contract,'get_universal_contract');
 receiptEnvelope(cap.protected_evaluator,'evaluate_method');
 for(const r of [cap.runtime,cap.contract,cap.protected_evaluator])if(r.session_id!==cap.session_id)fail('CAPABILITY_SESSION_MISMATCH');
 if(cap.runtime.response.status!=='HOSTED_MCP_READY'||!cap.runtime.response.available_tools?.includes('evaluate_method')||
 !str(cap.runtime.response.runtime_version)||cap.runtime.response.connector_dispatch!==false||
 !str(cap.contract.response.contract_version))fail('MPC_RUNTIME_OR_CONTRACT_UNAVAILABLE');
 const boot=cap.protected_evaluator;
 if(!boot.arguments||!boot.arguments.method||!boot.arguments.input)fail('PROTECTED_CALL_ARGUMENTS_REQUIRED');
 const local=getMethodCatalog({method:boot.arguments.method});
 const schema=local.input_schemas[boot.arguments.method];
 if(!schema)fail('UNSUPPORTED_NATIVE_METHOD');
 validate(boot.arguments.input,schema);
 modelResult(boot.response,boot.arguments.method,controllerHash(boot.arguments),local.version);
}
function bindModel(model,sources){
 if(!model||!model.input||!Array.isArray(model.proof_inputs)||model.proof_inputs.length<1||model.proof_inputs.length>64)fail('MISSING_MODEL_PROOF_INPUTS');
 const covered=[];
 for(const b of model.proof_inputs){
  const s=sources.get(b.source_ref);
  if(!s||b.source_version!==s.version)fail('MODEL_SOURCE_VERSION_MISMATCH');
  if(!same(pointer(s.content,b.source_pointer),pointer(model.input,b.model_pointer)))fail('MODEL_SOURCE_BINDING_MISMATCH');
  covered.push(b.model_pointer);
 }
 if(leafPaths(model.input).some(path=>!covered.some(p=>p===''||path===p||path.startsWith(p+'/'))))fail('UNBOUND_MODEL_INPUT');
 return [...new Set(model.proof_inputs.map(x=>x.source_ref))].sort().map(ref=>sourceKey(sources.get(ref)));
}
function build(config,methods,relations){
 jsonBound(config);
 const c=clone(config),blockers=[];
 if(!str(c.controller_id)||!str(c.project_id)||!['SYNTHETIC_ONLY','SUPPLIED_RECORD_REVIEW'].includes(c.mode))fail('INVALID_CONTROLLER_CONFIG');
 if(!c.source_revision||!str(c.source_revision.repository)||!str(c.source_revision.branch)||!/^[a-f0-9]{40}$/u.test(c.source_revision.commit))fail('SOURCE_COMMIT_REQUIRED');
 if(!Array.isArray(c.sources)||c.sources.length>16||!Array.isArray(c.adapters)||c.adapters.length>16)fail('CONTROLLER_INPUT_BOUNDS');
 const sources=new Map();
 const gate=(fn)=>{try{return fn()}catch(e){blockers.push(e.message);return null}};
 gate(()=>sourceRecord(c.native_controller));
 for(const s of c.sources){
  if(sources.has(s.ref))fail('DUPLICATE_SOURCE_REFERENCE');
  sources.set(s.ref,s);gate(()=>sourceRecord(s));
 }
 const nativeVersions=new Map();
 for(const s of [c.native_controller,...c.sources]){
  if(!s)continue;
  if(s.read_receipt?.session_id!==c.capabilities?.session_id)blockers.push('SOURCE_RECEIPT_SESSION_MISMATCH');
  const key=controllerHash({...identity(s),version:s.version});
  if(nativeVersions.has(key)&&!same(nativeVersions.get(key),sourceKey(s)))blockers.push('CONFLICTING_NATIVE_SOURCE_VERSION');
  nativeVersions.set(key,sourceKey(s));
 }
 for(const ref of [...(c.atom?.source_refs??[]),...(c.atom?.external_source_refs??[])])if(!sources.has(ref))blockers.push('UNRESOLVED_ATOM_SOURCE:'+ref);
 gate(()=>sessionGate(c));
 const adapters=new Map();
 for(const a of c.adapters){
  if(!a||!/^MHA-[0-9]{4}$/u.test(a.candidate_method_id)||adapters.has(a.candidate_method_id))fail('INVALID_OR_DUPLICATE_ADAPTER');
  adapters.set(a.candidate_method_id,a);
 }
 const plan=planNoahsArkReasoning({methods,relations,atom:c.atom,method_receipts:c.method_readiness??[],max_selected:c.max_selected??4,max_pairs:c.max_pairs??4});
 c.atom=plan.atom;
 c.sources.sort((a,b)=>a.ref.localeCompare(b.ref));
 c.adapters.sort((a,b)=>a.candidate_method_id.localeCompare(b.candidate_method_id));
 if(c.method_readiness)c.method_readiness.sort((a,b)=>a.method_id.localeCompare(b.method_id));
 if(c.mode==='SUPPLIED_RECORD_REVIEW'&&[c.native_controller,...c.sources].some(s=>s.namespace==='SYNTHETIC'))blockers.push('SYNTHETIC_SOURCE_NOT_NATIVE_RECORD');
 if(plan.status!=='EVIDENCE_REVIEW_PLAN_ONLY')blockers.push(plan.status);
 if(plan.outcome_vector.unresolved_dimensions.length)blockers.push('UNRESOLVED_TYPED_DIMENSIONS');
 const selected=plan.selected_methods.map(m=>({candidate_method_id:m.method_id,role:'PRIMARY',relation:null}));
 const challengers=plan.proposed_pairs.map(p=>({candidate_method_id:p.challenger_method_id,role:'CHALLENGER',relation:p}));
 if(c.require_challenger!==false&&plan.selected_methods.some(m=>!plan.proposed_pairs.some(p=>p.primary_method_id===m.method_id)))blockers.push('MISSING_PROPOSED_CHALLENGER');
 const tasks=[];
 for(const selectedMethod of [...selected,...challengers]){
  const a=adapters.get(selectedMethod.candidate_method_id);
  if(!a){blockers.push('MISSING_EXPLICIT_ADAPTER:'+selectedMethod.candidate_method_id);continue}
  const ready=(c.method_readiness??[]).find(r=>r.method_id===a.candidate_method_id);
  if(!ready||[ready.input_state,ready.negative_control_state,ready.falsifier_state].some(x=>x!=='AVAILABLE')){
   blockers.push('MISSING_PROOF_READINESS:'+a.candidate_method_id);continue;
  }
  gate(()=>{
   if(!str(a.adapter_id)||!str(a.adapter_version)||a.binding_kind!=='PROPOSED_BOUNDED_ADAPTATION'||
    !str(a.adaptation_limits)||!a.falsifier||!str(a.falsifier.statement)||
    !Array.isArray(a.falsifier.source_refs)||!a.falsifier.source_refs.length||
    a.falsifier.source_refs.some(r=>!sources.has(r)))fail('EXPLICIT_ADAPTATION_AND_FALSIFIER_REQUIRED');
   const catalog=(c.capabilities.catalogs??[]).find(r=>r.arguments?.method===a.native_method_id);
   receiptEnvelope(catalog,'get_method_catalog');
   if(catalog.session_id!==c.capabilities.session_id)fail('CATALOG_SESSION_MISMATCH');
   const local=getMethodCatalog({method:a.native_method_id}),remote=catalog.response;
   const schema=local.input_schemas[a.native_method_id];
   if(!schema||remote.status!=='METHOD_IMPLEMENTATION_CATALOG'||remote.version!==local.version||
    !same(remote.input_schemas?.[a.native_method_id],schema)||
    !remote.methods?.some(m=>m.id===a.native_method_id&&m.level==='COMPUTATION'))fail('NATIVE_SCHEMA_OR_METHOD_MISMATCH');
   if(a.schema_fingerprint!==controllerHash(schema)||a.native_catalog_version!==remote.version)fail('ADAPTER_SCHEMA_FINGERPRINT_MISMATCH');
   if(!a.negative_control?.expected||!str(a.negative_control.expected.pointer)||
    !a.negative_control.expected.pointer.startsWith('/result/')||!Object.hasOwn(a.negative_control.expected,'equals'))fail('EXECUTABLE_NEGATIVE_CONTROL_REQUIRED');
   if(a.native_method_id==='finite_invariant'&&
    (a.negative_control.expected.pointer!=='/result/status'||a.negative_control.expected.equals!=='COUNTEREXAMPLE_FOUND'))fail('FINITE_NEGATIVE_CONTROL_MUST_EXPECT_COUNTEREXAMPLE');
   const definition=methods.find(m=>m.method_id===a.candidate_method_id);
   for(const [role,model] of [['NEGATIVE_CONTROL',a.negative_control],['MODEL',a.model]]){
    validate(model?.input,schema);
    const modelSources=bindModel(model,sources);
    const args={method:a.native_method_id,input:model.input},modelHash=controllerHash(args);
    if(model.model_fingerprint!==modelHash)fail('MODEL_FINGERPRINT_MISMATCH');
    const dependency={controller:sourceKey(c.native_controller),atom:plan.atom,
     sources:[...modelSources,...a.falsifier.source_refs.map(r=>sourceKey(sources.get(r)))].sort(order),
     candidate_definition:definition,adapter:{id:a.adapter_id,version:a.adapter_version,kind:a.binding_kind,limits:a.adaptation_limits},
     native_method:a.native_method_id,schema_fingerprint:a.schema_fingerprint,catalog_version:remote.version,
     model_fingerprint:modelHash,proof_inputs:model.proof_inputs,expected:role==='NEGATIVE_CONTROL'?model.expected:null,
     role:selectedMethod.role,relation:selectedMethod.relation,falsifier:a.falsifier};
    const request={kind:'MPC_EVALUATE',tool:'evaluate_method',arguments:args,
     candidate_method_id:a.candidate_method_id,native_method_id:a.native_method_id,
     role:selectedMethod.role+'_'+role,dependency_fingerprint:controllerHash(dependency),
     method_fingerprint:controllerHash({candidate_definition:definition,native_descriptor:remote.methods.find(m=>m.id===a.native_method_id),native_catalog_version:remote.version}),
     schema_fingerprint:a.schema_fingerprint,model_fingerprint:modelHash,
     implementation_version:remote.version,expected:role==='NEGATIVE_CONTROL'?model.expected:null,
     adaptation_limits:a.adaptation_limits,source_authentication:false};
    request.request_sha256=controllerHash({tool:request.tool,arguments:args});
    request.action_id=controllerHash(request);
    tasks.push(request);
   }
  });
 }
 if(tasks.length>controllerContract.max_tasks)fail('CONTROLLER_TASK_BUDGET');
 nativeIdentity(c.checkpoint_target);
 if(!str(c.checkpoint_target.version))blockers.push('CHECKPOINT_EXPECTED_VERSION_REQUIRED');
 if([c.native_controller,...c.sources].some(s=>same(identity(s),identity(c.checkpoint_target))))blockers.push('CHECKPOINT_CANNOT_OVERWRITE_NATIVE_CONTROLLER_OR_SOURCE');
 const fingerprint=controllerHash({config:c,methods:[...methods].sort((a,b)=>a.method_id.localeCompare(b.method_id)),relations:[...relations].sort(order)});
 return {config:c,configuration_fingerprint:fingerprint,plan,tasks,blockers:[...new Set(blockers)].sort(),
  catalog_snapshot:{methods:[...methods].sort((a,b)=>a.method_id.localeCompare(b.method_id)),relations:[...relations].sort(order)}};
}
function seal(state){
 const s=clone(state);delete s.integrity_sha256;
 s.integrity_sha256=controllerHash(s);jsonBound(s);return s;
}
export function verifyControllerState(state){
 jsonBound(state);
 if(state?.version!==controllerContract.version||!hashPattern.test(state.integrity_sha256))fail('INVALID_CONTROLLER_STATE');
 const {integrity_sha256,...payload}=state;
 if(controllerHash(payload)!==integrity_sha256)fail('CONTROLLER_STATE_PARITY_MISMATCH');
 if(!Number.isInteger(state.revision)||state.revision<1||state.revision>controllerContract.max_revisions||!Number.isInteger(state.event_sequence)||state.event_sequence<0||
  !state.catalog_snapshot||!state.completed_actions||Array.isArray(state.completed_actions)||
  state.source_authentication!==false||state.canonical_promotion!==false||state.receipt_trust!==controllerContract.receipt_trust||
  Object.keys(state.completed_actions).length>controllerContract.max_completed_actions)fail('INVALID_CONTROLLER_STATE_SHAPE');
 if(state.event_sequence!==Object.keys(state.completed_actions).length+state.revision-1||
  !Array.isArray(state.revision_history)||state.revision_history.length!==state.revision-1||
  state.revision_history.some((r,i)=>r.revision!==i+1||!hashPattern.test(r.configuration_fingerprint)||!hashPattern.test(r.integrity_sha256)))fail('INVALID_CONTROLLER_HISTORY');
 const expected=build(state.config,state.catalog_snapshot.methods,state.catalog_snapshot.relations);
 for(const key of ['configuration_fingerprint','plan','tasks','blockers'])if(!same(expected[key],state[key]))fail('CONTROLLER_SEMANTIC_STATE_MISMATCH:'+key);
 for(const [id,record] of Object.entries(state.completed_actions)){
  if(id!==record.request?.action_id||record.receipt_sha256!==controllerHash(record.receipt))fail('INVALID_STORED_ACTION_RECEIPT');
  const checked=checkActionReceipt(record.request,record.receipt);
  if(record.negative_control_passed!==checked.negative_control_passed)fail('STORED_RESULT_PREDICATE_MISMATCH');
  validateReuse(state,record.request,record.receipt);
 }
 return true;
}
export function createController({config,methods,relations=[]}){
 return seal({version:controllerContract.version,revision:1,event_sequence:0,
  ...build(config,methods,relations),completed_actions:{},revision_history:[],
  receipt_trust:controllerContract.receipt_trust,source_authentication:false,canonical_promotion:false});
}
export function reconcileController(state,{config,methods,relations=[]}){
 verifyControllerState(state);
 const next=build(config,methods,relations);
 if(next.configuration_fingerprint===state.configuration_fingerprint)return state;
 if(state.revision>=controllerContract.max_revisions)fail('CONTROLLER_REVISION_BUDGET');
 const history=[...state.revision_history,{revision:state.revision,configuration_fingerprint:state.configuration_fingerprint,integrity_sha256:state.integrity_sha256}];
 return seal({...state,...next,revision:state.revision+1,event_sequence:state.event_sequence+1,revision_history:history});
}
function checkpointRequest(state){
 const completed=state.tasks.map(t=>({action_id:t.action_id,role:t.role,candidate_method_id:t.candidate_method_id,
  native_method_id:t.native_method_id,model_fingerprint:t.model_fingerprint,
  response_sha256:state.completed_actions[t.action_id].receipt.response_sha256,
  original_call_ref:state.completed_actions[t.action_id].receipt.call_ref,
  original_execution_session:state.completed_actions[t.action_id].receipt.originating_session_id??state.completed_actions[t.action_id].receipt.session_id,
  reused_from_action_id:state.completed_actions[t.action_id].receipt.reused_from_action_id??null,
  model_status:state.completed_actions[t.action_id].receipt.response.result.status??'BOUNDED_RESULT_RECORDED'}));
 const payload={checkpoint_format:'MPC_OPERATIVE_DEVELOPMENT_CHECKPOINT_V13_1',
  checkpoint_id:state.config.controller_id+':'+state.revision,project_id:state.config.project_id,
  controller_revision:state.revision,source_revision:state.config.source_revision,
  configuration_fingerprint:state.configuration_fingerprint,
  native_controller:sourceKey(state.config.native_controller),sources:state.config.sources.map(sourceKey),
  mode:state.config.mode,candidate_count:state.plan.method_consideration.length,
  selected_candidates:state.plan.selected_methods.map(m=>m.method_id),proposed_pairs:state.plan.proposed_pairs,
  completed_actions:completed,open:['Source authentication and independent evidentiary review remain separate.',
   'Native target facts, authorization and security impact are not established by these model results.'],
  next_action:'Resume only changed source/model/method dependencies from this controller.',
  source_authentication:false,canonical_promotion:false,target_finding:false,
  checkpoint_receipt_pending:'This write payload must be followed by exact native readback.'};
 const content=JSON.stringify(payload,null,2)+'\n';
 const request={kind:'NATIVE_CHECKPOINT_WRITE',tool:state.config.capabilities.native_write_tool,
  target:state.config.checkpoint_target,content,content_sha256:controllerHash(content)};
 request.action_id=controllerHash(request);return request;
}
export function nextControllerAction(state){
 verifyControllerState(state);
 if(state.blockers.length)return {status:'BLOCKED',blockers:state.blockers,action:null};
 for(const task of state.tasks){
  const done=state.completed_actions[task.action_id];
  if(!done){
   const previous=Object.values(state.completed_actions).find(r=>r.request.kind==='MPC_EVALUATE'&&!r.receipt.reused_from_action_id&&
    r.request.request_sha256===task.request_sha256&&r.request.schema_fingerprint===task.schema_fingerprint&&
    r.request.implementation_version===task.implementation_version);
   return {status:'AWAITING_HOST_EVALUATION',action:task,receipt_reuse_candidate:previous?{
    action_id:previous.request.action_id,original_call_ref:previous.receipt.call_ref,
    originating_session_id:previous.receipt.originating_session_id??previous.receipt.session_id,
    response_sha256:previous.receipt.response_sha256,independent_evidence:false}:null};
  }
  if(done.negative_control_passed===false)return {status:'BLOCKED',blockers:['NEGATIVE_CONTROL_NOT_DETECTED:'+task.action_id],action:null};
 }
 if(!state.tasks.length)return {status:'BLOCKED',blockers:['NO_EXECUTABLE_BOUND_MODELS'],action:null};
 const cap=state.config.capabilities;
 if(!str(cap.native_write_tool)||!cap.available_tools.includes(cap.native_write_tool)||state.config.checkpoint_write_authorized!==true)
  return {status:'AWAITING_CHECKPOINT_WRITE_CAPABILITY',action:null};
 const write=checkpointRequest(state),written=state.completed_actions[write.action_id];
 if(!written)return {status:'AWAITING_NATIVE_CHECKPOINT_WRITE',action:write};
 if(!str(cap.native_read_tool)||!cap.available_tools.includes(cap.native_read_tool))return {status:'AWAITING_CHECKPOINT_READ_CAPABILITY',action:null};
 const read={kind:'NATIVE_CHECKPOINT_READBACK',tool:cap.native_read_tool,
  target:{...identity(write.target),version:written.receipt.native.version},content_sha256:write.content_sha256,
  write_action_id:write.action_id};
 read.action_id=controllerHash(read);
 if(!state.completed_actions[read.action_id])return {status:'AWAITING_NATIVE_CHECKPOINT_READBACK',action:read};
 return {status:'COMPLETE',action:null,scope:'BOUNDED_MODEL_RUN_AND_NATIVE_CHECKPOINT_PARITY',
  receipt_trust:controllerContract.receipt_trust,native_checkpoint:read.target,
  content_sha256:read.content_sha256,source_authentication:false,target_finding:false,canonical_promotion:false};
}
export function acceptControllerReceipt(state,receipt){
 verifyControllerState(state);jsonBound(receipt);
 if(!receipt||!str(receipt.action_id)||!str(receipt.tool)||!str(receipt.call_ref)||
  receipt.session_id!==state.config.capabilities.session_id||!hashPattern.test(receipt.response_sha256)||
  !receipt.response||controllerHash(receipt.response)!==receipt.response_sha256)fail('INVALID_ACTION_RECEIPT');
 const prior=state.completed_actions[receipt.action_id];
 if(prior){if(prior.receipt_sha256===controllerHash(receipt))return state;fail('CONFLICTING_COMPLETED_ACTION_RECEIPT')}
 const next=nextControllerAction(state),a=next.action;
 if(!a||receipt.action_id!==a.action_id||receipt.tool!==a.tool||receipt.kind!==a.kind)fail('UNEXPECTED_OR_STALE_ACTION_RECEIPT');
 const record=checkActionReceipt(a,receipt);
 validateReuse(state,a,receipt);
 if(Object.keys(state.completed_actions).length>=controllerContract.max_completed_actions)fail('CONTROLLER_ACTION_HISTORY_BUDGET');
 return seal({...state,event_sequence:state.event_sequence+1,
  completed_actions:{...state.completed_actions,[a.action_id]:record}});
}
function validateReuse(state,a,receipt){
 if(!receipt.reused_from_action_id)return;
 const old=state.completed_actions[receipt.reused_from_action_id];
 if(receipt.reused_from_action_id===a.action_id||a.kind!=='MPC_EVALUATE'||!old||old.receipt.reused_from_action_id||old.request.kind!=='MPC_EVALUATE'||
  old.request.request_sha256!==a.request_sha256||old.request.schema_fingerprint!==a.schema_fingerprint||
  old.request.implementation_version!==a.implementation_version||old.receipt.call_ref!==receipt.call_ref||
  old.receipt.response_sha256!==receipt.response_sha256||receipt.originating_session_id!==(old.receipt.originating_session_id??old.receipt.session_id))fail('INVALID_NATIVE_RESULT_REUSE');
}
function checkActionReceipt(a,receipt){
 if(!a||!receipt||!['MPC_EVALUATE','NATIVE_CHECKPOINT_WRITE','NATIVE_CHECKPOINT_READBACK'].includes(a.kind))fail('INVALID_STORED_ACTION_KIND');
 const {action_id,...requestBody}=a;
 if(controllerHash(requestBody)!==action_id||receipt.action_id!==action_id||receipt.kind!==a.kind||receipt.tool!==a.tool||
  !str(receipt.call_ref)||!str(receipt.session_id)||!receipt.response||
  controllerHash(receipt.response)!==receipt.response_sha256)fail('INVALID_STORED_ACTION_BINDING');
 if(receipt.response.isError===true)fail('TOOL_ERROR_IS_NOT_COMPLETION');
 const record={request:a,receipt,receipt_sha256:controllerHash(receipt),negative_control_passed:null};
 if(a.kind==='MPC_EVALUATE'){
  const local=getMethodCatalog({method:a.native_method_id}),schema=local.input_schemas[a.native_method_id];
  if(a.tool!=='evaluate_method'||!schema||a.arguments?.method!==a.native_method_id||
   a.schema_fingerprint!==controllerHash(schema)||a.model_fingerprint!==controllerHash(a.arguments)||
   a.implementation_version!==local.version||a.request_sha256!==controllerHash({tool:a.tool,arguments:a.arguments}))fail('INVALID_STORED_NATIVE_REQUEST');
  validate(a.arguments.input,schema);
  if(receipt.request_sha256!==a.request_sha256)fail('MODEL_REQUEST_RECEIPT_MISMATCH');
  modelResult(receipt.response,a.native_method_id,a.model_fingerprint,a.implementation_version);
  record.negative_control_passed=a.expected?same(pointer(receipt.response,a.expected.pointer),a.expected.equals):null;
 }else{
  nativeIdentity(receipt.native);
  if(!same(identity(receipt.native),identity(a.target))||!str(receipt.native.version))fail('CHECKPOINT_NATIVE_IDENTITY_MISMATCH');
  if(a.kind==='NATIVE_CHECKPOINT_WRITE'){
   if(receipt.status!=='NATIVE_WRITE_SUPPLIED'||receipt.expected_previous_version!==a.target.version||
    typeof a.content!=='string'||controllerHash(a.content)!==a.content_sha256||receipt.content_sha256!==a.content_sha256)fail('CHECKPOINT_WRITE_RECEIPT_MISMATCH');
  }else{
   if(receipt.status!=='NATIVE_READBACK_SUPPLIED'||receipt.native.version!==a.target.version||
    typeof receipt.content!=='string'||controllerHash(receipt.content)!==a.content_sha256)fail('CHECKPOINT_READBACK_CONTENT_OR_VERSION_MISMATCH');
  }
 }
 return record;
}
