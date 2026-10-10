import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {parseWindowsNetworkSnapshot,compareNetworkSnapshots,createWindowsNetworkObserver,NETWORK_MAX_ROWS} from '../desktop/network-host.mjs';
const raw=override=>JSON.stringify({kind:'MPC_WINDOWS_NETWORK_NATIVE_1',
  tcp_status:'AVAILABLE',udp_status:'AVAILABLE',tcp_truncated:false,udp_truncated:false,
  tcp:[{protocol:'TCP',local_address:'127.0.0.1',local_port:11434,remote_address:'0.0.0.0',
    remote_port:0,pid:233,process_name:'ollama',state:'Listen'},
    {protocol:'TCP',local_address:'192.0.2.10',local_port:50123,remote_address:'198.51.100.5',
    remote_port:443,pid:77,process_name:'browser',state:'Established'}],
  udp:[{protocol:'UDP',local_address:'::',local_port:5353,remote_address:'',remote_port:0,
    pid:80,process_name:'dns-service',state:'Bound'}],...override});
const snapshot=(body,projectId='sample')=>parseWindowsNetworkSnapshot(body,{projectId,nowMs:1000});
test('fixed system TCP and UDP metadata is bounded and source identities stay OS-reported',()=>{
  const result=snapshot(raw());
  assert.equal(result.counts.total,3);
  assert.equal(result.counts.established,1);
  assert.equal(result.counts.listening,1);
  assert.equal(result.source.network_target_contacted,false);
  assert.equal(result.source.packet_payloads_captured,false);
  assert.equal(result.completeness,'COMPLETE_FOR_REPORTED_OS_TABLES');
  assert.match(result.fingerprint,/^[0-9a-f]{64}$/u);
  assert.equal(result.records.find(r=>r.protocol==='UDP').remote_address,null);
  assert.equal(snapshot(raw()).fingerprint,result.fingerprint);
  assert.ok(NETWORK_MAX_ROWS<=256);
});
test('snapshot comparisons mark added, disappeared and changing state without certifying completeness of traffic',()=>{
  const first=snapshot(raw());
  const next=snapshot(raw({tcp:[{protocol:'TCP',local_address:'192.0.2.10',local_port:50123,
    remote_address:'198.51.100.5',remote_port:443,pid:77,process_name:'browser',state:'CloseWait'}]}));
  const delta=compareNetworkSnapshots(first,next);
  assert.equal(delta.state,'COMPARED');
  assert.equal(delta.counts.removed,1);
  assert.equal(delta.counts.changed_state,1);
  assert.equal(delta.counts.added,0);
  assert.equal(compareNetworkSnapshots(null,next).state,'INITIAL');
  const partial=compareNetworkSnapshots(first,snapshot(raw({tcp_truncated:true})));
  assert.equal(partial.state,'PARTIAL_COMPARISON');
  assert.equal(partial.comparable,false);
  assert.equal(compareNetworkSnapshots(first,snapshot(raw(),'other-project')).state,'NOT_COMPARABLE');
});
test('missing capabilities, invalid rows and truncated sources remain uncertain',()=>{
  for(const body of [raw({tcp_status:'UNAVAILABLE',udp_status:'UNAVAILABLE',tcp:[],udp:[]}),
    raw({tcp:[{protocol:'TCP',pid:-1,local_address:'::',local_port:65536,remote_address:'::',remote_port:0,state:'Listen'}]}),
    raw({udp:[{}]}),raw({tcp:Array(257).fill({})}),raw({tcp_status:'NOT_REAL'}),
    'not valid json'])
    assert.throws(()=>snapshot(body),/NETWORK_/u);
  const partial=snapshot(raw({tcp_status:'UNAVAILABLE',tcp:[],tcp_truncated:false}));
  assert.equal(partial.completeness,'PARTIAL');
});
test('host requires a local consenting Windows session and a fixed executable/command',async()=>{
  const calls=[];
  const host=createWindowsNetworkObserver({platform:'win32',systemRoot:'C:\\Windows',now:()=>1000,
    readScript:()=>readFileSync(new URL('../scripts/mpc-network-snapshot.ps1',import.meta.url),'utf8'),
    execFileImpl:(path,args,options,callback)=>{
      calls.push({path,args,options});
      callback(null,raw(),'');
    }});
  await assert.rejects(host.snapshot({consent:false,projectId:'project-1'}),/NETWORK_EXPLICIT_CONSENT_REQUIRED/u);
  assert.equal(calls.length,0);
  const first=await host.snapshot({consent:true,projectId:'project-1'});
  const second=await host.snapshot({consent:true,projectId:'project-1'});
  assert.equal(first.diff.state,'INITIAL');
  assert.equal(second.diff.state,'COMPARED');
  assert.equal(first.virtual_osi?.modality,'NETWORK');
  assert.equal(first.virtual_osi.method_generation.generated,9);
  assert.equal(first.virtual_osi.virtual_layers[5].truth,'UNKNOWN');
  assert.equal(second.virtual_osi.router.external_probing,false);
  assert.equal(calls.length,2);
  assert.equal(calls[0].path,'C:\\Windows/System32/WindowsPowerShell/v1.0/powershell.exe'.replaceAll('/',requirePathSep()));
  assert.equal(calls[0].options.shell,false);
  assert.equal(calls[0].options.windowsHide,true);
  assert.equal(calls[0].args[0],'-NoLogo');
  assert.equal(calls[0].args.at(-1).includes('Get-NetTCPConnection'),true);
  assert.equal(calls[0].args.at(-1).includes('Get-NetUDPEndpoint'),true);
  assert.equal(calls[0].args.at(-1).includes('Invoke-WebRequest'),false);
  assert.equal(host.status().has_previous_snapshot,true);
  host.stop();
  assert.equal(host.status().has_previous_snapshot,false);
  assert.equal((await host.snapshot({consent:true,projectId:'project-1'})).diff.state,'INITIAL');
  await assert.rejects(createWindowsNetworkObserver({platform:'linux'}).snapshot({consent:true,projectId:'x'}),/NETWORK_WINDOWS_ONLY/u);
});
const requirePathSep=()=>process.platform==='win32'?'\\':'/';
test('clear revokes an outstanding request, prevents late results and disposes the snapshot',async()=>{
  let pending;
  const host=createWindowsNetworkObserver({platform:'win32',readScript:()=> 'MPC_WINDOWS_NETWORK_NATIVE_1',
    execFileImpl:(_path,_args,options,done)=>{pending={options,done};}});
  const requested=host.snapshot({consent:true,projectId:'one'});
  assert.equal(host.status().state,'READING');
  host.stop();
  pending.done(null,raw(),'');
  await assert.rejects(requested,/NETWORK_CANCELLED/u);
  assert.equal(host.status().has_previous_snapshot,false);
});
