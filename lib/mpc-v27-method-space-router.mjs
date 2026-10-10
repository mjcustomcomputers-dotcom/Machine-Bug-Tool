// MPC V27 — method-space router: source-bound typed research routing,
// interface composition, falsifier mirrors and constrained cross-domain gates.
// No replacement of V26, MHA/BL registries, real animal research or space IO.
import {createHash} from 'node:crypto';
import frontier from '../research/space-of-methods-v27.json' with {type:'json'};
import {routeMethodsOnMethodsV26} from './mpc-v26-meta-router.mjs';
const fail=x=>{throw Error(x)};
const ident=/^[A-Za-z0-9][A-Za-z0-9_:./@-]{0,95}$/u;
const GIT=/^[a-f0-9]{40}$/u;
const DIM=/^[A-Z][A-Z0-9_]{1,63}$/u;
const domains=new Set(['SPACE','CETACEAN','ETHOLOGY','CONSERVATION','EVOLUTION',
 'QUANTUM','SPORT','CRYPTO','META']);
const states=new Set(['OBSERVED','CLAIMED','CONTRADICTED','UNKNOWN','SYNTHETIC']);
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 [Object.prototype,null].includes(Object.getPrototypeOf(o));
const keys=(o,allowed,label)=>{if(!plain(o)||Object.keys(o).some(k=>!allowed.includes(k)))
  fail('INVALID_'+label+'_FIELDS')};
const valid=x=>typeof x==='string'&&ident.test(x);
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const uniq=x=>[...new Set(x)].sort();
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const specs=frontier.hooks;
if(frontier.namespace!=='NONCANONICAL_RH_V27'||frontier.original_evaluators!==24||
  frontier.original_method_atlas_candidates!==239||frontier.canonical_promotion!==false||
  specs.length!==48||new Set(specs.map(x=>x.id)).size!==48||
  specs.some(x=>!/^RH-V27-[0-9]{2}$/u.test(x.id)||!domains.has(x.domain)||
    !dense(x.requires)||!dense(x.produces)||!x.requires.length||!x.produces.length||
    [...x.requires,...x.produces].some(d=>!DIM.test(d))||
    !dense(x.primary_source_urls)||!x.primary_source_urls.length||
    x.primary_source_urls.some(u=>!u.startsWith('https://'))))
 fail('INVALID_SPACE_OF_METHODS_RESEARCH_OVERLAY');
