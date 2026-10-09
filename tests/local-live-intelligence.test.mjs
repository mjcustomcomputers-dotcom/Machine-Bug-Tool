import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runLocalLiveIntelligence} from '../lib/local-live-intelligence.mjs';
import {evaluateMethod} from '../lib/methods.mjs';
const corpus = JSON.parse(readFileSync(new URL('../data/local-live-native-cases.v1.json', import.meta.url)));
const one = id => structuredClone(corpus.cases.find(c => c.case_id === id));
const ordinary = () => one('conservation_exact_tolerance_boundary');
async function observation(item) {
  let response;
  try {const receipt = await evaluateMethod(item); response = {isError: false, structuredContent: receipt, content: [{type: 'text', text: JSON.stringify(receipt)}]};}
  catch (e) {response = {isError: true, content: [{type: 'text', text: e.message}], structuredContent: {error_code: 'INVALID_ARGUMENT'}};}
  return {case_id: item.case_id, method: item.method, input: structuredClone(item.input), response, observed_at_utc: '2026-10-09 14:47:49 UTC'};
}
test('same observed result and numerical oracle agreement are separate checks', async () => {
  const c = ordinary(), o = await observation(c), result = await runLocalLiveIntelligence({cases: [c], live_observations: [o]});
  assert.equal(result.results[0].classification, 'SAME_RESULT');
  assert.equal(result.results[0].local_review.numerical_review.comparison.classification, 'EXACT_AGREEMENT');
  assert.equal(result.live_network_calls, 0); assert.equal(result.live_origin_authenticated, false);
});
test('two agreeing wrong receipts remain a shared exact-oracle counterexample', async () => {
  const c = one('numerical_conservation_zero_tolerance'), result = await runLocalLiveIntelligence({cases: [c], live_observations: [await observation(c)]});
  assert.equal(result.results[0].classification, 'SHARED_ORACLE_COUNTEREXAMPLE');
  assert.equal(result.results[0].local_review.numerical_review.comparison.classification, 'NATIVE_TOLERANCE_FALSE_PASS');
  assert.equal(result.results[0].raw_live.receipt.result.within_supplied_tolerance, true);
});
test('missing live observation remains explicit while local work executes', async () => {
  const r = await runLocalLiveIntelligence({cases: [ordinary()]});
  assert.equal(r.results[0].classification, 'MISSING_LIVE_OBSERVATION'); assert.equal(r.summary.local_evaluator_calls, 1);
});
test('identical expected semantic errors compare without invented error fingerprints', async () => {
  const c = one('coin_release_before_deposit'), r = await runLocalLiveIntelligence({cases: [c], live_observations: [await observation(c)]});
  assert.equal(r.results[0].classification, 'SAME_RESULT'); assert.equal(r.results[0].raw_live.error.message, 'OUTFLOW_EXCEEDS_PENDING');
  assert.deepEqual(r.results[0].live_transport_error_metadata, {error_code: 'INVALID_ARGUMENT'});
});
test('an error cannot carry a contradictory structured success receipt', async () => {
  const c = one('coin_release_before_deposit'), o = await observation(c);
  o.response.structuredContent = {status: 'BOUNDED_MODEL_RESULT', result: {claimed: true}};
  await assert.rejects(runLocalLiveIntelligence({cases: [c], live_observations: [o]}), /UNAMBIGUOUS_LIVE_ERROR_REQUIRED/);
});
test('changed input, method, fingerprint or schema binding is refused', async () => {
  const c = ordinary(), o = await observation(c);
  for (const mutate of [x => {x.input.opening++;}, x => {x.method = 'harsanyi';},
    x => {x.response.structuredContent.model_fingerprint = '0'.repeat(64); x.response.content = [];},
    x => {x.input_schema_sha256 = '0'.repeat(64);}]) {
    const altered = structuredClone(o); mutate(altered);
    await assert.rejects(runLocalLiveIntelligence({cases: [c], live_observations: [altered]}), /MISMATCH/);
  }
  const badCase = structuredClone(c); badCase.input_sha256 = '0'.repeat(64);
  await assert.rejects(runLocalLiveIntelligence({cases: [badCase]}), /CASE_INPUT_HASH_MISMATCH/);
});
test('duplicate, unknown and schema-drift cases cannot be silently omitted', async () => {
  const c = ordinary(), o = await observation(c);
  await assert.rejects(runLocalLiveIntelligence({cases: [c, c]}), /DUPLICATE_CASE/);
  await assert.rejects(runLocalLiveIntelligence({cases: [c], live_observations: [o, o]}), /DUPLICATE_LIVE/);
  await assert.rejects(runLocalLiveIntelligence({cases: [c], live_observations: [{...o, case_id: 'unknown'}]}), /UNKNOWN_LIVE/);
  c.input_schema_sha256 = '0'.repeat(64); await assert.rejects(runLocalLiveIntelligence({cases: [c]}), /CASE_SCHEMA_HASH_MISMATCH/);
});
test('conflicting structured and text receipts are refused', async () => {
  const c = ordinary(), o = await observation(c); o.response.structuredContent.result.residual = 999;
  await assert.rejects(runLocalLiveIntelligence({cases: [c], live_observations: [o]}), /CONFLICTING_LIVE/);
});
test('same model bound to a different result is a version divergence', async () => {
  const c = ordinary(), o = await observation(c); o.response.structuredContent.result.residual = 0;
  o.response.content[0].text = JSON.stringify(o.response.structuredContent);
  const r = await runLocalLiveIntelligence({cases: [c], live_observations: [o]});
  assert.equal(r.results[0].classification, 'VERSION_DIVERGENCE'); assert.equal(r.results[0].canonical_outputs_equal, false);
});
test('observation timestamp and object insertion order do not manufacture result divergence', async () => {
  const c = ordinary(), o = await observation(c), original = JSON.stringify(c);
  const a = await runLocalLiveIntelligence({cases: [c], live_observations: [o]});
  o.observed_at_utc = '2026-10-10T00:00:00.000Z'; o.input = Object.fromEntries(Object.entries(o.input).reverse());
  const b = await runLocalLiveIntelligence({cases: [c], live_observations: [o]});
  assert.equal(a.comparison_fingerprint, b.comparison_fingerprint); assert.equal(JSON.stringify(c), original);
});
test('sparse arrays, getters and untyped assertions reject before executing', async () => {
  const c = ordinary(); c.expectation.assertions = [{path: '/result/residual', op: 'EXECUTE', value: 0}];
  await assert.rejects(runLocalLiveIntelligence({cases: [c]}), /TYPED_EQUALS/);
  await assert.rejects(runLocalLiveIntelligence({cases: Array(1)}), /DENSE_ARRAY/);
  const request = {}; Object.defineProperty(request, 'cases', {enumerable: true, get() {throw Error('SHOULD_NOT_RUN');}});
  await assert.rejects(runLocalLiveIntelligence(request), /DATA_PROPERTIES/);
});
test('bundled corpus remains portable and covers all24 retained evaluators', () => {
  assert.equal(corpus.cases.length, 48); assert.equal(new Set(corpus.cases.map(c => c.method)).size, 24);
  assert.equal(JSON.stringify(corpus).includes('/workspace/'), false);
});
test('CLI preserves an existing output without running or overwriting it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mpc-local-live-'));
  try {const output = join(directory, 'keep.json'); writeFileSync(output, 'preserve');
    const run = spawnSync(process.execPath, [resolve('scripts/run-local-live-intelligence.mjs'), '--output', output], {encoding: 'utf8'});
    assert.equal(run.status, 1); assert.match(run.stderr, /NEW_OUTPUT_PATH_REQUIRED/); assert.equal(readFileSync(output, 'utf8'), 'preserve');
  } finally {rmSync(directory, {recursive: true});}
});
