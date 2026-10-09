import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOllamaClient, OllamaClientError, OLLAMA_ORIGIN, OLLAMA_LIMITS,
  DEFAULT_BASE_MODEL, MPC_MODEL, MPC_SYSTEM_PROMPT,
} from '../lib/ollama-local-chat.mjs';

const encoder = new TextEncoder();
const instructions = {capabilities: ['completion'], details: {family: 'qwen3', format: 'gguf'}};
const question = {model: MPC_MODEL, messages: [{role: 'user', content: 'Hello, can we talk?'}]};
const delta = (content, extra = {}) => ({model: MPC_MODEL, message: {role: 'assistant', content}, done: false, ...extra});
const done = (extra = {}) => ({model: MPC_MODEL, message: {role: 'assistant', content: ''}, done: true, done_reason: 'stop', ...extra});
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json'}});
const ndjson = (frames, finalNewline = true) => new Response(frames.map(frame => typeof frame === 'string' ? frame : JSON.stringify(frame)).join('\n') + (finalNewline ? '\n' : ''), {headers: {'content-type': 'application/x-ndjson'}});
async function collect(generator) { const events = []; for await (const event of generator) events.push(event); return events; }
function code(expected) { return error => error instanceof OllamaClientError && error.code === expected; }

function mock(routes) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({url, options, body: options.body ? JSON.parse(options.body) : undefined});
    assert.equal(new URL(url).origin, OLLAMA_ORIGIN);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, undefined);
    const path = new URL(url).pathname;
    const route = routes[path];
    assert.ok(route, `Unexpected request ${path}`);
    return typeof route === 'function' ? await route(calls.at(-1), calls) : route;
  };
  return {client: createOllamaClient({fetchImpl}), calls};
}

function chatMock(chat, show = instructions) {
  return mock({'/api/show': () => json(show), '/api/chat': chat});
}

test('status observes the loopback service version without calling inference', async () => {
  const {client, calls} = mock({'/api/version': () => json({version: '0.99.0-test'})});
  assert.deepEqual(await client.status(), {endpoint: OLLAMA_ORIGIN, available: true, version: '0.99.0-test'});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
});

test('installed list excludes named clouds and remote aliases while preserving actual local metadata', async () => {
  const descriptor = name => ({name, model: name, digest: 'sha256:fixture', size: 2500000000, details: {format: 'gguf'}});
  const {client} = mock({'/api/tags': () => json({models: [
    descriptor('qwen3:4b-instruct'), descriptor('remote:cloud'), descriptor('model:70b-cloud'),
    {...descriptor('friendly'), remote_host: 'https://ollama.com'},
    {...descriptor('nested'), details: {remote_model: 'big'}},
  ]})});
  const result = await client.listModels();
  assert.deepEqual(result.models.map(item => item.name), ['qwen3:4b-instruct']);
  assert.equal(result.models[0].size, 2500000000);
  assert.equal(result.models[0].digest, 'sha256:fixture');
  assert.equal(result.excluded_models.length, 4);
});

test('show exposes advertised controls without substituting a model-family guess', async () => {
  const {client} = mock({'/api/show': () => json({capabilities: ['completion', 'thinking'], thinking: {values: ['low', 'medium', 'high'], default: 'medium'}, model_info: {'example.context_length': 8192}})});
  const result = await client.showModel('local-reasoner');
  assert.deepEqual(result.thinking, {supported: true, values: ['low', 'medium', 'high'], default: 'medium', metadata_observed: true});
  assert.equal(result.model_info['example.context_length'], 8192);
  assert.equal(result.inference_verified, false);
});

test('instruct model with no thinking metadata remains unadvertised rather than fabricated thinking', async () => {
  const {client} = mock({'/api/show': () => json(instructions)});
  const result = await client.showModel(DEFAULT_BASE_MODEL);
  assert.deepEqual(result.thinking, {supported: null, values: [], default: null, metadata_observed: false});
});

