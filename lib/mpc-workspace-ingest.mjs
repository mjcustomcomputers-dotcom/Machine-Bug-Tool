import {createHash, randomUUID} from 'node:crypto';
import {open, opendir, lstat, realpath} from 'node:fs/promises';
import path from 'node:path';

import {parseBoundedJson} from './bounded-json.mjs';

export const MPC_WORKSPACE_INGEST_VERSION = 'MPC_WORKSPACE_INGEST_1';
export const MPC_WORKSPACE_INGEST_LIMITS = Object.freeze({
  input_bytes: 2_000_000,
  // Snapshot persistence has the same hard ceiling. Keeping the scanner and
  // store limits identical prevents a successful index from failing only
  // after thousands of durable source rows have already been written.
  folder_entries: 10_000,
  folder_depth: 64,
  relative_locator_bytes: 8_192
});

const DEFAULT_EXCLUSIONS = Object.freeze([
  '.git', '.sites-runtime', '.wrangler', 'node_modules', 'dist'
]);
const FORMATS = new Set(['AUTO', 'TEXT', 'JSON', 'CSV', 'TSV', 'MARKDOWN', 'CODE', 'BINARY', 'IMAGE']);
const textEncoder = new TextEncoder();
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = code => { const error = new TypeError(code); error.code = code; throw error; };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const iso = value => {
  const result = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}T.*Z$/u.test(result) || !Number.isFinite(Date.parse(result))) fail('VALID_UTC_TIMESTAMP_REQUIRED');
  return result;
};
const requiredText = (value, code, limit = 2_000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) fail(code);
  return value;
};
const generatedId = (prefix, idFactory) => {
  const value = `${prefix}-${idFactory()}`;
  if (value.length > 200) fail('GENERATED_ID_TOO_LONG');
  return value;
};

