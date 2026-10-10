import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createWorkspaceHostAdapters, HOST_ADAPTER_ENDPOINTS, HOST_ADAPTER_LIMITS} from '../lib/mpc-workspace-host-adapters.mjs';
import {MpcWorkspaceService} from '../lib/mpc-workspace-service.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const COMMIT = 'a'.repeat(40);
const TOKEN = 'synthetic-fixture-access-value';
const REF = 'os-secret://mpc/fixture';
const clock = () => new Date('2026-10-09T20:00:00Z');
const connection = (provider, authenticated = true) => ({provider_namespace: provider, connection_id: 'fixture',
  endpoint_ref: HOST_ADAPTER_ENDPOINTS[provider], secret_store_ref: authenticated ? REF : null, enabled: true});
const jsonResponse = (data, headers = {}) => new Response(JSON.stringify(data), {status: 200, headers: {'Content-Type': 'application/json', ...headers}});
function fileRecord(body = 'selected native text\n', path = 'README.md') {
  const bytes = Buffer.from(body);
  return {type: 'file', path, size: bytes.length, encoding: 'base64', content: bytes.toString('base64'),
    sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')};
}
function harness(responses, options = {}) {
  const calls = [], credentials = [];
  const adapters = createWorkspaceHostAdapters({clock,
    resolveCredential: async (ref, scope) => {credentials.push({ref, scope}); return TOKEN;},
    fetchImpl: async (url, config) => {
      calls.push({url, config});
      const next = responses.shift();
      assert.ok(next, `Unexpected request ${url}`);
      return typeof next === 'function' ? next(url, config) : next;
    }, ...options});
  return {adapters, calls, credentials};
}
async function read(h, provider, input, authenticated = true) {
  const saved = connection(provider, authenticated);
  const context = await h.adapters.getConnectionContext(saved);
  return h.adapters.connections[provider](input, {provider, surface: 'WINDOWS_LOCAL', host_id: context.host_id,
    account_id: context.account_id, operation: 'READ_SELECTED_RESOURCE'}, {connection: saved});
}

test('GitHub binds a moving ref to the returned commit before file read and verifies native blob bytes', async () => {
  const h = harness([jsonResponse({id: 41}), jsonResponse({sha: COMMIT}), jsonResponse(fileRecord(), {'x-github-request-id': 'GITHUB-REQUEST-1'})]);
  const result = await read(h, 'GITHUB', {repository: 'owner/repo', ref: 'feature/current', path: 'README.md'});
  assert.equal(result.resource.native_version, COMMIT);
  assert.equal(result.content, 'selected native text\n');
  assert.equal(result.content_sha256, sha(result.content));
  assert.equal(result.native_request_id, 'GITHUB-REQUEST-1');
  assert.equal(result.context.account_id, 'github:41');
  assert.equal(h.calls.length, 3, 'identity is reused between context and operation');
  assert.match(h.calls[1].url, /commits\/feature%2Fcurrent$/u);
  assert.ok(h.calls[2].url.endsWith(`contents/README.md?ref=${COMMIT}`));
  for (const call of h.calls) {
    assert.equal(call.config.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(call.config.redirect, 'error');
    assert.equal(call.config.credentials, 'omit');
    assert.equal(call.config.method, 'GET');
  }
  assert.ok(h.credentials.every(row => row.ref === REF && row.scope.provider === 'GITHUB'));
  assert.ok(!JSON.stringify(result).includes(TOKEN));
  assert.equal(result.source_instructions_executed, false);
});

test('public GitHub selected reads remain usable without any credential or account ping', async () => {
  const h = harness([jsonResponse({sha: COMMIT}), jsonResponse(fileRecord())], {resolveCredential: () => {throw Error('must not resolve');}});
  const result = await read(h, 'GITHUB', {}, false);
  assert.equal(result.context.account_id, 'PUBLIC_ANONYMOUS');
  assert.equal(result.context.access_mode, 'PUBLIC_READ_ONLY');
  assert.ok(h.calls.every(call => !Object.hasOwn(call.config.headers, 'Authorization')));
});

test('changed GitHub content, wrong commit, and wrong path are refused', async () => {
  for (const [commit, file, code] of [
    [{sha: COMMIT}, {...fileRecord(), content: Buffer.from('different').toString('base64')}, 'HOST_ADAPTER_GIT_BLOB_MISMATCH'],
    [{sha: 'b'.repeat(40)}, fileRecord(), 'HOST_ADAPTER_GIT_COMMIT_MISMATCH'],
    [{sha: COMMIT}, fileRecord('text', 'other.txt'), 'HOST_ADAPTER_GIT_FILE_IDENTITY_INVALID']
  ]) {
    const h = harness([jsonResponse(commit), jsonResponse(file)]);
    await assert.rejects(read(h, 'GITHUB', {ref: COMMIT}, false), {code});
  }
});

test('unregistered endpoints, disabled rows, and wrong provider bindings fail before credential access', async () => {
  let called = false;
  const adapters = createWorkspaceHostAdapters({resolveCredential: () => {called = true;}, fetchImpl: () => {called = true;}});
  for (const endpoint of ['https://api.github.com.evil.test', 'https://api.github.com@evil.test',
    'http://api.github.com', 'https://api.github.com?token=private', 'https://127.0.0.1', 'https://api.github.com/anything']) {
    await assert.rejects(adapters.getConnectionContext({...connection('GITHUB'), endpoint_ref: endpoint}), {code: 'HOST_ADAPTER_ENDPOINT_REJECTED'});
  }
  await assert.rejects(adapters.getConnectionContext({...connection('GITHUB'), enabled: false}), {code: 'HOST_ADAPTER_CONNECTION_BINDING_INVALID'});
  assert.equal(called, false);
});

test('read adapter rejects mutation and arbitrary input fields; source text never becomes dispatch', async () => {
  const h = harness([]);
  const saved = connection('GITHUB', false);
  const expected = {provider: 'GITHUB', surface: 'WINDOWS_LOCAL', host_id: 'MPC_WORKSPACE_LOCAL_HOST', account_id: 'PUBLIC_ANONYMOUS', operation: 'SEND'};
  await assert.rejects(h.adapters.connections.GITHUB({}, expected, {connection: saved}), {code: 'HOST_ADAPTER_OPERATION_UNSUPPORTED'});
  expected.operation = 'READ_SELECTED_RESOURCE';
  await assert.rejects(h.adapters.connections.GITHUB({url: 'https://evil.test', headers: {Authorization: 'bad'}}, expected, {connection: saved}), {code: 'HOST_ADAPTER_INPUT_FIELDS_REJECTED'});
  await assert.rejects(h.adapters.connections.GITHUB({path: '../secret.txt'}, expected, {connection: saved}), {code: 'HOST_ADAPTER_GIT_PATH_INVALID'});
  assert.equal(h.calls.length, 0);
});

test('provider access and transport errors use fixed messages without reflecting upstream secrets', async () => {
  for (const status of [401, 403, 404, 429]) {
    const h = harness([new Response(JSON.stringify({access_token: TOKEN, error: TOKEN}), {status})]);
    await assert.rejects(h.adapters.getConnectionContext(connection('GITHUB')), error =>
      error.code === `HOST_ADAPTER_GITHUB_HTTP_${status}` && !error.message.includes(TOKEN));
  }
  const h = harness([() => {throw Error(`network ${TOKEN}`);}]);
  await assert.rejects(h.adapters.getConnectionContext(connection('GITHUB')), error =>
    error.code === 'HOST_ADAPTER_NETWORK_ERROR' && !error.message.includes(TOKEN));
});

test('missing or wrong-provider credential is explicit and does not fall back to another account', async () => {
  const h = harness([], {resolveCredential: async () => null});
  await assert.rejects(h.adapters.getConnectionContext(connection('GMAIL')), {code: 'HOST_ADAPTER_CREDENTIAL_UNAVAILABLE'});
  await assert.rejects(h.adapters.getConnectionContext(connection('GOOGLE_DRIVE', false)), {code: 'HOST_ADAPTER_CREDENTIAL_REQUIRED'});
  assert.equal(h.calls.length, 0);
});

test('credential replacement changes the cached account binding and stops an older prepared operation', async () => {
  let current = 'first-fixture';
  const h = harness([jsonResponse({id: 1}), jsonResponse({id: 2})], {resolveCredential: async () => current});
  const saved = connection('GITHUB');
  const context = await h.adapters.getConnectionContext(saved);
  current = 'second-fixture';
  await assert.rejects(h.adapters.connections.GITHUB({}, {...context, provider: 'GITHUB', surface: 'WINDOWS_LOCAL', operation: 'READ_SELECTED_RESOURCE'}, {connection: saved}), {code: 'HOST_ADAPTER_ACCOUNT_CHANGED'});
  assert.equal(h.calls.length, 2);
});

test('streaming body limit applies even when content-length is absent', async () => {
  const over = new Response(new ReadableStream({start(controller) {
    controller.enqueue(new Uint8Array(HOST_ADAPTER_LIMITS.response_bytes + 1)); controller.close();
  }}));
  const h = harness([over]);
  await assert.rejects(h.adapters.getConnectionContext(connection('GITHUB')), {code: 'HOST_ADAPTER_RESPONSE_LIMIT'});
});

test('Drive text is bracketed by the same native version and checked against its provider checksum', async () => {
  const bytes = Buffer.from('A selected Drive record');
  const metadata = {id: 'drive_id', name: 'record.txt', mimeType: 'text/plain', version: '5', size: `${bytes.length}`, sha256Checksum: sha(bytes)};
  const h = harness([jsonResponse({user: {permissionId: '42'}}), jsonResponse(metadata), new Response(bytes), jsonResponse(metadata)]);
  const result = await read(h, 'GOOGLE_DRIVE', {file_id: 'drive_id'});
  assert.equal(result.content, bytes.toString());
  assert.equal(result.resource.native_version, '5');
  assert.equal(result.context.account_id, 'drive:42');
  assert.equal(h.calls.length, 4);
  assert.ok(h.calls[2].url.includes('alt=media'));
});

test('Drive version change during export cannot produce a successful content receipt', async () => {
  const metadata = {id: 'doc_id', mimeType: 'application/vnd.google-apps.document', version: '5'};
  const h = harness([jsonResponse({user: {permissionId: '42'}}), jsonResponse(metadata), new Response('draft'), jsonResponse({...metadata, version: '6'})]);
  await assert.rejects(read(h, 'GOOGLE_DRIVE', {file_id: 'doc_id'}), {code: 'HOST_ADAPTER_DRIVE_CHANGED_DURING_READ'});
});

test('Drive spreadsheet text export is explicitly scoped to the first sheet', async () => {
  const metadata = {id: 'sheet_id', mimeType: 'application/vnd.google-apps.spreadsheet', version: '8'};
  const h = harness([jsonResponse({user: {permissionId: '42'}}), jsonResponse(metadata), new Response('name,value\na,1\n'), jsonResponse(metadata)]);
  const result = await read(h, 'GOOGLE_DRIVE', {file_id: 'sheet_id'});
  assert.equal(result.content_scope, 'GOOGLE_SHEET_FIRST_SHEET_CSV');
  assert.ok(h.calls[2].url.endsWith('/export?mimeType=text%2Fcsv'));
});

test('Drive unsupported native and binary formats return honest metadata without blind export', async () => {
  const h = harness([jsonResponse({user: {permissionId: '42'}}), jsonResponse({id: 'pdf_id', mimeType: 'application/pdf', version: '1'})]);
  const result = await read(h, 'GOOGLE_DRIVE', {file_id: 'pdf_id'});
  assert.equal(result.content, null);
  assert.equal(result.content_state, 'BINARY_OR_UNSUPPORTED_NATIVE_FORMAT_USE_FILE_IMPORT');
  assert.equal(h.calls.length, 2);
});

test('Dropbox downloads the selected revision and verifies its distinct native content hash', async () => {
  const body = Buffer.from('selected Dropbox text');
  const digest = sha(createHash('sha256').update(body).digest());
  const metadata = {'.tag': 'file', id: 'id:Dbx123', path_lower: '/selected.txt', path_display: '/Selected.txt',
    rev: '0123456789', size: body.length, content_hash: digest};
  const h = harness([jsonResponse({account_id: 'dbid:42'}), jsonResponse(metadata), new Response(body, {headers: {'Dropbox-API-Result': JSON.stringify(metadata)}})]);
  const result = await read(h, 'DROPBOX', {path: '/Selected.txt'});
  assert.equal(result.content, body.toString());
  assert.equal(result.resource.native_version, metadata.rev);
  assert.equal(result.resource.native_content_hash, digest);
  assert.notEqual(result.content_sha256, digest);
  assert.equal(h.calls[2].url, 'https://content.dropboxapi.com/2/files/download');
  assert.deepEqual(JSON.parse(h.calls[2].config.headers['Dropbox-API-Arg']), {path: `rev:${metadata.rev}`});
});

test('Dropbox wrong native revision is refused before content can be adopted', async () => {
  const metadata = {'.tag': 'file', id: 'id:Dbx123', rev: '0123456789', size: 4, content_hash: sha('unused')};
  const h = harness([jsonResponse({account_id: 'dbid:42'}), jsonResponse(metadata), new Response('body', {headers: {'Dropbox-API-Result': JSON.stringify({...metadata, rev: '9999999999'})}})]);
  await assert.rejects(read(h, 'DROPBOX', {path: metadata.id}), {code: 'HOST_ADAPTER_DROPBOX_REVISION_MISMATCH'});
});

test('Gmail reads exactly one message, extracts plain text, and excludes attachments and send operations', async () => {
  const h = harness([jsonResponse({emailAddress: 'fixture@example.test'}), jsonResponse({id: 'abcd', historyId: '7', threadId: 'thread1', payload: {
    mimeType: 'multipart/mixed', headers: [{name: 'Subject', value: 'Selected message'}, {name: 'X-Private-Header', value: 'not requested'}], parts: [
      {mimeType: 'text/plain', body: {data: Buffer.from('User message text').toString('base64url')}},
      {mimeType: 'text/html', body: {data: Buffer.from('<script>sendAll()</script>').toString('base64url')}},
      {mimeType: 'text/plain', filename: 'secret.txt', body: {attachmentId: 'attachment1', data: Buffer.from('attachment').toString('base64url')}}
    ]}})]);
  const result = await read(h, 'GMAIL', {message_id: 'abcd'});
  assert.equal(result.content, 'User message text');
  assert.equal(result.attachment_fetch_performed, false);
  assert.equal(result.message_send_performed, false);
  assert.equal(result.resource.headers.length, 1);
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(call => call.config.method === 'GET'));
});

test('Gmail HTML-only messages remain inert text and metadata selection does not fetch full text', async () => {
  const html = '<script>dangerousInstructions()</script>';
  const h = harness([jsonResponse({emailAddress: 'fixture@example.test'}), jsonResponse({id: 'abcd', historyId: '7', payload: {mimeType: 'text/html', body: {data: Buffer.from(html).toString('base64url')}}})]);
  const result = await read(h, 'GMAIL', {message_id: 'abcd'});
  assert.equal(result.content, html);
  assert.equal(result.content_scope, 'MESSAGE_RAW_HTML_TEXT_NOT_RENDERED_ATTACHMENTS_EXCLUDED');
  const minimal = harness([jsonResponse({emailAddress: 'fixture@example.test'}), jsonResponse({id: 'abcd', historyId: '7', payload: {headers: []}})]);
  const metadata = await read(minimal, 'GMAIL', {message_id: 'abcd', include_content: false});
  assert.equal(metadata.content, null);
  assert.ok(minimal.calls[1].url.endsWith('format=metadata'));
});

test('local MPC executes the actual bundled contract without credentials, network, or hosted authentication', async () => {
  const h = harness([], {resolveCredential: () => {throw Error('no credential');}, fetchImpl: () => {throw Error('no network');}});
  const result = await read(h, 'LOCAL_MPC', {}, false);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.execution_surface, 'IN_PROCESS_LOCAL');
  assert.equal(result.context.account_id, 'LOCAL_PROCESS');
  assert.equal(result.runtime.implemented_evaluators, 24);
  assert.ok(result.contract.packet_schema);
  assert.equal(result.hosted_mpc_authentication, false);
  assert.equal(result.resource.owner, 'BUNDLED_LOCAL_MPC');
});

