import {createHash, randomUUID} from 'node:crypto';

import {boundedJsonLimits, parseBoundedJson} from './bounded-json.mjs';

export const MPC_WORKSPACE_TRANSFER_VERSION = 'MPC_WORKSPACE_TRANSFER_1.0';
export const MPC_WORKSPACE_TRANSFER_LIMITS = Object.freeze({
  // parseBoundedJson intentionally uses the repository-wide 2,000,000-byte
  // ceiling. It is slightly stricter than 2 MiB and therefore remains within
  // the portable-transfer limit on every supported host.
  max_envelope_bytes: boundedJsonLimits.maxBytes,
  max_total_item_bytes: boundedJsonLimits.maxBytes,
  max_item_bytes: boundedJsonLimits.maxBytes,
  max_items: 32,
  max_source_records: 32,
  max_native_receipts: 32
});

const ITEM_KINDS = new Set(['TEXT', 'FILE', 'SCRIPT_DRAFT']);
const ITEM_ENCODINGS = new Set(['UTF-8', 'BASE64']);
const HASH = /^[0-9a-f]{64}$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const MAX_JSON_DEPTH = 24;
const MAX_JSON_NODES = 100_000;

const IMPORT_POLICY = Object.freeze({
  content_is_data_only: true,
  execute_on_import: false,
  embedded_scripts: 'MANUAL_EXPORT_ONLY',
  native_receipts_are_historical: true,
  native_read_performed_on_import: false,
  project_overwrite_by_display_name: false,
  target_project_must_be_selected_by_user: true
});

const HASH_POLICY = Object.freeze({
  algorithm: 'SHA-256',
  item_scope: 'DECODED_ITEM_BYTES',
  envelope_scope: 'SORTED_KEY_JSON_EXCLUDING_ENVELOPE_SHA256'
});

const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

function fail(code, path = null) {
  const error = new TypeError(path === null ? code : `${code}:${path}`);
  error.code = code;
  if (path !== null) error.path = path;
  throw error;
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function validUnicode(value) {
  return typeof value === 'string' && Buffer.from(value, 'utf8').toString('utf8') === value;
}

function requiredText(value, code, path, maximum = 32_768) {
  if (!validUnicode(value) || !value.trim() || byteLength(value) > maximum) fail(code, path);
  return value;
}

function optionalText(value, code, path, maximum = 32_768) {
  if (value === undefined || value === null) return null;
  return requiredText(value, code, path, maximum);
}

function exactUtc(value, path) {
  const candidate = value instanceof Date ? value.toISOString() : value;
  if (typeof candidate !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(candidate) ||
      !Number.isFinite(Date.parse(candidate)) || new Date(candidate).toISOString() !== candidate) {
    fail('TRANSFER_UTC_TIMESTAMP_REQUIRED', path);
  }
  return candidate;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function exactKeys(value, allowed, code, path) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(code, `${path}.${key}`);
}

function copyJson(value, path = '$', depth = 0, budget = {nodes: 0}, ancestors = new WeakSet()) {
  if (++budget.nodes > MAX_JSON_NODES) fail('TRANSFER_JSON_NODE_LIMIT', path);
  if (depth > MAX_JSON_DEPTH) fail('TRANSFER_JSON_DEPTH_LIMIT', path);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('TRANSFER_JSON_NONFINITE_NUMBER', path);
    return value;
  }
  if (typeof value === 'string') {
    if (!validUnicode(value)) fail('TRANSFER_JSON_UTF8_STRING_REQUIRED', path);
    return value;
  }
  if (typeof value !== 'object') fail('TRANSFER_JSON_VALUE_REQUIRED', path);
  if (ancestors.has(value)) fail('TRANSFER_JSON_CYCLE', path);
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((child, index) => {
      if (!Object.hasOwn(value, index)) fail('TRANSFER_JSON_SPARSE_ARRAY', `${path}[${index}]`);
      return copyJson(child, `${path}[${index}]`, depth + 1, budget, ancestors);
    });
  } else {
    if (!plainObject(value)) fail('TRANSFER_PLAIN_JSON_OBJECT_REQUIRED', path);
    result = Object.fromEntries(Object.keys(value).map(key => {
      if (!validUnicode(key)) fail('TRANSFER_JSON_UTF8_STRING_REQUIRED', `${path}.<key>`);
      return [key, copyJson(value[key], `${path}.${key}`, depth + 1, budget, ancestors)];
    }));
  }
  ancestors.delete(value);
  return result;
}

