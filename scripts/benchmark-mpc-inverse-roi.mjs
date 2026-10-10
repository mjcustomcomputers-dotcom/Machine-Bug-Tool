#!/usr/bin/env node
// Finite local planning benchmark, not an OCR or physical-computer benchmark.
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {proposeInverseOcrCrop,MPC_ROI_PROCESS_VERSION} from '../desktop/renderer/roi-process.js';

const hex=v=>createHash('sha256').update(v).digest('hex');
const line=(i)=>({text:'FAKE_VISIBLE_LINE_'+i+' '+'.'.repeat(24),confidence:94,
  bbox:{x0:1100+(i%6)*110,y0:450+Math.floor(i/6)*130,
    x1:1260+(i%6)*110,y1:488+Math.floor(i/6)*130}});
const receipt={kind:'MPC_SCREEN_OCR_OBSERVATION',trust:'UNTRUSTED_SCREEN_OCR',source_authentication:false,
  frame:{sha256:hex('synthetic-4k'),width:4096,height:2160,
    source_width:4096,source_height:2160,crop_pixels:{x:0,y:0,width:4096,height:2160}},
  context:{projectId:'BENCHMARK',sourceId:'screen:1:0',sessionId:'synthetic-bounded'},
  classification:{source:{text_sha256:hex('ocr')}},
  ocr:{network:'DISABLED',trust:'UNTRUSTED_SCREEN_OCR',
    width:4096,height:2160,confidence:94,truncated:false,
    lines:Array.from({length:24},(_,i)=>line(i))}};
const samples=[];
let proposal;
for(let i=0;i<120;i++){
  const before=performance.now();proposal=proposeInverseOcrCrop(receipt);
  samples.push(performance.now()-before);
  if(proposal.status!=='PROPOSED')throw Error('INVERSE_ROI_TEST_FIXTURE_FAILED');
}
const sorted=samples.toSorted((a,b)=>a-b);
const percentile=q=>Math.round(sorted[Math.floor((sorted.length-1)*q)]*10000)/10000;
process.stdout.write(JSON.stringify({
  kind:'MPC_INVERSE_ROI_SYNTHETIC_BENCH_1',version:MPC_ROI_PROCESS_VERSION,
  source:'SYNTHETIC_TEXT_ATOM_BOXES',device:process.platform,
  repetitions:samples.length,source_pixels:4096*2160,
  proposed_pixel_savings_percent:proposal.projected_pixel_area.saved_percent,
  previously_observed_atom_coverage_percent:proposal.observed_text_atomics.weighted_coverage_percent,
  roi_planner_ms:{median:percentile(.5),p95:percentile(.95)},
  ocr_performed:false,native_capture_performed:false,windows_runtime_measured:false,
  performance_gain_claimed:false,automatic_crop_applied:false
},null,2)+'\n');
