/* MPC Workspace local chat. All service calls stay on the host's relative API.
 * Private drafts and messages are never written to browser storage. */
const $ = (id) => document.getElementById(id);
const encoder = new TextEncoder();
const limits = { max_text_bytes: 64000, max_attachment_bytes: 32000, max_attachments: 8, max_total_attachment_bytes: 64000 };
const state = {
  token: null, ready: false, loading: false, refreshing: false, mutating: false,
  projects: [], project: null, messages: [], models: [], attachments: [], selectedModel: '',
  instructionsSaved: '', modelInfo: null, modelInfoGeneration: 0, active: null,
  projectMemory: new Map(), draftTimers: new Map(), draftWrites: new Map(),
  messageNodes: new Map(), followOutput: true, dragDepth: 0, observedOperations: [], stoppingObserved: false,
};

class ApiError extends Error {
  constructor(message, code = 'LOCAL_REQUEST_FAILED', status = 0) {
    super(message); this.name = 'ApiError'; this.code = code; this.status = status;
  }
}

function bytes(text) { return encoder.encode(text).byteLength; }
function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value < 10240 ? 1 : 0)} KiB`;
}
function idOf(project) { return String(project?.id ?? project?.project_id ?? ''); }
function projectRoute(projectId, suffix = '') { return `/api/local/projects/${encodeURIComponent(projectId)}${suffix}`; }
function makeId() { return crypto.randomUUID(); }
function errorText(value, fallback = 'The local request could not be completed.') {
  if (typeof value === 'string') return value;
  return value?.message ?? value?.error?.message ?? fallback;
}
function showError(error, title = 'The operation needs attention') {
  $('error-title').textContent = title;
  $('error-message').textContent = errorText(error);
  $('error-code').textContent = typeof error?.code === 'string' ? error.code : '';
  $('error-code').hidden = !$('error-code').textContent;
  $('error-banner').hidden = false;
}
function announce(text) { $('announcement').textContent = text; }
function activity(text, busy = false) {
  $('activity').textContent = text;
  $('activity').parentElement.dataset.busy = String(busy);
}

async function readError(response) {
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  const source = body?.error ?? body;
  return new ApiError(errorText(source, `The local host returned HTTP ${response.status}.`), source?.code ?? `HTTP_${response.status}`, response.status);
}

async function api(path, { method = 'GET', body, signal, timeout = 15000 } = {}) {
  const controller = new AbortController();
  const stop = () => controller.abort(signal?.reason);
  if (signal?.aborted) stop();
  else signal?.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('The local host did not respond in time.')), timeout);
  try {
    const headers = { Accept: 'application/json' };
    if (method !== 'GET') {
      if (!state.token) throw new ApiError('The local session is not ready. Reload this window to reconnect.', 'LOCAL_SESSION_NOT_READY');
      headers['Content-Type'] = 'application/json';
      headers['X-MPC-Token'] = state.token;
    }
    const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw await readError(response);
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new ApiError('The local host did not respond in time. Your input remains in this window.', 'LOCAL_HOST_TIMEOUT');
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') throw error;
    throw new ApiError(errorText(error, 'Could not reach the local host. Keep this window open to retain unsaved input.'), 'LOCAL_HOST_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

function normalizeProject(value) {
  const project = value?.project ?? value;
  if (!project || !idOf(project)) throw new ApiError('The local host returned a project without an ID.', 'INVALID_PROJECT_RESPONSE');
  return { ...project, id: idOf(project) };
}

function upsertProject(project) {
  const index = state.projects.findIndex((candidate) => idOf(candidate) === project.id);
  if (index < 0) state.projects.push(project);
  else state.projects[index] = { ...state.projects[index], ...project };
  if (idOf(state.project) === project.id) state.project = { ...state.project, ...project };
  renderProjects();
}

function renderProjects() {
  const current = idOf(state.project);
  $('project-select').replaceChildren();
  for (const project of state.projects) {
    const option = document.createElement('option');
    option.value = idOf(project); option.textContent = project.name || 'Unnamed project';
    $('project-select').append(option);
  }
  if (!state.projects.length) {
    const option = document.createElement('option'); option.value = ''; option.textContent = 'No project loaded';
    $('project-select').append(option);
  }
  if (current) $('project-select').value = current;
}

function modelName(model) { return typeof model === 'string' ? model : model?.name ?? model?.model ?? ''; }
function renderModels() {
  const select = $('model-select');
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = ''; placeholder.textContent = state.models.length ? 'Choose an installed model' : 'No installed models observed';
  placeholder.disabled = true;
  select.append(placeholder);
  const names = new Set();
  for (const model of state.models) {
    const name = modelName(model);
    if (!name || names.has(name)) continue;
    names.add(name);
    const option = document.createElement('option'); option.value = name; option.textContent = name;
    select.append(option);
  }
  if (state.selectedModel && !names.has(state.selectedModel)) {
    const option = document.createElement('option');
    option.value = state.selectedModel; option.textContent = `${state.selectedModel} — not in last observed list`;
    select.append(option);
  }
  select.value = state.selectedModel;
  if (!state.models.length) $('setup-panel').open = true;
}

function applyStatus(data) {
  const service = data?.ollama ?? {};
  const rawState = String(service.state ?? 'unknown').toLowerCase();
  const available = ['ready', 'running', 'connected', 'online', 'available', 'reachable', 'ok'].includes(rawState);
  const unavailable = ['error', 'unavailable', 'offline', 'not_running', 'not_installed', 'degraded', 'failed'].includes(rawState);
  $('connection-status').textContent = available ? 'Ollama available' : unavailable ? 'Ollama unavailable' : `Ollama: ${rawState.replaceAll('_', ' ')}`;
  $('connection-status').dataset.state = available ? 'ready' : unavailable ? 'error' : 'unknown';
  $('ollama-version').textContent = service.version ? `Observed Ollama version: ${service.version}` : '';
  $('connection-detail').textContent = service.error ? errorText(service.error) : unavailable ? 'Open Ollama on this computer, then refresh the local status.' : '';
  $('connection-detail').hidden = !$('connection-detail').textContent;
  state.models = Array.isArray(service.models) ? service.models : [];
  state.observedOperations = (Array.isArray(data?.active_operations) ? data.active_operations : []).filter((operation) => typeof operation?.request_id === 'string');
  for (const key of Object.keys(limits)) {
    if (Number.isSafeInteger(data?.limits?.[key]) && data.limits[key] > 0) limits[key] = data.limits[key];
  }
  $('attach-files').title = `Up to ${limits.max_attachments} text files, ${formatBytes(limits.max_attachment_bytes)} UTF-8 text each, ${formatBytes(limits.max_total_attachment_bytes)} combined. Files are never silently shortened.`;
  renderModels(); renderObservedOperation(); updateControls();
  return data;
}

async function refreshStatus({ report = true } = {}) {
  if (state.refreshing) return;
  state.refreshing = true; updateControls();
  try {
    const result = applyStatus(await api('/api/local/status', { timeout: 20000 }));
    if (report) announce('Local status and installed model list refreshed.');
    return result;
  } catch (error) {
    $('connection-status').textContent = 'Local status unavailable';
    $('connection-status').dataset.state = 'error';
    if (report) showError(error, 'Could not refresh local status');
    throw error;
  } finally { state.refreshing = false; updateControls(); }
}

function renderObservedOperation() {
  const operation = state.observedOperations.find((candidate) => candidate.request_id !== state.active?.requestId);
  $('observed-operation').hidden = !operation;
  if (!operation) return;
  const project = state.projects.find((candidate) => idOf(candidate) === operation.project_id);
  $('observed-operation-text').textContent = operation.project_id
    ? `A local chat request for ${project?.name || operation.project_id} was active at the last status check. You can stop it here or refresh its status.`
    : 'A local setup operation was active at the last status check. You can stop it here or refresh its status.';
  $('stop-observed-operation').dataset.requestId = operation.request_id;
}

async function stopObservedOperation() {
  const requestId = $('stop-observed-operation').dataset.requestId;
  if (!requestId || state.stoppingObserved) return;
  state.stoppingObserved = true; updateControls();
  try {
    const result = await api('/api/local/cancel', { method: 'POST', body: { request_id: requestId }, timeout: 15000 });
    announce(result.cancelled === true ? 'The observed local operation was stopped.' : 'The host did not report an active operation to stop. Refreshing its status.');
    await refreshStatus({ report: false });
    if (state.project && !state.active) await reconcileConversation(idOf(state.project));
  } catch (error) { showError(error, 'The observed operation could not be reconciled'); }
  finally { state.stoppingObserved = false; updateControls(); }
}

async function startOllama() {
  if (!state.ready || state.mutating || state.active) return;
  state.mutating = true; updateControls(); activity('Starting the installed local Ollama service…', true);
  try {
    await api('/api/local/ollama/start', { method: 'POST', body: {}, timeout: 25000 });
    const observed = await refreshStatus({ report: false });
    activity(observed?.ollama?.state === 'available' ? 'Local Ollama is available. Download a starter model or choose one already installed.' : 'Start request finished. Check the observed local status above.');
  } catch (error) { showError(error, 'Ollama could not be started'); activity('Install Ollama from the official download link, then try Start Ollama.'); }
  finally { state.mutating = false; updateControls(); }
}

function showContextNotice(context) {
  const included = context?.complete_exchanges_included;
  const omitted = context?.complete_exchanges_omitted;
  const incomplete = context?.incomplete_exchanges_excluded;
  if ((!Number.isSafeInteger(omitted) || omitted < 1) && (!Number.isSafeInteger(incomplete) || incomplete < 1)) { $('context-note').hidden = true; return; }
  const parts = [];
  if (Number.isSafeInteger(included)) parts.push(`${included} prior complete ${included === 1 ? 'exchange included' : 'exchanges included'}`);
  if (Number.isSafeInteger(omitted) && omitted > 0) parts.push(`${omitted} omitted to fit the context limits`);
  if (Number.isSafeInteger(incomplete) && incomplete > 0) parts.push(`${incomplete} incomplete ${incomplete === 1 ? 'exchange excluded' : 'exchanges excluded'}`);
  const budget = Number.isSafeInteger(context?.byte_budget) ? ` The context byte budget is ${formatBytes(context.byte_budget)}; exact token coverage was not measured.` : '';
  $('context-note').textContent = `History supplied to this reply: ${parts.join('; ')}.${budget} Earlier chat remains visible in the project.`;
  $('context-note').hidden = false;
}

function rememberCurrent() {
  if (!state.project) return;
  state.projectMemory.set(idOf(state.project), {
    draft: $('composer').value,
    attachments: state.attachments.map((file) => ({ ...file })),
    instructions: $('instructions').value,
    instructionsDirty: $('instructions').value !== state.instructionsSaved,
  });
}

function saveDraftFor(projectId, text) {
  clearTimeout(state.draftTimers.get(projectId)); state.draftTimers.delete(projectId);
  // Serialize writes per project so a delayed earlier write cannot replace a newer draft.
  const previous = state.draftWrites.get(projectId) ?? Promise.resolve();
  const write = previous.catch(() => {}).then(async () => {
    const result = await api(projectRoute(projectId, '/draft'), { method: 'POST', body: { text } });
    if (idOf(state.project) === projectId && $('composer').value === text) {
      $('draft-status').textContent = state.project.retain_history ? 'Draft saved on this computer' : 'Draft kept for this session';
    }
    return result;
  });
  state.draftWrites.set(projectId, write);
  write.catch((error) => {
    if (idOf(state.project) === projectId) $('draft-status').textContent = 'Draft stays in this window; host save failed';
    announce(`Draft save failed: ${errorText(error)}`);
  }).finally(() => { if (state.draftWrites.get(projectId) === write) state.draftWrites.delete(projectId); });
  return write;
}

function queueDraftSave() {
  if (!state.project) return;
  rememberCurrent();
  const projectId = idOf(state.project); const text = $('composer').value;
  clearTimeout(state.draftTimers.get(projectId));
  $('draft-status').textContent = state.project.retain_history ? 'Saving draft…' : 'Keeping session draft…';
  state.draftTimers.set(projectId, setTimeout(() => {
    saveDraftFor(projectId, text).catch(() => {});
  }, 500));
}

async function loadProject(projectId) {
  if (state.active || state.loading) return;
  const previousId = idOf(state.project);
  rememberCurrent();
  state.loading = true; updateControls(); activity('Opening project…');
  if (previousId && state.draftTimers.has(previousId)) await saveDraftFor(previousId, $('composer').value).catch(() => {});
  try {
    const result = await api(projectRoute(projectId, '/conversation'));
    const project = normalizeProject(result.project ?? state.projects.find((candidate) => idOf(candidate) === projectId));
    if (project.id !== projectId) throw new ApiError('The host returned a different project. The current draft has been kept.', 'PROJECT_ID_MISMATCH');
    state.project = { ...(result.settings ?? {}), ...project };
    upsertProject(state.project);
    const cache = state.projectMemory.get(projectId);
    state.messages = (Array.isArray(result.messages) ? result.messages : []).map((message, index) => ({
      ...message, id: String(message.id ?? `loaded-${projectId}-${index}`), role: String(message.role ?? 'note'), content: typeof message.content === 'string' ? message.content : '',
    }));
    $('composer').value = cache?.draft ?? (typeof result.draft === 'string' ? result.draft : result.draft?.text ?? '');
    state.attachments = cache?.attachments ?? [];
    state.selectedModel = typeof state.project.selected_model === 'string' ? state.project.selected_model : '';
    state.instructionsSaved = typeof state.project.instructions === 'string' ? state.project.instructions : '';
    $('instructions').value = cache?.instructionsDirty ? cache.instructions : state.instructionsSaved;
    $('retain-history').checked = state.project.retain_history === true;
    $('project-title').textContent = state.project.name || 'Local chat';
    $('context-note').hidden = true;
    document.title = `${state.project.name || 'Local chat'} · MPC Workspace`;
    $('draft-status').textContent = $('composer').value ? (state.project.retain_history ? 'Draft restored from this computer' : 'Session draft restored') : '';
    renderModels(); renderMessages(); renderAttachments(); updateRetentionNote(); updateInstructionsNote(); renderObservedOperation();
    state.followOutput = true; scrollLatest();
    activity(state.selectedModel ? 'Ready for your next message.' : 'Choose an installed local model to begin.');
    void refreshModelInfo();
  } catch (error) {
    renderProjects(); showError(error, 'Could not open that project'); activity('The project could not be opened. Your current input remains available.');
  } finally { state.loading = false; updateControls(); }
}

function updateRetentionNote() {
  $('retention-note').textContent = state.project?.retain_history
    ? 'History and drafts are saved on this computer. Turning this off removes this project’s saved chat and draft; its open conversation stays in this session.'
    : 'Chat and drafts stay in this host session. Turning this on saves them on this computer. Unsaved chat is lost when the host closes.';
}

function updateInstructionsNote() {
  $('instructions-unsaved').hidden = $('instructions').value === state.instructionsSaved;
  updateControls();
}

async function patchProject(fields) {
  if (!state.project) throw new ApiError('Open a project first.', 'PROJECT_REQUIRED');
  const projectId = idOf(state.project);
  const result = normalizeProject(await api(projectRoute(projectId), { method: 'PATCH', body: fields }));
  if (result.id !== projectId) throw new ApiError('The host returned a different project.', 'PROJECT_ID_MISMATCH');
  upsertProject({ ...state.project, ...result });
  return state.project;
}

async function saveInstructions({ report = true } = {}) {
  if (!state.project || $('instructions').value === state.instructionsSaved) return;
  const value = $('instructions').value;
  await patchProject({ instructions: value });
  state.instructionsSaved = typeof state.project.instructions === 'string' ? state.project.instructions : value;
  updateInstructionsNote(); rememberCurrent();
  if (report) announce('Assistant instructions saved for this project.');
}

async function refreshModelInfo() {
  const generation = ++state.modelInfoGeneration;
  const model = state.selectedModel;
  state.modelInfo = null;
  $('thinking-control').hidden = true; $('thinking-select').value = 'default';
  if (!model) { $('model-detail').textContent = 'Choose the local model you want to use. You can download one under setup.'; return; }
  $('model-detail').textContent = `Reading ${model} capabilities…`;
  try {
    const result = await api('/api/local/models/show', { method: 'POST', body: { model }, timeout: 20000 });
    if (generation !== state.modelInfoGeneration || model !== state.selectedModel) return;
    state.modelInfo = result;
    const supported = result.thinking?.supported === true;
    $('thinking-control').hidden = !supported;
    const values = Array.isArray(result.thinking?.values) ? result.thinking.values : [];
    $('thinking-select').replaceChildren();
    for (const [value, label, included] of [['default', 'Model default', true], ['on', 'On', values.includes(true)], ['off', 'Off', values.includes(false)]]) {
      if (!included) continue;
      const option = document.createElement('option'); option.value = value; option.textContent = label; $('thinking-select').append(option);
    }
    for (const value of values.filter((item) => typeof item === 'string' && item.length > 0 && item.length <= 64)) {
      const option = document.createElement('option'); option.value = 'string:' + value; option.textContent = value; $('thinking-select').append(option);
    }
    $('thinking-note').textContent = values.some((value) => typeof value === 'boolean' || typeof value === 'string')
      ? 'Only thinking settings reported by this model are offered.'
      : 'The model reports thinking capability. It has not advertised an override, so its default is used.';
    const facts = [result.details?.parameter_size, result.details?.quantization_level].filter((value) => typeof value === 'string' && value);
    $('model-detail').textContent = facts.length ? `${facts.join(' · ')} · Local Ollama` : 'Selected local model. Replies will use this exact requested model.';
  } catch (error) {
    if (generation !== state.modelInfoGeneration) return;
    $('model-detail').textContent = `Model details unavailable: ${errorText(error)}`;
    showError(error, 'The selected model needs attention');
  } finally { if (generation === state.modelInfoGeneration) updateControls(); }
}

function updateControls() {
  const hasProject = !!state.project;
  const busy = state.loading || state.mutating || !!state.active;
  const inputBytes = bytes($('composer').value);
  const tooLarge = inputBytes > limits.max_text_bytes;
  const hasInput = $('composer').value.trim().length > 0;
  $('project-select').disabled = !state.ready || busy || !state.projects.length;
  $('new-project').disabled = !state.ready || busy;
  $('create-project').disabled = !state.ready || busy;
  $('model-select').disabled = !state.ready || !hasProject || busy;
  $('retain-history').disabled = !hasProject || busy;
  $('instructions').disabled = !hasProject || busy;
  $('save-instructions').disabled = !hasProject || busy || $('instructions').value === state.instructionsSaved;
  $('thinking-select').disabled = busy;
  $('composer').disabled = !state.ready || !hasProject || state.loading;
  $('composer').readOnly = state.mutating || state.active?.kind === 'chat';
  $('attach-files').disabled = !hasProject || busy;
  $('file-input').disabled = !hasProject || busy;
  $('paste-text').disabled = !hasProject || busy;
  $('copy-draft').disabled = !$('composer').value;
  $('send-message').disabled = !state.ready || !hasProject || busy || !state.selectedModel || !hasInput || tooLarge;
  $('send-message').title = tooLarge ? 'This message exceeds the local host’s input limit.' : !state.selectedModel ? 'Choose an installed local model first.' : !hasInput && state.attachments.length ? 'Add a question or instruction for the attached files.' : '';
  $('refresh-status').disabled = !state.ready || state.refreshing;
  $('pull-model').disabled = !state.ready || busy;
  $('create-model').disabled = !state.ready || busy;
  $('start-ollama').disabled = !state.ready || busy;
  $('stop-chat').hidden = state.active?.kind !== 'chat' || !!state.active?.done;
  $('stop-chat').disabled = !!state.active?.cancelPending;
  $('stop-chat').textContent = state.active?.cancelPending ? 'Stopping…' : 'Stop reply';
  $('cancel-setup').hidden = !state.active || state.active.kind === 'chat';
  $('cancel-setup').disabled = !!state.active?.cancelPending;
  $('cancel-setup').textContent = state.active?.cancelPending ? 'Cancelling…' : 'Cancel setup';
  $('stop-observed-operation').disabled = state.stoppingObserved;
  $('export-text').disabled = !hasProject || !state.messages.length;
  $('export-json').disabled = !hasProject || !state.messages.length;
  $('input-size').textContent = inputBytes ? `${formatBytes(inputBytes)} / ${formatBytes(limits.max_text_bytes)}` : '';
  $('input-size').classList.toggle('over-limit', tooLarge);
  $('conversation-subtitle').textContent = state.selectedModel ? `${state.selectedModel} · Local Ollama` : 'Talk, paste notes, or attach text files. Choose a local model to send.';
  for (const button of document.querySelectorAll('[data-remove-attachment]')) button.disabled = busy;
  for (const button of document.querySelectorAll('[data-prompt]')) button.disabled = !hasProject || busy;
}

function statusLabel(message) {
  const value = String(message.status ?? '').toLowerCase();
  if (['complete', 'completed', 'done', 'success'].includes(value)) return '';
  const known = { streaming: 'Replying…', pending: 'Waiting…', queued: 'Waiting…', cancelled: 'Stopped · partial reply kept', canceled: 'Stopped · partial reply kept', interrupted: 'Interrupted · partial reply kept', failed: 'Failed · partial reply kept', error: 'Failed · partial reply kept', incomplete: 'Incomplete · partial reply kept' };
  return known[value] ?? (value ? value.replaceAll('_', ' ') : '');
}

function makeMessageNode(message) {
  const article = document.createElement('article'); article.className = 'message'; article.dataset.role = message.role;
  const header = document.createElement('div'); header.className = 'message-header';
  const role = document.createElement('span'); role.className = 'message-role';
  role.textContent = ({ user: 'You', assistant: 'Local assistant', system: 'System', tool: 'Tool' })[message.role] ?? message.role;
  const model = document.createElement('span'); model.className = 'message-model';
  const status = document.createElement('span'); status.className = 'message-status';
  header.append(role, model, status);
  const content = document.createElement('div'); content.className = 'message-content';
  const files = document.createElement('p'); files.className = 'message-attachments';
  const actions = document.createElement('div'); actions.className = 'message-actions';
  const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'quiet-button'; copy.textContent = message.role === 'assistant' ? 'Copy answer' : 'Copy';
  copy.addEventListener('click', async () => {
    const current = state.messages.find((entry) => entry.id === message.id);
    try { await copyText(current?.content ?? ''); copyStatus.textContent = 'Copied'; announce('Message copied.'); }
    catch (error) { showError(error, 'Copy needs attention'); }
  });
  const copyStatus = document.createElement('span'); copyStatus.className = 'copy-status'; copyStatus.setAttribute('role', 'status');
  actions.append(copy, copyStatus); article.append(header, content, files, actions);
  state.messageNodes.set(message.id, { article, model, status, content, files, copy });
  return article;
}

function renderMessages() {
  state.messageNodes.clear();
  $('messages').replaceChildren(...state.messages.map(makeMessageNode));
  for (const message of state.messages) updateMessage(message);
  $('empty-state').hidden = state.messages.length > 0;
  updateControls();
}

function updateMessage(message) {
  const node = state.messageNodes.get(message.id);
  if (!node) return;
  node.model.textContent = message.model ?? '';
  node.status.textContent = statusLabel(message);
  const awaiting = !message.content && ['streaming', 'pending', 'queued'].includes(String(message.status).toLowerCase());
  node.content.textContent = message.content || (awaiting ? 'Waiting for the local model…' : message.role === 'user' && message.attachments?.length ? 'Text files attached.' : 'No text returned.');
  node.content.classList.toggle('message-placeholder', !message.content);
  node.copy.disabled = !message.content;
  const fileNames = (Array.isArray(message.attachments) ? message.attachments : []).map((file) => typeof file === 'string' ? file : file?.name).filter(Boolean);
  node.files.textContent = fileNames.length ? `Attached: ${fileNames.join(' · ')}` : '';
  node.files.hidden = !fileNames.length;
}

function scrollLatest() {
  $('conversation-scroll').scrollTop = $('conversation-scroll').scrollHeight;
  $('jump-latest').hidden = true;
}

function renderAttachments() {
  $('attachments').replaceChildren();
  for (const file of state.attachments) {
    const row = document.createElement('li'); row.className = 'attachment';
    const name = document.createElement('span'); name.className = 'attachment-name'; name.textContent = file.name;
    const size = document.createElement('span'); size.className = 'attachment-size'; size.textContent = formatBytes(file.bytes);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×';
    remove.dataset.removeAttachment = file.id; remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.addEventListener('click', () => {
      if (state.active) return;
      state.attachments = state.attachments.filter((candidate) => candidate.id !== file.id);
      rememberCurrent(); renderAttachments(); announce(`${file.name} removed from this message.`);
    });
    row.append(name, size, remove); $('attachments').append(row);
  }
  $('attachments').hidden = !state.attachments.length;
  updateControls();
}

const textExtensions = new Set(['txt', 'md', 'markdown', 'log', 'json', 'jsonl', 'ndjson', 'csv', 'tsv', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'ps1', 'py', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'html', 'css', 'sql', 'sh', 'bat', 'cmd', 'xml', 'rst', 'env', 'c', 'cpp', 'h', 'rs', 'go', 'java']);
async function attachFiles(files) {
  if (!state.project || state.loading || state.active || state.mutating) { showError(new ApiError('Finish or stop the current operation before attaching text files.', 'ATTACHMENT_INPUT_BUSY')); return; }
  const failures = []; let added = 0;
  state.mutating = true; updateControls();
  try {
    for (const file of files) {
      try {
        if (state.attachments.length >= limits.max_attachments) throw new Error(`This message supports up to ${limits.max_attachments} text files.`);
        const extension = file.name.split('.').pop().toLowerCase();
        if (!file.type.startsWith('text/') && !textExtensions.has(extension) && !['application/json', 'application/xml', 'application/x-ndjson'].includes(file.type)) {
          throw new Error('Choose a supported text file. Images, documents, folders, and archives require their own importers.');
        }
        if (file.size > limits.max_attachment_bytes * 4) throw new Error(`This file exceeds the ${formatBytes(limits.max_attachment_bytes)} UTF-8 text limit.`);
        const buffer = await file.arrayBuffer(); const first = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 3));
        const encoding = first[0] === 0xff && first[1] === 0xfe ? 'utf-16le' : first[0] === 0xfe && first[1] === 0xff ? 'utf-16be' : 'utf-8';
        let text;
        try { text = new TextDecoder(encoding, { fatal: true }).decode(buffer); }
        catch { throw new Error('The text encoding could not be read. Save a UTF-8 text copy and attach it.'); }
        if (text.includes('\u0000')) throw new Error('The file contains binary data and cannot be attached as text.');
        const size = bytes(text);
        if (size > limits.max_attachment_bytes) throw new Error(`This file contains ${formatBytes(size)} of UTF-8 text; the limit is ${formatBytes(limits.max_attachment_bytes)}. The file was not shortened.`);
        if (state.attachments.reduce((total, item) => total + item.bytes, 0) + size > limits.max_total_attachment_bytes) throw new Error(`The combined text-file limit is ${formatBytes(limits.max_total_attachment_bytes)}. Remove a file or choose a smaller one.`);
        if (state.attachments.some((candidate) => candidate.name === file.name && candidate.text === text)) continue;
        state.attachments.push({ id: makeId(), name: file.name, text, bytes: size }); added++;
      } catch (error) { failures.push(`${file.name}: ${errorText(error)}`); }
    }
    rememberCurrent(); renderAttachments();
    if (added) announce(`${added} text ${added === 1 ? 'file attached' : 'files attached'} to this message.`);
    if (failures.length) showError(new ApiError(failures.join('\n'), 'ATTACHMENT_IMPORT_INCOMPLETE'), 'Some files could not be attached');
  } finally { state.mutating = false; $('file-input').value = ''; updateControls(); }
}

async function streamRequest(path, body, operation, onEvent) {
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: operation.controller.signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson', 'X-MPC-Token': state.token },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await readError(response);
  if (!response.body) throw new ApiError('This host did not return a readable response stream.', 'STREAM_UNAVAILABLE');
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let pending = ''; let sawDone = false;
  const parseLine = (line) => {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); }
    catch { throw new ApiError('The local host returned an unreadable stream event. Partial output remains visible.', 'INVALID_STREAM_EVENT'); }
    if (!event || typeof event.type !== 'string') throw new ApiError('The local host returned an event without a type.', 'INVALID_STREAM_EVENT');
    if (event.type === 'error') throw new ApiError(event.message ?? event.error?.message ?? 'The local operation failed.', event.code ?? event.error?.code ?? 'LOCAL_OPERATION_FAILED');
    if (event.type === 'done') sawDone = true;
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) { pending += decoder.decode(); if (pending.trim()) parseLine(pending); break; }
      pending += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) { parseLine(pending.slice(0, newline)); pending = pending.slice(newline + 1); }
      if (pending.length > 2000000) throw new ApiError('A local stream event exceeded the readable size limit. Partial output remains visible.', 'STREAM_EVENT_TOO_LARGE');
    }
    if (!sawDone) throw new ApiError('The response ended before completion was confirmed. Your input and partial reply have been kept.', 'STREAM_ENDED_EARLY');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function reconcileConversation(projectId) {
  const result = await api(projectRoute(projectId, '/conversation'));
  if (idOf(state.project) !== projectId || !Array.isArray(result.messages)) return;
  const prior = state.messages;
  const fresh = result.messages.map((message, index) => {
    const observed = prior.find((entry) => entry.request_id && entry.request_id === message.request_id && entry.role === message.role);
    return { ...message, ...(observed?.context ? { context: observed.context } : {}), id: String(message.id ?? `loaded-${projectId}-${index}`), content: typeof message.content === 'string' ? message.content : '' };
  });
  // A completed acquisition of history may replace optimistic entries. If a
  // broken stream left unsaved partial output, retain that visible local copy.
  for (const message of prior) {
    if (!message.localPartial || !message.content) continue;
    const same = fresh.some((entry) => entry.id === message.id || (entry.request_id && entry.request_id === message.request_id && entry.role === message.role && entry.content.startsWith(message.content)));
    if (!same) fresh.push({ ...message, status: 'interrupted' });
  }
  state.messages = fresh; renderMessages();
  if (state.followOutput) scrollLatest();
}

function completionWasCancelled(event) {
  return event.cancelled === true || event.canceled === true || ['cancelled', 'canceled', 'interrupted'].includes(String(event.status ?? event.outcome ?? '').toLowerCase());
}

async function sendChat(event) {
  event.preventDefault();
  if ($('send-message').disabled || state.active || !state.project) return;
  const text = $('composer').value;
  const attachments = state.attachments.map(({ name, text: content }) => ({ name, text: content }));
  const projectId = idOf(state.project); const model = state.selectedModel;
  state.mutating = true; updateControls();
  try { await saveInstructions({ report: false }); await saveDraftFor(projectId, text); }
  catch (error) { showError(error, 'Your message has not been sent'); state.mutating = false; updateControls(); return; }
  const requestId = makeId();
  const operation = { kind: 'chat', requestId, projectId, controller: new AbortController(), cancelPending: false, cancelled: false, done: null };
  const userMessage = { id: `local-${requestId}-user`, request_id: requestId, role: 'user', content: text, attachments, status: 'completed' };
  const assistant = { id: `local-${requestId}-assistant`, request_id: requestId, role: 'assistant', content: '', model, status: 'pending' };
  operation.assistant = assistant;
  state.messages.push(userMessage, assistant);
  state.active = operation; state.mutating = false; state.followOutput = true;
  renderMessages(); renderObservedOperation(); scrollLatest(); updateControls(); activity('Contacting the selected local model…', true);
  const thinkingValue = $('thinking-select').value;
  const thinking = $('thinking-control').hidden || thinkingValue === 'default' ? null : thinkingValue.startsWith('string:') ? thinkingValue.slice(7) : thinkingValue === 'on';
  let succeeded = false;
  let paintPending = false;
  const paint = () => {
    if (paintPending) return;
    paintPending = true;
    requestAnimationFrame(() => { paintPending = false; updateMessage(assistant); if (state.followOutput) scrollLatest(); else $('jump-latest').hidden = false; });
  };
  try {
    await streamRequest('/api/local/chat', { project_id: projectId, model, text, attachments, thinking, request_id: requestId }, operation, (item) => {
      if (item.type === 'start') {
        assistant.status = 'streaming';
        if (typeof item.requested_model === 'string') assistant.model = item.requested_model;
        assistant.context = item.context;
        showContextNotice(item.context);
        activity('The local model is working. Your submitted draft stays below until completion.', true);
      } else if (item.type === 'delta' && typeof item.text === 'string') {
        assistant.content += item.text; assistant.status = 'streaming'; activity('Receiving the local reply…', true);
      } else if (item.type === 'thinking') {
        activity('The local model is thinking…', true);
      } else if (item.type === 'progress') {
        activity(typeof item.status === 'string' ? item.status : 'The local model is working…', true);
      } else if (item.type === 'done') {
        operation.done = item; operation.cancelled = completionWasCancelled(item);
        assistant.status = operation.cancelled ? 'interrupted' : item.outcome === 'COMPLETED' ? 'completed' : 'incomplete';
        if (typeof item.observed_model === 'string') assistant.model = item.observed_model;
        if (!assistant.content && typeof item.message?.content === 'string') assistant.content = item.message.content;
        updateControls();
      }
      paint();
    });
    succeeded = !operation.cancelled && operation.done?.outcome === 'COMPLETED';
    if (succeeded) {
      $('composer').value = ''; state.attachments = []; rememberCurrent(); renderAttachments();
      await saveDraftFor(projectId, '').catch((error) => showError(error, 'Reply completed; clearing the saved draft failed'));
      activity('Reply completed locally.');
    } else if (operation.cancelled) {
      assistant.localPartial = true; activity('Reply stopped. Your input and partial output are still here.');
    } else {
      assistant.localPartial = true;
      const reason = operation.done?.incomplete_reason;
      showError(new ApiError(reason === 'LENGTH_LIMIT' ? 'The local model reached its output limit. The partial answer and submitted input are still here.' : reason === 'NO_ANSWER_TEXT' ? 'The local model ended without answer text. Your submitted input is still here.' : 'The local model did not confirm a complete answer. The partial output and submitted input are still here.', reason ?? 'LOCAL_REPLY_INCOMPLETE'), 'The local reply is incomplete');
      activity('Reply incomplete. Review the partial answer or edit your input before retrying.');
    }
  } catch (error) {
    if (['CANCELLED', 'OLLAMA_CANCELLED', 'REQUEST_CANCELLED'].includes(error?.code)) operation.cancelled = true;
    assistant.status = operation.cancelled ? 'interrupted' : 'failed'; assistant.localPartial = true;
    if (operation.cancelled) activity('Reply stopped. Your input and partial output are still here.');
    else {
      showError(error instanceof ApiError ? error : new ApiError('The connection to the local host was interrupted. Your input and any partial reply are preserved. Retry only when you are ready.', 'LOCAL_STREAM_INTERRUPTED'), 'The local reply did not finish');
      activity('Reply incomplete. Your submitted input remains available to edit or retry.');
    }
  } finally {
    updateMessage(assistant); rememberCurrent();
    try { await reconcileConversation(projectId); }
    catch (error) { if (succeeded) showError(error, 'Reply completed; saved history could not be refreshed'); }
    if (state.active === operation) state.active = null;
    updateControls(); $('composer').focus();
  }
}

function renderSetupProgress(item) {
  $('setup-progress-box').hidden = false;
  const label = typeof item.status === 'string' ? item.status : 'Working with local Ollama…';
  const determinate = Number.isFinite(item.total) && item.total > 0 && Number.isFinite(item.completed);
  if (determinate) {
    const percent = Math.min(100, Math.max(0, item.completed / item.total * 100));
    $('setup-progress').value = percent;
    $('setup-progress-label').textContent = `${label} · ${percent.toFixed(0)}%`;
  } else {
    $('setup-progress').removeAttribute('value'); $('setup-progress-label').textContent = label;
  }
}

async function runSetup(kind) {
  if (state.active || state.loading || state.mutating || !state.token) return;
  const operation = { kind, requestId: makeId(), controller: new AbortController(), cancelPending: false, cancelled: false };
  state.active = operation; $('setup-panel').open = true;
  renderSetupProgress({ status: kind === 'pull' ? 'Starting the requested starter model download…' : 'Creating the requested MPC model configuration…' });
  updateControls(); activity(kind === 'pull' ? 'Downloading the starter model through local Ollama…' : 'Creating mpc-daybreak-local…', true);
  try {
    const body = kind === 'pull' ? { model: 'qwen3:4b-instruct', request_id: operation.requestId } : { request_id: operation.requestId };
    await streamRequest(`/api/local/models/${kind === 'pull' ? 'pull' : 'create'}`, body, operation, (item) => {
      if (item.type === 'progress' || item.type === 'start') renderSetupProgress(item);
      if (item.type === 'done') { operation.done = item; operation.cancelled = completionWasCancelled(item); }
    });
    if (operation.cancelled) {
      $('setup-progress').removeAttribute('value'); $('setup-progress-label').textContent = 'Setup stopped. Refresh status to see the currently installed models.';
      activity('Local model setup stopped.');
    } else if (operation.done?.outcome === 'COMPLETED') {
      $('setup-progress').value = 100;
      $('setup-progress-label').textContent = kind === 'pull' ? 'Starter model download completed. You can now create your MPC model.' : 'MPC model created. Select mpc-daybreak-local from the observed model list to chat.';
      activity(kind === 'pull' ? 'Starter model downloaded.' : 'MPC model created. Choose it in the model selector.');
    } else {
      throw new ApiError('Ollama did not confirm that this setup operation completed.', 'SETUP_COMPLETION_UNCONFIRMED');
    }
    await refreshStatus({ report: false }).catch((error) => showError(error, 'Setup finished; the model list could not be refreshed'));
  } catch (error) {
    $('setup-progress').removeAttribute('value');
    if (['CANCELLED', 'OLLAMA_CANCELLED', 'REQUEST_CANCELLED'].includes(error?.code)) operation.cancelled = true;
    if (operation.cancelled) { $('setup-progress-label').textContent = 'Setup stopped. Any completed model download data remains managed by Ollama.'; activity('Local model setup stopped.'); }
    else {
      $('setup-progress-label').textContent = 'Setup did not finish. See the error above; no completion is assumed.';
      showError(error instanceof ApiError ? error : new ApiError('The local setup stream was interrupted. Refresh status before deciding whether to retry.', 'SETUP_STREAM_INTERRUPTED'), 'Local model setup needs attention');
      activity('Local model setup did not finish.');
    }
  } finally { if (state.active === operation) state.active = null; updateControls(); }
}

async function cancelActive() {
  const operation = state.active;
  if (!operation || operation.cancelPending) return;
  operation.cancelPending = true; updateControls(); activity('Asking the local host to stop…', true);
  try {
    const result = await api('/api/local/cancel', { method: 'POST', body: { request_id: operation.requestId }, timeout: 10000 });
    if (state.active !== operation) return;
    if (result.cancelled === true) {
      operation.cancelled = true; operation.controller.abort();
      activity(operation.kind === 'chat' ? 'Reply stopped. Preserving partial output…' : 'Local model setup stopped.');
    } else {
      operation.cancelPending = false;
      activity('The host did not confirm an active request was cancelled. Waiting for its completion result…', true);
    }
  } catch (error) {
    if (state.active === operation) {
      operation.cancelPending = false;
      showError(error, 'Stopping could not be confirmed');
      activity('Stop was not confirmed. The request may still be running; you can try Stop again.', true);
    }
  } finally { updateControls(); }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* Use the selected-text fallback below. */ }
  }
  const prior = document.activeElement;
  const field = document.createElement('textarea'); field.value = text; field.className = 'sr-only'; field.setAttribute('aria-label', 'Text to copy');
  document.body.append(field); field.select();
  const copied = document.execCommand('copy'); field.remove(); prior?.focus();
  if (!copied) throw new ApiError('The clipboard could not be written. Select the message text and press Ctrl+C.', 'CLIPBOARD_UNAVAILABLE');
}

function exportConversation(format) {
  if (!state.project || !state.messages.length) return;
  const stamp = new Date().toISOString();
  const exportData = {
    format: 'mpc-local-chat-export-v1', exported_at: stamp,
    project: { id: idOf(state.project), name: state.project.name, retain_history: state.project.retain_history === true, selected_model: state.selectedModel, instructions: state.instructionsSaved },
    messages: state.messages.map(({ id, request_id, role, content, status, model, attachments, context, localPartial }) => ({ id, request_id, role, content, status, ...(model ? { model } : {}), ...(attachments?.length ? { attachments } : {}), ...(context ? { context } : {}), ...(localPartial ? { local_partial_output: true } : {}) })),
  };
  const content = format === 'json' ? JSON.stringify(exportData, null, 2) : [
    `MPC Workspace — ${state.project.name || 'Local chat'}`, `Exported: ${stamp}`, `Project: ${idOf(state.project)}`, '',
    ...exportData.messages.flatMap((message) => [`${message.role.toUpperCase()}${message.model ? ` · ${message.model}` : ''}${message.status ? ` · ${message.status}` : ''}`, message.content, ...(message.attachments?.length ? [`Attached: ${message.attachments.map((file) => file.name ?? file).join(', ')}`] : []), '']),
  ].join('\n');
  const fileName = (state.project.name || 'local-chat').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 80).replace(/[. ]+$/, '') || 'local-chat';
  const blob = new Blob([content], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${fileName}-${stamp.slice(0, 10)}.${format === 'json' ? 'json' : 'txt'}`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  announce(`Conversation ${format === 'json' ? 'JSON' : 'text'} export prepared for download.`);
}

