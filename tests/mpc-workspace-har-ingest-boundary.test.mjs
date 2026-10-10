import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {createMpcWorkspaceService} from '../lib/mpc-workspace-service.mjs';

const unavailableModels = async () => ({status: 'PROVIDER_UNAVAILABLE', models: [], loaded_models: []});

function filesBelow(root) {
  const result = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) result.push(path);
    }
  };
  visit(root);
  return result;
}

test('generic file, browser-file and folder ingestion cannot persist raw HAR or rejected secret text', async t => {
  const dataRoot = mkdtempSync(join(tmpdir(), 'mpc-workspace-har-boundary-data-'));
  const inputRoot = mkdtempSync(join(tmpdir(), 'mpc-workspace-har-boundary-input-'));
  let sequence = 0;
  const service = createMpcWorkspaceService({dataRoot, adapters: {discoverModels: unavailableModels},
    id: () => `har-boundary-${++sequence}`, clock: () => new Date('2026-10-10T12:00:00.000Z')});
  t.after(() => {
    service.close();
    rmSync(dataRoot, {recursive: true, force: true});
    rmSync(inputRoot, {recursive: true, force: true});
  });

  const canary = 'HAR-RAW-CREDENTIAL-CANARY-47f39a';
  const har = JSON.stringify({log: {version: '1.2', entries: [{
    startedDateTime: '2026-10-10T12:00:00.000Z', time: 1,
    request: {method: 'GET', url: 'https://example.test/',
      headers: [{name: 'Authorization', value: `Bearer ${canary}`}], cookies: [], queryString: [],
      headersSize: 1, bodySize: 0},
    response: {status: 200, headers: [], cookies: [], content: {size: 0, mimeType: 'text/plain', text: ''},
      redirectURL: '', headersSize: 1, bodySize: 0},
    timings: {blocked: 0, dns: 0, connect: 0, ssl: 0, send: 0, wait: 1, receive: 0}
  }]}});
  const largeHar = JSON.stringify({log: {version: '1.2', entries: [{
    startedDateTime: '2026-10-10T12:00:00.000Z', time: 1,
    request: {method: 'GET', url: 'https://example.test/',
      headers: [{name: 'Authorization', value: `Bearer ${canary}`}], cookies: [], queryString: [],
      headersSize: 1, bodySize: 0},
    response: {status: 200, headers: [], cookies: [],
      content: {size: 210_000, mimeType: 'text/plain', text: 'x'.repeat(210_000)},
      redirectURL: '', headersSize: 1, bodySize: 210_000},
    timings: {blocked: 0, dns: 0, connect: 0, ssl: 0, send: 0, wait: 1, receive: 0}
  }]}});
  const harPath = join(inputRoot, 'network.har');
  const disguisedHarPath = join(inputRoot, 'disguised-network.txt');
  const secretTextPath = join(inputRoot, 'secret.txt');
  const largeSecretTextPath = join(inputRoot, 'large-secret.txt');
  const binaryPath = join(inputRoot, 'ordinary.bin');
  writeFileSync(harPath, har);
  writeFileSync(disguisedHarPath, largeHar);
  writeFileSync(secretTextPath, `Authorization: Bearer ${canary}`);
  writeFileSync(largeSecretTextPath, `${'ordinary text\n'.repeat(17_000)}Authorization: Bearer ${canary}`);
  writeFileSync(binaryPath, Buffer.from([0, 1, 2, 3, 4]));

  service.createProject({project_id: 'PROJECT-HAR-FILE', display_name: 'HAR file', retention_policy: 'RETAIN_TEXT'});
  await assert.rejects(service.ingestInput({project_id: 'PROJECT-HAR-FILE', kind: 'FILE', file_path: harPath}),
    error => error.code === 'MPC_WORKSPACE_HAR_REQUIRES_PRIVATE_IMPORT');
  assert.equal(service.store.countSources('PROJECT-HAR-FILE'), 0);

  service.createProject({project_id: 'PROJECT-HAR-BROWSER', display_name: 'HAR browser', retention_policy: 'RETAIN_TEXT'});
  await assert.rejects(service.ingestInput({project_id: 'PROJECT-HAR-BROWSER', kind: 'FILES', files: [{
    name: 'renamed.json', byte_length: Buffer.byteLength(har), bytes_base64: Buffer.from(har).toString('base64')
  }]}), error => error.code === 'MPC_WORKSPACE_HAR_REQUIRES_PRIVATE_IMPORT');
  assert.equal(service.store.countSources('PROJECT-HAR-BROWSER'), 0);

  service.createProject({project_id: 'PROJECT-HAR-LARGE', display_name: 'Large disguised HAR',
    retention_policy: 'RETAIN_TEXT'});
  await assert.rejects(service.ingestInput({project_id: 'PROJECT-HAR-LARGE', kind: 'FILES', format_hint: 'BINARY',
    files: [{name: 'ordinary-data.json', byte_length: Buffer.byteLength(largeHar),
      bytes_base64: Buffer.from(largeHar).toString('base64')}]}),
  error => error.code === 'MPC_WORKSPACE_HAR_REQUIRES_PRIVATE_IMPORT');
  assert.equal(service.store.countSources('PROJECT-HAR-LARGE'), 0);

  service.createProject({project_id: 'PROJECT-SECRET-TEXT', display_name: 'Secret text', retention_policy: 'RETAIN_TEXT'});
  await assert.rejects(service.ingestInput({project_id: 'PROJECT-SECRET-TEXT', kind: 'FILE', file_path: secretTextPath}),
    error => error.code === 'MPC_WORKSPACE_SECRET_MATERIAL_REJECTED');
  assert.equal(service.store.countSources('PROJECT-SECRET-TEXT'), 0);

  service.createProject({project_id: 'PROJECT-SECRET-LARGE', display_name: 'Large secret text',
    retention_policy: 'RETAIN_TEXT'});
  await assert.rejects(service.ingestInput({project_id: 'PROJECT-SECRET-LARGE', kind: 'FILE',
    file_path: largeSecretTextPath, format_hint: 'BINARY'}),
  error => error.code === 'MPC_WORKSPACE_SECRET_MATERIAL_REJECTED');
  assert.equal(service.store.countSources('PROJECT-SECRET-LARGE'), 0);

  service.createProject({project_id: 'PROJECT-BINARY', display_name: 'Ordinary binary',
    retention_policy: 'RETAIN_TEXT'});
  const binary = await service.ingestInput({project_id: 'PROJECT-BINARY', kind: 'FILE', file_path: binaryPath});
  const binaryArtifact = service.store.listArtifacts('PROJECT-BINARY')[0];
  assert.equal(binary.kind, 'LOCAL_BINARY_FILE');
  assert.equal(service.store.countSources('PROJECT-BINARY'), 1);
  assert.match(binaryArtifact.artifact_ref, /^mpc-workspace-artifact:\/\//u);
  assert.deepEqual(service.readStoredArtifact(binaryArtifact), Buffer.from([0, 1, 2, 3, 4]));

  service.createProject({project_id: 'PROJECT-HAR-FOLDER', display_name: 'HAR folder', retention_policy: 'RETAIN_TEXT'});
  const folder = await service.ingestInput({project_id: 'PROJECT-HAR-FOLDER', kind: 'FOLDER', root_path: inputRoot,
    content_file_limit: 8});
  assert.ok(folder.content_coverage.errors.some(error =>
    error.relative_locator === 'network.har' && error.error_code === 'MPC_WORKSPACE_HAR_REQUIRES_PRIVATE_IMPORT'));
  assert.ok(folder.content_coverage.errors.some(error =>
    error.relative_locator === 'disguised-network.txt' && error.error_code === 'MPC_WORKSPACE_HAR_REQUIRES_PRIVATE_IMPORT'));
  assert.ok(folder.content_coverage.errors.some(error =>
    error.relative_locator === 'secret.txt' && error.error_code === 'MPC_WORKSPACE_SECRET_MATERIAL_REJECTED'));
  assert.ok(folder.content_coverage.errors.some(error =>
    error.relative_locator === 'large-secret.txt' && error.error_code === 'MPC_WORKSPACE_SECRET_MATERIAL_REJECTED'));

  for (const path of filesBelow(dataRoot)) {
    assert.equal(readFileSync(path).includes(Buffer.from(canary)), false, `credential canary persisted in ${path}`);
  }
});
