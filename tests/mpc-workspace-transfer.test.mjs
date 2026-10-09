import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MPC_WORKSPACE_TRANSFER_LIMITS,
  MPC_WORKSPACE_TRANSFER_VERSION,
  createTransferEnvelope,
  decodeTransferItem,
  parseTransferEnvelope,
  serializeTransferEnvelope,
  verifyTransferEnvelope
} from '../lib/mpc-workspace-transfer.mjs';

const fixed = new Date('2026-10-09T22:00:00.000Z');

function sample(overrides = {}) {
  return createTransferEnvelope({
    transfer_id: 'TRANSFER-round-trip',
    exporter: {application: 'MPC Workspace', version: '0.1.0'},
    exported_at_utc: fixed,
    project_mapping: {
      exporting_project_id: 'project-source',
      exporting_project_name: 'Noah’s Ark review',
      selected_local_project_id: 'project-selected-by-user'
    },
    objective: 'Compare the exact acquired records and resume the pending review.',
    items: [
      {item_id: 'text-1', kind: 'TEXT', name: 'Pasted text.txt', text: 'first\r\nsecond\n🌐\rthird',
        source_ref: 'source-text', declared_origin: {surface: 'CHAT_EXPORT'}},
      {item_id: 'file-1', kind: 'FILE', name: 'evidence.bin', media_type: 'application/octet-stream',
        bytes: Uint8Array.from([0, 1, 2, 254, 255]), relative_path: 'evidence/evidence.bin'},
      {item_id: 'script-1', kind: 'SCRIPT_DRAFT', name: 'Inspect.ps1', text: 'throw "must not execute"',
        media_type: 'text/x-powershell'}
    ],
    source_manifest: [{
      source_ref: 'source-text', owner: 'DRIVE', namespace: 'files', native_id_type: 'integer',
      native_id: '900719925474099312345', version: 'rev-7', content_sha256: 'a'.repeat(64)
    }],
    pending_task: {task_id: 'task-7', state: 'READY_TO_RESUME', next_action: 'Compare exact bytes.'},
    native_receipts: [{receipt_id: 'historical-read-1', status: 'SUCCEEDED', current_context_verified: false}],
    ...overrides
  });
}

test('structured transfer round trip preserves bytes, line endings, typed IDs, project mapping and pending task', () => {
  const envelope = sample();
  assert.equal(envelope.schema_version, MPC_WORKSPACE_TRANSFER_VERSION);
  const verification = verifyTransferEnvelope(envelope);
  assert.equal(verification.valid, true);
  assert.equal(verification.item_count, 3);
  assert.deepEqual(verification.script_item_ids, ['script-1']);
  assert.equal(verification.scripts_executed, false);
  assert.equal(verification.native_read_performed, false);

  const raw = serializeTransferEnvelope(envelope, {pretty: true});
  const parsed = parseTransferEnvelope(Buffer.from(raw, 'utf8'));
  assert.deepEqual(parsed, envelope);
  assert.equal(decodeTransferItem(parsed.items[0]).toString('utf8'), 'first\r\nsecond\n🌐\rthird');
  assert.deepEqual([...decodeTransferItem(parsed.items[1])], [0, 1, 2, 254, 255]);
  assert.equal(parsed.source_manifest[0].native_id_type, 'integer');
  assert.equal(parsed.source_manifest[0].native_id, '900719925474099312345');
  assert.equal(parsed.project_mapping.selected_local_project_id, 'project-selected-by-user');
  assert.equal(parsed.pending_task.task_id, 'task-7');
});

test('scripts remain inert data and require a separate manual execution action', () => {
  delete globalThis.__mpcTransferExecuted;
  const envelope = createTransferEnvelope({
    exporter: {application: 'MPC Workspace', version: '0.1.0'},
    project_mapping: {exporting_project_id: 'project-a'},
    objective: 'Carry a draft without running it.',
    items: [{item_id: 'script', kind: 'SCRIPT_DRAFT', name: 'draft.js', media_type: 'text/javascript',
      text: 'globalThis.__mpcTransferExecuted = true;'}]
  }, {id: () => 'fixed', clock: () => fixed});
  const parsed = parseTransferEnvelope(serializeTransferEnvelope(envelope));
  assert.equal(globalThis.__mpcTransferExecuted, undefined);
  assert.equal(parsed.import_policy.execute_on_import, false);
  assert.equal(parsed.import_policy.embedded_scripts, 'MANUAL_EXPORT_ONLY');
  assert.deepEqual(parsed.items[0].handling, {
    data_only: true,
    scripts_execute_on_import: false,
    manual_execution_required: true
  });
});

