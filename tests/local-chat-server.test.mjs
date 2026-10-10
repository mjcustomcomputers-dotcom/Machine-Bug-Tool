import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, request as httpRequest} from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOllamaClient, DEFAULT_BASE_MODEL, MPC_MODEL, OLLAMA_ORIGIN} from '../lib/ollama-local-chat.mjs';
import {createLocalChatServer, prepareConversationContext} from '../lib/local-chat-server.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'mpc-local-http-'));
  const calls = []; const sockets = new Set();
  let mode = 'complete', startCalls = 0, thinkingValues = null;
  const upstream = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    calls.push({path: req.url, body});
    res.setHeader('Content-Type', 'application/json');
    const send = value => res.end(JSON.stringify(value));
    if (req.url === '/api/version') return send({version: 'fixture-transport-only'});
    if (req.url === '/api/tags') return send({models: [{name: MPC_MODEL + ':latest', model: MPC_MODEL + ':latest', digest: 'fixture-sha256-local', size: 1024, details: {family: 'fixture'}}]});
    if (req.url === '/api/show') return send({capabilities: ['completion'], details: {family: 'fixture'}, model_info: {architecture: 'fixture'}, parameters: 'num_ctx 8192', ...(thinkingValues ? {thinking: {values: thinkingValues, default: thinkingValues[0]}} : {})});
    res.setHeader('Content-Type', 'application/x-ndjson');
    if (req.url === '/api/pull' || req.url === '/api/create') {
      res.write(JSON.stringify({status: 'processing', completed: 4, total: 8}) + '\n');
      return res.end(JSON.stringify({status: 'success'}) + '\n');
    }
    if (req.url !== '/api/chat') {res.statusCode = 404; return send({error: 'fixture route not found'});}
    const model = body.model.includes(':') ? body.model : body.model + ':latest';
    const partial = {model, message: {role: 'assistant', content: mode === 'cancel' ? 'Partial answer' : 'Hello café 👋'}, done: false};
    res.write(JSON.stringify(partial) + '\n');
    if (mode === 'cancel') return;
    if (mode === 'error') return res.end(JSON.stringify({error: 'Controlled upstream failure'}) + '\n');
    if (mode === 'truncated') return res.end();
    return res.end(JSON.stringify({model, message: {role: 'assistant', content: ''}, done: true,
      done_reason: mode === 'length' ? 'length' : 'stop', eval_count: 4, prompt_eval_count: 20, total_duration: 1000}) + '\n');
  });
  upstream.on('connection', socket => {sockets.add(socket); socket.on('close', () => sockets.delete(socket));});
  await new Promise(done => upstream.listen(0, '127.0.0.1', done));
  const fixtureOrigin = 'http://127.0.0.1:' + upstream.address().port;
  const client = createOllamaClient({fetchImpl(url, options) {
    assert.equal(new URL(url).origin, OLLAMA_ORIGIN);
    return fetch(fixtureOrigin + new URL(url).pathname, options);
  }});
  let app, url, token;
  async function start() {
    app = createLocalChatServer({dataFile: join(directory, 'chat.sqlite'), client,
      startOllama: async () => {startCalls++; return {available: true, endpoint: OLLAMA_ORIGIN, fixture: true};}});
    url = (await app.listen()).url;
    token = (await (await fetch(url + '/api/local/session')).json()).token;
  }
  await start();
  t.after(async () => {
    await app.close(); sockets.forEach(socket => socket.destroy());
    await new Promise(done => upstream.close(done)); await rm(directory, {recursive: true, force: true});
  });
  async function api(path, body, method = 'POST', overrides = {}) {
    return fetch(url + path, {method, headers: {'Content-Type': 'application/json', 'X-MPC-Token': token, ...overrides.headers},
      ...(body === undefined ? {} : {body: typeof body === 'string' ? body : JSON.stringify(body)}), ...overrides});
  }
  async function project(retain_history = false) {
    const response = await api('/api/local/projects', {name: 'Fixture project', retain_history});
    assert.equal(response.status, 201); return response.json();
  }
  const events = async response => {assert.equal(response.status, 200); return (await response.text()).trim().split('\n').map(line => JSON.parse(line));};
  return {calls, api, project, events, get url() {return url;}, get token() {return token;}, set mode(value) {mode = value;}, set thinkingValues(value) {thinkingValues = value;},
    get startCalls() {return startCalls;}, async restart() {await app.close(); await start();}};
}
const message = (project, request_id, text = 'Hello without attached evidence') => ({project_id: project.id, model: MPC_MODEL, text, request_id});

