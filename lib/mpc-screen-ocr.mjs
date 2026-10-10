import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {isAbsolute,join,relative,sep} from 'node:path';
import {Worker} from 'node:worker_threads';
import {crc32,inflate} from 'node:zlib';
import {promisify} from 'node:util';

export const SCREEN_OCR_ENGINE='tesseract.js@6.0.1';
export const SCREEN_OCR_LIMITS=Object.freeze({maxPngBytes:16*1024*1024,maxPixels:16_777_216,maxDimension:8192,maxTextChars:200_000,maxWords:12_000,maxLines:4_000,maxBlocks:1_000,timeoutMs:20_000});
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const inflateAsync=promisify(inflate);
const CHANNELS=Object.freeze({0:1,2:3,4:2,6:4});
const CORE_VARIANTS=['tesseract-core','tesseract-core-simd','tesseract-core-lstm','tesseract-core-simd-lstm'];

function fail(code){return Object.assign(new Error(code),{code})}
function boundedInteger(value,fallback,min,max,name){
  const selected=value??fallback;
  if(!Number.isSafeInteger(selected)||selected<min||selected>max)throw fail(`MPC_SCREEN_OCR_${name}_INVALID`);
  return selected;
}
function limitsFrom(options={}){
  return Object.freeze({
    maxPngBytes:boundedInteger(options.maxPngBytes,SCREEN_OCR_LIMITS.maxPngBytes,128,64*1024*1024,'BYTE_LIMIT'),
    maxPixels:boundedInteger(options.maxPixels,SCREEN_OCR_LIMITS.maxPixels,1,33_554_432,'PIXEL_LIMIT'),
    maxDimension:boundedInteger(options.maxDimension,SCREEN_OCR_LIMITS.maxDimension,1,16_384,'DIMENSION_LIMIT'),
    maxTextChars:SCREEN_OCR_LIMITS.maxTextChars,maxWords:SCREEN_OCR_LIMITS.maxWords,maxLines:SCREEN_OCR_LIMITS.maxLines,maxBlocks:SCREEN_OCR_LIMITS.maxBlocks,
  });
}
function pngBytes(input){
  if(!Buffer.isBuffer(input)&&!(input instanceof Uint8Array))throw fail('MPC_SCREEN_OCR_PNG_REQUIRED');
  return Buffer.isBuffer(input)?input:Buffer.from(input.buffer,input.byteOffset,input.byteLength);
}
function parsePng(input,options={}){
  const buffer=pngBytes(input);
  const limits=limitsFrom(options);
  if(buffer.length<57||buffer.length>limits.maxPngBytes)throw fail('MPC_SCREEN_OCR_PNG_BYTE_LIMIT');
  if(!buffer.subarray(0,8).equals(PNG_SIGNATURE)||buffer.readUInt32BE(8)!==13||buffer.toString('ascii',12,16)!=='IHDR')throw fail('MPC_SCREEN_OCR_PNG_HEADER_INVALID');
  const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20),depth=buffer[24],colorType=buffer[25];
  if(width<1||height<1||width>limits.maxDimension||height>limits.maxDimension||width*height>limits.maxPixels)throw fail('MPC_SCREEN_OCR_PNG_DIMENSION_LIMIT');
  if(depth!==8||!Object.hasOwn(CHANNELS,colorType)||buffer[26]!==0||buffer[27]!==0||buffer[28]!==0)throw fail('MPC_SCREEN_OCR_PNG_FORMAT_UNSUPPORTED');
  if(options.width!==undefined&&options.width!==width||options.height!==undefined&&options.height!==height)throw fail('MPC_SCREEN_OCR_PNG_DIMENSION_MISMATCH');
  let cursor=8,ended=false,seenIdat=false,closedIdat=false,chunkCount=0;
  const idat=[];
  while(cursor<buffer.length){
    if(++chunkCount>4096||cursor+12>buffer.length)throw fail('MPC_SCREEN_OCR_PNG_CHUNKS_INVALID');
    const length=buffer.readUInt32BE(cursor),type=buffer.toString('ascii',cursor+4,cursor+8),next=cursor+12+length;
    if(next>buffer.length||!/^[A-Za-z]{4}$/u.test(type))throw fail('MPC_SCREEN_OCR_PNG_CHUNKS_INVALID');
    if(crc32(buffer.subarray(cursor+4,cursor+8+length))!==buffer.readUInt32BE(cursor+8+length))throw fail('MPC_SCREEN_OCR_PNG_CRC_INVALID');
    if(type==='acTL'||type==='fcTL'||type==='fdAT'||type==='IHDR'&&cursor!==8)throw fail('MPC_SCREEN_OCR_PNG_FORMAT_UNSUPPORTED');
    if(type==='IDAT'){
      if(closedIdat||length===0)throw fail('MPC_SCREEN_OCR_PNG_CHUNKS_INVALID');
      seenIdat=true;idat.push(buffer.subarray(cursor+8,cursor+8+length));
    }else if(seenIdat)closedIdat=true;
    if(type==='IEND'){
      if(length!==0||!seenIdat||next!==buffer.length)throw fail('MPC_SCREEN_OCR_PNG_CHUNKS_INVALID');
      ended=true;break;
    }
    if(/^[A-Z]/u.test(type)&&!['IHDR','IDAT','PLTE','IEND'].includes(type))throw fail('MPC_SCREEN_OCR_PNG_FORMAT_UNSUPPORTED');
    cursor=next;
  }
  if(!ended)throw fail('MPC_SCREEN_OCR_PNG_CHUNKS_INVALID');
  return {width,height,pixels:width*height,bytes:buffer.length,channels:CHANNELS[colorType],idat,limits};
}

