import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {createMpcWorkspaceService} from '../lib/mpc-workspace-service.mjs';

const stamp = '2026-10-10T12:00:00.000Z';
const hash = value => createHash('sha256').update(value).digest('hex');
const unavailableModels = async () => ({status: 'PROVIDER_UNAVAILABLE', models: [], loaded_models: []});

function captureResult({sourceBytes = Buffer.from('normalized screenshot bytes'),
  derivedBytes = Buffer.from('bounded fast jpeg bytes'), sourceDimensions = {width: 1_600, height: 900},
  derivedDimensions = {width: 1_280, height: 720}} = {}) {
  return {
    schema_version: 'MPC_SCREEN_CONTEXT_CAPTURE_1',
    status: 'CAPTURED',
    capture_mode: 'EXPLICIT_ONE_SHOT',
    source: {
      media_type: 'image/png', bytes: sourceBytes, byte_length: sourceBytes.byteLength,
      sha256: hash(sourceBytes), dimensions: sourceDimensions,
      normalization: 'ELECTRON_NATIVE_IMAGE_TO_PNG'
    },
    derived: {
      media_type: 'image/jpeg', bytes: derivedBytes, byte_length: derivedBytes.byteLength,
      sha256: hash(derivedBytes), dimensions: derivedDimensions
    },
    transform: {
      operation: 'DOWNSCALE_AND_ENCODE', no_upscale: true, maximum_long_edge_pixels: 1_280,
      resize_quality: 'good', jpeg_quality: 65, encoding_attempts: 1,
      source_dimensions: sourceDimensions, derived_dimensions: derivedDimensions,
      scale_x: derivedDimensions.width / sourceDimensions.width,
      scale_y: derivedDimensions.height / sourceDimensions.height
    },
    timing: {
      started_at_utc: stamp, completed_at_utc: stamp, clipboard_read_ms: 1,
      normalize_and_validate_ms: 2, derive_ms: 3, elapsed_ms: 6
    }
  };
}

function fixture(t, screenContext) {
  const root = mkdtempSync(join(tmpdir(), 'mpc-workspace-screen-service-'));
  let sequence = 0;
  const service = createMpcWorkspaceService({
    dataRoot: root,
    clock: () => new Date(stamp),
    id: () => `screen-service-${++sequence}`,
    adapters: {discoverModels: unavailableModels, screenContext}
  });
  t.after(() => {
    service.close();
    rmSync(root, {recursive: true, force: true});
  });
  return {root, service};
}

function allFileBytes(root) {
  const result = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) result.push(readFileSync(path));
    }
  };
  visit(root);
  return result;
}

