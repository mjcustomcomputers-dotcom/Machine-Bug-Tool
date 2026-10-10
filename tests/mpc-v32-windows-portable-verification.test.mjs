import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {verifyPortableBuildV32,REQUIRED_RUNTIME_FILES,v32PortableContract}
 from '../scripts/verify-v32-windows-portable.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const COMMIT='08216cdc968b3d0688e615d3f220905f7feede55';
const output=(p,data)=>{mkdirSync(dirname(p),{recursive:true});
 writeFileSync(p,data);return {bytes:Buffer.byteLength(data),sha256:sha(data)};};
function fixture(t){
 const base=mkdtempSync(join(tmpdir(),'v32-portable-'));
 t.after(()=>rmSync(base,{recursive:true,force:true}));
 const root=join(base,'MPC-Workspace-win32-x64');
 const data={};
 for(const name of REQUIRED_RUNTIME_FILES)data[name]=Buffer.from('V32_DATA_FOR_'+name);
 const descriptor=(p,body)=>({path:p,bytes:body.length,sha256:sha(body)});
 const staged=REQUIRED_RUNTIME_FILES.map(p=>descriptor(p,data[p]));
 const app=Buffer.from('fixture-asar'),exe=Buffer.from('fixture-executable');
 const paths={};
 paths['MPC-Workspace.exe']=output(join(root,'MPC-Workspace.exe'),exe);
 paths['resources/app.asar']=output(join(root,'resources','app.asar'),app);
 for(const name of REQUIRED_RUNTIME_FILES.filter(s=>s.startsWith('desktop/renderer/'))){
  const relative=name.slice('desktop/renderer/'.length);
  paths['resources/mpc-workspace-renderer/'+relative]=
   output(join(root,'resources','mpc-workspace-renderer',relative),data[name]);
 }
 const payload={important_files:{
  'MPC-Workspace.exe':paths['MPC-Workspace.exe'],
  'resources/app.asar':paths['resources/app.asar']
 }};
 const receipt={format_version:'MPC_WORKSPACE_WINDOWS_PORTABLE_BUILD_1',
  source:{commit:COMMIT,dirty:false},target:{platform:'win32',architecture:'x64'},
  staged:{files:staged},payload_inventory:payload,
  zip:null};
 const internalPath=join(root,'build-receipt.json');
 paths['build-receipt.json']=output(internalPath,JSON.stringify(receipt));
 const inventory={files:Object.entries(paths).map(([path,value])=>({path,...value})),
  file_count:Object.keys(paths).length,
  total_bytes:Object.values(paths).reduce((sum,p)=>sum+p.bytes,0),
  important_files:payload.important_files};
 const external={...receipt,portable_inventory:inventory};
 const receiptPath=join(base,'receipt.json');
 writeFileSync(receiptPath,JSON.stringify(external));
 const mock={extractFile(_path,name){
  if(name==='package.json')return Buffer.from(JSON.stringify({mpcWorkspaceBuild:{
   source_commit:COMMIT,source_dirty:false,target:'win32-x64'}}));
  if(!Object.hasOwn(data,name))throw Error('missing');
  return data[name];
 }};
 return {base,root,receiptPath,data,mock};
}
test('V32 portable verifier preserves source-exact V31 checkpoint contract',()=>{
 assert.equal(v32PortableContract.base_v31_source,COMMIT);
 assert.equal(v32PortableContract.verify_staged_asar_modules,true);
 assert.ok(REQUIRED_RUNTIME_FILES.includes('lib/mpc-v31-bidirectional-logic.mjs'));
 assert.ok(REQUIRED_RUNTIME_FILES.includes('lib/mpc-v31-diagnostic-methods.mjs'));
});
test('all portable files, stage code and external renderer pass byte-for-byte fixture readback',async t=>{
 const f=fixture(t);
 const verified=await verifyPortableBuildV32({
  portableRoot:f.root,receiptPath:f.receiptPath,
  expectedSourceCommit:COMMIT,asar:f.mock});
 assert.equal(verified.status,'PACKAGED_SOURCE_BYTES_VERIFIED');
 assert.equal(verified.asar_files_verified,REQUIRED_RUNTIME_FILES.length);
 assert.equal(verified.renderer_files_verified,4);
 assert.equal(verified.source_identity_inside_asar,true);
 assert.equal(verified.native_windows_gui_exercised,false);
});
test('changed renderer bytes fail even if the ASAR retains the old source',async t=>{
 const f=fixture(t);
 writeFileSync(join(f.root,'resources','mpc-workspace-renderer','method-lab.js'),'modified');
 await assert.rejects(()=>verifyPortableBuildV32({
  portableRoot:f.root,receiptPath:f.receiptPath,
  expectedSourceCommit:COMMIT,asar:f.mock}),/V32_PORTABLE_FILE_CONTENT_MISMATCH/);
});
test('staged ASAR source mismatch defeats a nominally correct receipt',async t=>{
 const f=fixture(t);
 f.data['lib/mpc-v31-bidirectional-logic.mjs']=Buffer.from('MUTATED');
 await assert.rejects(()=>verifyPortableBuildV32({
  portableRoot:f.root,receiptPath:f.receiptPath,
  expectedSourceCommit:COMMIT,asar:f.mock}),/V32_ASAR_STAGED_SOURCE_HASH_MISMATCH/);
});
test('package source commit mismatch blocks cross-version portable verification',async t=>{
 const f=fixture(t);
 await assert.rejects(()=>verifyPortableBuildV32({
  portableRoot:f.root,receiptPath:f.receiptPath,
  expectedSourceCommit:'a'.repeat(40),asar:f.mock}),/V32_BUILD_SOURCE_OR_TARGET_MISMATCH/);
});
test('unexpected portable file invalidates exact manifest and delivery inventory',async t=>{
 const f=fixture(t);
 writeFileSync(join(f.root,'unexpected.mjs'),'hello');
 await assert.rejects(()=>verifyPortableBuildV32({
  portableRoot:f.root,receiptPath:f.receiptPath,
  expectedSourceCommit:COMMIT,asar:f.mock}),/V32_PORTABLE_FILE_INVENTORY_MISMATCH/);
});
