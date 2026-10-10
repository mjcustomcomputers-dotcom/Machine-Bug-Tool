import {
  assessConnectorStatus,
  assessProviderSelection
} from '../command-center-build/lib/control-contracts.mjs';

export const MPC_WORKSPACE_CONNECTIONS_VERSION = 'MPC_WORKSPACE_CONNECTIONS_1';
const SENSITIVE_KEY = /(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|private[_-]?key)/iu;
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = code => { const error = new TypeError(code); error.code = code; throw error; };
const requiredText = (value, code, limit = 2_000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) fail(code);
  return value;
};
const iso = value => {
  const result = value instanceof Date ? value.toISOString() : String(value);
  if (!Number.isFinite(Date.parse(result))) fail('VALID_CLOCK_REQUIRED');
  return result;
};

function safeReceipt(value, depth = 0, budget = {nodes: 0}) {
  if (++budget.nodes > 20_000 || depth > 16) fail('CONNECTION_RECEIPT_COMPLEXITY_LIMIT');
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 100_000);
  if (Array.isArray(value)) return value.slice(0, 1_000).map(item => safeReceipt(item, depth + 1, budget));
  if (!plainObject(value)) return String(value).slice(0, 1_000);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : safeReceipt(child, depth + 1, budget)]));
}
function structuredError(error) {
  const http = Number(error?.http_status ?? error?.status);
  return {
    code: String(error?.code ?? 'OPERATION_FAILED').slice(0, 200),
    message: String(error?.message ?? 'The provider operation failed.').slice(0, 8_000),
    category: String(error?.category ?? (http === 401 || http === 403 ? 'ACCESS' : 'OPERATION')).slice(0, 100),
    http_status: Number.isInteger(http) && http >= 100 && http <= 599 ? http : null
  };
}
function window(clock, ttlMs) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 86_400_000) fail('INVALID_OBSERVATION_TTL');
  const now = new Date(iso(clock()));
  return {observed_at_utc: now.toISOString(), expires_at_utc: new Date(now.getTime() + ttlMs).toISOString()};
}

/**
 * Run the first useful connector operation directly. This does not require a
 * prior ping. The returned assessment remains operation/context-specific.
 */
