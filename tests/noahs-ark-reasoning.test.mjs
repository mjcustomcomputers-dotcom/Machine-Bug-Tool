import test from 'node:test';
import assert from 'node:assert/strict';
import {planNoahsArkReasoning,arkReasoningContract} from '../lib/noahs-ark-reasoning.mjs';
import first from '../method-atlas/candidates.json' with {type:'json'};
import v2 from '../method-atlas/expansion-2026-v2.json' with {type:'json'};
import v3 from '../method-atlas/expansion-evidence-intent-v3.json' with {type:'json'};
import v4 from '../method-atlas/expansion-computation-schools-v4.json' with {type:'json'};
import v5 from '../method-atlas/expansion-nasa-chip-cloud-v5.json' with {type:'json'};
import v6 from '../method-atlas/expansion-abnormal-meta-v6.json' with {type:'json'};
import v8 from '../method-atlas/expansion-optical-v8.json' with {type:'json'};
import links from '../method-atlas/method-relations.json' with {type:'json'};
const methods=[first,v2,v3,v4,v5,v6,v8].flatMap(x=>x.methods);
const atom={subject_id:'fixture:transaction',atom_id:'fixture:ledger',dimensions:['MONEY','FINALITY'],source_refs:['fixture:owned-ledger'],external_source_refs:[]};
const receipts=[
 {method_id:'MHA-0052',input_state:'AVAILABLE',negative_control_state:'AVAILABLE',falsifier_state:'AVAILABLE',estimated_cost_units:1},
 {method_id:'MHA-0053',input_state:'AVAILABLE',negative_control_state:'AVAILABLE',falsifier_state:'AVAILABLE',estimated_cost_units:2},
 {method_id:'MHA-0036',input_state:'AVAILABLE',negative_control_state:'AVAILABLE',falsifier_state:'AVAILABLE',estimated_cost_units:3}
];
const run=(overrides={})=>planNoahsArkReasoning({methods,relations:links.relationships,atom,method_receipts:receipts,max_selected:4,max_pairs:4,...overrides});

test('Noah full-ark covers all 239 candidates without executing any',()=>{
 const x=run();
 assert.equal(x.outcome_vector.catalog_methods_considered,239);
 assert.equal(x.method_consideration.length,239);
 assert.equal(x.outcome_vector.covered_dimensions.length,2);
 assert.equal(x.reasoning_layers.length,7);
 assert.equal(x.no_method_executed,true);
 assert.equal(x.target_actions_performed,false);
 assert.equal(arkReasoningContract.claimed_global_optimum,false);
 assert.equal(x.status,'EVIDENCE_REVIEW_PLAN_ONLY');
});
test('Falsifier and negative controls with source readiness outrank unready candidate',()=>{
 const x=run();
 assert.ok(x.selected_methods.some(m=>m.method_id==='MHA-0053'));
 assert.ok(x.selected_methods.every(m=>m.decision==='STRUCTURAL_METHOD_CANDIDATE'));
 assert.equal(x.outcome_vector.negative_controls_declared_ready,x.selected_methods.length);
 assert.ok(x.deferred_methods.some(m=>m.decision==='NEEDS_INPUT_SCHEMA_REVIEW'));
});
test('A proposed challenge remains a separate unexecuted and nonindependent method',()=>{
 const x=run();
 assert.ok(x.proposed_pairs.length>0);
 assert.ok(x.proposed_pairs.every(p=>p.native_evidence_independence==='NOT_ESTABLISHED'&&!p.challenger_executed));
 assert.equal(x.independent_evidence_proven,false);
});
test('Input order and relation order do not change selected methods or pair relationships',()=>{
 const x=run(),y=run({methods:[...methods].reverse(),relations:[...links.relationships].reverse()});
 assert.deepEqual(x.selected_methods.map(m=>m.method_id),y.selected_methods.map(m=>m.method_id));
 assert.deepEqual(x.proposed_pairs.map(m=>[m.primary_method_id,m.challenger_method_id]),y.proposed_pairs.map(m=>[m.primary_method_id,m.challenger_method_id]));
});
test('Missing native source or method inputs block selection but preserve full accounting',()=>{
 const a=run({atom:{...atom,source_refs:[]}});
 assert.equal(a.status,'BLOCKED_NATIVE_SOURCE');
 assert.equal(a.selected_methods.length,0);
 assert.equal(a.method_consideration.length,239);
 const b=run({method_receipts:[]});
 assert.equal(b.status,'BLOCKED_NO_READY_METHOD');
 assert.equal(b.outcome_vector.catalog_methods_considered,239);
});
test('No false global success when trigger dimensions are not covered',()=>{
 const a=run({atom:{...atom,dimensions:['MONEY','FINALITY','CHIP']}});
 assert.ok(a.outcome_vector.unresolved_dimensions.includes('CHIP'));
 assert.equal(a.no_global_optimum_claim,true);
});
test('Schema gate rejects forged method readiness, unknown methodology and budgets',()=>{
 const invalid=[{method_id:'MHA-9999',input_state:'AVAILABLE',negative_control_state:'AVAILABLE',falsifier_state:'AVAILABLE',estimated_cost_units:1}];
 assert.throws(()=>run({method_receipts:invalid}),/INVALID_METHOD_READINESS/);
 assert.throws(()=>run({max_selected:99}),/ARK_BUDGET_OR_METHODS/);
 assert.throws(()=>run({atom:{...atom,dimensions:['MONEY','MONEY']}}),/INVALID_DIMENSIONS/);
});