/** Inspect a PNG without decoding it. Full bounded pixel decoding occurs before OCR. */
export function inspectScreenPng(input,options={}){
  const {width,height,pixels,bytes}=parsePng(input,options);
  return Object.freeze({width,height,pixels,bytes});
}
async function validatePixelPayload(parsed){
  const rowBytes=parsed.width*parsed.channels+1,expected=rowBytes*parsed.height;
  let pixels;
  try{
    pixels=await inflateAsync(Buffer.concat(parsed.idat),{maxOutputLength:expected+1});
    if(pixels.length!==expected)throw fail('MPC_SCREEN_OCR_PNG_PIXELS_INVALID');
    for(let offset=0;offset<pixels.length;offset+=rowBytes){if(pixels[offset]>4)throw fail('MPC_SCREEN_OCR_PNG_PIXELS_INVALID')}
  }catch(error){
    if(error?.code==='MPC_SCREEN_OCR_PNG_PIXELS_INVALID')throw error;
    throw fail('MPC_SCREEN_OCR_PNG_PIXELS_INVALID');
  }finally{pixels?.fill(0)}
}

function localFile(root,path,maxBytes=64*1024*1024){
  let resolved,stat;
  try{resolved=realpathSync(path);stat=lstatSync(resolved)}catch{throw fail('MPC_SCREEN_OCR_LOCAL_ASSET_MISSING')}
  const rel=relative(root,resolved);
  if(rel==='..'||rel.startsWith(`..${sep}`)||isAbsolute(rel)||!stat.isFile()||stat.size<1||stat.size>maxBytes)throw fail('MPC_SCREEN_OCR_LOCAL_ASSET_INVALID');
  return resolved;
}

/** No download, URL, environment fallback, or language discovery runs here. */
export function inspectScreenOcrAssets(assetRoot,{language='eng'}={}){
  if(typeof assetRoot!=='string'||!isAbsolute(assetRoot)||assetRoot.includes('\0')||assetRoot.length>4096)throw fail('MPC_SCREEN_OCR_ASSET_ROOT_INVALID');
  if(language!=='eng')throw fail('MPC_SCREEN_OCR_LANGUAGE_UNAVAILABLE');
  let root;
  try{root=realpathSync(assetRoot);if(!lstatSync(root).isDirectory())throw new Error()}catch{throw fail('MPC_SCREEN_OCR_LOCAL_ASSET_MISSING')}
  const tess=join(root,'node_modules','tesseract.js'),core=join(root,'node_modules','tesseract.js-core');
  for(const [directory,version] of [[tess,'6.0.1'],[core,'6.0.0']]){
    const manifest=localFile(root,join(directory,'package.json'),64*1024);
    let value;try{value=JSON.parse(readFileSync(manifest,'utf8'))}catch{throw fail('MPC_SCREEN_OCR_ASSET_MANIFEST_INVALID')}
    if(value.version!==version)throw fail('MPC_SCREEN_OCR_ASSET_VERSION_MISMATCH');
  }
  localFile(root,join(tess,'src','index.js'));
  localFile(root,join(tess,'src','worker-script','node','index.js'));
  for(const variant of CORE_VARIANTS){for(const extension of ['.wasm.js','.wasm'])localFile(root,join(core,variant+extension))}
  const workerPath=localFile(root,join(root,'mpc-screen-ocr-worker.cjs'));
  localFile(root,join(root,'tessdata',`${language}.traineddata.gz`));
  return Object.freeze({root,workerPath,corePath:core,langPath:join(root,'tessdata'),language,engine:SCREEN_OCR_ENGINE,network:'DISABLED',assets_ready:true});
}

