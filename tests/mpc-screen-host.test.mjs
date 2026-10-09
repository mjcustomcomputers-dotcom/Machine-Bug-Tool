import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import {createScreenCaptureHost} from '../desktop/screen-host.mjs';
import {pixelRect,maskRects,SCREEN_MAX_PIXELS,prepareOcrPixels,createScreenChangeGate} from '../desktop/renderer/screen-policy.js';

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function input(extra={}){return {sourceId:'screen:1:0',projectId:'project-1',consent:true,mode:'live',fps:1,durationMinutes:5,crop:{x:0,y:0,width:1,height:1},masks:[],preview:false,printScreen:false,excludeMpc:true,...extra}}
function fixture(t,{classifierFactory}={}){
  let time=1_000_000,project='project-1',sourceImplementation=null,loadImplementation=null,submitImplementation=null,classifierImplementation=null;
  const windows=[],pipelines=[],handlers=new Map(),sourceCalls=[],registered=new Map(),power=new EventEmitter(),trusted={id:'trusted-ui'};
  const sources=[{id:'screen:1:0',name:'Screen 1',display_id:'1'},{id:'window:7:0',name:'Chosen document',display_id:''}];
  class Contents extends EventEmitter{
    constructor(){super();this.mainFrame={url:''};this.messages=[]}
    setWindowOpenHandler(callback){this.openHandler=callback}
    send(channel,value){this.messages.push({channel,value:structuredClone(value)})}
  }
  class Window extends EventEmitter{
    constructor(options={}){super();this.options=options;this.webContents=new Contents();this.destroyed=false;this.protection=false;windows.push(this)}
    isDestroyed(){return this.destroyed}
    destroy(){this.destroyed=true;this.emit('closed')}
    setContentProtection(value){this.protection=value}
    async loadURL(url){this.webContents.mainFrame.url=url;return loadImplementation?loadImplementation(this,url):undefined}
  }
  const mainWindow=new Window({title:'MPC Workspace'});mainWindow.webContents.mainFrame.url='http://127.0.0.1:4321/';
  const ses={setPermissionCheckHandler(fn){this.check=fn},setPermissionRequestHandler(fn){this.request=fn},setDisplayMediaRequestHandler(fn){this.display=fn}};
  const electron={BrowserWindow:Window,desktopCapturer:{getSources:async options=>{sourceCalls.push(options);return sourceImplementation?sourceImplementation(options):sources}},
    screen:{getAllDisplays:()=>[{id:1,size:{width:1920,height:1080},scaleFactor:1.5}],getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1920,height:1080}})},
    ipcMain:{handle:(channel,fn)=>handlers.set(channel,fn)},powerMonitor:power,globalShortcut:{register:(key,fn)=>{registered.set(key,fn);return true},unregister:key=>registered.delete(key)},session:{defaultSession:ses}};
  const host=createScreenCaptureHost({electron,getWindow:()=>mainWindow,getWorkspace:()=>({service:{activeProjectId:project}}),getOrigin:()=>'http://127.0.0.1:4321',assetRoot:'/unused-test-assets',now:()=>time,
    assertTrustedSender:event=>{if(event!==trusted)throw Object.assign(Error('UNTRUSTED_UI'),{code:'UNTRUSTED_UI'})},
    ocrFactory:()=>({}),classifierFactory:classifierFactory??(()=>({analyze:async receipt=>classifierImplementation?classifierImplementation(receipt):({status:'CLASSIFIED',summary:'Synthetic fixture'}),reset(){},status(){return {}}})),pipelineFactory:callbacks=>{
      const item={callbacks,stopped:[],closed:0,frames:[],scope:null,
        start(value){this.scope=value},stop(reason){this.stopped.push(reason)},close(){this.closed++;return Promise.resolve()},status(){return {in_flight:0,pending:0}},
        submit(bytes,metadata){const frame={received:bytes,bytes:Buffer.from(bytes),metadata:structuredClone(metadata)};this.frames.push(frame);return submitImplementation?submitImplementation(frame):Promise.resolve({status:'ANALYZED'})}};
      pipelines.push(item);return item;
    }});
  t.after(()=>host.close());
  return {host,windows,pipelines,handlers,trusted,ses,power,sourceCalls,registered,mainWindow,sources,
    setSourceImplementation:fn=>{sourceImplementation=fn},setLoadImplementation:fn=>{loadImplementation=fn},setSubmitImplementation:fn=>{submitImplementation=fn},setClassifierImplementation:fn=>{classifierImplementation=fn},setProject:value=>{project=value},setTime:value=>{time=value},
    capture:()=>windows.filter(window=>window.options.title==='MPC capture worker').at(-1),
    indicator:()=>windows.filter(window=>window.options.title==='MPC Screen Reader').at(-1),
    results:()=>mainWindow.webContents.messages.filter(message=>message.value?.type==='RESULT'),
    event(window){return {sender:window.webContents,senderFrame:window.webContents.mainFrame}},
  };
}

