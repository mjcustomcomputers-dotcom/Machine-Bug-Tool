import {createHash} from 'node:crypto';
import {appendFileSync,lstatSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {basename,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  safeStorage,
  desktopCapturer,
  screen,
  powerMonitor,
  globalShortcut,
} from 'electron';
import {createScreenCaptureHost} from './screen-host.mjs';
import {createWorkspaceSecretStore} from '../lib/mpc-workspace-secrets.mjs';
import {createWorkspaceHostAdapters} from '../lib/mpc-workspace-host-adapters.mjs';

const APP_NAME='MPC Workspace';
const APP_ID='com.mjcustomcomputers.mpcworkspace';
const LOOPBACK_HOST='127.0.0.1';
const MAX_CLIPBOARD_BYTES=4*1024*1024;
const MAX_SELECTED_FILES=128;
const MAX_PATH_BYTES=32*1024;
const SERVER_MODULE_URL=new URL('../scripts/mpc-workspace-server.mjs',import.meta.url);
const PRELOAD_PATH=fileURLToPath(new URL('./preload.cjs',import.meta.url));
const DESKTOP_ROOT=dirname(fileURLToPath(import.meta.url));
const IPC=Object.freeze({
  runtimeStatus:'mpc-workspace:runtime-status',
  chooseFiles:'mpc-workspace:choose-files',
  chooseFolder:'mpc-workspace:choose-folder',
  readClipboardText:'mpc-workspace:read-clipboard-text',
  copyText:'mpc-workspace:copy-text',
  openLogs:'mpc-workspace:open-logs',
  restartService:'mpc-workspace:restart-service',
  setInterfaceZoom:'mpc-workspace:set-interface-zoom',
});

let mainWindow=null;
let workspaceService=null;
let workspaceOrigin=null;
let logDirectory=null;
let logFile=null;
let errorDocumentUrl=null;
let serviceState={status:'STARTING',last_error_code:null};
let restartPromise=null;
let screenHost=null;
let secretStore=null;
let secretStoreError=null;

function packagedBuildIdentity(){
  try{
    const manifest=JSON.parse(readFileSync(join(app.getAppPath(),'package.json'),'utf8'));
    const build=manifest?.mpcWorkspaceBuild;
    return Object.freeze({
      source_commit:/^[0-9a-f]{40}$/u.test(build?.source_commit??'')?build.source_commit:null,
      source_dirty:typeof build?.source_dirty==='boolean'?build.source_dirty:null,
      target:typeof build?.target==='string'?build.target:null,
    });
  }catch{return Object.freeze({source_commit:null,source_dirty:null,target:null})}
}
app.setName(APP_NAME);
if(process.platform==='win32')app.setAppUserModelId(APP_ID);

function cleanText(value,limit=1000){
  return String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu,' ').slice(0,limit);
}
function errorCode(error){
  const candidate=String(error?.code??error?.message??'MPC_WORKSPACE_ERROR').toUpperCase().replace(/[^A-Z0-9_:-]+/gu,'_');
  return candidate.slice(0,160)||'MPC_WORKSPACE_ERROR';
}

function errorSummary(error){
  const code=errorCode(error);
  const message=cleanText(error?.message??error,800);
  return message&&message!==code?`${code}: ${message}`:code;
}

function logEvent(level,event,details={}){
  if(!logFile)return;
  const safeDetails={};
  for(const [key,value] of Object.entries(details))safeDetails[cleanText(key,80)]=cleanText(value,1000);
  try{
    appendFileSync(logFile,`${JSON.stringify({at:new Date().toISOString(),level,event,...safeDetails})}\n`,{encoding:'utf8',mode:0o600});
  }catch{}
}

function isLoopbackServiceUrl(raw){
  try{
    const url=new URL(raw);
    return url.protocol==='http:'&&url.hostname===LOOPBACK_HOST&&url.username===''&&url.password===''&&url.port!=='';
  }catch{return false}
}

