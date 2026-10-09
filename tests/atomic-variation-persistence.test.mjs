import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadMethodAtlas,statusMethodAtlas,runAtomicVariationReview} from '../scripts/method-atlas-cli.mjs';
import {atomicVariationIdentityFields,atomicVariationContract} from '../lib/atomic-variation-router.mjs';
const script=fileURLToPath(new URL('../scripts/method-atlas-cli.mjs',import.meta.url));
const digest=s=>s.repeat(64);
const packet=()=>({atoms:[{
 id:'atom1',subject_id:'fixture:target',dimensions:['TIME','INTERFACE','DIAGNOSTIC'],
 source_refs:['fixture:native'],external_source_refs:['fixture:external'],evidence_digest:digest('a')
}]});
function call(temp,args){
 const result=spawnSync(process.execPath,[script,'variation',JSON.stringify(args)],
  {env:{...process.env,MPC_METHOD_ATLAS_DB:join(temp,'ledger.sqlite')},encoding:'utf8',timeout:120000});
 if(result.status!==0)throw new Error('VARIATION_CLI_EXIT_'+result.status+'\n'+result.stderr);
 return JSON.parse(result.stdout);
}
test('SQLite persists all 239 x 2 x 2 consideration receipts without repetition',()=>{
 const temp=mkdtempSync(join(tmpdir(),'mpc-variation-'));
 try{
  const first=call(temp,packet());
  assert.equal(first.methods_total,239);
  assert.equal(first.slots_considered,956);
  assert.equal(first.ledger_new_or_changed,956);
  assert.equal(first.stored_record_count,956);
  assert.equal(first.complete_consideration,true);
  const second=call(temp,packet());
  assert.equal(second.slots_considered,956);
  assert.equal(second.ledger_new_or_changed,0);
  assert.equal(second.stored_record_count,956);
  assert.equal(second.decision_counts.CACHED_NO_MATERIAL_DELTA,956);
  assert.equal(second.actual_method_execution,false);
  assert.equal(second.external_network_actions,false);
  const changed=packet();changed.atoms[0].evidence_digest=digest('b');
  const third=call(temp,changed);
  assert.equal(third.ledger_new_or_changed,956);
  assert.equal(third.stored_record_count,1912);
  const cross={...changed,cross_reference:{method_ids:['MHA-0232'],source_refs:['fixture:new-source'],reason:'A distinct declared corroborator'}};
  const fourth=call(temp,cross);
  assert.equal(fourth.ledger_new_or_changed,4);
  assert.equal(fourth.stored_record_count,1916);
  assert.ok(fourth.decision_counts.REOPEN_DECLARED_CROSS_REFERENCE>0);
  const fifth=call(temp,cross);
  assert.equal(fifth.ledger_new_or_changed,0);
  assert.equal(fifth.stored_record_count,1916);
  // Removing the cross-reference restores cached base context without re-asking.
  const returnToBase=call(temp,changed);
  assert.equal(returnToBase.ledger_new_or_changed,0);
  assert.equal(returnToBase.decision_counts.CACHED_NO_MATERIAL_DELTA,956);
  // Rewinding to an older native evidence digest also reuses the exact older receipt.
  const rewind=call(temp,packet());
  assert.equal(rewind.ledger_new_or_changed,0);
  assert.equal(rewind.decision_counts.CACHED_NO_MATERIAL_DELTA,956);
  assert.equal(rewind.stored_record_count,1916);
 }finally{rmSync(temp,{recursive:true,force:true})}
});