test('service binds the saved credential reference into a real adapter and records its actual read observation', async t => {
  const dataRoot = mkdtempSync(join(tmpdir(), 'mpc-host-adapter-'));
  const h = harness([jsonResponse({id: 41}), jsonResponse({sha: COMMIT}), jsonResponse(fileRecord())]);
  const service = new MpcWorkspaceService({dataRoot, adapters: h.adapters, clock});
  t.after(() => {service.close(); rmSync(dataRoot, {recursive: true, force: true});});
  service.createProject({project_id: 'ADAPTER-PROJECT', display_name: 'Adapter test', retention_policy: 'RETAIN_TEXT'});
  const saved = service.configureConnection({project_id: 'ADAPTER-PROJECT', configuration: {
    connection_id: 'selected-github', display_name: 'GitHub', provider_namespace: 'GITHUB', transport: 'PLUGIN',
    endpoint_or_command: HOST_ADAPTER_ENDPOINTS.GITHUB, credential_ref: REF}});
  const result = await service.testConnection({project_id: 'ADAPTER-PROJECT', connection_id: saved.connection_id,
    operation: 'READ_SELECTED_RESOURCE', operation_input: {path: 'README.md'}});
  assert.equal(result.last_operation_verified, true);
  assert.equal(result.expected.account_id, 'github:41');
  assert.equal(result.operation_result.content, 'selected native text\n');
  assert.ok(result.operation_receipt_id);
  assert.ok(!JSON.stringify(result).includes(TOKEN));
  assert.equal(service.store.getConnection('ADAPTER-PROJECT', saved.connection_id).latest_observation.observation_state, 'SUCCEEDED');
});

