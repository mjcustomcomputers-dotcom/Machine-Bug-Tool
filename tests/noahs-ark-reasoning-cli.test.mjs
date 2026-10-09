import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runNoahsArkReasoning} from '../scripts/method-atlas-cli.mjs';

const request=()=>({
 atom:{subject_id:'fixture:transaction',atom_id:'fixture:ledger',dimensions:['MONEY','FINALITY'],source_refs:['fixture:owned-ledger'],external_source_refs:[]},
 method_receipts:[{method_id:'MHA-0053',input_state:'AVAILABLE',negative_control_state:'AVAILABLE',falsifier_state:'AVAILABLE',estimated_cost_units:2}]
});

test('Pinned reasoning entrypoint accounts for the complete catalog and retains declared relations',()=>{
 const result=runNoahsArkReasoning(request());
 assert.equal(result.method_consideration.length,239);
 assert.deepEqual(result.selected_methods.map(m=>m.method_id),['MHA-0053']);
 assert.equal(result.proposed_pairs[0].challenger_method_id,'MHA-0035');
 assert.equal(result.no_method_executed,true);
});

test('Caller cannot replace the catalog, erase relations, or add unrecognized reasoning controls',()=>{
 for(const override of [{methods:[]},{relations:[]},{methods:[{method_id:'MHA-0053'}]},{source_authenticated:true}]){
  assert.throws(()=>runNoahsArkReasoning({...request(),...override}),/UNKNOWN_REASONING_INPUT/);
 }
 for(const value of [null,[],true,'request',1])assert.throws(()=>runNoahsArkReasoning(value),/REASONING_INPUT_REQUIRED/);
});

test('Actual reason CLI rejects caller catalog overrides instead of claiming reduced full coverage',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mpc-ark-pinned-cli-'));
 try{
  const path=fileURLToPath(new URL('../scripts/method-atlas-cli.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[path,'reason',JSON.stringify({...request(),methods:[],relations:[]})],{
   encoding:'utf8',timeout:120000,env:{...process.env,MPC_METHOD_ATLAS_DB:join(dir,'cache.sqlite')}
  });
  assert.notEqual(result.status,0);
  assert.equal(result.stdout,'');
  assert.match(result.stderr,/UNKNOWN_REASONING_INPUT/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
