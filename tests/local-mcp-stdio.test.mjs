import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough, Writable} from 'node:stream';
import {setImmediate as tick} from 'node:timers/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {serveMcpStdio, protocolContract} from '../lib/local-mcp-stdio.mjs';
import {parseAssistantArguments} from '../scripts/start-mpc-security-assistant.mjs';

const MODERN = '2026-07-28';
const metadata = (version = MODERN) => ({
  'io.modelcontextprotocol/protocolVersion': version,
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': {name: 'fixture-client', version: '1'},
});
const request = (id, method, params = {}) => ({jsonrpc: '2.0', id, method, params: {...params, _meta: metadata()}});
const toolCall = (id, value = 'example') => request(id, 'tools/call', {name: 'echo', arguments: {value}});
const line = value => JSON.stringify(value) + '\n';
const initialize = (id = 'init', version = '2025-11-25') => ({jsonrpc: '2.0', id, method: 'initialize',
  params: {protocolVersion: version, capabilities: {}, clientInfo: {name: 'fixture-client', version: '1'}}});
const initialized = {jsonrpc: '2.0', method: 'notifications/initialized'};
const cancel = requestId => ({jsonrpc: '2.0', method: 'notifications/cancelled', params: {requestId}});

function stub(implementation = async (_name, args) => ({echo: args.value})) {
  const calls = [];
  const engine = {
    toolList: [{name: 'echo', description: 'A bounded supplied fixture.',
      inputSchema: {type: 'object', properties: {value: {type: 'string', maxLength: 100}}, required: ['value'], additionalProperties: false},
      annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false}}],
    instructions: 'Use only supplied fixture values. Metadata is not source authentication.',
    serverInfo: {name: 'fixture-engine', version: '1.0.0'},
    async callTool(name, args) { calls.push({name, args}); return implementation(name, args); },
  };
  return {engine, calls};
}

function harness({engine = stub().engine, limits = {}, output: suppliedOutput} = {}) {
  const input = new PassThrough(), chunks = [], diagnostics = [];
  const output = suppliedOutput ?? new Writable({write(chunk, _encoding, callback) { chunks.push(chunk.toString('utf8')); callback(); }});
  const stderr = new Writable({write(chunk, _encoding, callback) { diagnostics.push(chunk.toString('utf8')); callback(); }});
  const done = serveMcpStdio({engine, input, output, diagnostics: stderr, limits});
  return {input, output, done, diagnostics, chunks,
    send: value => input.write(line(value)),
    messages: () => chunks.join('').split('\n').filter(Boolean).map(value => JSON.parse(value)),
    async end(value = '') { input.end(value); return done; },
  };
}

test('modern discovery and inline execution return current protocol results without requiring a handshake', async () => {
  const {engine, calls} = stub(), h = harness({engine});
  h.send(request(1, 'server/discover')); h.send(request(2, 'tools/list')); h.send(toolCall(3, 'supplied'));
  const closed = await h.end(), messages = h.messages(), discovery = messages.find(row => row.id === 1).result;
  assert.equal(discovery.resultType, 'complete');
  assert.deepEqual(discovery.supportedVersions, [MODERN, '2025-11-25', '2025-06-18']);
  assert.deepEqual(discovery.capabilities, {tools: {listChanged: false}});
  assert.deepEqual(discovery._meta['io.modelcontextprotocol/serverInfo'], engine.serverInfo);
  assert.equal(discovery.ttlMs, 0); assert.equal(discovery.cacheScope, 'private');
  assert.deepEqual(messages.find(row => row.id === 2).result.tools, engine.toolList);
  const result = messages.find(row => row.id === 3).result;
  assert.equal(result.resultType, 'complete'); assert.equal(result.isError, false);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.deepEqual(result.structuredContent, {echo: 'supplied'});
  assert.equal(calls.length, 1); assert.equal(closed.tool_calls, 1); assert.deepEqual(h.diagnostics, []);
});

test('a modern tool call can be first; every subsequent request still needs its own metadata', async () => {
  const {engine, calls} = stub(), h = harness({engine});
  h.send(toolCall(1));
  h.send({jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'echo', arguments: {value: 'missing metadata'}}});
  h.send({...toolCall(3), params: {...toolCall(3).params, _meta: {'io.modelcontextprotocol/protocolVersion': MODERN}}});
  await h.end();
  assert.equal(calls.length, 1);
  for (const id of [2, 3]) assert.equal(h.messages().find(row => row.id === id).error.code, -32602);
});

