import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MpcWorkspaceStore} from '../lib/mpc-workspace-store.mjs';

const stamp='2026-10-10T12:00:00.000Z';
const sha256=value=>createHash('sha256').update(value).digest('hex');

function fixture(t,name){
 const root=mkdtempSync(join(tmpdir(),`${name}-`));
 const store=new MpcWorkspaceStore(join(root,'workspace.sqlite'),{clock:()=>new Date(stamp)});
 t.after(()=>{try{store.close()}finally{rmSync(root,{recursive:true,force:true})}});
 return store;
}

function createProject(store,project_id,retention_policy){
 store.createProject({project_id,display_name:project_id,retention_policy});
}

function acquire(store,overrides={}){
 return store.acquireConnectorText({
  project_id:'retained-project',source_id:'source-1',document_id:'document-1',artifact_id:'artifact-1',
  text:'Exact connector text Δ',display_name:'GitHub README at exact commit',source_owner:'GITHUB',
  source_namespace:'GITHUB',native_id_type:'repository_path',native_id:'owner/repository:README.md',
  native_version:'0123456789abcdef0123456789abcdef01234567',...overrides
 });
}

test('native connector text retains exact identity and idempotently reuses an exact snapshot',t=>{
 const store=fixture(t,'connector-retained');
 createProject(store,'retained-project','RETAIN_TEXT');
 const text='Exact connector text Δ',expectedHash=sha256(text),expectedBytes=Buffer.byteLength(text,'utf8');
 const first=acquire(store);
 assert.deepEqual(first,{project_id:'retained-project',source_id:'source-1',document_id:'document-1',
  artifact_id:'artifact-1',retained:true,sha256:expectedHash,bytes:expectedBytes,reused:false,
  operation_receipt_id:null});
 assert.deepEqual({...store.getSource('retained-project','source-1')},{
  project_id:'retained-project',source_id:'source-1',source_owner:'GITHUB',source_namespace:'GITHUB',
  native_id_type:'repository_path',native_id:'owner/repository:README.md',
  native_version:'0123456789abcdef0123456789abcdef01234567',content_sha256:expectedHash,
  acquisition_state:'ACQUIRED',acquired_at_utc:stamp
 });
 const artifact=store.getArtifact('retained-project','artifact-1');
 assert.equal(artifact.artifact_kind,'INPUT_TEXT');
 assert.equal(artifact.artifact_ref,'db://cc_retained_documents/document-1');
 assert.equal(artifact.artifact_sha256,expectedHash);
 assert.equal(artifact.artifact_bytes,expectedBytes);
 assert.equal(store.listRetainedAcquisitions('retained-project')[0].retained_text,text);

 const repeated=acquire(store,{source_id:'source-unused',document_id:'document-unused',artifact_id:'artifact-unused'});
 assert.deepEqual(repeated,{...first,reused:true});
 assert.equal(store.countSources('retained-project'),1);
 assert.equal(store.listArtifacts('retained-project').length,1);
 assert.equal(store.listRetainedAcquisitions('retained-project').length,1);

 const changed=acquire(store,{source_id:'source-2',document_id:'document-2',artifact_id:'artifact-2',
  text:'Changed connector bytes at the reported version'});
 assert.equal(changed.reused,false);
 assert.equal(changed.source_id,'source-2');
 assert.notEqual(changed.sha256,first.sha256);
 assert.equal(store.countSources('retained-project'),2);
});

test('metadata-only connector acquisition stores an exact source and digest artifact but no text',t=>{
 const store=fixture(t,'connector-metadata');
 createProject(store,'metadata-project','METADATA_ONLY');
 const text='api_key=abcdefghijklmnop1234567890';
 const first=acquire(store,{project_id:'metadata-project',source_id:'metadata-source',
  document_id:'metadata-document',artifact_id:'metadata-artifact',text,source_owner:'GOOGLE_DRIVE',
  source_namespace:'GOOGLE_DRIVE',native_id_type:'file_id',native_id:'drive-file-123',native_version:'revision-9'});
 assert.equal(first.retained,false);
 assert.equal(first.document_id,null);
 assert.equal(first.sha256,sha256(text));
 assert.equal(first.bytes,Buffer.byteLength(text,'utf8'));
 const source=store.getSource('metadata-project','metadata-source');
 assert.equal(source.source_owner,'GOOGLE_DRIVE');
 assert.equal(source.source_namespace,'GOOGLE_DRIVE');
 assert.equal(source.native_version,'revision-9');
 const artifact=store.getArtifact('metadata-project','metadata-artifact');
 assert.equal(artifact.artifact_kind,'INPUT_TEXT');
 assert.equal(artifact.artifact_ref,`digest://sha256/${sha256(text)}`);
 assert.equal(artifact.artifact_sha256,sha256(text));
 assert.equal(artifact.artifact_bytes,Buffer.byteLength(text,'utf8'));
 assert.equal(store.listRetainedAcquisitions('metadata-project').length,0);

 const repeated=acquire(store,{project_id:'metadata-project',source_id:'metadata-unused',
  document_id:'metadata-document-unused',artifact_id:'metadata-artifact-unused',text,source_owner:'GOOGLE_DRIVE',
  source_namespace:'GOOGLE_DRIVE',native_id_type:'file_id',native_id:'drive-file-123',native_version:'revision-9'});
 assert.equal(repeated.reused,true);
 assert.equal(repeated.source_id,'metadata-source');
 assert.equal(repeated.artifact_id,'metadata-artifact');
 assert.equal(store.countSources('metadata-project'),1);
 assert.equal(store.listArtifacts('metadata-project').length,1);
});

