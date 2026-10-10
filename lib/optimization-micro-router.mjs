/**
 * Solid-state optimization micro-router, additive to the existing MPC UMTB-4.
 * A finite, deterministic supplied-record planner and exact reduction.
 * It invokes no solver, network, filesystem, connector, or deployment.
 *
 * Method changes originate in the FrontierOR 2026-10-10 public/private results.
 * Source pointers: docs/optimization-micro-router.md.
 */
import {validate} from './schema.mjs';
import {digest} from './universal.mjs';

const id={type:'string',minLength:1,maxLength:160};
const pos={type:'number',minimum:0,maximum:1e15};
const int=(min,max)=>({type:'integer',minimum:min,maximum:max});
const str=(max=500)=>({type:'string',minLength:1,maxLength:max});
const en=(...items)=>({type:'string',enum:items});
const arr=(items,min=0,max=64)=>({type:'array',items,minItems:min,maxItems:max});
const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});

export const optimizationMicroSchema=obj({
 campaign_id:id,
 source_version:id,
 evidence_version:id,
 rules:obj({
  max_wall_ms:int(1000,600000),reserve_ms:int(1,100000),
  output_limit_bytes:int(1,1000000000),memory_limit_mb:int(64,262144),
  cpu_cores:int(1,128)
 }),
 problems:arr(obj({
  id,
  score:{type:'number',minimum:0,maximum:2},
  direction:en('MIN','MAX'),
  instances:arr(obj({
   id,visibility:en('PUBLIC','PRIVATE'),
   result:en('FEASIBLE','INFEASIBLE','TIMEOUT','OUTPUT_TOO_LARGE','INVALID_FORMAT','OBJECTIVE_MISMATCH','NOT_RUN','UNKNOWN'),
   evidence_ref:str(1000),
   constraint_tag:en('PHASE_ORDER','CAPACITY','TIME_WINDOW','PRECEDENCE','COVERAGE','FLOW','OTHER')
  },['id','visibility','result','evidence_ref']),1,64)
 }),1,24),
 comparisons:arr(obj({
  problem_id:id,method_id:id,
  baseline_ms:pos,candidate_ms:pos,
  baseline_objective:{type:'number',minimum:-1e15,maximum:1e15},
  candidate_objective:{type:'number',minimum:-1e15,maximum:1e15},
  baseline_feasible:{type:'boolean'},candidate_feasible:{type:'boolean'},
  independent_check_pass:{type:'boolean'},
  baseline_input_fingerprint:str(128),candidate_input_fingerprint:str(128),
  output_bytes:int(0,1000000000),source_ref:str(1000)
 }),0,64),
 exact_idle_models:arr(obj({
  problem_id:id,
  fixed_costs:arr({type:'number',minimum:-1e9,maximum:1e9},1,256),
  opened:arr(int(0,255),1,256),
  scenario_shipments:arr(arr(pos,1,256),1,64),
  objective_contract:en('OPENING_COST_PLUS_UNCHANGED_SHIPMENT_COST'),
  source_ref:str(1000)
 }),0,8)
},['campaign_id','source_version','evidence_version','rules','problems']);