test('legacy initialization negotiates a supported legacy version, gates tools, and preserves annotations', async () => {
  const {engine, calls} = stub(), h = harness({engine});
  h.send(initialize(1, '2025-06-18'));
  h.send({jsonrpc: '2.0', id: 2, method: 'tools/list'});
  h.send(initialized);
  h.send({jsonrpc: '2.0', id: 3, method: 'tools/list'});
  h.send({jsonrpc: '2.0', id: 4, method: 'tools/call', params: {name: 'echo', arguments: {value: 'legacy'}}});
  await h.end(); const messages = h.messages();
  assert.equal(messages.find(row => row.id === 1).result.protocolVersion, '2025-06-18');
  assert.equal(messages.find(row => row.id === 2).error.code, -32602);
  assert.deepEqual(messages.find(row => row.id === 3).result.tools[0].annotations, engine.toolList[0].annotations);
  assert.equal(Object.hasOwn(messages.find(row => row.id === 4).result, 'resultType'), false);
  assert.equal(calls.length, 1);
});

test('legacy unknown versions negotiate the newest legacy version and cannot switch eras silently', async () => {
  const {engine, calls} = stub(), h = harness({engine});
  h.send(initialize(1, '1900-01-01')); h.send(initialized); h.send(toolCall(2)); h.send(initialize(3));
  await h.end();
  assert.equal(h.messages().find(row => row.id === 1).result.protocolVersion, '2025-11-25');
  assert.equal(h.messages().find(row => row.id === 2).error.code, -32602);
  assert.equal(h.messages().find(row => row.id === 3).error.code, -32600);
  assert.equal(calls.length, 0);
});

test('unsupported modern version reports the specified version error and supports a corrected retry', async () => {
  const {engine, calls} = stub(), h = harness({engine});
  h.input.write(line({jsonrpc: '2.0', id: 2, method: 'server/discover', params: {_meta: metadata('1900-01-01')}}));
  h.send(toolCall(3)); await h.end();
  const rejected = h.messages().find(row => row.id === 2);
  assert.equal(rejected.error.code, -32022);
  assert.equal(rejected.error.data.requested, '1900-01-01');
  assert.deepEqual(rejected.error.data.supported, protocolContract.supported_protocol_versions);
  assert.equal(calls.length, 1);
});

test('malformed protocol requests, unknown methods/tools, and notifications never dispatch a tool', async () => {
  const {engine, calls} = stub(), h = harness({engine});
  const invalid = [
    [], null, {jsonrpc: '1.0', id: 1, method: 'tools/call'},
    {jsonrpc: '2.0', id: null, method: 'tools/call'},
    {jsonrpc: '2.0', id: 2, method: 'tools/list', params: null},
    {jsonrpc: '2.0', id: 3, method: 'tools/list', params: []},
    {...toolCall(4), command: 'ignored'},
    request(5, 'tools/call', {name: 'echo', arguments: []}),
    request(6, 'tools/call', {name: 'echo', arguments: {value: 'valid'}, command: 'ignored'}),
    request(7, 'tools/call', {name: '__proto__', arguments: {}}),
    request(8, 'arbitrary/command'), request(9, 'tools/list', {cursor: 'not-issued'}),
    {jsonrpc: '2.0', method: 'tools/call', params: {name: 'echo', arguments: {value: 'notification'}}},
    {jsonrpc: '2.0', method: 'unknown/notification'},
  ];
  for (const value of invalid) h.send(value);
  await h.end(); assert.equal(calls.length, 0);
  assert.equal(h.messages().length, invalid.length - 2);
  assert.ok(h.messages().every(row => row.error));
  assert.equal(h.messages().find(row => row.id === 7).error.code, -32602);
  assert.equal(h.messages().find(row => row.id === 8).error.code, -32601);
});

test('tool argument validation is an actionable tool error without engine execution', async () => {
  const {engine, calls} = stub(), h = harness({engine});
  h.send(request(1, 'tools/call', {name: 'echo', arguments: {unexpected: 'value'}}));
  h.send(request(2, 'tools/call', {name: 'echo', arguments: {value: 12}}));
  await h.end(); assert.equal(calls.length, 0);
  for (const row of h.messages()) { assert.equal(row.error, undefined); assert.equal(row.result.isError, true); }
});

