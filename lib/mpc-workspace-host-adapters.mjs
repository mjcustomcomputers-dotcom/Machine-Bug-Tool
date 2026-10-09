import {createHash, randomUUID} from 'node:crypto';

export const WORKSPACE_HOST_ADAPTER_VERSION = 'MPC_WORKSPACE_HOST_ADAPTERS_1';
export const HOST_ADAPTER_LIMITS = Object.freeze({response_bytes: 1_000_000, content_bytes: 96_000,
  request_timeout_ms: 15_000, identity_cache_ms: 60_000, identity_cache_entries: 32});
export const HOST_ADAPTER_ENDPOINTS = Object.freeze({GITHUB: 'https://api.github.com',
  GOOGLE_DRIVE: 'https://www.googleapis.com/drive/v3', DROPBOX: 'https://api.dropboxapi.com/2',
  GMAIL: 'https://gmail.googleapis.com/gmail/v1', LOCAL_MPC: 'local-mpc://bundled'});
const DEFAULT_REPOSITORY = 'mjcustomcomputers-dotcom/Machine-Bug-Tool';
const ORIGINS = new Set(['https://api.github.com', 'https://www.googleapis.com',
  'https://gmail.googleapis.com', 'https://api.dropboxapi.com', 'https://content.dropboxapi.com']);
const SHA = /^[0-9a-f]{40}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const OBJECT_ID = /^[A-Za-z0-9_-]{1,200}$/u;
const SECRET_REF = /^os-secret:\/\/[A-Za-z0-9._:/-]+$/u;
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const hash = value => createHash('sha256').update(value).digest('hex');

function fail(code, message, status = 422) {
  throw Object.assign(new Error(message), {code, publicMessage: message, status, http_status: status,
    category: status === 401 || status === 403 ? 'ACCESS' : 'OPERATION'});
}
function text(value, label, maximum = 2048) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail('HOST_ADAPTER_INPUT_INVALID', `Provide a valid ${label}.`);
  }
  return value;
}
function id(value, label) {
  if (!OBJECT_ID.test(text(value, label, 200))) fail('HOST_ADAPTER_OBJECT_ID_INVALID', `Provide the native ${label}, without an account page URL.`);
  return value;
}
function validateInput(input, allowed) {
  if (!plainObject(input) || Object.keys(input).some(key => !allowed.includes(key))) {
    fail('HOST_ADAPTER_INPUT_FIELDS_REJECTED', 'Only the documented selected-object fields are accepted.');
  }
  if (input.include_content !== undefined && typeof input.include_content !== 'boolean') {
    fail('HOST_ADAPTER_CONTENT_SELECTION_INVALID', 'Content selection must be true or false.');
  }
}
function validateConnection(connection, provider) {
  if (!plainObject(connection) || connection.provider_namespace !== provider || connection.enabled === false) {
    fail('HOST_ADAPTER_CONNECTION_BINDING_INVALID', 'Use an enabled, saved connection for this provider.');
  }
  const endpoint = String(connection.endpoint_ref ?? '').replace(/\/$/u, '');
  if (endpoint !== HOST_ADAPTER_ENDPOINTS[provider]) {
    fail('HOST_ADAPTER_ENDPOINT_REJECTED', `Use the fixed ${provider} endpoint: ${HOST_ADAPTER_ENDPOINTS[provider]}.`);
  }
  if (connection.secret_store_ref !== undefined && connection.secret_store_ref !== null && !SECRET_REF.test(connection.secret_store_ref)) {
    fail('HOST_ADAPTER_CREDENTIAL_REFERENCE_INVALID', 'Use a credential reference created by the desktop credential store.');
  }
}
function decodeText(bytes) {
  if (bytes.length > HOST_ADAPTER_LIMITS.content_bytes) fail('HOST_ADAPTER_CONTENT_LIMIT', 'This selected text exceeds 96,000 bytes. Import a downloaded file through Add files for a larger acquisition.');
  try {
    const result = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    if (result.includes('\u0000')) return null;
    return result;
  } catch { return null; }
}
function base64(value, url = false) {
  if (typeof value !== 'string' || value.length > HOST_ADAPTER_LIMITS.response_bytes ||
      !(url ? /^[A-Za-z0-9_-]*={0,2}$/u : /^[A-Za-z0-9+/\r\n]*={0,2}$/u).test(value)) {
    fail('HOST_ADAPTER_CONTENT_ENCODING_INVALID', 'The provider returned an invalid content encoding.', 502);
  }
  const bytes = Buffer.from(value, url ? 'base64url' : 'base64');
  const canonical = value.replace(/[\r\n=]/gu, '');
  if (bytes.toString(url ? 'base64url' : 'base64').replace(/=/gu, '') !== canonical) {
    fail('HOST_ADAPTER_CONTENT_ENCODING_INVALID', 'The provider returned a non-canonical content encoding.', 502);
  }
  return bytes;
}
function contentResult(bytes, scope = 'SELECTED_FILE') {
  const content = decodeText(bytes);
  return {content, content_sha256: hash(bytes), content_bytes: bytes.length,
    content_state: content === null ? 'BINARY_CONTENT_NOT_INTERPRETED' : 'ACQUIRED_UTF8_TEXT', content_scope: scope};
}
function metadataOnly(reason = 'METADATA_ONLY_USER_SELECTED') {
  return {content: null, content_sha256: null, content_bytes: 0, content_state: reason, content_scope: 'METADATA_ONLY'};
}
function responseId(response) {
  const value = response.headers.get('x-github-request-id') ?? response.headers.get('x-dropbox-request-id') ?? response.headers.get('x-request-id');
  return value && /^[A-Za-z0-9:._/-]{1,240}$/u.test(value) ? value : null;
}
function statusError(provider, status) {
  const action = status === 401 ? 'The access token is missing, invalid, or expired. Replace it in the desktop credential store.'
    : status === 403 ? 'The provider denied this read. Check the selected object, account, and token read scopes.'
      : status === 404 ? 'The selected object was not found or is not visible to this account.'
        : status === 409 ? 'The selected Dropbox path, revision, or account namespace is unavailable.'
          : status === 429 ? 'The provider rate limit was reached. Wait before another selected read.'
            : 'The provider could not complete the selected read. Retry manually after checking its service status.';
  fail(`HOST_ADAPTER_${provider}_HTTP_${status}`, action, status);
}

