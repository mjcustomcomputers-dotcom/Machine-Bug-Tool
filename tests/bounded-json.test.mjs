import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBoundedJson, boundedJsonLimits} from '../lib/bounded-json.mjs';

test('duplicate object keys, including decoded escape aliases in method arguments, are rejected', () => {
  const examples = [
    '{"method":"nash","method":"identity"}',
    '{"method":"nash","\\u006dethod":"identity"}',
    '{"arguments":{"value":1,"value":2}}',
    '{"arguments":[{"value":1,"\\u0076alue":2}]}',
    '{"é":1,"\\u00e9":2}',
    '{"\\\"":1,"\\u0022":2}',
  ];
  for (const raw of examples) {
    assert.throws(() => parseBoundedJson(raw), /DUPLICATE_JSON_KEY/);
    assert.throws(() => parseBoundedJson(Buffer.from(raw)), /DUPLICATE_JSON_KEY/);
  }
});

test('distinct object scopes, strings resembling JSON, and distinct Unicode keys retain their exact values', () => {
  const expected = {left: {key: 'value'}, right: {key: 'other'}, values: [{key: 1}, {key: 2}],
    text: '"key":1,"key":2, [{}] \\ "', é: 1, 'e\u0301': 2};
  const raw = JSON.stringify(expected), bytes = Buffer.from(raw), original = Buffer.from(bytes);
  assert.deepEqual(parseBoundedJson(raw), expected);
  assert.deepEqual(parseBoundedJson(new Uint8Array(bytes)), expected);
  assert.deepEqual(parseBoundedJson(bytes), expected);
  assert.deepEqual(bytes, original);
});

test('overflowing numeric projections are rejected anywhere in a JSON value', () => {
  for (const raw of ['1e999', '-1e999', '[0,1e999]', '{"nested":{"values":[-1e999]}}']) {
    assert.throws(() => parseBoundedJson(raw), /NONFINITE_JSON_NUMBER/);
  }
  assert.equal(parseBoundedJson('1e308'), 1e308);
  assert.deepEqual(parseBoundedJson('{"exponent":"1e999"}'), {exponent: '1e999'});
  for (const raw of ['NaN', 'Infinity', '[1,]', '{"a":1} trailing']) assert.throws(() => parseBoundedJson(raw));
});

test('depth and token budgets are enforced before pathological JSON can enter method selection', () => {
  assert.deepEqual(parseBoundedJson('{"a":[{}]}', {maxDepth: 3}), {a: [{}]});
  assert.throws(() => parseBoundedJson('{"a":[{}]}', {maxDepth: 2}), /JSON_DEPTH_LIMIT/);
  assert.throws(() => parseBoundedJson('['.repeat(33) + ']'.repeat(33)), /JSON_DEPTH_LIMIT/);
  assert.throws(() => parseBoundedJson('[1,2,3]', {maxTokens: 6}), /JSON_TOKEN_LIMIT/);
  assert.deepEqual(parseBoundedJson('[1,2,3]', {maxTokens: 7}), [1, 2, 3]);
});

test('the byte budget counts UTF-8 bytes and invalid UTF-8 is rejected rather than replaced', () => {
  const raw = '{"value":"🌐"}', bytes = Buffer.from(raw), count = bytes.byteLength;
  assert.deepEqual(parseBoundedJson(bytes, {maxBytes: count}), {value: '🌐'});
  for (const input of [bytes, raw]) assert.throws(() => parseBoundedJson(input, {maxBytes: count - 1}), /JSON_BYTE_LIMIT/);
  assert.throws(() => parseBoundedJson(Buffer.from([123, 34, 120, 34, 58, 34, 0xff, 34, 125])), /encoded data|encoding|UTF-8/i);
});

test('only bounded data-parser options and bytes or text are accepted', () => {
  for (const input of [null, {}, 1, [], new ArrayBuffer(5)]) assert.throws(() => parseBoundedJson(input), /JSON_UTF8_BYTES_OR_STRING_REQUIRED/);
  for (const options of [null, [], {extra: 1}, {maxDepth: 0}, {maxTokens: Infinity}, {maxBytes: boundedJsonLimits.maxBytes + 1}]) {
    assert.throws(() => parseBoundedJson('{}', options), /INVALID_JSON_LIMIT/);
  }
  assert.equal(parseBoundedJson('null'), null);
  assert.equal(parseBoundedJson('true'), true);
  assert.equal(parseBoundedJson('"source text"'), 'source text');
});