test('clipboard capture persists original and fast representations with lineage plus a route-ready OCR status log', async t => {
  const sourceBytes = Buffer.from('exact original png representation');
  const fastBytes = Buffer.from('fast jpeg representation');
  const {service} = fixture(t, {captureClipboardImage: async () => captureResult({sourceBytes, derivedBytes: fastBytes})});
  service.createProject({project_id: 'PROJECT-SCREEN', display_name: 'Screen context', retention_policy: 'RETAIN_TEXT'});

  const result = await service.handleScreenContext({project_id: 'PROJECT-SCREEN', operation: 'CAPTURE_CLIPBOARD'});
  const original = service.store.db.prepare('SELECT * FROM cc_artifacts WHERE project_id=? AND artifact_id=?')
    .get('PROJECT-SCREEN', result.artifacts.original.artifact_id);
  const fast = service.store.db.prepare('SELECT * FROM cc_artifacts WHERE project_id=? AND artifact_id=?')
    .get('PROJECT-SCREEN', result.artifacts.fast.artifact_id);
  const screenSource = service.store.getSource('PROJECT-SCREEN', original.source_id);
  const sessionLog = service.sessionAcquisitions.get('PROJECT-SCREEN')[0];

  assert.equal(result.status, 'CAPTURED_OCR_NOT_AVAILABLE');
  assert.equal(result.ocr.status, 'OCR_NOT_AVAILABLE');
  assert.equal(result.active_capture, false);
  assert.equal(result.active_packet_capture, false);
  assert.equal(result.causality_established, false);
  assert.equal(original.artifact_kind, 'SCREENSHOT');
  assert.equal(original.media_type, 'image/png');
  assert.equal(original.artifact_sha256, hash(sourceBytes));
  assert.equal(fast.artifact_kind, 'SCREENSHOT');
  assert.equal(fast.media_type, 'image/jpeg');
  assert.equal(fast.artifact_sha256, hash(fastBytes));
  assert.equal(fast.representation_of_artifact_id, original.artifact_id);
  assert.equal(fast.source_id, original.source_id);
  assert.deepEqual(service.readStoredArtifact(original), sourceBytes);
  assert.deepEqual(service.readStoredArtifact(fast), fastBytes);
  assert.equal(screenSource.source_owner, 'MPC_SCREEN_CONTEXT');
  assert.equal(screenSource.native_id_type, 'USER_SELECTED_CLIPBOARD_IMAGE_CAPTURE');
  assert.equal(screenSource.native_version, `sha256:${hash(sourceBytes)}`);
  assert.equal(result.provenance.original_retained, true);
  assert.equal(result.provenance.fast_retained, true);

  assert.equal(sessionLog.source.owner, 'MPC_SCREEN_CONTEXT');
  assert.equal(sessionLog.source.type, 'USER_SELECTED_CLIPBOARD_IMAGE_CAPTURE');
  assert.equal(sessionLog.source.id, screenSource.source_id);
  assert.equal(sessionLog.coverage.router_content_ready, true);
  assert.match(sessionLog.workflow_record.content, /OCR_NOT_AVAILABLE/u);
  const log = JSON.parse(sessionLog.workflow_record.content);
  assert.equal(log.source_identity.artifact_id, original.artifact_id);
  assert.equal(log.source_identity.normalization, 'ELECTRON_NATIVE_IMAGE_TO_PNG');
  assert.equal(log.capture_origin_established, false);
  assert.match(log.ocr.next_action, /this build cannot inspect its pixels/u);
  assert.equal(log.fast_representation.representation_of_artifact_id, original.artifact_id);
  assert.equal(log.active_capture, false);
  assert.equal(log.active_packet_capture, false);
  assert.equal(log.causality_established, false);
  assert.deepEqual(result.acquisition_ids, [sessionLog.acquisition_id]);
});