function assertBoundedEnvelope(value) {
  let raw;
  try { raw = JSON.stringify(value); }
  catch { fail('TRANSFER_JSON_VALUE_REQUIRED', '$'); }
  if (raw === undefined || byteLength(raw) > MPC_WORKSPACE_TRANSFER_LIMITS.max_envelope_bytes) {
    fail('TRANSFER_ENVELOPE_BYTE_LIMIT', '$');
  }
  return raw;
}

function strictBase64(value, path) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !BASE64.test(value)) {
    fail('TRANSFER_ITEM_BASE64_INVALID', path);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) fail('TRANSFER_ITEM_BASE64_INVALID', path);
  return bytes;
}

function bytesFromEncodedItem(item, path) {
  if (!ITEM_ENCODINGS.has(item.encoding)) fail('TRANSFER_ITEM_ENCODING_INVALID', `${path}.encoding`);
  if (typeof item.content !== 'string') fail('TRANSFER_ITEM_CONTENT_REQUIRED', `${path}.content`);
  if (item.encoding === 'BASE64') return strictBase64(item.content, `${path}.content`);
  if (!validUnicode(item.content)) fail('TRANSFER_ITEM_TEXT_NOT_UTF8', `${path}.content`);
  return Buffer.from(item.content, 'utf8');
}

function validateTypedIdentity(value, path) {
  if (!plainObject(value)) fail('TRANSFER_SOURCE_IDENTITY_INVALID', path);
  for (const field of ['owner', 'namespace', 'native_id_type', 'native_id']) {
    requiredText(value[field], 'TRANSFER_SOURCE_IDENTITY_INVALID', `${path}.${field}`, 8_000);
  }
}

function validateIdentityFields(value, path) {
  const hasId = Object.hasOwn(value, 'native_id');
  const hasType = Object.hasOwn(value, 'native_id_type');
  if (hasId !== hasType) fail('TRANSFER_TYPED_NATIVE_ID_REQUIRED', path);
  if (hasId) {
    // Native IDs remain exact strings. native_id_type records the provider's
    // native type, including integer-like IDs that exceed JS safe precision.
    requiredText(value.native_id_type, 'TRANSFER_NATIVE_ID_TYPE_INVALID', `${path}.native_id_type`, 128);
    requiredText(value.native_id, 'TRANSFER_NATIVE_ID_STRING_REQUIRED', `${path}.native_id`, 32_768);
  }
  if (Object.hasOwn(value, 'source_id') && plainObject(value.source_id) &&
      (Object.hasOwn(value.source_id, 'native_id') || Object.hasOwn(value.source_id, 'native_id_type'))) {
    validateTypedIdentity(value.source_id, `${path}.source_id`);
  }
  if (Object.hasOwn(value, 'identity') && value.identity !== null) {
    validateTypedIdentity(value.identity, `${path}.identity`);
  }
}

