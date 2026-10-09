import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer, request as httpRequest} from 'node:http';
import test from 'node:test';
import {canonicalOllamaModelName, findInstalledOllamaModel, runOllamaWorkspaceModel} from '../lib/mpc-workspace-models.mjs';
import {MpcWorkspaceModelSetup} from '../lib/mpc-workspace-model-setup.mjs';
import {startInstalledOllama} from '../lib/ollama-process.mjs';
import {startInstalledOllama as existingStart} from '../lib/local-chat-server.mjs';
import {createOllamaClient, DEFAULT_BASE_MODEL, MPC_MODEL, MPC_SYSTEM_PROMPT, OLLAMA_ORIGIN} from '../lib/ollama-local-chat.mjs';
import {MPC_WORKSPACE_CSP, startMpcWorkspaceServer} from '../scripts/mpc-workspace-server.mjs';

const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};};
const collect = async stream => {const events = []; for await (const event of stream) events.push(event); return events;};
const descriptor = model => ({name: model, model, digest: `digest-${model}`, size: 42, details: {format: 'gguf'}});

function clientFixture(overrides = {}) {
  const calls = [];
  const models = [];
  return {calls, models, client: {
    status: async () => ({available: true, endpoint: OLLAMA_ORIGIN, version: 'fixture-only'}),
    listModels: async () => ({models: structuredClone(models), excluded_models: []}),
    async *pullModel(input) {
      calls.push({operation: 'pull', ...input});
      yield {type: 'progress', operation: 'pull', status: 'downloading', total: 100, completed: 50};
      models.push(descriptor(DEFAULT_BASE_MODEL));
      yield {type: 'done', operation: 'pull', outcome: 'COMPLETED', requested_model: DEFAULT_BASE_MODEL};
    },
    async *createMpcModel(input) {
      calls.push({operation: 'create', ...input});
      models.push(descriptor(`${MPC_MODEL}:latest`));
      yield {type: 'done', operation: 'create', outcome: 'COMPLETED', requested_model: MPC_MODEL, configuration_only: true};
    },
    ...overrides
  }};
}

function blockedDownload() {
  const entered = deferred();
  const ended = deferred();
  const fixture = clientFixture({async *pullModel({model, signal}) {
    fixture.calls.push({operation: 'pull', model, signal});
    entered.resolve(signal);
    try {
      await new Promise((_, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener('abort', () => reject(signal.reason), {once: true});
      });
    } finally {ended.resolve();}
  }});
  return {...fixture, entered, ended};
}

async function setupHost(t, manager) {
  const rendererRoot = mkdtempSync(join(tmpdir(), 'mpc-model-setup-http-'));
  writeFileSync(join(rendererRoot, 'index.html'), `<meta http-equiv="Content-Security-Policy" content="${MPC_WORKSPACE_CSP}"><main>Fixture</main>`);
  writeFileSync(join(rendererRoot, 'styles.css'), '');
  writeFileSync(join(rendererRoot, 'app.js'), '');
  for(const file of ['screen-policy.js','screen-reader.js','capture.js','capture.html'])writeFileSync(join(rendererRoot,file),'');
  const running = await startMpcWorkspaceServer({rendererRoot, service: {
    bootstrap: async () => ({service: {status: 'READY_LOCAL'}}),
    localModelStatus: () => manager.status(),
    startLocalModel: input => manager.start(input),
    streamLocalModelSetup: (operation, input, options) => manager.run(operation, input, options),
    cancelLocalModelSetup: input => manager.cancel(input),
    close: () => manager.close()
  }});
  t.after(async () => {await running.close(); rmSync(rendererRoot, {recursive: true, force: true});});
  const origin = running.url.slice(0, -1);
  const call = (path, {method = 'GET', body, headers = {}, signal} = {}) => fetch(`${origin}${path}`, {
    method, ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal,
    headers: {'Content-Type': 'application/json; charset=utf-8', Origin: origin, 'X-MPC-CSRF': running.csrfToken, ...headers}
  });
  return {...running, origin, call};
}

