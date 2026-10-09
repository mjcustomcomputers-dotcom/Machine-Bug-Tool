import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {canonical} from '../lib/universal.mjs';
import {runReasoningSelfplay} from '../lib/reasoning-selfplay.mjs';
import {runLocalReasoningPass} from '../scripts/run-reasoning-selfplay.mjs';

const engine='1'.repeat(64);
test('Finite curriculum executes actual method contracts and preserves independent expected relations',async()=>{
 const result=await runReasoningSelfplay({seed:20261009,rounds:2});
 assert.equal(result.status,'BOUNDED_SELF_CHALLENGES_PASS');
 assert.equal(result.summary.failed,0);
 assert.equal(result.summary.distinct_native_evaluators,11);
 assert.equal(result.summary.catalog_candidates,239);
 assert.equal(result.summary.catalog_methods_promoted,0);
 assert.equal(result.summary.native_evaluator_calls,Object.values(result.summary.native_evaluator_call_counts).reduce((a,b)=>a+b,0));
 assert.equal(result.summary.native_evaluator_calls,result.cases.reduce((a,b)=>a+b.native_evaluator_calls,0));
 assert.equal(result.summary.evaluator_count_complete,true);
 assert.equal(result.summary.direct_finite_invariant_calls,3);
 assert.ok(result.cases.filter(c=>c.anchor_regression).every(c=>!c.new_exploratory_case));
 assert.equal(result.summary.new_exploratory_cases,result.cases.filter(c=>!c.anchor_regression).length);
 const stochastic=result.cases.find(c=>c.family==='stochastic_observation_value'&&c.shape.accuracy===0.75&&c.shape.reward===1);
 assert.equal(stochastic.expected.gross_evsi,0.25);
 assert.equal(stochastic.expected.selected,'accurate');
 assert.equal(stochastic.observed.selected_option,'accurate');
 assert.equal(stochastic.observed.ranked_observations.find(row=>row.observation_id==='coin-flip').gross_evsi,0);
 assert.ok(result.summary.local_adapter_cases>=result.cases.filter(c=>c.family==='stochastic_observation_value').length);
 const real=result.cases.find(c=>c.family==='abstraction_concretization'&&c.shape.real);
 assert.equal(real.observed.status,'REAL_MODEL_COUNTEREXAMPLE');
 assert.deepEqual(real.observed.counterexample.state_path,['S','A','F']);
 assert.ok(result.cases.every(c=>c.oracle));
});

test('Same seed is deterministic; replay deduplicates parameters only with source binding',async()=>{
 const first=await runReasoningSelfplay({seed:731,rounds:2});
 assert.deepEqual(await runReasoningSelfplay({seed:731,rounds:2}),first);
 await assert.rejects(()=>runReasoningSelfplay({seed:731,rounds:2,prior_case_fingerprints:first.seen_case_fingerprints}),/ENGINE_BINDING/);
 const repeat=await runReasoningSelfplay({seed:731,rounds:2,prior_case_fingerprints:first.seen_case_fingerprints,engine_fingerprint:engine,prior_engine_fingerprint:engine});
 assert.equal(repeat.summary.new_exploratory_cases,0);
 assert.ok(repeat.cases.every(c=>c.anchor_regression));
 assert.ok(repeat.summary.duplicates_skipped>0);
 const next=await runReasoningSelfplay({seed:first.next_seed,rounds:2,prior_case_fingerprints:first.seen_case_fingerprints,engine_fingerprint:engine,prior_engine_fingerprint:engine});
 assert.ok(next.summary.new_exploratory_cases>0);
 assert.equal(next.summary.failed,0);
});

test('Budget and malformed history fail without claiming coverage',async()=>{
 for(const input of [{seed:0},{seed:NaN},{seed:2**32},{rounds:0},{rounds:65},{prior_case_fingerprints:['x']},{prior_case_fingerprints:[engine,engine]}])
  await assert.rejects(()=>runReasoningSelfplay(input));
});