function normalizeInputItem(value, index) {
  const path = `$.items[${index}]`;
  if (!plainObject(value)) fail('TRANSFER_ITEM_OBJECT_REQUIRED', path);
  const itemId = requiredText(value.item_id, 'TRANSFER_ITEM_ID_REQUIRED', `${path}.item_id`, 400);
  if (!ITEM_KINDS.has(value.kind)) fail('TRANSFER_ITEM_KIND_INVALID', `${path}.kind`);
  const name = requiredText(value.name, 'TRANSFER_ITEM_NAME_REQUIRED', `${path}.name`, 8_000);
  const mediaType = requiredText(value.media_type ?? (value.kind === 'TEXT' ? 'text/plain; charset=utf-8' :
    value.kind === 'SCRIPT_DRAFT' ? 'text/plain; charset=utf-8' : 'application/octet-stream'),
  'TRANSFER_ITEM_MEDIA_TYPE_REQUIRED', `${path}.media_type`, 1_000);

  const supplied = [Object.hasOwn(value, 'text'), Object.hasOwn(value, 'bytes'), Object.hasOwn(value, 'content')]
    .filter(Boolean).length;
  if (supplied !== 1) fail('TRANSFER_ITEM_EXACTLY_ONE_CONTENT_REQUIRED', path);
  let encoding, content, bytes;
  if (Object.hasOwn(value, 'text')) {
    if (!validUnicode(value.text)) fail('TRANSFER_ITEM_TEXT_NOT_UTF8', `${path}.text`);
    encoding = 'UTF-8'; content = value.text; bytes = Buffer.from(value.text, 'utf8');
  } else if (Object.hasOwn(value, 'bytes')) {
    if (!(value.bytes instanceof Uint8Array)) fail('TRANSFER_ITEM_BYTES_REQUIRED', `${path}.bytes`);
    bytes = Buffer.from(value.bytes); encoding = 'BASE64'; content = bytes.toString('base64');
  } else {
    encoding = value.encoding;
    bytes = bytesFromEncodedItem(value, path);
    content = value.content;
  }
  if ((value.kind === 'TEXT' || value.kind === 'SCRIPT_DRAFT') && encoding !== 'UTF-8') {
    fail('TRANSFER_TEXT_ITEM_UTF8_REQUIRED', `${path}.encoding`);
  }
  if (bytes.byteLength > MPC_WORKSPACE_TRANSFER_LIMITS.max_item_bytes) fail('TRANSFER_ITEM_BYTE_LIMIT', path);
  const script = value.kind === 'SCRIPT_DRAFT';
  return {
    item_id: itemId,
    kind: value.kind,
    name,
    media_type: mediaType,
    encoding,
    content,
    byte_length: bytes.byteLength,
    content_sha256: sha256(bytes),
    source_ref: optionalText(value.source_ref, 'TRANSFER_ITEM_SOURCE_REF_INVALID', `${path}.source_ref`, 8_000),
    relative_path: optionalText(value.relative_path, 'TRANSFER_ITEM_RELATIVE_PATH_INVALID', `${path}.relative_path`, 32_768),
    declared_origin: value.declared_origin === undefined || value.declared_origin === null ? null :
      copyJson(value.declared_origin, `${path}.declared_origin`),
    metadata: value.metadata === undefined || value.metadata === null ? null : copyJson(value.metadata, `${path}.metadata`),
    handling: {
      data_only: true,
      scripts_execute_on_import: false,
      manual_execution_required: script
    }
  };
}

function validateStoredItem(item, index) {
  const path = `$.items[${index}]`;
  if (!plainObject(item)) fail('TRANSFER_ITEM_OBJECT_REQUIRED', path);
  exactKeys(item, new Set(['item_id', 'kind', 'name', 'media_type', 'encoding', 'content', 'byte_length',
    'content_sha256', 'source_ref', 'relative_path', 'declared_origin', 'metadata', 'handling']),
  'TRANSFER_ITEM_FIELD_UNSUPPORTED', path);
  requiredText(item.item_id, 'TRANSFER_ITEM_ID_REQUIRED', `${path}.item_id`, 400);
  if (!ITEM_KINDS.has(item.kind)) fail('TRANSFER_ITEM_KIND_INVALID', `${path}.kind`);
  requiredText(item.name, 'TRANSFER_ITEM_NAME_REQUIRED', `${path}.name`, 8_000);
  requiredText(item.media_type, 'TRANSFER_ITEM_MEDIA_TYPE_REQUIRED', `${path}.media_type`, 1_000);
  optionalText(item.source_ref, 'TRANSFER_ITEM_SOURCE_REF_INVALID', `${path}.source_ref`, 8_000);
  optionalText(item.relative_path, 'TRANSFER_ITEM_RELATIVE_PATH_INVALID', `${path}.relative_path`, 32_768);
  if (item.declared_origin !== null) {
    copyJson(item.declared_origin, `${path}.declared_origin`);
    if (plainObject(item.declared_origin)) validateIdentityFields(item.declared_origin, `${path}.declared_origin`);
  }
  if (item.metadata !== null) copyJson(item.metadata, `${path}.metadata`);
  if (!plainObject(item.handling)) fail('TRANSFER_ITEM_HANDLING_INVALID', `${path}.handling`);
  exactKeys(item.handling, new Set(['data_only', 'scripts_execute_on_import', 'manual_execution_required']),
    'TRANSFER_ITEM_HANDLING_INVALID', `${path}.handling`);
  const script = item.kind === 'SCRIPT_DRAFT';
  if (item.handling.data_only !== true || item.handling.scripts_execute_on_import !== false ||
      item.handling.manual_execution_required !== script) fail('TRANSFER_ITEM_HANDLING_INVALID', `${path}.handling`);
  if ((item.kind === 'TEXT' || script) && item.encoding !== 'UTF-8') {
    fail('TRANSFER_TEXT_ITEM_UTF8_REQUIRED', `${path}.encoding`);
  }
  const bytes = bytesFromEncodedItem(item, path);
  if (bytes.byteLength > MPC_WORKSPACE_TRANSFER_LIMITS.max_item_bytes) fail('TRANSFER_ITEM_BYTE_LIMIT', path);
  if (!Number.isSafeInteger(item.byte_length) || item.byte_length < 0 || item.byte_length !== bytes.byteLength) {
    fail('TRANSFER_ITEM_BYTE_LENGTH_MISMATCH', `${path}.byte_length`);
  }
  if (typeof item.content_sha256 !== 'string' || !HASH.test(item.content_sha256) ||
      sha256(bytes) !== item.content_sha256) fail('TRANSFER_ITEM_HASH_MISMATCH', `${path}.content_sha256`);
  return bytes;
}

