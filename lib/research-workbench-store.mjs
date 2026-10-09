import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {chmodSync,closeSync,lstatSync,mkdirSync,openSync,readSync} from 'node:fs';
import {dirname,extname,join,parse,resolve,sep} from 'node:path';

export const WORKBENCH_STORE_VERSION='MPC_RESEARCH_WORKBENCH_STORE_1.0';
export const WORKBENCH_STORE_LIMITS=Object.freeze({
 query_utf8_bytes:8192,
 input_utf8_bytes:262144,
 result_json_bytes:524288,
 queue_packet_json_bytes:524288,
 queue_artifact_bytes:524288,
 list_rows:100
});
export const RUN_KINDS=Object.freeze([
 'LOCAL_HOOK_DISCOVERY',
 'METHOD_CROSS_REFERENCE',
 'TEXT_ANALYSIS',
 'DATA_ANALYSIS',
 'METHOD_INTEGRITY_REVIEW'
]);
export const QUEUE_PROVIDERS=Object.freeze([
 'GOOGLE_DRIVE',
 'GITHUB',
 'GMAIL',
 'DROPBOX',
 'DROPBOX_DASH',
 'MPC_MACHINE_LEGAL',
 'MPC_BUGTOOLS',
 'SCITE',
 'PARALLEL_SEARCH',
 'TVBRAIN',
 'CUSTOM_GPT_OR_AI_HOST',
 'LOCAL_MODEL_HOST'
]);
export const QUEUE_ACTIONS=Object.freeze([
 'CREATE_NEW',
 'CREATE_DRAFT',
 'CREATE_NEW_BRANCH_ARTIFACT',
 'REQUEST_ANALYSIS',
 'REQUEST_SEARCH'
]);
const PROVIDER_ACTIONS=Object.freeze({
 GOOGLE_DRIVE:new Set(['CREATE_NEW']),
 GITHUB:new Set(['CREATE_NEW_BRANCH_ARTIFACT']),
 GMAIL:new Set(['CREATE_DRAFT']),
 DROPBOX:new Set(['CREATE_NEW']),
 DROPBOX_DASH:new Set(['REQUEST_SEARCH']),
 MPC_MACHINE_LEGAL:new Set(['REQUEST_ANALYSIS']),
 MPC_BUGTOOLS:new Set(['REQUEST_ANALYSIS']),
 SCITE:new Set(['REQUEST_SEARCH']),
 PARALLEL_SEARCH:new Set(['REQUEST_SEARCH']),
 TVBRAIN:new Set(['REQUEST_ANALYSIS']),
 CUSTOM_GPT_OR_AI_HOST:new Set(['REQUEST_ANALYSIS']),
 LOCAL_MODEL_HOST:new Set(['REQUEST_ANALYSIS'])
});
const PROVIDER_DESTINATIONS=Object.freeze({
 GOOGLE_DRIVE:new Set(['CREATE_NEW']),
 GITHUB:new Set(['NEW_BRANCH_ONLY']),
 GMAIL:new Set(['DRAFT_ONLY']),
 DROPBOX:new Set(['CREATE_NEW']),
 DROPBOX_DASH:new Set(['ANALYSIS_REQUEST_ONLY']),
 MPC_MACHINE_LEGAL:new Set(['ANALYSIS_REQUEST_ONLY']),
 MPC_BUGTOOLS:new Set(['ANALYSIS_REQUEST_ONLY']),
 SCITE:new Set(['ANALYSIS_REQUEST_ONLY']),
 PARALLEL_SEARCH:new Set(['ANALYSIS_REQUEST_ONLY']),
 TVBRAIN:new Set(['ANALYSIS_REQUEST_ONLY']),
 CUSTOM_GPT_OR_AI_HOST:new Set(['ANALYSIS_REQUEST_ONLY']),
 LOCAL_MODEL_HOST:new Set(['ANALYSIS_REQUEST_ONLY'])
});

