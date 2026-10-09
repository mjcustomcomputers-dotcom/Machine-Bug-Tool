// Bounded adaptive metareasoning over one caller-supplied two-stage
// computation tree. The second computation may depend on the first observed
// result. Exact integer-weight arithmetic is cross-checked at the selected
// terminal information cells with the retained Harsanyi evaluator.
import {createHash} from 'node:crypto';
import {canonical} from './universal.mjs';
import {evaluateMethod} from './methods.mjs';

const VERSION='MPC_FINITE_ADAPTIVE_TWO_STAGE_CHOICE_V1';
const ID=/^[A-Za-z0-9_:.-]{1,200}$/u;
const MAX_STATES=4,MAX_ACTIONS=4,MAX_OUTCOMES=4,MAX_SECOND_OPTIONS=3;
const MAX_WEIGHT=1_000,MAX_SCALE=1_000,MAX_VALUE=1_000_000;
const fail=(code,detail='')=>{throw Error(code+(detail?':'+detail:''));};
const copy=structuredClone;
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const abs=value=>value<0n?-value:value;
function gcd(a,b){while(b)[a,b]=[b,a%b];return a;}
function fraction(n,d){if(d===0n)fail('ZERO_DENOMINATOR');if(n===0n)return {n:0n,d:1n};if(d<0n){n=-n;d=-d;}const g=gcd(abs(n),d);return {n:n/g,d:d/g};}
const subtract=(a,b)=>fraction(a.n*b.d-b.n*a.d,a.d*b.d);
const compare=(a,b)=>a.n*b.d<b.n*a.d?-1:a.n*b.d>b.n*a.d?1:0;
const json=value=>({numerator:String(value.n),denominator:String(value.d)});
const number=value=>Number(value.n)/Number(value.d);

export const adaptiveTwoStageChoiceContract=Object.freeze({
 version:VERSION,model_scope:'ONE_FINITE_CALLER_SUPPLIED_TWO_STAGE_COMPUTATION_TREE',
 max_states:MAX_STATES,max_actions:MAX_ACTIONS,max_outcomes_per_computation:MAX_OUTCOMES,
 max_second_stage_options:MAX_SECOND_OPTIONS,max_integer_weight:MAX_WEIGHT,max_likelihood_scale:MAX_SCALE,
 integer_utility_and_cost_bound:MAX_VALUE,native_methods_used:['harsanyi'],native_evaluator_added:false,
 objective:'MAXIMIZE_EXPECTED_TERMINAL_UTILITY_MINUS_REALIZED_COMPUTATION_COST',
 adaptivity_definition:'SECOND_STAGE_COMPUTATION_CHOICE_MAY_DEPEND_ON_FIRST_STAGE_OUTCOME',
 independent_oracle_requirement:'ENUMERATE_EVERY_BOUNDED_CONTINGENT_SECOND_STAGE_POLICY',
 learned_policy:false,cfr_performed:false,general_poker_solver:false,target_search:false,
 source_authentication:false,canonical_registry_mutation:false
});

function record(value,allowed,required,name){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('INVALID_'+name);
 const descriptors=Object.getOwnPropertyDescriptors(value);
 for(const key of Reflect.ownKeys(descriptors)){const descriptor=descriptors[key];if(typeof key!=='string'||!allowed.includes(key)||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('INVALID_'+name+'_FIELD');}
 if(required.some(key=>!Object.hasOwn(descriptors,key)))fail('MISSING_'+name+'_FIELD');return value;
}
function array(value,min,max,name){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<min||value.length>max)fail('INVALID_'+name+'_BOUNDS');
 for(const key of Reflect.ownKeys(value)){if(key==='length')continue;const descriptor=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!/^(0|[1-9][0-9]*)$/u.test(key)||Number(key)>=value.length||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('INVALID_'+name+'_FIELD');}
 for(let index=0;index<value.length;index++)if(!Object.hasOwn(value,index))fail('SPARSE_'+name);return value;
}
function integer(value,min,max,name){if(!Number.isSafeInteger(value)||value<min||value>max)fail('INVALID_'+name);return value;}
function identifier(value,name){if(typeof value!=='string'||!ID.test(value))fail('INVALID_'+name);return value;}
function distinct(values,name){if(new Set(values).size!==values.length)fail('DUPLICATE_'+name);}