test('service records account-resolution failures and rejects mismatched success contexts', async t => {
  const dataRoot = mkdtempSync(join(tmpdir(), 'mpc-host-identity-error-'));
  const h = harness([new Response('denied', {status: 403})]);
  const service = new MpcWorkspaceService({dataRoot, adapters: h.adapters, clock});
  t.after(() => {service.close(); rmSync(dataRoot, {recursive: true, force: true});});
  service.createProject({project_id: 'ERROR-PROJECT', display_name: 'Identity failure test', retention_policy: 'RETAIN_TEXT'});
  const saved = service.configureConnection({project_id: 'ERROR-PROJECT', configuration: {
    connection_id: 'failed-github', display_name: 'GitHub', provider_namespace: 'GITHUB', transport: 'PLUGIN',
    endpoint_or_command: HOST_ADAPTER_ENDPOINTS.GITHUB, credential_ref: REF}});
  const request = {project_id: 'ERROR-PROJECT', connection_id: saved.connection_id, operation: 'READ_SELECTED_RESOURCE'};
  const failure = await service.testConnection(request);
  assert.equal(failure.current_observation.error.code, 'HOST_ADAPTER_GITHUB_HTTP_403');
  assert.equal(failure.last_operation_verified, false);
  assert.equal(service.store.getConnection('ERROR-PROJECT', saved.connection_id).latest_observation.observation_state, 'FAILED');
  service.adapters.getConnectionContext = async () => ({host_id: 'HOST-A', account_id: 'ACCOUNT-A'});
  service.adapters.connections.GITHUB = async () => ({status: 'SUCCESS', receipt_id: 'WRONG-CONTEXT', context: {account_id: 'ACCOUNT-B'}});
  const mismatch = await service.testConnection(request);
  assert.equal(mismatch.assessment.status, 'OBSERVATION_CONTEXT_MISMATCH');
  assert.equal(mismatch.last_operation_verified, false);
  assert.equal(mismatch.operation_receipt_id, null);
});