const DATABASE_EXTENSIONS=new Set(['.db','.sqlite','.sqlite3']);
const FORBIDDEN_KEYS=new Set([
 '__proto__','prototype','constructor','authorization','proxy-authorization','cookie','set-cookie',
 'password','passwd','private_key','client_secret','api_key','apikey','access_key','secret_key',
 'access_token','refresh_token','id_token','oauth_token','session_token','csrf_token','bearer_token','credential','credentials',
 'token','secret','auth_header','authorization_header'
]);
const SECRET_PATTERNS=[
 /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/iu,
 /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/iu,
 /\bBasic\s+[A-Za-z0-9+/]{12,}={0,2}/iu,
 /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u,
 /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/u,
 /\b(?:glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{30,})\b/u,
 /\bya29\.[A-Za-z0-9._~-]{20,}\b/u,
 /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/u,
 /\bAKIA[A-Z0-9]{16}\b/u,
 /\bAWS_SECRET_ACCESS_KEY\s*[:=]\s*["']?[A-Za-z0-9/+=]{32,}/iu,
 /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
 /(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|password)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}/iu
];
const RUN_KEYS=new Set(['kind','query','input','store_input','method_ids','result']);
const QUEUE_KEYS=new Set(['provider','action','label','payload']);
const QUEUE_PAYLOAD_KEYS=new Set([
 'run_id','artifact_name','artifact_sha256','artifact_bytes','media_type','destination_hint','content'
]);
const DESTINATION_HINTS=new Set(['CREATE_NEW','DRAFT_ONLY','NEW_BRANCH_ONLY','ANALYSIS_REQUEST_ONLY']);
const QUEUE_CONTENT_ENVELOPE_KEYS=new Set([
 'state','host_action_called','host_action_performed','write_performed','provider_receipt','provider_receipt_json',
 'dispatch_status','sent_at','sent_at_utc'
]);
const PROTECTED_FALSE_KEYS=new Set([
 'host_action_called','host_action_performed','write_performed','provider_action_performed','external_networking',
 'source_authentication','method_execution_performed','independent_evidence_proven','equivalence_proven',
 'corroboration_proven','canonical_promotion','canonical_records_modified'
]);
const PROTECTED_NULL_KEYS=new Set(['provider_receipt','provider_receipt_json','protected_call_receipt']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UTF8=value=>Buffer.byteLength(value,'utf8');
const normalizedKey=key=>key.replace(/([a-z0-9])([A-Z])/gu,'$1_$2').toLowerCase().replace(/[^a-z0-9]+/gu,'_').replace(/^_|_$/gu,'');
const UNSAFE_CONTROLS=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const WORKBENCH_SCHEMA_SQL=`CREATE TABLE IF NOT EXISTS workbench_meta(
 key TEXT PRIMARY KEY NOT NULL,
 value TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS workbench_runs(
 run_id TEXT PRIMARY KEY NOT NULL,
 created_at_utc TEXT NOT NULL,
 kind TEXT NOT NULL,
 store_input INTEGER NOT NULL CHECK(store_input IN (0,1)),
 query_sha256 TEXT NOT NULL CHECK(length(query_sha256)=64),
 query_bytes INTEGER NOT NULL CHECK(query_bytes>=0),
 query_profile_json TEXT NOT NULL CHECK(json_valid(query_profile_json)),
 query_text TEXT,
 input_sha256 TEXT NOT NULL CHECK(length(input_sha256)=64),
 input_bytes INTEGER NOT NULL CHECK(input_bytes>=0),
 input_profile_json TEXT NOT NULL CHECK(json_valid(input_profile_json)),
 input_text TEXT,
 method_ids_json TEXT NOT NULL CHECK(json_valid(method_ids_json)),
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 boundaries_json TEXT NOT NULL CHECK(json_valid(boundaries_json)),
 CHECK((store_input=1 AND query_text IS NOT NULL AND input_text IS NOT NULL) OR
       (store_input=0 AND query_text IS NULL AND input_text IS NULL))
) STRICT;
CREATE INDEX IF NOT EXISTS workbench_runs_created ON workbench_runs(created_at_utc DESC,run_id DESC);
CREATE TABLE IF NOT EXISTS workbench_queue(
 request_id TEXT PRIMARY KEY NOT NULL,
 created_at_utc TEXT NOT NULL,
 provider TEXT NOT NULL,
 action TEXT NOT NULL,
 label TEXT NOT NULL,
 run_id TEXT REFERENCES workbench_runs(run_id),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 state TEXT NOT NULL CHECK(state='NOT_SENT'),
 host_action_performed INTEGER NOT NULL CHECK(host_action_performed=0),
 write_performed INTEGER NOT NULL CHECK(write_performed=0),
 provider_receipt_json TEXT CHECK(provider_receipt_json IS NULL)
) STRICT;
CREATE INDEX IF NOT EXISTS workbench_queue_created ON workbench_queue(created_at_utc DESC,request_id DESC);`;

function forbiddenKey(key){
 const lower=key.toLowerCase(),normalized=normalizedKey(key);
 if(FORBIDDEN_KEYS.has(lower)||FORBIDDEN_KEYS.has(normalized))return true;
 if(/(?:^|_)(?:password|passwd|client_secret|private_key|api_key|secret_key|access_key|authorization|cookie|credentials?)(?:_|$)/u.test(normalized))return true;
 return /(?:^|_)(?:access|refresh|oauth|session|auth|id|csrf|bearer)_?token(?:_|$)/u.test(normalized);
}

function fail(code){
 const error=Error(code);
 error.code=code;
 throw error;
}

function isPlainObject(value){
 if(value===null||typeof value!=='object'||Array.isArray(value))return false;
 const prototype=Object.getPrototypeOf(value);
 return prototype===Object.prototype||prototype===null;
}

function exactKeys(value,allowed,code){
 if(!isPlainObject(value))fail(code);
 for(const key of Object.keys(value))if(!allowed.has(key))fail(code);
}

function boundedString(value,{code,min=0,max}){
 if(typeof value!=='string'||UTF8(value)<min||UTF8(value)>max||UNSAFE_CONTROLS.test(value))fail(code);
 return value;
}

function inspectJson(value,{depth=0,budget={nodes:0},maxDepth=10,maxNodes=12000,maxStringBytes=524288}={}){
 budget.nodes++;
 if(budget.nodes>maxNodes||depth>maxDepth)fail('WORKBENCH_JSON_COMPLEXITY_LIMIT');
 if(value===null||typeof value==='boolean')return;
 if(typeof value==='number'){
  if(!Number.isFinite(value))fail('WORKBENCH_JSON_NUMBER_INVALID');
  return;
 }
 if(typeof value==='string'){
  if(UTF8(value)>maxStringBytes)fail('WORKBENCH_JSON_STRING_TOO_LARGE');
  if(UNSAFE_CONTROLS.test(value))fail('WORKBENCH_JSON_CONTROL_CHARACTER_REJECTED');
  return;
 }
 if(Array.isArray(value)){
  if(value.length>2048)fail('WORKBENCH_JSON_ARRAY_TOO_LARGE');
  for(const item of value)inspectJson(item,{depth:depth+1,budget,maxDepth,maxNodes,maxStringBytes});
  return;
 }
 if(!isPlainObject(value))fail('WORKBENCH_JSON_OBJECT_REQUIRED');
 const entries=Object.entries(value);
 if(entries.length>2048)fail('WORKBENCH_JSON_OBJECT_TOO_LARGE');
 for(const [key,item] of entries){
  if(forbiddenKey(key))fail('WORKBENCH_SECRET_MATERIAL_REJECTED');
  if(UTF8(key)>128)fail('WORKBENCH_JSON_KEY_TOO_LARGE');
  inspectJson(item,{depth:depth+1,budget,maxDepth,maxNodes,maxStringBytes});
 }
}

export function assertNoSecretMaterial(value){
 const visit=(item,key='')=>{
  if(forbiddenKey(key))fail('WORKBENCH_SECRET_MATERIAL_REJECTED');
  if(typeof item==='string'){
   for(const pattern of SECRET_PATTERNS)if(pattern.test(item))fail('WORKBENCH_SECRET_MATERIAL_REJECTED');
   return;
  }
  if(Array.isArray(item)){for(const child of item)visit(child);return}
  if(isPlainObject(item))for(const [childKey,child] of Object.entries(item))visit(child,childKey);
 };
 visit(value);
}

function assertSerializedLimit(value,max,code){
 const serialized=JSON.stringify(value);
 if(UTF8(serialized)>max)fail(code);
 return serialized;
}

function profileText(value){
 const trimmed=value.trim();
 let format_hint='TEXT';
 if(trimmed&&(trimmed.startsWith('{')||trimmed.startsWith('['))){
  try{JSON.parse(trimmed);format_hint='JSON'}catch{}
 }else if(value.includes('\t'))format_hint='TSV_LIKE';
 else if(value.includes(',')&&value.includes('\n'))format_hint='CSV_LIKE';
 return {
  utf8_bytes:UTF8(value),
  character_count:[...value].length,
  line_count:value===''?0:value.split(/\r\n|\r|\n/u).length,
  word_count:trimmed===''?0:trimmed.split(/\s+/u).length,
  format_hint
 };
}

function assertNoProtectedClaims(value,{forbidTopLevelState=false}={}){
 const visit=(item,depth=0)=>{
  if(Array.isArray(item)){for(const child of item)visit(child,depth+1);return}
  if(!isPlainObject(item))return;
  for(const [key,child] of Object.entries(item)){
   const normalized=normalizedKey(key);
   if(forbidTopLevelState&&QUEUE_CONTENT_ENVELOPE_KEYS.has(normalized))fail('WORKBENCH_PROTECTED_CLAIM_REJECTED');
   if(PROTECTED_FALSE_KEYS.has(normalized)&&child!==false)fail('WORKBENCH_PROTECTED_CLAIM_REJECTED');
   if(PROTECTED_NULL_KEYS.has(normalized)&&child!==null)fail('WORKBENCH_PROTECTED_CLAIM_REJECTED');
   visit(child,depth+1);
  }
 };
 visit(value);
}

const sha256=value=>createHash('sha256').update(value,'utf8').digest('hex');

function workbenchSchemaFingerprint(db){
 const rows=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name,tbl_name").all();
 return sha256(JSON.stringify(rows.map(row=>[row.type,row.name,row.tbl_name,row.sql])));
}

let expectedSchemaFingerprint;
function getExpectedSchemaFingerprint(){
 if(expectedSchemaFingerprint!==undefined)return expectedSchemaFingerprint;
 const expected=new DatabaseSync(':memory:',{allowExtension:false});
 try{
  expected.exec(WORKBENCH_SCHEMA_SQL);
  expectedSchemaFingerprint=workbenchSchemaFingerprint(expected);
 }finally{expected.close()}
 return expectedSchemaFingerprint;
}

function assertStoreInvariants(db,{deep=false}={}){
 if(workbenchSchemaFingerprint(db)!==getExpectedSchemaFingerprint())fail('WORKBENCH_SCHEMA_IDENTITY_MISMATCH');
 const check=db.prepare('PRAGMA quick_check').all();
 if(check.length!==1||check[0].quick_check!=='ok')fail('WORKBENCH_DATABASE_INTEGRITY_FAILED');
 if(db.prepare('PRAGMA foreign_key_check').all().length!==0)fail('WORKBENCH_DATABASE_INTEGRITY_FAILED');
 const invalidRuns=db.prepare(`SELECT COUNT(*) AS count FROM workbench_runs WHERE
  store_input NOT IN (0,1) OR
  (store_input=1 AND (query_text IS NULL OR input_text IS NULL)) OR
  (store_input=0 AND (query_text IS NOT NULL OR input_text IS NOT NULL)) OR
  NOT json_valid(query_profile_json) OR NOT json_valid(input_profile_json) OR
  NOT json_valid(method_ids_json) OR NOT json_valid(result_json) OR NOT json_valid(boundaries_json)`).get().count;
 const invalidQueue=db.prepare(`SELECT COUNT(*) AS count FROM workbench_queue WHERE
  state<>'NOT_SENT' OR host_action_performed<>0 OR write_performed<>0 OR provider_receipt_json IS NOT NULL OR
  NOT json_valid(payload_json)`).get().count;
 if(invalidRuns!==0||invalidQueue!==0)fail('WORKBENCH_STORE_INVARIANT_FAILED');
 if(!deep)return;
 for(const row of db.prepare('SELECT * FROM workbench_runs').iterate()){
  if(!RUN_KINDS.includes(row.kind))fail('WORKBENCH_STORE_INVARIANT_FAILED');
  const methods=parseJson(row.method_ids_json),result=parseJson(row.result_json),boundaries=parseJson(row.boundaries_json);
  if(!Array.isArray(methods)||methods.length>64||methods.some(value=>typeof value!=='string'||!/^[A-Z][A-Z0-9._:-]{1,63}$/u.test(value)))fail('WORKBENCH_STORE_INVARIANT_FAILED');
  inspectJson(result);assertNoSecretMaterial(result);assertNoProtectedClaims(result,{forbidTopLevelState:true});
  if(row.store_input===1)assertNoSecretMaterial({query:row.query_text,input:row.input_text});
  if(!isPlainObject(boundaries)||boundaries.source_authentication!==false||boundaries.external_networking!==false||
   boundaries.provider_action_performed!==false||boundaries.canonical_records_modified!==false||
   boundaries.raw_input_stored!==Boolean(row.store_input)||boundaries.client_result_content_stored!==Boolean(row.store_input))fail('WORKBENCH_STORE_INVARIANT_FAILED');
 }
 for(const row of db.prepare('SELECT * FROM workbench_queue').iterate()){
  const payload=parseJson(row.payload_json);
  validateQueueRequest({provider:row.provider,action:row.action,label:row.label,payload});
  if(row.run_id!==payload.run_id)fail('WORKBENCH_STORE_INVARIANT_FAILED');
 }
}

export function validateRunRequest(value){
 exactKeys(value,RUN_KEYS,'WORKBENCH_RUN_SCHEMA_INVALID');
 for(const key of RUN_KEYS)if(!Object.hasOwn(value,key))fail('WORKBENCH_RUN_SCHEMA_INVALID');
 if(!RUN_KINDS.includes(value.kind))fail('WORKBENCH_RUN_KIND_INVALID');
 const query=boundedString(value.query,{code:'WORKBENCH_QUERY_INVALID',max:WORKBENCH_STORE_LIMITS.query_utf8_bytes});
 const input=boundedString(value.input,{code:'WORKBENCH_INPUT_INVALID',max:WORKBENCH_STORE_LIMITS.input_utf8_bytes});
 if(query.trim()===''&&input.trim()==='')fail('WORKBENCH_QUERY_AND_INPUT_EMPTY');
 if(typeof value.store_input!=='boolean')fail('WORKBENCH_STORE_INPUT_INVALID');
 if(!Array.isArray(value.method_ids)||value.method_ids.length>64)fail('WORKBENCH_METHOD_IDS_INVALID');
 const methodIds=[];
 for(const methodId of value.method_ids){
  if(typeof methodId!=='string'||!/^[A-Z][A-Z0-9._:-]{1,63}$/u.test(methodId))fail('WORKBENCH_METHOD_IDS_INVALID');
  if(!methodIds.includes(methodId))methodIds.push(methodId);
 }
 if(!isPlainObject(value.result))fail('WORKBENCH_RESULT_INVALID');
 inspectJson(value.result);
 assertNoProtectedClaims(value.result,{forbidTopLevelState:true});
 assertNoSecretMaterial(value);
 const suppliedResultJson=assertSerializedLimit(value.result,WORKBENCH_STORE_LIMITS.result_json_bytes,'WORKBENCH_RESULT_TOO_LARGE');
 const storedResult=value.store_input?value.result:{
  status:'CLIENT_RESULT_CONTENT_NOT_RETAINED',
  supplied_result_sha256:sha256(suppliedResultJson),
  supplied_result_bytes:UTF8(suppliedResultJson)
 };
 return {kind:value.kind,query,input,store_input:value.store_input,method_ids:methodIds,result:storedResult,result_json:JSON.stringify(storedResult)};
}

export function validateQueueRequest(value){
 exactKeys(value,QUEUE_KEYS,'WORKBENCH_QUEUE_SCHEMA_INVALID');
 for(const key of QUEUE_KEYS)if(!Object.hasOwn(value,key))fail('WORKBENCH_QUEUE_SCHEMA_INVALID');
 if(!QUEUE_PROVIDERS.includes(value.provider))fail('WORKBENCH_QUEUE_PROVIDER_INVALID');
 if(!QUEUE_ACTIONS.includes(value.action))fail('WORKBENCH_QUEUE_ACTION_INVALID');
 if(!PROVIDER_ACTIONS[value.provider]?.has(value.action))fail('WORKBENCH_QUEUE_PROVIDER_ACTION_INVALID');
 const label=boundedString(value.label,{code:'WORKBENCH_QUEUE_LABEL_INVALID',min:1,max:160});
 exactKeys(value.payload,QUEUE_PAYLOAD_KEYS,'WORKBENCH_QUEUE_PAYLOAD_INVALID');
 for(const key of QUEUE_PAYLOAD_KEYS)if(!Object.hasOwn(value.payload,key))fail('WORKBENCH_QUEUE_PAYLOAD_INVALID');
 const payload=value.payload;
 if(payload.run_id!==null&&(typeof payload.run_id!=='string'||!UUID.test(payload.run_id)))fail('WORKBENCH_QUEUE_RUN_ID_INVALID');
 boundedString(payload.artifact_name,{code:'WORKBENCH_QUEUE_ARTIFACT_NAME_INVALID',min:1,max:180});
 if(!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,179}\.json$/u.test(payload.artifact_name)||payload.artifact_name.includes('..'))fail('WORKBENCH_QUEUE_ARTIFACT_NAME_INVALID');
 if(!/^[a-f0-9]{64}$/u.test(payload.artifact_sha256))fail('WORKBENCH_QUEUE_ARTIFACT_HASH_INVALID');
 if(!Number.isSafeInteger(payload.artifact_bytes)||payload.artifact_bytes<0||payload.artifact_bytes>WORKBENCH_STORE_LIMITS.queue_artifact_bytes)fail('WORKBENCH_QUEUE_ARTIFACT_BYTES_INVALID');
 if(payload.media_type!=='application/json')fail('WORKBENCH_QUEUE_MEDIA_TYPE_INVALID');
 if(!DESTINATION_HINTS.has(payload.destination_hint))fail('WORKBENCH_QUEUE_DESTINATION_INVALID');
 if(!PROVIDER_DESTINATIONS[value.provider]?.has(payload.destination_hint))fail('WORKBENCH_QUEUE_PROVIDER_DESTINATION_INVALID');
 if(!isPlainObject(payload.content))fail('WORKBENCH_QUEUE_CONTENT_INVALID');
 for(const key of Object.keys(payload.content))if(QUEUE_CONTENT_ENVELOPE_KEYS.has(normalizedKey(key)))fail('WORKBENCH_QUEUE_CONTENT_ENVELOPE_REJECTED');
 assertNoProtectedClaims(payload.content,{forbidTopLevelState:true});
 if(Object.hasOwn(payload.content,'run_id')&&payload.content.run_id!==payload.run_id)fail('WORKBENCH_QUEUE_RUN_ID_MISMATCH');
 inspectJson(payload.content,{maxStringBytes:262144});
 assertNoSecretMaterial(value);
 const payloadJson=assertSerializedLimit(payload,WORKBENCH_STORE_LIMITS.queue_packet_json_bytes,'WORKBENCH_QUEUE_PAYLOAD_TOO_LARGE');
 const artifact=JSON.stringify(payload.content,null,2)+'\n';
 if(UTF8(artifact)!==payload.artifact_bytes)fail('WORKBENCH_QUEUE_ARTIFACT_SIZE_MISMATCH');
 if(sha256(artifact)!==payload.artifact_sha256)fail('WORKBENCH_QUEUE_ARTIFACT_HASH_MISMATCH');
 return {provider:value.provider,action:value.action,label,payload,payload_json:payloadJson};
}

