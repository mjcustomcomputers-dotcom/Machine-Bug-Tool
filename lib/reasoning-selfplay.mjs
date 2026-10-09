// Executed, finite self-challenges for the existing MPC methods. All worlds,
// payoffs, source observations and defects below are explicit synthetic models.
// This local lab does not add a hosted evaluator or rewrite a classifier.
import {createHash} from 'node:crypto';
import {evaluateMethod} from './methods.mjs';
import {canonical} from './universal.mjs';
import {planNoahsArkReasoning} from './noahs-ark-reasoning.mjs';
import {compareFiniteDecisions,rankObservationPartitions,validateFiniteInformationPolicy} from './finite-information-reasoning.mjs';
import {rankFiniteStochasticObservations} from './finite-stochastic-observation.mjs';
import {evaluateFiniteImperfectInformationRegret} from './finite-imperfect-information-regret.mjs';
import {evaluateFiniteBudgetSensitiveSearch} from './finite-budget-sensitive-search.mjs';
import {evaluateFiniteAdaptiveTwoStageChoice} from './finite-adaptive-two-stage-choice.mjs';
import {runFiniteAbstractionRefinement} from './finite-abstraction-refinement.mjs';
import first from '../method-atlas/candidates.json' with {type:'json'};
import v2 from '../method-atlas/expansion-2026-v2.json' with {type:'json'};
import v3 from '../method-atlas/expansion-evidence-intent-v3.json' with {type:'json'};
import v4 from '../method-atlas/expansion-computation-schools-v4.json' with {type:'json'};
import v5 from '../method-atlas/expansion-nasa-chip-cloud-v5.json' with {type:'json'};
import v6 from '../method-atlas/expansion-abnormal-meta-v6.json' with {type:'json'};
import v8 from '../method-atlas/expansion-optical-v8.json' with {type:'json'};
import links from '../method-atlas/method-relations.json' with {type:'json'};

const methods=[first,v2,v3,v4,v5,v6,v8].flatMap(x=>x.methods);
const sha=x=>createHash('sha256').update(typeof x==='string'?x:canonical(x)).digest('hex');
const clone=structuredClone;
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
const VERSION='MPC_EXECUTED_REASONING_CURRICULUM_V5';
const SOURCE={namespace:'SYNTHETIC',native_id:'contract:reasoning-fixtures',version:VERSION,owner:'MPC_LOCAL_LAB',content_sha256:sha(VERSION)};
const refs=['fixture:mpc-self-reasoning'];
function random(seed){let state=seed>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};}
function sourceRef(){return clone(SOURCE);}
function bindSource(model){const payload=clone(model);delete payload.source_refs;model.source_refs=[{...sourceRef(),native_id:model.model_id,content_sha256:sha(payload)}];return model;}
function hiddenBit(p=0.5,reward=1){return bindSource({
 model_id:'fixture:hidden-bit',actor_id:'actor:decision',source_refs:[sourceRef()],
 assumptions:['Supplied synthetic prior, payoffs and actor history; single decision; no observed target or inferred probability.'],
 actions:[{action_id:'guess0',cost:0},{action_id:'guess1',cost:0}],
 states:[0,1].map((bit)=>({state_id:'bit'+bit,probability:bit?1-p:p,observable_history:['hidden'],
  legal_action_ids:['guess0','guess1'],payoffs:[0,1].map(guess=>({action_id:'guess'+guess,utility:guess===bit?reward:0}))}))
});}
function reveal(model,cost=0.1){return {observation_id:'reveal',actor_id:model.actor_id,access_state:'AVAILABLE',available_before_action:true,cost,
 source_refs:[sourceRef()],partition:model.states.map(s=>({outcome_id:'observe:'+s.state_id,state_ids:[s.state_id]}))};}
function noisyReveal(model,observation_id,accuracy,cost=0){return {observation_id,actor_id:model.actor_id,access_state:'AVAILABLE',available_before_action:true,cost,
 source_refs:clone(model.source_refs),outcomes:[0,1].map(outcome=>({outcome_id:'signal'+outcome,likelihoods:[0,1].map(state=>({state_id:'bit'+state,probability:state===outcome?accuracy:1-accuracy}))}))};}
