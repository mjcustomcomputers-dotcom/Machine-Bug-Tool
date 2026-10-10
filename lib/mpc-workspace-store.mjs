import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync,backup as sqliteBackup} from 'node:sqlite';
import {
 chmodSync,closeSync,existsSync,lstatSync,mkdirSync,openSync,readFileSync,readSync
} from 'node:fs';
import {dirname,extname,join,parse,resolve,sep} from 'node:path';

export const MPC_WORKSPACE_STORE_VERSION='MPC_WORKSPACE_STORE_2';
export const MPC_WORKSPACE_APPLICATION_ID=0x4d504343;
export const MPC_WORKSPACE_SCHEMA_VERSION=2;
export const MPC_WORKSPACE_RETENTION=Object.freeze(['RETAIN_TEXT','METADATA_ONLY']);

const SQL_001=readFileSync(new URL('../command-center-build/sql/001-command-center.sql',import.meta.url),'utf8');
const SQL_002=readFileSync(new URL('../command-center-build/sql/002-workspace-journey.sql',import.meta.url),'utf8');
const SQL_HASHES=Object.freeze({1:sha256(SQL_001),2:sha256(SQL_002)});
const DATABASE_EXTENSIONS=new Set(['.db','.sqlite','.sqlite3']);
const TERMINAL_STATES=new Set(['SUCCEEDED','FAILED','CANCELLED']);
const ID_LIMIT=240;
const TEXT_LIMIT=2_000_000;
const SECRET_PATTERNS=[
 /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/iu,
 /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/iu,
 /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u,
 /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/u,
 /(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|password)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}/iu
];

function fail(code,status){
 const error=Error(code);
 error.code=code;
 if(status!==undefined)error.status=status;
 throw error;
}

function sha256(value){return createHash('sha256').update(value).digest('hex')}
function utf8(value){return Buffer.byteLength(value,'utf8')}

function bounded(value,code,{min=0,max=TEXT_LIMIT}={}){
 if(typeof value!=='string'||value.includes('\u0000')||utf8(value)<min||utf8(value)>max)fail(code);
 return value;
}

function id(value,code='MPC_WORKSPACE_ID_INVALID'){
 return bounded(value,code,{min:1,max:ID_LIMIT});
}

function digest(value,code='MPC_WORKSPACE_SHA256_INVALID'){
 if(typeof value!=='string'||!/^[a-f0-9]{64}$/u.test(value))fail(code);
 return value;
}

function integer(value,code,{min=0,max=Number.MAX_SAFE_INTEGER,nullable=false}={}){
 if(nullable&&value===null)return null;
 if(!Number.isSafeInteger(value)||value<min||value>max)fail(code);
 return value;
}

function utc(value,code='MPC_WORKSPACE_TIME_INVALID'){
 bounded(value,code,{min:20,max:40});
 if(Number.isNaN(Date.parse(value)))fail(code);
 return value;
}

function stableJson(value){
 const seen=new Set(),visit=(item,depth=0)=>{
  if(depth>32)fail('MPC_WORKSPACE_JSON_DEPTH_LIMIT');
  if(item===null||typeof item==='boolean'||typeof item==='string')return item;
  if(typeof item==='number'){
   if(!Number.isFinite(item))fail('MPC_WORKSPACE_JSON_NUMBER_INVALID');
   return item;
  }
  if(Array.isArray(item))return item.map(child=>visit(child,depth+1));
  if(typeof item!=='object'||Object.getPrototypeOf(item)!==Object.prototype)fail('MPC_WORKSPACE_JSON_INVALID');
  if(seen.has(item))fail('MPC_WORKSPACE_JSON_CYCLE');
  seen.add(item);
  const result={};
  for(const key of Object.keys(item).sort())result[key]=visit(item[key],depth+1);
  seen.delete(item);
  return result;
 };
 const serialized=JSON.stringify(visit(value));
 if(utf8(serialized)>1_000_000)fail('MPC_WORKSPACE_JSON_TOO_LARGE');
 return serialized;
}

function assertNoStoredSecret(value){
 for(const pattern of SECRET_PATTERNS)if(pattern.test(value))fail('MPC_WORKSPACE_SECRET_MATERIAL_REJECTED');
}

function lstatIfPresent(path){
 try{return lstatSync(path)}catch(error){if(error?.code==='ENOENT')return null;throw error}
}

function assertNoSymlinkComponents(path){
 const absolute=resolve(path),root=parse(absolute).root;
 let cursor=root;
 for(const component of absolute.slice(root.length).split(sep).filter(Boolean)){
  cursor=join(cursor,component);
  const entry=lstatIfPresent(cursor);
  if(entry===null)break;
  if(entry.isSymbolicLink())fail('MPC_WORKSPACE_DATABASE_SYMLINK_REJECTED');
 }
}

function assertDatabaseCandidate(path){
 if(typeof path!=='string'||path.trim()===''||path.includes('\u0000'))fail('MPC_WORKSPACE_DATABASE_PATH_INVALID');
 if(!DATABASE_EXTENSIONS.has(extname(path).toLowerCase()))fail('MPC_WORKSPACE_DATABASE_EXTENSION_REJECTED');
 if(/^(?:file|https?|sqlite):/iu.test(path)||path.startsWith('\\\\')||path.startsWith('//'))fail('MPC_WORKSPACE_DATABASE_PATH_INVALID');
 assertNoSymlinkComponents(path);
 for(const candidate of [path,path+'-wal',path+'-shm',path+'-journal']){
  const entry=lstatIfPresent(candidate);
  if(entry===null)continue;
  if(entry.isSymbolicLink())fail('MPC_WORKSPACE_DATABASE_SYMLINK_REJECTED');
  if(!entry.isFile())fail('MPC_WORKSPACE_DATABASE_NONFILE_REJECTED');
 }
 const entry=lstatIfPresent(path);
 if(entry===null||entry.size===0)return;
 const descriptor=openSync(path,'r'),header=Buffer.alloc(16);
 let bytesRead;
 try{bytesRead=readSync(descriptor,header,0,16,0)}finally{closeSync(descriptor)}
 if(bytesRead!==16||header.toString('binary')!=='SQLite format 3\u0000')fail('MPC_WORKSPACE_DATABASE_NOT_SQLITE');
}

function restrictDatabaseFiles(path){
 for(const candidate of [path,path+'-wal',path+'-shm']){
  const entry=lstatIfPresent(candidate);
  if(entry===null||entry.isSymbolicLink()||!entry.isFile())continue;
  try{chmodSync(candidate,0o600)}catch{}
 }
}

export function resolveMpcWorkspaceDatabasePath({databasePath,userDataPath}={}){
 let selected;
 if(databasePath!==undefined){
  const raw=bounded(databasePath,'MPC_WORKSPACE_DATABASE_PATH_INVALID',{min:1,max:4096});
  if(/^(?:file|https?|sqlite):/iu.test(raw)||raw.startsWith('\\\\')||raw.startsWith('//'))fail('MPC_WORKSPACE_DATABASE_PATH_INVALID');
  selected=resolve(raw);
 }
 else{
  if(typeof userDataPath!=='string'||userDataPath.trim()===''||userDataPath.includes('\u0000'))fail('MPC_WORKSPACE_USER_DATA_PATH_REQUIRED');
  if(/^(?:file|https?|sqlite):/iu.test(userDataPath)||userDataPath.startsWith('\\\\')||userDataPath.startsWith('//'))fail('MPC_WORKSPACE_USER_DATA_PATH_INVALID');
  selected=resolve(userDataPath,'data','mpc-command-center.sqlite');
 }
 assertDatabaseCandidate(selected);
 const parent=dirname(selected);
 assertNoSymlinkComponents(parent);
 mkdirSync(parent,{recursive:true,mode:0o700});
 assertNoSymlinkComponents(parent);
 if(!lstatSync(parent).isDirectory())fail('MPC_WORKSPACE_DATABASE_PARENT_INVALID');
 return selected;
}

function schemaFingerprint(db){
 const rows=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name,tbl_name").all();
 return sha256(JSON.stringify(rows.map(row=>[row.type,row.name,row.tbl_name,row.sql])));
}

let fingerprints;
function expectedFingerprints(){
 if(fingerprints)return fingerprints;
 const db=new DatabaseSync(':memory:',{allowExtension:false});
 try{
  db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;');
  db.exec(SQL_001);
  const v1=schemaFingerprint(db);
  db.exec('BEGIN IMMEDIATE;');
  try{db.exec(SQL_002);db.exec('PRAGMA user_version=2; COMMIT;')}catch(error){db.exec('ROLLBACK;');throw error}
  fingerprints=Object.freeze({1:v1,2:schemaFingerprint(db)});
 }finally{db.close()}
 return fingerprints;
}

function applyV2(db,at){
 db.exec('BEGIN IMMEDIATE;');
 try{
  db.exec(SQL_002);
  const insert=db.prepare('INSERT INTO cc_migrations(schema_version,migration_name,migration_sha256,applied_at_utc) VALUES(?,?,?,?)');
  insert.run(1,'001-command-center.sql',SQL_HASHES[1],at);
  insert.run(2,'002-workspace-journey.sql',SQL_HASHES[2],at);
  db.exec('PRAGMA user_version=2; COMMIT;');
 }catch(error){try{db.exec('ROLLBACK;')}catch{}throw error}
}

function assertStore(db){
 const applicationId=db.prepare('PRAGMA application_id').get().application_id;
 const userVersion=db.prepare('PRAGMA user_version').get().user_version;
 if(applicationId!==MPC_WORKSPACE_APPLICATION_ID)fail('MPC_WORKSPACE_DATABASE_IDENTITY_MISMATCH');
 if(userVersion!==MPC_WORKSPACE_SCHEMA_VERSION)fail('MPC_WORKSPACE_SCHEMA_VERSION_UNSUPPORTED');
 if(schemaFingerprint(db)!==expectedFingerprints()[2])fail('MPC_WORKSPACE_SCHEMA_IDENTITY_MISMATCH');
 const migrations=db.prepare('SELECT schema_version,migration_name,migration_sha256 FROM cc_migrations ORDER BY schema_version').all();
 if(migrations.length!==2||migrations.some((row,index)=>row.schema_version!==index+1
  ||row.migration_name!==`${String(index+1).padStart(3,'0')}-${index===0?'command-center':'workspace-journey'}.sql`
  ||row.migration_sha256!==SQL_HASHES[index+1]))fail('MPC_WORKSPACE_MIGRATION_IDENTITY_MISMATCH');
 const quick=db.prepare('PRAGMA quick_check').all();
 if(quick.length!==1||quick[0].quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length!==0)fail('MPC_WORKSPACE_DATABASE_INTEGRITY_FAILED');
}

function rowProject(row){
 if(!row)return null;
 return {
  project_id:row.project_id,display_name:row.display_name,created_at_utc:row.created_at_utc,
  objective:row.objective,retention_policy:row.retention_policy,
  selected_task_id:row.selected_task_id,selected_provider_profile_id:row.selected_provider_profile_id,
  updated_at_utc:row.updated_at_utc,
  draft:{text:row.draft_text,sha256:row.draft_sha256,bytes:row.draft_bytes,
   retained:row.draft_text!==null}
 };
}

function sourceValues(value){
 return [
  id(value.project_id),id(value.source_id),bounded(value.source_owner,'MPC_WORKSPACE_SOURCE_OWNER_INVALID',{min:1,max:512}),
  bounded(value.source_namespace,'MPC_WORKSPACE_SOURCE_NAMESPACE_INVALID',{min:1,max:128}),
  bounded(value.native_id_type,'MPC_WORKSPACE_NATIVE_ID_TYPE_INVALID',{min:1,max:128}),
  bounded(value.native_id,'MPC_WORKSPACE_NATIVE_ID_INVALID',{min:1,max:2048}),
  bounded(value.native_version??'','MPC_WORKSPACE_NATIVE_VERSION_INVALID',{max:512}),
  value.content_sha256===''?'':digest(value.content_sha256),value.acquisition_state,
  value.acquisition_state==='ACQUIRED'?utc(value.acquired_at_utc):null
 ];
}