function normalizeSourceManifest(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MPC_WORKSPACE_TRANSFER_LIMITS.max_source_records) {
    fail('TRANSFER_SOURCE_MANIFEST_LIMIT', '$.source_manifest');
  }
  return value.map((record, index) => {
    const path = `$.source_manifest[${index}]`;
    if (!plainObject(record)) fail('TRANSFER_SOURCE_RECORD_OBJECT_REQUIRED', path);
    const copy = copyJson(record, path);
    validateIdentityFields(copy, path);
    const hasReference = typeof copy.source_ref === 'string' && copy.source_ref.trim() !== '';
    const hasIdentity = Object.hasOwn(copy, 'native_id') || plainObject(copy.source_id) || plainObject(copy.identity);
    if (!hasReference && !hasIdentity) fail('TRANSFER_SOURCE_RECORD_IDENTITY_REQUIRED', path);
    if (Object.hasOwn(copy, 'source_ref')) requiredText(copy.source_ref, 'TRANSFER_SOURCE_REF_INVALID', `${path}.source_ref`, 8_000);
    if (Object.hasOwn(copy, 'content_sha256') && copy.content_sha256 !== null &&
        (typeof copy.content_sha256 !== 'string' || !HASH.test(copy.content_sha256))) {
      fail('TRANSFER_SOURCE_HASH_INVALID', `${path}.content_sha256`);
    }
    return copy;
  });
}

function normalizeReceipts(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MPC_WORKSPACE_TRANSFER_LIMITS.max_native_receipts) {
    fail('TRANSFER_NATIVE_RECEIPT_LIMIT', '$.native_receipts');
  }
  return value.map((receipt, index) => {
    if (!plainObject(receipt)) fail('TRANSFER_NATIVE_RECEIPT_OBJECT_REQUIRED', `$.native_receipts[${index}]`);
    return copyJson(receipt, `$.native_receipts[${index}]`);
  });
}

function normalizeProjectMapping(value) {
  const path = '$.project_mapping';
  if (!plainObject(value)) fail('TRANSFER_PROJECT_MAPPING_REQUIRED', path);
  exactKeys(value, new Set(['exporting_project_id', 'exporting_project_name', 'selected_local_project_id']),
    'TRANSFER_PROJECT_MAPPING_FIELD_UNSUPPORTED', path);
  return {
    exporting_project_id: requiredText(value.exporting_project_id, 'TRANSFER_EXPORTING_PROJECT_ID_REQUIRED',
      `${path}.exporting_project_id`, 400),
    exporting_project_name: optionalText(value.exporting_project_name, 'TRANSFER_EXPORTING_PROJECT_NAME_INVALID',
      `${path}.exporting_project_name`, 8_000),
    selected_local_project_id: optionalText(value.selected_local_project_id, 'TRANSFER_SELECTED_PROJECT_ID_INVALID',
      `${path}.selected_local_project_id`, 400)
  };
}

function validatePolicy(actual, expected, code, path) {
  if (!plainObject(actual)) fail(code, path);
  exactKeys(actual, new Set(Object.keys(expected)), code, path);
  for (const [key, value] of Object.entries(expected)) if (actual[key] !== value) fail(code, `${path}.${key}`);
}

/**
 * Create a self-contained data envelope. Items accept exactly one of `text`,
 * `bytes`, or an already encoded `{encoding, content}` pair. Caller-provided
 * byte counts and hashes are never trusted; this function computes them.
 */
