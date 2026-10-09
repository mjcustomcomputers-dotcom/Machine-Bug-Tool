import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {crc32,deflateSync} from 'node:zlib';
import test from 'node:test';
import {createScreenOcr,inspectScreenOcrAssets,inspectScreenPng} from '../lib/mpc-screen-ocr.mjs';
import {createScreenCapturePipeline,normalizeScreenContext} from '../lib/mpc-screen-cache.mjs';

function chunk(type,bytes){
  const tag=Buffer.from(type),result=Buffer.alloc(12+bytes.length);
  result.writeUInt32BE(bytes.length,0);tag.copy(result,4);bytes.copy(result,8);result.writeUInt32BE(crc32(Buffer.concat([tag,bytes])),8+bytes.length);return result;
}
function png(width=8,height=4,seed=0,payload){
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const pixels=payload??Buffer.alloc((width*4+1)*height,255);
  if(!payload)for(let y=0;y<height;y++){pixels[y*(width*4+1)]=0;pixels[y*(width*4+1)+1]=seed}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function assets(t){
  const directory=mkdtempSync(join(tmpdir(),'mpc-ocr-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  function put(path,value='test asset'){const target=join(directory,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,value)}
  put('node_modules/tesseract.js/package.json',JSON.stringify({name:'tesseract.js',version:'6.0.1',main:'src/index.js'}));
  put('node_modules/tesseract.js/src/index.js');put('node_modules/tesseract.js/src/worker-script/node/index.js');
  put('node_modules/tesseract.js-core/package.json',JSON.stringify({name:'tesseract.js-core',version:'6.0.0'}));
  for(const variant of ['tesseract-core','tesseract-core-simd','tesseract-core-lstm','tesseract-core-simd-lstm'])for(const extension of ['.wasm.js','.wasm'])put(`node_modules/tesseract.js-core/${variant}${extension}`);
  put('tessdata/eng.traineddata.gz');put('mpc-screen-ocr-worker.cjs');
  return {directory,put};
}
function rawOcr(text='LOCAL TEXT',width=8,height=4){
  const bbox={x0:0,y0:0,x1:width,y1:height};
  return {data:{text,confidence:96,blocks:[{bbox,paragraphs:[{lines:[{text,bbox,confidence:95,words:[{text,bbox,confidence:94}]}]}]}]}};
}
function cleanOcr(text='LOCAL TEXT',width=8,height=4){return {text,width,height,confidence:96,words:[],lines:[],blocks:[],trust:'UNTRUSTED_SCREEN_OCR',network:'DISABLED'}}
function context(extra={}){return {sessionId:'consent-1',sourceId:'screen-1',projectId:'project-1',language:'eng',crop:null,masks:[],preprocessing:'masked-png-v1',...extra}}
function fakeOcr(recognize=async()=>cleanOcr()){
  return {recognize,cancel:async()=>{},close:async()=>{}};
}

test('screen PNG admission checks actual dimensions, CRC, bytes and geometry',()=>{
  const input=png();assert.deepEqual(inspectScreenPng(input),{width:8,height:4,pixels:32,bytes:input.length});
  for(const value of ['https://example.com/screen.png','C:\\screen.png',{},null])assert.throws(()=>inspectScreenPng(value),/PNG_REQUIRED/u);
  assert.throws(()=>inspectScreenPng(input,{width:7}),/DIMENSION_MISMATCH/u);
  assert.throws(()=>inspectScreenPng(png(8193,1)),/DIMENSION_LIMIT/u);
  assert.throws(()=>inspectScreenPng(input,{maxPixels:31}),/DIMENSION_LIMIT/u);
  assert.throws(()=>inspectScreenPng(Buffer.alloc(200),{maxPngBytes:128}),/BYTE_LIMIT/u);
  const broken=Buffer.from(input);broken[30]^=1;
  assert.throws(()=>inspectScreenPng(broken),/CRC_INVALID/u);
  assert.throws(()=>inspectScreenPng(Buffer.concat([input,Buffer.from('trailing')])),/CHUNKS_INVALID/u);
});

test('OCR local preflight pins versions, all core variants and the local language; no download fallback',t=>{
  const {directory,put}=assets(t);
  const result=inspectScreenOcrAssets(directory);
  assert.equal(result.network,'DISABLED');assert.equal(result.assets_ready,true);assert.equal(result.langPath,join(directory,'tessdata'));
  assert.throws(()=>inspectScreenOcrAssets('https://example.com'),/ASSET_ROOT_INVALID/u);
  assert.throws(()=>inspectScreenOcrAssets(directory,{language:'../../eng'}),/LANGUAGE_UNAVAILABLE/u);
  put('node_modules/tesseract.js/package.json','{"version":"7.0.0"}');
  assert.throws(()=>inspectScreenOcrAssets(directory),/VERSION_MISMATCH/u);
  put('node_modules/tesseract.js/package.json','{"version":"6.0.1"}');
  rmSync(join(directory,'tessdata/eng.traineddata.gz'));
  assert.throws(()=>inspectScreenOcrAssets(directory),/LOCAL_ASSET_MISSING/u);
});

test('OCR preflight rejects dependency assets that escape the materialized bundle',t=>{
  const {directory}=assets(t),external=mkdtempSync(join(tmpdir(),'mpc-ocr-outside-'));
  t.after(()=>rmSync(external,{recursive:true,force:true}));
  writeFileSync(join(external,'package.json'),'{"version":"6.0.0"}');
  const target=join(directory,'node_modules/tesseract.js-core');rmSync(target,{recursive:true});symlinkSync(external,target,'junction');
  assert.throws(()=>inspectScreenOcrAssets(directory),/LOCAL_ASSET_INVALID/u);
});

test('persistent OCR reuses one worker and returns bounded word geometry with fixed offline options',async t=>{
  const {directory}=assets(t);let starts=0,calls=0,ends=0;
  const engine=createScreenOcr({assetRoot:directory,workerFactory:async(language,oem,options)=>{
    starts++;assert.equal(language,'eng');assert.equal(oem,1);assert.equal(options.cacheMethod,'none');assert.equal(options.gzip,true);
    for(const key of ['workerPath','corePath','langPath'])assert.ok(options[key].startsWith(directory));
    return {recognize:async bytes=>{calls++;assert.ok(Buffer.isBuffer(bytes));return rawOcr()},terminate:async()=>{ends++}};
  }});
  t.after(()=>engine.close());
  const first=await engine.recognize(png());const second=await engine.recognize(png(8,4,1));
  assert.equal(starts,1);assert.equal(calls,2);assert.equal(first.text,'LOCAL TEXT');assert.equal(second.trust,'UNTRUSTED_SCREEN_OCR');
  assert.equal(first.source_authentication,false);assert.equal(first.network,'DISABLED');assert.deepEqual(first.words[0].bbox,{x0:0,y0:0,x1:8,y1:4});
  assert.equal(engine.status().state,'READY');await engine.close();assert.equal(ends,1);assert.equal(engine.status().state,'CLOSED');
  await assert.rejects(engine.recognize(png()),/CLOSED/u);
});

test('pixel decompression limits reject PNG payloads inconsistent with their declared size before worker creation',async t=>{
  const {directory}=assets(t);let starts=0;
  const engine=createScreenOcr({assetRoot:directory,workerFactory:()=>{starts++;return {recognize:async()=>rawOcr(),terminate:async()=>{}}}});
  t.after(()=>engine.close());
  await assert.rejects(engine.recognize(png(1,1,0,Buffer.alloc(20_000))),/PIXELS_INVALID/u);
  assert.equal(starts,0);
});

test('OCR cancellation discards late completion and allows a fresh worker for the next capture',async t=>{
  const {directory}=assets(t),started=deferred(),job=deferred();let factoryCalls=0,terminations=0;
  const engine=createScreenOcr({assetRoot:directory,workerFactory:async()=>{
    factoryCalls++;return {recognize:async()=>{if(factoryCalls===1){started.resolve();return job.promise}return rawOcr('NEW')},terminate:async()=>{terminations++}};
  }});
  t.after(()=>engine.close());
  const pending=engine.recognize(png());const rejected=assert.rejects(pending,/CANCELLED/u);
  await started.promise;await assert.rejects(engine.recognize(png()),/BUSY/u);await engine.cancel();await rejected;
  job.resolve(rawOcr('STALE'));await tick();
  const result=await engine.recognize(png());assert.equal(result.text,'NEW');assert.equal(factoryCalls,2);assert.equal(terminations,1);
});

test('OCR recognition deadline terminates a stuck worker and returns an actionable error',async t=>{
  const {directory}=assets(t);let terminated=false;
  const engine=createScreenOcr({assetRoot:directory,timeoutMs:30,workerFactory:async()=>({recognize:()=>new Promise(()=>{}),terminate:async()=>{terminated=true}})});
  t.after(()=>engine.close());
  await assert.rejects(engine.recognize(png()),/TIMEOUT/u);assert.equal(terminated,true);assert.equal(engine.status().last_error_code,'MPC_SCREEN_OCR_TIMEOUT');
});

test('startup deadline terminates the actual coordinator before Tesseract initialization resolves',async t=>{
  const {directory,put}=assets(t);
  put('mpc-screen-ocr-worker.cjs',readFileSync(new URL('../lib/mpc-screen-ocr-worker.cjs',import.meta.url)));
  put('node_modules/tesseract.js/src/index.js','module.exports.createWorker=()=>new Promise(()=>{});');
  const engine=createScreenOcr({assetRoot:directory,timeoutMs:100});t.after(()=>engine.close());
  await assert.rejects(engine.recognize(png()),/TIMEOUT/u);assert.equal(engine.status().state,'IDLE');
});

test('a worker resolving after cancelled initialization is terminated and never receives the frame',async t=>{
  const {directory}=assets(t),factory=deferred(),initializing=deferred();let recognized=0,terminated=0;
  const engine=createScreenOcr({assetRoot:directory,workerFactory:()=>{initializing.resolve();return factory.promise}});t.after(()=>engine.close());
  const pending=engine.recognize(png()),rejected=assert.rejects(pending,/CANCELLED/u);
  await initializing.promise;await engine.cancel();await rejected;
  factory.resolve({recognize:async()=>{recognized++;return rawOcr()},terminate:async()=>{terminated++}});
  await tick();assert.equal(recognized,0);assert.equal(terminated,1);
});

test('OCR rejects invalid geometry in engine output without promoting it to a source box',async t=>{
  const {directory}=assets(t);
  const raw=rawOcr();raw.data.blocks[0].paragraphs[0].lines[0].words.push({text:'outside',confidence:99,bbox:{x0:-1,y0:0,x1:30,y1:30}});
  const engine=createScreenOcr({assetRoot:directory,workerFactory:async()=>({recognize:async()=>raw,terminate:async()=>{}})});
  t.after(()=>engine.close());const result=await engine.recognize(png());assert.equal(result.words.length,1);assert.equal(result.invalid_geometry_count,1);
});

test('the real worker bootstrap blocks network before loading the local OCR module',async t=>{
  const {directory,put}=assets(t);
  put('mpc-screen-ocr-worker.cjs',readFileSync(new URL('../lib/mpc-screen-ocr-worker.cjs',import.meta.url)));
  put('node_modules/tesseract.js/src/index.js',`module.exports.createWorker=async function(){
    let blocked=0;
    try {await fetch('https://example.invalid/')} catch(e) {if(e.code==='MPC_SCREEN_OCR_NETWORK_DISABLED')blocked++}
    try {require('node:https').get('https://example.invalid/')} catch(e) {if(e.code==='MPC_SCREEN_OCR_NETWORK_DISABLED')blocked++}
    try {require('node:net').connect(80,'example.invalid')} catch(e) {if(e.code==='MPC_SCREEN_OCR_NETWORK_DISABLED')blocked++}
    try {require('node:child_process').spawn('curl',[])} catch(e) {if(e.code==='MPC_SCREEN_OCR_NETWORK_DISABLED')blocked++}
    return {recognize:async()=>({data:{text:'BLOCKED '+blocked,confidence:100,blocks:[]}}),terminate:async()=>{}};
  }`);
  const engine=createScreenOcr({assetRoot:directory});t.after(()=>engine.close());
  assert.equal((await engine.recognize(png())).text,'BLOCKED 4');
});

test('trusted context validates normalized masks and owns complete cache identity',()=>{
  assert.equal(normalizeScreenContext(context()).language,'eng');
  assert.throws(()=>normalizeScreenContext(context({sourceId:''})),/SOURCE_ID_INVALID/u);
  assert.throws(()=>normalizeScreenContext(context({crop:{x:0.8,y:0,width:0.3,height:1}})),/REGION_INVALID/u);
  assert.throws(()=>normalizeScreenContext(context({masks:[{x:0,y:0,width:NaN,height:1}]})),/REGION_INVALID/u);
  assert.throws(()=>normalizeScreenContext(context({masks:Array(33).fill({x:0,y:0,width:1,height:1})})),/MASKS_INVALID/u);
});

test('screen queue keeps one in-flight OCR and only the newest pending frame',async t=>{
  const jobs=[],emitted=[];
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr(async bytes=>{const job=deferred();jobs.push({job,png:Buffer.from(bytes)});return job.promise}),onResult:r=>emitted.push(r)});
  t.after(()=>pipeline.close());pipeline.start(context());
  const a=pipeline.submit(png(8,4,1)),b=pipeline.submit(png(8,4,2)),c=pipeline.submit(png(8,4,3));
  assert.equal((await b).status,'SUPERSEDED');assert.equal(jobs.length,1);assert.equal(pipeline.status().in_flight,1);assert.equal(pipeline.status().pending,1);
  jobs[0].job.resolve(cleanOcr('A'));assert.equal((await a).status,'ANALYZED');await tick();assert.equal(jobs.length,2);assert.deepEqual(jobs[1].png,png(8,4,3));
  jobs[1].job.resolve(cleanOcr('C'));assert.equal((await c).status,'ANALYZED');await tick();
  assert.equal(emitted.length,2);assert.equal(pipeline.status().metrics.dropped_superseded,1);assert.equal(pipeline.status().pending_bytes,0);
});

test('cached frames wait behind asynchronous observation delivery without retaining completed PNG pixels',async t=>{
  const delivery=deferred(),started=deferred(),seen=[];let observers=0,maxObservers=0,recognitions=0;
  const imageA=png(8,4,1),imageB=png(8,4,2);
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr(async bytes=>{recognitions++;return cleanOcr(bytes.equals(imageA)?'A':'B')}),onResult:async receipt=>{
    observers++;maxObservers=Math.max(maxObservers,observers);seen.push(receipt.ocr.text);
    if(receipt.ocr.text==='B'){started.resolve();await delivery.promise}
    observers--;
  }});t.after(()=>pipeline.close());pipeline.start(context());
  await pipeline.submit(imageA);await tick();
  const inDelivery=pipeline.submit(imageB);await started.promise;await inDelivery;
  assert.equal(pipeline.status().in_flight,1);assert.equal(pipeline.status().active_bytes,0);
  const cachedNext=pipeline.submit(imageA);await tick();assert.deepEqual(seen,['A','B']);assert.equal(pipeline.status().pending,1);assert.ok(pipeline.status().pending_bytes>0);
  delivery.resolve();assert.equal((await cachedNext).status,'CACHED');await tick();
  assert.deepEqual(seen,['A','B','A']);assert.equal(maxObservers,1);assert.equal(recognitions,2);assert.equal(pipeline.status().in_flight,0);assert.equal(pipeline.status().pending_bytes,0);
});