test('source-role and variation-kind histories remain distinct and original rows survive rewinds',()=>{
 const db=new DatabaseSync(':memory:');try{
  loadMethodAtlas(db);
  const original=packet();original.atoms[0].source_refs=['core','external:foo'];original.atoms[0].external_source_refs=['bar'];
  assert.equal(runAtomicVariationReview(db,original).ledger_new_or_changed,956);
  const identity=row=>JSON.stringify(atomicVariationIdentityFields.map(field=>row[field]));
  const before=new Map(db.prepare('SELECT * FROM atlas_variation_ledger').all().map(row=>[identity(row),JSON.stringify(row)]));
  const moved=structuredClone(original);moved.atoms[0].source_refs=['core','external:bar'];moved.atoms[0].external_source_refs=['foo'];
  assert.equal(runAtomicVariationReview(db,moved).ledger_new_or_changed,956);
  assert.equal(runAtomicVariationReview(db,original).ledger_new_or_changed,0);
  const variation={id:'same-label',atom_id:'atom1',kind:'REMOVE',variant_digest:digest('b')};
  const removed=runAtomicVariationReview(db,{...original,variations:[variation]});
  assert.equal(removed.ledger_new_or_changed,956);
  const inverted=runAtomicVariationReview(db,{...original,variations:[{...variation,kind:'INVERT_EDGE'}]});
  assert.equal(inverted.ledger_new_or_changed,956);
  const rewind=runAtomicVariationReview(db,{...original,variations:[variation]});
  assert.equal(rewind.ledger_new_or_changed,0);
  assert.equal(rewind.decision_counts.CACHED_NO_MATERIAL_DELTA,1912);
  assert.equal(rewind.stored_record_count,3824);
  const counts=db.prepare('SELECT variation_kind,COUNT(*) AS n FROM atlas_variation_ledger GROUP BY variation_kind ORDER BY variation_kind').all();
  assert.deepEqual(counts.map(row=>[row.variation_kind,row.n]),[['BASELINE',1912],['INVERT_EDGE',956],['REMOVE',956]]);
  const after=new Map(db.prepare('SELECT * FROM atlas_variation_ledger').all().map(row=>[identity(row),JSON.stringify(row)]));
  for(const [key,value] of before)assert.equal(after.get(key),value);
 }finally{db.close()}
});

test('exact current-context lookup remains bounded after history exceeds the planner prior budget',()=>{
 const db=new DatabaseSync(':memory:');try{
  loadMethodAtlas(db);
  const first=runAtomicVariationReview(db,packet());
  const row=db.prepare('SELECT * FROM atlas_variation_ledger LIMIT 1').get();
  const fields=[...atomicVariationIdentityFields,'decision'];
  const put=db.prepare('INSERT INTO atlas_variation_ledger ('+fields.join(',')+') VALUES ('+fields.map(()=>'?').join(',')+')');
  const priorLimit=atomicVariationContract.max_atoms*(atomicVariationContract.max_variants_per_request+1)*atomicVariationContract.max_methods*4;
  const additional=priorLimit-first.stored_record_count+1;
  db.exec('BEGIN');
  for(let i=0;i<additional;i++){
   const evidence_digest=i.toString(16).padStart(64,'0');
   const old={...row,evidence_digest,variant_digest:evidence_digest};
   put.run(...fields.map(field=>old[field]));
  }
  db.exec('COMMIT');
  let returnedRows=0;
  const prepare=db.prepare.bind(db);
  db.prepare=sql=>{
   const statement=prepare(sql);
   if(/^SELECT\b/u.test(sql)&&sql.includes('FROM atlas_variation_ledger')&&!sql.includes('COUNT('))return {
    get(...values){const found=statement.get(...values);if(found)returnedRows++;return found},
    all(...values){const found=statement.all(...values);returnedRows+=found.length;return found}
   };
   return statement;
  };
  const repeated=runAtomicVariationReview(db,packet());
  assert.equal(repeated.stored_record_count,priorLimit+1);
  assert.equal(repeated.ledger_new_or_changed,0);
  assert.equal(repeated.decision_counts.CACHED_NO_MATERIAL_DELTA,956);
  assert.equal(returnedRows,956);
 }finally{db.close()}
});