test('ordinary conversation accepts no project or evidence and preserves history plus custom system instructions', async () => {
  const {client, calls} = chatMock(() => ndjson([delta('Yes, '), delta('let’s talk.'), done({model: `${MPC_MODEL}:latest`, eval_count: 7, prompt_eval_count: 20})]));
  const messages = [
    {role: 'user', content: 'My project is a local workspace.'},
    {role: 'assistant', content: 'What would you like to work on?'},
    {role: 'user', content: 'Can we discuss the interface before attaching files?'},
  ];
  const events = await collect(client.streamChat({model: MPC_MODEL, messages, system: 'Be direct and useful.'}));
  assert.deepEqual(calls[1].body.messages, [{role: 'system', content: 'Be direct and useful.'}, ...messages]);
  assert.equal(calls[1].body.stream, true);
  assert.equal(Object.hasOwn(calls[1].body, 'think'), false);
  assert.equal(events.filter(event => event.type === 'delta').map(event => event.text).join(''), 'Yes, let’s talk.');
  assert.equal(events.at(-1).outcome, 'COMPLETED');
  assert.equal(events.at(-1).observed_model, `${MPC_MODEL}:latest`);
  assert.equal(events.at(-1).identity_normalization, 'OLLAMA_DEFAULT_LATEST');
  assert.equal(events.at(-1).usage.eval_count, 7);
  assert.equal(calls.length, 2, 'One metadata lookup and one actual inference, without an inference preflight.');
});

test('follow-up chat reuses bounded metadata cache and explicit show refreshes it', async () => {
  const {client, calls} = chatMock(() => ndjson([delta('Hello.'), done()]));
  await collect(client.streamChat(question));
  await collect(client.streamChat({...question, messages: [...question.messages, {role: 'assistant', content: 'Hello.'}, {role: 'user', content: 'Continue.'}]}));
  assert.equal(calls.filter(call => call.url.endsWith('/api/show')).length, 1);
  const shown = await client.showModel(MPC_MODEL);
  shown.thinking.values.push(true); // The host cannot mutate the internal cache.
  await assert.rejects(collect(client.streamChat({...question, think: true})), code('THINK_SETTING_UNSUPPORTED'));
  assert.equal(calls.filter(call => call.url.endsWith('/api/show')).length, 2);
  assert.equal(calls.filter(call => call.url.endsWith('/api/chat')).length, 2);
});

test('explicit thinking setting is sent only when advertised', async () => {
  const {client, calls} = chatMock(() => ndjson([delta('The result is 42.'), done()]), {capabilities: ['completion', 'thinking'], thinking: {values: [false, true], default: false}});
  await collect(client.streamChat({...question, think: true}));
  assert.equal(calls[1].body.think, true);
});

test('an unsupported thinking level fails visibly before inference', async () => {
  const {client, calls} = chatMock(() => assert.fail('No inference expected'), {capabilities: ['completion', 'thinking'], thinking: {values: ['low', 'high'], default: 'low'}});
  await assert.rejects(collect(client.streamChat({...question, think: 'medium'})), code('THINK_SETTING_UNSUPPORTED'));
  assert.equal(calls.length, 1);
});

test('null think uses the selected model default without adding a guessed control', async () => {
  const {client, calls} = chatMock(() => ndjson([delta('Hello.'), done()]));
  await collect(client.streamChat({...question, think: null}));
  assert.equal(Object.hasOwn(calls[1].body, 'think'), false);
});

test('thinking events contain counts, never raw reasoning text', async () => {
  const privateThinking = 'PRIVATE REASONING 🧠';
  const {client} = chatMock(() => ndjson([
    delta('', {message: {role: 'assistant', thinking: privateThinking, content: ''}}),
    delta('', {message: {role: 'assistant', thinking: ' step 2', content: ''}}),
    delta('Here is the answer.'), done(),
  ]));
  const events = await collect(client.streamChat(question));
  assert.deepEqual(events.filter(event => event.type === 'thinking'), [
    {type: 'thinking', characters: [...privateThinking].length},
    {type: 'thinking', characters: [...privateThinking].length + 7},
  ]);
  assert.equal(JSON.stringify(events).includes('PRIVATE REASONING'), false);
  assert.equal(events.at(-1).thinking_text_retained, false);
});

test('length-limited answer is incomplete even though a terminal frame arrived', async () => {
  const {client} = chatMock(() => ndjson([delta('The first part is'), done({done_reason: 'length', eval_count: 50})]));
  const events = await collect(client.streamChat(question));
  assert.equal(events.at(-1).outcome, 'INCOMPLETE');
  assert.equal(events.at(-1).incomplete_reason, 'LENGTH_LIMIT');
});

test('a stop with no answer does not become a completed answer', async () => {
  const {client} = chatMock(() => ndjson([done()]));
  const events = await collect(client.streamChat(question));
  assert.equal(events.at(-1).outcome, 'INCOMPLETE');
  assert.equal(events.at(-1).incomplete_reason, 'NO_ANSWER_TEXT');
});