test('an asynchronous observer can revoke its own completed single frame without deadlocking',async t=>{
  const stopped=deferred();let pipeline;
  pipeline=createScreenCapturePipeline({ocr:fakeOcr(),onResult:async()=>{await pipeline.stop('SINGLE_FRAME_COMPLETE');stopped.resolve()}});
  t.after(()=>pipeline.close());pipeline.start(context());assert.equal((await pipeline.submit(png())).status,'ANALYZED');await stopped.promise;await tick();
  assert.equal(pipeline.status().state,'STOPPED');assert.equal(pipeline.status().in_flight,0);assert.equal(pipeline.status().active_bytes,0);
});

test('stop/revoke suppresses a late OCR completion and clears pending pixels and cached text',async t=>{
  const job=deferred(),emitted=[];
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr(()=>job.promise),onResult:r=>emitted.push(r)});t.after(()=>pipeline.close());
  pipeline.start(context());const a=pipeline.submit(png()),b=pipeline.submit(png(8,4,1));
  await pipeline.stop('LOCK_SCREEN');assert.equal((await a).status,'STALE');assert.equal((await b).status,'STOPPED');assert.equal(pipeline.status().pending_bytes,0);
  job.resolve(cleanOcr('SECRET'));await tick();assert.equal(emitted.length,0);assert.equal(pipeline.status().cache_bytes,0);
  assert.equal((await pipeline.submit(png())).status,'STOPPED');assert.equal(pipeline.status().context,null);
});

