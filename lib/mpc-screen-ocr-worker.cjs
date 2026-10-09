'use strict';

// This file is copied, byte-for-byte, to the offline OCR asset directory.
// It is both the bounded coordinator and Tesseract's worker entry point.
// The restrictions below are application-level egress guards, not an OS sandbox.
const {parentPort,workerData}=require('node:worker_threads');
const {createRequire}=require('node:module');
const {join}=require('node:path');

function networkDenied(){
  const error=new Error('MPC_SCREEN_OCR_NETWORK_DISABLED');
  error.code='MPC_SCREEN_OCR_NETWORK_DISABLED';
  throw error;
}
globalThis.fetch=async()=>networkDenied();
globalThis.WebSocket=class {constructor(){networkDenied()}};
for(const name of ['node:http','node:https']){
  const module=require(name);
  module.request=networkDenied;
  module.get=networkDenied;
  module.createServer=networkDenied;
}
const net=require('node:net');
net.connect=networkDenied;
net.createConnection=networkDenied;
net.createServer=networkDenied;
net.Socket.prototype.connect=networkDenied;
const tls=require('node:tls');
tls.connect=networkDenied;
tls.createServer=networkDenied;
require('node:dgram').createSocket=networkDenied;
const datagram=require('node:dgram');
for(const name of ['send','connect'])datagram.Socket.prototype[name]=networkDenied;
const http2=require('node:http2');
for(const name of ['connect','createServer','createSecureServer'])http2[name]=networkDenied;
const dns=require('node:dns');
for(const name of ['lookup','lookupService','resolve','resolve4','resolve6','resolveAny','resolveCaa','resolveCname','resolveMx','resolveNaptr','resolveNs','resolvePtr','resolveSoa','resolveSrv','resolveTxt','reverse']){
  if(typeof dns[name]==='function')dns[name]=networkDenied;
  if(typeof dns.promises[name]==='function')dns.promises[name]=async()=>networkDenied();
}
const childProcess=require('node:child_process');
for(const name of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])childProcess[name]=networkDenied;

function safeError(error){
  const candidate=String(error?.code??'MPC_SCREEN_OCR_WORKER_FAILED');
  return /^[A-Z0-9_:-]{1,120}$/u.test(candidate)?candidate:'MPC_SCREEN_OCR_WORKER_FAILED';
}

if(workerData?.mpcScreenOcrCoordinator===true){
  const {assetRoot,language,options}=workerData;
  const localRequire=createRequire(join(assetRoot,'package.json'));
  const {createWorker}=localRequire('tesseract.js');
  let worker;
  let busy=false;
  const ready=createWorker(language,1,options).then(value=>{
    worker=value;
    parentPort.postMessage({type:'ready'});
  }).catch(error=>{
    parentPort.postMessage({type:'fatal',code:safeError(error)});
  });
  parentPort.on('message',async message=>{
    if(message?.type!=='recognize'||!Number.isSafeInteger(message.id))return;
    if(busy){parentPort.postMessage({type:'error',id:message.id,code:'MPC_SCREEN_OCR_BUSY'});return}
    busy=true;
    try{
      await ready;
      if(!worker)throw Object.assign(new Error('MPC_SCREEN_OCR_INITIALIZATION_FAILED'),{code:'MPC_SCREEN_OCR_INITIALIZATION_FAILED'});
      if(!(message.png instanceof Uint8Array))throw Object.assign(new Error('MPC_SCREEN_OCR_IMAGE_INVALID'),{code:'MPC_SCREEN_OCR_IMAGE_INVALID'});
      const png=Buffer.from(message.png);
      // Buffer.from(Uint8Array) copies. Release this worker's received IPC copy
      // immediately while the independent buffer remains valid for Tesseract.
      message.png.fill(0);
      try{
        const result=await worker.recognize(png,{}, {text:true,blocks:true});
        parentPort.postMessage({type:'result',id:message.id,data:result?.data});
      }finally{png.fill(0)}
    }catch(error){parentPort.postMessage({type:'error',id:message.id,code:safeError(error)})}
    finally{busy=false}
  });
  parentPort.on('close',()=>{void worker?.terminate()});
}else{
  // The fixed local paths were checked by the parent before either worker ran.
  require(join(__dirname,'node_modules','tesseract.js','src','worker-script','node','index.js'));
}
