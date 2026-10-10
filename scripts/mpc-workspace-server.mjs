#!/usr/bin/env node

import {randomBytes, timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {existsSync, lstatSync, readFileSync, realpathSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const MPC_WORKSPACE_SERVER_VERSION = 'MPC_WORKSPACE_SERVER_1';
export const MPC_WORKSPACE_HOST = '127.0.0.1';
export const MPC_WORKSPACE_BODY_LIMIT = 4 * 1024 * 1024;
export const MPC_WORKSPACE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; font-src 'self'; object-src 'none'; media-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RENDERER_ROOT = resolve(MODULE_ROOT, '..', 'desktop', 'renderer');
const JSON_TYPE = 'application/json; charset=utf-8';
const SECRET_KEYS = /^(?:access[_-]?token|refresh[_-]?token|api[_-]?key|password|authorization|cookie|client[_-]?secret|private[_-]?key|headers)$/iu;
const STATIC_FILES = Object.freeze({
  '/': Object.freeze({name: 'index.html', type: 'text/html; charset=utf-8', maxBytes: 2 * 1024 * 1024}),
  '/index.html': Object.freeze({name: 'index.html', type: 'text/html; charset=utf-8', maxBytes: 2 * 1024 * 1024}),
  '/styles.css': Object.freeze({name: 'styles.css', type: 'text/css; charset=utf-8', maxBytes: 2 * 1024 * 1024}),
  '/app.js': Object.freeze({name: 'app.js', type: 'text/javascript; charset=utf-8', maxBytes: 4 * 1024 * 1024}),
  '/screen-policy.js': Object.freeze({name: 'screen-policy.js', type: 'text/javascript; charset=utf-8', maxBytes: 256 * 1024}),
  '/screen-reader.js': Object.freeze({name: 'screen-reader.js', type: 'text/javascript; charset=utf-8', maxBytes: 512 * 1024}),
  '/screen-source-choice.js': Object.freeze({name: 'screen-source-choice.js', type: 'text/javascript; charset=utf-8', maxBytes: 64 * 1024}),
  '/roi-process.js': Object.freeze({name: 'roi-process.js', type: 'text/javascript; charset=utf-8', maxBytes: 64 * 1024}),
  '/network-reader.js': Object.freeze({name: 'network-reader.js', type: 'text/javascript; charset=utf-8', maxBytes: 128 * 1024}),
  '/capture.js': Object.freeze({name: 'capture.js', type: 'text/javascript; charset=utf-8', maxBytes: 256 * 1024}),
  '/capture.html': Object.freeze({name: 'capture.html', type: 'text/html; charset=utf-8', maxBytes: 64 * 1024})
});
const BASE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': MPC_WORKSPACE_CSP,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
});

function workspaceError(code, status = 400, options = {}) {
  const error = Error(code);
  error.code = code;
  error.status = status;
  if (typeof options.message === 'string') error.publicMessage = options.message;
  if (typeof options.nextAction === 'string') error.nextAction = options.nextAction;
  return error;
}

function singleHeader(request, name) {
  const values = request.headersDistinct?.[name];
  if (!Array.isArray(values) || values.length !== 1 || typeof values[0] !== 'string') return null;
  return values[0];
}

function constantTimeEqual(actual, expected) {
  if (typeof actual !== 'string') return false;
  const left = Buffer.from(actual, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function sendJson(response, status, value, extraHeaders = {}) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    ...BASE_HEADERS,
    'Content-Type': JSON_TYPE,
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  });
  response.end(body);
}

