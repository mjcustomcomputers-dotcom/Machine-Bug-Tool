import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSnapshotManifests, SNAPSHOT_MANIFEST_VERSION, MAX_SNAPSHOT_ENTRIES} from '../lib/snapshot-compare.mjs';

// Owned, synthetic manifests only. These tests do not acquire Drive, inspect
// Windows folders, authenticate a source, or establish provider-side deletion.
const H1 = 'a'.repeat(64), H2 = 'b'.repeat(64);
const id = (native_id, extra = {}) => ({owner: 'operator-a', namespace: 'GOOGLE_DRIVE', native_id_type: 'file_id', native_id, ...extra});
const COLLECTION = id('collection-a', {namespace: 'MPC_WORKSPACE', native_id_type: 'collection_id'});
function file(native_id = 'file-a', extra = {}) {
  return {source_id: id(native_id), path: `folder/${native_id}.txt`, kind: 'FILE', version: '1',
    content_sha256: H1, acquisition_state: 'PRESENT', ...extra};
}
function folder(native_id = 'folder-a', extra = {}) {
  return file(native_id, {path: `folder/${native_id}`, kind: 'FOLDER', content_sha256: null, ...extra});
}
function alias(native_id = 'dash-a', target = id('file-a'), extra = {}) {
  return file(native_id, {source_id: id(native_id, {namespace: 'DROPBOX_DASH', native_id_type: 'index_record_id'}),
    alias_of: target, ...extra});
}
function snapshot(snapshot_id = 'left', entries = [file()], extra = {}) {
  return {schema_version: SNAPSHOT_MANIFEST_VERSION, snapshot_id, project_id: 'project-a', source_id: id(`snapshot-source-${snapshot_id}`),
    comparison_scope: COLLECTION,
    version: snapshot_id === 'left' ? 'inventory-1' : 'inventory-2', content_sha256: null,
    acquisition_state: 'PRESENT', inventory_complete: true, entries, ...extra};
}
const compare = (before = [file()], after = [file()], left = {}, right = {}) =>
  compareSnapshotManifests(snapshot('left', before, left), snapshot('right', after, right));
const codes = delta => delta.reasons.map(row => row.code);
const only = (receipt, status) => {assert.equal(receipt.changes[status].length, 1); return receipt.changes[status][0];};

test('complete same-scope manifests classify native membership and content deltas', () => {
  const result = compare([file('same'), file('changed'), file('removed')],
    [file('same'), file('changed', {version: '2', content_sha256: H2}), file('added')]);
  assert.deepEqual(Object.fromEntries(['added', 'removed', 'changed', 'unchanged', 'unknown'].map(k => [k, result.summary[k]])),
    {added: 1, removed: 1, changed: 1, unchanged: 1, unknown: 0});
  assert.equal(result.summary.native_records_compared, 4);
  assert.equal(only(result, 'removed').source_id.native_id, 'removed');
  assert.equal(only(result, 'added').source_id.native_id, 'added');
  assert.equal(only(result, 'changed').change_kind, 'CONTENT');
  assert.equal(result.factual_truth_established, false);
});

test('project identity mismatch fails without coercion or cross-project delta', () => {
  assert.throws(() => compare([], [], {}, {project_id: 'project-b'}), /PROJECT_ID_MISMATCH/);
  assert.throws(() => compare([], [], {project_id: 1}, {project_id: '1'}), /INVALID_STRING/);
  assert.throws(() => compare([], [], {project_id: 'project-a '}, {}), /PROJECT_ID_MISMATCH/);
});

test('same filename with different native owner or native id remains distinct', () => {
  const original = file('shared', {path: 'same.txt'});
  const differentOwner = {...original, source_id: id('shared', {owner: 'operator-b'})};
  const differentId = {...original, source_id: id('different')};
  for (const other of [differentOwner, differentId]) {
    const result = compare([original], [other]);
    assert.equal(result.summary.removed, 1); assert.equal(result.summary.added, 1);
    assert.equal(result.summary.unchanged, 0); assert.equal(result.summary.native_records_compared, 2);
  }
});

test('namespace and native_id_type are exact independent identity coordinates', () => {
  for (const change of [{namespace: 'DROPBOX'}, {native_id_type: 'revision_id'}]) {
    const result = compare([file()], [file('file-a', {source_id: id('file-a', change)})]);
    assert.equal(result.summary.added, 1); assert.equal(result.summary.removed, 1);
  }
});