test('connector acquisition validates native identity and rolls back secrets and identifier conflicts',t=>{
 const store=fixture(t,'connector-conflicts');
 createProject(store,'retained-project','RETAIN_TEXT');
 assert.throws(()=>acquire(store,{native_version:''}),/MPC_WORKSPACE_NATIVE_VERSION_INVALID/u);
 assert.throws(()=>acquire(store,{source_namespace:'   '}),/MPC_WORKSPACE_SOURCE_NAMESPACE_INVALID/u);
 assert.throws(()=>acquire(store,{native_id_type:''}),/MPC_WORKSPACE_NATIVE_ID_TYPE_INVALID/u);
 assert.throws(()=>acquire(store,{text:'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456'}),
  /MPC_WORKSPACE_SECRET_MATERIAL_REJECTED/u);
 assert.equal(store.countSources('retained-project'),0);
 assert.equal(store.listArtifacts('retained-project').length,0);

 acquire(store);
 assert.throws(()=>acquire(store,{text:'Different bytes',native_version:'different-version'}),
  /MPC_WORKSPACE_SOURCE_ID_CONFLICT/u);
 assert.throws(()=>acquire(store,{source_id:'source-2',document_id:'document-2',artifact_id:'artifact-1',
  native_id:'owner/repository:OTHER.md'}),/MPC_WORKSPACE_ARTIFACT_ID_CONFLICT/u);
 assert.equal(store.getSource('retained-project','source-2'),null);
 assert.throws(()=>acquire(store,{source_id:'source-3',document_id:'document-1',artifact_id:'artifact-3',
  native_id:'owner/repository:THIRD.md'}),/MPC_WORKSPACE_DOCUMENT_ID_CONFLICT/u);
 assert.equal(store.getSource('retained-project','source-3'),null);
 assert.equal(store.getArtifact('retained-project','artifact-3'),null);
 assert.equal(store.countSources('retained-project'),1);
 assert.equal(store.listArtifacts('retained-project').length,1);
 assert.equal(store.listRetainedAcquisitions('retained-project').length,1);
});

test('native read receipt and connector source commit atomically with an exact subject link',t=>{
 const store=fixture(t,'connector-receipt');
 createProject(store,'retained-project','RETAIN_TEXT');
 store.createTask({project_id:'retained-project',task_id:'read-task',title:'Read GitHub',next_action:'Inspect source'});
 store.startJob({project_id:'retained-project',job_id:'read-job',task_id:'read-task',operation_name:'CONNECTION_OPERATION',
  idempotency_key:'read-request',request:{connection_id:'github'}});
 store.configureConnection({project_id:'retained-project',connection_id:'github',display_name:'GitHub',
  provider_namespace:'GITHUB',transport:'PLUGIN',endpoint_ref:'https://api.github.com',enabled:true});
 const operation_receipt={receipt_id:'native-read-receipt',job_id:'read-job',connection_id:'github',
  operation_kind:'READ',operation_status:'SUCCEEDED',receipt_origin:'NATIVE_CONNECTOR',
  native_receipt_ref:'native-receipt://GITHUB/read-1',receipt_sha256:sha256('receipt-1')};
 const saved=acquire(store,{operation_receipt});
 assert.equal(saved.operation_receipt_id,'native-read-receipt');
 const receipt=store.db.prepare('SELECT * FROM cc_operation_receipts WHERE receipt_id=?').get('native-read-receipt');
 assert.equal(receipt.subject_source_id,'source-1');
 assert.throws(()=>acquire(store,{source_id:'source-rolled-back',document_id:'document-rolled-back',
  artifact_id:'artifact-rolled-back',native_id:'owner/repository:OTHER.md',operation_receipt}),
 /CC_RECEIPT_APPEND_ONLY/u);
 assert.equal(store.getSource('retained-project','source-rolled-back'),null);
 assert.equal(store.getArtifact('retained-project','artifact-rolled-back'),null);
});
