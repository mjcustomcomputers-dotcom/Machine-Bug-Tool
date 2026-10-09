import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {createMpcWorkspaceService} from '../lib/mpc-workspace-service.mjs';

const stamp = '2026-10-09T22:30:00.000Z';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mpc-workspace-artifact-integrity-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return root;
}

function openService(dataRoot) {
  let sequence = 0;
  return createMpcWorkspaceService({
    dataRoot,
    clock: () => new Date(stamp),
    id: () => `integrity-${++sequence}`
  });
}

test('latest journey survives fixed-clock reopen and rejects byte or digest drift before parsing', t => {
  const dataRoot = fixture(t);
  let service = openService(dataRoot);
  service.createProject({project_id: 'PROJECT-INTEGRITY', display_name: 'Artifact integrity'});
  service.store.createTask({project_id: 'PROJECT-INTEGRITY', task_id: 'TASK-INTEGRITY', title: 'Read latest'});
  service.store.startJob({project_id: 'PROJECT-INTEGRITY', job_id: 'JOB-INTEGRITY', task_id: 'TASK-INTEGRITY',
    operation_name: 'work.start', idempotency_key: 'integrity-job', request: {}});

  const oldContent = Buffer.from(JSON.stringify({revision: 'old'}));
  const newContent = Buffer.from(JSON.stringify({revision: 'new'}));
  assert.equal(oldContent.length, newContent.length);
  const oldFile = service.writeArtifact('PROJECT-INTEGRITY', 'z-old-route', '.json', oldContent);
  const newFile = service.writeArtifact('PROJECT-INTEGRITY', 'a-new-route', '.json', newContent);
  for (const [artifactId, file] of [['z-old-route', oldFile], ['a-new-route', newFile]]) {
    service.store.createArtifact({project_id: 'PROJECT-INTEGRITY', artifact_id: artifactId,
      artifact_kind: 'ROUTER_RECEIPT', display_name: artifactId, media_type: 'application/json', ...file});
    service.store.linkJobArtifact({project_id: 'PROJECT-INTEGRITY', job_id: 'JOB-INTEGRITY',
      artifact_id: artifactId, artifact_role: 'FULL_ROUTER_RECEIPT'});
  }
  service.close();

  service = openService(dataRoot);
  t.after(() => service.close());
  assert.deepEqual(service.journeyForJob('PROJECT-INTEGRITY', 'JOB-INTEGRITY'), {revision: 'new'});

  writeFileSync(newFile.path, oldContent);
  assert.throws(() => service.journeyForJob('PROJECT-INTEGRITY', 'JOB-INTEGRITY'), error =>
    error?.code === 'MPC_WORKSPACE_ARTIFACT_INTEGRITY_FAILED' && error?.status === 500);

  writeFileSync(newFile.path, Buffer.concat([newContent, Buffer.from(' ')]));
  assert.throws(() => service.journeyForJob('PROJECT-INTEGRITY', 'JOB-INTEGRITY'), error =>
    error?.code === 'MPC_WORKSPACE_ARTIFACT_INTEGRITY_FAILED' && error?.status === 500);
});
