import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MPC_ROI_LIMITS,proposeInverseOcrCrop} from '../desktop/renderer/roi-process.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const line=(x0,y0,x1,y1,n=55,confidence=92)=>({
  bbox:{x0,y0,x1,y1},text:'A'.repeat(n),confidence
});
function fixture({width=4096,height=2160,sourceWidth=width,sourceHeight=height,
  cropX=0,cropY=0,lines=null,confidence=92,truncated=false,
  projectId='PROJECT-A',sourceId='screen:4:0',sessionId='c10301fa-f628-4f2f-8732-754557e2d68d'}={}){
  const rows=lines??Array.from({length:24},(_,i)=>
    line(1200+(i%4)*165,520+Math.floor(i/4)*130,1310+(i%4)*165,547+Math.floor(i/4)*130));
  return {
    kind:'MPC_SCREEN_OCR_OBSERVATION',trust:'UNTRUSTED_SCREEN_OCR',source_authentication:false,
    frame:{sha256:hash('SYNTHETIC-CAPTURE'),width,height,source_width:sourceWidth,source_height:sourceHeight,
      crop_pixels:{x:cropX,y:cropY,width,height}},
    context:{projectId,sourceId,sessionId,crop:{x:cropX/sourceWidth,y:cropY/sourceHeight,
      width:width/sourceWidth,height:height/sourceHeight},masks:[{x:0.22,y:0.17,width:0.1,height:0.1}]},
    ocr:{width,height,trust:'UNTRUSTED_SCREEN_OCR',network:'DISABLED',confidence,truncated,lines:rows},
    classification:{source:{text_sha256:hash('SYNTHETIC-OCR-TEXT')}}
  };
}
test('inverse text-geometry proposal retains source-bound method names without capturing again',()=>{
  const source=fixture(),original=structuredClone(source);
  const result=proposeInverseOcrCrop(source);
  assert.equal(result.kind,'MPC_ROI_PROCESS_PROPOSAL');
  assert.equal(result.status,'PROPOSED');
  assert.equal(result.original_classifier_unchanged,true);
  assert.equal(result.automatic_capture,false);
  assert.equal(result.manual_application_required,true);
  assert.equal(result.source.session_id,source.context.sessionId);
  assert.equal(result.source.frame_sha256,source.frame.sha256);
  assert.equal(result.methods.includes('INVERT_FULL_FRAME_SEARCH'),true);
  assert.ok(result.projected_pixel_area.saved_percent>=28);
  assert.ok(result.observed_text_atomics.weighted_coverage_percent>=65);
  assert.equal(result.observed_text_atomics.omitted+result.observed_text_atomics.retained,
    result.eligible_atoms);
  assert.deepEqual(source,original,'proposing a region must not mutate the original OCR or privacy masks');
  assert.equal(JSON.stringify(result).includes('AAAAAAAA'),false,'never return recognized text');
  assert.equal(Object.isFrozen(result),true);
  assert.ok(result.proposed_region.left>=0&&result.proposed_region.left+result.proposed_region.width<=100);
  assert.ok(result.proposed_region.top>=0&&result.proposed_region.top+result.proposed_region.height<=100);
});
test('candidate percentages map from OCR crop coordinates to original monitor coordinates',()=>{
  const source=fixture({width:2048,height:1080,sourceWidth:4096,sourceHeight:2160,
    cropX:1024,cropY:540,lines:Array.from({length:16},(_,i)=>
      line(470+(i%4)*100,190+Math.floor(i/4)*100,570+(i%4)*100,215+Math.floor(i/4)*100))});
  const r=proposeInverseOcrCrop(source);
  assert.equal(r.status,'PROPOSED');
  const p=r.proposed_region;
  assert.ok(p.left>=24&&p.top>=24,'crop origin must not reset to full-screen zero');
  assert.ok(p.left+p.width<=77&&p.top+p.height<=77);
  assert.ok(r.crop_source_pixel_bounds.x>1024&&r.crop_source_pixel_bounds.y>540);
});
test('dispersed text, undersized inputs and poor OCR reject risky inverse crop claims',()=>{
  const spread=fixture({lines:[
    line(40,40,200,70),line(3820,40,4000,70),
    line(40,2050,200,2090),line(3820,2050,4000,2090)]});
  const d=proposeInverseOcrCrop(spread);
  assert.equal(d.status,'NO_GAIN');
  assert.equal(d.proposed_region,null);
  const small=proposeInverseOcrCrop(fixture({width:640,height:440,lines:Array.from({length:12},(_,i)=>
    line(50,40+i*24,130,57+i*24))}));
  assert.equal(small.status,'NO_GAIN');
  const low=proposeInverseOcrCrop(fixture({confidence:28}));
  assert.equal(low.status,'LOW_CONFIDENCE');
  assert.equal(low.manual_application_required,true);
  const trunc=proposeInverseOcrCrop(fixture({truncated:true}));
  assert.equal(trunc.status,'BOUNDED_COVERAGE');
  assert.ok(MPC_ROI_LIMITS.maxCandidates<=300);
});
test('source, geometry, network and typed-array trust boundaries fail closed',()=>{
  for(const mutate of [
    r=>{r.trust='AUTHENTICATED';},r=>{r.ocr.network='ALLOWED';},
    r=>{r.source_authentication=true;},r=>{r.frame.source_width=400;},
    r=>{r.frame.crop_pixels.x=-1;},r=>{r.ocr.width=64;},
    r=>{r.frame.sha256='not-a-digest';},r=>{r.context.sourceId='';}
  ]){
    const r=fixture();mutate(r);
    assert.throws(()=>proposeInverseOcrCrop(r),/MPC_ROI_/u);
  }
  const unsafe=fixture({lines:[line(-2,0,100,20),line(10,10,9,30)]});
  assert.equal(proposeInverseOcrCrop(unsafe).status,'INSUFFICIENT_GEOMETRY');
});
test('100+ line atoms and user privacy masks retain strict bounded coverage and no automatic changes',()=>{
  const input=fixture({lines:Array.from({length:140},(_,i)=>
    line(1100+(i%12)*50,500+Math.floor(i/12)*35,1150+(i%12)*50,526+Math.floor(i/12)*35))});
  const before=JSON.stringify(input.context.masks);
  const r=proposeInverseOcrCrop(input);
  assert.equal(r.status,'BOUNDED_COVERAGE');
  assert.equal(r.proposed_region,null);
  assert.equal(JSON.stringify(input.context.masks),before);
});
