import {pixelRect,maskRects,SCREEN_MAX_PIXELS,prepareOcrPixels,createScreenChangeGate} from './screen-policy.js';

// This dedicated sandboxed renderer is destroyed by the main process on every
// stop, lock, suspend, source/project change, timeout or failed heartbeat.
const bridge=globalThis.mpcCapture;
const video=document.getElementById('source');
let stream=null,timer=null,beat=null,inflight=0,encoding=false,stopped=false,config=null;
const canvas=document.createElement('canvas');
const context=canvas.getContext('2d',{alpha:false,willReadFrequently:true});
const preview=document.createElement('canvas');
const previewContext=preview.getContext('2d',{alpha:false});
const blobOf=target=>new Promise((resolve,reject)=>{
  let settled=false;
  const deadline=setTimeout(()=>finish(null,Error('SCREEN_PNG_ENCODE_TIMEOUT')),5000);
  function finish(blob,error){
    if(settled)return;settled=true;clearTimeout(deadline);
    if(error)reject(error);else if(blob)resolve(blob);else reject(Error('SCREEN_PNG_ENCODE_FAILED'));
  }
  try{target.toBlob(blob=>finish(blob),'image/png')}catch(error){finish(null,error)}
});
const ownedBuffers=new Set();
const changeGate=createScreenChangeGate();
let pngEncoded=0,busySkipped=0;
const sampleMetrics=()=>({...changeGate.status(),png_encoded:pngEncoded,busy_skipped:busySkipped});
function retain(buffer){ownedBuffers.add(buffer);return buffer}
function erase(buffer){if(!buffer)return;try{new Uint8Array(buffer).fill(0)}finally{ownedBuffers.delete(buffer)}}
function clearCanvases(){canvas.width=canvas.height=1;preview.width=preview.height=1}
function disposePixels(){clearCanvases();changeGate.reset();for(const buffer of ownedBuffers)erase(buffer)}
async function fail(error){
  if(stopped)return;stopped=true;clearTimeout(timer);clearInterval(beat);
  stream?.getTracks().forEach(track=>track.stop());video.srcObject=null;disposePixels();
  await bridge.failed(error?.code??error?.message??error?.name??'SCREEN_CAPTURE_FAILED').catch(()=>{});
}
async function capture(){
  if(stopped||!config||video.readyState<2)return;
  if(encoding||inflight>=2){busySkipped++;return;}
  inflight++;encoding=true;let ownsEncoding=true,png=null,previewPng=null,pixelBuffer=null;
  const started=performance.now(),capturedAt=new Date().toISOString();
  try{
    const frameWidth=video.videoWidth,frameHeight=video.videoHeight;
    const crop=pixelRect(config.crop,frameWidth,frameHeight);
    if(crop.width*crop.height>SCREEN_MAX_PIXELS)throw Error('SCREEN_AREA_TOO_LARGE_USE_CROP');
    canvas.width=crop.width;canvas.height=crop.height;
    context.drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
    context.fillStyle='#000';
    const masks=maskRects(config.masks,crop,frameWidth,frameHeight);
    for(const rect of masks)context.fillRect(rect.x,rect.y,rect.width,rect.height);
    const pixels=context.getImageData(0,0,crop.width,crop.height);pixelBuffer=retain(pixels.data.buffer);
    const change=await changeGate.inspect(pixels.data,{width:crop.width,height:crop.height,cropX:crop.x,cropY:crop.y});
    if(stopped||change.skip)return;
    if(config.imageMode&&config.imageMode!=='native'){
      prepareOcrPixels(pixels.data,config.imageMode);context.putImageData(pixels,0,0);
      context.fillStyle='#000';for(const rect of masks)context.fillRect(rect.x,rect.y,rect.width,rect.height);
    }
    erase(pixelBuffer);pixelBuffer=null;
    // Both preview and OCR are created only from the cropped, masked canvas.
    if(config.preview){
      const scale=Math.min(1,800/crop.width,450/crop.height);
      preview.width=Math.max(1,Math.round(crop.width*scale));preview.height=Math.max(1,Math.round(crop.height*scale));
      previewContext.drawImage(canvas,0,0,preview.width,preview.height);
      previewPng=retain(await(await blobOf(preview)).arrayBuffer());
      if(stopped)return;
    }
    png=retain(await(await blobOf(canvas)).arrayBuffer());
    pngEncoded++;
    clearCanvases();
    encoding=false;ownsEncoding=false;
    if(stopped)return;
    // The main process acknowledges after it has copied/admitted the PNG.
    // Keep bytes intact until that ACK, independent of IPC serialization timing.
    await bridge.frame({png,previewPng,width:crop.width,height:crop.height,frameWidth,frameHeight,
      cropPixels:crop,capturedAt,captureMs:performance.now()-started,sampler:sampleMetrics()});
  }catch(error){void fail(error)}finally{
    if(ownsEncoding){clearCanvases();encoding=false}
    erase(png);erase(previewPng);erase(pixelBuffer);inflight--;
  }
}
function schedule(){
  if(stopped||config.mode!=='live')return;
  timer=setTimeout(()=>{void capture();schedule()},1000/config.fps);
}
async function start(){
  config=await bridge.configuration();
  // A fixed source ID comes from main-process consent, never source text.
  // Desktop video uses Electron's native getUserMedia desktop transport.
  stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{mandatory:{
    chromeMediaSource:'desktop',chromeMediaSourceId:config.sourceId,
    maxWidth:8192,maxHeight:8192,maxFrameRate:Math.max(1,config.fps)
  }}});
  for(const track of stream.getVideoTracks())track.addEventListener('ended',()=>void fail(Error('SCREEN_SOURCE_ENDED')));
  video.srcObject=stream;
  await video.play();
  if(stopped){stream.getTracks().forEach(track=>track.stop());return}
  // Some drivers resolve play() before exposing the first complete frame.
  const readyDeadline=performance.now()+5000;
  while(!stopped&&(video.readyState<2||!video.videoWidth||!video.videoHeight)){
    if(performance.now()>readyDeadline)throw Error('SCREEN_FIRST_FRAME_TIMEOUT');
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  if(stopped)return;
  beat=setInterval(()=>bridge.heartbeat(sampleMetrics()).catch(error=>void fail(error)),2000);
  bridge.onCaptureNow(()=>void capture());
  void capture();schedule();
}
addEventListener('beforeunload',()=>{stopped=true;stream?.getTracks().forEach(track=>track.stop());video.srcObject=null;clearTimeout(timer);clearInterval(beat);disposePixels()});
start().catch(error=>void fail(error));