function parseDelimitedProfile(text, delimiter) {
  let rows = 0, columns = 0, currentColumns = 1, quoted = false, afterQuote = false, cellStart = true;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { index++; continue; }
      if (character === '"') { quoted = false; afterQuote = true; cellStart = false; }
      continue;
    }
    if (afterQuote && character !== delimiter && character !== '\r' && character !== '\n') fail('DELIMITED_CHARACTER_AFTER_QUOTE');
    if (character === '"') {
      if (!cellStart) fail('DELIMITED_QUOTE_INSIDE_CELL');
      quoted = true; afterQuote = false; continue;
    }
    if (character === delimiter) { currentColumns++; cellStart = true; afterQuote = false; continue; }
    if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      if (columns && columns !== currentColumns) fail('DELIMITED_COLUMN_COUNT_MISMATCH');
      columns = currentColumns; rows++; currentColumns = 1; cellStart = true; afterQuote = false; continue;
    }
    cellStart = false;
  }
  if (quoted) fail('DELIMITED_UNCLOSED_QUOTE');
  if (text.length && !/[\r\n]$/u.test(text)) {
    if (columns && columns !== currentColumns) fail('DELIMITED_COLUMN_COUNT_MISMATCH');
    columns = currentColumns; rows++;
  }
  return {row_count: rows, column_count: columns, header_inferred: false};
}
function detectedFormat(name, text, hint) {
  if (!FORMATS.has(hint)) fail('UNSUPPORTED_FORMAT_HINT');
  if (hint !== 'AUTO') return hint;
  const extension = path.extname(name ?? '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(extension)) return 'IMAGE';
  if (extension === '.json') return 'JSON';
  if (extension === '.csv') return 'CSV';
  if (extension === '.tsv') return 'TSV';
  if (['.md', '.markdown'].includes(extension)) return 'MARKDOWN';
  if (['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.ps1', '.sh', '.sql'].includes(extension)) return 'CODE';
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'JSON';
  if (/[,\t].*(?:\r\n|\r|\n)/u.test(text)) return text.includes('\t') ? 'TSV' : 'CSV';
  return 'TEXT';
}
function inspectRepresentation(text, format) {
  try {
    if (format === 'JSON') {
      const parsed = parseBoundedJson(text);
      return {status: 'PARSED', format, root_type: Array.isArray(parsed) ? 'ARRAY' : parsed === null ? 'NULL' : typeof parsed === 'object' ? 'OBJECT' : String(typeof parsed).toUpperCase()};
    }
    if (format === 'CSV' || format === 'TSV') return {status: 'PARSED', format, ...parseDelimitedProfile(text, format === 'TSV' ? '\t' : ',')};
    if (format === 'BINARY' || format === 'IMAGE') return {status: 'DERIVED_REPRESENTATION_REQUIRED', format};
    return {status: 'AVAILABLE', format, line_count: text ? text.split(/\r\n|\r|\n/u).length : 0};
  } catch (error) {
    return {status: 'INVALID_RETAINED', format, error_code: String(error?.code ?? error?.message ?? 'PARSE_FAILED').slice(0, 200)};
  }
}

function acquisitionFromBytes({project_id, name, locator, bytes, text, format_hint = 'AUTO', retain_raw = false,
  retention_authorization_ref = null, source_id, observed_at_utc, kind, idFactory}) {
  requiredText(project_id, 'PROJECT_ID_REQUIRED', 200);
  requiredText(name, 'INPUT_NAME_REQUIRED', 1_000);
  requiredText(locator, 'INPUT_LOCATOR_REQUIRED', 2_000);
  if (bytes.byteLength > MPC_WORKSPACE_INGEST_LIMITS.input_bytes) fail('INPUT_BYTE_LIMIT');
  if (typeof retain_raw !== 'boolean') fail('RETENTION_CHOICE_REQUIRED');
  if (retain_raw) requiredText(retention_authorization_ref, 'RETENTION_AUTHORIZATION_REQUIRED', 400);
  const at = iso(observed_at_utc ?? new Date());
  const digest = sha256(bytes);
  const id = source_id ?? generatedId('SRC', idFactory);
  requiredText(id, 'SOURCE_ID_REQUIRED', 200);
  const format = detectedFormat(name, text ?? '', format_hint);
  const parse = inspectRepresentation(text ?? '', format);
  const version = `sha256:${digest}`;
  const routeReady = text !== null && text.length <= 200_000 && Buffer.byteLength(text, 'utf8') <= 200_000;
  const source = {
    id,
    owner: 'LOCAL_WORKSPACE',
    type: kind,
    version,
    time: at,
    native_locator: locator
  };
  return {
    schema_version: MPC_WORKSPACE_INGEST_VERSION,
    acquisition_id: generatedId('ACQ', idFactory),
    project_id,
    kind,
    name,
    detected_format: format,
    byte_length: bytes.byteLength,
    content_sha256: digest,
    source,
    workflow_record: routeReady ? {source_ref: id, version, content: text} : null,
    parse,
    coverage: {
      original_bytes: bytes.byteLength,
      original_utf16_characters: text === null ? null : text.length,
      router_content_ready: routeReady,
      state: text === null ? 'BINARY_DERIVATION_REQUIRED' : routeReady ? 'FULL_INPUT' : 'CHUNK_SELECTION_REQUIRED',
      silent_truncation: false
    },
    retention: {
      policy: retain_raw ? 'RETAIN_RAW' : 'DIGEST_ONLY_AFTER_SESSION',
      raw_content_persistable: retain_raw,
      retention_authorization_ref: retain_raw ? retention_authorization_ref : null
    },
    original_bytes: Buffer.from(bytes),
    source_authentication: false,
    executed: false
  };
}

/** Acquire user-supplied text without normalizing line endings or malformed data. */
export function ingestText({project_id, text, name = 'Pasted text', format_hint = 'AUTO', retain_raw = false,
  retention_authorization_ref = null, source_id, observed_at_utc} = {}, {id = randomUUID} = {}) {
  if (typeof text !== 'string') fail('TEXT_INPUT_REQUIRED');
  const bytes = Buffer.from(text, 'utf8');
  return acquisitionFromBytes({project_id, name, locator: 'workspace-paste://user-action', bytes, text, format_hint,
    retain_raw, retention_authorization_ref, source_id, observed_at_utc, kind: 'PASTED_TEXT', idFactory: id});
}

/**
 * Produce bounded, independently identified derived text representations for
 * router/model use. Coverage is explicit; omitted tail content stays unknown.
 */
export function chunkTextAcquisition(acquisition, {max_chunk_bytes = 180_000, max_chunks = 3} = {}, {id = randomUUID} = {}) {
  if (!plainObject(acquisition) || acquisition.schema_version !== MPC_WORKSPACE_INGEST_VERSION || !Buffer.isBuffer(acquisition.original_bytes)) fail('TEXT_ACQUISITION_REQUIRED');
  if (acquisition.kind === 'LOCAL_BINARY_FILE') fail('TEXT_ACQUISITION_REQUIRED');
  if (!Number.isSafeInteger(max_chunk_bytes) || max_chunk_bytes < 1_000 || max_chunk_bytes > 200_000 ||
      !Number.isSafeInteger(max_chunks) || max_chunks < 1 || max_chunks > 32) fail('INVALID_CHUNK_LIMIT');
  let text;
  try { text = new TextDecoder('utf-8', {fatal: true}).decode(acquisition.original_bytes); }
  catch { fail('TEXT_ACQUISITION_REQUIRED'); }
  const chunks = [];
  let current = '', currentBytes = 0, offset = 0, start = 0;
  const flush = () => {
    if (!current || chunks.length >= max_chunks) return;
    const bytes = Buffer.from(current, 'utf8'), chunkNumber = chunks.length + 1;
    const chunk = acquisitionFromBytes({
      project_id: acquisition.project_id,
      name: `${acquisition.name} — chunk ${chunkNumber}`,
      locator: `${acquisition.source.native_locator}#utf16=${start}-${offset}`,
      bytes,
      text: current,
      format_hint: acquisition.detected_format === 'JSON' ? 'TEXT' : acquisition.detected_format,
      retain_raw: acquisition.retention.raw_content_persistable,
      retention_authorization_ref: acquisition.retention.retention_authorization_ref,
      source_id: generatedId('SRC-CHUNK', id),
      observed_at_utc: acquisition.source.time,
      kind: 'DERIVED_TEXT_CHUNK',
      idFactory: id
    });
    chunk.derived_from = {source_id: acquisition.source.id, version: acquisition.source.version,
      content_sha256: acquisition.content_sha256, offset_unit: 'UTF16_CODE_UNITS', start, end: offset};
    chunks.push(chunk); current = ''; currentBytes = 0; start = offset;
  };
  for (const character of text) {
    const size = Buffer.byteLength(character, 'utf8');
    if (current && currentBytes + size > max_chunk_bytes) {
      flush();
      if (chunks.length >= max_chunks) break;
    }
    current += character; currentBytes += size; offset += character.length;
  }
  if (chunks.length < max_chunks) flush();
  return {
    source_id: acquisition.source.id,
    source_version: acquisition.source.version,
    chunks,
    coverage: {offset_unit: 'UTF16_CODE_UNITS', covered: offset, total: text.length,
      complete: offset === text.length, omitted: text.length - offset, silent_truncation: false}
  };
}

async function readBoundedRegularFile(filePath, maximumBytes) {
  const handle = await open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maximumBytes) fail(stat.size > maximumBytes ? 'INPUT_BYTE_LIMIT' : 'REGULAR_FILE_REQUIRED');
    const bytes = Buffer.alloc(Number(stat.size));
    let offset = 0;
    while (offset < bytes.length) {
      const {bytesRead} = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== bytes.length) fail('FILE_CHANGED_DURING_READ');
    const after = await handle.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) fail('FILE_CHANGED_DURING_READ');
    return {bytes, stat};
  } finally {
    await handle.close();
  }
}