test('source selection enumerates metadata without thumbnails and requires explicit project consent',async t=>{
  const f=fixture(t);const listing=await f.host.listSources();assert.equal(listing.thumbnails_captured,false);assert.equal(listing.sources[0].pixelWidth,2880);
  assert.ok(f.sourceCalls.every(call=>call.thumbnailSize.width===0&&call.thumbnailSize.height===0));
  for(const extra of [{consent:false},{projectId:'another-project'},{sourceId:'window:unknown:0'}])await assert.rejects(f.host.start(input(extra)));
  assert.equal(f.windows.length,1);assert.equal(f.host.status().state,'STOPPED');
  assert.throws(()=>f.handlers.get('mpc-workspace:screen-start')({},input()),/UNTRUSTED_UI/u);
});

test('two simultaneous starts cannot create two capture windows or orphan an older source',async t=>{
  const f=fixture(t);await f.host.listSources();
  const a=f.host.start(input()),b=f.host.start(input({sourceId:'window:7:0'}));
  const results=await Promise.allSettled([a,b]);
  assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'fulfilled');
  assert.equal(f.windows.filter(window=>window.options.title==='MPC capture worker'&&!window.destroyed).length,1);
  assert.equal(f.host.status().session.sourceId,'window:7:0');
});

test('a new consent session gets a fresh classifier while revoked native work unwinds',async t=>{
  const wait=deferred();let instances=0;
  const f=fixture(t,{classifierFactory:()=>{const instance=instances++;return {reset(){},status(){return {instance}},
    async analyze(){if(instance===1)await wait.promise;return {status:'CLASSIFIED',instance};}};}});
  await f.host.listSources();await f.host.start(input());
  const old=f.pipelines[0].callbacks.onResult({ocr:{text:'old'}});await tick();
  await f.host.start(input({sourceId:'window:7:0'}));
  await f.pipelines[1].callbacks.onResult({ocr:{text:'new'}});
  assert.equal(f.results().length,1);assert.equal(f.results()[0].value.receipt.classification.instance,2);
  wait.resolve();await old;assert.equal(f.results().length,1);
});

test('stop during source reacquisition prevents a late source response from starting capture',async t=>{
  const f=fixture(t);await f.host.listSources();const source=deferred();f.setSourceImplementation(()=>source.promise);
  const pending=f.host.start(input()),rejected=assert.rejects(pending,/START_CANCELLED/u);await tick();f.host.stop('USER_STOP');source.resolve(f.sources);await rejected;
  assert.equal(f.windows.length,1);assert.equal(f.host.status().state,'STOPPED');
});

test('a prior capture load failure cannot stop a newer accepted session',async t=>{
  const f=fixture(t);await f.host.listSources();const firstLoad=deferred();let loads=0;
  f.setLoadImplementation(window=>{if(window.options.title==='MPC capture worker'&&++loads===1)return firstLoad.promise});
  const a=f.host.start(input());const rejected=assert.rejects(a);await tick();
  const b=await f.host.start(input({sourceId:'window:7:0'}));assert.equal(b.state,'CAPTURING');firstLoad.reject(Error('old navigation cancelled'));await rejected;
  assert.equal(f.host.status().state,'CAPTURING');assert.equal(f.host.status().session.sourceId,'window:7:0');assert.equal(f.capture().destroyed,false);
});

