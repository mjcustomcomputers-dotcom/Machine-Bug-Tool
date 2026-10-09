// Noah's Ark: bounded seven-layer reasoning for the existing Method Atlas.
// A complete consideration manifest is produced for EVERY candidate, but
// only a small evidence-gated, paired method plan is returned for review.
// Inspired by OSI separation of responsibilities; NOT an OSI wire protocol,
// exploit engine, source authenticator or proof of a target finding.
const METHOD=/^MHA-[0-9]{4}$/u;
const IDENT=/^[A-Za-z0-9_:.-]{1,200}$/u;
const DIM=/^[A-Z][A-Z0-9_]{1,39}$/u;
const INPUT=new Set(['AVAILABLE','MISSING','UNKNOWN']);
const CONTROL=new Set(['AVAILABLE','MISSING','UNKNOWN']);
const RELATION=new Set(['CHALLENGE','CROSS_CHECK','COMPLEMENT']);
const fail=x=>{throw Error(x)};
const byId=(a,b)=>a.method_id.localeCompare(b.method_id);
const sorted=x=>[...x].sort();
const unique=arr=>new Set(arr).size===arr.length;
const LAYERS=Object.freeze([
 {layer:1,name:'SOURCE_AND_AUTHORITY',input:'exact source owner, identity, provenance, permission',stop:'MISSING_NATIVE_SOURCE'},
 {layer:2,name:'TYPED_ATOM_AND_STATE',input:'native subject, object, typed dimensions and source state',stop:'INVALID_ATOM'},
 {layer:3,name:'STRUCTURE_AND_INTERFACES',input:'actor/authority, dependency edges, timing, connector boundaries',stop:'STRUCTURAL_UNKNOWN'},
 {layer:4,name:'METHOD_APPLICABILITY',input:'dimension match, method schema and required input readiness',stop:'BLOCKED_METHOD_INPUT'},
 {layer:5,name:'BOUNDED_REASONING_PLAN',input:'coverage, control availability and declared computation cost',stop:'BUDGET_EXHAUSTED'},
 {layer:6,name:'CHALLENGE_AND_FALSIFICATION',input:'negative control, falsifier, competing model and method links',stop:'NO_INDEPENDENT_PROOF'},
 {layer:7,name:'OUTCOME_AND_CHECKPOINT',input:'source-owned outcomes, exact readback and changed evidence only',stop:'NOT_AUTHENTICATED_OR_EXECUTED'}
]);
const validateList=(xs,max,pattern,name)=>{
 if(!Array.isArray(xs)||xs.length>max||xs.some(x=>typeof x!=='string'||!pattern.test(x))||!unique(xs))fail('INVALID_'+name);
 return sorted(xs);
};
function validateAtom(a){
 if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['subject_id','atom_id','dimensions','source_refs','external_source_refs'].includes(k)))fail('INVALID_REASONING_ATOM');
 if(!IDENT.test(a.subject_id)||!IDENT.test(a.atom_id))fail('INVALID_REASONING_ID');
 const dimensions=validateList(a.dimensions,8,DIM,'DIMENSIONS');
 const sources=validateList(a.source_refs??[],8,IDENT,'SOURCE_REFS');
 const external=validateList(a.external_source_refs??[],8,IDENT,'EXTERNAL_REFS');
 if(!dimensions.length)fail('EMPTY_TYPED_DIMENSIONS');
 return {subject_id:a.subject_id,atom_id:a.atom_id,dimensions,source_refs:sources,external_source_refs:external};
}
function validateReceipts(receipts,methods){
 if(!Array.isArray(receipts)||receipts.length>512)fail('METHOD_RECEIPT_BOUNDS');
 const keyed=new Map();
 for(const r of receipts){
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['method_id','input_state','negative_control_state','falsifier_state','estimated_cost_units'].includes(k))||
    !METHOD.test(r.method_id)||!methods.has(r.method_id)||keyed.has(r.method_id)||
    !INPUT.has(r.input_state)||!CONTROL.has(r.negative_control_state)||!CONTROL.has(r.falsifier_state)||
    !Number.isInteger(r.estimated_cost_units)||r.estimated_cost_units<1||r.estimated_cost_units>100)fail('INVALID_METHOD_READINESS');
  keyed.set(r.method_id,r);
 }
 return keyed;
}
export const arkReasoningContract=Object.freeze({
 version:'MPC_NOAHS_ARK_REASONING_V13',layer_count:7,source:'OSI_INSPIRED_ANALYTICAL_SEPARATION_NOT_NETWORK_OSI_IMPLEMENTATION',
 candidate_budget:512,max_selected:8,max_pairs:8,source_authentication:false,
 automatic_method_execution:false,external_target_actions:false,
 claimed_global_optimum:false,canonical_registry_mutation:false
});
export function planNoahsArkReasoning({methods,relations=[],atom,method_receipts=[],max_selected=4,max_pairs=4}){
 if(!Array.isArray(methods)||!methods.length||methods.length>512||
 !Array.isArray(relations)||relations.length>1024||!Number.isInteger(max_selected)||max_selected<1||max_selected>8||
 !Number.isInteger(max_pairs)||max_pairs<0||max_pairs>8)fail('ARK_BUDGET_OR_METHODS');
 const a=validateAtom(atom),sourceBound=a.source_refs.length>0;
 const methodMap=new Map();
 for(const m of methods){
  if(!m||typeof m!=='object'||!METHOD.test(m.method_id)||methodMap.has(m.method_id)||
   !Array.isArray(m.dimensions)||!m.dimensions.length||m.dimensions.length>8||!unique(m.dimensions)||m.dimensions.some(d=>!DIM.test(d))||
   !['RESEARCH_HOOK','PROTOTYPE','VALIDATED_IMPLEMENTATION'].includes(m.implementation_state))fail('INVALID_ARK_METHOD');
  methodMap.set(m.method_id,m);
 }
 const readiness=validateReceipts(method_receipts,methodMap);
 const methodConsideration=[...methodMap.values()].sort(byId).map(m=>{
  const overlap=a.dimensions.filter(d=>m.dimensions.includes(d));
  const r=readiness.get(m.method_id)??{input_state:'UNKNOWN',negative_control_state:'UNKNOWN',falsifier_state:'UNKNOWN',estimated_cost_units:100};
  const decision=!overlap.length?'DORMANT_NO_TYPED_TRIGGER':
    !sourceBound?'BLOCKED_MISSING_NATIVE_SOURCE':
    r.input_state==='MISSING'?'BLOCKED_REQUIRED_INPUTS':
    r.input_state==='UNKNOWN'?'NEEDS_INPUT_SCHEMA_REVIEW':'STRUCTURAL_METHOD_CANDIDATE';
  return {method_id:m.method_id,method_name:m.method_name,family:m.family,implementation_state:m.implementation_state,
    trigger_dimensions:overlap,input_state:r.input_state,negative_control_state:r.negative_control_state,
    falsifier_state:r.falsifier_state,estimated_cost_units:r.estimated_cost_units,
    decision,source_authentication:false,execution_performed:false};
 });
 const eligible=methodConsideration.filter(x=>x.decision==='STRUCTURAL_METHOD_CANDIDATE');
 const allTriggered=methodConsideration.filter(x=>x.trigger_dimensions.length>0);
 // A ready falsifier and a valid negative control outrank extra nominal "coverage".
 // Ranking is deterministic and explicit, not trained/subjective success probability.
 const order=(x,y)=>{
  const evidence=x=>Number(x.negative_control_state==='AVAILABLE')+Number(x.falsifier_state==='AVAILABLE');
  return evidence(y)-evidence(x)||
   y.trigger_dimensions.length-x.trigger_dimensions.length||
   x.estimated_cost_units-y.estimated_cost_units||
   x.method_id.localeCompare(y.method_id);
 };
 const pool=[...eligible].sort(order);
 const chosen=[],covered=new Set();
 while(chosen.length<max_selected&&pool.length){
  // First favor uncovered declared dimensions; then prefer stronger controls.
  pool.sort((x,y)=>{
   const un=x=>x.trigger_dimensions.filter(d=>!covered.has(d)).length;
   return un(y)-un(x)||order(x,y);
  });
  const item=pool.shift();
  if(item.trigger_dimensions.every(d=>covered.has(d))&&chosen.length)break;
  chosen.push({...item,route_state:'SELECTED_FOR_EVIDENCE_REVIEW'});
  item.trigger_dimensions.forEach(d=>covered.add(d));
 }
 const selectedIDs=new Set(chosen.map(x=>x.method_id));
 const relationMap=new Map();
 for(const e of relations){
  if(!e||typeof e!=='object'||!METHOD.test(e.method_id)||!METHOD.test(e.related_method_id)||!RELATION.has(e.relation_type)||
   !methodMap.has(e.method_id)||!methodMap.has(e.related_method_id))fail('INVALID_METHOD_RELATION');
  const v=relationMap.get(e.method_id)??[];v.push(e);relationMap.set(e.method_id,v);
 }
 const pairs=[],pairedIDs=new Set();
 const rankRelation={CHALLENGE:0,CROSS_CHECK:1,COMPLEMENT:2};
 for(const method of chosen){
  if(pairs.length>=max_pairs)break;
  const links=(relationMap.get(method.method_id)??[])
   .filter(e=>e.related_method_id!==method.method_id&&!pairedIDs.has(e.related_method_id))
   .sort((x,y)=>rankRelation[x.relation_type]-rankRelation[y.relation_type]||x.related_method_id.localeCompare(y.related_method_id));
  if(!links.length)continue;
  const best=links[0],counter=methodConsideration.find(x=>x.method_id===best.related_method_id);
  pairs.push({primary_method_id:method.method_id,challenger_method_id:best.related_method_id,
   relation_type:best.relation_type,challenger_readiness:counter.decision,
   native_evidence_independence:'NOT_ESTABLISHED',challenger_executed:false,
   reason:'DECLARED_METHOD_RELATION_REQUIRES_INDEPENDENT_SOURCE_AND_FALSIFIER_CHECK'});
  pairedIDs.add(best.related_method_id);
 }
 const summary={
  catalog_methods_considered:methodConsideration.length,
  structurally_triggered:allTriggered.length,
  structurally_eligible:eligible.length,
  blocked_or_unready:allTriggered.filter(x=>x.decision!=='STRUCTURAL_METHOD_CANDIDATE').length,
  selected_count:chosen.length,paired_challengers:pairs.length,
  covered_dimensions:sorted(covered),
  unresolved_dimensions:a.dimensions.filter(d=>!covered.has(d)),
  negative_controls_declared_ready:chosen.filter(x=>x.negative_control_state==='AVAILABLE').length,
  falsifiers_declared_ready:chosen.filter(x=>x.falsifier_state==='AVAILABLE').length,
  declared_total_cost_units:chosen.reduce((n,x)=>n+x.estimated_cost_units,0)
 };
 return {version:arkReasoningContract.version,status:!sourceBound?'BLOCKED_NATIVE_SOURCE':
  !eligible.length?'BLOCKED_NO_READY_METHOD':'EVIDENCE_REVIEW_PLAN_ONLY',
  atom:a,reasoning_layers:LAYERS.map(layer=>({...layer,state:layer.layer<=5?'STRUCTURALLY_ACCOUNTED':'NOT_EXECUTED'})),
  selection_policy:'LEXICOGRAPHIC_UNCOVERED_DIMENSIONS_THEN_NEGATIVE_FALSIFIER_THEN_COST',
  method_consideration:methodConsideration,selected_methods:chosen,
  proposed_pairs:pairs,deferred_methods:methodConsideration.filter(x=>!selectedIDs.has(x.method_id)),
  outcome_vector:summary,
  no_method_executed:true,no_source_authentication:true,independent_evidence_proven:false,
  authorization_conferred:false,target_actions_performed:false,
  no_global_optimum_claim:true,canonical_promotion:false,
  next_action:!sourceBound?'Resolve exact owned native source records before any method promotion.':
    !eligible.length?'Supply exact method schemas/inputs and negative controls before comparison.':
    'Use separate, authorized supplied-model evaluators on selected methods; falsify alternatives and preserve native evidence receipts.'};
}
