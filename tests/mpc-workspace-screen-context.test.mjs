import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  buildScreenContextLog,
  MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS,
  MPC_WORKSPACE_SCREEN_CONTEXT_VERSION,
  sanitizeFirefoxHar,
  summarizeFirefoxHar
} from '../lib/mpc-workspace-screen-context.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const dnsIdentity = hostname => hash(Buffer.from(hostname)).slice(0, 24);

function harEntry({secret = 'A'.repeat(32), startedDateTime = '2026-10-10T12:00:00.000Z',
  url = `https://user-${secret}:pass-${secret}@example.test/account/${secret}/view?token=${secret}#${secret}`} = {}) {
  return {
    pageref: 'page-secret-reference',
    startedDateTime,
    time: 42.125,
    request: {
      method: 'GET', url, httpVersion: 'HTTP/2', headersSize: 123, bodySize: 32,
      headers: [
        {name: 'Authorization', value: `Bearer ${secret}`},
        {name: 'Cookie', value: `session=${secret}`},
        {name: 'X-Api-Key', value: secret}
      ],
      cookies: [{name: 'private-cookie', value: secret}],
      queryString: [{name: 'token', value: secret}],
      postData: {mimeType: 'application/json; charset=utf-8', text: `{"secret":"${secret}"}`}
    },
    response: {
      status: 200, statusText: `SECRET-${secret}`, httpVersion: 'HTTP/2', headersSize: 234, bodySize: 64,
      headers: [
        {name: 'Set-Cookie', value: `session=${secret}; Secure; HttpOnly`},
        {name: 'Content-Security-Policy', value: `report-uri https://example.test/${secret}`},
        {name: 'X-Frame-Options', value: secret}
      ],
      cookies: [{name: 'response-private-cookie', value: secret}],
      content: {size: 64, mimeType: 'text/html; charset=utf-8', text: `<p>${secret}</p>`},
      redirectURL: `https://example.test/next/${secret}?ticket=${secret}#${secret}`
    },
    cache: {comment: secret},
    timings: {blocked: 1, dns: 2, connect: 3, ssl: 2.5, send: 1, wait: 30, receive: 5.625},
    serverIPAddress: `192.0.2.${secret === 'A'.repeat(32) ? '1' : '2'}`,
    connection: secret,
    comment: secret
  };
}

function fixture(options = {}) {
  const secret = options.secret ?? 'A'.repeat(32);
  return {
    log: {
      version: '1.2',
      creator: {name: `Firefox-${secret}`, version: secret, comment: secret},
      browser: {name: secret, version: secret},
      pages: [{id: 'page-secret-reference', title: `Private page ${secret}`,
        startedDateTime: '2026-10-10T12:00:00.000Z', comment: secret}],
      entries: options.entries ?? [harEntry({...options, secret})],
      comment: secret
    }
  };
}

