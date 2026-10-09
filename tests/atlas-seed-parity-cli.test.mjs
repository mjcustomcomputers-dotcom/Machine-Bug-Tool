import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const file=resolve('scripts/method-atlas-cli.mjs');
function run(path,command){
 const t=spawnSync(process.execPath,[file,command],{
  cwd:resolve('.'),env:{...process.env,MPC_METHOD_ATLAS_DB:path},
  encoding:'utf8',timeout:120000
 });
 return t;
}
test('Read-only audit-seed reports semantic drift without altering the corrupted method',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mpc-seed-parity-'));const path=join(dir,'cache.sqlite');
 try{
  const init=run(path,'init');
  assert.equal(init.status,0,init.stderr);
  const db=new DatabaseSync(path);
  try{
   db.prepare('UPDATE atlas_methods SET method_name=? WHERE method_id=?').run('Altered method canary','MHA-0001');
   assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  }finally{db.close()}
  const audit=run(path,'audit-seed');
  assert.equal(audit.status,0,audit.stderr);
  const receipt=JSON.parse(audit.stdout);
  assert.equal(receipt.status,'BLOCKED_ATLAS_SEMANTIC_DRIFT');
  assert.deepEqual(receipt.mismatched_tables,['atlas_methods']);
  assert.equal(receipt.no_external_actions,true);
  const reject=run(path,'status');
  assert.notEqual(reject.status,0);
  assert.match(reject.stderr,/ATLAS_CACHE_CONTENT_DRIFT_REBUILD_PRIVATE_CACHE_REQUIRED/);
  const after=new DatabaseSync(path,{readOnly:true});
  try{assert.equal(after.prepare('SELECT method_name FROM atlas_methods WHERE method_id=?').get('MHA-0001').method_name,'Altered method canary')}
  finally{after.close()}
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('Audit-seed refuses an absent derived cache without creating a fake one',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mpc-seed-absent-'));const path=join(dir,'missing.sqlite');
 try{
  const result=run(path,'audit-seed');
  assert.notEqual(result.status,0);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
