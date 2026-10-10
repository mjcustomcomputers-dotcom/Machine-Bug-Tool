// MPC inverse OCR process: first recognize geometric text atoms; use their
// observed positions to PROPOSE a smaller next capture instead of blindly
// rescanning the entire monitor. Proposal only: no automatic capture or edits.
export const MPC_ROI_PROCESS_VERSION='MPC_INVERSE_ROI_PROCESS_1';
export const MPC_ROI_LIMITS=Object.freeze({
  maxAtoms:128,maxCandidates:280,minCoverage:0.65,minAreaSaved:0.28,
  minAtoms:4,minPixels:1_000_000
});
const fail=code=>{throw Object.assign(new TypeError(code),{code})};
const int=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const finite=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const bound=(value,minimum,maximum)=>Math.max(minimum,Math.min(maximum,value));
function baseReceipt(receipt){
  const frame=receipt?.frame,ocr=receipt?.ocr,context=receipt?.context;
  if(!frame||!ocr||!context||!['UNTRUSTED_SCREEN_OCR'].includes(receipt.trust)||
     ocr.trust!=='UNTRUSTED_SCREEN_OCR'||ocr.network!=='DISABLED'||receipt.source_authentication!==false)
    fail('MPC_ROI_UNTRUSTED_RECEIPT_REQUIRED');
  const width=int(frame.width),height=int(frame.height);
  if(!width||!height||width>8192||height>8192||width*height>16_777_216||
    ocr.width!==width||ocr.height!==height)fail('MPC_ROI_GEOMETRY_INVALID');
  const fullW=int(frame.source_width??width),fullH=int(frame.source_height??height);
  const crop=frame.crop_pixels??{x:0,y:0,width,height};
  if(!fullW||!fullH||!crop||!Number.isSafeInteger(crop.x)||
    !Number.isSafeInteger(crop.y)||crop.x<0||crop.y<0||
    crop.width!==width||crop.height!==height||
    crop.x+width>fullW||crop.y+height>fullH)fail('MPC_ROI_GEOMETRY_INVALID');
  if(typeof frame.sha256!=='string'||!/^[0-9a-f]{64}$/u.test(frame.sha256)||
    !['projectId','sourceId','sessionId'].every(k=>typeof context[k]==='string'&&context[k].length>0))
    fail('MPC_ROI_SOURCE_INVALID');
  const meta=receipt.classification?.source;
  return {frame,ocr,context,width,height,fullW,fullH,crop,
    textDigest:typeof meta?.text_sha256==='string'&&/^[0-9a-f]{64}$/u.test(meta.text_sha256)
      ?meta.text_sha256:null};
}
const atomBox=(box,w,h)=>{
  if(!box||![box.x0,box.y0,box.x1,box.y1].every(v=>finite(v)!==null)||
     box.x0<0||box.y0<0||box.x1<=box.x0||box.y1<=box.y0||
     box.x1>w||box.y1>h)return null;
  return {x:box.x0,y:box.y0,right:box.x1,bottom:box.y1};
};
function atomsFromOcr(ocr,w,h){
  // Geometry has already passed through the OCR normalizer. Re-check before
  // trusting it as a proposal: no source text or exact recognized words leave.
  const lines=Array.isArray(ocr.lines)?ocr.lines:[];
  const words=Array.isArray(ocr.words)?ocr.words:[];
  const records=lines.length?lines:words;
  const recordsLength=records.length;
  const atoms=[];
  for(const item of records.slice(0,MPC_ROI_LIMITS.maxAtoms)){
    const box=atomBox(item?.bbox,w,h),n=typeof item?.text==='string'?item.text.trim().length:0;
    const confidence=item?.confidence===null||item?.confidence===undefined?null:finite(item.confidence);
    if(!box||n<3||n>16384||(confidence!==null&&(confidence<20||confidence>100)))continue;
    const weight=bound(n,3,120)*(confidence===null?0.7:bound(confidence/100,0.25,1));
    atoms.push({...box,weight});
  }
  return {atoms,totalVisibleRecords:recordsLength,partial:recordsLength>MPC_ROI_LIMITS.maxAtoms,
    kind:lines.length?'LINE_BOX':'WORD_BOX'};
}
function geometryPct(box,base){
  const {fullW,fullH,crop}=base;
  const left=bound(Math.floor((crop.x+box.x)/fullW*100),0,99);
  const top=bound(Math.floor((crop.y+box.y)/fullH*100),0,99);
  const right=bound(Math.ceil((crop.x+box.right)/fullW*100),left+1,100);
  const bottom=bound(Math.ceil((crop.y+box.bottom)/fullH*100),top+1,100);
  const percent={left,top,width:right-left,height:bottom-top};
  // Return the actual native pixel envelope after outward percentage
  // quantization. This is the region that the existing screenSettings accepts.
  const native={x:Math.floor(left/100*fullW),y:Math.floor(top/100*fullH),
    right:Math.min(fullW,Math.ceil(right/100*fullW)),
    bottom:Math.min(fullH,Math.ceil(bottom/100*fullH))};
  const relative={x:native.x-crop.x,y:native.y-crop.y,
    right:native.right-crop.x,bottom:native.bottom-crop.y};
  const area=(native.right-native.x)*(native.bottom-native.y);
  return {percent,native,relative,area,relative_area:area/(base.width*base.height)};
}
function score(atoms,box){
  const contained=atoms.filter(a=>a.x>=box.x&&a.y>=box.y&&a.right<=box.right&&a.bottom<=box.bottom);
  const selectedWeight=contained.reduce((sum,a)=>sum+a.weight,0);
  const totalWeight=atoms.reduce((sum,a)=>sum+a.weight,0);
  return {contained:contained.length,excluded:atoms.length-contained.length,
    coverage:totalWeight?selectedWeight/totalWeight:0};
}
function proposalState(kind,base,atoms,reason){
  return Object.freeze({kind:'MPC_ROI_PROCESS_PROPOSAL',version:MPC_ROI_PROCESS_VERSION,status:kind,
    reason,source:{project_id:base.context.projectId,source_id:base.context.sourceId,
      session_id:base.context.sessionId,frame_sha256:base.frame.sha256,text_sha256:base.textDigest},
    methods:['ATOMIZE_WORD_GEOMETRY','INVERT_FULL_FRAME_SEARCH','COMPARE_WITH_NO_CROP','SOURCE_REGION_AUDIT'],
    eligible_atoms:atoms.length,proposed_region:null,manual_application_required:true,
    source_authentication:false,original_classifier_unchanged:true,automatic_capture:false});
}
/** Deterministic inverse-ROI routing. This does not assume small crops improve
 * accuracy or latency: pixel fraction and atom coverage are *projections*. */
