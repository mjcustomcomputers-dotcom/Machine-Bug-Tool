import {randomUUID} from 'node:crypto';
import {createOllamaClient, DEFAULT_BASE_MODEL, MPC_MODEL, OLLAMA_ORIGIN} from './ollama-local-chat.mjs';
import {startInstalledOllama} from './ollama-process.mjs';
import {findInstalledOllamaModel} from './mpc-workspace-models.mjs';

export const MPC_WORKSPACE_MODEL_SETUP_VERSION = 'MPC_WORKSPACE_MODEL_SETUP_1';
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

function problem(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.publicMessage = message;
  return error;
}

function inputShape(input, fields) {
  if (!object(input) || Object.keys(input).some(key => !fields.includes(key))) {
    throw problem('MPC_WORKSPACE_MODEL_SETUP_INPUT_INVALID', 'Use the displayed local model setup controls.');
  }
  return input;
}

function requestId(input) {
  if (typeof input.request_id !== 'string' || !REQUEST_ID.test(input.request_id)) {
    throw problem('MPC_WORKSPACE_MODEL_SETUP_REQUEST_ID_REQUIRED', 'A new local setup request ID is required.');
  }
  return input.request_id;
}

function publicFailure(error, cancelled = false) {
  return {
    code: cancelled ? 'MPC_WORKSPACE_MODEL_SETUP_CANCELLED'
      : typeof error?.code === 'string' && /^[A-Z0-9_]{1,120}$/u.test(error.code)
        ? error.code : 'MPC_WORKSPACE_MODEL_SETUP_FAILED',
    message: cancelled ? 'Stopped local model setup. Downloaded model layers remain available for a later retry.'
      : String(error?.publicMessage ?? error?.message ?? 'Local model setup failed.').slice(0, 1_600)
  };
}

function installation(model, models) {
  const observed = findInstalledOllamaModel(models, model);
  return {
    model, installed: observed !== null,
    observed_model: observed?.model ?? observed?.name ?? null,
    digest: observed?.digest ?? null,
    size_bytes: observed?.size ?? observed?.size_bytes ?? null
  };
}

/** Fixed loopback model setup. Construction and status reads do not install anything. */
export class MpcWorkspaceModelSetup {
  constructor({client, fetchImpl = globalThis.fetch, startOllama = startInstalledOllama} = {}) {
    this.client = client ?? createOllamaClient({fetchImpl});
    if (!object(this.client) || ['status', 'listModels', 'pullModel', 'createMpcModel'].some(name => typeof this.client[name] !== 'function') ||
        typeof startOllama !== 'function') throw problem('MPC_WORKSPACE_MODEL_SETUP_ADAPTER_INVALID', 'The local model setup adapter is unavailable.', 500);
    this.startOllama = startOllama;
    this.active = null;
    this.requestIds = new Set();
    this.closed = false;
  }

  assertOpen() {
    if (this.closed) throw problem('MPC_WORKSPACE_MODEL_SETUP_CLOSED', 'Reopen MPC Workspace to set up the local model.', 503);
  }

  assertIdle() {
    this.assertOpen();
    if (this.active) throw problem('MPC_WORKSPACE_MODEL_SETUP_BUSY', 'A local model setup operation is already running. Stop it or wait for it to finish.', 409);
  }

  async status() {
    this.assertOpen();
    const [version, listed] = await Promise.allSettled([this.client.status(), this.client.listModels()]);
    const validList = listed.status === 'fulfilled' && object(listed.value) && Array.isArray(listed.value.models);
    const models = validList ? structuredClone(listed.value.models) : [];
    const issue = validList ? null : publicFailure(listed.status === 'rejected' ? listed.reason
      : problem('MPC_WORKSPACE_MODEL_LIST_INVALID', 'Ollama did not return an installed model list.', 502));
    return {
      format_version: MPC_WORKSPACE_MODEL_SETUP_VERSION,
      ollama: {
        state: validList ? 'READY' : 'OFFLINE',
        endpoint: OLLAMA_ORIGIN,
        version: version.status === 'fulfilled' ? version.value.version ?? null : null,
        error: issue,
        installation_observed: validList,
        inference_verified: false
      },
      starter: installation(DEFAULT_BASE_MODEL, models),
      mpc: installation(MPC_MODEL, models),
      models,
      excluded_models: validList && Array.isArray(listed.value.excluded_models) ? structuredClone(listed.value.excluded_models) : [],
      active_operation: this.active ? {request_id: this.active.request_id, operation: this.active.operation,
        cancellable: this.active.operation !== 'start'} : null,
      install_url: 'https://ollama.com/download/windows',
      automatic_download: false
    };
  }