test('revocation zeros and releases the pipeline-owned active image without waiting for OCR',async t=>{
  const job=deferred();let activeBytes;
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr(bytes=>{activeBytes=bytes;return job.promise})});t.after(()=>pipeline.close());pipeline.start(context());
  const pending=pipeline.submit(png());assert.ok(activeBytes.some(value=>value!==0));await pipeline.stop('CONSENT_REVOKED');
  assert.equal((await pending).status,'STALE');assert.ok(activeBytes.every(value=>value===0));assert.equal(pipeline.status().active_bytes,0);
  job.resolve(cleanOcr());await tick();
});

test('source geometry is bounded, matches the approved crop, and accompanies every mapped word receipt',async t=>{
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr()});t.after(()=>pipeline.close());pipeline.start(context({crop:{x:0.25,y:0.5,width:0.5,height:0.5}}));
  const mapping={frameWidth:16,frameHeight:8,cropPixels:{x:4,y:4,width:8,height:4}};
  const out=await pipeline.submit(png(),mapping);assert.deepEqual(out.receipt.frame.crop_pixels,mapping.cropPixels);assert.equal(out.receipt.frame.source_width,16);assert.equal(out.receipt.frame.source_height,8);
  await assert.rejects(pipeline.submit(png(),{...mapping,cropPixels:{x:0,y:0,width:8,height:4}}),/SOURCE_GEOMETRY_MISMATCH/u);
  await assert.rejects(pipeline.submit(png(),{...mapping,frameWidth:100_000}),/SOURCE_GEOMETRY_INVALID/u);
});