async function writeModelSetupEvent(response, event) {
  if (response.destroyed || response.writableEnded) throw workspaceError('MPC_WORKSPACE_MODEL_SETUP_DISCONNECTED', 499);
  const line = `${JSON.stringify(event)}\n`;
  if (Buffer.byteLength(line) > 65_536) throw workspaceError('MPC_WORKSPACE_MODEL_SETUP_EVENT_TOO_LARGE', 502);
  if (response.write(line)) return;
  await new Promise((resolveDrain, reject) => {
    const cleanup = () => { response.off('drain', drain); response.off('close', closed); response.off('error', failed); };
    const drain = () => {cleanup(); resolveDrain();};
    const closed = () => {cleanup(); reject(workspaceError('MPC_WORKSPACE_MODEL_SETUP_DISCONNECTED', 499));};
    const failed = error => {cleanup(); reject(error);};
    response.once('drain', drain); response.once('close', closed); response.once('error', failed);
  });
}

async function streamModelSetup(request, response, service, operation, body, controllers) {
  const controller = new AbortController();
  const disconnected = () => {if (!response.writableEnded) controller.abort('CLIENT_DISCONNECTED');};
  controllers.add(controller);
  response.on('close', disconnected);
  let iterator;
  try {
    const stream = await callService(service, ['streamLocalModelSetup'], operation, body, {signal: controller.signal});
    if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') throw workspaceError('MPC_WORKSPACE_MODEL_SETUP_STREAM_UNAVAILABLE', 501);
    iterator = stream[Symbol.asyncIterator]();
    let item = await iterator.next();
    response.writeHead(200, {...BASE_HEADERS, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no'});
    while (!item.done) {
      await writeModelSetupEvent(response, item.value);
      item = await iterator.next();
    }
    response.end();
  } finally {
    controller.abort('MODEL_SETUP_REQUEST_ENDED');
    response.off('close', disconnected);
    controllers.delete(controller);
    await iterator?.return?.();
  }
}

function safeError(error) {
  const supplied = String(error?.code ?? '');
  const workspaceCode = /^(?:MPC_WORKSPACE|CC)_[A-Z0-9_]+$/u.test(supplied);
  const transferCode = /^TRANSFER_[A-Z0-9_]+$/u.test(supplied);
  const code = workspaceCode ? supplied : transferCode ? `MPC_WORKSPACE_${supplied}` : 'MPC_WORKSPACE_INTERNAL_ERROR';
  let status = Number.isInteger(error?.status) ? error.status : transferCode ? 422 : 500;
  if (status < 400 || status > 599) status = 500;
  const result = {error: code};
  if (typeof error?.publicMessage === 'string') result.message = error.publicMessage;
  if (typeof error?.nextAction === 'string') result.next_action = error.nextAction;
  return {status, result};
}

function parseRequestUrl(request) {
  if (typeof request.url !== 'string' || !request.url.startsWith('/') || request.url.startsWith('//') || request.url.includes('\\')) {
    throw workspaceError('MPC_WORKSPACE_REQUEST_TARGET_REJECTED');
  }
  let url;
  try {
    url = new URL(request.url, 'http://mpc-workspace.invalid');
  } catch {
    throw workspaceError('MPC_WORKSPACE_REQUEST_TARGET_REJECTED');
  }
  if (url.hash) throw workspaceError('MPC_WORKSPACE_QUERY_REJECTED');
  if (url.search) {
    const jobPrefix = '/api/workspace/jobs/';
    const encodedJobId = url.pathname.startsWith(jobPrefix) ? url.pathname.slice(jobPrefix.length) : '';
    let jobId = null;
    try {
      jobId = encodedJobId && !encodedJobId.includes('/') ? decodeURIComponent(encodedJobId) : null;
    } catch {}
    const entries = [...url.searchParams.entries()];
    const projectQualifiedJobRead = request.method === 'GET' && validId(jobId) && entries.length === 1 &&
      entries[0][0] === 'project_id' && validId(entries[0][1]);
    if (!projectQualifiedJobRead) throw workspaceError('MPC_WORKSPACE_QUERY_REJECTED');
  }
  return url;
}

function assertLoopbackRequest(request, port) {
  const host = singleHeader(request, 'host');
  if (host !== `${MPC_WORKSPACE_HOST}:${port}`) throw workspaceError('MPC_WORKSPACE_HOST_REJECTED', 421);
  const fetchSite = singleHeader(request, 'sec-fetch-site');
  if (fetchSite !== null && !['same-origin', 'none'].includes(fetchSite.toLowerCase())) {
    throw workspaceError('MPC_WORKSPACE_FETCH_SITE_REJECTED', 403);
  }
}

function assertCsrf(request, token) {
  if (!constantTimeEqual(singleHeader(request, 'x-mpc-csrf'), token)) {
    throw workspaceError('MPC_WORKSPACE_CSRF_REJECTED', 403);
  }
}

function assertWriteOrigin(request, port) {
  if (singleHeader(request, 'origin') !== `http://${MPC_WORKSPACE_HOST}:${port}`) {
    throw workspaceError('MPC_WORKSPACE_ORIGIN_REJECTED', 403);
  }
}

function inspectJson(value) {
  const queue = [{value, depth: 0}];
  let nodes = 0;
  while (queue.length) {
    const current = queue.pop();
    nodes += 1;
    if (nodes > 20_000 || current.depth > 32) throw workspaceError('MPC_WORKSPACE_JSON_COMPLEXITY_REJECTED', 422);
    if (typeof current.value === 'string' && Buffer.byteLength(current.value) > MPC_WORKSPACE_BODY_LIMIT) {
      throw workspaceError('MPC_WORKSPACE_JSON_STRING_TOO_LARGE', 422);
    }
    if (current.value === null || typeof current.value !== 'object') continue;
    for (const key of Object.keys(current.value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw workspaceError('MPC_WORKSPACE_UNSAFE_JSON_KEY', 422);
      }
      if (SECRET_KEYS.test(key)) throw workspaceError('MPC_WORKSPACE_SECRET_MATERIAL_REJECTED', 422);
      queue.push({value: current.value[key], depth: current.depth + 1});
    }
  }
}

async function readJsonBody(request) {
  const contentType = singleHeader(request, 'content-type');
  if (contentType === null || !/^application\/json;\s*charset=utf-8$/iu.test(contentType)) {
    throw workspaceError('MPC_WORKSPACE_CONTENT_TYPE_REQUIRED', 415);
  }
  const encoding = singleHeader(request, 'content-encoding');
  if (encoding !== null && encoding.toLowerCase() !== 'identity') {
    throw workspaceError('MPC_WORKSPACE_CONTENT_ENCODING_REJECTED', 415);
  }
  const declaredLength = singleHeader(request, 'content-length');
  if (declaredLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(declaredLength)) throw workspaceError('MPC_WORKSPACE_CONTENT_LENGTH_INVALID');
    if (Number(declaredLength) > MPC_WORKSPACE_BODY_LIMIT) throw workspaceError('MPC_WORKSPACE_BODY_TOO_LARGE', 413);
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MPC_WORKSPACE_BODY_LIMIT) throw workspaceError('MPC_WORKSPACE_BODY_TOO_LARGE', 413);
    chunks.push(chunk);
  }
  if (bytes === 0) throw workspaceError('MPC_WORKSPACE_JSON_REQUIRED');
  let text;
  try {
    text = new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks));
  } catch {
    throw workspaceError('MPC_WORKSPACE_JSON_UTF8_INVALID');
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw workspaceError('MPC_WORKSPACE_JSON_INVALID');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw workspaceError('MPC_WORKSPACE_JSON_OBJECT_REQUIRED');
  }
  inspectJson(value);
  return value;
}