function isTrustedRendererUrl(raw){
  if(typeof raw!=='string')return false;
  if(errorDocumentUrl&&raw===errorDocumentUrl)return true;
  if(!workspaceOrigin||!isLoopbackServiceUrl(raw))return false;
  try{return new URL(raw).origin===workspaceOrigin}catch{return false}
}

function assertTrustedSender(event){
  if(!mainWindow||event.sender!==mainWindow.webContents||event.senderFrame!==mainWindow.webContents.mainFrame||
    !isTrustedRendererUrl(event.senderFrame.url))throw Object.assign(new Error('MPC_WORKSPACE_UNTRUSTED_RENDERER'),{code:'MPC_WORKSPACE_UNTRUSTED_RENDERER'});
}

function boundedNativePath(value){
  if(typeof value!=='string'||!value||value.includes('\0')||Buffer.byteLength(value,'utf8')>MAX_PATH_BYTES){
    throw Object.assign(new Error('MPC_WORKSPACE_SELECTED_PATH_INVALID'),{code:'MPC_WORKSPACE_SELECTED_PATH_INVALID'});
  }
  return value;
}

function selectedFile(path){
  const selected=boundedNativePath(path);
  const stat=lstatSync(selected);
  return Object.freeze({
    path:selected,
    name:basename(selected),
    size:Number.isSafeInteger(stat.size)?stat.size:null,
    kind:stat.isFile()?'file':stat.isDirectory()?'directory':stat.isSymbolicLink()?'link':'other',
  });
}

function runtimeStatus(){
  const build=packagedBuildIdentity();
  return Object.freeze({
    platform:process.platform,
    architecture:process.arch,
    app_version:app.getVersion(),
    source_commit:build.source_commit,
    source_dirty:build.source_dirty,
    packaged_target:build.target,
    zoom_factor:mainWindow&&!mainWindow.isDestroyed()?mainWindow.webContents.getZoomFactor():1,
    runtime:Object.freeze({electron:process.versions.electron,node:process.versions.node,chrome:process.versions.chrome}),
    service:Object.freeze({status:serviceState.status,url:workspaceService?.url??null,last_error_code:serviceState.last_error_code}),
    capabilities:Object.freeze({clipboard:true,files:true,folders:true,logs:true,restart:true,interface_zoom:true}),
  });
}

async function closeWorkspaceService(){
  screenHost?.stop('SERVICE_CLOSED');
  const current=workspaceService;
  workspaceService=null;
  workspaceOrigin=null;
  if(current&&typeof current.close==='function')await current.close();
}

async function startWorkspaceService(){
  serviceState={status:'STARTING',last_error_code:null};
  await closeWorkspaceService();
  const dataRoot=join(app.getPath('userData'),'workspace-data');
  const rendererRoot=app.isPackaged?join(process.resourcesPath,'mpc-workspace-renderer'):join(DESKTOP_ROOT,'renderer');
  mkdirSync(dataRoot,{recursive:true,mode:0o700});
  const serverModule=await import(SERVER_MODULE_URL.href);
  if(typeof serverModule.startMpcWorkspaceServer!=='function'){
    throw Object.assign(new Error('MPC_WORKSPACE_SERVER_EXPORT_MISSING'),{code:'MPC_WORKSPACE_SERVER_EXPORT_MISSING'});
  }
  const adapters=createWorkspaceHostAdapters({resolveCredential:(reference,context)=>secretStore?.resolveCredential(reference,context)??null});
  const started=await serverModule.startMpcWorkspaceServer({host:LOOPBACK_HOST,port:0,dataRoot,rendererRoot,adapters});
  if(!started||typeof started.close!=='function'||!isLoopbackServiceUrl(started.url)){
    try{await started?.close?.()}catch{}
    throw Object.assign(new Error('MPC_WORKSPACE_SERVER_RESULT_INVALID'),{code:'MPC_WORKSPACE_SERVER_RESULT_INVALID'});
  }
  workspaceService=started;
  workspaceOrigin=new URL(started.url).origin;
  serviceState={status:'READY',last_error_code:null};
  logEvent('info','service_ready',{origin:workspaceOrigin});
  return started;
}