test('only the documented default latest alias matches, preserving observed descriptor and digest', () => {
  const named = descriptor(`${MPC_MODEL}:latest`);
  assert.equal(canonicalOllamaModelName(MPC_MODEL), `${MPC_MODEL}:latest`);
  assert.equal(canonicalOllamaModelName('org/my-model'), 'org/my-model:latest');
  assert.equal(canonicalOllamaModelName('org/my-model:v2'), 'org/my-model:v2');
  assert.equal(findInstalledOllamaModel([named], MPC_MODEL), named);
  assert.equal(findInstalledOllamaModel([named], `${MPC_MODEL}:other`), null);
  assert.equal(findInstalledOllamaModel([descriptor(`other/${MPC_MODEL}:latest`)], MPC_MODEL), null);
  assert.equal(findInstalledOllamaModel([{}, {model: null}], MPC_MODEL), null);
  assert.throws(() => canonicalOllamaModelName('model-cloud:latest'), /LOCAL_MODEL_NAME_REQUIRED/u);
  assert.equal(named.digest, `digest-${MPC_MODEL}:latest`);
});

test('source-bound inference accepts latest alias while preserving the returned model and rejecting a different tag', async () => {
  const packet = {problem: 'What is recorded?', workflow: {records: [{source_ref: 'S1', version: 'V1', content: 'The fixture records alpha.'}]}};
  const routed = {work_stage: 'ANALYSIS', next_action: {kind: 'REVIEW'}, workflow: {source_records: [{source_ref: 'S1', version: 'V1', owner: 'fixture', state: 'CONTENT_AVAILABLE'}]}};
  const proposal = JSON.stringify({observations: [{source_ref: 'S1', quote: 'alpha', meaning: 'The fixture names alpha.'}], interpretation: 'The record names alpha.', next_question: 'Which version is next?', assessment: 'UNDETERMINED'});
  const invoke = observed => runOllamaWorkspaceModel(packet, routed, {model: MPC_MODEL, fetchImpl: async url =>
    url.endsWith('/api/show')?new Response(JSON.stringify({capabilities:['completion'],details:{format:'gguf'}})):
      new Response(`${JSON.stringify({model: observed, message: {content: proposal}, done: true,done_reason:'stop'})}\n`)});
  const accepted = await invoke(`${MPC_MODEL}:latest`);
  assert.equal(accepted.status, 'MODEL_PROPOSAL_READY');
  assert.equal(accepted.requested_model, MPC_MODEL);
  assert.equal(accepted.observed_model, `${MPC_MODEL}:latest`);
  assert.equal(accepted.identity_normalization, 'OLLAMA_DEFAULT_LATEST');
  assert.equal((await invoke(`${MPC_MODEL}:other`)).status, 'OBSERVED_MODEL_MISMATCH');
});

test('status separates running Ollama with no models, observed installations, and offline service without installing', async () => {
  const fixture = clientFixture();
  const manager = new MpcWorkspaceModelSetup({client: fixture.client});
  const empty = await manager.status();
  assert.equal(empty.ollama.state, 'READY');
  assert.equal(empty.starter.installed, false);
  assert.equal(empty.mpc.installed, false);
  fixture.models.push(descriptor(DEFAULT_BASE_MODEL), descriptor(`${MPC_MODEL}:latest`));
  const installed = await manager.status();
  assert.equal(installed.starter.installed, true);
  assert.equal(installed.mpc.observed_model, `${MPC_MODEL}:latest`);
  assert.equal(installed.mpc.digest, `digest-${MPC_MODEL}:latest`);
  assert.equal(installed.ollama.inference_verified, false);
  assert.equal(fixture.calls.length, 0);
  fixture.client.listModels = async () => {throw Object.assign(new Error('Fixture offline'), {code: 'OLLAMA_CONNECTION_FAILED'});};
  const offline = await manager.status();
  assert.equal(offline.ollama.state, 'OFFLINE');
  assert.equal(offline.ollama.error.code, 'OLLAMA_CONNECTION_FAILED');
  assert.equal(offline.starter.installed, false);
});