function adaptiveFixture({reward=10,firstCorrect=3,secondCost=1,budget=1,uninformative=false}={}){
 const pair=uninformative?[[2,2],[2,2]]:[[4,2],[0,2]],mirror=uninformative?[[2,2],[2,2]]:[[2,4],[2,0]];
 return {experiment_id:uninformative?'fixture:adaptive-equivalence':'fixture:adaptive-complementary',likelihood_scale:4,budget,
  states:[{id:'bit0',weight:1},{id:'bit1',weight:1}],actions:[{id:'guess0',payoffs:[reward,0]},{id:'guess1',payoffs:[0,reward]}],
  first_stage:{id:'coarse',cost:0,outcomes:[{id:'signal0',likelihood_weights:[firstCorrect,4-firstCorrect]},{id:'signal1',likelihood_weights:[4-firstCorrect,firstCorrect]}]},
  second_stage_options:[
   {id:'confirm0',cost:secondCost,outcomes:[{id:'hit0',likelihood_weights:pair[0]},{id:'miss0',likelihood_weights:pair[1]}]},
   {id:'confirm1',cost:secondCost,outcomes:[{id:'hit1',likelihood_weights:mirror[0]},{id:'miss1',likelihood_weights:mirror[1]}]}
  ]};
}
// Independent exhaustive oracle for the binary curriculum fixtures. It does
// not call the adapter or native evaluator: every contingent policy is formed
// explicitly, scored from the supplied integer weights, and compared with
// every fixed second-stage choice.
function enumerateAdaptiveOracle(model){
 const scale=model.likelihood_scale,total=model.states.reduce((sum,state)=>sum+state.weight,0),denominator=total*scale*scale;
 const actionValue=weights=>Math.max(...model.actions.map(action=>action.payoffs.reduce((sum,payoff,index)=>sum+payoff*weights[index],0)));
 const branchCandidates=model.first_stage.outcomes.map(first=>{
  const firstWeights=model.states.map((state,index)=>state.weight*first.likelihood_weights[index]),branchMass=firstWeights.reduce((a,b)=>a+b,0);
  const rows=[{id:'STOP',numerator:actionValue(firstWeights)*scale}];
  for(const option of model.second_stage_options)if(model.first_stage.cost+option.cost<=model.budget){
   const utility=option.outcomes.reduce((sum,outcome)=>sum+actionValue(firstWeights.map((weight,index)=>weight*outcome.likelihood_weights[index])),0);
   rows.push({id:option.id,numerator:utility-option.cost*branchMass*scale});
  }
  return {first_outcome_id:first.id,rows};
 });
 let policies=[{choices:[],numerator:0}];
 for(const branch of branchCandidates)policies=policies.flatMap(policy=>branch.rows.map(row=>({choices:[...policy.choices,[branch.first_outcome_id,row.id]],numerator:policy.numerator+row.numerator})));
 for(const policy of policies)policy.numerator-=model.first_stage.cost*denominator;
 const adaptive=policies.reduce((best,row)=>row.numerator>best.numerator?row:best);
 const fixed=['STOP',...model.second_stage_options.filter(option=>model.first_stage.cost+option.cost<=model.budget).map(option=>option.id)].map(id=>({id,numerator:branchCandidates.reduce((sum,branch)=>sum+branch.rows.find(row=>row.id===id).numerator,0)-model.first_stage.cost*denominator}));
 const nonadaptive=fixed.reduce((best,row)=>row.numerator>best.numerator?row:best);
 return {adaptive_net:adaptive.numerator/denominator,best_nonadaptive_net:nonadaptive.numerator/denominator,adaptivity_gain:(adaptive.numerator-nonadaptive.numerator)/denominator,
  adaptive_policy:adaptive.choices,best_nonadaptive_choice:nonadaptive.id,contingent_policies_enumerated:policies.length,fixed_policies_enumerated:fixed.length};
}
function graphFixture(real=false){return {
 invariant_label:'only source-realizable failure paths',sources:[{source_id:'fixture:graph',namespace:'SYNTHETIC',native_id:'graph:self',revision:'1',content_sha256:sha({real})}],
 states:['S','A','B','F'].map(id=>({id,invariant_holds:id!=='F'})),initial_states:['S'],
 transitions:[{id:'sa',from:'S',to:'A'},{id:'bf',from:'B',to:'F'},...(real?[{id:'af',from:'A',to:'F'}]:[])],
 forbidden_states:['F'],abstraction:[{concrete_state:'S',abstract_state:'S'},{concrete_state:'A',abstract_state:'Q'},{concrete_state:'B',abstract_state:'Q'},{concrete_state:'F',abstract_state:'F'}],
 completeness:{states_complete:true,initial_states_complete:true,transitions_complete:true},max_refinements:8
};}

/** One bounded curriculum pass. Caller persists returned receipts and the next
 * seed. Exact structural duplicates can be skipped across source-equal passes;
 * anchor regressions are intentionally replayed, never counted as exploratory
 * novelty. New parameterizations are not new method families or discoveries.
 */
