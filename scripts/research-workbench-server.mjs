#!/usr/bin/env node
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync,lstatSync,readFileSync,realpathSync} from 'node:fs';
import {basename,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 QUEUE_ACTIONS,
 QUEUE_PROVIDERS,
 RUN_KINDS,
 ResearchWorkbenchStore,
 WORKBENCH_STORE_LIMITS,
 resolveWorkbenchDatabasePath
} from '../lib/research-workbench-store.mjs';

export const WORKBENCH_SERVER_VERSION='MPC_RESEARCH_WORKBENCH_SERVER_1.0';
export const WORKBENCH_HOST='127.0.0.1';
export const WORKBENCH_DEFAULT_PORT=8765;
export const WORKBENCH_BODY_LIMIT=1048576;
const HTML_NAME='MPC-Research-Workbench.html';
const MANIFEST_NAME='manifest.json';
const JSON_TYPE='application/json; charset=utf-8';
const STATIC_HEADERS=Object.freeze({
 'Cache-Control':'no-store',
 'Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
 'Cross-Origin-Opener-Policy':'same-origin',
 'Cross-Origin-Resource-Policy':'same-origin',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
 'Referrer-Policy':'no-referrer',
 'X-Frame-Options':'DENY',
 'X-Content-Type-Options':'nosniff'
});

function codedError(code,status=400){
 const error=Error(code);
 error.code=code;
 error.status=status;
 return error;
}

function singleHeader(request,name){
 const values=request.headersDistinct?.[name];
 if(!Array.isArray(values)||values.length!==1||typeof values[0]!=='string')return null;
 return values[0];
}

function json(response,status,value,extra={}){
 const body=JSON.stringify(value)+'\n';
 response.writeHead(status,{
  ...STATIC_HEADERS,
  'Content-Type':JSON_TYPE,
  'Content-Length':Buffer.byteLength(body),
  ...extra
 });
 response.end(body);
}

function errorStatus(error){
 if(Number.isInteger(error?.status))return error.status;
 const code=String(error?.code??'');
 if(code==='WORKBENCH_BODY_TOO_LARGE')return 413;
 if(code==='WORKBENCH_CONTENT_TYPE_REQUIRED'||code==='WORKBENCH_CONTENT_ENCODING_REJECTED')return 415;
 if(code.includes('SECRET_MATERIAL'))return 422;
 if(code.startsWith('WORKBENCH_'))return 422;
 return 500;
}

function safeErrorCode(error){
 const code=String(error?.code??'');
 return /^WORKBENCH_[A-Z0-9_]+$/u.test(code)?code:'WORKBENCH_INTERNAL_ERROR';
}

function constantTimeEqual(actual,expected){
 if(typeof actual!=='string')return false;
 const left=Buffer.from(actual,'utf8'),right=Buffer.from(expected,'utf8');
 return left.length===right.length&&timingSafeEqual(left,right);
}

function assertHost(request,port){
 const host=singleHeader(request,'host');
 if(host!==`${WORKBENCH_HOST}:${port}`)throw codedError('WORKBENCH_HOST_REJECTED',421);
}

function assertFetchSite(request){
 const site=singleHeader(request,'sec-fetch-site');
 if(site!==null&&!['same-origin','none'].includes(site.toLowerCase()))throw codedError('WORKBENCH_FETCH_SITE_REJECTED',403);
}

function assertApiToken(request,token){
 const supplied=singleHeader(request,'x-workbench-csrf');
 if(!constantTimeEqual(supplied,token))throw codedError('WORKBENCH_CSRF_REJECTED',403);
}

function assertWriteOrigin(request,port){
 const origin=singleHeader(request,'origin');
 if(origin!==`http://${WORKBENCH_HOST}:${port}`)throw codedError('WORKBENCH_ORIGIN_REJECTED',403);
}