test('a different observed model is rejected before its text is emitted', async () => {
  const {client} = chatMock(() => ndjson([delta('Wrong model content', {model: 'unselected-model'}), done()]));
  const events = [];
  await assert.rejects(async () => { for await (const event of client.streamChat(question)) events.push(event); }, code('OLLAMA_MODEL_MISMATCH'));
  assert.deepEqual(events, []);
});

test('an explicit different tag is not treated as a latest alias', async () => {
  const {client} = chatMock(() => ndjson([delta('Wrong', {model: 'qwen3:latest'})]));
  await assert.rejects(collect(client.streamChat({...question, model: 'qwen3:4b-instruct'})), code('OLLAMA_MODEL_MISMATCH'));
});

test('cloud model names are rejected before making any request', async () => {
  const {client, calls} = mock({});
  await assert.rejects(collect(client.streamChat({...question, model: 'gpt-oss:cloud'})), code('CLOUD_MODEL_NOT_LOCAL'));
  await assert.rejects(collect(client.pullModel({model: 'gpt-oss:120b-cloud'})), code('CLOUD_MODEL_NOT_LOCAL'));
  assert.equal(calls.length, 0);
});

test('remote metadata on an innocently named alias prevents local inference', async () => {
  const {client, calls} = chatMock(() => assert.fail('Remote alias cannot infer'), {...instructions, remote_model: 'model:cloud', remote_host: 'https://ollama.com'});
  await assert.rejects(collect(client.streamChat(question)), code('CLOUD_MODEL_NOT_LOCAL'));
  assert.equal(calls.length, 1);
});

test('split multibyte UTF-8, split frames, CRLF, and terminal EOF without a newline decode correctly', async () => {
  const bytes = encoder.encode([delta('你好 🧠 café'), done()].map(JSON.stringify).join('\r\n'));
  let position = 0;
  const response = new Response(new ReadableStream({pull(controller) {
    if (position === bytes.length) controller.close();
    else controller.enqueue(bytes.subarray(position, ++position));
  }}));
  const {client} = chatMock(() => response);
  const events = await collect(client.streamChat(question));
  assert.equal(events[0].text, '你好 🧠 café');
  assert.equal(events.at(-1).outcome, 'COMPLETED');
});

test('valid partial response without a terminal frame fails as truncated', async () => {
  const {client} = chatMock(() => ndjson([delta('Partial answer')]));
  const events = [];
  await assert.rejects(async () => { for await (const event of client.streamChat(question)) events.push(event); }, code('OLLAMA_STREAM_TRUNCATED'));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'delta');
});

test('malformed unfinished JSON at EOF is reported without leaking response text', async () => {
  const {client} = chatMock(() => new Response('{"message":{"thinking":"do not leak this'));
  await assert.rejects(collect(client.streamChat(question)), error => {
    assert.equal(error.code, 'OLLAMA_STREAM_TRUNCATED');
    assert.equal(JSON.stringify(error).includes('do not leak'), false);
    assert.equal(error.message.includes('do not leak'), false);
    return true;
  });
});

test('duplicate decoded object keys are rejected in streaming frames', async () => {
  const frame = `{"model":"${MPC_MODEL}","done":true,"do\\u006ee":false,"message":{"content":"wrong"}}`;
  const {client} = chatMock(() => ndjson([frame]));
  await assert.rejects(collect(client.streamChat(question)), error => {
    assert.equal(error.code, 'OLLAMA_INVALID_RESPONSE');
    assert.equal(error.details.reason, 'DUPLICATE_JSON_KEY');
    return true;
  });
});

test('invalid UTF-8 is rejected rather than silently replaced', async () => {
  const {client} = chatMock(() => new Response(new Uint8Array([0xff, 0x0a])));
  await assert.rejects(collect(client.streamChat(question)), code('OLLAMA_INVALID_RESPONSE'));
});

test('frame byte limit rejects oversized data before buffering an unbounded frame', async () => {
  const {client} = chatMock(() => new Response(new Uint8Array(OLLAMA_LIMITS.maxFrameBytes + 1).fill(0x20)));
  await assert.rejects(collect(client.streamChat(question)), code('OLLAMA_FRAME_LIMIT'));
});

