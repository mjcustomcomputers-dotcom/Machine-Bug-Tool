import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateProviderProfile, selectProviderProfile, assessProviderSelection, assessConnectorStatus} from '../lib/control-contracts.mjs';

// Every observation in this file is synthetic. No provider, entitlement,
// connector, Windows host or model inference is tested by these unit fixtures.
const config = JSON.parse(readFileSync(new URL('../config/provider-profiles.json', import.meta.url), 'utf8'));
const profile = id => structuredClone(config.profiles.find(row => row.id === id));
const now = '2026-10-09T16:00:00.000Z';
const timing = {now_utc: now};
const binding = {host_id: 'local-windows-a', account_id: 'operator-a', workspace_project_id: 'engagement-a', api_project_id: 'api-project-a'};
const event = (id, sequence = 1) => ({kind: 'USER_SELECTED_PROVIDER_PROFILE', profile_id: id, selection_id: 'selection-' + sequence, selected_at_utc: '2026-10-09T15:59:00.000Z'});
function selected(id = 'openai-daybreak-blue-gpt6') {
  const p = profile(id);
  const owner = {...binding, api_project_id: p.provider === 'OLLAMA' ? null : binding.api_project_id};
  return selectProviderProfile(p, owner, event(id));
}
function modelObservation(selection = selected()) {
  const p = selection.requested;
  return {
    provider: p.provider, surface: p.surface, ...selection.binding, operation: 'MODEL_INFERENCE',
    model: p.model, access_programs: structuredClone(p.access_programs), status: 'SUCCESS',
    source: 'HOST_PROTECTED_OPERATION_RESULT', receipt_id: 'synthetic:model-response-a',
    observed_at_utc: '2026-10-09T15:59:50.000Z', expires_at_utc: '2026-10-09T16:04:50.000Z',
    entitlement: p.provider === 'OLLAMA' ? null : {api_project_id: binding.api_project_id, model: p.model, model_allowed: true,
      access_tier: p.required_access_tier, observed: true, receipt_id: 'synthetic:entitlement-a'}, error: null
  };
}
const expected = {provider: 'GITHUB', surface: 'CHATGPT', host_id: 'chatgpt-session-a', account_id: 'operator-a', operation: 'READ_REPOSITORY_FILE'};
const configured = {provider: 'GITHUB', label: 'Operator GitHub', endpoint: 'https://api.github.com'};
function connectorObservation() {
  return {...expected, surface: 'CHATGPT', status: 'SUCCESS', source: 'HOST_PROTECTED_OPERATION_RESULT',
    receipt_id: 'synthetic:github-native-file-a', observed_at_utc: '2026-10-09T15:59:50.000Z',
    expires_at_utc: '2026-10-09T16:04:50.000Z', error: null};
}
function connector(current = connectorObservation(), last_success = null, configuration = configured) {
  return assessConnectorStatus({configuration, current, last_success}, expected, timing);
}

