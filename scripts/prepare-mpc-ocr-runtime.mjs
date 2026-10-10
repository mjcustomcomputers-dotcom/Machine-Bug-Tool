#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,lstatSync,mkdirSync,readdirSync,readFileSync,realpathSync,statSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const OCR_PACKAGE_VERSIONS=Object.freeze({
  'tesseract.js':'6.0.1',
  'tesseract.js-core':'6.0.0',
  '@tesseract.js-data/eng':'1.0.0',
});
export const OCR_CORE_FILES=Object.freeze([
  'tesseract-core.wasm.js','tesseract-core.wasm',
  'tesseract-core-simd.wasm.js','tesseract-core-simd.wasm',
  'tesseract-core-lstm.wasm.js','tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js','tesseract-core-simd-lstm.wasm',
]);
const DEFAULT_SOURCE_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const MAX_FILE_BYTES=64*1024*1024;
const MAX_ASSET_BYTES=192*1024*1024;
const MAX_PACKAGE_COUNT=64;

function fail(code){throw Object.assign(new Error(code),{code});}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const portable=path=>path.split(sep).join('/');
function inside(root,path){const rel=relative(root,path);return rel!==''&&rel!=='..'&&!rel.startsWith(`..${sep}`)&&!isAbsolute(rel);}
function packageName(name){
  if(typeof name!=='string'||!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(name))fail('MPC_OCR_PACKAGE_NAME_INVALID');
  return name;
}
function loadPackage(name,from){
  packageName(name);
  const require=createRequire(from);
  let manifest;
  try{manifest=require.resolve(`${name}/package.json`);}
  catch(error){
    if(error.code!=='ERR_PACKAGE_PATH_NOT_EXPORTED')fail(`MPC_OCR_INSTALLED_PACKAGE_MISSING:${name}`);
    let entry;
    try{entry=require.resolve(name);}catch{fail(`MPC_OCR_INSTALLED_PACKAGE_MISSING:${name}`);}
    for(let current=dirname(realpathSync(entry));;current=dirname(current)){
      const candidate=resolve(current,'package.json');
      if(existsSync(candidate)&&JSON.parse(readFileSync(candidate,'utf8')).name===name){manifest=candidate;break;}
      if(dirname(current)===current)fail(`MPC_OCR_PACKAGE_MANIFEST_MISSING:${name}`);
    }
  }
  const path=realpathSync(manifest);
  const data=JSON.parse(readFileSync(path,'utf8'));
  if(data.name!==name||typeof data.version!=='string')fail(`MPC_OCR_PACKAGE_IDENTITY_MISMATCH:${name}`);
  return {root:dirname(path),manifest:path,data};
}