test('explicit setup uses only the fixed starter and named configuration and reports progressive completion', async () => {
  const fixture = clientFixture();
  const manager = new MpcWorkspaceModelSetup({client: fixture.client});
  const pulled = await collect(manager.run('pull', {request_id: 'pull-1'}));
  assert.deepEqual(pulled.map(row => row.type), ['start', 'progress', 'done']);
  assert.equal(fixture.calls[0].model, DEFAULT_BASE_MODEL);
  assert.equal(pulled[1].completed, 50);
  assert.ok(pulled.every(row => row.request_id === 'pull-1'));
  const created = await collect(manager.run('create', {request_id: 'create-1'}));
  assert.equal(created.at(-1).configuration_only, true);
  assert.deepEqual(Object.keys(fixture.calls[1]).sort(), ['operation', 'signal']);
  assert.equal((await manager.status()).mpc.installed, true);
  assert.equal((await manager.status()).active_operation, null);
});

test('arbitrary model, endpoint, command, and credential setup arguments are rejected before any provider call', async () => {
  const fixture = clientFixture();
  const manager = new MpcWorkspaceModelSetup({client: fixture.client});
  for (const extra of [{model: 'different:tag'}, {endpoint: 'https://example.invalid'}, {command: 'anything'}, {credential_ref: 'anything'}]) {
    await assert.rejects(collect(manager.run('pull', {request_id: 'bad-shape', ...extra})), {code: 'MPC_WORKSPACE_MODEL_SETUP_INPUT_INVALID'});
  }
  await assert.rejects(manager.start({command: 'anything'}), {code: 'MPC_WORKSPACE_MODEL_SETUP_INPUT_INVALID'});
  await assert.rejects(collect(manager.run('delete', {request_id: 'delete'})), {code: 'MPC_WORKSPACE_MODEL_SETUP_OPERATION_INVALID'});
  await assert.rejects(collect(manager.run('pull', {request_id: '../bad'})), {code: 'MPC_WORKSPACE_MODEL_SETUP_REQUEST_ID_REQUIRED'});
  assert.equal(fixture.calls.length, 0);
});

test('a repeated request never starts another pull and concurrent setup returns busy', async () => {
  const fixture = blockedDownload();
  const manager = new MpcWorkspaceModelSetup({client: fixture.client});
  const running = collect(manager.run('pull', {request_id: 'once'}));
  await fixture.entered.promise;
  await assert.rejects(collect(manager.run('create', {request_id: 'other'})), {code: 'MPC_WORKSPACE_MODEL_SETUP_BUSY'});
  await assert.rejects(manager.start(), {code: 'MPC_WORKSPACE_MODEL_SETUP_BUSY'});
  manager.cancel({request_id: 'once'});
  await running;
  await assert.rejects(collect(manager.run('pull', {request_id: 'once'})), {code: 'MPC_WORKSPACE_MODEL_SETUP_REQUEST_REPLAY'});
  assert.equal(fixture.calls.length, 1);
});

test('explicit cancellation is scoped to the exact request and preserves honest incomplete status', async () => {
  const fixture = blockedDownload();
  const manager = new MpcWorkspaceModelSetup({client: fixture.client});
  const running = collect(manager.run('pull', {request_id: 'active-pull'}));
  const signal = await fixture.entered.promise;
  assert.equal(manager.cancel({request_id: 'unrelated'}).cancelled, false);
  assert.equal(signal.aborted, false);
  assert.equal(manager.cancel({request_id: 'active-pull'}).cancelled, true);
  const events = await running;
  assert.equal(events.at(-1).code, 'MPC_WORKSPACE_MODEL_SETUP_CANCELLED');
  assert.ok(events.every(row => row.type !== 'done'));
  assert.equal((await manager.status()).active_operation, null);
});

test('unfinished and invalid setup streams do not produce completed events', async () => {
  for (const source of [async function* () {yield {type: 'progress', status: 'working'};}, async function* () {
    yield {type: 'done', outcome: 'COMPLETED'};
    yield {type: 'progress', status: 'extra after completion'};
  }]) {
    const fixture = clientFixture({pullModel: source});
    const manager = new MpcWorkspaceModelSetup({client: fixture.client});
    const events = await collect(manager.run('pull', {request_id: 'broken'}));
    assert.equal(events.at(-1).type, 'error');
    assert.ok(events.every(row => row.type !== 'done'));
  }
});

