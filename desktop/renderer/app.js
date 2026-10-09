/**
 * MPC Workspace renderer contract (v1)
 *
 * Same-origin JSON only:
 *   GET  /api/workspace/bootstrap
 *   POST /api/workspace/projects            create a project
 *   POST /api/workspace/projects/:id/open   reopen project + resume state
 *   POST /api/workspace/projects/:id/draft  retention-aware draft checkpoint
 *   POST /api/workspace/inputs              one user-selected TEXT, FILES, FOLDER, or SCRIPT_OUTPUT acquisition
 *   POST /api/workspace/jobs                source-bound route/model job; retains the full router receipt host-side
 *   GET  /api/workspace/jobs/:id            current immutable-receipt-derived job state
 *   POST /api/workspace/jobs/:id/cancel     cancellation request
 *   POST /api/workspace/jobs/:id/resume     exact saved checkpoint resume
 *   POST /api/workspace/reports             {operation: CREATE|OPEN|EXPORT, ...}
 *   POST /api/workspace/search              project-qualified local/selected-provider search
 *   POST /api/workspace/snapshots/compare   exact acquired manifest IDs
 *   POST /api/workspace/connections         {operation: CONFIGURE|CONNECT|DISCONNECT, ...};
 *                                            CONNECT/DISCONNECT enable or disable the
 *                                            saved local configuration, never prove access
 *   POST /api/workspace/connections/test    one harmless permitted operation and its real receipt
 *   POST /api/workspace/scripts             {operation: CREATE|SAVE_DRAFT|EXPORTED|INGEST_OUTPUT, ...}
 *   POST /api/workspace/transfers/export    bounded portable data envelope; performs no external action
 *   POST /api/workspace/transfers/import    verified data-only import into the explicitly selected project
 *
 * The optional `window.mpcWorkspace` bridge is deliberately narrow:
 * getRuntimeStatus, chooseFiles, chooseFolder, readClipboardText, copyText,
 * openLogs, restartService, and bounded setInterfaceZoom. It exposes no generic invoke, filesystem,
 * command, shell, URL-fetch, credential, or provider proxy operation.
 * Imported and model-produced material is always rendered with textContent.
 */

export const API_PATHS = Object.freeze({
  bootstrap: '/api/workspace/bootstrap',
  projects: '/api/workspace/projects',
  inputs: '/api/workspace/inputs',
  jobs: '/api/workspace/jobs',
  reports: '/api/workspace/reports',
  search: '/api/workspace/search',
  snapshotCompare: '/api/workspace/snapshots/compare',
  connections: '/api/workspace/connections',
  connectionTest: '/api/workspace/connections/test',
  scripts: '/api/workspace/scripts',
  transferExport: '/api/workspace/transfers/export',
  transferImport: '/api/workspace/transfers/import',
  localModelStatus: '/api/workspace/local-model/status',
  localModelStart: '/api/workspace/local-model/start',
  localModelPull: '/api/workspace/local-model/pull',
  localModelCreate: '/api/workspace/local-model/create',
  localModelCancel: '/api/workspace/local-model/cancel'
});

export const RENDERER_CONTRACT_VERSION = 'MPC_WORKSPACE_RENDERER_1';
export const MAX_BROWSER_FILE_BYTES = 2_000_000;
export const MAX_RESPONSE_BYTES = 4_000_000;

const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const TERMINAL_JOB_STATES = new Set(['SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED', 'COMPLETE']);
const SCRIPT_STATES = new Set(['DRAFT', 'EXPORTED_FOR_MANUAL_RUN', 'OUTPUT_INGESTED']);
const CONNECTION_SERVICES = Object.freeze([
  ['GITHUB', 'GitHub', 'Code, exact revisions and review artifacts'],
  ['GOOGLE_DRIVE', 'Google Drive', 'Selected native files and report destinations'],
  ['GMAIL', 'Gmail', 'Selected evidence and drafts; send requires instruction'],
  ['DROPBOX', 'Dropbox', 'Selected native files and backups'],
  ['DROPBOX_DASH', 'Dropbox Dash', 'Discovery aliases resolved to native sources'],
  ['HOSTED_MPC', 'Hosted MPC', 'Registered bounded evaluators'],
  ['LOCAL_MPC', 'Local MPC', 'This computer’s source-bound engine'],
  ['OLLAMA', 'Local model', 'Explicit loopback inference'],
  ['OPENAI_API', 'OpenAI / Daybreak API', 'Explicit entitled API project inference'],
  ['CUSTOM_MCP', 'Custom MCP', 'User-configured bounded MCP transport']
]);

export function jobApiPath(jobId, action = '') {
  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) throw new TypeError('INVALID_JOB_ID');
  if (!['', 'cancel', 'resume'].includes(action)) throw new TypeError('INVALID_JOB_ACTION');
  return `/api/workspace/jobs/${encodeURIComponent(jobId)}${action ? `/${action}` : ''}`;
}

