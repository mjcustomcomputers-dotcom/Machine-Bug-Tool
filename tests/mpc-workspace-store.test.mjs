import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {
 MpcWorkspaceStore,
 MPC_WORKSPACE_APPLICATION_ID,
 MPC_WORKSPACE_SCHEMA_VERSION,
 resolveMpcWorkspaceDatabasePath
} from '../lib/mpc-workspace-store.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const stamp='2026-10-09T18:00:00.000Z';

function fixture(t,name='workspace-store'){
 const root=mkdtempSync(join(tmpdir(),`${name}-`));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 return {root,path:join(root,'mpc-command-center.sqlite')};
}

function open(path){return new MpcWorkspaceStore(path,{clock:()=>new Date(stamp)})}

function project(store,projectId='p1',retention='RETAIN_TEXT'){
 return store.createProject({project_id:projectId,display_name:`Project ${projectId}`,
  objective:'Complete the retained journey',retention_policy:retention});
}

function source(store,{projectId='p1',sourceId='s1',owner='owner',namespace='GOOGLE_DRIVE',
 nativeId=sourceId,version='v1',content='source bytes'}={}){
 return store.createSource({project_id:projectId,source_id:sourceId,source_owner:owner,
  source_namespace:namespace,native_id_type:'string',native_id:nativeId,native_version:version,
  content_sha256:hash(content),acquisition_state:'ACQUIRED',acquired_at_utc:stamp});
}

function taskAndJob(store,{projectId='p1',taskId='t1',jobId='j1',key='request-1'}={}){
 store.createTask({project_id:projectId,task_id:taskId,title:'Analyze evidence',next_action:'Read source'});
 store.selectProjectContext(projectId,{task_id:taskId,provider_profile_id:'local-model'});
 return store.startJob({project_id:projectId,job_id:jobId,task_id:taskId,
  operation_name:'work.start',idempotency_key:key,request:{objective:'Analyze evidence'}});
}