function insertSource(db,value){
 if(!['POINTER','ACQUIRED'].includes(value.acquisition_state))fail('MPC_WORKSPACE_ACQUISITION_STATE_INVALID');
 db.prepare(`INSERT INTO cc_sources(project_id,source_id,source_owner,source_namespace,native_id_type,native_id,
  native_version,content_sha256,acquisition_state,acquired_at_utc) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(...sourceValues(value));
}

function insertArtifact(db,value,created){
 const kinds=new Set(['INPUT_TEXT','INPUT_FILE','SCREENSHOT','ROUTER_RECEIPT','MODEL_RECEIPT','JOB_CHECKPOINT','REPORT','SCRIPT','SCRIPT_OUTPUT','SNAPSHOT_MANIFEST','SNAPSHOT_COMPARISON','OTHER']);
 if(!kinds.has(value.artifact_kind))fail('MPC_WORKSPACE_ARTIFACT_KIND_INVALID');
 db.prepare(`INSERT INTO cc_artifacts(project_id,artifact_id,artifact_kind,source_id,display_name,media_type,
  artifact_ref,artifact_sha256,artifact_bytes,representation_of_artifact_id,created_at_utc)
  VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
  id(value.project_id),id(value.artifact_id),value.artifact_kind,value.source_id===null||value.source_id===undefined?null:id(value.source_id),
  bounded(value.display_name,'MPC_WORKSPACE_ARTIFACT_NAME_INVALID',{min:1,max:512}),
  bounded(value.media_type,'MPC_WORKSPACE_MEDIA_TYPE_INVALID',{min:1,max:200}),
  bounded(value.artifact_ref,'MPC_WORKSPACE_ARTIFACT_REF_INVALID',{min:1,max:4096}),digest(value.artifact_sha256),
  integer(value.artifact_bytes,'MPC_WORKSPACE_ARTIFACT_BYTES_INVALID'),
  value.representation_of_artifact_id===null||value.representation_of_artifact_id===undefined?null:id(value.representation_of_artifact_id),created
 );
}

const JOB_ARTIFACT_ROLES=new Set(['FULL_ROUTER_RECEIPT','MODEL_RESULT','CHECKPOINT','REPORT','SCRIPT','SCRIPT_OUTPUT','OTHER']);

function insertJobArtifact(db,{project_id,job_id,artifact_id,artifact_role}){
 const projectId=id(project_id),jobId=id(job_id),artifactId=id(artifact_id);
 if(!JOB_ARTIFACT_ROLES.has(artifact_role))fail('MPC_WORKSPACE_ARTIFACT_ROLE_INVALID');
 const sequence=db.prepare(`SELECT coalesce(max(link_sequence),0)+1 AS sequence FROM cc_job_artifacts
  WHERE project_id=? AND job_id=?`).get(projectId,jobId).sequence;
 db.prepare(`INSERT INTO cc_job_artifacts(project_id,job_id,artifact_id,artifact_role,link_sequence)
  VALUES(?,?,?,?,?)`).run(projectId,jobId,artifactId,artifact_role,sequence);
 return sequence;
}

export class MpcWorkspaceStore{
 constructor(databasePath,{userDataPath,clock=()=>new Date(),idFactory=()=>randomUUID()}={}){
  this.databasePath=resolveMpcWorkspaceDatabasePath({databasePath,userDataPath});
  this.clock=clock;
  this.idFactory=idFactory;
  this.db=new DatabaseSync(this.databasePath,{allowExtension:false});
  try{
   this.db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;');
   const objects=this.db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").get().count;
   let version=this.db.prepare('PRAGMA user_version').get().user_version;
   const applicationId=this.db.prepare('PRAGMA application_id').get().application_id;
   if(objects===0&&version===0&&applicationId===0){this.db.exec(SQL_001);version=1}
   else if(applicationId!==MPC_WORKSPACE_APPLICATION_ID)fail('MPC_WORKSPACE_DATABASE_OCCUPIED');
   if(version===1){
    if(schemaFingerprint(this.db)!==expectedFingerprints()[1])fail('MPC_WORKSPACE_V1_SCHEMA_IDENTITY_MISMATCH');
    applyV2(this.db,this.now());
   }else if(version!==2)fail('MPC_WORKSPACE_SCHEMA_VERSION_UNSUPPORTED');
   assertStore(this.db);
   this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
   if(this.db.prepare('PRAGMA foreign_keys').get().foreign_keys!==1)fail('MPC_WORKSPACE_FOREIGN_KEYS_REQUIRED');
   restrictDatabaseFiles(this.databasePath);
  }catch(error){try{this.db.exec('ROLLBACK')}catch{}this.db.close();throw error}
 }

 now(){return utc(this.clock().toISOString())}
 nextId(){return id(this.idFactory(),'MPC_WORKSPACE_GENERATED_ID_INVALID')}
 transaction(operation){
  this.db.exec('BEGIN IMMEDIATE;');
  try{const result=operation();this.db.exec('COMMIT;');restrictDatabaseFiles(this.databasePath);return result}
  catch(error){try{this.db.exec('ROLLBACK;')}catch{}throw error}
 }

 createProject({project_id=this.nextId(),display_name,objective='',retention_policy='RETAIN_TEXT'}={}){
  if(!MPC_WORKSPACE_RETENTION.includes(retention_policy))fail('MPC_WORKSPACE_RETENTION_INVALID');
  const created=this.now();
  return this.transaction(()=>{
   this.db.prepare('INSERT INTO cc_projects(project_id,display_name,created_at_utc) VALUES(?,?,?)').run(
    id(project_id),bounded(display_name,'MPC_WORKSPACE_PROJECT_NAME_INVALID',{min:1,max:240}),created);
   this.db.prepare(`INSERT INTO cc_project_state(project_id,objective,retention_policy,updated_at_utc)
    VALUES(?,?,?,?)`).run(project_id,bounded(objective,'MPC_WORKSPACE_OBJECTIVE_INVALID',{max:32768}),retention_policy,created);
   return this.getProject(project_id);
  });
 }

 getProject(projectId){
  return rowProject(this.db.prepare(`SELECT p.*,s.objective,s.retention_policy,s.selected_task_id,
   s.selected_provider_profile_id,s.draft_text,s.draft_sha256,s.draft_bytes,s.updated_at_utc
   FROM cc_projects p JOIN cc_project_state s USING(project_id) WHERE p.project_id=?`).get(id(projectId)));
 }