test('source and project reset cannot promote an old in-flight frame into the new session',async t=>{
  const jobs=[],emitted=[];
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr(()=>{const job=deferred();jobs.push(job);return job.promise}),onResult:r=>emitted.push(r)});t.after(()=>pipeline.close());
  pipeline.start(context());const a=pipeline.submit(png());
  pipeline.start(context({sessionId:'consent-2',sourceId:'window-7',projectId:'project-2'}));const b=pipeline.submit(png());
  assert.equal((await a).status,'STALE');jobs[0].resolve(cleanOcr('OLD'));await tick();assert.equal(jobs.length,2);assert.equal(emitted.length,0);
  jobs[1].resolve(cleanOcr('NEW'));const answer=await b;assert.equal(answer.status,'ANALYZED');assert.equal(answer.receipt.context.sourceId,'window-7');assert.equal(answer.receipt.context.projectId,'project-2');
});

test('exact cached frames retain OCR timing, obey TTL, and do not emit unchanged screen text repeatedly',async t=>{
  let time=10_000,calls=0;const emitted=[];
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr(async()=>{calls++;return cleanOcr(`RESULT ${calls}`)}),onResult:r=>emitted.push(r),now:()=>time,cacheTtlMs:100});t.after(()=>pipeline.close());
  pipeline.start(context());const first=await pipeline.submit(png());time+=25;
  const repeated=await pipeline.submit(png());assert.equal(repeated.status,'UNCHANGED');assert.equal(repeated.receipt.cache_hit,true);assert.equal(repeated.receipt.analyzed_at,first.receipt.analyzed_at);assert.equal(calls,1);assert.equal(emitted.length,1);
  time+=100;await pipeline.submit(png());assert.equal(calls,2);assert.ok(pipeline.status().cache_bytes<=pipeline.status().limits.cacheBytes);
});

