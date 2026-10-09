#!/usr/bin/env node
// Create a new portable local lab. Never overwrite an existing bundle or run.
import {copyFileSync,constants,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {reasoningEngineIdentity,reasoningRuntimeFiles} from './run-reasoning-selfplay.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const extras=['docs/REASONING-INTELLIGENCE-V15.md','scripts/Run-Reasoning-Intelligence.ps1','scripts/run-reasoning-intelligence.cmd'];
const write=(path,value)=>writeFileSync(path,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
function filesUnder(root,current=root){
 return readdirSync(current).sort().flatMap(name=>{const path=resolve(current,name),stat=lstatSync(path);
  if(stat.isSymbolicLink())throw Error('BUNDLE_SYMLINK_REJECTED');
  if(stat.isDirectory())return filesUnder(root,path);
  if(!stat.isFile())throw Error('BUNDLE_REGULAR_FILES_REQUIRED');
  const raw=readFileSync(path);return [{path:relative(root,path).split(sep).join('/'),bytes:raw.length,sha256:sha(raw)}];});
}

export function exportReasoningIntelligence({output_directory,seed=20261009,rounds=24}={}){
 if(typeof output_directory!=='string'||!output_directory.trim())throw Error('OUTPUT_DIRECTORY_REQUIRED');
 if(!Number.isInteger(seed)||seed<1||seed>0xffffffff||!Number.isInteger(rounds)||rounds<1||rounds>64)throw Error('INVALID_EXPORT_BUDGET');
 const output=resolve(output_directory);
 if(existsSync(output))throw Error('BUNDLE_OUTPUT_ALREADY_EXISTS');
 const source=reasoningEngineIdentity();
 for(const path of [...reasoningRuntimeFiles,...extras]){
  const stat=lstatSync(resolve(ROOT,path));if(!stat.isFile()||stat.isSymbolicLink())throw Error('SOURCE_REGULAR_FILE_REQUIRED:'+path);
 }
 mkdirSync(output,{recursive:true});
 for(const path of [...reasoningRuntimeFiles,...extras]){
  const target=resolve(output,path);mkdirSync(dirname(target),{recursive:true});copyFileSync(resolve(ROOT,path),target,constants.COPYFILE_EXCL);
 }
 const portable=reasoningEngineIdentity(output);
 if(portable.engine_fingerprint!==source.engine_fingerprint)throw Error('PORTABLE_ENGINE_BYTE_MISMATCH');
 const run=JSON.parse(execFileSync(process.execPath,[resolve(output,'scripts/run-reasoning-selfplay.mjs'),'--output-root',resolve(output,'Runs'),'--seed',String(seed),'--rounds',String(rounds)],
  {cwd:output,encoding:'utf8',timeout:60000,maxBuffer:1024*1024}));
 if(run.engine_fingerprint!==portable.engine_fingerprint||run.summary.failed)throw Error('PORTABLE_RUN_DID_NOT_PASS');
 write(resolve(output,'SOURCE-PIN.json'),{kind:'MPC_REASONING_PORTABLE_SOURCE_V15',native_base_commit:'e3a8f15806388d9c0d3705970ec7fd18c44d3439',
  source:portable,created_at_utc:new Date().toISOString(),source_authentication:false,hosted_deployment:false});
 const report=relative(output,resolve(run.output_directory,'REPORT.html')).split(sep).join('/');
 write(resolve(output,'OPEN-REPORT.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url='+report+'"><title>MPC Reasoning Intelligence</title><a href="'+report+'">Open the executed reasoning report</a></html>\n');
 write(resolve(output,'README.md'),'# MPC Reasoning Intelligence V15\n\nOpen `OPEN-REPORT.html` to read the included executed results. No runtime is needed to read the report.\n\nTo run the next bounded experiment pass with an installed Node.js >=22.13:\n\n```sh\nnode scripts/run-reasoning-selfplay.mjs --output-root Runs --rounds 24\n```\n\nOn Windows, `scripts/run-reasoning-intelligence.cmd` runs the PowerShell wrapper, verifies the manifest, and uses an already installed Node.js. It never installs software or changes execution policy. Native Windows execution is a separate receiver check.\n\nEach run creates a new directory in `Runs`; `Runs/latest.json` identifies the verified next seed. Earlier run directories are preserved. Do not delete a live writer lock or reuse a mismatched source cursor. The manifest records the distribution snapshot; later local `Runs/latest.json` updates are intentionally mutable.\n\nRead `docs/REASONING-INTELLIGENCE-V15.md` for model boundaries, methods, exact source identity and development workflow.\n');
 // The cursor changes during later local runs, so only immutable distribution
 // files are listed. Its own signed digest and scan readback guard the cursor.
 const files=filesUnder(output).filter(row=>row.path!=='Runs/latest.json');
 write(resolve(output,'MANIFEST.json'),{version:'MPC_REASONING_PORTABLE_MANIFEST_V1',algorithm:'SHA-256',files,
  engine_fingerprint:source.engine_fingerprint,mutable_paths:['Runs/latest.json'],manifest_self_hash_excluded:true});
 for(const row of files)if(sha(readFileSync(resolve(output,row.path)))!==row.sha256)throw Error('BUNDLE_READBACK_MISMATCH');
 return {status:'PORTABLE_REASONING_LAB_CREATED',output_directory:output,engine_fingerprint:source.engine_fingerprint,files:files.length,run};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const input={},seen=new Set();for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];
   if(!['--output-dir','--seed','--rounds'].includes(key)||!value||seen.has(key))throw Error('USAGE_OUTPUT_DIR_OPTIONAL_SEED_ROUNDS');seen.add(key);
   if(key==='--output-dir')input.output_directory=value;else{if(!/^[0-9]+$/u.test(value))throw Error('INTEGER_ARGUMENT_REQUIRED');input[key.slice(2)]=Number(value);}}
  console.log(JSON.stringify(exportReasoningIntelligence(input),null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
