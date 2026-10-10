import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import test from 'node:test';
import {OCR_CORE_FILES,OCR_PACKAGE_VERSIONS,prepareMpcOcrRuntime} from '../scripts/prepare-mpc-ocr-runtime.mjs';
import {inspectScreenOcrAssets} from '../lib/mpc-screen-ocr.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(t){
  const temporary=mkdtempSync(join(tmpdir(),'mpc-ocr-package-test-'));
  t.after(()=>rmSync(temporary,{recursive:true,force:true}));
  const source=resolve(temporary,'source');
  const output=resolve(temporary,'assets');
  const put=(path,content='fixture')=>{
    const file=resolve(source,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,content);return file;
  };
  put('package.json',JSON.stringify({name:'mpc-fixture',devDependencies:OCR_PACKAGE_VERSIONS}));
  put('pnpm-lock.yaml','fixture lockfile; no package manager executes in this test');
  put('lib/mpc-screen-ocr-worker.cjs','/* offline worker fixture */');
  put('node_modules/tesseract.js/package.json',JSON.stringify({name:'tesseract.js',version:'6.0.1',license:'Apache-2.0',
    dependencies:{'tesseract.js-core':'^6.0.0','fixture-helper':'1.0.0'}}));
  put('node_modules/tesseract.js/src/index.js');
  put('node_modules/tesseract.js/src/worker-script/node/index.js');
  put('node_modules/tesseract.js/LICENSE','engine license');
  put('node_modules/tesseract.js-core/package.json',JSON.stringify({name:'tesseract.js-core',version:'6.0.0'}));
  for(const file of OCR_CORE_FILES)put(`node_modules/tesseract.js-core/${file}`);
  put('node_modules/fixture-helper/package.json',JSON.stringify({name:'fixture-helper',version:'1.0.0',
    dependencies:{'fixture-leaf':'1.0.0'}}));
  put('node_modules/fixture-helper/index.js','module.exports=require("fixture-leaf");');
  put('node_modules/fixture-leaf/package.json',JSON.stringify({name:'fixture-leaf',version:'1.0.0'}));
  put('node_modules/fixture-leaf/index.js','module.exports=true;');
  put('node_modules/@tesseract.js-data/eng/package.json',JSON.stringify({name:'@tesseract.js-data/eng',version:'1.0.0'}));
  put('node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz','trained data fixture');
  put('node_modules/@tesseract.js-data/eng/README.md','language license and source');
  return {temporary,source,output,put,run:()=>prepareMpcOcrRuntime({sourceRoot:source,outputDir:output})};
}

test('OCR asset preparation closes the production dependency graph with exact hashes and all core variants',t=>{
  const f=fixture(t);
  const {root,manifest}=f.run();
  assert.equal(root,f.output);
  assert.equal(manifest.network_required_at_runtime,false);
  assert.equal(manifest.materialization,'REGULAR_FILES_NO_SYMLINKS');
  assert.deepEqual(manifest.production_packages.map(item=>item.name),['fixture-helper','fixture-leaf','tesseract.js','tesseract.js-core']);
  assert.equal(manifest.source_lockfile_sha256,hash(readFileSync(resolve(f.source,'pnpm-lock.yaml'))));
  assert.equal(manifest.file_count,manifest.files.length);
  assert.equal(manifest.asset_bytes,manifest.files.reduce((sum,item)=>sum+item.bytes,0));
  for(const file of manifest.files){
    const path=resolve(root,file.path);
    assert.equal(lstatSync(path).isSymbolicLink(),false,file.path);
    const bytes=readFileSync(path);
    assert.equal(bytes.length,file.bytes,file.path);
    assert.equal(hash(bytes),file.sha256,file.path);
  }
  for(const name of OCR_CORE_FILES)assert.ok(existsSync(resolve(root,'node_modules','tesseract.js-core',name)));
  assert.equal(readFileSync(resolve(root,'tessdata','eng.traineddata.gz'),'utf8'),'trained data fixture');
  assert.ok(existsSync(resolve(root,'node_modules','tesseract.js','LICENSE')));
  assert.ok(existsSync(resolve(root,'licenses','tesseract-eng','README.md')));
  assert.equal(inspectScreenOcrAssets(root).assets_ready,true);
  assert.throws(f.run,/MPC_OCR_ASSET_ROOT_ALREADY_EXISTS/u);
});