test('total streaming bytes are bounded even when each individual frame is small', async () => {
  const line = `${JSON.stringify(delta('x'.repeat(120_000)))}\n`;
  const chunk = encoder.encode(line);
  let bytes = 0;
  let cancelled = false;
  const response = new Response(new ReadableStream({pull(controller) {
    if (bytes > OLLAMA_LIMITS.maxStreamBytes + chunk.length) return controller.close();
    bytes += chunk.length;
    controller.enqueue(chunk);
  }, cancel() { cancelled = true; }}));
  const {client} = chatMock(() => response);
  let deltaCount = 0;
  await assert.rejects(async () => { for await (const event of client.streamChat(question)) if (event.type === 'delta') deltaCount++; }, code('OLLAMA_RESPONSE_LIMIT'));
  assert.ok(deltaCount > 1);
  assert.ok(cancelled);
});

test('metadata and HTTP-error bodies use bounded byte reads instead of response.text()', async () => {
  const {client} = mock({'/api/version': () => new Response(new Uint8Array(OLLAMA_LIMITS.maxJsonBytes + 1).fill(0x20))});
  await assert.rejects(client.status(), code('OLLAMA_RESPONSE_LIMIT'));
});

test('declared oversize body is rejected and cancelled before reading', async () => {
  let read = 0, cancelled = false;
  const {client} = mock({'/api/version': () => ({
    status: 200, ok: true,
    headers: new Headers({'content-length': String(OLLAMA_LIMITS.maxJsonBytes + 1)}),
    body: {cancel: async () => { cancelled = true; }, getReader() { read++; throw Error('Should not read'); }},
  })});
  await assert.rejects(client.status(), code('OLLAMA_RESPONSE_LIMIT'));
  assert.equal(read, 0);
  assert.equal(cancelled, true);
});

test('HTTP errors preserve the provider message and status', async () => {
  const {client} = mock({'/api/show': () => json({error: 'model mpc-daybreak-local not found'}, 404)});
  await assert.rejects(collect(client.streamChat(question)), error => {
    assert.equal(error.code, 'OLLAMA_HTTP_ERROR');
    assert.equal(error.details.status, 404);
    assert.match(error.message, /model mpc-daybreak-local not found/u);
    return true;
  });
});

test('mid-stream provider failure preserves partial output but never emits done', async () => {
  const {client} = chatMock(() => ndjson([delta('Part'), {error: 'runner out of memory'}]));
  const events = [];
  await assert.rejects(async () => { for await (const event of client.streamChat(question)) events.push(event); }, error => {
    assert.equal(error.code, 'OLLAMA_PROVIDER_ERROR');
    assert.equal(error.message, 'runner out of memory');
    return true;
  });
  assert.deepEqual(events, [{type: 'delta', text: 'Part'}]);
});

test('a frame following terminal completion is a visible protocol error', async () => {
  const {client} = chatMock(() => ndjson([delta('Done.'), done(), delta('Unexpected extra data')]));
  await assert.rejects(collect(client.streamChat(question)), code('OLLAMA_STREAM_AFTER_DONE'));
});

test('cancellation before the request makes no network call', async () => {
  const abort = new AbortController(); abort.abort();
  const {client, calls} = mock({});
  await assert.rejects(collect(client.streamChat({...question, signal: abort.signal})), code('OLLAMA_ABORTED'));
  assert.equal(calls.length, 0);
});

test('cancellation after partial output cancels the underlying reader and emits no completed answer', async () => {
  const abort = new AbortController();
  let sent = false, cancelled = false;
  const response = new Response(new ReadableStream({pull(controller) {
    if (!sent) { sent = true; controller.enqueue(encoder.encode(`${JSON.stringify(delta('Partial'))}\n`)); }
  }, cancel() { cancelled = true; }}));
  const {client, calls} = chatMock(() => response);
  const generator = client.streamChat({...question, signal: abort.signal});
  assert.deepEqual((await generator.next()).value, {type: 'delta', text: 'Partial'});
  const waiting = generator.next();
  abort.abort();
  await assert.rejects(waiting, code('OLLAMA_ABORTED'));
  assert.equal(cancelled, true);
  assert.equal(calls[1].options.signal.aborted, true);
});

test('timeout aborts an indefinitely stalled response even with an injected reader', async () => {
  let cancelled = false;
  const {client} = chatMock(() => new Response(new ReadableStream({pull() {}, cancel() { cancelled = true; }})));
  await assert.rejects(collect(client.streamChat({...question, timeoutMs: 15})), code('OLLAMA_TIMEOUT'));
  assert.equal(cancelled, true);
});

