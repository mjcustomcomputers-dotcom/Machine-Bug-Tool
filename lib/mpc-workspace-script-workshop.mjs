import {createHash, randomUUID} from 'node:crypto';

import {ingestText} from './mpc-workspace-ingest.mjs';

export const MPC_WORKSPACE_SCRIPT_VERSION = 'MPC_WORKSPACE_SCRIPT_1';
const LANGUAGES = new Set(['POWERSHELL', 'PYTHON', 'SHELL']);
const SECRET_KEY = /(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|private[_-]?key)/iu;
const EMBEDDED_SECRET = /(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._~+/-]{20,}|(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*['"][^'"$<{][^'"]{7,}['"])/iu;
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = code => { const error = new TypeError(code); error.code = code; throw error; };
const requiredText = (value, code, limit = 100_000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) fail(code);
  return value;
};
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ?
  `[${value.map(canonical).join(',')}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const iso = value => {
  const result = value instanceof Date ? value.toISOString() : String(value);
  if (!Number.isFinite(Date.parse(result))) fail('VALID_UTC_TIMESTAMP_REQUIRED');
  return result;
};
const strings = (value, code, limit = 64) => {
  if (!Array.isArray(value) || value.length > limit || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 2_000)) fail(code);
  return [...value];
};

function safeData(value, depth = 0, budget = {nodes: 0}) {
  if (++budget.nodes > 10_000 || depth > 12) fail('SCRIPT_PARAMETER_COMPLEXITY_LIMIT');
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.length > 20_000) fail('SCRIPT_PARAMETER_STRING_LIMIT');
    return value;
  }
  if (Array.isArray(value)) return value.map(item => safeData(item, depth + 1, budget));
  if (!plainObject(value)) fail('SCRIPT_PARAMETER_JSON_REQUIRED');
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) fail('SCRIPT_CREDENTIAL_PARAMETER_REJECTED');
    output[key] = safeData(child, depth + 1, budget);
  }
  return output;
}
function verifyScript(value) {
  if (!plainObject(value) || value.schema_version !== MPC_WORKSPACE_SCRIPT_VERSION || !['DRAFT', 'EXPORTED_FOR_MANUAL_RUN', 'OUTPUT_INGESTED'].includes(value.state)) fail('VALID_SCRIPT_ARTIFACT_REQUIRED');
  if (sha256(value.content) !== value.content_sha256) fail('SCRIPT_CONTENT_HASH_MISMATCH');
  return value;
}
/** Create an explained artifact only. It is never executed by this operation. */
export function createScriptDraft({project_id, task_id, language, goal, content, target_parameters = {}, reads = [], changes = [],
  prerequisites = [], expected_output, output_schema = null, timeout_seconds = null, rate_limits = [], dry_run_supported = false,
  created_at_utc} = {}, {id = randomUUID, clock = () => new Date()} = {}) {
  requiredText(project_id, 'PROJECT_ID_REQUIRED', 200);
  requiredText(task_id, 'TASK_ID_REQUIRED', 200);
  if (!LANGUAGES.has(language)) fail('SCRIPT_LANGUAGE_UNSUPPORTED');
  requiredText(goal, 'SCRIPT_GOAL_REQUIRED', 4_000);
  requiredText(content, 'SCRIPT_CONTENT_REQUIRED', 200_000);
  requiredText(expected_output, 'SCRIPT_EXPECTED_OUTPUT_REQUIRED', 8_000);
  if (EMBEDDED_SECRET.test(content)) fail('EMBEDDED_CREDENTIAL_REJECTED');
  if (typeof dry_run_supported !== 'boolean') fail('DRY_RUN_FLAG_REQUIRED');
  if (timeout_seconds !== null && (!Number.isSafeInteger(timeout_seconds) || timeout_seconds < 1 || timeout_seconds > 86_400)) fail('SCRIPT_TIMEOUT_INVALID');
  const body = {
    schema_version: MPC_WORKSPACE_SCRIPT_VERSION,
    script_id: `SCRIPT-${id()}`,
    project_id,
    task_id,
    state: 'DRAFT',
    language,
    goal,
    content,
    content_sha256: sha256(content),
    target_parameters: safeData(target_parameters),
    reads: strings(reads, 'SCRIPT_READS_INVALID'),
    changes: strings(changes, 'SCRIPT_CHANGES_INVALID'),
    prerequisites: strings(prerequisites, 'SCRIPT_PREREQUISITES_INVALID'),
    expected_output,
    output_schema: output_schema === null ? null : safeData(output_schema),
    timeout_seconds,
    rate_limits: strings(rate_limits, 'SCRIPT_RATE_LIMITS_INVALID'),
    dry_run_supported,
    created_at_utc: iso(created_at_utc ?? clock()),
    execution_observed: false,
    external_action_performed: false,
    history: []
  };
  return {...body, artifact_sha256: sha256(canonical(body))};
}

/** Mark the user-facing copy/save handoff; do not claim that the script ran. */
export function markScriptExported(draft, {host_id = null, export_locator = null, exported_at_utc} = {}, {clock = () => new Date()} = {}) {
  verifyScript(draft);
  if (draft.state !== 'DRAFT') fail('SCRIPT_DRAFT_REQUIRED');
  if (host_id !== null) requiredText(host_id, 'SCRIPT_EXPORT_HOST_INVALID', 200);
  if (export_locator !== null) requiredText(export_locator, 'SCRIPT_EXPORT_LOCATOR_INVALID', 32_768);
  const event = {
    state: 'EXPORTED_FOR_MANUAL_RUN',
    observed_at_utc: iso(exported_at_utc ?? clock()),
    host_id,
    export_locator,
    execution_observed: false
  };
  const body = {...structuredClone(draft), state: event.state, exported_at_utc: event.observed_at_utc,
    export_host_id: host_id, export_locator, execution_observed: false,
    history: [...draft.history, event]};
  delete body.artifact_sha256;
  return {...body, artifact_sha256: sha256(canonical(body))};
}

/**
 * Bind pasted/selected returned output to the exact script hash. User-supplied
 * output is acquired evidence, not authenticated proof that this app executed it.
 */
export function ingestScriptOutput(exported, {output, output_name = 'Manual script output', observed_run_time = null,
  observed_host_id = null, exit_status = null, retain_raw = false, retention_authorization_ref = null,
  execution_receipt = null, ingested_at_utc} = {}, {id = randomUUID, clock = () => new Date()} = {}) {
  verifyScript(exported);
  if (exported.state !== 'EXPORTED_FOR_MANUAL_RUN') fail('EXPORTED_SCRIPT_REQUIRED');
  if (typeof output !== 'string') fail('SCRIPT_OUTPUT_TEXT_REQUIRED');
  if (observed_run_time !== null) iso(observed_run_time);
  if (observed_host_id !== null) requiredText(observed_host_id, 'SCRIPT_OUTPUT_HOST_INVALID', 200);
  if (exit_status !== null && !Number.isSafeInteger(exit_status)) fail('SCRIPT_EXIT_STATUS_INVALID');
  if (execution_receipt !== null) {
    if (!plainObject(execution_receipt) || execution_receipt.status !== 'SUCCEEDED') fail('VALID_EXECUTION_RECEIPT_REQUIRED');
    requiredText(execution_receipt.receipt_id, 'EXECUTION_RECEIPT_ID_REQUIRED', 400);
    if (execution_receipt.script_sha256 !== exported.content_sha256) fail('EXECUTION_RECEIPT_SCRIPT_MISMATCH');
  }
  const at = iso(ingested_at_utc ?? clock());
  const acquisition = ingestText({
    project_id: exported.project_id,
    text: output,
    name: output_name,
    format_hint: 'TEXT',
    retain_raw,
    retention_authorization_ref,
    source_id: `SCRIPT-OUTPUT-${id()}`,
    observed_at_utc: at
  }, {id});
  const event = {
    state: 'OUTPUT_INGESTED',
    observed_at_utc: at,
    source_script_sha256: exported.content_sha256,
    output_acquisition_id: acquisition.acquisition_id,
    user_supplied_output: execution_receipt === null,
    execution_observed: execution_receipt !== null
  };
  const body = {...structuredClone(exported), state: event.state, output_acquisition: acquisition,
    observed_run_time, observed_host_id, exit_status,
    execution_receipt: execution_receipt === null ? null : safeData(execution_receipt),
    execution_observed: execution_receipt !== null,
    history: [...exported.history, event]};
  delete body.artifact_sha256;
  return {...body, artifact_sha256: sha256(canonical(body))};
}

export function verifyScriptArtifact(value) {
  verifyScript(value);
  const body = structuredClone(value); delete body.artifact_sha256;
  return {
    valid: value.artifact_sha256 === sha256(canonical(body)),
    state: value.state,
    script_id: value.script_id,
    execution_observed: value.execution_observed
  };
}
