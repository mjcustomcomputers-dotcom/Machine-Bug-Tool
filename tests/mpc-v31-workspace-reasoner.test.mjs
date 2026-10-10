import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {request as http} from 'node:http';
import {reviewEngineeringMethodLabV30,ENGINEERING_LAB_V30_CONTRACT}
 from '../lib/mpc-workspace-method-lab-v30.mjs';
import {ENGINEERING_METHOD_LAB_OPERATIONS,methodLabSyntheticExampleV30}
 from '../desktop/renderer/method-lab.js';
import {startMpcWorkspaceServer} from '../scripts/mpc-workspace-server.mjs';
import {auditMethodPortfolioV31} from '../lib/mpc-v31-diagnostic-methods.mjs';

const PROJECT='PROJECT-V31-REASONER',CSRF='V31-PROOF-SOURCE-TEST-CSRF-000000000000000';
const ROOT=resolve(import.meta.dirname,'..','desktop','renderer');
const run=operation=>{
 const input=methodLabSyntheticExampleV30(operation,PROJECT);
 return reviewEngineeringMethodLabV30({opt_in:true,project_id:PROJECT,operation,input});
};
async function fixture(t){
 const path=mkdtempSync(join(tmpdir(),'mpc-v31-server-'));
 t.after(()=>rmSync(path,{recursive:true,force:true}));
 const running=await startMpcWorkspaceServer({dataRoot:path,rendererRoot:ROOT,csrfToken:CSRF,
  adapters:{discoverModels:async()=>({status:'UNAVAILABLE',models:[],loaded_models:[]})}});
 t.after(async()=>running.close());
 running.service.createProject({operation:'CREATE',project_id:PROJECT,
  display_name:'Reasoning duel test',retention_policy:'METADATA_ONLY'});
 return running;
}
const req=(server,{project_id=PROJECT,operation='REASONING_DUEL',input,csrf=CSRF}={})=>
 new Promise((resolve,reject)=>{
  const body={opt_in:true,project_id,operation,
   input:input??methodLabSyntheticExampleV30(operation,PROJECT)};
  const request=http({hostname:'127.0.0.1',port:server.port,
   path:'/api/workspace/methods/engineering',method:'POST',
   headers:{Origin:'http://127.0.0.1:'+server.port,'Content-Type':'application/json; charset=utf-8',
    'X-MPC-CSRF':csrf}},response=>{
    const out=[];
    response.on('data',x=>out.push(x));
    response.on('end',()=>{
     const text=Buffer.concat(out).toString('utf8');
     resolve({status:response.statusCode,json:JSON.parse(text),text});
    });
   });
  request.once('error',reject);
  request.end(JSON.stringify(body));
 });
