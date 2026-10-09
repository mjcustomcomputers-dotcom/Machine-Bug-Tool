#!/usr/bin/env node

import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,extname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {prepareMpcOcrRuntime} from './prepare-mpc-ocr-runtime.mjs';

export const ELECTRON_VERSION='44.5.1';
export const ELECTRON_BUNDLED_NODE_VERSION='24.21.0';
export const PACKAGER_VERSION='20.3.0';
export const TARGET_PLATFORM='win32';
export const TARGET_ARCH='x64';
export const PORTABLE_NAME='MPC-Workspace';
export const MINIMUM_SUPPORTED_WINDOWS='Windows 10 x64 or later';

const MODULE_ROOT=dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE_ROOT=resolve(MODULE_ROOT,'..');
const MAX_RUNTIME_FILE_BYTES=32*1024*1024;
const MAX_STAGED_SOURCE_BYTES=96*1024*1024;
const SOURCE_EXTENSIONS=new Set(['.cjs','.cmd','.css','.html','.js','.json','.mjs','.png','.ps1','.sql','.svg','.txt','.webp','.woff2']);
const CODE_EXTENSIONS=['','.mjs','.js','.cjs','.json'];
const ENTRY_FILES=Object.freeze([
  'desktop/main.mjs',
  'desktop/preload.cjs',
  'scripts/mpc-workspace-server.mjs',
]);
const ASSET_DIRECTORIES=Object.freeze([
  'desktop/renderer',
  'command-center-build/config',
  'command-center-build/sql',
  'command-center-build/research',
  'method-atlas',
]);
const LAUNCHERS=Object.freeze(['MPC-Workspace.cmd','MPC-Workspace.ps1']);

function fail(code){throw Object.assign(new Error(code),{code})}

function portableRelative(value){return value.split(sep).join('/')}

function inside(root,path){
  const rel=relative(root,path);
  return rel!==''&&!rel.startsWith(`..${sep}`)&&rel!=='..'&&!isAbsolute(rel);
}
function safeSourcePath(root,relativePath){
  if(typeof relativePath!=='string'||!relativePath||relativePath.includes('\0'))fail('MPC_WORKSPACE_PACKAGE_PATH_INVALID');
  const absolute=resolve(root,relativePath);
  if(!inside(root,absolute))fail('MPC_WORKSPACE_PACKAGE_PATH_OUTSIDE_ROOT');
  const stat=lstatSync(absolute);
  if(stat.isSymbolicLink()||!stat.isFile())fail('MPC_WORKSPACE_PACKAGE_REGULAR_FILE_REQUIRED');
  if(stat.size>MAX_RUNTIME_FILE_BYTES)fail('MPC_WORKSPACE_PACKAGE_FILE_TOO_LARGE');
  const canonical=realpathSync(absolute);
  if(!inside(root,canonical))fail('MPC_WORKSPACE_PACKAGE_REALPATH_OUTSIDE_ROOT');
  return {absolute:canonical,stat};
}
function resolveRelativeImport(sourceRoot,fromRelative,specifier){
  const base=resolve(sourceRoot,dirname(fromRelative),specifier);
  if(!inside(sourceRoot,base)&&base!==sourceRoot)fail('MPC_WORKSPACE_PACKAGE_IMPORT_OUTSIDE_ROOT');
  for(const suffix of CODE_EXTENSIONS){
    const candidate=`${base}${suffix}`;
    if(!existsSync(candidate))continue;
    const stat=lstatSync(candidate);
    if(stat.isSymbolicLink()||!stat.isFile())fail('MPC_WORKSPACE_PACKAGE_IMPORT_REGULAR_FILE_REQUIRED');
    const canonical=realpathSync(candidate);
    if(!inside(sourceRoot,canonical))fail('MPC_WORKSPACE_PACKAGE_IMPORT_OUTSIDE_ROOT');
    return portableRelative(relative(sourceRoot,candidate));
  }
  fail(`MPC_WORKSPACE_PACKAGE_IMPORT_NOT_FOUND:${specifier}`);
}

export function localRuntimeSpecifiers(source){
  const found=[];
  const expressions=[
    /(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"](\.{1,2}\/[^'"]+)['"]/gu,
    /import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/gu,
    /new\s+URL\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/gu,
  ];
  for(const expression of expressions){
    for(const match of source.matchAll(expression))found.push(match[1]);
  }
  return [...new Set(found)];
}

