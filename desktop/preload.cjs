/* eslint-disable @typescript-eslint/no-require-imports */
// Sandboxed Electron renderers do not support ESM preload imports. This file
// intentionally uses Electron's restricted CommonJS preload subset and exposes
// only fixed, validated request methods through contextBridge.
const {contextBridge,ipcRenderer}=require('electron');

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

const MAX_COPY_CHARACTERS=4*1024*1024;

contextBridge.exposeInMainWorld('mpcWorkspace',Object.freeze({
  getRuntimeStatus:()=>ipcRenderer.invoke(IPC.runtimeStatus),
  chooseFiles:()=>ipcRenderer.invoke(IPC.chooseFiles),
  chooseFolder:()=>ipcRenderer.invoke(IPC.chooseFolder),
  readClipboardText:()=>ipcRenderer.invoke(IPC.readClipboardText),
  copyText:value=>{
    if(typeof value!=='string'||value.length>MAX_COPY_CHARACTERS)return Promise.reject(new TypeError('MPC_WORKSPACE_COPY_TEXT_INVALID'));
    return ipcRenderer.invoke(IPC.copyText,value);
  },
  openLogs:()=>ipcRenderer.invoke(IPC.openLogs),
  restartService:()=>ipcRenderer.invoke(IPC.restartService),
  setInterfaceZoom:value=>{
    if(typeof value!=='number'||!Number.isFinite(value)||value<0.5||value>2)return Promise.reject(new TypeError('MPC_WORKSPACE_INTERFACE_ZOOM_INVALID'));
    return ipcRenderer.invoke(IPC.setInterfaceZoom,value);
  },
  screenSources:()=>ipcRenderer.invoke('mpc-workspace:screen-sources'),
  screenStart:input=>ipcRenderer.invoke('mpc-workspace:screen-start',input),
  screenStop:()=>ipcRenderer.invoke('mpc-workspace:screen-stop'),
  screenStatus:()=>ipcRenderer.invoke('mpc-workspace:screen-status'),
  screenNow:()=>ipcRenderer.invoke('mpc-workspace:screen-now'),
  onScreenEvent:callback=>{
    if(typeof callback!=='function')throw new TypeError('SCREEN_CALLBACK_REQUIRED');
    const listener=(_event,value)=>callback(value);ipcRenderer.on('mpc-workspace:screen-event',listener);
    return ()=>ipcRenderer.removeListener('mpc-workspace:screen-event',listener);
  },
  credentialStatus:()=>ipcRenderer.invoke('mpc-workspace:credential-status'),
  credentialSave:input=>ipcRenderer.invoke('mpc-workspace:credential-save',input),
  credentialRemove:reference=>ipcRenderer.invoke('mpc-workspace:credential-remove',reference),
}));
