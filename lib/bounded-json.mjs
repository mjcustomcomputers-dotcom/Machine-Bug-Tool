// Strict data parsing shared by acquisition and transport. These are format
// and resource checks; parsing does not authenticate a source or its meaning.
export const boundedJsonLimits = Object.freeze({maxBytes: 2_000_000, maxDepth: 32, maxTokens: 100_000});

/** Parse UTF-8 bytes (preferred for files), or a JavaScript string, without
 * accepting duplicate decoded object keys or nonfinite numeric projections.
 * Signature: parseBoundedJson(input, {maxBytes, maxDepth, maxTokens} = {}).
 */
export function parseBoundedJson(input, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
    Object.keys(options).some(key => !Object.hasOwn(boundedJsonLimits, key))) throw Error('INVALID_JSON_LIMITS');
  const limits = {...boundedJsonLimits, ...options};
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > boundedJsonLimits[key]) throw Error('INVALID_JSON_LIMIT:' + key);
  }
  let raw;
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > limits.maxBytes) throw Error('JSON_BYTE_LIMIT');
    raw = input;
  } else if (input instanceof Uint8Array) {
    if (input.byteLength > limits.maxBytes) throw Error('JSON_BYTE_LIMIT');
    raw = new TextDecoder('utf-8', {fatal: true}).decode(input);
  } else throw Error('JSON_UTF8_BYTES_OR_STRING_REQUIRED');

  // Iterate tokens instead of allocating a complete token array. A separate
  // key set belongs to each object; JSON-decoding keys catches escaped aliases.
  // JSON.parse below remains the final grammar check for the entire input.
  const stack = [], tokens = /"(?:\\.|[^"\\])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/gu;
  let expectKey = false, count = 0;
  for (const match of raw.matchAll(tokens)) {
    if (++count > limits.maxTokens) throw Error('JSON_TOKEN_LIMIT');
    const token = match[0];
    if (token === '{' || token === '[') {
      stack.push(token === '{' ? new Set() : null);
      if (stack.length > limits.maxDepth) throw Error('JSON_DEPTH_LIMIT');
      expectKey = token === '{';
    } else if (token === '}' || token === ']') { stack.pop(); expectKey = false; }
    else if (token === ',') expectKey = stack.at(-1) instanceof Set;
    else if (token === ':') expectKey = false;
    else if (expectKey && token.startsWith('"')) {
      const key = JSON.parse(token), keys = stack.at(-1);
      if (keys.has(key)) throw Error('DUPLICATE_JSON_KEY');
      keys.add(key); expectKey = false;
    }
  }
  const value = JSON.parse(raw), pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'number' && !Number.isFinite(item)) throw Error('NONFINITE_JSON_NUMBER');
    if (item && typeof item === 'object') for (const child of Object.values(item)) pending.push(child);
  }
  return value;
}