test('screen image retention follows project choice and never retains an original larger than eight MiB', async t => {
  const ordinary = captureResult();
  const oversizedSource = Buffer.alloc(8 * 1024 * 1024 + 1, 0x5a);
  const large = captureResult({sourceBytes: oversizedSource});
  const queue = [ordinary, large];
  const {service} = fixture(t, {captureClipboardImage: async () => queue.shift()});
  service.createProject({project_id: 'PROJECT-SCREEN-METADATA', display_name: 'Metadata screen',
    retention_policy: 'METADATA_ONLY'});
  service.createProject({project_id: 'PROJECT-SCREEN-LARGE', display_name: 'Large screen',
    retention_policy: 'RETAIN_TEXT'});

  const metadata = await service.handleScreenContext({project_id: 'PROJECT-SCREEN-METADATA',
    operation: 'CAPTURE_CLIPBOARD'});
  const largeRetained = await service.handleScreenContext({project_id: 'PROJECT-SCREEN-LARGE',
    operation: 'CAPTURE_CLIPBOARD'});

  assert.match(metadata.artifacts.original.artifact_ref, /^digest:\/\/sha256\//u);
  assert.match(metadata.artifacts.fast.artifact_ref, /^digest:\/\/sha256\//u);
  assert.equal(metadata.provenance.original_retained, false);
  assert.equal(metadata.provenance.fast_retained, false);
  assert.equal(metadata.acquisition.workflow_record.content, null);
  assert.equal(metadata.acquisition.workflow_record.content_available_for_current_session, true);

  assert.equal(largeRetained.provenance.original_bytes, oversizedSource.byteLength);
  assert.equal(largeRetained.provenance.original_retained, false);
  assert.match(largeRetained.artifacts.original.artifact_ref, /^digest:\/\/sha256\//u);
  assert.equal(largeRetained.provenance.fast_retained, true);
  assert.match(largeRetained.artifacts.fast.artifact_ref, /^mpc-workspace-artifact:\/\//u);
});

test('Firefox HAR raw secrets never cross the sanitizer into artifacts, SQLite, return data or session acquisitions', async t => {
  const secret = 'HAR-RAW-SECRET-CANARY-7f42a94d';
  const raw = Buffer.from(JSON.stringify({log: {version: '1.2', pages: [], entries: [{
    startedDateTime: stamp,
    time: 12,
    request: {
      method: 'POST',
      url: `https://example.test/private/${secret}?token=${secret}`,
      headers: [{name: 'Authorization', value: `Bearer ${secret}`}, {name: 'Cookie', value: `sid=${secret}`}],
      cookies: [{name: 'sid', value: secret}],
      queryString: [{name: 'token', value: secret}],
      postData: {mimeType: 'application/json', text: JSON.stringify({secret})},
      headersSize: 100,
      bodySize: secret.length
    },
    response: {
      status: 200,
      headers: [{name: 'Set-Cookie', value: `sid=${secret}`}],
      cookies: [{name: 'sid', value: secret}],
      content: {size: secret.length, mimeType: 'application/json', text: secret},
      redirectURL: '',
      headersSize: 100,
      bodySize: secret.length
    },
    cache: {},
    timings: {blocked: 0, dns: 1, connect: 1, ssl: 1, send: 1, wait: 7, receive: 1}
  }]}}), 'utf8');
  const {root, service} = fixture(t, {selectFirefoxHar: async () => ({
    schema_version: 'MPC_FIREFOX_HAR_SELECTION_1', status: 'SELECTED', selection_mode: 'EXPLICIT_DIALOG',
    source_kind: 'FIREFOX_HAR_EXPORT', name: 'firefox.har', media_type: 'application/json',
    bytes: raw, byte_length: raw.byteLength, sha256: hash(raw), utf8_valid: true, selected_at_utc: stamp
  })});
  service.createProject({project_id: 'PROJECT-HAR', display_name: 'HAR context', retention_policy: 'RETAIN_TEXT'});

  const result = await service.handleScreenContext({project_id: 'PROJECT-HAR', operation: 'IMPORT_FIREFOX_HAR'});
  const source = service.store.getSource('PROJECT-HAR', result.acquisition.source.id);
  const retained = service.store.listRetainedAcquisitions('PROJECT-HAR');
  const artifacts = service.store.db.prepare('SELECT * FROM cc_artifacts WHERE project_id=?').all('PROJECT-HAR');
  const returned = JSON.stringify(result);
  const session = JSON.stringify([...service.sessionAcquisitions.values()]);

  assert.equal(result.status, 'FIREFOX_HAR_CONTEXT_IMPORTED');
  assert.equal(result.provenance.raw_sha256, hash(raw));
  assert.equal(result.provenance.raw_bytes, raw.byteLength);
  assert.equal(result.provenance.raw_retained, false);
  assert.equal(result.active_capture, false);
  assert.equal(result.active_packet_capture, false);
  assert.equal(result.causality_established, false);
  assert.equal(source.source_owner, 'FIREFOX_DEVTOOLS');
  assert.equal(source.native_id_type, 'FIREFOX_HAR_SUMMARY');
  assert.equal(source.native_version, `sha256:${hash(raw)}`);
  assert.equal(retained.length, 1);
  assert.match(retained[0].retained_text, /Raw headers, cookies, query values and bodies are omitted/u);
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].artifact_kind, 'INPUT_TEXT');
  assert.doesNotMatch(returned, new RegExp(secret, 'u'));
  assert.doesNotMatch(session, new RegExp(secret, 'u'));
  assert.doesNotMatch(JSON.stringify(retained), new RegExp(secret, 'u'));
  assert.doesNotMatch(JSON.stringify(artifacts), new RegExp(secret, 'u'));

  service.close();
  for (const bytes of allFileBytes(root)) assert.equal(bytes.includes(Buffer.from(secret)), false);
});

test('invalid capture provenance fails before creating a source or artifact', async t => {
  const invalid = captureResult();
  invalid.source.sha256 = '0'.repeat(64);
  const {service} = fixture(t, {captureClipboardImage: async () => invalid});
  service.createProject({project_id: 'PROJECT-SCREEN-INVALID', display_name: 'Invalid screen'});

  await assert.rejects(service.handleScreenContext({project_id: 'PROJECT-SCREEN-INVALID',
    operation: 'CAPTURE_CLIPBOARD'}), error => error.code === 'MPC_WORKSPACE_SCREEN_CONTEXT_SOURCE_HASH_MISMATCH');
  assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM cc_sources WHERE project_id=?')
    .get('PROJECT-SCREEN-INVALID').count, 0);
  assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM cc_artifacts WHERE project_id=?')
    .get('PROJECT-SCREEN-INVALID').count, 0);
});