test('repeated stop calls retain an earlier OCR cleanup promise before a new capture starts',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input());const cleanup=deferred();
  f.pipelines[0].close=()=>cleanup.promise;f.host.stop('FIRST_STOP');f.host.stop('SECOND_STOP');
  const restarted=f.host.start(input({sourceId:'window:7:0'}));await tick();
  const countBeforeCleanup=f.windows.filter(window=>window.options.title==='MPC capture worker').length;
  cleanup.resolve();await restarted;assert.equal(countBeforeCleanup,1);
});

test('a project change while the capture page loads prevents a STARTED result',async t=>{
  const f=fixture(t);await f.host.listSources();const load=deferred();f.setLoadImplementation(window=>window.options.title==='MPC capture worker'?load.promise:undefined);
  const pending=f.host.start(input());await tick();f.setProject('project-2');load.resolve();
  await assert.rejects(pending,/START_CANCELLED/u);assert.equal(f.host.status().state,'STOPPED');assert.equal(f.capture().destroyed,true);
});

test('source disappearance and expired source selection both fail before acquiring pixels',async t=>{
  const f=fixture(t);await f.host.listSources();f.setSourceImplementation(()=>[]);await assert.rejects(f.host.start(input()),/SOURCE_UNAVAILABLE/u);
  assert.equal(f.windows.length,1);f.setTime(1_400_000);await assert.rejects(f.host.start(input()),/REFRESH_SOURCE_LIST/u);
});

test('late OCR from a replaced session is not delivered to the workspace',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input());const old=f.pipelines[0];await f.host.start(input({sourceId:'window:7:0'}));
  await old.callbacks.onResult({ocr:{text:'old'}});assert.equal(f.results().length,0);assert.equal(f.host.status().session.sourceId,'window:7:0');
  await f.pipelines[1].callbacks.onResult({ocr:{text:'new'}});assert.equal(f.results().length,1);
});

test('a project change during OCR suppresses delivery and revokes the native capture',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input());f.setProject('project-2');await f.pipelines[0].callbacks.onResult({ocr:{text:'private old project'}});
  assert.equal(f.results().length,0);assert.equal(f.host.status().state,'STOPPED');assert.equal(f.capture().destroyed,true);
});

test('a project change during asynchronous classification revokes capture before result delivery',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input());const classifier=deferred();f.setClassifierImplementation(()=>classifier.promise);
  const pending=f.pipelines[0].callbacks.onResult({ocr:{text:'prior project'}});f.setProject('project-2');classifier.resolve({status:'CLASSIFIED'});await pending;
  assert.equal(f.results().length,0);assert.equal(f.host.status().state,'STOPPED');assert.equal(f.capture().destroyed,true);
});

test('late classification cannot replace a newer result or stop a newly selected source',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input());const jobs=[];
  f.setClassifierImplementation(()=>{const job=deferred();jobs.push(job);return job.promise});
  const first=f.pipelines[0].callbacks.onResult({ocr:{text:'first'}}),second=f.pipelines[0].callbacks.onResult({ocr:{text:'second'}});
  jobs[1].resolve({status:'CLASSIFIED'});await second;jobs[0].resolve({status:'CLASSIFIED'});await first;
  assert.equal(f.results().length,1);assert.equal(f.results()[0].value.receipt.ocr.text,'second');
  const stale=f.pipelines[0].callbacks.onResult({ocr:{text:'old source'}});await f.host.start(input({sourceId:'window:7:0'}));jobs[2].resolve({status:'CLASSIFIED'});await stale;
  assert.equal(f.results().length,1);assert.equal(f.host.status().session.sourceId,'window:7:0');assert.equal(f.capture().destroyed,false);
});

