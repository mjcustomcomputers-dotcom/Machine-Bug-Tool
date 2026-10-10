#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateMethod} from '../lib/methods.mjs';
const bundle=JSON.parse(readFileSync(new URL('../docs/MPC-SCREEN-VALIDATION.json',import.meta.url),'utf8'));
const observations=[];
for(const entry of bundle.cases){
  const observed=await evaluateMethod({method:entry.method,input:entry.input});
  assert.equal(observed.model_fingerprint,entry.observed.model_fingerprint,entry.id);
  assert.deepEqual(observed.result,entry.observed.result,entry.id);
  observations.push({id:entry.id,method:entry.method,status:observed.result.status??'EVALUATED',root_value:observed.result.root_value});
}
assert.equal(observations.find(row=>row.id==='guarded_lifecycle').status,'FINITE_GRAPH_VERIFIED');
assert.equal(observations.find(row=>row.id==='late_result_mutant').status,'COUNTEREXAMPLE_FOUND');
assert.equal(observations.find(row=>row.id==='guarded_fault_tree').root_value,false);
assert.equal(observations.find(row=>row.id==='missing_mask_mutant').root_value,true);
process.stdout.write(`${JSON.stringify({status:'PASS',scope:'LOCAL_REPLAY_OF_CONNECTED_MPC_SUPPLIED_MODELS',
  source_authentication:false,model_completeness_proven:false,observations},null,2)}\n`);
