import {createHash} from 'node:crypto';
import {inspectScreenPng,SCREEN_OCR_LIMITS} from './mpc-screen-ocr.mjs';

const DEFAULTS=Object.freeze({maxPendingBytes:16*1024*1024,cacheBytes:2*1024*1024,cacheTtlMs:15_000,frameTtlMs:5_000,maxCacheEntries:32});
function fail(code){return Object.assign(new Error(code),{code})}
function integer(value,fallback,min,max,name){
  const selected=value??fallback;
  if(!Number.isSafeInteger(selected)||selected<min||selected>max)throw fail(`MPC_SCREEN_${name}_INVALID`);
  return selected;
}
function id(value,name){
  if(typeof value!=='string'||!value.trim()||value.length>512||/[\u0000-\u001f\u007f]/u.test(value))throw fail(`MPC_SCREEN_${name}_INVALID`);
  return value;
}
function normalizedRectangle(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw fail('MPC_SCREEN_REGION_INVALID');
  const {x,y,width,height}=value;
  if(![x,y,width,height].every(number=>typeof number==='number'&&Number.isFinite(number))||x<0||y<0||width<=0||height<=0||x+width>1+Number.EPSILON||y+height>1+Number.EPSILON)throw fail('MPC_SCREEN_REGION_INVALID');
  return Object.freeze({x,y,width,height});
}
/** Identity and geometry are supplied by the trusted capture session owner. */
export function normalizeScreenContext(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw fail('MPC_SCREEN_CONTEXT_INVALID');
  const language=value.language??'eng';
  if(language!=='eng')throw fail('MPC_SCREEN_OCR_LANGUAGE_UNAVAILABLE');
  const masks=value.masks??[];
  if(!Array.isArray(masks)||masks.length>32)throw fail('MPC_SCREEN_MASKS_INVALID');
  return Object.freeze({
    sessionId:id(value.sessionId,'SESSION_ID'),sourceId:id(value.sourceId,'SOURCE_ID'),projectId:id(value.projectId,'PROJECT_ID'),
    language,crop:value.crop==null?null:normalizedRectangle(value.crop),masks:Object.freeze(masks.map(normalizedRectangle)),
    preprocessing:id(value.preprocessing??'canvas-masked-png-v1','PREPROCESSING'),
  });
}
function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child)}
  return value;
}
function safeOcrResult(value,width,height){
  if(!value||typeof value!=='object'||typeof value.text!=='string'||value.text.length>SCREEN_OCR_LIMITS.maxTextChars||value.width!==width||value.height!==height)throw fail('MPC_SCREEN_OCR_RESULT_INVALID');
  if(value.trust!=='UNTRUSTED_SCREEN_OCR'||value.network!=='DISABLED')throw fail('MPC_SCREEN_OCR_RESULT_INVALID');
  const text=JSON.stringify(value);
  if(Buffer.byteLength(text,'utf8')>16*1024*1024)throw fail('MPC_SCREEN_OCR_RESULT_LIMIT');
  return freeze(JSON.parse(text));
}
function digest(value){return createHash('sha256').update(value).digest('hex')}
function safeReason(value){return typeof value==='string'&&/^[A-Z0-9_:-]{1,120}$/u.test(value)?value:'STOPPED'}
function timestamp(value,now){
  const result=value===undefined?now:typeof value==='number'?value:typeof value==='string'?Date.parse(value):NaN;
  if(!Number.isFinite(result)||result<0||result>now+5000)throw fail('MPC_SCREEN_CAPTURE_TIME_INVALID');
  return result;
}
function sourceGeometry(metadata,context,width,height){
  if(metadata.frameWidth===undefined&&metadata.frameHeight===undefined&&metadata.cropPixels===undefined)return null;
  const {frameWidth,frameHeight,cropPixels}=metadata;
  if(![frameWidth,frameHeight].every(value=>Number.isSafeInteger(value)&&value>0&&value<=16_384)||!cropPixels||typeof cropPixels!=='object')throw fail('MPC_SCREEN_SOURCE_GEOMETRY_INVALID');
  const rect=context.crop??{x:0,y:0,width:1,height:1};
  const x=Math.floor(rect.x*frameWidth),y=Math.floor(rect.y*frameHeight);
  const cropWidth=Math.min(frameWidth,Math.ceil((rect.x+rect.width)*frameWidth))-x;
  const cropHeight=Math.min(frameHeight,Math.ceil((rect.y+rect.height)*frameHeight))-y;
  if(cropWidth!==width||cropHeight!==height||cropPixels.x!==x||cropPixels.y!==y||cropPixels.width!==cropWidth||cropPixels.height!==cropHeight)throw fail('MPC_SCREEN_SOURCE_GEOMETRY_MISMATCH');
  return freeze({source_width:frameWidth,source_height:frameHeight,crop_pixels:{x,y,width:cropWidth,height:cropHeight}});
}