function assertNoSymlinkComponents(path){
 const absolute=resolve(path),root=parse(absolute).root;
 let cursor=root;
 const remainder=absolute.slice(root.length).split(sep).filter(Boolean);
 for(const component of remainder){
  cursor=join(cursor,component);
  const entry=lstatIfPresent(cursor);
  if(entry===null)break;
  if(entry.isSymbolicLink())fail('WORKBENCH_DATABASE_SYMLINK_REJECTED');
 }
}

function lstatIfPresent(path){
 try{return lstatSync(path)}catch(error){
  if(error?.code==='ENOENT')return null;
  throw error;
 }
}

function assertDatabaseCandidate(path){
 if(!DATABASE_EXTENSIONS.has(extname(path).toLowerCase()))fail('WORKBENCH_DATABASE_EXTENSION_REJECTED');
 assertNoSymlinkComponents(path);
 for(const suffix of ['-wal','-shm','-journal']){
  const sidecar=path+suffix;
  const sidecarEntry=lstatIfPresent(sidecar);
  if(sidecarEntry===null)continue;
  if(sidecarEntry.isSymbolicLink())fail('WORKBENCH_DATABASE_SYMLINK_REJECTED');
  if(!sidecarEntry.isFile())fail('WORKBENCH_DATABASE_NONFILE_REJECTED');
 }
 const entry=lstatIfPresent(path);
 if(entry===null)return;
 if(!entry.isFile())fail('WORKBENCH_DATABASE_NONFILE_REJECTED');
 if(entry.size===0)return;
 const descriptor=openSync(path,'r');
  const header=Buffer.alloc(16);
  let bytesRead;
  try{bytesRead=readSync(descriptor,header,0,16,0)}finally{closeSync(descriptor)}
  if(bytesRead!==16)fail('WORKBENCH_DATABASE_NOT_SQLITE');
 if(header.subarray(0,16).toString('binary')!=='SQLite format 3\u0000')fail('WORKBENCH_DATABASE_NOT_SQLITE');
}

