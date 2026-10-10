import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {request as httpRequest} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import test from 'node:test';

import {
  MPC_WORKSPACE_CSP,
  startMpcWorkspaceServer
} from '../scripts/mpc-workspace-server.mjs';
import {createTransferEnvelope,serializeTransferEnvelope} from '../lib/mpc-workspace-transfer.mjs';

const RENDERER_ROOT=resolve(import.meta.dirname,'..','desktop','renderer');
const CSRF='mpc-workspace-test-csrf-token-000000000000';

function temporary(t,prefix='mpc-workspace-server-'){
  const path=mkdtempSync(join(tmpdir(),prefix));
  t.after(()=>rmSync(path,{recursive:true,force:true}));
  return path;
}

function callHttp(running,{method='GET',path='/',headers={},body}={}){
  return new Promise((resolveCall,reject)=>{
    const request=httpRequest({hostname:'127.0.0.1',port:running.port,method,path,headers},response=>{
      const chunks=[];
      response.on('data',chunk=>chunks.push(chunk));
      response.on('end',()=>{
        const raw=Buffer.concat(chunks),text=raw.toString('utf8');
        const json=(response.headers['content-type']??'').startsWith('application/json')?JSON.parse(text):null;
        resolveCall({status:response.statusCode,headers:response.headers,raw,text,json});
      });
    });
    request.once('error',reject);
    request.end(body);
  });
}

function writeHeaders(running,{csrf=CSRF,origin=`http://127.0.0.1:${running.port}`,type='application/json; charset=utf-8'}={}){
  return {
    ...(csrf===null?{}:{'X-MPC-CSRF':csrf}),
    ...(origin===null?{}:{Origin:origin}),
    ...(type===null?{}:{'Content-Type':type})
  };
}

function postJson(running,path,value,options={}){
  return callHttp(running,{method:'POST',path,headers:writeHeaders(running,options),body:JSON.stringify(value)});
}

const providerProfile='ollama-qwen3-4b-instruct';
const discoveredModels=async()=>({
  status:'AVAILABLE',endpoint:'http://127.0.0.1:11434',
  models:[{name:'qwen3:4b-instruct',model:'qwen3:4b-instruct',digest:'a'.repeat(64)}],
  loaded_models:[]
});
const unavailableModel=async(input,routed,{model})=>({
  status:'PROVIDER_UNAVAILABLE',outcome:'INCOMPLETE',model_invoked:true,
  provider:'TEST_ADAPTER',model,observed_model:null,proposal:null,
  fact_summary:routed.fact_summary,next_action:routed.next_action,
  error:{code:'TEST_PROVIDER_OFFLINE'}
});
const availableModel=async(input,routed,{model,signal})=>({
  status:signal?.aborted?'CANCELLED':'MODEL_PROPOSAL_READY',
  outcome:signal?.aborted?'CANCELLED':'COMPLETED',model_invoked:true,
  provider:'TEST_ADAPTER',model,observed_model:model,
  proposal:signal?.aborted?null:{observations:[],interpretation:'The retained alpha record was analyzed by the injected test model.',next_question:'Review the source-bound report.',assessment:'UNDETERMINED'},
  fact_summary:routed.fact_summary,next_action:routed.next_action,error:null
});