test('Local cursor advances only after append-only receipts and exact saved-byte readback',async()=>{
 const root=mkdtempSync(join(tmpdir(),'mpc-reasoning-cursor-'));
 const first=await runLocalReasoningPass({output_root:root,rounds:1});
 const old=readFileSync(join(first.output_directory,'scan.json'));
 const second=await runLocalReasoningPass({output_root:root,rounds:1});
 assert.equal(second.seed,first.next_seed);
 assert.notEqual(second.output_directory,first.output_directory);
 assert.deepEqual(readFileSync(join(first.output_directory,'scan.json')),old);
 const cursor=JSON.parse(readFileSync(join(root,'latest.json'),'utf8'));
 assert.equal(cursor.prior_cursor_sha256,first.cursor_sha256);
 assert.equal(cursor.last_scan_sha256,createHash('sha256').update(readFileSync(join(second.output_directory,'scan.json'))).digest('hex'));
 const latestBefore=readFileSync(join(root,'latest.json'));
 writeFileSync(join(root,'runner.lock'),'another writer',{flag:'wx'});
 await assert.rejects(()=>runLocalReasoningPass({output_root:root,rounds:1}),/WRITER_BUSY/);
 assert.deepEqual(readFileSync(join(root,'latest.json')),latestBefore);
 assert.equal(readFileSync(join(root,'runner.lock'),'utf8'),'another writer');
});

test('Tampered cursor or previous scan cannot skip source-bound work',async()=>{
 const root=mkdtempSync(join(tmpdir(),'mpc-reasoning-tamper-'));
 const first=await runLocalReasoningPass({output_root:root,rounds:1});
 const cursorPath=join(root,'latest.json'),cursor=JSON.parse(readFileSync(cursorPath,'utf8'));
 const bytes=readFileSync(cursorPath);cursor.next_seed++;
 writeFileSync(cursorPath,JSON.stringify(cursor));
 const count=readdirSync(root).length;
 await assert.rejects(()=>runLocalReasoningPass({output_root:root,rounds:1}),/CURSOR_DIGEST_MISMATCH/);
 assert.equal(readdirSync(root).length,count);assert.equal(existsSync(join(root,'runner.lock')),false);
 writeFileSync(cursorPath,bytes);
 writeFileSync(join(first.output_directory,'scan.json'),'{}\n');
 await assert.rejects(()=>runLocalReasoningPass({output_root:root,rounds:1}),/PRIOR_SCAN_READBACK_MISMATCH/);
 assert.equal(existsSync(join(root,'runner.lock')),false);
});

test('Changed engine replays the last seed; a cursor cannot contradict its own prior scan',async()=>{
 const root=mkdtempSync(join(tmpdir(),'mpc-reasoning-revision-'));
 const first=await runLocalReasoningPass({output_root:root,rounds:1});
 const cursorPath=join(root,'latest.json'),cursor=JSON.parse(readFileSync(cursorPath,'utf8'));
 const digest=value=>createHash('sha256').update(typeof value==='string'?value:canonical(value)).digest('hex');
 const sign=c=>{const {cursor_sha256,...body}=c;return {...body,cursor_sha256:digest(body)};};
 cursor.engine_fingerprint='f'.repeat(64);
 writeFileSync(cursorPath,JSON.stringify(sign(cursor)));
 await assert.rejects(()=>runLocalReasoningPass({output_root:root,rounds:1}),/SEMANTIC_MISMATCH/);
 // A coherent old-engine receipt is a synthetic fixture for version change.
 const scanPath=join(first.output_directory,'scan.json'),scan=JSON.parse(readFileSync(scanPath,'utf8'));
 scan.engine_fingerprint=cursor.engine_fingerprint;
 const scanBytes=JSON.stringify(scan);writeFileSync(scanPath,scanBytes);cursor.last_scan_sha256=digest(scanBytes);
 writeFileSync(cursorPath,JSON.stringify(sign(cursor)));
 const next=await runLocalReasoningPass({output_root:root,rounds:1});
 assert.equal(next.seed,first.seed);
 const receipt=JSON.parse(readFileSync(join(next.output_directory,'receipt.json'),'utf8'));
 assert.equal(receipt.source_changed_since_prior,true);assert.equal(receipt.replayed_previous_seed,true);
 assert.ok(next.summary.new_exploratory_cases>0);
});