test('an engine rejection remains a tool error, without a stack or a false successful result', async () => {
  const {engine, calls} = stub(async () => { throw Error('SOURCE_CHANGED_RESTART_REQUIRED'); }), h = harness({engine});
  h.send(toolCall(1)); await h.end(); const response = h.messages()[0];
  assert.equal(response.error, undefined); assert.equal(response.result.isError, true);
  assert.equal(response.result.content[0].text, 'SOURCE_CHANGED_RESTART_REQUIRED');
  assert.equal(response.result.structuredContent, undefined); assert.equal(calls.length, 1);
});

test('duplicate decoded JSON keys are rejected and the next valid frame still works', async () => {
  const {engine, calls} = stub(), h = harness({engine});
  const duplicate = line(toolCall(1)).replace('"value":"example"', '"value":"one","\\u0076alue":"two"');
  h.input.write(duplicate); h.send(toolCall(2, 'unique')); await h.end();
  assert.equal(h.messages()[0].error.code, -32700);
  assert.match(h.messages()[0].error.message, /DUPLICATE_JSON_KEY/);
  assert.deepEqual(calls, [{name: 'echo', args: {value: 'unique'}}]);
});

test('UTF-8 split across chunks and CRLF framing preserve exact tool data and one-line responses', async () => {
  const {engine, calls} = stub(), h = harness({engine});
  const value = 'café 🌐\nsecond line', bytes = Buffer.from(JSON.stringify(toolCall(1, value)) + '\r\n');
  for (let offset = 0; offset < bytes.length; offset += 3) h.input.write(bytes.subarray(offset, offset + 3));
  await h.end();
  assert.equal(calls[0].args.value, value); assert.equal(h.messages()[0].result.structuredContent.echo, value);
  assert.equal(h.chunks.join('').split('\n').filter(Boolean).length, 1);
});

test('oversized frames are discarded through their delimiter without dispatching embedded trailing JSON', async () => {
  const {engine, calls} = stub(), h = harness({engine, limits: {maxMessageBytes: 300}});
  h.input.write(' '.repeat(180)); h.input.write(' '.repeat(180)); h.input.write(line(toolCall(1)));
  h.send(request(2, 'ping')); await h.end();
  assert.equal(calls.length, 0);
  assert.equal(h.messages()[0].error.message, 'MESSAGE_TOO_LARGE');
  assert.equal(h.messages().find(row => row.id === 2).result.resultType, 'complete');
});

test('invalid UTF-8 and an unterminated frame at EOF never reach the engine', async () => {
  const {engine, calls} = stub(), h = harness({engine});
  h.input.write(Buffer.from([0xff, 10]));
  await h.end(JSON.stringify(toolCall(1)));
  assert.equal(calls.length, 0); assert.equal(h.messages().length, 2);
  assert.equal(h.messages()[0].error.code, -32700);
  assert.equal(h.messages()[1].error.message, 'TRUNCATED_MESSAGE_AT_EOF');
});

test('depth, token, and finite-number parsing budgets reject pathological JSON', async () => {
  const {engine, calls} = stub(), h = harness({engine, limits: {maxJsonDepth: 8, maxJsonTokens: 80}});
  h.input.write('['.repeat(9) + ']'.repeat(9) + '\n');
  h.input.write('[' + Array(100).fill('0').join(',') + ']\n');
  h.input.write('{"jsonrpc":"2.0","id":1,"method":"ping","params":{"large":1e999}}\n');
  await h.end(); assert.equal(calls.length, 0);
  assert.deepEqual(h.messages().map(row => row.error.message), ['JSON_DEPTH_LIMIT', 'JSON_TOKEN_LIMIT', 'NONFINITE_JSON_NUMBER']);
});

test('oversized tool output discloses completed execution and omitted payload within the response budget', async () => {
  const {engine, calls} = stub(async () => ({large: 'z'.repeat(2000)})), h = harness({engine, limits: {maxResponseBytes: 1024}});
  h.send(toolCall(1)); await h.end(); const result = h.messages()[0].result;
  assert.equal(calls.length, 1); assert.equal(result.isError, true);
  assert.equal(result.structuredContent.tool_completed, true); assert.equal(result.structuredContent.result_returned, false);
  assert.ok(Buffer.byteLength(h.chunks.join('')) <= 1025); assert.equal(h.chunks.join('').includes('z'.repeat(100)), false);
});

test('tool result serialization overhead is included in the output cap', async () => {
  const {engine} = stub(async () => ({large: 'z'.repeat(600)})), h = harness({engine, limits: {maxResponseBytes: 1024}});
  h.send(toolCall(1)); await h.end();
  assert.equal(h.messages()[0].result.structuredContent.status, 'TOOL_RESULT_EXCEEDS_TRANSPORT_LIMIT');
  assert.ok(Buffer.byteLength(h.chunks.join('')) <= 1025);
});