test('real loopback service completes and restores the source-bound workspace journey without network',async t=>{
  const dataRoot=temporary(t),folder=join(dataRoot,'selected-folder');
  mkdirSync(folder);writeFileSync(join(folder,'note.txt'),'folder alpha evidence\n','utf8');
  let running=await startMpcWorkspaceServer({rendererRoot:RENDERER_ROOT,dataRoot,csrfToken:CSRF,
    adapters:{runModel:unavailableModel,discoverModels:discoveredModels}});
  t.after(async()=>running.close());

  const home=await callHttp(running);
  assert.equal(home.status,200);
  assert.equal(home.headers['content-security-policy'],MPC_WORKSPACE_CSP);
  assert.equal(home.headers['cache-control'],'no-store');
  assert.equal(home.headers['access-control-allow-origin'],undefined);
  assert.match(home.text,/MPC Workspace/u);
  // The screen reader imports this helper in the actual rendered page: the
  // loopback server must make that explicit module available to Chromium.
  const sourceChoice=await callHttp(running,{path:'/screen-source-choice.js'});
  assert.equal(sourceChoice.status,200);
  assert.equal(sourceChoice.headers['content-type'],'text/javascript; charset=utf-8');
  assert.equal(sourceChoice.headers['cache-control'],'no-store');
  assert.match(sourceChoice.text,/export function screenSourceStartGate/u);
  const roiSource=await callHttp(running,{path:'/roi-process.js'});
  assert.equal(roiSource.status,200);
  assert.equal(roiSource.headers['content-type'],'text/javascript; charset=utf-8');
  assert.equal(roiSource.headers['cache-control'],'no-store');
  assert.match(roiSource.text,/export function proposeInverseOcrCrop/u);
  const networkReader=await callHttp(running,{path:'/network-reader.js'});
  assert.equal(networkReader.status,200);
  assert.equal(networkReader.headers['content-type'],'text/javascript; charset=utf-8');
  assert.match(networkReader.text,/initializeNetworkPanel/u);

  const empty=await callHttp(running,{path:'/api/workspace/bootstrap'});
  assert.equal(empty.status,200,empty.text);
  assert.equal(empty.json.csrf_token,CSRF);
  assert.equal(empty.json.service.status,'READY_LOCAL');
  assert.deepEqual(empty.json.projects,[]);

  const created=await postJson(running,'/api/workspace/projects',{
    operation:'CREATE',project_id:'PROJECT-E2E',display_name:'Evidence project',
    objective:'Exercise the first working journey.',retention_policy:'RETAIN_TEXT'
  });
  assert.equal(created.status,201,created.text);
  assert.equal(created.json.project.project_id,'PROJECT-E2E');

  const draftText='What does alpha show?';
  const draft=await postJson(running,'/api/workspace/projects/PROJECT-E2E/draft',{
    project_id:'PROJECT-E2E',text:draftText,utf8_bytes:Buffer.byteLength(draftText)
  });
  assert.equal(draft.status,200,draft.text);
  assert.equal(draft.json.draft.retained,true);

  const input=await postJson(running,'/api/workspace/inputs',{
    project_id:'PROJECT-E2E',kind:'TEXT',name:'malformed.json',content:'{"alpha":',detected_format_hint:'JSON',format_hint:'JSON'
  });
  assert.equal(input.status,201,input.text);
  assert.equal(input.json.input.parse.status,'INVALID_RETAINED');
  assert.equal(input.json.input.content_sha256.length,64);
  const repeatedInput=await postJson(running,'/api/workspace/inputs',{
    project_id:'PROJECT-E2E',kind:'TEXT',name:'malformed.json',content:'{"alpha":',format_hint:'JSON'
  });
  assert.equal(repeatedInput.status,201,repeatedInput.text);
  assert.equal(repeatedInput.json.input.source.id,input.json.input.source.id);

  const folderInput=await postJson(running,'/api/workspace/inputs',{
    project_id:'PROJECT-E2E',kind:'FOLDER',selected_path:folder,include_subfolders:true,exclusions:['*.tmp']
  });
  assert.equal(folderInput.status,201,folderInput.text);
  assert.equal(folderInput.json.input.counts.indexed,1);
  assert.equal(folderInput.json.input.originals_modified,false);
  assert.equal(folderInput.json.input.acquisition_ids.length,1);
  assert.match(folderInput.json.input.snapshot_id,/^SNAPSHOT-/u);

  const started=await postJson(running,'/api/workspace/jobs',{
    operation:'START',project_id:'PROJECT-E2E',task_id:'TASK-E2E',question:'What does alpha show?',
    acquisition_ids:folderInput.json.input.acquisition_ids,
    provider_profile_id:providerProfile,provider_availability:'UNAVAILABLE',idempotency_key:'REQUEST-E2E'
  });
  assert.equal(started.status,202,started.text);
  assert.equal(started.json.job.state,'BLOCKED_MODEL_UNAVAILABLE');
  assert.equal(started.json.job.full_router_receipt_retained,true);
  assert.equal(started.json.job.router_receipt.workflow.source_records.length,1);
  assert.equal(started.json.job.checkpoint.packet.workflow.records[0].content,'folder alpha evidence\n');
  assert.notEqual(started.json.job.checkpoint.packet.workflow.records[0].content,'What does alpha show?');
  const jobId=started.json.job.job_id;

  const polled=await callHttp(running,{path:`/api/workspace/jobs/${jobId}`});
  assert.equal(polled.status,200,polled.text);
  assert.equal(polled.json.job.router_receipt.workflow.source_records.length,1);

  writeFileSync(join(folder,'note.txt'),'folder beta evidence changed\n','utf8');
  const rescanned=await postJson(running,'/api/workspace/inputs',{
    project_id:'PROJECT-E2E',kind:'FOLDER',selected_path:folder,include_subfolders:true,exclusions:['*.tmp']
  });
  assert.equal(rescanned.status,201,rescanned.text);
  assert.equal(rescanned.json.input.mount_id,folderInput.json.input.mount_id);
  assert.equal(rescanned.json.input.acquisition_ids.length,1);
  assert.notEqual(rescanned.json.input.snapshot_id,folderInput.json.input.snapshot_id);
  const compared=await postJson(running,'/api/workspace/snapshots/compare',{
    project_id:'PROJECT-E2E',left_snapshot_id:folderInput.json.input.snapshot_id,
    right_snapshot_id:rescanned.json.input.snapshot_id
  });
  assert.equal(compared.status,200,compared.text);
  assert.equal(compared.json.comparison.changes.changed.length,1);

  await running.close();
  running=await startMpcWorkspaceServer({rendererRoot:RENDERER_ROOT,dataRoot,csrfToken:CSRF,
    adapters:{runModel:availableModel,discoverModels:discoveredModels}});
  const restored=await callHttp(running,{path:'/api/workspace/bootstrap'});
  assert.equal(restored.status,200,restored.text);
  assert.equal(restored.json.selected_project_id,'PROJECT-E2E');
  assert.equal(restored.json.project.draft.text,draftText);
  assert.equal(restored.json.resume_state.job.job_id,jobId);
  assert.equal(restored.json.tasks.length,1);

  const resumed=await postJson(running,`/api/workspace/jobs/${jobId}/resume`,{
    project_id:'PROJECT-E2E',resume_reason:'The selected test provider became available.',
    provider_profile_id:providerProfile,provider_availability:'UNAVAILABLE'
  });
  assert.equal(resumed.status,200,resumed.text);
  assert.equal(resumed.json.job.state,'COMPLETE');
  assert.equal(resumed.json.job.resume.repeated_acquisitions,0);
  assert.equal(resumed.json.job.job_id,jobId);

  const report=await postJson(running,'/api/workspace/reports',{
    operation:'CREATE',project_id:'PROJECT-E2E',job_id:jobId,title:'Source-bound acceptance report'
  });
  assert.equal(report.status,201,report.text);
  assert.equal(report.json.report.artifact_sha256.length,64);
  const reportId=report.json.report.report_id;
  const reopenedReport=await callHttp(running,{path:`/api/workspace/reports/${reportId}`});
  assert.equal(reopenedReport.status,200,reopenedReport.text);
  assert.match(reopenedReport.json.report.markdown,/Source-bound acceptance report/u);

  const search=await postJson(running,'/api/workspace/search',{
    project_id:'PROJECT-E2E',query:'alpha',scopes:['LOCAL','GOOGLE_DRIVE']
  });
  assert.equal(search.status,200,search.text);
  assert.ok(search.json.results.length>=2);
  assert.ok(search.json.results.every(result=>result.project_id==='PROJECT-E2E'&&result.source_id));
  assert.equal(search.json.coverage.status,'RETAINED_TEXT_ONLY');
  assert.deepEqual(search.json.unavailable.map(row=>row.scope),['GOOGLE_DRIVE']);

  const setupRequired=await postJson(running,'/api/workspace/connections/setup',{
    project_id:'PROJECT-E2E',provider:'GITHUB',action:'SIGN_IN'
  });
  assert.equal(setupRequired.status,200,setupRequired.text);
  assert.equal(setupRequired.json.setup.status,'DRIVER_SETUP_REQUIRED');
  assert.equal(setupRequired.json.setup.external_action_performed,false);
  assert.equal(setupRequired.json.setup.last_operation_verified,false);
  assert.equal(running.service.store.listConnections('PROJECT-E2E').length,0);

  const configured=await postJson(running,'/api/workspace/connections',{
    operation:'CONFIGURE',project_id:'PROJECT-E2E',configuration:{display_name:'GitHub test',provider:'GITHUB',transport:'stdio',endpoint_or_command:'github-mcp'}
  });
  assert.equal(configured.status,201,configured.text);
  const connectionId=configured.json.connection.connection_id;
  const observed=await postJson(running,'/api/workspace/connections/test',{
    project_id:'PROJECT-E2E',connection_id:connectionId,operation:'READ'
  });
  assert.equal(observed.status,200,observed.text);
  assert.equal(observed.json.observation.current_observation.status,'UNAVAILABLE');
  assert.equal(observed.json.observation.attempted_operation,false);
  assert.equal(observed.json.observation.last_operation_verified,false);
  running.service.adapters.testConnection=async()=>({status:'SUCCESS',receipt_id:'TEST-NATIVE-RECEIPT-1',selected_resource:'fixture'});
  const verified=await postJson(running,'/api/workspace/connections/test',{
    project_id:'PROJECT-E2E',connection_id:connectionId,operation:'READ',
    operation_input:{selected_resource:'fixture'}
  });
  assert.equal(verified.status,200,verified.text);
  assert.equal(verified.json.observation.current_observation.status,'SUCCESS');
  assert.equal(verified.json.observation.last_operation_verified,true);
  assert.match(verified.json.observation.operation_receipt_id,/^RECEIPT-/u);

  const scripted=await postJson(running,'/api/workspace/scripts',{
    operation:'CREATE',project_id:'PROJECT-E2E',job_id:jobId,language:'POWERSHELL',request:'List the selected directory without modifying it.'
  });
  assert.equal(scripted.status,201,scripted.text);
  assert.equal(scripted.json.script.state,'DRAFT');
  assert.match(scripted.json.script.content,/never auto-executed/iu);
  const scriptId=scripted.json.script.script_id;
  const exported=await postJson(running,'/api/workspace/scripts',{
    operation:'EXPORTED',project_id:'PROJECT-E2E',job_id:jobId,script_id:scriptId,language:'POWERSHELL'
  });
  assert.equal(exported.status,201,exported.text);
  assert.equal(exported.json.script.state,'EXPORTED_FOR_MANUAL_RUN');
  assert.equal(exported.json.script.execution_observed,false);
  const output=await postJson(running,'/api/workspace/scripts',{
    operation:'INGEST_OUTPUT',project_id:'PROJECT-E2E',job_id:jobId,script_id:scriptId,
    language:'POWERSHELL',output:'alpha.txt',exit_status:0
  });
  assert.equal(output.status,201,output.text);
  assert.equal(output.json.script.state,'OUTPUT_INGESTED');
  assert.equal(output.json.script.execution_observed,false);
  const repeatedOutput=await postJson(running,'/api/workspace/scripts',{
    operation:'INGEST_OUTPUT',project_id:'PROJECT-E2E',job_id:jobId,script_id:scriptId,
    language:'POWERSHELL',output:'alpha.txt',exit_status:0
  });
  assert.equal(repeatedOutput.status,201,repeatedOutput.text);
  assert.equal(repeatedOutput.json.script.reused,true);
  assert.equal(running.service.store.getScript('PROJECT-E2E',scriptId).outputs.length,1);

  const finalProject=await callHttp(running,{path:'/api/workspace/projects/PROJECT-E2E'});
  assert.equal(finalProject.status,200,finalProject.text);
  assert.equal(finalProject.json.project.tasks.filter(task=>task.task_id==='TASK-E2E').length,1);
  assert.ok(finalProject.json.project.reports.some(item=>item.report_id===reportId));
  assert.equal(finalProject.json.project.attached_folders.length,1);

  const disabled=await postJson(running,'/api/workspace/connections',{
    operation:'DISCONNECT',project_id:'PROJECT-E2E',connection_id:connectionId
  });
  assert.equal(disabled.status,201,disabled.text);
  assert.equal(disabled.json.connection.enabled,false);
  assert.equal(disabled.json.connection.supersedes_connection_id,connectionId);
  const disabledConnectionId=disabled.json.connection.connection_id;
  const disabledBootstrap=await callHttp(running,{path:'/api/workspace/bootstrap'});
  assert.equal(disabledBootstrap.json.connections.find(item=>item.provider_namespace==='GITHUB').enabled,false);
  const blockedTest=await postJson(running,'/api/workspace/connections/test',{
    project_id:'PROJECT-E2E',connection_id:disabledConnectionId,operation:'READ'
  });
  assert.equal(blockedTest.status,409,blockedTest.text);
  assert.equal(blockedTest.json.error,'MPC_WORKSPACE_CONNECTION_DISABLED');

  await running.close();
  running=await startMpcWorkspaceServer({rendererRoot:RENDERER_ROOT,dataRoot,csrfToken:CSRF,
    adapters:{runModel:availableModel,discoverModels:discoveredModels}});
  const reopenedConnections=await callHttp(running,{path:'/api/workspace/bootstrap'});
  assert.equal(reopenedConnections.json.connections.find(item=>item.provider_namespace==='GITHUB').enabled,false);
  const enabled=await postJson(running,'/api/workspace/connections',{
    operation:'CONNECT',project_id:'PROJECT-E2E',connection_id:disabledConnectionId
  });
  assert.equal(enabled.status,201,enabled.text);
  assert.equal(enabled.json.connection.enabled,true);
});