function validateRendererRoot(rendererRoot) {
  if (typeof rendererRoot !== 'string' || /^(?:file|https?|data):/iu.test(rendererRoot) || rendererRoot.startsWith('\\\\')) {
    throw workspaceError('MPC_WORKSPACE_RENDERER_ROOT_INVALID');
  }
  const absolute = resolve(rendererRoot);
  if (!existsSync(absolute)) throw workspaceError('MPC_WORKSPACE_RENDERER_ROOT_NOT_FOUND');
  const entry = lstatSync(absolute);
  if (entry.isSymbolicLink() || !entry.isDirectory() || realpathSync(absolute) !== absolute) {
    throw workspaceError('MPC_WORKSPACE_RENDERER_ROOT_INVALID');
  }
  const files = new Map();
  for (const descriptor of new Set(Object.values(STATIC_FILES))) {
    const path = join(absolute, descriptor.name);
    if (!existsSync(path)) throw workspaceError('MPC_WORKSPACE_RENDERER_FILE_MISSING');
    const file = lstatSync(path);
    if (file.isSymbolicLink() || !file.isFile() || file.size > descriptor.maxBytes) {
      throw workspaceError('MPC_WORKSPACE_RENDERER_FILE_INVALID');
    }
    files.set(descriptor.name, readFileSync(path));
  }
  const html = new TextDecoder('utf-8', {fatal: true}).decode(files.get('index.html'));
  const escaped = MPC_WORKSPACE_CSP.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  if (!new RegExp(`<meta\\s+http-equiv=["']Content-Security-Policy["']\\s+content=["']${escaped}["']`, 'iu').test(html)) {
    throw workspaceError('MPC_WORKSPACE_RENDERER_CSP_MISMATCH');
  }
  return {root: absolute, files};
}