function restrictDatabaseFiles(path){
 for(const candidate of [path,path+'-wal',path+'-shm']){
  const entry=lstatIfPresent(candidate);
  if(entry===null||entry.isSymbolicLink()||!entry.isFile())continue;
  try{chmodSync(candidate,0o600)}catch{}
 }
}

export function resolveWorkbenchDatabasePath({bundleRoot,databasePath,platform=process.platform,env=process.env,namespace}={}){
 const root=resolve(bundleRoot??process.cwd());
 let selected;
 if(databasePath!==undefined){
  if(typeof databasePath!=='string'||databasePath.trim()===''||databasePath.includes('\u0000'))fail('WORKBENCH_DATABASE_PATH_INVALID');
  if(/^(?:file|https?|sqlite):/iu.test(databasePath)||databasePath.startsWith('\\\\')||databasePath.startsWith('//'))fail('WORKBENCH_DATABASE_PATH_INVALID');
  selected=resolve(databasePath);
 }else if(platform==='win32'){
  if(typeof env.LOCALAPPDATA!=='string'||env.LOCALAPPDATA.trim()==='')fail('WORKBENCH_LOCALAPPDATA_REQUIRED');
  if(/^(?:file|https?|sqlite):/iu.test(env.LOCALAPPDATA)||env.LOCALAPPDATA.startsWith('\\\\')||env.LOCALAPPDATA.startsWith('//'))fail('WORKBENCH_LOCALAPPDATA_INVALID');
  if(namespace!==undefined&&(typeof namespace!=='string'||!/^[a-f0-9]{16}$/u.test(namespace)))fail('WORKBENCH_DATABASE_NAMESPACE_INVALID');
  selected=resolve(env.LOCALAPPDATA,'MPC Research Workbench',namespace??'default','research-workbench.sqlite');
 }else selected=join(root,'.wrangler','research-workbench','research-workbench.sqlite');
 assertDatabaseCandidate(selected);
 const parent=dirname(selected);
 assertNoSymlinkComponents(parent);
 mkdirSync(parent,{recursive:true,mode:0o700});
 assertNoSymlinkComponents(parent);
 if(!lstatSync(parent).isDirectory())fail('WORKBENCH_DATABASE_PARENT_INVALID');
 return selected;
}

