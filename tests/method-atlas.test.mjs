import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
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
test('Atlas has 239 methods 239 candidate classifier questions and 65 sources with separate namespaces',()=>{
 const {db,inventory}=fixture();
 try{
  assert.equal(inventory.validation,'STRUCTURAL_INVENTORY_PASS');
  assert.equal(inventory.methods,239);
  assert.equal(inventory.classifiers,239);
  assert.equal(inventory.sources,65);
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  assert.ok(tables.every(x=>x.startsWith('atlas_')));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM atlas_methods WHERE family LIKE 'GAMING_%'").get().n,31);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM atlas_methods WHERE quantum_requirement!='NONE'").get().n,9);
 }finally{db.close()}
});

test('All V8 relationship endpoints reference exact existing four-digit MHA IDs',()=>{
 const relations=JSON.parse(readFileSync(new URL('../method-atlas/method-relations.json',import.meta.url),'utf8')).relationships;
 const {db,inventory}=fixture();try{
  const ids=new Set(db.prepare('SELECT method_id FROM atlas_methods').all().map(row=>row.method_id));
  assert.equal(relations.length,212);
  assert.equal(inventory.method_relations,212);
  assert.equal(inventory.taxonomy_tags,2597);
  assert.equal(inventory.triggers,478);
  assert.equal(inventory.proposed_crosswalk,444);
  for(const relation of relations){
   assert.match(relation.method_id,/^MHA-[0-9]{4}$/u);
   assert.match(relation.related_method_id,/^MHA-[0-9]{4}$/u);
   assert.ok(ids.has(relation.method_id)&&ids.has(relation.related_method_id));
   assert.equal(relation.evidence_independent,false);
   assert.equal(relation.link_status,'PROPOSED_METHOD_COMPARISON');
  }
  assert.deepEqual(relations.slice(-8).map(row=>[row.method_id,row.related_method_id]),[
   ['MHA-0232','MHA-0142'],['MHA-0233','MHA-0208'],['MHA-0234','MHA-0167'],['MHA-0235','MHA-0019'],
   ['MHA-0236','MHA-0184'],['MHA-0237','MHA-0167'],['MHA-0238','MHA-0215'],['MHA-0239','MHA-0226']
  ]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM atlas_classifiers WHERE classifier_id != REPLACE(method_id,'MHA-','MHC-')").get().n,0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close()}
});

function insertHistory(db,{legacy=false}={}){
 const values={subject_id:'fixture:history',atom_id:'atom1',variant_id:'BASELINE',variation_kind:'BASELINE',method_id:'MHA-0001',direction:'FORWARD',boundary:'INTERNAL_MODEL',evidence_digest:'a'.repeat(64),variant_digest:'a'.repeat(64),source_signature:'fixture:source-context',dimension_signature:'TIME',...(!legacy?{method_signature:'fixture:method-context'}:{}),decision:'DIMENSION_NOT_MATCHED',recorded_at:'2026-10-09 00:00:00'};
 const keys=Object.keys(values);
 db.prepare('INSERT INTO atlas_variation_ledger ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...Object.values(values));
 return db.prepare('SELECT * FROM atlas_variation_ledger').all();
}

test('Static catalog validation preserves append-only ledger rows and enables foreign keys on a valid connection',()=>{
 const {db}=fixture();try{
  const before=statusMethodAtlas(db);
  const history=insertHistory(db),changes=db.prepare('SELECT total_changes() AS n').get().n;
  db.exec('PRAGMA foreign_keys=OFF');
  const after=loadMethodAtlas(db);
  assert.equal(after.validation,'STRUCTURAL_INVENTORY_PASS');
  assert.equal(after.seed_fingerprint,before.seed_fingerprint);
  assert.equal(after.content_fingerprint,before.content_fingerprint);
  assert.deepEqual(db.prepare('SELECT * FROM atlas_variation_ledger').all(),history);
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  assert.doesNotThrow(()=>dbAdapter(db));
 }finally{db.close()}
});

test('Changed static cache rows fail closed without reseeding or altering ledger history',()=>{
 const mutations=[
  "UPDATE atlas_methods SET falsifier='CORRUPTED_CACHE_VALUE' WHERE method_id='MHA-0119'",
  "UPDATE atlas_sources SET native_url='https://example.invalid/changed' WHERE source_id='MIT_SKETCH'",
  "UPDATE atlas_classifiers SET method_id='MHA-0120' WHERE classifier_id='MHC-0119'",
  "UPDATE atlas_triggers SET trigger_strength=1 WHERE method_id='MHA-0119' AND dimension='SYNTHESIS'",
  "UPDATE atlas_crosswalk SET parent_native_id='BL99' WHERE method_id='MHA-0001' AND parent_native_id=(SELECT parent_native_id FROM atlas_crosswalk WHERE method_id='MHA-0001' LIMIT 1)",
  "UPDATE atlas_method_relations SET rationale='UNSUPPORTED_COMPARISON' WHERE method_id='MHA-0232'",
  "UPDATE atlas_method_taxonomy SET class_key='UNSUPPORTED_CLASS' WHERE method_id='MHA-0119' AND axis='DISCIPLINE'",
  "UPDATE atlas_metadata SET value='true' WHERE key='source_authentication'",
  "DELETE FROM atlas_triggers WHERE method_id='MHA-0119'",
  "DELETE FROM atlas_method_taxonomy WHERE method_id='MHA-0119'"
 ];
 for(const sql of mutations){
  const {db}=fixture();try{
   const history=insertHistory(db);db.exec(sql);
   const changes=db.prepare('SELECT total_changes() AS n').get().n;
   assert.throws(()=>statusMethodAtlas(db),/ATLAS_CACHE_CONTENT_DRIFT/);
   assert.throws(()=>loadMethodAtlas(db),/ATLAS_CACHE_CONTENT_DRIFT/);
   assert.throws(()=>dbAdapter(db),/ATLAS_CACHE_CONTENT_DRIFT/);
   assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes);
   assert.deepEqual(db.prepare('SELECT * FROM atlas_variation_ledger').all(),history);
  }finally{db.close()}
 }
});

test('Old ledger schema is rejected unchanged with its recorded history retained',()=>{
 const schema=readFileSync(new URL('../method-atlas/schema.sql',import.meta.url),'utf8');
 const legacy=schema.slice(schema.indexOf('-- Derived per-atom'))
  .replace(' method_signature TEXT NOT NULL,\n','')
  .replace('variant_id,variation_kind,method_id','variant_id,method_id')
  .replace('dimension_signature,method_signature)','dimension_signature)');
 const {db}=fixture();try{
  // Build a predecessor-schema fixture before adding its historical record.
  db.exec('DROP TABLE atlas_variation_ledger');db.exec(legacy);
  const history=insertHistory(db,{legacy:true});
  const beforeSchema=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE tbl_name='atlas_variation_ledger' ORDER BY type,name").all();
  const changes=db.prepare('SELECT total_changes() AS n').get().n;
  assert.throws(()=>loadMethodAtlas(db),/ATLAS_SCHEMA_DRIFT_EXPORT_HISTORY_AND_USE_NEW_PRIVATE_CACHE_REQUIRED/);
  assert.deepEqual(db.prepare('SELECT * FROM atlas_variation_ledger').all(),history);
  assert.deepEqual(db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE tbl_name='atlas_variation_ledger' ORDER BY type,name").all(),beforeSchema);
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes);
 }finally{db.close()}
});

test('Missing schema objects and stale seed pins are rejected before any recreation',()=>{
 const {db}=fixture();try{
  db.exec('DROP TABLE atlas_variation_ledger');
  db.exec("UPDATE atlas_metadata SET value='previous-source-seed' WHERE key='seed_fingerprint'");
  assert.throws(()=>loadMethodAtlas(db),/ATLAS_SCHEMA_DRIFT/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE name='atlas_variation_ledger'").get().n,0);
 }finally{db.close()}
 for(const [sql,error] of [
  ["DELETE FROM atlas_metadata WHERE key='seed_fingerprint'",/UNPINNED_LEGACY_ATLAS/],
  ["UPDATE atlas_metadata SET value='previous-source-seed' WHERE key='seed_fingerprint'",/ATLAS_SEED_DRIFT/],
  ['DROP INDEX atlas_method_taxonomy_axis',/ATLAS_SCHEMA_DRIFT/]
 ]){
  const {db}=fixture();try{
   const history=insertHistory(db);db.exec(sql);
   const changes=db.prepare('SELECT total_changes() AS n').get().n;
   assert.throws(()=>loadMethodAtlas(db),error);
   assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes);
   assert.deepEqual(db.prepare('SELECT * FROM atlas_variation_ledger').all(),history);
  }finally{db.close()}
 }
});

test('CLI refuses to route a corrupted persistent cache and leaves its history untouched',()=>{
 const directory=mkdtempSync(join(tmpdir(),'mpc-atlas-integrity-')),path=join(directory,'atlas.sqlite');
 try{
  const db=new DatabaseSync(path);let history;
  try{loadMethodAtlas(db);history=insertHistory(db);db.exec("UPDATE atlas_methods SET falsifier='CORRUPTED_CACHE_VALUE' WHERE method_id='MHA-0119'")}finally{db.close()}
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/method-atlas-cli.mjs',import.meta.url)),'query',JSON.stringify(query(['SYNTHESIS']))],{encoding:'utf8',env:{...process.env,MPC_METHOD_ATLAS_DB:path}});
  assert.notEqual(result.status,0);assert.equal(result.stdout,'');assert.match(result.stderr,/ATLAS_CACHE_CONTENT_DRIFT/);
  const retained=new DatabaseSync(path,{readOnly:true});
  try{
   assert.equal(retained.prepare("SELECT falsifier FROM atlas_methods WHERE method_id='MHA-0119'").get().falsifier,'CORRUPTED_CACHE_VALUE');
   assert.deepEqual(retained.prepare('SELECT * FROM atlas_variation_ledger').all(),history);
  }finally{retained.close()}
 }finally{rmSync(directory,{recursive:true,force:true})}
});
test('Repeated seed remains idempotent and no canonical table is created',()=>{
 const {db}=fixture();try{
  const again=loadMethodAtlas(db);
  assert.equal(again.validation,'STRUCTURAL_INVENTORY_PASS');
  assert.equal(again.methods,239);
  assert.equal(statusMethodAtlas(db).classifiers,239);
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
  assert.equal(statusMethodAtlas(db).methods,239);
 }finally{db.close()}
});

test('School-computation methods are discovered by typed process/synthesis and privacy dimensions',async()=>{
 const {db,adapter}=fixture();try{
  const process=await routeMethodAtlas(adapter,query(['PROCESS'],{max_candidates:12}));
  assert.ok(process.selected_methods.some(x=>x.family==='PROCESS_MINING'));
  const synth=await routeMethodAtlas(adapter,query(['SYNTHESIS'],{max_candidates:12}));
  assert.ok(synth.selected_methods.some(x=>x.family==='MIT_FORMAL_COMPUTATION'||x.family==='BERKELEY_SYNTHESIS'));
  const privacy=await routeMethodAtlas(adapter,query(['PRIVACY'],{max_candidates:12}));
  assert.ok(privacy.selected_methods.some(x=>x.family==='HARVARD_PRIVACY_COMPUTATION'));
  assert.ok([process,synth,privacy].every(x=>x.no_method_executed&&!x.authorization_determined));
 }finally{db.close()}
});