async function readJsonBody(request){
 const contentType=singleHeader(request,'content-type');
 if(contentType===null||!/^application\/json;\s*charset=utf-8$/iu.test(contentType)){
  throw codedError('WORKBENCH_CONTENT_TYPE_REQUIRED',415);
 }
 const contentEncoding=singleHeader(request,'content-encoding');
 if(contentEncoding!==null&&contentEncoding.toLowerCase()!=='identity')throw codedError('WORKBENCH_CONTENT_ENCODING_REJECTED',415);
 const contentLength=singleHeader(request,'content-length');
 if(contentLength!==null){
  if(!/^(?:0|[1-9][0-9]*)$/u.test(contentLength))throw codedError('WORKBENCH_CONTENT_LENGTH_INVALID');
  if(Number(contentLength)>WORKBENCH_BODY_LIMIT)throw codedError('WORKBENCH_BODY_TOO_LARGE',413);
 }
 const chunks=[];
 let bytes=0;
 for await(const chunk of request){
  bytes+=chunk.length;
  if(bytes>WORKBENCH_BODY_LIMIT)throw codedError('WORKBENCH_BODY_TOO_LARGE',413);
  chunks.push(chunk);
 }
 if(bytes===0)throw codedError('WORKBENCH_JSON_REQUIRED');
 const raw=Buffer.concat(chunks);
 let text;
 try{
  text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 }catch{throw codedError('WORKBENCH_JSON_UTF8_INVALID')}
 let value;
 try{value=JSON.parse(text)}catch{throw codedError('WORKBENCH_JSON_INVALID')}
 if(value===null||typeof value!=='object'||Array.isArray(value))throw codedError('WORKBENCH_JSON_OBJECT_REQUIRED');
 return value;
}

function parseRequestUrl(request){
 if(typeof request.url!=='string'||!request.url.startsWith('/')||request.url.startsWith('//')||request.url.includes('\\')){
  throw codedError('WORKBENCH_REQUEST_TARGET_REJECTED',400);
 }
 try{return new URL(request.url,'http://workbench.invalid')}catch{throw codedError('WORKBENCH_REQUEST_TARGET_REJECTED',400)}
}

function parseLimit(url){
 for(const key of url.searchParams.keys())if(key!=='limit')throw codedError('WORKBENCH_QUERY_PARAMETER_REJECTED');
 const values=url.searchParams.getAll('limit');
 if(values.length>1)throw codedError('WORKBENCH_QUERY_PARAMETER_REJECTED');
 if(values.length===0)return 50;
 if(!/^[1-9][0-9]{0,2}$/u.test(values[0]))throw codedError('WORKBENCH_LIST_LIMIT_INVALID');
 const limit=Number(values[0]);
 if(limit>100)throw codedError('WORKBENCH_LIST_LIMIT_INVALID');
 return limit;
}

function regularBundleFile(path,{missing,invalid,maxBytes}){
 if(!existsSync(path))throw codedError(missing);
 const entry=lstatSync(path);
 if(entry.isSymbolicLink()||!entry.isFile()||entry.size>maxBytes)throw codedError(invalid);
 return readFileSync(path);
}