test('native lock, suspend and the always-available stop shortcut destroy the hidden renderer',async t=>{
  const f=fixture(t);await f.host.listSources();
  for(const event of ['lock-screen','suspend']){
    await f.host.start(input());const capture=f.capture(),indicator=f.indicator();f.power.emit(event);
    assert.equal(capture.destroyed,true);assert.equal(indicator.destroyed,true);assert.equal(f.host.status().state,'STOPPED');assert.equal(f.mainWindow.protection,false);
  }
  await f.host.start(input({printScreen:true}));assert.ok(f.registered.has('PrintScreen'));f.registered.get('CommandOrControl+Shift+F8')();
  assert.equal(f.capture().destroyed,true);assert.equal(f.registered.size,0);
});

test('capture configuration and pixels require the exact current worker main frame',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input());const worker=f.capture(),config=f.handlers.get('mpc-capture:configuration');
  const configured=config(f.event(worker));assert.equal(configured.sourceId,'screen:1:0');
  assert.throws(()=>config(f.event(f.mainWindow)),/SENDER_REJECTED/u);
  assert.throws(()=>config({sender:worker.webContents,senderFrame:{url:worker.webContents.mainFrame.url}}),/SENDER_REJECTED/u);
  const submit=f.handlers.get('mpc-capture:frame');
  assert.throws(()=>submit(f.event(worker),{png:'url',width:8,height:4,frameWidth:8,frameHeight:4}),/FRAME_INVALID/u);
  assert.throws(()=>submit(f.event(worker),{png:new ArrayBuffer(4),width:NaN,height:4,frameWidth:8,frameHeight:4}),/SIZE_INVALID/u);
  f.host.stop();assert.throws(()=>config(f.event(worker)),/SENDER_REJECTED/u);assert.equal(f.pipelines[0].frames.length,0);
});

test('a project mismatch on the next worker heartbeat revokes capture immediately',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input());f.setProject('project-2');
  assert.throws(()=>f.handlers.get('mpc-capture:heartbeat')(f.event(f.capture())),/PROJECT_CHANGED/u);
  assert.equal(f.host.status().state,'STOPPED');assert.equal(f.capture().destroyed,true);
});

test('frame admission acknowledges before OCR finishes, preserves provenance and erases received IPC pixels',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input({preview:true}));const recognition=deferred();f.setSubmitImplementation(()=>recognition.promise);
  const png=new Uint8Array([1,2,3,4]).buffer,previewPng=new Uint8Array([5,6,7]).buffer;
  const metadata={width:16,height:8,frameWidth:16,frameHeight:8,cropPixels:{x:0,y:0,width:16,height:8},capturedAt:'1970-01-01T00:16:40.000Z'};
  const ack=f.handlers.get('mpc-capture:frame')(f.event(f.capture()),{png,previewPng,...metadata,captureMs:12});
  assert.deepEqual(ack,{status:'ADMITTED'});assert.equal(typeof ack?.then,'undefined');assert.equal(f.results().length,0);
  const retained=f.pipelines[0].frames[0];assert.deepEqual([...retained.bytes],[1,2,3,4]);assert.deepEqual(retained.metadata,metadata);
  assert.deepEqual([...new Uint8Array(png)],[0,0,0,0]);assert.deepEqual([...retained.received],[0,0,0,0]);assert.deepEqual([...new Uint8Array(previewPng)],[0,0,0]);
  const preview=f.mainWindow.webContents.messages.find(message=>message.value?.type==='PREVIEW').value;
  assert.deepEqual([...preview.png],[5,6,7]);recognition.resolve({status:'ANALYZED'});await tick();
});

test('rejected frame metadata is cleared without retaining PNG or preview buffers',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input());
  const png=new Uint8Array([1,2,3]).buffer,previewPng=new Uint8Array([4,5]).buffer;
  assert.throws(()=>f.handlers.get('mpc-capture:frame')(f.event(f.capture()),{png,previewPng,width:NaN,height:8,frameWidth:16,frameHeight:8}),/SIZE_INVALID/u);
  assert.deepEqual([...new Uint8Array(png)],[0,0,0]);assert.deepEqual([...new Uint8Array(previewPng)],[0,0]);assert.equal(f.pipelines[0].frames.length,0);
});