function createLocalWorker(assets,options){
  let nextId=1,ended=false;
  const requests=new Map();
  let readyResolve,readyReject;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
  // Attach rejection immediately so cancellation during startup is handled.
  ready.catch(()=>{});
  const processWorker=new Worker(assets.workerPath,{execArgv:[],workerData:{mpcScreenOcrCoordinator:true,assetRoot:assets.root,language:assets.language,options}});
  function end(code){
    if(ended)return;
    ended=true;const error=fail(code);
    readyReject(error);
    for(const request of requests.values())request.reject(error);
    requests.clear();
  }
  processWorker.on('message',message=>{
    if(ended||!message||typeof message!=='object')return;
    if(message.type==='ready'){readyResolve();return}
    if(message.type==='fatal'){end(typeof message.code==='string'&&/^MPC_SCREEN_OCR_[A-Z_]+$/u.test(message.code)?message.code:'MPC_SCREEN_OCR_WORKER_FAILED');void processWorker.terminate();return}
    const request=requests.get(message.id);
    if(!request)return;
    requests.delete(message.id);
    if(message.type==='result')request.resolve({data:message.data});
    else request.reject(fail(typeof message.code==='string'&&/^MPC_SCREEN_OCR_[A-Z_]+$/u.test(message.code)?message.code:'MPC_SCREEN_OCR_WORKER_FAILED'));
  });
  processWorker.on('error',()=>end('MPC_SCREEN_OCR_WORKER_FAILED'));
  processWorker.on('exit',()=>end('MPC_SCREEN_OCR_WORKER_EXITED'));
  return {
    ready,
    async recognize(png){
      await ready;
      if(ended)throw fail('MPC_SCREEN_OCR_WORKER_EXITED');
      const id=nextId++;
      return new Promise((resolve,reject)=>{requests.set(id,{resolve,reject});processWorker.postMessage({type:'recognize',id,png})});
    },
    async terminate(){end('MPC_SCREEN_OCR_CANCELLED');await processWorker.terminate()},
  };
}

function cleanText(value,limit){return typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu,' ').slice(0,limit):''}
function confidence(value){return typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(100,value)):null}
function box(value,width,height){
  if(!value||typeof value!=='object')return null;
  const {x0,y0,x1,y1}=value;
  if(![x0,y0,x1,y1].every(Number.isFinite)||x0<0||y0<0||x1<x0||y1<y0||x1>width||y1>height)return null;
  return Object.freeze({x0,y0,x1,y1});
}
function normalizeResult(raw,width,height,language){
  const data=raw?.data??raw??{};
  const text=cleanText(data.text,SCREEN_OCR_LIMITS.maxTextChars);
  const words=[],lines=[],blocks=[];
  let truncated=typeof data.text==='string'&&data.text.length>text.length,invalidGeometry=0;
  function addLine(line,blockId){
    if(lines.length>=SCREEN_OCR_LIMITS.maxLines){truncated=true;return}
    const bbox=box(line?.bbox,width,height),id=`line-${lines.length+1}`,wordIds=[];
    if(line?.bbox&&!bbox)invalidGeometry++;
    if(Array.isArray(line?.words))for(const word of line.words){
      if(words.length>=SCREEN_OCR_LIMITS.maxWords){truncated=true;break}
      const wordBox=box(word?.bbox,width,height);
      if(!wordBox){invalidGeometry++;continue}
      const wordId=`word-${words.length+1}`;
      words.push(Object.freeze({id:wordId,text:cleanText(word.text,2048),confidence:confidence(word.confidence),bbox:wordBox,lineId:id,blockId}));
      wordIds.push(wordId);
    }
    lines.push(Object.freeze({id,text:cleanText(line?.text,16_384),confidence:confidence(line?.confidence),bbox,blockId,wordIds:Object.freeze(wordIds)}));
    return id;
  }
  if(Array.isArray(data.blocks))for(const block of data.blocks){
    if(blocks.length>=SCREEN_OCR_LIMITS.maxBlocks){truncated=true;break}
    const id=`block-${blocks.length+1}`,bbox=box(block?.bbox,width,height),lineIds=[];
    if(block?.bbox&&!bbox)invalidGeometry++;
    if(Array.isArray(block?.paragraphs))for(const paragraph of block.paragraphs){
      if(!Array.isArray(paragraph?.lines))continue;
      for(const line of paragraph.lines){const lineId=addLine(line,id);if(lineId)lineIds.push(lineId)}
    }
    else if(Array.isArray(block?.lines))for(const line of block.lines){const lineId=addLine(line,id);if(lineId)lineIds.push(lineId)}
    blocks.push(Object.freeze({id,text:cleanText(block?.text,32_768),confidence:confidence(block?.confidence),bbox,lineIds:Object.freeze(lineIds)}));
  }
  if(!blocks.length&&Array.isArray(data.lines))for(const line of data.lines)addLine(line,null);
  return Object.freeze({text,confidence:confidence(data.confidence),words:Object.freeze(words),lines:Object.freeze(lines),blocks:Object.freeze(blocks),width,height,geometry_space:'OCR_IMAGE_PIXELS',language,engine:SCREEN_OCR_ENGINE,network:'DISABLED',trust:'UNTRUSTED_SCREEN_OCR',source_authentication:false,truncated,invalid_geometry_count:invalidGeometry});
}

