// Offline microbenchmark, not an external-target test or performance guarantee.
// Run from repo: node scripts/benchmark-atomic-method-detector.mjs
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {loadMethodAtlas,dbAdapter} from './method-atlas-cli.mjs';
import {detectMethodAtoms} from '../lib/atomic-method-detector.mjs';
const runs=Number(process.env.MPC_ATLAS_BENCH_RUNS??200);
if(!Number.isInteger(runs)||runs<10||runs>2000)throw Error('BENCHMARK_RUNS_MUST_BE_10_TO_2000');
const db=new DatabaseSync(':memory:');
try{
 const inventory=loadMethodAtlas(db);
 const q={domain_profile:'BUSINESS',max_candidates:8,atoms:[
  {id:'meter',subject_id:'owned-fixture:transaction',coordinate:'MONEY/INCENTIVE',source_refs:['owned-fixture:ledger'],epistemic_state:'SYNTHETIC',depends_on:[]},
  {id:'finality',subject_id:'owned-fixture:transaction',coordinate:'FINALITY/CAUSATION',source_refs:['owned-fixture:ledger'],epistemic_state:'SYNTHETIC',depends_on:['meter']},
  {id:'timestamp',subject_id:'owned-fixture:transaction',coordinate:'TIME',source_refs:['owned-fixture:clock'],epistemic_state:'SYNTHETIC',depends_on:['finality']}
 ]};
 const adapter=dbAdapter(db);
 for(let i=0;i<10;i++)await detectMethodAtoms(adapter,q);
 const sample=[];
 for(let i=0;i<runs;i++){
  const t=performance.now();
  const receipt=await detectMethodAtoms(adapter,q);
  sample.push(performance.now()-t);
  if(receipt.automatic_execution!==false||receipt.evidence_completeness?.source_authentication!==false||
    receipt.method_route?.source_authentication!==false||receipt.method_route?.no_method_executed!==true||
    receipt.explicit_supplied_goal_graph_computed!==false||receipt.target_traffic!==false||
    receipt.canonical_promotion!==false||receipt.external_action_authorized!==false)throw Error('BENCHMARK_BOUNDARY_VIOLATED');
 }
 sample.sort((a,b)=>a-b);
 const percentile=p=>Number(sample[Math.min(sample.length-1,Math.floor((sample.length-1)*p))].toFixed(4));
 console.log(JSON.stringify({
  kind:'OFFLINE_SYNTHETIC_ATLAS_QUERY_BENCHMARK',
  node:process.version,methods:inventory.methods,classifiers:inventory.classifiers,linked_methods:inventory.method_relations,
  database:'NODE_SQLITE_IN_MEMORY',warmup_runs:10,atoms_per_query:q.atoms.length,
  runs,ms:{p50:percentile(.5),p95:percentile(.95),max:percentile(1)},
  no_network_actions:true,no_method_execution:true,source_authentication:false,
  disclaimer:'Not an independently replicated throughput comparison, latency SLA, hardware speedup, or live-bounty performance claim.'
 },null,2));
}finally{db.close()}