test('numeric-looking IDs preserve leading zeros and values beyond safe integer precision', () => {
  for (const [a, b] of [['001', '1'], ['9007199254740992', '9007199254740993']]) {
    const result = compare([file(a)], [file(b)]);
    assert.equal(result.summary.native_records_compared, 2); assert.equal(result.summary.unchanged, 0);
  }
  assert.throws(() => compare([file('x', {source_id: id(1)})], []), /INVALID_STRING/);
});

test('tuple identity cannot collide through string separator ambiguity', () => {
  const a = file('same', {source_id: id('same', {owner: 'a:b', namespace: 'c'})});
  const b = file('same', {source_id: id('same', {owner: 'a', namespace: 'b:c'})});
  assert.equal(compare([a], [b]).summary.native_records_compared, 2);
});

test('an exact native identity moved to another path is a metadata change', () => {
  const result = compare([file()], [file('file-a', {path: 'new-folder/renamed.txt'})]);
  const delta = only(result, 'changed');
  assert.deepEqual(delta.metadata_changes, ['path']);
  assert.equal(delta.change_kind, 'METADATA_WITH_MATCHING_CONTENT_HASH');
  assert.equal(result.summary.removed, 0); assert.equal(result.summary.added, 0);
});

test('equal hashes with a new exact version appear in the version-only subset', () => {
  const result = compare([file()], [file('file-a', {version: '2'})]);
  assert.equal(only(result, 'changed').change_kind, 'VERSION_ONLY');
  assert.equal(result.version_only.length, 1); assert.equal(result.summary.version_only, 1);
  assert.equal(result.version_only_is_subset_of_changed, true);
  assert.equal(result.summary.native_records_compared, 1);
});

test('version strings preserve leading zeros and are never number-coerced', () => {
  const result = compare([file('a', {version: '001'})], [file('a', {version: '1'})]);
  assert.equal(result.version_only.length, 1);
  assert.throws(() => compare([file('a', {version: 1})], []), /INVALID_STRING/);
});

test('a version and path change with equal hashes is not called version-only', () => {
  const result = compare([file()], [file('file-a', {version: '2', path: 'new.txt'})]);
  assert.equal(result.summary.version_only, 0);
  assert.equal(only(result, 'changed').change_kind, 'METADATA_WITH_MATCHING_CONTENT_HASH');
});

test('different hashes at the same declared version remain an explicit content discrepancy', () => {
  const delta = only(compare([file()], [file('file-a', {content_sha256: H2})]), 'changed');
  assert.ok(codes(delta).includes('HASH_CHANGED_AT_SAME_DECLARED_VERSION'));
  assert.equal(delta.content_comparison, 'DIFFERENT_SUPPLIED_SHA256');
});

test('uppercase and lowercase hexadecimal encode the same supplied fingerprint', () => {
  const result = compare([file('a', {content_sha256: H1.toUpperCase()})], [file('a')]);
  assert.equal(result.summary.unchanged, 1);
  assert.equal(result.changes.unchanged[0].left.content_sha256, H1.toUpperCase());
});

test('missing content hashes do not make matching version metadata an unchanged file', () => {
  const delta = only(compare([file('a', {content_sha256: null})], [file('a', {content_sha256: null})]), 'unknown');
  assert.ok(codes(delta).includes('CONTENT_COMPARISON_UNAVAILABLE'));
});

test('matching content with unknown version preserves that uncertainty', () => {
  const delta = only(compare([file('a', {version: null})], [file('a', {version: null})]), 'unknown');
  assert.equal(delta.content_comparison, 'MATCHING_SUPPLIED_SHA256');
  assert.ok(codes(delta).includes('VERSION_COMPARISON_UNAVAILABLE'));
});

test('a known version change with an unknown hash is not called content change or version-only', () => {
  const result = compare([file('a', {content_sha256: null})], [file('a', {version: '2', content_sha256: null})]);
  assert.equal(only(result, 'changed').change_kind, 'METADATA_WITH_CONTENT_UNKNOWN');
  assert.equal(result.summary.version_only, 0);
});

test('folder metadata comparison does not claim descendant content equality', () => {
  const delta = only(compare([folder()], [folder()]), 'unchanged');
  assert.equal(delta.change_kind, 'FOLDER_METADATA_ONLY');
  assert.equal(delta.content_comparison, 'NOT_APPLICABLE_FOLDER_METADATA');
});

test('a folder with an unobserved earlier version cannot be called unchanged at an observed later version', () => {
  const result = compare([folder('folder-a', {version: null})], [folder('folder-a', {version: '1'})]);
  assert.equal(result.summary.unchanged, 0);
  assert.ok(codes(only(result, 'unknown')).includes('VERSION_COMPARISON_UNAVAILABLE'));
});

