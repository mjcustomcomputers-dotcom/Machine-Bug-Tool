// V31 independent diagnostic counter-methods: finite minimal transversals,
// abduction, evidence-retraction duality, metamorphic proofs and method portfolio.
import {validateHornModelV31,forwardHornV31,backwardHornV31,
 compareDirectionsV31,forwardWithSeedModificationsV31} from './mpc-v31-bidirectional-logic.mjs';

const fail=s=>{throw Error(s)};
const ID=/^[A-Za-z0-9][A-Za-z0-9_:./@-]{0,111}$/u;
const SYM=/^[A-Z][A-Z0-9_]{0,39}$/u;
const GIT=/^[a-f0-9]{40}$/u;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 [Object.prototype,null].includes(Object.getPrototypeOf(x));
const keys=(x,allowed,label)=>{if(!plain(x)||Object.keys(x).some(k=>!allowed.includes(k)))fail('INVALID_'+label+'_FIELDS')};
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const valid=x=>typeof x==='string'&&ID.test(x);
const sorted=a=>[...new Set(a)].sort();
const orderMasks=(n)=>Array.from({length:(1<<n)-1},(_,i)=>i+1)
 .sort((a,b)=>bitCount(a)-bitCount(b)||a-b);
const bitCount=n=>{let k=0;for(;n;n&=n-1)k++;return k};
const family=(universe,sets)=>{
 const solutions=[];
 for(const mask of orderMasks(universe.length)){
  const chosen=universe.filter((_,i)=>mask&(1<<i));
  if(solutions.some(s=>s.every(id=>chosen.includes(id))))continue;
  if(sets.every(c=>c.some(id=>chosen.includes(id)))){
   solutions.push(chosen);
   if(solutions.length>256)fail('V31_MINIMAL_DIAGNOSES_BUDGET');
  }
 }
 return solutions;
};
export const diagnosticV31Contract=Object.freeze({
 version:'MPC_V31_FINITE_REVERSE_DIAGNOSTIC_1',
 max_assumptions:12,max_conflicts:20,max_abductive_candidates:8,
 max_source_facts:12,max_diagnostic_sets:256,
 independent_replay:true,source_records_mutated:false,
 causal_truth_claimed:false,canonical_promotion:false
});
export function diagnoseDeclaredConflictsV31(input){
 keys(input,['source_commit','scope_id','subject_id','source_ref','source_owner',
  'source_version','assumptions','conflicts'],'DIAGNOSIS_INPUT');
 if(!GIT.test(input.source_commit||'')||
  !['scope_id','subject_id','source_ref','source_owner','source_version'].every(k=>valid(input[k]))||
  !dense(input.assumptions)||!input.assumptions.length||input.assumptions.length>12||
  !dense(input.conflicts)||!input.conflicts.length||input.conflicts.length>20)
  fail('INVALID_DIAGNOSIS_SCOPE');
 const aIds=new Set(),assumptions=[];
 for(const a of input.assumptions){
  keys(a,['id','cost','source_ref'],'DIAGNOSIS_ASSUMPTION');
  if(!valid(a.id)||aIds.has(a.id)||!valid(a.source_ref)||
   !Number.isSafeInteger(a.cost)||a.cost<1||a.cost>1000)
   fail('INVALID_DIAGNOSIS_ASSUMPTION');
  aIds.add(a.id);assumptions.push(a);
 }
 const cs=new Set(),conflicts=[];
 for(const c of input.conflicts){
  keys(c,['id','assumption_ids','source_ref'],'DIAGNOSIS_CONFLICT');
  if(!valid(c.id)||cs.has(c.id)||!valid(c.source_ref)||
   !dense(c.assumption_ids)||!c.assumption_ids.length||
   c.assumption_ids.some(id=>!aIds.has(id))||
   new Set(c.assumption_ids).size!==c.assumption_ids.length)
   fail('INVALID_DIAGNOSIS_CONFLICT');
  cs.add(c.id);conflicts.push(sorted(c.assumption_ids));
 }
 const universe=sorted([...aIds]),sol=family(universe,conflicts);
 const costId=new Map(assumptions.map(a=>[a.id,a.cost]));
 const diagnoses=sol.map(ids=>({assumption_ids:ids,
  declared_cost:ids.reduce((s,id)=>s+costId.get(id),0),
  all_declared_conflicts_hit:conflicts.every(c=>c.some(id=>ids.includes(id))),
  subset_minimal:ids.every(excluded=>!conflicts.every(c=>
   c.some(id=>id!==excluded&&ids.includes(id))))}))
  .sort((a,b)=>a.declared_cost-b.declared_cost||
    a.assumption_ids.length-b.assumption_ids.length||
    a.assumption_ids.join('|').localeCompare(b.assumption_ids.join('|')));
 if(diagnoses.some(x=>!x.all_declared_conflicts_hit||!x.subset_minimal))
  fail('V31_DIAGNOSIS_INDEPENDENT_ORACLE_FAILURE');
 return {version:diagnosticV31Contract.version,
  source_commit:input.source_commit,scope_id:input.scope_id,subject_id:input.subject_id,
  source_ref:input.source_ref,source_owner:input.source_owner,source_version:input.source_version,
  state:'DECLARED_MINIMAL_CONFLICT_HITTING_SETS',
  conflicts_supplied:conflicts.length,diagnoses,computed_candidate_masks:(1<<universe.length)-1,
  actual_faults_verified:false,source_authenticated:false,
  native_evaluators_added:0,canonical_promotion:false};
}
export function abduceFiniteGoalV31(input,candidates){
 const m=validateHornModelV31(input);
 if(!dense(candidates)||candidates.length>8)fail('INVALID_ABDUCTION_CANDIDATE_LIST');
 const ids=new Set(m.facts.map(x=>x.id)),cand=[];
 for(const a of candidates){
  keys(a,['id','symbol','cost','source_ref'],'ABDUCTION_CANDIDATE');
  if(!valid(a.id)||ids.has(a.id)||!SYM.test(a.symbol||'')||
   !valid(a.source_ref)||!Number.isInteger(a.cost)||a.cost<1||a.cost>1000)
   fail('INVALID_ABDUCTION_CANDIDATE');
  ids.add(a.id);cand.push(a);
 }
 const base=forwardHornV31(input);
 if(base.status==='GOAL_DERIVABLE_IN_FINITE_MODEL')
  return {version:diagnosticV31Contract.version,state:'GOAL_ALREADY_SUPPORTED',
   goal:m.goal,explanations:[{assumption_ids:[],cost:0,model_goal_supported:true}],
   assessed_subsets:0,hypotheses_observed:false,canonical_promotion:false};
 const solutions=[];
 const sortedCandidates=cand.slice().sort((a,b)=>a.id.localeCompare(b.id));
 let assessed=0;
 for(const mask of orderMasks(sortedCandidates.length)){
  const group=sortedCandidates.filter((_,i)=>mask&(1<<i));
  const support=group.map(x=>x.id);
  if(solutions.some(s=>s.assumption_ids.every(id=>support.includes(id))))continue;
  const result=forwardWithSeedModificationsV31(input,{hypothetical_seeds:group.map(x=>({
   id:x.id,symbol:x.symbol
  }))});
  assessed++;
  if(result.status==='GOAL_DERIVABLE_IN_FINITE_MODEL'){
   solutions.push({assumption_ids:support,cost:group.reduce((sum,x)=>sum+x.cost,0),
    model_goal_supported:true,
    proof_supports:result.goal_minimal_fact_supports});
   if(solutions.length>256)fail('V31_ABDUCTION_RESULT_BUDGET');
  }
 }
 solutions.sort((a,b)=>a.cost-b.cost||a.assumption_ids.length-b.assumption_ids.length||
  a.assumption_ids.join('|').localeCompare(b.assumption_ids.join('|')));
 return {version:diagnosticV31Contract.version,
  state:solutions.length?'MINIMAL_ABDUCTIVE_EXPLANATIONS':'NO_EXPLANATION_IN_SUPPLIED_ASSUMPTION_SET',
  goal:m.goal,source_commit:m.source_commit,
  assessed_subsets:assessed,explanations:solutions,
  hypotheses_observed:false,actual_causal_explanation_established:false,
  canonical_promotion:false};
}
export function calculateMinimalRetractionCutsV31(input){
 const m=validateHornModelV31(input),base=forwardHornV31(input);
 const facts=m.facts.filter(x=>x.state==='SYNTHETIC'||x.state==='OBSERVED');
 if(base.status!=='GOAL_DERIVABLE_IN_FINITE_MODEL')
  return {version:diagnosticV31Contract.version,goal:m.goal,
   state:'GOAL_NOT_SUPPORTED_BEFORE_RETRACTION',candidate_cuts:[],tests_performed:0,
   physically_deleted:false,canonical_promotion:false};
 const universe=facts.map(f=>f.id).sort(),supports=base.goal_minimal_fact_supports;
 const cuts=family(universe,supports);
 let trials=0;
 const tested=cuts.map(ids=>{
  const checked=forwardWithSeedModificationsV31(input,{remove_seed_ids:ids});trials++;
  const minimal=ids.every(id=>forwardWithSeedModificationsV31(input,{
   remove_seed_ids:ids.filter(x=>x!==id)}).status==='GOAL_DERIVABLE_IN_FINITE_MODEL');
  trials+=ids.length;
  if(checked.status!=='GOAL_UNSUPPORTED_IN_FINITE_MODEL'||!minimal)
   fail('V31_EVIDENCE_CUT_INDEPENDENT_REPLAY_CONTRADICTION');
  return {withdraw_fact_ids:ids,withdraw_count:ids.length,
   breaks_goal_in_declared_model:true,subset_minimal:minimal};
 }).sort((a,b)=>a.withdraw_count-b.withdraw_count||
  a.withdraw_fact_ids.join('|').localeCompare(b.withdraw_fact_ids.join('|')));
 return {version:diagnosticV31Contract.version,goal:m.goal,source_commit:m.source_commit,
  state:'MINIMUM_RETRACTION_DUALITY_REPLAY_PASSED',
  existing_minimal_fact_supports:supports,candidate_cuts:tested,
  trials_performed:trials,source_records_modified:false,
  physically_deleted:false,real_world_causation_inferred:false,
  canonical_promotion:false};
}
export function metamorphicBidirectionalChecksV31(input){
 const m=validateHornModelV31(input),base=compareDirectionsV31(input);
 const variations=[{id:'RULE_REORDER',input:{...input,
  rules:input.rules.slice().reverse()}}];
 if(input.rules.length&&input.rules.length<24){
  const copyId='V31_REPLAY_RULE_DUPLICATE';
  if(!new Set([...input.rules,...input.facts].map(x=>x.id)).has(copyId))
   variations.push({id:'DUPLICATE_RULE',input:{...input,
    rules:[...input.rules,{...input.rules[0],id:copyId}]}});
 }
 if(input.facts.length<12&&!m.unique_symbols.includes('V31_IRRELEVANT_FIXTURE')&&
 m.unique_symbols.length<40){
  variations.push({id:'IRRELEVANT_DECLARED_SYMBOL',input:{...input,
   facts:[...input.facts,{id:'V31_IRRELEVANT_SEED',symbol:'V31_IRRELEVANT_FIXTURE',
    state:input.world==='SYNTHETIC'?'SYNTHETIC':'OBSERVED',
    source_ref:input.source_ref,source_owner:input.source_owner,
    source_version:input.source_version}]}});
 }
 const controls=variations.map(v=>{
  const result=compareDirectionsV31(v.input);
  return {name:v.id,pass:base.exact_minimal_provenance_agreement&&
   result.exact_minimal_provenance_agreement&&
   JSON.stringify(base.forward.goal_minimal_fact_supports)===
   JSON.stringify(result.forward.goal_minimal_fact_supports),
   state:result.state,
   synthetic_control_only:true};
 });
 const required=['RULE_REORDER','DUPLICATE_RULE','IRRELEVANT_DECLARED_SYMBOL'];
 const seen=new Set(controls.map(x=>x.name));
 return {version:'MPC_V31_METHOD_ON_METHOD_METAMORPHIC_1',
  goal:m.goal,controls,controls_requested:required,
  omitted_controls:required.filter(x=>!seen.has(x)),
  coverage_complete:required.every(x=>seen.has(x)),
  all_controls_pass:controls.every(x=>x.pass),
  source_authenticated:false,canonical_promotion:false};
}
export function selectMethodPortfolioV31(input){
 const m=validateHornModelV31(input),
  comparison=compareDirectionsV31(input),
  controls=metamorphicBidirectionalChecksV31(input);
 const forwardCost=comparison.forward.rule_checks,
  backwardCost=comparison.backward.goal_calls+comparison.backward.rules_inspected;
 const passed=comparison.exact_minimal_provenance_agreement&&controls.all_controls_pass&&
  controls.coverage_complete;
 const selected=!passed?'NONE_PENDING_REVIEW':
  forwardCost<backwardCost?'FORWARD':
  backwardCost<forwardCost?'BACKWARD':'TIE_FORWARD_DEFAULT';
 const auditState=!controls.coverage_complete?'METHOD_COMPARISON_COVERAGE_INCOMPLETE':
  passed?'BIDIRECTIONAL_AND_METAMORPHIC_ORACLES_PASS':
  'METHOD_COMPARISON_FALSIFIER_FAILED';
 const next=passed?
  comparison.forward.status==='GOAL_DERIVABLE_IN_FINITE_MODEL'?
    'Review the minimal source support sets and source-owner versions.':
    'Acquire the first missing goal-specific source or supply a bounded assumption to test.':
   !controls.coverage_complete?
     'Run the omitted metamorphic controls on a bounded source-versioned subcase before selecting a winner.':
     'Review the distinct reasoning traces and their counterexamples.';
 const short=[
  'METHOD  '+selected,
  'RESULT  '+auditState,
  'EVIDENCE  '+m.goal+'; forward='+forwardCost+' checks; backward='+backwardCost+' calls/checks',
  'NEXT  '+next
 ].join('\n');
 return {version:'MPC_V31_INTELLIGENCE_METHOD_PORTFOLIO_1',
  source_commit:m.source_commit,scope_id:m.scope_id,subject_id:m.subject_id,
  goal:m.goal,selected_method:selected,comparison_state:auditState,
  workload_metrics:{forward_rule_checks:forwardCost,backward_goal_calls_and_rule_checks:backwardCost},
  bidirectional_receipt:comparison,metamorphic_controls:controls,
  compact_output:short,next_action:next,
  source_authenticated:false,performance_generalization:false,
  external_actions:0,canonical_promotion:false};
}