export function proposeInverseOcrCrop(receipt){
  const base=baseReceipt(receipt),observed=atomsFromOcr(base.ocr,base.width,base.height);
  const {atoms}=observed;
  if(base.width*base.height<MPC_ROI_LIMITS.minPixels)
    return proposalState('NO_GAIN',base,atoms,'Already a small native crop; measuring a smaller region is unlikely to help enough.');
  if(base.ocr.truncated===true||observed.partial)
    return proposalState('BOUNDED_COVERAGE',base,atoms,'OCR geometry was truncated. Review the original source before proposing an omitted region.');
  if(typeof base.ocr.confidence==='number'&&base.ocr.confidence<45)
    return proposalState('LOW_CONFIDENCE',base,atoms,'OCR confidence is very low; compare native pixels/contrast before relying on word positions.');
  if(atoms.length<MPC_ROI_LIMITS.minAtoms)
    return proposalState('INSUFFICIENT_GEOMETRY',base,atoms,'Too few valid text boxes; choose a source window or set the native crop manually.');
  const pad=32,boxFrom=(x,y,w,h)=>({
    x:bound(x,0,base.width-w),y:bound(y,0,base.height-h),
    right:bound(x,0,base.width-w)+w,bottom:bound(y,0,base.height-h)+h
  });
  const candidates=[],seen=new Set();
  const add=(candidate,operator)=>{
    if(candidates.length>=MPC_ROI_LIMITS.maxCandidates)return;
    const quant=geometryPct(candidate,base);
    const key=JSON.stringify(quant.percent);if(seen.has(key))return;seen.add(key);
    if(quant.relative_area>1-MPC_ROI_LIMITS.minAreaSaved) return;
    const retain=score(atoms,quant.relative);
    if(retain.coverage<MPC_ROI_LIMITS.minCoverage||retain.contained<MPC_ROI_LIMITS.minAtoms)return;
    const scoreValue=retain.coverage*retain.coverage/Math.pow(quant.relative_area,0.82);
    candidates.push({quant,retain,operator,scoreValue});
  };
  const left=Math.max(0,Math.floor(Math.min(...atoms.map(a=>a.x))-pad));
  const top=Math.max(0,Math.floor(Math.min(...atoms.map(a=>a.y))-pad));
  const right=Math.min(base.width,Math.ceil(Math.max(...atoms.map(a=>a.right))+pad));
  const bottom=Math.min(base.height,Math.ceil(Math.max(...atoms.map(a=>a.bottom))+pad));
  if(right>left&&bottom>top)add({x:left,y:top,right,bottom},'FULL_ATOM_ENVELOPE');
  for(const wPart of [0.5,0.65,0.8]){
    for(const hPart of [0.45,0.65,0.8]){
      const w=Math.max(160,Math.ceil(base.width*wPart)),h=Math.max(96,Math.ceil(base.height*hPart));
      for(const sx of [0,0.25,0.5,0.75,1])for(const sy of [0,0.25,0.5,0.75,1]){
        const x=Math.floor((base.width-w)*sx),y=Math.floor((base.height-h)*sy);
        add(boxFrom(x,y,w,h),'INVERT_DENSE_ATOM_SEARCH');
      }
    }
  }
  candidates.sort((a,b)=>b.scoreValue-a.scoreValue||
    b.retain.coverage-a.retain.coverage||a.quant.relative_area-b.quant.relative_area||
    a.quant.percent.top-b.quant.percent.top||a.quant.percent.left-b.quant.percent.left);
  const best=candidates[0];
  if(!best)return proposalState('NO_GAIN',base,atoms,
    'Text is too dispersed for a high-coverage native crop within the configured omission budget.');
  const coveragePct=Math.round(best.retain.coverage*1000)/10;
  const savedPct=Math.round((1-best.quant.relative_area)*1000)/10;
  return Object.freeze({
    kind:'MPC_ROI_PROCESS_PROPOSAL',version:MPC_ROI_PROCESS_VERSION,status:'PROPOSED',
    source:{project_id:base.context.projectId,source_id:base.context.sourceId,
      session_id:base.context.sessionId,frame_sha256:base.frame.sha256,text_sha256:base.textDigest},
    observed_geometry:observed.kind,eligible_atoms:atoms.length,
    methods:['ATOMIZE_WORD_GEOMETRY',best.operator,'INVERT_FULL_FRAME_SEARCH','COMPARE_WITH_NO_CROP','SOURCE_REGION_AUDIT'],
    proposed_region:best.quant.percent,
    observed_text_atomics:{retained:best.retain.contained,omitted:best.retain.excluded,
      weighted_coverage_percent:coveragePct},
    projected_pixel_area:{baseline:base.width*base.height,candidate:best.quant.area,
      saved_percent:savedPct},
    crop_source_pixel_bounds:{x:best.quant.native.x,y:best.quant.native.y,
      width:best.quant.native.right-best.quant.native.x,
      height:best.quant.native.bottom-best.quant.native.y},
    uncertainty:['OTHER_CONTENT_MAY_BE_OUTSIDE_REGION','OCR_GEOMETRY_IS_NOT_GROUND_TRUTH',
      'PIXEL_AREA_SAVINGS_ARE_NOT_OCR_TIME_SAVINGS','PREVIOUS_MASKS_MUST_REMAIN_APPLIED'],
    manual_application_required:true,source_authentication:false,original_classifier_unchanged:true,
    automatic_capture:false,observed_performance_speedup:false
  });
}
