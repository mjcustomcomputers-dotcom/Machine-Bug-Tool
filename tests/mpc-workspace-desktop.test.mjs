import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {initialWorkspaceWindowBounds} from '../desktop/window-geometry.mjs';
import {workspaceContextMenuSpec} from '../desktop/text-context-menu.mjs';

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

test('initial native window keeps its preferred size when the usable display area fits it',()=>{
  assert.deepEqual(initialWorkspaceWindowBounds({x:0,y:0,width:1920,height:1040}),
    {x:240,y:50,width:1440,height:940,minWidth:980,minHeight:680});
});

test('initial native window fits laptop and DPI-reduced work areas with capped minimum sizes',()=>{
  const examples=[
    [{x:0,y:0,width:1366,height:728},{x:16,y:16,width:1334,height:696,minWidth:980,minHeight:680}],
    [{x:0,y:0,width:1280,height:680},{x:16,y:16,width:1248,height:648,minWidth:980,minHeight:648}],
    [{x:0,y:0,width:960,height:500},{x:16,y:16,width:928,height:468,minWidth:928,minHeight:468}],
    [{x:0,y:0,width:640,height:440},{x:16,y:16,width:608,height:408,minWidth:608,minHeight:408}],
  ];
  for(const [workArea,expected] of examples)assert.deepEqual(initialWorkspaceWindowBounds(workArea),expected);
});

test('native window geometry preserves negative display origins, centering, and usable-area containment',()=>{
  const workAreas=[
    {x:-1920,y:40,width:1920,height:1040},
    {x:-1366,y:-768,width:1366,height:728},
    {x:48,y:24,width:1281,height:701},
    {x:-32,y:12,width:31,height:27},
    {x:0,y:0,width:1,height:1},
  ];
  for(const workArea of workAreas){
    const original={...workArea},bounds=initialWorkspaceWindowBounds(workArea);
    assert.deepEqual(workArea,original);
    assert.ok(Object.values(bounds).every(Number.isSafeInteger));
    assert.ok(bounds.width>0&&bounds.height>0);
    assert.ok(bounds.x>=workArea.x&&bounds.y>=workArea.y);
    assert.ok(bounds.x+bounds.width<=workArea.x+workArea.width);
    assert.ok(bounds.y+bounds.height<=workArea.y+workArea.height);
    assert.ok(bounds.minWidth>0&&bounds.minWidth<=bounds.width);
    assert.ok(bounds.minHeight>0&&bounds.minHeight<=bounds.height);
    assert.ok(Math.abs((bounds.x-workArea.x)-(workArea.x+workArea.width-bounds.x-bounds.width))<=1);
    assert.ok(Math.abs((bounds.y-workArea.y)-(workArea.y+workArea.height-bounds.y-bounds.height))<=1);
  }
  assert.deepEqual(initialWorkspaceWindowBounds(workAreas[0]),
    {x:-1680,y:90,width:1440,height:940,minWidth:980,minHeight:680});
});

test('native window constructor uses the primary work area as DIP outer-window bounds',()=>{
  const body=/function createMainWindow\(\)\{([^]*?)\n\}/u.exec(read('desktop/main.mjs'))?.[1];
  assert.ok(body);
  let options;
  const workArea={x:-960,y:40,width:960,height:500};
  const create=runInNewContext(`(function(){${body}})`,{
    APP_NAME:'MPC Workspace',PRELOAD_PATH:'/synthetic/preload.cjs',app:{isPackaged:true},
    screen:{getPrimaryDisplay:()=>({workArea,scaleFactor:2})},initialWorkspaceWindowBounds,
    installNativeContextMenu:()=>{},
    BrowserWindow:class{
      constructor(value){options=value;this.webContents={on(){},setWindowOpenHandler(){}};}
      once(){}
      on(){}
    },
  });
  create();
  assert.deepEqual(Object.fromEntries(['x','y','width','height','minWidth','minHeight'].map(key=>[key,options[key]])),
    {x:-944,y:56,width:928,height:468,minWidth:928,minHeight:468});
  assert.equal(options.useContentSize,false,'Native window frame must fit within the chosen outer size');
  assert.equal(options.webPreferences.sandbox,true);
});

