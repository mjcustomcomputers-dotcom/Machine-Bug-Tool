import {createHash} from 'node:crypto';
import {isIP} from 'node:net';

export const MPC_WORKSPACE_SCREEN_CONTEXT_VERSION = 'MPC_WORKSPACE_SCREEN_CONTEXT_HAR_1';
export const MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS = Object.freeze({
  max_bytes: 4 * 1024 * 1024,
  max_entries: 512,
  max_depth: 32,
  max_tokens: 500_000,
  max_nodes: 250_000,
  max_headers_per_message: 256,
  max_cookies_per_message: 256,
  max_query_parameters: 256,
  max_path_segments_in_summary: 16,
  max_summary_bytes: 200_000
});

const NETWORK_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:']);
const SAFE_SCHEMES = new Set(['http', 'https', 'ws', 'wss', 'data', 'blob', 'file', 'about']);
const HTTP_METHODS = new Set([
  'CHECKOUT', 'CONNECT', 'COPY', 'DELETE', 'GET', 'HEAD', 'LINK', 'LOCK', 'M-SEARCH', 'MERGE',
  'MKACTIVITY', 'MKCOL', 'MOVE', 'NOTIFY', 'OPTIONS', 'PATCH', 'POST', 'PROPFIND', 'PROPPATCH',
  'PURGE', 'PUT', 'REPORT', 'SUBSCRIBE', 'TRACE', 'UNLINK', 'UNLOCK', 'UNSUBSCRIBE'
]);
const TIMING_FIELDS = Object.freeze(['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive']);
const MIME_CLASSES = new Set([
  'application/graphics', 'application/json', 'application/octet-stream', 'application/other',
  'application/pdf', 'application/wasm', 'application/x-www-form-urlencoded', 'application/xml',
  'audio/*', 'font/*', 'image/*', 'multipart/form-data', 'text/css', 'text/html', 'text/javascript',
  'text/other', 'text/plain', 'video/*'
]);
const CONTEXT_STATEMENT = 'Imported Firefox HAR application-layer context; no active packet capture occurred, and temporal association does not establish causality.';
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inputBytes(input) {
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_bytes) {
      fail('MPC_SCREEN_CONTEXT_HAR_BYTE_LIMIT');
    }
    return Buffer.from(input, 'utf8');
  }
  // Snapshot caller-owned memory so the recorded hash and parsed bytes cannot
  // diverge if a Uint8Array is changed while sanitization is in progress.
  if (input instanceof Uint8Array) {
    if (input.byteLength > MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_bytes) fail('MPC_SCREEN_CONTEXT_HAR_BYTE_LIMIT');
    return Buffer.from(input);
  }
  fail('MPC_SCREEN_CONTEXT_HAR_BYTES_OR_STRING_REQUIRED');
}

function decodeJson(bytes) {
  if (bytes.byteLength > MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_bytes) fail('MPC_SCREEN_CONTEXT_HAR_BYTE_LIMIT');
  let raw;
  try {
    raw = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch {
    fail('MPC_SCREEN_CONTEXT_HAR_UTF8_INVALID');
  }

  // Reject duplicate decoded object keys before JSON.parse selects a winner.
  const stack = [];
  const tokens = /"(?:\\.|[^"\\])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/gu;
  let expectKey = false;
  let tokenCount = 0;
  try {
    for (const match of raw.matchAll(tokens)) {
      if (++tokenCount > MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_tokens) fail('MPC_SCREEN_CONTEXT_HAR_TOKEN_LIMIT');
      const token = match[0];
      if (token === '{' || token === '[') {
        stack.push(token === '{' ? new Set() : null);
        if (stack.length > MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_depth) fail('MPC_SCREEN_CONTEXT_HAR_DEPTH_LIMIT');
        expectKey = token === '{';
      } else if (token === '}' || token === ']') {
        stack.pop();
        expectKey = false;
      } else if (token === ',') expectKey = stack.at(-1) instanceof Set;
      else if (token === ':') expectKey = false;
      else if (expectKey && token.startsWith('"')) {
        const key = JSON.parse(token);
        const keys = stack.at(-1);
        if (keys.has(key)) fail('MPC_SCREEN_CONTEXT_HAR_DUPLICATE_KEY');
        keys.add(key);
        expectKey = false;
      }
    }
  } catch (error) {
    if (String(error?.code ?? '').startsWith('MPC_SCREEN_CONTEXT_')) throw error;
    fail('MPC_SCREEN_CONTEXT_HAR_JSON_INVALID');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail('MPC_SCREEN_CONTEXT_HAR_JSON_INVALID');
  }
  const pending = [{value: parsed, depth: 0}];
  let nodeCount = 0;
  while (pending.length) {
    const {value, depth} = pending.pop();
    if (++nodeCount > MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_nodes) fail('MPC_SCREEN_CONTEXT_HAR_NODE_LIMIT');
    if (depth > MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_depth) fail('MPC_SCREEN_CONTEXT_HAR_DEPTH_LIMIT');
    if (typeof value === 'number' && !Number.isFinite(value)) fail('MPC_SCREEN_CONTEXT_HAR_NUMBER_INVALID');
    if (value === null || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') fail('MPC_SCREEN_CONTEXT_HAR_UNSAFE_KEY');
      pending.push({value: child, depth: depth + 1});
    }
  }
  return parsed;
}

