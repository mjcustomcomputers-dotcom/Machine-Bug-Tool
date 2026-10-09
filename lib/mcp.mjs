import {toolList,callTool,VERSION} from './tools.mjs';
const LIMIT=2_000_000;
const json=(data,status=200)=>{const body=JSON.stringify(data);if(new TextEncoder().encode(body).length>1000000)return Response.json({jsonrpc:'2.0',id:data.id??null,error:{code:-32002,message:'RESPONSE_TOO_LARGE_USE_SMALLER_BATCH'}},{status:413});return new Response(body,{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(status===503?{'Retry-After':'2'}:{})}})};
const rpcError=(id,code,message,status=200)=>json({jsonrpc:'2.0',id,error:{code,message}},status);
const budgets=new Map();
function budget(key){const now=Date.now();for(const[k,v]of budgets)if(now-v.start>=60000)budgets.delete(k);let b=budgets.get(key);if(!b){if(budgets.size>=1024)throw Error('LOCAL_RATE_CAPACITY');b={start:now,count:0};budgets.set(key,b)}if(++b.count>60)throw Error('LOCAL_RATE_BUDGET_EXCEEDED');}
let inflight=0;
export async function handleMcp(request){if(inflight>=8)return rpcError(null,-32003,'SERVER_BUSY_RETRY_AFTER_2_SECONDS',503);inflight++;try{return await dispatch(request)}finally{inflight--}}
async function dispatch(request){
 if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return new Response('Origin rejected',{status:403});
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return new Response('application/json required',{status:415});
 if(Number(request.headers.get('Content-Length'))>LIMIT)return rpcError(null,-32600,'MESSAGE_TOO_LARGE',413);
 let q,reader,deadline;
 const timeout=new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('REQUEST_BODY_TIMEOUT')),5000)});timeout.catch(()=>{});
 try{
  reader=request.body?.getReader();if(!reader)throw Error('EMPTY_BODY');let total=0;const chunks=[];
  while(true){const{done,value}=await Promise.race([reader.read(),timeout]);if(done)break;total+=value.byteLength;if(total>LIMIT){void reader.cancel().catch(()=>{});return rpcError(null,-32600,'MESSAGE_TOO_LARGE',413)}chunks.push(value)}
  const bytes=new Uint8Array(total);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length}const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  let depth=0,quoted=false,escape=false;for(const c of raw){if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false}else if(c==='"')quoted=true;else if(c==='{'||c==='['){if(++depth>32)throw Error('JSON_DEPTH_LIMIT')}else if(c==='}'||c===']')depth--}
  const stack=[];const re=/"(?:\\.|[^"\\])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g;let expectKey=false;
  for(const token of raw.match(re)??[]){if(token==='{'){stack.push(new Set());expectKey=true}else if(token==='['){stack.push(null);expectKey=false}else if(token==='}'||token===']'){stack.pop();expectKey=false}else if(token===','){expectKey=stack.at(-1) instanceof Set}else if(token===':'){expectKey=false}else if(expectKey&&token.startsWith('"')){const key=JSON.parse(token),keys=stack.at(-1);if(keys.has(key))throw Error('DUPLICATE_JSON_KEY');keys.add(key);expectKey=false}}
  q=JSON.parse(raw);
 }catch(e){if(reader)void reader.cancel().catch(()=>{});return rpcError(null,-32700,e.message??'PARSE_ERROR',e.message==='REQUEST_BODY_TIMEOUT'?408:200)}finally{clearTimeout(deadline)}
 if(!q||Array.isArray(q)||q.jsonrpc!=='2.0'||typeof q.method!=='string')return rpcError(null,-32600,'INVALID_REQUEST');
 const notification=!Object.hasOwn(q,'id');const id=q.id??null;
 if(!notification&&typeof id!=='string'&&!Number.isSafeInteger(id))return rpcError(null,-32600,'INVALID_REQUEST_ID');
 if(q.params!==undefined&&(!q.params||typeof q.params!=='object'||Array.isArray(q.params)))return rpcError(id,-32602,'INVALID_PARAMS');
 if(notification)return new Response(null,{status:202});
 const params=q.params??{};
 if(q.method==='initialize')return json({jsonrpc:'2.0',id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'mpc-machine-legal-tools',version:VERSION},instructions:'Twenty hosted tools. UMTB-4 plus explicit atomic model review: read get_universal_contract and route supplied evidence before classifier activation. Coverage is not applicability. Includes recovered MBSS and military-jacket method references, including portable structural evidence checks and the 32-branch/384-classifier business-process pack. For ordinary evidence-review answers, use the output contract from get_universal_contract; cite exact classifier/parent/source links and preserve unknowns. Do not dump registries or infer automated test execution. Review/proof gates and source inspection remain in the local Python runtime; no legal promotion or connected-source dispatch.'}});
 if(q.method==='ping')return json({jsonrpc:'2.0',id,result:{}});
 if(q.method==='tools/list')return json({jsonrpc:'2.0',id,result:{tools:toolList}});
 if(q.method!=='tools/call')return rpcError(id,-32601,'METHOD_NOT_FOUND');
 if(!toolList.some(t=>t.name===params.name))return rpcError(id,-32602,'UNKNOWN_TOOL');
 const user=request.headers.get('oai-authenticated-user-id');
 if(params.name!=='runtime_status'&&(!user?.trim()||!request.headers.get('oai-authenticated-user-email')?.trim()))return rpcError(id,-32001,'AUTHENTICATED_USER_REQUIRED',401);
 try{budget(user??'registry-service');const payload=await callTool(params.name,params.arguments??{});return json({jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(payload)}],structuredContent:payload,isError:false}})}
 catch(e){return json({jsonrpc:'2.0',id,result:{content:[{type:'text',text:e.message??'TOOL_ERROR'}],isError:true,...(/BUDGET|CAPACITY/.test(e.message)?{retry_after_seconds:60,automatic_retry:false}:{})}})}
}