test('job reads accept only one validated project_id query and every other query remains rejected',async t=>{
  const calls=[];
  const service={
    getJob(jobId,projectId){calls.push({jobId,projectId});return {job_id:jobId,project_id:projectId??'ACTIVE-PROJECT'};}
  };
  const running=await startMpcWorkspaceServer({rendererRoot:RENDERER_ROOT,service,csrfToken:CSRF});
  t.after(()=>running.close());

  const qualified=await callHttp(running,{path:'/api/workspace/jobs/JOB%3A001?project_id=PROJECT%3AONE'});
  assert.equal(qualified.status,200,qualified.text);
  assert.deepEqual(qualified.json.job,{job_id:'JOB:001',project_id:'PROJECT:ONE'});
  assert.deepEqual(calls,[{jobId:'JOB:001',projectId:'PROJECT:ONE'}]);

  const unqualified=await callHttp(running,{path:'/api/workspace/jobs/JOB-LEGACY'});
  assert.equal(unqualified.status,200,unqualified.text);
  assert.deepEqual(calls.at(-1),{jobId:'JOB-LEGACY',projectId:undefined});

  const rejected=[
    '/?project_id=PROJECT-ONE',
    '/api/workspace/bootstrap?project_id=PROJECT-ONE',
    '/api/workspace/jobs/JOB-001?project_id=',
    '/api/workspace/jobs/JOB-001?project_id=..%2FPROJECT-ONE',
    '/api/workspace/jobs/JOB-001?project_id=PROJECT-ONE&project_id=PROJECT-TWO',
    '/api/workspace/jobs/JOB-001?project_id=PROJECT-ONE&extra=1',
    '/api/workspace/jobs/JOB-001/resume?project_id=PROJECT-ONE',
    '/api/workspace/jobs/JOB-001?PROJECT_ID=PROJECT-ONE'
  ];
  for(const path of rejected){
    const response=await callHttp(running,{path});
    assert.equal(response.status,400,`${path}: ${response.text}`);
    assert.equal(response.json.error,'MPC_WORKSPACE_QUERY_REJECTED',path);
  }
  const writeQuery=await callHttp(running,{method:'POST',path:'/api/workspace/jobs/JOB-001?project_id=PROJECT-ONE',
    headers:writeHeaders(running),body:'{}'});
  assert.equal(writeQuery.status,400,writeQuery.text);
  assert.equal(writeQuery.json.error,'MPC_WORKSPACE_QUERY_REJECTED');
  assert.equal(calls.length,2,'rejected queries never reach the service');
});