const ROUTES=Object.freeze({
 OUTPUT_TOO_LARGE:{classifier_ids:['BL24.01','BL24.05'],methods:['SPARSE_WITNESS','ZERO_ENTRY_ABLATION','SERIALIZATION_BUDGET'],inverse:'DENSE_VS_SPARSE_RECONSTRUCTION',oracle:'Reconstruct all implicit zeros; compare full original mathematical witness; enforce output byte limit.'},
 TIMEOUT:{classifier_ids:['BL24.07','BL24.06'],methods:['DEADLINE_RESERVE','ISOLATED_NATIVE_SOLVER','BOUNDED_FEASIBILITY_FIRST'],inverse:'LP_FIRST_VS_MILP_FIRST',oracle:'Enforce external hard timeout; verify feasible incumbent and clean exit under CPU/memory limits.'},
 INFEASIBLE_PHASE:{classifier_ids:['BL22.06','BL24.05'],methods:['PHASE_AUTOMATON','PAIRWISE_EDGE_FALSIFIER','SAFE_MOVE_FILTER'],inverse:'BACKHAUL_TO_LINEHAUL_MIRROR',oracle:'Reject every forbidden phase edge, even if load capacity holds.'},
 INFEASIBLE:{classifier_ids:['BL22.05','BL24.05'],methods:['CONSTRAINT_MINIMIZATION','INDEPENDENT_FEASIBILITY_CHECK','FEASIBLE_INCUMBENT'],inverse:'MINIMAL_VIOLATED_CONSTRAINT',oracle:'Independently recompute all constraints on each synthetic candidate.'},
 INVALID_FORMAT:{classifier_ids:['BL24.01'],methods:['SCHEMA_ORACLE','SERIALIZE_PARSE_RECONSTRUCT'],inverse:'REQUIRED_FIELD_DELETION',oracle:'Round-trip official output schema; vary empty and large witnesses.'},
 OBJECTIVE_MISMATCH:{classifier_ids:['BL24.05','BL22.06'],methods:['OBJECTIVE_DUAL_ORACLE','COEFFICIENT_PERTURBATION'],inverse:'INPUT_OBJECTIVE_VS_OUTPUT_OBJECTIVE',oracle:'Recompute official objective from output only; vary a coefficient independently.'},
 NOT_RUN:{classifier_ids:['BL24.07'],methods:['PUBLIC_GATE_PREDECESSOR','CAUSAL_DEPENDENCY_TRACE'],inverse:'UPSTREAM_FAILURE_REPLAY',oracle:'Restore failing public predecessor before evaluating downstream instances.'},
 UNKNOWN:{classifier_ids:['BL22.01'],methods:['EVIDENCE_ACQUISITION','MINIMAL_MICRO_FIXTURE'],inverse:'BEST_COMPETING_EXPLANATION',oracle:'Obtain typed evaluator result for the exact source and version.'},
 QUALITY:{classifier_ids:['BL22.06','BL24.05'],methods:['PARETO_PORTFOLIO','INVARIANT_PRESERVING_REDUCTION','PERTURB_AND_REPAIR'],inverse:'BASELINE_VS_CANDIDATE_ABLATION',oracle:'Compare independently feasible same-input objectives, runtime and resource usage.'}
});
const codeOf=i=>i.result==='INFEASIBLE'&&i.constraint_tag==='PHASE_ORDER'?'INFEASIBLE_PHASE':i.result==='FEASIBLE'?'QUALITY':i.result;
const fail=m=>{throw Error(m)};
const unique=(xs,where)=>{if(new Set(xs).size!==xs.length)fail('DUPLICATE_'+where)};
const stable=(a,b)=>a.localeCompare(b,'en');
const round=(x)=>Math.round(x*1e9)/1e9;

export function exactIdleReduction(model){
 // Exact conservation for facility models with opening costs plus unchanged shipments.
 // The caller must independently check any candidate in the target's full constraints.
 validate(model,optimizationMicroSchema.properties.exact_idle_models.items);
 const {fixed_costs,opened,scenario_shipments}=model;
 unique(opened,'OPEN_FACILITY_INDEX');
 if(opened.some(i=>i>=fixed_costs.length))fail('OPEN_FACILITY_OUT_OF_RANGE');
 for(const row of scenario_shipments){
  if(row.length!==fixed_costs.length)fail('SCENARIO_FACILITY_DIMENSION');
  if(row.some(v=>!Number.isFinite(v)||v<0))fail('INVALID_SHIPMENT');
 }
 // One linear scan of the scenario-facility projection. No tensor reallocation.
 const active=new Uint8Array(fixed_costs.length);
 for(const row of scenario_shipments)for(let i=0;i<row.length;i++)if(row[i]>0)active[i]=1;
 const closed=opened.filter(i=>active[i]===0&&fixed_costs[i]>0).sort((a,b)=>a-b);
 const closedSet=new Set(closed);
 const remaining=opened.filter(i=>!closedSet.has(i)).sort((a,b)=>a-b);
 const saved=closed.reduce((sum,i)=>sum+fixed_costs[i],0);
 return {problem_id:model.problem_id,operator:'REMOVE_IDLE',
  open_before:[...opened].sort((a,b)=>a-b),open_after:remaining,
  closed,objective_saving:round(saved),shipment_representation:'UNCHANGED',
  evidence_ref:model.source_ref,
  proof_scope:'DECLARED_OPENING_PLUS_UNCHANGED_SHIPMENT_COST',
  independent_target_checker_required:true,
  baseline_witness_mutated:false};
}

