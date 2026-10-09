import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {loadMethodAtlas,dbAdapter} from '../scripts/method-atlas-cli.mjs';
import {traceMethodHooks,hookCascadeContract} from '../lib/method-hook-cascade.mjs';
const fixture=()=>{const db=new DatabaseSync(':memory:');loadMethodAtlas(db);return {db,adapter:dbAdapter(db)}};
test('finite cascade traverses abnormal -> diagnostic -> earlier methods with controlled depth',async()=>{
 const {db,adapter}=fixture();try{
 const r=await traceMethodHooks(adapter,{root_method_ids:['MHA-0224'],max_depth:3,max_nodes:12,max_edges:24});
 assert.equal(r.status,'FINITE_HOOK_CASCADE_PLAN');
 assert.ok(r.visited_count>=2 && r.visited_count<=12);
 assert.ok(r.proposed_edges.some(x=>x.from_method_id==='MHA-0224'));
 assert.ok(r.method_nodes.every(x=>x.depth<=3 && x.execution==='NOT_EXECUTED'));
 assert.equal(r.no_methods_executed,true);
 assert.equal(r.independent_evidence_proven,false);
 assert.ok(['EXHAUSTED','DEPTH_BUDGET','NODE_BUDGET','EDGE_BUDGET'].includes(r.stop_reason));
 }finally{db.close()}
});
test('cycles and shared targets never recursively revisit processed methods',async()=>{
 const {db,adapter}=fixture();try{
 const r=await traceMethodHooks(adapter,{root_method_ids:['MHA-0224','MHA-0192'],max_depth:3,max_nodes:16});
 assert.equal(new Set(r.method_nodes.map(x=>x.method_id)).size,r.method_nodes.length);
 assert.ok(r.back_references.every(x=>x.back_reference));
 assert.ok(r.edge_count<=48);
 }finally{db.close()}
});
test('zero depth produces only roots and no edge dispatch',async()=>{
 const {db,adapter}=fixture();try{
 const r=await traceMethodHooks(adapter,{root_method_ids:['MHA-0224'],max_depth:0});
 assert.equal(r.visited_count,1);
 assert.equal(r.edge_count,0);
 assert.equal(r.stop_reason,'EXHAUSTED');
 }finally{db.close()}
});
test('hard budgets prevent fanout; no network or external actions are authorized',async()=>{
 const {db,adapter}=fixture();try{
 const r=await traceMethodHooks(adapter,{root_method_ids:['MHA-0224'],max_depth:3,max_nodes:2,max_edges:2});
 assert.ok(r.visited_count<=2 && r.edge_count<=2);
 assert.equal(r.no_target_actions,true);
 assert.equal(hookCascadeContract.recursive_model_calls,false);
 assert.equal(r.canonical_promotion,false);
 }finally{db.close()}
});
test('bad method roots and unsupported filters fail closed',async()=>{
 const {db,adapter}=fixture();try{
 await assert.rejects(()=>traceMethodHooks(adapter,{root_method_ids:['MHA-9999']}),/CASCADE_UNKNOWN_METHOD/);
 await assert.rejects(()=>traceMethodHooks(adapter,{root_method_ids:['MHA-0224'],max_depth:20}),/CASCADE_BUDGET/);
 await assert.rejects(()=>traceMethodHooks(adapter,{root_method_ids:['MHA-0224'],relations:['EXECUTE']}),/INVALID_RELATION/);
 await assert.rejects(()=>traceMethodHooks(adapter,{root_method_ids:['MHA-0224'],extra:true}),/UNKNOWN_CASCADE_INPUT/);
 }finally{db.close()}
});