function escapeHtml(value){
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

const ERROR_PAGE_SCRIPT=`
const detail=document.getElementById('details');
const status=document.getElementById('status');
document.getElementById('copy').addEventListener('click',async()=>{
 try{await window.mpcWorkspace.copyText(detail.textContent);status.textContent='Error copied.'}catch{status.textContent='Copy failed. Open Logs for details.'}
});
document.getElementById('logs').addEventListener('click',async()=>{
 const result=await window.mpcWorkspace.openLogs();status.textContent=result.status==='OPENED'?'Logs opened.':('Open Logs failed: '+(result.error||'unknown error'));
});
document.getElementById('restart').addEventListener('click',async()=>{
 status.textContent='Restarting local service…';const result=await window.mpcWorkspace.restartService();
 if(result.status!=='READY')status.textContent='Restart failed: '+(result.error||'unknown error');
});`;

function startupErrorDocument(summary){
  const scriptHash=createHash('sha256').update(ERROR_PAGE_SCRIPT).digest('base64');
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'"><title>MPC Workspace — startup issue</title><style>
  :root{color-scheme:dark;font-family:"Segoe UI",system-ui,sans-serif;background:#071615;color:#eef8f1}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 18% 12%,#183b46 0,#0d2324 42%,#071615 100%)}main{width:min(760px,calc(100vw - 48px));padding:34px;border:1px solid #37675f;border-radius:20px;background:#102624;box-shadow:0 22px 60px #0008}p{line-height:1.55;color:#bed3ca}pre{white-space:pre-wrap;word-break:break-word;padding:16px;border-radius:12px;background:#061210;color:#ffcbc2;border:1px solid #704a4a}button{font:inherit;font-weight:700;margin:8px 8px 0 0;padding:10px 16px;border:1px solid #5bc6c2;border-radius:10px;background:#153b3b;color:#fff;cursor:pointer}button:focus-visible{outline:3px solid #67e8f9;outline-offset:3px}#restart{background:#bc526d;border-color:#ff8e9f}#status{min-height:1.5em;color:#8ce6d1}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
  </style></head><body><main><p>MPC Workspace</p><h1>The local service did not start</h1><p>The window will stay open. You can copy the exact error, open the retained log, or restart only the local service.</p><pre id="details">${escapeHtml(summary)}</pre><div><button id="restart">Restart Service</button><button id="logs">Open Logs</button><button id="copy">Copy Error</button></div><p id="status" role="status" aria-live="polite"></p></main><script>${ERROR_PAGE_SCRIPT}</script></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function showStartupError(error){
  const summary=errorSummary(error);
  serviceState={status:'FAILED',last_error_code:errorCode(error)};
  logEvent('error','service_start_failed',{error:summary});
  errorDocumentUrl=startupErrorDocument(summary);
  if(mainWindow&&!mainWindow.isDestroyed())await mainWindow.loadURL(errorDocumentUrl);
}

async function loadWorkspace(){
  try{
    const started=await startWorkspaceService();
    errorDocumentUrl=null;
    await mainWindow.loadURL(started.url);
    return {status:'READY'};
  }catch(error){
    await showStartupError(error);
    return {status:'ERROR',error:errorSummary(error)};
  }
}

async function restartWorkspace(){
  if(restartPromise)return restartPromise;
  restartPromise=(async()=>{
    logEvent('info','service_restart_requested');
    return loadWorkspace();
  })().finally(()=>{restartPromise=null});
  return restartPromise;
}

function installIpcHandlers(){
  ipcMain.handle('mpc-workspace:credential-status',event=>{assertTrustedSender(event);return secretStore?.status()??{encrypted_storage_available:false,entries:[],error:secretStoreError}});
  ipcMain.handle('mpc-workspace:credential-save',(event,input)=>{
    assertTrustedSender(event);screenHost?.stop('CREDENTIAL_ENTRY');
    if(!secretStore)throw Object.assign(Error(secretStoreError??'MPC_SECRET_STORE_UNAVAILABLE'),{code:secretStoreError??'MPC_SECRET_STORE_UNAVAILABLE'});
    return secretStore.save(input);
  });
  ipcMain.handle('mpc-workspace:credential-remove',(event,reference)=>{assertTrustedSender(event);return secretStore?.remove(reference)??{status:'UNAVAILABLE'}});
  ipcMain.handle(IPC.runtimeStatus,event=>{assertTrustedSender(event);return runtimeStatus()});
  ipcMain.handle(IPC.chooseFiles,async event=>{
    assertTrustedSender(event);
    const result=await dialog.showOpenDialog(mainWindow,{title:'Attach files to MPC Workspace',properties:['openFile','multiSelections','dontAddToRecent']});
    if(result.canceled)return {cancelled:true,paths:[]};
    if(result.filePaths.length>MAX_SELECTED_FILES)throw Object.assign(new Error('MPC_WORKSPACE_FILE_SELECTION_LIMIT_EXCEEDED'),{code:'MPC_WORKSPACE_FILE_SELECTION_LIMIT_EXCEEDED'});
    return {cancelled:false,paths:result.filePaths.map(selectedFile)};
  });
  ipcMain.handle(IPC.chooseFolder,async event=>{
    assertTrustedSender(event);
    const result=await dialog.showOpenDialog(mainWindow,{title:'Attach a folder to MPC Workspace',properties:['openDirectory','dontAddToRecent']});
    if(result.canceled||result.filePaths.length===0)return {cancelled:true,path:null};
    return {cancelled:false,path:boundedNativePath(result.filePaths[0])};
  });
  ipcMain.handle(IPC.readClipboardText,event=>{
    assertTrustedSender(event);
    const text=clipboard.readText('clipboard');
    if(Buffer.byteLength(text,'utf8')>MAX_CLIPBOARD_BYTES)throw Object.assign(new Error('MPC_WORKSPACE_CLIPBOARD_TEXT_TOO_LARGE'),{code:'MPC_WORKSPACE_CLIPBOARD_TEXT_TOO_LARGE'});
    return {text};
  });
  ipcMain.handle(IPC.copyText,(event,value)=>{
    assertTrustedSender(event);
    if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>MAX_CLIPBOARD_BYTES)throw Object.assign(new Error('MPC_WORKSPACE_COPY_TEXT_INVALID'),{code:'MPC_WORKSPACE_COPY_TEXT_INVALID'});
    clipboard.writeText(value,'clipboard');
    return {status:'COPIED',bytes:Buffer.byteLength(value,'utf8')};
  });
  ipcMain.handle(IPC.openLogs,async event=>{
    assertTrustedSender(event);
    const error=await shell.openPath(logDirectory);
    return error?{status:'ERROR',error:cleanText(error,400)}:{status:'OPENED'};
  });
  ipcMain.handle(IPC.restartService,async event=>{assertTrustedSender(event);return restartWorkspace()});
  ipcMain.handle(IPC.setInterfaceZoom,(event,value)=>{
    assertTrustedSender(event);
    if(typeof value!=='number'||!Number.isFinite(value)||value<0.5||value>2){
      throw Object.assign(new TypeError('MPC_WORKSPACE_INTERFACE_ZOOM_INVALID'),{code:'MPC_WORKSPACE_INTERFACE_ZOOM_INVALID'});
    }
    mainWindow.webContents.setZoomFactor(value);
    return {status:'APPLIED',zoom_factor:mainWindow.webContents.getZoomFactor()};
  });
}

function installApplicationMenu(){
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'File',submenu:[{role:'quit'}]},
    {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'View',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}]},
  ]));
}

