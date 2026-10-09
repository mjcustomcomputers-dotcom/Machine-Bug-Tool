import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readdirSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {MpcWorkspaceService} from '../lib/mpc-workspace-service.mjs';

const OBSERVED_MODEL='granite3.2:2b';
const UNAVAILABLE_PROFILE='ollama-qwen3-4b-instruct';

function temporary(t,prefix='mpc-workspace-model-retention-'){
 const path=mkdtempSync(join(tmpdir(),prefix));
 t.after(()=>rmSync(path,{recursive:true,force:true}));
 return path;
}

function discovery(){
 return {
  status:'AVAILABLE',provider:'OLLAMA',endpoint:'http://127.0.0.1:11434',
  models:[{name:OBSERVED_MODEL,model:OBSERVED_MODEL,digest:'a'.repeat(64),size:1234}],
  loaded_models:[]
 };
}

function filesUnder(root){
 const result=[];
 const visit=directory=>{
  for(const name of readdirSync(directory)){
   const path=join(directory,name),stat=statSync(path);
   if(stat.isDirectory())visit(path);
   else if(stat.isFile())result.push(path);
  }
 };
 visit(root);
 return result;
}

async function analysisRoute(packet){
 const records=packet.sources.map(source=>{
  const record=packet.workflow.records.find(candidate=>candidate.source_ref===source.id&&candidate.version===source.version);
  return {
   source_ref:source.id,version:source.version,
   state:record?'CONTENT_AVAILABLE':'CONTENT_REQUIRED',
   content:record?.content??null
  };
 });
 return {
  work_stage:'ANALYSIS',fact_summary:['The selected local evidence is available for bounded analysis.'],
  next_action:{kind:'MODEL_ANALYSIS',label:'Analyze the selected local evidence.'},
  workflow:{
   source_records:records,
   acquired_record_count:records.filter(record=>record.state==='CONTENT_AVAILABLE').length,
   required_record_count:records.length,
   remaining_record_count:records.filter(record=>record.state!=='CONTENT_AVAILABLE').length
  }
 };
}