test('Firefox HAR sanitization strips secret-bearing fields before producing safe application context', () => {
  const secret = 'SECRET-CANARY-1234567890-ABCDEF';
  const raw = JSON.stringify(fixture({secret}));
  const result = sanitizeFirefoxHar(raw);
  const serialized = JSON.stringify(result);

  assert.equal(result.schema_version, MPC_WORKSPACE_SCREEN_CONTEXT_VERSION);
  assert.equal(result.evidence_kind, 'IMPORTED_FIREFOX_HAR_APPLICATION_LAYER_CONTEXT');
  assert.equal(result.active_packet_capture, false);
  assert.equal(result.causality_established, false);
  assert.match(result.context_statement, /application-layer context/u);
  assert.match(result.context_statement, /causality/u);
  assert.equal(result.source_identity.raw_sha256, hash(Buffer.from(raw)));
  assert.equal(result.source_identity.raw_bytes, Buffer.byteLength(raw));
  assert.equal(result.source_identity.original_retained, false);
  assert.doesNotMatch(serialized, new RegExp(secret, 'u'));
  assert.doesNotMatch(serialized, /192\.0\.2\./u);
  assert.doesNotMatch(serialized, /page-secret-reference|Private page|Firefox-/u);

  const entry = result.entries[0];
  assert.equal(entry.request.url.origin, `https://<dns-${dnsIdentity('example.test')}>`);
  assert.equal(entry.request.url.host_kind, 'DNS_PSEUDONYMIZED');
  assert.equal(entry.request.url.path_template, '/:segment/:segment/:segment');
  assert.equal(entry.request.url.query_parameter_count, 1);
  assert.equal(entry.request.authorization_header_present, true);
  assert.equal(entry.request.cookie_header_present, true);
  assert.equal(entry.request.cookie_record_count, 1);
  assert.equal(entry.request.body_present, true);
  assert.equal(entry.request.content_type, 'application/json');
  assert.equal(entry.response.status, 200);
  assert.equal(entry.response.content_type, 'text/html');
  assert.equal(entry.response.set_cookie_header_count, 1);
  assert.equal(entry.response.cookie_record_count, 1);
  assert.equal(entry.response.security_header_presence.content_security_policy, true);
  assert.equal(entry.response.security_header_presence.frame_options, true);
  assert.equal(entry.response.redirect_url.path_template, '/:segment/:segment');
  assert.equal(entry.response.redirect_url.query_parameter_count, 1);
  assert.equal(entry.timings_ms.wait, 30);
  assert.equal(entry.sizes.response_content_bytes, 64);
  assert.equal(buildScreenContextLog(result), result.safe_summary_text);
  assert.equal(result.safe_summary_sha256, hash(Buffer.from(result.safe_summary_text)));
});

test('changing only equal-length secrets changes raw identity but not sanitized entries or summary', () => {
  const first = sanitizeFirefoxHar(JSON.stringify(fixture({secret: 'A'.repeat(32)})));
  const second = sanitizeFirefoxHar(JSON.stringify(fixture({secret: 'B'.repeat(32)})));

  assert.notEqual(first.source_identity.raw_sha256, second.source_identity.raw_sha256);
  assert.equal(first.source_identity.raw_bytes, second.source_identity.raw_bytes);
  assert.deepEqual(first.entries, second.entries);
  assert.equal(first.safe_summary_text, second.safe_summary_text);
  assert.equal(first.safe_summary_sha256, second.safe_summary_sha256);
});