/**
 * Latest-frame scheduling: at most one OCR operation and one pending PNG.
 * Cache entries hold bounded OCR results only, never screenshots. stop()/start()
 * invalidate generations; completion of revoked work cannot emit an observation.
 */
export function createScreenCapturePipeline({ocr,onResult,onError,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,...options}={}){
  if(!ocr||typeof ocr.recognize!=='function'||typeof ocr.cancel!=='function'||typeof ocr.close!=='function')throw fail('MPC_SCREEN_OCR_ADAPTER_INVALID');
  if(onResult!==undefined&&typeof onResult!=='function'||onError!==undefined&&typeof onError!=='function'||typeof now!=='function'||typeof setTimer!=='function'||typeof clearTimer!=='function')throw fail('MPC_SCREEN_CALLBACK_INVALID');
  const maxPendingBytes=integer(options.maxPendingBytes,DEFAULTS.maxPendingBytes,128,64*1024*1024,'PENDING_BYTE_LIMIT');
  const cacheBytes=integer(options.cacheBytes,DEFAULTS.cacheBytes,0,16*1024*1024,'CACHE_BYTE_LIMIT');
  const cacheTtlMs=integer(options.cacheTtlMs,DEFAULTS.cacheTtlMs,0,300_000,'CACHE_TTL');
  const frameTtlMs=integer(options.frameTtlMs,DEFAULTS.frameTtlMs,10,60_000,'FRAME_TTL');
  const maxCacheEntries=integer(options.maxCacheEntries,DEFAULTS.maxCacheEntries,0,128,'CACHE_ENTRY_LIMIT');
  let active=null,pending=null,pendingExpiry=null,enabled=false,closed=false,generation=0,context=null,stopReason='NOT_STARTED',cacheSize=0,lastPublishedKey=null;
  const cache=new Map();
  const metrics={submitted:0,analyzed:0,cache_hits:0,unchanged:0,dropped_superseded:0,expired:0,stale:0,errors:0};
  function clock(){const value=now();if(!Number.isFinite(value)||value<0)throw fail('MPC_SCREEN_CLOCK_INVALID');return value}
  function notifyError(code){try{onError?.(Object.freeze({code,generation}))}catch{}}
  function settle(frame,value){if(!frame.settled){frame.settled=true;frame.resolve(Object.freeze(value))}}
  function erase(frame){if(frame?.png){frame.png.fill(0);frame.png=Buffer.alloc(0)}}
  function discard(frame,status){if(!frame)return;settle(frame,{status,generation:frame.generation});erase(frame)}
  function clearPendingExpiry(){
    const expiry=pendingExpiry;pendingExpiry=null;
    if(expiry?.timer!==null&&expiry?.timer!==undefined)clearTimer(expiry.timer);
  }
  function expirePending(frame){
    clearPendingExpiry();
    const expiry={frame,timer:null};pendingExpiry=expiry;
    // The timer caps retention even if the wall clock moves backward. A frame
    // already old at admission receives only its remaining usefulness period.
    const remaining=Math.max(1,Math.ceil(Math.min(frameTtlMs,frame.capturedAt+frameTtlMs-clock()+1)));
    expiry.timer=setTimer(()=>{
      if(pendingExpiry!==expiry||pending!==frame||frame.generation!==generation)return;
      pendingExpiry=null;pending=null;metrics.expired++;discard(frame,'EXPIRED');
    },remaining);
    expiry.timer?.unref?.();
  }
  function purgeExpired(at){
    for(const [key,entry] of cache){if(at-entry.createdAt>cacheTtlMs){cache.delete(key);cacheSize-=entry.bytes}}
  }
  function clearCache(){cache.clear();cacheSize=0;lastPublishedKey=null}
  function storeCache(key,result,analyzedAt){
    if(cacheBytes===0||cacheTtlMs===0||maxCacheEntries===0)return;
    const bytes=Buffer.byteLength(JSON.stringify(result),'utf8')+key.length*2+96;
    if(bytes>cacheBytes)return;
    const existing=cache.get(key);if(existing){cacheSize-=existing.bytes;cache.delete(key)}
    while(cache.size>=maxCacheEntries||cacheSize+bytes>cacheBytes){
      const oldest=cache.keys().next().value;if(oldest===undefined)break;
      cacheSize-=cache.get(oldest).bytes;cache.delete(oldest);
    }
    cache.set(key,{result,createdAt:analyzedAt,bytes});cacheSize+=bytes;
  }
  function receipt(frame,result,analyzedAt,cached){
    const completedAt=clock();
    return freeze({
      kind:'MPC_SCREEN_OCR_OBSERVATION',work_stage:'ANALYZED',trust:'UNTRUSTED_SCREEN_OCR',source_authentication:false,
      generation:frame.generation,context:frame.context,
      frame:{sha256:frame.hash,width:frame.width,height:frame.height,bytes:frame.bufferBytes,captured_at:new Date(frame.capturedAt).toISOString(),...(frame.sourceGeometry??{})},
      analyzed_at:new Date(analyzedAt).toISOString(),delivered_at:new Date(completedAt).toISOString(),
      capture_to_delivery_ms:Math.max(0,completedAt-frame.capturedAt),ocr_duration_ms:cached?0:Math.max(0,analyzedAt-frame.startedAt),cache_hit:cached,
      ocr:result,
    });
  }
  async function publish(frame,result,analyzedAt,cached){
    if(closed||!enabled||frame.generation!==generation){metrics.stale++;settle(frame,{status:'STALE',generation:frame.generation});return}
    const observation=receipt(frame,result,analyzedAt,cached);
    const unchanged=frame.key===lastPublishedKey;
    if(unchanged){metrics.unchanged++;settle(frame,{status:'UNCHANGED',generation,receipt:observation});return}
    lastPublishedKey=frame.key;
    const status=cached?'CACHED':'ANALYZED';
    settle(frame,{status,generation,receipt:observation});
    // Delivery may include asynchronous local classification. Serialize it with
    // this observation so a cached next frame cannot bypass an active observer.
    try{await onResult?.(observation)}catch{
      if(enabled&&!closed&&frame.generation===generation)notifyError('MPC_SCREEN_CALLBACK_FAILED');
    }
  }
  function run(frame){
    active=frame;frame.startedAt=clock();
    void (async()=>{
      try{
        if(frame.startedAt-frame.capturedAt>frameTtlMs){metrics.expired++;settle(frame,{status:'EXPIRED',generation:frame.generation});return}
        purgeExpired(frame.startedAt);
        const hit=cache.get(frame.key);
        if(hit){
          cache.delete(frame.key);cache.set(frame.key,hit);metrics.cache_hits++;
          erase(frame);await publish(frame,hit.result,hit.createdAt,true);return;
        }
        const raw=await ocr.recognize(frame.png,{language:frame.context.language,width:frame.width,height:frame.height});
        if(closed||!enabled||frame.generation!==generation){metrics.stale++;settle(frame,{status:'STALE',generation:frame.generation});return}
        const result=safeOcrResult(raw,frame.width,frame.height),analyzedAt=clock();
        metrics.analyzed++;storeCache(frame.key,result,analyzedAt);
        // OCR is complete; the downstream observer needs only the text receipt.
        erase(frame);await publish(frame,result,analyzedAt,false);
      }catch(error){
        if(closed||!enabled||frame.generation!==generation){metrics.stale++;settle(frame,{status:'STALE',generation:frame.generation})}
        else{
          metrics.errors++;
          const code=/^MPC_SCREEN_[A-Z_]+$/u.test(error?.code??'')?error.code:'MPC_SCREEN_OCR_FAILED';
          settle(frame,{status:'ERROR',generation:frame.generation,error:code});notifyError(code);
        }
      }finally{
        erase(frame);if(active===frame)active=null;
        const next=pending;pending=null;clearPendingExpiry();
        if(next){if(enabled&&!closed&&next.generation===generation)run(next);else discard(next,'STALE')}
      }
    })();
  }
  function revoke(reason){
    generation++;enabled=false;context=null;stopReason=safeReason(reason);clearCache();
    clearPendingExpiry();discard(pending,'STOPPED');pending=null;
    // createScreenOcr synchronously copies its input before yielding. Revoke our
    // own active copy now; the adapter cancels and erases its separate copy.
    // Browser, GPU, allocator and OS copies are outside this buffer guarantee.
    if(active){settle(active,{status:'STALE',generation:active.generation});erase(active)}
    return Promise.resolve(ocr.cancel()).catch(()=>notifyError('MPC_SCREEN_OCR_CANCEL_FAILED'));
  }
  return Object.freeze({
    start(value){
      if(closed)throw fail('MPC_SCREEN_PIPELINE_CLOSED');
      const nextContext=normalizeScreenContext(value);
      void revoke('RECONFIGURED');
      enabled=true;context=nextContext;stopReason=null;
      return Object.freeze({status:'ACTIVE',generation,context});
    },
    submit(input,metadata={}){
      if(closed||!enabled)return Promise.resolve(Object.freeze({status:'STOPPED',generation,reason:stopReason??'CLOSED'}));
      let png,dimensions,capturedAt,mapping;
      try{
        if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))throw fail('MPC_SCREEN_METADATA_INVALID');
        if(!Buffer.isBuffer(input)&&!(input instanceof Uint8Array))throw fail('MPC_SCREEN_OCR_PNG_REQUIRED');
        if(input.byteLength>maxPendingBytes)throw fail('MPC_SCREEN_PENDING_BYTE_LIMIT');
        dimensions=inspectScreenPng(input,{maxPngBytes:maxPendingBytes,width:metadata.width,height:metadata.height});
        mapping=sourceGeometry(metadata,context,dimensions.width,dimensions.height);
        const at=clock();capturedAt=timestamp(metadata.capturedAt,at);
        if(at-capturedAt>frameTtlMs){metrics.expired++;return Promise.resolve(Object.freeze({status:'EXPIRED',generation}))}
        png=Buffer.from(input);
      }catch(error){return Promise.reject(error)}
      metrics.submitted++;
      const hash=digest(png),frameContext=context,token=generation;
      const key=digest(JSON.stringify({context:frameContext,width:dimensions.width,height:dimensions.height,sourceGeometry:mapping,sha256:hash}));
      return new Promise(resolve=>{
        const frame={png,bufferBytes:png.length,hash,key,context:frameContext,generation:token,width:dimensions.width,height:dimensions.height,sourceGeometry:mapping,capturedAt,startedAt:null,settled:false,resolve};
        if(active){if(pending){metrics.dropped_superseded++;discard(pending,'SUPERSEDED')}pending=frame;expirePending(frame)}
        else run(frame);
      });
    },
    stop(reason='USER_STOPPED'){return revoke(reason)},
    status(){
      purgeExpired(clock());
      return Object.freeze({state:closed?'CLOSED':enabled?'ACTIVE':'STOPPED',generation,context,reason:stopReason,in_flight:active?1:0,pending:pending?1:0,active_bytes:active?.png.length??0,pending_bytes:pending?.png.length??0,cache_entries:cache.size,cache_bytes:cacheSize,limits:Object.freeze({maxPendingBytes,cacheBytes,cacheTtlMs,frameTtlMs,maxCacheEntries}),metrics:Object.freeze({...metrics})});
    },
    async close(){closed=true;await revoke('CLOSED');await ocr.close()},
  });
}