test('consumer stopping the generator aborts the in-flight inference', async () => {
  let cancelled = false;
  const {client, calls} = chatMock(() => new Response(new ReadableStream({start(controller) { controller.enqueue(encoder.encode(`${JSON.stringify(delta('Part'))}\n`)); }, cancel() { cancelled = true; }})));
  for await (const event of client.streamChat(question)) { assert.equal(event.type, 'delta'); break; }
  assert.equal(cancelled, true);
  assert.equal(calls[1].options.signal.aborted, true);
});

test('network failure is typed and points to starting local Ollama', async () => {
  const client = createOllamaClient({fetchImpl: async () => { throw TypeError('ECONNREFUSED'); }});
  await assert.rejects(client.status(), error => {
    assert.equal(error.code, 'OLLAMA_CONNECTION_FAILED');
    assert.match(error.message, /Start Ollama/u);
    return true;
  });
});

test('a redirect returned by an injected transport is also rejected', async () => {
  const {client} = mock({'/api/version': () => new Response('', {status: 302, headers: {location: 'https://elsewhere.example'}})});
  await assert.rejects(client.status(), code('OLLAMA_REDIRECT_REJECTED'));
});

test('broken byte stream becomes a visible typed error', async () => {
  const {client} = chatMock(() => new Response(new ReadableStream({start(controller) { controller.error(TypeError('socket vanished')); }})));
  await assert.rejects(collect(client.streamChat(question)), code('OLLAMA_STREAM_ERROR'));
});

test('pull is an explicit setup operation with progress, final metadata, and no inference', async () => {
  const {client, calls} = mock({
    '/api/pull': () => ndjson([{status: 'pulling manifest'}, {status: 'pulling layer', digest: 'sha256:test', total: 100, completed: 60}, {status: 'success'}]),
    '/api/show': () => json(instructions),
  });
  const events = await collect(client.pullModel({model: DEFAULT_BASE_MODEL}));
  assert.deepEqual(calls[0].body, {model: DEFAULT_BASE_MODEL, stream: true});
  assert.equal(events[1].completed, 60);
  assert.equal(events.at(-1).requested_model, DEFAULT_BASE_MODEL);
  assert.equal(events.at(-1).inference_verified, false);
  assert.equal(events.at(-1).outcome, 'COMPLETED');
  assert.equal(calls.some(call => call.url.endsWith('/api/chat')), false);
});

test('create preserves the existing named configuration, base, system, and parameters', async () => {
  const {client, calls} = mock({
    '/api/show': () => json(instructions),
    '/api/create': () => ndjson([{status: 'using existing layers'}, {status: 'success'}]),
  });
  const events = await collect(client.createMpcModel());
  assert.deepEqual(calls[1].body, {model: MPC_MODEL, from: DEFAULT_BASE_MODEL, system: MPC_SYSTEM_PROMPT, parameters: {temperature: 0, num_ctx: 8192}, stream: true});
  assert.equal(events.at(-1).configuration_only, true);
  assert.equal(events.at(-1).inference_verified, false);
  assert.equal(calls[0].body.model, DEFAULT_BASE_MODEL);
  assert.equal(calls[2].body.model, MPC_MODEL);
});

test('setup without a success terminal frame cannot claim installation completed', async () => {
  const {client, calls} = mock({'/api/pull': () => ndjson([{status: 'pulling manifest'}])});
  await assert.rejects(collect(client.pullModel({model: DEFAULT_BASE_MODEL})), code('OLLAMA_STREAM_TRUNCATED'));
  assert.equal(calls.length, 1);
});

test('a pulled cloud alias is excluded by post-setup model metadata', async () => {
  const {client} = mock({'/api/pull': () => ndjson([{status: 'success'}]), '/api/show': () => json({...instructions, remote_host: 'https://ollama.com'})});
  await assert.rejects(collect(client.pullModel({model: 'looks-local'})), code('CLOUD_MODEL_NOT_LOCAL'));
});

test('history size and invalid controls fail before metadata or inference', async () => {
  const {client, calls} = mock({});
  await assert.rejects(collect(client.streamChat({...question, messages: [{role: 'user', content: 'x'.repeat(OLLAMA_LIMITS.maxRequestBytes + 1)}]})), code('OLLAMA_REQUEST_LIMIT'));
  await assert.rejects(collect(client.streamChat({...question, think: 10})), code('INVALID_THINK_SETTING'));
  await assert.rejects(collect(client.streamChat({...question, messages: [{role: 'user', content: 'x', tool_calls: []}]})), code('INVALID_CHAT_MESSAGES'));
  assert.equal(calls.length, 0);
});