export async function observeConnectorOperation({configuration = null, expected, operation_input = {},
  last_success = null, ttl_ms = 300_000} = {}, {invoke, clock = () => new Date()} = {}) {
  if (!plainObject(expected)) fail('EXPECTED_CONNECTION_CONTEXT_REQUIRED');
  for (const field of ['provider', 'surface', 'host_id', 'account_id', 'operation']) requiredText(expected[field], `EXPECTED_${field.toUpperCase()}_REQUIRED`, 400);
  if (!plainObject(operation_input)) fail('CONNECTION_OPERATION_INPUT_INVALID');
  const timing = window(clock, ttl_ms);
  let raw = null, current;
  if (typeof invoke !== 'function') {
    current = {...expected, status: 'UNAVAILABLE', source: 'HOST_CAPABILITY_UNAVAILABLE', receipt_id: null,
      ...timing, error: null};
  } else {
    try {
      raw = await invoke(structuredClone(operation_input), structuredClone(expected));
      const receiptId = raw?.receipt_id ?? raw?.native_receipt_id ?? null;
      const returnedStatus = String(raw?.status ?? raw?.outcome ?? '').toUpperCase();
      const success = ['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'OK'].includes(returnedStatus);
      const unavailable = ['UNAVAILABLE', 'NOT_CONFIGURED', 'DISABLED'].includes(returnedStatus);
      const observed = plainObject(raw?.context) ? raw.context : plainObject(raw) ? raw : {};
      const actualContext = Object.fromEntries(['provider', 'surface', 'host_id', 'account_id', 'operation']
        .map(key => [key, typeof observed[key] === 'string' && observed[key] ? observed[key] : expected[key]]));
      current = {...actualContext,
        status: success ? 'SUCCESS' : unavailable ? 'UNAVAILABLE' : 'ERROR',
        source: receiptId ? 'HOST_PROTECTED_OPERATION_RESULT' : 'HOST_OPERATION_RESULT_WITHOUT_RECEIPT',
        receipt_id: receiptId, ...timing,
        error: success || unavailable ? null : structuredError(raw?.error ?? {
          code: returnedStatus ? `PROVIDER_${returnedStatus}` : 'PROVIDER_RESULT_NOT_SUCCESS',
          message: 'The provider did not return an allowlisted successful completion status.'
        })};
    } catch (error) {
      raw = {error: structuredError(error)};
      current = {...expected, status: 'ERROR', source: 'HOST_PROTECTED_OPERATION_RESULT', receipt_id: error?.receipt_id ?? null,
        ...timing, error: structuredError(error)};
    }
  }
  const record = {configuration: configuration === null ? null : structuredClone(configuration), current, last_success: last_success === null ? null : structuredClone(last_success)};
  const assessment = assessConnectorStatus(record, expected, {now_utc: timing.observed_at_utc, max_age_ms: ttl_ms});
  return {
    schema_version: MPC_WORKSPACE_CONNECTIONS_VERSION,
    attempted_operation: typeof invoke === 'function',
    expected: structuredClone(expected),
    current_observation: current,
    assessment,
    operation_result: raw === null ? null : safeReceipt(raw),
    credential_material_retained: false,
    prior_success_required_for_attempt: false,
    automatic_provider_fallback: false
  };
}

/** Record an actual selected-model operation without treating selection as entitlement. */
export async function observeModelOperation({selection, runtime_context, operation_input = {}, ttl_ms = 300_000} = {},
{invoke, clock = () => new Date()} = {}) {
  if (!plainObject(selection) || !plainObject(runtime_context) || !plainObject(operation_input)) fail('MODEL_OPERATION_INPUT_INVALID');
  const timing = window(clock, ttl_ms);
  const requested = selection.requested;
  let raw = null, observation = null;
  if (typeof invoke !== 'function') {
    observation = {
      provider: requested.provider, surface: requested.surface,
      host_id: runtime_context.host_id, account_id: runtime_context.account_id,
      workspace_project_id: runtime_context.workspace_project_id, api_project_id: runtime_context.api_project_id,
      operation: requested.operation, model: requested.model, access_programs: requested.access_programs,
      status: 'UNAVAILABLE', source: 'HOST_CAPABILITY_UNAVAILABLE', receipt_id: null,
      ...timing, entitlement: null, error: null
    };
  } else {
    try {
      raw = await invoke(structuredClone(operation_input), structuredClone(selection));
      observation = {
        provider: requested.provider, surface: requested.surface,
        host_id: runtime_context.host_id, account_id: runtime_context.account_id,
        workspace_project_id: runtime_context.workspace_project_id, api_project_id: runtime_context.api_project_id,
        operation: requested.operation,
        model: raw?.model ?? null,
        access_programs: raw?.access_programs ?? null,
        status: raw?.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'SUCCESS',
        source: raw?.receipt_id ? 'HOST_PROTECTED_OPERATION_RESULT' : 'HOST_OPERATION_RESULT_WITHOUT_RECEIPT',
        receipt_id: raw?.receipt_id ?? null,
        ...timing,
        entitlement: raw?.entitlement ?? null,
        error: null
      };
    } catch (error) {
      raw = {error: structuredError(error)};
      observation = {
        provider: requested.provider, surface: requested.surface,
        host_id: runtime_context.host_id, account_id: runtime_context.account_id,
        workspace_project_id: runtime_context.workspace_project_id, api_project_id: runtime_context.api_project_id,
        operation: requested.operation, model: requested.model, access_programs: requested.access_programs,
        status: 'ERROR', source: 'HOST_PROTECTED_OPERATION_RESULT', receipt_id: error?.receipt_id ?? null,
        ...timing, entitlement: null, error: structuredError(error)
      };
    }
  }
  return {
    schema_version: MPC_WORKSPACE_CONNECTIONS_VERSION,
    attempted_operation: typeof invoke === 'function',
    observation,
    assessment: assessProviderSelection(selection, observation, runtime_context, {now_utc: timing.observed_at_utc, max_age_ms: ttl_ms}),
    operation_result: raw === null ? null : safeReceipt(raw),
    credential_material_retained: false,
    automatic_provider_fallback: false
  };
}

export function redactConnectionReceipt(value) {
  return safeReceipt(value);
}
