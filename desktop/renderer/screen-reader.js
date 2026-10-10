import {screenSettings,screenEvidenceText} from './screen-policy.js';
import {screenSourceStartGate} from './screen-source-choice.js';
import {proposeInverseOcrCrop} from './roi-process.js';

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
  let sourcesListedAt=0,sourceRequest=0;
  let roiProposal=null,roiSource=null,roiTrial=null;
  const masks=[];
  const available=typeof bridge?.screenStart==='function';
  const message=value=>{$('screen-status').textContent=value;};
  function clearPreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;$('screen-preview').removeAttribute('src');$('screen-preview').hidden=true;}
  function selectionGate(){
    const select=$('screen-source');
    return screenSourceStartGate({sourceIds:[...select.options].filter(option=>!option.disabled&&option.value).map(option=>option.value),
      selectedId:select.value,consent:$('screen-consent').checked,listedAt:sourcesListedAt,now:Date.now()});
  }
  function buttons(){
    $('screen-start').disabled=!available||active||starting||!selectionGate().allowed;$('screen-stop').disabled=!active&&!starting;$('screen-now').disabled=!active;
    for(const id of ['screen-copy','screen-save','screen-use','screen-select','screen-copy-packet'])$(id).disabled=!receipt;
    $('screen-apply-result').disabled=!pending;
    $('screen-roi-suggest').disabled=!receipt||!!roiTrial;
    $('screen-roi-apply').disabled=!roiProposal||receipt!==roiSource||
      $('screen-source').value!==roiProposal?.source?.source_id||
      getProjectId()!==roiProposal?.source?.project_id;
  }
  function applyResult(value){
    const trial=roiTrial;
    roiTrial=null;roiProposal=null;roiSource=null;
    if(trial){
      const sameSource=value.context?.projectId===trial.projectId&&value.context?.sourceId===trial.sourceId;
      const expected=trial.percent,observed=value.context?.crop;
      const sameCrop=observed&&
        Math.abs(observed.x-expected.left/100)<0.001&&
        Math.abs(observed.y-expected.top/100)<0.001&&
        Math.abs(observed.width-expected.width/100)<0.001&&
        Math.abs(observed.height-expected.height/100)<0.001;
      const comparisonMs=value.ocr_duration_ms;
      if(sameSource&&sameCrop&&Number.isFinite(comparisonMs)&&Number.isFinite(trial.baselineMs)&&trial.baselineMs>0){
        const change=Math.round((trial.baselineMs-comparisonMs)/trial.baselineMs*1000)/10;
        $('screen-roi-status').textContent='One observed OCR timing comparison: '+Math.round(trial.baselineMs)+
          ' ms before → '+Math.round(comparisonMs)+' ms after ('+
          (change>=0?String(change)+'% shorter':String(-change)+'% longer')+
          '). Pixel area proposal saved '+trial.pixelSaved+'%. Screen content may have changed; not a controlled speed claim.';
      }else $('screen-roi-status').textContent='Crop or source changed; cannot compare OCR timings. Capture again to generate a new suggestion.';
    }else $('screen-roi-status').textContent='Text atoms are ready. Expand Crop area and select Suggest crop from OCR.';
    receipt=value;pending=null;$('screen-text').value=textOf(value);
    const ocr=value.ocr??value.result??value;
    $('screen-result-meta').textContent=`${ocr.width??value.frame?.width??'?'} × ${ocr.height??value.frame?.height??'?'} OCR pixels · ${ocr.words?.length??0} word atoms · confidence ${Number.isFinite(ocr.confidence)?ocr.confidence.toFixed(1):'unavailable'} · OCR ${Math.round(value.ocr_duration_ms??0)} ms · capture to result ${Math.round(value.capture_to_delivery_ms??0)} ms · local`;
    const report=value.classification;
    $('screen-classifier-summary').textContent=report?.summary??'No local classifier report is available for this observation.';
    $('screen-virtual-route').textContent=report?.virtual_osi?.router
      ? `Virtual OCR route: ${report.virtual_osi.router.action} · ${report.virtual_osi.method_generation.generated} bounded method transformations · source interpretation unverified.`
      : 'No virtual OCR routing metadata is available for this observation.';
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
    $('screen-virtual-route').textContent='No virtual OCR routing metadata yet.';
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
      if(roiTrial&&(roiTrial.projectId!==project||roiTrial.sourceId!==input.sourceId||
        ['x','y','width','height'].some((k,i)=>Math.abs(input.crop[k]-
          ([roiTrial.percent.left,roiTrial.percent.top,roiTrial.percent.width,roiTrial.percent.height][i]/100))>0.001)))
        roiTrial=null;
      const admission=selectionGate();
      if(!admission.allowed)throw Error(admission.code==='SCREEN_REFRESH_SOURCE_LIST'
        ? 'The source list expired. Choose / refresh sources and select the window again.'
        : 'Choose / refresh sources, select a window or monitor, and allow this session.');
      $('screen-start').disabled=true;message('Starting local screen reader…');
      const result=await bridge.screenStart(input);
      if(attempt!==revision)return;starting=false;active=result.state==='CAPTURING';buttons();
      message(active?'Reading the selected source locally. Ctrl + Shift + F8 stops capture.':'Capture stopped.');
      if(input.printScreen&&!result.print_screen_registered)announce('Print Screen is already in use. Capture now and repeated capture still work.');
    }catch(error){
      if(attempt!==revision)return;
      starting=false;active=false;
      const detail=safeCode(error);
      if(detail.includes('SCREEN_REFRESH_SOURCE_LIST'))sourcesListedAt=0;
      buttons();
      message(detail.includes('SCREEN_REFRESH_SOURCE_LIST')
        ? 'The selected source expired. Choose / refresh sources, select the window or monitor again, then Start.'
        : detail);
    }
  }
  async function sources(){
    const request=++sourceRequest;
    try{
      if(!available)return message('Screen reading is available in the Windows desktop build.');
      if(active||starting)await stop('Source list refreshed. Select a new source to resume capture.');
      const result=await bridge.screenSources();
      if(request!==sourceRequest)return;
      const select=$('screen-source'),previous=select.value;
      select.replaceChildren();
      const prompt=document.createElement('option');prompt.value='';prompt.disabled=true;prompt.textContent='Select a window or monitor';
      select.append(prompt);
      const rows=result.sources??[];
      for(const row of rows){const option=document.createElement('option');option.value=row.id;
        option.textContent=`${row.kind==='window'?'Window':'Screen'} · ${row.name}${row.pixelWidth?` · ${row.pixelWidth} × ${row.pixelHeight}`:''}`;select.append(option);}
      select.value=rows.some(row=>row.id===previous)?previous:'';
      sourcesListedAt=Date.now();buttons();
      message(rows.length
        ? 'Select a window or monitor, allow this session, then Start. The source list lasts five minutes.'
        : 'Windows returned no selectable screens or windows. Restart MPC if this continues; no capture started.');
    }catch(error){if(request!==sourceRequest)return;sourcesListedAt=0;buttons();message(safeCode(error));}
  }
  function suggestCrop(){
    if(!receipt)return;
    try{
      const proposal=proposeInverseOcrCrop(receipt);
      roiProposal=proposal.status==='PROPOSED'?proposal:null;
      roiSource=roiProposal?receipt:null;
      if(!roiProposal){
        $('screen-roi-status').textContent=proposal.status+': '+proposal.reason;
      }else{
        const p=proposal.proposed_region;
        $('screen-roi-status').textContent='Proposed native region: left '+p.left+'%, top '+p.top+
          '%, width '+p.width+'%, height '+p.height+'%. Pixel area -'+
          proposal.projected_pixel_area.saved_percent+'%; this retains '+
          proposal.observed_text_atomics.weighted_coverage_percent+
          '% of weighted, previously recognized text atoms ('+
          proposal.observed_text_atomics.omitted+' omitted). Other text outside this crop is unknown. '+
          'Review it before applying; faster OCR is not guaranteed.';
      }
      buttons();
    }catch(error){roiProposal=null;roiSource=null;
      $('screen-roi-status').textContent='The OCR geometry could not support a safe crop proposal ('+safeCode(error)+').';
      buttons();
    }
  }
  async function applyCrop(){
    const proposed=roiProposal;
    if(!proposed||!roiSource||receipt!==roiSource||proposed.source.project_id!==getProjectId()||
      proposed.source.source_id!==$('screen-source').value)
      return message('The selected source or OCR result changed. Suggest the crop again.');
    if(active||starting)await stop('Crop settings changed. Restart explicitly when ready.');
    if(receipt!==roiSource||proposed.source.project_id!==getProjectId()||
      proposed.source.source_id!==$('screen-source').value)return;
    const p=proposed.proposed_region,baseline=roiSource;
    for(const [id,value] of [['x',p.left],['y',p.top],['w',p.width],['h',p.height]])
      $('screen-crop-'+id).value=String(value);
    roiTrial={projectId:proposed.source.project_id,sourceId:proposed.source.source_id,
      percent:p,baselineMs:baseline.ocr_duration_ms,pixelSaved:proposed.projected_pixel_area.saved_percent};
    roiProposal=null;roiSource=null;buttons();
    $('screen-roi-status').textContent='Suggested crop applied to the native source. All existing privacy masks remain unchanged. '+
      'Click Start to take a new capture; previous full-frame OCR remains available for comparison.';
  }
  function renderMasks(){
    const list=$('screen-mask-list');list.replaceChildren();
    masks.forEach((mask,index)=>{const row=document.createElement('li'),button=document.createElement('button');
      row.textContent=`${index+1}. Left ${Math.round(mask.x*100)}%, top ${Math.round(mask.y*100)}%, width ${Math.round(mask.width*100)}%, height ${Math.round(mask.height*100)}% `;
      button.type='button';button.className='button compact';button.textContent='Remove';button.setAttribute('aria-label',`Remove mask ${index+1}`);
      button.addEventListener('click',()=>{void stop('Mask changed. Start a new session when ready.');masks.splice(index,1);renderMasks()});row.append(button);list.append(row);});
  }
  $('screen-refresh').addEventListener('click',()=>{void sources()});$('screen-start').addEventListener('click',start);
  $('screen-roi-suggest').addEventListener('click',suggestCrop);
  $('screen-roi-apply').addEventListener('click',()=>void applyCrop());
  $('screen-stop').addEventListener('click',()=>void stop());$('screen-now').addEventListener('click',()=>bridge.screenNow().catch(error=>message(safeCode(error))));
  $('screen-clear').addEventListener('click',async()=>{await stop('Stopped and cleared.');roiProposal=roiSource=roiTrial=null;receipt=pending=null;
    $('screen-roi-status').textContent='No OCR geometry retained. Take a new capture to suggest a crop.';$('screen-text').value='';$('screen-result-meta').textContent='';$('screen-pending').textContent='';clearClassification();buttons()});
  $('screen-add-mask').addEventListener('click',()=>{
    try{if(masks.length>=8)throw Error('Use up to eight privacy masks.');const mask=percentRect('screen-mask');
      screenSettings({consent:true,mode:'single',fps:1,durationMinutes:5,crop:{x:0,y:0,width:1,height:1},masks:[mask]});
      void stop('Mask added. Start a new session when ready.');masks.push(mask);renderMasks();}catch(error){message(safeCode(error))}
  });
  for(const input of document.querySelectorAll('#screen-capture-settings input,#screen-capture-settings select,#screen-consent'))input.addEventListener('change',()=>{if(active||starting)void stop('Settings changed. Start again to apply them.');buttons()});
  $('screen-source').addEventListener('change',()=>{roiProposal=roiSource=roiTrial=null;
    $('screen-roi-status').textContent='Source changed. Capture it before suggesting a region.';
    if(active||starting)void stop('Source changed. Start again when ready.');buttons()});
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
    if(sourcesListedAt&&!active&&!starting&&selectionGate().code==='SCREEN_REFRESH_SOURCE_LIST'){
      sourcesListedAt=0;buttons();message('Source list expired. Choose / refresh sources and select your window or monitor again.');
    }
    if((active||starting)&&project!==getProjectId()||receipt&&receipt.context?.projectId!==getProjectId()){
      await stop('Project changed. Choose a source for the new project.');roiProposal=roiSource=roiTrial=null;
      $('screen-roi-status').textContent='Project changed. The previous crop suggestion is invalid.';receipt=pending=null;$('screen-text').value='';$('screen-result-meta').textContent='';$('screen-pending').textContent='';clearClassification();buttons();
    }
    if(!available||$('view-screen').hidden&&!active)return;
    try{const value=await bridge.screenStatus();showMetrics(value.metrics)}catch{}
  },1500);
  globalThis.addEventListener('beforeunload',()=>{clearInterval(timer);clearPreview()});
  buttons();message(available?'Screen reading is off. Choose a window or screen to begin.':'Use the Windows desktop build for local screen OCR.');
  return {stop,clear:async()=>{await stop('Cleared.');roiProposal=roiSource=roiTrial=null;receipt=pending=null;$('screen-text').value='';clearClassification();buttons()},sources};
}