test('each source, project, session, crop, privacy mask and preprocessing change invalidates the OCR cache',async t=>{
  let calls=0;const pipeline=createScreenCapturePipeline({ocr:fakeOcr(async()=>{calls++;return cleanOcr()})});t.after(()=>pipeline.close());
  const variants=[{}, {sourceId:'screen-2'}, {projectId:'project-2'}, {sessionId:'consent-2'}, {crop:{x:0,y:0,width:0.5,height:1}}, {masks:[{x:0,y:0,width:0.2,height:0.2}]}, {preprocessing:'different-v2'}];
  for(const variant of variants){pipeline.start(context(variant));const out=await pipeline.submit(png());assert.equal(out.status,'ANALYZED')}
  assert.equal(calls,variants.length);
});

test('queue bounds, dimensions, captured time and pending expiration prevent stale work',async t=>{
  let time=10_000;const job=deferred();let calls=0;
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr(()=>{calls++;return job.promise}),now:()=>time,frameTtlMs:100,maxPendingBytes:128});t.after(()=>pipeline.close());pipeline.start(context());
  await assert.rejects(pipeline.submit(Buffer.alloc(129)),/PENDING_BYTE_LIMIT/u);
  await assert.rejects(pipeline.submit(png(),{width:99}),/DIMENSION_MISMATCH/u);
  await assert.rejects(pipeline.submit(png(),{capturedAt:time+6000}),/CAPTURE_TIME_INVALID/u);
  assert.equal((await pipeline.submit(png(),{capturedAt:time-200})).status,'EXPIRED');
  const a=pipeline.submit(png()),b=pipeline.submit(png(8,4,1));time+=101;job.resolve(cleanOcr());await a;assert.equal((await b).status,'EXPIRED');assert.equal(calls,1);
});