function walkSelectedDirectory(sourceRoot,relativeDirectory,{trackedFiles=null}={}){
  const directory=resolve(sourceRoot,relativeDirectory);
  if(!inside(sourceRoot,directory))fail('MPC_WORKSPACE_PACKAGE_DIRECTORY_OUTSIDE_ROOT');
  const rootStat=lstatSync(directory);
  if(rootStat.isSymbolicLink()||!rootStat.isDirectory())fail('MPC_WORKSPACE_PACKAGE_DIRECTORY_REQUIRED');
  if(!inside(sourceRoot,realpathSync(directory)))fail('MPC_WORKSPACE_PACKAGE_DIRECTORY_OUTSIDE_ROOT');
  const files=[];
  const visit=current=>{
    for(const entry of readdirSync(current,{withFileTypes:true}).sort((left,right)=>left.name.localeCompare(right.name))){
      const absolute=join(current,entry.name);
      if(entry.isSymbolicLink())fail('MPC_WORKSPACE_PACKAGE_SYMLINK_REJECTED');
      if(entry.isDirectory()){visit(absolute);continue}
      if(!entry.isFile())fail('MPC_WORKSPACE_PACKAGE_REGULAR_FILE_REQUIRED');
      const extension=extname(entry.name).toLowerCase();
      if(!SOURCE_EXTENSIONS.has(extension))fail(`MPC_WORKSPACE_PACKAGE_ASSET_TYPE_REJECTED:${extension||'none'}`);
      const relativeFile=portableRelative(relative(sourceRoot,absolute));
      if(trackedFiles===null||trackedFiles.has(relativeFile))files.push(relativeFile);
    }
  };
  visit(directory);
  return files;
}

function gitValue(root,args,fallback){
  const result=spawnSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});
  return result.status===0&&result.stdout.trim()?result.stdout.trim():fallback;
}

export function sourceIdentity(root){
  const commit=gitValue(root,['rev-parse','HEAD'],'UNKNOWN');
  const status=spawnSync('git',['status','--porcelain=v1','--untracked-files=normal'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});
  return {commit,dirty:status.status!==0||Boolean(status.stdout.trim())};
}

function trackedSourceFiles(root){
  const result=spawnSync('git',['ls-files','-z','--cached'],{cwd:root,encoding:'buffer',stdio:['ignore','pipe','ignore']});
  if(result.status!==0)fail('MPC_WORKSPACE_PACKAGE_TRACKED_FILES_UNAVAILABLE');
  return new Set(result.stdout.toString('utf8').split('\0').filter(Boolean).map(portableRelative));
}

export function stageMpcWorkspaceApplication({sourceRoot=DEFAULT_SOURCE_ROOT,stageRoot,entryFiles=ENTRY_FILES,
  assetDirectories=ASSET_DIRECTORIES,requireTracked=false}={}){
  if(!stageRoot)fail('MPC_WORKSPACE_PACKAGE_STAGE_REQUIRED');
  const source=realpathSync(sourceRoot);
  const stage=resolve(stageRoot);
  if(stage===source||inside(source,stage))fail('MPC_WORKSPACE_PACKAGE_STAGE_MUST_BE_OUTSIDE_SOURCE');
  mkdirSync(stage,{recursive:false,mode:0o700});
  const trackedFiles=requireTracked?trackedSourceFiles(source):null;
  if(trackedFiles!==null&&!trackedFiles.has('package.json'))fail('MPC_WORKSPACE_PACKAGE_MANIFEST_NOT_TRACKED');
  const queue=[...entryFiles];
  const selected=new Set();
  for(const directory of assetDirectories){
    for(const file of walkSelectedDirectory(source,directory,{trackedFiles}))selected.add(file);
  }
  while(queue.length){
    const relativeFile=portableRelative(queue.shift());
    if(selected.has(relativeFile))continue;
    if(trackedFiles!==null&&!trackedFiles.has(relativeFile))fail(`MPC_WORKSPACE_PACKAGE_SOURCE_NOT_TRACKED:${relativeFile}`);
    const {absolute}=safeSourcePath(source,relativeFile);
    selected.add(relativeFile);
    if(!['.mjs','.js','.cjs'].includes(extname(relativeFile).toLowerCase()))continue;
    const body=readFileSync(absolute,'utf8');
    for(const specifier of localRuntimeSpecifiers(body))queue.push(resolveRelativeImport(source,relativeFile,specifier));
  }
  let totalBytes=0;
  const stagedFiles=[];
  for(const relativeFile of [...selected].sort()){
    const {absolute,stat}=safeSourcePath(source,relativeFile);
    totalBytes+=stat.size;
    if(totalBytes>MAX_STAGED_SOURCE_BYTES)fail('MPC_WORKSPACE_PACKAGE_STAGE_TOO_LARGE');
    const destination=resolve(stage,relativeFile);
    if(!inside(stage,destination))fail('MPC_WORKSPACE_PACKAGE_DESTINATION_OUTSIDE_STAGE');
    mkdirSync(dirname(destination),{recursive:true,mode:0o700});
    copyFileSync(absolute,destination);
    stagedFiles.push({path:relativeFile,bytes:stat.size,sha256:createHash('sha256').update(readFileSync(absolute)).digest('hex')});
  }
  const rootPackage=JSON.parse(readFileSync(resolve(source,'package.json'),'utf8'));
  if(typeof rootPackage.version!=='string'||!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u.test(rootPackage.version)){
    fail('MPC_WORKSPACE_PACKAGE_VERSION_INVALID');
  }
  const identity=sourceIdentity(source);
  const packagedManifest={
    name:'mpc-workspace',
    productName:'MPC Workspace',
    version:rootPackage.version,
    private:true,
    type:'module',
    main:'desktop/main.mjs',
    mpcWorkspaceBuild:{
      source_commit:identity.commit,
      source_dirty:identity.dirty,
      electron:ELECTRON_VERSION,
      electron_bundled_node:ELECTRON_BUNDLED_NODE_VERSION,
      target:`${TARGET_PLATFORM}-${TARGET_ARCH}`,
    },
  };
  writeFileSync(resolve(stage,'package.json'),`${JSON.stringify(packagedManifest,null,2)}\n`,{encoding:'utf8',flag:'wx',mode:0o600});
  return {stage,selected_files:[...selected].sort(),staged_files:stagedFiles,selected_bytes:totalBytes,
    version:rootPackage.version,source:identity};
}