function normalizeComputation(raw,stateCount,scale,name){
 record(raw,['id','cost','outcomes'],['id','cost','outcomes'],name);
 const id=identifier(raw.id,name+'_ID'),cost=integer(raw.cost,0,MAX_VALUE,name+'_COST');
 const outcomes=array(raw.outcomes,1,MAX_OUTCOMES,name+'_OUTCOMES').map((outcome,outcomeIndex)=>{
  record(outcome,['id','likelihood_weights'],['id','likelihood_weights'],name+'_OUTCOME');
  return {id:identifier(outcome.id,name+'_OUTCOME_ID'),likelihood_weights:array(outcome.likelihood_weights,stateCount,stateCount,name+'_LIKELIHOOD_WEIGHTS').map((weight,stateIndex)=>integer(weight,0,scale,name+'_LIKELIHOOD_'+outcomeIndex+'_'+stateIndex))};
 });
 distinct(outcomes.map(outcome=>outcome.id),name+'_OUTCOME_ID');
 for(let state=0;state<stateCount;state++)if(outcomes.reduce((sum,outcome)=>sum+outcome.likelihood_weights[state],0)!==scale)fail(name+'_LIKELIHOODS_MUST_SUM_TO_SCALE',String(state));
 return {id,cost,outcomes};
}

function validate(input){
 record(input,['experiment_id','likelihood_scale','budget','states','actions','first_stage','second_stage_options'],['experiment_id','likelihood_scale','budget','states','actions','first_stage','second_stage_options'],'ADAPTIVE_REQUEST');
 const experiment_id=identifier(input.experiment_id,'EXPERIMENT_ID'),scale=integer(input.likelihood_scale,1,MAX_SCALE,'LIKELIHOOD_SCALE'),budget=integer(input.budget,0,MAX_VALUE,'COMPUTATION_BUDGET');
 const states=array(input.states,2,MAX_STATES,'STATES').map((state,index)=>{record(state,['id','weight'],['id','weight'],'STATE');return {id:identifier(state.id,'STATE_ID'),weight:integer(state.weight,1,MAX_WEIGHT,'STATE_WEIGHT_'+index)};});
 distinct(states.map(state=>state.id),'STATE_ID');
 const actions=array(input.actions,2,MAX_ACTIONS,'ACTIONS').map((action,index)=>{record(action,['id','payoffs'],['id','payoffs'],'ACTION');return {id:identifier(action.id,'ACTION_ID'),payoffs:array(action.payoffs,states.length,states.length,'ACTION_PAYOFFS').map((payoff,stateIndex)=>integer(payoff,-MAX_VALUE,MAX_VALUE,'PAYOFF_'+index+'_'+stateIndex))};});
 distinct(actions.map(action=>action.id),'ACTION_ID');
 const first_stage=normalizeComputation(input.first_stage,states.length,scale,'FIRST_STAGE');
 if(first_stage.cost>budget)fail('FIRST_STAGE_EXCEEDS_BUDGET');
 const second_stage_options=array(input.second_stage_options,1,MAX_SECOND_OPTIONS,'SECOND_STAGE_OPTIONS').map(option=>normalizeComputation(option,states.length,scale,'SECOND_STAGE'));
 distinct(second_stage_options.map(option=>option.id),'SECOND_STAGE_ID');
 if(second_stage_options.some(option=>option.id===first_stage.id))fail('DUPLICATE_COMPUTATION_ID');
 return {experiment_id,likelihood_scale:scale,budget,states,actions,first_stage,second_stage_options};
}

function bestAction(actions,weights){
 let best=null;
 for(const action of actions){const numerator=action.payoffs.reduce((sum,payoff,index)=>sum+BigInt(payoff)*weights[index],0n),candidate={action_id:action.id,numerator};if(!best||candidate.numerator>best.numerator)best=candidate;}
 const maximizers=actions.filter(action=>action.payoffs.reduce((sum,payoff,index)=>sum+BigInt(payoff)*weights[index],0n)===best.numerator).map(action=>action.id);
 return {...best,maximizers};
}