test('pending image TTL erases queued pixels independently of a stuck OCR with one unreferenced timer',async t=>{
  let time=10_000,sequence=0,calls=0;const timers=new Map(),job=deferred();
  const setTimer=(callback,delay)=>{const timer={id:++sequence,due:time+delay,callback,unreferenced:false,unref(){this.unreferenced=true}};timers.set(timer.id,timer);return timer};
  const clearTimer=timer=>timers.delete(timer.id);
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr(()=>{calls++;return job.promise}),now:()=>time,frameTtlMs:100,setTimer,clearTimer});
  t.after(()=>pipeline.close());pipeline.start(context());const active=pipeline.submit(png()),first=pipeline.submit(png(8,4,1));
  assert.equal(timers.size,1);const replacedTimer=[...timers.values()][0];assert.equal(replacedTimer.unreferenced,true);
  const newest=pipeline.submit(png(8,4,2));assert.equal((await first).status,'SUPERSEDED');assert.equal(timers.size,1);
  replacedTimer.callback();assert.equal(pipeline.status().pending,1);assert.ok(pipeline.status().pending_bytes>0);
  const expiry=[...timers.values()][0];time=expiry.due;timers.delete(expiry.id);expiry.callback();
  assert.equal((await newest).status,'EXPIRED');assert.equal(calls,1);assert.equal(pipeline.status().in_flight,1);
  assert.equal(pipeline.status().pending,0);assert.equal(pipeline.status().pending_bytes,0);assert.equal(timers.size,0);
  job.resolve(cleanOcr());assert.equal((await active).status,'ANALYZED');await tick();assert.equal(calls,1);
});

