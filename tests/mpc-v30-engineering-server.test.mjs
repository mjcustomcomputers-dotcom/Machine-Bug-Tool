import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {request as http} from 'node:http';
import {startMpcWorkspaceServer,MPC_WORKSPACE_CSP} from '../scripts/mpc-workspace-server.mjs';
import {methodLabSyntheticExampleV30,ENGINEERING_METHOD_LAB_PATH}
 from '../desktop/renderer/method-lab.js';

const ROOT=resolve(import.meta.dirname,'..','desktop','renderer');
const CSRF='MPC-V30-EXACT-SOURCE-TEST-CSRF-TOKEN-000000';
const PROJECT='PROJECT-V30-ROUTE';
function call(server,{method='GET',path=ENGINEERING_METHOD_LAB_PATH,
 body=null,csrf=CSRF,origin,contentType='application/json; charset=utf-8'}={}){
 return new Promise((resolve,reject)=>{
  const headers={
   ...csrf===null?{}:{'X-MPC-CSRF':csrf},
   ...method==='POST'?{Origin:origin??'http://127.0.0.1:'+server.port,
    'Content-Type':contentType}:{}
  };
  const req=http({hostname:'127.0.0.1',port:server.port,path,method,headers},res=>{
   const chunks=[];res.on('data',v=>chunks.push(v));res.on('end',()=>{
    const raw=Buffer.concat(chunks).toString('utf8');
    resolve({status:res.statusCode,headers:res.headers,
      body:raw,json:res.headers['content-type']?.startsWith('application/json')?JSON.parse(raw):null});
   });
  });
  req.once('error',reject);
  req.end(body===null?undefined:JSON.stringify(body));
 });
}
async function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'v30-loopback-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const server=await startMpcWorkspaceServer({rendererRoot:ROOT,dataRoot:root,csrfToken:CSRF,
  adapters:{discoverModels:async()=>({status:'UNAVAILABLE',models:[],loaded_models:[]})}});
 t.after(async()=>server.close());
 server.service.createProject({operation:'CREATE',project_id:PROJECT,
  display_name:'Engineering lab test',retention_policy:'METADATA_ONLY'});
 return server;
}
const submit=(operation,input)=>({
 opt_in:true,project_id:PROJECT,operation,
 input:input??methodLabSyntheticExampleV30(operation,PROJECT)
});
test('loopback engineering endpoint retains CSP and serves opt-in renderer module',async t=>{
 const server=await fixture(t);
 const js=await call(server,{path:'/method-lab.js'});
 assert.equal(js.status,200,js.body.slice(0,80));
 assert.match(js.body,/initializeEngineeringMethodLabV30/);
 assert.equal(js.headers['content-security-policy'],MPC_WORKSPACE_CSP);
 assert.equal(js.headers['cache-control'],'no-store');
 const get=await call(server,{method:'GET'});
 assert.equal(get.status,405);
 assert.equal(get.json.error,'MPC_WORKSPACE_METHOD_NOT_ALLOWED');
});
test('source-bound loopback POST returns real method result and full replay receipt',async t=>{
 const server=await fixture(t);
 const r=await call(server,{method:'POST',body:submit('JAVA_EXPRESSION')});
 assert.equal(r.status,200,r.body.slice(0,400));
 assert.equal(r.json.receipt.operation,'JAVA_EXPRESSION');
 assert.equal(r.json.receipt.project_id,PROJECT);
 assert.equal(r.json.receipt.independent_audit.state,'DIFFERENTIAL_REPLAY_MATCH');
 assert.equal(r.json.receipt.computation.executed_int32,30849);
 assert.equal(r.json.receipt.actions_performed,0);
 assert.equal(r.json.receipt.output_persisted,false);
 assert.equal(r.headers['cache-control'],'no-store');
});
test('same-origin POST requires CSRF and exact Origin before reading method input',async t=>{
 const server=await fixture(t),body=submit('CAN_FRAME');
 const missing=await call(server,{method:'POST',csrf:null,body});
 assert.equal(missing.status,403);
 assert.equal(missing.json.error,'MPC_WORKSPACE_CSRF_REJECTED');
 const bad=await call(server,{method:'POST',origin:'https://evil.invalid',body});
 assert.equal(bad.status,403);
 assert.equal(bad.json.error,'MPC_WORKSPACE_ORIGIN_REJECTED');
 const mime=await call(server,{method:'POST',contentType:'text/plain',body});
 assert.equal(mime.status,415);
 assert.equal(mime.json.error,'MPC_WORKSPACE_CONTENT_TYPE_REQUIRED');
});
test('project validation prevents cross-project or foreign scope reviews',async t=>{
 const server=await fixture(t),body=submit('CAN_FRAME');
 const nonexistent=await call(server,{method:'POST',body:{...body,project_id:'PROJECT-NOT-THERE',
  input:{...body.input,scope_id:'PROJECT-NOT-THERE'}}});
 assert.equal(nonexistent.status,404);
 assert.equal(nonexistent.json.error,'MPC_WORKSPACE_PROJECT_NOT_FOUND');
 const cross=await call(server,{method:'POST',body:{...body,input:{...body.input,scope_id:'ANOTHER-PROJECT'}}});
 assert.equal(cross.status,422);
 assert.equal(cross.json.error,'MPC_WORKSPACE_METHOD_LAB_SCOPE_REJECTED');
});
test('unknown or unapproved operation never reaches a method evaluator',async t=>{
 const server=await fixture(t),input=methodLabSyntheticExampleV30('CAN_FRAME',PROJECT);
 const withoutOpt=await call(server,{method:'POST',body:{
  project_id:PROJECT,operation:'CAN_FRAME',input
 }});
 assert.equal(withoutOpt.status,422);
 assert.equal(withoutOpt.json.error,'MPC_WORKSPACE_METHOD_LAB_OPT_IN_REQUIRED');
 const exploit=await call(server,{method:'POST',body:submit('REMOTE_SCAN',input)});
 assert.equal(exploit.status,422);
 assert.equal(exploit.json.error,'MPC_WORKSPACE_METHOD_LAB_OPERATION_REJECTED');
 const secret=await call(server,{method:'POST',body:submit('CAN_FRAME',{...input,password:'credential'})});
 assert.equal(secret.status,422);
 assert.equal(secret.json.error,'MPC_WORKSPACE_SECRET_MATERIAL_REJECTED');
 assert.ok(!secret.body.includes('credential'));
});
test('seven supported lab operations produce distinct source-scoped receipts without persistence',async t=>{
 const server=await fixture(t);
 for(const operation of ['MOUNTAINS','TRANSLATION','JAVA_EXPRESSION','CAN_FRAME',
  'CAN_COUNTER','CAN_PROTECTION','LINGUISTIC_OUTPUT']){
  const result=await call(server,{method:'POST',body:submit(operation)});
  assert.equal(result.status,200,operation+' '+result.body.slice(0,240));
  assert.equal(result.json.receipt.project_id,PROJECT);
  assert.equal(result.json.receipt.operation,operation);
  assert.equal(result.json.receipt.actions_performed,0);
  assert.equal(result.json.receipt.source.source_commit.length,40);
  assert.equal(result.json.receipt.output_persisted,false);
  assert.match(result.json.receipt.compact_output,/^METHOD  /u);
 }
});
