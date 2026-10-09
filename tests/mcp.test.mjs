import test from 'node:test';import assert from 'node:assert/strict';
import fixtures from './parity-fixtures.json' with {type:'json'};
import {callTool} from '../lib/tools.mjs';import{handleMcp}from '../lib/mcp.mjs';
for(const [i,f]of fixtures.entries())test('Python parity '+i+' '+f.name,async()=>{if(f.error)await assert.rejects(()=>callTool(f.name,f.args),e=>e.message===f.error);else assert.deepEqual(await callTool(f.name,f.args),f.value)});
const request=(body,headers={})=>new Request('https://test.local/mcp',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const signedIn={'oai-authenticated-user-id':'synthetic','oai-authenticated-user-email':'test@example.invalid'};
const rpc=(method,params={},id=1)=>({jsonrpc:'2.0',id,method,params});
test('HTTP initialize then stateless tool discovery',async()=>{const init=await(await handleMcp(request(rpc('initialize')))).json();assert.equal(init.result.serverInfo.name,'mpc-machine-legal-tools');const list=await(await handleMcp(request(rpc('tools/list')))).json();assert.equal(list.result.tools.length,20)});
test('Registry executes through HTTP JSON-RPC',async()=>{const r=await(await handleMcp(request(rpc('tools/call',{name:'get_registry',arguments:{ids:[31,32]}}),signedIn))).json();assert.equal(r.result.structuredContent.dimensions.length,2);assert.equal(r.result.structuredContent.registry.maxvar,256)});
test('Caller data requires platform identity',async()=>{assert.equal((await handleMcp(request(rpc('tools/call',{name:'delta_plan',arguments:fixtures[5].args})))).status,401)});
test('Signed-in synthetic call succeeds',async()=>{const r=await(await handleMcp(request(rpc('tools/call',{name:'delta_plan',arguments:fixtures[5].args}),{'oai-authenticated-user-id':'synthetic','oai-authenticated-user-email':'test@example.invalid'}))).json();assert.deepEqual(r.result.structuredContent,fixtures[5].value)});
test('Duplicate and escaped duplicate keys rejected',async()=>{for(const b of ['{"jsonrpc":"2.0","id":1,"id":2,"method":"ping"}','{"jsonrpc":"2.0","id":1,"\\u0069d":2,"method":"ping"}'])assert.equal((await(await handleMcp(request(b))).json()).error.message,'DUPLICATE_JSON_KEY')});
test('Excessive depth rejected',async()=>assert.equal((await(await handleMcp(request('['.repeat(33)+']'.repeat(33)))).json()).error.message,'JSON_DEPTH_LIMIT'));
test('Oversize rejected before parse',async()=>assert.equal((await handleMcp(request('x'.repeat(2000001)))).status,413));
test('Foreign origin rejected',async()=>assert.equal((await handleMcp(request(rpc('ping'),{Origin:'https://evil.invalid'}))).status,403));
test('Schema rejects wrong types and extra props',async()=>{for(const a of [{ids:['31']},{ids:[31],extra:true}])assert.equal((await(await handleMcp(request(rpc('tools/call',{name:'get_registry',arguments:a}),signedIn))).json()).result.isError,true)});
test('Notification returns 202 without reply body',async()=>{const r=await handleMcp(request({jsonrpc:'2.0',method:'notifications/initialized'}));assert.equal(r.status,202);assert.equal(await r.text(),'')});
test('Runtime reports local-only gaps accurately',async()=>{const s=await callTool('runtime_status',{});assert.equal(s.proof_gate_hosted,false);assert.equal(s.persistence_hosted,false);assert.equal(s.court_release_allowed,false)});
test('Per-isolate rate budget enforced',async()=>{let r;for(let i=0;i<61;i++)r=await(await handleMcp(request(rpc('tools/call',{name:'runtime_status',arguments:{}}),{'oai-authenticated-user-id':'budget-test'}))).json();assert.equal(r.result.isError,true);assert.match(r.result.content[0].text,/BUDGET/)})
