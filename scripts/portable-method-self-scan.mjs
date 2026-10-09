#!/usr/bin/env node
// Portable offline runner. It reads the bundled SQLite snapshot in read-only
// mode and creates a new result directory; it has no connector or network code.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,lstatSync,writeFileSync} from 'node:fs';
import {dirname,resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scanMethodAtlas} from '../lib/method-self-scan.mjs';
import {writeMethodSelfScanArtifacts} from '../lib/method-self-scan-offline.mjs';

const sha256=raw=>createHash('sha256').update(raw).digest('hex');
const now=()=>new Date().toISOString();
const fail=message=>{throw Error(message)};

function argumentsFor(argv){
 const allowed=new Set(['--database','--capsules','--manifest','--output-dir','--prior-scan']),result={};
 for(let index=0;index<argv.length;index+=2){
  const key=argv[index],value=argv[index+1];
  if(!allowed.has(key)||!value||value.startsWith('--'))fail('USAGE_DATABASE_CAPSULES_MANIFEST_OUTPUT_DIR_OPTIONAL_PRIOR_SCAN');
  if(Object.hasOwn(result,key))fail('DUPLICATE_OFFLINE_RUNNER_ARGUMENT');
  result[key]=value;
 }
 for(const key of ['--database','--capsules','--manifest','--output-dir'])if(!result[key])fail('MISSING_OFFLINE_RUNNER_ARGUMENT:'+key);
 return result;
}

function regular(path,label){
 const stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink())fail(label+'_REGULAR_FILE_REQUIRED');
 return readFileSync(path);
}

function verifiedBundleFiles(manifestPath,databasePath,capsulesPath){
 const raw=regular(manifestPath,'MANIFEST');
 const manifest=JSON.parse(raw.toString('utf8'));
 if(manifest.format_version!=='MPC_METHOD_SELF_SCAN_OFFLINE_MANIFEST_1.0'||!Array.isArray(manifest.artifacts))fail('UNSUPPORTED_OFFLINE_MANIFEST');
 const root=dirname(manifestPath),entries=new Map(manifest.artifacts.map(entry=>[entry.path,entry]));
 const check=path=>{
  const rel=relative(root,path).split(sep).join('/');
  if(rel.startsWith('../')||rel==='..')fail('BUNDLE_FILE_OUTSIDE_MANIFEST_ROOT');
  const expected=entries.get(rel);if(!expected||!/^([a-f0-9]{64})$/u.test(expected.sha256))fail('BUNDLE_FILE_NOT_IN_MANIFEST:'+rel);
  const bytes=regular(path,'BUNDLE_FILE');
  if(bytes.length!==expected.bytes||sha256(bytes)!==expected.sha256)fail('BUNDLE_FILE_CHECKSUM_MISMATCH:'+rel);
  return {path:rel,bytes,sha256:expected.sha256};
 };
 return {manifest_sha256:sha256(raw),database:check(databasePath),capsules:check(capsulesPath),
  capabilities:check(resolve(root,'capabilities.json')),source_receipt:check(resolve(root,'receipt.json'))};
}

