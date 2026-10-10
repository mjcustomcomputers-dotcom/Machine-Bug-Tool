import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,mkdtempSync,mkdirSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {request as httpRequest} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {
 QUEUE_ACTIONS,
 QUEUE_PROVIDERS,
 ResearchWorkbenchStore,
 resolveWorkbenchDatabasePath
} from '../lib/research-workbench-store.mjs';
import {
 WORKBENCH_BODY_LIMIT,
 openWorkbenchUrl,
 parseWorkbenchServerArguments,
 startResearchWorkbenchServer
} from '../scripts/research-workbench-server.mjs';

const sha256=value=>createHash('sha256').update(value).digest('hex');
const fixedToken='test-only-csrf-token-with-at-least-32-bytes';

function temporary(t,prefix='research-workbench-'){
 const path=mkdtempSync(join(tmpdir(),prefix));
 t.after(()=>rmSync(path,{recursive:true,force:true}));
 return path;
}

function makeBundle(t){
 const root=temporary(t);
 const style='body{background:#071019;color:#fff}',script="'use strict';document.body.dataset.ready='true';";
 const policy=`default-src 'none'; script-src 'sha256-${createHash('sha256').update(script).digest('base64')}'; style-src 'sha256-${createHash('sha256').update(style).digest('base64')}'; connect-src 'self'; img-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
 const html=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><title>Research Workbench fixture</title><style>${style}</style></head><body>Research Workbench fixture<script>${script}</script></body></html>\n`;
 const raw=Buffer.from(html),manifest={format_version:'MPC_METHOD_SELF_SCAN_OFFLINE_MANIFEST_1.0',artifact_count:1,
  artifacts:[{path:'MPC-Research-Workbench.html',bytes:raw.length,sha256:sha256(raw)}]};
 writeFileSync(join(root,'MPC-Research-Workbench.html'),raw);
 writeFileSync(join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 return root;
}

function callHttp(running,{method='GET',path='/',headers={},body}={}){
 return new Promise((resolve,reject)=>{
  const request=httpRequest({
   hostname:'127.0.0.1',
   port:running.port,
   method,
   path,
   headers
  },response=>{
   const chunks=[];
   response.on('data',chunk=>chunks.push(chunk));
   response.on('end',()=>{
    const raw=Buffer.concat(chunks),text=raw.toString('utf8');
    let parsed=null;
    if((response.headers['content-type']??'').startsWith('application/json'))parsed=JSON.parse(text);
    resolve({status:response.statusCode,headers:response.headers,raw,text,json:parsed});
   });
  });
  request.once('error',reject);
  if(body!==undefined)request.end(body);else request.end();
 });
}

function apiHeaders(running,{origin=true,token=fixedToken,type='application/json; charset=utf-8'}={}){
 return {
  ...(token===null?{}:{'X-Workbench-CSRF':token}),
  ...(origin?{Origin:`http://127.0.0.1:${running.port}`}:{ }),
  ...(type===null?{}:{'Content-Type':type})
 };
}

async function postJson(running,path,value,options={}){
 return callHttp(running,{method:'POST',path,headers:apiHeaders(running,options),body:JSON.stringify(value)});
}

function runBody(overrides={}){
 return {
  kind:'LOCAL_HOOK_DISCOVERY',
  query:'Find challenge methods',
  input:'source-owned fixture text',
  store_input:false,
  method_ids:['MHA-0119','MHA-0138'],
  result:{match_count:2,method_ids:['MHA-0119','MHA-0138'],boundary:'LOCAL_DERIVED_RESULT'},
  ...overrides
 };
}

function queueBody(overrides={}){
 const content={run_id:null,summary:'Local derived fixture',method_ids:['MHA-0119']};
 const artifact=JSON.stringify(content,null,2)+'\n';
 return {
  provider:'GOOGLE_DRIVE',
  action:'CREATE_NEW',
  label:'Create a new analysis artifact',
  payload:{
   run_id:null,
   artifact_name:'analysis.json',
   artifact_sha256:sha256(artifact),
   artifact_bytes:Buffer.byteLength(artifact),
   media_type:'application/json',
   destination_hint:'CREATE_NEW',
   content
  },
  ...overrides
 };
}

test('loopback workbench serves an exact static surface and persists privacy-bound runs and unsent packets',async t=>{
 const root=makeBundle(t),database=join(root,'runtime','workbench.sqlite');
 const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
 const running=await startResearchWorkbenchServer({
  root,database,port:0,csrfToken:fixedToken,
  clock:()=>new Date('2026-10-09T12:00:00.000Z'),
  id:()=>ids.shift()
 });
 t.after(()=>running.close());
 assert.equal(running.host,'127.0.0.1');
 assert.match(running.url,/^http:\/\/127\.0\.0\.1:[0-9]+\/$/u);

 const home=await callHttp(running);
 assert.equal(home.status,200);
 assert.match(home.text,/Research Workbench fixture/u);
 assert.equal(home.headers['cache-control'],'no-store');
 assert.equal(home.headers['x-content-type-options'],'nosniff');
 assert.match(home.headers['content-security-policy'],/^default-src 'none'; script-src 'sha256-/u);
 assert.match(home.headers['content-security-policy'],/connect-src 'self'/u);
 assert.match(home.headers['content-security-policy'],/frame-ancestors 'none'$/u);
 assert.equal(home.headers['access-control-allow-origin'],undefined);
 const named=await callHttp(running,{path:'/MPC-Research-Workbench.html'});
 assert.equal(named.status,200);
 const head=await callHttp(running,{method:'HEAD'});
 assert.equal(head.status,200);
 assert.equal(head.raw.length,0);

 const status=await callHttp(running,{path:'/api/workbench/status'});
 assert.equal(status.status,200);
 assert.equal(status.json.status,'READY_LOCAL_ONLY');
 assert.equal(status.json.csrf_token,fixedToken);
 assert.equal(status.json.service.host,'127.0.0.1');
 assert.equal(status.json.boundaries.external_networking,false);
 assert.equal(status.json.boundaries.provider_dispatch,false);
 assert.equal(status.json.boundaries.host_action_performed,false);
 assert.ok(status.json.capabilities.queue_providers.includes('MPC_BUGTOOLS'));
 assert.ok(status.json.capabilities.queue_providers.includes('CUSTOM_GPT_OR_AI_HOST'));
 assert.ok(status.json.capabilities.queue_actions.includes('CREATE_NEW_BRANCH_ARTIFACT'));
 assert.equal(status.json.capabilities.limits.input_utf8_bytes,262144);
 assert.equal(status.json.capabilities.limits.request_body_bytes,WORKBENCH_BODY_LIMIT);

 const privateQuery='private-query-never-retained-77d1';
 const privateInput='private-input-never-retained-a93e';
 const created=await postJson(running,'/api/workbench/runs',runBody({query:privateQuery,input:privateInput}));
 assert.equal(created.status,201,created.text);
 assert.equal(created.json.run.store_input,false);
 assert.equal(created.json.run.query,null);
 assert.equal(created.json.run.input,null);
 assert.equal(created.json.run.query_sha256,sha256(privateQuery));
 assert.equal(created.json.run.input_sha256,sha256(privateInput));
 assert.equal(created.json.run.query_bytes,Buffer.byteLength(privateQuery));
 assert.equal(created.json.run.boundaries.raw_input_stored,false);
 assert.equal(created.json.run.boundaries.client_result_content_stored,false);
 assert.equal(created.json.run.boundaries.provider_action_performed,false);
 assert.equal(created.json.run.result.status,'CLIENT_RESULT_CONTENT_NOT_RETAINED');
 assert.match(created.json.run.result.supplied_result_sha256,/^[a-f0-9]{64}$/u);
 assert.equal(JSON.stringify(created.json.run.result).includes('MHA-0119'),false);

 const retained=await postJson(running,'/api/workbench/runs',runBody({
  query:'retained query',input:'retained input',store_input:true,method_ids:[]
 }));
 assert.equal(retained.status,201,retained.text);
 assert.equal(retained.json.run.query,'retained query');
 assert.equal(retained.json.run.input,'retained input');
 assert.equal(retained.json.run.boundaries.raw_input_stored,true);
 assert.equal(retained.json.run.boundaries.client_result_content_stored,true);
 assert.equal(retained.json.run.result.match_count,2);

 const runs=await callHttp(running,{path:'/api/workbench/runs?limit=10',headers:{'X-Workbench-CSRF':fixedToken}});
 assert.equal(runs.status,200,runs.text);
 assert.equal(runs.json.count,2);
 assert.deepEqual(runs.json.runs.map(row=>row.run_id),[
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001'
 ]);

 const queued=await postJson(running,'/api/workbench/queue',queueBody());
 assert.equal(queued.status,201,queued.text);
 assert.equal(queued.json.queue_request.state,'NOT_SENT');
 assert.equal(queued.json.queue_request.host_action_performed,false);
 assert.equal(queued.json.queue_request.host_action_called,false);
 assert.equal(queued.json.queue_request.write_performed,false);
 assert.equal(queued.json.queue_request.provider_receipt,null);
 const queue=await callHttp(running,{path:'/api/workbench/queue',headers:{'X-Workbench-CSRF':fixedToken}});
 assert.equal(queue.status,200,queue.text);
 assert.equal(queue.json.count,1);
 assert.equal(queue.json.queue[0].state,'NOT_SENT');

 const databaseView=new DatabaseSync(database,{readOnly:true});
 try{
  const privateRow=databaseView.prepare('SELECT query_text,input_text,query_sha256,input_sha256 FROM workbench_runs WHERE run_id=?').get('00000000-0000-4000-8000-000000000001');
  assert.equal(privateRow.query_text,null);
  assert.equal(privateRow.input_text,null);
  assert.equal(privateRow.query_sha256,sha256(privateQuery));
  assert.equal(privateRow.input_sha256,sha256(privateInput));
  const queueRow=databaseView.prepare('SELECT state,host_action_performed,write_performed,provider_receipt_json FROM workbench_queue').get();
  assert.equal(queueRow.state,'NOT_SENT');
  assert.equal(queueRow.host_action_performed,0);
  assert.equal(queueRow.write_performed,0);
  assert.equal(queueRow.provider_receipt_json,null);
 }finally{databaseView.close()}

 await running.close();
 const databaseFiles=readdirSync(join(root,'runtime')).filter(name=>name.startsWith('workbench.sqlite'));
 const persisted=Buffer.concat(databaseFiles.map(name=>readFileSync(join(root,'runtime',name)))).toString('utf8');
 assert.equal(persisted.includes(privateQuery),false);
 assert.equal(persisted.includes(privateInput),false);
});

test('workbench rejects cross-site writes, missing API tokens, secrets, invalid schemas and unbounded bodies',async t=>{
 const root=makeBundle(t),database=join(root,'workbench.sqlite');
 const running=await startResearchWorkbenchServer({root,database,port:0,csrfToken:fixedToken});
 t.after(()=>running.close());

 const missingToken=await callHttp(running,{path:'/api/workbench/runs'});
 assert.equal(missingToken.status,403);
 assert.equal(missingToken.json.error,'WORKBENCH_CSRF_REJECTED');
 const missingOrigin=await postJson(running,'/api/workbench/runs',runBody(),{origin:false});
 assert.equal(missingOrigin.status,403);
 assert.equal(missingOrigin.json.error,'WORKBENCH_ORIGIN_REJECTED');
 const nullOrigin=await callHttp(running,{
  method:'POST',path:'/api/workbench/runs',headers:{...apiHeaders(running),Origin:'null'},body:JSON.stringify(runBody())
 });
 assert.equal(nullOrigin.status,403);
 const foreignOrigin=await callHttp(running,{
  method:'POST',path:'/api/workbench/runs',headers:{...apiHeaders(running),Origin:'https://evil.invalid'},body:JSON.stringify(runBody())
 });
 assert.equal(foreignOrigin.status,403);
 const wrongToken=await postJson(running,'/api/workbench/runs',runBody(),{token:'wrong-but-long-token-value'});
 assert.equal(wrongToken.status,403);
 const wrongType=await postJson(running,'/api/workbench/runs',runBody(),{type:'application/json'});
 assert.equal(wrongType.status,415);
 assert.equal(wrongType.json.error,'WORKBENCH_CONTENT_TYPE_REQUIRED');

 const unknownField=await postJson(running,'/api/workbench/runs',{...runBody(),unexpected:true});
 assert.equal(unknownField.status,422);
 assert.equal(unknownField.json.error,'WORKBENCH_RUN_SCHEMA_INVALID');
 const prototypeKey=JSON.parse('{"kind":"LOCAL_HOOK_DISCOVERY","query":"q","input":"i","store_input":false,"method_ids":[],"result":{"__proto__":{"polluted":true}}}');
 const rejectedPrototype=await postJson(running,'/api/workbench/runs',prototypeKey);
 assert.equal(rejectedPrototype.status,422);
 assert.equal(rejectedPrototype.json.error,'WORKBENCH_SECRET_MATERIAL_REJECTED');
 assert.equal({}.polluted,undefined);
 const secretKey=await postJson(running,'/api/workbench/runs',runBody({result:{access_token:'not-stored-ever'}}));
 assert.equal(secretKey.status,422);
 assert.equal(secretKey.json.error,'WORKBENCH_SECRET_MATERIAL_REJECTED');
 const camelSecretKey=await postJson(running,'/api/workbench/runs',runBody({result:{clientSecret:'not-stored-ever'}}));
 assert.equal(camelSecretKey.status,422);
 assert.equal(camelSecretKey.json.error,'WORKBENCH_SECRET_MATERIAL_REJECTED');
 const apiSecretKey=await postJson(running,'/api/workbench/runs',runBody({result:{apiKey:'not-stored-ever'}}));
 assert.equal(apiSecretKey.status,422);
 assert.equal(apiSecretKey.json.error,'WORKBENCH_SECRET_MATERIAL_REJECTED');
 const nestedSecretKey=await postJson(running,'/api/workbench/runs',runBody({result:{db_password:'not-stored-ever'}}));
 assert.equal(nestedSecretKey.status,422);
 assert.equal(nestedSecretKey.json.error,'WORKBENCH_SECRET_MATERIAL_REJECTED');
 const secretValue=await postJson(running,'/api/workbench/runs',runBody({input:'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456'}));
 assert.equal(secretValue.status,422);
 assert.equal(secretValue.json.error,'WORKBENCH_SECRET_MATERIAL_REJECTED');
 const openAiSecret=await postJson(running,'/api/workbench/runs',runBody({input:'sk-proj-abcdefghijklmnopqrstuvwxyz123456'}));
 assert.equal(openAiSecret.status,422);
 assert.equal(openAiSecret.json.error,'WORKBENCH_SECRET_MATERIAL_REJECTED');
 const basicSecret=await postJson(running,'/api/workbench/runs',runBody({input:'Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=='}));
 assert.equal(basicSecret.status,422);
 const awsSecret=await postJson(running,'/api/workbench/runs',runBody({input:'AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwxyz1234567890'}));
 assert.equal(awsSecret.status,422);
 const falseProtectedClaim=await postJson(running,'/api/workbench/runs',runBody({result:{source_authentication:true,host_action_performed:true}}));
 assert.equal(falseProtectedClaim.status,422);
 assert.equal(falseProtectedClaim.json.error,'WORKBENCH_PROTECTED_CLAIM_REJECTED');
 const ordinaryDiscussion=await postJson(running,'/api/workbench/runs',runBody({
  query:'Analyze OAuth token rotation controls',input:'Discuss token expiration without including credential values.'
 }));
 assert.equal(ordinaryDiscussion.status,201,ordinaryDiscussion.text);
 const rawEcho=await postJson(running,'/api/workbench/runs',runBody({
  query:'raw query must not leak',
  input:'raw input must not leak',
  result:{summary:'raw input must not leak'}
 }));
 assert.equal(rawEcho.status,201,rawEcho.text);
 assert.equal(rawEcho.json.run.result.status,'CLIENT_RESULT_CONTENT_NOT_RETAINED');
 assert.equal(JSON.stringify(rawEcho.json.run).includes('raw input must not leak'),false);
 const shortAndSplit=await postJson(running,'/api/workbench/runs',runBody({
  query:'q',input:'secret-123',result:{first:'secret',second:'-123',nested:{note:'prefix secret-123 suffix'}}
 }));
 assert.equal(shortAndSplit.status,201,shortAndSplit.text);
 assert.equal(shortAndSplit.json.run.result.status,'CLIENT_RESULT_CONTENT_NOT_RETAINED');
 assert.equal(JSON.stringify(shortAndSplit.json.run).includes('secret-123'),false);
 const explicitlyRetainedEcho=await postJson(running,'/api/workbench/runs',runBody({
  query:'explicit retained query',input:'explicit retained input',store_input:true,
  result:{summary:'explicit retained input'}
 }));
 assert.equal(explicitlyRetainedEcho.status,201,explicitlyRetainedEcho.text);

 const badPair=queueBody({provider:'GMAIL',action:'CREATE_NEW'});
 const rejectedPair=await postJson(running,'/api/workbench/queue',badPair);
 assert.equal(rejectedPair.status,422);
 assert.equal(rejectedPair.json.error,'WORKBENCH_QUEUE_PROVIDER_ACTION_INVALID');
 const badDestination=queueBody({provider:'GMAIL',action:'CREATE_DRAFT'});
 const rejectedDestination=await postJson(running,'/api/workbench/queue',badDestination);
 assert.equal(rejectedDestination.status,422);
 assert.equal(rejectedDestination.json.error,'WORKBENCH_QUEUE_PROVIDER_DESTINATION_INVALID');
 const pathArtifact=queueBody();pathArtifact.payload.artifact_name='../../escape.json';
 const rejectedPath=await postJson(running,'/api/workbench/queue',pathArtifact);
 assert.equal(rejectedPath.status,422);
 assert.equal(rejectedPath.json.error,'WORKBENCH_QUEUE_ARTIFACT_NAME_INVALID');
 const falseReceipt=queueBody();falseReceipt.payload.content.state='SENT';
 const rejectedReceipt=await postJson(running,'/api/workbench/queue',falseReceipt);
 assert.equal(rejectedReceipt.status,422);
 assert.equal(rejectedReceipt.json.error,'WORKBENCH_QUEUE_CONTENT_ENVELOPE_REJECTED');
 const nestedReceipt=queueBody();nestedReceipt.payload.content.nested={state:'SENT',dispatch_status:'SENT'};
 const rejectedNestedReceipt=await postJson(running,'/api/workbench/queue',nestedReceipt);
 assert.equal(rejectedNestedReceipt.status,422);
 assert.equal(rejectedNestedReceipt.json.error,'WORKBENCH_PROTECTED_CLAIM_REJECTED');
 const badHash=queueBody();badHash.payload.artifact_sha256='0'.repeat(64);
 const rejectedHash=await postJson(running,'/api/workbench/queue',badHash);
 assert.equal(rejectedHash.status,422);
 assert.equal(rejectedHash.json.error,'WORKBENCH_QUEUE_ARTIFACT_HASH_MISMATCH');
 const hugeBody='{"padding":"'+'x'.repeat(WORKBENCH_BODY_LIMIT)+'"}';
 const rejectedHuge=await callHttp(running,{method:'POST',path:'/api/workbench/runs',headers:apiHeaders(running),body:hugeBody});
 assert.equal(rejectedHuge.status,413);

 const options=await callHttp(running,{method:'OPTIONS',path:'/api/workbench/runs',headers:{'X-Workbench-CSRF':fixedToken}});
 assert.equal(options.status,405);
 assert.equal(options.headers['access-control-allow-origin'],undefined);
 assert.equal(options.headers['access-control-allow-methods'],undefined);
 const databaseRoute=await callHttp(running,{path:'/workbench.sqlite'});
 assert.equal(databaseRoute.status,404);
 const traversal=await callHttp(running,{path:'/..%2f..%2fetc%2fpasswd'});
 assert.equal(traversal.status,404);
 const foreignHost=await callHttp(running,{path:'/api/workbench/status',headers:{Host:'evil.invalid'}});
 assert.equal(foreignHost.status,421);
 assert.equal(foreignHost.json.error,'WORKBENCH_HOST_REJECTED');
 const localhostHost=await callHttp(running,{path:'/api/workbench/status',headers:{Host:`localhost:${running.port}`}});
 assert.equal(localhostHost.status,421);
 const crossSite=await callHttp(running,{path:'/api/workbench/status',headers:{'Sec-Fetch-Site':'cross-site'}});
 assert.equal(crossSite.status,403);
 assert.equal(crossSite.json.error,'WORKBENCH_FETCH_SITE_REJECTED');
});

test('local host refuses unmanifested, tampered or CSP-less application HTML',async t=>{
 const missing=makeBundle(t);rmSync(join(missing,'manifest.json'));
 await assert.rejects(()=>startResearchWorkbenchServer({root:missing,port:0}),/WORKBENCH_MANIFEST_NOT_FOUND/u);

 const tampered=makeBundle(t);
 writeFileSync(join(tampered,'MPC-Research-Workbench.html'),readFileSync(join(tampered,'MPC-Research-Workbench.html'),'utf8')+'<!-- tampered -->\n');
 await assert.rejects(()=>startResearchWorkbenchServer({root:tampered,port:0}),/WORKBENCH_MANIFEST_HTML_IDENTITY_INVALID/u);

 const cspLess=makeBundle(t),raw=Buffer.from('<!doctype html><title>CSP missing</title>\n');
 writeFileSync(join(cspLess,'MPC-Research-Workbench.html'),raw);
 writeFileSync(join(cspLess,'manifest.json'),JSON.stringify({
  format_version:'MPC_METHOD_SELF_SCAN_OFFLINE_MANIFEST_1.0',artifact_count:1,
  artifacts:[{path:'MPC-Research-Workbench.html',bytes:raw.length,sha256:sha256(raw)}]
 },null,2)+'\n');
 await assert.rejects(()=>startResearchWorkbenchServer({root:cspLess,port:0}),/WORKBENCH_HTML_CSP_INVALID/u);
});

test('database resolution rejects unsafe occupied and linked paths while preserving a bundle-local ignored default',t=>{
 const root=temporary(t),defaultPath=resolveWorkbenchDatabasePath({bundleRoot:root,platform:'linux'});
 assert.equal(defaultPath,join(root,'.wrangler','research-workbench','research-workbench.sqlite'));
 assert.throws(()=>resolveWorkbenchDatabasePath({bundleRoot:root,databasePath:'file:unsafe.sqlite'}),/WORKBENCH_DATABASE_PATH_INVALID/u);
 assert.throws(()=>resolveWorkbenchDatabasePath({bundleRoot:root,databasePath:'//server/share/unsafe.sqlite'}),/WORKBENCH_DATABASE_PATH_INVALID/u);
 assert.throws(()=>resolveWorkbenchDatabasePath({bundleRoot:root,databasePath:join(root,'wrong.txt')}),/WORKBENCH_DATABASE_EXTENSION_REJECTED/u);
 const occupied=join(root,'occupied.sqlite');mkdirSync(occupied);
 assert.throws(()=>resolveWorkbenchDatabasePath({bundleRoot:root,databasePath:occupied}),/WORKBENCH_DATABASE_NONFILE_REJECTED/u);
 const corrupt=join(root,'corrupt.sqlite');writeFileSync(corrupt,'not sqlite');
 assert.throws(()=>resolveWorkbenchDatabasePath({bundleRoot:root,databasePath:corrupt}),/WORKBENCH_DATABASE_NOT_SQLITE/u);
 const source=join(root,'source.sqlite');writeFileSync(source,'');
 const linked=join(root,'linked.sqlite');symlinkSync(source,linked);
 assert.throws(()=>resolveWorkbenchDatabasePath({bundleRoot:root,databasePath:linked}),/WORKBENCH_DATABASE_SYMLINK_REJECTED/u);
 const sidecarTarget=join(root,'sidecar-target');writeFileSync(sidecarTarget,'');
 const sidecarDatabase=join(root,'sidecar.sqlite');symlinkSync(sidecarTarget,sidecarDatabase+'-wal');
 assert.throws(()=>resolveWorkbenchDatabasePath({bundleRoot:root,databasePath:sidecarDatabase}),/WORKBENCH_DATABASE_SYMLINK_REJECTED/u);
 const danglingDatabase=join(root,'dangling.sqlite');symlinkSync(join(root,'missing.sqlite'),danglingDatabase);
 assert.throws(()=>resolveWorkbenchDatabasePath({bundleRoot:root,databasePath:danglingDatabase}),/WORKBENCH_DATABASE_SYMLINK_REJECTED/u);
 const danglingSidecarDatabase=join(root,'dangling-sidecar.sqlite');symlinkSync(join(root,'missing-wal'),danglingSidecarDatabase+'-wal');
 assert.throws(()=>resolveWorkbenchDatabasePath({bundleRoot:root,databasePath:danglingSidecarDatabase}),/WORKBENCH_DATABASE_SYMLINK_REJECTED/u);
 const linkedParentSource=join(root,'actual-parent');mkdirSync(linkedParentSource);
 const linkedParent=join(root,'linked-parent');symlinkSync(linkedParentSource,linkedParent,'dir');
 assert.throws(()=>resolveWorkbenchDatabasePath({bundleRoot:root,databasePath:join(linkedParent,'data.sqlite')}),/WORKBENCH_DATABASE_SYMLINK_REJECTED/u);
 assert.throws(()=>resolveWorkbenchDatabasePath({bundleRoot:root,platform:'win32',env:{}}),/WORKBENCH_LOCALAPPDATA_REQUIRED/u);
 const foreign=join(root,'foreign.sqlite'),foreignDb=new DatabaseSync(foreign);
 foreignDb.exec('CREATE TABLE unrelated(value TEXT)');foreignDb.close();
 assert.throws(()=>new ResearchWorkbenchStore(foreign),/WORKBENCH_DATABASE_OCCUPIED/u);
 const guarded=join(root,'guarded.sqlite'),guardedStore=new ResearchWorkbenchStore(guarded);guardedStore.close();
 const tamper=new DatabaseSync(guarded);tamper.exec('CREATE TRIGGER hostile AFTER INSERT ON workbench_queue BEGIN SELECT 1; END');tamper.close();
 assert.throws(()=>new ResearchWorkbenchStore(guarded),/WORKBENCH_SCHEMA_IDENTITY_MISMATCH/u);
});

test('store schema, CLI parsing and browser launch remain bounded and shell-free',t=>{
 const root=temporary(t),database=join(root,'store.sqlite');
 const store=new ResearchWorkbenchStore(database);
 try{
  assert.equal(store.status().integrity,'ok');
  assert.equal(store.status().run_count,0);
 }finally{store.close()}
 assert.deepEqual(parseWorkbenchServerArguments(['--root',root,'--database',database,'--port','0','--open']),{
  open:true,root,database,port:0
 });
 assert.throws(()=>parseWorkbenchServerArguments(['--root',root,'--root',root]),/WORKBENCH_ARGUMENT/u);
 assert.throws(()=>parseWorkbenchServerArguments(['--root',root,'--host','0.0.0.0']),/WORKBENCH_ARGUMENT_UNKNOWN/u);
 assert.throws(()=>parseWorkbenchServerArguments(['--root',root,'--port','80']),/WORKBENCH_PORT_INVALID/u);
 assert.ok(QUEUE_PROVIDERS.includes('LOCAL_MODEL_HOST'));
 assert.ok(QUEUE_ACTIONS.includes('REQUEST_ANALYSIS'));
 const calls=[];
 const child={once(){return this},unref(){calls.push('unref')}};
 const launched=openWorkbenchUrl('http://127.0.0.1:8765/',{
  platform:'win32',
  spawnProcess:(command,args,options)=>{calls.push({command,args,options});return child}
 });
 assert.equal(launched.command,'rundll32.exe');
 assert.deepEqual(launched.args,['url.dll,FileProtocolHandler','http://127.0.0.1:8765/']);
 assert.equal(calls[0].options.shell,false);
 assert.equal(calls[0].options.detached,true);
 assert.equal(calls[0].args.some(value=>/[;&|]/u.test(value)),false);
});