test('portable transfer HTTP round trip is exact, duplicate-safe, metadata-safe and script-inert',async t=>{
  let scriptExecutions=0;
  const running=await startMpcWorkspaceServer({rendererRoot:RENDERER_ROOT,dataRoot:temporary(t),csrfToken:CSRF,
    adapters:{executeScript:async()=>{scriptExecutions+=1;return {status:'SHOULD_NOT_RUN'};}}});
  t.after(()=>running.close());
  const counts=projectId=>({
    sources:running.service.store.listSources(projectId,1000).length,
    artifacts:running.service.store.listArtifacts(projectId,1000).length,
    retained:running.service.store.listRetainedAcquisitions(projectId,1000).length,
    scripts:running.service.store.listScripts(projectId,1000).length,
    operationReceipts:running.service.store.db.prepare(
      'SELECT count(*) AS count FROM cc_operation_receipts WHERE project_id=?').get(projectId).count
  });

  const sourceProject=await postJson(running,'/api/workspace/projects',{
    operation:'CREATE',project_id:'PROJECT-TRANSFER-SOURCE',display_name:'Transfer source',
    objective:'Move exact retained evidence.',retention_policy:'RETAIN_TEXT'
  });
  assert.equal(sourceProject.status,201,sourceProject.text);
  const exactText='alpha first line\r\nalpha second line\r\n';
  const acquired=await postJson(running,'/api/workspace/inputs',{
    project_id:'PROJECT-TRANSFER-SOURCE',kind:'TEXT',name:'windows-lines.txt',content:exactText,format_hint:'TEXT'
  });
  assert.equal(acquired.status,201,acquired.text);
  const exported=await postJson(running,'/api/workspace/transfers/export',{project_id:'PROJECT-TRANSFER-SOURCE'});
  assert.equal(exported.status,200,exported.text);
  assert.equal(exported.json.transfer.status,'TRANSFER_EXPORTED');
  assert.equal(exported.json.transfer.external_action_performed,false);
  assert.equal(exported.json.transfer.verification.scripts_executed,false);
  const sourceEnvelope=JSON.parse(exported.json.transfer.serialized);
  assert.equal(sourceEnvelope.items.length,1);
  assert.equal(sourceEnvelope.items[0].content,exactText,'CRLF bytes survive JSON serialization');

  const targetProject=await postJson(running,'/api/workspace/projects',{
    operation:'CREATE',project_id:'PROJECT-TRANSFER-TARGET',display_name:'Transfer target',
    objective:'Receive a selected portable task.',retention_policy:'RETAIN_TEXT'
  });
  assert.equal(targetProject.status,201,targetProject.text);
  const pristineCounts=counts('PROJECT-TRANSFER-TARGET');
  const noTarget=await postJson(running,'/api/workspace/transfers/import',{
    transfer_text:exported.json.transfer.serialized
  });
  assert.equal(noTarget.status,422,noTarget.text);
  assert.equal(noTarget.json.error,'MPC_WORKSPACE_TRANSFER_TARGET_PROJECT_REQUIRED');
  assert.deepEqual(counts('PROJECT-TRANSFER-TARGET'),pristineCounts,'implicit active-project import cannot mutate state');

  const tampered=structuredClone(sourceEnvelope);
  tampered.items[0].content=tampered.items[0].content.replace('first','FIRST');
  const rejectedTamper=await postJson(running,'/api/workspace/transfers/import',{
    project_id:'PROJECT-TRANSFER-TARGET',transfer_text:JSON.stringify(tampered)
  });
  assert.equal(rejectedTamper.status,422,rejectedTamper.text);
  assert.equal(rejectedTamper.json.error,'MPC_WORKSPACE_TRANSFER_ITEM_HASH_MISMATCH');
  assert.deepEqual(counts('PROJECT-TRANSFER-TARGET'),pristineCounts,'verification happens before any import mutation');

  const imported=await postJson(running,'/api/workspace/transfers/import',{
    project_id:'PROJECT-TRANSFER-TARGET',transfer_text:exported.json.transfer.serialized
  });
  assert.equal(imported.status,201,imported.text);
  assert.equal(imported.json.transfer.status,'IMPORTED');
  assert.equal(imported.json.transfer.target_project_id,'PROJECT-TRANSFER-TARGET');
  assert.equal(imported.json.transfer.exported_project_mapping.exporting_project_id,'PROJECT-TRANSFER-SOURCE');
  assert.equal(imported.json.transfer.scripts_executed,false);
  assert.equal(imported.json.transfer.automatic_run_performed,false);
  assert.equal(imported.json.transfer.native_read_performed,false);
  assert.equal(imported.json.transfer.source_authenticated,false);
  const targetRetained=running.service.store.listRetainedAcquisitions('PROJECT-TRANSFER-TARGET',1000);
  assert.equal(targetRetained.length,1);
  assert.equal(targetRetained[0].retained_text,exactText,'import preserves exact CRLF text bytes');
  const importedCounts=counts('PROJECT-TRANSFER-TARGET');

  const duplicate=await postJson(running,'/api/workspace/transfers/import',{
    project_id:'PROJECT-TRANSFER-TARGET',transfer_text:exported.json.transfer.serialized
  });
  assert.equal(duplicate.status,201,duplicate.text);
  assert.equal(duplicate.json.transfer.status,'REUSED');
  assert.equal(duplicate.json.transfer.repeated_mutations,0);
  assert.deepEqual(counts('PROJECT-TRANSFER-TARGET'),importedCounts,'exact duplicate import performs no mutation');

  const conflictingEnvelope=createTransferEnvelope({
    transfer_id:sourceEnvelope.transfer_id,
    exporter:sourceEnvelope.exporter,
    exported_at_utc:sourceEnvelope.exported_at_utc,
    project_mapping:sourceEnvelope.project_mapping,
    objective:sourceEnvelope.objective,
    items:[{item_id:'CONFLICTING-TEXT',kind:'TEXT',name:'different.txt',text:'different verified bytes'}]
  });
  const conflict=await postJson(running,'/api/workspace/transfers/import',{
    project_id:'PROJECT-TRANSFER-TARGET',transfer_text:serializeTransferEnvelope(conflictingEnvelope)
  });
  assert.equal(conflict.status,409,conflict.text);
  assert.equal(conflict.json.error,'MPC_WORKSPACE_TRANSFER_ID_CONFLICT');
  assert.deepEqual(counts('PROJECT-TRANSFER-TARGET'),importedCounts,'same transfer ID with different verified bytes is rejected');

  const scriptText='# Manual only\r\nWrite-Output "portable script was run manually"\r\n';
  const scriptEnvelope=createTransferEnvelope({
    transfer_id:'TRANSFER-SCRIPT-INERT',
    exporter:{application:'MPC Workspace test',version:'1'},
    project_mapping:{exporting_project_id:'PORTABLE-SOURCE',exporting_project_name:'Portable source',selected_local_project_id:null},
    objective:'Review an inert script draft.',
    items:[{item_id:'SCRIPT-DRAFT-1',kind:'SCRIPT_DRAFT',name:'Inspect.ps1',
      media_type:'text/plain; charset=utf-8',text:scriptText,
      declared_origin:{owner:'USER',namespace:'PORTABLE',native_id_type:'STRING',native_id:'script-draft-1'}}],
    native_receipts:[{receipt_id:'HISTORICAL-NOT-ACTIVATED',status:'SUCCESS'}]
  });
  const scriptImport=await postJson(running,'/api/workspace/transfers/import',{
    project_id:'PROJECT-TRANSFER-TARGET',transfer_text:serializeTransferEnvelope(scriptEnvelope,{pretty:true})
  });
  assert.equal(scriptImport.status,201,scriptImport.text);
  assert.equal(scriptImport.json.transfer.status,'IMPORTED');
  assert.equal(scriptImport.json.transfer.scripts_executed,false);
  assert.equal(scriptImport.json.transfer.historical_receipts_activated,false);
  assert.equal(scriptImport.json.transfer.automatic_run_performed,false);
  assert.equal(scriptImport.json.transfer.imported[0].script_executed,false);
  assert.equal(scriptExecutions,0,'import never calls an execution adapter');
  assert.equal(running.service.store.listScripts('PROJECT-TRANSFER-TARGET',1000).length,0,
    'a transferred script remains input data, not an executable workshop record');
  assert.equal(running.service.store.db.prepare(
    'SELECT count(*) AS count FROM cc_operation_receipts WHERE project_id=?').get('PROJECT-TRANSFER-TARGET').count,0,
  'historical receipts are not activated as current operation receipts');
  assert.ok(running.service.store.listRetainedAcquisitions('PROJECT-TRANSFER-TARGET',1000)
    .some(row=>row.retained_text===scriptText));

  const metadataText='RAW-METADATA-SENTINEL-9c3f';
  const metadataDraft='RAW-DRAFT-SENTINEL-e64a';
  const metadataProject=await postJson(running,'/api/workspace/projects',{
    operation:'CREATE',project_id:'PROJECT-TRANSFER-METADATA',display_name:'Metadata only transfer',
    objective:'Do not serialize raw metadata-only input.',retention_policy:'METADATA_ONLY'
  });
  assert.equal(metadataProject.status,201,metadataProject.text);
  const metadataInput=await postJson(running,'/api/workspace/inputs',{
    project_id:'PROJECT-TRANSFER-METADATA',kind:'TEXT',name:'private.txt',content:metadataText,format_hint:'TEXT'
  });
  assert.equal(metadataInput.status,201,metadataInput.text);
  const metadataDraftResult=await postJson(running,'/api/workspace/projects/PROJECT-TRANSFER-METADATA/draft',{
    project_id:'PROJECT-TRANSFER-METADATA',text:metadataDraft,utf8_bytes:Buffer.byteLength(metadataDraft)
  });
  assert.equal(metadataDraftResult.status,200,metadataDraftResult.text);
  assert.equal(metadataDraftResult.json.draft.retained,false);
  const metadataExport=await postJson(running,'/api/workspace/transfers/export',{
    project_id:'PROJECT-TRANSFER-METADATA'
  });
  assert.equal(metadataExport.status,200,metadataExport.text);
  assert.equal(metadataExport.json.transfer.verification.item_count,0);
  assert.equal(metadataExport.json.transfer.coverage.metadata_only_sources_excluded,1);
  assert.doesNotMatch(metadataExport.json.transfer.serialized,new RegExp(`${metadataText}|${metadataDraft}`,'u'));
  assert.equal(running.service.store.listRetainedAcquisitions('PROJECT-TRANSFER-METADATA',1000).length,0);
  assert.equal(scriptExecutions,0);
});