function validatedHtmlPolicy(html){
 let source;
 try{source=new TextDecoder('utf-8',{fatal:true}).decode(html)}catch{throw codedError('WORKBENCH_HTML_UTF8_INVALID')}
 const styles=[...source.matchAll(/<style>([^]*?)<\/style>/gu)],scripts=[...source.matchAll(/<script>([^]*?)<\/script>/gu)];
 const metas=[...source.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/gu)];
 if(styles.length!==1||scripts.length!==1||metas.length!==1)throw codedError('WORKBENCH_HTML_CSP_INVALID');
 const digest=value=>createHash('sha256').update(value).digest('base64');
 const expected=`default-src 'none'; script-src 'sha256-${digest(scripts[0][1])}'; style-src 'sha256-${digest(styles[0][1])}'; connect-src 'self'; img-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
 if(metas[0][1]!==expected)throw codedError('WORKBENCH_HTML_CSP_INVALID');
 return expected;
}

function manifestHtmlIdentity(root,html){
 const raw=regularBundleFile(join(root,MANIFEST_NAME),{missing:'WORKBENCH_MANIFEST_NOT_FOUND',invalid:'WORKBENCH_MANIFEST_INVALID',maxBytes:4*1024*1024});
 let manifest;
 try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))}catch{throw codedError('WORKBENCH_MANIFEST_INVALID')}
 if(manifest?.format_version!=='MPC_METHOD_SELF_SCAN_OFFLINE_MANIFEST_1.0'||!Array.isArray(manifest.artifacts)||
  manifest.artifact_count!==manifest.artifacts.length)throw codedError('WORKBENCH_MANIFEST_INVALID');
 const matches=manifest.artifacts.filter(row=>row?.path===HTML_NAME);
 if(matches.length!==1)throw codedError('WORKBENCH_MANIFEST_HTML_IDENTITY_INVALID');
 const expected=matches[0],actual=createHash('sha256').update(html).digest('hex');
 if(!Number.isSafeInteger(expected.bytes)||expected.bytes!==html.length||!/^[a-f0-9]{64}$/u.test(expected.sha256)||expected.sha256!==actual){
  throw codedError('WORKBENCH_MANIFEST_HTML_IDENTITY_INVALID');
 }
 return actual;
}

function loadWorkbenchHtml(root){
 if(typeof root!=='string'||/^(?:file|https?|sqlite):/iu.test(root)||root.startsWith('\\\\')||root.startsWith('//'))throw codedError('WORKBENCH_ROOT_INVALID');
 const absoluteRoot=resolve(root);
 if(!existsSync(absoluteRoot))throw codedError('WORKBENCH_ROOT_NOT_FOUND');
 const rootEntry=lstatSync(absoluteRoot);
 if(rootEntry.isSymbolicLink()||!rootEntry.isDirectory())throw codedError('WORKBENCH_ROOT_INVALID');
 const canonicalRoot=realpathSync(absoluteRoot);
 if(canonicalRoot!==absoluteRoot)throw codedError('WORKBENCH_ROOT_SYMLINK_REJECTED');
 const htmlPath=join(absoluteRoot,HTML_NAME);
 const html=regularBundleFile(htmlPath,{missing:'WORKBENCH_HTML_NOT_FOUND',invalid:'WORKBENCH_HTML_INVALID',maxBytes:8*1024*1024});
 const csp=validatedHtmlPolicy(html),sha256=manifestHtmlIdentity(absoluteRoot,html);
 return {root:absoluteRoot,html,htmlPath,sha256,csp};
}

function listen(server,port){
 return new Promise((resolveListen,reject)=>{
  const cleanup=()=>{server.off('error',onError);server.off('listening',onListening)};
  const onError=error=>{cleanup();reject(error)};
  const onListening=()=>{cleanup();resolveListen()};
  server.once('error',onError);
  server.once('listening',onListening);
  server.listen({host:WORKBENCH_HOST,port,exclusive:true});
 });
}

async function listenWithFallback(server,port){
 if(port!==undefined){await listen(server,port);return}
 try{await listen(server,WORKBENCH_DEFAULT_PORT)}catch(error){
  if(error?.code!=='EADDRINUSE')throw error;
  await listen(server,0);
 }
}

function closeServer(server){
 return new Promise((resolveClose,reject)=>{
  if(!server.listening){resolveClose();return}
  server.close(error=>error?reject(error):resolveClose());
  server.closeIdleConnections?.();
 });
}

export function openWorkbenchUrl(url,{platform=process.platform,spawnProcess=spawn}={}){
 let command,args;
 if(platform==='win32'){
  command='rundll32.exe';
  args=['url.dll,FileProtocolHandler',url];
 }else if(platform==='darwin'){
  command='open';
  args=[url];
 }else{
  command='xdg-open';
  args=[url];
 }
 const child=spawnProcess(command,args,{detached:true,stdio:'ignore',shell:false,windowsHide:true});
 child.once?.('error',()=>{});
 child.unref?.();
 return {command,args:Object.freeze([...args])};
}

export async function startResearchWorkbenchServer({
 root=process.cwd(),
 database,
 port,
 open=false,
 platform=process.platform,
 env=process.env,
 clock,
 id,
 csrfToken
}={}){
 if(port!==undefined&&(!Number.isSafeInteger(port)||port<0||port>65535||(port!==0&&port<1024)))throw codedError('WORKBENCH_PORT_INVALID');
 const bundle=loadWorkbenchHtml(root);
 const databasePath=resolveWorkbenchDatabasePath({bundleRoot:bundle.root,databasePath:database,platform,env,namespace:bundle.sha256.slice(0,16)});
 const store=new ResearchWorkbenchStore(databasePath,{clock,id,identity:bundle.sha256});
 const token=csrfToken??randomBytes(32).toString('base64url');
 if(typeof token!=='string'||Buffer.byteLength(token)<32){store.close();throw codedError('WORKBENCH_CSRF_TOKEN_INVALID')}
 let actualPort;
 const server=createServer(async(request,response)=>{
  try{
   assertHost(request,actualPort);
   assertFetchSite(request);
   const url=parseRequestUrl(request),method=request.method??'';
   if((url.pathname==='/'||url.pathname===`/${HTML_NAME}`)&&url.search===''){
    if(method!=='GET'&&method!=='HEAD'){
     json(response,405,{error:'WORKBENCH_METHOD_NOT_ALLOWED'},{Allow:'GET, HEAD'});
     return;
    }
    response.writeHead(200,{
     ...STATIC_HEADERS,
     'Content-Security-Policy':bundle.csp,
     'Content-Type':'text/html; charset=utf-8',
     'Content-Length':bundle.html.length
    });
    response.end(method==='HEAD'?undefined:bundle.html);
    return;
   }
   if(url.pathname==='/api/workbench/status'&&url.search===''){
    if(method!=='GET'){
     json(response,405,{error:'WORKBENCH_METHOD_NOT_ALLOWED'},{Allow:'GET'});
     return;
    }
    const stored=store.status();
    json(response,200,{
     format_version:WORKBENCH_SERVER_VERSION,
     status:'READY_LOCAL_ONLY',
     csrf_token:token,
     service:{host:WORKBENCH_HOST,port:actualPort,url:`http://${WORKBENCH_HOST}:${actualPort}/`},
     storage:{kind:'LOCAL_SQLITE_DERIVED',database_name:basename(databasePath),bundle_sha256:bundle.sha256,
      raw_input_default:false,client_result_content_default:false,...stored},
     capabilities:{run_kinds:RUN_KINDS,queue_providers:QUEUE_PROVIDERS,queue_actions:QUEUE_ACTIONS,
      limits:{request_body_bytes:WORKBENCH_BODY_LIMIT,...WORKBENCH_STORE_LIMITS}},
     boundaries:{
      external_networking:false,
      provider_dispatch:false,
      oauth:false,
      secrets_accepted:false,
      queue_state_created:'NOT_SENT',
      host_action_performed:false,
      canonical_records_modified:false
     }
    });
    return;
   }
   if(url.pathname==='/api/workbench/runs'){
    assertApiToken(request,token);
    if(method==='GET'){
     const runs=store.listRuns(parseLimit(url));
     json(response,200,{format_version:WORKBENCH_SERVER_VERSION,count:runs.length,runs});
     return;
    }
    if(method==='POST'&&url.search===''){
     assertWriteOrigin(request,actualPort);
     const run=store.createRun(await readJsonBody(request));
     json(response,201,{format_version:WORKBENCH_SERVER_VERSION,run});
     return;
    }
    json(response,405,{error:'WORKBENCH_METHOD_NOT_ALLOWED'},{Allow:'GET, POST'});
    return;
   }
   if(url.pathname==='/api/workbench/queue'){
    assertApiToken(request,token);
    if(method==='GET'){
     const queue=store.listQueue(parseLimit(url));
     json(response,200,{format_version:WORKBENCH_SERVER_VERSION,count:queue.length,queue});
     return;
    }
    if(method==='POST'&&url.search===''){
     assertWriteOrigin(request,actualPort);
     const queued=store.createQueueRequest(await readJsonBody(request));
     json(response,201,{format_version:WORKBENCH_SERVER_VERSION,queue_request:queued});
     return;
    }
    json(response,405,{error:'WORKBENCH_METHOD_NOT_ALLOWED'},{Allow:'GET, POST'});
    return;
   }
   json(response,404,{error:'WORKBENCH_NOT_FOUND'});
  }catch(error){
   if(!response.headersSent)json(response,errorStatus(error),{error:safeErrorCode(error)});
   else response.destroy();
  }
 });
 server.maxHeadersCount=40;
 server.headersTimeout=5000;
 server.requestTimeout=10000;
 server.keepAliveTimeout=2000;
 try{
  await listenWithFallback(server,port);
  const address=server.address();
  actualPort=typeof address==='object'&&address?address.port:null;
  if(!Number.isInteger(actualPort))throw codedError('WORKBENCH_LISTEN_FAILED');
 }catch(error){store.close();throw error}
 const url=`http://${WORKBENCH_HOST}:${actualPort}/`;
 if(open)openWorkbenchUrl(url,{platform});
 let closed=false;
 return {
  server,
  store,
  host:WORKBENCH_HOST,
  port:actualPort,
  url,
  databasePath,
  csrfToken:token,
  async close(){
   if(closed)return;
   closed=true;
   await closeServer(server);
   store.close();
  }
 };
}

