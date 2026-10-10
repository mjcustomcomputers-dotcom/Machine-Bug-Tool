#!/usr/bin/env node
// MPC V31 source-owned, entirely synthetic methods-versus-methods laboratory.
import {reviewEngineeringMethodLabV30} from '../lib/mpc-workspace-method-lab-v30.mjs';
import {methodLabSyntheticExampleV30} from '../desktop/renderer/method-lab.js';
import {auditMethodPortfolioV31} from '../lib/mpc-v31-diagnostic-methods.mjs';
const project_id='PROJECT-V31-SYNTHETIC';
const run=operation=>reviewEngineeringMethodLabV30({
 opt_in:true,project_id,operation,
 input:methodLabSyntheticExampleV30(operation,project_id)
});
const comparison=run('REASONING_DUEL');
const abduction=run('ABDUCTIVE_EXPLANATIONS');
const diagnosis=run('DIAGNOSIS_HITTING_SETS');
const sourceModel=methodLabSyntheticExampleV30('REASONING_DUEL',project_id);
const tampered=structuredClone(comparison.computation);
tampered.selected_method='INVENTED_METHOD';
tampered.workload_metrics.forward_rule_checks=0;
const negative=auditMethodPortfolioV31(sourceModel,tampered);
if(comparison.independent_audit.state!=='SOURCE_BOUND_METHOD_TOURNAMENT_REPLAY_MATCH'||
 comparison.computation.counterfactual_cuts.candidate_cuts.length!==2||
 abduction.computation.explanations.length!==2||
 diagnosis.computation.diagnoses.length!==2||
 negative.state!=='METHOD_TOURNAMENT_RECEIPT_REJECTED')
 throw Error('V31_INDEPENDENT_REASONING_ORACLE_FAILED');
console.log(JSON.stringify({
 kind:'MPC_V31_METHODS_VS_METHODS_SYNTHETIC_PASS',
 source_commit:sourceModel.source_commit,
 selected_method:comparison.computation.selected_method,
 forward_goal:comparison.computation.bidirectional_receipt.forward.status,
 reverse_goal:comparison.computation.bidirectional_receipt.backward.status,
 exact_source_supports:
  comparison.computation.bidirectional_receipt.forward.goal_minimal_fact_supports,
 proof_duality:comparison.computation.bidirectional_receipt.state,
 independent_method_audit:comparison.independent_audit.state,
 adversarial_tamper_result:negative.state,
 minimal_source_retractions:comparison.computation.counterfactual_cuts.candidate_cuts.map(
  x=>x.withdraw_fact_ids),
 alternate_abductions:abduction.computation.explanations.map(x=>({
  assumption_ids:x.assumption_ids,cost:x.cost
 })),
 minimum_conflict_diagnoses:diagnosis.computation.diagnoses.map(x=>({
  assumption_ids:x.assumption_ids,cost:x.declared_cost
 })),
 workspace_operations_enabled:3,
 comparison:comparison.compact_output,
 native_registry_mutations:0,network_actions:0,canonical_promotion:false
},null,2));