test('start invokes only the installed-daemon helper, then reports status; errors retain a useful setup action', async () => {
  const fixture = clientFixture();
  let starts = 0;
  const manager = new MpcWorkspaceModelSetup({client: fixture.client, startOllama: async client => {
    assert.equal(client, fixture.client); starts++; return {started_by_workspace: true};
  }});
  assert.equal(starts, 0);
  const result = await manager.start();
  assert.equal(starts, 1);
  assert.equal(result.startup.started_by_workspace, true);
  assert.equal(result.ollama.state, 'READY');
  assert.equal(fixture.calls.length, 0);
  const missing = new MpcWorkspaceModelSetup({client: fixture.client, startOllama: async () => {throw new Error('Install Ollama first.');}});
  await assert.rejects(missing.start(), error => error.code === 'MPC_WORKSPACE_OLLAMA_START_FAILED' && error.nextAction.includes('Windows Start menu'));
});

test('standalone chat retains the same shared start function and an already-running daemon needs no spawn', async () => {
  assert.equal(existingStart, startInstalledOllama);
  const fixture = clientFixture();
  const observed = await existingStart(fixture.client);
  assert.equal(observed.already_running, true);
  assert.equal(observed.version, 'fixture-only');
  assert.equal(fixture.calls.length, 0);
});

test('HTTP setup shares the existing CSRF, Origin, Host and request-shape protections', async t => {
  const fixture = clientFixture();
  const manager = new MpcWorkspaceModelSetup({client: fixture.client, startOllama: async () => ({already_running: true})});
  const host = await setupHost(t, manager);
  assert.equal((await (await host.call('/api/workspace/local-model/status')).json()).ollama.state, 'READY');
  const csrf = await host.call('/api/workspace/local-model/pull', {method: 'POST', body: {request_id: 'bad-csrf'}, headers: {'X-MPC-CSRF': ''}});
  assert.equal(csrf.status, 403);
  const origin = await host.call('/api/workspace/local-model/start', {method: 'POST', body: {}, headers: {Origin: 'https://example.invalid'}});
  assert.equal(origin.status, 403);
  const badHost = await new Promise((resolve, reject) => {
    const request = httpRequest(`${host.origin}/api/workspace/local-model/status`, {headers: {Host: 'example.invalid'}}, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject); request.end();
  });
  assert.equal(badHost, 421);
  const arbitrary = await host.call('/api/workspace/local-model/pull', {method: 'POST', body: {request_id: 'bad-model', model: 'arbitrary'}});
  assert.equal(arbitrary.status, 400);
  assert.equal((await arbitrary.json()).error, 'MPC_WORKSPACE_MODEL_SETUP_INPUT_INVALID');
  assert.equal((await host.call('/api/workspace/local-model/delete', {method: 'POST', body: {}})).status, 404);
  assert.equal(fixture.calls.length, 0);
  const started = await host.call('/api/workspace/local-model/start', {method: 'POST', body: {}});
  assert.equal((await started.json()).startup.already_running, true);
  const pulled = await host.call('/api/workspace/local-model/pull', {method: 'POST', body: {request_id: 'http-pull'}});
  assert.match(pulled.headers.get('content-type'), /application\/x-ndjson/u);
  const rows = (await pulled.text()).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map(row => row.type), ['start', 'progress', 'done']);
});

test('HTTP Stop cancels the active download and leaves the stream with a cancellation receipt', async t => {
  const fixture = blockedDownload();
  const manager = new MpcWorkspaceModelSetup({client: fixture.client});
  const host = await setupHost(t, manager);
  const response = await host.call('/api/workspace/local-model/pull', {method: 'POST', body: {request_id: 'http-cancel'}});
  assert.equal(response.status, 200);
  await fixture.entered.promise;
  const stopped = await host.call('/api/workspace/local-model/cancel', {method: 'POST', body: {request_id: 'http-cancel'}});
  assert.equal((await stopped.json()).cancelled, true);
  const events = (await response.text()).trim().split('\n').map(JSON.parse);
  assert.equal(events.at(-1).code, 'MPC_WORKSPACE_MODEL_SETUP_CANCELLED');
});

