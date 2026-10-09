import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {createMpcWorkspaceService} from '../lib/mpc-workspace-service.mjs';

const observedAt = '2026-10-09T23:00:00.000Z';
const unavailableModels = async () => ({status: 'PROVIDER_UNAVAILABLE', models: [], loaded_models: []});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mpc-workspace-ingestion-integrity-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return root;
}

function serviceFor(t, dataRoot) {
  let sequence = 0;
  const service = createMpcWorkspaceService({
    dataRoot,
    clock: () => new Date(observedAt),
    id: () => `ingestion-${++sequence}`,
    adapters: {discoverModels: unavailableModels}
  });
  t.after(() => service.close());
  return service;
}

test('retained text files preserve exact original bytes separately from their decoded search representation', async t => {
  const root = fixture(t);
  const sourcePath = join(root, 'bom-evidence.txt');
  const originalBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('BOM evidence\r\n', 'utf8')]);
  writeFileSync(sourcePath, originalBytes);
  const service = serviceFor(t, join(root, 'workspace'));
  service.createProject({project_id: 'PROJECT-EXACT-BYTES', display_name: 'Exact bytes', retention_policy: 'RETAIN_TEXT'});

  const acquired = await service.ingestInput({project_id: 'PROJECT-EXACT-BYTES', kind: 'FILE', file_path: sourcePath});
  const source = service.store.getSource('PROJECT-EXACT-BYTES', acquired.source.id);
  const rawArtifact = service.store.db.prepare(`SELECT * FROM cc_artifacts WHERE project_id=? AND source_id=?
    AND artifact_kind='INPUT_FILE'`).get('PROJECT-EXACT-BYTES', acquired.source.id);
  const retained = service.store.listRetainedAcquisitions('PROJECT-EXACT-BYTES')
    .find(row => row.source_id === acquired.source.id);

  assert.equal(source.content_sha256, digest(originalBytes));
  assert.equal(rawArtifact.artifact_sha256, digest(originalBytes));
  assert.equal(rawArtifact.artifact_bytes, originalBytes.length);
  assert.deepEqual(service.readStoredArtifact(rawArtifact), originalBytes);
  assert.equal(retained.retained_text, 'BOM evidence\r\n');
  assert.equal(retained.text_sha256, digest(Buffer.from(retained.retained_text)));
  assert.notEqual(retained.text_sha256, source.content_sha256,
    'a decoded representation must not replace the exact-byte source hash');
  assert.deepEqual(readFileSync(sourcePath), originalBytes, 'ingestion never modifies the selected original');
});

test('metadata-only folder indexing returns current-session acquisition IDs and records skipped content honestly', async t => {
  const root = fixture(t);
  const folder = join(root, 'selected-folder');
  mkdirSync(folder);
  writeFileSync(join(folder, 'a.txt'), 'folder alpha evidence', 'utf8');
  writeFileSync(join(folder, 'b.txt'), 'folder beta evidence', 'utf8');
  const service = serviceFor(t, join(root, 'workspace'));
  service.createProject({project_id: 'PROJECT-METADATA-FOLDER', display_name: 'Metadata folder',
    retention_policy: 'METADATA_ONLY'});

  const indexed = await service.ingestInput({project_id: 'PROJECT-METADATA-FOLDER', kind: 'FOLDER',
    selected_path: folder, mount_id: 'MOUNT-METADATA', content_file_limit: 1});
  assert.equal(indexed.content_coverage.acquired, 1);
  assert.equal(indexed.content_coverage.skipped, 1);
  assert.equal(indexed.acquisition_ids.length, 1);
  assert.equal(indexed.acquisitions[0].workflow_record.content, null);
  assert.equal(indexed.acquisitions[0].workflow_record.content_available_for_current_session, true);
  assert.deepEqual(indexed.snapshot.entries.map(entry => entry.availability).sort(), ['AVAILABLE', 'UNAVAILABLE']);

  const journey = await service.startJob({project_id: 'PROJECT-METADATA-FOLDER', task_id: 'TASK-FOLDER',
    question: 'Analyze the explicitly selected folder evidence.', operation_mode: 'EVIDENCE_ANALYSIS',
    acquisition_ids: indexed.acquisition_ids, idempotency_key: 'METADATA-FOLDER-JOB'});
  assert.equal(journey.router_receipt.workflow.acquired_record_count, 1);
  assert.notEqual(journey.state, 'BLOCKED_SOURCE_REQUIRED');
  assert.deepEqual(service.store.listRetainedAcquisitions('PROJECT-METADATA-FOLDER'), []);
});

