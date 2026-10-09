import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('Synthetic benchmark completes against the actual detector receipt boundary',()=>{
 const script=fileURLToPath(new URL('../scripts/benchmark-atomic-method-detector.mjs',import.meta.url));
 const output=execFileSync(process.execPath,[script],{
  env:{...process.env,MPC_ATLAS_BENCH_RUNS:'10'},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000
 });
 const r=JSON.parse(output);
 assert.equal(r.kind,'OFFLINE_SYNTHETIC_ATLAS_QUERY_BENCHMARK');
 assert.equal(r.database,'NODE_SQLITE_IN_MEMORY');
 assert.equal(r.runs,10);
 assert.equal(r.warmup_runs,10);
 assert.equal(r.atoms_per_query,3);
 assert.ok(Number.isFinite(r.ms.p50)&&r.ms.p50>=0);
 assert.ok(Number.isFinite(r.ms.p95)&&r.ms.p95>=r.ms.p50);
 assert.equal(r.no_network_actions,true);
 assert.equal(r.no_method_execution,true);
 assert.equal(r.source_authentication,false);
});

test('V8 benchmark verifies a file-backed 956-slot cache across database reopen',()=>{
 const script=fileURLToPath(new URL('../scripts/benchmark-atomic-variation-router.mjs',import.meta.url));
 const output=execFileSync(process.execPath,[script],{
  env:{...process.env,MPC_VARIATION_BENCH_RUNS:'10'},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000
 });
 const r=JSON.parse(output);
 assert.equal(r.kind,'OFFLINE_SYNTHETIC_V8_PERSISTENT_CACHE_BENCHMARK');
 assert.equal(r.database,'NODE_SQLITE_TEMPORARY_FILE');
 assert.equal(r.methods,239);
 assert.equal(r.slots_per_query,956);
 assert.equal(r.first_rows_written,956);
 assert.equal(r.cached_rows_written,0);
 assert.equal(r.retained_rows,956);
 assert.equal(r.reopened_database_cache_verified,true);
 assert.equal(r.runs,10);
 assert.equal(r.warmup_runs,10);
 assert.ok(Number.isFinite(r.cached_ms.p50)&&r.cached_ms.p50>=0);
 assert.ok(Number.isFinite(r.cached_ms.p95)&&r.cached_ms.p95>=r.cached_ms.p50);
 assert.equal(r.no_network_actions,true);
 assert.equal(r.no_method_execution,true);
 assert.equal(r.source_authentication,false);
});