export function entityApiPath(kind, id, action = '') {
  if (!['projects', 'reports', 'scripts'].includes(kind)) throw new TypeError('INVALID_ENTITY_KIND');
  if (typeof id !== 'string' || !JOB_ID.test(id)) throw new TypeError('INVALID_ENTITY_ID');
  const allowed = {projects: new Set(['', 'open', 'draft', 'resume']), reports: new Set(['']), scripts: new Set(['', 'export', 'output'])};
  if (!allowed[kind].has(action)) throw new TypeError('INVALID_ENTITY_ACTION');
  return `/api/workspace/${kind}/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;
}

export function clampCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

export function formatBytes(value) {
  const bytes = clampCount(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function providerAvailabilityLabel(profile) {
  const observed = profile?.observation ?? profile?.observed ?? null;
  const status = String(profile?.availability ?? observed?.status ?? 'NOT_OBSERVED').toUpperCase();
  if (['AVAILABLE', 'SUCCESS', 'LAST_OPERATION_VERIFIED', 'MODEL_AVAILABLE'].includes(status)) return 'available';
  if (['UNAVAILABLE', 'NOT_CONFIGURED', 'ERROR', 'PROVIDER_UNAVAILABLE'].includes(status)) return 'unavailable';
  if (status === 'CONFIGURED_ONLY') return 'configured, unobserved';
  return 'not yet observed';
}

export const INTERFACE_ZOOMS = Object.freeze([0.5, 0.6, 0.75, 0.85, 0.9, 1, 1.1, 1.25, 1.5, 2]);

export function nextInterfaceZoom(current, direction) {
  const value = Number(current);
  const safe = Number.isFinite(value) ? value : 1;
  if (direction > 0) return INTERFACE_ZOOMS.find(step => step > safe + 0.001) ?? 2;
  if (direction < 0) return [...INTERFACE_ZOOMS].reverse().find(step => step < safe - 0.001) ?? 0.5;
  return Math.min(2, Math.max(0.5, safe));
}

/** Visibility changes retain the same input and attachment nodes. */
export function renderComposerVisibility({composer, toggle, view = 'work', collapsed = false, dock = 'bottom'}) {
  const visible = !collapsed && (view === 'work' || ['right', 'floating'].includes(dock));
  composer.hidden = !visible;
  toggle.textContent = visible ? 'Hide chat' : 'Show chat';
  toggle.setAttribute('aria-expanded', String(visible));
  return visible;
}

export function connectionInputGuidance(provider) {
  if (provider === 'OLLAMA') return {
    name: 'Local Ollama', transport: 'loopback_http', endpoint: 'http://127.0.0.1:11434',
    credential: false, localSetup: true,
    help: 'Use Local AI setup to start Ollama, download a model, and select it for chat. This configuration form only saves connection details.',
    endpointHelp: 'Ollama on this computer uses http://127.0.0.1:11434. Leave the credential reference blank.'
  };
  const name = CONNECTION_SERVICES.find(([id]) => id === provider)?.[1] ?? 'Custom connection';
  return {
    name, transport: provider === 'OPENAI_API' ? 'OPENAI_API' : provider === 'LOCAL_MPC' ? 'stdio'
      : ['HOSTED_MPC', 'CUSTOM_MCP'].includes(provider) ? 'streamable_http' : 'PLUGIN',
    endpoint: '', credential: true, localSetup: false,
    help: `${name} requires a host adapter. The stock Windows app does not include this connection adapter yet. Saving these fields does not sign in or enable remote access.`,
    endpointHelp: 'Enter only the endpoint, command, or locator supplied by your installed host adapter. A repository URL or account page is not an adapter.'
  };
}

/** Plain text preserves code, line breaks and Unicode for copy/export. */
export function formatChatTranscript(messages = []) {
  if (!Array.isArray(messages)) throw new TypeError('CHAT_MESSAGES_ARRAY_REQUIRED');
  return messages.map(message => {
    const heading = String(message.label ?? (message.role === 'user' ? 'You' : 'MPC Assistant'));
    const detail = message.detail ? ` · ${String(message.detail)}` : '';
    return `${heading}${detail}\n${String(message.text ?? '')}`;
  }).join('\n\n');
}

export function runtimeIdentityLabel(value = {}) {
  const nested = value?.runtime && typeof value.runtime === 'object' ? value.runtime : {};
  const sourceCommit = nested.source_commit ?? value?.source_commit;
  if (typeof sourceCommit === 'string' && sourceCommit.trim()) return `Commit ${sourceCommit.trim()}`;
  const version = value?.app_version ?? value?.service?.app_version ?? value?.service?.build ?? value?.build;
  if (typeof version === 'string' && version.trim()) return `App ${version.trim()} · source commit not reported`;
  return 'Not reported';
}

export function sourceIdentityLabel(source = {}) {
  const id = source.id ?? source.source_id ?? source.source_ref ?? 'unknown source';
  const version = source.version ?? source.native_version ?? 'version unknown';
  const owner = source.owner ?? source.source_owner ?? 'owner unknown';
  return `${owner} · ${id} · ${version}`;
}

/**
 * Flatten host acquisition results into the exact IDs bound to a job.
 * A FILES or FOLDER acquisition can return multiple IDs, either directly in
 * `acquisition_ids` or alongside nested `acquisitions`. The renderer never
 * derives an acquisition ID from question text.
 */
export function collectAcquisitionIds(acquisitionResults) {
  if (!Array.isArray(acquisitionResults)) throw new TypeError('ACQUISITION_RESULTS_ARRAY_REQUIRED');
  const ids = [];
  const seen = new Set();
  const add = value => {
    if (typeof value !== 'string' || !JOB_ID.test(value)) throw new TypeError('INVALID_ACQUISITION_ID');
    if (!seen.has(value)) {
      seen.add(value);
      ids.push(value);
    }
  };
  const visit = result => {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return;
    if (result.acquisition_id !== undefined && result.acquisition_id !== null) add(result.acquisition_id);
    if (result.acquisition_ids !== undefined) {
      if (!Array.isArray(result.acquisition_ids)) throw new TypeError('INVALID_ACQUISITION_IDS');
      for (const id of result.acquisition_ids) add(id);
    }
    if (result.acquisitions !== undefined) {
      if (!Array.isArray(result.acquisitions)) throw new TypeError('INVALID_ACQUISITIONS');
      for (const acquisition of result.acquisitions) visit(acquisition);
    }
  };
  for (const result of acquisitionResults) visit(result);
  return ids;
}

/** Keep instruction text and acquired evidence identities as separate fields. */
export function buildQuestionEvidenceBinding(question, acquisitionResults) {
  const focusedQuestion = typeof question === 'string' ? question.trim() : '';
  if (!focusedQuestion) throw new TypeError('QUESTION_REQUIRED');
  return {question: focusedQuestion, acquisition_ids: collectAcquisitionIds(acquisitionResults)};
}

class WorkspaceRequestError extends Error {
  constructor(code, message, details = null) {
    super(message || code);
    this.name = 'WorkspaceRequestError';
    this.code = code;
    this.details = details;
  }
}

const state = {
  csrf: null,
  bootstrap: null,
  projects: [],
  project: null,
  providerProfiles: [],
  selectedProfileId: null,
  connections: [],
  methods: [],
  attachments: [],
  currentJob: null,
  reports: [],
  selectedReport: null,
  script: null,
  lastAnswer: null,
  visibleMessages: [],
  lastError: null,
  dragDepth: 0,
  pollTimer: null,
  draftTimer: null,
  requestController: null,
  activeView: 'work',
  composerCollapsed: true,
  composerDock: 'right',
  localModelStatus: null,
  setupOperation: null,
  setupController: null
};

const hasDom = typeof document !== 'undefined';
const $ = id => document.getElementById(id);
const array = value => Array.isArray(value) ? value : [];
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const now = () => new Date().toISOString();
const bridge = () => globalThis.window?.mpcWorkspace ?? null;

function node(tag, className = '', text = undefined) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function replace(target, children) {
  target.replaceChildren(...children);
}

function setText(id, value) {
  const target = $(id);
  if (target) target.textContent = String(value ?? '');
}

function statusTone(element, tone = 'neutral') {
  element.classList.remove('good', 'bad', 'warn', 'busy', 'neutral');
  element.classList.add(tone);
}

function announce(message, {assertive = false, tone = ''} = {}) {
  const text = String(message ?? '');
  const region = assertive ? $('assertive-status') : $('toast-region');
  if (assertive) {
    region.textContent = text;
    return;
  }
  const toast = node('div', `toast${tone ? ` ${tone}` : ''}`, text);
  region.append(toast);
  globalThis.setTimeout(() => toast.remove(), 5000);
}

function recordError(error, fallback = 'The requested action could not be completed.') {
  const code = String(error?.code ?? error?.message ?? 'WORKSPACE_ACTION_FAILED');
  const message = String(error?.details?.message ?? error?.message ?? fallback);
  state.lastError = {code, message, at: now(), details: error?.details ?? null};
  $('copy-error').disabled = false;
  announce(`${code}: ${message}`, {assertive: true});
  announce(message, {tone: 'error'});
  return state.lastError;
}

function sameOriginPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new TypeError('API_PATH_REJECTED');
  const url = new URL(path, globalThis.location.origin);
  if (url.origin !== globalThis.location.origin || url.username || url.password || url.hash) throw new TypeError('API_ORIGIN_REJECTED');
  return `${url.pathname}${url.search}`;
}

async function request(path, {method = 'GET', body = undefined, signal = undefined} = {}) {
  const safePath = sameOriginPath(path);
  const headers = {Accept: 'application/json'};
  const options = {method, headers, credentials: 'same-origin', redirect: 'error', signal};
  if (safePath !== API_PATHS.bootstrap) {
    if (!state.csrf) throw new WorkspaceRequestError('WORKSPACE_CSRF_REQUIRED', 'Refresh the local service before accessing workspace data.');
    headers['X-MPC-CSRF'] = state.csrf;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(safePath, options);
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    throw new WorkspaceRequestError('LOCAL_SERVICE_UNREACHABLE', 'The local MPC Workspace service did not answer.', {cause: String(error?.message ?? error)});
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new WorkspaceRequestError('HOST_RESPONSE_TOO_LARGE', 'The local service response exceeded the renderer limit.');
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) throw new WorkspaceRequestError('HOST_RESPONSE_TOO_LARGE', 'The local service response exceeded the renderer limit.');
  let value = {};
  if (raw) {
    try { value = JSON.parse(raw); }
    catch { throw new WorkspaceRequestError('HOST_RESPONSE_INVALID_JSON', 'The local service returned an invalid response.'); }
  }
  if (!response.ok) {
    throw new WorkspaceRequestError(String(value.error ?? `HTTP_${response.status}`), String(value.message ?? `The local service returned ${response.status}.`), value);
  }
  return value;
}

function retentionPolicy() {
  return document.querySelector('input[name="retention"]:checked')?.value ?? state.project?.retention_policy ?? 'METADATA_ONLY';
}

async function sha256Text(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function makeId(prefix) {
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

function currentProjectId() {
  return state.project?.project_id ?? null;
}

function selectedProfile() {
  return state.providerProfiles.find(profile => profile.id === state.selectedProfileId) ?? null;
}

function renderProjectHeader() {
  const project = state.project;
  $('project-picker').value = project?.display_name ?? '';
  setText('work-title', project?.display_name || 'What would you like to work on?');
  setText('project-objective', project?.objective || 'Choose or create a project. Your draft stays visible while you move through the workspace.');
  setText('composer-project', project?.display_name || 'No project');
  const policy = project?.retention_policy;
  const policyInput = policy && document.querySelector(`input[name="retention"][value="${policy}"]`);
  if (policyInput) policyInput.checked = true;
  const resumeState = object(project?.resume_state);
  $('resume-work').disabled = !project || resumeState.resume_required !== true || !resumeState.job?.job_id;
  const hasJob = Boolean(state.currentJob?.job_id);
  $('save-report').disabled = !hasJob;
  $('save-report-secondary').disabled = !hasJob;
}

function renderProjects() {
  const options = state.projects.map(project => {
    const option = node('option');
    option.value = String(project.display_name ?? project.project_id);
    option.dataset.projectId = String(project.project_id);
    return option;
  });
  replace($('project-options'), options);
  renderProjectHeader();
}

function profileOption(profile) {
  const option = node('option');
  option.value = String(profile.id);
  const status = providerAvailabilityLabel(profile);
  option.textContent = `${profile.label ?? profile.model ?? profile.id} — ${status}`;
  option.dataset.availability = status;
  if (status === 'unavailable') {
    option.dataset.unavailable = 'true';
    option.disabled = true;
  }
  return option;
}

function renderProfiles() {
  const placeholder = node('option', '', 'No language model selected — local finite analysis only');
  placeholder.value = '';
  const local = node('optgroup'); local.label = 'Local · on this computer';
  const cloud = node('optgroup'); cloud.label = 'Cloud · configured API access required';
  for (const profile of state.providerProfiles) (profile.provider === 'OLLAMA' ? local : cloud).append(profileOption(profile));
  const options = [placeholder, local, cloud];
  replace($('model-picker'), options);
  $('model-picker').value = state.selectedProfileId ?? '';
  const profile = selectedProfile();
  setText('composer-model', profile ? `${profile.label ?? profile.model} (${providerAvailabilityLabel(profile)})` : 'Finite local analysis · no language model');
  setText('model-observation', profile ? `Requested ${profile.model ?? profile.id}; ${providerAvailabilityLabel(profile)}.` : 'No language model selected.');
}

async function refreshModelProfiles() {
  const value = await request(API_PATHS.bootstrap);
  state.csrf = typeof value.csrf_token === 'string' ? value.csrf_token : state.csrf;
  state.providerProfiles = array(value.provider_profiles?.profiles ?? value.provider_profiles);
  // Refresh availability without replacing project, conversation, draft or attachments.
  renderProfiles();
}

function renderLocalModelStatus(value = state.localModelStatus) {
  if (!value) return;
  const ready = value.ollama?.state === 'READY';
  const operation = state.setupOperation ?? value.active_operation;
  const busy = Boolean(operation);
  setText('local-model-status', ready ? `Ollama is running${value.ollama.version ? ` · ${value.ollama.version}` : ''}.`
    : 'Ollama is not reachable. Install it if needed, then choose Start Ollama.');
  const label = model => `${model?.observed_model ?? model?.model ?? 'Unknown'} · ${model?.installed ? 'installed' : 'not installed'}`;
  setText('local-starter-status', label(value.starter));
  setText('local-mpc-status', label(value.mpc));
  $('local-model-start').disabled = busy || ready;
  $('local-model-pull').disabled = busy || !ready || value.starter?.installed === true;
  $('local-model-create').disabled = busy || !ready || !value.starter?.installed || value.mpc?.installed === true;
  $('local-model-use').disabled = busy || !ready || (!value.mpc?.installed && !value.starter?.installed);
  $('local-model-stop').disabled = !operation?.cancellable;
  $('local-model-refresh').disabled = busy;
}

async function refreshLocalModels() {
  const value = await request(API_PATHS.localModelStatus);
  state.localModelStatus = value;
  renderLocalModelStatus(value);
  await refreshModelProfiles();
  return value;
}

async function openLocalModelSetup() {
  if (!$('local-model-dialog').open) $('local-model-dialog').showModal();
  try { await refreshLocalModels(); }
  catch (error) { setText('local-model-status', error.message ?? 'Local model status is unavailable.'); recordError(error); }
}

/** Read bounded same-origin NDJSON; a truncated stream cannot report completion. */
export async function readSetupEvents(response, onEvent) {
  if (!response.ok || !response.body) throw new WorkspaceRequestError('MODEL_SETUP_HTTP_ERROR', `Local setup returned HTTP ${response.status}.`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let pending = '', total = 0, terminal = false;
  const parse = line => {
    if (!line.trim()) return;
    if (line.length > 262_144) throw new Error('MODEL_SETUP_FRAME_TOO_LARGE');
    const event = JSON.parse(line);
    if (!event || !['start', 'progress', 'done', 'error'].includes(event.type)) throw new Error('MODEL_SETUP_EVENT_INVALID');
    if (terminal) throw new Error('MODEL_SETUP_EVENT_AFTER_COMPLETION');
    terminal = ['done', 'error'].includes(event.type);
    onEvent(event);
  };
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 32_000_000) throw new Error('MODEL_SETUP_RESPONSE_TOO_LARGE');
      pending += decoder.decode(value, {stream: true});
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) { parse(pending.slice(0, newline)); pending = pending.slice(newline + 1); }
      if (pending.length > 262_144) throw new Error('MODEL_SETUP_FRAME_TOO_LARGE');
    }
    pending += decoder.decode();
    if (pending.trim()) parse(pending);
    if (!terminal) throw new Error('MODEL_SETUP_STREAM_INCOMPLETE');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function runLocalModelSetup(operation) {
  if (state.setupOperation || !['start', 'pull', 'create'].includes(operation)) return;
  const requestId = makeId('setup');
  const controller = new AbortController();
  state.setupOperation = {request_id: requestId, operation, cancellable: operation !== 'start'};
  state.setupController = controller;
  renderLocalModelStatus();
  const progress = $('local-model-progress'); progress.hidden = false; progress.removeAttribute('value');
  setText('local-model-progress-text', operation === 'start' ? 'Starting installed Ollama…' : 'Preparing local model…');
  try {
    if (operation === 'start') {
      await request(API_PATHS.localModelStart, {method: 'POST', body: {}, signal: controller.signal});
      setText('local-model-progress-text', 'Start request completed. Checking service status…');
    } else {
      const path = operation === 'pull' ? API_PATHS.localModelPull : API_PATHS.localModelCreate;
      const response = await fetch(sameOriginPath(path), {method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: {'Content-Type': 'application/json; charset=utf-8', Accept: 'application/x-ndjson', 'X-MPC-CSRF': state.csrf},
        body: JSON.stringify({request_id: requestId}), signal: controller.signal});
      await readSetupEvents(response, event => {
        if (event.request_id !== requestId) throw new Error('MODEL_SETUP_REQUEST_MISMATCH');
        if (event.type === 'error') throw new WorkspaceRequestError(event.code ?? event.error?.code ?? 'MODEL_SETUP_FAILED', event.error?.message ?? event.message ?? 'Local model setup failed.');
        const update = event.progress ?? event;
        const detail = update.status ?? update.message ?? (event.type === 'done' ? 'Local model setup completed.' : 'Working…');
        setText('local-model-progress-text', String(detail));
        if (Number.isFinite(update.total) && update.total > 0 && Number.isFinite(update.completed)) {
          progress.value = Math.max(0, Math.min(100, 100 * update.completed / update.total));
        } else if (event.type === 'done') progress.value = 100;
        else progress.removeAttribute('value');
      });
    }
  } catch (error) {
    setText('local-model-progress-text', error.name === 'AbortError' ? 'Setup stopped. Downloaded layers can be reused when you retry.' : error.message ?? 'Local model setup failed.');
    if (error.name !== 'AbortError' && error.code !== 'MPC_WORKSPACE_MODEL_SETUP_CANCELLED') recordError(error);
  } finally {
    state.setupOperation = null; state.setupController = null; progress.hidden = true;
    try { await refreshLocalModels(); } catch (error) { renderLocalModelStatus(); recordError(error); }
  }
}

async function stopLocalModelSetup() {
  const operation = state.setupOperation ?? state.localModelStatus?.active_operation;
  if (!operation?.cancellable) return;
  try {
    await request(API_PATHS.localModelCancel, {method: 'POST', body: {request_id: operation.request_id}});
    state.setupController?.abort();
    setText('local-model-progress-text', 'Stop requested. Downloaded layers remain available for retry.');
    if (!state.setupOperation) await refreshLocalModels();
  } catch (error) { recordError(error); }
}

async function useLocalModel() {
  try {
    await refreshLocalModels();
    const profile = state.providerProfiles.find(row => row.id === 'ollama-mpc-local' && providerAvailabilityLabel(row) === 'available')
      ?? state.providerProfiles.find(row => row.id === 'ollama-qwen3-4b-instruct' && providerAvailabilityLabel(row) === 'available');
    if (!profile) throw new Error('No installed local profile is available. Refresh status after setup.');
    state.selectedProfileId = profile.id; renderProfiles();
    $('local-model-dialog').close(); state.composerCollapsed = false; updateComposerLayout(); $('composer-input').focus();
    announce(`${profile.label} selected. Enter a question to check local inference.`);
  } catch (error) { recordError(error); }
}

function updateServiceStatus(service = {}) {
  const status = String(service.status ?? 'UNAVAILABLE').toUpperCase();
  const ready = ['READY', 'READY_LOCAL', 'READY_LOCAL_ONLY', 'RUNNING', 'HEALTHY'].includes(status);
  setText('service-status', ready ? 'Local service ready' : status === 'UNAVAILABLE' ? 'Local service unavailable' : `Service ${status.toLowerCase()}`);
  statusTone($('service-status'), ready ? 'good' : status === 'UNAVAILABLE' ? 'bad' : 'warn');
  setText('settings-service-state', status);
  setText('settings-database', service.database_name ?? service.database ?? 'Not reported');
  setText('settings-build', service.build ?? service.app_version ?? state.bootstrap?.build?.commit ?? 'Not reported');
}

function updateRuntimeIdentity(runtime = {}) {
  setText('settings-source-commit', runtimeIdentityLabel(runtime));
}

async function refreshRuntimeIdentity() {
  const read = bridge()?.getRuntimeStatus;
  if (typeof read !== 'function') return null;
  try {
    const observed = await read();
    updateRuntimeIdentity(observed);
    return observed;
  } catch {
    return null;
  }
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  setText('network-status', online ? 'Network interface online' : 'Offline');
  statusTone($('network-status'), online ? 'neutral' : 'warn');
}

function renderInventory(data = {}) {
  const inventory = object(data.inventory ?? data.method_inventory);
  setText('inventory-research', inventory.research_methods ?? inventory.research_candidates ?? '—');
  setText('inventory-evaluators', inventory.implemented_evaluators ?? inventory.native_evaluators ?? '—');
}

function renderBootstrap(value) {
  state.bootstrap = value;
  state.csrf = typeof value.csrf_token === 'string' ? value.csrf_token : state.csrf;
  state.projects = array(value.projects);
  state.project = value.project ?? state.projects.find(row => row.project_id === value.selected_project_id) ?? null;
  const profiles = value.provider_profiles?.profiles ?? value.provider_profiles;
  state.providerProfiles = array(profiles);
  state.selectedProfileId = value.selected_provider_profile?.profile_id ?? value.selected_provider_profile_id ?? null;
  state.connections = array(value.connections);
  state.reports = array(value.reports);
  renderProjects();
  renderProfiles();
  renderInventory(value);
  renderConnections();
  renderMethods(array(value.methods));
  renderTasks(array(value.tasks));
  renderReports();
  renderSnapshots(array(value.snapshots ?? value.project?.snapshots));
  renderEvidence(array(value.evidence ?? value.sources ?? value.project?.sources));
  renderConversation(value.project?.conversation);
  updateServiceStatus(value.service ?? {status: 'READY'});
  if (value.resume_state?.job) updateJob(value.resume_state.job, {appendConversation: false});
  else if (value.resume_state?.job_id) state.currentJob = value.resume_state;
  if (state.project?.draft?.text && !$('composer-input').value) $('composer-input').value = state.project.draft.text;
}

async function refreshBootstrap() {
  try {
    const value = await request(API_PATHS.bootstrap);
    renderBootstrap(value);
    updateRuntimeIdentity(value);
    await refreshRuntimeIdentity();
  } catch (error) {
    updateServiceStatus({status: 'UNAVAILABLE'});
    recordError(error, 'The local service is unavailable. Input remains in this window; no provider was contacted.');
    const observed = await refreshRuntimeIdentity();
    if (observed) updateServiceStatus(observed?.service ?? observed);
  }
}

async function createProject(event) {
  event.preventDefault();
  const displayName = $('project-name').value.trim();
  if (!displayName) return;
  const objective = $('project-new-objective').value.trim();
  const retention = document.querySelector('input[name="new-retention"]:checked')?.value ?? 'METADATA_ONLY';
  try {
    const response = await request(API_PATHS.projects, {method: 'POST', body: {
      operation: 'CREATE', project_id: makeId('project'), display_name: displayName, objective, retention_policy: retention
    }});
    state.project = response.project ?? response;
    state.projects = array(response.projects).length ? response.projects : [...state.projects, state.project];
    state.currentJob = null;
    state.reports = array(state.project?.reports);
    state.connections = array(state.project?.connections);
    state.selectedProfileId = state.project?.selected_provider_profile_id || null;
    state.script = null;
    resetEvidenceSelection();
    renderProjects();
    renderProfiles();
    renderConnections();
    renderConversation(state.project?.conversation);
    renderReports();
    renderTasks(array(state.project?.tasks));
    renderSnapshots(array(state.project?.snapshots));
    renderEvidence(array(state.project?.sources));
    resetJobView();
    $('project-dialog').close();
    announce(`Project “${displayName}” created locally.`);
  } catch (error) { recordError(error); }
}

async function openProjectByPicker() {
  const selected = $('project-picker').value.trim();
  const project = state.projects.find(row => row.project_id === selected || row.display_name === selected);
  if (!project || project.project_id === currentProjectId()) return;
  try {
    const response = await request(entityApiPath('projects', project.project_id, 'open'), {method: 'POST', body: {project_id: project.project_id}});
    state.project = response.project ?? project;
    state.currentJob = state.project?.resume_state?.job ?? response.resume_state?.job ?? response.current_job ?? null;
    state.reports = array(state.project?.reports ?? response.reports);
    state.connections = array(state.project?.connections);
    state.selectedProfileId = state.project?.selected_provider_profile_id || null;
    state.script = null;
    resetEvidenceSelection();
    $('composer-input').value = state.project?.draft?.text ?? '';
    renderProjectHeader();
    renderProfiles();
    renderConnections();
    renderConversation(state.project?.conversation);
    renderReports();
    renderTasks(array(state.project?.tasks ?? response.tasks));
    renderSnapshots(array(state.project?.snapshots ?? response.snapshots));
    renderEvidence(array(state.project?.sources ?? response.evidence));
    if (state.currentJob) updateJob(state.currentJob, {appendConversation: false});
    else resetJobView();
    announce(`Opened ${state.project.display_name}.`);
  } catch (error) { recordError(error); }
}

async function saveDraft() {
  const projectId = currentProjectId();
  if (!projectId) return;
  const text = $('composer-input').value;
  const policy = retentionPolicy();
  const digest = await sha256Text(text);
  if (currentProjectId() !== projectId) return;
  setText('draft-state', 'SAVING');
  try {
    await request(entityApiPath('projects', projectId, 'draft'), {method: 'POST', body: {
      project_id: projectId, text, text_sha256: digest,
      utf8_bytes: new TextEncoder().encode(text).byteLength, retention_policy: policy
    }});
    if (currentProjectId() !== projectId) return;
    setText('draft-state', policy === 'RETAIN_TEXT' ? 'DRAFT SAVED LOCALLY' : 'DIGEST SAVED · TEXT IN WINDOW');
  } catch (error) {
    setText('draft-state', 'DRAFT NOT SAVED');
    recordError(error);
  }
}

function queueDraftSave() {
  setText('draft-state', 'DRAFT CHANGED');
  globalThis.clearTimeout(state.draftTimer);
  state.draftTimer = globalThis.setTimeout(saveDraft, 700);
}

function attachmentChip(attachment) {
  const chip = node('div', 'attachment-chip');
  chip.dataset.attachmentId = attachment.client_id;
  const label = node('span', '', `${attachment.kind === 'FOLDER' ? 'Folder' : 'File'} · ${attachment.name}${attachment.size != null ? ` · ${formatBytes(attachment.size)}` : ''}`);
  const remove = node('button', '', '×');
  remove.type = 'button';
  remove.setAttribute('aria-label', `Remove ${attachment.name}`);
  remove.addEventListener('click', () => {
    state.attachments = state.attachments.filter(row => row.client_id !== attachment.client_id);
    renderAttachments();
  });
  chip.append(label, remove);
  return chip;
}

function renderAttachments() {
  const tray = $('attachment-tray');
  if (!state.attachments.length) {
    replace(tray, [node('span', 'tray-placeholder', 'Drop text or files here, or use an attachment control.')]);
    return;
  }
  replace(tray, state.attachments.map(attachmentChip));
}

function resetEvidenceSelection() {
  state.attachments = [];
  state.dragDepth = 0;
  const material = $('material-input');
  const browserFiles = $('browser-file-input');
  if (material) material.value = '';
  if (browserFiles) browserFiles.value = '';
  $('composer')?.classList.remove('dragging');
  renderAttachments();
}

function addFileObjects(files) {
  for (const file of array(Array.from(files ?? []))) {
    state.attachments.push({client_id: makeId('attachment'), kind: 'BROWSER_FILE', name: file.name, size: file.size, type: file.type, file, state: 'SELECTED'});
  }
  renderAttachments();
  announce(`${files.length} file${files.length === 1 ? '' : 's'} selected. Files have not executed or left this computer.`);
}

async function attachFiles() {
  const choose = bridge()?.chooseFiles;
  if (typeof choose === 'function') {
    try {
      const result = await choose();
      const paths = array(result?.paths);
      for (const item of paths) {
        const entry = typeof item === 'string' ? {path: item, name: item.split(/[\\/]/u).at(-1)} : item;
        if (!entry?.path) continue;
        state.attachments.push({client_id: makeId('attachment'), kind: 'DESKTOP_FILE', name: entry.name ?? 'Selected file', size: entry.size ?? null, type: entry.type ?? '', path: entry.path, state: 'SELECTED'});
      }
      renderAttachments();
      if (paths.length) announce(`${paths.length} file${paths.length === 1 ? '' : 's'} selected for this project.`);
      return;
    } catch (error) { recordError(error); return; }
  }
  $('browser-file-input').click();
}

async function addFolder() {
  const choose = bridge()?.chooseFolder;
  if (typeof choose !== 'function') {
    announce('Whole-folder indexing requires the MPC Workspace desktop shell. Browser mode can still attach selected files.', {tone: 'warn'});
    return;
  }
  try {
    const result = await choose();
    if (result?.cancelled || !result?.path) return;
    state.attachments.push({client_id: makeId('attachment'), kind: 'FOLDER', name: result.name ?? result.path.split(/[\\/]/u).at(-1) ?? 'Selected folder', path: result.path,
      include_subfolders: result.include_subfolders ?? true, exclusions: array(result.exclusions), state: 'SELECTED'});
    renderAttachments();
    announce('Folder selected for bounded in-place indexing. Original files will not be moved or deleted.');
  } catch (error) { recordError(error); }
}

function insertAtSelection(input, value) {
  const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
  const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
  input.setRangeText(value, start, end, 'end');
  input.dispatchEvent(new Event('input', {bubbles: true}));
  input.focus();
}

async function pasteTextInto(target) {
  let text;
  try {
    const read = bridge()?.readClipboardText;
    if (typeof read === 'function') {
      const result = await read();
      text = typeof result === 'string' ? result : result?.text;
    } else if (navigator.clipboard?.readText) text = await navigator.clipboard.readText();
    else throw new Error('CLIPBOARD_API_UNAVAILABLE');
    if (typeof text !== 'string') throw new Error('CLIPBOARD_TEXT_UNAVAILABLE');
    if (target === 'material-input') { $('advanced-chat').open = true; $('evidence-input-details').open = true; }
    insertAtSelection($(target), text);
    announce(`Pasted ${formatBytes(new TextEncoder().encode(text).byteLength)} of text after your explicit action.`);
  } catch (error) {
    recordError(new WorkspaceRequestError('CLIPBOARD_READ_UNAVAILABLE', 'Use Ctrl+V in the composer, or allow clipboard access for this explicit Paste action.', {cause: String(error?.message ?? error)}));
  }
}

async function pasteInput() { return pasteTextInto('material-input'); }

async function fileAsBase64(file) {
  if (file.size > MAX_BROWSER_FILE_BYTES) throw new WorkspaceRequestError('BROWSER_FILE_TOO_LARGE', `${file.name} exceeds the ${formatBytes(MAX_BROWSER_FILE_BYTES)} browser-import limit. Use the desktop Attach files action for bounded host streaming.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

async function acquireAttachment(attachment, projectId = currentProjectId(), policy = retentionPolicy()) {
  let body = {project_id: projectId, retention_policy: policy, client_id: attachment.client_id};
  if (attachment.kind === 'FOLDER') body = {...body, kind: 'FOLDER', root_path: attachment.path, include_subfolders: attachment.include_subfolders, exclusions: attachment.exclusions, index_in_place: true};
  else if (attachment.kind === 'DESKTOP_FILE') body = {...body, kind: 'FILE', file_path: attachment.path};
  else body = {...body, kind: 'FILES', files: [{name: attachment.name,
    media_type: attachment.type || 'application/octet-stream', byte_length: attachment.size,
    bytes_base64: await fileAsBase64(attachment.file)}]};
  const response = await request(API_PATHS.inputs, {method: 'POST', body, signal: state.requestController?.signal});
  const result = response.input ?? response;
  attachment.state = result.status ?? 'ACQUIRED';
  attachment.acquisition_id = result.acquisition_id;
  return result;
}

async function acquireEvidenceText(text, projectId = currentProjectId(), policy = retentionPolicy()) {
  if (!text) return null;
  const response = await request(API_PATHS.inputs, {method: 'POST', body: {
    project_id: projectId, kind: 'TEXT', name: 'Pasted evidence material', content: text,
    retention_policy: policy, detected_format_hint: 'AUTO'
  }, signal: state.requestController?.signal});
  return response.input ?? response;
}

function appendMessage(role, text, metadata = {}) {
  const log = $('conversation');
  log.querySelector('.empty-state')?.remove();
  const message = node('article', `message ${role}`);
  const meta = node('div', 'message-meta');
  meta.append(node('strong', '', metadata.label ?? (role === 'user' ? 'You' : role === 'error' ? 'Error' : 'MPC Workspace')),
    node('span', '', metadata.detail ?? new Date().toLocaleTimeString()));
  message.append(meta, node('div', '', text));
  log.append(message);
  state.visibleMessages.push({role, text: String(text), label: metadata.label ?? (role === 'user' ? 'You' : role === 'error' ? 'Error' : 'MPC Workspace'), detail: metadata.detail ?? ''});
  log.scrollTop = log.scrollHeight;
}

function renderConversation(conversation) {
  const messages = array(conversation?.messages);
  const log = $('conversation');
  state.lastAnswer = null;
  state.visibleMessages = [];
  $('copy-answer').disabled = true;
  if (!messages.length) {
    const empty = node('div', 'empty-state');
    empty.append(node('div', 'landscape-icon', '⌁'), node('h3', '', 'Ask, or bring the record into view'),
      node('p', '', 'Ask an ordinary question with the selected local model, or add material for source-bound analysis.'));
    replace(log, [empty]);
    return;
  }
  replace(log, []);
  for (const message of messages) {
    const role = message.role === 'user' ? 'user' : message.status === 'ERROR' ? 'error' : 'observation';
    appendMessage(role, message.content ?? '[Content was not retained]', {
      label: message.role === 'user' ? 'You' : `MPC Workspace · ${message.status ?? 'UNKNOWN'}`,
      detail: message.model ?? message.created_at ?? ''
    });
    if (message.role === 'assistant' && message.status === 'COMPLETE' && typeof message.content === 'string') {
      state.lastAnswer = message.content;
    }
  }
  $('copy-answer').disabled = !state.lastAnswer;
}

function refreshOutput() {
  const value = $('output-mode').value === 'transcript' ? formatChatTranscript(state.visibleMessages) : state.lastAnswer ?? '';
  $('output-text').value = value;
  setText('output-size', `${formatBytes(new TextEncoder().encode(value).byteLength)} · plain text`);
  for (const id of ['copy-output', 'save-output', 'select-output']) $(id).disabled = !value;
}

function openOutput() {
  refreshOutput(); $('output-dialog').showModal();
}

function setRunning(running) {
  $('run-work').disabled = running;
  $('stop-work').disabled = !running;
  $('stop-work').hidden = !running;
  $('conversation-state').textContent = running ? 'RUNNING' : 'READY';
  statusTone($('work-stage'), running ? 'busy' : 'neutral');
}

function countFromJob(job, name) {
  const counts = object(job.counts ?? job.progress);
  if (name === 'acquired') return clampCount(counts.acquired ?? counts.acquired_count ?? counts.acquired_records);
  if (name === 'analyzed') return clampCount(counts.analyzed ?? counts.analyzed_count ??
    (job.model_result?.proposal || job.model_result?.status === 'CONVERSATION_COMPLETE' ? 1 : job.finite_method_receipt ? 1 : 0));
  if (name === 'decided') return clampCount(counts.decided ?? counts.decided_count ?? (job.decision ? 1 : 0));
  return 0;
}

function renderFacts(job) {
  const facts = array(job.fact_summary).map(value => typeof value === 'string' ? value : value?.text).filter(Boolean);
  setText('fact-count', facts.length);
  replace($('facts-list'), facts.length ? facts.map((fact, index) => {
    const card = node('div', 'list-card');
    card.append(node('div', 'meta', `FACT ${index + 1}`), node('p', '', fact));
    return card;
  }) : [node('div', 'empty-row', 'No source-supported facts were returned.')]);
}

function methodCard(method) {
  const card = node('div', 'list-card');
  const id = method.method_id ?? method.method ?? method.id ?? 'UNKNOWN_METHOD';
  card.append(node('div', 'meta', id), node('strong', '', method.method_name ?? method.name ?? id));
  card.append(node('p', '', method.method_reason ?? method.applicability_explanation ?? method.required_input ?? 'No applicability explanation returned.'));
  const stateLabel = method.execution ?? method.implementation_state ?? method.input_readiness ?? 'NOT_EXECUTED';
  card.append(node('span', 'micro-state', stateLabel));
  return card;
}

function renderWorkMethods(job) {
  const methods = array(job.method_candidates ?? job.selected_methods ?? job.router_receipt?.selected_methods);
  const cards = [];
  const receipt = object(job.finite_method_receipt);
  if (receipt.tool) {
    const exact = object(receipt.exact_comparison_receipt);
    cards.push(methodCard({method_id: receipt.result?.method ?? receipt.tool,
      name: receipt.result?.method ? `${receipt.result.method} native evaluator` : receipt.tool,
      applicability_explanation: exact.comparison?.classification
        ? `Exact review: ${exact.comparison.classification} · ${exact.review_scope ?? 'bounded review'}`
        : receipt.exact_review_error_code ?? 'Native result retained without an applicable exact numerical review.',
      implementation_state: receipt.status}));
  }
  cards.push(...methods.slice(0, Math.max(0, 12 - cards.length)).map(methodCard));
  setText('method-count', cards.length);
  replace($('work-methods-list'), cards.length ? cards : [node('div', 'empty-row', 'No applicable method was returned.')]);
}

function sourceCard(source) {
  const card = node('div', 'list-card');
  card.append(node('strong', '', sourceIdentityLabel(source)), node('div', 'meta', source.native_locator ?? source.locator ?? 'Locator not reported'));
  const stateLabel = source.state ?? source.acquisition_state ?? source.status ?? 'UNKNOWN';
  card.append(node('span', 'micro-state', stateLabel));
  return card;
}

function renderWorkSources(job) {
  const sources = array(job.sources ?? job.source_records ?? job.router_receipt?.workflow?.source_records);
  setText('source-count', sources.length);
  replace($('work-sources-list'), sources.length ? sources.map(sourceCard) : [node('div', 'empty-row', 'No source was used by this job.')]);
}

function modelMessage(job) {
  const result = object(job.model_result);
  if (result.status === 'CONVERSATION_COMPLETE' && typeof result.answer === 'string') {
    return {text: result.answer, label: `Local conversation · ${result.observed_model ?? result.model ?? 'model identity not returned'}`};
  }
  if (['CANCELLED', 'CONVERSATION_INCOMPLETE'].includes(result.status) && typeof result.answer === 'string' && result.answer) {
    return {text: result.answer, label: `Partial local answer · ${result.status}`};
  }
  if (result.status === 'MODEL_PROPOSAL_READY' && result.proposal?.interpretation) {
    const observed = result.observed_model ?? result.model ?? 'model identity not returned';
    return {text: result.proposal.interpretation, label: `Model observation · ${observed}`};
  }
  const receipt = object(job.finite_method_receipt);
  if (receipt.status === 'SUCCEEDED') {
    const exact = object(receipt.exact_comparison_receipt);
    const classification = exact.comparison?.classification ?? 'No exact numerical adapter applies';
    return {text: `Native evaluator completed: ${receipt.result?.method ?? receipt.tool}.\nExact comparison: ${classification}.\n${JSON.stringify(exact.exact_result ?? receipt.result?.result ?? null, null, 2)}`,
      label: 'Native MPC evaluator'};
  }
  if (result.status && result.status !== 'EVIDENCE_ACTION_READY') {
    const detail = result.model_error_code ? ` (${result.model_error_code})` : '';
    return {text: `Selected model result: ${result.status}${detail}. Local source routing remains available.`, label: 'Model status'};
  }
  const facts = array(job.fact_summary);
  const next = job.next_action?.description ?? job.next_action?.title;
  if (facts.length || next) return {text: [...facts, next ? `Next: ${next}` : null].filter(Boolean).join('\n'), label: 'MPC router'};
  return null;
}

function updateJob(job, {appendConversation = true} = {}) {
  state.currentJob = job;
  const jobState = String(job.job_state ?? job.status ?? job.work_stage ?? 'UNKNOWN').toUpperCase();
  setText('work-stage', job.work_stage ?? jobState);
  statusTone($('work-stage'), TERMINAL_JOB_STATES.has(jobState) ? (['FAILED', 'BLOCKED', 'CANCELLED'].includes(jobState) ? 'warn' : 'good') : 'busy');
  setText('job-action', job.action_label ?? job.next_action?.title ?? job.operation_name ?? 'Processing source-bound work');
  const acquired = countFromJob(job, 'acquired'), analyzed = countFromJob(job, 'analyzed'), decided = countFromJob(job, 'decided');
  setText('count-acquired', acquired); setText('count-analyzed', analyzed); setText('count-decided', decided);
  const total = clampCount(job.progress?.required ?? job.progress?.required_records ?? job.counts?.total);
  const completed = clampCount(job.progress?.completed ?? acquired + analyzed + decided);
  $('job-progress-bar').style.width = `${total ? Math.min(100, Math.round(completed / total * 100)) : TERMINAL_JOB_STATES.has(jobState) ? 100 : 20}%`;
  setText('next-action-title', job.next_action?.title ?? 'No next action returned');
  setText('next-action-detail', job.next_action?.description ?? job.next_action?.completion_condition ?? 'Review the saved receipt before continuing.');
  setText('job-receipt', job.receipt_id ?? job.checkpoint?.checkpoint_id ?? job.job_id ?? 'No receipt identity returned');
  renderFacts(job); renderWorkMethods(job); renderWorkSources(job);
  $('save-report').disabled = !job.job_id;
  $('save-report-secondary').disabled = !job.job_id;
  $('resume-work').disabled = !(job.job_id && (job.resume_required === true || jobState === 'BLOCKED'));
  setRunning(!TERMINAL_JOB_STATES.has(jobState));
  if (appendConversation) {
    const message = modelMessage(job);
    if (message) {
      appendMessage('observation', message.text, {label: message.label, detail: job.model_result?.provider ?? job.work_stage ?? jobState});
      if (job.model_result?.status === 'CONVERSATION_COMPLETE') {
        state.lastAnswer = message.text;
        $('copy-answer').disabled = false;
      }
    }
  }
  if (!TERMINAL_JOB_STATES.has(jobState) && job.job_id) scheduleJobPoll(job.job_id, job.project_id ?? currentProjectId());
  else globalThis.clearTimeout(state.pollTimer);
}

function resetJobView() {
  globalThis.clearTimeout(state.pollTimer);
  state.currentJob = null;
  state.selectedReport = null;
  setText('work-stage', 'IDLE'); setText('job-action', 'No active job');
  setText('count-acquired', 0); setText('count-analyzed', 0); setText('count-decided', 0);
  $('job-progress-bar').style.width = '0%';
  setText('next-action-title', 'Attach a record or paste text');
  setText('next-action-detail', 'No external action has been performed.');
  setText('job-receipt', 'No job receipt');
  renderFacts({}); renderWorkMethods({}); renderWorkSources({});
  setText('search-coverage', 'No search run'); setText('search-result-count', 0);
  replace($('search-results'), [node('div', 'empty-row', 'Run a search to see exact source identities and coverage.')]);
  setText('snapshot-status', 'No comparison run. Partial inventory cannot establish removal.');
  $('snapshot-counts').hidden = true;
  replace($('snapshot-results'), []);
  setText('report-preview-title', 'Preview'); setText('report-preview-state', 'Nothing selected');
  setText('report-preview', 'Choose a saved report.');
  $('copy-report').disabled = true; $('export-report').disabled = true;
  $('resume-work').disabled = true;
  setRunning(false);
}

function scheduleJobPoll(jobId, projectId) {
  globalThis.clearTimeout(state.pollTimer);
  state.pollTimer = globalThis.setTimeout(async () => {
    try {
      const response = await request(`${jobApiPath(jobId)}?project_id=${encodeURIComponent(projectId)}`);
      if (currentProjectId() !== projectId) return;
      updateJob(response.job ?? response, {appendConversation: false});
    }
    catch (error) { setRunning(false); recordError(error); }
  }, 900);
}

async function runWork() {
  if (!currentProjectId()) {
    announce('Create or open a project before running work.', {tone: 'warn'});
    $('new-project').focus();
    return;
  }
  const projectId = currentProjectId();
  const projectName = state.project.display_name;
  const selectedTaskId = state.project.selected_task_id;
  const policy = retentionPolicy();
  const attachments = [...state.attachments];
  const question = $('composer-input').value.trim();
  const material = $('material-input').value;
  const requestedMode = $('work-mode').value;
  if (!question) {
    announce('Enter one focused question before running work.', {tone: 'warn'});
    $('composer-input').focus();
    return;
  }
  const hasSelectedEvidence = Boolean(material) || attachments.length > 0;
  if (requestedMode === 'CHAT' && hasSelectedEvidence) {
    announce('Chat mode does not consume evidence. Choose Auto or Evidence analysis to bind the selected material.', {tone: 'warn'});
    return;
  }
  const maximumAcquisitions = (material ? 1 : 0) + attachments.reduce((count, attachment) =>
    count + (attachment.kind === 'FOLDER' ? 24 : 1), 0);
  if (requestedMode !== 'CHAT' && maximumAcquisitions > 32) {
    announce('This selection could produce more than 32 route-ready records. Remove files or analyze one folder at a time.', {tone: 'warn'});
    return;
  }
  const requestController = new AbortController();
  state.requestController = requestController;
  setRunning(true);
  setText('job-action', 'Acquiring selected input');
  appendMessage('user', question || `[${attachments.length} selected attachment${attachments.length === 1 ? '' : 's'}]`, {detail: projectName});
  try {
    const acquisitions = [];
    const textAcquisition = await acquireEvidenceText(material, projectId, policy);
    if (textAcquisition) acquisitions.push(textAcquisition);
    for (const attachment of attachments) acquisitions.push(await acquireAttachment(attachment, projectId, policy));
    const invalid = acquisitions.filter(item => item?.parse?.status === 'ERROR');
    if (invalid.length) announce(`${invalid.length} input${invalid.length === 1 ? '' : 's'} retained with visible parse errors.`, {tone: 'warn'});
    setText('job-action', 'Routing acquired evidence');
    const profile = selectedProfile();
    const binding = buildQuestionEvidenceBinding(question, acquisitions);
    const operationMode = requestedMode === 'AUTO'
      ? binding.acquisition_ids.length ? 'EVIDENCE_ANALYSIS' : 'CHAT'
      : requestedMode;
    const jobId = makeId('job');
    updateJob({job_id: jobId, job_state: 'RUNNING', work_stage: 'ACQUISITION',
      action_label: 'Routing acquired evidence', progress: {acquired_count: collectAcquisitionIds(acquisitions).length, total_count: 3}},
    {appendConversation: false});
    const response = await request(API_PATHS.jobs, {method: 'POST', body: {
      operation: 'START', project_id: projectId, job_id: jobId,
      task_id: selectedTaskId ?? makeId('task'),
      ...binding, operation_mode: operationMode,
      provider_profile_id: profile?.id ?? null, provider_selection_observation: profile?.observation ?? null,
      provider_availability: profile?.availability ?? null,
      idempotency_key: makeId('job-request'), retention_policy: policy
    }, signal: requestController.signal});
    const job = response.job ?? response;
    const detail = await request(entityApiPath('projects', projectId));
    if (currentProjectId() !== projectId) return;
    state.project = detail.project ?? state.project;
    state.reports = array(state.project?.reports);
    state.connections = array(state.project?.connections);
    renderConversation(state.project?.conversation);
    renderReports();
    renderConnections();
    renderTasks(array(state.project?.tasks));
    renderSnapshots(array(state.project?.snapshots));
    renderEvidence(array(state.project?.sources));
    updateJob(job, {appendConversation: operationMode !== 'CHAT'});
    if (operationMode === 'CHAT' && job.model_result?.status === 'CONVERSATION_COMPLETE') {
      $('composer-input').value = '';
      await saveDraft();
    }
    if (job.state === 'COMPLETE') resetEvidenceSelection();
  } catch (error) {
    setRunning(false);
    if (error?.name === 'AbortError') announce('The local request was stopped. Any already observed external effect remains in its receipt.', {tone: 'warn'});
    else {
      recordError(error);
      appendMessage('error', error?.message ?? 'The job failed.', {label: error?.code ?? 'Job error'});
    }
  } finally {
    if (state.requestController === requestController) state.requestController = null;
  }
}

async function stopWork() {
  const jobId = state.currentJob?.job_id;
  state.requestController?.abort();
  if (!jobId) { setRunning(false); return; }
  try {
    const result = await request(jobApiPath(jobId, 'cancel'), {method: 'POST', body: {project_id: currentProjectId(), reason: 'USER_REQUESTED'}});
    updateJob(result.job ?? result);
    announce('Cancellation receipt recorded. Already observed effects, if any, remain visible.');
  } catch (error) { setRunning(false); recordError(error); }
}

async function resumeWork() {
  const jobId = state.currentJob?.job_id ?? state.project?.resume_state?.job?.job_id ??
    state.bootstrap?.resume_state?.job?.job_id;
  if (!jobId) return;
  try {
    setRunning(true);
    const result = await request(jobApiPath(jobId, 'resume'), {method: 'POST', body: {project_id: currentProjectId(), checkpoint_id: state.currentJob?.checkpoint?.checkpoint_id ?? state.project?.resume_state?.job?.checkpoint?.checkpoint_id ?? state.bootstrap?.resume_state?.job?.checkpoint?.checkpoint_id ?? null,
      resume_reason: 'USER_REQUESTED_RESUME'}});
    updateJob(result.job ?? result);
    announce('Resumed from the saved checkpoint without repeating completed work.');
  } catch (error) { setRunning(false); recordError(error); }
}

async function saveReport() {
  if (!state.currentJob?.job_id) return;
  try {
    const response = await request(API_PATHS.reports, {method: 'POST', body: {
      operation: 'CREATE', project_id: currentProjectId(), job_id: state.currentJob.job_id,
      title: `${state.project?.display_name ?? 'MPC Workspace'} report`, formats: ['MARKDOWN', 'JSON', 'PRINTABLE_HTML']
    }});
    const report = response.report ?? response;
    state.reports = [report, ...state.reports.filter(row => row.report_id !== report.report_id)];
    renderReports();
    announce(`Saved report ${report.report_id ?? ''} locally.`);
  } catch (error) { recordError(error); }
}

function reportCard(report) {
  const card = node('button', 'list-card');
  card.type = 'button';
  card.append(node('strong', '', report.title ?? report.report_id ?? 'Untitled report'), node('div', 'meta', `${report.report_state ?? report.state ?? 'DRAFT'} · ${report.artifact_sha256?.slice(0, 16) ?? 'hash pending'}`));
  card.addEventListener('click', () => openReport(report));
  return card;
}

function renderReports() {
  replace($('reports-list'), state.reports.length ? state.reports.map(reportCard) : [node('div', 'empty-row', 'No saved reports.')]);
}

async function openReport(report) {
  try {
    const response = report.content || report.markdown ? report : await request(entityApiPath('reports', report.report_id));
    state.selectedReport = response.report ?? response;
    setText('report-preview-title', state.selectedReport.title ?? 'Report');
    setText('report-preview-state', `${state.selectedReport.report_state ?? state.selectedReport.state ?? 'DRAFT'} · source-bound local artifact`);
    setText('report-preview', state.selectedReport.formats?.markdown ?? state.selectedReport.markdown ?? state.selectedReport.content ?? JSON.stringify(state.selectedReport, null, 2));
    $('copy-report').disabled = false;
    $('export-report').disabled = false;
  } catch (error) { recordError(error); }
}

async function copyText(value, label = 'Text') {
  try {
    const copy = bridge()?.copyText;
    if (typeof copy === 'function') await copy(String(value));
    else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(String(value));
    else throw new Error('CLIPBOARD_WRITE_UNAVAILABLE');
    announce(`${label} copied.`);
  } catch (error) { recordError(new WorkspaceRequestError('CLIPBOARD_WRITE_UNAVAILABLE', 'Select the text and use Ctrl+C.', {cause: String(error?.message ?? error)})); }
}

function downloadText(name, content, type = 'text/plain') {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name.replace(/[^A-Za-z0-9._ -]/gu, '_').slice(0, 180);
  link.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function runSearch() {
  if (!currentProjectId()) return announce('Open a project before searching.', {tone: 'warn'});
  const query = $('search-query').value.trim();
  if (!query) return $('search-query').focus();
  const scopes = Array.from(document.querySelectorAll('input[name="search-scope"]:checked'), item => item.value);
  try {
    const response = await request(API_PATHS.search, {method: 'POST', body: {project_id: currentProjectId(), query, scopes,
      filters: {kind: $('search-kind').value || null, status: $('search-status').value || null, time: $('search-time').value || null}}});
    const results = array(response.results);
    const unavailable = array(response.unavailable);
    setText('search-result-count', results.length);
    setText('search-coverage', `${response.coverage?.status ?? response.coverage ?? 'Coverage not reported'} · ${unavailable.length ? `${unavailable.length} selected remote scope${unavailable.length === 1 ? '' : 's'} unavailable` : 'answered by local project'}`);
    const rows = results.map(result => {
      const row = node('article', 'search-result');
      const body = node('div');
      body.append(node('strong', '', sourceIdentityLabel(result)), node('div', 'meta', result.locator ?? 'No locator'), node('p', '', result.excerpt ?? 'No retained excerpt.'));
      const actions = node('div', 'button-row');
      const open = node('button', 'button compact', 'Open native source');
      open.type = 'button';
      open.disabled = !result.open_action_available;
      open.addEventListener('click', () => announce(result.open_action_available ? 'Native source open requested through its owner adapter.' : 'No native open operation is available.', {tone: result.open_action_available ? '' : 'warn'}));
      actions.append(node('span', 'micro-state', result.status ?? 'UNKNOWN'), open);
      row.append(body, actions);
      return row;
    });
    for (const item of unavailable) {
      const row = node('article', 'search-result unavailable');
      row.append(node('div', '', `${item.scope ?? 'Remote scope'} unavailable`),
        node('p', 'meta', item.next_action ?? 'Configure and test this provider for the selected project.'));
      rows.push(row);
    }
    replace($('search-results'), rows.length ? rows : [node('div', 'empty-row', 'No matching acquired sources.')]);
  } catch (error) { recordError(error); }
}

function renderEvidence(evidence, coverage = state.project?.source_coverage) {
  const rows = evidence.length ? evidence.map(item => {
    const card = node('article', 'list-card');
    card.append(node('div', 'meta', sourceIdentityLabel(item.source ?? item)), node('strong', '', item.atom_type ?? item.title ?? 'Evidence record'));
    if (item.excerpt ?? item.quote) card.append(node('p', 'evidence-quote', item.excerpt ?? item.quote));
    card.append(node('p', '', `State: ${item.evidence_state ?? item.state ?? 'UNKNOWN'} · Actor/capacity: ${item.actor ?? 'unknown'} / ${item.capacity ?? 'unknown'}`));
    if (array(item.dependencies).length) card.append(node('div', 'meta', `Dependencies: ${item.dependencies.join(', ')}`));
    return card;
  }) : [node('div', 'empty-row', 'No project evidence acquired.')];
  if (coverage?.truncated === true) rows.unshift(node('div', 'boundary-note',
    `Showing ${coverage.returned} of ${coverage.total} source records. Search covers the retained-text index; the ledger is a bounded first page.`));
  replace($('evidence-ledger'), rows);
}

function renderSnapshots(snapshots) {
  for (const id of ['snapshot-left', 'snapshot-right']) {
    const placeholder = node('option', '', 'Choose an acquired snapshot');
    placeholder.value = '';
    replace($(id), [placeholder, ...snapshots.map(snapshot => {
      const option = node('option', '', `${snapshot.label ?? snapshot.snapshot_id} · ${snapshot.source_id?.owner ?? snapshot.source_owner ?? 'unknown source'}`);
      option.value = String(snapshot.snapshot_id);
      return option;
    })]);
  }
}

async function compareSnapshots() {
  const left = $('snapshot-left').value, right = $('snapshot-right').value;
  if (!left || !right) return announce('Choose two acquired snapshot manifests.', {tone: 'warn'});
  try {
    const response = await request(API_PATHS.snapshotCompare, {method: 'POST', body: {project_id: currentProjectId(), left_snapshot_id: left, right_snapshot_id: right}});
    const result = response.comparison ?? response;
    const changes = object(result.changes);
    $('snapshot-counts').hidden = false;
    for (const kind of ['added', 'removed', 'changed', 'unknown']) setTextForSelector(`[data-snapshot-count="${kind}"]`, array(changes[kind]).length);
    const partial = result.coverage?.complete === false || result.coverage?.status === 'PARTIAL';
    setText('snapshot-status', `${partial ? 'PARTIAL COVERAGE — omitted files remain unknown' : 'Complete declared inventory'} · version-only changes are included within Changed.`);
    const rows = ['added', 'removed', 'changed', 'unknown'].flatMap(kind => array(changes[kind]).map(item => ({kind, item})));
    replace($('snapshot-results'), rows.length ? rows.map(({kind, item}) => {
      const card = node('div', 'list-card');
      card.append(node('div', 'meta', kind.toUpperCase()), node('strong', '', item.path ?? sourceIdentityLabel(item.source_id ?? item)), node('p', '', item.reason ?? item.change_reason ?? 'Exact manifest delta'));
      return card;
    }) : [node('div', 'empty-row', 'No manifest changes returned.')]);
  } catch (error) { recordError(error); }
}

function setTextForSelector(selector, value) {
  const target = document.querySelector(selector);
  if (target) target.textContent = String(value);
}

function renderMethods(methods) {
  state.methods = array(methods);
  const term = $('method-search')?.value.trim().toLowerCase() ?? '';
  const implementedOnly = $('method-implemented-only')?.checked ?? false;
  const selected = state.methods.filter(method => {
    const implemented = ['IMPLEMENTED', 'EXECUTABLE', 'NATIVE', 'COMPUTATION'].includes(String(method.implementation_state ?? method.status ?? method.level).toUpperCase());
    const haystack = [method.method_id, method.id, method.method_name, method.name, method.family, method.required_input, ...array(method.dimensions)].join(' ').toLowerCase();
    return (!implementedOnly || implemented) && (!term || haystack.includes(term));
  });
  replace($('methods-list'), selected.length ? selected.map(method => {
    const card = node('article', 'method-card');
    const id = method.method_id ?? method.id ?? 'UNKNOWN';
    card.append(node('div', 'method-id', id), node('h3', '', method.method_name ?? method.name ?? id), node('p', '', method.applicability_explanation ?? method.required_input ?? 'No applicability detail returned.'));
    card.append(node('span', 'micro-state', method.implementation_state ?? method.level ?? 'CANDIDATE'));
    return card;
  }) : [node('div', 'empty-row', 'No method matches these filters.')]);
  const picker = $('method-run-picker');
  if (picker) {
    const prior = picker.value;
    const executable = state.methods.filter(method =>
      ['IMPLEMENTED', 'EXECUTABLE', 'NATIVE', 'COMPUTATION'].includes(String(method.implementation_state ?? method.status ?? method.level).toUpperCase()));
    const placeholder = node('option', '', 'Choose an implemented evaluator'); placeholder.value = '';
    replace(picker, [placeholder, ...executable.map(method => {
      const option = node('option', '', `${method.id ?? method.method_id} — ${method.methods ?? method.name ?? 'implemented evaluator'}`);
      option.value = String(method.id ?? method.method_id); return option;
    })]);
    if ([...picker.options].some(option => option.value === prior)) picker.value = prior;
  }
}

function rerenderMethods() {
  renderMethods(state.methods);
}

const METHOD_INPUT_EXAMPLES = Object.freeze({
  nash: {row_payoffs: [[1, 0], [0, 1]], column_payoffs: [[-1, 0], [0, -1]]},
  conservation: {unit: 'items', opening: 10, inflows: [2], outflows: [3], closing: 9, tolerance: 0},
  identity: {left: {native_id: 'left-id', version: 'v1', owner: 'owner', namespace: 'records', label: 'Left', source_ref: 'source-left'},
    right: {native_id: 'right-id', version: 'v1', owner: 'owner', namespace: 'records', label: 'Right', source_ref: 'source-right'}}
});

function selectMethodExample() {
  const method = $('method-run-picker').value;
  const example = METHOD_INPUT_EXAMPLES[method];
  if (example && !$('method-run-input').value.trim()) $('method-run-input').value = JSON.stringify(example, null, 2);
}

async function runMethodEvaluation() {
  const projectId = currentProjectId();
  if (!projectId) return announce('Open a project before running an evaluator.', {tone: 'warn'});
  const policy = retentionPolicy();
  const profile = selectedProfile();
  const method = $('method-run-picker').value;
  const raw = $('method-run-input').value;
  if (!method) return $('method-run-picker').focus();
  if (!raw.trim()) return $('method-run-input').focus();
  let methodInput;
  try { methodInput = JSON.parse(raw); }
  catch { return announce('Evaluator input must be one valid JSON object.', {tone: 'warn'}); }
  if (!methodInput || typeof methodInput !== 'object' || Array.isArray(methodInput)) {
    return announce('Evaluator input must be one JSON object.', {tone: 'warn'});
  }
  setText('method-run-status', 'ACQUIRING INPUT');
  try {
    const acquiredResponse = await request(API_PATHS.inputs, {method: 'POST', body: {
      project_id: projectId, kind: 'TEXT', name: `${method}-input.json`, content: raw,
      format_hint: 'JSON', retention_policy: policy
    }});
    const acquired = acquiredResponse.input ?? acquiredResponse;
    if ((acquired.parse ?? acquired.original?.parse)?.status === 'INVALID_RETAINED') {
      setText('method-run-status', 'INVALID JSON');
      return announce('The bounded JSON parser rejected this input (including duplicate keys). It was not executed.', {tone: 'warn'});
    }
    const acquisitionIds = collectAcquisitionIds([acquired]);
    if (!acquisitionIds.length) throw new WorkspaceRequestError('MPC_WORKSPACE_METHOD_INPUT_NOT_ROUTE_READY',
      'The evaluator input was retained but did not produce a route-ready source.');
    setText('method-run-status', 'EVALUATING');
    const response = await request(API_PATHS.jobs, {method: 'POST', body: {
      project_id: projectId, job_id: makeId('job'), task_id: makeId('task'),
      question: `Evaluate the explicitly supplied ${method} model.`, operation_mode: 'EVIDENCE_ANALYSIS',
      acquisition_ids: acquisitionIds, provider_profile_id: profile?.id ?? null,
      method_request: {method, input: methodInput,
        extraction_assumptions: ['User supplied registered evaluator JSON directly; no prose extraction was performed.']},
      idempotency_key: makeId('method-request')
    }});
    const job = response.job ?? response;
    if (currentProjectId() !== projectId) return;
    updateJob(job);
    setText('method-run-status', job.finite_method_receipt?.status ?? job.state ?? 'COMPLETE');
    navigate('work');
    announce(job.finite_method_receipt?.exact_comparison_receipt
      ? 'Native evaluator and exact numerical comparison completed.'
      : 'Native evaluator completed. No exact numerical adapter applies to this method.');
  } catch (error) {
    setText('method-run-status', 'FAILED');
    recordError(error);
  }
}

function renderTasks(tasks) {
  replace($('tasks-list'), tasks.length ? tasks.map(task => {
    const row = node('article', 'task-row');
    row.append(node('span', 'stage-chip', task.job_state ?? task.task_state ?? 'OPEN'));
    const text = node('div');
    text.append(node('strong', '', task.title ?? task.operation_name ?? task.task_id), node('div', 'meta', task.action_label ?? task.next_action ?? 'No next action'));
    const controls = node('div', 'button-row');
    if (task.job_id && !TERMINAL_JOB_STATES.has(String(task.job_state).toUpperCase())) {
      const resume = node('button', 'button compact', 'Resume'); resume.type = 'button';
      resume.addEventListener('click', async () => { state.currentJob = task; await resumeWork(); }); controls.append(resume);
    }
    row.append(text, controls);
    return row;
  }) : [node('div', 'empty-row', 'No project tasks.')]);
}

function renderConnections() {
  const byProvider = new Map(state.connections.map(item => [String(item.provider ?? item.provider_namespace ?? item.id).toUpperCase(), item]));
  const cards = CONNECTION_SERVICES.map(([provider, label, purpose]) => {
    const catalogEntry = byProvider.get(provider) ?? null;
    const connection = catalogEntry?.connection_id ? catalogEntry : catalogEntry?.configuration?.connection_id
      ? {...catalogEntry, ...catalogEntry.configuration} : null;
    const observation = catalogEntry?.current_observation ?? connection?.current_observation ?? connection?.current ?? connection?.observation ?? null;
    const enabled = connection?.enabled !== false;
    const status = connection ? (enabled ? catalogEntry?.status ?? connection.status ?? 'CONFIGURED_ONLY' : 'DISABLED LOCALLY')
      : catalogEntry?.status ?? 'NOT_CONFIGURED';
    const card = node('article', 'panel connection-card');
    card.dataset.provider = provider;
    card.append(node('div', 'eyebrow', provider), node('h2', '', label), node('p', '', purpose), node('div', 'connection-state', status));
    const list = node('dl');
    const details = [
      ['Host', observation?.host_id ?? connection?.host_id ?? 'Not observed'],
      ['Account', observation?.account_id ?? connection?.account_id ?? 'Not observed'],
      ['Operations', array(connection?.operations).join(', ') || observation?.operation || 'Not discovered'],
      ['Local use', connection ? (enabled ? 'Enabled' : 'Disabled') : 'Not configured'],
      ['Last success', connection?.last_success?.observed_at_utc ?? 'None'],
      ['Current error', connection?.current_error?.code ?? observation?.error?.code ?? 'None'],
      ['Next setup', connection?.next_action ?? (connection ? 'Run one permitted operation' : 'Add configuration')]
    ];
    for (const [term, value] of details) { const row = node('div'); row.append(node('dt', '', term), node('dd', '', value)); list.append(row); }
    card.append(list);
    const actions = node('div', 'button-row');
    if (provider === 'OLLAMA') {
      const setup = node('button', 'button compact', 'Local AI setup'); setup.type = 'button'; setup.addEventListener('click', openLocalModelSetup); actions.append(setup);
    } else if (!connection) {
      const add = node('button', 'button compact', 'Add'); add.type = 'button'; add.addEventListener('click', () => openConnectionDialog(provider)); actions.append(add);
    } else {
      const toggle = node('button', 'button compact', enabled ? 'Disable locally' : 'Enable locally');
      toggle.type = 'button';
      toggle.addEventListener('click', () => setConnectionEnabled(!enabled, connection));
      const test = node('button', 'button compact', 'Test permitted read');
      test.type = 'button';
      test.disabled = !enabled;
      test.title = enabled ? 'Run one bounded read and retain its actual observation.' : 'Enable this local configuration before testing it.';
      test.addEventListener('click', () => testConnection(connection));
      actions.append(toggle, test);
    }
    card.append(actions);
    return card;
  });
  replace($('connections-grid'), cards);
}

function applyConnectionGuidance() {
  const guide = connectionInputGuidance($('connection-provider').value);
  $('connection-name').value = guide.name;
  $('connection-transport').value = guide.transport;
  $('connection-endpoint').value = guide.endpoint;
  $('connection-endpoint').placeholder = guide.endpoint || 'Supplied by your installed host adapter';
  $('connection-credential').value = '';
  $('connection-credential').disabled = !guide.credential;
  $('connection-local-setup').hidden = !guide.localSetup;
  setText('connection-help', guide.help);
  setText('connection-endpoint-help', guide.endpointHelp);
}

function openConnectionDialog(provider = 'OLLAMA') {
  $('connection-provider').value = provider;
  applyConnectionGuidance();
  $('connection-dialog').showModal();
}

async function configureConnection(event) {
  event.preventDefault();
  try {
    await request(API_PATHS.connections, {method: 'POST', body: {operation: 'CONFIGURE', project_id: currentProjectId(), configuration: {
      display_name: $('connection-name').value.trim(), provider: $('connection-provider').value,
      transport: $('connection-transport').value, endpoint_or_command: $('connection-endpoint').value.trim(),
      credential_ref: $('connection-credential').value.trim() || null
    }}});
    $('connection-dialog').close();
    announce('Connection saved as configured only. No authentication claim was made.');
    await refreshBootstrap();
  } catch (error) { recordError(error); }
}

async function setConnectionEnabled(enabled, connection) {
  try {
    // Host v1 calls these CONNECT/DISCONNECT; their bounded meaning is only to
    // enable or disable the saved local configuration. Neither proves access.
    const operation = enabled ? 'CONNECT' : 'DISCONNECT';
    await request(API_PATHS.connections, {method: 'POST', body: {operation, project_id: currentProjectId(), connection_id: connection.connection_id}});
    announce(enabled
      ? 'Local connection configuration enabled. Authentication remains unverified until a permitted operation returns a receipt.'
      : 'Local connection configuration disabled. Prior observations remain historical evidence.');
    await refreshBootstrap();
  } catch (error) { recordError(error); }
}

async function testConnection(connection) {
  try {
    const response = await request(API_PATHS.connectionTest, {method: 'POST', body: {project_id: currentProjectId(), connection_id: connection.connection_id, operation: 'READ_SELECTED_RESOURCE'}});
    const observation = response.observation ?? response;
    announce(observation.last_operation_verified ? 'Protected operation receipt recorded.' : `Connection result: ${observation.status ?? 'unavailable'}`, {tone: observation.last_operation_verified ? '' : 'warn'});
    await refreshBootstrap();
  } catch (error) { recordError(error); }
}

function scriptBody(operation, extra = {}) {
  return {operation, project_id: currentProjectId(), job_id: state.currentJob?.job_id ?? null, script_id: state.script?.script_id ?? null,
    provider_profile_id: state.selectedProfileId, language: $('script-language').value, ...extra};
}

function renderScript(script) {
  state.script = script;
  const scriptState = SCRIPT_STATES.has(script?.state) ? script.state : script ? 'DRAFT' : 'NO DRAFT';
  setText('script-state', scriptState);
  $('script-content').value = script?.content ?? '';
  const enabled = Boolean(script?.content);
  for (const id of ['explain-script', 'copy-script', 'save-script', 'mark-script-exported']) $(id).disabled = !enabled;
  $('ingest-script-output').disabled = !enabled || scriptState === 'DRAFT';
  const explanation = [script?.explanation, script?.prerequisites ? `Prerequisites:\n${array(script.prerequisites).join('\n')}` : null,
    script?.expected_output ? `Expected output:\n${typeof script.expected_output === 'string' ? script.expected_output : JSON.stringify(script.expected_output, null, 2)}` : null,
    script?.content_sha256 ? `Script SHA-256: ${script.content_sha256}` : null].filter(Boolean).join('\n\n');
  setText('script-explanation-body', explanation || 'No explanation available.');
}

async function draftScript() {
  if (!currentProjectId()) return announce('Open a project first.', {tone: 'warn'});
  const requestText = $('script-request').value.trim();
  if (!requestText) return $('script-request').focus();
  try {
    const response = await request(API_PATHS.scripts, {method: 'POST', body: scriptBody('CREATE', {request: requestText, state: 'DRAFT'})});
    if (response.status === 'UNAVAILABLE') return announce(response.next_action ?? 'Script drafting is unavailable for the selected model.', {tone: 'warn'});
    renderScript(response.script ?? response);
    announce('Script draft returned. It has not been executed.');
  } catch (error) { recordError(error); }
}

async function saveScript(operation = 'SAVE_DRAFT') {
  if (!state.script) return;
  try {
    const content = $('script-content').value;
    const response = await request(API_PATHS.scripts, {method: 'POST', body: scriptBody(operation, {content, content_sha256: await sha256Text(content)})});
    renderScript(response.script ?? response);
    announce(operation === 'EXPORTED' ? 'Script marked exported for manual run. No execution was claimed.' : 'Script draft saved locally.');
  } catch (error) { recordError(error); }
}

async function ingestScriptOutput() {
  const output = $('script-output').value;
  if (!output.trim() || !state.script) return;
  const exitRaw = $('script-exit').value.trim();
  const exitStatus = /^-?[0-9]+$/u.test(exitRaw) ? Number(exitRaw) : null;
  try {
    const response = await request(API_PATHS.scripts, {method: 'POST', body: scriptBody('INGEST_OUTPUT', {state: 'OUTPUT_INGESTED', output,
      output_sha256: await sha256Text(output), exit_status: exitStatus, observed_run_at_utc: now(), execution_observation: 'USER_SUPPLIED_NOT_AUTHENTICATED'})});
    renderScript(response.script ?? response);
    announce('Returned output ingested as user-supplied evidence. Local execution was not inferred.');
  } catch (error) { recordError(error); }
}

async function exportPortableTask() {
  if (!currentProjectId()) return announce('Open a project before exporting a portable task.', {tone: 'warn'});
  try {
    const response = await request(API_PATHS.transferExport, {method: 'POST', body: {
      project_id: currentProjectId()
    }});
    const transfer = response.transfer ?? response;
    if (typeof transfer.serialized !== 'string') throw new WorkspaceRequestError(
      'MPC_WORKSPACE_TRANSFER_EXPORT_INVALID', 'The local service did not return a portable task file.');
    downloadText(transfer.filename ?? 'MPC-Workspace-Task.json', transfer.serialized, 'application/json');
    announce(`Exported ${transfer.transfer_id}. No connected service or script was invoked.`);
  } catch (error) { recordError(error); }
}

async function importPortableTask(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!currentProjectId()) return announce('Choose the destination project before importing a portable task.', {tone: 'warn'});
  if (file.size > 2_000_000) return announce('Portable task files are limited to 2,000,000 bytes.', {tone: 'warn'});
  try {
    const transferText = await file.text();
    const response = await request(API_PATHS.transferImport, {method: 'POST', body: {
      project_id: currentProjectId(), transfer_text: transferText
    }});
    const transfer = response.transfer ?? response;
    const detail = await request(entityApiPath('projects', currentProjectId()));
    state.project = detail.project ?? state.project;
    renderEvidence(array(state.project?.sources));
    renderTasks(array(state.project?.tasks));
    renderSnapshots(array(state.project?.snapshots));
    announce(`${transfer.status === 'REUSED' ? 'Reused' : 'Imported'} ${transfer.item_count ?? 0} portable task item${transfer.item_count === 1 ? '' : 's'} as data. Nothing was executed.`);
  } catch (error) { recordError(error); }
}

function navigate(view, {focus = true} = {}) {
  state.activeView = view;
  for (const button of document.querySelectorAll('.nav-item')) {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  for (const panel of document.querySelectorAll('[data-view-panel]')) panel.hidden = panel.dataset.viewPanel !== view;
  updateComposerLayout();
  if (focus) $('workspace-main').focus({preventScroll: true});
  if (globalThis.matchMedia('(max-width: 900px)').matches) document.body.classList.remove('sidebar-open');
}

function updateComposerLayout() {
  const visible = renderComposerVisibility({composer: $('composer'), toggle: $('toggle-composer'), view: state.activeView, collapsed: state.composerCollapsed, dock: state.composerDock});
  // Side docking is available only while the main area can retain useful width.
  const side = state.composerDock === 'right' && globalThis.innerWidth >= 1100 && globalThis.innerHeight >= 550;
  const floating = state.composerDock === 'floating' || (state.composerDock === 'right' && !side);
  document.body.dataset.chatDock = side ? 'right' : floating ? 'floating' : 'bottom';
  document.body.dataset.chatVisible = String(visible);
  $('dock-composer').value = state.composerDock;
  $('dock-composer').title = !side && state.composerDock === 'right' ? 'Uses a floating box in this narrow window; returns to the side when widened.' : 'Choose assistant placement';
  $('move-composer').hidden = !floating;
  const handle = $('composer-resizer');
  const bounds = composerResizeBounds(side);
  handle.setAttribute('aria-orientation', side ? 'vertical' : 'horizontal');
  handle.setAttribute('aria-valuemin', String(bounds.min));
  handle.setAttribute('aria-valuemax', String(bounds.max));
  const measured = side ? $('composer').getBoundingClientRect().width : $('composer').getBoundingClientRect().height;
  handle.setAttribute('aria-valuenow', String(Math.round(Math.max(bounds.min, Math.min(bounds.max, measured)))));
  if (floating && visible) {
    const rect = $('composer').getBoundingClientRect();
    if (rect.left < 8 || rect.top < 8 || rect.right > globalThis.innerWidth - 8 || rect.bottom > globalThis.innerHeight - 8) moveFloatingComposer(rect.left, rect.top);
  }
}

function hideComposer() {
  state.composerCollapsed = true; updateComposerLayout(); $('toggle-composer').focus();
}

function toggleComposer() {
  if ($('composer').hidden) {
    state.composerCollapsed = false;
    if (state.composerDock === 'bottom' && state.activeView !== 'work') state.composerDock = 'right';
    updateComposerLayout(); $('composer-input').focus();
  } else hideComposer();
}

function composerResizeBounds(side) {
  if (document.body.dataset.chatDock === 'floating') {
    const max = Math.max(120, globalThis.innerHeight - 32);
    return {min: Math.min(260, max), max};
  }
  return side ? {min: 280, max: Math.max(280, Math.min(560, globalThis.innerWidth * 0.42))}
    : {min: Math.min(170, globalThis.innerHeight * 0.32), max: Math.max(170, Math.min(480, globalThis.innerHeight * 0.48))};
}

function resizeComposer(value) {
  const side = document.body.dataset.chatDock === 'right';
  const {min, max} = composerResizeBounds(side);
  const pixels = Math.round(Math.max(min, Math.min(max, value)));
  $('composer').style.removeProperty(side ? 'width' : 'height');
  document.documentElement.style.setProperty(side ? '--composer-width' : '--composer-height', `${pixels}px`);
  $('composer-resizer').setAttribute('aria-valuenow', String(pixels));
}

function bindComposerResize() {
  const handle = $('composer-resizer');
  let drag = null;
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const side = document.body.dataset.chatDock === 'right';
    const rect = $('composer').getBoundingClientRect();
    drag = {pointer: event.pointerId, side, start: side ? event.clientX : event.clientY, size: side ? rect.width : rect.height};
    handle.setPointerCapture(event.pointerId); event.preventDefault(); handle.focus();
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    resizeComposer(drag.size + drag.start - (drag.side ? event.clientX : event.clientY));
  });
  const end = () => { drag = null; };
  handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end); handle.addEventListener('lostpointercapture', end);
  handle.addEventListener('keydown', event => {
    const side = document.body.dataset.chatDock === 'right';
    const allowed = side ? ['ArrowLeft', 'ArrowRight', 'Home', 'End'] : ['ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!allowed.includes(event.key)) return;
    event.preventDefault();
    const rect = $('composer').getBoundingClientRect(), bounds = composerResizeBounds(side);
    const current = side ? rect.width : rect.height;
    const increment = event.shiftKey ? 40 : 16;
    resizeComposer(event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max
      : current + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? increment : -increment));
  });
}