test('screen context never mutates an unsaved retention choice and maps native cancellation safely', async t => {
  let dialogCalls = 0;
  const {service} = fixture(t, {selectFirefoxHar: async () => {
    dialogCalls++;
    const error = new Error('cancelled');
    error.code = 'MPC_SCREEN_CONTEXT_HAR_SELECTION_CANCELLED';
    throw error;
  }});
  service.createProject({project_id: 'PROJECT-RETENTION', display_name: 'Retention', retention_policy: 'RETAIN_TEXT'});
  await service.ingestInput({project_id: 'PROJECT-RETENTION', kind: 'TEXT', text: 'retained baseline'});

  await assert.rejects(service.handleScreenContext({project_id: 'PROJECT-RETENTION',
    operation: 'IMPORT_FIREFOX_HAR', retention_policy: 'METADATA_ONLY'}),
  error => error.code === 'MPC_WORKSPACE_SCREEN_CONTEXT_RETENTION_NOT_SAVED');
  assert.equal(dialogCalls, 0);
  assert.equal(service.project('PROJECT-RETENTION').retention_policy, 'RETAIN_TEXT');
  assert.equal(service.store.listRetainedAcquisitions('PROJECT-RETENTION').length, 1);

  await assert.rejects(service.handleScreenContext({project_id: 'PROJECT-RETENTION',
    operation: 'IMPORT_FIREFOX_HAR', retention_policy: 'RETAIN_TEXT'}),
  error => error.code === 'MPC_WORKSPACE_SCREEN_CONTEXT_HAR_SELECTION_CANCELLED' && error.status === 409);
  assert.equal(dialogCalls, 1);
  assert.equal(service.project('PROJECT-RETENTION').retention_policy, 'RETAIN_TEXT');
  assert.equal(service.store.listRetainedAcquisitions('PROJECT-RETENTION').length, 1);
});

test('clipboard capture rolls back staged image files and database rows when atomic persistence fails', async t => {
  const {root, service} = fixture(t, {captureClipboardImage: async () => captureResult()});
  service.createProject({project_id: 'PROJECT-SCREEN-ROLLBACK', display_name: 'Rollback', retention_policy: 'RETAIN_TEXT'});
  service.store.acquireScreenContext = () => {
    const error = new Error('forced atomic failure');
    error.code = 'FORCED_ATOMIC_FAILURE';
    throw error;
  };

  await assert.rejects(service.handleScreenContext({project_id: 'PROJECT-SCREEN-ROLLBACK',
    operation: 'CAPTURE_CLIPBOARD'}), error => error.code === 'FORCED_ATOMIC_FAILURE');
  assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM cc_sources WHERE project_id=?')
    .get('PROJECT-SCREEN-ROLLBACK').count, 0);
  assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM cc_artifacts WHERE project_id=?')
    .get('PROJECT-SCREEN-ROLLBACK').count, 0);
  const imageFiles = readdirSync(join(root, 'artifacts', 'PROJECT-SCREEN-ROLLBACK'))
    .filter(name => /\.(?:png|jpg)$/u.test(name));
  assert.deepEqual(imageFiles, []);
});

test('repeated equal clipboard pixels remain separate capture events with no orphan image files', async t => {
  const capture = captureResult();
  const {root, service} = fixture(t, {captureClipboardImage: async () => capture});
  service.createProject({project_id: 'PROJECT-SCREEN-REPEAT', display_name: 'Repeat', retention_policy: 'RETAIN_TEXT'});

  const first = await service.handleScreenContext({project_id: 'PROJECT-SCREEN-REPEAT', operation: 'CAPTURE_CLIPBOARD'});
  const second = await service.handleScreenContext({project_id: 'PROJECT-SCREEN-REPEAT', operation: 'CAPTURE_CLIPBOARD'});
  assert.notEqual(first.acquisition.source.id, second.acquisition.source.id);
  const rows = service.store.db.prepare(`SELECT artifact_ref FROM cc_artifacts
    WHERE project_id=? AND artifact_kind='SCREENSHOT' ORDER BY artifact_ref`).all('PROJECT-SCREEN-REPEAT');
  const referencedNames = rows.map(row => row.artifact_ref.split('/').at(-1)).sort();
  const imageFiles = readdirSync(join(root, 'artifacts', 'PROJECT-SCREEN-REPEAT'))
    .filter(name => /\.(?:png|jpg)$/u.test(name)).sort();
  assert.equal(rows.length, 4);
  assert.deepEqual(imageFiles, referencedNames);
});
