// Supplied-record-only claim contradiction and goal-hypothesis review.
// This is NOT a polygraph, human deception classifier, criminal attribution,
// legal intent determination, or automated assertion of wrongdoing.
const ID=/^[A-Za-z0-9_:.\-]{1,200}$/u;
const CLAIM_KIND=new Set(['EVENT','AUTHORITY','STATE','OUTCOME','INTENT','BENIGN_EXPLANATION']);
const POLARITY=new Set(['SUPPORT','CONTRADICT','UNKNOWN']);
const EPISTEMIC=new Set(['OBSERVED','DERIVED','INFERRED','UNKNOWN','SYNTHETIC']);
const OP=new Set(['REMOVE','MASK_UNKNOWN','FLIP_POLARITY']);
const GOAL_SIGN=new Set(['INTENT_PLUS','INTENT_MINUS','BENIGN_ALTERNATIVE']);
const err=s=>{throw Error(s)};
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const checkID=(v,label)=>{if(typeof v!=='string'||!ID.test(v))err('INVALID_'+label);return v};
function finite(xs,min,max,label){if(!Array.isArray(xs)||xs.length<min||xs.length>max)err('INVALID_'+label);return xs}
function distinct(xs,label){if(new Set(xs).size!==xs.length)err('DUPLICATE_'+label)}
function refs(xs,label,min=0){finite(xs,min,8,label);xs.forEach(x=>checkID(x,label+'_ID'));distinct(xs,label);return xs}
function only(obj,fields,label){if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!fields.includes(k)))err('INVALID_'+label+'_FIELDS')}
function claimStates(claims,observations){
 return claims.map(c=>{
  const obs=observations.filter(o=>o.claim_id===c.id);
  // A source reference is a caller assertion and never authenticates a claim.
  const admitted=obs.filter(o=>o.source_refs.length>0&&['OBSERVED','DERIVED'].includes(o.epistemic_state));
  const support=admitted.filter(o=>o.polarity==='SUPPORT').map(o=>o.id).sort();
  const contradiction=admitted.filter(o=>o.polarity==='CONTRADICT').map(o=>o.id).sort();
  const status=support.length&&contradiction.length?'CONFLICTING_SUPPLIED_RECORDS':
    support.length?'SUPPORTED_BY_SUPPLIED_RECORDS':
    contradiction.length?'CONTRADICTED_BY_SUPPLIED_RECORDS':'UNRESOLVED';
  return {
   claim_id:c.id,kind:c.kind,statement:c.statement,status,
   support_observation_ids:support,contradiction_observation_ids:contradiction,
   unadmitted_observation_ids:obs.filter(o=>!admitted.includes(o)).map(o=>o.id).sort(),
   source_authenticated:false,factual_truth_established:false
  };
 });
}
function variantRows(observations,spec){
 return observations.filter(o=>spec.operator!=='REMOVE'||o.id!==spec.observation_id).map(o=>{
  if(o.id!==spec.observation_id)return o;
  return spec.operator==='MASK_UNKNOWN'?{...o,polarity:'UNKNOWN',epistemic_state:'UNKNOWN'}:
   spec.operator==='FLIP_POLARITY'?{...o,polarity:o.polarity==='SUPPORT'?'CONTRADICT':o.polarity==='CONTRADICT'?'SUPPORT':'UNKNOWN'}:o;
 });
}
export function reviewEvidenceIntent(input){
 only(input,['subject_id','claims','observations','goals','variations'],'REVIEW');
 checkID(input.subject_id,'SUBJECT');
 const claims=finite(input.claims,1,12,'CLAIMS');
 const observations=finite(input.observations,0,32,'OBSERVATIONS');
 const goals=finite(input.goals??[],0,8,'GOALS');
 const variations=finite(input.variations??[],0,8,'VARIATIONS');
 claims.forEach(c=>{
  only(c,['id','kind','statement','source_refs'],'CLAIM');
  checkID(c.id,'CLAIM_ID');
  if(!CLAIM_KIND.has(c.kind)||typeof c.statement!=='string'||!c.statement.trim()||c.statement.length>2000)err('INVALID_CLAIM');
  refs(c.source_refs,'CLAIM_REFS');
 });
 distinct(claims.map(c=>c.id),'CLAIM_IDS');
 const claimMap=new Map(claims.map(c=>[c.id,c]));
 observations.forEach(o=>{
  only(o,['id','claim_id','polarity','epistemic_state','source_refs','source_owner'],'OBSERVATION');
  checkID(o.id,'OBSERVATION_ID');checkID(o.claim_id,'CLAIM_REFERENCE');
  if(!claimMap.has(o.claim_id))err('UNRESOLVED_CLAIM');
  if(!POLARITY.has(o.polarity)||!EPISTEMIC.has(o.epistemic_state))err('INVALID_OBSERVATION_STATE');
  refs(o.source_refs,'OBSERVATION_REFS');
  checkID(o.source_owner,'SOURCE_OWNER');
 });
 distinct(observations.map(o=>o.id),'OBSERVATION_IDS');
 const obsMap=new Map(observations.map(o=>[o.id,o]));
 goals.forEach(g=>{
  only(g,['id','description','sign','claim_ids','required_observation_ids'],'GOAL');
  checkID(g.id,'GOAL_ID');
  if(!GOAL_SIGN.has(g.sign)||typeof g.description!=='string'||!g.description.trim()||g.description.length>2000)err('INVALID_GOAL');
  finite(g.claim_ids,1,12,'GOAL_CLAIMS').forEach(id=>{checkID(id,'GOAL_CLAIM_ID');if(!claimMap.has(id))err('GOAL_CLAIM_UNRESOLVED')});
  distinct(g.claim_ids,'GOAL_CLAIMS');
  finite(g.required_observation_ids??[],0,16,'GOAL_OBSERVATIONS').forEach(id=>{checkID(id,'GOAL_OBSERVATION_ID');if(!obsMap.has(id))err('GOAL_OBSERVATION_UNRESOLVED')});
 });
 distinct(goals.map(g=>g.id),'GOAL_IDS');
 variations.forEach(v=>{
  only(v,['id','operator','observation_id'],'VARIATION');
  checkID(v.id,'VARIATION_ID');
  if(!OP.has(v.operator)||!obsMap.has(v.observation_id))err('INVALID_VARIATION');
 });
 distinct(variations.map(v=>v.id),'VARIATION_IDS');
 const baseline=claimStates(claims,observations);
 const byClaim=new Map(baseline.map(x=>[x.claim_id,x]));
 const goal_review=goals.map(g=>{
  const checked=g.claim_ids.map(id=>byClaim.get(id));
  const requirements=g.required_observation_ids??[];
  const admitted=observations.filter(o=>o.source_refs.length>0&&['OBSERVED','DERIVED'].includes(o.epistemic_state));
  const observedSet=new Set(admitted.map(o=>o.id));
  return {
   goal_id:g.id,sign:g.sign,description:g.description,
   claim_ids:g.claim_ids,
   required_observation_ids:requirements,
   missing_required_observation_ids:requirements.filter(id=>!observedSet.has(id)),
   compatible_with_supplied_claims:checked.every(x=>x.status==='SUPPORTED_BY_SUPPLIED_RECORDS'),
   challenged_by_supplied_claims:checked.some(x=>['CONTRADICTED_BY_SUPPLIED_RECORDS','CONFLICTING_SUPPLIED_RECORDS'].includes(x.status)),
   state:'GOAL_HYPOTHESIS_ONLY_NOT_INTENT_PROOF',
   fact_or_intent_determined:false
  };
 });
 const variations_review=variations.map(v=>{
  const changed=claimStates(claims,variantRows(observations,v));
  return {variation_id:v.id,operator:v.operator,observation_id:v.observation_id,
   changes:changed.flatMap((r,i)=>r.status===baseline[i].status?[]:[{claim_id:r.claim_id,before:baseline[i].status,after:r.status}]),
   state:'SYNTHETIC_COUNTERFACTUAL_NOT_REAL_WORLD_CHANGE',source_authentication:false};
 });
 return {
  version:'MPC_EVIDENCE_INTENT_REVIEW_1.0',status:'SUPPLIED_CLAIM_MATRIX_COMPLETED',
  subject_id:input.subject_id,claim_review:baseline,goal_review,variations_review,
  intention_inferred:false,deception_determined:false,criminal_activity_determined:false,
  attribution_established:false,source_authentication:false,
  independent_evidence_established:false,external_action_authorized:false,
  next_action:'Independently authenticate native sources, compare alternative goal explanations and review adversarial falsifiers before any claim promotion.'
 };
}
