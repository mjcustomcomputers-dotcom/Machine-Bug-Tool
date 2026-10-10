const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('mpcCapture',Object.freeze({
  configuration:()=>ipcRenderer.invoke('mpc-capture:configuration'),
  frame:input=>ipcRenderer.invoke('mpc-capture:frame',input),
  failed:code=>ipcRenderer.invoke('mpc-capture:failed',String(code).slice(0,160)),
  heartbeat:metrics=>ipcRenderer.invoke('mpc-capture:heartbeat',metrics),
  onCaptureNow:callback=>{
    if(typeof callback!=='function')return;
    const handler=()=>callback();ipcRenderer.on('mpc-capture:now',handler);
    return ()=>ipcRenderer.removeListener('mpc-capture:now',handler);
  }
}));