test('OCR dependency symlinks are materialized into a standalone graph without pnpm store references',t=>{
  const f=fixture(t);
  const nodeModules=resolve(f.source,'node_modules');
  const external=resolve(f.temporary,'fixture-store');mkdirSync(external);
  for(const [file,content] of [['package.json',JSON.stringify({name:'fixture-leaf',version:'1.0.0'})],['index.js','module.exports=true;']]){
    writeFileSync(resolve(external,file),content);
  }
  rmSync(resolve(nodeModules,'fixture-leaf'),{recursive:true});
  symlinkSync(external,resolve(nodeModules,'fixture-leaf'),'dir');
  const result=f.run();
  rmSync(external,{recursive:true});
  assert.equal(readFileSync(resolve(result.root,'node_modules','fixture-leaf','index.js'),'utf8'),'module.exports=true;');
  const visit=path=>{for(const file of readdirSync(path)){const absolute=resolve(path,file);const stat=lstatSync(absolute);
    assert.equal(stat.isSymbolicLink(),false,absolute);if(stat.isDirectory())visit(absolute);}};
  visit(result.root);
});

test('OCR preparation rejects an unpinned installed engine and a missing dependency before claiming assets ready',t=>{
  const f=fixture(t);
  f.put('node_modules/tesseract.js/package.json',JSON.stringify({name:'tesseract.js',version:'6.0.2'}));
  assert.throws(f.run,/MPC_OCR_PACKAGE_VERSION_MISMATCH/u);
  assert.equal(existsSync(f.output),false);
  f.put('node_modules/tesseract.js/package.json',JSON.stringify({name:'tesseract.js',version:'6.0.1',dependencies:{'missing-ocr-dependency':'1.0.0'}}));
  assert.throws(f.run,/MPC_OCR_INSTALLED_PACKAGE_MISSING:missing-ocr-dependency/u);
  assert.equal(existsSync(resolve(f.output,'asset-manifest.json')),false);
});

test('OCR preparation fails on a missing WASM variant or unexpected package-content symlink',t=>{
  const missing=fixture(t);
  rmSync(resolve(missing.source,'node_modules','tesseract.js-core','tesseract-core-simd-lstm.wasm'));
  assert.throws(missing.run,/MPC_OCR_CORE_ASSET_MISSING:tesseract-core-simd-lstm.wasm/u);
  const linked=fixture(t);
  symlinkSync(resolve(linked.source,'package.json'),resolve(linked.source,'node_modules','tesseract.js','unapproved-link.json'));
  assert.throws(linked.run,/MPC_OCR_PACKAGE_CONTENT_SYMLINK_REJECTED/u);
});

test('the checked-in dependency and delivery contracts retain policy and require real OCR verification',()=>{
  const project=JSON.parse(readFileSync(resolve(ROOT,'package.json'),'utf8'));
  for(const [name,version] of Object.entries(OCR_PACKAGE_VERSIONS))assert.equal(project.devDependencies[name],version);
  const policy=readFileSync(resolve(ROOT,'pnpm-workspace.yaml'),'utf8');
  assert.match(policy,/strictDepBuilds: true/u);
  assert.match(policy,/tesseract\.js: false/u);
  assert.match(policy,/minimumReleaseAge: 10080/u);
  const packaging=readFileSync(resolve(ROOT,'scripts','package-mpc-workspace-windows.mjs'),'utf8');
  assert.match(packaging,/resources','mpc-ocr/u);
  assert.match(packaging,/MPC_WORKSPACE_OCR_WORKER_NOT_TRACKED/u);
  assert.match(packaging,/ocr_assets:ocrAssets\.manifest/u);
  const workflow=readFileSync(resolve(ROOT,'.github','workflows','mpc-workspace-windows-portable.yml'),'utf8');
  assert.match(workflow,/feature\/mpc-screen-ocr-20261009/u);
  assert.match(workflow,/sudo unshare --net/u);
  assert.match(workflow,/scripts\/smoke-mpc-screen-ocr\.mjs/u);
  assert.ok(workflow.indexOf('Recognize fixture')>workflow.indexOf('Package Windows portable build'));
  assert.ok(workflow.indexOf('Recognize fixture')<workflow.indexOf('Upload receivable portable build'));
});