/** Acquire one explicit file. Files are read as data and are never executed. */
export async function ingestFile({project_id, file_path, name, format_hint = 'AUTO', retain_raw = false,
  retention_authorization_ref = null, source_id, observed_at_utc, maximum_bytes = MPC_WORKSPACE_INGEST_LIMITS.input_bytes} = {},
{id = randomUUID, readFile = readBoundedRegularFile, resolveRealPath = realpath, statPath = lstat} = {}) {
  requiredText(file_path, 'FILE_PATH_REQUIRED', 32_768);
  if (!Number.isSafeInteger(maximum_bytes) || maximum_bytes < 1 || maximum_bytes > MPC_WORKSPACE_INGEST_LIMITS.input_bytes) fail('INVALID_FILE_BYTE_LIMIT');
  const symbolic = await statPath(file_path);
  if (symbolic.isSymbolicLink()) fail('SYMLINK_FILE_REQUIRES_SEPARATE_SELECTION');
  const canonical = await resolveRealPath(file_path);
  const {bytes} = await readFile(canonical, maximum_bytes);
  let decoded = null;
  try {
    decoded = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    if (decoded.includes('\u0000')) decoded = null;
  } catch { decoded = null; }
  const guessed = decoded === null && format_hint === 'AUTO' ? (detectedFormat(name ?? path.basename(canonical), '', 'AUTO') === 'IMAGE' ? 'IMAGE' : 'BINARY') : format_hint;
  return acquisitionFromBytes({project_id, name: name ?? path.basename(canonical), locator: canonical, bytes, text: decoded,
    format_hint: guessed, retain_raw, retention_authorization_ref, source_id, observed_at_utc,
    kind: decoded === null ? 'LOCAL_BINARY_FILE' : 'LOCAL_TEXT_FILE', idFactory: id});
}

