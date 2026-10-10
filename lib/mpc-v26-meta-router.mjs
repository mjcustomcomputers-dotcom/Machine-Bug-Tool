// V26 opt-in source-bound, business-oriented meta router. It does not replace
// the original Method Atlas SQL router, typed canonical IDs or seven stages.
import {createHash} from 'node:crypto';
import overlay from '../research/meta-router-time-auth-v26.json' with {type:'json'};
import {planMinimalDistinguishingQuestionsV26} from './mpc-v26-meta-primitives.mjs';

const ID=/^[A-Za-z0-9][A-Za-z0-9_:./@-]{0,95}$/u;
const DIM=/^[A-Z][A-Z0-9_]{1,63}$/u;
const GIT=/^[a-f0-9]{40}$/u;
const fail=x=>{throw Error(x)};
const dense=x=>Array.isArray(x)&&Array.from({length:x.length},(_,i)=>Object.hasOwn(x,i)).every(Boolean);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 [Object.prototype,null].includes(Object.getPrototypeOf(x));
const check=(x,allowed,label)=>{if(!obj(x)||Object.keys(x).some(k=>!allowed.includes(k)))fail('INVALID_'+label+'_FIELDS')};
const valid=x=>typeof x==='string'&&ID.test(x);
const canonical=x=>JSON.stringify(x);
const fingerprint=x=>createHash('sha256').update(canonical(x)).digest('hex');
const order=(a,b)=>a<b?-1:a>b?1:0;
const uniq=x=>[...new Set(x)].sort(order);
const FAMILIES=['BUSINESS','SANDBOX','AUTHENTICATION','REDUCTION','TIME','ROUTER'];
const PROFILE=Object.freeze({
 BUSINESS_STARTUP:['BUSINESS','REDUCTION','ROUTER','AUTHENTICATION','TIME','SANDBOX'],
 SECURITY_RESEARCH:['AUTHENTICATION','SANDBOX','TIME','REDUCTION','ROUTER','BUSINESS'],
 LEGAL_RESEARCH:['AUTHENTICATION','TIME','REDUCTION','ROUTER','SANDBOX','BUSINESS'],
 NETWORK_RESEARCH:['TIME','AUTHENTICATION','SANDBOX','REDUCTION','ROUTER','BUSINESS'],
 GENERAL:['REDUCTION','ROUTER','AUTHENTICATION','TIME','SANDBOX','BUSINESS']
});
const STATES=['OBSERVED','CLAIMED','CONTRADICTED','UNKNOWN','SYNTHETIC'];
if(overlay.namespace!=='NONCANONICAL_RH_V26'||overlay.hooks.length!==33||
 overlay.original_maxvar_bl_and_variants_unchanged!==true||
 overlay.existing_native_evaluators!==24||overlay.existing_method_atlas_candidates!==239||
 new Set(overlay.hooks.map(x=>x.id)).size!==33||
 overlay.hooks.some(x=>!/^RH-V26-[0-9]{2}$/u.test(x.id)||
 !dense(x.requires)||!dense(x.produces)||!x.requires.length||!x.produces.length||
 [...x.requires,...x.produces].some(d=>!DIM.test(d))))fail('V26_OVERLAY_INVALID');