function moveFloatingComposer(left, top) {
  const composer = $('composer'), rect = composer.getBoundingClientRect();
  const x = Math.max(8, Math.min(globalThis.innerWidth - rect.width - 8, left));
  const y = Math.max(8, Math.min(globalThis.innerHeight - rect.height - 8, top));
  document.documentElement.style.setProperty('--assistant-left', `${Math.round(x)}px`);
  document.documentElement.style.setProperty('--assistant-top', `${Math.round(y)}px`);
}

function bindFloatingComposerMove() {
  const handle = $('move-composer'); let drag = null;
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = $('composer').getBoundingClientRect();
    drag = {pointer: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top};
    handle.setPointerCapture(event.pointerId); handle.focus(); event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (drag?.pointer === event.pointerId) moveFloatingComposer(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(event, () => { drag = null; });
  handle.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const rect = $('composer').getBoundingClientRect(), step = event.shiftKey ? 40 : 16;
    moveFloatingComposer(rect.left + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      rect.top + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0));
  });
}

function bindNavigation() {
  const buttons = Array.from(document.querySelectorAll('.nav-item'));
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => navigate(button.dataset.view));
    button.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    });
  });
}

function bindDrop() {
  const composer = $('composer');
  const enter = event => { event.preventDefault(); state.dragDepth++; composer.classList.add('dragging'); };
  const leave = event => { event.preventDefault(); state.dragDepth = Math.max(0, state.dragDepth - 1); if (!state.dragDepth) composer.classList.remove('dragging'); };
  composer.addEventListener('dragenter', enter);
  composer.addEventListener('dragover', event => event.preventDefault());
  composer.addEventListener('dragleave', leave);
  composer.addEventListener('drop', event => {
    event.preventDefault(); state.dragDepth = 0; composer.classList.remove('dragging');
    const files = event.dataTransfer?.files;
    if (files?.length) addFileObjects(files);
    else {
      const text = event.dataTransfer?.getData('text/plain');
      if (text) { $('advanced-chat').open = true; $('evidence-input-details').open = true; insertAtSelection($('material-input'), text); }
    }
  });
}