function serveStatic(response, method, descriptor, renderer) {
  const body = renderer.files.get(descriptor.name);
  const captureHeaders=descriptor.name==='capture.html'?{
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'none'; img-src 'none'; media-src blob:; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Permissions-Policy':'camera=(self), microphone=(), geolocation=(), usb=()'
  }:{};
  response.writeHead(200, {
    ...BASE_HEADERS,
    ...captureHeaders,
    'Content-Type': descriptor.type,
    'Content-Length': body.length
  });
  response.end(method === 'HEAD' ? undefined : body);
}

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
}

function dynamicRoute(pathname, root) {
  if (!pathname.startsWith(`${root}/`)) return null;
  const tail = pathname.slice(root.length + 1);
  if (!tail || tail.includes('/')) return null;
  let id;
  try {
    id = decodeURIComponent(tail);
  } catch {
    throw workspaceError('MPC_WORKSPACE_ID_INVALID');
  }
  if (!validId(id)) throw workspaceError('MPC_WORKSPACE_ID_INVALID');
  return id;
}

function dynamicActionRoute(pathname, root, action) {
  if (!pathname.startsWith(`${root}/`) || !pathname.endsWith(`/${action}`)) return null;
  const encoded = pathname.slice(root.length + 1, -(action.length + 1));
  if (!encoded || encoded.includes('/')) return null;
  let id;
  try {
    id = decodeURIComponent(encoded);
  } catch {
    throw workspaceError('MPC_WORKSPACE_ID_INVALID');
  }
  if (!validId(id)) throw workspaceError('MPC_WORKSPACE_ID_INVALID');
  return id;
}

async function callService(service, names, ...args) {
  for (const name of names) {
    if (typeof service?.[name] === 'function') return service[name](...args);
  }
  throw workspaceError('MPC_WORKSPACE_OPERATION_UNAVAILABLE', 501, {
    message: 'This local operation is not installed in the current build.',
    nextAction: 'Update MPC Workspace or choose an available local operation.'
  });
}

async function optionalService(service, names, fallback, ...args) {
  for (const name of names) {
    if (typeof service?.[name] === 'function') return service[name](...args);
  }
  return fallback;
}

async function createDefaultService(options) {
  let loaded;
  try {
    loaded = await import('../lib/mpc-workspace-service.mjs');
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    throw workspaceError('MPC_WORKSPACE_SERVICE_NOT_INSTALLED', 503, {
      message: 'The MPC Workspace service module is not present in this build.',
      nextAction: 'Repair or update the local installation, then restart the service.'
    });
  }
  const factory = loaded.createMpcWorkspaceService ?? loaded.createWorkspaceService;
  if (typeof factory !== 'function') throw workspaceError('MPC_WORKSPACE_SERVICE_EXPORT_MISSING', 503);
  return factory(options);
}

