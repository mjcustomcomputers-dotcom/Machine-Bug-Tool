const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('mpcCaptureIndicator',Object.freeze({
  stop:()=>ipcRenderer.invoke('mpc-capture:indicator-stop')
}));
