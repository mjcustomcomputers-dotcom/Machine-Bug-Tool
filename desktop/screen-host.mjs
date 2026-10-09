import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createScreenOcr} from '../lib/mpc-screen-ocr.mjs';
import {createScreenCapturePipeline} from '../lib/mpc-screen-cache.mjs';
import {createScreenObservationClassifier} from '../lib/mpc-screen-classifier.mjs';
import {screenSettings} from './renderer/screen-policy.js';

const CAPTURE_PRELOAD=fileURLToPath(new URL('./capture-preload.cjs',import.meta.url));
const INDICATOR_PRELOAD=fileURLToPath(new URL('./screen-indicator-preload.cjs',import.meta.url));
const fail=code=>{throw Object.assign(Error(code),{code})};
const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/gu,' ').slice(0,200);
const code=error=>String(error?.code??error?.message??'SCREEN_ERROR').replace(/[^A-Z0-9_:-]/giu,'_').slice(0,160);
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export function createScreenCaptureHost({electron,getWindow,getWorkspace,getOrigin,assertTrustedSender,assetRoot,
  ocrFactory=createScreenOcr,pipelineFactory=createScreenCapturePipeline,classifierFactory=createScreenObservationClassifier,now=()=>Date.now()}={}){
  const {BrowserWindow,desktopCapturer,screen,ipcMain,powerMonitor,globalShortcut,session}=electron;
  let capture=null,indicator=null,pipeline=null,current=null,knownSources=new Map(),generation=0,lastBeat=0,watchdog=null;
  let lastMetrics={},sampler={},closing=Promise.resolve(),printShortcut=false,stopShortcut=false;
  let cpu=process.cpuUsage(),cpuAt=now();
  let classifier=classifierFactory({now}),resultSequence=0;
  const notify=value=>{const window=getWindow();if(window&&!window.isDestroyed())window.webContents.send('mpc-workspace:screen-event',value)};
  function currentProject(){return getWorkspace()?.service?.activeProjectId??null}
  function guardWorker(event){
    if(!current||!capture||capture.isDestroyed()||event.sender!==capture.webContents||event.senderFrame!==capture.webContents.mainFrame||
      event.senderFrame.url!==`${getOrigin()}/capture.html`)fail('SCREEN_CAPTURE_SENDER_REJECTED');
    if(current.projectId!==currentProject()){stop('PROJECT_CHANGED');fail('SCREEN_PROJECT_CHANGED');}
  }
  function metrics(){
    const elapsed=Math.max(1,now()-cpuAt),used=process.cpuUsage(cpu);cpu=process.cpuUsage();cpuAt=now();
    const memory=process.memoryUsage();
    return {main_cpu_percent:(used.user+used.system)/1000/elapsed*100,cpu_percent_basis:'ONE_LOGICAL_CORE',main_rss_bytes:memory.rss,main_heap_bytes:memory.heapUsed,
      pipeline:pipeline?.status?.()??lastMetrics,sampler:{...sampler},classifier:classifier.status?.(),capture_active:!!current,
      note:'Main-process CPU/RSS include its OCR worker threads. CPU 100% means one logical core. Capture/GPU renderer processes and Ollama are separate; inspect their observed PIDs and the main process Threads in Process Explorer.'};
  }
  function status(){return {state:current?'CAPTURING':'STOPPED',session:current?{sessionId:current.sessionId,sourceId:current.sourceId,
    sourceName:current.sourceName,projectId:current.projectId,settings:current.settings,startedAt:current.startedAt}:null,
    print_screen_registered:printShortcut,stop_shortcut_registered:stopShortcut,metrics:metrics()};}
  function observeSampler(value){
    if(!value||typeof value!=='object')return;
    for(const key of ['sampled','pixel_unchanged','png_candidates','png_encoded','busy_skipped','retained_pixel_bytes','refresh_ms'])
      if(Number.isSafeInteger(value[key])&&value[key]>=0)sampler[key]=value[key];
  }
  function stop(reason='USER_STOP'){
    classifier.reset(reason);resultSequence++;
    generation++;const old=pipeline;pipeline=null;current=null;
    if(watchdog)clearInterval(watchdog);watchdog=null;
    if(printShortcut)globalShortcut.unregister('PrintScreen');printShortcut=false;
    if(stopShortcut)globalShortcut.unregister('CommandOrControl+Shift+F8');stopShortcut=false;
    const worker=capture;capture=null;if(worker&&!worker.isDestroyed())worker.destroy();
    const badge=indicator;indicator=null;if(badge&&!badge.isDestroyed())badge.destroy();
    const window=getWindow();if(window&&!window.isDestroyed())window.setContentProtection(false);
    old?.stop?.(reason);
    lastMetrics=old?.status?.()??lastMetrics;
    if(old){const previous=closing;closing=Promise.allSettled([previous,Promise.resolve(old.close?.())]).then(()=>{});}
    notify({type:'STOPPED',reason:clean(reason),metrics:lastMetrics});
    return {state:'STOPPED',reason:clean(reason)};
  }
  async function listSources(){
    const rows=await desktopCapturer.getSources({types:['window','screen'],thumbnailSize:{width:0,height:0},fetchWindowIcons:false});
    const displays=screen.getAllDisplays();knownSources=new Map();
    for(const item of rows.slice(0,256)){
      if(item.name==='MPC capture worker'||item.name==='MPC Screen Reader')continue;
      const display=displays.find(row=>String(row.id)===item.display_id);
      const entry={id:item.id,name:clean(item.name),kind:item.id.startsWith('screen:')?'screen':'window',displayId:item.display_id||null,
        pixelWidth:display?Math.round(display.size.width*display.scaleFactor):null,
        pixelHeight:display?Math.round(display.size.height*display.scaleFactor):null,scaleFactor:display?.scaleFactor??null};
      knownSources.set(item.id,{...entry,listedAt:now()});
    }
    return {sources:[...knownSources.values()].map(({listedAt,...row})=>row),thumbnails_captured:false};
  }
  function showIndicator(){
    const area=screen.getPrimaryDisplay().workArea;
    const script="document.getElementById('stop').addEventListener('click',()=>window.mpcCaptureIndicator.stop());";
    const hash=createHash('sha256').update(script).digest('base64');
    const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${hash}'"><title>MPC Screen Reader</title><style>body{margin:0;background:#183a32;color:white;font:14px 'Segoe UI',sans-serif;display:flex;align-items:center;gap:12px;padding:10px}span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}button{font:inherit;font-weight:700;background:#fff;color:#15372c;border:0;border-radius:6px;padding:10px 16px;cursor:pointer}button:focus-visible{outline:3px solid #f8cc63}</style><span>● MPC reading ${escape(current.sourceName)}</span><button id="stop">Stop</button><script>${script}</script></html>`;
    indicator=new BrowserWindow({title:'MPC Screen Reader',width:380,height:62,x:area.x+area.width-392,y:area.y+12,
      frame:false,show:true,alwaysOnTop:true,skipTaskbar:true,resizable:false,minimizable:false,maximizable:false,
      webPreferences:{preload:INDICATOR_PRELOAD,contextIsolation:true,sandbox:true,nodeIntegration:false,webviewTag:false}});
    indicator.setContentProtection(true);
    indicator.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    const badge=indicator;
    badge.on('close',()=>{if(current&&indicator===badge)stop('INDICATOR_CLOSED')});
    badge.on('unresponsive',()=>{if(current&&indicator===badge)stop('INDICATOR_UNRESPONSIVE')});
    badge.webContents.on('render-process-gone',()=>{if(current&&indicator===badge)stop('INDICATOR_PROCESS_EXITED')});
    void badge.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(()=>{if(current&&indicator===badge)stop('INDICATOR_LOAD_FAILED')});
  }
  async function start(input){
    if(!input||typeof input.sourceId!=='string'||input.projectId!==currentProject()||!input.projectId)fail('SCREEN_SELECT_PROJECT_FIRST');
    const settings=screenSettings(input);const selected=knownSources.get(input.sourceId);
    if(!selected||now()-selected.listedAt>300_000)fail('SCREEN_REFRESH_SOURCE_LIST');
    stop('NEW_SESSION');const version=generation;await closing;
    if(version!==generation||input.projectId!==currentProject())fail('SCREEN_START_CANCELLED');
    const live=await desktopCapturer.getSources({types:[selected.kind],thumbnailSize:{width:0,height:0},fetchWindowIcons:false});
    if(version!==generation||input.projectId!==currentProject())fail('SCREEN_START_CANCELLED');
    if(!live.some(row=>row.id===selected.id))fail('SCREEN_SOURCE_UNAVAILABLE');
    // A revoked classifier may still be unwinding a bounded native await.
    // Give the new consent session its own state so its first result cannot
    // inherit that prior instance's busy flag or retained interpretation.
    classifier=classifierFactory({now});
    const sessionId=randomUUID();
    sampler={};
    current={sessionId,sourceId:selected.id,sourceName:selected.name,projectId:input.projectId,settings,startedAt:new Date(now()).toISOString(),
      configurationIssued:false,desktopRequestPending:false};
    try{
    const ocr=ocrFactory({assetRoot});
    pipeline=pipelineFactory({ocr,onResult:async receipt=>{
      if(!current||version!==generation)return;
      if(current.projectId!==currentProject()){stop('PROJECT_CHANGED');return;}
      const sequence=++resultSequence,started=performance.now();let classification;
      try{classification=await classifier.analyze(receipt)}catch(error){classification={status:'UNAVAILABLE',summary:'Local classification was unavailable for this observation.',error:code(error),source_authentication:false,external_action_authorized:false};}
      if(!current||version!==generation||sequence!==resultSequence)return;
      if(current.projectId!==currentProject()){stop('PROJECT_CHANGED');return;}
      const delivered=now(),captured=Date.parse(receipt.frame?.captured_at);
      const enriched={...receipt,classification,classifier_duration_ms:Math.max(0,performance.now()-started),
        ocr_delivered_at:receipt.delivered_at,delivered_at:new Date(delivered).toISOString(),
        capture_to_delivery_ms:Number.isFinite(captured)?Math.max(0,delivered-captured):receipt.capture_to_delivery_ms};
      notify({type:'RESULT',receipt:enriched,sourceName:selected.name,metrics:metrics()});
      if(settings.mode==='single')stop('SINGLE_FRAME_COMPLETE');
    },onError:error=>{if(current&&version===generation){notify({type:'ERROR',code:code(error)});stop('OCR_FAILED')}}});
    pipeline.start({sessionId,sourceId:selected.id,projectId:input.projectId,language:'eng',crop:settings.crop,masks:settings.masks,preprocessing:settings.preprocessing});
    }catch(error){stop(code(error));throw error}
    lastBeat=now();
    try{
      capture=new BrowserWindow({title:'MPC capture worker',show:false,skipTaskbar:true,width:400,height:300,
        webPreferences:{preload:CAPTURE_PRELOAD,contextIsolation:true,sandbox:true,nodeIntegration:false,nodeIntegrationInWorker:false,
          webviewTag:false,backgroundThrottling:false,devTools:false}});
      const captureWindow=capture;
      captureWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      captureWindow.webContents.on('will-navigate',event=>event.preventDefault());
      captureWindow.webContents.on('render-process-gone',()=>{if(current&&capture===captureWindow)stop('CAPTURE_PROCESS_EXITED')});
      captureWindow.on('unresponsive',()=>{if(current&&capture===captureWindow)stop('CAPTURE_PROCESS_UNRESPONSIVE')});
      const ui=getWindow();if(settings.excludeMpc&&ui)ui.setContentProtection(true);
      showIndicator();
      stopShortcut=globalShortcut.register('CommandOrControl+Shift+F8',()=>stop('STOP_SHORTCUT'));
      if(settings.printScreen)printShortcut=globalShortcut.register('PrintScreen',()=>{if(capture&&!capture.isDestroyed())capture.webContents.send('mpc-capture:now')});
      watchdog=setInterval(()=>{
        if(!current)return;
        if(current.projectId!==currentProject())stop('PROJECT_CHANGED');
        else if(now()-lastBeat>15_000)stop('CAPTURE_HEARTBEAT_EXPIRED');
        else if(now()-Date.parse(current.startedAt)>settings.durationMinutes*60_000)stop('SESSION_EXPIRED');
      },2000);watchdog.unref?.();
      await captureWindow.loadURL(`${getOrigin()}/capture.html`);
      if(version!==generation||capture!==captureWindow||!current)fail('SCREEN_START_CANCELLED');
      if(current.projectId!==currentProject()){stop('PROJECT_CHANGED');fail('SCREEN_START_CANCELLED');}
      notify({type:'STARTED',...status()});return status();
    }catch(error){if(version===generation)stop(code(error));throw error}
  }
  const register=(channel,fn)=>ipcMain.handle(channel,(event,...args)=>{assertTrustedSender(event);return fn(...args)});
  register('mpc-workspace:screen-sources',listSources);
  register('mpc-workspace:screen-start',start);
  register('mpc-workspace:screen-stop',()=>stop());
  register('mpc-workspace:screen-status',status);
  register('mpc-workspace:screen-now',()=>{if(!capture||!current)fail('SCREEN_NOT_ACTIVE');capture.webContents.send('mpc-capture:now');return {status:'REQUESTED'}});
  ipcMain.handle('mpc-capture:configuration',event=>{
    guardWorker(event);
    // This fixed helper makes exactly one desktop getUserMedia request after
    // receiving its source. Reading configuration again cannot rearm the grant.
    if(!current.configurationIssued){current.configurationIssued=true;current.desktopRequestPending=true;}
    return {...current.settings,sourceId:current.sourceId};
  });
  ipcMain.handle('mpc-capture:heartbeat',(event,value)=>{guardWorker(event);lastBeat=now();observeSampler(value);return {status:'ACTIVE'}});
  ipcMain.handle('mpc-capture:failed',(event,value)=>{guardWorker(event);notify({type:'ERROR',code:clean(value)});return stop('CAPTURE_FAILED')});
  ipcMain.handle('mpc-capture:frame',(event,input)=>{
    const received=input?.png instanceof ArrayBuffer?new Uint8Array(input.png):null;
    const receivedPreview=input?.previewPng instanceof ArrayBuffer?new Uint8Array(input.previewPng):null;
    try{
      guardWorker(event);lastBeat=now();
      observeSampler(input?.sampler);
      if(!received||received.byteLength>16*1024*1024)fail('SCREEN_FRAME_INVALID');
      if(![input.width,input.height,input.frameWidth,input.frameHeight].every(v=>Number.isSafeInteger(v)&&v>0&&v<=16_384))fail('SCREEN_FRAME_SIZE_INVALID');
      const owner=pipeline,version=generation;
      // submit validates and copies input synchronously. Its Promise represents
      // OCR completion; do not retain IPC pixels or make sampling wait for OCR.
      const completion=owner.submit(Buffer.from(input.png),{capturedAt:input.capturedAt,width:input.width,height:input.height,
        frameWidth:input.frameWidth,frameHeight:input.frameHeight,cropPixels:input.cropPixels});
      void Promise.resolve(completion).catch(error=>{
        if(current&&pipeline===owner&&generation===version){notify({type:'ERROR',code:code(error)});stop('SCREEN_FRAME_REJECTED')}
      });
      if(current?.settings.preview&&receivedPreview&&receivedPreview.byteLength<=2*1024*1024){
        // Give notification serialization its own bounded copy, so erasing the
        // received IPC buffer never relies on webContents.send timing.
        notify({type:'PREVIEW',png:receivedPreview.slice(),width:input.width,height:input.height,captureMs:input.captureMs});
      }
      return {status:'ADMITTED'};
    }finally{
      received?.fill(0);receivedPreview?.fill(0);
    }
  });
  ipcMain.handle('mpc-capture:indicator-stop',event=>{
    if(!indicator||event.sender!==indicator.webContents||event.senderFrame!==indicator.webContents.mainFrame)fail('SCREEN_INDICATOR_SENDER_REJECTED');
    return stop('INDICATOR_STOP');
  });
  // Electron 44.5.1 reports mediaTypes: [] for its legacy desktop transport;
  // only DEVICE_AUDIO_CAPTURE / DEVICE_VIDEO_CAPTURE add audio / video there.
  // See WebContentsPermissionHelper::RequestMediaAccessPermission. An empty
  // list is accepted once, after our fixed helper receives its consent source.
  const permitted=(contents,permission,requestingUrl,isMainFrame)=>!!current&&!!capture&&!capture.isDestroyed()&&
    current.projectId===currentProject()&&contents===capture.webContents&&
    contents.mainFrame.url===`${getOrigin()}/capture.html`&&requestingUrl===`${getOrigin()}/capture.html`&&
    isMainFrame===true&&permission==='media';
  const sameOrigin=value=>{
    if(typeof value!=='string')return false;
    try{
      const actual=new URL(value),expected=new URL(getOrigin());
      return actual.origin!=='null'&&actual.origin===expected.origin&&!actual.username&&!actual.password&&
        actual.pathname==='/'&&!actual.search&&!actual.hash;
    }catch{return false;}
  };
  // The check callback collapses desktop and hardware to mediaType: video.
  // Never pregrant it: the native desktop path calls the request handler below.
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>{
    const allowed=permitted(contents,permission,details?.requestingUrl,details?.isMainFrame)&&
      sameOrigin(details?.securityOrigin)&&current.desktopRequestPending&&
      Array.isArray(details?.mediaTypes)&&details.mediaTypes.length===0;
    if(allowed)current.desktopRequestPending=false;
    callback(!!allowed);
  });
  powerMonitor.on('lock-screen',()=>stop('SCREEN_LOCKED'));
  powerMonitor.on('suspend',()=>stop('COMPUTER_SUSPENDED'));
  return {start,stop,status,listSources,close:async()=>{stop('APPLICATION_CLOSED');await closing}};
}
