import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {loadMethodAtlas,dbAdapter} from '../scripts/method-atlas-cli.mjs';
import {traceMethodHooks,hookCascadeContract} from '../lib/method-hook-cascade.mjs';
const fixture=()=>{const db=new DatabaseSync(':memory:');loadMethodAtlas(db);return {db,adapter:dbAdapter(db)}};
const graphFixture=(links)=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE atlas_methods(method_id TEXT PRIMARY KEY,method_name TEXT,family TEXT,implementation_state TEXT);
  CREATE TABLE atlas_method_relations(method_id TEXT,related_method_id TEXT,relation_type TEXT,rationale TEXT,link_status TEXT,evidence_independent INTEGER,PRIMARY KEY(method_id,related_method_id,relation_type));`);
 const insertMethod=db.prepare('INSERT INTO atlas_methods VALUES(?,?,?,?)');
 for(const id of new Set(['MHA-0001',...links.flatMap(([from,to])=>[from,to])]))insertMethod.run(id,'Synthetic '+id,'FIXTURE','RESEARCH_HOOK');
 const insertEdge=db.prepare('INSERT INTO atlas_method_relations VALUES(?,?,?,?,?,?)');
 for(const [from,to,type] of links)insertEdge.run(from,to,type,'Synthetic relation','PROPOSED_METHOD_COMPARISON',0);
 const relationReads=[];
 const adapter={prepare(sql){return {bind(...values){return {all(){
  const results=db.prepare(sql).all(...values);
  if(sql.includes('FROM atlas_method_relations'))relationReads.push(results.length);
  return {results};
 }}}}}};
 return {db,adapter,relationReads};
};
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
 let relationQueries=0;
 const observed={prepare(sql){if(sql.includes('FROM atlas_method_relations'))relationQueries++;return adapter.prepare(sql)}};
 const r=await traceMethodHooks(observed,{root_method_ids:['MHA-0224'],max_depth:0});
 assert.equal(r.visited_count,1);
 assert.equal(r.edge_count,0);
 assert.equal(r.stop_reason,'DEPTH_BUDGET');
 assert.equal(relationQueries,0);
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

test('sparse roots and relation filters reject before any database lookup',async()=>{
 let queries=0;
 const adapter={prepare(){queries++;throw Error('UNEXPECTED_DATABASE_QUERY')}};
 for(const roots of [Array(1),Object.assign(Array(2),{1:'MHA-0001'})]){
  await assert.rejects(()=>traceMethodHooks(adapter,{root_method_ids:roots}),/INVALID_CASCADE_ROOTS/);
 }
 for(const relations of [Array(1),Object.assign(Array(2),{1:'CHALLENGE'})]){
  await assert.rejects(()=>traceMethodHooks(adapter,{root_method_ids:['MHA-0001'],relations}),/INVALID_RELATION_FILTER/);
 }
 assert.equal(queries,0);
});

test('relation filtering and priority apply before bounded database lookahead',async()=>{
 const links=[
  ['MHA-0001','MHA-0002','COMPLEMENT'],['MHA-0001','MHA-0004','CROSS_CHECK'],
  ['MHA-0001','MHA-0003','CHALLENGE'],['MHA-0001','MHA-0007','COMPLEMENT'],
  ['MHA-0001','MHA-0006','CROSS_CHECK'],['MHA-0001','MHA-0005','CHALLENGE']
 ];
 const cases=[
  {relations:['COMPLEMENT','CROSS_CHECK','CHALLENGE'],first:'MHA-0003'},
  {relations:['CROSS_CHECK'],first:'MHA-0004'},
  {relations:['COMPLEMENT'],first:'MHA-0002'}
 ];
 for(const order of [links,[...links].reverse()])for(const c of cases){
  const {db,adapter,relationReads}=graphFixture(order);try{
   const r=await traceMethodHooks(adapter,{root_method_ids:['MHA-0001'],relations:c.relations,max_depth:3,max_edges:1});
   assert.deepEqual(r.proposed_edges.map(x=>x.to_method_id),[c.first]);
   assert.equal(r.stop_reason,'EDGE_BUDGET');
   assert.equal(r.edge_count,1);
   assert.equal(r.visited_count,2);
   assert.deepEqual(relationReads,[2]);
   assert.equal(r.no_methods_executed,true);
  }finally{db.close()}
 }
});

test('remaining edge budget includes back references across traversal depths',async()=>{
 const {db,adapter,relationReads}=graphFixture([
  ['MHA-0001','MHA-0002','COMPLEMENT'],['MHA-0002','MHA-0003','CHALLENGE'],
  ['MHA-0003','MHA-0001','CHALLENGE'],['MHA-0003','MHA-0004','CROSS_CHECK'],
  ['MHA-0003','MHA-0005','COMPLEMENT'],['MHA-0003','MHA-0006','COMPLEMENT']
 ]);try{
  const r=await traceMethodHooks(adapter,{root_method_ids:['MHA-0001'],max_depth:3,max_edges:3});
  assert.equal(r.stop_reason,'EDGE_BUDGET');
  assert.equal(r.edge_count,3);
  assert.equal(r.visited_count,3);
  assert.deepEqual(r.back_references.map(x=>[x.from_method_id,x.to_method_id]),[['MHA-0003','MHA-0001']]);
  assert.deepEqual(relationReads,[1,1,2]);
  assert.equal(r.independent_evidence_proven,false);
 }finally{db.close()}
});

test('exact edge exhaustion and a blocked new node retain distinct stop reasons',async()=>{
 const leaf=graphFixture([['MHA-0001','MHA-0002','CHALLENGE']]);try{
  const r=await traceMethodHooks(leaf.adapter,{root_method_ids:['MHA-0001'],max_depth:3,max_edges:1});
  assert.equal(r.stop_reason,'EXHAUSTED');
  assert.equal(r.edge_count,1);
  assert.deepEqual(leaf.relationReads,[1,0]);
 }finally{leaf.db.close()}
 const fanout=graphFixture([['MHA-0001','MHA-0002','CHALLENGE'],['MHA-0001','MHA-0003','CROSS_CHECK']]);try{
  const r=await traceMethodHooks(fanout.adapter,{root_method_ids:['MHA-0001'],max_depth:3,max_nodes:2,max_edges:4});
  assert.equal(r.stop_reason,'NODE_BUDGET');
  assert.equal(r.visited_count,2);
  assert.equal(r.edge_count,1);
 }finally{fanout.db.close()}
});