test('loopback host rejects cross-origin, secret-bearing and malformed writes and remains available',async t=>{
  const running=await startMpcWorkspaceServer({rendererRoot:RENDERER_ROOT,dataRoot:temporary(t),csrfToken:CSRF});
  t.after(()=>running.close());

  const badHost=await callHttp(running,{path:'/api/workspace/bootstrap',headers:{Host:'attacker.invalid'}});
  assert.equal(badHost.status,421,badHost.text);
  assert.equal(badHost.json.error,'MPC_WORKSPACE_HOST_REJECTED');
  const missingCsrf=await postJson(running,'/api/workspace/projects',{display_name:'No token'},{csrf:null});
  assert.equal(missingCsrf.status,403,missingCsrf.text);
  assert.equal(missingCsrf.json.error,'MPC_WORKSPACE_CSRF_REJECTED');
  const badOrigin=await postJson(running,'/api/workspace/projects',{display_name:'Bad origin'},{origin:'https://attacker.invalid'});
  assert.equal(badOrigin.status,403,badOrigin.text);
  assert.equal(badOrigin.json.error,'MPC_WORKSPACE_ORIGIN_REJECTED');
  const secret=await postJson(running,'/api/workspace/projects',{display_name:'Secret',api_key:'must-not-cross-host-boundary'});
  assert.equal(secret.status,422,secret.text);
  assert.equal(secret.json.error,'MPC_WORKSPACE_SECRET_MATERIAL_REJECTED');
  const wrongType=await callHttp(running,{method:'POST',path:'/api/workspace/projects',headers:writeHeaders(running,{type:'text/plain'}),body:'{}'});
  assert.equal(wrongType.status,415,wrongType.text);
  const put=await callHttp(running,{method:'PUT',path:'/api/workspace/projects'});
  assert.equal(put.status,405,put.text);
  assert.equal(put.headers.allow,'GET, POST');
  const traversal=await callHttp(running,{path:'/../package.json'});
  assert.equal(traversal.status,404,traversal.text);
  const stillReady=await callHttp(running,{path:'/api/workspace/bootstrap'});
  assert.equal(stillReady.status,200,stillReady.text);
  assert.equal(stillReady.json.service.status,'READY_LOCAL');
});