test('sparse output arrays and accessors cannot trigger unbounded or implicit output serialization', async () => {
  let getterCalls = 0;
  const getter = Object.defineProperty({}, 'value', {enumerable: true, get() { getterCalls++; return 'read'; }});
  const values = [new Array(1_000_000_000), getter];
  const {engine} = stub(async () => values.shift()), h = harness({engine});
  h.send(toolCall(1)); h.send(toolCall(2)); await h.end();
  assert.equal(getterCalls, 0);
  assert.ok(h.messages().every(row => row.result.isError === true));
  assert.match(h.messages()[0].result.content[0].text, /BOUNDED_DENSE_ARRAY/);
  assert.match(h.messages()[1].result.content[0].text, /DATA_PROPERTIES/);
});

test('queue budget rejects excess work; cancelling queued work skips it and ping stays responsive', async () => {
  let release;
  const {engine, calls} = stub(async (_name, args) => args.value === 'slow' ? new Promise(resolve => { release = resolve; }) : {echo: args.value});
  const h = harness({engine, limits: {maxPendingCalls: 2}});
  h.send(toolCall(1, 'slow')); await tick();
  h.send(toolCall(2, 'queued')); h.send(toolCall(3, 'excess')); h.send(request(4, 'ping')); h.send(cancel(2));
  await tick();
  assert.equal(h.messages().find(row => row.id === 3).error.message, 'LOCAL_TOOL_QUEUE_LIMIT');
  assert.equal(h.messages().find(row => row.id === 4).result.resultType, 'complete');
  release({echo: 'slow'}); await h.end();
  assert.deepEqual(calls.map(row => row.args.value), ['slow']);
  assert.equal(h.messages().some(row => row.id === 2), false);
});

test('cancellation suppresses a running call result and a cancellation before invocation prevents execution', async () => {
  let release;
  const {engine, calls} = stub(async () => new Promise(resolve => { release = resolve; }));
  const h = harness({engine}); h.send(toolCall(1)); await tick(); h.send({...cancel(1), params: {requestId: 1, reason: ''}});
  release({echo: 'cancelled'}); await h.end(); assert.equal(calls.length, 1); assert.equal(h.messages().length, 0);
  const second = stub(), early = harness({engine: second.engine});
  early.input.write(line(toolCall(2)) + line(cancel(2))); await early.end();
  assert.equal(second.calls.length, 0); assert.equal(early.messages().length, 0);
});

test('duplicate outstanding request IDs cannot invoke the tool twice or consume its original response', async () => {
  let release;
  const {engine, calls} = stub(async () => new Promise(resolve => { release = resolve; }));
  const h = harness({engine}); h.send(toolCall('same')); await tick(); h.send(toolCall('same'));
  await tick(); release({echo: 'once'}); await h.end();
  assert.equal(calls.length, 1);
  const error = h.messages().find(row => row.error);
  assert.equal(error.error.code, -32600); assert.equal(Object.hasOwn(error, 'id'), false);
  assert.equal(h.messages().filter(row => row.id === 'same' && row.result).length, 1);
});

test('the per-process tool call rate budget rejects excess requests without dispatch', async () => {
  const {engine, calls} = stub(), h = harness({engine, limits: {toolCallsPerMinute: 2}});
  h.send(toolCall(1)); h.send(toolCall(2)); h.send(toolCall(3)); await h.end();
  assert.equal(calls.length, 2);
  const rejection = h.messages().find(row => row.id === 3).error;
  assert.equal(rejection.message, 'LOCAL_TOOL_RATE_LIMIT'); assert.equal(rejection.data.automatic_retry, false);
});

test('output backpressure has a bounded queue and terminates instead of accumulating responses', async () => {
  let release;
  const output = new Writable({write(_chunk, _encoding, callback) { release = callback; }});
  const h = harness({output, limits: {maxOutgoingMessages: 2}});
  h.send(request(1, 'ping')); h.send(request(2, 'ping')); h.send(request(3, 'ping'));
  await assert.rejects(h.done, /OUTPUT_BACKPRESSURE_LIMIT/);
  release(); h.input.destroy(); output.destroy();
  assert.match(h.diagnostics.join(''), /OUTPUT_BACKPRESSURE_LIMIT/);
});