test('a delayed rejected frame from an old admission cannot stop the replacement session',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input());const rejected=deferred();f.setSubmitImplementation(()=>rejected.promise);
  const ack=f.handlers.get('mpc-capture:frame')(f.event(f.capture()),{png:new Uint8Array([1,2,3]).buffer,width:16,height:8,frameWidth:16,frameHeight:8,cropPixels:{x:0,y:0,width:16,height:8}});
  assert.deepEqual(ack,{status:'ADMITTED'});await f.host.start(input({sourceId:'window:7:0'}));rejected.reject(Error('INVALID_OLD_FRAME'));await tick();
  assert.equal(f.host.status().state,'CAPTURING');assert.equal(f.host.status().session.sourceId,'window:7:0');assert.equal(f.capture().destroyed,false);
});

test('indicator process failure revokes capture instead of allowing unobservable recording',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input());f.indicator().webContents.emit('render-process-gone');
  assert.equal(f.host.status().state,'STOPPED');assert.equal(f.capture().destroyed,true);
});

test('single-frame capture stops and destroys its renderer after the OCR observation is delivered',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input({mode:'single'}));await f.pipelines[0].callbacks.onResult({ocr:{text:'one frame'}});
  assert.equal(f.results().length,1);assert.equal(f.host.status().state,'STOPPED');assert.equal(f.capture().destroyed,true);
});

test('the general UI and microphone requests never receive capture permission',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input());
  assert.equal(f.ses.check(f.mainWindow.webContents,'media','http://127.0.0.1:4321',{isMainFrame:true}),false);
  let audio;
  f.ses.request(f.capture().webContents,'media',value=>{audio=value},{isMainFrame:true,requestingUrl:'http://127.0.0.1:4321/capture.html',mediaTypes:['audio']});
  assert.equal(audio,false);f.host.stop();assert.equal(f.ses.check(f.capture().webContents,'display-capture'),false);
});

test('video permission requires the exact active capture origin and main frame',async t=>{
  const f=fixture(t);await f.host.listSources();await f.host.start(input());const worker=f.capture().webContents;
  const origin='http://127.0.0.1:4321',requestingUrl=`${origin}/capture.html`,check={isMainFrame:true,requestingUrl,mediaType:'video'};
  assert.equal(f.ses.check(worker,'media',origin,check),true);
  for(const [requestOrigin,details] of [[origin,{...check,isMainFrame:false}],[origin,{...check,isMainFrame:undefined}],
    [origin,{...check,requestingUrl:`${origin}/`}],['https://example.invalid',check],[origin,{...check,mediaType:'audio'}]]){
    assert.equal(f.ses.check(worker,'media',requestOrigin,details),false);
  }
  const request={isMainFrame:true,requestingUrl,mediaTypes:['video']};
  let permitted;f.ses.request(worker,'media',value=>{permitted=value},request);assert.equal(permitted,true);
  for(const details of [{...request,isMainFrame:false},{...request,requestingUrl:`${origin}/`},{...request,mediaTypes:['audio','video']},{...request,mediaTypes:[]}]){
    f.ses.request(worker,'media',value=>{permitted=value},details);assert.equal(permitted,false);
  }
  worker.mainFrame.url=`${origin}/unexpected.html`;assert.equal(f.ses.check(worker,'media',origin,check),false);worker.mainFrame.url=requestingUrl;
  f.setProject('another-project');assert.equal(f.ses.check(worker,'media',origin,check),false);
});

