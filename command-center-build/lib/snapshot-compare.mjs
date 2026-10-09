import {createHash} from 'node:crypto';

/**
 * Pure, deterministic comparison of caller-supplied MPC Workspace inventories.
 * This module does no acquisition, filesystem work, network work, or mutation.
 * Native identity is the exact four-string tuple, never a filename or a hash.
 * A SHA-256 match describes supplied byte fingerprints, not factual truth or
 * source authentication. Removal means absence from the same inventory scope;
 * it does not assert deletion from a provider or from the user's computer.
 *
 * Manifest (all fields required except schema_version):
 * {snapshot_id, project_id, source_id, comparison_scope, version, content_sha256,
 *  acquisition_state, inventory_complete, entries}
 * source_id: native identity of this snapshot's source artifact/acquisition.
 * comparison_scope: identity of the SUBJECT collection being inventoried.
 * Both use {owner, namespace, native_id_type, native_id}, all exact strings.
 * Two sources (e.g. a Drive export and a local snapshot) may inventory the same
 * explicit collection. Their source identities are preserved independently.
 * Entry: {source_id, path, kind: 'FILE'|'FOLDER', version,
 *         content_sha256, acquisition_state, alias_of?, acquisition_reason?}
 * version/content_sha256 may be null to explicitly represent an unknown value.
 * alias_of is a direct native source_id, never an inferred filename match.
 * A projection alias is retained but contributes no extra native record unit.
 *
 * Five changes buckets are mutually exclusive. version_only is an explicit
 * subset of changes.changed, never an additional independently counted delta.
 */
export const SNAPSHOT_MANIFEST_VERSION = 'MPC_WORKSPACE_SNAPSHOT_1';
export const SNAPSHOT_DELTA_VERSION = 'MPC_WORKSPACE_SNAPSHOT_DELTA_1';
export const MAX_SNAPSHOT_ENTRIES = 100_000;
export const SNAPSHOT_ACQUISITION_STATES = Object.freeze([
  'PRESENT', 'UNAVAILABLE', 'UNREADABLE', 'NOT_ACQUIRED', 'ERROR'
]);

const ID_FIELDS = ['owner', 'namespace', 'native_id_type', 'native_id'];
const MANIFEST_FIELDS = ['schema_version', 'snapshot_id', 'project_id', 'source_id', 'comparison_scope',
  'version', 'content_sha256', 'acquisition_state', 'inventory_complete', 'entries'];
const ENTRY_FIELDS = ['source_id', 'path', 'kind', 'version', 'content_sha256',
  'acquisition_state', 'alias_of', 'acquisition_reason'];
const own = (object, key) => Object.hasOwn(object, key);
const copy = value => value === null ? null : structuredClone(value);
const compareStrings = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function fail(code, location) {
  const error = new TypeError(`${code}: ${location}`);
  error.code = code;
  error.location = location;
  throw error;
}

function dataObject(value, allowed, required, location) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail('INVALID_OBJECT', location);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) fail('UNKNOWN_FIELD', location);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!own(descriptor, 'value') || !descriptor.enumerable) fail('NON_JSON_PROPERTY', `${location}.${key}`);
  }
  for (const key of required) {
    if (!own(value, key)) fail('MISSING_FIELD', `${location}.${key}`);
  }
}

function exactString(value, location, max = 8192) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('INVALID_STRING', location);
}

function validateId(value, location) {
  dataObject(value, ID_FIELDS, ID_FIELDS, location);
  for (const field of ID_FIELDS) exactString(value[field], `${location}.${field}`);
}

// Tuple serialization is unambiguous even when a component contains punctuation.
function sourceKey(source) {
  return JSON.stringify(ID_FIELDS.map(field => source[field]));
}

function version(value, location) {
  if (value !== null) exactString(value, location);
}

function hash(value, location) {
  if (value !== null && (typeof value !== 'string' || !/^[a-fA-F0-9]{64}$/u.test(value))) {
    fail('INVALID_SHA256', location);
  }
}

function state(value, location) {
  if (!SNAPSHOT_ACQUISITION_STATES.includes(value)) fail('INVALID_ACQUISITION_STATE', location);
}