test('HTTP disconnect aborts the adapter and releases the active setup slot', async t => {
  const fixture = blockedDownload();
  const manager = new MpcWorkspaceModelSetup({client: fixture.client});
  const host = await setupHost(t, manager);
  const controller = new AbortController();
  const response = await host.call('/api/workspace/local-model/pull', {method: 'POST', body: {request_id: 'http-disconnect'}, signal: controller.signal});
  assert.equal(response.status, 200);
  const signal = await fixture.entered.promise;
  const reading = response.text().catch(() => 'aborted');
  controller.abort();
  await reading;
  await fixture.ended.promise;
  assert.equal(signal.aborted, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.active, null);
});

test('service close aborts setup and blocks subsequent operations', async () => {
  const fixture = blockedDownload();
  const manager = new MpcWorkspaceModelSetup({client: fixture.client});
  const running = collect(manager.run('pull', {request_id: 'closing'}));
  await fixture.entered.promise;
  manager.close();
  const events = await running;
  assert.equal(events.at(-1).code, 'MPC_WORKSPACE_MODEL_SETUP_CANCELLED');
  await assert.rejects(manager.status(), {code: 'MPC_WORKSPACE_MODEL_SETUP_CLOSED'});
});

test('real loopback HTTP fixture exercises native Ollama pull/create payloads and observed latest tag', async t => {
  const calls = [];
  const models = [];
  const provider = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
    calls.push({path: request.url, body});
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/version') return response.end(JSON.stringify({version: 'fixture-only'}));
    if (request.url === '/api/tags') return response.end(JSON.stringify({models}));
    if (request.url === '/api/show') return response.end(JSON.stringify({model: body.model.includes(':') ? body.model : `${body.model}:latest`, capabilities: ['completion'], details: {format: 'gguf'}}));
    if (request.url === '/api/pull' || request.url === '/api/create') {
      models.push(descriptor(request.url === '/api/create' ? `${body.model}:latest` : body.model));
      response.setHeader('Content-Type', 'application/x-ndjson');
      response.write(`${JSON.stringify({status: 'working', total: 100, completed: 50})}\n`);
      return response.end(`${JSON.stringify({status: 'success'})}\n`);
    }
    response.statusCode = 404; response.end('{}');
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {provider.close(resolve); provider.closeAllConnections();}));
  const origin = `http://127.0.0.1:${provider.address().port}`;
  const client = createOllamaClient({fetchImpl: (url, options) => {
    assert.ok(url.startsWith(OLLAMA_ORIGIN));
    return fetch(`${origin}${url.slice(OLLAMA_ORIGIN.length)}`, options);
  }});
  const manager = new MpcWorkspaceModelSetup({client});
  assert.equal((await manager.status()).starter.installed, false);
  assert.equal(calls.filter(row => ['/api/pull', '/api/create'].includes(row.path)).length, 0);
  assert.equal((await collect(manager.run('pull', {request_id: 'native-pull'}))).at(-1).outcome, 'COMPLETED');
  const created = (await collect(manager.run('create', {request_id: 'native-create'}))).at(-1);
  assert.equal(created.configuration_only, true);
  assert.equal(created.inference_verified, false);
  const pull = calls.find(row => row.path === '/api/pull').body;
  assert.deepEqual(pull, {model: DEFAULT_BASE_MODEL, stream: true});
  const create = calls.find(row => row.path === '/api/create').body;
  assert.equal(create.model, MPC_MODEL);
  assert.equal(create.from, DEFAULT_BASE_MODEL);
  assert.equal(create.system, MPC_SYSTEM_PROMPT);
  assert.deepEqual(create.parameters, {temperature: 0, num_ctx: 8192});
  const status = await manager.status();
  assert.equal(status.mpc.installed, true);
  assert.equal(status.mpc.observed_model, `${MPC_MODEL}:latest`);
  assert.equal(calls.some(row => row.path === '/api/chat'), false);
});
