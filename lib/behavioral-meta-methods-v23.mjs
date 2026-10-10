// MPC V23 — local-only behavioral, sales and nudge method-of-method reviews.
// Original MHA/MHC/BL registries, hosted evaluators and runtime unchanged.
// No NLP psychographic inference, autonomous persuasion, causal effect estimate or target traffic.
import {createHash} from 'node:crypto';
import frontier from '../research/behavioral-meta-method-frontier-v23.json' with {type:'json'};
import {planMethodInteractionCoverage,auditMethodInteractionCoverage} from './method-synergy-v22.mjs';

const fail = message => {throw Error(message)};
const ID=/^[A-Za-z][A-Za-z0-9:._/@-]{0,119}$/u;
const TYPE=/^[A-Z][A-Z0-9_]{0,63}$/u;
const COMMIT=/^[a-f0-9]{40}$/u;
const STATES=new Set(['OBSERVED','CLAIMED','CONTRADICTED','UNKNOWN','SYNTHETIC']);
const ALLOWED_ATOM=['id','scope_id','subject_id','dimension','state','source_ref','source_owner','source_version'];
const ALLOWED_SAFEGUARDS=['consent','purpose','truthful_disclosure','decline_path','sensitive_targeting','covert_targeting'];
const valid=(s,max=120)=>typeof s==='string'&&s.length>0&&s.length<=max&&ID.test(s);
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const sha=o=>createHash('sha256').update(JSON.stringify(o),'utf8').digest('hex');
const ownOnly=(o,keys,label)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k)))fail('INVALID_'+label)};
const unique=a=>[...new Set(a)];
const cmp=(a,b)=>a.localeCompare(b,'en');
const sortedUnique=a=>unique(a).sort(cmp);
const methods=frontier.methods;
const producedTypes=new Set(methods.flatMap(h=>h.produces));
if(frontier.identity_class!=='NONCANONICAL_RESEARCH_OVERLAY'||frontier.canonical_promotion!==false||
  !dense(methods)||methods.length!==16||new Set(methods.map(h=>h.id)).size!==16||
  methods.some(h=>!/^RH-V23-[0-9]{2}$/u.test(h.id)||!dense(h.requires)||!dense(h.produces)||
    h.requires.length===0||h.produces.length===0||
    [...h.requires,...h.produces].some(x=>!TYPE.test(x))||
    !dense(h.source_urls)||!h.source_urls.length||h.source_urls.some(url=>!/^https:\/\//u.test(url))))
  fail('INVALID_V23_RESEARCH_FRONTIER');

export const behavioralMetaContract=Object.freeze({
 version:frontier.version, hook_count:16, max_atoms:64,max_method_pairs:240,max_choice_steps:20,
 native_evaluators_added:0, existing_method_atlas_modified:false, private_source_authenticated:false,
 invented_psychological_attributes:false, method_execution:false, target_actions:false,
 live_experiment_execution:false, sales_conversion_effect_claim:false, legal_violation_determination:false,
 canonical_promotion:false
});
const context=input=>{
 if(!input||typeof input!=='object'||Array.isArray(input)||
    !COMMIT.test(input.source_commit||'')||!valid(input.scope_id)||!valid(input.subject_id))
   fail('INVALID_BEHAVIORAL_SOURCE_CONTEXT');
 return {source_commit:input.source_commit,scope_id:input.scope_id,subject_id:input.subject_id};
};
function scanAtoms(input){
 const ctx=context(input);
 if(!['SYNTHETIC','RECORD'].includes(input.world))fail('INVALID_WORLD');
 if(!dense(input.atoms)||input.atoms.length>behavioralMetaContract.max_atoms)fail('INVALID_ATOM_BATCH');
 const seen=new Set(), index=new Map();
 for(const atom of input.atoms){
  ownOnly(atom,ALLOWED_ATOM,'ATOM_FIELDS');
  if(!valid(atom.id)||seen.has(atom.id)||atom.scope_id!==ctx.scope_id||
     atom.subject_id!==ctx.subject_id||!TYPE.test(atom.dimension||'')||
     !STATES.has(atom.state)||!valid(atom.source_ref)||!valid(atom.source_owner,80)||
     !valid(atom.source_version,120))fail('INVALID_ATOM_PROVENANCE_OR_STATE');
  if(input.world==='SYNTHETIC'&&!['SYNTHETIC','UNKNOWN'].includes(atom.state))fail('SYNTHETIC_REAL_WORLD_MIX');
  if(input.world==='RECORD'&&atom.state==='SYNTHETIC')fail('SYNTHETIC_REAL_WORLD_MIX');
  seen.add(atom.id);
  const list=index.get(atom.dimension)||[];list.push(atom);index.set(atom.dimension,list);
 }
 const stateByDimension=new Map();
 for(const [dimension,atoms] of index){
  const ss=new Set(atoms.map(a=>a.state));
  const conflicting=ss.has('CONTRADICTED')&&
      (ss.has('OBSERVED')||ss.has('SYNTHETIC')||ss.has('CLAIMED'));
  const state=conflicting?'CONTESTED':
     ss.has('CONTRADICTED')?'CONTRADICTED':
     ss.has('OBSERVED')||ss.has('SYNTHETIC')?'SUPPLIED_AS_PRESENT':
     ss.has('CLAIMED')?'CLAIMED_UNVERIFIED':'UNKNOWN';
  stateByDimension.set(dimension,{state,source_refs:sortedUnique(atoms.map(a=>a.source_ref)),
   source_versions:sortedUnique(atoms.map(a=>a.source_version)),
   owners:sortedUnique(atoms.map(a=>a.source_owner)),
   atom_ids:sortedUnique(atoms.map(a=>a.id))});
 }
 return {ctx,stateByDimension,atoms:input.atoms};
}
function gate(input){
 if(!['AUDIT','INTERVENTION_DESIGN'].includes(input.intent))fail('INVALID_INTENT');
 if(input.intent==='AUDIT')return {state:'LOCAL_AUDIT_ONLY',reasons:[],human_review_required:true};
 ownOnly(input.safeguards??{},ALLOWED_SAFEGUARDS,'SAFEGUARDS');
 const s=input.safeguards??{}, reasons=[];
 if(s.consent!=='EXPLICIT')reasons.push('EXPLICIT_CONSENT_NOT_ESTABLISHED');
 if(!['USER_BENEFIT','MUTUAL_VALUE'].includes(s.purpose))reasons.push('NON_EXPLOITATIVE_PURPOSE_NOT_DECLARED');
 if(s.truthful_disclosure!==true)reasons.push('TRUTHFUL_DISCLOSURE_NOT_ESTABLISHED');
 if(s.decline_path!=='CLEAR')reasons.push('UNOBSTRUCTED_DECLINE_NOT_ESTABLISHED');
 if(s.sensitive_targeting!==false)reasons.push('SENSITIVE_TARGETING_NOT_EXCLUDED');
 if(s.covert_targeting!==false)reasons.push('COVERT_TARGETING_NOT_EXCLUDED');
 // Independent method-on-method check: the proposed choice interface can falsify
 // an operator's favorable safeguard declaration. Signals still require review.
 const choiceAudit=input.choice===undefined?null:auditChoiceArchitecture(input);
 if(choiceAudit?.flags.length)reasons.push('CHOICE_OBSERVATION_REQUIRES_ADVERSARIAL_REVIEW');
 return {state:reasons.length?'INTERVENTION_DESIGN_BLOCKED':'DESIGN_RESEARCH_REVIEW_ONLY',
  reasons,choice_review_flags:choiceAudit?.flags.map(x=>x.id)??[],
  human_review_required:true};
}
// Inspect only explicitly supplied typed observations. Never parse or infer
// people's motives, mental health, buying propensity or other traits from text.
export function reviewBehavioralAtoms(input){
 const {ctx,stateByDimension,atoms}=scanAtoms(input);
 const access=gate(input);
 const dimensions=[...stateByDimension].sort((a,b)=>cmp(a[0],b[0])).map(([dimension,info])=>({dimension,...info}));
 const recommendations=methods.map(method=>{
  const blocked=method.requires.filter(t=>!stateByDimension.has(t)||
   stateByDimension.get(t).state!=='SUPPLIED_AS_PRESENT').sort(cmp);
  const challenged=method.requires.filter(t=>stateByDimension.get(t)?.state==='CONTESTED').sort(cmp);
  const missingPrimary=blocked.filter(t=>!producedTypes.has(t));
  const missingDerived=blocked.filter(t=>producedTypes.has(t));
  return {id:method.id,name:method.name,family:method.family,phase:method.phase,
   requires:method.requires,proposes:method.produces,
   missing_or_unverified:blocked,missing_primary_records:missingPrimary,
   missing_method_outputs:missingDerived,contradictory_atoms:challenged,
   state:access.state==='INTERVENTION_DESIGN_BLOCKED'?'ETHICS_GATE_BLOCKED':
     missingPrimary.length?'EVIDENCE_ACQUISITION_REQUIRED':
     missingDerived.length?'METHOD_OUTPUT_REVIEW_REQUIRED':'RESEARCH_APPLICABLE_NOT_EXECUTED',
   research_sources:method.source_urls,adversarial_falsifier:method.falsifier,
   source_authentication:false,effect_established:false,execution:'NOT_EXECUTED'};
 });
 return {version:behavioralMetaContract.version,...ctx,world:input.world,
  input_fingerprint:sha({ctx,atoms,world:input.world,intent:input.intent,safeguards:input.safeguards??null}),
  atom_count:atoms.length,dimensions,method_count:methods.length,recommendations,
  applicable_research_hooks:recommendations.filter(x=>x.state==='RESEARCH_APPLICABLE_NOT_EXECUTED').length,
  safety_gate:access,source_identity:'CALLER_DECLARED_NOT_AUTHENTICATED',
  inferred_psychological_traits:0,source_authentication:false,method_executions:0,canonical_promotion:false};
}
// Metascience on methodology: rank the next SOURCE RECORD to acquire by exact
// one-variable structural unlock count, not by guessed impact or response rate.
export function planBehavioralEvidenceAcquisition(input){
 const {ctx,stateByDimension}=scanAtoms(input);
 const safety=gate(input);
 const present=new Set([...stateByDimension].filter(([,v])=>v.state==='SUPPLIED_AS_PRESENT').map(([k])=>k));
 const allRequired=sortedUnique(methods.flatMap(m=>m.requires));
 const needed=allRequired.filter(t=>!present.has(t)&&!producedTypes.has(t));
 const tasks=needed.map(type=>{
  const impacted=methods.filter(m=>m.requires.includes(type));
  const unlock=impacted.filter(m=>m.requires.every(t=>t===type||present.has(t)));
  const prior=stateByDimension.get(type)?.state||'NOT_SUPPLIED';
  return {input_type:type,observed_state:prior,
   custodian:'TO_BE_IDENTIFIED',source_locator:'NOT_ACQUIRED',
   impacted_hooks:impacted.map(m=>m.id).sort(cmp),
   one_atom_structural_unlocks:unlock.map(m=>m.id).sort(cmp),
   impacted_count:impacted.length,unlock_count:unlock.length,
   actual_expected_information_gain:'UNKNOWN_NO_PROBABILITIES',
   retrieval_performed:false};
 });
 tasks.sort((a,b)=>b.unlock_count-a.unlock_count||b.impacted_count-a.impacted_count||cmp(a.input_type,b.input_type));
 const methodOutputs=allRequired.filter(t=>producedTypes.has(t)&&!present.has(t));
 return {version:behavioralMetaContract.version,...ctx,world:input.world,
  safety_gate:safety,candidate_primary_records:tasks,unexecuted_method_output_types:methodOutputs,
  ranking_rule:'FINITE_ONE_ATOM_STRUCTURAL_UNLOCK_NOT_ESTIMATED_UTILITY',
  source_authentication:false,records_acquired:0,methods_executed:0,
  canonical_promotion:false};
}

// Compose output contracts, not evidence or actual behavioral interventions.
// A proposed intermediate output cannot be counted as a source-observed atom.
export function planBehavioralMethodInteractions(input){
 const {ctx,stateByDimension}=scanAtoms(input);
 const safety=gate(input);
 const edges=[];
 for(const a of methods)for(const b of methods){
  if(a.id===b.id)continue;
  const via=a.produces.filter(t=>b.requires.includes(t)).sort(cmp);
  if(!via.length)continue;
  const missingUp=a.requires.filter(t=>stateByDimension.get(t)?.state!=='SUPPLIED_AS_PRESENT').sort(cmp);
  const missingDown=b.requires.filter(t=>!via.includes(t)&&
     stateByDimension.get(t)?.state!=='SUPPLIED_AS_PRESENT').sort(cmp);
  const missingCombined=sortedUnique([...missingUp,...missingDown]);
  edges.push({from:a.id,to:b.id,via,missing_upstream:missingUp,missing_downstream:missingDown,
   missing_primary_records:missingCombined.filter(t=>!producedTypes.has(t)),
   missing_method_outputs:missingCombined.filter(t=>producedTypes.has(t)),
   state:safety.state==='INTERVENTION_DESIGN_BLOCKED'?'ETHICS_GATE_BLOCKED':
     missingUp.length||missingDown.length?'NEEDS_SOURCE_ACQUISITION':'RESEARCH_COMPOSITION_CANDIDATE',
   output_status:'HYPOTHETICAL_UNEXECUTED',shared_theory_sources:a.source_urls.filter(x=>b.source_urls.includes(x)),
   independent_evidence_proven:false,behavior_change_established:false});
 }
 edges.sort((x,y)=>cmp(x.from,y.from)||cmp(x.to,y.to));
 if(edges.length>behavioralMetaContract.max_method_pairs)fail('METHOD_PAIR_BUDGET');
 return {version:behavioralMetaContract.version,...ctx,world:input.world,
  considered_pairs:methods.length*(methods.length-1),linked_pairs:edges.length,
  candidate_pairs:edges.filter(e=>e.state==='RESEARCH_COMPOSITION_CANDIDATE').length,
  edges,safety_gate:safety,method_execution:'NOT_EXECUTED',source_authentication:false,canonical_promotion:false};
}
const choices=['accept_steps','decline_steps','consent_default','fee_disclosure',
 'scarcity_claim','exit_reversible','truth_claim','evidence_refs'];
// Inspect fields from a manually prepared interface observation; do not OCR
// or control a third-party UI, make legal findings, or rank manipulative variants.
export function auditChoiceArchitecture(input){
 const ctx=context(input);
 ownOnly(input.choice,choices,'CHOICE_FIELDS');
 const c=input.choice;
 if(!Number.isInteger(c.accept_steps)||c.accept_steps<0||c.accept_steps>20||
    !Number.isInteger(c.decline_steps)||c.decline_steps<0||c.decline_steps>20||
    !['ACTIVE_OPT_IN','PRESELECTED_ACCEPT','UNKNOWN'].includes(c.consent_default)||
    !['BEFORE_COMMIT','AFTER_COMMIT','UNKNOWN'].includes(c.fee_disclosure)||
    !['NONE','SOURCE_SUPPORTED','UNSUPPORTED','UNKNOWN'].includes(c.scarcity_claim)||
    ![true,false,null].includes(c.exit_reversible)||
    !['DOCUMENTED','UNVERIFIED','FALSE'].includes(c.truth_claim)||
    !dense(c.evidence_refs)||c.evidence_refs.length<1||c.evidence_refs.length>8||
    c.evidence_refs.some(x=>!valid(x))||unique(c.evidence_refs).length!==c.evidence_refs.length)
   fail('INVALID_CHOICE_OBSERVATION');
 const flags=[];
 const add=(id,level)=>flags.push({id,level,interpretation:'REVIEW_SIGNAL_ONLY'});
 if(c.decline_steps-c.accept_steps>=2)add('DECLINE_FRICTION_ASYMMETRY','POTENTIAL_DARK_PATTERN');
 if(c.consent_default==='PRESELECTED_ACCEPT')add('PRESELECTED_ACCEPTANCE','POTENTIAL_DARK_PATTERN');
 if(c.fee_disclosure==='AFTER_COMMIT')add('MATERIAL_FEE_DISCLOSED_LATE','POTENTIAL_DARK_PATTERN');
 if(c.scarcity_claim==='UNSUPPORTED')add('SCARCITY_UNSUPPORTED','POTENTIAL_DARK_PATTERN');
 if(c.exit_reversible===false)add('NO_CLEAR_REVERSAL','POTENTIAL_DARK_PATTERN');
 if(c.truth_claim==='FALSE')add('FALSE_CLAIM_REPORTED','POTENTIAL_DARK_PATTERN');
 if(c.consent_default==='UNKNOWN')add('CONSENT_DEFAULT_UNKNOWN','SOURCE_GAP');
 if(c.fee_disclosure==='UNKNOWN')add('FEE_DISCLOSURE_UNKNOWN','SOURCE_GAP');
 if(c.scarcity_claim==='UNKNOWN')add('SCARCITY_EVIDENCE_UNKNOWN','SOURCE_GAP');
 if(c.exit_reversible===null)add('REVERSIBILITY_UNKNOWN','SOURCE_GAP');
 if(c.truth_claim==='UNVERIFIED')add('TRUTH_UNVERIFIED','SOURCE_GAP');
 return {version:behavioralMetaContract.version,...ctx,
  choice_fingerprint:sha({ctx,c}),evidence_refs:[...c.evidence_refs].sort(cmp),
  flags,possible_dark_pattern_flags:flags.filter(x=>x.level==='POTENTIAL_DARK_PATTERN').length,
  missing_information_flags:flags.filter(x=>x.level==='SOURCE_GAP').length,
  state:flags.some(x=>x.level==='POTENTIAL_DARK_PATTERN')?'POTENTIAL_DARK_PATTERN_REVIEW':
    flags.length?'MORE_EVIDENCE_REQUIRED':'NO_LISTED_SIGNALS_IN_SUPPLIED_FIELDS',
  consumer_harm_proven:false,legal_violation_determined:false,
  choice_optimization_performed:false,source_authenticated:false,canonical_promotion:false};
}
const protocolKeys=['consent','purpose','assignment','experimental_unit','variants',
 'primary_outcome','welfare_outcome','harm_outcome','stopping_rule','multiplicity_plan',
 'delivery_version','precommitment_ref','source_refs'];
export function auditBehavioralExperimentProtocol(input){
 const ctx=context(input);
 ownOnly(input.protocol,protocolKeys,'EXPERIMENT_PROTOCOL_FIELDS');
 const p=input.protocol;
 if(!dense(p.variants)||p.variants.length<2||p.variants.length>8||
    p.variants.some(x=>!valid(x))||unique(p.variants).length!==p.variants.length||
    !dense(p.source_refs)||p.source_refs.length<1||p.source_refs.length>8||
    p.source_refs.some(x=>!valid(x))||unique(p.source_refs).length!==p.source_refs.length)
  fail('INVALID_EXPERIMENT_IDENTITIES');
 const issues=[];
 const requireField=(key)=>{if(!valid(p[key]))issues.push('MISSING_'+key.toUpperCase())};
 for(const k of ['experimental_unit','primary_outcome','welfare_outcome','harm_outcome','delivery_version','precommitment_ref'])requireField(k);
 if(p.consent!=='EXPLICIT')issues.push('CONSENT_NOT_EXPLICIT');
 if(!['USER_BENEFIT','MUTUAL_VALUE'].includes(p.purpose))issues.push('BENEFIT_PURPOSE_UNDECLARED');
 if(p.assignment!=='RANDOMIZED')issues.push('CAUSAL_RANDOM_ASSIGNMENT_NOT_DECLARED');
 if(!['FIXED_HORIZON','VALID_SEQUENTIAL_DESIGN'].includes(p.stopping_rule))issues.push('OPTIONAL_STOPPING_CONTROL_ABSENT');
 if(p.variants.length>2&&p.multiplicity_plan!=='PRESPECIFIED')issues.push('MULTIPLE_COMPARISON_PLAN_MISSING');
 if(p.variants.length===2&&!['PRESPECIFIED','SINGLE_COMPARISON'].includes(p.multiplicity_plan))
  issues.push('MULTIPLE_COMPARISON_PLAN_MISSING');
 return {version:behavioralMetaContract.version,...ctx,
  protocol_fingerprint:sha({ctx,protocol:p}),issues:sortedUnique(issues),
  state:issues.length?'PROTOCOL_GAPS_REQUIRE_REVIEW':'PROTOCOL_STRUCTURE_READY_FOR_HUMAN_REVIEW',
  tests_executed:0,causal_effect_estimated:false,statistical_inference:false,
  independent_review:false,preregistration_authenticated:false,
  human_approval_required:true,source_authentication:false,canonical_promotion:false};
}
// Reuse V22 rather than inventing duplicate combinatorial machinery.
// A complete pairwise DESIGN says nothing about achieved impact or statistical power.
export function planBehavioralInteractionControls(input){
 const design=planMethodInteractionCoverage(input);
 const independent_design_audit=auditMethodInteractionCoverage(input,design);
 return {kind:'BEHAVIORAL_COMPONENT_INTERACTION_TEST_DESIGN',design,independent_design_audit,
  methods_used:['V22_PAIRWISE_DESIGN','V22_INDEPENDENT_REPLAY'],
  clinical_or_sales_effectiveness_proven:false,tests_executed:0,canonical_promotion:false};
}
