#!/usr/bin/env node
// Build a self-contained, offline Method Atlas scan bundle. Output directories
// are exclusively created; existing files, controllers and caches are untouched.
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes} from 'node:crypto';
import {chmodSync,copyFileSync,mkdirSync,readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {loadMethodAtlas,runMethodSelfScan} from './method-atlas-cli.mjs';
import {methodCapsules} from '../lib/method-ark.mjs';
import {writeMethodSelfScanArtifacts,writeMethodSelfScanDatabase} from '../lib/method-self-scan-offline.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha256=raw=>createHash('sha256').update(raw).digest('hex');
const now=()=>new Date().toISOString();
const fail=message=>{throw Error(message)};

function argumentsFor(argv){
 const allowed=new Set(['--output-dir','--prior-scan','--capabilities-file']),result={};
 for(let index=0;index<argv.length;index+=2){
  const key=argv[index],value=argv[index+1];
  if(!allowed.has(key)||!value||value.startsWith('--'))fail('USAGE_OUTPUT_DIR_OPTIONAL_PRIOR_SCAN_AND_CAPABILITIES_FILE');
  if(Object.hasOwn(result,key))fail('DUPLICATE_EXPORT_ARGUMENT');
  result[key]=value;
 }
 return result;
}

function command(args){return execFileSync(args[0],args.slice(1),{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()}
function gitSnapshot(){
 const status=command(['git','status','--porcelain=v1','--untracked-files=normal']);
 return {commit:command(['git','rev-parse','HEAD']),tree:command(['git','rev-parse','HEAD^{tree}']),working_tree_dirty:Boolean(status),working_tree_status:status?status.split(/\r?\n/u):[]};
}
function regularJson(path,label,maxBytes=1024*1024){
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxBytes)fail(label+'_REGULAR_JSON_REQUIRED');
 const raw=readFileSync(path);let value;try{value=JSON.parse(raw.toString('utf8'))}catch{fail(label+'_INVALID_JSON')}
 if(!value||typeof value!=='object'||Array.isArray(value))fail(label+'_JSON_OBJECT_REQUIRED');
 return {raw,value};
}
function publicCapabilities(value){
 const rootFields=new Set(['format_version','recorded_at_utc','scope','surfaces','prior_evidence','boundaries']);
 if(Object.keys(value).some(key=>!rootFields.has(key))||value.format_version!=='MPC_OFFLINE_CAPABILITIES_1.0')fail('CAPABILITIES_SCHEMA_MISMATCH');
 const bounded=(input,label,max=2000)=>{if(typeof input!=='string'||!input.length||input.length>max)fail('INVALID_CAPABILITIES_'+label);return input};
 bounded(value.recorded_at_utc,'RECORDED_AT',100);
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value.recorded_at_utc)||!Number.isFinite(Date.parse(value.recorded_at_utc)))fail('INVALID_CAPABILITIES_RECORDED_AT');
 if(!['CURRENT_SESSION_CAPABILITY_OBSERVATION_SEPARATE_FROM_STATIC_SCAN','OFFLINE_EXPORTER_DID_NOT_PROBE_EXTERNAL_SERVICES'].includes(value.scope))fail('INVALID_CAPABILITIES_SCOPE');
 if(!Array.isArray(value.surfaces)||value.surfaces.length>32||!Array.isArray(value.prior_evidence)||value.prior_evidence.length>32)fail('INVALID_CAPABILITIES_ARRAYS');
 const locators={
  GITHUB_PLUGIN:'plugin://github@openai-curated-remote',GIT_REMOTE:'mjcustomcomputers-dotcom/Machine-Bug-Tool',
  MPC_MACHINE_LEGAL_SKILL:'skill://Plugin_8ac3267f78148191a431496c9ea0c0be',MPC_MACHINE_LEGAL_CONNECTOR:'plugin://mpc-machine-legal@openai-curated-remote',
  MPC_BUGTOOLS:'plugin://dev-ec58381195008191a0b03b8066d2b5b6@openai-curated-remote',GOOGLE_DRIVE:'plugin://google-drive@openai-curated-remote',
  DROPBOX:'plugin://app-69b31dc2110c8191b8b47dc98fe5a052@openai-curated-remote',DROPBOX_DASH:'plugin://app-69ca45719b948191999f401a2108740b@openai-curated-remote',
  TVBRAIN:'plugin://dev-6ac33707ccd081918a1d0ad4b0e2fec8@openai-curated-remote',SCITE:'plugin://scite@openai-curated-remote',
  PARALLEL_SEARCH:'plugin://app-69fb9378663481919a68e8a2109644e5@openai-curated-remote',PLUGIN_MANAGEMENT:'plugin://plugin-management@openai-curated-remote',
  TEMPLATE_CREATOR:'plugin://template-creator@openai-curated-remote',MPC_BUGTOOLS_SITE:'sites-project://appgprj_6abf0bb684648191a38324d33d1aa8cc',
  SOURCE_ATLAS_SITE:'sites-project://appgprj_6abdf738aac48191bd0b84921484911e',DAYBREAK_SELECTION:'product://daybreak-model-selection'
 };
 const capabilityStatuses=new Set(['AVAILABLE_CURRENT_SESSION','AVAILABLE_SOURCE_GIT_ONLY','SKILL_AVAILABLE_CONNECTOR_UNAVAILABLE','UNAVAILABLE_SCHEMA_NOT_EXPOSED','NOT_OBSERVED_CURRENT_TASK']);
 const protectedStatuses=new Set(['SUCCEEDED_CURRENT_SESSION','NOT_RUN_TOOL_UNAVAILABLE','NOT_APPLICABLE','PRIOR_SESSION_EVIDENCE_ONLY','NOT_OBSERVED_CURRENT_TASK']);
 const surfaceFields=new Set(['name','locator','capability_status','protected_call_status','receipt_sha256','scope']);
 const seenSurfaces=new Set();
 let currentSucceeded=0;
 for(const row of value.surfaces){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!surfaceFields.has(key)))fail('INVALID_CAPABILITY_SURFACE');
  if(!Object.hasOwn(locators,row.name)||seenSurfaces.has(row.name))fail('INVALID_CAPABILITY_SURFACE_NAME');seenSurfaces.add(row.name);
  if(row.locator!==locators[row.name]||!capabilityStatuses.has(row.capability_status)||!protectedStatuses.has(row.protected_call_status)||
   !['CURRENT_SESSION','PRIOR_SESSION_PRESERVED'].includes(row.scope))fail('INVALID_CAPABILITY_SURFACE_VALUE');
  if(row.receipt_sha256!==undefined&&!/^[a-f0-9]{64}$/u.test(row.receipt_sha256))fail('INVALID_CAPABILITY_RECEIPT_SHA256');
  if(row.protected_call_status==='SUCCEEDED_CURRENT_SESSION'){
   if(row.scope!=='CURRENT_SESSION'||row.capability_status!=='AVAILABLE_CURRENT_SESSION'||!row.receipt_sha256)fail('CURRENT_CAPABILITY_RECEIPT_REQUIRED');
   currentSucceeded++;
  }else if(row.protected_call_status==='PRIOR_SESSION_EVIDENCE_ONLY'){
   if(row.scope!=='PRIOR_SESSION_PRESERVED'||!row.receipt_sha256)fail('PRIOR_CAPABILITY_RECEIPT_REQUIRED');
  }else if(row.receipt_sha256!==undefined)fail('UNBOUND_CAPABILITY_RECEIPT');
  if(row.scope==='PRIOR_SESSION_PRESERVED'&&row.protected_call_status!=='PRIOR_SESSION_EVIDENCE_ONLY')fail('PRIOR_CAPABILITY_SCOPE_MISMATCH');
 }
 const evidenceFields=new Set(['name','receipt_sha256','scope']);
 const evidenceNames=new Set(['MPC_RUNTIME_STATUS','MPC_UNIVERSAL_CONTRACT','MPC_FINITE_INVARIANT_CATALOG','GOOGLE_DRIVE_WORKBOOK','DROPBOX_DASH_INVENTORY','DROPBOX_DASH_SEARCH','DROPBOX_ZERO_MATCH']);
 const seenEvidence=new Set();
 for(const row of value.prior_evidence){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!evidenceFields.has(key)))fail('INVALID_PRIOR_CAPABILITY_EVIDENCE');
  if(!evidenceNames.has(row.name)||seenEvidence.has(row.name)||row.scope!=='PRIOR_SESSION_PRESERVED_NOT_CURRENT_ACCESS')fail('INVALID_PRIOR_CAPABILITY_VALUE');seenEvidence.add(row.name);
  if(!/^[a-f0-9]{64}$/u.test(row.receipt_sha256))fail('INVALID_PRIOR_CAPABILITY_SHA256');
 }
 const boundaryFields=new Set(['credentials_included','current_session_protected_calls','exporter_network_calls','exporter_connector_calls','daybreak_status']);
 const boundaries=value.boundaries;
 if(!boundaries||typeof boundaries!=='object'||Array.isArray(boundaries)||Object.keys(boundaries).some(key=>!boundaryFields.has(key)))fail('INVALID_CAPABILITY_BOUNDARIES');
 if(boundaries.credentials_included!==false||!Number.isInteger(boundaries.current_session_protected_calls)||boundaries.current_session_protected_calls<0||
  boundaries.exporter_network_calls!==0||boundaries.exporter_connector_calls!==0)fail('UNSAFE_CAPABILITY_BOUNDARIES');
 if(boundaries.current_session_protected_calls!==currentSucceeded)fail('CAPABILITY_PROTECTED_CALL_COUNT_MISMATCH');
 if(!['NOT_OBSERVED_CURRENT_TASK','PRIOR_USER_REPORTED_DAYBREAK_BLUE_PRESERVED','ACTUAL_DAYBREAK_BLUE_OBSERVED_CURRENT_TASK'].includes(boundaries.daybreak_status))fail('INVALID_CAPABILITY_DAYBREAK_STATUS');
 return Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
}
function copy(source,target){mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target)}

