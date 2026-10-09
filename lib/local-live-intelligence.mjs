import {evaluateMethod, getMethodCatalog} from './methods.mjs';
import {canonical, digest} from './universal.mjs';
import {verifyNativeNumericalReceipt, exactNativeNumericalReviewContract} from './exact-native-numerical-review.mjs';

export const localLiveIntelligenceContract = Object.freeze({version: 'MPC_LOCAL_LIVE_INTELLIGENCE_V16_1',
  max_cases: 64, max_observations: 64, comparison: 'IDENTICAL_JSON_INPUT_AND_CANONICAL_NATIVE_RECEIPT',
  classifications: ['SAME_RESULT', 'SHARED_ORACLE_COUNTEREXAMPLE', 'VERSION_DIVERGENCE', 'MISSING_LIVE_OBSERVATION'],
  live_execution: 'EXTERNALLY_SUPPLIED_RECORDED_OBSERVATIONS_ONLY', network_dispatch: false,
  origin_authenticated: false, general_correctness_proven: false});
const fail = message => {throw Error(message);};
const same = (a, b) => canonical(a) === canonical(b);
const hashPattern = /^[a-f0-9]{64}$/u;
function snapshot(value, depth = 0, budget = {nodes: 200000, characters: 8000000}) {
  if (++depth > 40 || --budget.nodes < 0) fail('COMPARISON_JSON_BOUNDS');
  if (typeof value === 'string') {if ((budget.characters -= value.length) < 0) fail('COMPARISON_JSON_BOUNDS'); return value;}
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {if (!Number.isFinite(value)) fail('COMPARISON_FINITE_JSON_REQUIRED'); return value;}
  if (!value || typeof value !== 'object') fail('COMPARISON_JSON_REQUIRED');
  const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
  if (array ? proto !== Array.prototype : ![Object.prototype, null].includes(proto)) fail('COMPARISON_PLAIN_JSON_REQUIRED');
  const descriptors = Object.getOwnPropertyDescriptors(value), result = array ? [] : {};
  if (array && value.length > 4096) fail('COMPARISON_JSON_BOUNDS');
  for (const key of Reflect.ownKeys(descriptors)) {
    if (array && key === 'length') continue;
    const property = descriptors[key];
    if (typeof key !== 'string' || !property.enumerable || !Object.hasOwn(property, 'value') ||
      (array && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length))) fail('COMPARISON_DATA_PROPERTIES_REQUIRED');
    Object.defineProperty(result, key, {value: snapshot(property.value, depth, budget), enumerable: true, writable: true, configurable: true});
  }
  if (array && (result.length !== value.length || Object.keys(result).length !== value.length)) fail('COMPARISON_DENSE_ARRAY_REQUIRED');
  return result;
}
function object(value, name) {if (!value || typeof value !== 'object' || Array.isArray(value)) fail(name + '_OBJECT_REQUIRED');}
function text(value, name) {if (typeof value !== 'string' || !value.length || value.length > 1000) fail(name + '_STRING_REQUIRED');}
function hash(value, name) {if (typeof value !== 'string' || !hashPattern.test(value)) fail(name + '_SHA256_REQUIRED');}
function assertions(value = []) {
  if (!Array.isArray(value) || value.length > 128) fail('BOUNDED_ASSERTIONS_REQUIRED');
  for (const a of value) {
    object(a, 'ASSERTION');
    if (Object.keys(a).sort().join(',') !== 'op,path,value' || a.op !== 'EQUALS' ||
      typeof a.path !== 'string' || !a.path.startsWith('/') || a.path.length > 2000 || /~(?![01])/u.test(a.path)) fail('TYPED_EQUALS_ASSERTION_REQUIRED');
  }
  return value;
}
function assertionResults(receipt, list) {
  return list.map(a => {
    let actual = receipt, found = true;
    for (const encoded of a.path.slice(1).split('/')) {
      const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
      if (actual === null || typeof actual !== 'object' || !Object.hasOwn(actual, key)) {found = false; break;}
      actual = actual[key];
    }
    return {...a, actual: found ? actual : {missing_path: true}, pass: found && same(actual, a.value)};
  });
}
function parseResponse(response) {
  object(response, 'LIVE_RESPONSE');
  if (response.isError !== undefined && typeof response.isError !== 'boolean') fail('LIVE_ERROR_FLAG_INVALID');
  if (response.isError === true) {
    const metadata = response.structuredContent;
    if (metadata !== undefined && (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      Object.keys(metadata).join(',') !== 'error_code' || typeof metadata.error_code !== 'string' ||
      !metadata.error_code.trim() || metadata.error_code.length > 200)) fail('UNAMBIGUOUS_LIVE_ERROR_REQUIRED');
    if (!Array.isArray(response.content) || response.content.length !== 1 ||
      response.content[0]?.type !== 'text' || typeof response.content[0].text !== 'string' || !response.content[0].text.length) fail('UNAMBIGUOUS_LIVE_ERROR_REQUIRED');
    return {outcome: 'ERROR', error: {message: response.content[0].text}};
  }
  let receipt = response.structuredContent;
  if (response.content !== undefined) {
    if (!Array.isArray(response.content) || response.content.length > 8) fail('LIVE_CONTENT_INVALID');
    for (const block of response.content) {
      if (block?.type !== 'text' || typeof block.text !== 'string') fail('LIVE_JSON_TEXT_REQUIRED');
      let parsed; try {parsed = JSON.parse(block.text);} catch {fail('LIVE_JSON_TEXT_REQUIRED');}
      if (receipt !== undefined && !same(receipt, parsed)) fail('CONFLICTING_LIVE_RESPONSE_REPRESENTATIONS');
      receipt = parsed;
    }
  }
  object(receipt, 'LIVE_NATIVE_RECEIPT');
  if (receipt.status !== 'BOUNDED_MODEL_RESULT' || typeof receipt.implementation_version !== 'string') fail('LIVE_NATIVE_RECEIPT_REQUIRED');
  object(receipt.result, 'LIVE_NATIVE_RESULT');
  return {outcome: 'RESULT', receipt};
}
async function numericalReview(item, result) {
  if (result.outcome !== 'RESULT' || !exactNativeNumericalReviewContract.methods.includes(item.method)) return null;
  if (result.receipt.implementation_version !== exactNativeNumericalReviewContract.native_implementation_version) return {
    status: 'NOT_REVIEWED_NATIVE_VERSION', implementation_version: result.receipt.implementation_version,
    required_version: exactNativeNumericalReviewContract.native_implementation_version};
  try {return await verifyNativeNumericalReceipt({method: item.method, input: item.input, native_receipt: result.receipt});}
  catch (error) {return {status: 'NUMERICAL_REVIEW_REJECTED_RECEIPT', error: error.message};}
}
async function assess(item, result) {
  const normal = result.outcome === 'RESULT' ? assertionResults(result.receipt, item.expectation.assertions ?? []) : [];
  const exact = result.outcome === 'RESULT' ? assertionResults(result.receipt, item.expectation.exact_oracle_assertions ?? []) : [];
  const outcomeMatches = item.expectation.outcome === result.outcome && (result.outcome !== 'ERROR' || result.error.message === item.expectation.error_message);
  const numerical = await numericalReview(item, result);
  const numericalDisagreement = numerical?.comparison?.native_differs_beyond_projection === true ||
    numerical?.comparison?.native_tolerance_decision_matches_exact === false;
  return {expected_outcome_matches: outcomeMatches, assertion_results: normal, exact_oracle_assertion_results: exact,
    numerical_review: numerical, numerical_review_unresolved: numerical?.status === 'NUMERICAL_REVIEW_REJECTED_RECEIPT',
    oracle_counterexample: !outcomeMatches || normal.some(a => !a.pass) || exact.some(a => !a.pass) || numericalDisagreement};
}

