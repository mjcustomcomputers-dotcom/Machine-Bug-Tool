// Offline, file-backed V8 consideration/cache benchmark. No target traffic.
// The first write is one measured sample; p50/p95 describe exact cached repeats.
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {loadMethodAtlas,runAtomicVariationReview} from './method-atlas-cli.mjs';

const runs=Number(process.env.MPC_VARIATION_BENCH_RUNS??200);
if(!Number.isInteger(runs)||runs<10||runs>2000)throw Error('BENCHMARK_RUNS_MUST_BE_10_TO_2000');
const directory=mkdtempSync(join(tmpdir(),'mpc-v8-variation-benchmark-'));
const path=join(directory,'synthetic-cache.sqlite');
const query={atoms:[{
 id:'benchmark-atom',subject_id:'synthetic:benchmark-subject',
 dimensions:['TIME','INTERFACE','DIAGNOSTIC'],
 source_refs:['synthetic:primary'],external_source_refs:['synthetic:comparison'],
 evidence_digest:'a'.repeat(64)
}]};
const rounded=n=>Number(n.toFixed(4));
let db;
try{
 const start=performance.now();
 db=new DatabaseSync(path);
 const inventory=loadMethodAtlas(db);
 const initializationMs=performance.now()-start;
 const expected=inventory.methods*4;
 const check=(receipt,cached)=>{
  if(receipt.complete_consideration!==true||receipt.slots_considered!==expected||
    receipt.expected_slots!==expected||receipt.ledger_new_or_changed!==(cached?0:expected)||
    (cached&&receipt.decision_counts.CACHED_NO_MATERIAL_DELTA!==expected)||
    receipt.stored_record_count!==expected||receipt.ledger_saved_to_derived_local_cache!==true||
    receipt.source_authentication!==false||receipt.actual_method_execution!==false||
    receipt.external_network_actions!==false||receipt.variation_executed!==false||
    receipt.canonical_promotion!==false)throw Error('VARIATION_BENCHMARK_BOUNDARY_VIOLATED');
 };
 const firstStart=performance.now();
 const first=runAtomicVariationReview(db,query);
 const firstMs=performance.now()-firstStart;
 check(first,false);
 db.close();db=undefined;
 db=new DatabaseSync(path);
 loadMethodAtlas(db);
 check(runAtomicVariationReview(db,query),true);
 for(let i=0;i<10;i++)check(runAtomicVariationReview(db,query),true);
 const sample=[];
 for(let i=0;i<runs;i++){
  const t=performance.now();
  const receipt=runAtomicVariationReview(db,query);
  sample.push(performance.now()-t);
  check(receipt,true);
 }
 sample.sort((a,b)=>a-b);
 const percentile=p=>rounded(sample[Math.min(sample.length-1,Math.floor((sample.length-1)*p))]);
 console.log(JSON.stringify({
  kind:'OFFLINE_SYNTHETIC_V8_PERSISTENT_CACHE_BENCHMARK',
  node:process.version,platform:process.platform,architecture:process.arch,
  execution_scope:'CURRENT_NODE_HOST_NOT_A_CODEX_CLOUD_OR_DAYBREAK_ATTESTATION',
  database:'NODE_SQLITE_TEMPORARY_FILE',methods:inventory.methods,
  atoms_per_query:query.atoms.length,slots_per_query:expected,
  initialization_ms:rounded(initializationMs),first_consideration_ms:rounded(firstMs),
  first_consideration_samples:1,first_rows_written:first.ledger_new_or_changed,
  reopened_database_cache_verified:true,warmup_runs:10,runs,
  cached_ms:{p50:percentile(.5),p95:percentile(.95),max:percentile(1)},
  cached_rows_written:0,retained_rows:expected,
  no_network_actions:true,no_method_execution:true,source_authentication:false,
  disclaimer:'Synthetic planning/cache latency on this host. Cached percentiles include the validated persistence path; exclude process startup and initial atlas seeding. Not target traffic, a Cloud model-selection receipt, an SLA, or physical hardware acceleration.'
 },null,2));
}finally{
 db?.close();
 rmSync(directory,{recursive:true,force:true});
}
