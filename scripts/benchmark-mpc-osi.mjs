#!/usr/bin/env node
// Synthetic microbench only. Does not measure OCR, packet collection or a real model.
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {buildScreenVirtualOsi,buildNetworkVirtualOsi,createVirtualOsiCache} from '../lib/mpc-osi-virtual.mjs';

const hex=text=>createHash('sha256').update(text).digest('hex');
const cache=createVirtualOsiCache({maxEntries:8,maxBytes:96*1024,ttlMs:15_000});
const frame={project_id:'SYNTHETIC-PROJECT',session_id:'SYNTHETIC-SESSION',source_id:'screen:1:0',
  frame_sha256:hex('original-4096x2160-frame'),text_sha256:hex('noisy-OCR-example'),
  confidence:63,truncated:false,recognized_characters:4096,cue_ids:[],
  change_state:'INITIAL',frame_width:4096,frame_height:2160,cache};
const network={kind:'MPC_NETWORK_ENDPOINT_OBSERVATION',project_id:'SYNTHETIC-PROJECT',
  fingerprint:hex('mock-process-endpoints'),completeness:'COMPLETE_FOR_REPORTED_OS_TABLES',
  counts:{total:10,established:3}};
const sample=[];
for(let i=0;i<300;i++){
  const start=performance.now();
  const next=buildScreenVirtualOsi(frame);
  if(next.method_generation.generated!==9)throw Error('META_GRAPH_BUDGET_REGRESSION');
  sample.push(performance.now()-start);
}
const sorted=[...sample].sort((a,b)=>a-b);
const percentile=q=>Number(sorted[Math.floor((sorted.length-1)*q)].toFixed(4));
const warmSamples=[];
for(let i=0;i<300;i++){
  const start=performance.now();
  const next=buildScreenVirtualOsi(frame);
  if(next.meta_cache!=='HIT')throw Error('META_CACHE_EXPECTED_HIT');
  warmSamples.push(performance.now()-start);
}
const networkModel=buildNetworkVirtualOsi({snapshot:network});
if(networkModel.virtual_layers.length!==7)throw Error('NETWORK_STACK_MISSING');
process.stdout.write(JSON.stringify({
  kind:'MPC_VOSI_SYNTHETIC_MICROBENCH_1',host:process.platform,
  workload:{synthetic_only:true,screen_dimensions:[4096,2160],
    runs:sample.length,warm_runs:warmSamples.length,raw_image_pixels_analyzed:0,
    actual_ocr_invoked:false,actual_network_call:false},
  meta_graph:{generated:9,all_candidate_only:true},
  uncached_ms:{median:percentile(.5),p95:percentile(.95)},
  warm_cache_ms:{median:Number(warmSamples.sort((a,b)=>a-b)[Math.floor(warmSamples.length/2)].toFixed(4))},
  cache:cache.status(),network_meta_layers:networkModel.virtual_layers.length,
  not_an_ocr_speed_claim:true
},null,2)+'\n');