export async function runReasoningSelfplay({seed=20261009,rounds=24,prior_case_fingerprints=[],engine_fingerprint=null,prior_engine_fingerprint=null}={}){
 if(!Number.isInteger(seed)||seed<1||seed>0xffffffff||!Number.isInteger(rounds)||rounds<1||rounds>64)throw Error('INVALID_CURRICULUM_BUDGET');
 if(!Array.isArray(prior_case_fingerprints)||prior_case_fingerprints.length>65536||prior_case_fingerprints.some(x=>typeof x!=='string'||!/^[a-f0-9]{64}$/u.test(x))||new Set(prior_case_fingerprints).size!==prior_case_fingerprints.length)throw Error('INVALID_PRIOR_CASES');
 if(prior_case_fingerprints.length&&(![engine_fingerprint,prior_engine_fingerprint].every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/u.test(x))||engine_fingerprint!==prior_engine_fingerprint))throw Error('PRIOR_CASE_ENGINE_BINDING_REQUIRED');
 const rng=random(seed),integer=(min,max)=>min+Math.floor(rng()*(max-min+1));
 const prior=new Set(prior_case_fingerprints),seen=new Set(),cases=[],skipped=[],native=[];
 let directInvariantCalls=0;
 async function evaluate(method,input){const receipt=await evaluateMethod({method,input});native.push(receipt);return receipt;}
 // Capture every child evaluator receipt once, including Harsanyi calls made
 // by the information adapter. Distinct receipt hashes are not call counts.
 function embedded(receipt){
  const found=[];
  const walk=x=>{if(!x||typeof x!=='object')return;if(x.status==='BOUNDED_MODEL_RESULT'&&x.method){found.push(x);return;}for(const value of Object.values(x))walk(value);};
  walk(receipt);native.push(...found);return receipt;
 }
 async function check(family,shape,anchor,work){
  const fingerprint=sha({family,shape});
  if(seen.has(fingerprint)||(!anchor&&prior.has(fingerprint))){skipped.push({family,case_fingerprint:fingerprint,reason:seen.has(fingerprint)?'DUPLICATE_THIS_PASS':'PREVIOUSLY_EXECUTED_CALLER_BOUND_SAME_ENGINE'});return;}
  seen.add(fingerprint);const start=native.length,directStart=directInvariantCalls;
  try{const result=await work();cases.push({family,case_fingerprint:fingerprint,shape,anchor_regression:anchor,
   new_exploratory_case:!anchor&&!prior.has(fingerprint),new_coverage_case:!prior.has(fingerprint),passed:result.passed===true,...result,
   native_evaluator_calls:native.length-start+directInvariantCalls-directStart,direct_finite_invariant_calls:directInvariantCalls-directStart});}
  catch(error){cases.push({family,case_fingerprint:fingerprint,shape,anchor_regression:anchor,new_exploratory_case:!anchor&&!prior.has(fingerprint),new_coverage_case:!prior.has(fingerprint),passed:false,
   error:String(error?.message??error),native_evaluator_calls:native.length-start+directInvariantCalls-directStart,
   evaluator_count_complete:false,unreturned_adapter_calls:'POSSIBLE_NOT_COUNTED_AFTER_ERROR'});}
 }
 // A method applies its own falsifier to its planner. Readiness and source
 // removal are semantic changes; reordering is a negative control.
 for(const state of ['AVAILABLE','MISSING','UNKNOWN'])await check('ready_challenger',{state},true,async()=>{
  const input={methods,relations:links.relationships,atom:{subject_id:'fixture:planner',atom_id:'fixture:choice',dimensions:['DIAGNOSTIC','VERIFICATION'],source_refs:refs,external_source_refs:[]},
   method_receipts:[['MHA-0225','AVAILABLE'],['MHA-0217',state],['MHA-0090','AVAILABLE']].map(([method_id,input_state])=>({method_id,input_state,negative_control_state:'AVAILABLE',falsifier_state:'AVAILABLE',estimated_cost_units:1})),max_selected:1,max_pairs:1};
  const actual=planNoahsArkReasoning(input),reordered=planNoahsArkReasoning({...input,methods:[...methods].reverse(),relations:[...links.relationships].reverse(),method_receipts:[...input.method_receipts].reverse()});
  const expected=state==='AVAILABLE'?'MHA-0217':'MHA-0090';
  return {passed:actual.proposed_pairs[0]?.challenger_method_id===expected&&canonical(actual.proposed_pairs)===canonical(reordered.proposed_pairs),
   expected,observed:actual.proposed_pairs,method_refs:['MHA-0225','MHA-0197','MHA-0218'],oracle:'Actual MHA-0225 falsifier plus native registered relation/readiness records; reorder invariant',catalog_considered:actual.method_consideration.length,executed_method_plan:false};
 });
 await check('missing_source',{source:'absent'},true,async()=>{
  const result=planNoahsArkReasoning({methods,relations:links.relationships,atom:{subject_id:'fixture:planner',atom_id:'fixture:choice',dimensions:['DIAGNOSTIC'],source_refs:[],external_source_refs:[]},method_receipts:[],max_selected:1,max_pairs:1});
  return {passed:result.status==='BLOCKED_NATIVE_SOURCE'&&result.selected_methods.length===0,observed:result.status,oracle:'Source removal cannot produce an executable or source-authenticated plan'};
 });
 // Poker-like information boundary: the simulator may see the hidden card;
 // the acting policy must remain constant across indistinguishable histories.
 for(const [p,reward,cost,anchor] of [[0.5,1,0.1,true],...Array.from({length:rounds},()=>[integer(1,15)/16,integer(1,20),integer(0,20)/10,false])]){
  await check('information_value',{p,reward,cost},anchor,async()=>{
   const model=hiddenBit(p,reward),compare=embedded(await compareFiniteDecisions({model})),rank=embedded(await rankObservationPartitions({model,observations:[reveal(model,cost)]}));
   const base=reward*Math.max(p,1-p),gross=reward-base,net=gross-cost,row=rank.ranked_observations[0];
   return {passed:near(compare.optimal_admissible_expected_utility,base)&&near(compare.omniscient_upper_bound,reward)&&near(compare.information_gap,gross)&&near(row.net_evsi,net)&&rank.selected_option===(net>1e-9?'reveal':'NO_OBSERVATION'),
    expected:{admissible:base,omniscient:reward,gross_evsi:gross,net_evsi:net},observed:{admissible:compare.optimal_admissible_expected_utility,omniscient:compare.omniscient_upper_bound,information_gap:compare.information_gap,net_evsi:row.net_evsi,selected:rank.selected_option},
    oracle:'Direct finite analytic formula reward*max(p,1-p); perfect reveal improves to reward; subtract explicit cost',method_refs:['MHA-0068','MHA-0228','harsanyi'],receipts:{compare,rank}};
  });
 }
 // New bounded family: a noisy pre-action signal is expanded into a finite
 // joint hidden-state/signal model. The retained Harsanyi evaluator selects
 // posterior actions; the fair-bit binary channel has an independent closed
 // form oracle. A coin-flip signal is the no-information negative control,
 // and supplied cost must fit the explicit utility-unit observation budget.
 for(const [accuracy,reward,cost,budget,anchor] of [[0.75,1,0.1,0.1,true],[1,1,0.2,0.1,true],
   ...Array.from({length:rounds},()=>[integer(8,16)/16,integer(1,20),integer(0,20)/10,integer(0,20)/10,false])]){
  await check('stochastic_observation_value',{accuracy,reward,cost,budget},anchor,async()=>{
   const model=hiddenBit(0.5,reward),observations=[noisyReveal(model,'accurate',accuracy,cost),noisyReveal(model,'coin-flip',0.5,0)];
   const receipt=embedded(await rankFiniteStochasticObservations({model,observations,budget}));
   const gross=reward*(accuracy-0.5),net=gross-cost,affordable=cost<=budget,expectedSelected=affordable&&net>0?'accurate':'NO_OBSERVATION';
   const informative=receipt.ranked_observations.find(row=>row.observation_id==='accurate');
   const noise=receipt.ranked_observations.find(row=>row.observation_id==='coin-flip');
   const blocked=receipt.blocked_observations.find(row=>row.observation_id==='accurate');
   return {passed:near(noise?.gross_evsi,0)&&receipt.selected_option===expectedSelected&&
      (affordable?near(informative?.posterior_optimal_expected_utility,reward*accuracy)&&near(informative?.gross_evsi,gross)&&near(informative?.net_evsi,net):blocked?.status==='BLOCKED_OBSERVATION_BUDGET'&&blocked.evaluator_calls===0),
    expected:{prior:reward/2,posterior:reward*accuracy,gross_evsi:gross,net_evsi:net,affordable,selected:expectedSelected},observed:receipt,
    oracle:'Independent fair-bit binary-symmetric-channel formula: prior reward/2; posterior reward*accuracy for accuracy in [0.5,1]; subtract cost only when cost is within the supplied budget. Accuracy 0.5 is the no-information control.',
    method_refs:['MHA-0068','MHA-0228','harsanyi']};
  });
 }
 // New bounded family: quantify unilateral deviation regret for a supplied
 // simultaneous-move strategy profile. The adapter enumerates every pure
 // response exactly; this curriculum independently checks the closed-form
 // matching-pennies family. Uniform play is the equilibrium negative control.
 for(const [reward,rowWeights,columnWeights,anchor] of [[1,[1,1],[1,1],true],[1,[3,1],[1,1],true],
   ...Array.from({length:rounds},()=>[integer(1,20),[integer(1,8),integer(1,8)],[integer(1,8),integer(1,8)],false])]){
  await check('imperfect_information_regret',{reward,rowWeights,columnWeights},anchor,async()=>{
   const receipt=embedded(await evaluateFiniteImperfectInformationRegret({game_id:'fixture:matching-pennies',
    row_payoffs:[[reward,-reward],[-reward,reward]],column_payoffs:[[-reward,reward],[reward,-reward]],
    row_strategy_weights:rowWeights,column_strategy_weights:columnWeights}));
   const [r0,r1]=rowWeights.map(BigInt),[c0,c1]=columnWeights.map(BigInt),scale=BigInt(reward);
   const rowTotal=r0+r1,columnTotal=c0+c1,denominator=rowTotal*columnTotal;
   const rowProfile=scale*((r0*c0+r1*c1)-(r0*c1+r1*c0)),columnProfile=-rowProfile;
   const rowBest=scale*(c0>=c1?c0-c1:c1-c0)*rowTotal;
   const columnBest=scale*(r0>=r1?r0-r1:r1-r0)*columnTotal;
   const expected={denominator:String(denominator),row_profile:String(rowProfile),column_profile:String(columnProfile),
    row_regret:String(rowBest-rowProfile),column_regret:String(columnBest-columnProfile),
    equilibrium_consistent:r0===r1&&c0===c1};
   return {passed:receipt.exact_profile_utility.row.numerator===expected.row_profile&&receipt.exact_profile_utility.column.numerator===expected.column_profile&&
      receipt.exact_regret.row.numerator===expected.row_regret&&receipt.exact_regret.column.numerator===expected.column_regret&&
      receipt.exact_regret.row.denominator===expected.denominator&&receipt.exact_regret.column.denominator===expected.denominator&&
      receipt.equilibrium_consistent===expected.equilibrium_consistent,
    expected,observed:receipt,
    oracle:'Independent matching-pennies closed form over integer strategy weights; compare the supplied profile with both unilateral pure responses. Uniform weights are the exact zero-regret equilibrium control.',
    method_refs:['nash','harsanyi']};
  });
 }
 // New bounded family: choose whether and how far to expand one supplied
 // finite search tree when each expansion both consumes budget and reduces
 // terminal utility. The adapter uses dynamic programming plus native Selten;
 // this curriculum independently enumerates every affordable path. A search
 // whose net value cannot beat stopping is the mandatory negative control.
 for(const [stop,cheapGross,cheapCost,expensiveGross,expensiveCost,budget,anchor] of [
   [5,5,1,6,2,2,true],
   [2,5,1,10,3,1,true],
   ...Array.from({length:rounds},()=>[integer(-4,12),integer(-4,20),integer(1,6),integer(-4,24),integer(1,8),integer(0,10),false])]){
  await check('budget_sensitive_search',{stop,cheapGross,cheapCost,expensiveGross,expensiveCost,budget},anchor,async()=>{
   const receipt=embedded(await evaluateFiniteBudgetSensitiveSearch({search_id:'fixture:budget-search',budget,root:'root',nodes:[
    {id:'root',kind:'SEARCH',stop_utility:stop,expansions:[{id:'cheap',to:'cheap-result',cost:cheapCost},{id:'expensive',to:'expensive-result',cost:expensiveCost}]},
    {id:'cheap-result',kind:'TERMINAL',utility:cheapGross},{id:'expensive-result',kind:'TERMINAL',utility:expensiveGross}
   ]}));
   const candidates=[{id:'STOP',gross:stop,cost:0,net:stop},
    ...(cheapCost<=budget?[{id:'cheap',gross:cheapGross,cost:cheapCost,net:cheapGross-cheapCost}]:[]),
    ...(expensiveCost<=budget?[{id:'expensive',gross:expensiveGross,cost:expensiveCost,net:expensiveGross-expensiveCost}]:[])];
   const expected=candidates.reduce((best,row)=>row.net>best.net?row:best),observedId=receipt.selected_plan.expansion_ids[0]??'STOP';
   return {passed:observedId===expected.id&&receipt.selected_plan.gross_utility===expected.gross&&receipt.selected_plan.computation_cost===expected.cost&&receipt.selected_plan.net_utility===expected.net,
    expected,observed:receipt,
    oracle:'Independent exhaustive enumeration of STOP and both affordable one-step expansions; maximize supplied gross utility minus explicit computation cost, with STOP first on ties. The first anchor makes every search option dominated.',
    method_refs:['selten']};
  });
 }
 // New bounded family: the first computation result can change which second
 // computation is worth buying. The adapter uses exact backward induction and
 // Harsanyi leaf checks; this curriculum independently enumerates every
 // contingent policy. Identically uninformative second-stage options are the
 // mandatory nonadaptive-equivalence control.
 for(const [reward,firstCorrect,secondCost,budget,uninformative,anchor] of [
   [10,3,1,1,false,true],
   [10,3,1,1,true,true],
   ...Array.from({length:rounds},(_,index)=>index%3===0
    ?[11+Math.floor(index/3),3,1,1,false,false]
    :index%3===1?[4+Math.floor(index/3),2,0,0,false,false]
    :[10+Math.floor(index/3),3,2,1,false,false])]){
  await check('adaptive_two_stage_computation',{reward,firstCorrect,secondCost,budget,uninformative},anchor,async()=>{
   const input=adaptiveFixture({reward,firstCorrect,secondCost,budget,uninformative}),oracle=enumerateAdaptiveOracle(input);
   const receipt=embedded(await evaluateFiniteAdaptiveTwoStageChoice(input));
   const observedPolicy=receipt.adaptive_policy.map(row=>[row.first_outcome_id,row.second_choice_id]);
   const controlPass=!uninformative||(receipt.nonadaptive_equivalence&&observedPolicy.every(row=>row[1]==='STOP'));
   return {passed:near(receipt.projected_values.adaptive_net,oracle.adaptive_net)&&near(receipt.projected_values.best_nonadaptive_net,oracle.best_nonadaptive_net)&&
      near(receipt.projected_values.adaptivity_gain,oracle.adaptivity_gain)&&canonical(observedPolicy)===canonical(oracle.adaptive_policy)&&
      receipt.best_nonadaptive_policy.second_choice_id===oracle.best_nonadaptive_choice&&controlPass,
    expected:oracle,observed:receipt,
    oracle:'Independent exhaustive enumeration of every STOP/second-computation choice for each first-stage outcome and every fixed second-stage choice. Identically uninformative options must equal the nonadaptive STOP control.',
    method_refs:['MHA-0228','harsanyi']};
  });
 }
 await check('hidden_policy_rejected',{fair_bit:true,hidden_policy:true},true,async()=>{
  const model=hiddenBit();const policy=model.states.map((s,index)=>({state_id:s.state_id,distribution:[0,1].map(action=>({action_id:'guess'+action,probability:action===index?1:0}))}));
  let observed='ACCEPTED';try{validateFiniteInformationPolicy({model,policy})}catch(error){observed=error.message;}
  return {passed:observed.startsWith('HIDDEN_STATE_DEPENDENT_POLICY'),observed,model,policy,oracle:'Identical visible history requires identical policy; apparent utility1.0 is inadmissible without reveal'};
 });
 await check('decision_relevant_information',{four_states:true},true,async()=>{
  const model=hiddenBit();model.model_id='fixture:decision-relevance';model.states=[0,1,2,3].map(i=>({...clone(model.states[i<2?0:1]),state_id:'h'+i,probability:0.25}));bindSource(model);
  const partitions=[['irrelevant',0.01,[[0,2],[1,3]]],['useful',0.1,[[0,1],[2,3]]],['full',0.6,[[0],[1],[2],[3]]]];
  const observations=partitions.map(([observation_id,cost,groups])=>({...reveal(model,cost),observation_id,partition:groups.map((ids,i)=>({outcome_id:'o'+i,state_ids:ids.map(id=>'h'+id)}))}));
  const receipt=embedded(await rankObservationPartitions({model,observations})),rows=Object.fromEntries(receipt.ranked_observations.map(r=>[r.observation_id,r]));
  return {passed:receipt.selected_option==='useful'&&near(rows.irrelevant.net_evsi,-0.01)&&near(rows.useful.net_evsi,0.4)&&near(rows.full.net_evsi,-0.1),
   observed:receipt,oracle:'Both binary observations reveal one bit, but only useful distinguishes decision classes; expected net values -0.01,0.4,-0.1',method_refs:['MHA-0228','harsanyi']};
 });
 await check('already_known_observation',{repeated_partition:true},true,async()=>{
  const model=hiddenBit();model.states.forEach(s=>s.observable_history.push(s.state_id));bindSource(model);
  const receipt=embedded(await rankObservationPartitions({model,observations:[reveal(model,0)]}));
  return {passed:near(receipt.ranked_observations[0].gross_evsi,0)&&receipt.selected_option==='NO_OBSERVATION',observed:receipt,oracle:'Same information revealed twice supplies zero additional decision value'};
 });
 await check('unavailable_observation',{access:'MISSING'},true,async()=>{
  const model=hiddenBit(),observation=reveal(model);observation.access_state='MISSING';
  const receipt=embedded(await rankObservationPartitions({model,observations:[observation]}));
  return {passed:receipt.blocked_observations.length===1&&receipt.selected_option==='NO_OBSERVATION',observed:receipt,oracle:'An inaccessible reveal cannot improve an admissible current policy'};
 });
 // Retain concrete counterexamples found while this adapter reviewed itself.
 // Same native identity with conflicting revisions, owners or bytes cannot
 // contribute decision value. Labels and cancellation cannot create it either.
 for(const field of ['version','owner','content_sha256'])await check('source_alignment_conflict',{field},true,async()=>{
  const model=hiddenBit(),observation=reveal(model);observation.source_refs=clone(model.source_refs);
  observation.source_refs[0][field]=field==='content_sha256'?sha('conflicting synthetic bytes'):'conflicting-declaration';
  const receipt=embedded(await rankObservationPartitions({model,observations:[observation]}));
  return {passed:receipt.blocked_observations[0]?.status==='BLOCKED_SOURCE_ALIGNMENT_UNRESOLVED'&&receipt.blocked_observations[0].net_evsi===null&&receipt.selected_option==='NO_OBSERVATION',
   observed:receipt,oracle:'A same-native source conflict leaves the reveal unresolved regardless of its attractive hypothetical payoff'};
 });
 for(const tiny of [1e-6,-1e-6,0])for(const label of ['noop:A','noop:Z'])await check('cancellation_noop',{tiny,label},true,async()=>{
  const model=bindSource({model_id:'fixture:cancellation',actor_id:'actor:decision',source_refs:[],assumptions:['All states already visible; one legal action; a constant observation adds no information.'],
   actions:[{action_id:'take',cost:0}],states:[1e6,-1e6,tiny].map((utility,i)=>({state_id:'s'+i,probability:1/3,observable_history:['visible','s'+i],legal_action_ids:['take'],payoffs:[{action_id:'take',utility}]}))});
  const policy=model.states.map(s=>({state_id:s.state_id,distribution:[{action_id:'take',probability:1}]}));
  const observation={...reveal(model,0),observation_id:label,partition:[{outcome_id:label,state_ids:model.states.map(s=>s.state_id)}]};
  const compare=embedded(await compareFiniteDecisions({model,policy})),rank=embedded(await rankObservationPartitions({model,observations:[observation]}));
  const exactValue=rank.ranked_observations[0].numerical_accounting.net_evsi;
  return {passed:compare.information_gap===0&&compare.supplied_policy_regret===0&&exactValue.numerator==='0'&&rank.selected_option==='NO_OBSERVATION',
   receipts:{compare,rank},oracle:'With one action and unchanged information, policy value, admissible optimum and omniscient optimum are identical; no-op EVSI is exactly zero, independent of cancellation and labels'};
 });
 for(const reward of [1e-20,Number.MIN_VALUE])await check('tiny_positive_information',{reward},true,async()=>{
  const model=hiddenBit(0.5,reward),rank=embedded(await rankObservationPartitions({model,observations:[reveal(model,0)]}));
  const exactValue=rank.ranked_observations[0].numerical_accounting.net_evsi;
  return {passed:BigInt(exactValue.numerator)>0n&&rank.selected_option==='reveal'&&
    (reward!==Number.MIN_VALUE||exactValue.projection==='BINARY64_UNDERFLOW;EXACT_FRACTION_RETAINED'),observed:rank,
   oracle:'A free perfect reveal of a fair hidden bit gains exactly half the positive supplied reward; display underflow cannot erase its exact decision ordering'};
 });
 for(const real of [false,true])await check('abstraction_concretization',{real},true,async()=>{
  const input=graphFixture(real),receipt=runFiniteAbstractionRefinement(input);directInvariantCalls+=receipt.iterations.length;const expected=real?'REAL_MODEL_COUNTEREXAMPLE':'FINITE_SUPPLIED_MODEL_VERIFIED';
  return {passed:receipt.status===expected,input,observed:receipt,expected,oracle:real?'Explicit S->A->F witness exists':'S->Q->F splices unreachable B with reachable A; no concrete path exists',method_refs:['finite_invariant','MHA-0069','MHA-0230']};
 });
 await check('incomplete_graph',{transitions_complete:false},true,async()=>{
  const input=graphFixture(false);input.completeness.transitions_complete=false;const receipt=runFiniteAbstractionRefinement(input);directInvariantCalls+=receipt.iterations.length;
  return {passed:receipt.status.startsWith('UNRESOLVED'),input,observed:receipt,oracle:'A missing transition-completeness declaration cannot become a verified finite-model result'};
 });
 // Two independent native methods check the same monotone formula. Shared B
 // retains one identity; all eight three-leaf assignments are anchor controls.
 const gates=['AND','OR'];
 for(const left of gates)for(const right of gates)for(const root of gates)for(let bits=0;bits<8;bits++){
  await check('fault_tree_cut_sets',{left,right,root,bits},true,async()=>{
   const structure=[{id:'R',kind:root,children:['AB','BC']},{id:'AB',kind:left,children:['A','B']},{id:'BC',kind:right,children:['B','C']},...['A','B','C'].map(id=>({id,kind:'LEAF'}))];
   const values=Object.fromEntries(['A','B','C'].map((id,i)=>[id,Boolean(bits&(1<<i))]));
   const cut=await evaluate('minimal_cut_sets',{root:'R',nodes:structure});
   const tree=await evaluate('fault_tree',{root:'R',nodes:structure.map(n=>n.kind==='LEAF'?{id:n.id,value:values[n.id]}:{id:n.id,gate:n.kind,children:n.children})});
   const op=(g,a,b)=>g==='AND'?a&&b:a||b,expected=op(root,op(left,values.A,values.B),op(right,values.B,values.C));
   const fromCuts=cut.result.minimal_cut_sets.some(set=>set.every(id=>values[id]));
   return {passed:tree.result.root_value===expected&&fromCuts===expected,expected,from_cuts:fromCuts,observed:tree.result.root_value,receipts:[cut,tree],oracle:'Direct three-Boolean formula evaluation cross-checked against native FTA and minimal cut sets',method_refs:['fault_tree','minimal_cut_sets']};
  });
 }
 for(let i=0;i<rounds;i++){
  const amount=integer(2,400),onward=integer(0,amount),unit=integer(0,1)?'USD_CENT':'EUR_CENT';
  await check('ledger_conservation',{amount,onward,unit},false,async()=>{
   const accounts=[['A',1000,1000-amount],['B',0,amount-onward],['C',0,onward]].map(([id,opening,observed_closing])=>({id,unit,opening,observed_closing,source_ref:refs[0]}));
   const transfers=[{id:'ab',from:'A',to:'B',amount,source_ref:refs[0]},{id:'bc',from:'B',to:'C',amount:onward,source_ref:refs[0]}];
   const input={accounts,transfers},ledger=await evaluate('ledger',input),conservations=[];
   for(const a of accounts)conservations.push(await evaluate('conservation',{unit,opening:a.opening,inflows:transfers.filter(t=>t.to===a.id).map(t=>t.amount),outflows:transfers.filter(t=>t.from===a.id).map(t=>t.amount),closing:a.observed_closing,tolerance:0}));
   const changed=clone(input);changed.transfers[0].amount++;const negative=await evaluate('ledger',changed);
   const split=clone(input);split.transfers.splice(0,1,{...transfers[0],amount:Math.floor(amount/2),id:'ab1'},{...transfers[0],amount:amount-Math.floor(amount/2),id:'ab2'});split.transfers.reverse();
   const splitResult=await evaluate('ledger',split);
   return {passed:ledger.result.accounts.every(a=>a.residual===0)&&conservations.every(r=>r.result.within_supplied_tolerance)&&negative.result.accounts.filter(a=>a.residual!==0).length===2&&splitResult.result.accounts.every(a=>a.residual===0),
    receipts:{ledger,conservations,negative,split:splitResult},oracle:'Independent per-account debit/credit equation; transfer split+reorder preserves balance; changed amount with stale closes must produce two residuals',method_refs:['ledger','conservation','MHA-0218']};
  });
  const a=integer(1,12),b=integer(1,12);
  await check('nash_expected_utility',{a,b},false,async()=>{
   const equilibrium=await evaluate('nash',{row_payoffs:[[a,0],[0,b]],column_payoffs:[[-a,0],[0,-b]]});
   const mix=equilibrium.result.strict_interior_mixed,probability=b/(a+b),value=a*b/(a+b);
   const utility=await evaluate('harsanyi',{states:[{id:'left',probability:mix.column_probabilities[0]},{id:'right',probability:mix.column_probabilities[1]}],actions:[{id:'row0',payoffs:[a,0]},{id:'row1',payoffs:[0,b]}]});
   return {passed:equilibrium.result.pure_equilibria.length===0&&near(mix.row_probabilities[0],probability)&&near(mix.column_probabilities[0],probability)&&utility.result.values.every(v=>near(v.expected_utility,value)),
    expected:{probability,value},receipts:{equilibrium,utility},oracle:'Analytic zero-sum diagonal 2x2 solution p=q=b/(a+b), value=ab/(a+b); compare utility within IEEE754 tolerance',method_refs:['nash','harsanyi']};
  });
  const payoffs=Array.from({length:4},()=>[integer(-4,8),integer(-4,8)]);
  await check('sequential_backward_induction',{payoffs},false,async()=>{
   const choose=(indexes,player)=>indexes.find(index=>payoffs[index][player]===Math.max(...indexes.map(i=>payoffs[i][player])));
   const left=choose([0,1],1),right=choose([2,3],1),selected=payoffs[left][0]>=payoffs[right][0]?left:right;
   const receipt=await evaluate('selten',{root:'R',nodes:[{id:'R',player:0,children:['L','D']},{id:'L',player:1,children:['t0','t1']},{id:'D',player:1,children:['t2','t3']},...payoffs.map((p,i)=>({id:'t'+i,payoffs:p}))]});
   return {passed:canonical(receipt.result.root_payoffs)===canonical(payoffs[selected]),expected:payoffs[selected],observed:receipt,oracle:'Independent exhaustive two-stage best-response choices; catalog first-child tie rule preserved; perfect information only',method_refs:['selten']};
  });
 }
 const permutations=xs=>xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>j!==i)).map(t=>[x,...t])):[[]];
 for(const order of permutations(['READ','EVALUATE','SAVE']))await check('event_order_crosscheck',{order},true,async()=>{
  const pairs=[['READ','EVALUATE'],['EVALUATE','SAVE']],expected=canonical(order)===canonical(['READ','EVALUATE','SAVE']);
  const partial=await evaluate('partial_order',{events:order.map(id=>({id,source_ref:refs[0]})),precedes:pairs.map(([before,after])=>({before,after,source_ref:refs[0]})),observed_order:order});
  const trace=await evaluate('state_trace',{initial:'EMPTY',transitions:[{from:'EMPTY',event:'READ',to:'SOURCE'},{from:'SOURCE',event:'EVALUATE',to:'MODEL'},{from:'MODEL',event:'SAVE',to:'CHECKPOINT'}],events:order.map(event=>({event,observed_state:{READ:'SOURCE',EVALUATE:'MODEL',SAVE:'CHECKPOINT'}[event],source_ref:refs[0]}))});
  const temporal=await evaluate('temporal',{events:order.map((kind,i)=>({id:kind,subject:'fixture:one',kind,time:1000+10*i,source_ref:refs[0]})),rules:pairs.map(([required_prior,trigger])=>({id:required_prior+':'+trigger,trigger,required_prior,max_age_ms:100,source_ref:refs[0]})),window_start:0,window_end:2000});
  return {passed:(partial.result.violations.length===0)===expected&&trace.result.trace_matches===expected&&temporal.result.checks.every(c=>c.status==='PRIOR_EVENT_PRESENT')===expected,
   expected,receipts:{partial,trace,temporal},oracle:'Only READ then EVALUATE then SAVE satisfies both explicit prerequisites; three distinct method contracts compared',method_refs:['partial_order','state_trace','temporal']};
 });
 const counts=Object.fromEntries([...new Set(native.map(r=>r.method))].sort().map(id=>[id,native.filter(r=>r.method===id).length]));
 if(directInvariantCalls)counts.finite_invariant=directInvariantCalls;
 const passed=cases.filter(c=>c.passed).length,failed=cases.filter(c=>!c.passed),known=new Set([...prior,...cases.filter(c=>c.passed).map(c=>c.case_fingerprint)]);
 if(known.size>65536)throw Error('CURRICULUM_HISTORY_CAP_REACHED_PRESERVE_PRIOR_AND_SPLIT_REVIEW');
 return {version:VERSION,seed,rounds,next_seed:(seed===0xffffffff?1:seed+1),engine_fingerprint,
  status:failed.length?'COUNTEREXAMPLES_REQUIRE_REVIEW':'BOUNDED_SELF_CHALLENGES_PASS',
  summary:{cases_executed:cases.length,passed,failed:failed.length,anchor_replays:cases.filter(c=>c.anchor_regression).length,new_exploratory_cases:cases.filter(c=>c.new_exploratory_case).length,new_coverage_cases:cases.filter(c=>c.new_coverage_case).length,
   duplicates_skipped:skipped.length,distinct_native_evaluators:Object.keys(counts).length,native_evaluator_calls:native.length+directInvariantCalls,native_evaluator_call_counts:counts,
   evaluate_method_entry_calls:native.length,direct_finite_invariant_calls:directInvariantCalls,
   evaluator_count_complete:failed.every(c=>c.evaluator_count_complete!==false),
   catalog_candidates:methods.length,catalog_relations:links.relationships.length,catalog_methods_promoted:0,local_adapter_cases:cases.filter(c=>['information_value','stochastic_observation_value','imperfect_information_regret','budget_sensitive_search','adaptive_two_stage_computation','hidden_policy_rejected','decision_relevant_information','already_known_observation','unavailable_observation','source_alignment_conflict','cancellation_noop','tiny_positive_information','abstraction_concretization','incomplete_graph'].includes(c.family)).length},
  cases,skipped,counterexamples:failed,seen_case_fingerprints:[...known].sort(),
  next_action:failed.length?'Replay and minimize the saved concrete counterexamples before changing the implementation.':'Replay anchor regressions and vary bounded cases, then review robust observation choice under interval-bounded likelihood uncertainty with an endpoint oracle and zero-width equivalence control.',
  limitations:{generated_synthetic_models_only:true,held_out_generalization_established:false,full_cfr:false,source_authentication:false,canonical_promotion:false,external_actions:false,
   adaptive_method_invention:false,exploration:'SEEDED_PARAMETER_VARIATION_WITH_ANCHOR_REPLAY;NEW_FAMILIES_REQUIRE_VERSIONED_CODE_AND_REVIEW',
   receipt_counts:'Actual native calls captured directly and from adapter receipts; planner calls and local graph adapter operations are separate.'}};
}