/** Provider I/O is host-owned. This factory never accepts URLs, headers, tokens,
 * commands, remote tool names, or instructions from selected source content. */
export function createWorkspaceHostAdapters({resolveCredential = async () => null, fetchImpl = globalThis.fetch,
  clock = () => new Date(), hostId = 'MPC_WORKSPACE_LOCAL_HOST', runLocalTool} = {}) {
  const identities = new Map();
  const now = () => new Date(clock()).toISOString();
  const nativeTool = runLocalTool ?? (async (name, args) => (await import('./tools.mjs')).callTool(name, args));

  async function request(provider, url, credential, {method = 'GET', body, headers = {}, limit = HOST_ADAPTER_LIMITS.response_bytes, json = true} = {}) {
    const parsed = new URL(url);
    if (!ORIGINS.has(parsed.origin) || parsed.username || parsed.password || parsed.hash || !['GET', 'POST'].includes(method)) {
      fail('HOST_ADAPTER_REQUEST_DESTINATION_REJECTED', 'The adapter refused an unregistered request destination.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HOST_ADAPTER_LIMITS.request_timeout_ms);
    let response;
    try {
      response = await fetchImpl(parsed.href, {method, credentials: 'omit', redirect: 'error', cache: 'no-store',
        signal: controller.signal, headers: {Accept: 'application/json',
          ...(credential ? {Authorization: `Bearer ${credential}`} : {}), ...headers},
        ...(body === undefined ? {} : {body: JSON.stringify(body)})});
      if (!response.ok) { await response.body?.cancel?.(); statusError(provider, response.status); }
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > limit) {
        await response.body?.cancel?.();
        fail('HOST_ADAPTER_RESPONSE_LIMIT', 'The selected provider response exceeds the bounded read limit.', 413);
      }
      const reader = response.body?.getReader?.();
      if (!reader) fail('HOST_ADAPTER_RESPONSE_STREAM_REQUIRED', 'The provider response could not be read as a bounded stream.', 502);
      const chunks = []; let size = 0;
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) { await reader.cancel(); fail('HOST_ADAPTER_RESPONSE_LIMIT', 'The selected provider response exceeds the bounded read limit.', 413); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      const bytes = Buffer.concat(chunks, size);
      if (!json) return {data: bytes, response};
      try { return {data: JSON.parse(bytes.toString('utf8')), response}; }
      catch { fail('HOST_ADAPTER_PROVIDER_JSON_INVALID', 'The provider returned invalid JSON.', 502); }
    } catch (error) {
      if (typeof error?.code === 'string' && error.code.startsWith('HOST_ADAPTER_')) throw error;
      fail(controller.signal.aborted ? 'HOST_ADAPTER_TIMEOUT' : 'HOST_ADAPTER_NETWORK_ERROR',
        controller.signal.aborted ? 'The bounded provider read timed out. Retry manually.'
          : 'The provider request failed. Check internet access; redirects are not followed.', 502);
    } finally { clearTimeout(timer); }
  }

  async function credentialFor(connection) {
    if (connection.provider_namespace === 'LOCAL_MPC') return null;
    if (!connection.secret_store_ref) {
      if (connection.provider_namespace === 'GITHUB') return null;
      fail('HOST_ADAPTER_CREDENTIAL_REQUIRED', 'Add a provider-scoped access token using the desktop credential store.', 401);
    }
    let value;
    try { value = await resolveCredential(connection.secret_store_ref, {provider: connection.provider_namespace}); }
    catch { fail('HOST_ADAPTER_CREDENTIAL_UNAVAILABLE', 'The desktop could not unlock this provider credential. Add it again for this account.', 401); }
    if (typeof value !== 'string' || !value || value.length > 16_384 || /\s/u.test(value)) {
      fail('HOST_ADAPTER_CREDENTIAL_UNAVAILABLE', 'This provider credential is unavailable. Add a current access token in the desktop credential store.', 401);
    }
    return value;
  }

  async function identity(connection, credential) {
    const provider = connection.provider_namespace;
    if (provider === 'LOCAL_MPC') return {account_id: 'LOCAL_PROCESS', account_observed_at_utc: now(), access_mode: 'IN_PROCESS_LOCAL'};
    if (provider === 'GITHUB' && credential === null) return {account_id: 'PUBLIC_ANONYMOUS', account_observed_at_utc: now(), access_mode: 'PUBLIC_READ_ONLY'};
    const key = `${provider}:${hash(credential)}`;
    const cached = identities.get(key);
    if (cached && Date.parse(now()) - cached.at >= 0 && Date.parse(now()) - cached.at < HOST_ADAPTER_LIMITS.identity_cache_ms) return cached.value;
    let result, account;
    if (provider === 'GITHUB') {
      result = await request(provider, 'https://api.github.com/user', credential, {headers: {'X-GitHub-Api-Version': '2022-11-28'}});
      account = Number.isSafeInteger(result.data?.id) && result.data.id > 0 ? `github:${result.data.id}` : null;
    } else if (provider === 'GOOGLE_DRIVE') {
      result = await request(provider, 'https://www.googleapis.com/drive/v3/about?fields=user(permissionId)', credential);
      account = typeof result.data?.user?.permissionId === 'string' ? `drive:${result.data.user.permissionId}` : null;
    } else if (provider === 'GMAIL') {
      result = await request(provider, 'https://gmail.googleapis.com/gmail/v1/users/me/profile', credential);
      account = typeof result.data?.emailAddress === 'string' ? `gmail:${result.data.emailAddress}` : null;
    } else if (provider === 'DROPBOX') {
      result = await request(provider, 'https://api.dropboxapi.com/2/users/get_current_account', credential, {method: 'POST', body: null, headers: {'Content-Type': 'application/json'}});
      account = typeof result.data?.account_id === 'string' ? `dropbox:${result.data.account_id}` : null;
    }
    if (!account || account.length > 300 || /[\u0000-\u001f\u007f]/u.test(account)) {
      fail('HOST_ADAPTER_ACCOUNT_ID_UNOBSERVED', 'The provider did not return a usable account identity.', 502);
    }
    const value = {account_id: account, account_observed_at_utc: now(), access_mode: 'AUTHENTICATED_READ_ONLY'};
    if (identities.size >= HOST_ADAPTER_LIMITS.identity_cache_entries) identities.delete(identities.keys().next().value);
    identities.set(key, {at: Date.parse(now()), value});
    return value;
  }

  function receipt(provider, context, resource, content, response = null, extra = {}) {
    return {schema_version: WORKSPACE_HOST_ADAPTER_VERSION, status: 'SUCCESS', receipt_id: `MPC-READ-${randomUUID()}`,
      receipt_basis: provider === 'LOCAL_MPC' ? 'BUNDLED_LOCAL_TOOL_RESULT' : 'HOST_OBSERVED_PROVIDER_RESPONSE',
      native_request_id: response ? responseId(response) : null, observed_at_utc: now(), context,
      resource, ...content, ...extra, read_only: true, automatic_persistence: false,
      source_content_is_untrusted_input: true, source_instructions_executed: false,
      cryptographic_source_authentication: false, hosted_mpc_authentication: false};
  }

  async function github(input, context, credential) {
    validateInput(input, ['repository', 'ref', 'path', 'include_content']);
    const repository = input.repository ?? DEFAULT_REPOSITORY;
    if (typeof repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(repository)) {
      fail('HOST_ADAPTER_REPOSITORY_INVALID', 'Use owner/repository, without a GitHub URL.');
    }
    const ref = input.ref ?? 'HEAD';
    if (typeof ref !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/u.test(ref)) fail('HOST_ADAPTER_GIT_REF_INVALID', 'Use an exact commit SHA, branch, or tag.');
    const path = input.path ?? 'README.md';
    if (typeof path !== 'string' || !path || path.length > 1024 || path.startsWith('/') || /[\u0000-\u001f\u007f\\]/u.test(path) || path.split('/').some(part => !part || part === '..' || part === '.')) {
      fail('HOST_ADAPTER_GIT_PATH_INVALID', 'Select one repository-relative file path.');
    }
    const base = `https://api.github.com/repos/${repository}`;
    const headers = {'X-GitHub-Api-Version': '2022-11-28', Accept: 'application/vnd.github+json'};
    const commit = await request('GITHUB', `${base}/commits/${encodeURIComponent(ref)}`, credential, {headers});
    const sha = commit.data?.sha;
    if (!SHA.test(sha ?? '') || (SHA.test(ref) && ref !== sha)) fail('HOST_ADAPTER_GIT_COMMIT_MISMATCH', 'The provider did not resolve the selected commit identity.', 502);
    const selected = await request('GITHUB', `${base}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`, credential, {headers});
    const file = selected.data;
    if (!plainObject(file) || file.type !== 'file' || file.path !== path || file.submodule_git_url || !SHA.test(file.sha ?? '')) {
      fail('HOST_ADAPTER_GIT_FILE_IDENTITY_INVALID', 'Select a regular file; the returned identity did not match.', 502);
    }
    let content = metadataOnly();
    if (input.include_content !== false) {
      if (file.encoding !== 'base64') fail('HOST_ADAPTER_GIT_FILE_TOO_LARGE', 'This file needs the downloaded-file acquisition route.', 413);
      const bytes = base64(file.content);
      const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (file.size !== bytes.length || blob !== file.sha) fail('HOST_ADAPTER_GIT_BLOB_MISMATCH', 'The returned file bytes do not match the native Git blob identity.', 502);
      content = contentResult(bytes);
    }
    return receipt('GITHUB', context, {owner: 'GITHUB', native_id: `${repository}:${path}`, native_version: sha,
      git_blob_sha: file.sha, requested_ref: ref, native_locator: `https://github.com/${repository}/blob/${sha}/${path.split('/').map(encodeURIComponent).join('/')}`}, content, selected.response);
  }

  async function drive(input, context, credential) {
    validateInput(input, ['file_id', 'include_content']);
    const fileId = id(input.file_id, 'Drive file ID');
    const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
    const fields = 'id,name,mimeType,version,modifiedTime,size,md5Checksum,sha256Checksum,trashed';
    const metadataUrl = `${base}?supportsAllDrives=true&fields=${encodeURIComponent(fields)}`;
    const selected = await request('GOOGLE_DRIVE', metadataUrl, credential);
    const file = selected.data;
    if (file?.id !== fileId || !/^\d+$/u.test(String(file.version ?? '')) || file.trashed === true) fail('HOST_ADAPTER_DRIVE_IDENTITY_INVALID', 'The selected live Drive file identity or version was not returned.', 502);
    let content = metadataOnly(), response = selected.response;
    if (input.include_content !== false) {
      const formats = {'application/vnd.google-apps.document': ['text/plain', 'GOOGLE_DOC_EXPORTED_TEXT'],
        'application/vnd.google-apps.spreadsheet': ['text/csv', 'GOOGLE_SHEET_FIRST_SHEET_CSV'],
        'application/vnd.google-apps.presentation': ['text/plain', 'GOOGLE_SLIDES_EXPORTED_TEXT']};
      const format = formats[file.mimeType];
      const isText = /^(text\/|application\/(json|xml|javascript|x-ndjson)(?:$|;))/u.test(file.mimeType ?? '');
      if (format || isText) {
        if (!format && Number(file.size) > HOST_ADAPTER_LIMITS.content_bytes) fail('HOST_ADAPTER_CONTENT_LIMIT', 'This selected Drive text needs the downloaded-file acquisition route.', 413);
        const read = await request('GOOGLE_DRIVE', format ? `${base}/export?mimeType=${encodeURIComponent(format[0])}` : `${base}?alt=media&supportsAllDrives=true`, credential,
          {json: false, limit: HOST_ADAPTER_LIMITS.content_bytes});
        const after = await request('GOOGLE_DRIVE', metadataUrl, credential);
        if (after.data?.id !== fileId || String(after.data.version) !== String(file.version) || after.data.trashed === true) {
          fail('HOST_ADAPTER_DRIVE_CHANGED_DURING_READ', 'The Drive file changed during acquisition. Read the selected file again.', 409);
        }
        content = contentResult(read.data, format?.[1] ?? 'SELECTED_FILE');
        if (!format && file.sha256Checksum && (!HASH.test(file.sha256Checksum) || file.sha256Checksum !== content.content_sha256)) fail('HOST_ADAPTER_DRIVE_DIGEST_MISMATCH', 'The Drive content did not match its native digest.', 502);
        if (!format && file.md5Checksum && createHash('md5').update(read.data).digest('hex') !== file.md5Checksum) fail('HOST_ADAPTER_DRIVE_DIGEST_MISMATCH', 'The Drive content did not match its native digest.', 502);
        response = read.response;
      } else content = metadataOnly('BINARY_OR_UNSUPPORTED_NATIVE_FORMAT_USE_FILE_IMPORT');
    }
    return receipt('GOOGLE_DRIVE', context, {owner: 'GOOGLE_DRIVE', native_id: fileId, native_version: String(file.version),
      native_locator: `https://drive.google.com/file/d/${fileId}/view`, name: String(file.name ?? ''), mime_type: String(file.mimeType ?? ''),
      modified_at_utc: file.modifiedTime ?? null}, content, response);
  }

  async function dropbox(input, context, credential) {
    validateInput(input, ['path', 'include_content']);
    const path = text(input.path, 'Dropbox file path or id');
    if (!(path.startsWith('/') && path.length > 1) && !/^id:[A-Za-z0-9_-]{1,200}$/u.test(path)) fail('HOST_ADAPTER_DROPBOX_PATH_INVALID', 'Use /folder/file.txt or the native id: value.');
    const selected = await request('DROPBOX', 'https://api.dropboxapi.com/2/files/get_metadata', credential,
      {method: 'POST', body: {path, include_deleted: false}, headers: {'Content-Type': 'application/json'}});
    const file = selected.data;
    if (file?.['.tag'] !== 'file' || !/^id:[A-Za-z0-9_-]{1,200}$/u.test(file.id ?? '') || !/^[0-9a-f]{5,64}$/u.test(file.rev ?? '') ||
        (path.startsWith('id:') ? file.id !== path : file.path_lower !== path.toLowerCase())) fail('HOST_ADAPTER_DROPBOX_IDENTITY_INVALID', 'The returned Dropbox file identity did not match.', 502);
    let content = metadataOnly(), response = selected.response;
    if (input.include_content !== false) {
      if (file.size > HOST_ADAPTER_LIMITS.content_bytes) fail('HOST_ADAPTER_CONTENT_LIMIT', 'This selected Dropbox file needs the downloaded-file acquisition route.', 413);
      const read = await request('DROPBOX', 'https://content.dropboxapi.com/2/files/download', credential,
        {method: 'POST', headers: {'Dropbox-API-Arg': JSON.stringify({path: `rev:${file.rev}`})}, json: false, limit: HOST_ADAPTER_LIMITS.content_bytes});
      let downloaded;
      try { downloaded = JSON.parse(read.response.headers.get('dropbox-api-result')); } catch {}
      if (downloaded?.id !== file.id || downloaded?.rev !== file.rev || downloaded?.size !== read.data.length || file.size !== read.data.length) {
        fail('HOST_ADAPTER_DROPBOX_REVISION_MISMATCH', 'The downloaded bytes did not match the selected Dropbox revision.', 502);
      }
      content = contentResult(read.data);
      const blocks = [];
      for (let offset = 0; offset < read.data.length; offset += 4 * 1024 * 1024) blocks.push(createHash('sha256').update(read.data.subarray(offset, offset + 4 * 1024 * 1024)).digest());
      const nativeHash = hash(Buffer.concat(blocks));
      if (!HASH.test(file.content_hash ?? '') || nativeHash !== file.content_hash || downloaded.content_hash !== file.content_hash) fail('HOST_ADAPTER_DROPBOX_DIGEST_MISMATCH', 'The content did not match the native Dropbox content hash.', 502);
      response = read.response;
    }
    return receipt('DROPBOX', context, {owner: 'DROPBOX', native_id: file.id, native_version: file.rev,
      native_locator: `dropbox:${file.id}`, path: file.path_display ?? file.path_lower, native_content_hash: file.content_hash ?? null}, content, response);
  }

  async function gmail(input, context, credential) {
    validateInput(input, ['message_id', 'include_content']);
    const messageId = id(input.message_id, 'Gmail API message ID');
    const selected = await request('GMAIL', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=${input.include_content === false ? 'metadata' : 'full'}`, credential);
    const message = selected.data;
    if (message?.id !== messageId || !/^\d+$/u.test(String(message.historyId ?? ''))) fail('HOST_ADAPTER_GMAIL_IDENTITY_INVALID', 'The selected Gmail message identity or history version was not returned.', 502);
    const names = new Set(['from', 'to', 'date', 'subject', 'message-id']);
    const headers = Array.isArray(message.payload?.headers) ? message.payload.headers.filter(row => names.has(String(row.name).toLowerCase()))
      .slice(0, 20).map(row => ({name: String(row.name).slice(0, 40), value: String(row.value ?? '').slice(0, 8000)})) : [];
    let content = metadataOnly();
    if (input.include_content !== false) {
      const plain = [], html = []; let nodes = 0, total = 0;
      const visit = (part, depth = 0) => {
        if (++nodes > 256 || depth > 12) fail('HOST_ADAPTER_GMAIL_STRUCTURE_LIMIT', 'The selected message structure exceeds the bounded MIME read.');
        if (!plainObject(part)) return;
        if (!part.filename && !part.body?.attachmentId && ['text/plain', 'text/html'].includes(part.mimeType) && typeof part.body?.data === 'string') {
          const bytes = base64(part.body.data, true); total += bytes.length;
          if (total > HOST_ADAPTER_LIMITS.content_bytes) fail('HOST_ADAPTER_CONTENT_LIMIT', 'The selected message text exceeds the bounded read.');
          (part.mimeType === 'text/plain' ? plain : html).push(bytes);
        }
        if (Array.isArray(part.parts)) part.parts.forEach(child => visit(child, depth + 1));
      };
      visit(message.payload);
      if (plain.length || html.length) content = contentResult(Buffer.concat((plain.length ? plain : html).flatMap((bytes, index) => index ? [Buffer.from('\n'), bytes] : [bytes])),
        plain.length ? 'MESSAGE_PLAIN_TEXT_PARTS_ATTACHMENTS_EXCLUDED' : 'MESSAGE_RAW_HTML_TEXT_NOT_RENDERED_ATTACHMENTS_EXCLUDED');
      else content = metadataOnly('NO_INLINE_TEXT_PART_ATTACHMENT_FETCH_NOT_PERFORMED');
    }
    return receipt('GMAIL', context, {owner: 'GMAIL', native_id: messageId, native_version: `history:${message.historyId}`,
      native_locator: `gmail-api://me/messages/${messageId}`, thread_id: message.threadId ?? null, headers}, content, selected.response,
      {attachment_fetch_performed: false, message_send_performed: false});
  }

  async function local(input, context) {
    validateInput(input, []);
    const runtime = await nativeTool('runtime_status', {});
    const contract = await nativeTool('get_universal_contract', {});
    const content = JSON.stringify({runtime, contract}, null, 2);
    return receipt('LOCAL_MPC', context, {owner: 'BUNDLED_LOCAL_MPC', native_id: 'lib/tools.mjs',
      native_version: String(runtime?.runtime_version ?? 'NOT_REPORTED'), native_locator: 'local-mpc://bundled'},
    {content: null, content_sha256: hash(content), content_bytes: Buffer.byteLength(content),
      content_state: 'BUNDLED_LOCAL_CONTRACT_READ', content_scope: 'LOCAL_ENGINE_CONTRACT'}, null,
    {execution_surface: 'IN_PROCESS_LOCAL', runtime, contract, original_runtime_labels_are_metadata: true});
  }

  const handlers = {GITHUB: github, GOOGLE_DRIVE: drive, DROPBOX: dropbox, GMAIL: gmail, LOCAL_MPC: local};
  return {
    async getConnectionContext(connection) {
      const provider = connection?.provider_namespace;
      if (!Object.hasOwn(handlers, provider)) return {host_id: hostId, account_id: 'ACCOUNT_NOT_OBSERVED'};
      validateConnection(connection, provider);
      const account = await identity(connection, await credentialFor(connection));
      return {host_id: hostId, ...account};
    },
    connections: Object.fromEntries(Object.entries(handlers).map(([provider, handler]) => [provider,
      async (input, expected, {connection} = {}) => {
        validateConnection(connection, provider);
        if (!plainObject(expected) || expected.provider !== provider || expected.host_id !== hostId || expected.surface !== 'WINDOWS_LOCAL') {
          fail('HOST_ADAPTER_CONTEXT_MISMATCH', 'The selected operation does not match the desktop host context.');
        }
        if (!['READ_SELECTED_RESOURCE', 'CAPABILITY_READ'].includes(expected.operation) || (expected.operation === 'CAPABILITY_READ' && provider !== 'LOCAL_MPC')) {
          fail('HOST_ADAPTER_OPERATION_UNSUPPORTED', 'This adapter supports an explicit selected-resource read.');
        }
        const credential = await credentialFor(connection);
        const account = await identity(connection, credential);
        if (account.account_id !== expected.account_id) fail('HOST_ADAPTER_ACCOUNT_CHANGED', 'The provider account changed. Repeat the selected read with its current account.', 409);
        return handler(input, {...expected, ...account}, credential);
      }
    ]))
  };
}