test('trusted native right-click popup uses only Electron editor actions and allowed masked preview copy',()=>{
  const code=read('desktop/main.mjs');
  const body=/function installNativeContextMenu\(window\)\{([^]*?)\n\}/u.exec(code)?.[1];
  assert.ok(body,'native context-menu handler must exist');
  const origin='http://127.0.0.1:5555',shown=[], copiedImages=[],listeners={};
  let currentUrl=`${origin}/`;
  const window={isDestroyed:()=>false,webContents:{
    getURL:()=>currentUrl,
    on:(name,callback)=>{listeners[name]=callback;},
    copyImageAt:(x,y)=>copiedImages.push([x,y])
  }};
  const mockMenu={buildFromTemplate:items=>({popup:location=>shown.push({items,location})})};
  const install=runInNewContext(`(function(window){${body}})`,{
    workspaceOrigin:origin,
    workspaceContextMenuSpec,
    isTrustedRendererUrl:href=>href===`${origin}/`,
    Menu:mockMenu
  });
  install(window);
  assert.equal(typeof listeners['context-menu'],'function');
  listeners['context-menu'](null,{isEditable:true,inputFieldType:'text',selectionText:'selected',
    x:27,y:33,editFlags:{canCopy:true,canPaste:true,canCut:true,canSelectAll:true}});
  assert.equal(shown.length,1);
  assert.equal(shown[0].location.window,window);
  assert.equal(shown[0].location.x,27);assert.equal(shown[0].location.y,33);
  assert.deepEqual(shown[0].items.filter(row=>row.role).map(row=>row.role),
    ['undo','redo','cut','copy','paste','selectAll']);
  listeners['context-menu'](null,{isEditable:false,mediaType:'image',
    srcURL:`blob:${origin}/frame-1`,x:12,y:14,editFlags:{}});
  assert.equal(shown.length,2);
  assert.equal(shown[1].items[0].label,'Copy preview image');
  shown[1].items[0].click();
  assert.deepEqual(copiedImages,[[12,14]]);
  listeners['context-menu'](null,{isEditable:false,mediaType:'image',
    srcURL:'blob:https://other.example/secret',x:12,y:14,editFlags:{}});
  assert.equal(shown.length,2,'remote image cannot be copied by workspace preview command');
  currentUrl='https://other.example/';
  listeners['context-menu'](null,{isEditable:true,x:0,y:0,editFlags:{canCopy:true}});
  assert.equal(shown.length,2,'untrusted navigation must not get native edit menu');
});

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
  assert.match(main,/installNativeContextMenu\(window\)/u);
  assert.match(main,/webContents\.on\('context-menu'/u);
  assert.match(main,/Menu\.buildFromTemplate\(template\)\.popup/u);
  assert.doesNotMatch(main,/\.popup\(\{[^}]*devTools/iu);

  assert.match(preload,/exposeInMainWorld\('mpcWorkspace'/u);
  const exposed=preload.slice(preload.indexOf("contextBridge.exposeInMainWorld('mpcWorkspace'"));
  const methods=[...exposed.matchAll(/^\s{2}([A-Za-z][A-Za-z]+):/gmu)].map(match=>match[1]);
  assert.deepEqual(methods,[
    'getRuntimeStatus','chooseFiles','chooseFolder','readClipboardText','copyText','openLogs','restartService','setInterfaceZoom',
    'screenSources','screenStart','screenStop','screenStatus','screenNow','onScreenEvent',
    'credentialStatus','credentialSave','credentialRemove'
  ]);
  assert.doesNotMatch(preload,/exposeInMainWorld\(['"]ipcRenderer['"]/u);
  assert.doesNotMatch(preload,/\.send\(/u);
});

test('preload accepts only finite 50–200 percent display zoom and invokes its single fixed channel',async()=>{
  const calls=[];
  let exposed;
  runInNewContext(read('desktop/preload.cjs'),{require:name=>{
    assert.equal(name,'electron');
    return {contextBridge:{exposeInMainWorld:(name,value)=>{assert.equal(name,'mpcWorkspace');exposed=value;}},
      ipcRenderer:{invoke:async(...args)=>{calls.push(args);return {status:'APPLIED',zoom_factor:args[1]};}}};
  }});
  for(const value of [0.5,0.6,0.75,1,1.25,2]){
    assert.equal((await exposed.setInterfaceZoom(value)).zoom_factor,value);
  }
  assert.deepEqual(calls.map(([channel])=>channel),Array(6).fill('mpc-workspace:set-interface-zoom'));
  for(const value of [null,undefined,'0.6',{},[],NaN,Infinity,-Infinity,0.49,2.01]){
    await assert.rejects(exposed.setInterfaceZoom(value),/MPC_WORKSPACE_INTERFACE_ZOOM_INVALID/u);
  }
  assert.equal(calls.length,6);
});

test('native zoom handler authenticates the sender, validates bounds, and returns the observed factor',()=>{
  const main=read('desktop/main.mjs');
  const body=/ipcMain\.handle\(IPC\.setInterfaceZoom,\s*(\(event,value\)=>\{[^]*?\n  \})\);/u.exec(main)?.[1];
  assert.ok(body,'fixed native zoom handler is present');
  const trusted={id:'trusted'};
  const changes=[];
  let observed=1;
  const handler=runInNewContext(`(${body})`,{
    assertTrustedSender:event=>{if(event!==trusted)throw new Error('UNTRUSTED');},
    mainWindow:{webContents:{setZoomFactor:value=>{changes.push(value);observed=value;},getZoomFactor:()=>observed}}
  });
  assert.throws(()=>handler({},0.6),/UNTRUSTED/u);
  for(const value of ['0.6',NaN,Infinity,0.49,2.01]){
    assert.throws(()=>handler(trusted,value),/MPC_WORKSPACE_INTERFACE_ZOOM_INVALID/u);
  }
  assert.equal(changes.length,0);
  for(const value of [0.5,0.6,1,2]){
    const result=handler(trusted,value);
    assert.equal(result.status,'APPLIED');
    assert.equal(result.zoom_factor,value);
  }
  assert.deepEqual(changes,[0.5,0.6,1,2]);
  assert.match(main,/zoom_factor:mainWindow[^\n]+getZoomFactor\(\)/u);
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
      'desktop/main.mjs','desktop/window-geometry.mjs','desktop/preload.cjs','desktop/renderer/app.js','scripts/mpc-workspace-server.mjs',
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