test('a missing entry is removed only from a complete matching right inventory', () => {
  const removed = only(compare([file()], []), 'removed');
  assert.ok(codes(removed).includes('ABSENT_FROM_COMPLETE_RIGHT_INVENTORY'));
  const unknown = only(compare([file()], [], {}, {inventory_complete: false}), 'unknown');
  assert.ok(codes(unknown).includes('RIGHT_INVENTORY_PARTIAL'));
});

test('a newly seen entry is added only when the left inventory proves prior scoped absence', () => {
  assert.equal(compare([], [file()]).summary.added, 1);
  const delta = only(compare([], [file()], {inventory_complete: false}), 'unknown');
  assert.ok(codes(delta).includes('LEFT_INVENTORY_PARTIAL'));
});

for (const state of ['UNAVAILABLE', 'UNREADABLE', 'NOT_ACQUIRED', 'ERROR']) {
  test(`an ${state} root never turns unavailable files into removals`, () => {
    const result = compare([file()], [], {}, {acquisition_state: state});
    assert.equal(result.summary.removed, 0);
    assert.ok(codes(only(result, 'unknown')).includes('RIGHT_SNAPSHOT_SOURCE_NOT_ACQUIRED'));
    assert.equal(result.source_binding.right.inventory_complete_declared, true);
    assert.equal(result.source_binding.right.absence_evidence_usable, false);
  });
}

test('unavailable root state also prevents fresh addition and matched-content promotion', () => {
  assert.equal(compare([], [file()], {acquisition_state: 'UNAVAILABLE'}).summary.added, 0);
  const result = compare([file()], [file()], {}, {acquisition_state: 'UNAVAILABLE'});
  assert.equal(result.summary.unchanged, 0); assert.equal(result.summary.unknown, 1);
});

test('unavailable empty inventories retain explicit root uncertainty even with zero entry deltas', () => {
  const result = compare([], [], {}, {acquisition_state: 'UNAVAILABLE'});
  assert.equal(result.summary.native_records_compared, 0);
  assert.equal(result.inventory_comparison.status, 'UNAVAILABLE_SCOPE');
  assert.equal(result.inventory_comparison.right_absence_can_be_established, false);
  assert.ok(result.inventory_comparison.reasons.some(row => row.code === 'RIGHT_SNAPSHOT_SOURCE_NOT_ACQUIRED'));
});

test('an explicitly unreadable file is unknown even with retained hash/version metadata', () => {
  const unreadable = file('file-a', {acquisition_state: 'UNREADABLE', acquisition_reason: 'Synthetic access denied'});
  const result = compare([file()], [unreadable]);
  const delta = only(result, 'unknown');
  assert.ok(codes(delta).includes('RIGHT_ENTRY_NOT_ACQUIRED'));
  assert.match(delta.reasons[0].detail, /Synthetic access denied/);
  assert.equal(result.summary.removed, 0); assert.equal(result.summary.unchanged, 0);
});

test('an inaccessible subtree prevents claimed absence even if the complete flag is true', () => {
  const result = compare([folder(), file('child')], [folder('folder-a', {acquisition_state: 'UNAVAILABLE'})]);
  assert.equal(result.summary.removed, 0); assert.equal(result.summary.unknown, 2);
  const child = result.changes.unknown.find(delta => delta.source_id.native_id === 'child');
  assert.ok(codes(child).includes('RIGHT_UNAVAILABLE_SUBTREE'));
});

test('different subject collection owner or ID prevents cross-scope absence proofs', () => {
  for (const comparison_scope of [{...COLLECTION, native_id: 'another-collection'}, {...COLLECTION, owner: 'operator-b'}]) {
    const result = compare([file('old')], [file('new')], {}, {comparison_scope});
    assert.equal(result.same_inventory_scope, false); assert.equal(result.summary.unknown, 2);
    assert.equal(result.summary.added, 0); assert.equal(result.summary.removed, 0);
    assert.ok(result.changes.unknown.every(delta => codes(delta).includes('DIFFERENT_INVENTORY_SCOPE')));
  }
});

test('matching native records remain directly comparable across different inventory scopes', () => {
  const result = compare([file()], [file()], {}, {comparison_scope: {...COLLECTION, native_id: 'other-collection'}});
  assert.equal(result.same_inventory_scope, false); assert.equal(result.summary.unchanged, 1);
});

