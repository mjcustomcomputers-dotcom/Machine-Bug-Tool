import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {loadMethodAtlas,statusMethodAtlas,verifyCurrentAtlas} from '../scripts/method-atlas-cli.mjs';

function fixture(){
 const db=new DatabaseSync(':memory:');
 assert.equal(loadMethodAtlas(db).validation,'STRUCTURAL_INVENTORY_PASS');
 return db;
}
const expectDrift=(db,table)=>{
 const r=verifyCurrentAtlas(db);
 assert.equal(r.status,'BLOCKED_ATLAS_SEMANTIC_DRIFT');
 assert.ok(r.mismatched_tables.includes(table));
 // Restored V8 admission fails closed; the read-only verifier above retains table diagnostics.
 assert.throws(()=>statusMethodAtlas(db),/ATLAS_CACHE_CONTENT_DRIFT/);
 assert.throws(()=>loadMethodAtlas(db),/ATLAS_CACHE_CONTENT_DRIFT_REBUILD_PRIVATE_CACHE_REQUIRED/);
};
test('Exact seven-table source parity is checked and pinned, without authenticating external records',()=>{
 const db=fixture();try{
  const result=verifyCurrentAtlas(db);
  assert.equal(result.status,'ATLAS_CONTENT_PARITY_PASS');
  assert.equal(result.tables_checked,7);
  assert.ok(result.rows_checked>3000);
  assert.equal(result.mismatched_tables.length,0);
  assert.equal(result.no_canonical_promotion,true);
  assert.equal(result.reference,'BUNDLED_REPO_SOURCE_NOT_EXTERNAL_AUTHENTICATION');
  assert.equal(loadMethodAtlas(db).validation,'STRUCTURAL_INVENTORY_PASS');
 }finally{db.close()}
});
test('Changing a method name with the same ID and row count fails semantic parity',()=>{
 const db=fixture();try{
  const n=db.prepare('SELECT COUNT(*) AS n FROM atlas_methods').get().n;
  db.prepare('UPDATE atlas_methods SET method_name=? WHERE method_id=?').run('Source poison canary','MHA-0001');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM atlas_methods').get().n,n);
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  expectDrift(db,'atlas_methods');
  assert.equal(db.prepare('SELECT method_name FROM atlas_methods WHERE method_id=?').get('MHA-0001').method_name,'Source poison canary');
 }finally{db.close()}
});
test('Method trigger weight flips without changing count or checksum metadata is detected',()=>{
 const db=fixture();try{
  const n=db.prepare('SELECT COUNT(*) AS n FROM atlas_triggers').get().n;
  const row=db.prepare('SELECT method_id,dimension,trigger_strength FROM atlas_triggers LIMIT 1').get();
  db.prepare('UPDATE atlas_triggers SET trigger_strength=? WHERE method_id=? AND dimension=?')
   .run(row.trigger_strength===5?4:5,row.method_id,row.dimension);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM atlas_triggers').get().n,n);
  expectDrift(db,'atlas_triggers');
 }finally{db.close()}
});
test('Classifier question and source title edits are each caught and quarantined',()=>{
 for(const [table,sql] of [
  ['atlas_classifiers',"UPDATE atlas_classifiers SET question='Untrusted classifier override' WHERE classifier_id='MHC-0001'"],
  ['atlas_sources',"UPDATE atlas_sources SET title='Untrusted source title' WHERE source_id=(SELECT source_id FROM atlas_sources LIMIT 1)"]
 ]){
  const db=fixture();try{db.exec(sql);expectDrift(db,table)}finally{db.close()}
 }
});
test('Same-row-count tampering in crosswalk, relations or taxonomy is rejected',()=>{
 for(const [table,sql] of [
  ['atlas_crosswalk',"UPDATE atlas_crosswalk SET basis='Changed without source revision' WHERE rowid=(SELECT rowid FROM atlas_crosswalk LIMIT 1)"],
  ['atlas_method_relations',"UPDATE atlas_method_relations SET rationale='Fake independent confirmation' WHERE rowid=(SELECT rowid FROM atlas_method_relations LIMIT 1)"],
  ['atlas_method_taxonomy',"UPDATE atlas_method_taxonomy SET class_key='UNTRUSTED_METHOD_PURPOSE' WHERE rowid=(SELECT rowid FROM atlas_method_taxonomy LIMIT 1)"]
 ]){
  const db=fixture();try{db.exec(sql);expectDrift(db,table)}finally{db.close()}
 }
});
test('Legitimate append-only variation receipts do not rewrite or poison immutable source tables',()=>{
 const db=fixture();try{
  db.prepare(`INSERT INTO atlas_variation_ledger
    (subject_id,atom_id,variant_id,variation_kind,method_id,direction,boundary,evidence_digest,variant_digest,source_signature,dimension_signature,method_signature,decision)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'fixture:subject','fixture:atom','BASELINE','BASELINE','MHA-0001','FORWARD','INTERNAL_MODEL',
    'a'.repeat(64),'a'.repeat(64),'SOURCE_BINDINGS_V2:[["fixture:native"],[],[]]','GRAPH','METHOD_STATE_V2:'+'b'.repeat(64),'DIMENSION_NOT_MATCHED');
  assert.equal(verifyCurrentAtlas(db).status,'ATLAS_CONTENT_PARITY_PASS');
  assert.equal(loadMethodAtlas(db).validation,'STRUCTURAL_INVENTORY_PASS');
 }finally{db.close()}
});


test('Derived cache seed metadata cannot hide a method or taxonomy mismatch',()=>{
 const db=fixture();try{
  const fingerprint=db.prepare("SELECT value FROM atlas_metadata WHERE key='seed_fingerprint'").get().value;
  db.prepare("UPDATE atlas_method_taxonomy SET class_key='FALSIFIED' WHERE rowid=(SELECT rowid FROM atlas_method_taxonomy LIMIT 1)").run();
  assert.equal(db.prepare("SELECT value FROM atlas_metadata WHERE key='seed_fingerprint'").get().value,fingerprint);
  const r=verifyCurrentAtlas(db);
  assert.deepEqual(r.mismatched_tables,['atlas_method_taxonomy']);
  assert.equal(r.seed_fingerprint_matches,true);
  assert.equal(r.status,'BLOCKED_ATLAS_SEMANTIC_DRIFT');
 }finally{db.close()}
});