test('V31 extends existing opt-in lab to ten operations without changing original seven',()=>{
 assert.equal(ENGINEERING_LAB_V30_CONTRACT.operations.length,10);
 assert.deepEqual(ENGINEERING_LAB_V30_CONTRACT.operations,
  ENGINEERING_METHOD_LAB_OPERATIONS.map(x=>x[0]));
 assert.deepEqual(ENGINEERING_LAB_V30_CONTRACT.operations.slice(-3),
  ['REASONING_DUEL','ABDUCTIVE_EXPLANATIONS','DIAGNOSIS_HITTING_SETS']);
 assert.equal(ENGINEERING_LAB_V30_CONTRACT.canonical_promotion,false);
});
test('three V31 methods work from existing workspace source contract and return exact receipts',()=>{
 for(const operation of ENGINEERING_LAB_V30_CONTRACT.operations.slice(-3)){
  const r=run(operation);
  assert.equal(r.project_id,PROJECT);
  assert.equal(r.operation,operation);
  assert.equal(r.actions_performed,0);
  assert.equal(r.output_persisted,false);
  assert.equal(r.compact_output.split('\n').length,4);
  assert.equal(r.receipt_sha256.length,64);
 }
});
test('real source-bound proof duel exposes both proofs and exact minimal fact withdrawals',()=>{
 const r=run('REASONING_DUEL');
 assert.equal(r.independent_audit.state,'SOURCE_BOUND_METHOD_TOURNAMENT_REPLAY_MATCH');
 assert.equal(r.computation.bidirectional_receipt.state,'FORWARD_BACKWARD_PROOF_AGREEMENT');
 assert.equal(r.computation.counterfactual_cuts.state,'MINIMUM_RETRACTION_DUALITY_REPLAY_PASSED');
 assert.deepEqual(r.computation.counterfactual_cuts.candidate_cuts.map(c=>c.withdraw_fact_ids),
  [['fA','fC'],['fB','fC']]);
 assert.equal(r.external_access_performed,false);
});
test('abduction exposes cheaper paired explanation versus costlier single hypothesis',()=>{
 const r=run('ABDUCTIVE_EXPLANATIONS');
 assert.equal(r.computation.state,'MINIMAL_ABDUCTIVE_EXPLANATIONS');
 assert.deepEqual(r.computation.explanations.map(x=>x.assumption_ids),
  [['hA','hB'],['hC']]);
 assert.deepEqual(r.computation.explanations.map(x=>x.cost),[2,5]);
});
test('Reiter diagnosis ranks minimum conflicts by separate declared costs',()=>{
 const r=run('DIAGNOSIS_HITTING_SETS');
 assert.equal(r.computation.state,'DECLARED_MINIMAL_CONFLICT_HITTING_SETS');
 assert.deepEqual(r.computation.diagnoses.map(x=>x.assumption_ids),
  [['componentA','componentC'],['componentB']]);
 assert.equal(r.computation.diagnoses[0].declared_cost,2);
});
test('adversarially changed winner and proof obligation fail independent method replay',()=>{
 const x=methodLabSyntheticExampleV30('REASONING_DUEL',PROJECT);
 const r=run('REASONING_DUEL'),bad=structuredClone(r.computation);
 bad.selected_method='INVENTED';
 bad.bidirectional_receipt.forward.goal_minimal_fact_supports=[['fraud']];
 assert.equal(auditMethodPortfolioV31(x,bad).state,'METHOD_TOURNAMENT_RECEIPT_REJECTED');
});
test('source revision collision is rejected by real local receiver before a finding',()=>{
 const x=methodLabSyntheticExampleV30('REASONING_DUEL',PROJECT);
 x.facts[1].source_ref=x.facts[0].source_ref;
 x.facts[1].source_version='different';
 assert.throws(()=>reviewEngineeringMethodLabV30({
  opt_in:true,project_id:PROJECT,operation:'REASONING_DUEL',input:x
 }),/MPC_WORKSPACE_METHOD_LAB_INPUT_REJECTED/);
});
test('V30 translation and CAN routes stay operable after V31 additions',()=>{
 assert.equal(run('TRANSLATION').independent_audit.state,'CONTROLLED_TRANSLATION_REPLAY_PASS');
 assert.equal(run('CAN_FRAME').computation.state,'PASSIVE_CAN_FRAME_STRUCTURALLY_VALID');
 assert.equal(run('JAVA_EXPRESSION').independent_audit.state,'DIFFERENTIAL_REPLAY_MATCH');
});
test('real loopback gives project-scoped V31 method duel with full receipt',async t=>{
 const host=await fixture(t);
 const result=await req(host);
 assert.equal(result.status,200,result.text.slice(0,240));
 assert.equal(result.json.receipt.operation,'REASONING_DUEL');
 assert.equal(result.json.receipt.independent_audit.state,'SOURCE_BOUND_METHOD_TOURNAMENT_REPLAY_MATCH');
 assert.equal(result.json.receipt.actions_performed,0);
});
test('real loopback runs three reasoning methods and retains original project boundary',async t=>{
 const host=await fixture(t);
 for(const operation of ['REASONING_DUEL','ABDUCTIVE_EXPLANATIONS','DIAGNOSIS_HITTING_SETS']){
  const r=await req(host,{operation});
  assert.equal(r.status,200,operation+': '+r.text.slice(0,200));
  assert.equal(r.json.receipt.source.scope_id,PROJECT);
  assert.equal(r.json.receipt.receipt_state,'LOCAL_METHOD_EXECUTED_FOR_REVIEW');
 }
 const invalid=await req(host,{project_id:'PROJECT-FOREIGN'});
 assert.equal(invalid.status,404);
 assert.equal(invalid.json.error,'MPC_WORKSPACE_PROJECT_NOT_FOUND');
});
test('real loopback denies bad csrf and disallows any hidden source-owner override',async t=>{
 const host=await fixture(t);
 const blocked=await req(host,{csrf:'no'});
 assert.equal(blocked.status,403);
 assert.equal(blocked.json.error,'MPC_WORKSPACE_CSRF_REJECTED');
 const data=methodLabSyntheticExampleV30('REASONING_DUEL',PROJECT);
 data.execute_shell='true';
 const bad=await req(host,{input:data});
 assert.equal(bad.status,422);
 assert.equal(bad.json.error,'MPC_WORKSPACE_METHOD_LAB_INPUT_REJECTED');
});
