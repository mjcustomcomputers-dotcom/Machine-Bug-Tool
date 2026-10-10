// Volatile local network observation; all capture and export actions are explicit.
const $=id=>document.getElementById(id);
const text=(id,value)=>{$(id).textContent=String(value);};
const safeError=error=>String(error?.message??error??'NETWORK_SNAPSHOT_FAILED')
  .match(/NETWORK_[A-Z_]+/u)?.[0]??'NETWORK_SNAPSHOT_UNAVAILABLE';
const endpoint=(host,port)=>host?(host.includes(':')?'['+host+']':host)+':'+port:'—';
const textOf=value=>JSON.stringify(value,null,2);
function downloadJson(value){
  const blob=new Blob([value],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='MPC-Network-'+new Date().toISOString().replace(/[:.]/gu,'-')+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function initializeNetworkPanel({bridge,getProjectId,onUseEvidence,announce}){
  let latest=null,running=false,revision=0;
  const available=typeof bridge?.networkSnapshot==='function';
  function buttons(){
    const has=!!latest,ready=available&&!running&&$('network-consent').checked&&!!getProjectId();
    $('network-refresh').disabled=!ready;
    $('network-clear').disabled=!available&&!has;
    for(const id of ['network-copy','network-save','network-use','network-select'])$(id).disabled=!has;
  }
  function showRows(){
    const table=$('network-rows');table.replaceChildren();
    if(!latest)return;
    const filter=$('network-filter').value.trim().toLowerCase(),kind=$('network-kind').value;
    const rows=latest.snapshot.records.filter(row=>
      (kind==='ALL'||row.protocol===kind||
        kind==='LISTEN'&&row.protocol==='TCP'&&row.state.toLowerCase()==='listen'||
        kind==='ESTABLISHED'&&row.protocol==='TCP'&&row.state.toLowerCase()==='established')&&
      (!filter||[row.process_name,row.pid,row.protocol,row.state,row.local_address,row.local_port,row.remote_address,row.remote_port]
        .some(value=>String(value??'').toLowerCase().includes(filter))));
    const shown=rows.slice(0,120);
    for(const row of shown){
      const tr=document.createElement('tr');
      for(const value of [row.process_name??'Unknown',row.pid,row.protocol,
        endpoint(row.local_address,row.local_port),endpoint(row.remote_address,row.remote_port),row.state]){
        const td=document.createElement('td');td.textContent=String(value);tr.append(td);
      }
      table.append(tr);
    }
    text('network-visible','Showing '+shown.length+' of '+rows.length+' filtered endpoints. No traffic contents captured.');
  }
  function render(){
    const snapshot=latest.snapshot,diff=latest.diff;
    text('network-summary',snapshot.counts.total+' reported endpoints · TCP '+snapshot.counts.tcp+
      ' · UDP '+snapshot.counts.udp+' · '+snapshot.counts.listening+' listening · '+
      snapshot.counts.established+' established. Coverage: '+snapshot.completeness+'.');
    text('network-diff',diff.state==='INITIAL'?'First snapshot: take another to compare.'
      :diff.state==='NOT_COMPARABLE'?'Snapshot scope changed; no comparison.'
        :diff.state+': '+diff.counts.added+' newly observed · '+diff.counts.removed+
          ' no longer observed · '+diff.counts.changed_state+
          ' TCP states changed. These are two non-atomic samples, not complete traffic history.');
    text('network-meta-route',latest.virtual_osi?.router
      ? 'Virtual OSI routing: '+latest.virtual_osi.router.action+' · '+latest.virtual_osi.method_generation.generated+
        ' method candidates, not executed findings.'
      : 'Virtual network classifier: no observation yet.');
    $('network-text').value=textOf(latest);
    showRows();buttons();
  }
  async function clear(message='Snapshot cleared from this view and native memory.'){
    revision++;latest=null;running=false;
    $('network-consent').checked=false;$('network-text').value='';
    $('network-rows').replaceChildren();
    text('network-summary','No native network snapshot collected.');
    text('network-diff','No prior observation to compare.');
    text('network-meta-route','Virtual network classifier: no observation yet.');
    text('network-visible','No endpoint rows.');
    text('network-observation-status',message);buttons();
    try{await bridge?.networkClear?.();}catch{}
  }
  async function capture(){
    if(!available)return;
    if(!$('network-consent').checked)return text('network-observation-status','Check the permission box before reading local ports.');
    const current=getProjectId();
    if(!current)return text('network-observation-status','Create or select a project before taking a network snapshot.');
    const attempt=++revision;running=true;buttons();
    text('network-observation-status','Reading Windows TCP/UDP endpoint metadata once…');
    try{
      const result=await bridge.networkSnapshot({projectId:current,consent:true});
      if(attempt!==revision||!$('network-consent').checked||getProjectId()!==current)return;
      if(result?.snapshot?.kind!=='MPC_NETWORK_ENDPOINT_OBSERVATION')throw Error('NETWORK_RESPONSE_INVALID');
      latest=result;render();text('network-observation-status','Native snapshot observed at '+result.snapshot.observed_at+'. Nothing probed or uploaded.');
    }catch(error){
      if(attempt!==revision)return;
      text('network-observation-status',safeError(error)+'. Windows NetTCPIP commands must be available; no source data was adopted.');
    }finally{if(attempt===revision){running=false;buttons();}}
  }
  $('network-consent').addEventListener('change',()=>{
    if(!$('network-consent').checked){void clear('Permission withdrawn; volatile snapshots cleared.');return;}
    buttons();
  });
  $('network-refresh').addEventListener('click',()=>void capture());
  $('network-clear').addEventListener('click',()=>void clear());
  $('network-kind').addEventListener('change',showRows);
  $('network-filter').addEventListener('input',showRows);
  $('network-select').addEventListener('click',()=>{$('network-text').focus();$('network-text').select();});
  $('network-copy').addEventListener('click',()=>bridge.copyText($('network-text').value)
    .then(()=>announce('Local network snapshot copied to clipboard.'))
    .catch(()=>text('network-observation-status','NETWORK_CLIPBOARD_UNAVAILABLE')));
  $('network-save').addEventListener('click',()=>{if(latest)downloadJson($('network-text').value);});
  $('network-use').addEventListener('click',()=>{
    if(!latest||latest.snapshot.project_id!==getProjectId())return;
    const header='MPC NATIVE WINDOWS NETWORK OBSERVATION — OS-REPORTED, NOT AUTHENTICATED\n'+
      'User-authorized local TCP/UDP socket listing. PIDs and destinations are sensitive. '+
      'Entries are instantaneous, not proof of actor intent, attribution or complete network traffic.\n\n';
    onUseEvidence(header+$('network-text').value,latest.snapshot.project_id);
    announce('Network metadata prepared as selected evidence in chat. Nothing was automatically sent.');
  });
  buttons();
  text('network-observation-status',available?'Ready for an explicit Windows network snapshot.':'This reader requires the native Windows MPC executable.');
  return {clear,refreshButtons:buttons};
}