function solve(model){
 const scale=BigInt(model.likelihood_scale),totalWeight=model.states.reduce((sum,state)=>sum+BigInt(state.weight),0n),denominator=totalWeight*scale*scale;
 const priorWeights=model.states.map(state=>BigInt(state.weight));
 const baseline=bestAction(model.actions,priorWeights),baselineNumerator=baseline.numerator*scale*scale;
 const branches=model.first_stage.outcomes.map(firstOutcome=>{
  const firstWeights=model.states.map((state,index)=>BigInt(state.weight)*BigInt(firstOutcome.likelihood_weights[index]));
  const branchMass=firstWeights.reduce((sum,value)=>sum+value,0n);
  if(branchMass===0n)return {first_outcome_id:firstOutcome.id,branch_mass:0n,candidates:[]};
  const stopAction=bestAction(model.actions,firstWeights),candidates=[{second_choice_id:'STOP',computation_cost:0,contribution_numerator:stopAction.numerator*scale,terminal_cells:[{second_outcome_id:null,weights:firstWeights,best_action:stopAction}]}];
  for(const option of model.second_stage_options){
   if(model.first_stage.cost+option.cost>model.budget)continue;
   const terminalCells=option.outcomes.map(secondOutcome=>{const weights=firstWeights.map((weight,index)=>weight*BigInt(secondOutcome.likelihood_weights[index]));return {second_outcome_id:secondOutcome.id,weights,best_action:bestAction(model.actions,weights)};}).filter(cell=>cell.weights.some(weight=>weight>0n));
   const utility=terminalCells.reduce((sum,cell)=>sum+cell.best_action.numerator,0n),cost=BigInt(option.cost)*branchMass*scale;
   candidates.push({second_choice_id:option.id,computation_cost:option.cost,contribution_numerator:utility-cost,terminal_cells:terminalCells});
  }
  let selected=candidates[0];for(const candidate of candidates.slice(1))if(candidate.contribution_numerator>selected.contribution_numerator)selected=candidate;
  return {first_outcome_id:firstOutcome.id,branch_mass:branchMass,candidates,selected};
 });
 const firstCost=BigInt(model.first_stage.cost)*denominator;
 const adaptiveNumerator=branches.reduce((sum,branch)=>sum+(branch.selected?.contribution_numerator??0n),0n)-firstCost;
 const fixedChoices=['STOP',...model.second_stage_options.filter(option=>model.first_stage.cost+option.cost<=model.budget).map(option=>option.id)];
 const fixedPolicies=fixedChoices.map(choice=>({second_choice_id:choice,numerator:branches.reduce((sum,branch)=>sum+(branch.candidates.find(candidate=>candidate.second_choice_id===choice)?.contribution_numerator??0n),0n)-firstCost}));
 let nonadaptive=fixedPolicies[0];for(const row of fixedPolicies.slice(1))if(row.numerator>nonadaptive.numerator)nonadaptive=row;
 return {denominator,baseline:{...baseline,numerator:baselineNumerator},branches,adaptiveNumerator,fixedPolicies,nonadaptive};
}

async function nativeCrossChecks(model,solution){
 const receipts=[];
 for(const branch of solution.branches){
  if(!branch.selected)continue;
  for(const cell of branch.selected.terminal_cells){
   const mass=cell.weights.reduce((sum,value)=>sum+value,0n);if(mass===0n)continue;
   const receipt=await evaluateMethod({method:'harsanyi',input:{states:model.states.map((state,index)=>({id:state.id,probability:Number(cell.weights[index])/Number(mass)})),actions:model.actions.map(action=>({id:action.id,payoffs:copy(action.payoffs)}))}});
   if(!cell.best_action.maximizers.every(id=>receipt.result.maximizers.includes(id)))fail('NATIVE_HARSANYI_ACTION_MISMATCH');
   const expected=Number(cell.best_action.numerator)/Number(mass),nativeBest=Math.max(...receipt.result.values.map(row=>row.expected_utility));
   if(!Number.isFinite(nativeBest)||Math.abs(nativeBest-expected)>1e-9*Math.max(1,Math.abs(nativeBest),Math.abs(expected)))fail('NATIVE_HARSANYI_VALUE_MISMATCH');
   receipts.push({first_outcome_id:branch.first_outcome_id,second_choice_id:branch.selected.second_choice_id,second_outcome_id:cell.second_outcome_id,exact_maximizers:copy(cell.best_action.maximizers),receipt});
  }
 }
 return receipts;
}