function applyAccessibilitySettings() {
  const reduced = $('reduced-motion').checked;
  document.documentElement.dataset.reducedMotion = String(reduced);
  document.documentElement.dataset.contrast = $('high-contrast').checked ? 'high' : 'normal';
  const nativeZoom = bridge()?.setInterfaceZoom;
  if (typeof nativeZoom === 'function') {
    document.documentElement.style.setProperty('--zoom', '1');
    nativeZoom(Number($('zoom-level').value)).catch(error => recordError(error));
  } else document.documentElement.style.setProperty('--zoom', $('zoom-level').value);
  document.documentElement.dataset.density = $('density-level').value;
  const zoom = Number($('zoom-level').value);
  setText('zoom-reset', `${Math.round(zoom * 100)}%`);
  $('zoom-out').disabled = zoom <= 0.5;
  $('zoom-in').disabled = zoom >= 2;
  const quiet = $('quiet-mode-setting').checked;
  document.body.classList.toggle('quiet', quiet);
  $('quiet-toggle').setAttribute('aria-pressed', String(quiet));
  updateComposerLayout();
}

function changeInterfaceZoom(direction) {
  $('zoom-level').value = String(nextInterfaceZoom($('zoom-level').value, direction));
  applyAccessibilitySettings();
}

async function desktopAction(name) {
  const action = bridge()?.[name];
  if (typeof action !== 'function') return announce(`${name === 'openLogs' ? 'Open Logs' : 'Restart Service'} is available in the Windows desktop build.`, {tone: 'warn'});
  try {
    const result = await action();
    if (result?.status === 'ERROR') throw new WorkspaceRequestError(result.error ?? 'DESKTOP_ACTION_FAILED', result.message ?? 'Desktop action failed.', result);
    announce(name === 'openLogs' ? 'Opened the local diagnostic log location.' : 'Service restart requested.');
    if (name === 'restartService') globalThis.setTimeout(refreshBootstrap, 500);
  } catch (error) { recordError(error); }
}