export async function runPortableMethodSelfScan({database,capsules,manifest,output,priorScan=null}){
 const databasePath=resolve(database),capsulesPath=resolve(capsules),manifestPath=resolve(manifest),outputPath=resolve(output);
 const started=now(),verified=verifiedBundleFiles(manifestPath,databasePath,capsulesPath);
 const implemented=JSON.parse(verified.capsules.bytes.toString('utf8'));
 if(!Array.isArray(implemented))fail('IMPLEMENTED_CAPSULE_ARRAY_REQUIRED');
 let capabilities;
 try{capabilities=JSON.parse(verified.capabilities.bytes.toString('utf8'))}catch{fail('CAPABILITIES_INVALID_JSON')}
 if(!capabilities||typeof capabilities!=='object'||Array.isArray(capabilities))fail('CAPABILITIES_OBJECT_REQUIRED');
 let sourceReceipt;
 try{sourceReceipt=JSON.parse(verified.source_receipt.bytes.toString('utf8'))}catch{fail('SOURCE_RECEIPT_INVALID_JSON')}
 const sourceBuildCommit=sourceReceipt?.source_before?.commit;
 if(typeof sourceBuildCommit!=='string'||!/^[a-f0-9]{40}$/u.test(sourceBuildCommit))fail('SOURCE_RECEIPT_COMMIT_REQUIRED');
 let priorFingerprint=null;
 if(priorScan){
  const prior=JSON.parse(regular(resolve(priorScan),'PRIOR_SCAN').toString('utf8'));
  priorFingerprint=prior?.fingerprints?.scan_sha256;
  if(typeof priorFingerprint!=='string')fail('PRIOR_SCAN_FINGERPRINT_REQUIRED');
 }
 mkdirSync(dirname(outputPath),{recursive:true});
 mkdirSync(outputPath,{recursive:false});
 writeFileSync(resolve(outputPath,'capabilities.json'),verified.capabilities.bytes,{flag:'wx'});
 const before=sha256(regular(databasePath,'DATABASE'));
 const db=new DatabaseSync(databasePath,{readOnly:true});
 let scan;
 try{
  db.exec('PRAGMA query_only=ON');
  const adapter={prepare(sql){return {bind(...values){return {all(){return {results:db.prepare(sql).all(...values)}}}}}}};
  scan=await scanMethodAtlas(adapter,{implemented_capsules:implemented,prior_fingerprint:priorFingerprint});
 }finally{db.close()}
 const after=sha256(regular(databasePath,'DATABASE'));
 if(before!==after)fail('READ_ONLY_DATABASE_CHANGED');
 const receipt={
  kind:'MPC_METHOD_SELF_SCAN_PORTABLE_OFFLINE_RUN',version:1,status:scan.status,started_at_utc:started,completed_at_utc:now(),
  execution_scope:'LOCAL_STATIC_METADATA_ONLY_NO_NETWORK_OR_CONNECTORS',node_version:process.version,platform:process.platform,architecture:process.arch,
  database:{path:verified.database.path,sha256_before:before,sha256_after:after,bytes_unchanged:true,opened_read_only:true},
  capsules:{path:verified.capsules.path,sha256:verified.capsules.sha256},source_manifest_sha256:verified.manifest_sha256,
  source_build_commit:sourceBuildCommit,
  prior_scan_sha256:priorFingerprint,scan_sha256:scan.fingerprints.scan_sha256,pair_stream_sha256:scan.fingerprints.pair_stream_sha256,
  output_directory:outputPath,source_authentication:false,method_execution_performed:false,network_calls:0,connector_calls:0,
  target_actions:false,canonical_promotion:false
 };
 const resultManifest=writeMethodSelfScanArtifacts(outputPath,scan,receipt,{capabilities,includeHostLauncher:false,
  build_commit:sourceBuildCommit,working_tree_dirty:Boolean(sourceReceipt?.source_before?.working_tree_dirty)});
 return {status:scan.status,output_directory:outputPath,scan_sha256:scan.fingerprints.scan_sha256,
  pair_stream_sha256:scan.fingerprints.pair_stream_sha256,artifact_count:resultManifest.artifact_count};
}

const calledAsMain=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(calledAsMain){
 try{
  const args=argumentsFor(process.argv.slice(2));
  const result=await runPortableMethodSelfScan({database:args['--database'],capsules:args['--capsules'],manifest:args['--manifest'],
   output:args['--output-dir'],priorScan:args['--prior-scan']??null});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch(error){
  process.stderr.write(JSON.stringify({status:'ERROR',error_type:error?.constructor?.name??'Error',error:String(error?.message??error)})+'\n');
  process.exitCode=1;
 }
}