test('malformed, unsafe and over-bound HAR input fails closed', () => {
  assert.throws(() => sanitizeFirefoxHar(null), {code: 'MPC_SCREEN_CONTEXT_HAR_BYTES_OR_STRING_REQUIRED'});
  assert.throws(() => sanitizeFirefoxHar('{'), {code: 'MPC_SCREEN_CONTEXT_HAR_JSON_INVALID'});
  assert.throws(() => sanitizeFirefoxHar('{"log":{"version":"1.2","version":"1.2","entries":[]}}'),
    {code: 'MPC_SCREEN_CONTEXT_HAR_DUPLICATE_KEY'});
  assert.throws(() => sanitizeFirefoxHar(Buffer.from([0xff])), {code: 'MPC_SCREEN_CONTEXT_HAR_UTF8_INVALID'});
  assert.throws(() => sanitizeFirefoxHar(JSON.stringify({log: {version: '1.1', entries: []}})),
    {code: 'MPC_SCREEN_CONTEXT_FIREFOX_HAR_1_2_REQUIRED'});
  assert.throws(() => sanitizeFirefoxHar(JSON.stringify({log: {version: '1.2', entries: {}}})),
    {code: 'MPC_SCREEN_CONTEXT_HAR_ENTRY_LIMIT'});
  assert.throws(() => sanitizeFirefoxHar(JSON.stringify({log: {version: '1.2'}})),
    {code: 'MPC_SCREEN_CONTEXT_HAR_ENTRIES_REQUIRED'});
  assert.throws(() => sanitizeFirefoxHar(JSON.stringify({log: {version: '1.2', entries:
    Array.from({length: MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_entries + 1}, () => ({}))}})),
  {code: 'MPC_SCREEN_CONTEXT_HAR_ENTRY_LIMIT'});
  assert.throws(() => sanitizeFirefoxHar(Buffer.alloc(MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_bytes + 1, 0x20)),
    {code: 'MPC_SCREEN_CONTEXT_HAR_BYTE_LIMIT'});
  assert.throws(() => sanitizeFirefoxHar('{"log":{"version":"1.2","entries":[],"__proto__":{}}}'),
    {code: 'MPC_SCREEN_CONTEXT_HAR_UNSAFE_KEY'});
  assert.throws(() => buildScreenContextLog({entries: []}),
    {code: 'MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED'});
  assert.throws(() => sanitizeFirefoxHar(JSON.stringify(fixture({entries: [
    harEntry({startedDateTime: '2026-10-10T12:00:00'})
  ]}))), {code: 'MPC_SCREEN_CONTEXT_HAR_TIMESTAMP_INVALID'});
  assert.throws(() => sanitizeFirefoxHar(JSON.stringify(fixture({entries: [
    harEntry({startedDateTime: '2026-02-30T12:00:00Z'})
  ]}))), {code: 'MPC_SCREEN_CONTEXT_HAR_TIMESTAMP_INVALID'});
  assert.throws(() => sanitizeFirefoxHar(JSON.stringify(fixture({entries: [
    harEntry({startedDateTime: '2026-10-10T24:00:00Z'})
  ]}))), {code: 'MPC_SCREEN_CONTEXT_HAR_TIMESTAMP_INVALID'});
});

test('safe status, MIME, size and timing metadata remain deterministic while IP and opaque URLs stay redacted', () => {
  const source = fixture({entries: [
    harEntry({url: 'https://192.0.2.77/private/value?one=secret&two=secret'}),
    harEntry({startedDateTime: '2026-10-10T12:00:01.000Z', url: 'data:text/plain,PRIVATE-BODY'})
  ]});
  const copy = structuredClone(source);
  const result = sanitizeFirefoxHar(Buffer.from(JSON.stringify(source)));

  assert.deepEqual(source, copy, 'the sanitizer must not mutate caller data');
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.entries[0].request.url, {
    scheme: 'https', origin: 'https://<ip-address>', host_kind: 'IP_REDACTED',
    host_identity_sha256: null, port: null, path_template: '/:segment/:segment',
    path_segment_count: 2, path_segments_omitted: 0, trailing_slash: false,
    query_parameter_count: 2, query_values_omitted: true
  });
  assert.deepEqual(result.entries[1].request.url, {
    scheme: 'data', origin: null, host_kind: 'OPAQUE', path_template: ':opaque',
    path_segment_count: null, path_segments_omitted: 0, trailing_slash: false, port: null,
    host_identity_sha256: null, query_parameter_count: 1, query_values_omitted: true
  });
  assert.equal(result.entries[0].started_at_utc, '2026-10-10T12:00:00.000Z');
  assert.equal(result.entries[0].duration_ms, 42.125);
  assert.deepEqual(result.entries[0].timings_ms,
    {blocked: 1, dns: 2, connect: 3, ssl: 2.5, send: 1, wait: 30, receive: 5.625});
  assert.doesNotMatch(result.safe_summary_text, /192\.0\.2\.77|PRIVATE-BODY|secret/u);
  assert.match(result.safe_summary_text, /not active packet capture|does not establish causality/u);
  assert.match(result.safe_summary_text, /2026-10-10T12:00:00\.000Z page 1/u);
  assert.deepEqual(summarizeFirefoxHar(JSON.stringify(source)), sanitizeFirefoxHar(JSON.stringify(source)));
});