export function createTransferEnvelope({transfer_id, exporter, exported_at_utc, project_mapping, objective,
  items = [], source_manifest = [], pending_task = null, native_receipts = []} = {},
{id = randomUUID, clock = () => new Date()} = {}) {
  if (!plainObject(exporter)) fail('TRANSFER_EXPORTER_REQUIRED', '$.exporter');
  exactKeys(exporter, new Set(['application', 'version']), 'TRANSFER_EXPORTER_FIELD_UNSUPPORTED', '$.exporter');
  if (!Array.isArray(items) || items.length > MPC_WORKSPACE_TRANSFER_LIMITS.max_items) {
    fail('TRANSFER_ITEM_COUNT_LIMIT', '$.items');
  }
  const normalizedItems = items.map(normalizeInputItem);
  const itemIds = new Set();
  let total = 0;
  for (const item of normalizedItems) {
    if (itemIds.has(item.item_id)) fail('TRANSFER_DUPLICATE_ITEM_ID', `$.items.${item.item_id}`);
    itemIds.add(item.item_id); total += item.byte_length;
  }
  if (total > MPC_WORKSPACE_TRANSFER_LIMITS.max_total_item_bytes) fail('TRANSFER_TOTAL_ITEM_BYTE_LIMIT', '$.items');
  const body = {
    schema_version: MPC_WORKSPACE_TRANSFER_VERSION,
    transfer_id: transfer_id === undefined || transfer_id === null ? `TRANSFER-${id()}` :
      requiredText(transfer_id, 'TRANSFER_ID_REQUIRED', '$.transfer_id', 400),
    exporter: {
      application: requiredText(exporter.application, 'TRANSFER_EXPORTER_APPLICATION_REQUIRED', '$.exporter.application', 400),
      version: requiredText(exporter.version, 'TRANSFER_EXPORTER_VERSION_REQUIRED', '$.exporter.version', 400)
    },
    exported_at_utc: exactUtc(exported_at_utc ?? clock(), '$.exported_at_utc'),
    project_mapping: normalizeProjectMapping(project_mapping),
    objective: requiredText(objective, 'TRANSFER_OBJECTIVE_REQUIRED', '$.objective', 200_000),
    items: normalizedItems,
    source_manifest: normalizeSourceManifest(source_manifest),
    pending_task: pending_task === undefined ? null : copyJson(pending_task, '$.pending_task'),
    native_receipts: normalizeReceipts(native_receipts),
    import_policy: {...IMPORT_POLICY},
    hash_policy: {...HASH_POLICY}
  };
  const envelope = {...body, envelope_sha256: sha256(canonical(body))};
  assertBoundedEnvelope(envelope);
  return envelope;
}

/**
 * Validate every bounded field, decoded item length/hash, and finally the
 * canonical envelope hash. No callback, storage operation, native read, or
 * script execution is reachable from this verifier.
 */