function listen(server, port) {
  return new Promise((resolveListen, reject) => {
    const cleanup = () => {
      server.off('error', onError);
      server.off('listening', onListening);
    };
    const onError = error => {
      cleanup();
      reject(error);
    };
    const onListening = () => {
      cleanup();
      resolveListen();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({host: MPC_WORKSPACE_HOST, port, exclusive: true});
  });
}

async function listenWithFallback(server, port, fallbackPort) {
  try {
    await listen(server, port);
  } catch (error) {
    if (!fallbackPort || port === 0 || error?.code !== 'EADDRINUSE') throw error;
    await listen(server, 0);
  }
}

function closeServer(server) {
  return new Promise((resolveClose, reject) => {
    if (!server.listening) {
      resolveClose();
      return;
    }
    server.close(error => error ? reject(error) : resolveClose());
    server.closeIdleConnections?.();
  });
}

/**
 * Start the narrow same-origin host used by the Electron shell and loopback
 * browser mode. The renderer never receives filesystem, SQL, model or
 * connector authority; every such operation stays behind this service.
 */
export async function startMpcWorkspaceServer({
  host = MPC_WORKSPACE_HOST,
  port = 0,
  fallbackPort = true,
  rendererRoot = DEFAULT_RENDERER_ROOT,
  dataRoot,
  database,
  service,
  serviceFactory,
  adapters = {},
  csrfToken
} = {}) {
  if (host !== MPC_WORKSPACE_HOST) throw workspaceError('MPC_WORKSPACE_LOOPBACK_REQUIRED');
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535 || (port !== 0 && port < 1024)) {
    throw workspaceError('MPC_WORKSPACE_PORT_INVALID');
  }
  if (typeof fallbackPort !== 'boolean') throw workspaceError('MPC_WORKSPACE_FALLBACK_PORT_INVALID');
  const renderer = validateRendererRoot(rendererRoot);
  const token = csrfToken ?? randomBytes(32).toString('base64url');
  if (typeof token !== 'string' || Buffer.byteLength(token) < 32) throw workspaceError('MPC_WORKSPACE_CSRF_TOKEN_INVALID');
  const workspaceService = service ?? (typeof serviceFactory === 'function'
    ? await serviceFactory({dataRoot, database, adapters})
    : await createDefaultService({dataRoot, database, adapters}));
  if (workspaceService === null || typeof workspaceService !== 'object') throw workspaceError('MPC_WORKSPACE_SERVICE_INVALID');

  let actualPort;
  const modelSetupControllers = new Set();
  const server = createServer(async (request, response) => {
    try {
      assertLoopbackRequest(request, actualPort);
      const url = parseRequestUrl(request);
      const method = request.method ?? '';
      const staticDescriptor = STATIC_FILES[url.pathname];
      if (staticDescriptor) {
        if (!['GET', 'HEAD'].includes(method)) {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'GET, HEAD'});
          return;
        }
        serveStatic(response, method, staticDescriptor, renderer);
        return;
      }

      if (url.pathname === '/api/workspace/bootstrap') {
        if (method !== 'GET') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'GET'});
          return;
        }
        const value = await callService(workspaceService, ['bootstrap', 'getBootstrap']);
        sendJson(response, 200, {
          ...value,
          format_version: MPC_WORKSPACE_SERVER_VERSION,
          csrf_token: token,
          service: {
            ...(value?.service ?? {}),
            status: value?.service?.status ?? 'READY_LOCAL',
            host: MPC_WORKSPACE_HOST,
            port: actualPort,
            url: `http://${MPC_WORKSPACE_HOST}:${actualPort}/`
          }
        });
        return;
      }

      if (!url.pathname.startsWith('/api/workspace/')) {
        sendJson(response, 404, {error: 'MPC_WORKSPACE_NOT_FOUND'});
        return;
      }
      if (method === 'POST') {
        assertCsrf(request, token);
        assertWriteOrigin(request, actualPort);
      }

      let body;
      const postBody = async () => body ??= await readJsonBody(request);
      if (url.pathname === '/api/workspace/local-model/status') {
        if (method !== 'GET') {sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'GET'}); return;}
        sendJson(response, 200, await callService(workspaceService, ['localModelStatus']));
        return;
      }
      if (url.pathname === '/api/workspace/local-model/start') {
        if (method !== 'POST') {sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'}); return;}
        sendJson(response, 200, await callService(workspaceService, ['startLocalModel'], await postBody()));
        return;
      }
      if (url.pathname === '/api/workspace/local-model/cancel') {
        if (method !== 'POST') {sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'}); return;}
        sendJson(response, 200, await callService(workspaceService, ['cancelLocalModelSetup'], await postBody()));
        return;
      }
      if (url.pathname === '/api/workspace/local-model/pull' || url.pathname === '/api/workspace/local-model/create') {
        if (method !== 'POST') {sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'}); return;}
        await streamModelSetup(request, response, workspaceService, url.pathname.endsWith('/pull') ? 'pull' : 'create', await postBody(), modelSetupControllers);
        return;
      }
      if (url.pathname === '/api/workspace/projects') {
        if (method === 'GET') {
          const projects = await callService(workspaceService, ['listProjects']);
          sendJson(response, 200, {projects});
          return;
        }
        if (method === 'POST') {
          const project = await callService(workspaceService, ['createProject'], await postBody());
          sendJson(response, 201, {project});
          return;
        }
        sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'GET, POST'});
        return;
      }
      const projectOpenId = dynamicActionRoute(url.pathname, '/api/workspace/projects', 'open');
      if (projectOpenId !== null) {
        if (method !== 'POST') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
          return;
        }
        const project = await callService(workspaceService, ['openProject'], projectOpenId, await postBody());
        sendJson(response, 200, {project});
        return;
      }
      const projectDraftId = dynamicActionRoute(url.pathname, '/api/workspace/projects', 'draft');
      if (projectDraftId !== null) {
        if (method !== 'POST') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
          return;
        }
        const draft = await callService(workspaceService, ['saveProjectDraft'], projectDraftId, await postBody());
        sendJson(response, 200, {draft});
        return;
      }
      const projectId = dynamicRoute(url.pathname, '/api/workspace/projects');
      if (projectId !== null) {
        if (method !== 'GET') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'GET'});
          return;
        }
        const project = await callService(workspaceService, ['getProject', 'projectDetail'], projectId);
        sendJson(response, 200, {project});
        return;
      }
      if (url.pathname === '/api/workspace/inputs') {
        if (method !== 'POST') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
          return;
        }
        const input = await callService(workspaceService, ['ingestInput', 'createInput'], await postBody());
        sendJson(response, 201, {input});
        return;
      }
      if (url.pathname === '/api/workspace/transfers/export') {
        if (method !== 'POST') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
          return;
        }
        const transfer = await callService(workspaceService, ['exportTransfer'], await postBody());
        sendJson(response, 200, {transfer});
        return;
      }
      if (url.pathname === '/api/workspace/transfers/import') {
        if (method !== 'POST') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
          return;
        }
        const transfer = await callService(workspaceService, ['importTransfer'], await postBody());
        sendJson(response, 201, {transfer});
        return;
      }
      if (url.pathname === '/api/workspace/jobs') {
        if (method !== 'POST') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
          return;
        }
        const job = await callService(workspaceService, ['startJob', 'runJob'], await postBody());
        sendJson(response, 202, {job});
        return;
      }
      const cancelId = dynamicActionRoute(url.pathname, '/api/workspace/jobs', 'cancel');
      if (cancelId !== null) {
        if (method !== 'POST') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
          return;
        }
        const job = await callService(workspaceService, ['cancelJob'], cancelId, await postBody());
        sendJson(response, 200, {job});
        return;
      }
      const resumeId = dynamicActionRoute(url.pathname, '/api/workspace/jobs', 'resume');
      if (resumeId !== null) {
        if (method !== 'POST') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
          return;
        }
        const job = await callService(workspaceService, ['resumeJob'], resumeId, await postBody());
        sendJson(response, 200, {job});
        return;
      }
      const jobId = dynamicRoute(url.pathname, '/api/workspace/jobs');
      if (jobId !== null) {
        if (method !== 'GET') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'GET'});
          return;
        }
        const requestedProjectId = url.searchParams.get('project_id');
        const job = requestedProjectId === null
          ? await callService(workspaceService, ['getJob'], jobId)
          : await callService(workspaceService, ['getJob'], jobId, requestedProjectId);
        sendJson(response, 200, {job});
        return;
      }
      if (url.pathname === '/api/workspace/search') {
        if (method !== 'POST') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
          return;
        }
        const result = await callService(workspaceService, ['search'], await postBody());
        sendJson(response, 200, result);
        return;
      }
      if (url.pathname === '/api/workspace/snapshots/compare') {
        if (method !== 'POST') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
          return;
        }
        const comparison = await callService(workspaceService, ['compareSnapshots'], await postBody());
        sendJson(response, 200, {comparison});
        return;
      }
      if (url.pathname === '/api/workspace/reports') {
        if (method === 'GET') {
          const reports = await callService(workspaceService, ['listReports']);
          sendJson(response, 200, {reports});
          return;
        }
        if (method === 'POST') {
          const report = await callService(workspaceService, ['createReport'], await postBody());
          sendJson(response, 201, {report});
          return;
        }
        sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'GET, POST'});
        return;
      }
      const reportId = dynamicRoute(url.pathname, '/api/workspace/reports');
      if (reportId !== null) {
        if (method !== 'GET') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'GET'});
          return;
        }
        const report = await callService(workspaceService, ['getReport', 'openReport'], reportId);
        sendJson(response, 200, {report});
        return;
      }
      if (url.pathname === '/api/workspace/connections') {
        if (method === 'GET') {
          const connections = await callService(workspaceService, ['listConnections']);
          sendJson(response, 200, {connections});
          return;
        }
        if (method === 'POST') {
          const connection = await callService(workspaceService, ['configureConnection'], await postBody());
          sendJson(response, 201, {connection});
          return;
        }
        sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'GET, POST'});
        return;
      }
      if (url.pathname === '/api/workspace/connections/test') {
        if (method !== 'POST') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
          return;
        }
        const observation = await callService(workspaceService, ['testConnection', 'observeConnection'], await postBody());
        sendJson(response, 200, {observation});
        return;
      }
      if (url.pathname === '/api/workspace/scripts') {
        if (method === 'GET') {
          const scripts = await optionalService(workspaceService, ['listScripts'], [], undefined);
          sendJson(response, 200, {scripts});
          return;
        }
        if (method === 'POST') {
          const script = await callService(workspaceService, ['handleScript', 'createScript'], await postBody());
          sendJson(response, 201, {script});
          return;
        }
        sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'GET, POST'});
        return;
      }
      const exportScriptId = dynamicActionRoute(url.pathname, '/api/workspace/scripts', 'export');
      if (exportScriptId !== null) {
        if (method !== 'POST') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
          return;
        }
        const script = await callService(workspaceService, ['exportScript'], exportScriptId, await postBody());
        sendJson(response, 200, {script});
        return;
      }
      const outputScriptId = dynamicActionRoute(url.pathname, '/api/workspace/scripts', 'output');
      if (outputScriptId !== null) {
        if (method !== 'POST') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'POST'});
          return;
        }
        const output = await callService(workspaceService, ['ingestScriptOutput'], outputScriptId, await postBody());
        sendJson(response, 201, {output});
        return;
      }
      const scriptId = dynamicRoute(url.pathname, '/api/workspace/scripts');
      if (scriptId !== null) {
        if (method !== 'GET') {
          sendJson(response, 405, {error: 'MPC_WORKSPACE_METHOD_NOT_ALLOWED'}, {Allow: 'GET'});
          return;
        }
        const script = await callService(workspaceService, ['getScript'], scriptId);
        sendJson(response, 200, {script});
        return;
      }
      sendJson(response, 404, {error: 'MPC_WORKSPACE_NOT_FOUND'});
    } catch (error) {
      if (!response.headersSent) {
        const safe = safeError(error);
        sendJson(response, safe.status, safe.result);
      } else {
        response.destroy();
      }
    }
  });
  server.maxHeadersCount = 48;
  server.headersTimeout = 5_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 2_000;
  try {
    await listenWithFallback(server, port, fallbackPort);
    const address = server.address();
    actualPort = typeof address === 'object' && address ? address.port : null;
    if (!Number.isInteger(actualPort)) throw workspaceError('MPC_WORKSPACE_LISTEN_FAILED');
  } catch (error) {
    await workspaceService.close?.();
    throw error;
  }
  let closed = false;
  return {
    server,
    service: workspaceService,
    host: MPC_WORKSPACE_HOST,
    port: actualPort,
    url: `http://${MPC_WORKSPACE_HOST}:${actualPort}/`,
    csrfToken: token,
    health() {
      return {
        status: server.listening ? 'READY_LOCAL' : 'STOPPED',
        host: MPC_WORKSPACE_HOST,
        port: actualPort,
        url: `http://${MPC_WORKSPACE_HOST}:${actualPort}/`
      };
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const controller of modelSetupControllers) controller.abort('SERVICE_CLOSED');
      await closeServer(server);
      await workspaceService.close?.();
    }
  };
}

