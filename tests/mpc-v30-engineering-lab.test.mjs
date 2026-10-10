import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

import {ENGINEERING_LAB_V30_CONTRACT,reviewEngineeringMethodLabV30}
 from '../lib/mpc-workspace-method-lab-v30.mjs';
import {ENGINEERING_METHOD_LAB_PATH,ENGINEERING_METHOD_LAB_OPERATIONS,
 methodLabSyntheticExampleV30,summarizeEngineeringLabV30,initializeEngineeringMethodLabV30}
 from '../desktop/renderer/method-lab.js';
import {stageMpcWorkspaceApplication} from '../scripts/package-mpc-workspace-windows.mjs';

const PROJECT='PROJECT-ENGINEERING-V30';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const run=(operation,changes={})=>{
 const input=methodLabSyntheticExampleV30(operation,PROJECT);
 return reviewEngineeringMethodLabV30({opt_in:true,project_id:PROJECT,operation,input,...changes});
};
test('source exact contract maps seven opt-in bounded operations to one local endpoint',()=>{
 assert.equal(ENGINEERING_LAB_V30_CONTRACT.version,'MPC_WORKSPACE_METHOD_LAB_V30_1');
 assert.equal(ENGINEERING_METHOD_LAB_PATH,ENGINEERING_LAB_V30_CONTRACT.endpoint);
 assert.deepEqual(ENGINEERING_LAB_V30_CONTRACT.operations,ENGINEERING_METHOD_LAB_OPERATIONS.map(x=>x[0]));
 assert.equal(ENGINEERING_LAB_V30_CONTRACT.user_opt_in_required,true);
 assert.equal(ENGINEERING_LAB_V30_CONTRACT.canonical_promotion,false);
 assert.equal(ENGINEERING_LAB_V30_CONTRACT.can_transmit,false);
});
test('V29 method mountain review produces source-bound blocks, full receipt and terse summary',()=>{
 const result=run('MOUNTAINS');
 assert.equal(result.operation,'MOUNTAINS');
 assert.equal(result.project_id,PROJECT);
 assert.equal(result.source.scope_id,PROJECT);
 assert.equal(result.computation.phase,'ANALYSIS');
 assert.ok(result.computation.blocks.length>0);
 assert.equal(result.summary.result,'METHOD_BLOCKS_READY');
 assert.match(result.compact_output,/^METHOD  /u);
 assert.equal(result.compact_output.split('\n').length,4);
 assert.equal(result.output_persisted,false);
 assert.equal(result.actions_performed,0);
 assert.equal(result.receipt_sha256.length,64);
});
test('translation review completes exact reversed terminology check',()=>{
 const result=run('TRANSLATION');
 assert.equal(result.computation.canonical_locale,'es-MX');
 assert.equal(result.independent_audit.state,'CONTROLLED_TRANSLATION_REPLAY_PASS');
 assert.equal(result.summary.method,'CONTROLLED_TRANSLATION');
 assert.equal(result.source.source_owner,'fixture:local-review');
});
test('compiled Java expression is independently compared with signed-int32 AST oracle',()=>{
 const result=run('JAVA_EXPRESSION');
 assert.equal(result.computation.expected_int32,30849);
 assert.equal(result.computation.executed_int32,30849);
 assert.equal(result.independent_audit.state,'DIFFERENTIAL_REPLAY_MATCH');
 assert.equal(result.external_access_performed,false);
});
test('passive CAN frame and counter modes retain declared scope and independent states',()=>{
 const frame=run('CAN_FRAME');
 assert.equal(frame.computation.state,'PASSIVE_CAN_FRAME_STRUCTURALLY_VALID');
 assert.equal(frame.computation.payload_length,12);
 assert.equal(frame.computation.source_authenticated,false);
 const counter=run('CAN_COUNTER');
 assert.equal(counter.computation.candidate_missing_steps,1);
 assert.equal(counter.computation.frame_transmission_performed,false);
 assert.equal(counter.summary.method,'CAN_COUNTER_WINDOW');
});
test('CAN protection separates CRC, freshness and authenticator',()=>{
 const r=run('CAN_PROTECTION');
 assert.equal(r.summary.result,'PROTECTION_EVIDENCE_ACQUISITION_REQUIRED');
 assert.equal(r.computation.crc_alone_cannot_establish_authenticity,true);
 assert.ok(r.computation.missing_assurances.includes('freshness'));
 assert.equal(r.computation.ecu_commands_sent,0);
});
test('controlled V28 linguistic output retains independent semantic replay',()=>{
 const r=run('LINGUISTIC_OUTPUT');
 assert.equal(r.independent_audit.state,'CONTROLLED_TEMPLATE_REPLAY_CONSISTENT_NOT_SOURCE_VERIFIED');
 assert.equal(r.computation.claim_count,1);
 assert.match(r.computation.content,/did not receive one record/iu);
 assert.equal(r.computation.full_receipt_preserved,true);
});
test('sample factory is bounded, project-bound, and fixture-only for every operation',()=>{
 for(const [operation] of ENGINEERING_METHOD_LAB_OPERATIONS){
  const input=methodLabSyntheticExampleV30(operation,PROJECT);
  assert.equal(input.scope_id,PROJECT);
  assert.match(input.source_commit,/^[a-f0-9]{40}$/u);
  assert.ok(Buffer.byteLength(JSON.stringify(input))<ENGINEERING_LAB_V30_CONTRACT.max_request_json_bytes);
  const result=reviewEngineeringMethodLabV30({opt_in:true,project_id:PROJECT,operation,input});
  assert.equal(result.output_persisted,false);
  assert.equal(result.actions_performed,0);
  assert.equal(result.project_id,PROJECT);
  assert.equal(result.input_json_sha256,sha(input));
 }
});
test('no implicit method invocation, unknown fields or workspace scope impersonation',()=>{
 const input=methodLabSyntheticExampleV30('CAN_FRAME',PROJECT);
 for(const value of [
  {project_id:PROJECT,operation:'CAN_FRAME',input},
  {opt_in:false,project_id:PROJECT,operation:'CAN_FRAME',input}
 ])assert.throws(()=>reviewEngineeringMethodLabV30(value),/MPC_WORKSPACE_METHOD_LAB_OPT_IN_REQUIRED/u);
 assert.throws(()=>reviewEngineeringMethodLabV30({opt_in:true,project_id:PROJECT,
  operation:'SHELL',input}),/MPC_WORKSPACE_METHOD_LAB_OPERATION_REJECTED/u);
 assert.throws(()=>reviewEngineeringMethodLabV30({opt_in:true,project_id:PROJECT,
  operation:'CAN_FRAME',input:{...input,scope_id:'OTHER'}}),
  /MPC_WORKSPACE_METHOD_LAB_SCOPE_REJECTED/u);
 assert.throws(()=>reviewEngineeringMethodLabV30({opt_in:true,project_id:PROJECT,
  operation:'CAN_FRAME',input,execute:true}),/MPC_WORKSPACE_METHOD_LAB_FIELDS_REJECTED/u);
});
test('source version and caller provenance must be present on every technical operation',()=>{
 const x=methodLabSyntheticExampleV30('CAN_FRAME',PROJECT);
 delete x.source_version;
 assert.throws(()=>reviewEngineeringMethodLabV30({opt_in:true,project_id:PROJECT,operation:'CAN_FRAME',input:x}),
  /MPC_WORKSPACE_METHOD_LAB_SOURCE_REQUIRED/u);
 const y=methodLabSyntheticExampleV30('CAN_FRAME',PROJECT);
 y.can_id_raw=0x20000123;
 assert.throws(()=>reviewEngineeringMethodLabV30({opt_in:true,project_id:PROJECT,
  operation:'CAN_FRAME',input:y}),/MPC_WORKSPACE_METHOD_LAB_INPUT_REJECTED/u);
});
test('input resource cap rejects large text before executing an analysis',()=>{
 const x=methodLabSyntheticExampleV30('LINGUISTIC_OUTPUT',PROJECT);
 x.padding='x'.repeat(35000);
 assert.throws(()=>reviewEngineeringMethodLabV30({opt_in:true,project_id:PROJECT,
  operation:'LINGUISTIC_OUTPUT',input:x}),/MPC_WORKSPACE_METHOD_LAB_INPUT_TOO_LARGE/u);
});
test('compact output and full JSON receipt retain compatible source identity',()=>{
 const result=run('JAVA_EXPRESSION');
 const view=summarizeEngineeringLabV30(result);
 assert.equal(view.status,result.summary.result);
 assert.equal(JSON.parse(view.full).receipt_sha256,result.receipt_sha256);
 assert.match(view.short,/^METHOD  /u);
 assert.equal(view.source,'fixture:local-atom');
 assert.equal(view.receipt_sha256,result.receipt_sha256);
 assert.throws(()=>summarizeEngineeringLabV30({}),/INVALID_METHOD_LAB_RECEIPT/u);
});
test('Methods page contains one collapsed, accessible lab with copy controls',()=>{
 const html=readFileSync(new URL('../desktop/renderer/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../desktop/renderer/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../desktop/renderer/styles.css',import.meta.url),'utf8');
 assert.match(html,/<details class="panel engineering-lab" id="engineering-lab-panel">/u);
 for(const id of ['engineering-lab-operation','engineering-lab-input','engineering-lab-run',
  'engineering-lab-status','engineering-lab-preview','engineering-lab-full',
  'engineering-lab-example','engineering-lab-copy','engineering-lab-copy-full']){
  assert.equal((html.match(new RegExp('id="'+id+'"','gu'))||[]).length,1,id);
 }
 assert.match(html,/aria-live="polite"/u);
 assert.match(js,/initializeEngineeringMethodLabV30/u);
 assert.match(css,/\.engineering-lab-preview/u);
 assert.doesNotMatch(html,/<script[^>]*>[^<]+<\/script>/u);
});
test('Windows portable staging contains transitive backend imports and the renderer module',()=>{
 const root=resolve(import.meta.dirname,'..');
 const temp=mkdtempSync(join(tmpdir(),'v30-portable-stage-'));
 try{
  const staged=stageMpcWorkspaceApplication({sourceRoot:root,stageRoot:join(temp,'stage')});
  for(const name of [
   'desktop/renderer/method-lab.js','lib/mpc-workspace-method-lab-v30.mjs',
   'lib/mpc-v29-method-mountains.mjs','lib/mpc-v29-can-observation.mjs',
   'lib/mpc-v29-language-audit.mjs','lib/mpc-linguistic-audit-v28.mjs'])
   assert.ok(staged.selected_files.includes(name),name);
  assert.ok(existsSync(join(temp,'stage','desktop','renderer','method-lab.js')));
  assert.ok(staged.selected_bytes<96*1024*1024);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('Engineering Lab initializes with no automatic network call; only Run dispatches',async()=>{
 const originals=globalThis.document;
 const elements=new Map();
 const add=id=>{
  const handlers=new Map(),el={id,disabled:false,textContent:'',value:'',
   handlers,addEventListener:(name,fn)=>handlers.set(name,fn),focus:()=>{}};
  elements.set(id,el);return el;
 };
 for(const id of ['engineering-lab-operation','engineering-lab-input','engineering-lab-example',
  'engineering-lab-run','engineering-lab-status','engineering-lab-preview','engineering-lab-full',
  'engineering-lab-copy','engineering-lab-copy-full'])add(id);
 elements.get('engineering-lab-operation').value='TRANSLATION';
 let called=0,actualArgs=null,copied=[];
 globalThis.document={getElementById:id=>elements.get(id)};
 try{
  const lab=initializeEngineeringMethodLabV30({
   request:async(path,options)=>{
    called++;actualArgs={path,options};
    return {receipt:reviewEngineeringMethodLabV30(options.body)};
   },
   getProjectId:()=>PROJECT,copyText:(data)=>{copied.push(data)},
   announce:()=>{},recordError:e=>{throw e}
  });
  assert.equal(called,0);
  elements.get('engineering-lab-example').handlers.get('click')();
  assert.equal(called,0);
  await elements.get('engineering-lab-run').handlers.get('click')();
  assert.equal(called,1);
  assert.equal(actualArgs.path,ENGINEERING_METHOD_LAB_PATH);
  assert.equal(actualArgs.options.method,'POST');
  assert.equal(actualArgs.options.body.opt_in,true);
  assert.match(elements.get('engineering-lab-preview').textContent,/RESULT  CONTROLLED_TRANSLATION_REPLAY_PASS/);
  assert.equal(elements.get('engineering-lab-copy').disabled,false);
  elements.get('engineering-lab-copy-full').handlers.get('click')();
  assert.equal(JSON.parse(copied[0]).receipt_state,'LOCAL_METHOD_EXECUTED_FOR_REVIEW');
  assert.equal(lab.hasResult(),true);
 }finally{globalThis.document=originals;}
});
