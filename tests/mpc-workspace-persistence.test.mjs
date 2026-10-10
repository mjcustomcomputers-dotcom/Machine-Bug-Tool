import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {createMpcWorkspaceService} from '../lib/mpc-workspace-service.mjs';

const stamp = '2026-10-09T22:00:00.000Z';
const unavailableModels = async () => ({
  status: 'PROVIDER_UNAVAILABLE',
  models: [],
  loaded_models: []
});

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mpc-workspace-persistence-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return root;
}

function openService(dataRoot) {
  let sequence = 0;
  return createMpcWorkspaceService({
    dataRoot,
    clock: () => new Date(stamp),
    id: () => `persistence-${++sequence}`,
    adapters: {discoverModels: unavailableModels}
  });
}

test('report representations and stored snapshot comparison survive a service reopen', async t => {
  const dataRoot = fixture(t);
  const folder = join(dataRoot, 'selected-folder');
  mkdirSync(folder);
  writeFileSync(join(folder, 'record.txt'), 'first stored version\n', 'utf8');

  let service = openService(dataRoot);
  service.createProject({
    project_id: 'PROJECT-PERSISTENCE',
    display_name: 'Persistence acceptance',
    objective: 'Reopen every locally saved representation.',
    retention_policy: 'RETAIN_TEXT'
  });
  const acquired = await service.ingestInput({
    project_id: 'PROJECT-PERSISTENCE',
    kind: 'TEXT',
    name: 'evidence.txt',
    content: 'alpha retained evidence'
  });
  const journey = await service.startJob({
    project_id: 'PROJECT-PERSISTENCE',
    task_id: 'TASK-PERSISTENCE',
    question: 'What does the retained evidence establish?',
    operation_mode: 'EVIDENCE_ANALYSIS',
    acquisition_ids: [acquired.acquisition_id],
    idempotency_key: 'PERSISTENCE-JOB-1'
  });
  const createdReport = service.createReport({
    project_id: 'PROJECT-PERSISTENCE',
    job_id: journey.job_id,
    title: 'Three-format persistence report'
  });
  assert.deepEqual(Object.keys(createdReport.formats).sort(), ['html', 'json', 'markdown']);
  assert.equal(createdReport.representations.length, 3);
  assert.ok(createdReport.representations.slice(1).every(row =>
    row.representation_of_artifact_id === createdReport.artifact.artifact_id));

  const firstSnapshot = await service.ingestInput({
    project_id: 'PROJECT-PERSISTENCE',
    kind: 'FOLDER',
    selected_path: folder,
    include_subfolders: true
  });
  writeFileSync(join(folder, 'record.txt'), 'second stored version\n', 'utf8');
  const secondSnapshot = await service.ingestInput({
    project_id: 'PROJECT-PERSISTENCE',
    kind: 'FOLDER',
    selected_path: folder,
    include_subfolders: true
  });
  const comparison = service.compareSnapshots({
    project_id: 'PROJECT-PERSISTENCE',
    left_snapshot_id: firstSnapshot.snapshot_id,
    right_snapshot_id: secondSnapshot.snapshot_id
  });
  assert.equal(comparison.persistence.status, 'PERSISTED_LOCAL');
  assert.equal(comparison.persistence.live_remote_read_performed, false);
  assert.equal(comparison.changes.changed.length, 1);

  const reportId = createdReport.report_id;
  const comparisonId = comparison.persistence.comparison_id;
  service.close();

  service = openService(dataRoot);
  t.after(() => service.close());
  const reopenedReport = service.getReport(reportId, 'PROJECT-PERSISTENCE');
  assert.deepEqual(reopenedReport.available_formats, ['markdown', 'json', 'html']);
  assert.match(reopenedReport.markdown, /Three-format persistence report/u);
  assert.equal(JSON.parse(reopenedReport.json).report_id, reportId);
  assert.match(reopenedReport.html, /<!doctype html>/u);
  assert.equal(reopenedReport.format_artifacts.json.representation_of_artifact_id,
    reopenedReport.artifact.artifact_id);
  assert.equal(reopenedReport.format_artifacts.html.representation_of_artifact_id,
    reopenedReport.artifact.artifact_id);

  const reopenedComparison = service.getSnapshotComparison(comparisonId, 'PROJECT-PERSISTENCE');
  assert.equal(reopenedComparison.comparison.receipt_id, comparison.receipt_id);
  assert.equal(reopenedComparison.comparison.changes.changed.length, 1);
  assert.equal(reopenedComparison.persistence.status, 'PERSISTED_LOCAL');
  assert.equal(reopenedComparison.persistence.live_remote_read_performed, false);
  assert.match(reopenedComparison.result_artifact.display_name, /^Stored snapshot comparison /u);
  assert.doesNotMatch(reopenedComparison.result_artifact.display_name, /Drive/iu);

  const bootstrap = await service.bootstrap();
  assert.equal(bootstrap.snapshot_comparisons.length, 1);
  assert.equal(bootstrap.snapshot_comparisons[0].comparison_id, comparisonId);
});

test('caller-supplied manifests are compared without claiming persistence or a live remote read', t => {
  const dataRoot = fixture(t);
  const service = openService(dataRoot);
  t.after(() => service.close());
  service.createProject({project_id: 'PROJECT-EPHEMERAL', display_name: 'Ephemeral comparison'});
  const manifest = snapshot => ({
    schema_version: 'MPC_WORKSPACE_SNAPSHOT_1',
    snapshot_id: snapshot,
    project_id: 'PROJECT-EPHEMERAL',
    source_id: {owner: 'LOCAL_HOST', namespace: 'LOCAL_FILESYSTEM', native_id_type: 'path', native_id: snapshot},
    comparison_scope: {owner: 'LOCAL_HOST', namespace: 'LOCAL_FILESYSTEM', native_id_type: 'folder_path', native_id: 'C:/records'},
    version: 'v1',
    content_sha256: null,
    acquisition_state: 'PRESENT',
    inventory_complete: true,
    entries: []
  });
  const result = service.compareSnapshots({
    project_id: 'PROJECT-EPHEMERAL',
    left_manifest: manifest('left'),
    right_manifest: manifest('right')
  });
  assert.deepEqual(result.persistence, {
    status: 'NOT_PERSISTED',
    basis: 'CALLER_SUPPLIED_MANIFESTS',
    reason: 'TWO_STORED_SNAPSHOT_IDS_REQUIRED',
    live_remote_read_performed: false
  });
  assert.deepEqual(service.store.listSnapshotComparisons('PROJECT-EPHEMERAL'), []);
});