function parseJson(value){return JSON.parse(value)}

function runFromRow(row){
 return {
  run_id:row.run_id,
  created_at_utc:row.created_at_utc,
  kind:row.kind,
  store_input:Boolean(row.store_input),
  query_sha256:row.query_sha256,
  query_bytes:row.query_bytes,
  query_profile:parseJson(row.query_profile_json),
  input_sha256:row.input_sha256,
  input_bytes:row.input_bytes,
  input_profile:parseJson(row.input_profile_json),
  query:row.query_text,
  input:row.input_text,
  method_ids:parseJson(row.method_ids_json),
  result:parseJson(row.result_json),
  boundaries:parseJson(row.boundaries_json)
 };
}

function queueFromRow(row){
 return {
  request_id:row.request_id,
  created_at_utc:row.created_at_utc,
  provider:row.provider,
  action:row.action,
  label:row.label,
  payload:parseJson(row.payload_json),
  state:row.state,
  host_action_performed:Boolean(row.host_action_performed),
  host_action_called:false,
  write_performed:Boolean(row.write_performed),
  provider_receipt:null
 };
}

export class ResearchWorkbenchStore{
 constructor(databasePath,{clock=()=>new Date(),id=()=>randomUUID(),identity='UNBOUND'}={}){
  if(typeof databasePath!=='string')fail('WORKBENCH_DATABASE_PATH_INVALID');
  if(typeof identity!=='string'||!/^(?:UNBOUND|[a-f0-9]{64})$/u.test(identity))fail('WORKBENCH_STORE_IDENTITY_INVALID');
  assertDatabaseCandidate(databasePath);
  this.databasePath=databasePath;
  this.clock=clock;
  this.id=id;
  this.db=new DatabaseSync(databasePath,{allowExtension:false});
  try{
   this.db.exec(`PRAGMA foreign_keys=ON;
    PRAGMA trusted_schema=OFF;
    PRAGMA busy_timeout=5000;`);
   const initialUserVersion=this.db.prepare('PRAGMA user_version').get().user_version;
   const existingObjects=this.db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
   const hasSchema=existingObjects.length>0;
   const expectedFingerprint=getExpectedSchemaFingerprint();
   if(hasSchema){
    if(!existingObjects.some(row=>row.name==='workbench_meta'))fail('WORKBENCH_DATABASE_OCCUPIED');
    if(initialUserVersion!==1||workbenchSchemaFingerprint(this.db)!==expectedFingerprint)fail('WORKBENCH_SCHEMA_IDENTITY_MISMATCH');
    const existingVersion=this.db.prepare('SELECT value FROM workbench_meta WHERE key=?').get('format_version')?.value;
    if(existingVersion!==WORKBENCH_STORE_VERSION)fail('WORKBENCH_STORE_VERSION_UNSUPPORTED');
    const savedFingerprint=this.db.prepare('SELECT value FROM workbench_meta WHERE key=?').get('schema_sha256')?.value;
    if(savedFingerprint!==expectedFingerprint)fail('WORKBENCH_SCHEMA_IDENTITY_MISMATCH');
    const savedIdentity=this.db.prepare('SELECT value FROM workbench_meta WHERE key=?').get('bundle_identity')?.value;
    if(savedIdentity!==identity)fail('WORKBENCH_STORE_IDENTITY_MISMATCH');
   }else if(initialUserVersion!==0)fail('WORKBENCH_STORE_VERSION_UNSUPPORTED');
   this.db.exec(`PRAGMA journal_mode=WAL;
    PRAGMA synchronous=FULL;
    BEGIN IMMEDIATE;`);
   this.db.exec(WORKBENCH_SCHEMA_SQL);
   this.db.prepare('INSERT OR IGNORE INTO workbench_meta(key,value) VALUES(?,?)').run('format_version',WORKBENCH_STORE_VERSION);
   this.db.prepare('INSERT OR IGNORE INTO workbench_meta(key,value) VALUES(?,?)').run('schema_sha256',expectedFingerprint);
   this.db.prepare('INSERT OR IGNORE INTO workbench_meta(key,value) VALUES(?,?)').run('bundle_identity',identity);
   if(initialUserVersion===0)this.db.exec('PRAGMA user_version=1');
   this.db.exec('COMMIT');
   const version=this.db.prepare('SELECT value FROM workbench_meta WHERE key=?').get('format_version')?.value;
   if(version!==WORKBENCH_STORE_VERSION)fail('WORKBENCH_STORE_VERSION_UNSUPPORTED');
   const savedFingerprint=this.db.prepare('SELECT value FROM workbench_meta WHERE key=?').get('schema_sha256')?.value;
   if(savedFingerprint!==expectedFingerprint)fail('WORKBENCH_SCHEMA_IDENTITY_MISMATCH');
   const savedIdentity=this.db.prepare('SELECT value FROM workbench_meta WHERE key=?').get('bundle_identity')?.value;
   if(savedIdentity!==identity)fail('WORKBENCH_STORE_IDENTITY_MISMATCH');
   assertStoreInvariants(this.db,{deep:true});
   restrictDatabaseFiles(databasePath);
  }catch(error){try{this.db.exec('ROLLBACK')}catch{}this.db.close();throw error}
 }

