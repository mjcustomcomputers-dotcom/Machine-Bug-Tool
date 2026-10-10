// MPC V26 — finite methods for time, contradictory evidence, authenticity,
// minimal distinguishing questions, capability policies and adverse selection.
// No target traffic, execution sandbox, account identity proof or legal promotion.
import {createHash,createPublicKey,verify as cryptographicVerify} from 'node:crypto';
const ID=/^[A-Za-z0-9][A-Za-z0-9_:./@-]{0,95}$/u;
const SHA=/^[a-f0-9]{40}$/u;
const TOKEN=/^[A-Z][A-Z0-9_]{1,63}$/u;
const fail=s=>{throw Error(s)};
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const record=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const keys=(o,allow,label)=>{if(!record(o)||Object.keys(o).some(x=>!allow.includes(x)))fail('INVALID_'+label+'_FIELDS')};
const goodId=s=>typeof s==='string'&&ID.test(s);
const checkList=(a,max,name,check=goodId)=>{if(!dense(a)||a.length>max||new Set(a).size!==a.length||a.some(x=>!check(x)))fail('INVALID_'+name);return a};
const sort=xs=>[...new Set(xs)].sort();
const clone=x=>JSON.parse(JSON.stringify(x));
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const context=input=>{
 if(!record(input)||!SHA.test(input.source_commit||'')||
    !goodId(input.scope_id)||!goodId(input.subject_id))fail('INVALID_V26_CONTEXT');
 return {source_commit:input.source_commit,scope_id:input.scope_id,subject_id:input.subject_id};
};
const boundedInt=(x,max)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
export const v26PrimitiveContract=Object.freeze({
 version:'MPC_V26_TYPED_META_PRIMITIVES_1',native_evaluators_added:0,
 vector_components_cap:12,minimum_questions_cap:12,
 sandbox_capabilities_cap:16,signature_payload_cap:8192,
 authentication_of_source:false,real_sandbox_enforced:false,
 actual_business_predictions:false,remote_actions:false,canonical_promotion:false
});
// Four truth/information states encode independent evidence directions as bits.
const evidenceBits={NEITHER:0,SUPPORT:1,REFUTE:2,BOTH:3};
const bitName=['NEITHER','SUPPORT','REFUTE','BOTH'];
const checkedState=s=>{if(!Object.hasOwn(evidenceBits,s))fail('UNKNOWN_EVIDENCE_STATE');return evidenceBits[s]};
export const knowledgeJoinV26=(a,b)=>bitName[checkedState(a)|checkedState(b)];
export const evidenceNegationV26=a=>bitName[((checkedState(a)&1)<<1)|((checkedState(a)&2)>>1)];
export function reviewFourValuedEvidenceV26(input){
 const ctx=context(input);
 keys(input,['source_commit','scope_id','subject_id','world','assertions'],'EVIDENCE_REQUEST');
 if(!['RECORD','SYNTHETIC'].includes(input.world)||!dense(input.assertions)||
    !input.assertions.length||input.assertions.length>64)fail('INVALID_EVIDENCE_ASSERTIONS');
 const seen=new Set(),facts=new Map();
 for(const a of input.assertions){
  keys(a,['id','proposition','polarity','epistemic_state','source_ref','source_owner','source_version'],'EVIDENCE_ASSERTION');
  if(!goodId(a.id)||seen.has(a.id)||!TOKEN.test(a.proposition||'')||
    !['SUPPORT','REFUTE','UNKNOWN'].includes(a.polarity)||
    !['OBSERVED','SYNTHETIC','CLAIMED','UNKNOWN'].includes(a.epistemic_state)||
    !goodId(a.source_ref)||!goodId(a.source_owner)||!goodId(a.source_version))fail('INVALID_EVIDENCE_ATOM');
  if(input.world==='SYNTHETIC'&&!['SYNTHETIC','UNKNOWN'].includes(a.epistemic_state)||
     input.world==='RECORD'&&a.epistemic_state==='SYNTHETIC')fail('MIXED_EVIDENCE_WORLD');
  seen.add(a.id);
  const acc=facts.get(a.proposition)||[];acc.push(a);facts.set(a.proposition,acc);
 }
 const results=[];
 for(const [prop,atoms] of [...facts].sort((a,b)=>a[0].localeCompare(b[0]))){
  const supp=atoms.filter(a=>a.polarity==='SUPPORT'&&['OBSERVED','SYNTHETIC'].includes(a.epistemic_state));
  const ref=atoms.filter(a=>a.polarity==='REFUTE'&&['OBSERVED','SYNTHETIC'].includes(a.epistemic_state));
  const state=bitName[(supp.length?1:0)|(ref.length?2:0)];
  const supporters=sort(supp.map(x=>x.source_ref)),refuters=sort(ref.map(x=>x.source_ref));
  results.push({proposition:prop,knowledge_state:state,
    supporting_atom_ids:supp.map(x=>x.id).sort(),refuting_atom_ids:ref.map(x=>x.id).sort(),
    ignored_as_unverified:atoms.filter(a=>!['OBSERVED','SYNTHETIC'].includes(a.epistemic_state)||
      a.polarity==='UNKNOWN').map(x=>x.id).sort(),
    distinct_support_sources:supporters,distinct_refute_sources:refuters,
    shared_source_contradiction:supporters.some(x=>refuters.includes(x)),
    truth_authentication:false,independent_evidence_proven:false});
 }
 return {version:v26PrimitiveContract.version,...ctx,world:input.world,
  evidence:results,contested_count:results.filter(x=>x.knowledge_state==='BOTH').length,
  evidence_authenticated:false,causation_proven:false,canonical_promotion:false};
}
function checkClock(ev,ctx){
 keys(ev,['id','source_ref','clock_domain','vector','wall_min_ms','wall_max_ms'],'CLOCK_EVENT');
 if(!goodId(ev.id)||!goodId(ev.source_ref)||!goodId(ev.clock_domain)||!record(ev.vector)||
    !boundedInt(ev.wall_min_ms,Number.MAX_SAFE_INTEGER)||
    !boundedInt(ev.wall_max_ms,Number.MAX_SAFE_INTEGER)||
    ev.wall_min_ms>ev.wall_max_ms)fail('INVALID_CLOCK_EVENT');
 const keys0=Object.keys(ev.vector);
 if(!keys0.length||keys0.length>12||keys0.some(x=>!goodId(x)||!boundedInt(ev.vector[x],1000000000)))
  fail('INVALID_VECTOR_COMPONENTS');
 return {...ev,vector_keys:keys0.sort()};
}
export function compareVectorClockIntervalsV26(input){
 const ctx=context(input);
 keys(input,['source_commit','scope_id','subject_id','left','right'],'CLOCK_REQUEST');
 const a=checkClock(input.left,ctx),b=checkClock(input.right,ctx);
 if(a.id===b.id)fail('CLOCK_EVENTS_MUST_BE_DISTINCT');
 if(JSON.stringify(a.vector_keys)!==JSON.stringify(b.vector_keys))fail('INCOMPARABLE_VECTOR_DIMENSIONS');
 const before=x=>a.vector_keys.every(k=>a.vector[k]<=b.vector[k])&&
  a.vector_keys.some(k=>a.vector[k]<b.vector[k]);
 const after=x=>a.vector_keys.every(k=>a.vector[k]>=b.vector[k])&&
  a.vector_keys.some(k=>a.vector[k]>b.vector[k]);
 const vector_relation=before()?'LEFT_BEFORE_RIGHT':after()?'RIGHT_BEFORE_LEFT':
  a.vector_keys.every(k=>a.vector[k]===b.vector[k])?'IDENTICAL_VECTOR_NOT_SAME_EVENT':'VECTOR_INCOMPARABLE';
 const comparable=a.clock_domain===b.clock_domain;
 const wall_relation=!comparable?'CLOCK_ALIGNMENT_REQUIRED':
  a.wall_max_ms<b.wall_min_ms?'LEFT_BEFORE_RIGHT':
  b.wall_max_ms<a.wall_min_ms?'RIGHT_BEFORE_LEFT':'WALL_INTERVALS_OVERLAP';
 const contradiction=(vector_relation==='LEFT_BEFORE_RIGHT'&&wall_relation==='RIGHT_BEFORE_LEFT')||
  (vector_relation==='RIGHT_BEFORE_LEFT'&&wall_relation==='LEFT_BEFORE_RIGHT');
 return {version:v26PrimitiveContract.version,...ctx,events:[a.id,b.id],
  source_refs:[a.source_ref,b.source_ref],vector_relation,wall_relation,
  state:contradiction?'DECLARED_CAUSAL_CLOCK_CONTRADICTION_REVIEW':
    comparable?'FINITE_CLOCK_COMPARISON_NOT_CAUSAL_AUTHENTICATION':'CLOCK_DOMAIN_RECONCILIATION_REQUIRED',
  comparability:comparable,contradictory_order:contradiction,
  event_identity_proven:false,actual_causal_complete:false,clock_authenticated:false,
  canonical_promotion:false};
}
const SPKI_PREFIX=Buffer.from('302a300506032b6570032100','hex');
export function verifyEd25519BytesV26(input){
 const ctx=context(input);
 keys(input,['source_commit','scope_id','subject_id','message_base64','public_key_hex',
  'signature_hex','key_owner_ref','message_source_ref','signature_source_ref'],'ED25519_REQUEST');
 if(!/^[a-f0-9]{64}$/u.test(input.public_key_hex||'')||
    !/^[a-f0-9]{128}$/u.test(input.signature_hex||'')||
    !goodId(input.key_owner_ref)||!goodId(input.message_source_ref)||
    !goodId(input.signature_source_ref)||typeof input.message_base64!=='string'||
    input.message_base64.length>10924||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(input.message_base64))
  fail('INVALID_SIGNATURE_INPUT');
 const bytes=Buffer.from(input.message_base64,'base64');
 if(bytes.length>8192||bytes.toString('base64')!==input.message_base64)fail('NONCANONICAL_OR_OVERSIZED_SIGNED_BYTES');
 let valid=false;
 try{
  const pk=createPublicKey({key:Buffer.concat([SPKI_PREFIX,Buffer.from(input.public_key_hex,'hex')]),
   format:'der',type:'spki'});
  valid=cryptographicVerify(null,bytes,pk,Buffer.from(input.signature_hex,'hex'));
 }catch{valid=false}
 return {version:v26PrimitiveContract.version,...ctx,bytes_checked:bytes.length,
  public_key_fingerprint_sha256:createHash('sha256').update(Buffer.from(input.public_key_hex,'hex')).digest('hex'),
  key_owner_ref:input.key_owner_ref,source_refs:[input.message_source_ref,input.signature_source_ref],
  state:valid?'ED25519_SIGNATURE_MATHEMATICALLY_VALID':'ED25519_SIGNATURE_INVALID',
  cryptographic_signature_check_performed:true,public_key_owner_authenticated:false,
  freshness_or_nonce_checked:false,authorization_proven:false,
  legal_document_authenticity_proven:false,canonical_promotion:false};
}
export function reviewDeclaredCapabilitySandboxV26(input){
 const ctx=context(input);
 keys(input,['source_commit','scope_id','subject_id','parent_allowed',
  'child_requested','needed_for_method','revoked'],'CAPABILITY_REQUEST');
 for(const k of ['parent_allowed','child_requested','needed_for_method','revoked'])
  checkList(input[k],16,'CAPABILITY_'+k.toUpperCase(),x=>TOKEN.test(x));
 const parents=new Set(input.parent_allowed),child=new Set(input.child_requested),
  revoked=new Set(input.revoked);
 const attemptedEscalation=input.child_requested.filter(x=>!parents.has(x)).sort();
 const effective=input.child_requested.filter(x=>parents.has(x)&&!revoked.has(x)).sort();
 const missing=input.needed_for_method.filter(x=>!effective.includes(x)).sort();
 return {version:v26PrimitiveContract.version,...ctx,
  proposed_effective_capabilities:effective,disallowed_requested_capabilities:attemptedEscalation,
  explicitly_revoked_capabilities:input.revoked.slice().sort(),
  missing_required_capabilities:missing,
  state:attemptedEscalation.length?'DECLARED_CHILD_ESCALATION_REJECTED':
    missing.length?'DECLARED_METHOD_CAPABILITY_BLOCKED':'POLICY_MODEL_PERMITS_REVIEW_ONLY',
  sandbox_enforcement_performed:false,no_shell_execution:true,
  native_os_capability_state_unknown:true,credentials_exposed:false,
  authority_to_act_proven:false,canonical_promotion:false};
}
// Enumerate exact lowest-cardinality QUESTION SET separating every pair of
// hypotheses with different declared YES/NO predictions. Not a Bayesian model.
export function planMinimalDistinguishingQuestionsV26(input){
 const ctx=context(input);
 keys(input,['source_commit','scope_id','subject_id','questions','hypotheses','max_questions'],'DISTINGUISH_REQUEST');
 if(!dense(input.questions)||!input.questions.length||input.questions.length>12||
    !dense(input.hypotheses)||input.hypotheses.length<2||input.hypotheses.length>8||
    !Number.isInteger(input.max_questions)||input.max_questions<1||input.max_questions>12)
  fail('DISTINGUISHING_BUDGET');
 const qids=new Set(),hids=new Set();
 for(const q of input.questions){
  keys(q,['id','cost','source_ref'],'DISTINGUISH_QUESTION');
  if(!TOKEN.test(q.id||'')||qids.has(q.id)||!boundedInt(q.cost,1000)||
     q.cost===0||!goodId(q.source_ref))fail('INVALID_DISTINGUISHING_QUESTION');
  qids.add(q.id);
 }
 const preds=new Map();
 for(const h of input.hypotheses){
  keys(h,['id','predictions'],'DISTINGUISH_HYPOTHESIS');
  if(!goodId(h.id)||hids.has(h.id)||!record(h.predictions)||
    Object.keys(h.predictions).length!==qids.size||
    [...qids].some(q=>!['YES','NO','UNKNOWN'].includes(h.predictions[q]))||
    Object.keys(h.predictions).some(k=>!qids.has(k)))fail('INVALID_HYPOTHESIS_PREDICTIONS');
  hids.add(h.id);preds.set(h.id,h.predictions);
 }
 const hy=[...hids].sort(),pairs=[],unresolved=[];
 for(let i=0;i<hy.length;i++)for(let j=i+1;j<hy.length;j++){
  const q=input.questions.filter(x=>preds.get(hy[i])[x.id]!=='UNKNOWN'&&
    preds.get(hy[j])[x.id]!=='UNKNOWN'&&
    preds.get(hy[i])[x.id]!==preds.get(hy[j])[x.id]).map(x=>x.id);
  const p={left:hy[i],right:hy[j],distinguishers:q};
  pairs.push(p);if(!q.length)unresolved.push([hy[i],hy[j]]);
 }
 let best=null;
 const questions=input.questions.slice().sort((a,b)=>a.id.localeCompare(b.id));
 for(let mask=1;mask<(1<<questions.length);mask++){
  const picked=questions.filter((x,i)=>mask&(1<<i));
  if(picked.length>input.max_questions||(best&&picked.length>best.questions.length))continue;
  if(pairs.some(pair=>!pair.distinguishers.some(q=>picked.some(x=>x.id===q))))continue;
  const cost=picked.reduce((sum,q)=>sum+q.cost,0);
  const key=picked.map(x=>x.id).join('|');
  if(!best||picked.length<best.questions.length||
   picked.length===best.questions.length&&(cost<best.total_cost||
    cost===best.total_cost&&key<best.key))best={questions:picked,total_cost:cost,key};
 }
 return {version:v26PrimitiveContract.version,...ctx,
  hypotheses:hy,questions_considered:questions.length,hypothesis_pairs:pairs.length,
  unresolved_hypothesis_pairs:unresolved,
  selected_question_ids:best?.questions.map(x=>x.id)||[],
  selected_cost:best?.total_cost??null,
  selected_source_refs:best?best.questions.map(x=>x.source_ref):[],
  state:unresolved.length?'UNDISTINGUISHABLE_HYPOTHESES_REQUIRE_NEW_QUESTIONS':
   best?'MINIMUM_CARDINALITY_DECLARED_QUESTION_COVER':'QUESTION_BUDGET_INSUFFICIENT',
  exhaustive_candidate_subsets:(1<<questions.length)-1,
  questions_asked:0,evidence_acquired:0,probabilities_inferred:false,
  actual_hypothesis_truth_determined:false,source_authenticated:false,
  canonical_promotion:false};
}
// Restrictive one-way-exit toy illustration of Akerlof quality uncertainty.
// This deliberately does NOT estimate real demand, welfare or seller behavior.
export function simulateFiniteLemonsScreenV26(input){
 const ctx=context(input);
 keys(input,['source_commit','scope_id','subject_id','tiers','buyer_value_multiplier'],'LEMONS_REQUEST');
 if(!dense(input.tiers)||input.tiers.length<2||input.tiers.length>8||
   typeof input.buyer_value_multiplier!=='number'||!Number.isFinite(input.buyer_value_multiplier)||
   input.buyer_value_multiplier<=0||input.buyer_value_multiplier>3)fail('INVALID_LEMONS_MODEL');
 const seen=new Set();
 for(const x of input.tiers){
  keys(x,['id','quality','reservation_price','quantity'],'LEMONS_TIER');
  if(!goodId(x.id)||seen.has(x.id)||
    !boundedInt(x.quality,100)||!boundedInt(x.reservation_price,1000)||
    !Number.isInteger(x.quantity)||x.quantity<1||x.quantity>100)fail('INVALID_LEMONS_TIER');
  seen.add(x.id);
 }
 let active=input.tiers.slice(),iterations=[];
 for(let i=0;i<=input.tiers.length;i++){
  const total=active.reduce((s,t)=>s+t.quantity,0);
  const average=total?active.reduce((s,t)=>s+t.quality*t.quantity,0)/total:0;
  const offer=average*input.buyer_value_multiplier;
  const staying=active.filter(t=>t.reservation_price<=offer+1e-10);
  iterations.push({step:i,active_tier_ids:active.map(x=>x.id).sort(),
    buyer_model_price:offer,declared_average_quality:average});
  if(staying.length===active.length)break;
  active=staying;
 }
 return {version:v26PrimitiveContract.version,...ctx,
  mechanism:'SIMPLIFIED_NO_REENTRY_QUALITY_POOL_NOT_ECONOMETRIC_FIT',
  steps:iterations,final_active_tier_ids:active.map(x=>x.id).sort(),
  excluded_tier_ids:input.tiers.filter(t=>!active.includes(t)).map(x=>x.id).sort(),
  market_equilibrium_verified:false,consumer_intent_inferred:false,
  price_forecast_proven:false,quality_authenticated:false,
  ethical_screening_or_sales_action_performed:false,canonical_promotion:false};
}