export function verifyTransferEnvelope(value) {
  const envelope = copyJson(value);
  assertBoundedEnvelope(envelope);
  if (!plainObject(envelope)) fail('TRANSFER_ENVELOPE_OBJECT_REQUIRED', '$');
  exactKeys(envelope, new Set(['schema_version', 'transfer_id', 'exporter', 'exported_at_utc', 'project_mapping',
    'objective', 'items', 'source_manifest', 'pending_task', 'native_receipts', 'import_policy', 'hash_policy',
    'envelope_sha256']), 'TRANSFER_ENVELOPE_FIELD_UNSUPPORTED', '$');
  if (envelope.schema_version !== MPC_WORKSPACE_TRANSFER_VERSION) fail('TRANSFER_SCHEMA_VERSION_UNSUPPORTED', '$.schema_version');
  requiredText(envelope.transfer_id, 'TRANSFER_ID_REQUIRED', '$.transfer_id', 400);
  if (!plainObject(envelope.exporter)) fail('TRANSFER_EXPORTER_REQUIRED', '$.exporter');
  exactKeys(envelope.exporter, new Set(['application', 'version']), 'TRANSFER_EXPORTER_FIELD_UNSUPPORTED', '$.exporter');
  requiredText(envelope.exporter.application, 'TRANSFER_EXPORTER_APPLICATION_REQUIRED', '$.exporter.application', 400);
  requiredText(envelope.exporter.version, 'TRANSFER_EXPORTER_VERSION_REQUIRED', '$.exporter.version', 400);
  exactUtc(envelope.exported_at_utc, '$.exported_at_utc');
  normalizeProjectMapping(envelope.project_mapping);
  requiredText(envelope.objective, 'TRANSFER_OBJECTIVE_REQUIRED', '$.objective', 200_000);
  validatePolicy(envelope.import_policy, IMPORT_POLICY, 'TRANSFER_IMPORT_POLICY_INVALID', '$.import_policy');
  validatePolicy(envelope.hash_policy, HASH_POLICY, 'TRANSFER_HASH_POLICY_INVALID', '$.hash_policy');
  if (!Array.isArray(envelope.items) || envelope.items.length > MPC_WORKSPACE_TRANSFER_LIMITS.max_items) {
    fail('TRANSFER_ITEM_COUNT_LIMIT', '$.items');
  }
  const itemIds = new Set(), hashItems = new Map();
  let total = 0;
  const scriptItemIds = [];
  for (const [index, item] of envelope.items.entries()) {
    const bytes = validateStoredItem(item, index);
    if (itemIds.has(item.item_id)) fail('TRANSFER_DUPLICATE_ITEM_ID', `$.items[${index}].item_id`);
    itemIds.add(item.item_id); total += bytes.byteLength;
    if (!hashItems.has(item.content_sha256)) hashItems.set(item.content_sha256, []);
    hashItems.get(item.content_sha256).push(item.item_id);
    if (item.kind === 'SCRIPT_DRAFT') scriptItemIds.push(item.item_id);
  }
  if (total > MPC_WORKSPACE_TRANSFER_LIMITS.max_total_item_bytes) fail('TRANSFER_TOTAL_ITEM_BYTE_LIMIT', '$.items');
  normalizeSourceManifest(envelope.source_manifest);
  copyJson(envelope.pending_task, '$.pending_task');
  normalizeReceipts(envelope.native_receipts);
  if (typeof envelope.envelope_sha256 !== 'string' || !HASH.test(envelope.envelope_sha256)) {
    fail('TRANSFER_ENVELOPE_HASH_INVALID', '$.envelope_sha256');
  }
  const body = {...envelope};
  delete body.envelope_sha256;
  if (sha256(canonical(body)) !== envelope.envelope_sha256) {
    fail('TRANSFER_ENVELOPE_HASH_MISMATCH', '$.envelope_sha256');
  }
  return {
    valid: true,
    status: 'TRANSFER_VERIFIED',
    schema_version: envelope.schema_version,
    transfer_id: envelope.transfer_id,
    envelope_sha256: envelope.envelope_sha256,
    item_count: envelope.items.length,
    total_item_bytes: total,
    item_hashes: envelope.items.map(item => ({item_id: item.item_id, byte_length: item.byte_length,
      content_sha256: item.content_sha256})),
    duplicate_content: [...hashItems.entries()].filter(([, ids]) => ids.length > 1)
      .map(([content_sha256, item_ids]) => ({content_sha256, item_ids: [...item_ids]})),
    script_item_ids: scriptItemIds,
    scripts_executed: false,
    native_read_performed: false,
    source_authenticated: false
  };
}

/** Parse duplicate-key-safe bounded JSON and return it only after full verify. */
export function parseTransferEnvelope(input) {
  const envelope = parseBoundedJson(input, {
    maxBytes: MPC_WORKSPACE_TRANSFER_LIMITS.max_envelope_bytes,
    maxDepth: boundedJsonLimits.maxDepth,
    maxTokens: boundedJsonLimits.maxTokens
  });
  verifyTransferEnvelope(envelope);
  return envelope;
}

/** Serialize a verified envelope; the pretty form must still fit the cap. */
export function serializeTransferEnvelope(envelope, {pretty = false} = {}) {
  if (typeof pretty !== 'boolean') fail('TRANSFER_SERIALIZE_OPTIONS_INVALID', '$.pretty');
  verifyTransferEnvelope(envelope);
  const raw = JSON.stringify(envelope, null, pretty ? 2 : 0);
  if (byteLength(raw) > MPC_WORKSPACE_TRANSFER_LIMITS.max_envelope_bytes) {
    fail('TRANSFER_ENVELOPE_BYTE_LIMIT', '$');
  }
  return raw;
}

/** Return a new Buffer after independently checking one stored item's bytes. */
export function decodeTransferItem(item) {
  const copy = copyJson(item, '$.item');
  const bytes = validateStoredItem(copy, 0);
  return Buffer.from(bytes);
}

// Explicit aliases make the integration call sites read naturally while the
// shorter names remain convenient for tests and future non-UI consumers.
export const createWorkspaceTransfer = createTransferEnvelope;
export const verifyWorkspaceTransfer = verifyTransferEnvelope;
export const parseWorkspaceTransfer = parseTransferEnvelope;