export function auditMethodPortfolioV31(input,candidate){
 if(!plain(candidate)||candidate.version!=='MPC_V31_INTELLIGENCE_METHOD_PORTFOLIO_1')
  fail('INVALID_V31_METHOD_PORTFOLIO_RECEIPT');
 const a=compareDirectionsV31(input),c=metamorphicBidirectionalChecksV31(input),
  forwardWork=a.forward.rule_checks,
  backwardWork=a.backward.goal_calls+a.backward.rules_inspected;
 const passed=a.exact_minimal_provenance_agreement&&c.all_controls_pass&&
  c.coverage_complete;
 const expected=!passed?'NONE_PENDING_REVIEW':
  forwardWork<backwardWork?'FORWARD':
  backwardWork<forwardWork?'BACKWARD':'TIE_FORWARD_DEFAULT';
 const problems=[];
 if(candidate.source_commit!==a.source_commit||candidate.goal!==a.goal||
    candidate.selected_method!==expected)problems.push('SOURCE_GOAL_OR_SELECTED_METHOD_CHANGED');
 const expectedState=!c.coverage_complete?'METHOD_COMPARISON_COVERAGE_INCOMPLETE':
  passed?'BIDIRECTIONAL_AND_METAMORPHIC_ORACLES_PASS':
   'METHOD_COMPARISON_FALSIFIER_FAILED';
 if(candidate.comparison_state!==expectedState)problems.push('METHOD_AUDIT_STATE_CHANGED');
 if(candidate.workload_metrics?.forward_rule_checks!==forwardWork||
    candidate.workload_metrics?.backward_goal_calls_and_rule_checks!==backwardWork)
  problems.push('ACTUAL_ALGORITHM_WORK_UNITS_CHANGED');
 if(JSON.stringify(candidate.bidirectional_receipt?.forward?.goal_minimal_fact_supports)!==
    JSON.stringify(a.forward.goal_minimal_fact_supports)||
    JSON.stringify(candidate.bidirectional_receipt?.backward?.goal_minimal_fact_supports)!==
    JSON.stringify(a.backward.goal_minimal_fact_supports))
  problems.push('MINIMAL_SOURCE_PROOFS_CHANGED');
 if(JSON.stringify(candidate.metamorphic_controls?.controls)!==JSON.stringify(c.controls)||
    candidate.metamorphic_controls?.coverage_complete!==c.coverage_complete||
    JSON.stringify(candidate.metamorphic_controls?.omitted_controls)!==
      JSON.stringify(c.omitted_controls))
  problems.push('METHOD_METAMORPHIC_CONTROLS_CHANGED');
 const expectedNext=passed?
  a.forward.status==='GOAL_DERIVABLE_IN_FINITE_MODEL'?
   'Review the minimal source support sets and source-owner versions.':
   'Acquire the first missing goal-specific source or supply a bounded assumption to test.':
   !c.coverage_complete?
    'Run the omitted metamorphic controls on a bounded source-versioned subcase before selecting a winner.':
    'Review the distinct reasoning traces and their counterexamples.';
 const text=[
  'METHOD  '+expected,
  'RESULT  '+expectedState,
  'EVIDENCE  '+a.goal+'; forward='+forwardWork+' checks; backward='+backwardWork+' calls/checks',
  'NEXT  '+expectedNext
 ].join('\n');
 if(candidate.compact_output!==text||candidate.next_action!==expectedNext)
  problems.push('COMPACT_METHOD_OUTPUT_DRIFT');
 if(candidate.source_authenticated!==false||candidate.canonical_promotion!==false||
    candidate.external_actions!==0)problems.push('FALSE_SOURCE_OR_ACTION_PROMOTION');
 return {version:'MPC_V31_TOURNAMENT_REPLAY_1',
  state:problems.length?'METHOD_TOURNAMENT_RECEIPT_REJECTED':'SOURCE_BOUND_METHOD_TOURNAMENT_REPLAY_MATCH',
  issues:problems,checked_goal:a.goal,expected_selected_method:expected,
  objective_work_units_checked:true,
  source_authenticated:false,canonical_promotion:false};
}