test('seven explicit profiles validate without a default, credentials or deprecated alias', () => {
  assert.equal(config.profiles.length, 7);
  config.profiles.forEach(validateProviderProfile);
  assert.equal(config.default_selection, null);
  assert.equal(config.automatic_provider_fallback, false);
  assert.deepEqual(config.credential_fields, []);
});
test('configuration alone leaves model readiness unestablished', () => {
  const s = selected(), result = assessProviderSelection(s, null, binding, timing);
  assert.equal(result.status, 'SELECTED_NOT_YET_OBSERVED'); assert.equal(result.last_operation_verified, false);
  assert.equal(result.observed, null); assert.equal(result.requested.model, 'gpt-6-sol');
});
test('fresh matching Blue project/model receipt verifies that recorded operation', () => {
  const s = selected(), observed = modelObservation(s), result = assessProviderSelection(s, observed, binding, timing);
  assert.equal(result.last_operation_verified, true); assert.equal(result.status, 'LAST_OPERATION_VERIFIED');
  assert.deepEqual(result.observed, observed); assert.notEqual(result.observed, observed);
  assert.deepEqual(result.requested.access_programs, {cyber: 'daybreak_blue'});
});
test('selection requires the exact explicit user-selected profile event', () => {
  const p = profile('openai-daybreak-blue-gpt6');
  assert.throws(() => selectProviderProfile(p, binding, {...event(p.id), kind: 'MODEL_SUGGESTED_FALLBACK'}), /EXPLICIT_PROFILE_SELECTION_REQUIRED/);
  assert.throws(() => selectProviderProfile(p, binding, event('ollama-mpc-local')), /EXPLICIT_PROFILE_SELECTION_REQUIRED/);
});
test('a later explicit user selection may change providers and preserves previous selection identity', () => {
  const old = selected(), p = profile('ollama-mpc-local'), snapshot = structuredClone(old);
  const next = selectProviderProfile(p, {...binding, api_project_id: null}, event(p.id, 2), old);
  assert.equal(next.previous_selection_id, old.selection_id); assert.equal(next.requested.provider, 'OLLAMA');
  assert.equal(next.requested.model, 'mpc-daybreak-local'); assert.deepEqual(old, snapshot);
});
test('observed model substitution remains explicit and cannot mutate the request', () => {
  const s = selected(), observed = {...modelObservation(s), model: 'gpt-6.1-sol'};
  const r = assessProviderSelection(s, observed, binding, timing);
  assert.equal(r.status, 'OBSERVED_MODEL_MISMATCH'); assert.equal(r.last_operation_verified, false);
  assert.equal(r.requested.model, 'gpt-6-sol'); assert.equal(r.observed.model, 'gpt-6.1-sol');
  assert.equal(r.fallback, null); assert.equal(r.silent_substitution_performed, false);
});
for (const [field, value] of [['host_id', 'different-host'], ['account_id', 'different-account'], ['workspace_project_id', 'different-engagement'], ['api_project_id', 'different-api-project'], ['surface', 'CODEX']]) {
  test('model observation is rejected for wrong ' + field, () => {
    const s = selected(), observed = {...modelObservation(s), [field]: value};
    const r = assessProviderSelection(s, observed, binding, timing);
    assert.equal(r.status, 'OBSERVATION_CONTEXT_MISMATCH'); assert.equal(r.last_operation_verified, false);
  });
}
test('saved selection observation does not transfer to a different host account', () => {
  const s = selected();
  const r = assessProviderSelection(s, modelObservation(s), {...binding, account_id: 'another-account'}, timing);
  assert.equal(r.status, 'SELECTION_CONTEXT_MISMATCH'); assert.equal(r.last_operation_verified, false);
});
test('expired model observations do not establish current access', () => {
  const s = selected(), observed = {...modelObservation(s), expires_at_utc: now};
  assert.equal(assessProviderSelection(s, observed, binding, timing).status, 'EXPIRED_OBSERVATION');
});
test('future model observations are not accepted as current receipts', () => {
  const s = selected(), observed = {...modelObservation(s), observed_at_utc: '2026-10-09T16:00:01.000Z'};
  assert.equal(assessProviderSelection(s, observed, binding, timing).status, 'FUTURE_OBSERVATION');
});
test('a recent success without its real operation receipt remains unavailable', () => {
  const s = selected(), observed = {...modelObservation(s), receipt_id: null, source: 'SAVED_CONFIGURATION'};
  assert.equal(assessProviderSelection(s, observed, binding, timing).status, 'PROTECTED_OPERATION_RECEIPT_REQUIRED');
});
test('missing observed access program remains unknown without changing the request', () => {
  const s = selected(), observed = {...modelObservation(s), access_programs: null};
  const result = assessProviderSelection(s, observed, binding, timing);
  assert.equal(result.status, 'OBSERVED_ACCESS_PROGRAM_UNKNOWN');
  assert.deepEqual(result.requested.access_programs, {cyber: 'daybreak_blue'});
  delete observed.access_programs;
  const missing = assessProviderSelection(s, observed, binding, timing);
  assert.equal(missing.status, 'OBSERVED_ACCESS_PROGRAM_UNKNOWN');
  assert.equal(Object.hasOwn(missing.observed, 'access_programs'), false);
});
test('project/model entitlement requires matching observed identity', () => {
  const s = selected(), observed = modelObservation(s);
  observed.entitlement.api_project_id = 'other-project';
  assert.equal(assessProviderSelection(s, observed, binding, timing).status, 'PROJECT_MODEL_ENTITLEMENT_REQUIRED');
  observed.entitlement = null;
  assert.equal(assessProviderSelection(s, observed, binding, timing).last_operation_verified, false);
});
for (const id of ['openai-daybreak-red-sol61', 'openai-daybreak-red-astra']) {
  test(id + ' requires Red entitlement and accepts its matching positive control', () => {
    const s = selected(id), observed = modelObservation(s);
    observed.entitlement.access_tier = 'DAYBREAK_BLUE';
    assert.equal(assessProviderSelection(s, observed, binding, timing).status, 'MODEL_ACCESS_TIER_NOT_OBSERVED');
    observed.entitlement.access_tier = 'DAYBREAK_RED';
    assert.equal(assessProviderSelection(s, observed, binding, timing).last_operation_verified, true);
    assert.throws(() => validateProviderProfile({...profile(id), required_access_tier: 'DAYBREAK_BLUE'}), /MODEL_ACCESS_TIER_MISMATCH/);
  });
}
test('the deprecated Daybreak model alias cannot become a profile default', () => {
  assert.throws(() => validateProviderProfile({...profile('openai-daybreak-blue-gpt6'), model: 'gpt-daybreak-blue-latest'}), /DEPRECATED_DAYBREAK_ALIAS_REJECTED/);
});
for (const [category, code] of [['REFUSAL', 'provider_refusal_exact'], ['CYBER_POLICY', 'cyber_policy_exact'], ['ACCESS', 'project_access_denied_exact']]) {
  test(category + ' preserves exact visible error and never requests fallback', () => {
    const s = selected(), error = {code, category, message: 'Provider returned exact diagnostic ' + code, http_status: 403};
    const observed = {...modelObservation(s), status: 'ERROR', error};
    const r = assessProviderSelection(s, observed, binding, timing);
    assert.equal(r.status, 'PROVIDER_ERROR'); assert.equal(r.last_operation_verified, false);
    assert.deepEqual(r.provider_error, error); assert.equal(r.fallback, null);
    assert.equal(r.requested.id, s.profile_id);
  });
}
test('unavailable local model cannot upload content or substitute a cloud provider', () => {
  const s = selected('ollama-qwen3-4b-instruct'), observed = {...modelObservation(s), status: 'UNAVAILABLE', receipt_id: null};
  const r = assessProviderSelection(s, observed, s.binding, timing);
  assert.equal(r.status, 'PROVIDER_UNAVAILABLE'); assert.equal(r.requested.provider, 'OLLAMA');
  assert.equal(r.last_operation_verified, false); assert.equal(r.fallback, null);
  assert.throws(() => validateProviderProfile({...s.requested, model: 'qwen3:4b-cloud'}), /LOCAL_PROFILE_BOUNDARY_REQUIRED/);
});
test('local inference observation is accepted without implying Daybreak entitlement', () => {
  const s = selected('ollama-mpc-local'), r = assessProviderSelection(s, modelObservation(s), s.binding, timing);
  assert.equal(r.last_operation_verified, true); assert.equal(r.requested.access_programs, null);
});
test('connector configuration and previous success alone do not verify the current operation', () => {
  const r = connector(null, connectorObservation());
  assert.equal(r.status, 'CONFIGURED_ONLY'); assert.equal(r.last_operation_verified, false);
  assert.equal(r.last_success.receipt_id, 'synthetic:github-native-file-a');
});
test('a matching native operation receipt verifies that recorded operation only', () => {
  const r = connector();
  assert.equal(r.status, 'LAST_OPERATION_VERIFIED'); assert.equal(r.last_operation_verified, true);
  assert.equal(r.expected.operation, 'READ_REPOSITORY_FILE'); assert.deepEqual(r.current, r.last_success);
});
for (const field of ['provider', 'surface', 'host_id', 'account_id', 'operation']) {
  test('connector receipt with wrong ' + field + ' cannot verify the requested operation', () => {
    const r = connector({...connectorObservation(), [field]: 'different-value'});
    assert.equal(r.status, 'OBSERVATION_CONTEXT_MISMATCH'); assert.equal(r.last_operation_verified, false);
  });
}
test('last connector success remains separate from a new exact error', () => {
  const prior = connectorObservation(), error = {code: 'HTTP_401_EXACT', message: 'Provider rejected this account session.', category: 'ACCESS', http_status: 401};
  const current = {...connectorObservation(), status: 'ERROR', receipt_id: 'synthetic:failed-call-b', error};
  const r = connector(current, prior);
  assert.equal(r.status, 'CURRENT_OPERATION_ERROR'); assert.equal(r.last_operation_verified, false);
  assert.deepEqual(r.last_success, prior); assert.deepEqual(r.current_error, error);
});
test('expired connector success remains historical without verifying a current operation', () => {
  const expired = {...connectorObservation(), expires_at_utc: now};
  const r = connector(expired, expired);
  assert.equal(r.status, 'EXPIRED_OBSERVATION'); assert.equal(r.last_operation_verified, false);
  assert.equal(r.last_success.receipt_id, expired.receipt_id);
});
test('configuration masquerading as a connector success cannot count as an operation result', () => {
  const r = connector({...connectorObservation(), source: 'CONFIGURATION_FILE'});
  assert.equal(r.status, 'PROTECTED_OPERATION_RECEIPT_REQUIRED'); assert.equal(r.last_success, null);
});
test('sensitive configuration fields and credential-bearing endpoints are rejected', () => {
  assert.throws(() => connector(null, null, {...configured, access_token: 'fixture-only'}), /INVALID_CONNECTOR_CONFIGURATION/);
  assert.throws(() => connector(null, null, {...configured, endpoint: 'https://user:fixture@example.invalid/mcp'}), /ENDPOINT_CREDENTIALS_OR_QUERY_REJECTED/);
  assert.throws(() => connector(null, null, {...configured, endpoint: 'https://example.invalid/mcp?api_key=fixture'}), /ENDPOINT_CREDENTIALS_OR_QUERY_REJECTED/);
});
test('unknown raw credential fields cannot be retained in model observations', () => {
  const s = selected();
  assert.throws(() => assessProviderSelection(s, {...modelObservation(s), authorization: 'fixture-only'}, binding, timing), /INVALID_MODEL_OBSERVATION/);
});
test('success/error contradictions and unsupported fresh-window sizes are rejected', () => {
  const s = selected(), bad = {...modelObservation(s), error: {code: 'X', message: 'X', category: 'X', http_status: 400}};
  assert.throws(() => assessProviderSelection(s, bad, binding, timing), /SUCCESS_WITH_ERROR_REJECTED/);
  assert.throws(() => assessProviderSelection(s, modelObservation(s), binding, {...timing, max_age_ms: 0}), /INVALID_OBSERVATION_MAX_AGE/);
});