test('a revoked pending expiry callback cannot erase a new generation or retain a shutdown timer',async t=>{
  let time=10_000,sequence=0;const timers=new Map(),job=deferred();
  const setTimer=(callback,delay)=>{const timer={id:++sequence,callback,delay,unref(){}};timers.set(timer.id,timer);return timer};
  const clearTimer=timer=>timers.delete(timer.id);
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr(()=>job.promise),now:()=>time,frameTtlMs:100,setTimer,clearTimer});
  t.after(()=>pipeline.close());pipeline.start(context());const active=pipeline.submit(png()),old=pipeline.submit(png(8,4,1));
  const revoked=[...timers.values()][0];await pipeline.stop('CONSENT_REVOKED');assert.equal((await old).status,'STOPPED');assert.equal(timers.size,0);
  pipeline.start(context({sessionId:'consent-2'}));const fresh=pipeline.submit(png(8,4,2));assert.equal(timers.size,1);
  revoked.callback();assert.equal(pipeline.status().pending,1);assert.equal(pipeline.status().metrics.expired,0);assert.equal(timers.size,1);
  await pipeline.stop();assert.equal((await fresh).status,'STOPPED');assert.equal(timers.size,0);job.resolve(cleanOcr());await active;await tick();
});

test('one failed OCR job reports the error and advances to the newest queued image',async t=>{
  const job=deferred();let calls=0;const errors=[];
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr(async()=>{calls++;if(calls===1)return job.promise;return cleanOcr('RECOVERED')}),onError:e=>errors.push(e)});t.after(()=>pipeline.close());pipeline.start(context());
  const a=pipeline.submit(png()),b=pipeline.submit(png(8,4,1));job.reject(new Error('PRIVATE_PATH_SHOULD_NOT_LEAK'));
  assert.equal((await a).error,'MPC_SCREEN_OCR_FAILED');assert.equal((await b).receipt.ocr.text,'RECOVERED');assert.equal(errors.length,1);assert.equal(JSON.stringify(errors).includes('PRIVATE_PATH'),false);
});

test('caller mutation cannot alter an admitted frame or cached OCR result',async t=>{
  const first=deferred(),seen=[];
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr(async bytes=>{seen.push(Buffer.from(bytes));if(seen.length===1)return first.promise;return cleanOcr()})});t.after(()=>pipeline.close());pipeline.start(context());
  const a=pipeline.submit(png()),input=png(8,4,3),expected=Buffer.from(input),b=pipeline.submit(input);input.fill(0);first.resolve(cleanOcr());await a;const result=await b;
  assert.deepEqual(seen[1],expected);assert.ok(Object.isFrozen(result.receipt.ocr));assert.ok(Object.isFrozen(result.receipt.context));
});

test('OCR cache retains only byte- and entry-bounded text receipts and has no screenshot persistence',async t=>{
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr(async()=>cleanOcr('CACHE')),cacheBytes:1024,maxCacheEntries:2});t.after(()=>pipeline.close());pipeline.start(context());
  for(let seed=0;seed<8;seed++){
    const out=await pipeline.submit(png(8,4,seed));assert.equal(out.status,'ANALYZED');
    assert.equal(JSON.stringify(out.receipt).includes('data:image'),false);assert.equal('png' in out.receipt,false);
    assert.ok(pipeline.status().cache_bytes<=1024);assert.ok(pipeline.status().cache_entries<=2);
  }
  await pipeline.stop();assert.equal(pipeline.status().cache_entries,0);assert.equal(pipeline.status().cache_bytes,0);
});

test('a failing observer does not lose an OCR result or corrupt queue progress',async t=>{
  const errors=[];
  const pipeline=createScreenCapturePipeline({ocr:fakeOcr(),onResult:()=>{throw new Error('view closed')},onError:value=>errors.push(value)});t.after(()=>pipeline.close());pipeline.start(context());
  assert.equal((await pipeline.submit(png())).status,'ANALYZED');assert.equal((await pipeline.submit(png(8,4,1))).status,'ANALYZED');
  assert.equal(errors.length,2);assert.ok(errors.every(error=>error.code==='MPC_SCREEN_CALLBACK_FAILED'));assert.equal(pipeline.status().metrics.errors,0);
});