  async start(input = {}) {
    inputShape(input, []);
    this.assertIdle();
    const active = {request_id: `start-${randomUUID()}`, operation: 'start', controller: new AbortController()};
    this.active = active;
    try {
      const result = await this.startOllama(this.client);
      this.assertOpen();
      // The installed daemon remains running independently after the explicit start.
      this.active = null;
      return {...await this.status(), startup: {already_running: result?.already_running === true,
        started_by_workspace: result?.started_by_workspace === true}};
    } catch (error) {
      if (error?.code?.startsWith('MPC_WORKSPACE_')) throw error;
      const failure = publicFailure(error);
      const wrapped = problem('MPC_WORKSPACE_OLLAMA_START_FAILED', failure.message, 503);
      wrapped.nextAction = 'Install Ollama or open it from the Windows Start menu, then refresh models.';
      throw wrapped;
    } finally {
      if (this.active === active) this.active = null;
    }
  }

  async *run(operation, input, {signal} = {}) {
    if (!['pull', 'create'].includes(operation)) throw problem('MPC_WORKSPACE_MODEL_SETUP_OPERATION_INVALID', 'Choose Download starter model or Create MPC model.');
    inputShape(input, ['request_id']);
    const id = requestId(input);
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw problem('MPC_WORKSPACE_MODEL_SETUP_SIGNAL_INVALID', 'Local setup cancellation is unavailable.');
    this.assertIdle();
    if (this.requestIds.has(id)) throw problem('MPC_WORKSPACE_MODEL_SETUP_REQUEST_REPLAY', 'This setup request already ran. Refresh the model list or start a new request.', 409);
    if (this.requestIds.size >= 1_024) throw problem('MPC_WORKSPACE_MODEL_SETUP_REQUEST_LIMIT', 'Reopen MPC Workspace before starting another model setup operation.', 429);
    this.requestIds.add(id);
    const controller = new AbortController();
    const active = {request_id: id, operation, controller};
    const abort = () => controller.abort(signal?.reason ?? 'CLIENT_DISCONNECTED');
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) abort();
    this.active = active;
    try {
      controller.signal.throwIfAborted();
      yield {type: 'start', request_id: id, operation,
        requested_model: operation === 'pull' ? DEFAULT_BASE_MODEL : MPC_MODEL};
      const stream = operation === 'pull'
        ? this.client.pullModel({model: DEFAULT_BASE_MODEL, signal: controller.signal})
        : this.client.createMpcModel({signal: controller.signal});
      let completed = false;
      let finalEvent = null;
      for await (const event of stream) {
        controller.signal.throwIfAborted();
        if (!object(event) || !['progress', 'done'].includes(event.type) || completed) {
          throw problem('MPC_WORKSPACE_MODEL_SETUP_EVENT_INVALID', 'Ollama returned invalid setup progress.', 502);
        }
        if (event.type === 'done') {
          if (event.outcome !== 'COMPLETED') throw problem('MPC_WORKSPACE_MODEL_SETUP_INCOMPLETE', 'Ollama ended setup before completion.', 502);
          completed = true;
          finalEvent = {...event, request_id: id};
          continue;
        }
        yield {...event, request_id: id};
      }
      if (!completed) throw problem('MPC_WORKSPACE_MODEL_SETUP_INCOMPLETE', 'Ollama ended setup before completion.', 502);
      yield finalEvent;
    } catch (error) {
      yield {type: 'error', request_id: id, operation, ...publicFailure(error, controller.signal.aborted)};
    } finally {
      controller.abort('SETUP_STREAM_CLOSED');
      signal?.removeEventListener('abort', abort);
      if (this.active === active) this.active = null;
    }
  }

  cancel(input) {
    inputShape(input, ['request_id']);
    const id = requestId(input);
    this.assertOpen();
    const matched = this.active?.request_id === id && this.active.operation !== 'start';
    if (matched) this.active.controller.abort('USER_CANCELLED');
    return {request_id: id, cancelled: matched};
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.active?.controller.abort('SERVICE_CLOSED');
  }
}