function bindEvents() {
  $('refresh-status').addEventListener('click', () => { void refreshStatus().catch(() => {}); });
  $('dismiss-error').addEventListener('click', () => { $('error-banner').hidden = true; });
  $('project-select').addEventListener('change', () => { void loadProject($('project-select').value); });
  $('new-project').addEventListener('click', () => { $('new-project-form').hidden = false; $('new-project-name').focus(); });
  $('cancel-new-project').addEventListener('click', () => { $('new-project-form').hidden = true; $('new-project').focus(); });
  $('new-project-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const name = $('new-project-name').value.trim(); if (!name || state.mutating || state.active) return;
    state.mutating = true; updateControls(); let newId;
    try {
      const project = normalizeProject(await api('/api/local/projects', { method: 'POST', body: { name, retain_history: false } }));
      upsertProject(project); newId = project.id; $('new-project-form').hidden = true; $('new-project-name').value = '';
    } catch (error) { showError(error, 'Could not create the project'); }
    finally { state.mutating = false; updateControls(); }
    if (newId) { await loadProject(newId); $('composer').focus(); }
  });
  $('model-select').addEventListener('change', async () => {
    const selected = $('model-select').value; const previous = state.selectedModel;
    state.mutating = true; updateControls();
    try {
      await patchProject({ selected_model: selected }); state.selectedModel = selected; renderModels();
      await refreshModelInfo();
      if (!state.active) activity(selected ? `Selected ${selected}. Ready for a message.` : 'Choose an installed local model to begin.');
    } catch (error) { state.selectedModel = previous; renderModels(); showError(error, 'Could not save the selected model'); }
    finally { state.mutating = false; updateControls(); }
  });
  $('retain-history').addEventListener('change', async () => {
    const desired = $('retain-history').checked; const previous = state.project?.retain_history === true;
    state.mutating = true; updateControls();
    try {
      await patchProject({ retain_history: desired }); $('retain-history').checked = state.project.retain_history === true;
      updateRetentionNote();
      announce(desired ? 'History saving is on for this project.' : 'Saved chat and draft removed for this project. The open conversation stays in the current host session.');
      if ($('composer').value) await saveDraftFor(idOf(state.project), $('composer').value).catch((error) => showError(error, 'History setting saved; current draft save failed'));
    } catch (error) { $('retain-history').checked = state.project?.retain_history ?? previous; showError(error, 'Could not finish updating history retention'); }
    finally { state.mutating = false; updateControls(); }
  });
  $('instructions').addEventListener('input', () => { rememberCurrent(); updateInstructionsNote(); });
  $('save-instructions').addEventListener('click', async () => {
    state.mutating = true; updateControls();
    try { await saveInstructions(); } catch (error) { showError(error, 'Could not save assistant instructions'); }
    finally { state.mutating = false; updateControls(); }
  });
  $('composer').addEventListener('input', () => { queueDraftSave(); updateControls(); });
  $('composer').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing) {
      event.preventDefault(); if (!$('send-message').disabled) $('chat-form').requestSubmit();
    }
  });
  $('composer').addEventListener('paste', (event) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length) { event.preventDefault(); void attachFiles(files); }
  });
  $('chat-form').addEventListener('submit', (event) => { void sendChat(event); });
  $('stop-chat').addEventListener('click', () => { void cancelActive(); });
  $('cancel-setup').addEventListener('click', () => { void cancelActive(); });
  $('pull-model').addEventListener('click', () => { void runSetup('pull'); });
  $('create-model').addEventListener('click', () => { void runSetup('create'); });
  $('start-ollama').addEventListener('click', () => { void startOllama(); });
  $('stop-observed-operation').addEventListener('click', () => { void stopObservedOperation(); });
  $('attach-files').addEventListener('click', () => $('file-input').click());
  $('copy-draft').addEventListener('click', async () => {
    try { await copyText($('composer').value); announce('Your message text was copied.'); }
    catch (error) { showError(error, 'Copy needs attention'); }
  });
  $('paste-text').addEventListener('click', async () => {
    if (!navigator.clipboard?.readText) { $('composer').focus(); showError(new ApiError('Press Ctrl+V in the message box to paste from your clipboard.', 'USE_KEYBOARD_PASTE'), 'Paste with your keyboard'); return; }
    const projectId = idOf(state.project); const field = $('composer'); const original = field.value;
    const selectionStart = field.selectionStart; const selectionEnd = field.selectionEnd;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { announce('The clipboard does not contain text.'); return; }
      // A clipboard permission prompt can outlive the current operation state.
      if (idOf(state.project) !== projectId || field.value !== original || field.disabled || field.readOnly || state.active || state.mutating) { showError(new ApiError('The message box changed while clipboard access was requested. Paste again when the current operation finishes.', 'PASTE_INPUT_BUSY')); return; }
      field.setRangeText(text, selectionStart, selectionEnd, 'end');
      queueDraftSave(); updateControls(); field.focus(); announce('Clipboard text pasted into your message.');
    } catch { $('composer').focus(); showError(new ApiError('Clipboard reading was unavailable. Press Ctrl+V in the message box to paste normally.', 'USE_KEYBOARD_PASTE'), 'Paste with your keyboard'); }
  });
  $('file-input').addEventListener('change', () => { void attachFiles(Array.from($('file-input').files ?? [])); });
  for (const button of document.querySelectorAll('[data-prompt]')) button.addEventListener('click', () => {
    if (!$('composer').value) $('composer').value = button.dataset.prompt;
    else $('composer').value += `\n\n${button.dataset.prompt}`;
    queueDraftSave(); updateControls(); $('composer').focus();
  });
  $('export-text').addEventListener('click', () => exportConversation('text'));
  $('export-json').addEventListener('click', () => exportConversation('json'));
  $('conversation-scroll').addEventListener('scroll', () => {
    const scroll = $('conversation-scroll'); state.followOutput = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 70;
    $('jump-latest').hidden = state.followOutput || !state.active;
  });
  $('jump-latest').addEventListener('click', () => { state.followOutput = true; scrollLatest(); });
  // Prevent file drops from navigating the window away from an unsaved chat.
  document.addEventListener('dragenter', (event) => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
    event.preventDefault(); state.dragDepth++; $('drop-hint').hidden = false;
  });
  document.addEventListener('dragover', (event) => {
    if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
  });
  document.addEventListener('dragleave', (event) => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
    state.dragDepth = Math.max(0, state.dragDepth - 1); if (!state.dragDepth) $('drop-hint').hidden = true;
  });
  document.addEventListener('drop', (event) => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
    event.preventDefault(); state.dragDepth = 0; $('drop-hint').hidden = true;
    const items = Array.from(event.dataTransfer?.items ?? []);
    const directories = items.some((item) => item.webkitGetAsEntry?.()?.isDirectory);
    if (directories) showError(new ApiError('Folder drops are not supported in this chat view. Choose the individual text files you want to attach.', 'FOLDER_IMPORT_UNAVAILABLE'), 'Choose text files for this chat');
    const files = items.length ? items.filter((item) => !item.webkitGetAsEntry?.()?.isDirectory).map((item) => item.getAsFile()).filter(Boolean) : Array.from(event.dataTransfer?.files ?? []);
    if (files.length) void attachFiles(files);
  });
  window.addEventListener('beforeunload', (event) => {
    const pendingDraft = state.project && (state.draftTimers.has(idOf(state.project)) || state.draftWrites.has(idOf(state.project)));
    if (state.active || state.attachments.length || !$('instructions-unsaved').hidden || pendingDraft) { event.preventDefault(); event.returnValue = ''; }
  });
}