test('local and cloud selections retain workspace identity separately from the API project', () => {
  const cloud = selected(), local = selected('ollama-mpc-local');
  assert.equal(cloud.binding.workspace_project_id, 'engagement-a');
  assert.equal(cloud.binding.api_project_id, 'api-project-a');
  assert.equal(local.binding.workspace_project_id, 'engagement-a');
  assert.equal(local.binding.api_project_id, null);
  const p = profile('ollama-mpc-local');
  assert.throws(() => selectProviderProfile(p, {...binding, workspace_project_id: null, api_project_id: null}, event(p.id)), /WORKSPACE_PROJECT_ID_REQUIRED/);
  assert.throws(() => selectProviderProfile(p, binding, event(p.id)), /LOCAL_API_PROJECT_MUST_BE_NULL/);
  const api = profile('openai-standard-sol61');
  assert.throws(() => selectProviderProfile(api, {...binding, api_project_id: null}, event(api.id)), /API_PROJECT_REQUIRED/);
});
test('local observations are scoped to the selected workspace project', () => {
  const s = selected('ollama-mpc-local'), observed = modelObservation(s);
  observed.workspace_project_id = 'other-engagement';
  const result = assessProviderSelection(s, observed, s.binding, timing);
  assert.equal(result.status, 'OBSERVATION_CONTEXT_MISMATCH');
  assert.equal(result.last_operation_verified, false);
});
test('first model operation can supply its own receipt without an admission flag or preflight', () => {
  const s = selected(), initial = assessProviderSelection(s, null, binding, timing);
  assert.equal(initial.observation_only, true);
  assert.equal(initial.prior_success_required_for_attempt, false);
  assert.equal(initial.verification_ping_required, false);
  assert.equal(Object.hasOwn(initial, 'can_invoke'), false);
  const completed = assessProviderSelection(s, modelObservation(s), binding, timing);
  assert.equal(completed.last_operation_verified, true);
  assert.equal(completed.operation_admission, 'HOST_USER_SELECTION_CREDENTIALS_AND_TASK_SCOPE');
  assert.equal(Object.hasOwn(completed, 'can_invoke'), false);
});
test('expired model observation asks for no verification ping or forced provider change', () => {
  const s = selected(), old = {...modelObservation(s), expires_at_utc: now};
  const result = assessProviderSelection(s, old, binding, timing);
  assert.equal(result.status, 'EXPIRED_OBSERVATION');
  assert.equal(result.prior_success_required_for_attempt, false);
  assert.equal(result.verification_ping_required, false);
  assert.equal(result.fallback, null);
});
test('installed host connector may report its requested operation without a local config row', () => {
  const initial = connector(null, null, null);
  assert.equal(initial.status, 'NO_CURRENT_OPERATION_OBSERVATION');
  assert.equal(initial.observation_only, true);
  assert.equal(initial.prior_success_required_for_attempt, false);
  assert.equal(initial.verification_ping_required, false);
  assert.equal(Object.hasOwn(initial, 'can_dispatch_operation'), false);
  const actual = connector(connectorObservation(), null, null);
  assert.equal(actual.status, 'LAST_OPERATION_VERIFIED');
  assert.equal(actual.last_operation_verified, true);
  assert.equal(actual.configuration, null);
  assert.equal(Object.hasOwn(actual, 'can_dispatch_operation'), false);
});
for (const id of ['openai-standard-sol61', 'openai-standard-astra']) {
  test(id + ' explicitly requests standard, allowing model permission with Blue or Red enrollment', () => {
    const p = profile(id), s = selected(id);
    assert.deepEqual(p.access_programs, {cyber: 'standard'});
    assert.throws(() => validateProviderProfile({...p, access_programs: null}), /EXPLICIT_SUPPORTED_CYBER_PROGRAM_REQUIRED/);
    for (const tier of ['STANDARD', 'DAYBREAK_BLUE', 'DAYBREAK_RED']) {
      const observed = modelObservation(s);
      observed.entitlement.access_tier = tier;
      assert.equal(assessProviderSelection(s, observed, binding, timing).last_operation_verified, true);
    }
    const forbidden = modelObservation(s);
    forbidden.entitlement.model_allowed = false;
    assert.equal(assessProviderSelection(s, forbidden, binding, timing).status, 'PROJECT_MODEL_PERMISSION_NOT_OBSERVED');
    const changed = modelObservation(s);
    changed.access_programs = {cyber: 'daybreak_blue'};
    const mismatch = assessProviderSelection(s, changed, binding, timing);
    assert.equal(mismatch.status, 'OBSERVED_ACCESS_PROGRAM_MISMATCH');
    assert.deepEqual(mismatch.requested.access_programs, {cyber: 'standard'});
  });
}