test('new v2 store isolates projects and applies retention before drafts, inputs and search',t=>{
 const {root,path}=fixture(t);
 assert.equal(resolveMpcWorkspaceDatabasePath({userDataPath:root}),join(root,'data','mpc-command-center.sqlite'));
 const store=open(path);
 t.after(()=>{try{store.close()}catch{}});
 assert.equal(store.status().schema_version,MPC_WORKSPACE_SCHEMA_VERSION);
 assert.equal(store.db.prepare('PRAGMA application_id').get().application_id,MPC_WORKSPACE_APPLICATION_ID);
 assert.equal(store.db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
 assert.equal(store.db.prepare('PRAGMA journal_mode').get().journal_mode,'wal');

 project(store,'p1','RETAIN_TEXT');
 project(store,'p2','METADATA_ONLY');
 const retainedDraft=store.saveProjectDraft('p1','multiline\ncompass evidence');
 const privateDraft=store.saveProjectDraft('p2','compass metadata only');
 assert.equal(retainedDraft.text,'multiline\ncompass evidence');
 assert.equal(privateDraft.text,null);
 assert.equal(privateDraft.retained,false);
 assert.equal(privateDraft.sha256,hash('compass metadata only'));

 const retained=store.acquireTextInput({project_id:'p1',source_id:'paste-1',document_id:'doc-1',
  artifact_id:'artifact-1',text:'alpha compass result'});
 const metadata=store.acquireTextInput({project_id:'p2',source_id:'paste-2',document_id:'doc-2',
  artifact_id:'artifact-2',text:'private compass result'});
 assert.equal(retained.retained,true);
 assert.equal(metadata.retained,false);
 assert.deepEqual(store.searchRetained({project_id:'p1',query:'compass'}).map(row=>row.source_id),['paste-1']);
 assert.equal(store.listRetainedAcquisitions('p1')[0].retained_text,'alpha compass result');
 assert.deepEqual(store.searchRetained({project_id:'p2',query:'compass'}),[]);
 assert.equal(store.db.prepare('SELECT count(*) AS count FROM cc_retained_documents WHERE project_id=?').get('p2').count,0);

 const changed=store.setProjectRetention('p1','METADATA_ONLY');
 assert.equal(changed.draft.text,null);
 assert.equal(changed.draft.sha256,hash('multiline\ncompass evidence'));
 assert.deepEqual(store.searchRetained({project_id:'p1',query:'compass'}),[]);
 assert.equal(store.db.prepare('SELECT count(*) AS count FROM cc_sources WHERE project_id=?').get('p1').count,1);
 store.createSource({project_id:'p1',source_id:'pointer-1',source_owner:'drive-account',
  source_namespace:'GOOGLE_DRIVE',native_id_type:'file_id',native_id:'missing-file',native_version:'',
  content_sha256:'',acquisition_state:'POINTER'});
 const acquired=store.markSourceAcquired('p1','pointer-1',{native_version:'revision-2',
  content_sha256:hash('acquired bytes')});
 assert.equal(acquired.acquisition_state,'ACQUIRED');
 assert.throws(()=>store.db.prepare("UPDATE cc_sources SET native_id='changed' WHERE source_id='pointer-1'").run(),
  /CC_ACQUIRED_SNAPSHOT_IMMUTABLE|CC_SOURCE_IDENTITY_IMMUTABLE/u);
 assert.throws(()=>store.saveProjectDraft('missing','x'),/MPC_WORKSPACE_PROJECT_NOT_FOUND/u);
 const secretMetadata=store.saveProjectDraft('p2','Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456');
 assert.equal(secretMetadata.text,null);
 store.setProjectRetention('p2','RETAIN_TEXT');
 assert.throws(()=>store.saveProjectDraft('p2','Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456'),
  /MPC_WORKSPACE_SECRET_MATERIAL_REJECTED/u);
});

test('evidence ledger joins retained representation, task use and report use without changing source identity',t=>{
 const {path}=fixture(t,'workspace-evidence-ledger');
 const store=open(path);
 t.after(()=>store.close());
 project(store);
 const acquired=store.acquireTextInput({project_id:'p1',source_id:'evidence-001',document_id:'document-001',
  artifact_id:'artifact-001',display_name:'Exact retained note',text:'alpha retained evidence excerpt'});
 let [ledger]=store.listEvidenceLedger('p1');
 assert.equal(ledger.source_id,acquired.source_id);
 assert.equal(ledger.display_name,'Exact retained note');
 assert.equal(ledger.excerpt,'alpha retained evidence excerpt');
 assert.equal(ledger.retention_state,'TEXT_RETAINED');
 assert.equal(ledger.replay_state,'READY_FROM_RETAINED_TEXT');
 assert.equal(ledger.job_count,0);
 assert.equal(ledger.report_count,0);

 taskAndJob(store);
 store.addJobInput({project_id:'p1',job_id:'j1',input_kind:'SOURCE',source_id:'evidence-001',ordinal:0});
 store.appendJobEvent({project_id:'p1',job_id:'j1',event_id:'event-1',job_state:'SUCCEEDED',
  fact_summary:'Retained evidence analyzed',action_label:'Analysis complete',acquired_count:1,analyzed_count:1,
  decided_count:1,completed_count:3,total_count:3});
 store.createReport({project_id:'p1',report_id:'report-001',job_id:'j1',title:'Evidence trace report',
  artifact_id:'report-artifact-001',artifact_ref:'artifact://reports/evidence-trace.md',
  artifact_sha256:hash('evidence trace report'),artifact_bytes:21,
  source_links:[{source_id:'evidence-001',source_role:'EVIDENCE'}]});
 [ledger]=store.listEvidenceLedger('p1');
 assert.equal(ledger.job_count,1);
 assert.equal(ledger.report_count,1);
 assert.equal(ledger.latest_job_id,'j1');
 assert.equal(ledger.latest_job_state,'SUCCEEDED');
 assert.equal(ledger.latest_report_id,'report-001');
 assert.match(ledger.next_action,/related report/u);
 assert.equal(ledger.content_sha256,hash('alpha retained evidence excerpt'));
 store.createReport({project_id:'p1',report_id:'report-000-newer',job_id:'j1',title:'Newer evidence report',
  artifact_id:'report-artifact-000-newer',artifact_ref:'artifact://reports/newer-evidence.md',
  artifact_sha256:hash('newer evidence report'),artifact_bytes:21,
  source_links:[{source_id:'evidence-001',source_role:'EVIDENCE'}]});
 [ledger]=store.listEvidenceLedger('p1');
 assert.equal(ledger.latest_report_id,'report-000-newer','latest report follows creation time, not random ID order');

 store.createSource({project_id:'p1',source_id:'binary-001',source_owner:'LOCAL_HOST',source_namespace:'LOCAL_INPUT',
  native_id_type:'WINDOWS_PATH',native_id:'C:/exact/file.pdf',native_version:'v1',content_sha256:hash('raw-pdf'),
  acquisition_state:'ACQUIRED'});
 store.createArtifact({project_id:'p1',artifact_id:'binary-artifact-001',artifact_kind:'INPUT_FILE',source_id:'binary-001',
  display_name:'Exact retained PDF',media_type:'application/pdf',artifact_ref:'mpc-workspace-artifact://p1/binary-001.bin',
  artifact_sha256:hash('raw-pdf'),artifact_bytes:7});
 const binary=store.listEvidenceLedger('p1').find(row=>row.source_id==='binary-001');
 assert.equal(binary.retained_raw_artifact_id,'binary-artifact-001');
 assert.equal(binary.retention_state,'RAW_FILE_RETAINED');
 assert.equal(binary.replay_state,'RETAINED_BYTES_REPRESENTATION_REQUIRED');
 assert.match(binary.next_action,/retained file bytes are available/u);
});

test('job idempotency, checkpoints and terminal guards survive close and reopen',t=>{
 const {path}=fixture(t,'workspace-resume');
 let store=open(path);
 project(store);
 const started=taskAndJob(store);
 assert.equal(started.job_state,'QUEUED');
 assert.equal(started.reused,false);
 const reused=store.startJob({project_id:'p1',job_id:'never-created',task_id:'t1',operation_name:'work.start',
  idempotency_key:'request-1',request:{objective:'Analyze evidence'}});
 assert.equal(reused.job_id,'j1');
 assert.equal(reused.reused,true);
 assert.throws(()=>store.startJob({project_id:'p1',job_id:'j2',task_id:'t1',operation_name:'work.start',
  idempotency_key:'request-1',request:{objective:'Changed'}}),/MPC_WORKSPACE_IDEMPOTENCY_CONFLICT/u);
 store.appendJobEvent({project_id:'p1',job_id:'j1',event_id:'e-running',job_state:'RUNNING',
  fact_summary:'One source acquired',action_label:'Evaluating one model',acquired_count:1,completed_count:1,total_count:3});
 store.createArtifact({project_id:'p1',artifact_id:'checkpoint-artifact',artifact_kind:'JOB_CHECKPOINT',
  display_name:'Checkpoint 1',media_type:'application/json',artifact_ref:'artifact://checkpoint/1',
  artifact_sha256:hash('checkpoint'),artifact_bytes:10});
 store.saveCheckpoint({project_id:'p1',job_id:'j1',checkpoint_id:'checkpoint-1',artifact_id:'checkpoint-artifact',
  dependency_sha256:hash('dependencies'),next_action:'Resume model comparison'});
 store.close();

 store=open(path);
 t.after(()=>store.close());
 const resume=store.getResumeState('p1');
 assert.equal(resume.resume_required,true);
 assert.equal(resume.job.job_id,'j1');
 assert.equal(resume.job.checkpoint.checkpoint_id,'checkpoint-1');
 assert.equal(resume.job.checkpoint.next_action,'Resume model comparison');
 assert.equal(resume.job.progress.acquired_count,1);
 assert.equal(store.hasTask('p1','t1'),true);
 assert.equal(store.getLatestJobArtifact('p1','j1','CHECKPOINT').artifact_id,'checkpoint-artifact');
 store.appendJobEvent({project_id:'p1',job_id:'j1',event_id:'e-done',job_state:'SUCCEEDED',
  fact_summary:'Report saved',action_label:'Saving report',acquired_count:1,analyzed_count:1,
  decided_count:1,completed_count:3,total_count:3});
 assert.equal(store.getResumeState('p1').resume_required,false);
 assert.throws(()=>store.appendJobEvent({project_id:'p1',job_id:'j1',event_id:'e-regress',job_state:'RUNNING',
  fact_summary:'repeat',action_label:'Repeating'}),/CC_JOB_TERMINAL/u);
 assert.equal(store.db.prepare('SELECT count(*) AS count FROM cc_jobs').get().count,1);
});

test('latest job artifacts use durable link order across fixed-clock reopen',t=>{
 const {path}=fixture(t,'workspace-artifact-order');
 let store=open(path);
 project(store);
 taskAndJob(store);
 for(const [artifactId,artifactKind] of [
  ['z-old-route','ROUTER_RECEIPT'],['a-new-route','ROUTER_RECEIPT'],
  ['z-old-checkpoint','JOB_CHECKPOINT'],['a-new-checkpoint','JOB_CHECKPOINT']
 ])store.createArtifact({project_id:'p1',artifact_id:artifactId,artifact_kind:artifactKind,
  display_name:artifactId,media_type:'application/json',artifact_ref:`artifact://${artifactId}`,
  artifact_sha256:hash(artifactId),artifact_bytes:artifactId.length});
 store.linkJobArtifact({project_id:'p1',job_id:'j1',artifact_id:'z-old-route',artifact_role:'FULL_ROUTER_RECEIPT'});
 store.linkJobArtifact({project_id:'p1',job_id:'j1',artifact_id:'a-new-route',artifact_role:'FULL_ROUTER_RECEIPT'});
 store.saveCheckpoint({project_id:'p1',job_id:'j1',checkpoint_id:'cp-old',artifact_id:'z-old-checkpoint',
  dependency_sha256:hash('old'),next_action:'old'});
 store.saveCheckpoint({project_id:'p1',job_id:'j1',checkpoint_id:'cp-new',artifact_id:'a-new-checkpoint',
  dependency_sha256:hash('new'),next_action:'new'});
 assert.deepEqual(store.db.prepare(`SELECT artifact_id,link_sequence FROM cc_job_artifacts
  WHERE project_id='p1' AND job_id='j1' ORDER BY link_sequence`).all().map(row=>({...row})),[
   {artifact_id:'z-old-route',link_sequence:1},{artifact_id:'a-new-route',link_sequence:2},
   {artifact_id:'z-old-checkpoint',link_sequence:3},{artifact_id:'a-new-checkpoint',link_sequence:4}
  ]);
 store.close();

 store=open(path);
 t.after(()=>store.close());
 assert.equal(store.getLatestJobArtifact('p1','j1','FULL_ROUTER_RECEIPT').artifact_id,'a-new-route');
 assert.equal(store.getLatestJobArtifact('p1','j1','CHECKPOINT').artifact_id,'a-new-checkpoint');
 assert.equal(store.getJob('p1','j1').checkpoint.artifact_id,'a-new-checkpoint');
});

test('reports, folders, partial snapshots and manual script output keep exact source boundaries',t=>{
 const {path}=fixture(t,'workspace-evidence');
 const store=open(path);
 t.after(()=>store.close());
 project(store);
 taskAndJob(store);
 source(store,{sourceId:'drive-source'});
 const report=store.createReport({project_id:'p1',report_id:'report-1',job_id:'j1',title:'Evidence report',
  artifact_id:'report-artifact',artifact_ref:'artifact://reports/report-1.md',artifact_sha256:hash('report'),
  artifact_bytes:6,source_links:[{source_id:'drive-source',source_role:'EVIDENCE'}]});
 assert.deepEqual(report.sources,[{source_id:'drive-source',source_role:'EVIDENCE'}]);
 assert.equal(store.getReport('p2','report-1'),null);

 store.attachFolder({project_id:'p1',mount_id:'folder-1',host_id:'windows-host',root_locator:'C:\\Evidence',
  source_kind:'REMOVABLE',index_state:'CURRENT',rules:[
   {rule_id:'exclude-cache',rule_kind:'EXCLUDE',pattern:'**/.cache/**'},
   {rule_id:'include-text',rule_kind:'INCLUDE',pattern:'**/*.txt'}]});
 store.recordFolderScanEvent({project_id:'p1',mount_id:'folder-1',scan_id:'scan-1',scan_event_id:'scan-running',
  scan_state:'RUNNING',indexed_count:0,pending_count:2,excluded_count:1});
 store.recordFolderScanEvent({project_id:'p1',mount_id:'folder-1',scan_id:'scan-1',scan_event_id:'scan-done',
  scan_state:'COMPLETED',indexed_count:1,pending_count:0,excluded_count:1});
 assert.throws(()=>store.recordFolderScanEvent({project_id:'p1',mount_id:'folder-1',scan_id:'scan-1',
  scan_event_id:'scan-repeat',scan_state:'RUNNING'}),/CC_FOLDER_SCAN_SEQUENCE_INVALID/u);
 // A later refresh is a new scan identity and does not rewrite the completed scan.
 store.recordFolderScanEvent({project_id:'p1',mount_id:'folder-1',scan_id:'scan-2',scan_event_id:'scan-2-running',
  scan_state:'RUNNING',changed_count:1});
 const listedFolder=store.listAttachedFolders('p1')[0];
 assert.equal(listedFolder.rules.length,2);
 assert.equal(listedFolder.latest_scan.scan_id,'scan-2');
 source(store,{sourceId:'local-file',owner:'windows-host',namespace:'LOCAL_FILESYSTEM',version:'file-v1'});
 store.recordAttachedFile({project_id:'p1',mount_id:'folder-1',relative_locator:'nested/evidence.txt',
  file_version:'file-v1',source_id:'local-file'});
 store.setFolderState('p1','folder-1',{connection_state:'OFFLINE',index_state:'STALE'});
 assert.equal(store.db.prepare('SELECT count(*) AS count FROM cc_attached_files').get().count,1);
 store.setFolderState('p1','folder-1',{connection_state:'DETACHED',index_state:'DETACHED',detach_index_policy:'PURGE_INDEX'});
 assert.equal(store.db.prepare('SELECT count(*) AS count FROM cc_attached_files').get().count,0);
 assert.equal(store.getSource('p1','local-file').source_id,'local-file');

 source(store,{sourceId:'local-manifest',owner:'windows-host',namespace:'LOCAL_FILESYSTEM',version:'manifest-v1'});
 const scope={owner:'Project A',namespace:'WORKSPACE_COLLECTION',id_type:'string',id:'project-a-files'};
 store.createSnapshot({project_id:'p1',snapshot_id:'old-drive',source_id:'drive-source',manifest:{
  artifact_id:'old-manifest',artifact_ref:'artifact://snapshots/old.json',artifact_sha256:hash('old'),artifact_bytes:3,
  comparison_scope:scope,coverage_state:'COMPLETE'},entries:[{
   entry_id:'native-a',entry_kind:'NATIVE',native_owner:'drive-account',native_namespace:'GOOGLE_DRIVE',
   native_id_type:'file_id',native_id:'001',native_version:'01',content_sha256:hash('a'),
   relative_locator:'a.txt',availability:'AVAILABLE'}]});
 store.createSnapshot({project_id:'p1',snapshot_id:'new-local',source_id:'local-manifest',manifest:{
  artifact_id:'new-manifest',artifact_ref:'artifact://snapshots/new.json',artifact_sha256:hash('new'),artifact_bytes:3,
  comparison_scope:scope,coverage_state:'PARTIAL'},entries:[{
   entry_id:'native-a-local',entry_kind:'NATIVE',native_owner:'windows-host',native_namespace:'LOCAL_FILESYSTEM',
   native_id_type:'path',native_id:'a.txt',native_version:'02',content_sha256:hash('a2'),
   relative_locator:'a.txt',availability:'AVAILABLE'}]});
 const comparison=store.recordSnapshotComparison({project_id:'p1',comparison_id:'comparison-1',
  left_snapshot_id:'old-drive',right_snapshot_id:'new-local',comparison_state:'PARTIAL',result_artifact:{
   artifact_id:'comparison-artifact',display_name:'Drive versus local',media_type:'application/json',
   artifact_ref:'artifact://comparisons/1.json',artifact_sha256:hash('comparison'),artifact_bytes:10}});
 assert.equal(comparison.comparison_state,'PARTIAL');
 assert.equal(store.getSnapshot('p1','new-local').coverage_state,'PARTIAL');

 const script=store.createScript({project_id:'p1',script_id:'script-1',job_id:'j1',language:'POWERSHELL',
  explanation:'Collect the selected local status without credentials.',prerequisites:'PowerShell 7',
  expected_output_schema:'JSON object',artifact:{artifact_id:'script-artifact',display_name:'Collect status.ps1',
   media_type:'text/plain',artifact_ref:'artifact://scripts/collect.ps1',artifact_sha256:hash('script-v1'),artifact_bytes:9}});
 assert.equal(script.script_state,'DRAFT');
 assert.throws(()=>store.ingestScriptOutput({project_id:'p1',script_id:'script-1'}),/MPC_WORKSPACE_SCRIPT_EXPORT_REQUIRED/u);
 store.markScriptExported('p1','script-1');
 const output=store.ingestScriptOutput({project_id:'p1',script_id:'script-1',output_id:'output-1',
  source:{source_id:'script-output-source',source_owner:'windows-host',source_namespace:'LOCAL_INPUT',
   native_id_type:'manual_output_id',native_id:'output-1',native_version:'v1',content_sha256:hash('output')},
  artifact:{artifact_id:'script-output-artifact',display_name:'Returned output.json',media_type:'application/json',
   artifact_ref:'artifact://scripts/output-1.json',artifact_sha256:hash('output'),artifact_bytes:6},
  supplied_host:'BugLab',supplied_exit_status:0});
 assert.equal(output.execution_basis,'USER_SUPPLIED_UNVERIFIED');
 assert.equal(store.getScript('p1','script-1').artifact_id,'script-artifact');
 assert.equal(store.db.prepare('SELECT artifact_sha256 FROM cc_artifacts WHERE artifact_id=?').get('script-artifact').artifact_sha256,
  hash('script-v1'));
});

test('exact v1 upgrades without data loss, schema tampering fails closed, and online backup reopens',async t=>{
 const {root,path}=fixture(t,'workspace-migrate');
 const v1=new DatabaseSync(path,{allowExtension:false});
 v1.exec(readFileSync(new URL('../command-center-build/sql/001-command-center.sql',import.meta.url),'utf8'));
 v1.prepare('INSERT INTO cc_projects(project_id,display_name,created_at_utc) VALUES(?,?,?)').run('legacy','Legacy project',stamp);
 v1.close();
 let store=open(path);
 assert.equal(store.status().schema_version,2);
 assert.equal(store.db.prepare('SELECT display_name FROM cc_projects WHERE project_id=?').get('legacy').display_name,'Legacy project');
 // A migrated v1 project receives the safe metadata-only default; no raw text
 // retention is invented during the migration.
 assert.equal(store.getProject('legacy').retention_policy,'METADATA_ONLY');
 project(store,'new');
 const backupPath=join(root,'backup.sqlite');
 const receipt=await store.backupTo(backupPath);
 assert.equal(receipt.sha256,hash(readFileSync(backupPath)));
 store.close();
 const backup=open(backupPath);
 assert.equal(backup.getProject('new').display_name,'Project new');
 backup.close();

 const tamper=new DatabaseSync(path);
 tamper.exec('CREATE TABLE cc_unmanifested_tamper(value TEXT)');
 tamper.close();
 assert.throws(()=>open(path),/MPC_WORKSPACE_SCHEMA_IDENTITY_MISMATCH/u);
});

test('project lists, connection observations and outbox delivery remain scoped and receipt-bound',t=>{
 const {path}=fixture(t,'workspace-connections');
 const store=open(path);
 t.after(()=>store.close());
 project(store,'p1');
 project(store,'p2');
 taskAndJob(store);
 source(store,{sourceId:'native-read'});
 store.configureConnection({project_id:'p1',connection_id:'github',display_name:'GitHub',
  provider_namespace:'GITHUB',transport:'PLUGIN',endpoint_ref:'plugin://github',
  secret_store_ref:'os-secret://windows-credential-manager/mpc/github',enabled:true});
 assert.throws(()=>store.configureConnection({project_id:'p1',connection_id:'unsafe',display_name:'Unsafe',
  provider_namespace:'GITHUB',transport:'PLUGIN',endpoint_ref:'plugin://unsafe',api_key:'must-not-store'}),
  /MPC_WORKSPACE_RAW_CREDENTIAL_REJECTED/u);
 const readReceipt=store.recordOperationReceipt({project_id:'p1',receipt_id:'read-receipt',job_id:'j1',
  connection_id:'github',subject_source_id:'native-read',operation_kind:'READ',operation_status:'SUCCEEDED',
  receipt_origin:'NATIVE_CONNECTOR',native_receipt_ref:'github-receipt://read-1',receipt_sha256:hash('read receipt')});
 assert.equal(readReceipt.operation_status,'SUCCEEDED');
 const observation=store.recordConnectionObservation({project_id:'p1',observation_id:'observation-1',
  connection_id:'github',job_id:'j1',provider_surface:'GitHub App',host_id:'desktop-host',account_id:'account-1',
  operation_name:'contents.read',observation_state:'SUCCEEDED',operation_receipt_id:'read-receipt'});
 assert.equal(observation.observation_state,'SUCCEEDED');
 assert.equal(store.listConnections('p1')[0].latest_observation.operation_receipt_id,'read-receipt');
 assert.deepEqual(store.listConnections('p2'),[]);

 store.createReport({project_id:'p1',report_id:'delivery-report',job_id:'j1',title:'Delivery report',
  artifact_id:'delivery-artifact',artifact_ref:'artifact://reports/delivery.md',artifact_sha256:hash('delivery'),
  artifact_bytes:8,source_links:[{source_id:'native-read',source_role:'EVIDENCE'}]});
 const send=store.startJob({project_id:'p1',job_id:'send-job',task_id:'t1',operation_name:'outbox.dispatch',
  idempotency_key:'send-delivery-report',request:{report_id:'delivery-report',connection_id:'github'}});
 assert.equal(send.job_state,'QUEUED');
 store.queueOutbox({project_id:'p1',outbox_id:'outbox-1',report_id:'delivery-report',job_id:'send-job',
  connection_id:'github',delivery_kind:'WRITE'});
 store.updateOutbox('p1','outbox-1',{outbox_state:'IN_FLIGHT'});
 store.recordOperationReceipt({project_id:'p1',receipt_id:'write-receipt',job_id:'send-job',connection_id:'github',
  operation_kind:'WRITE',operation_status:'SUCCEEDED',receipt_origin:'NATIVE_CONNECTOR',
  native_receipt_ref:'github-receipt://write-1',receipt_sha256:hash('write receipt')});
 const sent=store.updateOutbox('p1','outbox-1',{outbox_state:'SENT',operation_receipt_id:'write-receipt'});
 assert.equal(sent.outbox_state,'SENT');
 assert.equal(store.listOutbox('p1').length,1);
 assert.deepEqual(store.listOutbox('p2'),[]);
 assert.equal(store.listSources('p1').length,1);
 assert.equal(store.listTasks('p1').length,1);
 assert.equal(store.listJobs('p1').length,2);
 assert.equal(store.listReports('p1').length,1);
 assert.equal(store.listArtifacts('p1').length,1);
});

test('unsafe and foreign database paths are rejected without mutating their contents',t=>{
 const {root}=fixture(t,'workspace-paths');
 assert.throws(()=>resolveMpcWorkspaceDatabasePath({databasePath:'file:unsafe.sqlite'}),/MPC_WORKSPACE_DATABASE_PATH_INVALID/u);
 assert.throws(()=>resolveMpcWorkspaceDatabasePath({databasePath:join(root,'wrong.txt')}),/MPC_WORKSPACE_DATABASE_EXTENSION_REJECTED/u);
 const foreign=join(root,'foreign.sqlite'),db=new DatabaseSync(foreign);
 db.exec("CREATE TABLE workbench_meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO workbench_meta VALUES('sentinel','keep');");
 db.close();
 assert.throws(()=>open(foreign),/MPC_WORKSPACE_DATABASE_OCCUPIED/u);
 const check=new DatabaseSync(foreign,{readOnly:true});
 assert.equal(check.prepare("SELECT value FROM workbench_meta WHERE key='sentinel'").get().value,'keep');
 assert.equal(check.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name LIKE 'cc_%'").get().count,0);
 check.close();
});