async function boot() {
  bindEvents(); updateControls();
  try {
    const session = await api('/api/local/session');
    if (typeof session.token !== 'string' || !session.token) throw new ApiError('The local host did not provide a session token.', 'LOCAL_SESSION_UNAVAILABLE');
    state.token = session.token; state.ready = true; updateControls();
    const results = await Promise.allSettled([refreshStatus({ report: false }), api('/api/local/projects')]);
    const status = results[0].status === 'fulfilled' ? results[0].value : null;
    if (results[0].status === 'rejected') showError(results[0].reason, 'Local Ollama status is unavailable');
    const projectsResult = results[1].status === 'fulfilled' ? results[1].value : null;
    const projects = Array.isArray(projectsResult?.projects) ? projectsResult.projects : Array.isArray(status?.projects) ? status.projects : null;
    if (!projects) throw results[1].status === 'rejected' ? results[1].reason : new ApiError('The host did not return a project list.', 'PROJECT_LIST_UNAVAILABLE');
    state.projects = projects.map(normalizeProject); renderProjects();
    if (!state.projects.length) {
      const project = normalizeProject(await api('/api/local/projects', { method: 'POST', body: { name: 'Local chat', retain_history: false } }));
      upsertProject(project);
    }
    const preferred = status?.storage?.active_project_id;
    await loadProject(state.projects.some((project) => project.id === preferred) ? preferred : state.projects[0].id);
  } catch (error) {
    showError(error, 'The local workspace could not finish opening');
    activity('Keep this window open. Start the local host and Ollama, then reload this page.');
  } finally { updateControls(); }
}

void boot();