test('item-byte and envelope-metadata tampering are rejected without mutating the supplied object', () => {
  const original = sample();
  const untouched = structuredClone(original);
  verifyTransferEnvelope(original);
  assert.deepEqual(original, untouched);

  const changedBytes = structuredClone(original);
  changedBytes.items[0].content += '!';
  assert.throws(() => verifyTransferEnvelope(changedBytes), error => error.code === 'TRANSFER_ITEM_BYTE_LENGTH_MISMATCH');

  const changedMetadata = structuredClone(original);
  changedMetadata.objective = 'A different objective.';
  assert.throws(() => verifyTransferEnvelope(changedMetadata), error => error.code === 'TRANSFER_ENVELOPE_HASH_MISMATCH');
  assert.deepEqual(original, untouched);
});

test('duplicate JSON keys are rejected before an ambiguous transfer can be returned', () => {
  const raw = serializeTransferEnvelope(sample());
  const duplicate = raw.replace('"transfer_id":"TRANSFER-round-trip"',
    '"transfer_id":"TRANSFER-round-trip","transfer_id":"TRANSFER-shadow"');
  assert.throws(() => parseTransferEnvelope(duplicate), /DUPLICATE_JSON_KEY/u);
});

test('item count, aggregate bytes, envelope bytes and strict Base64 are bounded', () => {
  const basis = {
    exporter: {application: 'MPC Workspace', version: '0.1.0'},
    project_mapping: {exporting_project_id: 'project-a'},
    objective: 'Bounded export.'
  };
  const items = Array.from({length: MPC_WORKSPACE_TRANSFER_LIMITS.max_items + 1}, (_, index) => ({
    item_id: `item-${index}`, kind: 'TEXT', name: `item-${index}.txt`, text: 'x'
  }));
  assert.throws(() => createTransferEnvelope({...basis, items}), error => error.code === 'TRANSFER_ITEM_COUNT_LIMIT');
  assert.throws(() => createTransferEnvelope({...basis, items: [{item_id: 'large', kind: 'TEXT', name: 'large.txt',
    text: 'x'.repeat(MPC_WORKSPACE_TRANSFER_LIMITS.max_item_bytes + 1)}]}),
  error => ['TRANSFER_ITEM_BYTE_LIMIT', 'TRANSFER_ENVELOPE_BYTE_LIMIT'].includes(error.code));

  const valid = createTransferEnvelope({...basis, items: [{item_id: 'file', kind: 'FILE', name: 'file.bin',
    bytes: Uint8Array.from([1, 2, 3])}]}, {id: () => 'fixed', clock: () => fixed});
  const malformed = structuredClone(valid);
  malformed.items[0].content = 'AQI*';
  assert.throws(() => verifyTransferEnvelope(malformed), error => error.code === 'TRANSFER_ITEM_BASE64_INVALID');
  assert.throws(() => parseTransferEnvelope(' '.repeat(MPC_WORKSPACE_TRANSFER_LIMITS.max_envelope_bytes) + '{}'),
    /JSON_BYTE_LIMIT/u);
});

test('ambiguous item IDs and numeric native IDs are rejected instead of coerced', () => {
  const basis = {
    exporter: {application: 'MPC Workspace', version: '0.1.0'},
    project_mapping: {exporting_project_id: 'project-a'},
    objective: 'Keep identities exact.'
  };
  assert.throws(() => createTransferEnvelope({...basis, items: [
    {item_id: 'same', kind: 'TEXT', name: 'one', text: 'one'},
    {item_id: 'same', kind: 'TEXT', name: 'two', text: 'two'}
  ]}), error => error.code === 'TRANSFER_DUPLICATE_ITEM_ID');
  assert.throws(() => createTransferEnvelope({...basis, source_manifest: [{source_ref: 'source-a', owner: 'DRIVE',
    namespace: 'files', native_id_type: 'integer', native_id: 9_007_199_254_740_992}]}),
  error => error.code === 'TRANSFER_NATIVE_ID_STRING_REQUIRED');
});

test('identical bytes remain separate items while verification reports a safe reuse hint', () => {
  const envelope = createTransferEnvelope({
    exporter: {application: 'MPC Workspace', version: '0.1.0'},
    project_mapping: {exporting_project_id: 'project-a'},
    objective: 'Retain duplicate versions for an explicit import choice.',
    items: [
      {item_id: 'copy-a', kind: 'TEXT', name: 'a.txt', text: 'same bytes'},
      {item_id: 'copy-b', kind: 'TEXT', name: 'b.txt', text: 'same bytes'}
    ]
  }, {id: () => 'fixed', clock: () => fixed});
  const result = verifyTransferEnvelope(envelope);
  assert.equal(envelope.items.length, 2);
  assert.deepEqual(result.duplicate_content, [{
    content_sha256: envelope.items[0].content_sha256,
    item_ids: ['copy-a', 'copy-b']
  }]);
});
