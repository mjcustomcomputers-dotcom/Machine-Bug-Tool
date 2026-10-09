import {screenSettings,screenEvidenceText} from './screen-policy.js';

const $=id=>document.getElementById(id);
const number=id=>Number($(id).value);
const safeCode=error=>String(error?.message??error??'Screen reader error').slice(0,500);
function percentRect(prefix){return {x:number(`${prefix}-x`)/100,y:number(`${prefix}-y`)/100,width:number(`${prefix}-w`)/100,height:number(`${prefix}-h`)/100};}
function textOf(receipt){return receipt?.ocr?.text??receipt?.result?.text??receipt?.text??'';}
function saveText(name,text,type='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function initializeScreenReader({bridge,getProjectId,onUseEvidence,announce}){
  let active=false,starting=false,revision=0,receipt=null,pending=null,previewUrl=null,stats=null,project=null,lastCaptureMs=null;
  const masks=[];
  const available=typeof bridge?.screenStart==='function';
  const message=value=>{$('screen-status').textContent=value;};
  function clearPreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;$('screen-preview').removeAttribute('src');$('screen-preview').hidden=true;}
  function buttons(){
    $('screen-start').disabled=!available||active||starting;$('screen-stop').disabled=!active&&!starting;$('screen-now').disabled=!active;
    for(const id of ['screen-copy','screen-save','screen-use','screen-select','screen-copy-packet'])$(id).disabled=!receipt;
    $('screen-apply-result').disabled=!pending;
  }
  function applyResult(value){
    receipt=value;pending=null;$('screen-text').value=textOf(value);
    const ocr=value.ocr??value.result??value;
    $('screen-result-meta').textContent=`${ocr.width??value.frame?.width??'?'} × ${ocr.height??value.frame?.height??'?'} OCR pixels · ${ocr.words?.length??0} word atoms · confidence ${Number.isFinite(ocr.confidence)?ocr.confidence.toFixed(1):'unavailable'} · OCR ${Math.round(value.ocr_duration_ms??0)} ms · capture to result ${Math.round(value.capture_to_delivery_ms??0)} ms · local`;
    const report=value.classification;
    $('screen-classifier-summary').textContent=report?.summary??'No local classifier report is available for this observation.';
    const cues=$('screen-classifier-cues');cues.replaceChildren();
    for(const cue of report?.cues??[]){const li=document.createElement('li');li.textContent=`${cue.label}: ${cue.excerpt}${cue.protective_or_quoted_context?' (protective or quoted context detected)':''}`;cues.append(li);}
    const change=report?.change;
    $('screen-classifier-change').textContent=change?`${change.state} · ${change.added_lines} added / ${change.removed_lines} removed lines · classifier ${Math.round(value.classifier_duration_ms??0)} ms. ${change.previous_report_invalidated?'Previous derived checks were invalidated. ':''}Intentions and authorship remain unverified.`:'';
    $('screen-classifier-detail').textContent=report?JSON.stringify(report,null,2):'No classification yet.';
    $('screen-pending').textContent='';buttons();
  }
  function clearClassification(){
    $('screen-classifier-summary').textContent='No classification yet.';$('screen-classifier-cues').replaceChildren();
    $('screen-classifier-change').textContent='';$('screen-classifier-detail').textContent='No classification yet.';
  }
  function showMetrics(value){
    stats=value;const pipe=value?.pipeline??value;const counts=pipe?.metrics??{};
    const rows=[['Samples checked',value?.sampler?.sampled??'—'],['Before-encode skips',value?.sampler?.pixel_unchanged??'—'],
      ['PNG frames admitted',counts.submitted??0],['OCR completed',counts.analyzed??0],['Unchanged OCR results',counts.unchanged??0],
      ['Cache hits',counts.cache_hits??0],['Superseded / expired',(counts.dropped_superseded??0)+(counts.expired??0)],
      ['Waiting',pipe?.pending??0],['Active frame',pipe?.in_flight??0],['Capture / encode ms',lastCaptureMs===null?'—':lastCaptureMs.toFixed(1)],
      ['OCR result cache KiB',((pipe?.cache_bytes??0)/1024).toFixed(1)],['Queued PNG KiB',((pipe?.pending_bytes??0)/1024).toFixed(1)],
      ['Main memory MiB',value?.main_rss_bytes?(value.main_rss_bytes/1048576).toFixed(1):'—'],
      ['Process CPU % (1 core)',Number.isFinite(value?.main_cpu_percent)?value.main_cpu_percent.toFixed(1):'—']];
    const list=$('screen-metrics');list.replaceChildren();
    for(const [name,value] of rows){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=name;dd.textContent=String(value);row.append(dt,dd);list.append(row);}
  }
  async function stop(reason='Stopped. Last recognized text remains here until Clear.'){
    const stopping=++revision;starting=false;active=false;buttons();
    if(available)await bridge.screenStop().catch(()=>{});
    if(stopping!==revision)return;clearPreview();message(reason);buttons();
  }
  async function start(){
    const attempt=++revision;starting=true;buttons();
    try{
      project=getProjectId();
      const input={sourceId:$('screen-source').value,projectId:project,consent:$('screen-consent').checked,
        mode:$('screen-mode').value,fps:number('screen-fps'),crop:percentRect('screen-crop'),masks:[...masks],
        preview:$('screen-preview-enabled').checked,printScreen:$('screen-print-key').checked,
        excludeMpc:$('screen-exclude-mpc').checked,durationMinutes:number('screen-duration'),imageMode:$('screen-image-mode').value};
      screenSettings(input);if(!project)throw Error('Create or choose a project first. OCR works without a model.');
      $('screen-start').disabled=true;message('Starting local screen reader…');
      const result=await bridge.screenStart(input);
      if(attempt!==revision)return;starting=false;active=result.state==='CAPTURING';buttons();
      message(active?'Reading the selected source locally. Ctrl + Shift + F8 stops capture.':'Capture stopped.');
      if(input.printScreen&&!result.print_screen_registered)announce('Print Screen is already in use. Capture now and repeated capture still work.');
    }catch(error){if(attempt!==revision)return;starting=false;active=false;buttons();message(safeCode(error));}
  }
  async function sources(){
    try{
      if(!available)return message('Screen reading is available in the Windows desktop build.');
      const result=await bridge.screenSources();const select=$('screen-source');select.replaceChildren();
      for(const row of result.sources??[]){const option=document.createElement('option');option.value=row.id;
        option.textContent=`${row.kind==='window'?'Window':'Screen'} · ${row.name}${row.pixelWidth?` · ${row.pixelWidth} × ${row.pixelHeight}`:''}`;select.append(option);}
      message('Choose the source, set any crop or masks, allow this session, then Start.');
    }catch(error){message(safeCode(error));}
  }
  function renderMasks(){
    const list=$('screen-mask-list');list.replaceChildren();
    masks.forEach((mask,index)=>{const row=document.createElement('li'),button=document.createElement('button');
      row.textContent=`${index+1}. Left ${Math.round(mask.x*100)}%, top ${Math.round(mask.y*100)}%, width ${Math.round(mask.width*100)}%, height ${Math.round(mask.height*100)}% `;
      button.type='button';button.className='button compact';button.textContent='Remove';button.setAttribute('aria-label',`Remove mask ${index+1}`);
      button.addEventListener('click',()=>{void stop('Mask changed. Start a new session when ready.');masks.splice(index,1);renderMasks()});row.append(button);list.append(row);});
  }
  $('screen-refresh').addEventListener('click',sources);$('screen-start').addEventListener('click',start);
  $('screen-stop').addEventListener('click',()=>void stop());$('screen-now').addEventListener('click',()=>bridge.screenNow().catch(error=>message(safeCode(error))));
  $('screen-clear').addEventListener('click',async()=>{await stop('Stopped and cleared.');receipt=pending=null;$('screen-text').value='';$('screen-result-meta').textContent='';$('screen-pending').textContent='';clearClassification();buttons()});
  $('screen-add-mask').addEventListener('click',()=>{
    try{if(masks.length>=8)throw Error('Use up to eight privacy masks.');const mask=percentRect('screen-mask');
      screenSettings({consent:true,mode:'single',fps:1,durationMinutes:5,crop:{x:0,y:0,width:1,height:1},masks:[mask]});
      void stop('Mask added. Start a new session when ready.');masks.push(mask);renderMasks();}catch(error){message(safeCode(error))}
  });
  for(const input of document.querySelectorAll('#screen-capture-settings input,#screen-capture-settings select'))input.addEventListener('change',()=>{if(active||starting)void stop('Settings changed. Start again to apply them.')});
  $('screen-source').addEventListener('change',()=>{if(active||starting)void stop('Source changed. Start again when ready.')});
  $('screen-select').addEventListener('click',()=>{$('screen-text').focus();$('screen-text').select()});
  $('screen-copy').addEventListener('click',()=>bridge.copyText($('screen-text').value).then(()=>announce('Recognized text copied.')));
  $('screen-copy-packet').addEventListener('click',()=>bridge.copyText(screenEvidenceText(receipt)).then(()=>announce('Source-bound screen packet copied for ChatGPT or Codex.')));
  $('screen-save').addEventListener('click',()=>saveText(`MPC-Screen-${new Date().toISOString().replace(/[:.]/gu,'-')}.txt`,screenEvidenceText(receipt)));
  $('screen-use').addEventListener('click',async()=>{
    const selected=receipt;if(!selected)return;
    if(selected.context?.projectId!==getProjectId())return message('Return to the source project to use this observation.');
    await stop();onUseEvidence(screenEvidenceText(selected),selected.context.projectId);
  });
  $('screen-apply-result').addEventListener('click',()=>{if(pending)applyResult(pending)});
  $('screen-save-metrics').addEventListener('click',()=>saveText('MPC-Screen-Performance.json',JSON.stringify({observedAt:new Date().toISOString(),scope:'LOCAL_SCREEN_PIPELINE_METRICS',metrics:stats},null,2),'application/json'));
  bridge?.onScreenEvent?.(value=>{
    if(value.type==='STARTED'){active=true;project=value.session?.projectId??project;buttons();}
    if(value.type==='STOPPED'){active=false;clearPreview();message(`Stopped · ${value.reason}. Last recognized text remains available.`);buttons();}
    if(value.type==='ERROR'){message(`Screen reader: ${value.code}`);announce(`Screen reader: ${value.code}`);}
    if(value.type==='RESULT'){
      if(getProjectId()!==value.receipt?.context?.projectId)return;
      const selecting=document.activeElement===$('screen-text')||$('screen-hold-text').checked;
      if(selecting&&receipt){pending=value.receipt;$('screen-pending').textContent='A newer result is ready. Apply it when you finish reading.';buttons();}
      else applyResult(value.receipt);
    }
    if(value.type==='PREVIEW'&&active){
      lastCaptureMs=Number.isFinite(value.captureMs)?value.captureMs:null;
      clearPreview();previewUrl=URL.createObjectURL(new Blob([value.png],{type:'image/png'}));$('screen-preview').src=previewUrl;$('screen-preview').hidden=false;
    }
    if(value.metrics)showMetrics(value.metrics);
  });
  const timer=setInterval(async()=>{
    if((active||starting)&&project!==getProjectId()||receipt&&receipt.context?.projectId!==getProjectId()){
      await stop('Project changed. Choose a source for the new project.');receipt=pending=null;$('screen-text').value='';$('screen-result-meta').textContent='';$('screen-pending').textContent='';clearClassification();buttons();
    }
    if(!available||$('view-screen').hidden&&!active)return;
    try{const value=await bridge.screenStatus();showMetrics(value.metrics)}catch{}
  },1500);
  globalThis.addEventListener('beforeunload',()=>{clearInterval(timer);clearPreview()});
  buttons();message(available?'Screen reading is off. Choose a window or screen to begin.':'Use the Windows desktop build for local screen OCR.');
  return {stop,clear:async()=>{await stop('Cleared.');receipt=pending=null;$('screen-text').value='';clearClassification();buttons()},sources};
}