test('Drive and local snapshot sources can compare the same explicitly identified subject collection', () => {
  const driveSource = id('drive-manifest-1');
  const localSource = id('local-manifest-2', {owner: 'windows-host-a', namespace: 'LOCAL_FILESYSTEM', native_id_type: 'snapshot_id'});
  const result = compare([file('same'), file('removed')], [file('same'), file('added')],
    {source_id: driveSource}, {source_id: localSource});
  assert.equal(result.same_inventory_scope, true);
  assert.equal(result.summary.unchanged, 1); assert.equal(result.summary.added, 1); assert.equal(result.summary.removed, 1);
  assert.deepEqual(result.source_binding.left.source_id, driveSource);
  assert.deepEqual(result.source_binding.right.source_id, localSource);
  assert.deepEqual(result.source_binding.left.comparison_scope, COLLECTION);
  assert.deepEqual(result.source_binding.right.comparison_scope, COLLECTION);
  assert.equal(result.snapshot_source_comparison.same_source_identity, false);
  assert.equal(result.snapshot_source_comparison.version_comparison, 'NOT_COMPARABLE_DIFFERENT_SOURCES');
});

test('comparison scope is required rather than inferred from snapshot-source identity or filename', () => {
  const missingScope = snapshot('left'); delete missingScope.comparison_scope;
  assert.throws(() => compareSnapshotManifests(missingScope, snapshot('right')), /MISSING_FIELD.*comparison_scope/);
});

test('several Dash aliases to one native record add no evidence units', () => {
  const result = compare([file(), alias('dash-a')], [file(), alias('dash-a'), alias('dash-b')]);
  assert.equal(result.summary.native_records_compared, 1); assert.equal(result.summary.unchanged, 1);
  assert.equal(result.summary.native_records_left, 1); assert.equal(result.summary.native_records_right, 1);
  assert.equal(result.summary.alias_records_right, 2); assert.equal(result.aliases.evidence_units_added, 0);
  assert.ok(result.aliases.right.every(row => row.evidence_units_added === 0 && row.target_resolution === 'NATIVE_ENTRY_PRESENT'));
  assert.deepEqual(result.aliases.right[1].alias_of, id('file-a'));
});

test('projection hash agreement is not substituted for an absent native read', () => {
  const result = compare([file()], [alias()]);
  assert.equal(result.summary.removed, 0); assert.equal(result.summary.unchanged, 0);
  assert.ok(codes(only(result, 'unknown')).includes('RIGHT_NATIVE_SOURCE_ONLY_ALIAS'));
  assert.equal(result.aliases.right[0].target_resolution, 'ALIAS_ONLY_NATIVE_NOT_ACQUIRED');
});

test('a prior alias-only observation does not prove prior native absence', () => {
  const result = compare([alias()], [file()]);
  assert.equal(result.summary.added, 0);
  assert.ok(codes(only(result, 'unknown')).includes('LEFT_NATIVE_SOURCE_ONLY_ALIAS'));
});

test('an alias-only folder prevents treating its omitted native subtree as removed', () => {
  const result = compare([file('child')], [alias('dash-folder', id('folder-a'), {kind: 'FOLDER'})]);
  assert.equal(result.summary.removed, 0);
  assert.ok(codes(only(result, 'unknown')).includes('RIGHT_ALIAS_ONLY_SUBTREE'));
});

test('an identity changing from native record to alias is explicit uncertainty', () => {
  const reclassified = file('file-a', {alias_of: id('file-b')});
  const result = compare([file()], [reclassified]);
  assert.equal(result.summary.removed, 0);
  assert.ok(codes(only(result, 'unknown')).includes('RIGHT_SOURCE_RECLASSIFIED_AS_ALIAS'));
});

test('duplicate native and alias identities reject instead of silently choosing a record', () => {
  assert.throws(() => compare([file(), file()], []), /DUPLICATE_SOURCE_ENTRY/);
  assert.throws(() => compare([], [file(), file('file-a', {content_sha256: H2})]), /DUPLICATE_SOURCE_ENTRY/);
  assert.throws(() => compare([], [alias(), alias()]), /DUPLICATE_SOURCE_ENTRY/);
});

test('self aliases, alias chains and incompatible target kinds fail visibly', () => {
  assert.throws(() => compare([], [file('file-a', {alias_of: id('file-a')})]), /ALIAS_SELF_REFERENCE/);
  const a = alias('dash-a'), b = alias('dash-b', a.source_id);
  assert.throws(() => compare([], [a, b]), /ALIAS_TARGET_IS_ALIAS/);
  assert.throws(() => compare([], [file(), alias('dash-a', id('file-a'), {kind: 'FOLDER'})]), /ALIAS_KIND_CONFLICT/);
});