test('the CLI parses a literal workspace as data, rejects unknown/duplicate flags, and has no import-time execution', () => {
  const cwd = '/tmp/mpc-parent', name = "folder with spaces & $(not-a-command) 'quotes'";
  assert.deepEqual(parseAssistantArguments(['--workspace', name, '--check'], cwd), {workspaceRoot: resolve(cwd, name), check: true});
  for (const argv of [['--check', '--check'], ['--workspace'], ['--workspace', '--check'], ['--shell', 'echo'], ['--workspace', 'one', '--workspace', 'two']]) {
    assert.throws(() => parseAssistantArguments(argv, cwd));
  }
  const entry = fileURLToPath(new URL('../scripts/start-mpc-security-assistant.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [entry, '--unknown'], {encoding: 'utf8', timeout: 5000});
  assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /MPC_LOCAL_STDIO_ERROR/);
});

test('the real CLI startup check reports the implemented local engine and no completed connection handshake', () => {
  const entry = fileURLToPath(new URL('../scripts/start-mpc-security-assistant.mjs', import.meta.url));
  const workspace = fileURLToPath(new URL('..', import.meta.url));
  const run = spawnSync(process.execPath, [entry, '--workspace', workspace, '--check'], {encoding: 'utf8', timeout: 15000, maxBuffer: 2_000_000});
  assert.equal(run.status, 0, run.stderr); const check = JSON.parse(run.stdout);
  assert.equal(check.transport, 'stdio'); assert.equal(check.runtime.status, 'LOCAL_MCP_READY');
  assert.equal(check.runtime.implemented_evaluators, 24); assert.equal(check.runtime.native_tool_count, 20);
  assert.equal(check.connection_handshake_performed, false);
  assert.deepEqual(check.runtime.workflow, ['ACQUIRED', 'ANALYZED', 'DECIDED']);
});

test('real CLI round trips list tools, return the selected catalog schema, and execute finite Nash in both eras', () => {
  const entry = fileURLToPath(new URL('../scripts/start-mpc-security-assistant.mjs', import.meta.url));
  const workspace = fileURLToPath(new URL('..', import.meta.url));
  const args = {name: 'evaluate_method', arguments: {method: 'nash', input: {
    row_payoffs: [[1, -1], [-1, 1]], column_payoffs: [[-1, 1], [1, -1]],
  }}};
  const catalogArgs = {name: 'get_method_catalog', arguments: {method: 'nash'}};
  for (const modern of [true, false]) {
    const messages = modern ? [request(1, 'server/discover'), request(2, 'tools/list'), request(4, 'tools/call', catalogArgs), request(3, 'tools/call', args)] :
      [initialize(1), initialized, {jsonrpc: '2.0', id: 2, method: 'tools/list'},
        {jsonrpc: '2.0', id: 4, method: 'tools/call', params: catalogArgs}, {jsonrpc: '2.0', id: 3, method: 'tools/call', params: args}];
    const run = spawnSync(process.execPath, [entry, '--workspace', workspace], {encoding: 'utf8', input: messages.map(line).join(''), timeout: 15000, maxBuffer: 3_000_000});
    assert.equal(run.status, 0, run.stderr);
    const output = run.stdout.trim().split('\n').map(row => JSON.parse(row));
    assert.equal(output.length, 4);
    const tools = output.find(row => row.id === 2).result.tools;
    assert.ok(tools.some(tool => tool.name === 'assistant_acquire'));
    assert.ok(tools.some(tool => tool.name === 'evaluate_method'));
    const catalog = output.find(row => row.id === 4).result;
    assert.equal(catalog.isError, false, JSON.stringify(catalog));
    assert.equal(catalog.structuredContent.result.status, 'METHOD_IMPLEMENTATION_CATALOG');
    assert.equal(catalog.structuredContent.result.input_schemas.nash.properties.row_payoffs.type, 'array');
    assert.equal(Object.hasOwn(catalog.structuredContent.result, 'draft_overlay'), false);
    const result = output.find(row => row.id === 3).result;
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.equal(Object.hasOwn(result, 'resultType'), modern);
    const native = result.structuredContent.result;
    assert.equal(native.status, 'BOUNDED_MODEL_RESULT'); assert.equal(native.source_authentication, false);
    assert.deepEqual(native.result.pure_equilibria, []);
    assert.deepEqual(native.result.strict_interior_mixed, {row_probabilities: [0.5, 0.5], column_probabilities: [0.5, 0.5]});
  }
});
