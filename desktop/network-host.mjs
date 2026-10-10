import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildNetworkVirtualOsi,createVirtualOsiCache} from '../lib/mpc-osi-virtual.mjs';

export const NETWORK_SNAPSHOT_VERSION = 'MPC_NETWORK_SNAPSHOT_1';
export const NETWORK_MAX_ROWS = 256;
export const NETWORK_MAX_JSON_BYTES = 384 * 1024;
const SCRIPT_PATH = fileURLToPath(new URL('../scripts/mpc-network-snapshot.ps1',import.meta.url));
const fail = code => { const error = new Error(code); error.code=code; throw error; };
const safeText=(value,max=128)=>typeof value==='string'
  ?value.replace(/[\u0000-\u001f\u007f]/gu,' ').slice(0,max):'';
const address=value=>safeText(value,128);
const port=value=>Number.isSafeInteger(value)&&value>=0&&value<=65535?value:null;
const pid=value=>Number.isSafeInteger(value)&&value>=0&&value<=4294967295?value:null;
const plainObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const compareKey=row=>JSON.stringify([row.protocol,row.pid,row.local_address,row.local_port,row.remote_address,row.remote_port]);
const sortedRecords=rows=>rows.toSorted((a,b)=>compareKey(a).localeCompare(compareKey(b)));

function normalizeRow(row,protocol){
  if(!plainObject(row)||row.protocol!==protocol)fail('NETWORK_RESPONSE_ROW_INVALID');
  const localPort=port(row.local_port),ownerPid=pid(row.pid);
  if(!address(row.local_address)||localPort===null||ownerPid===null)fail('NETWORK_RESPONSE_ROW_INVALID');
  const remotePort=port(row.remote_port),remoteAddress=address(row.remote_address);
  if(protocol==='TCP'&&(remotePort===null||!remoteAddress))fail('NETWORK_RESPONSE_ROW_INVALID');
  return Object.freeze({
    protocol,pid:ownerPid,process_name:safeText(row.process_name,90)||null,
    local_address:address(row.local_address),local_port:localPort,
    remote_address:protocol==='TCP'?remoteAddress:null,
    remote_port:protocol==='TCP'?remotePort:null,
    state:protocol==='TCP'?safeText(row.state,40)||'Unknown':'Bound'
  });
}
function nativeRows(value,kind){
  if(!Array.isArray(value)||value.length>NETWORK_MAX_ROWS)fail('NETWORK_RESPONSE_LIMIT_EXCEEDED');
  return value.map(row=>normalizeRow(row,kind));
}
export function parseWindowsNetworkSnapshot(raw,{projectId,nowMs=Date.now()}={}){
  if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>NETWORK_MAX_JSON_BYTES)fail('NETWORK_RESPONSE_LIMIT_EXCEEDED');
  if(typeof projectId!=='string'||!projectId.trim()||projectId.length>128)fail('NETWORK_PROJECT_REQUIRED');
  if(!Number.isFinite(nowMs)||nowMs<0)fail('NETWORK_TIME_INVALID');
  let parsed;
  try{parsed=JSON.parse(raw);}catch{fail('NETWORK_RESPONSE_JSON_INVALID');}
  if(!plainObject(parsed)||parsed.kind!=='MPC_WINDOWS_NETWORK_NATIVE_1')fail('NETWORK_RESPONSE_IDENTITY_INVALID');
  for(const key of ['tcp_status','udp_status'])if(!['AVAILABLE','UNAVAILABLE'].includes(parsed[key]))fail('NETWORK_RESPONSE_STATUS_INVALID');
  if(typeof parsed.tcp_truncated!=='boolean'||typeof parsed.udp_truncated!=='boolean')fail('NETWORK_RESPONSE_STATUS_INVALID');
  if(parsed.tcp_status==='UNAVAILABLE'&&parsed.udp_status==='UNAVAILABLE')fail('NETWORK_NATIVE_ENDPOINTS_UNAVAILABLE');
  const tcp=nativeRows(parsed.tcp,'TCP'),udp=nativeRows(parsed.udp,'UDP');
  if(parsed.tcp_status==='UNAVAILABLE'&&tcp.length||parsed.udp_status==='UNAVAILABLE'&&udp.length)fail('NETWORK_RESPONSE_STATUS_INVALID');
  const records=sortedRecords([...tcp,...udp]),fingerprint=createHash('sha256')
    .update(JSON.stringify(records)).digest('hex');
  const complete=parsed.tcp_status==='AVAILABLE'&&parsed.udp_status==='AVAILABLE'&&
    !parsed.tcp_truncated&&!parsed.udp_truncated;
  return Object.freeze({
    kind:'MPC_NETWORK_ENDPOINT_OBSERVATION',version:NETWORK_SNAPSHOT_VERSION,
    project_id:projectId,observed_at:new Date(nowMs).toISOString(),
    source:{owner:'WINDOWS_LOCAL_OS',collector:'POWERSHELL_NETTCPIP',trust:'OS_REPORTED_NOT_AUTHENTICATED',
      network_target_contacted:false,packet_payloads_captured:false,remote_dns_lookups:false,admin_elevation_requested:false},
    completeness:complete?'COMPLETE_FOR_REPORTED_OS_TABLES':'PARTIAL',
    coverage:{tcp_status:parsed.tcp_status,udp_status:parsed.udp_status,
      tcp_truncated:parsed.tcp_truncated,udp_truncated:parsed.udp_truncated,
      row_limit_per_protocol:NETWORK_MAX_ROWS},
    counts:{tcp:tcp.length,udp:udp.length,total:records.length,
      listening:tcp.filter(row=>row.state.toLowerCase()==='listen').length,
      established:tcp.filter(row=>row.state.toLowerCase()==='established').length},
    fingerprint,records
  });
}
export function compareNetworkSnapshots(previous,current){
  if(!current||current.kind!=='MPC_NETWORK_ENDPOINT_OBSERVATION')fail('NETWORK_COMPARISON_INPUT_INVALID');
  if(!previous)return {state:'INITIAL',added:[],removed:[],changed_state:[],
    comparable:false,reason:'NO_PRIOR_SNAPSHOT'};
  if(previous.kind!==current.kind||previous.project_id!==current.project_id)
    return {state:'NOT_COMPARABLE',added:[],removed:[],changed_state:[],
      comparable:false,reason:'DIFFERENT_PROJECT_OR_SOURCE'};
  const oldMap=new Map(previous.records.map(row=>[compareKey(row),row]));
  const newMap=new Map(current.records.map(row=>[compareKey(row),row]));
  const added=[],removed=[],changed_state=[];
  for(const [key,row] of newMap){
    const prior=oldMap.get(key);
    if(!prior)added.push(row);
    else if(prior.state!==row.state)changed_state.push({before:prior,after:row});
  }
  for(const [key,row] of oldMap)if(!newMap.has(key))removed.push(row);
  const complete=previous.completeness==='COMPLETE_FOR_REPORTED_OS_TABLES'&&current.completeness==='COMPLETE_FOR_REPORTED_OS_TABLES';
  return {state:complete?'COMPARED':'PARTIAL_COMPARISON',comparable:complete,
    reason:complete?'TWO_NONATOMIC_OS_TABLE_SNAPSHOTS':'UNAVAILABLE_OR_TRUNCATED_TABLES',
    added:added.slice(0,48),removed:removed.slice(0,48),changed_state:changed_state.slice(0,48),
    counts:{added:added.length,removed:removed.length,changed_state:changed_state.length},
    note:'Observed between snapshots; no process/window intent, complete connection history or packet contents established.'};
}