test('status zero is unknown and arbitrary DNS and MIME canaries do not enter the safe representation', () => {
  const canary = 'host-and-mime-secret-canary';
  const entry = harEntry({url: `https://${canary}.example.test/a?token=private`});
  entry.response.status = 0;
  entry.response.content.mimeType = `text/${canary}`;
  const result = sanitizeFirefoxHar(JSON.stringify(fixture({entries: [entry]})));
  const serialized = JSON.stringify(result);

  assert.equal(result.entries[0].response.status, null);
  assert.equal(result.entries[0].response.content_type, 'text/other');
  assert.equal(result.entries[0].request.url.host_kind, 'DNS_PSEUDONYMIZED');
  assert.equal(result.coverage.unknown_status_count, 1);
  assert.match(result.safe_summary_text, /-> unknown text\/other/u);
  assert.doesNotMatch(serialized, new RegExp(canary, 'u'));
});

test('distinct DNS origins remain deterministically distinguishable without retaining raw host labels', () => {
  const first = sanitizeFirefoxHar(JSON.stringify(fixture({entries: [harEntry({url: 'https://one.example/a'})]})));
  const repeated = sanitizeFirefoxHar(JSON.stringify(fixture({entries: [harEntry({url: 'https://one.example/b'})]})));
  const second = sanitizeFirefoxHar(JSON.stringify(fixture({entries: [harEntry({url: 'https://two.example/a'})]})));

  assert.equal(first.entries[0].request.url.origin, repeated.entries[0].request.url.origin);
  assert.notEqual(first.entries[0].request.url.origin, second.entries[0].request.url.origin);
  assert.doesNotMatch(JSON.stringify([first, repeated, second]), /one\.example|two\.example/u);
});

test('entry order does not change canonical sanitized entries or safe summary', () => {
  const early = harEntry({startedDateTime: '2026-10-10T12:00:00.000Z', url: 'https://one.example/a'});
  const late = harEntry({startedDateTime: '2026-10-10T12:00:01.000Z', url: 'https://two.example/b'});
  const forward = sanitizeFirefoxHar(JSON.stringify(fixture({entries: [early, late]})));
  const reversed = sanitizeFirefoxHar(JSON.stringify(fixture({entries: [late, early]})));

  assert.notEqual(forward.source_identity.raw_sha256, reversed.source_identity.raw_sha256);
  assert.deepEqual(forward.entries, reversed.entries);
  assert.equal(forward.safe_summary_text, reversed.safe_summary_text);
});

test('safe summary is route-bounded for the maximum accepted entry count', () => {
  const entries = Array.from({length: MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_entries}, (_, index) =>
    harEntry({
      startedDateTime: new Date(Date.UTC(2026, 9, 10, 12, 0, 0, index)).toISOString(),
      url: `https://bounded.example/${Array.from({length: 24}, () => 'private').join('/')}`
    }));
  const result = sanitizeFirefoxHar(JSON.stringify(fixture({entries})));
  const summaryBytes = Buffer.byteLength(result.safe_summary_text, 'utf8');

  assert.equal(result.entries.length, MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_entries);
  assert.ok(summaryBytes <= MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_summary_bytes);
  assert.equal(result.coverage.safe_summary_bytes, summaryBytes);
  assert.equal(result.coverage.summary_entry_count + result.coverage.summary_entries_omitted,
    MPC_WORKSPACE_SCREEN_CONTEXT_LIMITS.max_entries);
  assert.equal(result.coverage.safe_summary_truncated, result.coverage.summary_entries_omitted > 0);
});

test('summary builder rejects a forged current-schema entry before interpolation', () => {
  const result = sanitizeFirefoxHar(JSON.stringify(fixture()));
  const forged = structuredClone(result);
  forged.entries[0].entry_id = 'HAR-ENTRY-safe\nSECRET-FORGED-LINE';

  assert.throws(() => buildScreenContextLog(forged),
    {code: 'MPC_SCREEN_CONTEXT_SANITIZED_CONTEXT_REQUIRED'});
});