function rendererFixture({imageMode='native',masks=[],preprocess=prepareOcrPixels,digestGate}={}){
  const encodes=[],draws=[],delivered=[],submitted=[],canvases=[],encodedBuffers=[],pixelBuffers=[],encodedPixels=[],events=new Map(),acknowledgements=[];
  const encodeWaiters=[],inspectionWaiters=[],inspectionResults=[],digestInputs=[],failures=[],timeouts=new Map(),failure=deferred();let captureNow,trackStops=0,pixelVersion=0,timerSequence=0;
  const tracks=[{addEventListener:(name,fn)=>events.set(`track-${name}`,fn),stop:()=>{trackStops++}}];
  const video={videoWidth:16,videoHeight:8,readyState:3,srcObject:null,play:async()=>{}};
  let canvasCount=0;
  const settings={...input(),sourceId:'screen:1:0',preview:true,imageMode,masks};
  const fakeDocument={getElementById:()=>video,createElement:()=>{
    const name=++canvasCount===1?'image':'preview';
    const canvas={width:1,height:1,pixels:new Uint8ClampedArray(4),
      toBlob:callback=>{encodedPixels.push({name,width:canvas.width,height:canvas.height,pixels:canvas.pixels.slice()});encodes.push({name,callback});for(const waiter of encodeWaiters.splice(0))waiter.resolve()}};
    const context={
      drawImage:(...args)=>{
        draws.push({name,kind:'draw',args});
        canvas.pixels=new Uint8ClampedArray(canvas.width*canvas.height*4).fill(128);
        for(let index=3;index<canvas.pixels.length;index+=4)canvas.pixels[index]=255;
        canvas.pixels[0]=128+pixelVersion;
        if(args[0]!==video&&args[0].pixels?.length===canvas.pixels.length)canvas.pixels.set(args[0].pixels);
      },
      fillRect:(x,y,width,height)=>{
        draws.push({name,kind:'mask',args:[x,y,width,height]});
        for(let row=y;row<y+height;row++)for(let column=x;column<x+width;column++){
          const offset=(row*canvas.width+column)*4;canvas.pixels[offset]=canvas.pixels[offset+1]=canvas.pixels[offset+2]=0;canvas.pixels[offset+3]=255;
        }
      },
      getImageData:()=>{const data=canvas.pixels.slice();pixelBuffers.push(data);return {data,width:canvas.width,height:canvas.height}},
      putImageData:pixels=>{draws.push({name,kind:'photometry',args:[]});canvas.pixels.set(pixels.data)},
    };
    canvas.getContext=()=>context;
    canvases.push(canvas);return canvas;
  }};
  const bridge={configuration:async()=>settings,heartbeat:async()=>({status:'ACTIVE'}),failed:async code=>{failures.push(code);failure.resolve(code);for(const waiter of [...encodeWaiters.splice(0),...inspectionWaiters.splice(0)])waiter.reject(Error(String(code)))},onCaptureNow:fn=>{captureNow=fn},
    frame:packet=>{submitted.push(packet);delivered.push(structuredClone(packet));const wait=deferred();acknowledgements.push(wait);return wait.promise}};
  const source=readFileSync(new URL('../desktop/renderer/capture.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/u,'');
  const runtime={mpcCapture:bridge,document:fakeDocument,navigator:{mediaDevices:{getUserMedia:async request=>{
    assert.equal(request.audio,false);assert.equal(request.video.mandatory.chromeMediaSourceId,'screen:1:0');
    return {getTracks:()=>tracks,getVideoTracks:()=>tracks};
  }}},performance:{now:()=>0},Date,crypto:webcrypto,pixelRect,maskRects,SCREEN_MAX_PIXELS,prepareOcrPixels:preprocess,
    createScreenChangeGate:()=>{
      const gate=createScreenChangeGate({now:()=>0,digest:async bytes=>{digestInputs.push(bytes);if(digestGate)await digestGate.promise;return webcrypto.subtle.digest('SHA-256',bytes)}});
      return {...gate,async inspect(...args){const result=await gate.inspect(...args);inspectionResults.push(result);for(const waiter of inspectionWaiters.splice(0))waiter.resolve(result);return result}};
    },
    setTimeout:(callback,delay)=>{const id=++timerSequence;timeouts.set(id,{callback,delay});return id},clearTimeout:id=>timeouts.delete(id),setInterval:()=>2,clearInterval:()=>{},addEventListener:(name,fn)=>events.set(name,fn)};
  runInNewContext(source,runtime);
  return {video,encodes,draws,delivered,submitted,canvases,encodedBuffers,pixelBuffers,encodedPixels,digestInputs,acknowledgements,failures,captureNow:()=>captureNow?.(),unload:()=>events.get('beforeunload')?.(),trackStops:()=>trackStops,
    waitForFailure:()=>failure.promise,
    encoderTimers:()=>[...timeouts.values()].filter(timer=>timer.delay===5000).length,
    fireEncoderDeadline(){const timer=[...timeouts.values()].find(item=>item.delay===5000);assert.ok(timer,'an encoder deadline is active');timer.callback()},
    changeOnePixel:()=>{pixelVersion++},
    waitForEncode(){if(encodes.length)return Promise.resolve();const wait=deferred();encodeWaiters.push(wait);return wait.promise},
    waitForInspection(count){if(inspectionResults.length>=count)return Promise.resolve(inspectionResults[count-1]);const wait=deferred();inspectionWaiters.push(wait);return wait.promise},
    finishNext(){const item=encodes.shift();assert.ok(item,'an encoding is waiting');item.callback({arrayBuffer:async()=>{const buffer=new Uint8Array([1,2,3]).buffer;encodedBuffers.push(buffer);return buffer}});return item.name}};
}

test('overlapping print-screen requests cannot replace a frame while its preview and PNG are encoding',{timeout:5000},async()=>{
  const f=rendererFixture();await f.waitForEncode();assert.equal(f.encodes.length,1);assert.equal(f.draws.filter(row=>row.name==='image').length,1);
  f.video.videoWidth=32;f.video.videoHeight=16;f.captureNow();assert.equal(f.draws.filter(row=>row.name==='image').length,1);
  assert.equal(f.finishNext(),'preview');await tick();assert.equal(f.finishNext(),'image');await tick();
  assert.equal(f.delivered.length,1);assert.equal(f.delivered[0].width,16);assert.equal(f.delivered[0].height,8);
  f.captureNow();await f.waitForEncode();assert.equal(f.draws.filter(row=>row.name==='image').length,2);assert.equal(f.finishNext(),'preview');await tick();assert.equal(f.finishNext(),'image');await tick();
  assert.equal(f.delivered.length,2);assert.equal(f.delivered[1].width,32);assert.equal(f.delivered[1].height,16);
  f.unload();f.acknowledgements.forEach(wait=>wait.resolve({status:'STOPPED'}));assert.ok(f.trackStops()>0);
});

test('a pending encoder cannot submit pixels after the capture renderer unloads',{timeout:5000},async()=>{
  const f=rendererFixture();await f.waitForEncode();f.unload();
  f.finishNext();await tick();
  assert.equal(f.delivered.length,0);assert.equal(f.encodes.length,0);assert.ok(f.trackStops()>0);
  assert.ok(f.canvases.every(canvas=>canvas.width===1&&canvas.height===1));assert.ok(f.encodedBuffers.every(buffer=>new Uint8Array(buffer).every(byte=>byte===0)));
});

test('renderer releases canvas pixels after encoding and clears PNGs only after admission ACK',{timeout:5000},async()=>{
  const f=rendererFixture();await f.waitForEncode();f.finishNext();await tick();f.finishNext();await tick();
  assert.ok(f.canvases.every(canvas=>canvas.width===1&&canvas.height===1));assert.equal(f.submitted.length,1);assert.equal(f.encoderTimers(),0);
  assert.deepEqual([...new Uint8Array(f.submitted[0].png)],[1,2,3]);assert.deepEqual([...new Uint8Array(f.submitted[0].previewPng)],[1,2,3]);
  f.acknowledgements[0].resolve({status:'ADMITTED'});await tick();
  assert.deepEqual([...new Uint8Array(f.submitted[0].png)],[0,0,0]);assert.deepEqual([...new Uint8Array(f.submitted[0].previewPng)],[0,0,0]);
  assert.deepEqual([...new Uint8Array(f.delivered[0].png)],[1,2,3]);f.unload();
});

test('renderer unload clears its pending IPC buffers without waiting for an acknowledgment',{timeout:5000},async()=>{
  const f=rendererFixture();await f.waitForEncode();f.finishNext();await tick();f.finishNext();await tick();f.unload();
  assert.equal(f.submitted.length,1);assert.equal(f.video.srcObject,null);assert.ok(f.trackStops()>0);
  assert.ok(f.encodedBuffers.every(buffer=>new Uint8Array(buffer).every(byte=>byte===0)));
  f.acknowledgements[0].resolve({status:'ADMITTED'});await tick();
});

test('unchanged masked pixels skip PNG encoding while a one-pixel change is admitted',{timeout:5000},async()=>{
  const f=rendererFixture();await f.waitForEncode();f.finishNext();await tick();f.finishNext();await tick();f.acknowledgements[0].resolve({status:'ADMITTED'});await tick();
  f.captureNow();assert.equal((await f.waitForInspection(2)).skip,true);await tick();assert.equal(f.encodes.length,0);assert.equal(f.delivered.length,1);
  assert.ok(f.pixelBuffers.every(data=>data.every(byte=>byte===0)));
  f.changeOnePixel();f.captureNow();await f.waitForEncode();assert.equal(f.finishNext(),'preview');await tick();assert.equal(f.finishNext(),'image');await tick();
  assert.equal(f.delivered.length,2);assert.equal(f.delivered[1].sampler.pixel_unchanged,1);assert.equal(f.delivered[1].sampler.png_encoded,2);
  f.acknowledgements[1].resolve({status:'ADMITTED'});f.unload();await tick();
});

test('stop during the pixel digest erases owned pixels and never reaches preview or OCR',{timeout:5000},async()=>{
  const digestGate=deferred(),f=rendererFixture({digestGate});await tick();assert.equal(f.digestInputs.length,1);assert.ok(f.digestInputs[0].some(byte=>byte!==0));
  f.unload();assert.ok(f.digestInputs[0].every(byte=>byte===0));digestGate.resolve();assert.equal((await f.waitForInspection(1)).revoked,true);await tick();
  assert.equal(f.encodes.length,0);assert.equal(f.delivered.length,0);assert.ok(f.canvases.every(canvas=>canvas.width===1&&canvas.height===1));
});

test('privacy masks are repainted before both encoders even when photometry changes every pixel',{timeout:5000},async()=>{
  const masks=[{x:0.25,y:0.25,width:0.25,height:0.5}],f=rendererFixture({imageMode:'contrast',masks,preprocess:rgba=>rgba.fill(255)});
  await f.waitForEncode();f.finishNext();await tick();f.finishNext();await tick();
  const rect=maskRects(masks,{x:0,y:0,width:16,height:8},16,8)[0];
  assert.equal(f.encodedPixels.length,2);
  for(const encoded of f.encodedPixels){
    for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++){
      const offset=(y*encoded.width+x)*4;assert.deepEqual([...encoded.pixels.slice(offset,offset+4)],[0,0,0,255]);
    }
    assert.equal(encoded.pixels[0],255);
  }
  assert.ok(f.pixelBuffers.every(data=>data.every(byte=>byte===0)));f.acknowledgements[0].resolve({status:'ADMITTED'});f.unload();await tick();
});

test('a stalled PNG encoder stops capture, erases prior pixels and ignores a late callback',{timeout:5000},async()=>{
  const f=rendererFixture();await f.waitForEncode();assert.equal(f.finishNext(),'preview');await tick();
  assert.equal(f.encodedBuffers.length,1);assert.equal(f.encoderTimers(),1);f.fireEncoderDeadline();
  assert.equal(await f.waitForFailure(),'SCREEN_PNG_ENCODE_TIMEOUT');await tick();
  assert.equal(f.encoderTimers(),0);assert.equal(f.delivered.length,0);assert.ok(f.trackStops()>0);
  assert.ok(f.encodedBuffers.every(buffer=>new Uint8Array(buffer).every(byte=>byte===0)));assert.ok(f.pixelBuffers.every(data=>data.every(byte=>byte===0)));
  assert.ok(f.canvases.every(canvas=>canvas.width===1&&canvas.height===1));
  assert.equal(f.finishNext(),'image');await tick();assert.equal(f.encodedBuffers.length,1);assert.equal(f.delivered.length,0);assert.equal(f.failures.length,1);
});