test('screen context is an explicit protected host operation',async t=>{
  const calls=[];
  const service={
    bootstrap:async()=>({projects:[],service:{status:'READY_LOCAL'}}),
    handleScreenContext:async input=>{calls.push(structuredClone(input));return {
      schema_version:'MPC_SCREEN_CONTEXT_RESULT_1',status:'FAST_IMAGE_READY_OCR_REQUIRED',
      external_action_performed:false,active_capture:false
    }},
    close:async()=>{}
  };
  const running=await startMpcWorkspaceServer({rendererRoot:RENDERER_ROOT,service,csrfToken:CSRF});
  t.after(()=>running.close());

  const missingCsrf=await postJson(running,'/api/workspace/screen-context',{
    project_id:'PROJECT-A',operation:'CAPTURE_CLIPBOARD'
  },{csrf:null});
  assert.equal(missingCsrf.status,403,missingCsrf.text);
  assert.equal(calls.length,0);

  const wrongOrigin=await postJson(running,'/api/workspace/screen-context',{
    project_id:'PROJECT-A',operation:'CAPTURE_CLIPBOARD'
  },{origin:'https://attacker.invalid'});
  assert.equal(wrongOrigin.status,403,wrongOrigin.text);
  assert.equal(calls.length,0);

  const accepted=await postJson(running,'/api/workspace/screen-context',{
    project_id:'PROJECT-A',operation:'CAPTURE_CLIPBOARD',retention_policy:'METADATA_ONLY'
  });
  assert.equal(accepted.status,201,accepted.text);
  assert.equal(accepted.json.context.status,'FAST_IMAGE_READY_OCR_REQUIRED');
  assert.equal(calls.length,1);
  assert.equal(calls[0].operation,'CAPTURE_CLIPBOARD');

  const get=await callHttp(running,{path:'/api/workspace/screen-context'});
  assert.equal(get.status,405,get.text);
  assert.equal(get.headers.allow,'POST');
  assert.equal(calls.length,1);
});