function createMainWindow(){
  const window=new BrowserWindow({
    title:APP_NAME,
    width:1440,
    height:940,
    minWidth:980,
    minHeight:680,
    show:false,
    autoHideMenuBar:false,
    backgroundColor:'#071615',
    webPreferences:{
      preload:PRELOAD_PATH,
      contextIsolation:true,
      sandbox:true,
      nodeIntegration:false,
      nodeIntegrationInWorker:false,
      webviewTag:false,
      safeDialogs:true,
      spellcheck:true,
      devTools:!app.isPackaged,
    },
  });
  window.once('ready-to-show',()=>window.show());
  window.on('closed',()=>{screenHost?.stop('WORKSPACE_CLOSED');if(mainWindow===window)mainWindow=null});
  window.webContents.on('did-start-navigation',(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame)screenHost?.stop('WORKSPACE_NAVIGATION')});
  window.on('unresponsive',()=>screenHost?.stop('WORKSPACE_UNRESPONSIVE'));
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.on('will-navigate',details=>{
    if(!details.isMainFrame||!isTrustedRendererUrl(details.url))details.preventDefault();
  });
  // External navigation is fail-closed. Native-source adapters can add reviewed
  // destinations later without granting arbitrary model or document links.
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('render-process-gone',(_event,details)=>{
    screenHost?.stop('WORKSPACE_PROCESS_EXITED');
    const error=Object.assign(new Error(`MPC_WORKSPACE_RENDERER_${cleanText(details.reason,80)}`),{code:'MPC_WORKSPACE_RENDERER_EXITED'});
    void showStartupError(error);
  });
  return window;
}