function parseArguments(argv){
  const result={};
  for(let index=0;index<argv.length;index+=1){
    const argument=argv[index];
    if(argument==='--no-zip'){if(result.noZip)fail('MPC_WORKSPACE_PACKAGE_ARGUMENT_DUPLICATE');result.noZip=true;continue}
    if(argument!=='--output-dir'||result.outputDir||index+1>=argv.length)fail('MPC_WORKSPACE_PACKAGE_ARGUMENT_INVALID');
    result.outputDir=argv[++index];
  }
  return result;
}

function utcBuildName(){return new Date().toISOString().replaceAll(/[-:.]/gu,'').replace('Z','Z')+`-${randomBytes(3).toString('hex')}`}

async function sha256File(path){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(path))hash.update(chunk);
  return hash.digest('hex');
}

function allRegularFiles(root){
  const files=[];
  const visit=current=>{
    for(const entry of readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      const absolute=join(current,entry.name);
      if(entry.isSymbolicLink())fail('MPC_WORKSPACE_PACKAGE_OUTPUT_SYMLINK_REJECTED');
      if(entry.isDirectory())visit(absolute);
      else if(entry.isFile())files.push(absolute);
      else fail('MPC_WORKSPACE_PACKAGE_OUTPUT_REGULAR_FILE_REQUIRED');
    }
  };
  visit(root);
  return files;
}

async function portableInventory(root){
  const files=allRegularFiles(root);
  let bytes=0;
  const manifest=[];
  for(const file of files){
    const size=statSync(file).size;
    bytes+=size;
    manifest.push({path:portableRelative(relative(root,file)),bytes:size,sha256:await sha256File(file)});
  }
  const important={};
  for(const relativePath of [`${PORTABLE_NAME}.exe`,'resources/app.asar']){
    const path=resolve(root,relativePath);
    if(!existsSync(path))fail(`MPC_WORKSPACE_PACKAGE_OUTPUT_MISSING:${relativePath}`);
    important[relativePath]={bytes:statSync(path).size,sha256:await sha256File(path)};
  }
  return {file_count:files.length,total_bytes:bytes,files:manifest,important_files:important};
}

