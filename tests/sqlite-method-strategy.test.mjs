import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {loadMethodAtlas} from '../scripts/method-atlas-cli.mjs';
import {inspectAtlasSQLite,traceInverseMethodEdges} from '../lib/sqlite-method-strategy.mjs';
const fixture=()=>{const db=new DatabaseSync(':memory:');loadMethodAtlas(db);return db};
test('SQLite strategy explains 4 fixed parameterized queries and verifies derived-cache integrity',()=>{
 const db=fixture();try{
  const result=inspectAtlasSQLite(db,{dimension:'GRAPH',method_id:'MHA-0224',purpose:'ROUTE'});
  assert.equal(result.status,'SQLITE_DIAGNOSTIC_RECEIPT');
  assert.deepEqual(result.plans.map(x=>x.query_id),['TRIGGER','REVERSE','ACTIONABLE','TAXONOMY']);
  assert.ok(result.plans.every(x=>x.plan_entries.length>0 && x.estimated_speedup===null));
  assert.equal(result.quick_check.ok,true);
  assert.equal(result.foreign_key_check.violations,0);
  assert.equal(result.performance_gain_measured,false);
  assert.equal(result.optimizer_command_run,false);
  assert.equal(result.writes_performed,false);
 }finally{db.close()}
});
test('SQLite inverse method traversal follows references backward with bounded depth',()=>{
 const db=fixture();try{
  const a=traceInverseMethodEdges(db,{root_method_id:'MHA-0192',max_depth:3,max_rows:32});
  const b=traceInverseMethodEdges(db,{root_method_id:'MHA-0192',max_depth:3,max_rows:32});
  assert.deepEqual(a.nodes,b.nodes);
  assert.equal(a.nodes[0].method_id,'MHA-0192');
  assert.ok(a.nodes.every(x=>x.depth>=0&&x.depth<=3));
  assert.equal(a.methods_executed,false);
  assert.equal(a.target_traffic,false);
  const shallow=traceInverseMethodEdges(db,{root_method_id:'MHA-0192',max_depth:0});
  assert.deepEqual(shallow.nodes,[{method_id:'MHA-0192',depth:0}]);
 }finally{db.close()}
});
test('Foreign key violation is detected by separate pragma, not confused with quick check',()=>{
 const db=fixture();try{
  db.exec('PRAGMA foreign_keys=OFF');
  db.prepare("INSERT INTO atlas_method_relations(method_id,related_method_id,relation_type,rationale) VALUES(?,?,?,?)")
   .run('MHA-9999','MHA-0192','CHALLENGE','synthetic foreign key failure');
  db.exec('PRAGMA foreign_keys=ON');
  const receipt=inspectAtlasSQLite(db,{});
  assert.equal(receipt.status,'BLOCKED_SQLITE_INTEGRITY');
  assert.ok(receipt.foreign_key_check.violations>=1);
  assert.equal(receipt.quick_check.ok,true);
 }finally{db.close()}
});
test('SQL argument validation rejects injection and excessive graph budget',()=>{
 const db=fixture();try{
  assert.throws(()=>inspectAtlasSQLite(db,{dimension:"GRAPH');DROP TABLE atlas_methods;--"}),/INVALID_SQLITE_DIAGNOSTIC_INPUT/);
  assert.throws(()=>traceInverseMethodEdges(db,{root_method_id:'MHA-0224',max_depth:99}),/INVALID_INVERSE_GRAPH_BUDGET/);
  assert.throws(()=>traceInverseMethodEdges(db,{root_method_id:'other'}),/INVALID_INVERSE_GRAPH_BUDGET/);
  assert.throws(()=>traceInverseMethodEdges(db,{root_method_id:'MHA-9999'}),/UNKNOWN_INVERSE_GRAPH_ROOT/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM atlas_methods').get().n,239);
 }finally{db.close()}
});
