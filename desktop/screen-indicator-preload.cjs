/* eslint-disable @typescript-eslint/no-require-imports */
// Electron sandbox preloads intentionally use the restricted CommonJS bridge.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('mpcCaptureIndicator',Object.freeze({
  stop:()=>ipcRenderer.invoke('mpc-capture:indicator-stop')
}));