export const v26RouteContract=Object.freeze({
 version:overlay.version,profile_default:'BUSINESS_STARTUP',
 stage_order:['EVIDENCE_ACQUISITION','ANALYSIS','VERIFICATION'],
 max_atoms:64,max_selected_methods:8,existing_mha_registry_modified:false,
 native_evaluators_added:0,automatic_evaluator_dispatch:false,
 source_authentication:false,external_actions:false,
 canonical_promotion:false,production_default_route_replaced:false
});
export function routeMethodsOnMethodsV26(input){
 check(input,['source_commit','scope_id','subject_id','world','profile','requested_stage',
  'atoms','max_methods','previous_fingerprint','hypothesis_input','verification_target'],'V26_ROUTE');
 if(!GIT.test(input.source_commit||'')||!valid(input.scope_id)||!valid(input.subject_id)||
  !['SYNTHETIC','RECORD'].includes(input.world)||
  (input.profile!==undefined&&!Object.hasOwn(PROFILE,input.profile))||
  !['AUTO','EVIDENCE_ACQUISITION','ANALYSIS','VERIFICATION'].includes(input.requested_stage??'AUTO')||
  !Number.isInteger(input.max_methods??6)||(input.max_methods??6)<1||(input.max_methods??6)>8||
  (input.previous_fingerprint!==undefined&&input.previous_fingerprint!==null&&
   !/^[a-f0-9]{64}$/u.test(input.previous_fingerprint)))fail('INVALID_V26_ROUTER_CONTEXT');
 if(input.verification_target!==undefined&&input.verification_target!==null){
  check(input.verification_target,['claim_id','oracle_ref'],'V26_VERIFICATION_TARGET');
  if(!valid(input.verification_target.claim_id)||!valid(input.verification_target.oracle_ref))
    fail('INVALID_V26_VERIFICATION_TARGET');
 }
 if(input.hypothesis_input!==undefined&&input.hypothesis_input!==null){
  check(input.hypothesis_input,['questions','hypotheses','max_questions'],'V26_HYPOTHESIS_INPUT');
 }
 if(!dense(input.atoms)||input.atoms.length>64)fail('INVALID_ATOM_BATCH');
 const seen=new Set(),byDimension=new Map(),sourceVersions=new Map(),conflicts=[];
 for(const atom of input.atoms){
  check(atom,['id','dimension','state','source_ref','source_owner','source_version',
   'scope_id','subject_id'],'V26_ATOM');
  if(!valid(atom.id)||seen.has(atom.id)||!DIM.test(atom.dimension||'')||
   !STATES.includes(atom.state)||!valid(atom.source_ref)||!valid(atom.source_owner)||
   !valid(atom.source_version)||atom.scope_id!==input.scope_id||
   atom.subject_id!==input.subject_id)fail('INVALID_V26_ATOM_SOURCE');
  if(input.world==='SYNTHETIC'&&!['SYNTHETIC','UNKNOWN'].includes(atom.state)||
     input.world==='RECORD'&&atom.state==='SYNTHETIC')fail('V26_WORLD_MIX');
  seen.add(atom.id);
  const list=byDimension.get(atom.dimension)||[];list.push(atom);byDimension.set(atom.dimension,list);
  const old=sourceVersions.get(atom.source_ref);
  if(old&&old!==atom.source_version)conflicts.push({source_ref:atom.source_ref,
    first_version:old,competing_version:atom.source_version});
  else sourceVersions.set(atom.source_ref,atom.source_version);
 }
 const ctx={source_commit:input.source_commit,scope_id:input.scope_id,subject_id:input.subject_id};
 const profile=input.profile??'BUSINESS_STARTUP',max=input.max_methods??6;
 const normalized=input.atoms.slice().sort((a,b)=>order(a.id,b.id));
 const hash=fingerprint({...ctx,world:input.world,profile,requested_stage:input.requested_stage??'AUTO',
  max_methods:max,atoms:normalized,hypothesis_input:input.hypothesis_input??null,
  verification_target:input.verification_target??null});
 const zeroDelta=hash===input.previous_fingerprint;
 const typed=type=>{
  const list=byDimension.get(type)||[],states=new Set(list.map(a=>a.state));
  return states.has('CONTRADICTED')&&(states.has('OBSERVED')||states.has('CLAIMED'))?
   'CONTESTED':states.has('CONTRADICTED')?'CONTRADICTED':
   states.has('SYNTHETIC')||states.has('OBSERVED')?'SOURCE_DECLARED_NOT_AUTHENTICATED':
   states.has('CLAIMED')?'CLAIMED_UNVERIFIED':'UNKNOWN';
 };
 const declaredInputs=new Set([...byDimension.keys()].filter(t=>typed(t)==='SOURCE_DECLARED_NOT_AUTHENTICATED'));
 const derived=new Set(overlay.hooks.flatMap(x=>x.produces));
 const familyRank=new Map(PROFILE[profile].map((f,i)=>[f,i]));
 const classified=overlay.hooks.map(h=>{
  const miss=h.requires.filter(t=>!declaredInputs.has(t)).sort();
  return {id:h.id,family:h.family,implementation_state:h.implementation_state,
   requires:h.requires,proposes:h.produces,missing_or_unverified:miss,
   missing_primary_records:miss.filter(t=>!derived.has(t)),
   missing_unexecuted_method_outputs:miss.filter(t=>derived.has(t)),
   ready_on_declared_types:miss.length===0,
   falsifier:h.falsifier,source_urls:h.source_urls,
   method_executed:false,source_authentication:false,canonical_promotion:false};
 }).sort((a,b)=>{
  const ra=familyRank.get(a.family)??100,rb=familyRank.get(b.family)??100;
  return a.missing_primary_records.length-b.missing_primary_records.length||
   (a.ready_on_declared_types?-1:1)-(b.ready_on_declared_types?-1:1)||
   ra-rb||a.missing_or_unverified.length-b.missing_or_unverified.length||
   order(a.id,b.id);
 });
 const chosen=classified.slice(0,max);
 const requirements=uniq(chosen.flatMap(m=>m.missing_primary_records));
 const primaryFrontier=requirements.map(t=>{
  const impacted=chosen.filter(h=>h.missing_primary_records.includes(t));
  const unlocks=impacted.filter(h=>h.missing_or_unverified.every(x=>x===t));
  return {dimension:t,current_state:typed(t),
   source_owner:'TO_BE_IDENTIFIED',source_locator:'NOT_ACQUIRED',
   blocked_methods:impacted.map(x=>x.id),
   one_record_structural_unlocks:unlocks.map(x=>x.id),
   impacted_count:impacted.length,unlock_count:unlocks.length,
   probability_of_success:'NOT_ESTIMATED',
   external_fetch_performed:false};
 }).sort((a,b)=>b.unlock_count-a.unlock_count||b.impacted_count-a.impacted_count||order(a.dimension,b.dimension));
 const links=[];
 for(const a of chosen)for(const b of chosen){
  if(a.id===b.id)continue;
  const via=a.proposes.filter(t=>b.requires.includes(t));
  if(via.length)links.push({from:a.id,to:b.id,via,
   state:'HYPOTHETICAL_METHOD_OUTPUT_NOT_EXECUTED',
   falsifier:b.falsifier,source_lineage_independence_proven:false});
 }
 links.sort((a,b)=>order(a.from,b.from)||order(a.to,b.to));
 let distinguishing=null;
 if(input.hypothesis_input!==undefined&&input.hypothesis_input!==null){
  if(!obj(input.hypothesis_input))fail('INVALID_HYPOTHESIS_REQUEST');
  distinguishing=planMinimalDistinguishingQuestionsV26({...input.hypothesis_input,...ctx});
 }
 let stage,status,next;
 if(conflicts.length){stage='EVIDENCE_ACQUISITION';status='BLOCKED_SOURCE_VERSION_CONFLICT';next='Reacquire the native source and resolve its authoritative version before inferring or executing.';}
 else if(zeroDelta){stage='STOP';status='STOP_NO_MATERIAL_INFORMATION_GAIN';next='Read a new source/version or change the declared question before rerunning methods.';}
 else if((input.requested_stage??'AUTO')==='VERIFICATION'){
  stage='VERIFICATION';status='INDEPENDENT_VERIFICATION_RECEIPT_REQUIRED';
  next='Obtain independent criterion/oracle and source-authenticated result; planning never constitutes PASS.';
 }else if(primaryFrontier.length||!chosen.some(x=>x.ready_on_declared_types)){
  stage='EVIDENCE_ACQUISITION';status='SOURCE_ACQUISITION_FRONTIER';
  next=primaryFrontier.length?
    'Obtain authoritative '+primaryFrontier[0].dimension+' for source/subject, then rerun the selected method.':
    'Resolve missing prior-method output using its own separately checked execution receipt.';
 }else{
  stage='ANALYSIS';status='METHODS_READY_FOR_SEPARATE_SUPPLIED_MODEL';
  next='Select one ready method and construct its bounded supplied model plus independent falsifier.';
 }
 const claims=Object.freeze({sources_authenticated:false,methods_executed:0,
   production_runtime_modified:false,factual_claims_verified:0});
 return {version:v26RouteContract.version,...ctx,
  profile,profile_is_inference:false,world:input.world,fingerprint:hash,
  phase:stage,status,next_action:next,
  source_version_conflicts:conflicts,
  known_dimensions:uniq([...byDimension.keys()]).map(d=>({dimension:d,state:typed(d)})),
  research_methods_total:overlay.hooks.length,selected_methods:chosen,
  primary_acquisition_frontier:primaryFrontier,
  hypothetical_method_links:links,
  distinguishing_question_plan:distinguishing,
  mirror_reviews:chosen.map(x=>({method_id:x.id,
   what_could_refute:x.falsifier,non_observed_inverse:true})),
  no_action_on_zero_delta:zeroDelta,claims,
  bounded_method_selection:true,remote_dispatch:false,canonical_promotion:false};
}
