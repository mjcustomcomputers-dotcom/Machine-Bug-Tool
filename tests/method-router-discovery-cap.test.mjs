import test from 'node:test';
import assert from 'node:assert/strict';
import {routeMethodAtlas} from '../lib/method-atlas-router.mjs';

function candidate(n){
 const id='MHA-'+String(n).padStart(4,'0');
 return {method_id:id,method_name:'Fixture '+id,family:'NETWORK_SYSTEMS',
  mechanism:'synthetic fixture only',required_input:'supplied graph',falsifier:'negative fixture',
  primary_source_id:'fixture:source',implementation_state:'RESEARCH_HOOK',
  quantum_requirement:'NONE',provenance_state:'SOURCE_LINKED_CANDIDATE',
  matching_dimensions:1,trigger_weight:5};
}
function adapter(amount){
 let discoveryStatements=0;
 return {prepare(sql){
  if(sql.includes('FROM atlas_methods AS m JOIN atlas_triggers')){
   discoveryStatements++;
   assert.match(sql,/LIMIT 513/);
   return {bind(){return {all(){return {results:Array.from({length:amount},(_,i)=>candidate(i+1))}}}}};
  }
  return {bind(){return {all(){return {results:[]}}}}};
 }};
}
const query={dimensions:['GRAPH'],source_refs:['fixture:record'],subject_ids:['fixture:object'],max_candidates:8};

test('Beyond 256 matching candidates are counted, with deferred candidates retained',async()=>{
 const r=await routeMethodAtlas(adapter(300),query);
 assert.equal(r.total_trigger_matches,300);
 assert.equal(r.selected_count,8);
 assert.equal(r.deferred_count,292);
 assert.ok(r.deferred_methods.every(x=>x.reason==='CANDIDATE_BUDGET'));
 assert.equal(r.no_method_executed,true);
 assert.equal(r.canonical_promotion,false);
});
test('An oversized result fails closed instead of falsely reporting complete candidate coverage',async()=>{
 await assert.rejects(()=>routeMethodAtlas(adapter(513),query),/METHOD_CANDIDATE_BUDGET_EXCEEDED_NO_SILENT_TRUNCATION/);
});
test('Missing source and subject context cannot select methods even when there are >256 matches',async()=>{
 const r=await routeMethodAtlas(adapter(300),{...query,source_refs:[],subject_ids:[]});
 assert.equal(r.selected_count,0);
 assert.equal(r.deferred_count,300);
 assert.equal(r.status,'BLOCKED_MISSING_TYPED_BINDINGS');
});