/** User-triggered only, one bounded native command at a time; keeps at most one
 * previous snapshot in volatile memory. No shell, user commands or target I/O. */
export function createWindowsNetworkObserver({platform=process.platform,systemRoot=process.env.SystemRoot,
  execFileImpl=execFile,readScript=()=>readFileSync(SCRIPT_PATH,'utf8'),now=()=>Date.now()}={}){
  let pending=null,epoch=0,previous=null,lastProject=null;
  const metaCache=createVirtualOsiCache({maxEntries:4,maxBytes:64*1024,ttlMs:10_000,now});
  const stop=()=>{epoch++;pending?.abort();pending=null;previous=null;lastProject=null;metaCache.clear();return {state:'CLEARED'};};
  const status=()=>({state:pending?'READING':'IDLE',has_previous_snapshot:Boolean(previous),
    platform_supported:platform==='win32',version:NETWORK_SNAPSHOT_VERSION});
  async function snapshot(input){
    if(!plainObject(input)||input.consent!==true)fail('NETWORK_EXPLICIT_CONSENT_REQUIRED');
    if(typeof input.projectId!=='string'||!input.projectId.trim()||input.projectId.length>128)fail('NETWORK_PROJECT_REQUIRED');
    if(platform!=='win32')fail('NETWORK_WINDOWS_ONLY');
    if(pending)fail('NETWORK_SNAPSHOT_BUSY');
    if(input.projectId!==lastProject){previous=null;lastProject=input.projectId;metaCache.clear();}
    const controller=new AbortController(),stamp=epoch;
    pending=controller;
    try{
      const script=readScript();
      if(typeof script!=='string'||script.length>16_384||!script.includes('MPC_WINDOWS_NETWORK_NATIVE_1'))fail('NETWORK_FIXED_SCRIPT_INVALID');
      const exe=join(systemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
      const output=await new Promise((resolve,reject)=>{
        execFileImpl(exe,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{
          encoding:'utf8',windowsHide:true,shell:false,timeout:9000,maxBuffer:NETWORK_MAX_JSON_BYTES,
          signal:controller.signal
        },(error,stdout)=>{
          if(error){reject(Object.assign(new Error(controller.signal.aborted?'NETWORK_CANCELLED':'NETWORK_COMMAND_FAILED'),
            {code:controller.signal.aborted?'NETWORK_CANCELLED':'NETWORK_COMMAND_FAILED'}));return;}
          resolve(stdout);
        });
      });
      if(controller.signal.aborted||epoch!==stamp)fail('NETWORK_CANCELLED');
      const current=parseWindowsNetworkSnapshot(output,{projectId:input.projectId,nowMs:now()});
      const diff=compareNetworkSnapshots(previous,current);
      if(controller.signal.aborted||epoch!==stamp)fail('NETWORK_CANCELLED');
      const virtual_osi=buildNetworkVirtualOsi({snapshot:current,diff,cache:metaCache});
      previous=current;
      return {snapshot:current,diff,virtual_osi};
    }finally{if(pending===controller)pending=null;}
  }
  return Object.freeze({snapshot,stop,status});
}
