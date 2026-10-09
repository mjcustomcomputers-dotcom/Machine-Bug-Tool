import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import test from 'node:test';

import {
  ELECTRON_BUNDLED_NODE_VERSION,
  ELECTRON_VERSION,
  MINIMUM_SUPPORTED_WINDOWS,
  PACKAGER_VERSION,
  localRuntimeSpecifiers,
  stageMpcWorkspaceApplication,
} from '../scripts/package-mpc-workspace-windows.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const read=path=>readFileSync(resolve(ROOT,path),'utf8');

test('desktop main and sandboxed preload expose only the narrow native bridge',()=>{
  const main=read('desktop/main.mjs');
  const preload=read('desktop/preload.cjs');
  assert.match(main,/contextIsolation:true/u);
  assert.match(main,/sandbox:true/u);
  assert.match(main,/nodeIntegration:false/u);
  assert.match(main,/nodeIntegrationInWorker:false/u);
  assert.match(main,/webviewTag:false/u);
  assert.match(main,/setWindowOpenHandler\(\(\)=>\(\{action:'deny'\}\)\)/u);
  assert.match(main,/setPermissionRequestHandler\([^]*callback\(false\)/u);
  assert.match(main,/hostname===LOOPBACK_HOST/u);
  assert.match(main,/process\.resourcesPath,'mpc-workspace-renderer'/u);
  assert.match(main,/source_commit:build\.source_commit/u);
  assert.doesNotMatch(main,/shell\.openExternal/u);

  assert.match(preload,/exposeInMainWorld\('mpcWorkspace'/u);
  const exposed=preload.slice(preload.indexOf("contextBridge.exposeInMainWorld('mpcWorkspace'"));
  const methods=[...exposed.matchAll(/^\s{2}([A-Za-z][A-Za-z]+):/gmu)].map(match=>match[1]);
  assert.deepEqual(methods,[
    'getRuntimeStatus','chooseFiles','chooseFolder','readClipboardText','copyText','openLogs','restartService'
  ]);
  assert.doesNotMatch(preload,/exposeInMainWorld\(['"]ipcRenderer['"]/u);
  assert.doesNotMatch(preload,/\.send\(/u);
});
test('desktop sources parse without resolving or downloading Electron',()=>{
  execFileSync(process.execPath,['--check',resolve(ROOT,'desktop/main.mjs')],{stdio:'pipe'});
  execFileSync(process.execPath,['--check',resolve(ROOT,'desktop/preload.cjs')],{stdio:'pipe'});
  execFileSync(process.execPath,['--check',resolve(ROOT,'scripts/package-mpc-workspace-windows.mjs')],{stdio:'pipe'});
});
test('portable packager pins a node:sqlite-capable Electron and the supported packager',()=>{
  assert.equal(ELECTRON_VERSION,'44.5.1');
  assert.equal(ELECTRON_BUNDLED_NODE_VERSION,'24.21.0');
  assert.equal(MINIMUM_SUPPORTED_WINDOWS,'Windows 10 x64 or later');
  assert.equal(PACKAGER_VERSION,'20.3.0');
  const manifest=JSON.parse(read('package.json'));
  assert.equal(manifest.productName,'MPC Workspace');
  assert.equal(manifest.main,'desktop/main.mjs');
  assert.equal(manifest.devDependencies.electron,ELECTRON_VERSION);
  assert.equal(manifest.devDependencies['@electron/packager'],PACKAGER_VERSION);
  assert.equal(manifest.scripts['desktop:dev'],'electron .');
  assert.equal(manifest.scripts['desktop:package:windows'],'node scripts/package-mpc-workspace-windows.mjs');
  assert.equal(manifest.packageManager,'pnpm@11.25.0');
});

test('local import discovery includes static, dynamic and import.meta URL dependencies',()=>{
  assert.deepEqual(localRuntimeSpecifiers(`
    import x from '../lib/x.mjs';
    export {y} from './y.js';
    const z=import('./z.mjs');
    const asset=new URL('./asset.json',import.meta.url);
    import fs from 'node:fs';
  `),['../lib/x.mjs','./y.js','./z.mjs','./asset.json']);
});

test('staging follows local code imports and copies only reviewed runtime asset roots',()=>{
  const temporary=mkdtempSync(join(tmpdir(),'mpc-workspace-package-test-'));
  const source=resolve(temporary,'source');
  const stage=resolve(temporary,'stage');
  const put=(path,body='fixture')=>{
    const absolute=resolve(source,path);
    mkdirSync(resolve(absolute,'..'),{recursive:true});
    writeFileSync(absolute,body,'utf8');
  };
  try{
    put('package.json',JSON.stringify({version:'1.2.3'}));
    put('desktop/main.mjs',"import '../scripts/mpc-workspace-server.mjs'; new URL('./preload.cjs',import.meta.url);");
    put('desktop/preload.cjs','const bridge=true;');
    put('scripts/mpc-workspace-server.mjs',"import '../lib/workspace-core.mjs';");
    put('lib/workspace-core.mjs',"import catalog from '../method-atlas/catalog.json' with {type:'json'};");
    put('desktop/renderer/index.html','<!doctype html><title>MPC Workspace</title>');
    put('command-center-build/config/providers.json','{}');
    put('command-center-build/sql/schema.sql','SELECT 1;');
    put('command-center-build/research/methods.json','{}');
    put('method-atlas/catalog.json','{}');
    put('.env','MUST_NOT_SHIP=1');
    put('.sites-runtime/credential-cache.json','{}');
    put('legacy-site-source.txt','not selected');
    const result=stageMpcWorkspaceApplication({sourceRoot:source,stageRoot:stage});
    for(const path of [
      'desktop/main.mjs','desktop/preload.cjs','scripts/mpc-workspace-server.mjs','lib/workspace-core.mjs',
      'desktop/renderer/index.html','command-center-build/config/providers.json','command-center-build/sql/schema.sql',
      'command-center-build/research/methods.json','method-atlas/catalog.json','package.json'
    ])assert.equal(existsSync(resolve(stage,path)),true,path);
    for(const path of ['.env','.sites-runtime/credential-cache.json','legacy-site-source.txt']){
      assert.equal(existsSync(resolve(stage,path)),false,path);
    }
    assert.equal(result.version,'1.2.3');
    const stagedManifest=JSON.parse(readFileSync(resolve(stage,'package.json'),'utf8'));
    assert.equal(stagedManifest.main,'desktop/main.mjs');
    assert.equal(stagedManifest.mpcWorkspaceBuild.electron,ELECTRON_VERSION);
    assert.equal(stagedManifest.mpcWorkspaceBuild.target,'win32-x64');
    assert.equal(result.staged_files.length,result.selected_files.length);
    assert.match(result.staged_files.find(file=>file.path==='desktop/main.mjs').sha256,/^[0-9a-f]{64}$/u);
  }finally{
    rmSync(temporary,{recursive:true,force:true});
  }
});

test('tracked-only staging excludes untracked allowed-extension assets',()=>{
  const temporary=mkdtempSync(join(tmpdir(),'mpc-workspace-tracked-stage-'));
  const source=resolve(temporary,'source');
  const stage=resolve(temporary,'stage');
  const put=(path,body='fixture')=>{
    const absolute=resolve(source,path);
    mkdirSync(resolve(absolute,'..'),{recursive:true});
    writeFileSync(absolute,body,'utf8');
  };
  try{
    put('package.json',JSON.stringify({version:'1.2.3'}));
    put('desktop/main.mjs','export const main=true;');
    put('desktop/renderer/index.html','<!doctype html>');
    put('command-center-build/config/providers.json','{}');
    put('command-center-build/sql/schema.sql','SELECT 1;');
    put('command-center-build/research/methods.json','{}');
    put('method-atlas/catalog.json','{}');
    execFileSync('git',['init','-q'],{cwd:source});
    execFileSync('git',['add','.'],{cwd:source});
    put('command-center-build/config/untracked-secret.json','{"token":"must-not-ship"}');
    const result=stageMpcWorkspaceApplication({sourceRoot:source,stageRoot:stage,
      entryFiles:['desktop/main.mjs'],requireTracked:true});
    assert.equal(result.selected_files.includes('command-center-build/config/untracked-secret.json'),false);
    assert.equal(existsSync(resolve(stage,'command-center-build/config/untracked-secret.json')),false);
  }finally{
    rmSync(temporary,{recursive:true,force:true});
  }
});

test('staging rejects an imported file reached through a parent symlink escape',t=>{
  const temporary=mkdtempSync(join(tmpdir(),'mpc-workspace-symlink-stage-'));
  const source=resolve(temporary,'source');
  const outside=resolve(temporary,'outside');
  try{
    mkdirSync(resolve(source,'desktop'),{recursive:true});
    mkdirSync(outside,{recursive:true});
    writeFileSync(resolve(source,'package.json'),JSON.stringify({version:'1.2.3'}));
    writeFileSync(resolve(source,'desktop/main.mjs'),"import '../linked/escape.mjs';",'utf8');
    writeFileSync(resolve(outside,'escape.mjs'),'export const escaped=true;','utf8');
    try{symlinkSync(outside,resolve(source,'linked'),'dir')}catch(error){t.skip(`symlink unavailable: ${error.code}`);return}
    assert.throws(()=>stageMpcWorkspaceApplication({sourceRoot:source,stageRoot:resolve(temporary,'stage'),
      entryFiles:['desktop/main.mjs'],assetDirectories:[]}),/MPC_WORKSPACE_PACKAGE_IMPORT_OUTSIDE_ROOT/u);
  }finally{
    rmSync(temporary,{recursive:true,force:true});
  }
});

test('the real portable stage closes its runtime graph without repository or credential surfaces',()=>{
  const temporary=mkdtempSync(join(tmpdir(),'mpc-workspace-real-stage-'));
  try{
    const result=stageMpcWorkspaceApplication({sourceRoot:ROOT,stageRoot:resolve(temporary,'app')});
    for(const path of [
      'desktop/main.mjs','desktop/preload.cjs','desktop/renderer/app.js','scripts/mpc-workspace-server.mjs',
      'lib/mpc-workspace-service.mjs','lib/mpc-workspace-store.mjs','command-center-build/sql/002-workspace-journey.sql'
    ])assert.ok(result.selected_files.includes(path),path);
    assert.ok(result.selected_files.length>=40);
    assert.ok(result.selected_bytes>0&&result.selected_bytes<96*1024*1024);
    for(const path of result.selected_files){
      assert.doesNotMatch(path,/^(?:\.git|\.openai|\.sites-runtime|docs|plugin-source|assistant|outputs|work)(?:\/|$)/u);
      assert.doesNotMatch(path,/(?:^|\/)\.env/u);
      assert.doesNotMatch(path,/\.(?:pem|key)$/iu);
    }
  }finally{
    rmSync(temporary,{recursive:true,force:true});
  }
});

test('Windows launchers retain failures and never change execution policy',()=>{
  const cmd=read('MPC-Workspace.cmd');
  const powershell=read('MPC-Workspace.ps1');
  assert.match(cmd,/MPC-Workspace\.exe/u);
  assert.match(cmd,/pause/iu);
  assert.match(cmd,/exit \/b %MPC_EXIT%/u);
  assert.match(powershell,/Read-Host 'Press Enter to close'/u);
  assert.match(powershell,/exit \$exitCode/u);
  assert.doesNotMatch(`${cmd}\n${powershell}`,/Set-ExecutionPolicy|ExecutionPolicy\s+Bypass/iu);
});

test('release packaging requires a clean exact Git source and emits full manifests',()=>{
  const source=read('scripts/package-mpc-workspace-windows.mjs');
  assert.match(source,/MPC_WORKSPACE_PACKAGE_SOURCE_COMMIT_REQUIRED/u);
  assert.match(source,/MPC_WORKSPACE_PACKAGE_CLEAN_SOURCE_REQUIRED/u);
  assert.match(source,/requireTracked:true/u);
  assert.match(source,/entryFiles:\[\.\.\.ENTRY_FILES,\.\.\.LAUNCHERS\]/u);
  assert.match(source,/copyLaunchers\(staged\.stage,portableRoot\)/u);
  assert.match(source,/MPC_WORKSPACE_PACKAGE_SOURCE_CHANGED_DURING_BUILD/u);
  assert.match(source,/portable_inventory:finalInventory/u);
  assert.match(source,/checksum_path:checksumPath/u);
  assert.doesNotMatch(source,/portable_directory:portableRoot/u);
});