function copyLaunchers(sourceRoot,portableRoot){
  for(const launcher of LAUNCHERS){
    const source=safeSourcePath(sourceRoot,launcher).absolute;
    copyFileSync(source,resolve(portableRoot,launcher));
  }
  const readme=`MPC Workspace portable build for Windows x64\r\nMinimum supported system: ${MINIMUM_SUPPORTED_WINDOWS}\r\n\r\n1. Extract the complete ZIP to a folder you control.\r\n2. Double-click MPC-Workspace.exe.\r\n3. If Windows exits before the window appears, run MPC-Workspace.cmd; it retains the error.\r\n4. Project data and logs stay outside this application folder under your Windows profile.\r\n\r\nThis portable artifact is not code-signed. It does not change PowerShell execution policy, install Node, deploy the Site, or copy credentials. Native Windows launch and model checks must be recorded on the receiving Windows machine.\r\n`;
  writeFileSync(resolve(portableRoot,'README-FIRST.txt'),readme,{encoding:'utf8',flag:'wx',mode:0o600});
}

function copyExternalRenderer(stageRoot,portableRoot){
  const destinationRoot=resolve(portableRoot,'resources','mpc-workspace-renderer');
  mkdirSync(destinationRoot,{recursive:true,mode:0o700});
  for(const relativeFile of walkSelectedDirectory(stageRoot,'desktop/renderer')){
    const source=safeSourcePath(stageRoot,relativeFile).absolute;
    const rendererRelative=portableRelative(relative(resolve(stageRoot,'desktop/renderer'),resolve(stageRoot,relativeFile)));
    const destination=resolve(destinationRoot,rendererRelative);
    if(!inside(destinationRoot,destination))fail('MPC_WORKSPACE_RENDERER_DESTINATION_OUTSIDE_ROOT');
    mkdirSync(dirname(destination),{recursive:true,mode:0o700});
    copyFileSync(source,destination);
  }
}

function zipPortable(buildRoot,portableRoot,version){
  const zipName=`MPC-Workspace-${version}-windows-x64-portable.zip`;
  const zipPath=resolve(buildRoot,zipName);
  const result=spawnSync('zip',['-q','-X','-9','-r',zipName,basename(portableRoot)],{
    cwd:buildRoot,
    encoding:'utf8',
    stdio:['ignore','pipe','pipe'],
  });
  if(result.error?.code==='ENOENT')fail('MPC_WORKSPACE_ZIP_TOOL_UNAVAILABLE_USE_PORTABLE_DIRECTORY');
  if(result.status!==0)throw Object.assign(new Error(`MPC_WORKSPACE_ZIP_FAILED:${String(result.stderr??'').slice(0,400)}`),{code:'MPC_WORKSPACE_ZIP_FAILED'});
  return zipPath;
}