/**
 * Persistent, offline, bounded OCR. Call cancel() to revoke current work while
 * retaining the instance; close() permanently closes it. No image or OCR text
 * is written to disk. workerFactory is only a dependency-injection test seam.
 */
export function createScreenOcr({assetRoot,workerFactory,timeoutMs=SCREEN_OCR_LIMITS.timeoutMs,...limitOptions}={}){
  const limits=limitsFrom(limitOptions);
  const deadlineMs=boundedInteger(timeoutMs,SCREEN_OCR_LIMITS.timeoutMs,10,120_000,'TIMEOUT');
  if(workerFactory!==undefined&&typeof workerFactory!=='function')throw fail('MPC_SCREEN_OCR_WORKER_FACTORY_INVALID');
  let worker=null,initializing=null,closed=false,busy=false,generation=0,lastError=null,activeLanguage=null,assetsReady=false,activeReject=null;
  async function terminateCurrent(){
    const previous=worker;worker=null;activeLanguage=null;
    if(previous)try{await previous.terminate()}catch{}
  }
  async function getWorker(language,token){
    if(worker&&activeLanguage===language)return worker;
    const assets=inspectScreenOcrAssets(assetRoot,{language});assetsReady=true;
    const options=Object.freeze({workerPath:assets.workerPath,langPath:assets.langPath,corePath:assets.corePath,cacheMethod:'none',gzip:true,workerBlobURL:false});
    initializing=Promise.resolve(workerFactory?workerFactory(language,1,options,assets):createLocalWorker(assets,options));
    const created=await initializing;initializing=null;
    if(!created||typeof created.recognize!=='function'||typeof created.terminate!=='function')throw fail('MPC_SCREEN_OCR_WORKER_INVALID');
    if(closed||token!==generation){await created.terminate();throw fail('MPC_SCREEN_OCR_CANCELLED')}
    worker=created;activeLanguage=language;
    await created.ready;
    return created;
  }
  function cancel(){
    generation++;
    activeReject?.(fail('MPC_SCREEN_OCR_CANCELLED'));
    return terminateCurrent();
  }
  return Object.freeze({
    async recognize(input,{language='eng',width,height}={}){
      if(closed)throw fail('MPC_SCREEN_OCR_CLOSED');
      if(busy)throw fail('MPC_SCREEN_OCR_BUSY');
      if(language!=='eng')throw fail('MPC_SCREEN_OCR_LANGUAGE_UNAVAILABLE');
      const inputBytes=pngBytes(input);
      if(inputBytes.length>limits.maxPngBytes)throw fail('MPC_SCREEN_OCR_PNG_BYTE_LIMIT');
      const png=Buffer.from(inputBytes),parsed=parsePng(png,{...limits,width,height});
      const token=generation;busy=true;lastError=null;
      let timer;
      const cancelled=new Promise((_,reject)=>{activeReject=reject;timer=setTimeout(()=>{
        generation++;void terminateCurrent();reject(fail('MPC_SCREEN_OCR_TIMEOUT'));
      },deadlineMs)});
      try{
        const operation=(async()=>{
          await validatePixelPayload(parsed);
          if(closed||token!==generation)throw fail('MPC_SCREEN_OCR_CANCELLED');
          const current=await getWorker(language,token);
          if(closed||token!==generation)throw fail('MPC_SCREEN_OCR_CANCELLED');
          const raw=await current.recognize(png,{}, {text:true,blocks:true});
          if(closed||token!==generation)throw fail('MPC_SCREEN_OCR_CANCELLED');
          return normalizeResult(raw,parsed.width,parsed.height,language);
        })();
        return await Promise.race([operation,cancelled]);
      }catch(error){
        lastError=/^MPC_SCREEN_OCR_[A-Z_]+$/u.test(error?.code??'')?error.code:'MPC_SCREEN_OCR_FAILED';
        await terminateCurrent();
        throw fail(lastError);
      }finally{clearTimeout(timer);activeReject=null;busy=false;png.fill(0)}
    },
    status(){return Object.freeze({state:closed?'CLOSED':busy?'PROCESSING':worker?'READY':'IDLE',engine:SCREEN_OCR_ENGINE,language:activeLanguage,assets_ready:assetsReady,network:'DISABLED',last_error_code:lastError,limits})},
    cancel,
    async close(){closed=true;await cancel()},
  });
}