test('serves the actual UI, reports observed service metadata, and makes no automatic setup or inference call', async t => {
  const f = await fixture(t);
  for (const [path, expected] of [['/', 'MPC'], ['/app.js', '/api/local/'], ['/styles.css', '{']]) {
    const response = await fetch(f.url + path); assert.equal(response.status, 200); assert.match(await response.text(), new RegExp(expected));
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  }
  const status = await (await fetch(f.url + '/api/local/status')).json();
  assert.equal(status.ollama.state, 'available'); assert.equal(status.ollama.version, 'fixture-transport-only');
  assert.match(status.app.instance_id, /^[a-f0-9]{48}$/); assert.equal(status.projects.length, 0);
  assert.deepEqual(f.calls.map(c => c.path).sort(), ['/api/tags', '/api/version']);
});

test('empty-project chat streams real HTTP frames, includes a full prior exchange on follow-up, and avoids duplicate inference', async t => {
  const f = await fixture(t), p = await f.project();
  const first = await f.events(await f.api('/api/local/chat', message(p, 'request_first')));
  assert.equal(first[0].type, 'start'); assert.equal(first.at(-1).outcome, 'COMPLETED');
  assert.equal(first.filter(e => e.type === 'delta').map(e => e.text).join(''), 'Hello café 👋');
  assert.equal(f.calls.find(c => c.path === '/api/chat').body.messages.length, 2);
  const next = await f.events(await f.api('/api/local/chat', message(p, 'request_second', 'What did I just say?')));
  assert.equal(next[0].context.complete_exchanges_included, 1);
  const sent = f.calls.filter(c => c.path === '/api/chat').at(-1).body;
  assert.deepEqual(sent.messages.map(m => m.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(sent.messages[1].content, 'Hello without attached evidence');
  const duplicate = await f.api('/api/local/chat', message(p, 'request_second'));
  assert.equal(duplicate.status, 409); assert.equal(f.calls.filter(c => c.path === '/api/chat').length, 2);
});

test('selected file text reaches the model as labeled data and persists only when retention is selected', async t => {
  const f = await fixture(t), retained = await f.project(true), transient = await f.project(false);
  const attachments = [{name: 'source.txt', text: 'Imported bytes: exact café'}];
  await f.events(await f.api('/api/local/chat', {...message(retained, 'request_saved'), attachments}));
  await f.events(await f.api('/api/local/chat', message(transient, 'request_memory')));
  assert.match(f.calls.find(c => c.path === '/api/chat').body.messages.at(-1).content, /Imported bytes: exact café/);
  await f.restart();
  const a = await (await fetch(f.url + `/api/local/projects/${retained.id}/conversation`)).json();
  const b = await (await fetch(f.url + `/api/local/projects/${transient.id}/conversation`)).json();
  assert.equal(a.messages.length, 2); assert.deepEqual(a.messages[0].attachments, attachments); assert.equal(a.draft, '');
  assert.equal(b.messages.length, 0);
});

test('length-limited output retains its draft and is excluded from subsequent model history', async t => {
  const f = await fixture(t), p = await f.project(true); f.mode = 'length';
  const result = await f.events(await f.api('/api/local/chat', message(p, 'request_incomplete', 'Keep my draft')));
  assert.equal(result.at(-1).outcome, 'INCOMPLETE');
  let saved = await (await fetch(f.url + `/api/local/projects/${p.id}/conversation`)).json();
  assert.equal(saved.draft, 'Keep my draft'); assert.equal(saved.messages.at(-1).status, 'INCOMPLETE');
  f.mode = 'complete';
  const next = await f.events(await f.api('/api/local/chat', message(p, 'request_after_incomplete')));
  assert.equal(next[0].context.incomplete_exchanges_excluded, 1);
  assert.equal(f.calls.filter(c => c.path === '/api/chat').at(-1).body.messages.length, 2);
});

test('Stop cancels the upstream HTTP stream and preserves a partial answer and draft', async t => {
  const f = await fixture(t), p = await f.project(true); f.mode = 'cancel';
  const response = await f.api('/api/local/chat', message(p, 'request_cancelled', 'Preserve this question'));
  const reader = response.body.getReader(); let text = '';
  while (!text.includes('Partial answer')) {const chunk = await reader.read(); assert.equal(chunk.done, false); text += new TextDecoder().decode(chunk.value);}
  const during = await (await fetch(f.url + '/api/local/status')).json();
  assert.equal(during.active_operations[0].request_id, 'request_cancelled');
  assert.equal((await f.api('/api/local/chat', message(p, 'request_while_busy'))).status, 409);
  assert.equal((await f.api(`/api/local/projects/${p.id}/draft`, {text: 'Another window draft'})).status, 409);
  assert.deepEqual(await (await f.api('/api/local/cancel', {request_id: 'request_cancelled'})).json(), {cancelled: true});
  while (true) {const chunk = await reader.read(); if (chunk.done) break; text += new TextDecoder().decode(chunk.value);}
  const events = text.trim().split('\n').map(JSON.parse);
  assert.equal(events.at(-1).code, 'REQUEST_CANCELLED');
  const saved = await (await fetch(f.url + `/api/local/projects/${p.id}/conversation`)).json();
  assert.equal(saved.draft, 'Preserve this question'); assert.equal(saved.messages.at(-1).content, 'Partial answer');
  assert.equal(saved.messages.at(-1).status, 'CANCELLED');
});

for (const mode of ['error', 'truncated']) test(`${mode} upstream result remains a visible saved failure`, async t => {
  const f = await fixture(t), p = await f.project(true); f.mode = mode;
  const result = await f.events(await f.api('/api/local/chat', message(p, 'request_failure_' + mode)));
  assert.equal(result.at(-1).type, 'error');
  const saved = await (await fetch(f.url + `/api/local/projects/${p.id}/conversation`)).json();
  assert.equal(saved.messages.at(-1).status, 'ERROR'); assert.ok(saved.draft);
});

test('setup buttons invoke the exact pull/create operations and Start invokes only its explicit host action', async t => {
  const f = await fixture(t);
  assert.equal(f.startCalls, 0);
  assert.equal((await f.api('/api/local/ollama/start', {})).status, 200); assert.equal(f.startCalls, 1);
  const pulled = await f.events(await f.api('/api/local/models/pull', {model: DEFAULT_BASE_MODEL, request_id: 'request_pull_model'}));
  assert.equal(pulled.at(-1).outcome, 'COMPLETED');
  const created = await f.events(await f.api('/api/local/models/create', {request_id: 'request_create_model'}));
  assert.equal(created.at(-1).outcome, 'COMPLETED');
  const body = f.calls.find(c => c.path === '/api/create').body;
  assert.equal(body.from, DEFAULT_BASE_MODEL); assert.equal(body.model, MPC_MODEL); assert.equal(body.parameters.num_ctx, 8192);
  assert.equal(f.calls.some(c => c.path === '/api/chat'), false);
  assert.equal((await f.api('/api/local/models/pull', {model: 'unselected:large', request_id: 'request_other_model'})).status, 400);
  assert.equal((await f.api('/api/local/models/create', {request_id: 'request_create_model'})).status, 409);
});

test('project instructions and model choice are editable and project-qualified', async t => {
  const f = await fixture(t), first = await f.project(true), second = await f.project();
  assert.equal((await f.api(`/api/local/projects/${first.id}`, {instructions: 'Use concise examples.', selected_model: DEFAULT_BASE_MODEL}, 'PATCH')).status, 200);
  await f.events(await f.api('/api/local/chat', {...message(first, 'request_custom'), model: DEFAULT_BASE_MODEL}));
  await f.events(await f.api('/api/local/chat', message(second, 'request_separate')));
  const calls = f.calls.filter(c => c.path === '/api/chat');
  assert.equal(calls[0].body.messages[0].content, 'Use concise examples.');
  assert.equal(calls[1].body.messages.length, 2); assert.notEqual(calls[1].body.messages[0].content, 'Use concise examples.');
});

test('host passes exact advertised thinking controls and a rejected setting makes no inference call', async t => {
  const f = await fixture(t), p = await f.project(); f.thinkingValues = ['low', 'high'];
  const shown = await (await f.api('/api/local/models/show', {model: MPC_MODEL})).json();
  assert.equal(shown.thinking.supported, true); assert.deepEqual(shown.thinking.values, ['low', 'high']);
  const events = await f.events(await f.api('/api/local/chat', {...message(p, 'request_high_thinking'), thinking: 'high'}));
  assert.equal(events.at(-1).outcome, 'COMPLETED'); assert.equal(f.calls.find(c => c.path === '/api/chat').body.think, 'high');
  const rejected = await f.events(await f.api('/api/local/chat', {...message(p, 'request_unsupported_think'), thinking: 'invented'}));
  assert.equal(rejected.at(-1).code, 'THINK_SETTING_UNSUPPORTED'); assert.equal(f.calls.filter(c => c.path === '/api/chat').length, 1);
});

test('origin, host, session token, request structure, and fixed routes are enforced', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(f.url + '/api/local/projects', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'})).status, 403);
  assert.equal((await f.api('/api/local/projects', {name: 'bad'}, 'POST', {headers: {'Content-Type': 'application/json', 'X-MPC-Token': f.token, Origin: 'https://unrelated.example'}})).status, 403);
  const wrongHost = await new Promise((done, reject) => {
    const request = httpRequest(f.url + '/api/local/session', {headers: {Host: 'unrelated.example'}}, response => {response.resume(); done(response.statusCode);}); request.on('error', reject); request.end();
  });
  assert.equal(wrongHost, 403);
  assert.equal((await f.api('/api/local/projects', '{"name":"first","name":"second"}')).status, 400);
  assert.equal((await f.api('/api/local/projects', {name: 'ok', command: 'anything'})).status, 400);
  assert.equal((await fetch(f.url + '/lib/local-chat-store.mjs')).status, 404);
  assert.equal((await fetch(f.url + '/api/local/status?endpoint=https://unrelated.example')).status, 404);
});

test('context selection keeps complete exchanges, excludes interrupted ones, and discloses omitted history', () => {
  const history = [];
  for (let i = 0; i < 30; i++) history.push({role: 'user', status: 'COMPLETE', request_id: 'pair_' + i, content: 'question ' + i}, {role: 'assistant', status: 'COMPLETE', request_id: 'pair_' + i, content: 'answer ' + i});
  history.push({role: 'user', status: 'COMPLETE', request_id: 'broken', content: 'partial question'}, {role: 'assistant', status: 'CANCELLED', request_id: 'broken', content: 'partial answer'});
  const result = prepareConversationContext({messages: history}, {content: 'new question'}, 'system');
  assert.equal(result.context.complete_exchanges_available, 30); assert.equal(result.context.complete_exchanges_included, 19);
  assert.equal(result.context.complete_exchanges_omitted, 11); assert.equal(result.context.incomplete_exchanges_excluded, 1);
  assert.equal(result.messages[0].content, 'question 11'); assert.equal(result.messages.at(-1).content, 'new question');
  assert.equal(result.messages.some(m => m.content.includes('partial')), false);
});