test('persistence validates caller input before any database operation and binds source IDs safely',()=>{
 let touched=0;
 const unopened={prepare(){touched++;throw Error('DATABASE_TOUCHED')},exec(){touched++;throw Error('DATABASE_TOUCHED')}};
 const bad=packet();bad.atoms[0].source_refs=["x'); DROP TABLE atlas_methods;--"];
 assert.throws(()=>runAtomicVariationReview(unopened,bad),/INVALID_ATOM_SOURCES/);
 assert.throws(()=>runAtomicVariationReview(unopened,{...packet(),prior:[]}),/UNKNOWN_VARIATION_INPUT/);
 assert.throws(()=>runAtomicVariationReview(unopened,{...packet(),variations:null}),/VARIATION_BOUNDS/);
 assert.equal(touched,0);
 const db=new DatabaseSync(':memory:');try{
  loadMethodAtlas(db);
  runAtomicVariationReview(db,packet());
  const r=runAtomicVariationReview(db,{...packet(),cross_reference:{method_ids:['MHA-0232'],source_refs:['fixture:quoted-reason'],reason:"Reason only: '); DROP TABLE atlas_methods;--"}});
  assert.equal(r.ledger_new_or_changed,4);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM atlas_methods').get().n,239);
  assert.equal(r.external_network_actions,false);
 }finally{db.close()}
});

test('an unexpected insert failure rolls back the whole consideration matrix',()=>{
 const db=new DatabaseSync(':memory:');try{
  loadMethodAtlas(db);
  const prepare=db.prepare.bind(db);
  let inserts=0;
  db.prepare=sql=>{
   const statement=prepare(sql);
   if(sql.startsWith('INSERT INTO atlas_variation_ledger'))return {run(...values){
    if(++inserts===2)throw Error('INJECTED_INSERT_FAILURE');
    return statement.run(...values);
   }};
   return statement;
  };
  assert.throws(()=>runAtomicVariationReview(db,packet()),/INJECTED_INSERT_FAILURE/);
  db.prepare=prepare;
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM atlas_variation_ledger').get().n,0);
  const retry=runAtomicVariationReview(db,packet());
  assert.equal(retry.ledger_new_or_changed,956);
  assert.equal(retry.stored_record_count,956);
 }finally{db.close()}
});

test('an existing conflicting decision fails explicitly without overwriting history',()=>{
 const db=new DatabaseSync(':memory:');try{
  loadMethodAtlas(db);
  runAtomicVariationReview(db,packet());
  const row=db.prepare('SELECT * FROM atlas_variation_ledger LIMIT 1').get();
  const decision=row.decision==='DIMENSION_NOT_MATCHED'?'SOURCE_UNBOUND':'DIMENSION_NOT_MATCHED';
  const where=atomicVariationIdentityFields.map(field=>field+'=?').join(' AND ');
  const values=atomicVariationIdentityFields.map(field=>row[field]);
  db.prepare('UPDATE atlas_variation_ledger SET decision=? WHERE '+where).run(decision,...values);
  const before=db.prepare('SELECT * FROM atlas_variation_ledger WHERE '+where).get(...values);
  assert.throws(()=>runAtomicVariationReview(db,packet()),/CONFLICTING_PRIOR_DECISION/);
  assert.deepEqual(db.prepare('SELECT * FROM atlas_variation_ledger WHERE '+where).get(...values),before);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM atlas_variation_ledger').get().n,956);
  db.exec('BEGIN');db.exec('ROLLBACK');
 }finally{db.close()}
});

test('the shared persistence API requires admission and failed revalidation revokes it',()=>{
 const db=new DatabaseSync(':memory:');try{
  assert.throws(()=>runAtomicVariationReview(db,packet()),/ATLAS_CONNECTION_NOT_ADMITTED/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table'").get().n,0);
  loadMethodAtlas(db);
  runAtomicVariationReview(db,packet());
  const original=db.prepare("SELECT mechanism FROM atlas_methods WHERE method_id='MHA-0001'").get().mechanism;
  db.prepare("UPDATE atlas_methods SET mechanism=? WHERE method_id='MHA-0001'").run('tampered static method');
  assert.throws(()=>statusMethodAtlas(db),/ATLAS_CACHE_CONTENT_DRIFT/);
  assert.throws(()=>runAtomicVariationReview(db,packet()),/ATLAS_CONNECTION_NOT_ADMITTED/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM atlas_variation_ledger').get().n,956);
  db.prepare("UPDATE atlas_methods SET mechanism=? WHERE method_id='MHA-0001'").run(original);
  loadMethodAtlas(db);
  assert.equal(runAtomicVariationReview(db,packet()).ledger_new_or_changed,0);
 }finally{db.close()}
});