function classifyProblem(p){
 const atoms=p.instances.filter(i=>i.result!=='FEASIBLE').map(i=>{
  const failure_class=codeOf(i),route=ROUTES[failure_class];
  return {atom_id:p.id+':'+i.id,problem_id:p.id,instance_id:i.id,visibility:i.visibility,
   failure_class,source_ref:i.evidence_ref,
   classifier_candidates:route.classifier_ids,method_family:route.methods,
   inverse_mirror:route.inverse,smallest_oracle:route.oracle,
   epistemic_state:'OBSERVED_SUPPLIED_RESULT',external_checker_confirmed_by_tool:false};
 });
 let gate=atoms.some(x=>x.visibility==='PUBLIC'&&x.failure_class!=='NOT_RUN');
 let privateFailure=atoms.some(x=>x.visibility==='PRIVATE'&&x.failure_class!=='NOT_RUN');
 const tier=gate?0:privateFailure?1:p.score<1?2:3;
 const gap=round(Math.max(0,1-p.score));
 // Gate urgency outranks approximation quality. Gap breaks ties within a tier.
 return {problem_id:p.id,baseline_score:p.score,reference_gap:gap,tier,
  priority:gate?'P0_PUBLIC_GATE':privateFailure?'P1_PRIVATE_FAILURE':p.score<1?'P2_QUALITY':'P3_PRESERVE',
  observed_failures:atoms,
  selected_methods:[...new Set((atoms.length?atoms:[{method_family:ROUTES.QUALITY.methods}]).flatMap(a=>a.method_family))],
  method_selection_basis:'OBSERVED_FAILURE_CLASS_AND_DECLARED_ORACLE',
  source_integrity:'SOURCE_VERSION_PINNED_BY_CALLER'};
}

function compareCandidate(c,rules,problems){
 const target=problems.find(x=>x.id===c.problem_id);if(!target)fail('UNKNOWN_COMPARISON_PROBLEM');
 if(!/^[0-9a-f]{64}$/.test(c.baseline_input_fingerprint)||!/^[0-9a-f]{64}$/.test(c.candidate_input_fingerprint))fail('INVALID_INPUT_FINGERPRINT');
 const sameInput=c.baseline_input_fingerprint===c.candidate_input_fingerprint;
 const feasible=Boolean(c.candidate_feasible&&c.independent_check_pass);
 const withinBudget=c.candidate_ms<=rules.max_wall_ms-rules.reserve_ms;
 const withinOutput=c.output_bytes<=rules.output_limit_bytes;
 const delta=target.direction==='MIN'?c.baseline_objective-c.candidate_objective:c.candidate_objective-c.baseline_objective;
 const qualityImproved=delta>1e-8;
 const qualityNotWorse=delta>=-1e-8;
 const faster=c.candidate_ms+1e-7<c.baseline_ms;
 const improved=!c.baseline_feasible||qualityImproved||(qualityNotWorse&&faster);
 const guarded=sameInput&&feasible&&withinBudget&&withinOutput&&improved&&(c.baseline_feasible?qualityNotWorse:true);
 const reasons=[];
 if(!sameInput)reasons.push('MISMATCHED_INPUT_FINGERPRINT');
 if(!feasible)reasons.push('INDEPENDENT_VALIDATION_REQUIRED');
 if(!withinBudget)reasons.push('DEADLINE_RESERVE_EXCEEDED');
 if(!withinOutput)reasons.push('OUTPUT_LIMIT_EXCEEDED');
 if(c.baseline_feasible&&!qualityNotWorse)reasons.push('OBJECTIVE_REGRESSION');
 if(!improved)reasons.push('NO_MEASURED_IMPROVEMENT');
 return {problem_id:c.problem_id,method_id:c.method_id,source_ref:c.source_ref,
  same_input:sameInput,independently_checked:feasible,within_deadline:withinBudget,within_output_limit:withinOutput,
  quality_delta:round(delta),speedup:c.candidate_ms>0?round(c.baseline_ms/c.candidate_ms):null,
  candidate_state:guarded?'LOCAL_COMPARISON_ELIGIBLE':'BLOCKED',
  reasons,external_target_verification:'PENDING',canonical_promotion:false};
}

