#!/usr/bin/env node
// Run one synthetic V31 review using code extracted from the verified Windows
// ASAR bundle on a Windows CI runner. Receipts remain in the isolated runner.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {getPackagerAsarV32} from './verify-v32-windows-portable.mjs';

const GIT=/^[a-f0-9]{40}$/u;
const args=process.argv.slice(2);
const input={};
for(let i=0;i<args.length;i+=2){
 if(!['--portable','--source-commit','--result'].includes(args[i])||!args[i+1])
  throw Error('V32_SMOKE_ARGUMENTS_INVALID');
 input[args[i]]=args[i+1];
}
if(process.platform!=='win32'||!GIT.test(input['--source-commit']||''))
 throw Error('V32_NATIVE_WINDOWS_IDENTITY_REQUIRED');
const workspace=mkdtempSync(join(tmpdir(),'v32-receiver-'));
let running;
try{
 const root=resolve(input['--portable']);
 const unpack=join(workspace,'packaged-app');
 mkdirSync(unpack);
 getPackagerAsarV32().extractAll(join(root,'resources','app.asar'),unpack);
 const {startMpcWorkspaceServer}=await import(pathToFileURL(
  join(unpack,'scripts','mpc-workspace-server.mjs')).href);
 const project='PROJECT-V32-WINDOWS',csrf='v32-synthetic-csrf-token-0000000000000000';
 running=await startMpcWorkspaceServer({
  dataRoot:join(workspace,'data'),rendererRoot:join(root,'resources','mpc-workspace-renderer'),
  csrfToken:csrf
 });
 running.service.createProject({operation:'CREATE',project_id:project,
  display_name:'Synthetic V31 Windows receiver',retention_policy:'METADATA_ONLY'});
 const meta={source_commit:input['--source-commit'],scope_id:project,
  subject_id:'fixture:windows-reasoner',source_ref:'fixture:v32',
  source_owner:'fixture:runner',source_version:'v32'};
 const fact=(id,symbol)=>({id,symbol,state:'SYNTHETIC',
  source_ref:'fixture:'+id,source_owner:meta.source_owner,source_version:meta.source_version});
 const rule=(id,premises,conclusion)=>({id,premises,conclusion,
  source_ref:'fixture:'+id,source_owner:meta.source_owner,source_version:meta.source_version});
 const model={...meta,world:'SYNTHETIC',goal:'GOAL',
  facts:[fact('fA','A'),fact('fB','B'),fact('fC','C')],
  rules:[rule('rAND',['A','B'],'X'),rule('rX',['X'],'GOAL'),
   rule('rOR',['C'],'GOAL')]};
 const base=running.url.slice(0,-1);
 const response=await fetch(base+'/api/workspace/methods/engineering',{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{'Content-Type':'application/json; charset=utf-8',
   'X-MPC-CSRF':csrf,Origin:base},
  body:JSON.stringify({opt_in:true,project_id:project,
   operation:'REASONING_DUEL',input:model})
 });
 const body=await response.json();
 assert.equal(response.status,200);
 const outcome=body.receipt;
 assert.equal(outcome.source.source_commit,meta.source_commit);
 assert.equal(outcome.independent_audit.state,'SOURCE_BOUND_METHOD_TOURNAMENT_REPLAY_MATCH');
 assert.equal(outcome.computation.bidirectional_receipt.state,'FORWARD_BACKWARD_PROOF_AGREEMENT');
 assert.deepEqual(outcome.computation.counterfactual_cuts.candidate_cuts.map(
  x=>x.withdraw_fact_ids),[['fA','fC'],['fB','fC']]);
 const receipt={kind:'MPC_V32_WINDOWS_ASAR_RECEIVER_1',
  state:'WINDOWS_NATIVE_NODE_PACKAGED_METHOD_PASS',os:process.platform,
  node:process.version,source_commit:meta.source_commit,
  operation:'REASONING_DUEL',method_receipt_sha256:outcome.receipt_sha256,
  proof_agreement:outcome.independent_audit.state,
  counterfactual_cuts:outcome.computation.counterfactual_cuts.candidate_cuts.map(
   x=>x.withdraw_fact_ids),
  scoped_project:project,local_requests:1,external_requests:0,
  user_device_tested:false,interactive_electron_gui_tested:false,
  source_origin:'VERIFIED_PACKAGED_ASAR'};
 if(input['--result'])writeFileSync(resolve(input['--result']),
  JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 process.stdout.write(JSON.stringify(receipt)+'\n');
}finally{
 await running?.close();
 rmSync(workspace,{recursive:true,force:true,maxRetries:4,retryDelay:300});
}