function validateEntry(entry, location) {
  dataObject(entry, ENTRY_FIELDS, ENTRY_FIELDS.slice(0, 6), location);
  validateId(entry.source_id, `${location}.source_id`);
  exactString(entry.path, `${location}.path`, 32768);
  if (!['FILE', 'FOLDER'].includes(entry.kind)) fail('INVALID_ENTRY_KIND', `${location}.kind`);
  version(entry.version, `${location}.version`);
  hash(entry.content_sha256, `${location}.content_sha256`);
  state(entry.acquisition_state, `${location}.acquisition_state`);
  if (own(entry, 'alias_of')) {
    validateId(entry.alias_of, `${location}.alias_of`);
    if (sourceKey(entry.alias_of) === sourceKey(entry.source_id)) fail('ALIAS_SELF_REFERENCE', location);
  }
  if (own(entry, 'acquisition_reason')) exactString(entry.acquisition_reason, `${location}.acquisition_reason`, 8000);
}

function validateManifest(manifest, side) {
  dataObject(manifest, MANIFEST_FIELDS, MANIFEST_FIELDS.slice(1), side);
  if (own(manifest, 'schema_version') && manifest.schema_version !== SNAPSHOT_MANIFEST_VERSION) {
    fail('UNSUPPORTED_SNAPSHOT_SCHEMA', `${side}.schema_version`);
  }
  exactString(manifest.snapshot_id, `${side}.snapshot_id`);
  exactString(manifest.project_id, `${side}.project_id`);
  validateId(manifest.source_id, `${side}.source_id`);
  validateId(manifest.comparison_scope, `${side}.comparison_scope`);
  version(manifest.version, `${side}.version`);
  hash(manifest.content_sha256, `${side}.content_sha256`);
  state(manifest.acquisition_state, `${side}.acquisition_state`);
  if (typeof manifest.inventory_complete !== 'boolean') fail('INVALID_INVENTORY_COMPLETENESS', side);
  if (!Array.isArray(manifest.entries)) fail('INVALID_ENTRIES', `${side}.entries`);
  if (manifest.entries.length > MAX_SNAPSHOT_ENTRIES) fail('SNAPSHOT_ENTRY_LIMIT', `${side}.entries`);
  for (const key of Reflect.ownKeys(manifest.entries)) {
    if (key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/u.test(key) ||
        Number(key) >= manifest.entries.length)) fail('NON_JSON_ARRAY_PROPERTY', `${side}.entries`);
    const descriptor = Object.getOwnPropertyDescriptor(manifest.entries, key);
    if (!own(descriptor, 'value')) fail('NON_JSON_PROPERTY', `${side}.entries`);
  }
  const all = new Map(), native = new Map(), aliases = new Map(), aliasesByTarget = new Map();
  for (let index = 0; index < manifest.entries.length; index++) {
    const entry = manifest.entries[index];
    validateEntry(entry, `${side}.entries[${index}]`);
    const key = sourceKey(entry.source_id);
    if (all.has(key)) fail('DUPLICATE_SOURCE_ENTRY', `${side}.entries[${index}]`);
    all.set(key, entry);
    if (own(entry, 'alias_of')) {
      aliases.set(key, entry);
      const targetKey = sourceKey(entry.alias_of);
      if (!aliasesByTarget.has(targetKey)) aliasesByTarget.set(targetKey, []);
      aliasesByTarget.get(targetKey).push(entry);
    } else native.set(key, entry);
  }
  for (const entry of aliases.values()) {
    const target = sourceKey(entry.alias_of);
    if (aliases.has(target)) fail('ALIAS_TARGET_IS_ALIAS', `${side}.entries`);
    if (native.has(target) && native.get(target).kind !== entry.kind) fail('ALIAS_KIND_CONFLICT', `${side}.entries`);
  }
  // An inaccessible subtree contradicts usable full coverage, even if the
  // supplied inventory_complete flag is true. Keep the declaration in receipt.
  const inaccessibleFolders = [...native.values()].filter(entry =>
    entry.kind === 'FOLDER' && entry.acquisition_state !== 'PRESENT');
  const aliasOnlyFolders = [...aliases.values()].filter(entry =>
    entry.kind === 'FOLDER' && !native.has(sourceKey(entry.alias_of)));
  const absenceEvidenceUsable = manifest.acquisition_state === 'PRESENT' &&
    manifest.inventory_complete && inaccessibleFolders.length === 0 && aliasOnlyFolders.length === 0;
  return {manifest, all, native, aliases, aliasesByTarget, inaccessibleFolders, aliasOnlyFolders, absenceEvidenceUsable};
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort(compareStrings).map(key =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

const fingerprint = value => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
const reason = (code, detail) => ({code, detail});

function versionComparison(left, right) {
  if (left === null || right === null) return 'UNKNOWN';
  return left === right ? 'MATCH' : 'DIFFERENT';
}

function contentComparison(left, right) {
  if (left === null || right === null) return 'UNKNOWN';
  return left.toLowerCase() === right.toLowerCase() ? 'MATCHING_SUPPLIED_SHA256' : 'DIFFERENT_SUPPLIED_SHA256';
}

function availabilityReasons(left, right, leftEntry, rightEntry) {
  const reasons = [];
  for (const [side, index, entry] of [['LEFT', left, leftEntry], ['RIGHT', right, rightEntry]]) {
    if (index.manifest.acquisition_state !== 'PRESENT') reasons.push(reason(`${side}_SNAPSHOT_SOURCE_NOT_ACQUIRED`,
      `${side.toLowerCase()} snapshot source acquisition state is ${index.manifest.acquisition_state}.`));
    if (entry && entry.acquisition_state !== 'PRESENT') reasons.push(reason(`${side}_ENTRY_NOT_ACQUIRED`,
      `${side.toLowerCase()} entry acquisition state is ${entry.acquisition_state}${entry.acquisition_reason ? `: ${entry.acquisition_reason}` : '.'}`));
  }
  return reasons;
}

function missingReasons(index, key, side, sameScope) {
  const reasons = [];
  if (index.aliases.has(key)) reasons.push(reason(`${side}_SOURCE_RECLASSIFIED_AS_ALIAS`,
    'This exact source identity is represented as an alias, not a native observation.'));
  if (index.aliasesByTarget.has(key)) reasons.push(reason(`${side}_NATIVE_SOURCE_ONLY_ALIAS`,
    'Only an explicit projection alias points to the missing native source; it is not a native read or proof of absence.'));
  if (!sameScope) reasons.push(reason('DIFFERENT_INVENTORY_SCOPE',
    'The exact typed subject/collection scope differs; completeness of another collection cannot prove absence.'));
  if (!index.manifest.inventory_complete) reasons.push(reason(`${side}_INVENTORY_PARTIAL`,
    'The supplied inventory does not declare complete coverage.'));
  if (index.inaccessibleFolders.length) reasons.push(reason(`${side}_UNAVAILABLE_SUBTREE`,
    'At least one native folder is not acquired, so omitted descendants cannot prove absence.'));
  if (index.aliasOnlyFolders.length) reasons.push(reason(`${side}_ALIAS_ONLY_SUBTREE`,
    'A folder is represented only by a projection alias, so native subtree coverage is unestablished.'));
  return reasons;
}

function compareRecord(key, left, right, sameScope) {
  const before = left.native.get(key) ?? null, after = right.native.get(key) ?? null;
  const result = {
    source_id: copy((before ?? after).source_id),
    status: 'unknown', change_kind: null, reasons: [],
    left: copy(before), right: copy(after),
    content_comparison: before && after ? contentComparison(before.content_sha256, after.content_sha256) : 'NOT_COMPARABLE',
    version_comparison: before && after ? versionComparison(before.version, after.version) : 'NOT_COMPARABLE',
    metadata_changes: before && after ? ['path', 'kind'].filter(field => before[field] !== after[field]) : []
  };
  result.reasons.push(...availabilityReasons(left, right, before, after));
  if (!before || !after) {
    const missingSide = before ? 'RIGHT' : 'LEFT', missingIndex = before ? right : left;
    result.reasons.push(...missingReasons(missingIndex, key, missingSide, sameScope));
    if (result.reasons.length || !missingIndex.absenceEvidenceUsable) return result;
    result.status = before ? 'removed' : 'added';
    result.change_kind = 'INVENTORY_MEMBERSHIP';
    result.reasons.push(reason(before ? 'ABSENT_FROM_COMPLETE_RIGHT_INVENTORY' : 'ABSENT_FROM_COMPLETE_LEFT_INVENTORY',
      `${missingSide.toLowerCase()} acquired inventory declares complete coverage of the same typed scope and omits this native identity.`));
    return result;
  }
  if (result.reasons.length) return result;

  const hashChanged = result.content_comparison === 'DIFFERENT_SUPPLIED_SHA256';
  const hashMatched = result.content_comparison === 'MATCHING_SUPPLIED_SHA256';
  const versionChanged = result.version_comparison === 'DIFFERENT';
  const metadataChanged = result.metadata_changes.length > 0;
  if (hashChanged || versionChanged || metadataChanged) {
    result.status = 'changed';
    if (hashChanged) {
      result.change_kind = 'CONTENT';
      result.reasons.push(reason(result.version_comparison === 'MATCH' ? 'HASH_CHANGED_AT_SAME_DECLARED_VERSION' : 'CONTENT_HASH_CHANGED',
        'Both supplied SHA-256 values are present and differ; this identifies a supplied fingerprint difference only.'));
    } else if (versionChanged && hashMatched && !metadataChanged) {
      result.change_kind = 'VERSION_ONLY';
      result.reasons.push(reason('VERSION_ONLY_WITH_MATCHING_CONTENT_HASH',
        'The exact version strings differ while the supplied content hashes and recorded path/kind match.'));
    } else {
      result.change_kind = hashMatched ? 'METADATA_WITH_MATCHING_CONTENT_HASH' : 'METADATA_WITH_CONTENT_UNKNOWN';
    }
    if (versionChanged && result.change_kind !== 'VERSION_ONLY') result.reasons.push(reason('DECLARED_VERSION_CHANGED',
      'Both version values are present and their exact strings differ.'));
    if (metadataChanged) result.reasons.push(reason('RECORDED_METADATA_CHANGED',
      `Recorded ${result.metadata_changes.join(' and ')} differ for the same native identity.`));
    if (result.content_comparison === 'UNKNOWN') result.reasons.push(reason('CONTENT_COMPARISON_UNAVAILABLE',
      'At least one supplied content hash is null; no content-equality conclusion follows.'));
    return result;
  }

  if (before.kind === 'FOLDER' && before.content_sha256 === null && after.content_sha256 === null &&
      before.version === after.version) {
    result.status = 'unchanged'; result.change_kind = 'FOLDER_METADATA_ONLY';
    result.content_comparison = 'NOT_APPLICABLE_FOLDER_METADATA';
    result.reasons.push(reason('FOLDER_RECORDED_METADATA_MATCH',
      'The acquired folder identities, recorded path/kind and nullable version fields match; no observed version is inferred from null, and descendant contents are compared as separate entries.'));
  } else if (hashMatched && result.version_comparison === 'MATCH') {
    result.status = 'unchanged'; result.change_kind = 'RECORDED_CONTENT_AND_VERSION';
    result.reasons.push(reason('CONTENT_HASH_AND_VERSION_MATCH',
      'The supplied content fingerprints, exact version strings and recorded path/kind match.'));
  } else {
    if (!hashMatched) result.reasons.push(reason('CONTENT_COMPARISON_UNAVAILABLE',
      'At least one supplied content hash is null; unchanged file content is unestablished.'));
    if (result.version_comparison === 'UNKNOWN') result.reasons.push(reason('VERSION_COMPARISON_UNAVAILABLE',
      'At least one version is null; matching content hashes alone cannot establish an unchanged version.'));
  }
  return result;
}

function aliasReceipt(index) {
  return [...index.aliases.values()].sort((a, b) => compareStrings(sourceKey(a.source_id), sourceKey(b.source_id))).map(entry => {
    const target = index.native.get(sourceKey(entry.alias_of));
    return {
      ...copy(entry), evidence_units_added: 0,
      target_resolution: target ? `NATIVE_ENTRY_${target.acquisition_state}` :
        'ALIAS_ONLY_NATIVE_NOT_ACQUIRED'
    };
  });
}

function binding(index) {
  const manifest = index.manifest;
  return {
    snapshot_id: manifest.snapshot_id, project_id: manifest.project_id,
    source_id: copy(manifest.source_id), comparison_scope: copy(manifest.comparison_scope), version: manifest.version,
    supplied_content_sha256: manifest.content_sha256,
    acquisition_state: manifest.acquisition_state,
    inventory_complete_declared: manifest.inventory_complete,
    absence_evidence_usable: index.absenceEvidenceUsable,
    manifest_fingerprint_sha256: fingerprint(manifest),
    native_record_units: index.native.size, alias_records: index.aliases.size
  };
}

function inventoryAssessment(left, right, sameScope) {
  const reasons = availabilityReasons(left, right, null, null);
  if (!sameScope) reasons.push(reason('DIFFERENT_INVENTORY_SCOPE',
    'Only records with the same exact native identity can be directly compared across these different subject collections.'));
  for (const [side, index] of [['LEFT', left], ['RIGHT', right]]) {
    if (!index.manifest.inventory_complete) reasons.push(reason(`${side}_INVENTORY_PARTIAL`,
      'The supplied inventory does not declare complete coverage.'));
    if (index.inaccessibleFolders.length) reasons.push(reason(`${side}_UNAVAILABLE_SUBTREE`,
      'An unacquired native folder prevents proof from an omitted entry.'));
    if (index.aliasOnlyFolders.length) reasons.push(reason(`${side}_ALIAS_ONLY_SUBTREE`,
      'An alias-only folder does not establish native subtree coverage.'));
  }
  const unavailable = [left, right].some(index => index.manifest.acquisition_state !== 'PRESENT');
  return {
    status: unavailable ? 'UNAVAILABLE_SCOPE' : !sameScope ? 'DIFFERENT_SCOPE' :
      left.absenceEvidenceUsable && right.absenceEvidenceUsable ? 'COMPLETE_DECLARED_SCOPE' : 'PARTIAL_SCOPE',
    reasons,
    left_absence_can_be_established: sameScope && left.absenceEvidenceUsable,
    right_absence_can_be_established: sameScope && right.absenceEvidenceUsable
  };
}

/** Compare validated data only; malformed inputs throw a typed, visible error. */
export function compareSnapshotManifests(leftManifest, rightManifest) {
  const left = validateManifest(leftManifest, 'left'), right = validateManifest(rightManifest, 'right');
  if (leftManifest.project_id !== rightManifest.project_id) fail('PROJECT_ID_MISMATCH', 'project_id');
  const sameScope = sourceKey(leftManifest.comparison_scope) === sourceKey(rightManifest.comparison_scope);
  const sameSnapshotSource = sourceKey(leftManifest.source_id) === sourceKey(rightManifest.source_id);
  const changes = {added: [], removed: [], changed: [], unchanged: [], unknown: []};
  const keys = [...new Set([...left.native.keys(), ...right.native.keys()])].sort(compareStrings);
  for (const key of keys) {
    const delta = compareRecord(key, left, right, sameScope);
    changes[delta.status].push(delta);
  }
  const leftBinding = binding(left), rightBinding = binding(right);
  const versionOnly = changes.changed.filter(delta => delta.change_kind === 'VERSION_ONLY').map(copy);
  const summary = Object.fromEntries(Object.entries(changes).map(([key, values]) => [key, values.length]));
  return {
    contract: SNAPSHOT_DELTA_VERSION,
    receipt_id: `snapshot-delta:${fingerprint({contract: SNAPSHOT_DELTA_VERSION, left: leftBinding, right: rightBinding})}`,
    project_id: leftManifest.project_id,
    work_stage: 'ANALYZED',
    comparison_basis: 'CALLER_SUPPLIED_TYPED_SNAPSHOT_MANIFESTS',
    same_inventory_scope: sameScope,
    inventory_comparison: inventoryAssessment(left, right, sameScope),
    source_binding: {left: leftBinding, right: rightBinding},
    snapshot_source_comparison: {
      same_source_identity: sameSnapshotSource,
      version_comparison: sameSnapshotSource ? versionComparison(leftManifest.version, rightManifest.version) : 'NOT_COMPARABLE_DIFFERENT_SOURCES',
      supplied_content_comparison: contentComparison(leftManifest.content_sha256, rightManifest.content_sha256)
    },
    changes,
    version_only: versionOnly,
    version_only_is_subset_of_changed: true,
    aliases: {left: aliasReceipt(left), right: aliasReceipt(right), evidence_units_added: 0},
    summary: {...summary, version_only: versionOnly.length, native_records_compared: keys.length,
      native_records_left: left.native.size, native_records_right: right.native.size,
      alias_records_left: left.aliases.size, alias_records_right: right.aliases.size},
    removal_meaning: 'ABSENT_FROM_SAME_DECLARED_INVENTORY_SCOPE_NOT_PROVIDER_DELETION',
    source_authentication: false,
    factual_truth_established: false,
    independent_evidence_count_established: false,
    filesystem_access: false,
    network_access: false
  };
}
