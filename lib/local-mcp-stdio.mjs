// Local transport only. The supplied engine owns tool behavior and source guards.
// MCP 2026-07-28: basic/transports/stdio, basic/versioning, schema and server/tools.
// Legacy initialization: specification/2025-11-25/basic/lifecycle.
import {validate} from './schema.mjs';
import {parseBoundedJson} from './bounded-json.mjs';

const MODERN = '2026-07-28';
const LEGACY = Object.freeze(['2025-11-25', '2025-06-18']);
const VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';
const CAPABILITIES_KEY = 'io.modelcontextprotocol/clientCapabilities';
const CLIENT_KEY = 'io.modelcontextprotocol/clientInfo';
const SERVER_KEY = 'io.modelcontextprotocol/serverInfo';
export const protocolContract = Object.freeze({
  version: 'MPC_LOCAL_STDIO_V17_1', transport: 'stdio',
  supported_protocol_versions: Object.freeze([MODERN, ...LEGACY]),
  max_message_bytes: 2_000_000, max_response_bytes: 1_000_000,
  max_pending_calls: 8, max_queued_bytes: 8_000_000,
  max_outgoing_bytes: 2_000_000, max_outgoing_messages: 32,
  max_json_depth: 32, max_json_tokens: 100_000, tool_calls_per_minute: 60,
  concurrent_tool_calls: 1, automatic_retries: 0,
  cancellation: 'QUEUED_CALLS_SKIPPED;ACTIVE_BOUNDED_CALL_RESPONSE_SUPPRESSED',
  source_authentication: false,
});
const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit = 256) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const requestId = value => typeof value === 'string' ? value.length <= 256 : Number.isSafeInteger(value);
const fields = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));
const implementation = value => object(value) && text(value.name) && text(value.version);
const message = error => typeof error?.message === 'string' ? error.message.slice(0, 1000) : 'TOOL_EXECUTION_ERROR';

function checkedLimits(overrides) {
  const defaults = {
    maxMessageBytes: protocolContract.max_message_bytes,
    maxResponseBytes: protocolContract.max_response_bytes,
    maxPendingCalls: protocolContract.max_pending_calls,
    maxQueuedBytes: protocolContract.max_queued_bytes,
    maxOutgoingBytes: protocolContract.max_outgoing_bytes,
    maxOutgoingMessages: protocolContract.max_outgoing_messages,
    maxJsonDepth: protocolContract.max_json_depth,
    maxJsonTokens: protocolContract.max_json_tokens,
    toolCallsPerMinute: protocolContract.tool_calls_per_minute,
  };
  if (!object(overrides) || !fields(overrides, Object.keys(defaults))) throw Error('INVALID_STDIO_LIMITS');
  const result = {...defaults, ...overrides};
  for (const [key, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > defaults[key]) throw Error('INVALID_STDIO_LIMIT:' + key);
  }
  if (result.maxResponseBytes < 1024 || result.maxOutgoingBytes < result.maxResponseBytes + 1) throw Error('INVALID_STDIO_OUTPUT_LIMITS');
  return result;
}

function parseLine(bytes, limits) {
  return parseBoundedJson(bytes, {maxBytes: limits.maxMessageBytes, maxDepth: limits.maxJsonDepth, maxTokens: limits.maxJsonTokens});
}

function assertOutputJson(value, limits, depth = 0, active = new WeakSet(), budget = {nodes: 0, bytes: 0}) {
  if (++budget.nodes > limits.maxJsonTokens || depth > limits.maxJsonDepth) throw Error('TOOL_OUTPUT_JSON_LIMIT');
  if (typeof value === 'string') {
    budget.bytes += Buffer.byteLength(value, 'utf8');
    if (budget.bytes > limits.maxResponseBytes) throw Error('TOOL_RESULT_EXCEEDS_TRANSPORT_LIMIT');
    return;
  }
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return;
  if (!value || typeof value !== 'object' || active.has(value)) throw Error('TOOL_OUTPUT_MUST_BE_FINITE_JSON');
  const proto = Object.getPrototypeOf(value);
  if (Array.isArray(value) ? proto !== Array.prototype : ![Object.prototype, null].includes(proto)) throw Error('TOOL_OUTPUT_MUST_BE_PLAIN_JSON');
  if (Array.isArray(value) && (value.length > limits.maxJsonTokens || Object.keys(value).length !== value.length)) throw Error('TOOL_OUTPUT_BOUNDED_DENSE_ARRAY_REQUIRED');
  active.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor.enumerable || !own(descriptor, 'value')) throw Error('TOOL_OUTPUT_DATA_PROPERTIES_REQUIRED');
    if (Array.isArray(value) && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length)) throw Error('TOOL_OUTPUT_BOUNDED_DENSE_ARRAY_REQUIRED');
    assertOutputJson(key, limits, depth + 1, active, budget);
    assertOutputJson(descriptor.value, limits, depth + 1, active, budget);
  }
  active.delete(value);
}