export async function packageMpcWorkspaceWindows({sourceRoot=DEFAULT_SOURCE_ROOT,outputDir,noZip=false}={}){
  const source=realpathSync(sourceRoot);
  const initialIdentity=sourceIdentity(source);
  if(!/^[0-9a-f]{40}$/u.test(initialIdentity.commit))fail('MPC_WORKSPACE_PACKAGE_SOURCE_COMMIT_REQUIRED');
  if(initialIdentity.dirty)fail('MPC_WORKSPACE_PACKAGE_CLEAN_SOURCE_REQUIRED');
  const buildRoot=resolve(outputDir??resolve(source,'.sites-runtime','mpc-workspace-windows',utcBuildName()));
  if(existsSync(buildRoot))fail('MPC_WORKSPACE_PACKAGE_OUTPUT_ALREADY_EXISTS');
  mkdirSync(dirname(buildRoot),{recursive:true,mode:0o700});
  mkdirSync(buildRoot,{recursive:false,mode:0o700});
  const stage=mkdtempSync(join(tmpdir(),'mpc-workspace-stage-'));
  try{
    const staged=stageMpcWorkspaceApplication({sourceRoot:source,stageRoot:resolve(stage,'app'),
      entryFiles:[...ENTRY_FILES,...LAUNCHERS],requireTracked:true});
    const stagedIdentity=sourceIdentity(source);
    if(stagedIdentity.dirty||stagedIdentity.commit!==initialIdentity.commit)fail('MPC_WORKSPACE_PACKAGE_SOURCE_CHANGED_DURING_STAGE');
    const packagerModule=await import('@electron/packager');
    if(typeof packagerModule.packager!=='function')fail('MPC_WORKSPACE_ELECTRON_PACKAGER_EXPORT_MISSING');
    const packaged=await packagerModule.packager({
      dir:staged.stage,
      name:PORTABLE_NAME,
      executableName:PORTABLE_NAME,
      platform:TARGET_PLATFORM,
      arch:TARGET_ARCH,
      electronVersion:ELECTRON_VERSION,
      out:buildRoot,
      overwrite:false,
      asar:true,
      prune:false,
      download:{cacheRoot:resolve(source,'.sites-runtime','electron-cache')},
    });
    if(!Array.isArray(packaged)||packaged.length!==1)fail('MPC_WORKSPACE_PACKAGE_OUTPUT_COUNT_INVALID');
    const portableRoot=resolve(packaged[0]);
    if(!inside(buildRoot,portableRoot))fail('MPC_WORKSPACE_PACKAGE_OUTPUT_OUTSIDE_BUILD_ROOT');
    copyExternalRenderer(staged.stage,portableRoot);
    copyLaunchers(staged.stage,portableRoot);
    if(!trackedSourceFiles(source).has('lib/mpc-screen-ocr-worker.cjs'))fail('MPC_WORKSPACE_OCR_WORKER_NOT_TRACKED');
    const ocrAssets=prepareMpcOcrRuntime({sourceRoot:source,
      outputDir:resolve(portableRoot,'resources','mpc-ocr'),
      workerPath:safeSourcePath(source,'lib/mpc-screen-ocr-worker.cjs').absolute});
    const packagedIdentity=sourceIdentity(source);
    if(packagedIdentity.dirty||packagedIdentity.commit!==initialIdentity.commit){
      fail('MPC_WORKSPACE_PACKAGE_SOURCE_CHANGED_DURING_BUILD');
    }
    const payloadInventory=await portableInventory(portableRoot);
    const receipt={
      format_version:'MPC_WORKSPACE_WINDOWS_PORTABLE_BUILD_1',
      built_at_utc:new Date().toISOString(),
      product:'MPC Workspace',
      version:staged.version,
      target:{platform:TARGET_PLATFORM,architecture:TARGET_ARCH},
      minimum_supported_windows:MINIMUM_SUPPORTED_WINDOWS,
      toolchain:{electron:ELECTRON_VERSION,electron_bundled_node:ELECTRON_BUNDLED_NODE_VERSION,electron_packager:PACKAGER_VERSION,builder_node:process.version,builder_platform:process.platform,builder_architecture:process.arch},
      source:staged.source,
      staged:{file_count:staged.staged_files.length,bytes:staged.selected_bytes,files:staged.staged_files},
      ocr_assets:ocrAssets.manifest,
      portable_directory:basename(portableRoot),
      payload_inventory:{...payloadInventory,excludes:['build-receipt.json']},
      code_signed:false,
      native_windows_execution_performed:false,
      native_windows_acceptance:'PENDING_RECEIVER_EXECUTION',
    };
    writeFileSync(resolve(portableRoot,'build-receipt.json'),`${JSON.stringify(receipt,null,2)}\n`,{encoding:'utf8',flag:'wx',mode:0o600});
    const zipPath=noZip?null:zipPortable(buildRoot,portableRoot,staged.version);
    const zipSha256=zipPath?await sha256File(zipPath):null;
    const finalInventory=await portableInventory(portableRoot);
    const externalReceiptPath=resolve(buildRoot,`MPC-Workspace-${staged.version}-windows-x64-build-receipt.json`);
    const externalReceipt={...receipt,portable_inventory:finalInventory,
      zip:zipPath?{name:basename(zipPath),bytes:statSync(zipPath).size,sha256:zipSha256}:null};
    writeFileSync(externalReceiptPath,`${JSON.stringify(externalReceipt,null,2)}\n`,{encoding:'utf8',flag:'wx',mode:0o600});
    const checksumPath=zipPath?`${zipPath}.sha256`:null;
    if(checksumPath)writeFileSync(checksumPath,`${zipSha256}  ${basename(zipPath)}\n`,{encoding:'utf8',flag:'wx',mode:0o600});
    const result={...externalReceipt,zip_path:zipPath,zip_sha256:zipSha256,
      external_receipt_path:externalReceiptPath,checksum_path:checksumPath};
    process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
    return result;
  }finally{
    rmSync(stage,{recursive:true,force:true});
  }
}

const calledAsMain=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(calledAsMain){
  try{
    const args=parseArguments(process.argv.slice(2));
    await packageMpcWorkspaceWindows({outputDir:args.outputDir,noZip:Boolean(args.noZip)});
  }catch(error){
    process.stderr.write(`${JSON.stringify({status:'ERROR',error:errorCodeForOutput(error)})}\n`);
    process.exitCode=1;
  }
}

function errorCodeForOutput(error){
  return String(error?.code??error?.message??'MPC_WORKSPACE_PACKAGE_FAILED').replace(/[\u0000-\u001f\u007f]/gu,' ').slice(0,500);
}