 listProjects(limit=100){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:500});
  return this.db.prepare(`SELECT p.*,s.objective,s.retention_policy,s.selected_task_id,
   s.selected_provider_profile_id,s.draft_text,s.draft_sha256,s.draft_bytes,s.updated_at_utc
   FROM cc_projects p JOIN cc_project_state s USING(project_id)
   ORDER BY s.updated_at_utc DESC,p.project_id LIMIT ?`).all(limit).map(rowProject);
 }

 touchProject(projectId){
  const project=this.getProject(projectId);
  if(!project)fail('MPC_WORKSPACE_PROJECT_NOT_FOUND');
  const observed=this.now();
  const at=Date.parse(observed)<=Date.parse(project.updated_at_utc)
   ?new Date(Date.parse(project.updated_at_utc)+1).toISOString():observed;
  this.db.prepare('UPDATE cc_project_state SET updated_at_utc=? WHERE project_id=?').run(at,id(projectId));
  return this.getProject(projectId);
 }

 listSources(projectId,limit=200){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:1000});
  return this.db.prepare(`SELECT * FROM cc_sources WHERE project_id=?
   ORDER BY coalesce(acquired_at_utc,'' ) DESC,source_id LIMIT ?`).all(id(projectId),limit).map(row=>({...row}));
 }

 listEvidenceLedger(projectId,limit=200){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:1000});
  const rows=this.db.prepare(`SELECT source.*,
   (SELECT artifact.display_name FROM cc_artifacts artifact
    WHERE artifact.project_id=source.project_id AND artifact.source_id=source.source_id
    ORDER BY artifact.created_at_utc DESC,artifact.artifact_id DESC LIMIT 1) AS display_name,
   (SELECT artifact.artifact_kind FROM cc_artifacts artifact
    WHERE artifact.project_id=source.project_id AND artifact.source_id=source.source_id
    ORDER BY artifact.created_at_utc DESC,artifact.artifact_id DESC LIMIT 1) AS artifact_kind,
   (SELECT artifact.media_type FROM cc_artifacts artifact
    WHERE artifact.project_id=source.project_id AND artifact.source_id=source.source_id
    ORDER BY artifact.created_at_utc DESC,artifact.artifact_id DESC LIMIT 1) AS media_type,
   (SELECT artifact.artifact_bytes FROM cc_artifacts artifact
    WHERE artifact.project_id=source.project_id AND artifact.source_id=source.source_id
    ORDER BY artifact.created_at_utc DESC,artifact.artifact_id DESC LIMIT 1) AS artifact_bytes,
   (SELECT artifact.artifact_id FROM cc_artifacts artifact
    WHERE artifact.project_id=source.project_id AND artifact.source_id=source.source_id
      AND artifact.artifact_kind IN ('INPUT_FILE','SCREENSHOT')
      AND artifact.artifact_ref LIKE 'mpc-workspace-artifact://%'
    ORDER BY artifact.created_at_utc DESC,artifact.artifact_id DESC LIMIT 1) AS retained_raw_artifact_id,
   (SELECT document.document_id FROM cc_retained_documents document
    WHERE document.project_id=source.project_id AND document.source_id=source.source_id
    ORDER BY document.document_id LIMIT 1) AS retained_document_id,
   (SELECT substr(document.retained_text,1,480) FROM cc_retained_documents document
    WHERE document.project_id=source.project_id AND document.source_id=source.source_id
    ORDER BY document.document_id LIMIT 1) AS excerpt,
   (SELECT count(DISTINCT input.job_id) FROM cc_job_inputs input
    WHERE input.project_id=source.project_id AND input.source_id=source.source_id) AS job_count,
   (SELECT count(DISTINCT relation.report_id) FROM cc_report_sources relation
    WHERE relation.project_id=source.project_id AND relation.source_id=source.source_id) AS report_count,
   (SELECT input.job_id FROM cc_job_inputs input JOIN cc_jobs job
      ON job.project_id=input.project_id AND job.job_id=input.job_id
    WHERE input.project_id=source.project_id AND input.source_id=source.source_id
    ORDER BY job.created_at_utc DESC,input.job_id DESC LIMIT 1) AS latest_job_id,
   (SELECT job_state.job_state FROM cc_job_inputs input JOIN cc_jobs job
      ON job.project_id=input.project_id AND job.job_id=input.job_id
    JOIN cc_job_state job_state ON job_state.project_id=job.project_id AND job_state.job_id=job.job_id
    WHERE input.project_id=source.project_id AND input.source_id=source.source_id
    ORDER BY job.created_at_utc DESC,input.job_id DESC LIMIT 1) AS latest_job_state,
   (SELECT relation.report_id FROM cc_report_sources relation JOIN cc_reports report
      ON report.project_id=relation.project_id AND report.report_id=relation.report_id
    JOIN cc_artifacts report_artifact ON report_artifact.project_id=report.project_id
      AND report_artifact.artifact_kind='REPORT' AND report_artifact.artifact_ref=report.artifact_ref
      AND report_artifact.representation_of_artifact_id IS NULL
    JOIN cc_job_artifacts report_link ON report_link.project_id=report.project_id
      AND report_link.job_id=report.job_id AND report_link.artifact_id=report_artifact.artifact_id
      AND report_link.artifact_role='REPORT'
    WHERE relation.project_id=source.project_id AND relation.source_id=source.source_id
    ORDER BY report_artifact.created_at_utc DESC,report_link.link_sequence DESC,report.report_id DESC LIMIT 1) AS latest_report_id
   FROM cc_sources source WHERE source.project_id=?
   ORDER BY coalesce(source.acquired_at_utc,'' ) DESC,source.source_id LIMIT ?`)
   .all(id(projectId),limit);
  return rows.map(row=>{
   const retained=Boolean(row.retained_document_id),rawRetained=Boolean(row.retained_raw_artifact_id);
   const nextAction=row.report_count>0?'Open the related report or search this exact source.'
    :row.job_count>0?'Inspect the completed task, then save a report if this evidence matters.'
     :row.acquisition_state==='POINTER'?'Acquire this exact native source and version.'
      :retained?'Search the retained text or include it in a source-bound analysis.'
       :rawRetained?'The retained file bytes are available; add a supported text representation before source-bound text analysis.'
       :'Reattach the original content before a new source-bound analysis.';
   return {...row,retention_state:retained?'TEXT_RETAINED':rawRetained?'RAW_FILE_RETAINED':'METADATA_ONLY',
    replay_state:retained?'READY_FROM_RETAINED_TEXT':rawRetained?'RETAINED_BYTES_REPRESENTATION_REQUIRED':'ORIGINAL_REQUIRED',
    next_action:nextAction};
  });
 }

 countSources(projectId){
  return this.db.prepare('SELECT count(*) AS count FROM cc_sources WHERE project_id=?').get(id(projectId)).count;
 }

 listRetainedAcquisitions(projectId,limit=200){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:1000});
  return this.db.prepare(`SELECT document.document_id,document.source_id,document.retained_text,
   document.text_sha256,source.source_owner,source.source_namespace,source.native_id_type,
   source.native_id,source.native_version,source.content_sha256,source.acquired_at_utc
   FROM cc_retained_documents document JOIN cc_sources source
     ON source.project_id=document.project_id AND source.source_id=document.source_id
   WHERE document.project_id=? ORDER BY source.acquired_at_utc DESC,document.document_id LIMIT ?`)
   .all(id(projectId),limit).map(row=>({...row}));
 }

 listArtifacts(projectId,limit=200){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:1000});
  return this.db.prepare(`SELECT * FROM cc_artifacts WHERE project_id=?
   ORDER BY created_at_utc DESC,artifact_id LIMIT ?`).all(id(projectId),limit).map(row=>({...row}));
 }

 getArtifact(projectId,artifactId){
  const row=this.db.prepare('SELECT * FROM cc_artifacts WHERE project_id=? AND artifact_id=?')
   .get(id(projectId),id(artifactId));
  return row?{...row}:null;
 }

 hasRawBinaryArtifact(projectId){
  return Boolean(this.db.prepare(`SELECT 1 FROM cc_artifacts WHERE project_id=?
   AND artifact_kind IN ('INPUT_FILE','SCREENSHOT')
   AND artifact_ref LIKE 'mpc-workspace-artifact://%' LIMIT 1`).get(id(projectId)));
 }

 listTasks(projectId,limit=200){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:1000});
  return this.db.prepare(`SELECT * FROM cc_tasks WHERE project_id=? ORDER BY task_id LIMIT ?`)
   .all(id(projectId),limit).map(row=>({...row}));
 }

 getTask(projectId,taskId){
  const row=this.db.prepare('SELECT * FROM cc_tasks WHERE project_id=? AND task_id=?').get(id(projectId),id(taskId));
  return row?{...row}:null;
 }

 hasTask(projectId,taskId){return this.getTask(projectId,taskId)!==null}

 listJobs(projectId,limit=200){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:1000});
  return this.db.prepare(`SELECT job_id FROM cc_job_state WHERE project_id=?
   ORDER BY created_at_utc DESC,job_id DESC LIMIT ?`).all(id(projectId),limit)
   .map(row=>this.getJob(projectId,row.job_id));
 }

 listReports(projectId,limit=200){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:1000});
  return this.db.prepare(`SELECT report_id FROM cc_reports WHERE project_id=?
   ORDER BY report_id LIMIT ?`).all(id(projectId),limit).map(row=>this.getReport(projectId,row.report_id));
 }

 listScripts(projectId,limit=200){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:1000});
  return this.db.prepare(`SELECT script_id FROM cc_scripts WHERE project_id=?
   ORDER BY created_at_utc DESC,script_id DESC LIMIT ?`).all(id(projectId),limit)
   .map(row=>this.getScript(projectId,row.script_id));
 }

 listAttachedFolders(projectId,limit=200){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:1000});
  return this.db.prepare(`SELECT folder.*,
   (SELECT count(*) FROM cc_attached_files file WHERE file.project_id=folder.project_id
      AND file.mount_id=folder.mount_id) AS indexed_file_count
   FROM cc_attached_folders folder WHERE folder.project_id=? ORDER BY folder.mount_id LIMIT ?`)
   .all(id(projectId),limit).map(row=>{
    const rules=this.db.prepare(`SELECT rule_id,rule_kind,pattern FROM cc_folder_rules
     WHERE project_id=? AND mount_id=? ORDER BY rule_id`).all(projectId,row.mount_id).map(rule=>({...rule}));
    const latestScan=this.db.prepare(`SELECT * FROM cc_folder_scan_events WHERE project_id=? AND mount_id=?
     ORDER BY observed_at_utc DESC,scan_id DESC,scan_sequence DESC LIMIT 1`).get(projectId,row.mount_id)??null;
    return {...row,include_subfolders:Boolean(row.include_subfolders),rules,latest_scan:latestScan?{...latestScan}:null};
   });
 }

 listSnapshots(projectId,limit=200){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:1000});
  return this.db.prepare(`SELECT snapshot.*,
   (SELECT count(*) FROM cc_snapshot_entries entry WHERE entry.project_id=snapshot.project_id
      AND entry.snapshot_id=snapshot.snapshot_id) AS entry_count
   FROM cc_snapshots snapshot WHERE snapshot.project_id=?
   ORDER BY captured_at_utc DESC,snapshot_id DESC LIMIT ?`).all(id(projectId),limit).map(row=>({...row}));
 }

 listSnapshotComparisons(projectId,limit=200){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:1000});
  return this.db.prepare(`SELECT comparison_id FROM cc_snapshot_comparisons WHERE project_id=?
   ORDER BY created_at_utc DESC,comparison_id DESC LIMIT ?`).all(id(projectId),limit)
   .map(row=>this.getSnapshotComparison(projectId,row.comparison_id));
 }

 saveProjectDraft(projectId,text){
  const project=this.getProject(projectId);
  if(!project)fail('MPC_WORKSPACE_PROJECT_NOT_FOUND');
  bounded(text,'MPC_WORKSPACE_DRAFT_INVALID',{max:1_000_000});
  const hash=sha256(text),bytes=utf8(text),retained=project.retention_policy==='RETAIN_TEXT';
  if(retained)assertNoStoredSecret(text);
  this.db.prepare(`UPDATE cc_project_state SET draft_text=?,draft_sha256=?,draft_bytes=?,updated_at_utc=?
   WHERE project_id=?`).run(retained?text:null,hash,bytes,this.now(),projectId);
  return this.getProject(projectId).draft;
 }

 setProjectRetention(projectId,retentionPolicy){
  if(!MPC_WORKSPACE_RETENTION.includes(retentionPolicy))fail('MPC_WORKSPACE_RETENTION_INVALID');
  const project=this.getProject(projectId);
  if(!project)fail('MPC_WORKSPACE_PROJECT_NOT_FOUND');
  return this.transaction(()=>{
   if(retentionPolicy==='METADATA_ONLY'){
    if(project.retention_policy==='RETAIN_TEXT'){
     const history=this.db.prepare(`SELECT
      (SELECT count(*) FROM cc_tasks WHERE project_id=?) AS tasks,
      (SELECT count(*) FROM cc_artifacts WHERE project_id=? AND artifact_kind IN
       ('ROUTER_RECEIPT','MODEL_RECEIPT','JOB_CHECKPOINT','REPORT','SCRIPT','SCRIPT_OUTPUT')) AS raw_artifacts`)
      .get(projectId,projectId);
     if(history.tasks>0||history.raw_artifacts>0)
      fail('MPC_WORKSPACE_RETENTION_DOWNGRADE_REQUIRES_NEW_PROJECT',409);
    }
    this.db.prepare('DELETE FROM cc_retained_documents WHERE project_id=?').run(projectId);
    this.db.prepare(`UPDATE cc_project_state SET retention_policy=?,draft_text=NULL,updated_at_utc=?
     WHERE project_id=?`).run(retentionPolicy,this.now(),projectId);
   }else this.db.prepare('UPDATE cc_project_state SET retention_policy=?,updated_at_utc=? WHERE project_id=?')
    .run(retentionPolicy,this.now(),projectId);
   return this.getProject(projectId);
  });
 }

 selectProjectContext(projectId,{task_id=null,provider_profile_id=''}={}){
  if(task_id!==null)id(task_id);
  bounded(provider_profile_id,'MPC_WORKSPACE_PROVIDER_PROFILE_INVALID',{max:240});
  this.db.prepare(`UPDATE cc_project_state SET selected_task_id=?,selected_provider_profile_id=?,updated_at_utc=?
   WHERE project_id=?`).run(task_id,provider_profile_id,this.now(),id(projectId));
  if(this.db.prepare('SELECT changes() AS count').get().count!==1)fail('MPC_WORKSPACE_PROJECT_NOT_FOUND');
  return this.getProject(projectId);
 }

 createSource(value){
  const prepared={...value,native_version:value.native_version??'',content_sha256:value.content_sha256??'',
   acquisition_state:value.acquisition_state??'POINTER',acquired_at_utc:value.acquired_at_utc??this.now()};
  insertSource(this.db,prepared);
  return this.getSource(prepared.project_id,prepared.source_id);
 }

 markSourceAcquired(projectId,sourceId,{native_version='',content_sha256,acquired_at_utc=this.now()}={}){
  const source=this.getSource(projectId,sourceId);
  if(!source)fail('MPC_WORKSPACE_SOURCE_NOT_FOUND');
  if(source.acquisition_state!=='POINTER')fail('MPC_WORKSPACE_SOURCE_ALREADY_ACQUIRED');
  digest(content_sha256);
  this.db.prepare(`UPDATE cc_sources SET native_version=?,content_sha256=?,acquisition_state='ACQUIRED',acquired_at_utc=?
   WHERE project_id=? AND source_id=?`).run(
    bounded(native_version,'MPC_WORKSPACE_NATIVE_VERSION_INVALID',{max:512}),content_sha256,utc(acquired_at_utc),projectId,sourceId);
  return this.getSource(projectId,sourceId);
 }

 getSource(projectId,sourceId){
  return this.db.prepare('SELECT * FROM cc_sources WHERE project_id=? AND source_id=?').get(id(projectId),id(sourceId))??null;
 }

 acquireTextInput({project_id,source_id=this.nextId(),document_id=this.nextId(),artifact_id=this.nextId(),text,
  display_name='Pasted text',source_owner='LOCAL_WORKSPACE',native_id_type='local_input_id',native_id=source_id,
  native_version=null}={}){
  bounded(text,'MPC_WORKSPACE_INPUT_TEXT_INVALID',{max:TEXT_LIMIT});
  const project=this.getProject(project_id);
  if(!project)fail('MPC_WORKSPACE_PROJECT_NOT_FOUND');
  const hash=sha256(text),bytes=utf8(text),created=this.now(),retain=project.retention_policy==='RETAIN_TEXT';
  if(retain)assertNoStoredSecret(text);
  return this.transaction(()=>{
   const version=native_version??hash;
   const existing=this.db.prepare(`SELECT * FROM cc_sources WHERE project_id=? AND source_owner=?
    AND source_namespace='LOCAL_INPUT' AND native_id_type=? AND native_id=? AND native_version=?
    AND content_sha256=? AND acquisition_state='ACQUIRED'`).get(
     project_id,source_owner,native_id_type,native_id,version,hash);
   if(existing){
    let retained=this.db.prepare(`SELECT document_id FROM cc_retained_documents
     WHERE project_id=? AND source_id=? ORDER BY document_id LIMIT 1`).get(project_id,existing.source_id)??null;
    let artifact=this.db.prepare(`SELECT artifact_id FROM cc_artifacts WHERE project_id=? AND source_id=?
     AND artifact_kind='INPUT_TEXT' AND artifact_sha256=? ORDER BY artifact_id LIMIT 1`).get(
      project_id,existing.source_id,hash)??null;
    if(retain&&!retained){
     if(!artifact){
      insertArtifact(this.db,{project_id,artifact_id,artifact_kind:'INPUT_TEXT',source_id:existing.source_id,
       display_name,media_type:'text/plain',artifact_ref:`db://cc_retained_documents/${document_id}`,
       artifact_sha256:hash,artifact_bytes:bytes},created);
      artifact={artifact_id};
     }
     this.db.prepare(`INSERT INTO cc_retained_documents(project_id,document_id,source_id,
      retention_authorization_ref,retained_text,text_sha256) VALUES(?,?,?,?,?,?)`).run(
       project_id,document_id,existing.source_id,`project-retention://${project_id}/RETAIN_TEXT`,text,hash);
     retained={document_id};
    }
    return {project_id,source_id:existing.source_id,document_id:retained?.document_id??null,
     artifact_id:artifact?.artifact_id??null,retained:Boolean(retained),sha256:hash,bytes,reused:true};
   }
   const conflicting=this.getSource(project_id,source_id);
   if(conflicting)fail('MPC_WORKSPACE_SOURCE_ID_CONFLICT',409);
   insertSource(this.db,{project_id,source_id,source_owner,source_namespace:'LOCAL_INPUT',native_id_type,native_id,
    native_version:version,content_sha256:hash,acquisition_state:'ACQUIRED',acquired_at_utc:created});
   insertArtifact(this.db,{project_id,artifact_id,artifact_kind:'INPUT_TEXT',source_id,display_name,media_type:'text/plain',
    artifact_ref:retain?`db://cc_retained_documents/${document_id}`:`digest://sha256/${hash}`,artifact_sha256:hash,artifact_bytes:bytes},created);
   if(retain)this.db.prepare(`INSERT INTO cc_retained_documents(project_id,document_id,source_id,
    retention_authorization_ref,retained_text,text_sha256) VALUES(?,?,?,?,?,?)`).run(
     project_id,document_id,source_id,`project-retention://${project_id}/RETAIN_TEXT`,text,hash);
   return {project_id,source_id,document_id:retain?document_id:null,artifact_id,retained:retain,sha256:hash,bytes,reused:false};
  });
 }

 acquireFileInput({project_id,source,artifact}={}){
  if(!source||!artifact)fail('MPC_WORKSPACE_FILE_ACQUISITION_INVALID');
  const created=this.now();
  return this.transaction(()=>{
   const values={...source,project_id,source_namespace:'LOCAL_INPUT',acquisition_state:'ACQUIRED',
    acquired_at_utc:source.acquired_at_utc??created};
   // Validate the complete source identity before querying or mutating.
   sourceValues(values);
   const existing=this.db.prepare(`SELECT * FROM cc_sources WHERE project_id=? AND source_owner=?
    AND source_namespace='LOCAL_INPUT' AND native_id_type=? AND native_id=? AND native_version=?
    AND content_sha256=? AND acquisition_state='ACQUIRED'`).get(project_id,values.source_owner,
     values.native_id_type,values.native_id,values.native_version??'',values.content_sha256??'');
   if(existing){
    const savedArtifact=this.db.prepare(`SELECT * FROM cc_artifacts WHERE project_id=? AND source_id=?
     AND artifact_kind=? AND artifact_sha256=? ORDER BY artifact_id LIMIT 1`).get(
      project_id,existing.source_id,artifact.artifact_kind,artifact.artifact_sha256);
    if(!savedArtifact)fail('MPC_WORKSPACE_FILE_ARTIFACT_CONFLICT',409);
    return {project_id,source_id:existing.source_id,artifact_id:savedArtifact.artifact_id,
     retained:false,reused:true,sha256:existing.content_sha256,bytes:savedArtifact.artifact_bytes};
   }
   if(this.getSource(project_id,values.source_id))fail('MPC_WORKSPACE_SOURCE_ID_CONFLICT',409);
   insertSource(this.db,values);
   insertArtifact(this.db,{...artifact,project_id,source_id:values.source_id},created);
   return {project_id,source_id:values.source_id,artifact_id:artifact.artifact_id,retained:false,
    reused:false,sha256:values.content_sha256,bytes:artifact.artifact_bytes};
  });
 }

 retainTextForExistingSource({project_id,source_id,document_id=this.nextId(),artifact_id=this.nextId(),text,
  display_name='Retained text'}={}){
  bounded(text,'MPC_WORKSPACE_INPUT_TEXT_INVALID',{max:TEXT_LIMIT});
  const project=this.getProject(project_id),source=this.getSource(project_id,source_id);
  if(!project||!source)fail('MPC_WORKSPACE_SOURCE_NOT_FOUND');
  if(project.retention_policy!=='RETAIN_TEXT')fail('MPC_WORKSPACE_TEXT_RETENTION_NOT_AUTHORIZED');
  const hash=sha256(text),bytes=utf8(text);
  assertNoStoredSecret(text);
  const existing=this.db.prepare(`SELECT document_id,text_sha256 FROM cc_retained_documents
   WHERE project_id=? AND source_id=? ORDER BY document_id LIMIT 1`).get(project_id,source_id);
  if(existing){
   if(existing.text_sha256!==hash)fail('MPC_WORKSPACE_RETAINED_TEXT_CONFLICT');
   return {project_id,source_id,document_id:existing.document_id,artifact_id:null,retained:true,sha256:hash,bytes,reused:true};
  }
  const created=this.now();
  return this.transaction(()=>{
   insertArtifact(this.db,{project_id,artifact_id,artifact_kind:'INPUT_TEXT',source_id,display_name,
    media_type:'text/plain',artifact_ref:`db://cc_retained_documents/${document_id}`,
    artifact_sha256:hash,artifact_bytes:bytes},created);
   this.db.prepare(`INSERT INTO cc_retained_documents(project_id,document_id,source_id,
    retention_authorization_ref,retained_text,text_sha256) VALUES(?,?,?,?,?,?)`).run(
     project_id,document_id,source_id,`project-retention://${project_id}/RETAIN_TEXT`,text,hash);
   return {project_id,source_id,document_id,artifact_id,retained:true,sha256:hash,bytes,reused:false};
  });
 }

 searchRetained({project_id,query,limit=50}={}){
  id(project_id);bounded(query,'MPC_WORKSPACE_SEARCH_QUERY_INVALID',{min:1,max:4096});
  integer(limit,'MPC_WORKSPACE_SEARCH_LIMIT_INVALID',{min:1,max:200});
  const tokens=query.trim().split(/\s+/u).filter(Boolean).slice(0,32);
  if(tokens.length===0)return [];
  try{
   this.db.exec(`CREATE VIRTUAL TABLE temp.cc_workspace_search USING fts5(
    project_id UNINDEXED,document_id UNINDEXED,source_id UNINDEXED,body,tokenize='unicode61');`);
   this.db.prepare(`INSERT INTO temp.cc_workspace_search(project_id,document_id,source_id,body)
    SELECT project_id,document_id,source_id,retained_text FROM cc_retained_documents WHERE project_id=?`).run(project_id);
   const expression=tokens.map(token=>`"${token.replaceAll('"','""')}"`).join(' AND ');
   return this.db.prepare(`SELECT document_id,source_id,
    snippet(cc_workspace_search,3,'[',']','…',24) AS snippet
    FROM temp.cc_workspace_search WHERE project_id=? AND cc_workspace_search MATCH ? LIMIT ?`)
    .all(project_id,expression,limit);
  }catch(error){
   if(!/no such module: fts5/iu.test(String(error?.message)))throw error;
   const escaped=query.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_');
   return this.db.prepare(`SELECT document_id,source_id,substr(retained_text,1,320) AS snippet
    FROM cc_retained_documents WHERE project_id=? AND retained_text LIKE ? ESCAPE '\\' LIMIT ?`)
    .all(project_id,`%${escaped}%`,limit);
  }finally{try{this.db.exec('DROP TABLE IF EXISTS temp.cc_workspace_search')}catch{}}
 }

 createTask({project_id,task_id=this.nextId(),title,work_phase_namespace='MPC_WORKSPACE',work_phase='ACQUISITION',next_action=''}={}){
  this.db.prepare(`INSERT INTO cc_tasks(project_id,task_id,title,work_phase_namespace,work_phase,next_action)
   VALUES(?,?,?,?,?,?)`).run(id(project_id),id(task_id),bounded(title,'MPC_WORKSPACE_TASK_TITLE_INVALID',{min:1,max:512}),
    bounded(work_phase_namespace,'MPC_WORKSPACE_PHASE_NAMESPACE_INVALID',{min:1,max:240}),
    bounded(work_phase,'MPC_WORKSPACE_PHASE_INVALID',{min:1,max:120}),bounded(next_action,'MPC_WORKSPACE_NEXT_ACTION_INVALID',{max:32768}));
  return this.db.prepare('SELECT * FROM cc_tasks WHERE project_id=? AND task_id=?').get(project_id,task_id);
 }

 startJob({project_id,job_id=this.nextId(),task_id,operation_name,idempotency_key,request={}}={}){
  const requestJson=stableJson(request),requestHash=sha256(requestJson),created=this.now();
  id(project_id);id(job_id);id(task_id);id(idempotency_key,'MPC_WORKSPACE_IDEMPOTENCY_KEY_INVALID');
  bounded(operation_name,'MPC_WORKSPACE_OPERATION_INVALID',{min:1,max:240});
  return this.transaction(()=>{
   const existing=this.db.prepare('SELECT * FROM cc_jobs WHERE project_id=? AND idempotency_key=?').get(project_id,idempotency_key);
   if(existing){
    if(existing.task_id!==task_id||existing.operation_name!==operation_name||existing.request_sha256!==requestHash)
     fail('MPC_WORKSPACE_IDEMPOTENCY_CONFLICT');
    return {...this.getJob(project_id,existing.job_id),reused:true};
   }
   this.db.prepare(`INSERT INTO cc_jobs(project_id,job_id,task_id,operation_name,idempotency_key,request_sha256,created_at_utc)
    VALUES(?,?,?,?,?,?,?)`).run(project_id,job_id,task_id,operation_name,idempotency_key,requestHash,created);
   const eventId=this.nextId();
   this.db.prepare(`INSERT INTO cc_job_receipt_events(project_id,event_id,job_id,event_sequence,job_state,fact_summary,observed_at_utc)
    VALUES(?,?,?,1,'QUEUED','Queued',?)`).run(project_id,eventId,job_id,created);
   this.db.prepare(`INSERT INTO cc_job_progress_events(project_id,event_id,job_id,action_label)
    VALUES(?,?,?,'Queued')`).run(project_id,eventId,job_id);
   return {...this.getJob(project_id,job_id),reused:false};
  });
 }

 appendJobEvent({project_id,job_id,event_id=this.nextId(),job_state,fact_summary,action_label,
  acquired_count=0,analyzed_count=0,decided_count=0,completed_count=0,total_count=null,operation_receipt_id=null}={}){
  const states=['QUEUED','RUNNING','SUCCEEDED','FAILED','BLOCKED','CANCELLED'];
  if(!states.includes(job_state))fail('MPC_WORKSPACE_JOB_STATE_INVALID');
  const observed=this.now();
  return this.transaction(()=>{
   const sequence=this.db.prepare(`SELECT coalesce(max(event_sequence),0)+1 AS sequence FROM cc_job_receipt_events
    WHERE project_id=? AND job_id=?`).get(id(project_id),id(job_id)).sequence;
   this.db.prepare(`INSERT INTO cc_job_receipt_events(project_id,event_id,job_id,event_sequence,job_state,
    fact_summary,operation_receipt_id,observed_at_utc) VALUES(?,?,?,?,?,?,?,?)`).run(
     project_id,id(event_id),job_id,sequence,job_state,bounded(fact_summary,'MPC_WORKSPACE_FACT_SUMMARY_INVALID',{max:32768}),operation_receipt_id,observed);
   this.db.prepare(`INSERT INTO cc_job_progress_events(project_id,event_id,job_id,action_label,acquired_count,
    analyzed_count,decided_count,completed_count,total_count) VALUES(?,?,?,?,?,?,?,?,?)`).run(
     project_id,event_id,job_id,bounded(action_label,'MPC_WORKSPACE_ACTION_LABEL_INVALID',{min:1,max:240}),
     integer(acquired_count,'MPC_WORKSPACE_PROGRESS_INVALID'),integer(analyzed_count,'MPC_WORKSPACE_PROGRESS_INVALID'),
     integer(decided_count,'MPC_WORKSPACE_PROGRESS_INVALID'),integer(completed_count,'MPC_WORKSPACE_PROGRESS_INVALID'),
     integer(total_count,'MPC_WORKSPACE_PROGRESS_INVALID',{nullable:true}));
   return this.getJob(project_id,job_id);
  });
 }

 getJob(projectId,jobId){
  const job=this.db.prepare('SELECT * FROM cc_job_state WHERE project_id=? AND job_id=?').get(id(projectId),id(jobId));
  if(!job)return null;
  const progress=this.db.prepare(`SELECT p.*,e.event_sequence,e.observed_at_utc FROM cc_job_progress_events p
   JOIN cc_job_receipt_events e USING(project_id,event_id) WHERE p.project_id=? AND p.job_id=?
   ORDER BY e.event_sequence DESC LIMIT 1`).get(projectId,jobId)??null;
  const checkpoint=this.db.prepare(`SELECT * FROM cc_job_checkpoints WHERE project_id=? AND job_id=?
   ORDER BY checkpoint_sequence DESC LIMIT 1`).get(projectId,jobId)??null;
  return {...job,progress,checkpoint,terminal:TERMINAL_STATES.has(job.job_state)};
 }

 createArtifact(value){
  const created=this.now();insertArtifact(this.db,value,created);
  return this.db.prepare('SELECT * FROM cc_artifacts WHERE project_id=? AND artifact_id=?').get(value.project_id,value.artifact_id);
 }

 addJobInput({project_id,job_id,input_kind,source_id=null,artifact_id=null,ordinal=0}={}){
  this.db.prepare(`INSERT INTO cc_job_inputs(project_id,job_id,input_kind,source_id,artifact_id,ordinal)
   VALUES(?,?,?,?,?,?)`).run(id(project_id),id(job_id),input_kind,source_id,artifact_id,integer(ordinal,'MPC_WORKSPACE_INPUT_ORDINAL_INVALID'));
 }

 linkJobArtifact({project_id,job_id,artifact_id,artifact_role}={}){
  return this.transaction(()=>insertJobArtifact(this.db,{project_id,job_id,artifact_id,artifact_role}));
 }

 getLatestJobArtifact(projectId,jobId,artifactRole){
  if(!JOB_ARTIFACT_ROLES.has(artifactRole))fail('MPC_WORKSPACE_ARTIFACT_ROLE_INVALID');
  const row=this.db.prepare(`SELECT artifact.* FROM cc_job_artifacts relation
   JOIN cc_artifacts artifact ON artifact.project_id=relation.project_id AND artifact.artifact_id=relation.artifact_id
   WHERE relation.project_id=? AND relation.job_id=? AND relation.artifact_role=?
   ORDER BY relation.link_sequence DESC LIMIT 1`).get(id(projectId),id(jobId),artifactRole);
  return row?{...row}:null;
 }

 saveCheckpoint({project_id,job_id,checkpoint_id=this.nextId(),artifact_id,dependency_sha256,next_action}={}){
  return this.transaction(()=>{
   const artifact=this.db.prepare('SELECT artifact_kind FROM cc_artifacts WHERE project_id=? AND artifact_id=?').get(project_id,artifact_id);
   if(artifact?.artifact_kind!=='JOB_CHECKPOINT')fail('MPC_WORKSPACE_CHECKPOINT_ARTIFACT_REQUIRED');
   const sequence=this.db.prepare(`SELECT coalesce(max(checkpoint_sequence),0)+1 AS sequence FROM cc_job_checkpoints
    WHERE project_id=? AND job_id=?`).get(project_id,job_id).sequence;
   this.db.prepare(`INSERT INTO cc_job_checkpoints(project_id,checkpoint_id,job_id,checkpoint_sequence,
    artifact_id,dependency_sha256,next_action,created_at_utc) VALUES(?,?,?,?,?,?,?,?)`).run(
     id(project_id),id(checkpoint_id),id(job_id),sequence,id(artifact_id),digest(dependency_sha256),
     bounded(next_action,'MPC_WORKSPACE_NEXT_ACTION_INVALID',{max:32768}),this.now());
   insertJobArtifact(this.db,{project_id,job_id,artifact_id,artifact_role:'CHECKPOINT'});
   return this.getJob(project_id,job_id).checkpoint;
  });
 }

 getResumeState(projectId){
  const project=this.getProject(projectId);
  if(!project)return null;
  const job=project.selected_task_id
   ?this.db.prepare(`SELECT job_id FROM cc_job_state WHERE project_id=? AND task_id=?
      AND job_state NOT IN ('SUCCEEDED','FAILED','CANCELLED') ORDER BY created_at_utc DESC,job_id DESC LIMIT 1`).get(projectId,project.selected_task_id)
   :this.db.prepare(`SELECT job_id FROM cc_job_state WHERE project_id=?
      AND job_state NOT IN ('SUCCEEDED','FAILED','CANCELLED') ORDER BY created_at_utc DESC,job_id DESC LIMIT 1`).get(projectId);
  return {project,job:job?this.getJob(projectId,job.job_id):null,resume_required:Boolean(job)};
 }

 createReport({project_id,report_id=this.nextId(),job_id,title,artifact_ref,artifact_sha256,artifact_bytes=0,
  artifact_id=this.nextId(),report_state='READY',source_links=[],representations=[]}={}){
  if(!Array.isArray(representations)||representations.length>8)fail('MPC_WORKSPACE_REPORT_REPRESENTATIONS_INVALID');
  const created=this.now();
  return this.transaction(()=>{
   insertArtifact(this.db,{project_id,artifact_id,artifact_kind:'REPORT',display_name:title,media_type:'text/markdown',
    artifact_ref,artifact_sha256,artifact_bytes},created);
   for(const representation of representations){
    if(!representation||typeof representation!=='object'||representation.artifact_id===artifact_id)
     fail('MPC_WORKSPACE_REPORT_REPRESENTATION_INVALID');
    insertArtifact(this.db,{...representation,project_id,artifact_kind:'REPORT',source_id:null,
     representation_of_artifact_id:artifact_id},created);
   }
   this.db.prepare(`INSERT INTO cc_reports(project_id,report_id,job_id,title,artifact_ref,artifact_sha256,
    artifact_kind,report_state) VALUES(?,?,?,?,?,?,'REPORT',?)`).run(
     id(project_id),id(report_id),id(job_id),bounded(title,'MPC_WORKSPACE_REPORT_TITLE_INVALID',{min:1,max:512}),
     bounded(artifact_ref,'MPC_WORKSPACE_ARTIFACT_REF_INVALID',{min:1,max:4096}),digest(artifact_sha256),report_state);
   for(const link of source_links)this.db.prepare(`INSERT INTO cc_report_sources(project_id,report_id,source_id,source_role)
    VALUES(?,?,?,?)`).run(project_id,report_id,id(link.source_id),link.source_role);
   insertJobArtifact(this.db,{project_id,job_id,artifact_id,artifact_role:'REPORT'});
   return this.getReport(project_id,report_id);
  });
 }

 getReport(projectId,reportId){
  const report=this.db.prepare('SELECT * FROM cc_reports WHERE project_id=? AND report_id=?').get(id(projectId),id(reportId));
  if(!report)return null;
  const sources=this.db.prepare(`SELECT source_id,source_role FROM cc_report_sources
   WHERE project_id=? AND report_id=? ORDER BY source_role,source_id`).all(projectId,reportId)
   .map(row=>({source_id:row.source_id,source_role:row.source_role}));
  const artifact=this.db.prepare(`SELECT * FROM cc_artifacts WHERE project_id=? AND artifact_kind='REPORT'
   AND artifact_ref=? AND representation_of_artifact_id IS NULL ORDER BY artifact_id LIMIT 1`)
   .get(projectId,report.artifact_ref)??null;
  const representations=artifact?this.db.prepare(`SELECT * FROM cc_artifacts WHERE project_id=?
   AND (artifact_id=? OR representation_of_artifact_id=?) ORDER BY
   CASE media_type WHEN 'text/markdown' THEN 0 WHEN 'application/json' THEN 1 WHEN 'text/html' THEN 2 ELSE 3 END,
   artifact_id`).all(projectId,artifact.artifact_id,artifact.artifact_id).map(row=>({...row})):[];
  return {...report,sources,artifact:artifact?{...artifact}:null,representations};
 }

 attachFolder({project_id,mount_id=this.nextId(),host_id,root_locator,source_kind='LOCAL_FOLDER',
  attachment_mode='INDEX_IN_PLACE',include_subfolders=true,connection_state='ONLINE',index_state='NOT_INDEXED',rules=[]}={}){
  if(!Array.isArray(rules)||rules.length>256)fail('MPC_WORKSPACE_FOLDER_RULES_INVALID');
  return this.transaction(()=>{
   id(project_id);id(mount_id);bounded(host_id,'MPC_WORKSPACE_HOST_ID_INVALID',{min:1,max:512});
   bounded(root_locator,'MPC_WORKSPACE_FOLDER_PATH_INVALID',{min:1,max:4096});
   const expectedRules=rules.map(rule=>({rule_kind:rule.rule_kind,
    pattern:bounded(rule.pattern,'MPC_WORKSPACE_FOLDER_PATTERN_INVALID',{min:1,max:1024})}))
    .sort((left,right)=>left.rule_kind.localeCompare(right.rule_kind)||left.pattern.localeCompare(right.pattern));
   const candidates=this.db.prepare(`SELECT mount_id,include_subfolders FROM cc_attached_folders
    WHERE project_id=? AND host_id=? AND root_locator=? AND source_kind=? AND attachment_mode=?
      AND connection_state<>'DETACHED' ORDER BY mount_id`).all(
     project_id,host_id,root_locator,source_kind,attachment_mode);
   for(const candidate of candidates){
    if(Boolean(candidate.include_subfolders)!==Boolean(include_subfolders))continue;
    const savedRules=this.db.prepare(`SELECT rule_kind,pattern FROM cc_folder_rules WHERE project_id=? AND mount_id=?
     ORDER BY rule_kind,pattern`).all(project_id,candidate.mount_id)
     .map(rule=>({rule_kind:rule.rule_kind,pattern:rule.pattern}));
    if(stableJson(savedRules)===stableJson(expectedRules))return {
     ...this.listAttachedFolders(project_id).find(folder=>folder.mount_id===candidate.mount_id),reused:true
    };
   }
   const conflicting=this.db.prepare(`SELECT 1 FROM cc_attached_folders WHERE project_id=? AND mount_id=?`)
    .get(project_id,mount_id);
   if(conflicting)fail('MPC_WORKSPACE_FOLDER_ID_CONFLICT',409);
   this.db.prepare(`INSERT INTO cc_attached_folders(project_id,mount_id,host_id,root_locator,source_kind,
    attachment_mode,include_subfolders,connection_state,index_state) VALUES(?,?,?,?,?,?,?,?,?)`).run(
     project_id,mount_id,host_id,root_locator,source_kind,attachment_mode,
     include_subfolders?1:0,connection_state,index_state);
   for(const rule of rules)this.addFolderRule({project_id,mount_id,...rule});
   return {...this.listAttachedFolders(project_id).find(folder=>folder.mount_id===mount_id),reused:false};
  });
 }

 addFolderRule({project_id,mount_id,rule_id=this.nextId(),rule_kind,pattern}={}){
  this.db.prepare(`INSERT INTO cc_folder_rules(project_id,mount_id,rule_id,rule_kind,pattern,created_at_utc)
   VALUES(?,?,?,?,?,?)`).run(id(project_id),id(mount_id),id(rule_id),rule_kind,
    bounded(pattern,'MPC_WORKSPACE_FOLDER_PATTERN_INVALID',{min:1,max:1024}),this.now());
  return {...this.db.prepare(`SELECT * FROM cc_folder_rules WHERE project_id=? AND mount_id=? AND rule_id=?`)
   .get(project_id,mount_id,rule_id)};
 }

 recordFolderScanEvent({project_id,mount_id,scan_id,scan_event_id=this.nextId(),scan_state,
  indexed_count=0,pending_count=0,changed_count=0,unavailable_count=0,excluded_count=0}={}){
  return this.transaction(()=>{
   const sequence=this.db.prepare(`SELECT coalesce(max(scan_sequence),0)+1 AS sequence FROM cc_folder_scan_events
    WHERE project_id=? AND mount_id=? AND scan_id=?`).get(id(project_id),id(mount_id),id(scan_id)).sequence;
   this.db.prepare(`INSERT INTO cc_folder_scan_events(project_id,mount_id,scan_id,scan_event_id,scan_sequence,
    scan_state,indexed_count,pending_count,changed_count,unavailable_count,excluded_count,observed_at_utc)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(project_id,mount_id,scan_id,id(scan_event_id),sequence,scan_state,
     integer(indexed_count,'MPC_WORKSPACE_FOLDER_COUNT_INVALID'),integer(pending_count,'MPC_WORKSPACE_FOLDER_COUNT_INVALID'),
     integer(changed_count,'MPC_WORKSPACE_FOLDER_COUNT_INVALID'),integer(unavailable_count,'MPC_WORKSPACE_FOLDER_COUNT_INVALID'),
     integer(excluded_count,'MPC_WORKSPACE_FOLDER_COUNT_INVALID'),this.now());
   return {...this.db.prepare(`SELECT * FROM cc_folder_scan_events WHERE project_id=? AND mount_id=?
    AND scan_id=? AND scan_event_id=?`).get(project_id,mount_id,scan_id,scan_event_id)};
  });
 }

 recordAttachedFile({project_id,mount_id,relative_locator,file_version,source_id,file_state='PRESENT',
  mapped_native_source_id=null,native_mapping_receipt_id=null}={}){
  this.db.prepare(`INSERT INTO cc_attached_files(project_id,mount_id,relative_locator,file_version,source_id,
   file_state,observed_at_utc,mapped_native_source_id,native_mapping_receipt_id) VALUES(?,?,?,?,?,?,?,?,?)`).run(
    id(project_id),id(mount_id),bounded(relative_locator,'MPC_WORKSPACE_RELATIVE_PATH_INVALID',{min:1,max:4096}),
    bounded(file_version,'MPC_WORKSPACE_FILE_VERSION_INVALID',{min:1,max:512}),id(source_id),file_state,this.now(),
    mapped_native_source_id,native_mapping_receipt_id);
 }

 acquireAttachedFile({project_id,mount_id,relative_locator,file_version,source,artifact=null,
  retained_text=null,document_id=this.nextId(),file_state='PRESENT'}={}){
  const project=this.getProject(project_id);
  if(!project)fail('MPC_WORKSPACE_PROJECT_NOT_FOUND',404);
  const locator=bounded(relative_locator,'MPC_WORKSPACE_RELATIVE_PATH_INVALID',{min:1,max:4096});
  const version=bounded(file_version,'MPC_WORKSPACE_FILE_VERSION_INVALID',{min:1,max:512});
  const acquisitionState=source?.acquisition_state??'ACQUIRED';
  if(acquisitionState==='POINTER'&&(artifact!==null||retained_text!==null))
   fail('MPC_WORKSPACE_POINTER_CONTENT_CONFLICT');
  if(retained_text!==null){
   bounded(retained_text,'MPC_WORKSPACE_INPUT_TEXT_INVALID',{max:TEXT_LIMIT});
   if(project.retention_policy!=='RETAIN_TEXT')fail('MPC_WORKSPACE_TEXT_RETENTION_NOT_AUTHORIZED',409);
   assertNoStoredSecret(retained_text);
  }
  const created=this.now();
  return this.transaction(()=>{
   const attached=this.db.prepare(`SELECT * FROM cc_attached_files WHERE project_id=? AND mount_id=?
    AND relative_locator=? AND file_version=?`).get(id(project_id),id(mount_id),locator,version);
   if(attached){
    let savedSource=this.getSource(project_id,attached.source_id);
    if(!savedSource)fail('MPC_WORKSPACE_FOLDER_VERSION_CONTENT_CONFLICT',409);
    if(savedSource.acquisition_state==='POINTER'&&acquisitionState==='ACQUIRED'){
     savedSource=this.markSourceAcquired(project_id,savedSource.source_id,{native_version:version,
      content_sha256:source.content_sha256,acquired_at_utc:source.acquired_at_utc??created});
     let promotedArtifactId=null,promotedDocumentId=null;
     if(artifact){
      const prepared={...artifact,project_id,source_id:savedSource.source_id};
      insertArtifact(this.db,prepared,created);promotedArtifactId=prepared.artifact_id;
     }
     if(retained_text!==null){
      const textHash=sha256(retained_text);
      this.db.prepare(`INSERT INTO cc_retained_documents(project_id,document_id,source_id,
       retention_authorization_ref,retained_text,text_sha256) VALUES(?,?,?,?,?,?)`).run(
        project_id,document_id,savedSource.source_id,`project-retention://${project_id}/RETAIN_TEXT`,retained_text,textHash);
      promotedDocumentId=document_id;
     }
     return {project_id,mount_id,relative_locator:locator,file_version:version,source_id:savedSource.source_id,
      artifact_id:promotedArtifactId,document_id:promotedDocumentId,retained:Boolean(promotedDocumentId),reused:false,promoted:true};
    }
    if((source?.content_sha256??'')&&savedSource.content_sha256!==source.content_sha256)
     fail('MPC_WORKSPACE_FOLDER_VERSION_CONTENT_CONFLICT',409);
    const savedArtifact=this.db.prepare(`SELECT * FROM cc_artifacts WHERE project_id=? AND source_id=?
     ORDER BY artifact_id LIMIT 1`).get(project_id,attached.source_id)??null;
    const savedDocument=this.db.prepare(`SELECT document_id FROM cc_retained_documents
     WHERE project_id=? AND source_id=? ORDER BY document_id LIMIT 1`).get(project_id,attached.source_id)??null;
    return {project_id,mount_id,relative_locator:locator,file_version:version,source_id:attached.source_id,
     artifact_id:savedArtifact?.artifact_id??null,document_id:savedDocument?.document_id??null,
     retained:Boolean(savedDocument),reused:true};
   }
   const values={...source,project_id,source_namespace:'LOCAL_FILESYSTEM',native_version:version,
    content_sha256:source?.content_sha256??'',acquisition_state:acquisitionState,
    acquired_at_utc:source?.acquired_at_utc??created};
   sourceValues(values);
   let savedSource=this.db.prepare(`SELECT * FROM cc_sources WHERE project_id=? AND source_owner=?
    AND source_namespace='LOCAL_FILESYSTEM' AND native_id_type=? AND native_id=? AND native_version=?
    AND content_sha256=? AND acquisition_state=?`).get(project_id,values.source_owner,
     values.native_id_type,values.native_id,version,values.content_sha256,acquisitionState);
   if(!savedSource){
    if(this.getSource(project_id,values.source_id))fail('MPC_WORKSPACE_SOURCE_ID_CONFLICT',409);
    insertSource(this.db,values);
    savedSource=this.getSource(project_id,values.source_id);
   }
   let artifactId=null;
   if(artifact){
    const prepared={...artifact,project_id,source_id:savedSource.source_id};
    insertArtifact(this.db,prepared,created);
    artifactId=prepared.artifact_id;
   }
   let retainedDocumentId=null;
   if(retained_text!==null){
    const textHash=sha256(retained_text);
    this.db.prepare(`INSERT INTO cc_retained_documents(project_id,document_id,source_id,
     retention_authorization_ref,retained_text,text_sha256) VALUES(?,?,?,?,?,?)`).run(
      project_id,document_id,savedSource.source_id,`project-retention://${project_id}/RETAIN_TEXT`,retained_text,textHash);
    retainedDocumentId=document_id;
   }
   this.db.prepare(`INSERT INTO cc_attached_files(project_id,mount_id,relative_locator,file_version,source_id,
    file_state,observed_at_utc) VALUES(?,?,?,?,?,?,?)`).run(
     project_id,mount_id,locator,version,savedSource.source_id,file_state,created);
   return {project_id,mount_id,relative_locator:locator,file_version:version,source_id:savedSource.source_id,
    artifact_id:artifactId,document_id:retainedDocumentId,retained:retainedDocumentId!==null,reused:false};
  });
 }

 setFolderState(projectId,mountId,{connection_state,index_state,detach_index_policy='KEEP_HISTORY'}={}){
  const detached=connection_state==='DETACHED';
  this.db.prepare(`UPDATE cc_attached_folders SET connection_state=?,index_state=?,detach_index_policy=?,detached_at_utc=?
   WHERE project_id=? AND mount_id=?`).run(connection_state,index_state,detach_index_policy,detached?this.now():null,id(projectId),id(mountId));
 }

 createSnapshot({project_id,snapshot_id=this.nextId(),source_id,manifest,entries=[]}={}){
  const created=this.now();
  if(!manifest||typeof manifest!=='object')fail('MPC_WORKSPACE_SNAPSHOT_MANIFEST_INVALID');
  if(!Array.isArray(entries)||entries.length>10000)fail('MPC_WORKSPACE_SNAPSHOT_ENTRIES_INVALID');
  return this.transaction(()=>{
   const existing=this.getSnapshot(project_id,snapshot_id);
   if(existing){
    const expectedScope=manifest.comparison_scope;
    const identityMatches=existing.source_id===source_id&&existing.manifest_artifact_id===manifest.artifact_id&&
     existing.manifest_artifact?.artifact_sha256===manifest.artifact_sha256&&
     existing.comparison_scope_owner===expectedScope?.owner&&
     existing.comparison_scope_namespace===expectedScope?.namespace&&
     existing.comparison_scope_id_type===expectedScope?.id_type&&
     existing.comparison_scope_id===expectedScope?.id&&existing.coverage_state===manifest.coverage_state;
    const normalizedEntries=entries.map(entry=>{
     const values=snapshotEntryValues(entry);
     return {entry_id:values[0],entry_kind:values[1],native_owner:values[2],native_namespace:values[3],
      native_id_type:values[4],native_id:values[5],native_version:values[6],content_sha256:values[7],
      relative_locator:values[8],availability:values[9],alias_target_entry_id:values[10]};
    }).sort((left,right)=>left.entry_kind.localeCompare(right.entry_kind)||left.entry_id.localeCompare(right.entry_id));
    const savedEntries=existing.entries.map(entry=>({entry_id:entry.entry_id,entry_kind:entry.entry_kind,
     native_owner:entry.native_owner,native_namespace:entry.native_namespace,native_id_type:entry.native_id_type,
     native_id:entry.native_id,native_version:entry.native_version,content_sha256:entry.content_sha256,
     relative_locator:entry.relative_locator,availability:entry.availability,
     alias_target_entry_id:entry.alias_target_entry_id}))
     .sort((left,right)=>left.entry_kind.localeCompare(right.entry_kind)||left.entry_id.localeCompare(right.entry_id));
    if(!identityMatches||stableJson(normalizedEntries)!==stableJson(savedEntries))
     fail('MPC_WORKSPACE_SNAPSHOT_ID_CONFLICT',409);
    return {...existing,reused:true};
   }
   insertArtifact(this.db,{project_id,artifact_id:manifest.artifact_id,artifact_kind:'SNAPSHOT_MANIFEST',source_id,
    display_name:manifest.display_name??'Snapshot manifest',media_type:'application/json',artifact_ref:manifest.artifact_ref,
    artifact_sha256:manifest.artifact_sha256,artifact_bytes:manifest.artifact_bytes},created);
   const scope=manifest.comparison_scope;
   this.db.prepare(`INSERT INTO cc_snapshots(project_id,snapshot_id,source_id,manifest_artifact_id,
    comparison_scope_owner,comparison_scope_namespace,comparison_scope_id_type,comparison_scope_id,
    coverage_state,captured_at_utc) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
      id(project_id),id(snapshot_id),id(source_id),id(manifest.artifact_id),
      bounded(scope.owner,'MPC_WORKSPACE_SCOPE_INVALID',{min:1,max:512}),bounded(scope.namespace,'MPC_WORKSPACE_SCOPE_INVALID',{min:1,max:128}),
      bounded(scope.id_type,'MPC_WORKSPACE_SCOPE_INVALID',{min:1,max:128}),bounded(scope.id,'MPC_WORKSPACE_SCOPE_INVALID',{min:1,max:2048}),
      manifest.coverage_state,created);
   const insert=this.db.prepare(`INSERT INTO cc_snapshot_entries(project_id,snapshot_id,entry_id,entry_kind,
    native_owner,native_namespace,native_id_type,native_id,native_version,content_sha256,relative_locator,
    availability,alias_target_entry_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
   for(const entry of entries.filter(item=>item.entry_kind==='NATIVE'))insert.run(project_id,snapshot_id,...snapshotEntryValues(entry));
   for(const entry of entries.filter(item=>item.entry_kind==='ALIAS'))insert.run(project_id,snapshot_id,...snapshotEntryValues(entry));
   return {...this.getSnapshot(project_id,snapshot_id),reused:false};
  });
 }

 getSnapshot(projectId,snapshotId){
  const snapshot=this.db.prepare('SELECT * FROM cc_snapshots WHERE project_id=? AND snapshot_id=?').get(id(projectId),id(snapshotId));
  if(!snapshot)return null;
  const manifest=this.db.prepare('SELECT * FROM cc_artifacts WHERE project_id=? AND artifact_id=?')
   .get(projectId,snapshot.manifest_artifact_id)??null;
  return {...snapshot,manifest_artifact:manifest?{...manifest}:null,
   entries:this.db.prepare(`SELECT * FROM cc_snapshot_entries WHERE project_id=? AND snapshot_id=?
   ORDER BY entry_kind DESC,entry_id`).all(projectId,snapshotId)};
 }

 recordSnapshotComparison({project_id,comparison_id=this.nextId(),left_snapshot_id,right_snapshot_id,
  result_artifact,comparison_state}={}){
  const left=this.getSnapshot(project_id,left_snapshot_id),right=this.getSnapshot(project_id,right_snapshot_id);
  if(!left||!right)fail('MPC_WORKSPACE_SNAPSHOT_NOT_FOUND');
  for(const field of ['comparison_scope_owner','comparison_scope_namespace','comparison_scope_id_type','comparison_scope_id'])
   if(left[field]!==right[field])fail('MPC_WORKSPACE_SNAPSHOT_SCOPE_MISMATCH');
  const created=this.now();
  return this.transaction(()=>{
   insertArtifact(this.db,{project_id,...result_artifact,artifact_kind:'SNAPSHOT_COMPARISON'},created);
   this.db.prepare(`INSERT INTO cc_snapshot_comparisons(project_id,comparison_id,left_snapshot_id,right_snapshot_id,
    result_artifact_id,comparison_state,created_at_utc) VALUES(?,?,?,?,?,?,?)`).run(
     project_id,id(comparison_id),left_snapshot_id,right_snapshot_id,result_artifact.artifact_id,comparison_state,created);
   return this.getSnapshotComparison(project_id,comparison_id);
  });
 }

 getSnapshotComparison(projectId,comparisonId){
  const comparison=this.db.prepare(`SELECT * FROM cc_snapshot_comparisons
   WHERE project_id=? AND comparison_id=?`).get(id(projectId),id(comparisonId));
  if(!comparison)return null;
  const resultArtifact=this.db.prepare(`SELECT * FROM cc_artifacts WHERE project_id=? AND artifact_id=?`)
   .get(projectId,comparison.result_artifact_id)??null;
  return {...comparison,result_artifact:resultArtifact?{...resultArtifact}:null};
 }

 createScript({project_id,script_id=this.nextId(),job_id,artifact,language,explanation,prerequisites='',expected_output_schema=''}={}){
  const created=this.now();
  return this.transaction(()=>{
   insertArtifact(this.db,{project_id,...artifact,artifact_kind:'SCRIPT'},created);
   this.db.prepare(`INSERT INTO cc_scripts(project_id,script_id,job_id,artifact_id,language,explanation,
    prerequisites,expected_output_schema,created_at_utc) VALUES(?,?,?,?,?,?,?,?,?)`).run(
      id(project_id),id(script_id),id(job_id),id(artifact.artifact_id),language,
      bounded(explanation,'MPC_WORKSPACE_SCRIPT_EXPLANATION_INVALID',{max:32768}),
      bounded(prerequisites,'MPC_WORKSPACE_SCRIPT_PREREQUISITES_INVALID',{max:32768}),
      bounded(expected_output_schema,'MPC_WORKSPACE_SCRIPT_OUTPUT_SCHEMA_INVALID',{max:32768}),created);
   insertJobArtifact(this.db,{project_id,job_id,artifact_id:artifact.artifact_id,artifact_role:'SCRIPT'});
   return this.getScript(project_id,script_id);
  });
 }

 markScriptExported(projectId,scriptId){
  this.db.prepare(`UPDATE cc_scripts SET script_state='EXPORTED_FOR_MANUAL_RUN',exported_at_utc=?
   WHERE project_id=? AND script_id=?`).run(this.now(),id(projectId),id(scriptId));
  if(this.db.prepare('SELECT changes() AS count').get().count!==1)fail('MPC_WORKSPACE_SCRIPT_NOT_FOUND');
  return this.getScript(projectId,scriptId);
 }

 getScript(projectId,scriptId){
  const script=this.db.prepare('SELECT * FROM cc_scripts WHERE project_id=? AND script_id=?').get(id(projectId),id(scriptId));
  if(!script)return null;
  return {...script,outputs:this.db.prepare(`SELECT * FROM cc_script_outputs WHERE project_id=? AND script_id=?
   ORDER BY observed_at_utc,output_id`).all(projectId,scriptId)};
 }

 findScriptOutput({project_id,script_id,content_sha256,supplied_host='',supplied_exit_status=null,
  execution_basis='USER_SUPPLIED_UNVERIFIED',local_receipt_id=null}={}){
  digest(content_sha256);
  const row=this.db.prepare(`SELECT output.*,source.content_sha256,artifact.artifact_sha256
   FROM cc_script_outputs output
   JOIN cc_sources source ON source.project_id=output.project_id AND source.source_id=output.source_id
   JOIN cc_artifacts artifact ON artifact.project_id=output.project_id AND artifact.artifact_id=output.artifact_id
   WHERE output.project_id=? AND output.script_id=? AND source.content_sha256=? AND output.supplied_host=?
     AND output.supplied_exit_status IS ? AND output.execution_basis=? AND output.local_receipt_id IS ?
   ORDER BY output.observed_at_utc,output.output_id LIMIT 1`).get(
    id(project_id),id(script_id),content_sha256,
    bounded(supplied_host,'MPC_WORKSPACE_SCRIPT_HOST_INVALID',{max:512}),
    integer(supplied_exit_status,'MPC_WORKSPACE_SCRIPT_EXIT_INVALID',{min:-2147483648,max:2147483647,nullable:true}),
    execution_basis,local_receipt_id);
  return row?{...row}:null;
 }

 ingestScriptOutput({project_id,script_id,output_id=this.nextId(),source,artifact,supplied_host='',
  supplied_exit_status=null,execution_basis='USER_SUPPLIED_UNVERIFIED',local_receipt_id=null}={}){
  const script=this.getScript(project_id,script_id);
  if(!script||script.script_state!=='EXPORTED_FOR_MANUAL_RUN')fail('MPC_WORKSPACE_SCRIPT_EXPORT_REQUIRED');
  const created=this.now();
  return this.transaction(()=>{
   const existing=this.findScriptOutput({project_id,script_id,content_sha256:source.content_sha256,
    supplied_host,supplied_exit_status,execution_basis,local_receipt_id});
   if(existing)return {...existing,reused:true};
   const conflicting=this.db.prepare(`SELECT 1 FROM cc_script_outputs WHERE project_id=? AND output_id=?`)
    .get(project_id,id(output_id));
   if(conflicting)fail('MPC_WORKSPACE_SCRIPT_OUTPUT_ID_CONFLICT',409);
   insertSource(this.db,{...source,project_id,acquisition_state:'ACQUIRED',acquired_at_utc:created});
   insertArtifact(this.db,{project_id,...artifact,artifact_kind:'SCRIPT_OUTPUT',source_id:source.source_id},created);
   this.db.prepare(`INSERT INTO cc_script_outputs(project_id,output_id,script_id,source_id,artifact_id,supplied_host,
    supplied_exit_status,execution_basis,local_receipt_id,observed_at_utc) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
      project_id,id(output_id),script_id,source.source_id,artifact.artifact_id,
      bounded(supplied_host,'MPC_WORKSPACE_SCRIPT_HOST_INVALID',{max:512}),
      integer(supplied_exit_status,'MPC_WORKSPACE_SCRIPT_EXIT_INVALID',{min:-2147483648,max:2147483647,nullable:true}),
      execution_basis,local_receipt_id,created);
   insertJobArtifact(this.db,{project_id,job_id:script.job_id,artifact_id:artifact.artifact_id,artifact_role:'SCRIPT_OUTPUT'});
   return {...this.getScript(project_id,script_id).outputs.at(-1),reused:false};
  });
 }

 recordModelRun(value){
  const created=this.now();
  this.db.prepare(`INSERT INTO cc_model_runs(project_id,model_run_id,job_id,connection_id,requested_provider,
   requested_model,requested_access_program,observed_provider,observed_model,observed_access_program,outcome,
   result_artifact_id,error_code,first_token_ms,elapsed_ms,created_at_utc) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id(value.project_id),id(value.model_run_id??this.nextId()),id(value.job_id),value.connection_id??null,
    bounded(value.requested_provider,'MPC_WORKSPACE_MODEL_PROVIDER_INVALID',{min:1,max:240}),
    bounded(value.requested_model,'MPC_WORKSPACE_MODEL_INVALID',{min:1,max:240}),value.requested_access_program??'',
    value.observed_provider??'',value.observed_model??'',value.observed_access_program??'',value.outcome,
    value.result_artifact_id??null,value.error_code??'',value.first_token_ms??null,value.elapsed_ms??null,created);
 }

 configureConnection(value){
  for(const forbidden of ['api_key','password','access_token','refresh_token','headers','credentials','secret'])
   if(Object.hasOwn(value,forbidden))fail('MPC_WORKSPACE_RAW_CREDENTIAL_REJECTED');
  assertNoStoredSecret(value.endpoint_ref);
  this.db.prepare(`INSERT INTO cc_connections(project_id,connection_id,display_name,provider_namespace,
   transport,endpoint_ref,secret_store_ref,enabled) VALUES(?,?,?,?,?,?,?,?)`).run(
    id(value.project_id),id(value.connection_id),bounded(value.display_name,'MPC_WORKSPACE_CONNECTION_NAME_INVALID',{min:1,max:240}),
    bounded(value.provider_namespace,'MPC_WORKSPACE_PROVIDER_NAMESPACE_INVALID',{min:1,max:128}),value.transport,
    bounded(value.endpoint_ref,'MPC_WORKSPACE_ENDPOINT_REF_INVALID',{min:1,max:2048}),
    value.secret_store_ref===null||value.secret_store_ref===undefined?null:
     bounded(value.secret_store_ref,'MPC_WORKSPACE_SECRET_REF_INVALID',{min:1,max:2048}),value.enabled?1:0);
  return this.getConnection(value.project_id,value.connection_id);
 }

 setConnectionEnabled(projectId,connectionId,enabled){
  if(typeof enabled!=='boolean')fail('MPC_WORKSPACE_CONNECTION_ENABLED_INVALID');
  const connection=this.getConnection(projectId,connectionId);
  if(!connection)fail('MPC_WORKSPACE_CONNECTION_NOT_FOUND',404);
  if(connection.enabled===enabled)return {...connection,reused:true};
  // A used configuration is immutable because its exact identity is bound to
  // receipts. Toggle it by creating a new local configuration version while
  // preserving the prior row and every receipt unchanged.
  const used=this.db.prepare(`SELECT 1 FROM cc_operation_receipts WHERE project_id=? AND connection_id=?
   UNION ALL SELECT 1 FROM cc_outbox WHERE project_id=? AND connection_id=? LIMIT 1`).get(
    projectId,connectionId,projectId,connectionId);
  if(used){
   const existingVersion=this.db.prepare(`SELECT connection_id FROM cc_connections WHERE project_id=?
    AND connection_id<>? AND display_name=? AND provider_namespace=? AND transport=? AND endpoint_ref=?
    AND secret_store_ref IS ? AND enabled=? ORDER BY connection_id DESC LIMIT 1`).get(
     projectId,connectionId,connection.display_name,connection.provider_namespace,connection.transport,
     connection.endpoint_ref,connection.secret_store_ref,enabled?1:0);
   if(existingVersion)return {...this.getConnection(projectId,existingVersion.connection_id),reused:true,
    supersedes_connection_id:connectionId,versioned:true};
   const versionId=`${connectionId.slice(0,180)}-STATE-${sha256(`${this.now()}\n${this.nextId()}\n${enabled}`).slice(0,24)}`;
   this.db.prepare(`INSERT INTO cc_connections(project_id,connection_id,display_name,provider_namespace,
    transport,endpoint_ref,secret_store_ref,enabled) VALUES(?,?,?,?,?,?,?,?)`).run(
     projectId,versionId,connection.display_name,connection.provider_namespace,connection.transport,
     connection.endpoint_ref,connection.secret_store_ref,enabled?1:0);
   return {...this.getConnection(projectId,versionId),reused:false,
    supersedes_connection_id:connectionId,versioned:true};
  }
  this.db.prepare('UPDATE cc_connections SET enabled=? WHERE project_id=? AND connection_id=?')
   .run(enabled?1:0,id(projectId),id(connectionId));
  return {...this.getConnection(projectId,connectionId),reused:false};
 }

 getConnection(projectId,connectionId){
  const connection=this.db.prepare('SELECT * FROM cc_connections WHERE project_id=? AND connection_id=?')
   .get(id(projectId),id(connectionId));
  if(!connection)return null;
  const observation=this.db.prepare(`SELECT * FROM cc_connection_observations WHERE project_id=? AND connection_id=?
   ORDER BY observed_at_utc DESC,observation_id DESC LIMIT 1`).get(projectId,connectionId)??null;
  const lastSuccess=this.db.prepare(`SELECT * FROM cc_connection_observations WHERE project_id=? AND connection_id=?
   AND observation_state='SUCCEEDED' AND operation_receipt_id IS NOT NULL
   ORDER BY observed_at_utc DESC,observation_id DESC LIMIT 1`).get(projectId,connectionId)??null;
  return {...connection,enabled:Boolean(connection.enabled),latest_observation:observation?{...observation}:null,
   last_success:lastSuccess?{...lastSuccess}:null};
 }

 listConnections(projectId,limit=100){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:500});
  return this.db.prepare(`SELECT connection_id FROM cc_connections WHERE project_id=?
   ORDER BY display_name,connection_id LIMIT ?`).all(id(projectId),limit)
   .map(row=>this.getConnection(projectId,row.connection_id));
 }

 recordOperationReceipt(value){
  const nativeRef=value.native_receipt_ref??null;
  if(nativeRef!==null){bounded(nativeRef,'MPC_WORKSPACE_NATIVE_RECEIPT_REF_INVALID',{min:1,max:4096});assertNoStoredSecret(nativeRef)}
  this.db.prepare(`INSERT INTO cc_operation_receipts(project_id,receipt_id,job_id,connection_id,subject_source_id,
   operation_kind,operation_status,receipt_origin,native_receipt_ref,receipt_sha256,observed_at_utc)
   VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
    id(value.project_id),id(value.receipt_id),id(value.job_id),id(value.connection_id),value.subject_source_id??null,
    value.operation_kind,value.operation_status,value.receipt_origin,nativeRef,digest(value.receipt_sha256),this.now());
  return {...this.db.prepare('SELECT * FROM cc_operation_receipts WHERE project_id=? AND receipt_id=?')
   .get(value.project_id,value.receipt_id)};
 }

 recordConnectionObservation(value){
  this.db.prepare(`INSERT INTO cc_connection_observations(project_id,observation_id,connection_id,job_id,
   provider_surface,host_id,account_id,operation_name,observation_state,operation_receipt_id,error_code,observed_at_utc)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id(value.project_id),id(value.observation_id??this.nextId()),id(value.connection_id),id(value.job_id),
    bounded(value.provider_surface,'MPC_WORKSPACE_PROVIDER_SURFACE_INVALID',{min:1,max:240}),
    bounded(value.host_id,'MPC_WORKSPACE_CONNECTION_HOST_INVALID',{min:1,max:512}),
    bounded(value.account_id,'MPC_WORKSPACE_CONNECTION_ACCOUNT_INVALID',{min:1,max:512}),
    bounded(value.operation_name,'MPC_WORKSPACE_OPERATION_INVALID',{min:1,max:240}),value.observation_state,
    value.operation_receipt_id??null,bounded(value.error_code??'','MPC_WORKSPACE_CONNECTION_ERROR_INVALID',{max:512}),this.now());
  return this.getConnection(value.project_id,value.connection_id).latest_observation;
 }

 queueOutbox({project_id,outbox_id=this.nextId(),report_id,job_id,connection_id,delivery_kind,
  outbox_state='QUEUED'}={}){
  if(!['DRAFT','QUEUED'].includes(outbox_state))fail('MPC_WORKSPACE_OUTBOX_INITIAL_STATE_INVALID');
  this.db.prepare(`INSERT INTO cc_outbox(project_id,outbox_id,report_id,job_id,connection_id,delivery_kind,outbox_state)
   VALUES(?,?,?,?,?,?,?)`).run(id(project_id),id(outbox_id),id(report_id),id(job_id),id(connection_id),delivery_kind,outbox_state);
  return this.getOutbox(project_id,outbox_id);
 }

 getOutbox(projectId,outboxId){
  const row=this.db.prepare('SELECT * FROM cc_outbox WHERE project_id=? AND outbox_id=?').get(id(projectId),id(outboxId));
  return row?{...row}:null;
 }

 updateOutbox(projectId,outboxId,{outbox_state,operation_receipt_id=null}={}){
  const current=this.getOutbox(projectId,outboxId);
  if(!current)fail('MPC_WORKSPACE_OUTBOX_NOT_FOUND');
  const allowed={
   DRAFT:new Set(['QUEUED','CANCELLED']),QUEUED:new Set(['IN_FLIGHT','FAILED','CANCELLED']),
   IN_FLIGHT:new Set(['UNKNOWN_DELIVERY','SENT','FAILED','CANCELLED']),
   UNKNOWN_DELIVERY:new Set(['SENT','FAILED']),FAILED:new Set(),CANCELLED:new Set(),SENT:new Set()
  };
  if(!allowed[current.outbox_state]?.has(outbox_state))fail('MPC_WORKSPACE_OUTBOX_TRANSITION_INVALID');
  this.db.prepare(`UPDATE cc_outbox SET outbox_state=?,operation_receipt_id=?,sent_at_utc=?
   WHERE project_id=? AND outbox_id=?`).run(outbox_state,operation_receipt_id,
    outbox_state==='SENT'?this.now():null,projectId,outboxId);
  return this.getOutbox(projectId,outboxId);
 }

 listOutbox(projectId,limit=100){
  integer(limit,'MPC_WORKSPACE_LIST_LIMIT_INVALID',{min:1,max:500});
  return this.db.prepare(`SELECT * FROM cc_outbox WHERE project_id=? ORDER BY outbox_id LIMIT ?`)
   .all(id(projectId),limit).map(row=>({...row}));
 }

 status(){
  assertStore(this.db);
  return {
   format_version:MPC_WORKSPACE_STORE_VERSION,schema_version:MPC_WORKSPACE_SCHEMA_VERSION,
   schema_sha256:schemaFingerprint(this.db),database_path:this.databasePath,
   project_count:this.db.prepare('SELECT count(*) AS count FROM cc_projects').get().count,
   open_job_count:this.db.prepare(`SELECT count(*) AS count FROM cc_job_state
    WHERE job_state NOT IN ('SUCCEEDED','FAILED','CANCELLED')`).get().count,
   integrity:'ok'
  };
 }

 async backupTo(destination){
  const target=resolveMpcWorkspaceDatabasePath({databasePath:destination});
  if(existsSync(target)&&lstatSync(target).size>0)fail('MPC_WORKSPACE_BACKUP_TARGET_EXISTS');
  await sqliteBackup(this.db,target);
  restrictDatabaseFiles(target);
  return {path:target,sha256:sha256(readFileSync(target)),bytes:lstatSync(target).size};
 }

 close(){this.db.close()}
}

function snapshotEntryValues(entry){
 return [
  id(entry.entry_id),entry.entry_kind,
  bounded(entry.native_owner,'MPC_WORKSPACE_SNAPSHOT_IDENTITY_INVALID',{min:1,max:512}),
  bounded(entry.native_namespace,'MPC_WORKSPACE_SNAPSHOT_IDENTITY_INVALID',{min:1,max:128}),
  bounded(entry.native_id_type,'MPC_WORKSPACE_SNAPSHOT_IDENTITY_INVALID',{min:1,max:128}),
  bounded(entry.native_id,'MPC_WORKSPACE_SNAPSHOT_IDENTITY_INVALID',{min:1,max:2048}),
  bounded(entry.native_version??'','MPC_WORKSPACE_SNAPSHOT_VERSION_INVALID',{max:512}),
  entry.content_sha256?digest(entry.content_sha256):'',
  bounded(entry.relative_locator,'MPC_WORKSPACE_SNAPSHOT_LOCATOR_INVALID',{min:1,max:4096}),entry.availability,
  entry.alias_target_entry_id??null
 ];
}