test('actual discovery enables only observed Ollama models, blocks an unavailable configured model, and persists requested/observed receipt identity',async t=>{
 const dataRoot=temporary(t);
 let modelCalls=0;
 const service=new MpcWorkspaceService({
  dataRoot,
  adapters:{
   discoverModels:async()=>discovery(),
   routeProblem:analysisRoute,
   runModel:async(_packet,_routed,{model})=>{
    modelCalls++;
    return {
     status:'MODEL_PROPOSAL_READY',outcome:'COMPLETED',model_invoked:true,
     provider:'OLLAMA',model,observed_model:model,
     proposal:{observations:[],interpretation:'The injected observed model analyzed the retained fixture.',
      next_question:'Is a newer source version available?',assessment:'UNDETERMINED'},
     diagnostics:{first_token_ms:7,elapsed_ms:19},error:null
    };
   }
  }
 });
 t.after(()=>service.close());

 const bootstrap=await service.bootstrap();
 const available=bootstrap.provider_profiles.filter(profile=>profile.availability==='AVAILABLE');
 assert.deepEqual(available.map(profile=>profile.model),[OBSERVED_MODEL]);
 assert.equal(available[0].observed,true);
 assert.equal(available[0].observation.model,OBSERVED_MODEL);
 const unavailable=bootstrap.provider_profiles.find(profile=>profile.id===UNAVAILABLE_PROFILE);
 assert.equal(unavailable.availability,'UNAVAILABLE');
 assert.equal(unavailable.observation.error_code,'MODEL_NOT_INSTALLED');

 service.createProject({project_id:'PROJECT-MODEL',display_name:'Model identity acceptance',retention_policy:'RETAIN_TEXT'});
 await service.ingestInput({project_id:'PROJECT-MODEL',kind:'TEXT',name:'fixture.txt',text:'Source-bound alpha evidence.'});
 const blocked=await service.startJob({
  project_id:'PROJECT-MODEL',task_id:'TASK-BLOCKED',question:'Analyze the selected evidence.',
  provider_profile_id:UNAVAILABLE_PROFILE,idempotency_key:'IDEMPOTENCY-BLOCKED'
 });
 assert.equal(modelCalls,0);
 assert.equal(blocked.state,'BLOCKED_MODEL_UNAVAILABLE');
 assert.equal(blocked.model_result.status,'PROVIDER_UNAVAILABLE');
 assert.equal(blocked.model_result.model,'qwen3:4b-instruct');
 assert.equal(blocked.model_result.fallback,null);
 assert.equal(blocked.model_result.silent_substitution_performed,false);
 assert.equal(blocked.automatic_provider_fallback,false);

 const observedProfile=available[0];
 const completed=await service.startJob({
  project_id:'PROJECT-MODEL',task_id:'TASK-COMPLETE',question:'Summarize the selected evidence.',
  provider_profile_id:observedProfile.id,idempotency_key:'IDEMPOTENCY-COMPLETE'
 });
 assert.equal(modelCalls,1);
 assert.equal(completed.state,'COMPLETE');
 assert.equal(completed.provider_selection.model,OBSERVED_MODEL);
 assert.equal(completed.model_result.observed_model,OBSERVED_MODEL);

 const modelReceipt=service.store.getLatestJobArtifact('PROJECT-MODEL',completed.job_id,'MODEL_RESULT');
 assert.equal(modelReceipt.artifact_kind,'MODEL_RECEIPT');
 const run=service.store.db.prepare(`SELECT requested_provider,requested_model,observed_provider,observed_model,
  outcome,result_artifact_id,error_code,first_token_ms,elapsed_ms FROM cc_model_runs
  WHERE project_id=? AND job_id=?`).get('PROJECT-MODEL',completed.job_id);
 assert.deepEqual({...run},{
  requested_provider:'OLLAMA',requested_model:OBSERVED_MODEL,
  observed_provider:'OLLAMA',observed_model:OBSERVED_MODEL,
  outcome:'COMPLETED',result_artifact_id:modelReceipt.artifact_id,error_code:'',first_token_ms:7,elapsed_ms:19
 });

 service.close();
 const reopened=new MpcWorkspaceService({dataRoot,adapters:{discoverModels:async()=>discovery()}});
 t.after(()=>reopened.close());
 await reopened.bootstrap();
 const restored=reopened.store.db.prepare(`SELECT requested_provider,requested_model,observed_provider,
  observed_model,outcome,result_artifact_id FROM cc_model_runs WHERE project_id=? AND job_id=?`)
  .get('PROJECT-MODEL',completed.job_id);
 assert.deepEqual({...restored},{
  requested_provider:'OLLAMA',requested_model:OBSERVED_MODEL,
  observed_provider:'OLLAMA',observed_model:OBSERVED_MODEL,
  outcome:'COMPLETED',result_artifact_id:modelReceipt.artifact_id
 });
 assert.equal(reopened.store.getLatestJobArtifact('PROJECT-MODEL',completed.job_id,'MODEL_RESULT').artifact_id,
  modelReceipt.artifact_id);
});

test('changing RETAIN_TEXT to METADATA_ONLY purges raw draft and acquisition text and survives reopen',async t=>{
 const dataRoot=temporary(t,'mpc-workspace-retention-transition-');
 let service=new MpcWorkspaceService({dataRoot,adapters:{discoverModels:async()=>discovery()}});
 t.after(()=>service.close());

 service.createProject({project_id:'PROJECT-RETENTION',display_name:'Retention transition',retention_policy:'RETAIN_TEXT'});
 const rawDraft='Private retained draft before the policy change.';
 const rawEvidence='Private retained evidence before the policy change.';
 service.saveProjectDraft('PROJECT-RETENTION',{text:rawDraft});
 await service.ingestInput({project_id:'PROJECT-RETENTION',kind:'TEXT',name:'private.txt',text:rawEvidence});
 assert.equal(service.project('PROJECT-RETENTION').draft.text,rawDraft);
 assert.equal(service.store.listRetainedAcquisitions('PROJECT-RETENTION').at(0).retained_text,rawEvidence);

 const metadataDraft='Replacement draft represented only by metadata.';
 const changed=service.saveProjectDraft('PROJECT-RETENTION',{
  text:metadataDraft,retention_policy:'METADATA_ONLY'
 });
 assert.equal(changed.retained,false);
 assert.equal(changed.text,null);
 assert.equal(changed.sha256,createHash('sha256').update(metadataDraft).digest('hex'));
 assert.equal(changed.bytes,Buffer.byteLength(metadataDraft));
 assert.equal(service.project('PROJECT-RETENTION').retention_policy,'METADATA_ONLY');
 assert.deepEqual(service.store.listRetainedAcquisitions('PROJECT-RETENTION'),[]);
 assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM cc_retained_documents WHERE project_id=?')
  .get('PROJECT-RETENTION').count,0);
 assert.ok(service.acquisitions('PROJECT-RETENTION').every(acquisition=>
  acquisition.workflow_record?.content!==rawEvidence));

 service.close();
 service=new MpcWorkspaceService({dataRoot,adapters:{discoverModels:async()=>discovery()}});
 const restored=await service.bootstrap();
 assert.equal(restored.project.project_id,'PROJECT-RETENTION');
 assert.equal(restored.project.retention_policy,'METADATA_ONLY');
 assert.equal(restored.project.draft.text,null);
 assert.equal(restored.project.draft.retained,false);
 assert.equal(restored.project.draft.sha256,createHash('sha256').update(metadataDraft).digest('hex'));
 assert.equal(restored.project.draft.bytes,Buffer.byteLength(metadataDraft));
 assert.deepEqual(service.store.listRetainedAcquisitions('PROJECT-RETENTION'),[]);
 assert.deepEqual(service.acquisitions('PROJECT-RETENTION'),[]);
 assert.deepEqual(service.search({project_id:'PROJECT-RETENTION',query:'Private',scopes:['LOCAL']}).results,[]);
});