const hasSingleInstanceLock=app.requestSingleInstanceLock();
if(!hasSingleInstanceLock){
  app.quit();
}else{
  app.on('second-instance',()=>{
    if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus()}
  });
  app.on('certificate-error',(event,_webContents,_url,_error,_certificate,callback)=>{event.preventDefault();callback(false)});
  app.whenReady().then(async()=>{
    app.setAppLogsPath();
    logDirectory=app.getPath('logs');
    mkdirSync(logDirectory,{recursive:true,mode:0o700});
    logFile=join(logDirectory,'mpc-workspace.log');
    try{writeFileSync(logFile,'',{encoding:'utf8',flag:'a',mode:0o600})}catch{}
    installApplicationMenu();
    installIpcHandlers();
    session.defaultSession.setPermissionCheckHandler(()=>false);
    session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
    mainWindow=createMainWindow();
    try{secretStore=createWorkspaceSecretStore({filePath:join(app.getPath('userData'),'connector-credentials.enc.json'),safeStorage})}
    catch(error){secretStoreError=errorCode(error);logEvent('error','credential_store_unavailable',{error:secretStoreError})}
    screenHost=createScreenCaptureHost({electron:{BrowserWindow,desktopCapturer,screen,ipcMain,powerMonitor,globalShortcut,session},
      getWindow:()=>mainWindow,getWorkspace:()=>workspaceService,getOrigin:()=>workspaceOrigin,assertTrustedSender,
      assetRoot:app.isPackaged?join(process.resourcesPath,'mpc-ocr'):join(DESKTOP_ROOT,'..','.sites-runtime','mpc-ocr')});
    await loadWorkspace();
  }).catch(error=>{
    logEvent('error','application_start_failed',{error:errorSummary(error)});
    process.exitCode=1;
    app.quit();
  });
  app.on('activate',()=>{
    if(BrowserWindow.getAllWindows().length===0){mainWindow=createMainWindow();void loadWorkspace()}
  });
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
  app.on('before-quit',event=>{
    screenHost?.stop('APPLICATION_CLOSED');secretStore?.close();
    if(!workspaceService)return;
    event.preventDefault();
    let exitCode=0;
    closeWorkspaceService().catch(error=>{exitCode=1;logEvent('error','service_close_failed',{error:errorSummary(error)})}).finally(()=>app.exit(exitCode));
  });
}