export function parseMpcWorkspaceServerArguments(argv) {
  const result = {port: 0, fallbackPort: true};
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      result.help = true;
      continue;
    }
    if (argument === '--no-port-fallback') {
      if (seen.has(argument)) throw workspaceError('MPC_WORKSPACE_ARGUMENT_DUPLICATE');
      seen.add(argument);
      result.fallbackPort = false;
      continue;
    }
    if (!['--renderer-root', '--data-root', '--database', '--port'].includes(argument) || seen.has(argument)) {
      throw workspaceError('MPC_WORKSPACE_ARGUMENT_INVALID');
    }
    if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) throw workspaceError('MPC_WORKSPACE_ARGUMENT_INVALID');
    seen.add(argument);
    const value = argv[++index];
    if (argument === '--renderer-root') result.rendererRoot = value;
    else if (argument === '--data-root') result.dataRoot = value;
    else if (argument === '--database') result.database = value;
    else {
      if (!/^(?:0|[1-9][0-9]{0,4})$/u.test(value)) throw workspaceError('MPC_WORKSPACE_PORT_INVALID');
      result.port = Number(value);
      if (result.port > 65535 || (result.port !== 0 && result.port < 1024)) throw workspaceError('MPC_WORKSPACE_PORT_INVALID');
    }
  }
  return result;
}

async function main() {
  const options = parseMpcWorkspaceServerArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: node scripts/mpc-workspace-server.mjs [--renderer-root desktop/renderer] [--data-root PATH] [--database FILE] [--port 0] [--no-port-fallback]\n');
    return;
  }
  const running = await startMpcWorkspaceServer(options);
  process.stdout.write(`${JSON.stringify({status: 'READY_LOCAL', url: running.url})}\n`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await running.close();
      process.exitCode = 0;
    } catch {
      process.exitCode = 1;
    }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const safe = safeError(error);
    process.stderr.write(`${JSON.stringify(safe.result)}\n`);
    process.exitCode = 1;
  });
}