/** Serve an already-created local engine. No socket, shell, fetch, or identity headers. */
export function serveMcpStdio({engine, input = process.stdin, output = process.stdout,
  diagnostics = process.stderr, limits: overrides = {}} = {}) {
  const limits = checkedLimits(overrides);
  if (!engine || typeof engine.callTool !== 'function' || !Array.isArray(engine.toolList) || !implementation(engine.serverInfo)) throw Error('LOCAL_MCP_ENGINE_REQUIRED');
  if (engine.toolList.length > 256 || (engine.instructions !== undefined && !text(engine.instructions, 32000))) throw Error('INVALID_LOCAL_MCP_ENGINE_METADATA');
  const tools = JSON.parse(JSON.stringify(engine.toolList)), serverInfo = JSON.parse(JSON.stringify(engine.serverInfo));
  const byName = new Map();
  for (const tool of tools) {
    if (!object(tool) || !/^[A-Za-z0-9_.-]{1,128}$/u.test(tool.name) || !object(tool.inputSchema) || byName.has(tool.name)) throw Error('INVALID_LOCAL_MCP_TOOL_CATALOG');
    byName.set(tool.name, tool);
  }
  const capabilities = {tools: {listChanged: false}};
  let era = null, legacyState = 'NEW', negotiated = null;
  let fragments = [], fragmentBytes = 0, discarding = false, ended = false, stopped = false;
  let activeCall = null, queuedBytes = 0, writing = false, outgoingBytes = 0, outgoingCount = 0;
  let callWindowStart = Date.now(), callsThisWindow = 0, actualCalls = 0, messagesRead = 0;
  const queue = [], outstanding = new Map(), outbox = [];
  let resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  done.catch(() => {});

  function cleanup(preserveErrors = false) {
    input.off('data', onData); input.off('end', onEnd); input.off('close', onInputClose);
    output.off('close', onOutputClose);
    if (!preserveErrors) { input.off('error', onInputError); output.off('error', onOutputError); }
  }
  function finishIfDone() {
    if (!stopped && ended && !activeCall && !queue.length && !writing && !outbox.length) {
      stopped = true; cleanup();
      resolveDone({status: 'MPC_STDIO_CLOSED', messages_read: messagesRead, tool_calls: actualCalls});
    }
  }
  function stop(reason) {
    if (stopped) return;
    stopped = true;
    for (const entry of outstanding.values()) entry.cancelled = true;
    queue.length = 0; outbox.length = 0; fragments = []; fragmentBytes = 0;
    input.pause(); cleanup(true);
    // No request or tool data is copied to diagnostics.
    try { diagnostics.write('MPC local stdio stopped: ' + reason + '\n'); } catch {}
    rejectDone(Error(reason));
  }
  function protocolError(id, code, detail, data) {
    return {jsonrpc: '2.0', ...(requestId(id) ? {id} : era === 'legacy' ? {id: null} : {}),
      error: {code, message: detail, ...(data === undefined ? {} : {data})}};
  }
  function complete(payload, modern) {
    return modern ? {...payload, resultType: 'complete', _meta: {[SERVER_KEY]: serverInfo}} : payload;
  }
  function flush() {
    if (stopped || writing) return;
    const item = outbox.shift();
    if (!item) { finishIfDone(); return; }
    if (item.entry?.cancelled) {
      outgoingBytes -= item.bytes; outgoingCount--; outstanding.delete(item.entry.id); flush(); return;
    }
    writing = true;
    try {
      output.write(item.line, 'utf8', error => {
        writing = false; outgoingBytes -= item.bytes; outgoingCount--;
        if (item.entry) outstanding.delete(item.entry.id);
        if (error) stop('OUTPUT_WRITE_FAILED'); else flush();
      });
    } catch { writing = false; stop('OUTPUT_WRITE_FAILED'); }
  }
  function send(response, entry = null) {
    if (stopped || entry?.cancelled) { if (entry) outstanding.delete(entry.id); return; }
    let line;
    try { line = JSON.stringify(response); } catch { line = JSON.stringify(protocolError(entry?.id, -32603, 'RESPONSE_SERIALIZATION_FAILED')); }
    if (Buffer.byteLength(line, 'utf8') > limits.maxResponseBytes) {
      const replacement = entry?.kind === 'tool' ? {
        jsonrpc: '2.0', id: entry.id,
        result: complete({content: [{type: 'text', text: 'Tool completed, but its result exceeded the local transport limit. Reduce the input or requested page. No result payload was returned.'}],
          structuredContent: {status: 'TOOL_RESULT_EXCEEDS_TRANSPORT_LIMIT', tool_completed: true, result_returned: false}, isError: true}, entry.modern),
      } : protocolError(entry?.id, -32603, 'RESPONSE_TOO_LARGE');
      line = JSON.stringify(replacement);
    }
    const bytes = Buffer.byteLength(line, 'utf8') + 1;
    if (bytes > limits.maxResponseBytes + 1 || outgoingBytes + bytes > limits.maxOutgoingBytes || outgoingCount >= limits.maxOutgoingMessages) { stop('OUTPUT_BACKPRESSURE_LIMIT'); return; }
    outgoingBytes += bytes; outgoingCount++; outbox.push({line: line + '\n', bytes, entry}); flush();
  }
  function reply(entry, payload) { send({jsonrpc: '2.0', id: entry.id, result: complete(payload, entry.modern)}, entry); }
  function reject(entry, code, detail, data) { send(protocolError(entry.id, code, detail, data), entry); }
  function toolError(entry, detail, completed = false) {
    reply(entry, {content: [{type: 'text', text: detail}], isError: true,
      ...(completed ? {structuredContent: {status: detail, tool_completed: true, result_returned: false}} : {})});
  }
  function pump() {
    if (stopped || activeCall) return;
    const entry = queue.shift();
    if (!entry) { finishIfDone(); return; }
    if (entry.cancelled) { queuedBytes -= entry.bytes; outstanding.delete(entry.id); pump(); return; }
    activeCall = entry; entry.started = true;
    Promise.resolve().then(() => {
      if (entry.cancelled || stopped) return;
      actualCalls++; return engine.callTool(entry.name, entry.arguments);
    }).then(payload => {
      if (entry.cancelled || stopped) return;
      try {
        assertOutputJson(payload, limits);
        const serialized = JSON.stringify(payload);
        reply(entry, {content: [{type: 'text', text: serialized}], ...(object(payload) ? {structuredContent: payload} : {}), isError: false});
      } catch (error) { toolError(entry, message(error), true); }
    }, error => { if (!entry.cancelled && !stopped) toolError(entry, message(error)); }).finally(() => {
      queuedBytes -= entry.bytes;
      if (entry.cancelled || stopped) outstanding.delete(entry.id);
      activeCall = null; pump(); finishIfDone();
    });
  }
  function metadata(params) {
    return params._meta;
  }
  function notification(request) {
    if (own(request, 'params') && !object(request.params)) return;
    const params = request.params ?? {};
    if (!object(params)) return;
    if (request.method === 'notifications/initialized') {
      if (era === 'legacy' && legacyState === 'AWAITING_INITIALIZED' && fields(params, ['_meta']) &&
        (!own(params, '_meta') || object(params._meta))) legacyState = 'READY';
    } else if (request.method === 'notifications/cancelled') {
      if (!fields(params, ['requestId', 'reason', '_meta']) || !requestId(params.requestId) ||
        (own(params, 'reason') && (typeof params.reason !== 'string' || params.reason.length > 1000)) ||
        (own(params, '_meta') && !object(params._meta))) return;
      const entry = outstanding.get(params.requestId);
      if (entry?.kind !== 'tool') return;
      entry.cancelled = true;
      const index = queue.indexOf(entry);
      if (index !== -1) { queue.splice(index, 1); queuedBytes -= entry.bytes; outstanding.delete(entry.id); }
      finishIfDone();
    }
    // In particular, tools/call without an id is never an instruction to run.
  }
  function accept(request, bytes) {
    if (!object(request) || request.jsonrpc !== '2.0' || !text(request.method, 128) ||
      !fields(request, ['jsonrpc', 'id', 'method', 'params'])) {
      send(protocolError(object(request) ? request.id : undefined, -32600, 'INVALID_REQUEST')); return;
    }
    if (!own(request, 'id')) { notification(request); return; }
    if (!requestId(request.id)) { send(protocolError(undefined, -32600, 'INVALID_REQUEST_ID')); return; }
    if (outstanding.has(request.id)) { send(protocolError(undefined, -32600, 'DUPLICATE_OUTSTANDING_REQUEST_ID')); return; }
    const entry = {id: request.id, kind: 'protocol', modern: false, cancelled: false, bytes};
    outstanding.set(entry.id, entry);
    const params = request.params ?? {};
    if ((own(request, 'params') && !object(request.params)) || (own(params, '_meta') && !object(params._meta))) { reject(entry, -32602, 'INVALID_PARAMS'); return; }
    const meta = metadata(params), declared = meta?.[VERSION_KEY];
    if (request.method === 'initialize') {
      if (era === 'modern' || legacyState !== 'NEW') { reject(entry, -32600, 'INITIALIZATION_ALREADY_COMPLETE_OR_WRONG_ERA'); return; }
      if (!fields(params, ['protocolVersion', 'capabilities', 'clientInfo', '_meta']) ||
        !text(params.protocolVersion, 128) || !object(params.capabilities) || !implementation(params.clientInfo) || declared !== undefined) {
        reject(entry, -32602, 'INVALID_INITIALIZE_PARAMS'); return;
      }
      era = 'legacy'; negotiated = LEGACY.includes(params.protocolVersion) ? params.protocolVersion : LEGACY[0];
      legacyState = 'AWAITING_INITIALIZED';
      reply(entry, {protocolVersion: negotiated, capabilities, serverInfo, ...(engine.instructions ? {instructions: engine.instructions} : {})}); return;
    }
    if (declared !== undefined) {
      if (era === 'legacy') {
        if (declared !== negotiated) { reject(entry, -32602, 'CONNECTION_PROTOCOL_ERA_MISMATCH'); return; }
      } else {
        if (!text(declared, 128) || !object(meta[CAPABILITIES_KEY]) || (own(meta, CLIENT_KEY) && !implementation(meta[CLIENT_KEY]))) {
          reject(entry, -32602, 'REQUIRED_REQUEST_METADATA_MISSING_OR_INVALID'); return;
        }
        if (declared !== MODERN) {
          reject(entry, -32022, 'Unsupported protocol version', {supported: [...protocolContract.supported_protocol_versions], requested: declared}); return;
        }
        era = 'modern'; entry.modern = true;
      }
    } else if (era === 'modern' || request.method === 'server/discover') {
      reject(entry, -32602, 'REQUIRED_REQUEST_METADATA_MISSING_OR_INVALID'); return;
    } else if (request.method !== 'ping' && legacyState !== 'READY') {
      reject(entry, -32602, 'INITIALIZATION_OR_PER_REQUEST_METADATA_REQUIRED'); return;
    }
    if (era === 'legacy' && request.method !== 'ping' && legacyState !== 'READY') {
      reject(entry, -32602, 'INITIALIZED_NOTIFICATION_REQUIRED'); return;
    }
    if (request.method === 'ping') {
      if (!fields(params, ['_meta'])) reject(entry, -32602, 'INVALID_PING_PARAMS'); else reply(entry, {});
      return;
    }
    if (request.method === 'server/discover' && entry.modern) {
      if (!fields(params, ['_meta'])) reject(entry, -32602, 'INVALID_DISCOVER_PARAMS');
      else reply(entry, {supportedVersions: [...protocolContract.supported_protocol_versions], capabilities,
        ...(engine.instructions ? {instructions: engine.instructions} : {}), ttlMs: 0, cacheScope: 'private'});
      return;
    }
    if (request.method === 'tools/list') {
      if (!fields(params, ['cursor', '_meta']) || own(params, 'cursor')) reject(entry, -32602, 'INVALID_TOOLS_LIST_CURSOR_OR_PARAMS');
      else reply(entry, {tools, ...(entry.modern ? {ttlMs: 0, cacheScope: 'private'} : {})});
      return;
    }
    if (request.method !== 'tools/call') { reject(entry, -32601, 'METHOD_NOT_FOUND'); return; }
    if (!fields(params, ['name', 'arguments', '_meta']) || !text(params.name, 128) ||
      (own(params, 'arguments') && !object(params.arguments))) { reject(entry, -32602, 'INVALID_TOOL_CALL_PARAMS'); return; }
    const tool = byName.get(params.name);
    if (!tool) { reject(entry, -32602, 'UNKNOWN_TOOL'); return; }
    entry.kind = 'tool'; entry.name = params.name; entry.arguments = params.arguments ?? {};
    try { validate(entry.arguments, tool.inputSchema); } catch (error) { toolError(entry, message(error)); return; }
    const now = Date.now();
    if (now - callWindowStart >= 60000) { callWindowStart = now; callsThisWindow = 0; }
    if (callsThisWindow >= limits.toolCallsPerMinute) {
      reject(entry, -32603, 'LOCAL_TOOL_RATE_LIMIT', {retry_after_ms: Math.max(0, 60000 - (now - callWindowStart)), automatic_retry: false}); return;
    }
    if (queue.length + Number(Boolean(activeCall)) >= limits.maxPendingCalls || queuedBytes + bytes > limits.maxQueuedBytes) {
      reject(entry, -32603, 'LOCAL_TOOL_QUEUE_LIMIT', {automatic_retry: false}); return;
    }
    callsThisWindow++; queuedBytes += bytes; queue.push(entry); pump();
  }
  function onData(chunk) {
    if (stopped) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let start = 0;
    while (start < bytes.length && !stopped) {
      const newline = bytes.indexOf(10, start), end = newline === -1 ? bytes.length : newline;
      const part = bytes.subarray(start, end);
      if (!discarding && fragmentBytes + part.length > limits.maxMessageBytes) {
        discarding = true; fragments = []; fragmentBytes = 0;
        send(protocolError(undefined, -32700, 'MESSAGE_TOO_LARGE'));
      }
      if (!discarding && part.length) { fragments.push(Buffer.from(part)); fragmentBytes += part.length; }
      if (newline !== -1) {
        messagesRead++;
        if (!discarding) {
          let line = Buffer.concat(fragments, fragmentBytes);
          if (line.at(-1) === 13) line = line.subarray(0, -1);
          try { accept(parseLine(line, limits), line.length); }
          catch (error) { send(protocolError(undefined, -32700, message(error))); }
        }
        fragments = []; fragmentBytes = 0; discarding = false;
      }
      start = newline === -1 ? bytes.length : newline + 1;
    }
  }
  function onEnd() {
    ended = true;
    if (fragmentBytes) send(protocolError(undefined, -32700, 'TRUNCATED_MESSAGE_AT_EOF'));
    fragments = []; fragmentBytes = 0; discarding = false; finishIfDone();
  }
  function onInputError() { stop('INPUT_STREAM_ERROR'); }
  function onInputClose() { if (!ended) stop('INPUT_STREAM_CLOSED'); }
  function onOutputError() { stop('OUTPUT_STREAM_ERROR'); }
  function onOutputClose() { if (!stopped) stop('OUTPUT_STREAM_CLOSED'); }
  input.on('data', onData); input.once('end', onEnd); input.on('error', onInputError); input.once('close', onInputClose);
  output.on('error', onOutputError); output.once('close', onOutputClose);
  return done;
}