export async function runLocalLiveIntelligence(request) {
  const args = snapshot(request); object(args, 'COMPARISON_REQUEST');
  if (Object.keys(args).some(k => !['cases', 'live_observations'].includes(k))) fail('UNKNOWN_COMPARISON_ARGUMENT');
  const {cases, live_observations: observations = []} = args;
  if (!Array.isArray(cases) || cases.length < 1 || cases.length > 64) fail('BOUNDED_CASES_REQUIRED');
  if (!Array.isArray(observations) || observations.length > 64) fail('BOUNDED_OBSERVATIONS_REQUIRED');
  const byId = new Map(), live = new Map();
  // Validate all source/request bindings before any local model execution.
  for (const item of cases) {
    object(item, 'CASE'); text(item.case_id, 'CASE_ID'); text(item.method, 'METHOD'); object(item.input, 'CASE_INPUT');
    if (byId.has(item.case_id)) fail('DUPLICATE_CASE_ID');
    const schema = getMethodCatalog({method: item.method}).input_schemas[item.method];
    if (!schema) fail('UNKNOWN_NATIVE_METHOD');
    hash(item.input_schema_sha256, 'CASE_SCHEMA'); hash(item.expected_model_fingerprint, 'CASE_MODEL'); hash(item.input_sha256, 'CASE_INPUT');
    if (await digest(schema) !== item.input_schema_sha256) fail('CASE_SCHEMA_HASH_MISMATCH:' + item.case_id);
    if (await digest(item.input) !== item.input_sha256) fail('CASE_INPUT_HASH_MISMATCH:' + item.case_id);
    if (await digest({method: item.method, input: item.input}) !== item.expected_model_fingerprint) fail('CASE_MODEL_FINGERPRINT_MISMATCH:' + item.case_id);
    object(item.expectation, 'EXPECTATION');
    if (!['RESULT', 'ERROR'].includes(item.expectation.outcome)) fail('EXPECTED_OUTCOME_REQUIRED');
    if (item.expectation.outcome === 'ERROR') text(item.expectation.error_message, 'EXPECTED_ERROR');
    assertions(item.expectation.assertions); assertions(item.expectation.exact_oracle_assertions);
    byId.set(item.case_id, item);
  }
  for (const observation of observations) {
    object(observation, 'OBSERVATION'); const item = byId.get(observation.case_id);
    if (!item) fail('UNKNOWN_LIVE_CASE');
    if (live.has(observation.case_id)) fail('DUPLICATE_LIVE_CASE');
    if (observation.method !== item.method) fail('LIVE_METHOD_MISMATCH:' + item.case_id);
    object(observation.input, 'LIVE_INPUT');
    if (await digest(observation.input) !== item.input_sha256 || !same(observation.input, item.input)) fail('LIVE_INPUT_BINDING_MISMATCH:' + item.case_id);
    if (observation.input_sha256 !== undefined && observation.input_sha256 !== item.input_sha256) fail('LIVE_INPUT_HASH_MISMATCH:' + item.case_id);
    if (observation.input_schema_sha256 !== undefined && observation.input_schema_sha256 !== item.input_schema_sha256) fail('LIVE_SCHEMA_HASH_MISMATCH:' + item.case_id);
    const time = observation.observed_at_utc;
    if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z| \d{2}:\d{2}:\d{2} UTC)$/u.test(time) || !Number.isFinite(Date.parse(time))) fail('LIVE_OBSERVATION_TIMESTAMP_REQUIRED');
    const parsed = parseResponse(observation.response);
    if (parsed.outcome === 'RESULT' && (parsed.receipt.method !== item.method || parsed.receipt.model_fingerprint !== item.expected_model_fingerprint)) fail('LIVE_RECEIPT_MODEL_BINDING_MISMATCH:' + item.case_id);
    live.set(item.case_id, {observation, parsed});
  }
  const results = [];
  for (const item of cases) {
    let local;
    try {local = {outcome: 'RESULT', receipt: await evaluateMethod({method: item.method, input: item.input})};}
    catch (error) {local = {outcome: 'ERROR', error: {message: error.message}};}
    if (local.outcome === 'RESULT' && local.receipt.model_fingerprint !== item.expected_model_fingerprint) fail('LOCAL_RECEIPT_MODEL_BINDING_MISMATCH');
    const localReview = await assess(item, local), observed = live.get(item.case_id);
    const liveReview = observed ? await assess(item, observed.parsed) : null;
    const outputsEqual = observed ? same(local, observed.parsed) : null;
    const classification = !observed ? 'MISSING_LIVE_OBSERVATION' : !outputsEqual ? 'VERSION_DIVERGENCE' :
      localReview.oracle_counterexample && liveReview.oracle_counterexample ? 'SHARED_ORACLE_COUNTEREXAMPLE' : 'SAME_RESULT';
    results.push({case_id: item.case_id, method: item.method, classification, input_sha256: item.input_sha256,
      model_fingerprint: item.expected_model_fingerprint, input_schema_sha256: item.input_schema_sha256,
      raw_local: local, raw_live: observed?.parsed ?? null, canonical_outputs_equal: outputsEqual,
      local_review: localReview, live_review: liveReview,
      observed_at_utc: observed?.observation.observed_at_utc ?? null,
      supplied_live_response: observed?.observation.response ?? null,
      live_transport_error_metadata: observed?.parsed.outcome === 'ERROR' ? observed.observation.response.structuredContent ?? null : null,
      live_observation_scope: observed ? 'REPLAY_OF_EXTERNALLY_SUPPLIED_OBSERVATION;NO_FRESH_LIVE_CALL' : 'NOT_SUPPLIED'});
  }
  const comparisonCore = results.map(({case_id, method, classification, input_sha256, model_fingerprint,
    raw_local, raw_live, local_review, live_review}) => ({case_id, method, classification, input_sha256, model_fingerprint,
    raw_local, raw_live, local_review, live_review}));
  return {version: localLiveIntelligenceContract.version, status: 'OFFLINE_LOCAL_LIVE_COMPARISON',
    summary: {cases: cases.length, local_evaluator_calls: cases.length, supplied_live_observations: observations.length,
      classifications: Object.fromEntries(localLiveIntelligenceContract.classifications.map(s => [s, results.filter(r => r.classification === s).length])),
      unresolved_numerical_reviews: results.filter(r => r.local_review.numerical_review_unresolved || r.live_review?.numerical_review_unresolved).map(r => r.case_id)},
    comparison_fingerprint: await digest(comparisonCore), timestamp_metadata_affects_comparison: false,
    cases_fingerprint: await digest(cases), results, live_network_calls: 0, source_authentication: false,
    canonical_comparison_scope: 'FULL_NATIVE_SUCCESS_RECEIPT_OR_EXACT_NATIVE_ERROR_TEXT;TRANSPORT_ERROR_METADATA_RETAINED_SEPARATELY',
    live_origin_authenticated: false, external_observation_currentness_revalidated: false,
    general_correctness_proven: false, native_registry_mutated: false};
}