test('orphan projection aliases remain visible and contribute no native comparisons', () => {
  const result = compare([], [alias()]);
  assert.equal(result.summary.native_records_compared, 0); assert.equal(result.summary.added, 0);
  assert.equal(result.aliases.right[0].target_resolution, 'ALIAS_ONLY_NATIVE_NOT_ACQUIRED');
});

test('receipts bind the exact supplied source tuple, versions, and deterministic manifest fingerprints', () => {
  const left = snapshot('left'), right = snapshot('right');
  const before = structuredClone({left, right});
  const result = compareSnapshotManifests(left, right);
  assert.deepEqual(result.source_binding.left.source_id, id('snapshot-source-left'));
  assert.equal(result.source_binding.left.version, 'inventory-1');
  assert.match(result.source_binding.left.manifest_fingerprint_sha256, /^[a-f0-9]{64}$/u);
  assert.equal(result.receipt_id, compareSnapshotManifests(left, right).receipt_id);
  assert.deepEqual({left, right}, before);
  assert.equal(result.filesystem_access, false); assert.equal(result.network_access, false);
  assert.equal(result.source_authentication, false); assert.equal(result.independent_evidence_count_established, false);
  right.entries[0].content_sha256 = H2;
  assert.notEqual(result.receipt_id, compareSnapshotManifests(left, right).receipt_id);
  assert.equal(result.changes.unchanged[0].right.content_sha256, H1);
});

test('input object-key order preserves fingerprints and entry order preserves semantic deltas', () => {
  const left = snapshot('left', [file('a'), file('b')]), right = snapshot('right', [file('b'), file('a')]);
  const result = compareSnapshotManifests(left, right);
  const reversedKeys = Object.fromEntries(Object.entries(left).reverse());
  assert.equal(result.receipt_id, compareSnapshotManifests(reversedKeys, right).receipt_id);
  assert.equal(result.summary.unchanged, 2);
  assert.deepEqual(result.changes.unchanged.map(row => row.source_id.native_id), ['a', 'b']);
});

test('results do not share mutable references with inputs or the version-only subset', () => {
  const left = snapshot('left'), right = snapshot('right', [file('file-a', {version: '2'})]);
  const result = compareSnapshotManifests(left, right);
  result.version_only[0].right.path = 'mutated';
  result.source_binding.left.source_id.owner = 'mutated';
  assert.equal(result.changes.changed[0].right.path, 'folder/file-a.txt');
  assert.equal(left.source_id.owner, 'operator-a'); assert.equal(right.entries[0].path, 'folder/file-a.txt');
});

test('unknown fields, missing fields, invalid hashes and invalid states are visible input errors', () => {
  assert.throws(() => compare([], [], {}, {inventory_compelete: true}), /UNKNOWN_FIELD/);
  const missing = snapshot(); delete missing.inventory_complete;
  assert.throws(() => compareSnapshotManifests(missing, snapshot('right')), /MISSING_FIELD/);
  assert.throws(() => compare([], [], {}, {inventory_complete: 'true'}), /INVALID_INVENTORY_COMPLETENESS/);
  assert.throws(() => compare([file('a', {content_sha256: 'a'})], []), /INVALID_SHA256/);
  assert.throws(() => compare([file('a', {acquisition_state: 'MISSING'})], []), /INVALID_ACQUISITION_STATE/);
  assert.throws(() => compare([file('a', {source_id: {...id('a'), owner: null}})], []), /INVALID_STRING/);
  assert.throws(() => compare([], [], {}, {schema_version: 'future'}), /UNSUPPORTED_SNAPSHOT_SCHEMA/);
});

test('sparse arrays, over-budget manifests and non-JSON getters fail before comparison', () => {
  assert.throws(() => compare(new Array(1), []), /INVALID_OBJECT/);
  assert.throws(() => compare(new Array(MAX_SNAPSHOT_ENTRIES + 1), []), /SNAPSHOT_ENTRY_LIMIT/);
  const guarded = snapshot(); let getterRan = false;
  Object.defineProperty(guarded, 'project_id', {enumerable: true, get() {getterRan = true; return 'project-a';}});
  assert.throws(() => compareSnapshotManifests(guarded, snapshot('right')), /NON_JSON_PROPERTY/);
  assert.equal(getterRan, false);
});