export async function planOptimizationMicroPass(input){
 validate(input,optimizationMicroSchema);
 const {rules,problems}=input;
 if(rules.reserve_ms>=rules.max_wall_ms)fail('RESERVE_EXCEEDS_HARD_DEADLINE');
 unique(problems.map(p=>p.id),'PROBLEM_ID');
 for(const p of problems){
  unique(p.instances.map(i=>i.id),'INSTANCE_ID');
  if(p.instances.some(i=>i.result==='NOT_RUN'&&i.visibility==='PUBLIC')&&!p.instances.some(i=>i.visibility==='PUBLIC'&&i.result!=='FEASIBLE'&&i.result!=='NOT_RUN'))fail('PUBLIC_NOT_RUN_NEEDS_PREDECESSOR');
 }
 const priorities=problems.map(classifyProblem).sort((a,b)=>a.tier-b.tier||b.reference_gap-a.reference_gap||stable(a.problem_id,b.problem_id));
 const models=input.exact_idle_models||[],comparisons=input.comparisons||[];
 for(const m of models)if(!problems.some(p=>p.id===m.problem_id))fail('UNKNOWN_REDUCTION_PROBLEM');
 const reductions=models.map(exactIdleReduction);
 const checked=comparisons.map(c=>compareCandidate(c,rules,problems));
 const atoms=priorities.flatMap(p=>p.observed_failures);
 return {
  status:'ATOMIC_OPTIMIZATION_PLAN',
  version:'MPC-SS-OPT-1.0',
  campaign_id:input.campaign_id,
  source_version:input.source_version,
  evidence_version:input.evidence_version,
  model_fingerprint:await digest(input),
  observed_baseline_weighted_mean:round(problems.reduce((s,p)=>s+p.score,0)/problems.length),
  reference_gap_mean:round(problems.reduce((s,p)=>s+Math.max(0,1-p.score),0)/problems.length),
  rule_envelope:{...rules,computation_budget_ms:rules.max_wall_ms-rules.reserve_ms},
  priority_queue:priorities.map(({tier,...rest})=>rest),
  failure_atoms:atoms,
  exact_reductions:reductions,
  candidate_comparisons:checked,
  next_methods:priorities.filter(p=>p.priority!=='P3_PRESERVE').map(p=>({problem_id:p.problem_id,method_families:p.selected_methods,requires_public_or_private_replay:true})),
  promotion_gate:{source_pin_required:true,public_checker_required:true,private_score_unavailable:true,
   candidate_verified_in_organizer:false,submission_authorized:false},
  methodology:['ACQUIRE_NATIVE_RESULT','SPLIT_ATOMS','ROUTE_BY_FAILURE','MICRO_COUNTEREXAMPLES','INVERT_AND_COMPARE','MEASURE_PARETO','INDEPENDENT_ORACLE','REPLAY_UNDER_RESOURCE_LIMITS'],
  scope:'CALLER_SUPPLIED_MODELS_AND_RESULTS',
  mutations_performed:0,source_authentication:false,canonical_promotion:false,external_action_authorized:false
 };
}