async function initialize() {
  bindNavigation();
  bindDrop();
  bindComposerResize();
  bindFloatingComposerMove();
  updateNetworkStatus();
  globalThis.addEventListener('online', updateNetworkStatus);
  globalThis.addEventListener('offline', updateNetworkStatus);
  globalThis.addEventListener('resize', updateComposerLayout);
  let lastWheelZoom = 0;
  document.addEventListener('wheel', event => {
    if (!$('wheel-zoom').checked || !event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || !event.deltaY) return;
    const direction = event.deltaY < 0 ? 1 : -1;
    if (nextInterfaceZoom($('zoom-level').value, direction) === Number($('zoom-level').value)) return;
    event.preventDefault();
    const time = performance.now();
    if (time - lastWheelZoom < 140) return;
    lastWheelZoom = time; changeInterfaceZoom(direction);
  }, {passive: false});

  $('toggle-composer').addEventListener('click', toggleComposer);
  $('hide-composer').addEventListener('click', hideComposer);
  $('dock-composer').addEventListener('change', () => {
    state.composerDock = $('dock-composer').value;
    $('composer').style.removeProperty('width'); $('composer').style.removeProperty('height'); updateComposerLayout();
  });
  $('reset-composer-size').addEventListener('click', () => {
    for (const property of ['--composer-height', '--composer-width', '--assistant-left', '--assistant-top']) document.documentElement.style.removeProperty(property);
    $('composer').style.removeProperty('width'); $('composer').style.removeProperty('height'); updateComposerLayout();
  });
  $('zoom-out').addEventListener('click', () => changeInterfaceZoom(-1));
  $('zoom-in').addEventListener('click', () => changeInterfaceZoom(1));
  $('zoom-reset').addEventListener('click', () => { $('zoom-level').value = '1'; applyAccessibilitySettings(); });
  $('local-model-setup').addEventListener('click', openLocalModelSetup);
  $('refresh-models').addEventListener('click', async () => { try { await refreshModelProfiles(); announce('Model availability refreshed.'); } catch (error) { recordError(error); } });
  $('close-local-model-dialog').addEventListener('click', () => $('local-model-dialog').close());
  $('local-model-refresh').addEventListener('click', openLocalModelSetup);
  $('copy-ollama-link').addEventListener('click', () => copyText('https://ollama.com/download/windows', 'Ollama installer link'));
  $('local-model-start').addEventListener('click', () => runLocalModelSetup('start'));
  $('local-model-pull').addEventListener('click', () => runLocalModelSetup('pull'));
  $('local-model-create').addEventListener('click', () => runLocalModelSetup('create'));
  $('local-model-stop').addEventListener('click', stopLocalModelSetup);
  $('local-model-use').addEventListener('click', useLocalModel);
  $('open-output').addEventListener('click', openOutput);
  $('close-output-dialog').addEventListener('click', () => $('output-dialog').close());
  $('output-mode').addEventListener('change', refreshOutput);
  $('refresh-output').addEventListener('click', refreshOutput);
  $('select-output').addEventListener('click', () => { $('output-text').focus(); $('output-text').select(); });
  $('copy-output').addEventListener('click', () => copyText($('output-text').value, 'Output'));
  $('save-output').addEventListener('click', () => downloadText(`MPC-Chat-${new Date().toISOString().replace(/[:.]/gu, '-')}.txt`, $('output-text').value, 'text/plain;charset=utf-8'));

  $('sidebar-toggle').addEventListener('click', () => {
    if (globalThis.matchMedia('(max-width: 900px)').matches) document.body.classList.toggle('sidebar-open');
    else document.body.classList.toggle('sidebar-collapsed');
    const expanded = !document.body.classList.contains('sidebar-collapsed') && (document.body.classList.contains('sidebar-open') || !globalThis.matchMedia('(max-width: 900px)').matches);
    $('sidebar-toggle').setAttribute('aria-expanded', String(expanded));
  });
  $('new-project').addEventListener('click', () => $('project-dialog').showModal());
  $('close-project-dialog').addEventListener('click', () => $('project-dialog').close());
  $('cancel-project').addEventListener('click', () => $('project-dialog').close());
  $('project-form').addEventListener('submit', createProject);
  $('project-picker').addEventListener('change', openProjectByPicker);
  $('model-picker').addEventListener('change', () => { state.selectedProfileId = $('model-picker').value || null; renderProfiles(); announce(state.selectedProfileId ? 'Provider selection changed. Actual identity will be recorded from its operation.' : 'Language model disabled; finite local analysis remains available.'); });
  $('work-mode').addEventListener('change', () => announce($('work-mode').value === 'AUTO'
    ? 'Auto uses chat without evidence and source-bound analysis when evidence is selected.'
    : $('work-mode').value === 'CHAT' ? 'Chat uses the selected local model without acquiring evidence.'
      : 'Evidence analysis binds only the material selected for this run.'));
  $('composer-input').addEventListener('input', queueDraftSave);
  $('composer-input').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      if (!$('run-work').disabled) runWork();
    }
  });
  $('paste-input').addEventListener('click', pasteInput);
  $('attachment-options').addEventListener('click', event => { if (event.target.closest('button')) $('attachment-options').open = false; });
  $('paste-question').addEventListener('click', () => pasteTextInto('composer-input'));
  $('material-input').addEventListener('input', () => setText('evidence-input-summary', $('material-input').value ? `Evidence text · ${formatBytes(new TextEncoder().encode($('material-input').value).byteLength)}` : 'Evidence text (optional)'));
  $('attach-files').addEventListener('click', attachFiles);
  $('add-folder').addEventListener('click', addFolder);
  $('browser-file-input').addEventListener('change', event => { addFileObjects(event.target.files); event.target.value = ''; });
  $('run-work').addEventListener('click', runWork);
  $('stop-work').addEventListener('click', stopWork);
  $('resume-work').addEventListener('click', resumeWork);
  $('save-report').addEventListener('click', saveReport);
  $('save-report-secondary').addEventListener('click', saveReport);
  $('copy-report').addEventListener('click', () => copyText($('report-preview').textContent, 'Report'));
  $('copy-answer').addEventListener('click', () => state.lastAnswer && copyText(state.lastAnswer, 'Answer'));
  $('export-report').addEventListener('click', () => state.selectedReport && downloadText(`${state.selectedReport.title ?? 'MPC-Workspace-Report'}.md`, $('report-preview').textContent, 'text/markdown'));
  $('run-search').addEventListener('click', runSearch);
  $('search-query').addEventListener('keydown', event => { if (event.key === 'Enter') runSearch(); });
  $('compare-snapshots').addEventListener('click', compareSnapshots);
  $('method-search').addEventListener('input', rerenderMethods);
  $('method-implemented-only').addEventListener('change', rerenderMethods);
  $('method-run-picker').addEventListener('change', selectMethodExample);
  $('run-method').addEventListener('click', runMethodEvaluation);
  $('add-connection').addEventListener('click', () => openConnectionDialog());
  $('close-connection-dialog').addEventListener('click', () => $('connection-dialog').close());
  $('cancel-connection').addEventListener('click', () => $('connection-dialog').close());
  $('connection-form').addEventListener('submit', configureConnection);
  $('connection-provider').addEventListener('change', applyConnectionGuidance);
  $('connection-local-setup').addEventListener('click', () => { $('connection-dialog').close(); openLocalModelSetup(); });
  $('draft-script').addEventListener('click', draftScript);
  $('explain-script').addEventListener('click', () => { $('script-explanation').open = true; $('script-explanation').scrollIntoView({block: 'nearest'}); });
  $('copy-script').addEventListener('click', () => copyText($('script-content').value, 'Script'));
  $('save-script').addEventListener('click', () => saveScript('SAVE_DRAFT'));
  $('mark-script-exported').addEventListener('click', () => saveScript('EXPORTED'));
  $('ingest-script-output').addEventListener('click', ingestScriptOutput);
  $('script-output').addEventListener('input', () => { $('ingest-script-output').disabled = !state.script || !$('script-output').value.trim() || state.script.state === 'DRAFT'; });
  $('open-logs').addEventListener('click', () => desktopAction('openLogs'));
  $('restart-service').addEventListener('click', () => desktopAction('restartService'));
  $('copy-error').addEventListener('click', () => state.lastError && copyText(JSON.stringify(state.lastError, null, 2), 'Error details'));
  $('quiet-toggle').addEventListener('click', () => { $('quiet-mode-setting').checked = !$('quiet-mode-setting').checked; applyAccessibilitySettings(); });
  for (const id of ['reduced-motion', 'high-contrast', 'quiet-mode-setting', 'zoom-level', 'density-level']) $(id).addEventListener('change', applyAccessibilitySettings);
  $('save-assistant').addEventListener('click', () => announce('Assistant revision controls require the local host adapter.', {tone: 'warn'}));
  $('export-task').addEventListener('click', exportPortableTask);
  $('import-task').addEventListener('click', () => $('portable-task-input').click());
  $('portable-task-input').addEventListener('change', importPortableTask);
  for (const item of document.querySelectorAll('input[name="retention"]')) item.addEventListener('change', () => { if (state.project) { state.project.retention_policy = retentionPolicy(); queueDraftSave(); } });
  applyAccessibilitySettings();
  renderAttachments();
  await refreshBootstrap();
}

if (hasDom) initialize().catch(recordError);
