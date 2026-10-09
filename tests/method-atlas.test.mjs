import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {loadMethodAtlas,statusMethodAtlas,dbAdapter} from '../scripts/method-atlas-cli.mjs';
import {routeMethodAtlas,methodAtlasRouteContract} from '../lib/method-atlas-router.mjs';
function fixture(){
 const db=new DatabaseSync(':memory:');
 const inventory=loadMethodAtlas(db);
 return {db,inventory,adapter:dbAdapter(db)};
}
function query(dimensions,overrides={}){
 return {dimensions,subject_ids:['fixture-object-001'],source_refs:['fixture-source-001'],domain_profile:'BUSINESS',...overrides};
}
test('Atlas has 86 methods 86 candidate classifier questions and 20 sources with separate namespaces',()=>{
 const {db,inventory}=fixture();
 try{
  assert.equal(inventory.validation,'STRUCTURAL_INVENTORY_PASS');
  assert.equal(inventory.methods,86);
  assert.equal(inventory.classifiers,86);
  assert.equal(inventory.sources,20);
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  assert.ok(tables.every(x=>x.startsWith('atlas_')));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM atlas_methods WHERE family LIKE 'GAMING_%'").get().n,31);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM atlas_methods WHERE quantum_requirement!='NONE'").get().n,9);
 }finally{db.close()}
});
test('Repeated seed remains idempotent and no canonical table is created',()=>{
 const {db}=fixture();try{
  const again=loadMethodAtlas(db);
  assert.equal(again.validation,'STRUCTURAL_INVENTORY_PASS');
  assert.equal(again.methods,86);
  assert.equal(statusMethodAtlas(db).classifiers,86);
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('maxvar','BL','mbss')").all(),[]);
 }finally{db.close()}
});
test('Normal business money query keeps gaming optional and capped',async()=>{
 const {db,adapter}=fixture();try{
  const r=await routeMethodAtlas(adapter,query(['MONEY','STATE']));
  assert.equal(r.status,'ATLAS_STRUCTURAL_CANDIDATES');
  assert.ok(r.selected_methods.length>0);
  assert.ok(r.selected_methods.length<=8);
  assert.ok(r.selected_methods.filter(x=>x.family.startsWith('GAMING_')).length<=2);
  assert.ok(r.deferred_methods.some(x=>x.reason==='DOMAIN_FAMILY_CAP'));
  assert.equal(r.classifier_questions.length,r.selected_methods.length);
  assert.equal(r.no_method_executed,true);
  assert.equal(r.source_authentication,false);
  assert.equal(r.authorization_determined,false);
  assert.equal(r.canonical_promotion,false);
  assert.ok(r.proposed_canonical_crosswalk.every(x=>x.link_status==='PROPOSED_STRUCTURAL_LINK'));
 }finally{db.close()}
});
test('Casino and poker family can be selected only with explicit relevant dimensions or profile',async()=>{
 const {db,adapter}=fixture();try{
  const r=await routeMethodAtlas(adapter,query(['GAME','UNCERTAINTY'],{domain_profile:'GAMING',max_candidates:12}));
  assert.ok(r.selected_methods.some(x=>x.family==='GAMING_POKER_STRATEGY'));
  assert.ok(r.selected_methods.length<=12);
  assert.equal(r.method_execution_performed,undefined);
  assert.equal(r.no_method_executed,true);
 }finally{db.close()}
});
test('Incomplete typed context blocks candidate selection but preserves deferred evidence targets',async()=>{
 const {db,adapter}=fixture();try{
  const r=await routeMethodAtlas(adapter,query(['RNG'],{subject_ids:[]}));
  assert.equal(r.status,'BLOCKED_MISSING_TYPED_BINDINGS');
  assert.equal(r.selected_count,0);
  assert.ok(r.deferred_methods.every(x=>x.reason==='MISSING_SOURCE_OR_SUBJECT_BINDING'));
  assert.ok(r.next_action.includes('source_refs'));
 }finally{db.close()}
});
test('Solid state seven-stage checklist does not claim any stage executed',async()=>{
 const {db,adapter}=fixture();try{
  const r=await routeMethodAtlas(adapter,query(['FINALITY','TIME']));
  assert.deepEqual(r.solid_state_checklist.map(x=>x.stage),['QUICK_SOLID_STATE','INDUCTION','REDUCTION','TRAVERSAL','TRANSFORMATION','SYNCHRONICITY','VERIFICATION']);
  assert.ok(r.solid_state_checklist.every(x=>x.state==='PLANNED_NOT_EXECUTED'&&x.stop_on_missing_evidence));
  assert.equal(methodAtlasRouteContract.automatic_execution,false);
 }finally{db.close()}
});
test('Typed router rejects unknown fields duplicate dimensions and bound violation',async()=>{
 const {db,adapter}=fixture();try{
  await assert.rejects(()=>routeMethodAtlas(adapter,query(['RNG','RNG'])),/INVALID_TYPED_DIMENSIONS/);
  await assert.rejects(()=>routeMethodAtlas(adapter,query(["RNG'); DROP TABLE atlas_methods; --"])),/INVALID_TYPED_DIMENSIONS/);
  await assert.rejects(()=>routeMethodAtlas(adapter,{...query(['RNG']),extra_field:true}),/UNKNOWN_ROUTER_FIELD/);
  await assert.rejects(()=>routeMethodAtlas(adapter,query(['RNG'],{max_candidates:25})),/INVALID_CANDIDATE_LIMIT/);
  assert.equal(statusMethodAtlas(db).methods,86);
 }finally{db.close()}
});