function boundedArray(value, code, maximum) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximum) fail(code);
  return value;
}

function boundedRecords(value, code, maximum) {
  const rows = boundedArray(value, code, maximum);
  if (rows.some(row => !plainObject(row))) fail(code);
  return rows;
}

function normalizeMethod(value) {
  if (typeof value !== 'string') return 'UNKNOWN';
  const method = value.toUpperCase();
  return HTTP_METHODS.has(method) ? method : 'OTHER';
}

function normalizeMime(value) {
  if (typeof value !== 'string') return null;
  const mediaType = value.split(';', 1)[0].trim().toLowerCase();
  if (!/^[a-z0-9!#$&^_.+-]{1,64}\/[a-z0-9!#$&^_.+-]{1,64}$/u.test(mediaType)) return null;
  if (['text/html', 'text/plain', 'text/css', 'text/javascript', 'application/json', 'application/pdf',
    'application/wasm', 'application/octet-stream', 'application/xml', 'application/x-www-form-urlencoded',
    'multipart/form-data'].includes(mediaType)) return mediaType;
  const [family, subtype] = mediaType.split('/');
  if (family === 'text') return subtype.includes('javascript') ? 'text/javascript' : 'text/other';
  if (family === 'image') return 'image/*';
  if (family === 'audio') return 'audio/*';
  if (family === 'video') return 'video/*';
  if (family === 'font') return 'font/*';
  if (family === 'application') {
    if (subtype.endsWith('+json') || subtype.includes('json')) return 'application/json';
    if (subtype.endsWith('+xml') || subtype.includes('xml')) return 'application/xml';
    if (subtype.includes('javascript') || subtype.includes('ecmascript')) return 'text/javascript';
    if (subtype.includes('font')) return 'font/*';
    if (subtype.includes('image') || subtype.includes('graphics')) return 'application/graphics';
    return 'application/other';
  }
  return null;
}

function safeInteger(value, {maximum = Number.MAX_SAFE_INTEGER, allowNegativeOne = true} = {}) {
  if (!Number.isSafeInteger(value) || value > maximum || value < (allowNegativeOne ? -1 : 0)) return null;
  return value === -1 ? null : value;
}

function safeMilliseconds(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -1 || value > 86_400_000) return null;
  return value === -1 ? null : Math.round(value * 1_000) / 1_000;
}

function strictTimestamp(value) {
  if (typeof value !== 'string' || value.length > 80) {
    fail('MPC_SCREEN_CONTEXT_HAR_TIMESTAMP_INVALID');
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if (!match) fail('MPC_SCREEN_CONTEXT_HAR_TIMESTAMP_INVALID');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[9] === undefined ? 0 : Number(match[9]);
  const offsetMinute = match[10] === undefined ? 0 : Number(match[10]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 ||
      second > 59 || offsetHour > 23 || offsetMinute > 59) fail('MPC_SCREEN_CONTEXT_HAR_TIMESTAMP_INVALID');
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) fail('MPC_SCREEN_CONTEXT_HAR_TIMESTAMP_INVALID');
  return new Date(milliseconds).toISOString();
}

function safeStatus(value) {
  return Number.isSafeInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function safeHostname(hostname) {
  const unwrapped = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  if (isIP(unwrapped)) return {hostname: '<ip-address>', host_kind: 'IP_REDACTED', host_identity_sha256: null};
  const normalized = hostname.toLowerCase();
  if (!normalized || normalized.length > 253 || !/^[a-z0-9.-]+$/u.test(normalized)) {
    return {hostname: '<host-redacted>', host_kind: 'REDACTED', host_identity_sha256: null};
  }
  if (normalized === 'localhost') {
    return {hostname: 'localhost', host_kind: 'LOCALHOST', host_identity_sha256: null};
  }
  const hostIdentitySha256 = sha256(Buffer.from(normalized, 'utf8'));
  return {
    hostname: `<dns-${hostIdentitySha256.slice(0, 24)}>`,
    host_kind: 'DNS_PSEUDONYMIZED',
    host_identity_sha256: hostIdentitySha256
  };
}

function pathShape(pathname) {
  const segments = pathname.split('/').filter(Boolean).length;
  const represented = Math.min(segments, MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_path_segments_in_summary);
  return {
    path_template: segments === 0 ? '/' : `/${[
      ...Array.from({length: represented}, () => ':segment'),
      ...(segments > represented ? [':more'] : [])
    ].join('/')}`,
    path_segment_count: segments,
    path_segments_omitted: segments - represented,
    trailing_slash: pathname.length > 1 && pathname.endsWith('/')
  };
}

function safeUrl(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 32_768 || raw.includes('\u0000')) {
    fail('MPC_SCREEN_CONTEXT_HAR_URL_INVALID');
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail('MPC_SCREEN_CONTEXT_HAR_URL_INVALID');
  }
  const observedScheme = parsed.protocol.slice(0, -1).toLowerCase();
  const scheme = SAFE_SCHEMES.has(observedScheme) ? observedScheme : 'other';
  const queryParameterCount = [...parsed.searchParams].length;
  if (queryParameterCount > MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_query_parameters) {
    fail('MPC_SCREEN_CONTEXT_HAR_QUERY_LIMIT');
  }
  if (!NETWORK_SCHEMES.has(parsed.protocol)) return {
    scheme,
    origin: null,
    host_kind: 'OPAQUE',
    path_template: ':opaque',
    path_segment_count: null,
    path_segments_omitted: 0,
    trailing_slash: false,
    port: null,
    host_identity_sha256: null,
    query_parameter_count: queryParameterCount,
    query_values_omitted: queryParameterCount > 0
  };
  const host = safeHostname(parsed.hostname);
  return {
    scheme,
    origin: `${scheme}://${host.hostname}${parsed.port ? `:${parsed.port}` : ''}`,
    host_kind: host.host_kind,
    host_identity_sha256: host.host_identity_sha256,
    port: parsed.port ? Number(parsed.port) : null,
    ...pathShape(parsed.pathname),
    query_parameter_count: queryParameterCount,
    query_values_omitted: queryParameterCount > 0
  };
}

function headerFacts(value, side) {
  const rows = boundedRecords(value, 'MPC_SCREEN_CONTEXT_HAR_HEADER_LIMIT',
    MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_headers_per_message);
  let authorization = false;
  let cookie = false;
  let setCookie = 0;
  const security = {content_security_policy: false, strict_transport_security: false,
    frame_options: false, content_type_options: false, access_control_allow_origin: false};
  for (const row of rows) {
    if (typeof row.name !== 'string' || row.name.length > 512) fail('MPC_SCREEN_CONTEXT_HAR_HEADER_INVALID');
    const name = row.name.trim().toLowerCase();
    if (name === 'authorization' || name === 'proxy-authorization') authorization = true;
    if (name === 'cookie') cookie = true;
    if (name === 'set-cookie') setCookie++;
    if (side === 'response') {
      if (name === 'content-security-policy' || name === 'content-security-policy-report-only') security.content_security_policy = true;
      if (name === 'strict-transport-security') security.strict_transport_security = true;
      if (name === 'x-frame-options') security.frame_options = true;
      if (name === 'x-content-type-options') security.content_type_options = true;
      if (name === 'access-control-allow-origin') security.access_control_allow_origin = true;
    }
  }
  return {count: rows.length, authorization, cookie, setCookie, security};
}

function queryCount(request, url) {
  const rows = boundedRecords(request.queryString, 'MPC_SCREEN_CONTEXT_HAR_QUERY_LIMIT',
    MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_query_parameters);
  return Math.max(rows.length, url.query_parameter_count);
}

function bodyPresent(container, declaredBytes) {
  if (!plainObject(container)) return declaredBytes !== null && declaredBytes > 0;
  return Object.hasOwn(container, 'text') || (Array.isArray(container.params) && container.params.length > 0) ||
    safeInteger(container.size) > 0 || (declaredBytes !== null && declaredBytes > 0);
}

function pageMap(log) {
  const pages = boundedRecords(log.pages, 'MPC_SCREEN_CONTEXT_HAR_PAGES_INVALID', 512);
  const result = new Map();
  pages.forEach((page, index) => {
    if (typeof page.id !== 'string' || !page.id || page.id.length > 2_048 || result.has(page.id)) {
      fail('MPC_SCREEN_CONTEXT_HAR_PAGE_ID_INVALID');
    }
    result.set(page.id, index + 1);
  });
  return result;
}

function sanitizeEntry(entry, pages) {
  if (!plainObject(entry) || !plainObject(entry.request) || !plainObject(entry.response)) {
    fail('MPC_SCREEN_CONTEXT_HAR_ENTRY_INVALID');
  }
  const request = entry.request;
  const response = entry.response;
  const requestUrl = safeUrl(request.url);
  const requestHeaders = headerFacts(request.headers, 'request');
  const responseHeaders = headerFacts(response.headers, 'response');
  const requestCookies = boundedRecords(request.cookies, 'MPC_SCREEN_CONTEXT_HAR_COOKIE_LIMIT',
    MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_cookies_per_message);
  const responseCookies = boundedRecords(response.cookies, 'MPC_SCREEN_CONTEXT_HAR_COOKIE_LIMIT',
    MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_cookies_per_message);
  const requestBodyBytes = safeInteger(request.bodySize);
  const responseBodyBytes = safeInteger(response.bodySize);
  const content = plainObject(response.content) ? response.content : null;
  const contentBytes = safeInteger(content?.size);
  const redirect = typeof response.redirectURL === 'string' && response.redirectURL
    ? safeUrl(response.redirectURL) : null;
  const timings = plainObject(entry.timings) ? entry.timings : {};
  const pageIndex = typeof entry.pageref === 'string' ? pages.get(entry.pageref) ?? null : null;
  return {
    page_index: pageIndex,
    started_at_utc: strictTimestamp(entry.startedDateTime),
    duration_ms: safeMilliseconds(entry.time),
    request: {
      method: normalizeMethod(request.method),
      url: {...requestUrl, query_parameter_count: queryCount(request, requestUrl),
        query_values_omitted: queryCount(request, requestUrl) > 0},
      header_count: requestHeaders.count,
      authorization_header_present: requestHeaders.authorization,
      cookie_header_present: requestHeaders.cookie,
      cookie_record_count: requestCookies.length,
      body_present: bodyPresent(request.postData, requestBodyBytes),
      body_bytes: requestBodyBytes,
      content_type: normalizeMime(request.postData?.mimeType)
    },
    response: {
      status: safeStatus(response.status),
      content_type: normalizeMime(content?.mimeType),
      header_count: responseHeaders.count,
      set_cookie_header_count: responseHeaders.setCookie,
      cookie_record_count: responseCookies.length,
      body_present: bodyPresent(content, responseBodyBytes),
      body_bytes: responseBodyBytes,
      content_bytes: contentBytes,
      redirect_url: redirect,
      security_header_presence: responseHeaders.security
    },
    sizes: {
      request_headers_bytes: safeInteger(request.headersSize),
      request_body_bytes: requestBodyBytes,
      response_headers_bytes: safeInteger(response.headersSize),
      response_body_bytes: responseBodyBytes,
      response_content_bytes: contentBytes
    },
    timings_ms: Object.fromEntries(TIMING_FIELDS.map(field => [field, safeMilliseconds(timings[field])]))
  };
}

function displayNumber(value, suffix = '') {
  return value === null ? 'unknown' : `${value}${suffix}`;
}

function safeCount(value, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function assertSanitizedUrl(url) {
  if (!plainObject(url) || (!SAFE_SCHEMES.has(url.scheme) && url.scheme !== 'other') ||
      !safeCount(url.query_parameter_count, MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_query_parameters) ||
      url.query_values_omitted !== (url.query_parameter_count > 0)) {
    fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
  }
  if (url.host_kind === 'OPAQUE') {
    if (url.origin !== null || url.path_template !== ':opaque' || url.path_segment_count !== null ||
        url.path_segments_omitted !== 0 || url.trailing_slash !== false || url.port !== null ||
        url.host_identity_sha256 !== null) {
      fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
    }
    return;
  }
  const hostByKind = {
    IP_REDACTED: '<ip-address>',
    LOCALHOST: 'localhost',
    REDACTED: '<host-redacted>'
  };
  let host = hostByKind[url.host_kind];
  if (url.host_kind === 'DNS_PSEUDONYMIZED' &&
      typeof url.host_identity_sha256 === 'string' && /^[0-9a-f]{64}$/u.test(url.host_identity_sha256)) {
    host = `<dns-${url.host_identity_sha256.slice(0, 24)}>`;
  }
  if (!host || !NETWORK_SCHEMES.has(`${url.scheme}:`) ||
      !(url.port === null || (Number.isSafeInteger(url.port) && url.port >= 1 && url.port <= 65_535)) ||
      url.origin !== `${url.scheme}://${host}${url.port === null ? '' : `:${url.port}`}` ||
      !safeCount(url.path_segment_count, 32_768) ||
      url.path_segments_omitted !== Math.max(0,
        url.path_segment_count - MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_path_segments_in_summary) ||
      typeof url.trailing_slash !== 'boolean') {
    fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
  }
  if (url.host_kind !== 'DNS_PSEUDONYMIZED' && url.host_identity_sha256 !== null) {
    fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
  }
  const represented = Math.min(url.path_segment_count,
    MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_path_segments_in_summary);
  const expectedPath = url.path_segment_count === 0 ? '/' : `/${[
    ...Array.from({length: represented}, () => ':segment'),
    ...(url.path_segment_count > represented ? [':more'] : [])
  ].join('/')}`;
  if (url.path_template !== expectedPath) fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
}

function assertSanitizedEntry(entry) {
  if (!plainObject(entry) || !plainObject(entry.request) || !plainObject(entry.response) ||
      !plainObject(entry.sizes) || !plainObject(entry.timings_ms) ||
      !/^HAR-ENTRY-[0-9a-f]{24}-[0-9]{3}$/u.test(entry.entry_id) ||
      !safeCount(entry.sequence, MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_entries) || entry.sequence < 1 ||
      !(entry.page_index === null || (safeCount(entry.page_index, 512) && entry.page_index >= 1)) ||
      strictTimestamp(entry.started_at_utc) !== entry.started_at_utc ||
      !(entry.duration_ms === null || safeMilliseconds(entry.duration_ms) === entry.duration_ms) ||
      !(HTTP_METHODS.has(entry.request.method) || ['UNKNOWN', 'OTHER'].includes(entry.request.method)) ||
      !(entry.request.content_type === null || MIME_CLASSES.has(entry.request.content_type)) ||
      !(entry.response.status === null || safeStatus(entry.response.status) === entry.response.status) ||
      !(entry.response.content_type === null || MIME_CLASSES.has(entry.response.content_type)) ||
      !plainObject(entry.response.security_header_presence)) {
    fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
  }
  assertSanitizedUrl(entry.request.url);
  if (entry.response.redirect_url !== null) assertSanitizedUrl(entry.response.redirect_url);
  for (const [value, maximum] of [
    [entry.request.header_count, MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_headers_per_message],
    [entry.request.cookie_record_count, MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_cookies_per_message],
    [entry.response.header_count, MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_headers_per_message],
    [entry.response.cookie_record_count, MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_cookies_per_message],
    [entry.response.set_cookie_header_count, MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_headers_per_message]
  ]) {
    if (!safeCount(value, maximum)) fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
  }
  for (const value of [entry.request.authorization_header_present, entry.request.cookie_header_present,
    entry.request.body_present, entry.response.body_present]) {
    if (typeof value !== 'boolean') fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
  }
  for (const key of Object.keys(entry.response.security_header_presence)) {
    if (!['content_security_policy', 'strict_transport_security', 'frame_options', 'content_type_options',
      'access_control_allow_origin'].includes(key) || typeof entry.response.security_header_presence[key] !== 'boolean') {
      fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
    }
  }
  if (Object.keys(entry.response.security_header_presence).length !== 5) {
    fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
  }
  for (const key of TIMING_FIELDS) {
    const value = entry.timings_ms[key];
    if (!(value === null || safeMilliseconds(value) === value)) fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
  }
  if (Object.keys(entry.timings_ms).length !== TIMING_FIELDS.length) {
    fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
  }
  for (const key of ['request_headers_bytes', 'request_body_bytes', 'response_headers_bytes',
    'response_body_bytes', 'response_content_bytes']) {
    const value = entry.sizes[key];
    if (!(value === null || safeCount(value))) fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
  }
}

function buildBoundedScreenContextLog(context) {
  if (!plainObject(context) || context.schema_version !== MPC_WORKSPACE_SCREEN_CONTEXT_VERSION ||
      !Array.isArray(context.entries) || context.entries.length > MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_entries) {
    fail('MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED');
  }
  const prefix = [CONTEXT_STATEMENT,
    `Entries: ${context.entries.length}. Raw headers, cookies, query values and bodies are omitted.`];
  const entryLines = [];
  for (const entry of context.entries) {
    assertSanitizedEntry(entry);
    const url = entry.request.url;
    const locator = url.origin === null ? `${url.scheme}:${url.path_template}` : `${url.origin}${url.path_template}`;
    const query = url.query_parameter_count > 0 ? `; ${url.query_parameter_count} query value(s) omitted` : '';
    const security = Object.entries(entry.response.security_header_presence)
      .filter(([, present]) => present).map(([name]) => name.replaceAll('_', '-'));
    const sensitive = [entry.request.authorization_header_present ? 'authorization omitted' : null,
      entry.request.cookie_header_present || entry.request.cookie_record_count > 0 ? 'request cookies omitted' : null,
      entry.response.set_cookie_header_count > 0 || entry.response.cookie_record_count > 0 ? 'response cookies omitted' : null,
      entry.request.body_present ? 'request body omitted' : null,
      entry.response.body_present ? 'response body omitted' : null].filter(Boolean);
    entryLines.push(`${entry.entry_id} ${entry.started_at_utc} page ${entry.page_index ?? 'unknown'} ` +
      `${entry.request.method} ${locator}${query} -> ${displayNumber(entry.response.status)} ` +
      `${entry.response.content_type ?? 'unknown-type'}, ${displayNumber(entry.sizes.response_content_bytes, ' bytes')}, ` +
      `${displayNumber(entry.duration_ms, ' ms')} total, ${displayNumber(entry.timings_ms.wait, ' ms')} wait` +
      `${security.length ? `; security headers: ${security.join(', ')}` : '; no selected security header observed'}` +
      `${entry.response.redirect_url ? '; redirect metadata present' : ''}` +
      `${sensitive.length ? `; ${sensitive.join('; ')}` : ''}.`);
  }
  let included = entryLines.length;
  let text;
  do {
    const omitted = entryLines.length - included;
    const footer = omitted > 0
      ? [`Summary coverage: ${included} of ${entryLines.length} entries; ${omitted} omitted by the ` +
        `${MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_summary_bytes}-byte route bound.`]
      : [];
    text = `${[...prefix, ...entryLines.slice(0, included), ...footer].join('\n')}\n`;
    if (Buffer.byteLength(text, 'utf8') <= MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_summary_bytes) break;
    included--;
  } while (included >= 0);
  if (included < 0) fail('MPC_SCREEN_CONTEXT_SAFE_SUMMARY_LIMIT');
  return {text, included, omitted: entryLines.length - included};
}

export function buildScreenContextLog(context) {
  return buildBoundedScreenContextLog(context).text;
}

export function sanitizeFirefoxHar(input) {
  const bytes = inputBytes(input);
  const rawSha256 = sha256(bytes);
  const root = decodeJson(bytes);
  if (!plainObject(root) || !plainObject(root.log) || root.log.version !== '1.2') {
    fail('MPC_SCREEN_CONTEXT_FIREFOX_HAR_1_2_REQUIRED');
  }
  if (!Object.hasOwn(root.log, 'entries')) fail('MPC_SCREEN_CONTEXT_HAR_ENTRIES_REQUIRED');
  const rawEntries = boundedRecords(root.log.entries, 'MPC_SCREEN_CONTEXT_HAR_ENTRY_LIMIT',
    MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_entries);
  const pages = pageMap(root.log);
  const preparedEntries = rawEntries.map(entry => {
    const row = sanitizeEntry(entry, pages);
    return {row, digest: sha256(Buffer.from(JSON.stringify(row), 'utf8'))};
  }).sort((left, right) => left.row.started_at_utc.localeCompare(right.row.started_at_utc) ||
    left.digest.localeCompare(right.digest));
  const digestOccurrences = new Map();
  const entries = preparedEntries.map(({row, digest}, index) => {
    const occurrence = (digestOccurrences.get(digest) ?? 0) + 1;
    digestOccurrences.set(digest, occurrence);
    return {
      entry_id: `HAR-ENTRY-${digest.slice(0, 24)}-${String(occurrence).padStart(3, '0')}`,
      sequence: index + 1,
      ...row
    };
  });
  const unknownStatusCount = entries.filter(entry => entry.response.status === null).length;
  const missingTimingValueCount = entries.reduce((total, entry) => total +
    TIMING_FIELDS.filter(field => entry.timings_ms[field] === null).length, 0);
  const context = {
    schema_version: MPC_WORKSPACE_SCREEN_CONTEXT_VERSION,
    evidence_kind: 'IMPORTED_FIREFOX_HAR_APPLICATION_LAYER_CONTEXT',
    context_statement: CONTEXT_STATEMENT,
    active_packet_capture: false,
    causality_established: false,
    source_identity: {
      identity_type: 'SHA256_RAW_HAR_BYTES',
      raw_sha256: rawSha256,
      raw_bytes: bytes.byteLength,
      original_retained: false
    },
    coverage: {
      state: unknownStatusCount > 0 || missingTimingValueCount > 0
        ? 'COMPLETE_WITH_PRIVACY_OMISSIONS_AND_UNKNOWN_FIELDS'
        : 'COMPLETE_WITH_PRIVACY_OMISSIONS',
      entry_count: entries.length,
      entry_limit: MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_entries,
      unknown_status_count: unknownStatusCount,
      missing_timing_value_count: missingTimingValueCount,
      headers_values_retained: false,
      cookies_retained: false,
      query_values_retained: false,
      bodies_retained: false,
      ip_addresses_retained: false,
      titles_comments_retained: false
    },
    entries
  };
  const safeSummary = buildBoundedScreenContextLog(context);
  context.coverage.summary_entry_count = safeSummary.included;
  context.coverage.summary_entries_omitted = safeSummary.omitted;
  context.coverage.safe_summary_truncated = safeSummary.omitted > 0;
  context.coverage.safe_summary_bytes = Buffer.byteLength(safeSummary.text, 'utf8');
  return {
    ...context,
    safe_summary_text: safeSummary.text,
    safe_summary_sha256: sha256(Buffer.from(safeSummary.text, 'utf8'))
  };
}

// Keep the service-facing verb explicit while retaining the security-focused
// sanitizer name for direct callers and tests.
export const summarizeFirefoxHar = sanitizeFirefoxHar;