export function parseWorkbenchServerArguments(argv){
 const options={open:false};
 const seen=new Set();
 for(let index=0;index<argv.length;index++){
  const argument=argv[index];
  if(argument==='--open'){
   if(seen.has(argument))throw codedError('WORKBENCH_ARGUMENT_DUPLICATE');
   seen.add(argument);options.open=true;continue;
  }
  if(argument==='--help'){
   if(seen.has(argument))throw codedError('WORKBENCH_ARGUMENT_DUPLICATE');
   seen.add(argument);options.help=true;continue;
  }
  if(!['--root','--database','--port'].includes(argument))throw codedError('WORKBENCH_ARGUMENT_UNKNOWN');
  if(seen.has(argument)||index+1>=argv.length)throw codedError('WORKBENCH_ARGUMENT_INVALID');
  seen.add(argument);
  const value=argv[++index];
  if(value.startsWith('--'))throw codedError('WORKBENCH_ARGUMENT_INVALID');
  if(argument==='--root')options.root=value;
  else if(argument==='--database')options.database=value;
  else{
   if(!/^(?:0|[1-9][0-9]{0,4})$/u.test(value))throw codedError('WORKBENCH_PORT_INVALID');
   options.port=Number(value);
   if(options.port>65535||(options.port!==0&&options.port<1024))throw codedError('WORKBENCH_PORT_INVALID');
  }
 }
 if(!options.root&&!options.help)throw codedError('WORKBENCH_ROOT_REQUIRED');
 return options;
}

async function main(){
 const options=parseWorkbenchServerArguments(process.argv.slice(2));
 if(options.help){
  process.stdout.write('Usage: node research-workbench-server.mjs --root <bundle> [--database <file.sqlite>] [--port <port>] [--open]\n');
  return;
 }
 const running=await startResearchWorkbenchServer(options);
 process.stdout.write(JSON.stringify({
  status:'READY_LOCAL_ONLY',
  url:running.url,
  database:running.databasePath,
  external_networking:false,
  provider_dispatch:false
 })+'\n');
 let stopping=false;
 const stop=async()=>{
  if(stopping)return;
  stopping=true;
  try{await running.close();process.exitCode=0}catch{process.exitCode=1}
 };
 process.once('SIGINT',stop);
 process.once('SIGTERM',stop);
}

const entry=process.argv[1]?resolve(process.argv[1]):'';
if(entry===fileURLToPath(import.meta.url))main().catch(error=>{
 process.stderr.write(JSON.stringify({error:safeErrorCode(error)})+'\n');
 process.exitCode=1;
});