 createRun(value){
  const run=validateRunRequest(value),runId=this.id(),created=this.clock().toISOString();
  if(typeof runId!=='string'||!UUID.test(runId))fail('WORKBENCH_GENERATED_ID_INVALID');
  const queryProfile=profileText(run.query),inputProfile=profileText(run.input);
  const boundaries={
   source_authentication:false,
   external_networking:false,
   provider_action_performed:false,
   canonical_records_modified:false,
   raw_input_stored:run.store_input,
   client_result_content_stored:run.store_input
  };
  this.db.prepare(`INSERT INTO workbench_runs(
   run_id,created_at_utc,kind,store_input,query_sha256,query_bytes,query_profile_json,query_text,
   input_sha256,input_bytes,input_profile_json,input_text,method_ids_json,result_json,boundaries_json
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
   runId,created,run.kind,run.store_input?1:0,sha256(run.query),queryProfile.utf8_bytes,JSON.stringify(queryProfile),run.store_input?run.query:null,
   sha256(run.input),inputProfile.utf8_bytes,JSON.stringify(inputProfile),run.store_input?run.input:null,
   JSON.stringify(run.method_ids),run.result_json,JSON.stringify(boundaries)
  );
  restrictDatabaseFiles(this.databasePath);
  return this.getRun(runId);
 }

 getRun(runId){
  const row=this.db.prepare('SELECT * FROM workbench_runs WHERE run_id=?').get(runId);
  return row?runFromRow(row):null;
 }

 listRuns(limit=50){
  if(!Number.isSafeInteger(limit)||limit<1||limit>WORKBENCH_STORE_LIMITS.list_rows)fail('WORKBENCH_LIST_LIMIT_INVALID');
  assertStoreInvariants(this.db,{deep:true});
  return this.db.prepare('SELECT * FROM workbench_runs ORDER BY created_at_utc DESC,run_id DESC LIMIT ?').all(limit).map(runFromRow);
 }

 createQueueRequest(value){
  const request=validateQueueRequest(value),requestId=this.id(),created=this.clock().toISOString();
  if(typeof requestId!=='string'||!UUID.test(requestId))fail('WORKBENCH_GENERATED_ID_INVALID');
  if(request.payload.run_id!==null&&!this.getRun(request.payload.run_id))fail('WORKBENCH_QUEUE_RUN_NOT_FOUND');
  this.db.prepare(`INSERT INTO workbench_queue(
   request_id,created_at_utc,provider,action,label,run_id,payload_json,state,host_action_performed,write_performed,provider_receipt_json
  ) VALUES(?,?,?,?,?,?,?,'NOT_SENT',0,0,NULL)`).run(
   requestId,created,request.provider,request.action,request.label,request.payload.run_id,request.payload_json
  );
  restrictDatabaseFiles(this.databasePath);
  return this.getQueueRequest(requestId);
 }

 getQueueRequest(requestId){
  const row=this.db.prepare('SELECT * FROM workbench_queue WHERE request_id=?').get(requestId);
  return row?queueFromRow(row):null;
 }

 listQueue(limit=50){
  if(!Number.isSafeInteger(limit)||limit<1||limit>WORKBENCH_STORE_LIMITS.list_rows)fail('WORKBENCH_LIST_LIMIT_INVALID');
  assertStoreInvariants(this.db,{deep:true});
  return this.db.prepare('SELECT * FROM workbench_queue ORDER BY created_at_utc DESC,request_id DESC LIMIT ?').all(limit).map(queueFromRow);
 }

 status(){
  assertStoreInvariants(this.db,{deep:true});
  const runs=this.db.prepare('SELECT COUNT(*) AS count FROM workbench_runs').get().count;
  const queued=this.db.prepare('SELECT COUNT(*) AS count FROM workbench_queue').get().count;
  const notSent=this.db.prepare("SELECT COUNT(*) AS count FROM workbench_queue WHERE state='NOT_SENT' AND host_action_performed=0 AND write_performed=0 AND provider_receipt_json IS NULL").get().count;
  if(notSent!==queued)fail('WORKBENCH_STORE_INVARIANT_FAILED');
  return {format_version:WORKBENCH_STORE_VERSION,run_count:runs,queue_count:queued,queue_not_sent:notSent,integrity:'ok'};
 }

 close(){this.db.close()}
}
