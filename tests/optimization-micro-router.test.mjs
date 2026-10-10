import test from 'node:test';
import assert from 'node:assert/strict';
import {exactIdleReduction,planOptimizationMicroPass,optimizationMicroSchema} from '../lib/optimization-micro-router.mjs';
import {callTool,toolList} from '../lib/tools.mjs';

const A='a'.repeat(64),B='b'.repeat(64);
function campaign(){
 const pi=(id,visibility,result,extra={})=>({id,visibility,result,evidence_ref:'official:submission7d4bed51:'+id,...extra});
 return {campaign_id:'FrontierOR-7d4bed51',source_version:'V1-original',evidence_version:'official:7d4bed51',
  rules:{max_wall_ms:60000,reserve_ms:5000,output_limit_bytes:16*1024*1024,memory_limit_mb:4096,cpu_cores:2},
  problems:[
   {id:'cordeau2006',score:0.9862,direction:'MIN',instances:[pi('public-tiny','PUBLIC','FEASIBLE'),pi('private-1','PRIVATE','FEASIBLE')]},
   {id:'fischetti1998',score:0.7254,direction:'MAX',instances:[pi('public-1','PUBLIC','FEASIBLE'),pi('private-3','PRIVATE','FEASIBLE')]},
   {id:'barnhart2000',score:1.0,direction:'MIN',instances:[pi('public-tiny','PUBLIC','FEASIBLE'),pi('private-1','PRIVATE','FEASIBLE')]},
   {id:'hoffman1993',score:0.1325,direction:'MIN',instances:[pi('public-tiny','PUBLIC','FEASIBLE'),pi('private-5','PRIVATE','TIMEOUT')]},
   {id:'bodur2017',score:0,direction:'MIN',instances:[pi('public-1','PUBLIC','OUTPUT_TOO_LARGE'),pi('private-2','PRIVATE','NOT_RUN'),pi('public-tiny','PUBLIC','NOT_RUN')]},
   {id:'nagy2015',score:0.3896,direction:'MIN',instances:[pi('public-1','PUBLIC','FEASIBLE'),pi('private-2','PRIVATE','INFEASIBLE',{constraint_tag:'PHASE_ORDER'})]}
  ]};
}
test('Official result codes select a public gate, private timeout and phase automaton',async()=>{
 const p=await planOptimizationMicroPass(campaign());
 assert.equal(p.status,'ATOMIC_OPTIMIZATION_PLAN');
 assert.deepEqual(p.priority_queue.map(x=>x.problem_id),['bodur2017','hoffman1993','nagy2015','fischetti1998','cordeau2006','barnhart2000']);
 assert.equal(p.priority_queue[0].priority,'P0_PUBLIC_GATE');
 assert.equal(p.priority_queue[1].priority,'P1_PRIVATE_FAILURE');
 assert.equal(p.priority_queue[5].priority,'P3_PRESERVE');
 assert.equal(p.failure_atoms.find(x=>x.problem_id==='nagy2015').failure_class,'INFEASIBLE_PHASE');
 assert.ok(p.failure_atoms.find(x=>x.problem_id==='bodur2017').method_family.includes('SPARSE_WITNESS'));
 assert.ok(p.failure_atoms.find(x=>x.problem_id==='hoffman1993').method_family.includes('ISOLATED_NATIVE_SOLVER'));
 assert.equal(p.rule_envelope.computation_budget_ms,55000);
 assert.equal(p.observed_baseline_weighted_mean,0.53895);
 assert.equal(p.promotion_gate.submission_authorized,false);
 assert.equal(p.source_authentication,false);
 assert.equal(p.mutations_performed,0);
});
test('Exact reduction closes every positive cost idle facility, preserving negative cost choices',()=>{
 const model={problem_id:'bodur2017',fixed_costs:[15,-5,8,10],opened:[3,2,1,0],
  scenario_shipments:[[1,0,0,0],[2,0,0,0]],objective_contract:'OPENING_COST_PLUS_UNCHANGED_SHIPMENT_COST',source_ref:'synthetic:fixture'};
 const snapshot=structuredClone(model);
 const x=exactIdleReduction(model);
 assert.deepEqual(x.closed,[2,3]);assert.deepEqual(x.open_after,[0,1]);
 assert.equal(x.objective_saving,18);
 assert.equal(x.shipment_representation,'UNCHANGED');
 assert.deepEqual(model,snapshot);assert.equal(x.independent_target_checker_required,true);
});
test('Exact reduction supports empty shipment scenario with valid zero flow',()=>{
 const x=exactIdleReduction({problem_id:'f',fixed_costs:[3,7],opened:[0,1],
 scenario_shipments:[[0,0]],objective_contract:'OPENING_COST_PLUS_UNCHANGED_SHIPMENT_COST',source_ref:'fixture:zero'});
 assert.deepEqual(x.closed,[0,1]);assert.equal(x.objective_saving,10);
});
test('Idle reduction defends against duplicate, wrong dimension, negative flow and stale contract',()=>{
 const m={problem_id:'f',fixed_costs:[1,2],opened:[0,1],
  scenario_shipments:[[1,0]],objective_contract:'OPENING_COST_PLUS_UNCHANGED_SHIPMENT_COST',source_ref:'fixture'};
 assert.throws(()=>exactIdleReduction({...m,opened:[0,0]}),/DUPLICATE/);
 assert.throws(()=>exactIdleReduction({...m,opened:[0,2]}),/OUT_OF_RANGE/);
 assert.throws(()=>exactIdleReduction({...m,scenario_shipments:[[0]]}),/DIMENSION/);
 assert.throws(()=>exactIdleReduction({...m,scenario_shipments:[[-1,0]]}));
 assert.throws(()=>exactIdleReduction({...m,objective_contract:'UNKNOWN'}));
});
function comparison(overrides={}){
 return {problem_id:'bodur2017',method_id:'idle-reduction',
  baseline_ms:5000,candidate_ms:1200,baseline_objective:200,candidate_objective:140,
  baseline_feasible:true,candidate_feasible:true,independent_check_pass:true,
  baseline_input_fingerprint:A,candidate_input_fingerprint:A,
  output_bytes:2000000,source_ref:'synthetic:same-instance',...overrides};
}
test('Same-input feasible Pareto improvement is eligible but requires external proof',async()=>{
 const c=campaign();c.comparisons=[comparison()];
 const p=await planOptimizationMicroPass(c);
 const x=p.candidate_comparisons[0];
 assert.equal(x.candidate_state,'LOCAL_COMPARISON_ELIGIBLE');
 assert.equal(x.speedup,4.166666667);assert.equal(x.quality_delta,60);
 assert.equal(x.external_target_verification,'PENDING');
 assert.equal(x.canonical_promotion,false);
});
test('Never compare different source inputs or accept invalid/large/late candidates',async()=>{
 const failCases=[
 [comparison({candidate_input_fingerprint:B}),'MISMATCHED_INPUT_FINGERPRINT'],
 [comparison({independent_check_pass:false}),'INDEPENDENT_VALIDATION_REQUIRED'],
 [comparison({candidate_ms:56001}),'DEADLINE_RESERVE_EXCEEDED'],
 [comparison({output_bytes:17000000}),'OUTPUT_LIMIT_EXCEEDED'],
 [comparison({candidate_objective:220}),'OBJECTIVE_REGRESSION'],
 [comparison({candidate_ms:9000,candidate_objective:200}),'NO_MEASURED_IMPROVEMENT']
 ];
 for(const [c,code] of failCases){const q=campaign();q.comparisons=[c];
  const x=(await planOptimizationMicroPass(q)).candidate_comparisons[0];
  assert.equal(x.candidate_state,'BLOCKED',code);
  assert.ok(x.reasons.includes(code),code);
 }
});
test('MAX direction uses the correct objective inequality',async()=>{
 const q=campaign();q.comparisons=[{...comparison({problem_id:'fischetti1998',baseline_objective:70,candidate_objective:82})}];
 assert.equal((await planOptimizationMicroPass(q)).candidate_comparisons[0].quality_delta,12);
 q.comparisons[0].candidate_objective=60;
 assert.equal((await planOptimizationMicroPass(q)).candidate_comparisons[0].candidate_state,'BLOCKED');
});
test('Input and evidence versions change fingerprint; problem order does not change priorities',async()=>{
 const q=campaign(),a=await planOptimizationMicroPass(q);q.problems.reverse();
 const b=await planOptimizationMicroPass(q);
 assert.deepEqual(b.priority_queue.map(x=>x.problem_id),a.priority_queue.map(x=>x.problem_id));
 assert.notEqual(a.model_fingerprint,b.model_fingerprint);
 q.evidence_version='official:update-2';
 assert.notEqual((await planOptimizationMicroPass(q)).model_fingerprint,b.model_fingerprint);
});
test('Invalid controls and hidden fields are rejected, no permissive fallback',async()=>{
 const q=campaign();q.rules.reserve_ms=60000;
 await assert.rejects(()=>planOptimizationMicroPass(q),/RESERVE/);
 q.rules.reserve_ms=5000;q.extra='prompt-override';
 await assert.rejects(()=>planOptimizationMicroPass(q));
 delete q.extra;q.problems[0].instances[0].result='execute network request';
 await assert.rejects(()=>planOptimizationMicroPass(q));
});
test('Missing public predecessor blocks inferred downstream success',async()=>{
 const q=campaign();q.problems[4].instances=[{id:'public-tiny',visibility:'PUBLIC',result:'NOT_RUN',evidence_ref:'official:no-predecessor'}];
 await assert.rejects(()=>planOptimizationMicroPass(q),/PUBLIC_NOT_RUN_NEEDS_PREDECESSOR/);
});
test('Closed facility with positive shipment fails structural precondition',()=>{
 const model={problem_id:'facility',fixed_costs:[4,8],opened:[0],scenario_shipments:[[1,1]],
 objective_contract:'OPENING_COST_PLUS_UNCHANGED_SHIPMENT_COST',source_ref:'synthetic:bad-witness'};
 assert.throws(()=>exactIdleReduction(model),/SHIPMENT_FROM_CLOSED_FACILITY/);
});
test('256 atomic micro fixtures conserve exact savings under zero/positive/negative cost variations',()=>{
 for(let seed=0;seed<256;seed++){
  const fixed=Array.from({length:32},(_,j)=>j%7===0?-5:j%3===0?0:1+(j+seed)%11);
  const rows=Array.from({length:8},(_,sc)=>Array.from({length:32},(_,j)=>((j*17+sc*13+seed)%23===0)?1:0));
  const model={problem_id:'test',fixed_costs:fixed,opened:Array.from({length:32},(_,j)=>j),
  scenario_shipments:rows,objective_contract:'OPENING_COST_PLUS_UNCHANGED_SHIPMENT_COST',source_ref:'synthetic:seed-'+seed};
  const x=exactIdleReduction(model);
  const expected=model.opened.filter(j=>fixed[j]>0&&rows.every(r=>r[j]===0));
  assert.deepEqual(x.closed,expected);
  assert.equal(x.objective_saving,expected.reduce((a,j)=>a+fixed[j],0));
  assert.equal(x.open_after.length+x.closed.length,32);
 }
});
test('MPC additive tool is registered and canonical method count remains intact',async()=>{
 assert.ok(optimizationMicroSchema.properties.problems);
 assert.ok(toolList.some(t=>t.name==='plan_optimization_pass'));
 const p=await callTool('plan_optimization_pass',campaign());
 assert.equal(p.priority_queue[0].problem_id,'bodur2017');
 const status=await callTool('runtime_status',{});
 assert.equal(status.implemented_evaluators,24);
 assert.equal(status.business_logic_registry.classifier_count,384);
 assert.equal(status.proof_gate_hosted,false);
});