export async function exportMethodSelfScan({output,priorScan=null,capabilitiesFile=null}){
 const outputPath=resolve(output),started=now();
 let priorFingerprint=null;
 if(priorScan){
  const prior=regularJson(resolve(priorScan),'PRIOR_SCAN',64*1024*1024).value;
  priorFingerprint=prior?.fingerprints?.scan_sha256;
  if(typeof priorFingerprint!=='string'||!/^[a-f0-9]{64}$/u.test(priorFingerprint))fail('PRIOR_SCAN_FINGERPRINT_REQUIRED');
 }
 const capabilitiesBytes=capabilitiesFile?publicCapabilities(regularJson(resolve(capabilitiesFile),'CAPABILITIES').value):publicCapabilities({
  format_version:'MPC_OFFLINE_CAPABILITIES_1.0',recorded_at_utc:now(),
  scope:'OFFLINE_EXPORTER_DID_NOT_PROBE_EXTERNAL_SERVICES',surfaces:[],prior_evidence:[],
  boundaries:{credentials_included:false,current_session_protected_calls:0,exporter_network_calls:0,exporter_connector_calls:0,
   daybreak_status:'NOT_OBSERVED_CURRENT_TASK'}});
 const capabilities=JSON.parse(capabilitiesBytes.toString('utf8'));
 mkdirSync(dirname(outputPath),{recursive:true});
 mkdirSync(outputPath,{recursive:false});
 const sourceBefore=gitSnapshot();
 const capsules=methodCapsules();
 writeFileSync(resolve(outputPath,'implemented-capsules.json'),JSON.stringify(capsules,null,2)+'\n',{encoding:'utf8',flag:'wx'});
 const databasePath=resolve(outputPath,'method-atlas.sqlite');
 const db=new DatabaseSync(databasePath);
 let atlasStatus,scan,databaseProjection;
 try{
  atlasStatus=loadMethodAtlas(db);
  scan=await runMethodSelfScan(db,priorFingerprint?{prior_fingerprint:priorFingerprint}:{});
  databaseProjection=writeMethodSelfScanDatabase(db,scan);
 }finally{db.close()}
 chmodSync(databasePath,0o444);
 const assets=[
  ['lib/method-self-scan.mjs','lib/method-self-scan.mjs'],
  ['lib/method-self-scan-offline.mjs','lib/method-self-scan-offline.mjs'],
  ['lib/research-workbench-ui.mjs','lib/research-workbench-ui.mjs'],
  ['lib/research-workbench-store.mjs','lib/research-workbench-store.mjs'],
  ['scripts/portable-method-self-scan.mjs','scripts/portable-method-self-scan.mjs'],
  ['scripts/research-workbench-server.mjs','scripts/research-workbench-server.mjs'],
  ['scripts/offline/Run-Method-Self-Scan.ps1','Run-MPC-Research-Workbench.ps1'],
  ['scripts/offline/Install-Method-Self-Scan.ps1','Install-MPC-Research-Workbench.ps1'],
  ['scripts/offline/README-OFFLINE.md','README-OFFLINE.md'],
  ['docs/MPC-RESEARCH-WORKBENCH.md','MPC-RESEARCH-WORKBENCH.md']
 ];
 for(const [source,target] of assets)copy(resolve(ROOT,source),resolve(outputPath,target));
 writeFileSync(resolve(outputPath,'capabilities.json'),capabilitiesBytes,{flag:'wx'});
 const sourceAfter=gitSnapshot();
 const sourceFiles=assets.filter(([source])=>source.endsWith('.mjs')).map(([source])=>{
  const raw=readFileSync(resolve(ROOT,source));return {path:source,bytes:raw.length,sha256:sha256(raw)};
 });
 const receipt={
  kind:'MPC_METHOD_SELF_SCAN_PRIMARY_OFFLINE_EXPORT',version:1,status:scan.status,started_at_utc:started,completed_at_utc:now(),
  repository:ROOT,output_directory:outputPath,source_before:sourceBefore,source_after:sourceAfter,
  source_head_unchanged:sourceBefore.commit===sourceAfter.commit,source_tree_unchanged:sourceBefore.tree===sourceAfter.tree,
  atlas_status:atlasStatus,database:{path:'method-atlas.sqlite',sha256:sha256(readFileSync(databasePath)),opened_for_seed_and_offline_projection_then_closed:true,
   derived_cache:true,projection:databaseProjection},
  source_files:sourceFiles,scan_sha256:scan.fingerprints.scan_sha256,pair_stream_sha256:scan.fingerprints.pair_stream_sha256,
  node_version:process.version,platform:process.platform,architecture:process.arch,network_calls:0,connector_calls:0,
  source_authentication:false,method_execution_performed:false,target_actions:false,canonical_controller_modified:false,canonical_promotion:false
 };
 const manifest=writeMethodSelfScanArtifacts(outputPath,scan,receipt,{capabilities,includeHostLauncher:true,
  build_commit:sourceBefore.commit,working_tree_dirty:sourceBefore.working_tree_dirty});
 return {status:scan.status,output_directory:outputPath,scan_sha256:scan.fingerprints.scan_sha256,
  pair_stream_sha256:scan.fingerprints.pair_stream_sha256,database_sha256:receipt.database.sha256,
  artifact_count:manifest.artifact_count,manifest:resolve(outputPath,'manifest.json')};
}

const calledAsMain=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(calledAsMain){
 try{
  const args=argumentsFor(process.argv.slice(2));
  const suffix=new Date().toISOString().replaceAll(/[-:.]/gu,'')+'-'+randomBytes(4).toString('hex');
  const output=args['--output-dir']??resolve(ROOT,'.sites-runtime/method-self-scan',suffix);
  const result=await exportMethodSelfScan({output,priorScan:args['--prior-scan']??null,capabilitiesFile:args['--capabilities-file']??null});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch(error){
  process.stderr.write(JSON.stringify({status:'ERROR',error_type:error?.constructor?.name??'Error',error:String(error?.message??error)})+'\n');
  process.exitCode=1;
 }
}