/** Evaluate a finite two-stage computation choice. The first computation is
 * supplied and budget-admissible; STOP plus every affordable second
 * computation is compared separately after each first result. */
export async function evaluateFiniteAdaptiveTwoStageChoice(input){
 const model=validate(input),solution=solve(model),native_receipts=await nativeCrossChecks(model,solution);
 const adaptive=fraction(solution.adaptiveNumerator,solution.denominator),nonadaptive=fraction(solution.nonadaptive.numerator,solution.denominator),baseline=fraction(solution.baseline.numerator,solution.denominator),gain=subtract(adaptive,nonadaptive);
 const adaptive_policy=solution.branches.map(branch=>({first_outcome_id:branch.first_outcome_id,branch_weight:String(branch.branch_mass),second_choice_id:branch.selected?.second_choice_id??'UNREACHABLE',computation_cost:branch.selected?.computation_cost??0,contribution_numerator:String(branch.selected?.contribution_numerator??0n)}));
 const branch_candidates=solution.branches.map(branch=>({first_outcome_id:branch.first_outcome_id,branch_weight:String(branch.branch_mass),candidates:branch.candidates.map(candidate=>({second_choice_id:candidate.second_choice_id,computation_cost:candidate.computation_cost,contribution_numerator:String(candidate.contribution_numerator),terminal_actions:candidate.terminal_cells.map(cell=>({second_outcome_id:cell.second_outcome_id,maximizing_action_ids:copy(cell.best_action.maximizers)}))}))}));
 const blocked_second_stage_options=[];for(const branch of solution.branches)for(const option of model.second_stage_options)if(model.first_stage.cost+option.cost>model.budget)blocked_second_stage_options.push({first_outcome_id:branch.first_outcome_id,second_choice_id:option.id,reason:'COMPUTATION_BUDGET',required_budget:model.first_stage.cost+option.cost,available_budget:model.budget,native_evaluator_calls:0});
 return {version:VERSION,status:'FINITE_ADAPTIVE_TWO_STAGE_CHOICE_EVALUATED',request_fingerprint:hash(model),supplied_model:model,
  adaptive_policy,best_nonadaptive_policy:{second_choice_id:solution.nonadaptive.second_choice_id},
  fixed_second_stage_policies:solution.fixedPolicies.map(row=>({second_choice_id:row.second_choice_id,exact_net:json(fraction(row.numerator,solution.denominator))})),branch_candidates,blocked_second_stage_options,
  exact_values:{no_computation:json(baseline),adaptive_net:json(adaptive),best_nonadaptive_net:json(nonadaptive),adaptivity_gain:json(gain)},
  projected_values:{no_computation:number(baseline),adaptive_net:number(adaptive),best_nonadaptive_net:number(nonadaptive),adaptivity_gain:number(gain)},
  adaptive_improves_on_nonadaptive:compare(adaptive,nonadaptive)>0,nonadaptive_equivalence:compare(adaptive,nonadaptive)===0,
  selected_overall_plan:compare(adaptive,baseline)>0?'ADAPTIVE_TWO_STAGE_COMPUTATION':'NO_COMPUTATION',native_receipts,
  oracle:'Backward induction selects STOP or one affordable second computation independently after each first-stage outcome. The curriculum separately enumerates every contingent second-stage policy.',
  tie_rule:'STOP_FIRST_THEN_SUPPLIED_SECOND_STAGE_ORDER;NO_COMPUTATION_ON_OVERALL_TIE',
  boundaries:{probabilities_inferred:false,policy_learned:false,cfr_performed:false,general_poker_solver:false,target_search:false,native_evaluator_added:false,source_authentication:false,target_actions_performed:false,canonical_promotion:false,registry_mutation:false,persisted:false},
  limitations:['Finite caller-supplied integer state weights, likelihood weights, utilities, computation costs and two-stage conditional-independence model only.','Adaptive superiority is relative only to fixed second-stage computation choice in the supplied model; it does not establish real-world information quality or general planning ability.']};
}