test('a later bounded folder pass safely promotes an existing pointer instead of duplicating or failing', async t => {
  const root = fixture(t);
  const folder = join(root, 'reconnect-folder');
  mkdirSync(folder);
  writeFileSync(join(folder, 'record.txt'), 'reconnected content', 'utf8');
  const service = serviceFor(t, join(root, 'workspace'));
  service.createProject({project_id: 'PROJECT-RECONNECT', display_name: 'Reconnect', retention_policy: 'RETAIN_TEXT'});

  const first = await service.ingestInput({project_id: 'PROJECT-RECONNECT', kind: 'FOLDER', selected_path: folder,
    mount_id: 'MOUNT-RECONNECT', content_file_limit: 0});
  const firstSource = service.store.db.prepare(`SELECT s.* FROM cc_attached_files f JOIN cc_sources s
    ON s.project_id=f.project_id AND s.source_id=f.source_id WHERE f.project_id=? AND f.mount_id=?`)
    .get('PROJECT-RECONNECT', 'MOUNT-RECONNECT');
  assert.equal(first.content_coverage.skipped, 1);
  assert.equal(firstSource.acquisition_state, 'POINTER');

  const second = await service.ingestInput({project_id: 'PROJECT-RECONNECT', kind: 'FOLDER', selected_path: folder,
    mount_id: 'MOUNT-RECONNECT', content_file_limit: 1});
  const promoted = service.store.getSource('PROJECT-RECONNECT', firstSource.source_id);
  assert.equal(second.content_coverage.acquired, 1);
  assert.equal(second.acquisition_ids.length, 1);
  assert.equal(promoted.acquisition_state, 'ACQUIRED');
  assert.equal(promoted.content_sha256, digest(Buffer.from('reconnected content')));
  assert.equal(service.store.db.prepare(`SELECT count(*) AS count FROM cc_attached_files
    WHERE project_id=? AND mount_id=? AND relative_locator=?`).get(
    'PROJECT-RECONNECT', 'MOUNT-RECONNECT', 'record.txt').count, 1);
});

test('local search keeps pasted text and acquired files in distinct filters', async t => {
  const root = fixture(t);
  const sourcePath = join(root, 'file-source.txt');
  writeFileSync(sourcePath, 'shared-zephyr file record', 'utf8');
  const service = serviceFor(t, join(root, 'workspace'));
  service.createProject({project_id: 'PROJECT-SEARCH-KINDS', display_name: 'Search kinds', retention_policy: 'RETAIN_TEXT'});
  await service.ingestInput({project_id: 'PROJECT-SEARCH-KINDS', kind: 'TEXT', name: 'pasted.txt',
    text: 'shared-zephyr pasted record'});
  await service.ingestInput({project_id: 'PROJECT-SEARCH-KINDS', kind: 'FILE', file_path: sourcePath});

  const text = service.search({project_id: 'PROJECT-SEARCH-KINDS', query: 'shared-zephyr',
    scopes: ['LOCAL'], filters: {kind: 'TEXT'}});
  const file = service.search({project_id: 'PROJECT-SEARCH-KINDS', query: 'shared-zephyr',
    scopes: ['LOCAL'], filters: {kind: 'FILE'}});
  assert.equal(text.results.length, 1);
  assert.equal(text.results[0].native_id_type, 'PASTED_TEXT');
  assert.equal(file.results.length, 1);
  assert.equal(file.results[0].native_id_type, 'LOCAL_TEXT_FILE');
});