test('METADATA_ONLY persists no raw evidence, question, or manual script output in database or artifacts',async t=>{
 const dataRoot=temporary(t,'mpc-workspace-metadata-redaction-');
 const service=new MpcWorkspaceService({dataRoot,adapters:{
  discoverModels:async()=>discovery(),routeProblem:analysisRoute
 }});
 t.after(()=>service.close());
 service.createProject({project_id:'PROJECT-METADATA',display_name:'Metadata-only project',retention_policy:'METADATA_ONLY'});
 const evidence='RAW-EVIDENCE-SENTINEL-6bf89d639d';
 const question='RAW-QUESTION-SENTINEL-09fdca677e?';
 const scriptOutput='RAW-SCRIPT-OUTPUT-SENTINEL-f70d51e8d2';
 const acquired=await service.ingestInput({project_id:'PROJECT-METADATA',kind:'TEXT',name:'sensitive.txt',text:evidence});
 const journey=await service.startJob({
  project_id:'PROJECT-METADATA',task_id:'TASK-METADATA',question,
  acquisition_ids:[acquired.acquisition_id],idempotency_key:'IDEMPOTENCY-METADATA'
 });
 assert.equal(journey.state,'ANALYSIS_READY_MODEL_NOT_SELECTED');
 const persisted=service.getJob(journey.job_id,'PROJECT-METADATA');
 assert.equal(persisted.checkpoint.request.question,null);
 assert.equal(persisted.checkpoint.request.question_sha256,createHash('sha256').update(question).digest('hex'));
 assert.equal(persisted.checkpoint.packet.workflow.records[0].content,null);
 assert.equal(persisted.checkpoint.packet.workflow.records[0].content_sha256,
  createHash('sha256').update(evidence).digest('hex'));

 const draft=service.createScript({project_id:'PROJECT-METADATA',job_id:journey.job_id,
  language:'POWERSHELL',request:'Return a bounded synthetic status line.'});
 service.exportScript(draft.script_id,{project_id:'PROJECT-METADATA'});
 const ingested=service.ingestScriptOutput(draft.script_id,{project_id:'PROJECT-METADATA',output:scriptOutput,exit_status:0});
 assert.equal(ingested.state,'OUTPUT_INGESTED');
 assert.deepEqual(service.search({project_id:'PROJECT-METADATA',query:'SENTINEL',scopes:['LOCAL']}).results,[]);
 await assert.rejects(service.resumeJob(journey.job_id,{project_id:'PROJECT-METADATA',resume_reason:'Restart'}),
  error=>error.code==='MPC_WORKSPACE_REACQUISITION_REQUIRED'&&error.status===409);

 service.close();
 for(const path of filesUnder(dataRoot)){
  const bytes=readFileSync(path);
  for(const sentinel of [evidence,question,scriptOutput]){
   assert.equal(bytes.includes(Buffer.from(sentinel)),false,`${sentinel} leaked into ${path}`);
  }
 }
});