const outputs=new Set(specs.flatMap(x=>x.produces));
export const methodSpaceContract=Object.freeze({
 version:'MPC_V27_SPACE_OF_METHODS_ROUTER_1',
 research_hook_contracts:48,max_atoms:64,max_selected:8,
 domain_scoped:true,zero_delta_stop:true,legacy_v26_opt_in:true,
 native_evaluators_added:0,canonical_method_registry_changed:false,
 independent_witnesses_proven:false,source_authentication:false,
 performance_inference:false,science_experiment_execution:false,
 canonical_promotion:false
});
export function routeSpaceOfMethodsV27(input){
 keys(input,['source_commit','scope_id','subject_id','source_ref','source_version',
   'domain','world','atoms','max_methods','previous_fingerprint','include_v26_business_context'],'METHOD_SPACE');
 if(!GIT.test(input.source_commit||'')||!valid(input.scope_id)||!valid(input.subject_id)||
  !valid(input.source_ref)||!valid(input.source_version)||
  !domains.has(input.domain)||!['SYNTHETIC','RECORD'].includes(input.world)||
  !Number.isInteger(input.max_methods??6)||(input.max_methods??6)<1||
  (input.max_methods??6)>8||
  ![true,false,undefined].includes(input.include_v26_business_context)||
  (input.previous_fingerprint!==undefined&&input.previous_fingerprint!==null&&
   !/^[a-f0-9]{64}$/u.test(input.previous_fingerprint))||
  !dense(input.atoms)||input.atoms.length>64)fail('INVALID_METHOD_SPACE_CONTEXT');
 const ids=new Set(),types=new Map(),versions=new Map(),conflicts=[];
 for(const a of input.atoms){
  keys(a,['id','dimension','state','source_ref','source_owner','source_version',
   'scope_id','subject_id'],'METHOD_SPACE_ATOM');
  if(!valid(a.id)||ids.has(a.id)||!DIM.test(a.dimension||'')||!states.has(a.state)||
    !valid(a.source_ref)||!valid(a.source_owner)||!valid(a.source_version)||
    a.scope_id!==input.scope_id||a.subject_id!==input.subject_id)fail('INVALID_SPACE_ATOM');
  if(input.world==='SYNTHETIC'&&!['SYNTHETIC','UNKNOWN'].includes(a.state)||
     input.world==='RECORD'&&a.state==='SYNTHETIC')fail('INVALID_SPACE_WORLD');
  ids.add(a.id);
  const xs=types.get(a.dimension)||[];xs.push(a);types.set(a.dimension,xs);
  if(versions.has(a.source_ref)&&versions.get(a.source_ref)!==a.source_version)
    conflicts.push({source_ref:a.source_ref,
      observed_versions:uniq([versions.get(a.source_ref),a.source_version])});
  else versions.set(a.source_ref,a.source_version);
 }
 const state=d=>{
  const ss=new Set((types.get(d)||[]).map(x=>x.state));
  if(ss.has('CONTRADICTED')&&(ss.has('OBSERVED')||ss.has('CLAIMED')))return 'CONTESTED';
  if(ss.has('CONTRADICTED'))return 'CONTRADICTED';
  if(ss.has('OBSERVED')||ss.has('SYNTHETIC'))return 'SUPPLIED_UNAUTHENTICATED';
  if(ss.has('CLAIMED'))return 'CLAIMED_UNVERIFIED';
  return 'UNKNOWN';
 };
 const declared=new Set([...types.keys()].filter(x=>state(x)==='SUPPLIED_UNAUTHENTICATED'));
 const active=specs.filter(h=>h.domain===input.domain||h.domain==='META');
 const analyzed=active.map(h=>{
  const missing=h.requires.filter(t=>!declared.has(t)).sort(),
   primary=missing.filter(t=>!outputs.has(t)),
   intermediate=missing.filter(t=>outputs.has(t));
  return {id:h.id,domain:h.domain,key:h.key,requires:h.requires,proposes:h.produces,
   state:!missing.length?'RESEARCH_APPLICABLE_NOT_EXECUTED':
    primary.length?'PRIMARY_SOURCE_ACQUISITION':'PRIOR_METHOD_OUTPUT_NOT_EXECUTED',
   missing_inputs:missing,missing_primary:primary,unexecuted_intermediate:intermediate,
   falsifier:h.falsifier,primary_source_urls:h.primary_source_urls,
   execution:'NOT_EXECUTED',source_authenticated:false};
 }).sort((a,b)=>{
  const readyA=a.missing_inputs.length===0?0:1,readyB=b.missing_inputs.length===0?0:1;
  return readyA-readyB||a.missing_primary.length-b.missing_primary.length||
    a.missing_inputs.length-b.missing_inputs.length||a.id.localeCompare(b.id);
 });
 const selected=analyzed.slice(0,input.max_methods??6);
 const frontierTypes=uniq(selected.flatMap(x=>x.missing_primary));
 const missingSources=frontierTypes.map(t=>{
  const impacted=selected.filter(m=>m.missing_primary.includes(t));
  const unlocks=impacted.filter(m=>m.missing_inputs.every(x=>x===t));
  return {dimension:t,source_owner:'NOT_YET_IDENTIFIED',
   source_locator:'NOT_ACQUIRED',
   impacted_methods:impacted.map(h=>h.id),one_atom_unlocks:unlocks.map(x=>x.id),
   unlock_count:unlocks.length,records_acquired:0};
 }).sort((a,b)=>b.unlock_count-a.unlock_count||a.dimension.localeCompare(b.dimension));
 const edges=[];
 for(const a of selected)for(const b of selected){
  if(a.id===b.id)continue;
  const bridge=a.proposes.filter(x=>b.requires.includes(x));
  if(!bridge.length)continue;
  const safeDomain=a.domain===b.domain||a.domain==='META'||b.domain==='META';
  edges.push({from:a.id,to:b.id,bridge,domains:[a.domain,b.domain],
    state:!safeDomain?'NON_EQUIVALENT_DOMAIN_TRANSFER_BLOCKED':
      'HYPOTHETICAL_CONTRACT_COMPOSITION_ONLY',
    source_independence_proven:false,intermediate_evidence_observed:false,
    falsifier:b.falsifier});
 }
 edges.sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
 const normalized=input.atoms.slice().sort((a,b)=>a.id.localeCompare(b.id));
 const versionKey=hash({source_commit:input.source_commit,scope_id:input.scope_id,
  subject_id:input.subject_id,source_ref:input.source_ref,source_version:input.source_version,
  domain:input.domain,world:input.world,max_methods:input.max_methods??6,atoms:normalized});
 const noDelta=versionKey===input.previous_fingerprint;
 let phase,status,next;
 if(conflicts.length){
  phase='EVIDENCE_ACQUISITION';status='SOURCE_VERSION_CONFLICT';
  next='Obtain controlling current source/version from its native custodian before interpreting method results.';
 }else if(noDelta){
  phase='STOP';status='STOP_NO_MATERIAL_INFORMATION_GAIN';
  next='Acquire a changed source/version or supply a new disconfirming observation before rerouting.';
 }else if(selected.some(x=>x.state==='RESEARCH_APPLICABLE_NOT_EXECUTED')){
  phase='ANALYSIS';status='SOURCE_TYPES_READY_RESEARCH_NOT_EXECUTED';
  next='Choose one applicable method and independently check its specific source/model preconditions and falsifier.';
 }else{
  phase='EVIDENCE_ACQUISITION';status='NEXT_NATIVE_RECORD_REQUIRED';
  next=missingSources.length?'Acquire source evidence for '+missingSources[0].dimension+' with owner and version.':
    'Obtain an independently evaluated prior-method output rather than treating its planned output as observed.';
 }
 const businessContext=input.include_v26_business_context?
  routeMethodsOnMethodsV26({source_commit:input.source_commit,scope_id:input.scope_id,
   subject_id:input.subject_id,world:input.world,profile:'BUSINESS_STARTUP',
   atoms:input.atoms,max_methods:4}):null;
 return {version:methodSpaceContract.version,
  scope_id:input.scope_id,subject_id:input.subject_id,
  source_commit:input.source_commit,source_ref:input.source_ref,
  source_version:input.source_version,domain:input.domain,world:input.world,
  domain_inference_performed:false,method_registry_total:specs.length,
  domain_applicable_contracts:active.length,
  source_states:uniq([...types.keys()]).map(d=>({dimension:d,state:state(d)})),
  fingerprint:versionKey,phase,status,next_action:next,
  source_version_conflicts:conflicts,selected_methods:selected,
  missing_primary_source_frontier:missingSources,
  method_on_method_links:edges,
  mirror_falsifiers:selected.map(x=>({method_id:x.id,
    disconfirmation_target:x.falsifier,executed:false})),
  optional_v26_business_plan:businessContext,
  evidence_acquired:false,real_science_methods_executed:0,
  cross_species_semantics_inferred:false,authorities_authenticated:false,
  protected_locations_released:false,canonical_promotion:false};
}
