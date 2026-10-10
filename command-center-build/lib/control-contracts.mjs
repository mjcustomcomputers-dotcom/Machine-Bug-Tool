/**
 * Pure observation contracts for the MPC Workspace integration pack.
 * The application host owns authenticated calls, receipt capture and storage.
 * These functions check host-supplied observations; they cannot authenticate a
 * service, grant entitlement, invoke a model or establish that a call occurred.
 * A profile, endpoint or prior result does not authorize the next operation.
 * These reports do not gate admission: the first useful user-selected operation
 * may run with appropriate host credentials and task scope, and supply its own
 * receipt. Missing or expired observations require no separate verification ping.
 */
export const CONTROL_CONTRACT_VERSION = 'MPC_COMMAND_CENTER_CONTROL_1';
export const DEFAULT_OBSERVATION_MAX_AGE_MS = 300_000;

const fail = code => { throw Error(code); };
const copy = value => value === null ? null : structuredClone(value);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const string = (value, code, max = 400) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(code);
  return value;
};
function keys(value, allowed, code) {
  if (!isObject(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(code);
}
function timestamp(value, code = 'INVALID_TIMESTAMP') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*Z$/u.test(value)) fail(code);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
}
function accessProgram(value) {
  if (value === null) return null;
  keys(value, ['cyber'], 'INVALID_ACCESS_PROGRAM');
  return {cyber: string(value.cyber, 'INVALID_ACCESS_PROGRAM', 100)};
}
const sameProgram = (left, right) => (left?.cyber ?? null) === (right?.cyber ?? null);
function context(value, withProject) {
  keys(value, withProject ? ['host_id', 'account_id', 'workspace_project_id', 'api_project_id'] : ['provider', 'surface', 'host_id', 'account_id', 'operation'], 'INVALID_CONTEXT');
  string(value.host_id, 'HOST_ID_REQUIRED');
  string(value.account_id, 'ACCOUNT_ID_REQUIRED');
  if (withProject) {
    string(value.workspace_project_id, 'WORKSPACE_PROJECT_ID_REQUIRED');
    if (value.api_project_id !== null) string(value.api_project_id, 'API_PROJECT_ID_REQUIRED');
  } else {
    string(value.provider, 'PROVIDER_REQUIRED');
    string(value.surface, 'SURFACE_REQUIRED');
    string(value.operation, 'OPERATION_REQUIRED');
  }
}
function errorInfo(value) {
  if (value === null) return null;
  keys(value, ['code', 'message', 'category', 'http_status'], 'INVALID_PROVIDER_ERROR');
  string(value.code, 'PROVIDER_ERROR_CODE_REQUIRED', 200);
  string(value.message, 'PROVIDER_ERROR_MESSAGE_REQUIRED', 8000);
  string(value.category, 'PROVIDER_ERROR_CATEGORY_REQUIRED', 100);
  if (value.http_status !== null && (!Number.isInteger(value.http_status) || value.http_status < 100 || value.http_status > 599)) fail('INVALID_PROVIDER_HTTP_STATUS');
  return copy(value);
}
function connectorEndpoint(value) {
  if (value === null) return null;
  string(value, 'CONFIGURATION_ENDPOINT_INVALID', 2000);
  let parsed;
  try { parsed = new URL(value); } catch { fail('CONFIGURATION_ENDPOINT_INVALID'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) fail('ENDPOINT_CREDENTIALS_OR_QUERY_REJECTED');
  return value;
}
function observationTiming(value, {now_utc, max_age_ms = DEFAULT_OBSERVATION_MAX_AGE_MS}) {
  const now = timestamp(now_utc), observed = timestamp(value.observed_at_utc);
  const expires = timestamp(value.expires_at_utc);
  if (!Number.isSafeInteger(max_age_ms) || max_age_ms < 1000 || max_age_ms > 86_400_000) fail('INVALID_OBSERVATION_MAX_AGE');
  if (expires <= observed) return 'INVALID_OBSERVATION_WINDOW';
  if (observed > now) return 'FUTURE_OBSERVATION';
  if (now >= expires || now - observed > max_age_ms) return 'EXPIRED_OBSERVATION';
  return null;
}
function baseObservation(value) {
  if (!['SUCCESS', 'ERROR', 'UNAVAILABLE'].includes(value.status)) fail('INVALID_OBSERVATION_STATUS');
  for (const name of ['provider', 'surface', 'host_id', 'account_id', 'operation']) string(value[name], 'OBSERVATION_' + name.toUpperCase() + '_REQUIRED');
  timestamp(value.observed_at_utc); timestamp(value.expires_at_utc);
  if (value.error !== null) errorInfo(value.error);
  if (value.status === 'SUCCESS' && value.error !== null) fail('SUCCESS_WITH_ERROR_REJECTED');
  if (value.status === 'ERROR' && value.error === null) fail('ERROR_DETAILS_REQUIRED');
  if (value.receipt_id !== null) string(value.receipt_id, 'INVALID_RECEIPT_ID');
  return value;
}
function receiptProblem(value) {
  if (value.source !== 'HOST_PROTECTED_OPERATION_RESULT' || !value.receipt_id) return 'PROTECTED_OPERATION_RECEIPT_REQUIRED';
  return null;
}

export function validateProviderProfile(profile) {
  keys(profile, ['id', 'label', 'provider', 'surface', 'model', 'access_programs', 'required_access_tier', 'endpoint', 'operation'], 'INVALID_PROVIDER_PROFILE');
  for (const key of ['id', 'label', 'provider', 'surface', 'model', 'operation']) string(profile[key], 'PROFILE_' + key.toUpperCase() + '_REQUIRED');
  if (profile.operation !== 'MODEL_INFERENCE') fail('PROFILE_OPERATION_UNSUPPORTED');
  if (profile.model === 'gpt-daybreak-blue-latest') fail('DEPRECATED_DAYBREAK_ALIAS_REJECTED');
  const program = accessProgram(profile.access_programs);
  if (profile.provider === 'OLLAMA') {
    if (profile.surface !== 'LOCAL' || program !== null || profile.required_access_tier !== null ||
        profile.endpoint !== 'http://127.0.0.1:11434' || /(?:^|[/:_-])cloud$/iu.test(profile.model)) fail('LOCAL_PROFILE_BOUNDARY_REQUIRED');
  } else if (profile.provider === 'OPENAI_API') {
    if (profile.surface !== 'OPENAI_API' || profile.endpoint !== null) fail('API_PROFILE_SURFACE_REQUIRED');
    if (program?.cyber === 'daybreak_blue') {
      const tier = {'gpt-6-sol': 'DAYBREAK_BLUE', 'gpt-6.1-sol': 'DAYBREAK_RED', 'gpt-6-astra': 'DAYBREAK_RED'}[profile.model];
      if (!tier || profile.required_access_tier !== tier) fail('MODEL_ACCESS_TIER_MISMATCH');
    } else if (program?.cyber === 'standard') {
      if (profile.required_access_tier !== 'STANDARD') fail('STANDARD_MODEL_PERMISSION_REQUIRED');
    } else fail('EXPLICIT_SUPPORTED_CYBER_PROGRAM_REQUIRED');
  } else fail('PROFILE_PROVIDER_UNSUPPORTED');
  return copy(profile);
}

/** A host records the user's selection once; later calls reuse that selection. */
export function selectProviderProfile(profile, binding, event, previous = null) {
  const checked = validateProviderProfile(profile);
  context(binding, true);
  if (checked.provider === 'OPENAI_API' && binding.api_project_id === null) fail('API_PROJECT_REQUIRED');
  if (checked.provider === 'OLLAMA' && binding.api_project_id !== null) fail('LOCAL_API_PROJECT_MUST_BE_NULL');
  keys(event, ['kind', 'profile_id', 'selection_id', 'selected_at_utc'], 'INVALID_SELECTION_EVENT');
  if (event.kind !== 'USER_SELECTED_PROVIDER_PROFILE' || event.profile_id !== checked.id) fail('EXPLICIT_PROFILE_SELECTION_REQUIRED');
  string(event.selection_id, 'SELECTION_ID_REQUIRED'); timestamp(event.selected_at_utc);
  if (previous !== null && previous.selection_id === event.selection_id) fail('NEW_SELECTION_ID_REQUIRED');
  return {
    contract: CONTROL_CONTRACT_VERSION,
    selection_id: event.selection_id,
    previous_selection_id: previous?.selection_id ?? null,
    selected_at_utc: event.selected_at_utc,
    selection_basis: event.kind,
    profile_id: checked.id,
    binding: copy(binding),
    requested: checked,
    implicit_fallback: false
  };
}

/**
 * Reports whether the last host-recorded operation matches this selection.
 * last_operation_verified is historical observation, not admission/authorization.
 * A first useful operation needs no previous successful MODEL_INFERENCE receipt.
 * Workspace identity controls data scope; API project identity controls billing
 * and access. Local inference still retains a required workspace_project_id.
 */
export function assessProviderSelection(selection, observation, runtimeContext, timing) {
  const profile = validateProviderProfile(selection.requested);
  context(selection.binding, true); context(runtimeContext, true);
  string(selection.selection_id, 'SELECTION_ID_REQUIRED');
  if (selection.profile_id !== profile.id || selection.selection_basis !== 'USER_SELECTED_PROVIDER_PROFILE' || selection.implicit_fallback !== false) fail('INVALID_SAVED_SELECTION');
  const output = {
    contract: CONTROL_CONTRACT_VERSION,
    selection_id: selection.selection_id,
    requested: copy(profile),
    observed: observation === null ? null : copy(observation),
    status: 'SELECTED_NOT_YET_OBSERVED',
    last_operation_verified: false,
    provider_error: observation?.error === undefined ? null : errorInfo(observation.error),
    fallback: null,
    silent_substitution_performed: false,
    observation_only: true,
    operation_admission: 'HOST_USER_SELECTION_CREDENTIALS_AND_TASK_SCOPE',
    prior_success_required_for_attempt: false,
    verification_ping_required: false,
    verification_requires_host_recorded_result: true
  };
  const stop = reason => ({...output, status: reason});
  if (['host_id', 'account_id', 'workspace_project_id', 'api_project_id'].some(key => selection.binding[key] !== runtimeContext[key])) return stop('SELECTION_CONTEXT_MISMATCH');
  if (observation === null) return output;
  keys(observation, ['provider', 'surface', 'host_id', 'account_id', 'workspace_project_id', 'api_project_id', 'operation', 'model', 'access_programs', 'status', 'source', 'receipt_id', 'observed_at_utc', 'expires_at_utc', 'entitlement', 'error'], 'INVALID_MODEL_OBSERVATION');
  baseObservation(observation);
  const observedProgram = observation.access_programs == null ? null : accessProgram(observation.access_programs);
  if (['host_id', 'account_id', 'workspace_project_id', 'api_project_id'].some(key => observation[key] !== runtimeContext[key]) ||
      observation.provider !== profile.provider || observation.surface !== profile.surface || observation.operation !== profile.operation) return stop('OBSERVATION_CONTEXT_MISMATCH');
  const timingProblem = observationTiming(observation, timing);
  if (timingProblem) return stop(timingProblem);
  if (observation.status === 'ERROR') return stop('PROVIDER_ERROR');
  if (observation.status === 'UNAVAILABLE') return stop('PROVIDER_UNAVAILABLE');
  const receiptIssue = receiptProblem(observation);
  if (receiptIssue) return stop(receiptIssue);
  if (observation.model == null || observation.model === '') return stop('OBSERVED_MODEL_UNKNOWN');
  if (observation.model !== profile.model) return stop('OBSERVED_MODEL_MISMATCH');
  if (profile.provider === 'OPENAI_API' && observedProgram === null) return stop('OBSERVED_ACCESS_PROGRAM_UNKNOWN');
  if (!sameProgram(observedProgram, profile.access_programs)) return stop('OBSERVED_ACCESS_PROGRAM_MISMATCH');
  if (profile.provider === 'OPENAI_API') {
    const entitlement = observation.entitlement;
    if (!isObject(entitlement)) return stop('PROJECT_MODEL_ENTITLEMENT_REQUIRED');
    keys(entitlement, ['api_project_id', 'model', 'model_allowed', 'access_tier', 'observed', 'receipt_id'], 'INVALID_ENTITLEMENT_OBSERVATION');
    if (entitlement.observed !== true || !entitlement.receipt_id || entitlement.api_project_id !== runtimeContext.api_project_id || entitlement.model !== profile.model) return stop('PROJECT_MODEL_ENTITLEMENT_REQUIRED');
    string(entitlement.receipt_id, 'ENTITLEMENT_RECEIPT_REQUIRED');
    if (entitlement.model_allowed !== true) return stop('PROJECT_MODEL_PERMISSION_NOT_OBSERVED');
    // Standard use is a request mode, not a mutually exclusive enrollment tier.
    // Blue/Red enrollment does not remove permission to request standard mode.
    const tierAccepted = profile.access_programs.cyber === 'standard' || entitlement.access_tier === profile.required_access_tier ||
      (profile.required_access_tier === 'DAYBREAK_BLUE' && entitlement.access_tier === 'DAYBREAK_RED');
    if (!tierAccepted) return stop('MODEL_ACCESS_TIER_NOT_OBSERVED');
  }
  return {...output, status: 'LAST_OPERATION_VERIFIED', last_operation_verified: true};
}

function connectorObservation(observation) {
  keys(observation, ['provider', 'surface', 'host_id', 'account_id', 'operation', 'status', 'source', 'receipt_id', 'observed_at_utc', 'expires_at_utc', 'error'], 'INVALID_CONNECTOR_OBSERVATION');
  return baseObservation(observation);
}
const matchesConnector = (observation, expected) => ['provider', 'surface', 'host_id', 'account_id', 'operation'].every(key => observation[key] === expected[key]);

/**
 * Historical success remains visible when the current operation fails.
 * This is observation-only. An installed host connector may provide an actual
 * operation receipt without a separate local configuration row. Its first
 * user-requested operation supplies the receipt; no successful preflight is
 * required here. The host owns execution authority and current task scope.
 */
export function assessConnectorStatus(record, expected, timing) {
  context(expected, false);
  keys(record, ['configuration', 'current', 'last_success'], 'INVALID_CONNECTOR_RECORD');
  if (record.configuration !== null) {
    keys(record.configuration, ['provider', 'label', 'endpoint'], 'INVALID_CONNECTOR_CONFIGURATION');
    string(record.configuration.provider, 'CONFIGURATION_PROVIDER_REQUIRED');
    string(record.configuration.label, 'CONFIGURATION_LABEL_REQUIRED');
    connectorEndpoint(record.configuration.endpoint);
  }
  const current = record.current === null ? null : connectorObservation(record.current);
  const previous = record.last_success === null ? null : connectorObservation(record.last_success);
  const previousAccepted = previous !== null && previous.status === 'SUCCESS' && matchesConnector(previous, expected) && receiptProblem(previous) === null;
  let lastSuccess = previousAccepted ? copy(previous) : null;
  let status = record.configuration === null ? 'NO_CURRENT_OPERATION_OBSERVATION' : 'CONFIGURED_ONLY';
  if (record.configuration !== null && record.configuration.provider !== expected.provider) status = 'CONFIGURATION_PROVIDER_MISMATCH';
  else if (current !== null) {
    if (!matchesConnector(current, expected)) status = 'OBSERVATION_CONTEXT_MISMATCH';
    else {
      status = observationTiming(current, timing) ??
        (current.status === 'ERROR' ? 'CURRENT_OPERATION_ERROR' : current.status === 'UNAVAILABLE' ? 'OPERATION_UNAVAILABLE' :
          receiptProblem(current) ?? 'LAST_OPERATION_VERIFIED');
      if (status === 'LAST_OPERATION_VERIFIED') lastSuccess = copy(current);
    }
  }
  return {
    contract: CONTROL_CONTRACT_VERSION,
    expected: copy(expected),
    configuration: copy(record.configuration),
    current: copy(current),
    last_success: lastSuccess,
    current_error: current?.error === undefined ? null : errorInfo(current.error),
    status,
    last_operation_verified: status === 'LAST_OPERATION_VERIFIED',
    observation_is_operation_specific: true,
    observation_only: true,
    operation_admission: 'HOST_USER_SELECTION_CREDENTIALS_AND_TASK_SCOPE',
    prior_success_required_for_attempt: false,
    verification_ping_required: false,
    verification_requires_host_recorded_result: true,
    fallback: null
  };
}