function globExpression(pattern, insensitive) {
  if (typeof pattern !== 'string' || !pattern.trim() || pattern.length > 500 || pattern.includes('\u0000')) fail('INVALID_EXCLUSION_PATTERN');
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replaceAll('**', '\u0000').replaceAll('*', '[^/]*').replaceAll('?', '[^/]').replaceAll('\u0000', '.*');
  return new RegExp(`(?:^|/)${escaped}(?:$|/)`, insensitive ? 'iu' : 'u');
}

function relativeLocator(value) {
  const result = value.split(path.sep).join('/');
  if (!result || result.startsWith('/') || result.includes('\u0000') || result.split('/').some(part => !part || part === '.' || part === '..') ||
      textEncoder.encode(result).byteLength > MPC_WORKSPACE_INGEST_LIMITS.relative_locator_bytes) fail('INVALID_RELATIVE_LOCATOR');
  return result;
}

/**
 * Index an explicitly selected folder in place. The scanner records metadata,
 * does not follow symlinks/junctions, does not execute files and does not copy
 * or delete the source. Per-entry errors remain visible and make coverage partial.
 */
export async function indexAttachedFolder({project_id, root_path, mount_id, host_id = 'LOCAL_HOST', source_kind = 'LOCAL_FOLDER',
  include_subfolders = true, exclusions = DEFAULT_EXCLUSIONS, max_entries = 10_000, max_depth = MPC_WORKSPACE_INGEST_LIMITS.folder_depth,
  observed_at_utc} = {}, {openDirectory = opendir, statPath = lstat, resolveRealPath = realpath, id = randomUUID} = {}) {
  requiredText(project_id, 'PROJECT_ID_REQUIRED', 200);
  requiredText(root_path, 'FOLDER_PATH_REQUIRED', 32_768);
  requiredText(host_id, 'HOST_ID_REQUIRED', 200);
  if (!['LOCAL_FOLDER', 'SYNCED_FOLDER', 'REMOVABLE', 'NETWORK_SHARE'].includes(source_kind)) fail('INVALID_FOLDER_SOURCE_KIND');
  if (typeof include_subfolders !== 'boolean') fail('INVALID_SUBFOLDER_CHOICE');
  if (!Array.isArray(exclusions) || exclusions.length > 128) fail('INVALID_EXCLUSIONS');
  if (!Number.isSafeInteger(max_entries) || max_entries < 1 || max_entries > MPC_WORKSPACE_INGEST_LIMITS.folder_entries) fail('INVALID_FOLDER_ENTRY_LIMIT');
  if (!Number.isSafeInteger(max_depth) || max_depth < 0 || max_depth > MPC_WORKSPACE_INGEST_LIMITS.folder_depth) fail('INVALID_FOLDER_DEPTH_LIMIT');
  const at = iso(observed_at_utc ?? new Date());
  const mount = mount_id ?? generatedId('MOUNT', id);
  requiredText(mount, 'MOUNT_ID_REQUIRED', 200);
  const insensitive = process.platform === 'win32';
  const patterns = exclusions.map(pattern => globExpression(pattern, insensitive));
  let root;
  try {
    const rootStat = await statPath(root_path);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) fail('REGULAR_FOLDER_REQUIRED');
    root = await resolveRealPath(root_path);
  } catch (error) {
    if (error?.code === 'REGULAR_FOLDER_REQUIRED') throw error;
    return {
      schema_version: MPC_WORKSPACE_INGEST_VERSION, project_id, mount_id: mount, host_id,
      root_locator: path.resolve(root_path), source_kind, attachment_mode: 'INDEX_IN_PLACE',
      connection_state: 'OFFLINE', index_state: 'ERROR', inventory_complete: false,
      observed_at_utc: at, entries: [], errors: [{relative_locator: null, code: String(error?.code ?? 'FOLDER_UNAVAILABLE')}],
      counts: {indexed: 0, pending: 0, changed: 0, unavailable: 1, unreadable: 0, excluded: 0},
      originals_modified: false
    };
  }

  const entries = [], errors = [], visited = new Set([insensitive ? root.toLowerCase() : root]);
  let excluded = 0, truncated = false;
  const pending = [{absolute: root, relative: '', depth: 0}];
  while (pending.length && !truncated) {
    const current = pending.shift();
    let directory;
    try { directory = await openDirectory(current.absolute); }
    catch (error) {
      errors.push({relative_locator: current.relative || null, code: String(error?.code ?? 'DIRECTORY_UNREADABLE')});
      continue;
    }
    try {
      for await (const entry of directory) {
        const relative = relativeLocator(current.relative ? `${current.relative}/${entry.name}` : entry.name);
        if (patterns.some(pattern => pattern.test(relative))) { excluded++; continue; }
        if (entries.length >= max_entries) { truncated = true; break; }
        const absolute = path.join(current.absolute, entry.name);
        let stat;
        try { stat = await statPath(absolute); }
        catch (error) {
          errors.push({relative_locator: relative, code: String(error?.code ?? 'ENTRY_UNREADABLE')});
          entries.push({relative_locator: relative, kind: entry.isDirectory() ? 'FOLDER' : 'FILE', file_state: 'UNREADABLE', version: null, size_bytes: null, observed_at_utc: at});
          continue;
        }
        if (stat.isSymbolicLink()) { excluded++; errors.push({relative_locator: relative, code: 'SYMLINK_OR_JUNCTION_NOT_FOLLOWED'}); continue; }
        const kind = stat.isDirectory() ? 'FOLDER' : stat.isFile() ? 'FILE' : 'OTHER';
        if (kind === 'OTHER') { excluded++; continue; }
        const version = `${Math.trunc(stat.mtimeMs)}:${stat.size}`;
        entries.push({
          relative_locator: relative,
          kind,
          file_state: 'PRESENT',
          version,
          size_bytes: Number(stat.size),
          observed_at_utc: at,
          source_id: {
            owner: 'LOCAL_FILESYSTEM', namespace: `MOUNT:${mount}`, native_id_type: 'string', native_id: relative
          },
          content_sha256: null
        });
        if (kind === 'FOLDER' && include_subfolders && current.depth < max_depth) {
          try {
            const canonical = await resolveRealPath(absolute), key = insensitive ? canonical.toLowerCase() : canonical;
            if (visited.has(key)) errors.push({relative_locator: relative, code: 'DIRECTORY_CYCLE_NOT_FOLLOWED'});
            else { visited.add(key); pending.push({absolute: canonical, relative, depth: current.depth + 1}); }
          } catch (error) { errors.push({relative_locator: relative, code: String(error?.code ?? 'DIRECTORY_UNAVAILABLE')}); }
        } else if (kind === 'FOLDER' && include_subfolders && current.depth >= max_depth) {
          errors.push({relative_locator: relative, code: 'FOLDER_DEPTH_LIMIT'});
        }
      }
    } finally {
      await directory.close().catch(() => {});
    }
  }
  entries.sort((left, right) => left.relative_locator.localeCompare(right.relative_locator));
  const unreadable = entries.filter(entry => entry.file_state === 'UNREADABLE').length;
  return {
    schema_version: MPC_WORKSPACE_INGEST_VERSION, project_id, mount_id: mount, host_id,
    root_locator: root, source_kind, attachment_mode: 'INDEX_IN_PLACE', include_subfolders,
    exclusions: [...exclusions], connection_state: 'ONLINE', index_state: errors.length || truncated ? 'STALE' : 'CURRENT',
    inventory_complete: !errors.length && !truncated, observed_at_utc: at, entries, errors,
    counts: {indexed: entries.length - unreadable, pending: truncated ? 1 : 0, changed: 0, unavailable: 0, unreadable, excluded},
    coverage: {truncated, entry_limit: max_entries, followed_symlinks: false}, originals_modified: false
  };
}

