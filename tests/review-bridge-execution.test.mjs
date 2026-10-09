import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/atomic-owner-variation.json' with {type:'json'};
import {callTool} from '../lib/tools.mjs';

const atomic=()=>structuredClone(fixture);
const route=review=>({problem:'Synthetic source-owner comparison',object_id:fixture.object_id,unit_of_analysis:'one record owner',domain_profile:'GENERAL',...(review?{atomic_review:review}:{})});
const legacy=frame=>({namespace:'SYNTHETIC',object_id:frame.object_id,actor:'fixture-author',action:'controlled model comparison',state_before:'baseline',state_after:'variant',channel:'offline',invariant:'Declared native owner equality',context:'UMTB4:'+JSON.stringify(frame)});

test('Compatibility bridge reports explicit atomic execution and preserves the full dedicated receipt',async()=>{
 const input=atomic(),direct=await callTool('review_atomic_variants',input);
 const result=await callTool('business_logic_sweep',legacy(route(input)));
 assert.deepEqual(result.atomic_review,direct);
 assert.equal(result.method_execution_performed,true);
 assert.equal(result.method_execution.status,'EXPLICIT_ATOMIC_REVIEW_EXECUTED');
 assert.equal(result.method_execution.implementation_revision,'UMTB4-WORKFLOW-EXECUTION-SUMMARY-2');
 assert.equal(result.method_execution.explicit_model_evaluations,2);
 assert.equal(result.method_execution.successful_model_receipts,2);
 assert.equal(result.method_execution.execution_complete,true);
 assert.equal(result.method_execution.automatic_execution,false);
 assert.equal(result.automatic_method_execution,false);
 assert.equal(result.status,'BLOCKED_TYPED_FRAME_REQUIRED');
 assert.deepEqual(result.selected_classifier_ids,[]);
});

test('PLAN and absent atomic review retain no-execution status',async()=>{
 const plan=atomic();delete plan.mode;
 for(const frame of [route(plan),route(null)]){
  const result=await callTool('business_logic_sweep',legacy(frame));
  assert.equal(result.method_execution_performed,false);
  assert.equal(result.method_execution.status,'NOT_EXECUTED_BY_SWEEP');
  assert.equal(result.method_execution.explicit_model_evaluations,0);
  assert.equal(result.method_execution.successful_model_receipts,0);
  assert.equal(result.method_execution.execution_complete,false);
 }
});

test('Budget-limited atomic execution remains incomplete in the bridge summary',async()=>{
 const input=atomic();input.models.push({...structuredClone(input.models[0]),id:'SECOND'});
 input.transforms=Array.from({length:16},(_,i)=>({id:'V'+i,operator:'INVARIANT TEST',atom_ids:[],rationale:'Finite control.',material_change_basis:'Repeat the supplied invariant as a budget control.',source_refs:['FIXTURE']}));
 input.max_variants=16;
 const result=await callTool('business_logic_sweep',legacy(route(input)));
 assert.equal(result.method_execution.status,'EXPLICIT_ATOMIC_REVIEW_EXECUTED');
 assert.equal(result.method_execution.explicit_model_evaluations,32);
 assert.equal(result.method_execution.successful_model_receipts,32);
 assert.equal(result.method_execution.execution_complete,false);
 assert.equal(result.method_execution.completion_scope,'RETURNED_ATOMIC_PAGE_ONLY');
 assert.equal(result.method_execution.next_variant_offset,null);
 assert.equal(result.method_execution.next_execution_variant_offset,15);
 assert.equal(result.atomic_review.variants.at(-1).invariant_checks[0].state,'UNKNOWN');
});

test('Attempted evaluator rejection is distinct from a successful model receipt',async()=>{
 const input=atomic();input.transforms=[];
 input.models=[{id:'NONDETERMINISTIC',method:'state_trace',input:{initial:'S',transitions:[{from:'S',event:'advance',to:'A'},{from:'S',event:'advance',to:'B'}],events:[]},bindings:[],source_refs:['FIXTURE']}];
 input.checks=[];input.method_applicability=[];
 const result=await callTool('business_logic_sweep',legacy(route(input)));
 assert.equal(result.method_execution.explicit_model_evaluations,1);
 assert.equal(result.method_execution.successful_model_receipts,0);
 assert.equal(result.method_execution.execution_complete,false);
 assert.equal(result.atomic_review.baseline.model_results[0].execution,'MODEL_EVALUATION_REJECTED');
});