/** Copy the locked installed packages as real files; runtime preparation performs no network requests. */
export function prepareMpcOcrRuntime({sourceRoot=DEFAULT_SOURCE_ROOT,outputDir,workerPath}={}){
  const source=realpathSync(sourceRoot);
  const sourceManifest=resolve(source,'package.json');
  const project=JSON.parse(readFileSync(sourceManifest,'utf8'));
  for(const [name,version] of Object.entries(OCR_PACKAGE_VERSIONS)){
    if((project.devDependencies?.[name]??project.dependencies?.[name])!==version)fail(`MPC_OCR_EXACT_PACKAGE_PIN_REQUIRED:${name}`);
  }
  const engine=loadPackage('tesseract.js',sourceManifest);
  const core=loadPackage('tesseract.js-core',sourceManifest);
  const language=loadPackage('@tesseract.js-data/eng',sourceManifest);
  for(const item of [engine,core,language]){
    if(item.data.version!==OCR_PACKAGE_VERSIONS[item.data.name])fail(`MPC_OCR_PACKAGE_VERSION_MISMATCH:${item.data.name}`);
  }
  const root=resolve(outputDir??resolve(source,'.sites-runtime','mpc-ocr'));
  if(root===source||inside(root,source))fail('MPC_OCR_ASSET_ROOT_INVALID');
  if(existsSync(root))fail('MPC_OCR_ASSET_ROOT_ALREADY_EXISTS');
  mkdirSync(root,{recursive:true,mode:0o700});
  let totalBytes=0;
  const files=[];
  const packages=new Map();
  const copiedRoots=new Map();
  function copyFile(input,output){
    let stat;
    try{stat=lstatSync(input);}catch{fail('MPC_OCR_SOURCE_ASSET_MISSING');}
    if(!stat.isFile()||stat.isSymbolicLink())fail('MPC_OCR_SOURCE_REGULAR_FILE_REQUIRED');
    if(stat.size>MAX_FILE_BYTES)fail('MPC_OCR_SOURCE_FILE_TOO_LARGE');
    totalBytes+=stat.size;
    if(totalBytes>MAX_ASSET_BYTES)fail('MPC_OCR_ASSETS_TOO_LARGE');
    if(!inside(root,output))fail('MPC_OCR_DESTINATION_OUTSIDE_ROOT');
    mkdirSync(dirname(output),{recursive:true,mode:0o700});
    copyFileSync(input,output);
    files.push({path:portable(relative(root,output)),bytes:stat.size,sha256:hash(readFileSync(output))});
  }
  function copyTree(inputRoot,outputRoot){
    const visit=current=>{
      for(const entry of readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
        if(entry.name==='node_modules'||entry.name==='.git')continue;
        const absolute=resolve(current,entry.name);
        if(entry.isSymbolicLink())fail('MPC_OCR_PACKAGE_CONTENT_SYMLINK_REJECTED');
        if(entry.isDirectory()){visit(absolute);continue;}
        if(!entry.isFile())fail('MPC_OCR_SOURCE_REGULAR_FILE_REQUIRED');
        copyFile(absolute,resolve(outputRoot,relative(inputRoot,absolute)));
      }
    };
    visit(inputRoot);
  }
  function visitPackage(item){
    const name=packageName(item.data.name);
    if(packages.has(name)){
      if(packages.get(name).version!==item.data.version)fail(`MPC_OCR_DEPENDENCY_VERSION_CONFLICT:${name}`);
      return;
    }
    if(packages.size>=MAX_PACKAGE_COUNT)fail('MPC_OCR_DEPENDENCY_COUNT_EXCEEDED');
    if(OCR_PACKAGE_VERSIONS[name]&&item.data.version!==OCR_PACKAGE_VERSIONS[name])fail(`MPC_OCR_PACKAGE_VERSION_MISMATCH:${name}`);
    packages.set(name,{name,version:item.data.version,license:item.data.license??null,
      dependencies:Object.keys(item.data.dependencies??{}).sort()});
    const destination=resolve(root,'node_modules',name);
    copiedRoots.set(name,destination);
    copyTree(item.root,destination);
    for(const dependency of Object.keys(item.data.dependencies??{}).sort())visitPackage(loadPackage(dependency,item.manifest));
  }
  visitPackage(engine);
  visitPackage(core);
  for(const path of ['src/index.js','src/worker-script/node/index.js']){
    if(!existsSync(resolve(copiedRoots.get('tesseract.js'),path)))fail(`MPC_OCR_ENGINE_ASSET_MISSING:${path}`);
  }
  for(const path of OCR_CORE_FILES){
    const file=resolve(copiedRoots.get('tesseract.js-core'),path);
    if(!existsSync(file)||!statSync(file).isFile()||statSync(file).size===0)fail(`MPC_OCR_CORE_ASSET_MISSING:${path}`);
  }
  copyFile(resolve(language.root,'4.0.0','eng.traineddata.gz'),resolve(root,'tessdata','eng.traineddata.gz'));
  copyFile(language.manifest,resolve(root,'licenses','tesseract-eng','package.json'));
  for(const entry of readdirSync(language.root)){
    if(/^(?:license|copying|readme)(?:\.|$)/iu.test(entry)&&lstatSync(resolve(language.root,entry)).isFile()){
      copyFile(resolve(language.root,entry),resolve(root,'licenses','tesseract-eng',entry));
    }
  }
  const worker=resolve(workerPath??resolve(source,'lib','mpc-screen-ocr-worker.cjs'));
  copyFile(worker,resolve(root,'mpc-screen-ocr-worker.cjs'));
  const manifest={
    format_version:'MPC_SCREEN_OCR_ASSETS_1',
    engine:{name:'tesseract.js',version:OCR_PACKAGE_VERSIONS['tesseract.js']},
    core:{name:'tesseract.js-core',version:OCR_PACKAGE_VERSIONS['tesseract.js-core']},
    language:{code:'eng',name:'@tesseract.js-data/eng',version:OCR_PACKAGE_VERSIONS['@tesseract.js-data/eng'],source_path:'4.0.0/eng.traineddata.gz'},
    network_required_at_runtime:false,
    package_manager:'pnpm@11.25.0',
    source_package_sha256:hash(readFileSync(sourceManifest)),
    source_lockfile_sha256:hash(readFileSync(resolve(source,'pnpm-lock.yaml'))),
    production_packages:[...packages.values()].sort((a,b)=>a.name.localeCompare(b.name)),
    materialization:'REGULAR_FILES_NO_SYMLINKS',
    asset_bytes:totalBytes,
    file_count:files.length,
    files:files.sort((a,b)=>a.path.localeCompare(b.path)),
  };
  writeFileSync(resolve(root,'asset-manifest.json'),`${JSON.stringify(manifest,null,2)}\n`,{encoding:'utf8',flag:'wx',mode:0o600});
  return {root,manifest};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{
    const args=process.argv.slice(2);
    if(args.length!==0&&(args.length!==2||args[0]!=='--output-dir'))fail('MPC_OCR_PREPARE_ARGUMENT_INVALID');
    const result=prepareMpcOcrRuntime({outputDir:args[1]});
    process.stdout.write(`${JSON.stringify({status:'PREPARED',asset_root:result.root,file_count:result.manifest.file_count,
      asset_bytes:result.manifest.asset_bytes,engine:result.manifest.engine,language:result.manifest.language.code})}\n`);
  }catch(error){
    process.stderr.write(`${JSON.stringify({status:'ERROR',error:String(error?.code??error?.message??'MPC_OCR_PREPARE_FAILED').slice(0,400)})}\n`);
    process.exitCode=1;
  }
}
