import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const script=resolve('scripts/method-atlas-cli.mjs');
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
