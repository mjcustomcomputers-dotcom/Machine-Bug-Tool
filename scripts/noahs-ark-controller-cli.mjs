// Local versioned state; the chat host invokes supported MPC/native connectors.
// No shell commands, credentials, HTTP client or automatic deployment.
import {readFileSync,statSync,lstatSync,realpathSync,mkdirSync,existsSync,openSync,writeFileSync,closeSync,fsyncSync,renameSync,unlinkSync} from 'node:fs';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {controllerContract,controllerHash,createController,reconcileController,acceptControllerReceipt,nextControllerAction,verifyControllerState} from '../lib/noahs-ark-controller.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const STATE_ROOT=resolve(ROOT,'.sites-runtime');
const catalogFiles=['candidates.json','expansion-2026-v2.json','expansion-evidence-intent-v3.json',
 'expansion-computation-schools-v4.json','expansion-nasa-chip-cloud-v5.json','expansion-abnormal-meta-v6.json','expansion-optical-v8.json'];
function readJson(path){
 if(statSync(path).size>controllerContract.max_json_bytes)throw Error('CONTROLLER_JSON_SIZE');
 const data=readFileSync(path,'utf8');
 if(Buffer.byteLength(data,'utf8')>controllerContract.max_json_bytes)throw Error('CONTROLLER_JSON_SIZE');
 return JSON.parse(data);
}
function loadCatalog(){
 return {methods:catalogFiles.flatMap(name=>readJson(resolve(ROOT,'method-atlas',name)).methods),
  relations:readJson(resolve(ROOT,'method-atlas/method-relations.json')).relationships};
}
function localStatePath(path){
 const full=resolve(path),rel=relative(STATE_ROOT,full);
 if(!rel||rel==='..'||rel.startsWith('..'+sep)||!full.endsWith('.json'))throw Error('STATE_MUST_BE_JSON_UNDER_DOT_SITES_RUNTIME');
 noSymlinks(full);
 return full;
}
function noSymlinks(path){
 const rel=relative(ROOT,path);
 if(rel==='..'||rel.startsWith('..'+sep))throw Error('STATE_PATH_OUTSIDE_CHECKOUT');
 let current=ROOT;
 for(const part of rel.split(sep)){
  current=resolve(current,part);
  if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw Error('CONTROLLER_SYMLINK_PATH_REJECTED');
 }
 let parent=dirname(path);
 while(!existsSync(parent))parent=dirname(parent);
 const real=realpathSync(parent),rootReal=realpathSync(ROOT),rr=relative(rootReal,real);
 if(rr==='..'||rr.startsWith('..'+sep))throw Error('CONTROLLER_REALPATH_OUTSIDE_CHECKOUT');
}
function checkoutState(){
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
 const dirty=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:ROOT,encoding:'utf8'}).trim().length>0;
 const files=['lib/noahs-ark-controller.mjs','scripts/noahs-ark-controller-cli.mjs','lib/noahs-ark-reasoning.mjs',
  'lib/methods.mjs','lib/schema.mjs','lib/universal.mjs','lib/atomic-models.mjs','lib/deferred-models.mjs','lib/forensic-models.mjs',
  ...catalogFiles.map(name=>'method-atlas/'+name),'method-atlas/method-relations.json'];
 return {actual_git_commit:commit,working_tree_dirty:dirty,
  controller_source_fingerprint:controllerHash(files.map(path=>({path,sha256:controllerHash(readFileSync(resolve(ROOT,path),'utf8'))}))),
  source_authentication:false};
}
function requireCurrentSource(config,{stamp=false}={}){
 const source=checkoutState();
 if(config.source_revision?.commit!==source.actual_git_commit)throw Error('CHECKOUT_COMMIT_MISMATCH_REBIND_CONFIG');
 if(!stamp&&config.execution_source?.controller_source_fingerprint!==source.controller_source_fingerprint)throw Error('CHECKOUT_SOURCE_CHANGED_RECONCILE_REQUIRED');
 if(stamp)config.execution_source=source;
 return source;
}
function saveState(path,state,previousHash=null){
 verifyControllerState(state);
 noSymlinks(path);noSymlinks(path+'.history');
 mkdirSync(dirname(path),{recursive:true});
 const lock=path+'.lock',fd=openSync(lock,'wx',0o600);
 let temporary=null;
 try{
  if(previousHash===null){if(existsSync(path))throw Error('CONTROLLER_ALREADY_EXISTS')}
  else if(!existsSync(path)||readJson(path).integrity_sha256!==previousHash)throw Error('CONTROLLER_CONCURRENT_CHANGE');
  const text=JSON.stringify(state,null,2)+'\n';
  const history=path+'.history';mkdirSync(history,{recursive:true});
  const snapshot=resolve(history,String(state.revision).padStart(4,'0')+'-'+String(state.event_sequence).padStart(5,'0')+'-'+state.integrity_sha256+'.json');
  noSymlinks(snapshot);
  if(existsSync(snapshot)){
   if(readFileSync(snapshot,'utf8')!==text)throw Error('IMMUTABLE_CONTROLLER_SNAPSHOT_CONFLICT');
  }else writeFileSync(snapshot,text,{flag:'wx',mode:0o600});
  temporary=path+'.tmp-'+randomUUID();
  const output=openSync(temporary,'wx',0o600);
  try{writeFileSync(output,text);fsyncSync(output)}finally{closeSync(output)}
  renameSync(temporary,path);temporary=null;
  if(readFileSync(path,'utf8')!==text)throw Error('LOCAL_CONTROLLER_READBACK_MISMATCH');
 }finally{
  if(temporary&&existsSync(temporary))unlinkSync(temporary);
  closeSync(fd);unlinkSync(lock);
 }
}
function report(state){
 const next=nextControllerAction(state);
 return {controller_id:state.config.controller_id,revision:state.revision,event_sequence:state.event_sequence,
  integrity_sha256:state.integrity_sha256,configuration_fingerprint:state.configuration_fingerprint,
  execution_source:state.config.execution_source,
  candidates_considered:state.plan.method_consideration.length,
  current_tasks:state.tasks.length,completed_current_tasks:state.tasks.filter(t=>state.completed_actions[t.action_id]).length,
  retained_receipts:Object.keys(state.completed_actions).length,source_authentication:false,
  canonical_promotion:false,...next};
}
function main(){
 const [command,a,b]=process.argv.slice(2);
 if(command==='prepare-fixture'){
  const path=localStatePath(a),config=readJson(resolve(ROOT,'tests/fixtures/noahs-ark-controller-synthetic.json'));
  const source=checkoutState();config.source_revision.commit=source.actual_git_commit;
  config.checkpoint_target.version=source.actual_git_commit;config.execution_source=source;
  noSymlinks(path);mkdirSync(dirname(path),{recursive:true});
  writeFileSync(path,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
  return {status:'SYNTHETIC_FIXTURE_PREPARED',config_path:path,execution_source:source,
   hosted_authentication_claimed:false,next_action:'For a live run, the chat host replaces fixture capability/native-read receipts with actual supported tool observations before init.'};
 }
 if(command==='hash-json')return {sha256:controllerHash(readJson(resolve(a)))};
 if(command==='hash-text')return {sha256:controllerHash(readFileSync(resolve(a),'utf8'))};
 if(['next','status','verify'].includes(command)){
  const state=readJson(localStatePath(a));requireCurrentSource(state.config);verifyControllerState(state);
  return command==='verify'?{status:'LOCAL_CONTROLLER_PARITY_PASS',integrity_sha256:state.integrity_sha256,source_authentication:false}:report(state);
 }
 if(!['init','reconcile','receipt'].includes(command)||!a||!b)throw Error('USAGE: prepare-fixture CONFIG; init|reconcile CONFIG STATE; receipt RECEIPT STATE; next|status|verify STATE; hash-json|hash-text FILE');
 const path=localStatePath(b),input=readJson(resolve(a));
 if(command==='init'){
  requireCurrentSource(input,{stamp:true});
  const state=createController({config:input,...loadCatalog()});saveState(path,state);return report(state);
 }
 const prior=readJson(path);verifyControllerState(prior);
 if(command==='reconcile')requireCurrentSource(input,{stamp:true});else requireCurrentSource(prior.config);
 const state=command==='reconcile'?reconcileController(prior,{config:input,...loadCatalog()}):acceptControllerReceipt(prior,input);
 if(state.integrity_sha256!==prior.integrity_sha256)saveState(path,state,prior.integrity_sha256);
 return report(state);
}
try{process.stdout.write(JSON.stringify(main(),null,2)+'\n')}
catch(error){process.stderr.write(JSON.stringify({status:'CONTROLLER_ERROR',error:error.message})+'\n');process.exitCode=1}
