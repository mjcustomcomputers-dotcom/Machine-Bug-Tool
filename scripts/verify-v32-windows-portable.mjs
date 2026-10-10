#!/usr/bin/env node
// V32: verify the actual shipped Windows portable bytes, ASAR module contents,
// renderer files, source identity, stage lineage and source-exact ZIP checksum.
// No user files, providers, arbitrary execution, or external target access.
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,lstatSync,readdirSync,readFileSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,relative,join,sep,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const fail=x=>{throw Error(x)};
const sha=x=>createHash('sha256').update(x).digest('hex');
const GIT=/^[a-f0-9]{40}$/u,HEX=/^[a-f0-9]{64}$/u;
const safeRel=s=>typeof s==='string'&&s.length>0&&!isAbsolute(s)&&
 !s.includes('\\')&&!s.startsWith('/')&&!s.split('/').some(p=>!p||p==='.'||p==='..');
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const inside=(root,path)=>{const r=relative(root,path);
 return r&&r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
export const v32PortableContract=Object.freeze({
 version:'MPC_V32_WINDOWS_PORTABLE_BYTE_RECEIPT_1',
 base_v31_source:'08216cdc968b3d0688e615d3f220905f7feede55',
 verify_source_sha:true,verify_all_manifest_files:true,
 verify_staged_asar_modules:true,verify_external_renderer:true,
 verify_embedded_version:true,verify_zip_sha256:true,
 run_user_machine:false,deploy:false,merge:false
});
export function getPackagerAsarV32(){
 const require=createRequire(import.meta.url);
 const packagerEntry=require.resolve('@electron/packager');
 const packagerRequire=createRequire(packagerEntry);
 const asar=packagerRequire('@electron/asar');
 if(typeof asar.extractFile!=='function'||typeof asar.extractAll!=='function')
  fail('V32_ELECTRON_ASAR_EXTRACTOR_MISSING');
 return asar;
}
async function fileHash(path){
 const h=createHash('sha256');
 for await(const chunk of createReadStream(path))h.update(chunk);
 return h.digest('hex');
}
function jsonFile(path){
 return JSON.parse(readFileSync(path,'utf8'));
}
function filesRecursive(root){
 const list=[],walk=path=>{
  for(const e of readdirSync(path,{withFileTypes:true})){
   const target=join(path,e.name);
   if(e.isSymbolicLink()||(!e.isFile()&&!e.isDirectory()))
    fail('V32_PORTABLE_UNSAFE_FILE_ENTRY');
   if(e.isDirectory())walk(target);
   else list.push(relative(root,target).split(sep).join('/'));
  }
 };
 walk(root);return list.sort();
}
function stagedFile(map,name){
 const item=map.get(name);
 if(!item)fail('V32_REQUIRED_STAGED_SOURCE_MISSING:'+name);
 return item;
}
export const REQUIRED_RUNTIME_FILES=Object.freeze([
 'scripts/mpc-workspace-server.mjs',
 'lib/mpc-workspace-method-lab-v30.mjs',
 'lib/mpc-v31-bidirectional-logic.mjs',
 'lib/mpc-v31-diagnostic-methods.mjs',
 'lib/mpc-v29-method-mountains.mjs',
 'lib/mpc-linguistic-audit-v28.mjs',
 'desktop/renderer/index.html','desktop/renderer/app.js',
 'desktop/renderer/method-lab.js','desktop/renderer/styles.css'
]);
export async function verifyPortableBuildV32({portableRoot,receiptPath,expectedSourceCommit,zipPath=null,asar=null}={}){
 if(!GIT.test(expectedSourceCommit||'')||typeof portableRoot!=='string'||
 typeof receiptPath!=='string')fail('V32_VERIFICATION_ARGUMENTS_INVALID');
 const root=realpathSync(resolve(portableRoot)),receipt=jsonFile(resolve(receiptPath));
 if(!obj(receipt)||receipt.format_version!=='MPC_WORKSPACE_WINDOWS_PORTABLE_BUILD_1'||
 receipt.source?.commit!==expectedSourceCommit||receipt.source?.dirty!==false||
 receipt.target?.platform!=='win32'||receipt.target?.architecture!=='x64')
  fail('V32_BUILD_SOURCE_OR_TARGET_MISMATCH');
 if(!Array.isArray(receipt.staged?.files)||!Array.isArray(receipt.portable_inventory?.files)||
 !obj(receipt.payload_inventory?.important_files)||!obj(receipt.portable_inventory?.important_files))
  fail('V32_BUILD_MANIFEST_INCOMPLETE');
 const expectedFiles=new Map();
 for(const f of receipt.portable_inventory.files){
  if(!safeRel(f.path)||expectedFiles.has(f.path)||!HEX.test(f.sha256)||!Number.isSafeInteger(f.bytes)||
   f.bytes<0)fail('V32_PORTABLE_MANIFEST_ENTRY_INVALID');
  expectedFiles.set(f.path,f);
 }
 const actual=filesRecursive(root);
 if(!same(actual,[...expectedFiles.keys()].sort()))fail('V32_PORTABLE_FILE_INVENTORY_MISMATCH');
 let bytes=0,actualFileCount=0;
 for(const [rel,record] of expectedFiles){
  const location=resolve(root,...rel.split('/'));
  if(!inside(root,location)||!lstatSync(location).isFile()||
    lstatSync(location).size!==record.bytes||(await fileHash(location))!==record.sha256)
   fail('V32_PORTABLE_FILE_CONTENT_MISMATCH:'+rel);
  bytes+=record.bytes;actualFileCount++;
 }
 if(receipt.portable_inventory.file_count!==actualFileCount||
    receipt.portable_inventory.total_bytes!==bytes)fail('V32_PORTABLE_INVENTORY_TOTAL_MISMATCH');
 for(const name of ['MPC-Workspace.exe','resources/app.asar']){
  const value=receipt.portable_inventory.important_files[name];
  if(!value||expectedFiles.get(name)?.sha256!==value.sha256||
    expectedFiles.get(name)?.bytes!==value.bytes)
   fail('V32_PORTABLE_IMPORTANT_FILE_MISMATCH:'+name);
 }
 const internal=jsonFile(join(root,'build-receipt.json'));
 if(internal.format_version!==receipt.format_version||
  internal.source?.commit!==receipt.source?.commit||
  !same(internal.staged,receipt.staged)||
  !same(internal.payload_inventory,receipt.payload_inventory))
  fail('V32_INTERNAL_EXTERNAL_BUILD_RECEIPT_MISMATCH');
 const staged=new Map();
 for(const f of receipt.staged.files){
  if(!safeRel(f.path)||staged.has(f.path)||!HEX.test(f.sha256))
   fail('V32_STAGED_SOURCE_MANIFEST_INVALID');
  staged.set(f.path,f);
 }
 const extract=asar??getPackagerAsarV32();
 if(typeof extract.extractFile!=='function')fail('V32_ASAR_EXTRACTOR_INVALID');
 const appAsar=resolve(root,'resources','app.asar');
 let verifiedStagedFiles=0;
 for(const [name,f] of staged){
  let bytes;
  try{bytes=extract.extractFile(appAsar,name);}
  catch{fail('V32_ASAR_REQUIRED_FILE_MISSING:'+name)}
  if(!Buffer.isBuffer(bytes)||bytes.length!==f.bytes||sha(bytes)!==f.sha256)
   fail('V32_ASAR_STAGED_SOURCE_HASH_MISMATCH:'+name);
  verifiedStagedFiles++;
 }
 const embedded=JSON.parse(extract.extractFile(appAsar,'package.json').toString('utf8'));
 if(embedded.mpcWorkspaceBuild?.source_commit!==expectedSourceCommit||
    embedded.mpcWorkspaceBuild?.source_dirty!==false||
    embedded.mpcWorkspaceBuild?.target!=='win32-x64')
  fail('V32_ASAR_EMBEDDED_SOURCE_IDENTITY_INVALID');
 let rendererFilesVerified=0;
 for(const name of REQUIRED_RUNTIME_FILES){
  const expected=stagedFile(staged,name);
  if(!name.startsWith('desktop/renderer/'))continue;
  const rel=name.slice('desktop/renderer/'.length);
  const diskFile=resolve(root,'resources','mpc-workspace-renderer',...rel.split('/'));
  if(!existsSync(diskFile)||lstatSync(diskFile).size!==expected.bytes||
   (await fileHash(diskFile))!==expected.sha256)
   fail('V32_EXTERNAL_RENDERER_SOURCE_MISMATCH:'+rel);
  rendererFilesVerified++;
 }
 for(const name of REQUIRED_RUNTIME_FILES)stagedFile(staged,name);
 let zip=null;
 if(receipt.zip!==null){
  if(!obj(receipt.zip)||!HEX.test(receipt.zip.sha256)||
   typeof zipPath!=='string'||!existsSync(resolve(zipPath))||
   (await fileHash(resolve(zipPath)))!==receipt.zip.sha256||
   lstatSync(resolve(zipPath)).size!==receipt.zip.bytes)
   fail('V32_ZIP_DIGEST_MISMATCH');
  zip={name:receipt.zip.name,sha256:receipt.zip.sha256,bytes:receipt.zip.bytes};
 }
 return {version:v32PortableContract.version,status:'PACKAGED_SOURCE_BYTES_VERIFIED',
  source_commit:expectedSourceCommit,portable_inventory_checked:actualFileCount,
  portable_bytes_checked:bytes,asar_files_verified:verifiedStagedFiles,
  renderer_files_verified:rendererFilesVerified,
  required_v31_modules:REQUIRED_RUNTIME_FILES.filter(x=>x.includes('v31-')),
  source_identity_inside_asar:true,internal_and_external_receipts_matched:true,
  portable_app_asar_sha256:expectedFiles.get('resources/app.asar').sha256,
  portable_executable_sha256:expectedFiles.get('MPC-Workspace.exe').sha256,
  zip,verified_runtime_package:true,source_authentication_via_git_identity:true,
  native_windows_gui_exercised:false,real_user_source_acquired:false};
}
function argumentsFrom(argv){
 const r={};
 for(let i=0;i<argv.length;i+=2){
  if(!['--portable','--receipt','--source-commit','--zip','--output'].includes(argv[i])||
   argv[i+1]===undefined||Object.hasOwn(r,argv[i]))fail('V32_CLI_ARGUMENTS_INVALID');
  r[argv[i]]=argv[i+1];
 }
 return r;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const a=argumentsFrom(process.argv.slice(2));
  const result=await verifyPortableBuildV32({
   portableRoot:a['--portable'],receiptPath:a['--receipt'],
   expectedSourceCommit:a['--source-commit'],zipPath:a['--zip']??null});
  const content=JSON.stringify(result,null,2)+'\n';
  if(a['--output']){
   const {writeFileSync}=await import('node:fs');
   writeFileSync(resolve(a['--output']),content,{flag:'wx'});
  }
  process.stdout.write(content);
 }catch(e){
  process.stderr.write(JSON.stringify({status:'FAIL',code:String(e?.message??e).slice(0,220)})+'\n');
  process.exitCode=1;
 }
}