export function createFolderDetachReceipt(index, {detached_at_utc, purge_index = false} = {}) {
  if (!plainObject(index) || index.schema_version !== MPC_WORKSPACE_INGEST_VERSION) fail('VALID_FOLDER_INDEX_REQUIRED');
  if (typeof purge_index !== 'boolean') fail('INVALID_PURGE_INDEX_CHOICE');
  return {
    schema_version: MPC_WORKSPACE_INGEST_VERSION,
    project_id: index.project_id,
    mount_id: index.mount_id,
    detached_at_utc: iso(detached_at_utc ?? new Date()),
    state: 'DETACHED',
    index_policy: purge_index ? 'PURGE_INDEX' : 'KEEP_HISTORY',
    original_files_deleted: false,
    retained_entry_count: purge_index ? 0 : index.entries.length
  };
}

/** Convert an acquired folder inventory into the pure comparison contract. */
export function buildSnapshotManifest(index, {snapshot_id, source_id, comparison_scope, version, content_sha256 = null} = {}) {
  if (!plainObject(index) || index.schema_version !== MPC_WORKSPACE_INGEST_VERSION || !Array.isArray(index.entries)) fail('VALID_FOLDER_INDEX_REQUIRED');
  requiredText(snapshot_id, 'SNAPSHOT_ID_REQUIRED', 200);
  if (!plainObject(source_id) || !plainObject(comparison_scope)) fail('SNAPSHOT_IDENTITIES_REQUIRED');
  return {
    schema_version: 'MPC_WORKSPACE_SNAPSHOT_1',
    snapshot_id,
    project_id: index.project_id,
    source_id: structuredClone(source_id),
    comparison_scope: structuredClone(comparison_scope),
    version: version ?? index.observed_at_utc,
    content_sha256,
    acquisition_state: index.connection_state === 'ONLINE' ? 'PRESENT' : 'UNAVAILABLE',
    inventory_complete: index.inventory_complete === true,
    entries: index.entries.map(entry => ({
      source_id: structuredClone(entry.source_id ?? {
        owner: 'LOCAL_FILESYSTEM', namespace: `MOUNT:${index.mount_id}`, native_id_type: 'string', native_id: entry.relative_locator
      }),
      path: entry.relative_locator,
      kind: entry.kind,
      version: entry.version,
      content_sha256: entry.content_sha256 ?? null,
      acquisition_state: entry.acquisition_state ?? (entry.file_state === 'PRESENT'
        ? 'PRESENT' : entry.file_state === 'UNREADABLE' ? 'UNREADABLE' : 'UNAVAILABLE'),
      ...((entry.acquisition_state ?? (entry.file_state === 'PRESENT' ? 'PRESENT' : entry.file_state)) === 'PRESENT'
        ? {} : {acquisition_reason: entry.acquisition_reason ?? entry.file_state})
    }))
  };
}
