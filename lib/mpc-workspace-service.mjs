import {createHash, randomUUID} from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import {homedir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';

import {getMethodCatalog} from './methods.mjs';
import {createLocalChatStore, LOCAL_CHAT_LIMITS} from './local-chat-store.mjs';
import {runOllamaWorkspaceConversation} from './mpc-workspace-chat.mjs';
import {
  buildSnapshotManifest,
  chunkTextAcquisition,
  indexAttachedFolder,
  ingestFile,
  ingestText
} from './mpc-workspace-ingest.mjs';
import {
  compareWorkspaceSnapshots,
  resumeWorkspaceJourney,
  runWorkspaceJourney,
  sealWorkspaceCheckpoint
} from './mpc-workspace-orchestrator.mjs';
import {observeConnectorOperation} from './mpc-workspace-connections.mjs';
import {canonicalOllamaModelName, discoverOllamaModels, findInstalledOllamaModel} from './mpc-workspace-models.mjs';
import {MpcWorkspaceModelSetup} from './mpc-workspace-model-setup.mjs';
import {createWorkspaceReport, verifyWorkspaceReport} from './mpc-workspace-reports.mjs';
import {
  createWorkspaceTransfer,
  decodeTransferItem,
  parseWorkspaceTransfer,
  serializeTransferEnvelope,
  verifyWorkspaceTransfer
} from './mpc-workspace-transfer.mjs';
import {
  createScriptDraft,
  ingestScriptOutput as createScriptOutput,
  markScriptExported,
  verifyScriptArtifact
} from './mpc-workspace-script-workshop.mjs';
import {
  MpcWorkspaceStore,
  resolveMpcWorkspaceDatabasePath
} from './mpc-workspace-store.mjs';

export const MPC_WORKSPACE_SERVICE_VERSION = 'MPC_WORKSPACE_SERVICE_1';

const PROVIDER_CONFIG = JSON.parse(readFileSync(new URL('../command-center-build/config/provider-profiles.json', import.meta.url), 'utf8'));
const CONNECTION_CONFIG = JSON.parse(readFileSync(new URL('../command-center-build/config/connections.json', import.meta.url), 'utf8'));
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const RAW_CREDENTIAL_VALUE = /(?:\b(?:authorization|bearer|api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret)\b\s*(?:=|:|\s)\s*\S+|\bgh[pousr]_[A-Za-z0-9_]{16,}|\bgithub_pat_[A-Za-z0-9_]{16,}|\bsk-[A-Za-z0-9_-]{16,}|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.)/iu;
const CONNECTION_SETUP_ACTIONS = new Set(['INSTALL', 'SIGN_IN', 'STATUS', 'CANCEL']);
const CONNECTION_ADAPTER_STATES = new Set(['BUILT_IN', 'INSTALLED', 'NOT_INSTALLED', 'UNAVAILABLE']);
const CONNECTION_AUTH_STATES = new Set(['NOT_APPLICABLE', 'SIGNED_OUT', 'AUTHORIZING', 'ACCOUNT_OBSERVED', 'REAUTH_REQUIRED']);
const CONNECTION_CAPABILITY_STATES = new Set(['NOT_DISCOVERED', 'DISCOVERED', 'RECEIPT_BACKED', 'FAILED', 'UNAVAILABLE']);
const CONNECTION_SETUP_ATTEMPT_LIMIT = 32;
const CONNECTION_SETUP_ATTEMPT_TTL_MS = 10 * 60 * 1_000;
const CONNECTION_SETUP_STATUSES = new Set(['DRIVER_INSTALLED', 'READY_TO_SIGN_IN', 'AUTHORIZING', 'SIGNED_IN_UNVERIFIED',
  'CANCELLED', 'EXPIRED', 'REAUTH_REQUIRED', 'ERROR']);
const CONNECTION_STATUS_AUTH = new Map([
  ['READY_TO_SIGN_IN', 'SIGNED_OUT'],
  ['AUTHORIZING', 'AUTHORIZING'],
  ['SIGNED_IN_UNVERIFIED', 'ACCOUNT_OBSERVED'],
  ['REAUTH_REQUIRED', 'REAUTH_REQUIRED']
]);
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonical = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};

function fail(code, status = 422, message, nextAction) {
  const error = Error(code);
  error.code = code;
  error.status = status;
  if (message) error.publicMessage = message;
  if (nextAction) error.nextAction = nextAction;
  throw error;
}

function required(value, code, maximum = 8_000) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > maximum || value.includes('\u0000')) fail(code);
  return value;
}

function brokerNextAction(status, label, fallback) {
  const messages = {
    DRIVER_INSTALLED: `The ${label} driver is installed. Start its provider-owned sign-in flow.`,
    READY_TO_SIGN_IN: `Start the provider-owned ${label} sign-in flow.`,
    AUTHORIZING: `Finish ${label} sign-in in the provider-owned window, then check status here.`,
    SIGNED_IN_UNVERIFIED: `Choose one permitted ${label} source and run a protected read. Sign-in alone is not connection proof.`,
    CANCELLED: `${label} sign-in was cancelled. Start a new attempt when ready.`,
    EXPIRED: `${label} sign-in expired. Start a new attempt.`,
    REAUTH_REQUIRED: `Sign in to ${label} again, then repeat the selected protected read.`,
    ERROR: `Review the local ${label} driver log and retry without changing project evidence.`
  };
  return messages[status] ?? fallback;
}

function identifier(value, code = 'MPC_WORKSPACE_ID_INVALID') {
  if (typeof value !== 'string' || !ID.test(value)) fail(code);
  return value;
}

function utc(clock) {
  const value = clock();
  const result = value instanceof Date ? value.toISOString() : String(value);
  if (!Number.isFinite(Date.parse(result))) fail('MPC_WORKSPACE_CLOCK_INVALID', 500);
  return result;
}

function clone(value) {
  return structuredClone(value);
}

function publicAcquisition(value) {
  const result = clone(value);
  delete result.original_bytes;
  if (result.workflow_record?.content && result.retention?.raw_content_persistable !== true) {
    result.workflow_record = {...result.workflow_record, content: null, content_available_for_current_session: true};
  }
  return result;
}

function defaultDataRoot(platform = process.platform) {
  if (platform === 'win32' && process.env.LOCALAPPDATA) return resolve(process.env.LOCALAPPDATA, 'MPC Workspace');
  if (platform === 'darwin') return resolve(homedir(), 'Library', 'Application Support', 'MPC Workspace');
  return resolve(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'mpc-workspace');
}

function safeRoot(path) {
  const absolute = resolve(path);
  mkdirSync(absolute, {recursive: true, mode: 0o700});
  const entry = lstatSync(absolute);
  if (entry.isSymbolicLink() || !entry.isDirectory() || realpathSync(absolute) !== absolute) {
    fail('MPC_WORKSPACE_DATA_ROOT_INVALID', 500);
  }
  return absolute;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toStoredJson(value) {
  return JSON.parse(JSON.stringify(value, (key, child) => key === 'original_bytes' ? undefined : child));
}

function normalizeLanguage(value) {
  const language = String(value ?? '').toUpperCase();
  if (!['POWERSHELL', 'PYTHON', 'SHELL'].includes(language)) fail('SCRIPT_LANGUAGE_UNSUPPORTED');
  return language;
}

function jobStateFor(journey) {
  if (journey.model_result?.status === 'CANCELLED' || journey.state === 'CANCELLED') return 'CANCELLED';
  if (journey.state === 'COMPLETE') return 'SUCCEEDED';
  if (String(journey.state).startsWith('BLOCKED_') || journey.state === 'ANALYSIS_READY_MODEL_NOT_SELECTED') return 'BLOCKED';
  return 'SUCCEEDED';
}

function redactedInput(value) {
  if (typeof value !== 'string') return {value: null, sha256: null, bytes: 0};
  return {value: null, sha256: sha256(value), bytes: Buffer.byteLength(value)};
}

function redactedValue(value) {
  const serialized = JSON.stringify(value ?? null);
  return {value: null, sha256: sha256(serialized), bytes: Buffer.byteLength(serialized)};
}

function retentionSafeModelResult(value) {
  if (!plainObject(value)) return null;
  const raw = redactedValue(value);
  return {
    adapter: value.adapter ?? null,
    status: value.status ?? null,
    outcome: value.outcome ?? null,
    model_invoked: value.model_invoked === true,
    provider: value.provider ?? null,
    requested_model: value.requested_model ?? value.model ?? null,
    observed_model: value.observed_model ?? null,
    model_digest: value.model_digest ?? null,
    diagnostics: plainObject(value.diagnostics) ? Object.fromEntries([
      'first_token_ms', 'elapsed_ms', 'prompt_tokens', 'output_tokens', 'tokens_per_second',
      'context_length', 'source_excerpt_count', 'eligible_source_count', 'omitted_source_count',
      'truncated_source_count'
    ].map(key => [key, Number.isFinite(value.diagnostics[key]) ? value.diagnostics[key] : null])) : null,
    error: plainObject(value.error) ? {code: value.error.code ?? null} : null,
    content_retained: false,
    content_sha256: raw.sha256,
    content_bytes: raw.bytes
  };
}

function retentionSafeRouterReceipt(value) {
  if (!plainObject(value)) return null;
  const raw = redactedValue(value);
  const workflow = plainObject(value.workflow) ? value.workflow : {};
  const rows = Array.isArray(workflow.source_records) ? workflow.source_records : [];
  return {
    schema_version: value.schema_version ?? null,
    router_invoked: value.router_invoked !== false,
    work_stage: value.work_stage ?? null,
    fact_summary: [],
    fact_summary_retained: false,
    next_action: plainObject(value.next_action) ? {kind: value.next_action.kind ?? null} : null,
    workflow: {
      source_records: rows.map(row => ({
        source_ref: row?.source_ref ?? null,
        version: row?.version ?? null,
        owner: row?.owner ?? null,
        native_locator: row?.native_locator ?? null,
        state: row?.state ?? null,
        content_fingerprint: row?.content_fingerprint ?? null,
        content: null,
        content_retained: false
      })),
      acquired_record_count: workflow.acquired_record_count ?? 0,
      required_record_count: workflow.required_record_count ?? 0,
      remaining_record_count: workflow.remaining_record_count ?? 0,
      evidence_fingerprint: workflow.evidence_fingerprint ?? null
    },
    content_retained: false,
    content_sha256: raw.sha256,
    content_bytes: raw.bytes
  };
}

function retentionSafeJourney(journey) {
  const source = clone(journey);
  const stored = {
    schema_version: source.schema_version,
    project_id: source.project_id,
    job_id: source.job_id,
    state: source.state,
    operation_mode: source.operation_mode ?? 'EVIDENCE_ANALYSIS',
    work_stage: source.work_stage,
    fact_summary: [],
    fact_summary_retained: false,
    next_action: plainObject(source.next_action) ? {kind: source.next_action.kind ?? null} : null,
    progress: plainObject(source.progress) ? {
      acquired: source.progress.acquired ?? 0,
      required: source.progress.required ?? 0,
      remaining: source.progress.remaining ?? 0,
      events: []
    } : null,
    method_candidates: Array.isArray(source.method_candidates) ? source.method_candidates.map(row => ({
      method_id: row?.method_id ?? null,
      implementation_state: row?.implementation_state ?? null,
      method_execution_performed: row?.method_execution_performed === true
    })) : [],
    finite_method_receipt: source.finite_method_receipt === null ? null : {
      status: source.finite_method_receipt?.status ?? null,
      native_status: source.finite_method_receipt?.native_status ?? null,
      tool: source.finite_method_receipt?.tool ?? null,
      arguments_sha256: source.finite_method_receipt?.arguments_sha256 ?? null,
      source_refs: clone(source.finite_method_receipt?.source_refs ?? []),
      input_artifact_id: source.finite_method_receipt?.input_artifact_id ?? null,
      exact_review_classification: source.finite_method_receipt?.exact_comparison_receipt?.comparison?.classification ?? null,
      exact_review_scope: source.finite_method_receipt?.exact_comparison_receipt?.review_scope ?? null,
      exact_review_error_code: source.finite_method_receipt?.exact_review_error_code ?? null,
      result_retained: false,
      receipt_sha256: redactedValue(source.finite_method_receipt).sha256
    },
    acquisition_receipts: Array.isArray(source.acquisition_receipts) ? source.acquisition_receipts.map(receipt => ({
      source_ref: receipt?.source_ref ?? null,
      version: receipt?.version ?? null,
      status: receipt?.status ?? null,
      receipt_sha256: redactedValue(receipt).sha256,
      receipt_retained: false
    })) : [],
    provider_selection: source.provider_selection === null ? null : clone(source.provider_selection),
    model_result: retentionSafeModelResult(source.model_result),
    router_receipt: retentionSafeRouterReceipt(source.router_receipt),
    full_router_receipt_retained: false,
    completion_indicators: clone(source.completion_indicators ?? {}),
    automatic_provider_fallback: false,
    source_authentication: false,
    external_action_performed: false
  };
  const checkpoint = clone(source.checkpoint);
  checkpoint.output = clone(stored);
  const question = redactedInput(checkpoint.request?.question);
  const problem = redactedInput(checkpoint.packet?.problem);
  if (checkpoint.request) {
    checkpoint.request.question = question.value;
    checkpoint.request.question_sha256 = question.sha256;
    checkpoint.request.question_bytes = question.bytes;
    const history = redactedValue(checkpoint.request.conversation_history ?? []);
    checkpoint.request.conversation_history = [];
    checkpoint.request.conversation_history_sha256 = history.sha256;
    checkpoint.request.conversation_history_bytes = history.bytes;
    const instructions = redactedInput(checkpoint.request.assistant_instructions);
    checkpoint.request.assistant_instructions = null;
    checkpoint.request.assistant_instructions_sha256 = instructions.sha256;
    checkpoint.request.assistant_instructions_bytes = instructions.bytes;
    if (checkpoint.request.method_request) {
      const methodInput = redactedValue(checkpoint.request.method_request.arguments?.input ?? null);
      checkpoint.request.method_request = {
        tool: checkpoint.request.method_request.tool ?? null,
        arguments: {method: checkpoint.request.method_request.arguments?.method ?? null, input: null},
        source_refs: clone(checkpoint.request.method_request.source_refs ?? []),
        input_artifact_id: checkpoint.request.method_request.input_artifact_id ?? null,
        selection_basis: checkpoint.request.method_request.selection_basis ?? null,
        input_retained: false,
        input_sha256: methodInput.sha256,
        input_bytes: methodInput.bytes
      };
    }
  }
  if (checkpoint.packet) {
    checkpoint.packet.problem = problem.value;
    checkpoint.packet.problem_sha256 = problem.sha256;
    checkpoint.packet.problem_bytes = problem.bytes;
    if (Array.isArray(checkpoint.packet.workflow?.records)) {
      checkpoint.packet.workflow.records = checkpoint.packet.workflow.records.map(record => {
        const content = redactedInput(record.content);
        const redacted = {...record, content: null, content_sha256: content.sha256,
          content_bytes: content.bytes, content_retained: false};
        return redacted;
      });
    }
  }
  checkpoint.persistence = {
    raw_inputs_retained: false,
    resume_requires_reacquisition: true,
    reason: 'PROJECT_RETENTION_METADATA_ONLY'
  };
  stored.checkpoint = sealWorkspaceCheckpoint(checkpoint);
  stored.persistence = clone(checkpoint.persistence);
  return stored;
}

export class MpcWorkspaceService {
  constructor({dataRoot, database, adapters = {}, clock = () => new Date(), id = randomUUID} = {}) {
    this.clock = clock;
    this.id = id;
    this.adapters = adapters;
    this.dataRoot = safeRoot(dataRoot ?? (database ? dirname(resolve(database)) : defaultDataRoot()));
    this.artifactRoot = safeRoot(join(this.dataRoot, 'artifacts'));
    this.databasePath = resolveMpcWorkspaceDatabasePath({
      databasePath: database ?? join(this.dataRoot, 'mpc-command-center.sqlite')
    });
    this.store = new MpcWorkspaceStore(this.databasePath, {clock, idFactory: id});
    this.chatDatabasePath = join(this.dataRoot, 'mpc-local-chat.sqlite');
    this.chatStore = createLocalChatStore({filePath: this.chatDatabasePath, now: clock});
    this.activeProjectId = this.store.listProjects(1)[0]?.project_id ?? null;
    this.sessionAcquisitions = new Map();
    this.activeJobControllers = new Map();
    this.connectionSetupAttempts = new Map();
    this.connectionSetupInFlight = new Set();
    this.profileCatalog = new Map();
    this.profileObservation = {status: 'NOT_OBSERVED', models: [], loaded_models: []};
    this.modelSetup = new MpcWorkspaceModelSetup({
      client: adapters.localModelClient,
      fetchImpl: adapters.fetch ?? globalThis.fetch,
      startOllama: adapters.startOllama
    });
    this.closed = false;
  }

  next(prefix) {
    return identifier(`${prefix}-${this.id()}`);
  }

  assertOpen() {
    if (this.closed) fail('MPC_WORKSPACE_SERVICE_CLOSED', 503);
  }

  project(projectId) {
    const value = this.store.getProject(identifier(projectId, 'MPC_WORKSPACE_PROJECT_ID_INVALID'));
    if (!value) fail('MPC_WORKSPACE_PROJECT_NOT_FOUND', 404);
    return value;
  }

  chatProjectId(projectId) {
    return `workspace-${sha256(identifier(projectId, 'MPC_WORKSPACE_PROJECT_ID_INVALID')).slice(0, 64)}`;
  }

  ensureChatProject(projectId, {selectedModel} = {}) {
    const project = this.project(projectId);
    const id = this.chatProjectId(projectId);
    let chatProject;
    try {
      chatProject = this.chatStore.getProject(id);
    } catch (error) {
      if (error?.code !== 'LOCAL_CHAT_PROJECT_NOT_FOUND') throw error;
      chatProject = this.chatStore.createProject({
        project_id: id,
        name: project.display_name.slice(0, 120),
        retain_history: project.retention_policy === 'RETAIN_TEXT'
      });
    }
    const patch = {};
    const name = project.display_name.slice(0, 120);
    const retain = project.retention_policy === 'RETAIN_TEXT';
    if (chatProject.name !== name) patch.name = name;
    if (chatProject.retain_history !== retain) patch.retain_history = retain;
    if (selectedModel && chatProject.selected_model !== selectedModel) patch.selected_model = selectedModel;
    if (Object.keys(patch).length) chatProject = this.chatStore.updateProject(id, patch);
    return chatProject;
  }

  chatConversation(projectId) {
    const chatProject = this.ensureChatProject(projectId);
    const conversation = this.chatStore.getConversation(chatProject.id);
    return {
      ...conversation,
      workspace_project_id: projectId,
      storage: {
        kind: 'SEPARATE_LOCAL_CHAT_SQLITE',
        database: basename(this.chatDatabasePath),
        retained: chatProject.retain_history
      }
    };
  }

  applyRetentionPolicy(projectId, requestedPolicy) {
    let project = this.project(projectId);
    if (requestedPolicy !== undefined && requestedPolicy !== project.retention_policy) {
      if (requestedPolicy === 'METADATA_ONLY') {
        if (this.store.hasRawBinaryArtifact(projectId)) fail('MPC_WORKSPACE_RETENTION_DOWNGRADE_RAW_BINARY_PRESENT', 409,
          'This project contains explicitly retained binary bytes that cannot be silently deleted.',
          'Create a new metadata-only project, or explicitly remove the retained source in a future source-management workflow.');
      }
      project = this.store.setProjectRetention(projectId, requestedPolicy);
      if (project.retention_policy === 'METADATA_ONLY') this.sessionAcquisitions.delete(projectId);
      this.ensureChatProject(projectId);
    }
    return project;
  }

  artifactDirectory(projectId) {
    identifier(projectId);
    return safeRoot(join(this.artifactRoot, projectId));
  }

  writeArtifact(projectId, artifactId, extension, content) {
    identifier(artifactId);
    if (!/^\.[a-z0-9]{1,8}$/u.test(extension)) fail('MPC_WORKSPACE_ARTIFACT_EXTENSION_INVALID', 500);
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const directory = this.artifactDirectory(projectId);
    const filename = `${artifactId}${extension}`;
    const path = join(directory, filename);
    if (existsSync(path)) {
      const existing = readFileSync(path);
      if (!existing.equals(bytes)) fail('MPC_WORKSPACE_ARTIFACT_ID_CONFLICT', 409);
    } else {
      const temporary = join(directory, `.${filename}.${process.pid}.${randomUUID()}.tmp`);
      try {
        writeFileSync(temporary, bytes, {flag: 'wx', mode: 0o600});
        renameSync(temporary, path);
      } catch (error) {
        try { unlinkSync(temporary); } catch {}
        throw error;
      }
    }
    return {
      artifact_ref: `mpc-workspace-artifact://${projectId}/${filename}`,
      artifact_sha256: sha256(bytes),
      artifact_bytes: bytes.length,
      path
    };
  }

  readArtifact(reference) {
    required(reference, 'MPC_WORKSPACE_ARTIFACT_REF_INVALID', 4_096);
    const match = /^mpc-workspace-artifact:\/\/([A-Za-z0-9][A-Za-z0-9._:-]{0,239})\/([A-Za-z0-9][A-Za-z0-9._:-]{0,239}\.[a-z0-9]{1,8})$/u.exec(reference);
    if (!match) fail('MPC_WORKSPACE_ARTIFACT_REF_INVALID');
    const path = join(this.artifactDirectory(match[1]), match[2]);
    const entry = lstatSync(path);
    if (entry.isSymbolicLink() || !entry.isFile() || entry.size > 8_000_000) fail('MPC_WORKSPACE_ARTIFACT_INVALID', 500);
    return readFileSync(path);
  }

  readStoredArtifact(artifact, errorCode = 'MPC_WORKSPACE_ARTIFACT_INTEGRITY_FAILED') {
    const bytes = this.readArtifact(artifact.artifact_ref);
    if (bytes.length !== artifact.artifact_bytes || sha256(bytes) !== artifact.artifact_sha256) {
      fail(errorCode, 500);
    }
    return bytes;
  }

  parseStoredJsonArtifact(artifact, errorCode) {
    return JSON.parse(this.readStoredArtifact(artifact, errorCode).toString('utf8'));
  }

  profiles(projectId = this.activeProjectId) {
    const source = this.profileCatalog.size
      ? [...this.profileCatalog.values()]
      : PROVIDER_CONFIG.profiles.map(profile => ({
        ...profile,
        availability: profile.provider === 'OLLAMA' ? 'UNKNOWN' : 'NOT_CONFIGURED',
        observed: false,
        setup_action: profile.provider === 'OLLAMA'
          ? 'Install or start Ollama, then refresh MPC Workspace.'
          : 'Configure this provider for the selected account and project.'
      }));
    return source.map(profile => projectId ? {...clone(profile), workspace_project_id: projectId} : clone(profile));
  }

  async refreshProfiles() {
    const discover = this.adapters.discoverModels ?? ((options) => discoverOllamaModels(options, {
      fetchImpl: this.adapters.fetch ?? globalThis.fetch
    }));
    let observation;
    try {
      observation = await discover({timeout_ms: 1_500});
    } catch (error) {
      observation = {status: 'PROVIDER_UNAVAILABLE', models: [], loaded_models: [],
        error_code: String(error?.code ?? 'OLLAMA_DISCOVERY_FAILED').slice(0, 200)};
    }
    if (!plainObject(observation) || !Array.isArray(observation.models)) {
      observation = {status: 'PROVIDER_UNAVAILABLE', models: [], loaded_models: [],
        error_code: 'OLLAMA_DISCOVERY_RESULT_INVALID'};
    }
    this.profileObservation = clone(observation);
    const installed = new Map(observation.models.filter(row => plainObject(row) &&
      typeof (row.model ?? row.name) === 'string').map(row => [row.model ?? row.name, row]));
    const profiles = PROVIDER_CONFIG.profiles.map(source => {
      const local = source.provider === 'OLLAMA';
      const model = local ? findInstalledOllamaModel(observation.models, source.model) : null;
      return {
        ...clone(source),
        availability: local ? model ? 'AVAILABLE' : 'UNAVAILABLE' : 'NOT_CONFIGURED',
        observed: local,
        observation: local ? {
          status: model ? 'AVAILABLE' : observation.status,
          provider: 'OLLAMA',
          model: source.model,
          observed_model: model?.model ?? model?.name ?? null,
          identity_normalization: model ? (source.model === (model.model ?? model.name) ? 'EXACT' : 'OLLAMA_DEFAULT_LATEST') : null,
          digest: model?.digest ?? null,
          endpoint: observation.endpoint ?? source.endpoint,
          error_code: model ? null : observation.error_code ?? 'MODEL_NOT_INSTALLED'
        } : null,
        setup_action: local
          ? model ? null : observation.status === 'AVAILABLE'
            ? `Install ${source.model} using Set up local AI, then refresh models.`
            : 'Open Set up local AI to start Ollama, then refresh models.'
          : 'Configure this provider for the selected account and project.'
      };
    });
    const configuredModels = new Set(profiles.filter(row => row.provider === 'OLLAMA').map(row => canonicalOllamaModelName(row.model)));
    for (const [modelName, model] of [...installed].sort(([left], [right]) => left.localeCompare(right))) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,89}$/u.test(modelName) ||
          /(?:^|[/:_-])cloud(?::latest)?$/iu.test(modelName) || configuredModels.has(canonicalOllamaModelName(modelName))) continue;
      profiles.push({
        id: `ollama-observed-${sha256(modelName).slice(0, 16)}`,
        label: `Local ${modelName}`,
        provider: 'OLLAMA',
        surface: 'LOCAL',
        model: modelName,
        access_programs: null,
        required_access_tier: null,
        endpoint: observation.endpoint ?? 'http://127.0.0.1:11434',
        operation: 'MODEL_INFERENCE',
        availability: 'AVAILABLE',
        observed: true,
        observation: {status: 'AVAILABLE', provider: 'OLLAMA', model: modelName,
          digest: model.digest ?? null, endpoint: observation.endpoint ?? 'http://127.0.0.1:11434', error_code: null},
        setup_action: null
      });
    }
    this.profileCatalog = new Map(profiles.map(profile => [profile.id, profile]));
    return this.profiles();
  }

  async localModelStatus() {
    this.assertOpen();
    return this.modelSetup.status();
  }

  async startLocalModel(input = {}) {
    this.assertOpen();
    return this.modelSetup.start(input);
  }

  streamLocalModelSetup(operation, input, options) {
    this.assertOpen();
    return this.modelSetup.run(operation, input, options);
  }

  cancelLocalModelSetup(input) {
    this.assertOpen();
    return this.modelSetup.cancel(input);
  }

  listConnections(projectId = this.activeProjectId) {
    const configured = projectId ? this.store.listConnections(projectId) : [];
    const byProvider = new Map(configured.map(row => [row.provider_namespace.toLowerCase(), row]));
    return CONNECTION_CONFIG.services.map(service => {
      const row = byProvider.get(service.id.toLowerCase()) ?? null;
      const observation = row?.latest_observation ?? null;
      return {
        ...clone(service),
        setup: this.connectionSetupDescriptor(service, observation),
        configuration: row,
        ...(row ?? {}),
        current_observation: observation,
        current: observation,
        state: observation?.observation_state ?? (row ? 'CONFIGURED' : service.local_state),
        status: observation?.observation_state ?? (row ? 'CONFIGURED_ONLY' : service.local_state),
        prior_success_is_current_access: false
      };
    });
  }

  connectionSetupDescriptor(service, observation = null) {
    const provider = String(service.id).toUpperCase();
    if (provider === 'OLLAMA') return {
      schema_version: 'MPC_WORKSPACE_AUTH_BROKER_1.0', provider,
      adapter_state: 'BUILT_IN', auth_state: 'NOT_APPLICABLE', capability_state: 'NOT_DISCOVERED',
      actions: ['LOCAL_SETUP'], primary_action: 'LOCAL_SETUP', primary_label: 'Set up local AI',
      next_action: 'Start Ollama, install a selected model, then complete one local inference.',
      credentials_location: 'NOT_REQUIRED'
    };
    if (provider === 'LOCAL_MPC') return {
      schema_version: 'MPC_WORKSPACE_AUTH_BROKER_1.0', provider,
      adapter_state: 'BUILT_IN', auth_state: 'NOT_APPLICABLE', capability_state: 'DISCOVERED',
      actions: ['USE_LOCAL'], primary_action: 'USE_LOCAL', primary_label: 'Use local MPC',
      next_action: 'Choose an implemented method or attach evidence for a bounded local analysis.',
      credentials_location: 'NOT_REQUIRED'
    };
    const setup = plainObject(this.adapters.connectionSetup) ? this.adapters.connectionSetup : {};
    const advertised = plainObject(setup.providers?.[provider]) ? setup.providers[provider]
      : plainObject(setup.providers?.[service.id]) ? setup.providers[service.id] : null;
    if (!advertised) return {
      schema_version: 'MPC_WORKSPACE_AUTH_BROKER_1.0', provider,
      adapter_state: 'NOT_INSTALLED', auth_state: 'NOT_APPLICABLE', capability_state: 'UNAVAILABLE',
      actions: ['SETUP_INFO'], primary_action: 'SETUP_INFO',
      primary_label: provider === 'CHATGPT_SIGN_IN' ? 'Review ChatGPT sign-in setup' : `Set up ${service.label}`,
      next_action: `Install a reviewed ${service.label} host adapter before normal provider sign-in is available.`,
      credentials_location: 'OS_OR_HOST_CREDENTIAL_STORE'
    };
    const adapterState = CONNECTION_ADAPTER_STATES.has(advertised.adapter_state) ? advertised.adapter_state : 'UNAVAILABLE';
    const authState = CONNECTION_AUTH_STATES.has(advertised.auth_state) ? advertised.auth_state : 'SIGNED_OUT';
    const advertisedCapabilityState = CONNECTION_CAPABILITY_STATES.has(advertised.capability_state)
      ? advertised.capability_state : 'NOT_DISCOVERED';
    const receiptBacked = observation?.observation_state === 'SUCCEEDED' && Boolean(observation?.operation_receipt_id);
    const capabilityState = receiptBacked ? 'RECEIPT_BACKED'
      : advertisedCapabilityState === 'RECEIPT_BACKED' ? 'DISCOVERED' : advertisedCapabilityState;
    const driver = setup.drivers?.[provider] ?? setup.drivers?.[service.id];
    const supported = action => action === 'STATUS' ? typeof driver?.status === 'function'
      : action === 'CANCEL' ? typeof driver?.cancel === 'function' : typeof driver?.begin === 'function';
    const actions = Array.isArray(advertised.actions)
      ? [...new Set(advertised.actions.filter(action => CONNECTION_SETUP_ACTIONS.has(action) && supported(action)))] : [];
    const signIn = adapterState === 'INSTALLED' && authState !== 'ACCOUNT_OBSERVED' && actions.includes('SIGN_IN');
    const install = adapterState === 'NOT_INSTALLED' && actions.includes('INSTALL');
    const primaryAction = signIn ? 'SIGN_IN' : install ? 'INSTALL' : 'SETUP_INFO';
    return {
      schema_version: 'MPC_WORKSPACE_AUTH_BROKER_1.0', provider,
      adapter_state: adapterState, auth_state: authState, capability_state: capabilityState,
      actions, primary_action: primaryAction,
      primary_label: primaryAction === 'SIGN_IN' ? `Sign in with ${service.label}`
        : primaryAction === 'INSTALL' ? `Install ${service.label} connector` : `Review ${service.label} setup`,
      next_action: primaryAction === 'SIGN_IN'
        ? `Sign in through the provider-owned browser flow, then verify one selected read.`
        : primaryAction === 'INSTALL' ? `Install the reviewed ${service.label} driver, then return to sign in.`
          : `Review the installed adapter and its supported authentication method.`,
      credentials_location: 'OS_OR_HOST_CREDENTIAL_STORE'
    };
  }

  pruneConnectionSetupAttempts() {
    const now = Date.parse(utc(this.clock));
    for (const [attemptId, attempt] of this.connectionSetupAttempts) {
      if (attempt.expires_at_ms <= now) this.connectionSetupAttempts.delete(attemptId);
    }
    return now;
  }

  async setupConnection(input = {}) {
    this.assertOpen();
    const projectId = identifier(input.project_id ?? this.activeProjectId, 'MPC_WORKSPACE_PROJECT_REQUIRED');
    this.project(projectId);
    const provider = required(input.provider, 'MPC_WORKSPACE_CONNECTION_PROVIDER_REQUIRED', 128).toUpperCase();
    const service = CONNECTION_CONFIG.services.find(row => row.id.toUpperCase() === provider);
    if (!service) fail('MPC_WORKSPACE_CONNECTION_PROVIDER_UNSUPPORTED');
    const action = required(input.action, 'MPC_WORKSPACE_CONNECTION_SETUP_ACTION_REQUIRED', 32).toUpperCase();
    if (!CONNECTION_SETUP_ACTIONS.has(action)) fail('MPC_WORKSPACE_CONNECTION_SETUP_ACTION_UNSUPPORTED');
    const descriptor = this.connectionSetupDescriptor(service);
    const setup = plainObject(this.adapters.connectionSetup) ? this.adapters.connectionSetup : {};
    const driver = setup.drivers?.[provider] ?? setup.drivers?.[service.id];
    const handler = action === 'STATUS' ? driver?.status : action === 'CANCEL' ? driver?.cancel : driver?.begin;
    const continuation = ['STATUS', 'CANCEL'].includes(action);
    const attemptNow = this.pruneConnectionSetupAttempts();
    const publicAttemptId = input.attempt_id === undefined ? null
      : identifier(input.attempt_id, 'MPC_WORKSPACE_CONNECTION_ATTEMPT_ID_INVALID');
    if (continuation && !publicAttemptId) fail('MPC_WORKSPACE_CONNECTION_ATTEMPT_ID_REQUIRED');
    if (!continuation && publicAttemptId) fail('MPC_WORKSPACE_CONNECTION_ATTEMPT_ID_UNEXPECTED');
    if (!continuation && this.connectionSetupAttempts.size + this.connectionSetupInFlight.size >= CONNECTION_SETUP_ATTEMPT_LIMIT) {
      fail('MPC_WORKSPACE_CONNECTION_SETUP_ATTEMPT_LIMIT', 429,
        'Too many connector setup attempts are awaiting completion.', 'Finish, cancel or let an earlier attempt expire before starting another.');
    }
    const attempt = continuation ? this.connectionSetupAttempts.get(publicAttemptId) : null;
    if (continuation && (!attempt || attempt.project_id !== projectId || attempt.provider !== provider)) {
      fail('MPC_WORKSPACE_CONNECTION_ATTEMPT_NOT_FOUND', 404);
    }
    if (!descriptor.actions.includes(action) || typeof handler !== 'function' ||
        (continuation && !attempt.actions.includes(action))) return {
      ...descriptor, workspace_project_id: projectId, action, status: 'DRIVER_SETUP_REQUIRED', external_action_performed: false,
      configured: false, authenticated: false, last_operation_verified: false
    };
    const driverAttemptId = attempt?.driver_attempt_id ?? null;
    const inFlightKey = continuation ? null : `${projectId}\u0000${provider}`;
    if (inFlightKey && this.connectionSetupInFlight.has(inFlightKey)) {
      fail('MPC_WORKSPACE_CONNECTION_SETUP_IN_PROGRESS', 409,
        `${service.label} setup is already starting for this project.`, 'Wait for the current provider flow before trying again.');
    }
    if (inFlightKey) this.connectionSetupInFlight.add(inFlightKey);
    let result;
    try {
      result = await handler.call(driver, {provider, workspace_project_id: projectId, action, attempt_id: driverAttemptId});
    } catch {
      fail('MPC_WORKSPACE_CONNECTION_DRIVER_FAILED', 502,
        'The connector setup driver could not complete this action.',
        `Review the local ${service.label} connector log and retry the provider flow.`);
    } finally {
      if (inFlightKey) this.connectionSetupInFlight.delete(inFlightKey);
    }
    if (!plainObject(result)) fail('MPC_WORKSPACE_CONNECTION_SETUP_RESULT_INVALID', 502);
    const status = CONNECTION_SETUP_STATUSES.has(result.status) ? result.status : 'ERROR';
    const returnedAttempt = result.attempt_id === undefined || result.attempt_id === null ? null
      : identifier(result.attempt_id, 'MPC_WORKSPACE_CONNECTION_ATTEMPT_ID_INVALID');
    if (continuation && returnedAttempt && returnedAttempt !== driverAttemptId) {
      fail('MPC_WORKSPACE_CONNECTION_ATTEMPT_CHANGED', 502);
    }
    const adapterState = CONNECTION_ADAPTER_STATES.has(result.adapter_state) ? result.adapter_state : descriptor.adapter_state;
    const authState = CONNECTION_AUTH_STATES.has(result.auth_state) ? result.auth_state : descriptor.auth_state;
    const capabilityState = CONNECTION_CAPABILITY_STATES.has(result.capability_state)
      ? result.capability_state : descriptor.capability_state;
    if (CONNECTION_STATUS_AUTH.has(status) && CONNECTION_STATUS_AUTH.get(status) !== authState) {
      fail('MPC_WORKSPACE_CONNECTION_SETUP_STATE_CONTRADICTORY', 502);
    }
    if (['DRIVER_INSTALLED', 'READY_TO_SIGN_IN', 'AUTHORIZING', 'SIGNED_IN_UNVERIFIED', 'REAUTH_REQUIRED']
      .includes(status) && adapterState !== 'INSTALLED') {
      fail('MPC_WORKSPACE_CONNECTION_SETUP_STATE_CONTRADICTORY', 502);
    }
    if (!continuation && status === 'AUTHORIZING' && result.external_action_performed !== true) {
      fail('MPC_WORKSPACE_CONNECTION_SETUP_STATE_CONTRADICTORY', 502);
    }
    if (capabilityState === 'RECEIPT_BACKED') {
      fail('MPC_WORKSPACE_CONNECTION_SETUP_CANNOT_VERIFY_OPERATION', 502);
    }
    const continuationActions = descriptor.actions.filter(item => ['STATUS', 'CANCEL'].includes(item));
    if (!continuation && status === 'AUTHORIZING' && (!returnedAttempt || !continuationActions.includes('STATUS'))) {
      fail('MPC_WORKSPACE_CONNECTION_SETUP_STATE_CONTRADICTORY', 502);
    }
    let returnedPublicAttempt = continuation ? publicAttemptId : null;
    const remainsActive = status === 'AUTHORIZING' && continuationActions.length > 0;
    if (!continuation && remainsActive) {
      if (!returnedAttempt) fail('MPC_WORKSPACE_CONNECTION_ATTEMPT_ID_REQUIRED', 502);
      returnedPublicAttempt = `AUTH-${randomUUID()}`;
      this.connectionSetupAttempts.set(returnedPublicAttempt, {
        project_id: projectId, provider, driver_attempt_id: returnedAttempt, actions: continuationActions,
        expires_at_ms: attemptNow + CONNECTION_SETUP_ATTEMPT_TTL_MS
      });
    } else if (continuation && !remainsActive) {
      this.connectionSetupAttempts.delete(publicAttemptId);
      returnedPublicAttempt = null;
    }
    return {
      schema_version: 'MPC_WORKSPACE_AUTH_BROKER_1.0', workspace_project_id: projectId, provider, action, status,
      attempt_id: returnedPublicAttempt, continuation_actions: remainsActive ? continuationActions : [],
      adapter_state: adapterState, auth_state: authState, capability_state: capabilityState,
      account_label: status === 'SIGNED_IN_UNVERIFIED' && authState === 'ACCOUNT_OBSERVED' ? 'Account observed' : null,
      granted_scopes: [], scope_details_withheld: Array.isArray(result.granted_scopes) && result.granted_scopes.length > 0,
      next_action: brokerNextAction(status, service.label, descriptor.next_action),
      credentials_location: 'OS_OR_HOST_CREDENTIAL_STORE', external_action_performed: result.external_action_performed === true,
      configured: false, account_observed: status === 'SIGNED_IN_UNVERIFIED' && authState === 'ACCOUNT_OBSERVED',
      authenticated: status === 'SIGNED_IN_UNVERIFIED' && authState === 'ACCOUNT_OBSERVED', last_operation_verified: false
    };
  }

  listReports(projectId = this.activeProjectId) {
    if (!projectId) return [];
    return this.store.listReports(projectId);
  }

  listSnapshotComparisons(projectId = this.activeProjectId) {
    if (!projectId) return [];
    return this.store.listSnapshotComparisons(projectId);
  }

  listTasks(projectId = this.activeProjectId) {
    if (!projectId) return [];
    const jobs = this.store.listJobs(projectId);
    const jobsByTask = new Map();
    for (const job of jobs) if (!jobsByTask.has(job.task_id)) jobsByTask.set(job.task_id, job);
    return this.store.listTasks(projectId).map(task => ({...task, ...(jobsByTask.get(task.task_id) ?? {})}));
  }

  projectDetail(projectId) {
    const project = this.project(projectId);
    const resume = this.store.getResumeState(projectId);
    if (resume?.job?.job_id) resume.job = {...this.getJob(resume.job.job_id, projectId), resume_required: true};
    const sources = this.store.listSources(projectId);
    const evidence = this.store.listEvidenceLedger(projectId);
    const sourceCount = this.store.countSources(projectId);
    const folders = this.store.listAttachedFolders(projectId);
    const snapshots = this.store.listSnapshots(projectId);
    const snapshotComparisons = this.listSnapshotComparisons(projectId);
    return {
      ...project,
      resume_state: resume,
      tasks: this.listTasks(projectId),
      reports: this.listReports(projectId),
      connections: this.listConnections(projectId),
      sources,
      source_coverage: {returned: sources.length, total: sourceCount, truncated: sources.length < sourceCount,
        next_action: sources.length < sourceCount ? 'Use project search to query the full retained-text index.' : null},
      attached_folders: folders,
      snapshots,
      snapshot_comparisons: snapshotComparisons,
      conversation: this.chatConversation(projectId),
      evidence
    };
  }

  async bootstrap() {
    this.assertOpen();
    await this.refreshProfiles();
    const projects = this.store.listProjects();
    if (!this.activeProjectId && projects.length) this.activeProjectId = projects[0].project_id;
    const project = this.activeProjectId ? this.projectDetail(this.activeProjectId) : null;
    const catalog = getMethodCatalog();
    return {
      service_version: MPC_WORKSPACE_SERVICE_VERSION,
      projects,
      selected_project_id: this.activeProjectId,
      project,
      provider_profiles: this.profiles(this.activeProjectId),
      selected_provider_profile: project?.selected_provider_profile_id
        ? {profile_id: project.selected_provider_profile_id}
        : null,
      selected_provider_profile_id: project?.selected_provider_profile_id || null,
      connections: this.listConnections(this.activeProjectId),
      reports: project?.reports ?? [],
      methods: catalog.methods,
      tasks: project?.tasks ?? [],
      snapshots: project?.snapshots ?? [],
      snapshot_comparisons: project?.snapshot_comparisons ?? [],
      evidence: project?.evidence ?? [],
      sources: project?.sources ?? [],
      resume_state: project?.resume_state ?? null,
      service: {
        status: 'READY_LOCAL',
        database: basename(this.databasePath),
        database_schema: this.store.status().schema_version,
        online: false,
        actual_provider_observation_required: true
      }
    };
  }

  listProjects() {
    this.assertOpen();
    return this.store.listProjects();
  }

  createProject(input) {
    this.assertOpen();
    if (!plainObject(input)) fail('MPC_WORKSPACE_PROJECT_INPUT_INVALID');
    const retentionPolicy = input.retention_policy ?? 'RETAIN_TEXT';
    const rawObjective = String(input.objective ?? '');
    const requestedProjectId = input.project_id === undefined ? null
      : identifier(input.project_id, 'MPC_WORKSPACE_PROJECT_ID_INVALID');
    const chatProjects = this.chatStore.listProjects();
    const existingChatProject = requestedProjectId === null ? false
      : chatProjects.some(project => project.id === this.chatProjectId(requestedProjectId));
    if (!existingChatProject && chatProjects.length >= LOCAL_CHAT_LIMITS.projects) {
      fail('MPC_WORKSPACE_CHAT_PROJECT_LIMIT', 409,
        `MPC Workspace supports at most ${LOCAL_CHAT_LIMITS.projects} projects in this local profile.`,
        'Reopen an existing project instead of creating another one.');
    }
    const project = this.store.createProject({
      project_id: requestedProjectId ?? undefined,
      display_name: required(input.display_name ?? input.name, 'MPC_WORKSPACE_PROJECT_NAME_REQUIRED', 512),
      objective: retentionPolicy === 'RETAIN_TEXT' ? rawObjective : rawObjective
        ? `Metadata-only objective ${sha256(rawObjective).slice(0, 24)}` : '',
      retention_policy: retentionPolicy
    });
    const detail = this.projectDetail(project.project_id);
    this.activeProjectId = project.project_id;
    return detail;
  }

  openProject(projectId, input = {}) {
    this.assertOpen();
    let project = this.project(projectId);
    if (plainObject(input) && typeof input.draft_text === 'string') this.store.saveProjectDraft(projectId, input.draft_text);
    project = this.store.touchProject(projectId);
    this.activeProjectId = project.project_id;
    return this.projectDetail(projectId);
  }

  saveProjectDraft(projectId, input = {}) {
    this.assertOpen();
    if (!plainObject(input) || typeof input.text !== 'string') fail('MPC_WORKSPACE_DRAFT_INPUT_INVALID');
    const suppliedHash = input.text_sha256;
    const actualHash = sha256(input.text);
    if (suppliedHash !== undefined && suppliedHash !== actualHash) fail('MPC_WORKSPACE_DRAFT_HASH_MISMATCH', 409);
    if (input.utf8_bytes !== undefined && input.utf8_bytes !== Buffer.byteLength(input.text)) {
      fail('MPC_WORKSPACE_DRAFT_LENGTH_MISMATCH', 409);
    }
    this.applyRetentionPolicy(projectId, input.retention_policy);
    return this.store.saveProjectDraft(projectId, input.text);
  }

  getProject(projectId) {
    this.assertOpen();
    return this.projectDetail(projectId);
  }

  rememberAcquisition(acquisition) {
    const current = this.sessionAcquisitions.get(acquisition.project_id) ?? [];
    current.push(acquisition);
    this.sessionAcquisitions.set(acquisition.project_id, current);
  }

  persistAcquisition(acquisition, originalText = null) {
    const project = this.project(acquisition.project_id);
    const exactByteFile = ['LOCAL_TEXT_FILE', 'LOCAL_BINARY_FILE'].includes(acquisition.kind) &&
      Buffer.isBuffer(acquisition.original_bytes);
    const existing = this.store.db.prepare(`SELECT * FROM cc_sources WHERE project_id=? AND source_owner=?
      AND source_namespace='LOCAL_INPUT' AND native_id_type=? AND native_id=?
      AND content_sha256=? ORDER BY acquired_at_utc,source_id LIMIT 1`).get(
      acquisition.project_id, acquisition.source.owner, acquisition.source.type,
      acquisition.source.native_locator, acquisition.content_sha256
    );
    if (existing) {
      acquisition.source.id = existing.source_id;
      acquisition.source.version = existing.native_version;
      if (acquisition.workflow_record) {
        acquisition.workflow_record.source_ref = existing.source_id;
        acquisition.workflow_record.version = existing.native_version;
      }
      let retained = null;
      if (exactByteFile && project.retention_policy === 'RETAIN_TEXT') {
        const rawArtifact = this.store.db.prepare(`SELECT artifact_id FROM cc_artifacts
          WHERE project_id=? AND source_id=? AND artifact_kind IN ('INPUT_FILE','SCREENSHOT')
          AND artifact_ref LIKE 'mpc-workspace-artifact://%' LIMIT 1`).get(acquisition.project_id, existing.source_id);
        if (!rawArtifact) {
          const rawArtifactId = `ARTIFACT-FILE-${sha256(`${acquisition.project_id}\n${acquisition.source.owner}\n${acquisition.source.native_locator}\n${acquisition.source.version}\n${acquisition.content_sha256}`).slice(0, 44)}-RAW`;
          const storedBytes = this.writeArtifact(acquisition.project_id, rawArtifactId, '.bin', acquisition.original_bytes);
          this.store.createArtifact({project_id: acquisition.project_id, artifact_id: rawArtifactId,
            artifact_kind: acquisition.detected_format === 'IMAGE' ? 'SCREENSHOT' : 'INPUT_FILE',
            source_id: existing.source_id, display_name: acquisition.name,
            media_type: acquisition.detected_format === 'IMAGE' ? 'image/*' : 'application/octet-stream',
            ...storedBytes});
        }
      }
      if (originalText !== null && project.retention_policy === 'RETAIN_TEXT') {
        retained = this.store.retainTextForExistingSource({
          project_id: acquisition.project_id,
          source_id: existing.source_id,
          text: originalText,
          display_name: acquisition.name
        });
      }
      const artifact = this.store.db.prepare(`SELECT artifact_id FROM cc_artifacts
        WHERE project_id=? AND source_id=? ORDER BY created_at_utc,artifact_id LIMIT 1`).get(
        acquisition.project_id, existing.source_id
      );
      acquisition.acquisition_id = retained?.document_id ?? artifact?.artifact_id ?? acquisition.acquisition_id;
      return {source_id: existing.source_id, artifact_id: retained?.artifact_id ?? artifact?.artifact_id ?? null,
        retained: Boolean(retained?.retained), reused: true};
    }
    if (exactByteFile) {
      const artifactId = `ARTIFACT-FILE-${sha256(`${acquisition.project_id}\n${acquisition.source.owner}\n${acquisition.source.native_locator}\n${acquisition.source.version}\n${acquisition.content_sha256}`).slice(0, 44)}-${project.retention_policy === 'RETAIN_TEXT' ? 'RAW' : 'DIGEST'}`;
      const artifactStorage = project.retention_policy === 'RETAIN_TEXT'
        ? this.writeArtifact(acquisition.project_id, artifactId, '.bin', acquisition.original_bytes)
        : {artifact_ref: `digest://sha256/${acquisition.content_sha256}`,
          artifact_sha256: acquisition.content_sha256, artifact_bytes: acquisition.byte_length};
      const saved = this.store.acquireFileInput({
        project_id: acquisition.project_id,
        source: {
          source_id: acquisition.source.id,
          source_owner: acquisition.source.owner,
          native_id_type: acquisition.source.type,
          native_id: acquisition.source.native_locator,
          native_version: acquisition.source.version,
          content_sha256: acquisition.content_sha256,
          acquired_at_utc: acquisition.source.time
        },
        artifact: {
          artifact_id: artifactId,
          artifact_kind: acquisition.detected_format === 'IMAGE' ? 'SCREENSHOT' : 'INPUT_FILE',
          display_name: acquisition.name,
          media_type: acquisition.detected_format === 'IMAGE' ? 'image/*' : 'application/octet-stream',
          ...artifactStorage
        }
      });
      acquisition.source.id = saved.source_id;
      if (acquisition.workflow_record) acquisition.workflow_record.source_ref = saved.source_id;
      let retained = null;
      if (originalText !== null && project.retention_policy === 'RETAIN_TEXT') {
        retained = this.store.retainTextForExistingSource({
          project_id: acquisition.project_id,
          source_id: saved.source_id,
          text: originalText,
          display_name: `${acquisition.name} decoded UTF-8 representation`
        });
      }
      acquisition.acquisition_id = retained?.document_id ?? saved.artifact_id ?? acquisition.acquisition_id;
      return {...saved, document_id: retained?.document_id ?? null,
        decoded_text_retained: Boolean(retained?.retained)};
    }
    if (originalText !== null) {
      const saved = this.store.acquireTextInput({
        project_id: acquisition.project_id,
        source_id: acquisition.source.id,
        text: originalText,
        display_name: acquisition.name,
        source_owner: acquisition.source.owner,
        native_id_type: acquisition.source.type,
        native_id: acquisition.source.native_locator,
        native_version: acquisition.source.version
      });
      acquisition.source.id = saved.source_id;
      if (acquisition.workflow_record) acquisition.workflow_record.source_ref = saved.source_id;
      acquisition.acquisition_id = saved.document_id ?? saved.artifact_id ?? acquisition.acquisition_id;
      return saved;
    }
    this.store.createSource({
      project_id: acquisition.project_id,
      source_id: acquisition.source.id,
      source_owner: acquisition.source.owner,
      source_namespace: 'LOCAL_INPUT',
      native_id_type: acquisition.source.type,
      native_id: acquisition.source.native_locator,
      native_version: acquisition.source.version,
      content_sha256: acquisition.content_sha256,
      acquisition_state: 'ACQUIRED',
      acquired_at_utc: acquisition.source.time
    });
    const artifactId = this.next('ARTIFACT');
    let artifactStorage = {
      artifact_ref: project.retention_policy === 'RETAIN_TEXT' ? acquisition.source.native_locator : `digest://sha256/${acquisition.content_sha256}`,
      artifact_sha256: acquisition.content_sha256,
      artifact_bytes: acquisition.byte_length
    };
    if (project.retention_policy === 'RETAIN_TEXT' && Buffer.isBuffer(acquisition.original_bytes)) {
      artifactStorage = this.writeArtifact(acquisition.project_id, artifactId, '.bin', acquisition.original_bytes);
    }
    this.store.createArtifact({
      project_id: acquisition.project_id,
      artifact_id: artifactId,
      artifact_kind: acquisition.detected_format === 'IMAGE' ? 'SCREENSHOT' : 'INPUT_FILE',
      source_id: acquisition.source.id,
      display_name: acquisition.name,
      media_type: acquisition.detected_format === 'IMAGE' ? 'image/*' : 'application/octet-stream',
      ...artifactStorage
    });
    acquisition.acquisition_id = artifactId;
    return {source_id: acquisition.source.id, artifact_id: artifactId, retained: false};
  }

  async ingestInput(input) {
    this.assertOpen();
    if (!plainObject(input)) fail('MPC_WORKSPACE_INPUT_INVALID');
    const projectId = input.project_id ?? this.activeProjectId;
    const project = this.applyRetentionPolicy(projectId, input.retention_policy);
    const kind = String(input.kind ?? input.input_kind ?? 'TEXT').toUpperCase();
    if (kind === 'TEXT' || kind === 'PASTE') {
      const text = typeof input.text === 'string' ? input.text : input.content;
      const acquisition = ingestText({
        project_id: projectId,
        text,
        name: input.name ?? 'Pasted text',
        format_hint: input.format_hint ?? 'AUTO',
        retain_raw: project.retention_policy === 'RETAIN_TEXT',
        retention_authorization_ref: project.retention_policy === 'RETAIN_TEXT' ? `project-retention://${projectId}/RETAIN_TEXT` : null,
        observed_at_utc: utc(this.clock)
      }, {id: this.id});
      this.persistAcquisition(acquisition, text);
      this.rememberAcquisition(acquisition);
      if (acquisition.coverage.state === 'CHUNK_SELECTION_REQUIRED') {
        const chunked = chunkTextAcquisition(acquisition, {max_chunk_bytes: 180_000, max_chunks: 12}, {id: this.id});
        for (const chunk of chunked.chunks) {
          this.persistAcquisition(chunk, chunk.workflow_record.content);
          this.rememberAcquisition(chunk);
        }
        return {
          status: chunked.coverage.complete ? 'ACQUIRED_AS_BOUNDED_CHUNKS' : 'PARTIAL_BOUNDED_CHUNKS',
          project_id: projectId,
          original: publicAcquisition(acquisition),
          acquisitions: chunked.chunks.map(publicAcquisition),
          acquisition_ids: chunked.chunks.map(chunk => chunk.acquisition_id),
          coverage: chunked.coverage,
          silent_truncation: false
        };
      }
      return publicAcquisition(acquisition);
    }
    if (kind === 'FILES') {
      const paths = Array.isArray(input.selected_paths) ? input.selected_paths : [];
      const suppliedFiles = Array.isArray(input.files) ? input.files : [];
      if (!paths.length && !suppliedFiles.length) fail('MPC_WORKSPACE_FILES_REQUIRED');
      if (paths.length + suppliedFiles.length > 32) fail('MPC_WORKSPACE_FILE_COUNT_LIMIT');
      const acquisitions = [];
      for (const filePath of paths) acquisitions.push(await this.ingestInput({
        ...input,
        kind: 'FILE',
        file_path: filePath,
        selected_paths: undefined,
        files: undefined
      }));
      for (const file of suppliedFiles) {
        if (!plainObject(file)) fail('MPC_WORKSPACE_BROWSER_FILE_INVALID');
        const encoded = required(file.bytes_base64, 'MPC_WORKSPACE_BROWSER_FILE_BYTES_REQUIRED', 2_800_000);
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) {
          fail('MPC_WORKSPACE_BROWSER_FILE_BASE64_INVALID');
        }
        const bytes = Buffer.from(encoded, 'base64');
        if (file.byte_length !== undefined && file.byte_length !== bytes.length) fail('MPC_WORKSPACE_BROWSER_FILE_LENGTH_MISMATCH', 409);
        const locator = `workspace-browser-file://${identifier(input.client_id ?? this.next('UPLOAD'))}/${encodeURIComponent(required(file.name, 'MPC_WORKSPACE_BROWSER_FILE_NAME_REQUIRED', 1_000))}`;
        const acquisition = await ingestFile({
          project_id: projectId,
          file_path: locator,
          name: file.name,
          format_hint: input.format_hint ?? input.detected_format_hint ?? 'AUTO',
          retain_raw: project.retention_policy === 'RETAIN_TEXT',
          retention_authorization_ref: project.retention_policy === 'RETAIN_TEXT' ? `project-retention://${projectId}/RETAIN_TEXT` : null,
          observed_at_utc: utc(this.clock)
        }, {
          id: this.id,
          statPath: async () => ({isSymbolicLink: () => false}),
          resolveRealPath: async () => locator,
          readFile: async () => ({bytes, stat: {size: bytes.length, mtimeMs: 0, isFile: () => true}})
        });
        this.persistAcquisition(acquisition,
          project.retention_policy === 'RETAIN_TEXT' ? acquisition.workflow_record?.content ?? null : null);
        this.rememberAcquisition(acquisition);
        if (acquisition.coverage.state === 'CHUNK_SELECTION_REQUIRED') {
          const chunked = chunkTextAcquisition(acquisition, {max_chunk_bytes: 180_000, max_chunks: 12}, {id: this.id});
          for (const chunk of chunked.chunks) {
            this.persistAcquisition(chunk, chunk.workflow_record.content);
            this.rememberAcquisition(chunk);
            acquisitions.push(publicAcquisition(chunk));
          }
        } else acquisitions.push(publicAcquisition(acquisition));
      }
      return acquisitions.length === 1 ? acquisitions[0] : {
        status: 'ACQUIRED',
        project_id: projectId,
        acquisitions,
        acquisition_ids: acquisitions.map(row => row.acquisition_id)
      };
    }
    if (kind === 'FILE' || kind === 'SCREENSHOT') {
      const acquisition = await ingestFile({
        project_id: projectId,
        file_path: required(input.file_path, 'MPC_WORKSPACE_FILE_PATH_REQUIRED', 32_768),
        name: input.name,
        format_hint: kind === 'SCREENSHOT' ? 'IMAGE' : input.format_hint ?? 'AUTO',
        retain_raw: project.retention_policy === 'RETAIN_TEXT',
        retention_authorization_ref: project.retention_policy === 'RETAIN_TEXT' ? `project-retention://${projectId}/RETAIN_TEXT` : null,
        observed_at_utc: utc(this.clock)
      }, this.adapters.file ?? {});
      this.persistAcquisition(acquisition,
        project.retention_policy === 'RETAIN_TEXT' ? acquisition.workflow_record?.content ?? null : null);
      this.rememberAcquisition(acquisition);
      if (acquisition.coverage.state === 'CHUNK_SELECTION_REQUIRED') {
        const chunked = chunkTextAcquisition(acquisition, {max_chunk_bytes: 180_000, max_chunks: 12}, {id: this.id});
        for (const chunk of chunked.chunks) {
          this.persistAcquisition(chunk, chunk.workflow_record.content);
          this.rememberAcquisition(chunk);
        }
        return {status: chunked.coverage.complete ? 'ACQUIRED_AS_BOUNDED_CHUNKS' : 'PARTIAL_BOUNDED_CHUNKS',
          project_id: projectId, original: publicAcquisition(acquisition), acquisitions: chunked.chunks.map(publicAcquisition),
          acquisition_ids: chunked.chunks.map(chunk => chunk.acquisition_id), coverage: chunked.coverage,
          silent_truncation: false};
      }
      return publicAcquisition(acquisition);
    }
    if (kind === 'FOLDER') {
      const contentFileLimit = input.content_file_limit ?? 24;
      if (!Number.isSafeInteger(contentFileLimit) || contentFileLimit < 0 || contentFileLimit > 32) {
        fail('MPC_WORKSPACE_FOLDER_CONTENT_LIMIT_INVALID');
      }
      const index = await indexAttachedFolder({
        project_id: projectId,
        root_path: required(input.root_path ?? input.selected_path, 'MPC_WORKSPACE_FOLDER_PATH_REQUIRED', 32_768),
        mount_id: input.mount_id,
        host_id: input.host_id ?? 'LOCAL_HOST',
        source_kind: input.source_kind ?? 'LOCAL_FOLDER',
        include_subfolders: input.include_subfolders !== false,
        exclusions: input.exclusions,
        max_entries: input.max_entries ?? 10_000,
        observed_at_utc: utc(this.clock)
      }, this.adapters.folder ?? {});
      const exclusions = index.exclusions ?? input.exclusions ?? [];
      const attached = this.store.attachFolder({
        project_id: projectId,
        mount_id: index.mount_id,
        host_id: index.host_id,
        root_locator: index.root_locator,
        source_kind: index.source_kind,
        include_subfolders: index.include_subfolders,
        connection_state: index.connection_state,
        index_state: index.index_state,
        rules: exclusions.map((pattern, position) => ({
          rule_id: this.next(`RULE-${position + 1}`),
          rule_kind: 'EXCLUDE',
          pattern
        }))
      });
      index.mount_id = attached.mount_id;
      index.exclusions = [...exclusions];
      for (const entry of index.entries) {
        if (entry.source_id) entry.source_id.namespace = `MOUNT:${index.mount_id}`;
      }
      const scanId = this.next('SCAN');
      this.store.recordFolderScanEvent({
        project_id: projectId,
        mount_id: index.mount_id,
        scan_id: scanId,
        scan_state: 'RUNNING',
        pending_count: index.counts.pending
      });
      const acquisitions = [];
      const contentErrors = [];
      let attemptedContentFiles = 0;
      let acquiredContentFiles = 0;
      let skippedContentFiles = 0;
      for (const entry of index.entries.filter(row => row.kind === 'FILE' && row.file_state === 'PRESENT' && row.version)) {
        const sourceId = this.next('SRC');
        const absolutePath = join(index.root_locator, ...entry.relative_locator.split('/'));
        if (attemptedContentFiles < contentFileLimit) {
          attemptedContentFiles++;
          try {
            const acquisition = await ingestFile({
              project_id: projectId,
              file_path: absolutePath,
              name: entry.relative_locator,
              source_id: sourceId,
              format_hint: 'AUTO',
              retain_raw: project.retention_policy === 'RETAIN_TEXT',
              retention_authorization_ref: project.retention_policy === 'RETAIN_TEXT'
                ? `project-retention://${projectId}/RETAIN_TEXT` : null,
              observed_at_utc: entry.observed_at_utc ?? index.observed_at_utc
            }, this.adapters.file ?? {});
            acquisition.source.owner = index.host_id;
            acquisition.source.type = 'relative_path';
            acquisition.source.version = entry.version;
            acquisition.source.native_locator = absolutePath;
            if (acquisition.workflow_record) {
              acquisition.workflow_record.source_ref = acquisition.source.id;
              acquisition.workflow_record.version = entry.version;
            }
            const artifactId = `ARTIFACT-FOLDER-${sha256(`${projectId}\n${index.mount_id}\n${entry.relative_locator}\n${entry.version}\n${acquisition.content_sha256}`).slice(0, 40)}-${project.retention_policy === 'RETAIN_TEXT' ? 'RAW' : 'DIGEST'}`;
            const artifactStorage = project.retention_policy === 'RETAIN_TEXT'
              ? this.writeArtifact(projectId, artifactId, '.bin', acquisition.original_bytes)
              : {artifact_ref: `digest://sha256/${acquisition.content_sha256}`,
                artifact_sha256: acquisition.content_sha256, artifact_bytes: acquisition.byte_length};
            const saved = this.store.acquireAttachedFile({
              project_id: projectId,
              mount_id: index.mount_id,
              relative_locator: entry.relative_locator,
              file_version: entry.version,
              source: {
                source_id: acquisition.source.id,
                source_owner: acquisition.source.owner,
                native_id_type: acquisition.source.type,
                native_id: acquisition.source.native_locator,
                native_version: acquisition.source.version,
                content_sha256: acquisition.content_sha256,
                acquired_at_utc: acquisition.source.time
              },
              artifact: {
                artifact_id: artifactId,
                artifact_kind: acquisition.detected_format === 'IMAGE' ? 'SCREENSHOT' : 'INPUT_FILE',
                display_name: acquisition.name,
                media_type: acquisition.detected_format === 'IMAGE' ? 'image/*' : 'application/octet-stream',
                ...artifactStorage
              },
              retained_text: project.retention_policy === 'RETAIN_TEXT'
                ? acquisition.workflow_record?.content ?? null : null
            });
            acquisition.source.id = saved.source_id;
            if (acquisition.workflow_record) acquisition.workflow_record.source_ref = saved.source_id;
            acquisition.acquisition_id = saved.document_id ?? saved.artifact_id ?? acquisition.acquisition_id;
            entry.content_sha256 = acquisition.content_sha256;
            entry.acquisition_state = 'PRESENT';
            this.rememberAcquisition(acquisition);
            acquiredContentFiles++;
            if (acquisition.coverage.state === 'CHUNK_SELECTION_REQUIRED' && acquisitions.length < 32) {
              const chunked = chunkTextAcquisition(acquisition, {
                max_chunk_bytes: 180_000,
                max_chunks: Math.min(12, 32 - acquisitions.length)
              }, {id: this.id});
              for (const chunk of chunked.chunks) {
                this.persistAcquisition(chunk, chunk.workflow_record.content);
                this.rememberAcquisition(chunk);
                acquisitions.push(publicAcquisition(chunk));
              }
              entry.route_coverage = chunked.coverage;
            } else if (acquisition.workflow_record && acquisitions.length < 32) {
              acquisitions.push(publicAcquisition(acquisition));
            }
            continue;
          } catch (error) {
            const errorCode = String(error?.code ?? error?.message ?? 'FOLDER_FILE_ACQUISITION_FAILED').slice(0, 200);
            contentErrors.push({relative_locator: entry.relative_locator, error_code: errorCode});
            entry.acquisition_state = 'UNREADABLE';
            entry.acquisition_reason = errorCode;
          }
        } else {
          skippedContentFiles++;
          entry.acquisition_state = 'NOT_ACQUIRED';
          entry.acquisition_reason = 'CONTENT_FILE_LIMIT';
        }
        this.store.acquireAttachedFile({
          project_id: projectId,
          mount_id: index.mount_id,
          relative_locator: entry.relative_locator,
          file_version: entry.version,
          source: {
            source_id: sourceId,
            source_owner: index.host_id,
            native_id_type: 'relative_path',
            native_id: absolutePath,
            native_version: entry.version,
            content_sha256: '',
            acquisition_state: 'POINTER'
          },
          file_state: entry.file_state
        });
      }
      this.store.recordFolderScanEvent({
        project_id: projectId,
        mount_id: index.mount_id,
        scan_id: scanId,
        scan_state: 'COMPLETED',
        indexed_count: index.counts.indexed,
        pending_count: index.counts.pending + skippedContentFiles,
        changed_count: index.counts.changed,
        unavailable_count: index.counts.unavailable + index.counts.unreadable + contentErrors.length,
        excluded_count: index.counts.excluded
      });
      const snapshotId = this.next('SNAPSHOT');
      const snapshotSourceId = this.next('SRC-SNAPSHOT');
      const manifest = buildSnapshotManifest(index, {
        snapshot_id: snapshotId,
        source_id: {owner: index.host_id, namespace: 'MPC_WORKSPACE_FOLDER_INDEX',
          native_id_type: 'snapshot_id', native_id: snapshotId},
        comparison_scope: {owner: index.host_id, namespace: 'LOCAL_FILESYSTEM',
          native_id_type: 'folder_path', native_id: index.root_locator}
      });
      const manifestBytes = Buffer.from(json(manifest));
      const manifestHash = sha256(manifestBytes);
      this.store.createSource({
        project_id: projectId,
        source_id: snapshotSourceId,
        source_owner: index.host_id,
        source_namespace: 'LOCAL_FILESYSTEM',
        native_id_type: 'folder_snapshot',
        native_id: snapshotId,
        native_version: index.observed_at_utc,
        content_sha256: manifestHash,
        acquisition_state: 'ACQUIRED',
        acquired_at_utc: index.observed_at_utc
      });
      const manifestArtifactId = this.next('SNAPSHOT-MANIFEST');
      const manifestFile = this.writeArtifact(projectId, manifestArtifactId, '.json', manifestBytes);
      const snapshot = this.store.createSnapshot({
        project_id: projectId,
        snapshot_id: snapshotId,
        source_id: snapshotSourceId,
        manifest: {
          artifact_id: manifestArtifactId,
          display_name: `Folder snapshot ${index.root_locator}`,
          comparison_scope: {owner: manifest.comparison_scope.owner,
            namespace: manifest.comparison_scope.namespace,
            id_type: manifest.comparison_scope.native_id_type,
            id: manifest.comparison_scope.native_id},
          coverage_state: index.connection_state !== 'ONLINE' ? 'UNAVAILABLE'
            : index.inventory_complete ? 'COMPLETE' : 'PARTIAL',
          ...manifestFile
        },
        entries: manifest.entries.map((entry, position) => ({
          entry_id: `ENTRY-${sha256(`${snapshotId}\n${position}\n${entry.path}`).slice(0, 32)}`,
          entry_kind: 'NATIVE',
          native_owner: entry.source_id.owner,
          native_namespace: entry.source_id.namespace,
          native_id_type: entry.source_id.native_id_type,
          native_id: entry.source_id.native_id,
          native_version: entry.version ?? '',
          content_sha256: entry.content_sha256 ?? '',
          relative_locator: entry.path,
          availability: entry.acquisition_state === 'PRESENT' ? 'AVAILABLE'
            : entry.acquisition_state === 'UNREADABLE' ? 'UNREADABLE' : 'UNAVAILABLE'
        }))
      });
      const routeReadyAcquisitions = acquisitions.filter(row =>
        typeof row.workflow_record?.content === 'string' ||
        row.workflow_record?.content_available_for_current_session === true);
      return {...index, acquisitions, acquisition_ids: routeReadyAcquisitions.map(row => row.acquisition_id),
        content_coverage: {limit: contentFileLimit, acquired: acquiredContentFiles,
          route_ready: routeReadyAcquisitions.length,
          eligible: index.entries.filter(row => row.kind === 'FILE' && row.file_state === 'PRESENT').length,
          skipped: skippedContentFiles,
          errors: contentErrors}, snapshot, snapshot_id: snapshot.snapshot_id};
    }
    fail('MPC_WORKSPACE_INPUT_KIND_UNSUPPORTED');
  }

  acquisitions(projectId, selectedIds = undefined) {
    if (selectedIds !== undefined && (!Array.isArray(selectedIds) || selectedIds.length > 32)) {
      fail('MPC_WORKSPACE_ACQUISITION_SELECTION_INVALID');
    }
    const requested = selectedIds === undefined ? null : selectedIds.map(value => identifier(value, 'MPC_WORKSPACE_ACQUISITION_ID_INVALID'));
    if (requested && new Set(requested).size !== requested.length) fail('MPC_WORKSPACE_ACQUISITION_SELECTION_DUPLICATE');
    const rows = this.store.listRetainedAcquisitions(projectId);
    const persisted = rows.map(row => ({
      acquisition_id: row.document_id,
      project_id: projectId,
      source: {
        id: row.source_id,
        owner: row.source_owner,
        type: row.native_id_type,
        version: row.native_version,
        time: row.acquired_at_utc,
        native_locator: row.native_id
      },
      workflow_record: {
        source_ref: row.source_id,
        version: row.native_version,
        content: row.retained_text
      }
    }));
    const combined = new Map(persisted.map(row => [row.source.id, row]));
    for (const acquisition of this.sessionAcquisitions.get(projectId) ?? []) combined.set(acquisition.source.id, clone(acquisition));
    const available = [...combined.values()];
    if (requested === null) return available.slice(-32);
    const byAcquisition = new Map(available.map(row => [row.acquisition_id, row]));
    return requested.map(acquisitionId => {
      const acquisition = byAcquisition.get(acquisitionId);
      if (!acquisition) fail('MPC_WORKSPACE_ACQUISITION_NOT_FOUND', 404);
      return acquisition;
    });
  }

  selection(input, projectId) {
    const profileId = input.provider_profile_id ?? input.provider_selection?.profile_id ?? null;
    if (!profileId) return null;
    const profile = this.profileCatalog.get(profileId);
    if (!profile) fail('MPC_WORKSPACE_PROVIDER_PROFILE_NOT_FOUND', 404);
    return {
      selection_id: input.selection_id ?? this.next('SELECTION'),
      profile_id: profile.id,
      requested: clone(profile),
      requested_by_user: true,
      selection_basis: 'USER_SELECTED_PROVIDER_PROFILE',
      availability: profile.availability ?? 'UNKNOWN',
      setup_action: profile.setup_action ?? null,
      workspace_project_id: projectId
    };
  }

  persistJourney(projectId, jobId, journey) {
    const persistedJourney = this.project(projectId).retention_policy === 'METADATA_ONLY'
      ? retentionSafeJourney(journey)
      : journey;
    const journeyArtifactId = this.next('JOURNEY');
    const journeyFile = this.writeArtifact(projectId, journeyArtifactId, '.json', json(toStoredJson(persistedJourney)));
    this.store.createArtifact({
      project_id: projectId,
      artifact_id: journeyArtifactId,
      artifact_kind: 'ROUTER_RECEIPT',
      display_name: `Full workspace journey ${jobId}`,
      media_type: 'application/json',
      ...journeyFile
    });
    this.store.linkJobArtifact({project_id: projectId, job_id: jobId, artifact_id: journeyArtifactId, artifact_role: 'FULL_ROUTER_RECEIPT'});

    if (journey.model_result?.model_invoked === true && journey.provider_selection) {
      const modelArtifactId = this.next('MODEL-RESULT');
      const modelFile = this.writeArtifact(projectId, modelArtifactId, '.json', json(toStoredJson(persistedJourney.model_result)));
      this.store.createArtifact({
        project_id: projectId,
        artifact_id: modelArtifactId,
        artifact_kind: 'MODEL_RECEIPT',
        display_name: `Model result ${jobId}`,
        media_type: 'application/json',
        ...modelFile
      });
      this.store.linkJobArtifact({project_id: projectId, job_id: jobId, artifact_id: modelArtifactId, artifact_role: 'MODEL_RESULT'});
      const completed = journey.model_result.status === 'MODEL_PROPOSAL_READY' &&
        typeof journey.model_result.observed_model === 'string' && journey.model_result.observed_model.length > 0;
      const cancelled = journey.model_result.status === 'CANCELLED';
      this.store.recordModelRun({
        project_id: projectId,
        model_run_id: this.next('MODEL-RUN'),
        job_id: jobId,
        requested_provider: journey.provider_selection.provider,
        requested_model: journey.provider_selection.model,
        requested_access_program: journey.provider_selection.access_programs
          ? JSON.stringify(journey.provider_selection.access_programs) : '',
        observed_provider: completed ? String(journey.model_result.provider ?? journey.provider_selection.provider) : '',
        observed_model: completed ? journey.model_result.observed_model : '',
        observed_access_program: journey.model_result.observed_access_program
          ? JSON.stringify(journey.model_result.observed_access_program) : '',
        outcome: completed ? 'COMPLETED' : cancelled ? 'CANCELLED' : 'INCOMPLETE',
        result_artifact_id: completed ? modelArtifactId : null,
        error_code: completed ? '' : String(journey.model_result.error?.code ?? journey.model_result.status ?? 'MODEL_INCOMPLETE').slice(0, 512),
        first_token_ms: Number.isFinite(journey.model_result.diagnostics?.first_token_ms)
          ? Math.round(journey.model_result.diagnostics.first_token_ms) : null,
        elapsed_ms: Number.isFinite(journey.model_result.diagnostics?.elapsed_ms)
          ? Math.round(journey.model_result.diagnostics.elapsed_ms) : null
      });
    }

    const checkpointArtifactId = this.next('CHECKPOINT');
    const checkpointFile = this.writeArtifact(projectId, checkpointArtifactId, '.json', json(toStoredJson(persistedJourney.checkpoint)));
    this.store.createArtifact({
      project_id: projectId,
      artifact_id: checkpointArtifactId,
      artifact_kind: 'JOB_CHECKPOINT',
      display_name: `Checkpoint ${journey.checkpoint.checkpoint_id}`,
      media_type: 'application/json',
      ...checkpointFile
    });
    this.store.saveCheckpoint({
      project_id: projectId,
      job_id: jobId,
      checkpoint_id: persistedJourney.checkpoint.checkpoint_id,
      artifact_id: checkpointArtifactId,
      dependency_sha256: persistedJourney.checkpoint.checkpoint_sha256,
      next_action: JSON.stringify(persistedJourney.next_action ?? null)
    });
    return journey;
  }

  journeyForJob(projectId, jobId) {
    const row = this.store.getLatestJobArtifact(projectId, jobId, 'FULL_ROUTER_RECEIPT');
    if (!row) return null;
    return this.parseStoredJsonArtifact(row);
  }

  checkpointForJob(projectId, jobId) {
    const checkpointState = this.store.getJob(projectId, jobId)?.checkpoint;
    if (!checkpointState?.artifact_id) return null;
    const row = this.store.getArtifact(projectId, checkpointState.artifact_id);
    if (!row) return null;
    return this.parseStoredJsonArtifact(row);
  }

  async startJob(input) {
    this.assertOpen();
    if (!plainObject(input)) fail('MPC_WORKSPACE_JOB_INPUT_INVALID');
    const projectId = input.project_id ?? this.activeProjectId;
    const project = this.project(projectId);
    const operationMode = input.operation_mode ?? (Array.isArray(input.acquisition_ids) && input.acquisition_ids.length === 0
      ? 'CHAT' : 'EVIDENCE_ANALYSIS');
    if (!['CHAT', 'EVIDENCE_ANALYSIS'].includes(operationMode)) fail('MPC_WORKSPACE_OPERATION_MODE_INVALID');
    const question = required(input.question ?? input.objective, 'MPC_WORKSPACE_QUESTION_REQUIRED',
      operationMode === 'CHAT' ? 64_000 : 2_000);
    if (input.provider_profile_id || input.provider_selection) await this.refreshProfiles();
    const acquisitions = this.acquisitions(projectId, input.acquisition_ids);
    if (operationMode === 'CHAT' && acquisitions.length) fail('MPC_WORKSPACE_CHAT_MODE_EVIDENCE_CONFLICT');
    let methodRequest = null;
    let methodInputArtifact = null;
    if (input.method_request !== undefined && input.method_request !== null) {
      if (operationMode !== 'EVIDENCE_ANALYSIS') fail('MPC_WORKSPACE_METHOD_REQUIRES_EVIDENCE_MODE');
      if (!plainObject(input.method_request) || acquisitions.length === 0) fail('MPC_WORKSPACE_METHOD_REQUEST_INVALID');
      const method = required(input.method_request.method ?? input.method_request.arguments?.method,
        'MPC_WORKSPACE_METHOD_REQUIRED', 100);
      const methodInput = input.method_request.input ?? input.method_request.arguments?.input;
      if (!plainObject(methodInput)) fail('MPC_WORKSPACE_METHOD_INPUT_REQUIRED');
      const sourceRefs = acquisitions.map(acquisition => acquisition.source.id);
      if (new Set(sourceRefs).size !== sourceRefs.length) fail('MPC_WORKSPACE_METHOD_SOURCE_REFS_DUPLICATE');
      if (input.method_request.source_refs !== undefined) {
        if (!Array.isArray(input.method_request.source_refs) ||
            canonical([...input.method_request.source_refs].sort()) !== canonical([...sourceRefs].sort())) {
          fail('MPC_WORKSPACE_METHOD_SOURCE_REFS_MISMATCH');
        }
      }
      const methodInputSha256 = sha256(canonical({method, input: methodInput, source_refs: sourceRefs}));
      const artifactId = `METHOD-INPUT-${methodInputSha256.slice(0, 40)}`;
      const storedPayload = project.retention_policy === 'RETAIN_TEXT'
        ? {schema_version: 'MPC_WORKSPACE_DERIVED_METHOD_INPUT_1', method, input: clone(methodInput),
          source_refs: sourceRefs, extraction_assumptions: input.method_request.extraction_assumptions ?? []}
        : {schema_version: 'MPC_WORKSPACE_DERIVED_METHOD_INPUT_1', method, input: null,
          input_retained: false, input_sha256: sha256(canonical(methodInput)),
          input_bytes: Buffer.byteLength(canonical(methodInput)), source_refs: sourceRefs,
          extraction_assumptions_retained: false};
      methodInputArtifact = {artifact_id: artifactId, payload: storedPayload};
      methodRequest = {
        tool: 'evaluate_method',
        arguments: {method, input: clone(methodInput)},
        source_refs: sourceRefs,
        input_artifact_id: artifactId,
        selection_basis: 'USER_SELECTED_SCHEMA_VALID_INPUT'
      };
    }
    const providerSelection = this.selection(input, projectId);
    let taskId = input.task_id;
    if (!taskId) {
      taskId = this.next('TASK');
      const title = project.retention_policy === 'RETAIN_TEXT' ? question.slice(0, 512)
        : `Workspace question ${sha256(question).slice(0, 16)}`;
      this.store.createTask({project_id: projectId, task_id: taskId, title, next_action: 'Route the selected project input.'});
    } else if (!this.store.hasTask(projectId, taskId)) {
      const title = project.retention_policy === 'RETAIN_TEXT' ? question.slice(0, 512)
        : `Workspace question ${sha256(question).slice(0, 16)}`;
      this.store.createTask({project_id: projectId, task_id: taskId, title, next_action: 'Route the selected project input.'});
    }
    const requestIdentity = {
      project_id: projectId,
      task_id: taskId,
      operation_mode: operationMode,
      question,
      acquisition_ids: acquisitions.map(row => row.acquisition_id),
      source_refs: acquisitions.map(row => row.source.id),
      provider_profile_id: input.provider_profile_id ?? null,
      requested_phase: input.requested_phase ?? 'AUTO',
      domain_profile: input.domain_profile ?? 'GENERAL',
      execute_ready_call: input.execute_ready_call !== false,
      max_acquisitions: input.max_acquisitions ?? 3,
      method_request: methodRequest
    };
    const idempotencyKey = input.idempotency_key ?? sha256(canonical(requestIdentity));
    const started = this.store.startJob({
      project_id: projectId,
      job_id: input.job_id,
      task_id: taskId,
      operation_name: 'WORKSPACE_ASK',
      idempotency_key: idempotencyKey,
      request: project.retention_policy === 'RETAIN_TEXT' ? requestIdentity : {
        ...requestIdentity,
        question: null,
        question_sha256: sha256(question),
        method_request: methodRequest ? {
          ...methodRequest,
          arguments: {method: methodRequest.arguments.method, input: null},
          input_sha256: sha256(canonical(methodRequest.arguments.input))
        } : null
      }
    });
    if (started.reused) {
      const previous = this.journeyForJob(projectId, started.job_id);
      return previous ? {...previous, reused: true} : {...started, reused: true};
    }
    acquisitions.forEach((acquisition, ordinal) => this.store.addJobInput({
      project_id: projectId, job_id: started.job_id, input_kind: 'SOURCE',
      source_id: acquisition.source.id, ordinal
    }));
    if (methodInputArtifact) {
      const existing = this.store.getArtifact(projectId, methodInputArtifact.artifact_id);
      if (!existing) {
        const file = this.writeArtifact(projectId, methodInputArtifact.artifact_id, '.json', json(methodInputArtifact.payload));
        this.store.createArtifact({
          project_id: projectId,
          artifact_id: methodInputArtifact.artifact_id,
          artifact_kind: 'OTHER',
          display_name: `Derived ${methodRequest.arguments.method} input`,
          media_type: 'application/json',
          ...file
        });
      }
      this.store.addJobInput({project_id: projectId, job_id: started.job_id, input_kind: 'ARTIFACT',
        artifact_id: methodInputArtifact.artifact_id, ordinal: 0});
    }
    const controller = new AbortController();
    const controllerKey = `${projectId}\u0000${started.job_id}`;
    this.activeJobControllers.set(controllerKey, controller);
    this.store.selectProjectContext(projectId, {task_id: taskId, provider_profile_id: input.provider_profile_id ?? ''});
    this.store.appendJobEvent({
      project_id: projectId,
      job_id: started.job_id,
      job_state: 'RUNNING',
      fact_summary: 'Reading project input',
      action_label: 'Reading project input',
      total_count: 1
    });
    let chatProject = null;
    let conversationHistory = [];
    let chatUserRecorded = false;
    try {
      if (operationMode === 'CHAT') {
        chatProject = this.ensureChatProject(projectId, {selectedModel: providerSelection?.model});
        conversationHistory = this.chatStore.getConversation(chatProject.id).messages;
        this.chatStore.saveDraft(chatProject.id, question);
        this.chatStore.appendMessage(chatProject.id, {
          role: 'user', content: question, status: 'COMPLETE', model: providerSelection?.model ?? null,
          request_id: started.job_id, attachments: []
        });
        chatUserRecorded = true;
      }
      const journey = await runWorkspaceJourney({
        project_id: projectId,
        job_id: started.job_id,
        question,
        acquisitions,
        provider_selection: providerSelection,
        requested_phase: input.requested_phase ?? 'AUTO',
        domain_profile: input.domain_profile ?? 'GENERAL',
        execute_ready_call: input.execute_ready_call !== false,
        max_acquisitions: input.max_acquisitions ?? 3,
        signal: controller.signal,
        operation_mode: operationMode,
        conversation_history: conversationHistory,
        assistant_instructions: chatProject?.instructions || null,
        method_request: methodRequest
      }, {
        route: this.adapters.routeProblem ?? this.adapters.route,
        runModel: this.adapters.runModel,
        runConversation: this.adapters.runConversation ?? ((chatInput, options) => runOllamaWorkspaceConversation(chatInput, {
          ...options,
          fetchImpl: this.adapters.fetch ?? globalThis.fetch
        })),
        runTool: this.adapters.runTool ?? this.adapters.callTool,
        acquireSource: this.adapters.acquireSource,
        clock: this.clock,
        id: this.id
      });
      if (operationMode === 'CHAT') {
        const modelResult = journey.model_result ?? {};
        const status = modelResult.status === 'CONVERSATION_COMPLETE' ? 'COMPLETE'
          : modelResult.status === 'CANCELLED' ? 'CANCELLED'
            : modelResult.answer ? 'INCOMPLETE' : 'ERROR';
        const content = modelResult.answer || modelResult.error?.message ||
          providerSelection?.setup_action || 'The selected local model did not return an answer.';
        this.chatStore.appendMessage(chatProject.id, {
          role: 'assistant', content, status,
          model: modelResult.observed_model ?? providerSelection?.model ?? null,
          request_id: started.job_id, attachments: []
        });
        if (status === 'COMPLETE') this.chatStore.saveDraft(chatProject.id, '');
      }
      this.persistJourney(projectId, started.job_id, journey);
      const indicators = journey.completion_indicators;
      const latest = this.store.getJob(projectId, started.job_id);
      if (!latest.terminal) {
        const persistedFactSummary = project.retention_policy === 'RETAIN_TEXT'
          ? journey.fact_summary.join('\n')
          : `Metadata-only result ${sha256(JSON.stringify(journey.fact_summary ?? [])).slice(0, 24)}`;
        this.store.appendJobEvent({
          project_id: projectId,
          job_id: started.job_id,
          job_state: jobStateFor(journey),
          fact_summary: persistedFactSummary,
          action_label: journey.state === 'COMPLETE' ? 'Analysis complete' : 'Waiting for the next dependency',
          acquired_count: indicators.ACQUIRED.count,
          analyzed_count: indicators.ANALYZED.count,
          decided_count: indicators.DECIDED.count,
          completed_count: Number(indicators.ACQUIRED.completed) + Number(indicators.ANALYZED.completed) + Number(indicators.DECIDED.completed),
          total_count: 3
        });
      }
      return latest.job_state === 'CANCELLED' || controller.signal.aborted ? {...journey, job_state: 'CANCELLED'} : journey;
    } catch (error) {
      const cancelled = controller.signal.aborted || error?.name === 'AbortError';
      if (operationMode === 'CHAT' && chatProject && chatUserRecorded) {
        try {
          this.chatStore.appendMessage(chatProject.id, {
            role: 'assistant', content: cancelled ? 'Stopped before a complete answer was received.' :
              'The local chat operation failed before a complete answer was received.',
            status: cancelled ? 'CANCELLED' : 'ERROR', model: providerSelection?.model ?? null,
            request_id: started.job_id, attachments: []
          });
        } catch {}
      }
      if (!this.store.getJob(projectId, started.job_id).terminal) {
        this.store.appendJobEvent({
          project_id: projectId,
          job_id: started.job_id,
          job_state: cancelled ? 'CANCELLED' : 'FAILED',
          fact_summary: cancelled ? 'Cancelled by the user. Already observed effects remain in their receipts.' :
            project.retention_policy === 'METADATA_ONLY'
              ? String(error?.code ?? 'WORKSPACE_JOB_FAILED').slice(0, 512)
              : String(error?.code ?? error?.message ?? 'Workspace job failed').slice(0, 8_000),
          action_label: cancelled ? 'Cancelled' : 'Task failed; review the retained error',
          total_count: 3
        });
      }
      throw error;
    } finally {
      if (this.activeJobControllers.get(controllerKey) === controller) this.activeJobControllers.delete(controllerKey);
    }
  }

  getJob(jobId, projectId = this.activeProjectId) {
    this.assertOpen();
    this.project(projectId);
    const stored = this.store.getJob(projectId, identifier(jobId));
    if (!stored) fail('MPC_WORKSPACE_JOB_NOT_FOUND', 404);
    const journey = this.journeyForJob(projectId, jobId);
    if (!journey) return stored;
    return {
      ...journey,
      ...stored,
      checkpoint: journey.checkpoint,
      checkpoint_record: stored.checkpoint,
      fact_summary: journey.fact_summary,
      next_action: journey.next_action,
      method_candidates: journey.method_candidates,
      router_receipt: journey.router_receipt,
      model_result: journey.model_result,
      progress: {...journey.progress, persisted: stored.progress},
      action_label: stored.progress?.action_label ?? journey.progress?.events?.at(-1)?.label,
      journey
    };
  }

  cancelJob(jobId, input = {}) {
    const projectId = input.project_id ?? this.activeProjectId;
    const current = this.store.getJob(projectId, identifier(jobId));
    if (!current) fail('MPC_WORKSPACE_JOB_NOT_FOUND', 404);
    if (current.terminal) return {...current, cancellation: 'TERMINAL_JOB_UNCHANGED'};
    this.activeJobControllers.get(`${projectId}\u0000${jobId}`)?.abort('USER_REQUESTED');
    return this.store.appendJobEvent({
      project_id: projectId,
      job_id: jobId,
      job_state: 'CANCELLED',
      fact_summary: 'Cancelled by the user. Any separately observed external effect remains in its receipt.',
      action_label: 'Cancelled',
      acquired_count: current.progress?.acquired_count ?? 0,
      analyzed_count: current.progress?.analyzed_count ?? 0,
      decided_count: current.progress?.decided_count ?? 0,
      completed_count: current.progress?.completed_count ?? 0,
      total_count: current.progress?.total_count ?? null
    });
  }

  async resumeJob(jobId, input = {}) {
    this.assertOpen();
    const projectId = input.project_id ?? this.activeProjectId;
    const stored = this.store.getJob(projectId, identifier(jobId));
    if (!stored) fail('MPC_WORKSPACE_JOB_NOT_FOUND', 404);
    const checkpoint = this.checkpointForJob(projectId, jobId);
    if (!checkpoint) fail('MPC_WORKSPACE_CHECKPOINT_NOT_FOUND', 404);
    if (input.checkpoint_id !== undefined && input.checkpoint_id !== null &&
        identifier(input.checkpoint_id, 'MPC_WORKSPACE_CHECKPOINT_ID_INVALID') !== checkpoint.checkpoint_id) {
      fail('MPC_WORKSPACE_CHECKPOINT_ID_MISMATCH', 409,
        'The requested checkpoint is not the current resumable checkpoint for this job.',
        'Reopen the project and resume the checkpoint currently shown.');
    }
    if (stored.terminal) return {...(this.journeyForJob(projectId, jobId) ?? stored),
      resume: {status: 'TERMINAL_JOB_UNCHANGED', repeated_operations: 0}};
    if (checkpoint.persistence?.resume_requires_reacquisition === true) {
      fail('MPC_WORKSPACE_REACQUISITION_REQUIRED', 409,
        'This metadata-only checkpoint contains source identities and hashes, not raw input.',
        'Attach the original material again, then start a new bounded job.');
    }
    const profileId = input.provider_profile_id ?? input.provider_selection?.profile_id ??
      checkpoint.request?.provider_selection?.profile_id ?? null;
    if (profileId) await this.refreshProfiles();
    const resumeReason = required(input.resume_reason ?? `User requested resume from ${checkpoint.checkpoint_id}`,
      'MPC_WORKSPACE_RESUME_REASON_REQUIRED', 1_000);
    const providerSelection = this.selection({...input, provider_profile_id: profileId}, projectId);
    if (profileId) this.store.selectProjectContext(projectId, {task_id: stored.task_id, provider_profile_id: profileId});
    const controller = new AbortController();
    const controllerKey = `${projectId}\u0000${jobId}`;
    let journey;
    const operationMode = checkpoint.request?.operation_mode ?? 'EVIDENCE_ANALYSIS';
    let chatProject = null;
    const chatResumeRequestId = this.next('CHAT-RESUME');
    try {
      if (operationMode === 'CHAT') {
        chatProject = this.ensureChatProject(projectId);
        this.chatStore.appendMessage(chatProject.id, {
          role: 'user',
          content: checkpoint.request.question,
          status: 'COMPLETE',
          model: checkpoint.request.provider_selection?.model ?? null,
          request_id: chatResumeRequestId,
          attachments: []
        });
      }
      this.activeJobControllers.set(controllerKey, controller);
      this.store.appendJobEvent({project_id: projectId, job_id: jobId, job_state: 'RUNNING', fact_summary: 'Resuming saved checkpoint', action_label: 'Resuming saved checkpoint', total_count: 3});
      journey = await resumeWorkspaceJourney(checkpoint, {
        resume_reason: resumeReason,
        provider_selection: providerSelection,
        signal: controller.signal
      }, {
        route: this.adapters.routeProblem ?? this.adapters.route,
        runModel: this.adapters.runModel,
        runConversation: this.adapters.runConversation ?? ((chatInput, options) => runOllamaWorkspaceConversation(chatInput, {
          ...options,
          fetchImpl: this.adapters.fetch ?? globalThis.fetch
        })),
        runTool: this.adapters.runTool ?? this.adapters.callTool,
        acquireSource: this.adapters.acquireSource,
        clock: this.clock,
        id: this.id
      });
      if (chatProject) {
        const modelResult = journey.model_result ?? {};
        const status = modelResult.status === 'CONVERSATION_COMPLETE' ? 'COMPLETE'
          : modelResult.status === 'CANCELLED' ? 'CANCELLED'
            : modelResult.answer ? 'INCOMPLETE' : 'ERROR';
        const content = modelResult.answer || modelResult.error?.message ||
          journey.provider_selection?.setup_action || 'The selected local model did not return an answer.';
        this.chatStore.appendMessage(chatProject.id, {
          role: 'assistant', content, status,
          model: modelResult.observed_model ?? journey.provider_selection?.model ?? null,
          request_id: chatResumeRequestId, attachments: []
        });
        if (status === 'COMPLETE') this.chatStore.saveDraft(chatProject.id, '');
      }
    } catch (error) {
      const cancelled = controller.signal.aborted || error?.name === 'AbortError';
      const current = this.store.getJob(projectId, jobId);
      if (chatProject) {
        try {
          this.chatStore.appendMessage(chatProject.id, {
            role: 'assistant',
            content: cancelled ? 'Stopped before a complete resumed answer was received.' :
              'The resumed local chat operation failed before a complete answer was received.',
            status: cancelled ? 'CANCELLED' : 'ERROR',
            model: checkpoint.request?.provider_selection?.model ?? null,
            request_id: chatResumeRequestId,
            attachments: []
          });
        } catch {}
      }
      if (!current?.terminal) this.store.appendJobEvent({
        project_id: projectId,
        job_id: jobId,
        job_state: cancelled ? 'CANCELLED' : 'BLOCKED',
        fact_summary: cancelled ? 'Cancelled while resuming.' : String(error?.code ?? 'WORKSPACE_RESUME_FAILED').slice(0, 512),
        action_label: cancelled ? 'Cancelled' : 'Resume failed; the prior checkpoint remains available',
        total_count: 3
      });
      throw error;
    } finally {
      if (this.activeJobControllers.get(controllerKey) === controller) this.activeJobControllers.delete(controllerKey);
    }
    this.persistJourney(projectId, jobId, journey);
    const indicators = journey.completion_indicators;
    const latest = this.store.getJob(projectId, jobId);
    if (!latest.terminal) {
      const persistedFactSummary = this.project(projectId).retention_policy === 'RETAIN_TEXT'
        ? journey.fact_summary.join('\n')
        : `Metadata-only result ${sha256(JSON.stringify(journey.fact_summary ?? [])).slice(0, 24)}`;
      this.store.appendJobEvent({
        project_id: projectId,
        job_id: jobId,
        job_state: jobStateFor(journey),
        fact_summary: persistedFactSummary,
        action_label: journey.state === 'COMPLETE' ? 'Analysis complete' : 'Waiting for the next dependency',
        acquired_count: indicators.ACQUIRED.count,
        analyzed_count: indicators.ANALYZED.count,
        decided_count: indicators.DECIDED.count,
        completed_count: Number(indicators.ACQUIRED.completed) + Number(indicators.ANALYZED.completed) + Number(indicators.DECIDED.completed),
        total_count: 3
      });
    }
    return latest.job_state === 'CANCELLED' || controller.signal.aborted ? {...journey, job_state: 'CANCELLED'} : journey;
  }

  exportTransfer(input = {}) {
    this.assertOpen();
    const projectId = input.project_id ?? this.activeProjectId;
    const project = this.project(projectId);
    const retained = this.store.listRetainedAcquisitions(projectId, 32);
    const itemLimit = project.draft?.text ? 31 : 32;
    const selected = retained.slice(0, itemLimit);
    const items = selected.map((row, index) => ({
      item_id: `SOURCE-${index + 1}-${row.source_id}`.slice(0, 400),
      kind: 'TEXT',
      name: `Retained source ${row.source_id}`,
      media_type: 'text/plain; charset=utf-8',
      text: row.retained_text,
      source_ref: row.source_id,
      declared_origin: {
        owner: row.source_owner,
        namespace: row.source_namespace,
        native_id_type: row.native_id_type,
        native_id: row.native_id,
        native_version: row.native_version
      },
      metadata: {content_sha256: row.content_sha256, acquired_at_utc: row.acquired_at_utc}
    }));
    if (project.draft?.text) items.push({
      item_id: 'CURRENT-DRAFT',
      kind: 'TEXT',
      name: 'Current project draft',
      media_type: 'text/plain; charset=utf-8',
      text: project.draft.text,
      metadata: {draft_sha256: project.draft.sha256}
    });
    const sources = this.store.listSources(projectId, 200);
    const selectedSourceIds = new Set(selected.map(row => row.source_id));
    const sourceManifest = sources.filter(row => selectedSourceIds.has(row.source_id)).map(row => ({
      source_ref: row.source_id,
      owner: row.source_owner,
      namespace: row.source_namespace,
      native_id_type: row.native_id_type,
      native_id: row.native_id,
      version: row.native_version,
      content_sha256: row.content_sha256,
      acquisition_state: row.acquisition_state,
      acquired_at_utc: row.acquired_at_utc
    }));
    const selectedTask = project.selected_task_id ? this.store.getTask(projectId, project.selected_task_id) : null;
    const envelope = createWorkspaceTransfer({
      exporter: {application: 'MPC Workspace', version: MPC_WORKSPACE_SERVICE_VERSION},
      exported_at_utc: utc(this.clock),
      project_mapping: {exporting_project_id: projectId, exporting_project_name: project.display_name,
        selected_local_project_id: projectId},
      objective: project.objective || selectedTask?.title || `Continue project ${project.display_name}`,
      items,
      source_manifest: sourceManifest,
      pending_task: selectedTask ? {task_id: selectedTask.task_id, title: selectedTask.title,
        work_phase: selectedTask.work_phase, next_action: selectedTask.next_action} : null,
      native_receipts: []
    }, {id: this.id, clock: this.clock});
    const verification = verifyWorkspaceTransfer(envelope);
    const serialized = serializeTransferEnvelope(envelope, {pretty: true});
    return {
      status: 'TRANSFER_EXPORTED',
      project_id: projectId,
      transfer_id: envelope.transfer_id,
      envelope_sha256: envelope.envelope_sha256,
      filename: `MPC-Workspace-${projectId}-${envelope.transfer_id}.json`.replaceAll(/[^A-Za-z0-9._-]/gu, '-'),
      serialized,
      verification,
      coverage: {retained_items_exported: items.length, retained_items_available: retained.length,
        complete: retained.length <= itemLimit, metadata_only_sources_excluded: sources.length - selected.length},
      external_action_performed: false
    };
  }

  async importTransfer(input = {}) {
    this.assertOpen();
    const projectId = identifier(input.project_id, 'MPC_WORKSPACE_TRANSFER_TARGET_PROJECT_REQUIRED');
    const project = this.project(projectId);
    const raw = required(input.transfer_text ?? input.serialized, 'MPC_WORKSPACE_TRANSFER_TEXT_REQUIRED', 2_000_000);
    const envelope = parseWorkspaceTransfer(raw);
    const verification = verifyWorkspaceTransfer(envelope);
    const receiptName = `Portable transfer ${envelope.transfer_id}`;
    const priorReceipts = this.store.listArtifacts(projectId, 1_000).filter(row =>
      row.artifact_kind === 'OTHER' && row.display_name === receiptName && row.media_type === 'application/vnd.mpc-workspace.transfer-receipt+json');
    for (const prior of priorReceipts) {
      const receipt = this.parseStoredJsonArtifact(prior);
      if (receipt.envelope_sha256 !== envelope.envelope_sha256) {
        fail('MPC_WORKSPACE_TRANSFER_ID_CONFLICT', 409,
          'This transfer ID was already imported with different bytes.',
          'Use the exact original transfer or export a new task with a new transfer ID.');
      }
      return {...receipt, status: 'REUSED', repeated_mutations: 0};
    }
    const imported = [];
    for (const item of envelope.items) {
      const bytes = decodeTransferItem(item);
      let acquisition;
      const locator = `mpc-workspace-transfer://${encodeURIComponent(envelope.transfer_id)}/${encodeURIComponent(item.item_id)}`;
      if (item.encoding === 'UTF-8') {
        const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
        acquisition = ingestText({project_id: projectId, text, name: item.name,
          format_hint: item.kind === 'SCRIPT_DRAFT' ? 'CODE' : 'AUTO',
          retain_raw: project.retention_policy === 'RETAIN_TEXT',
          retention_authorization_ref: project.retention_policy === 'RETAIN_TEXT'
            ? `project-retention://${projectId}/RETAIN_TEXT` : null,
          observed_at_utc: utc(this.clock)
        }, {id: this.id});
        acquisition.source.owner = 'EXPORTED_SOURCE';
        acquisition.source.type = item.kind === 'SCRIPT_DRAFT' ? 'transfer_script_draft' : 'transfer_text';
        acquisition.source.native_locator = locator;
        if (acquisition.workflow_record) acquisition.workflow_record.source_ref = acquisition.source.id;
        this.persistAcquisition(acquisition, text);
        this.rememberAcquisition(acquisition);
        if (acquisition.coverage.state === 'CHUNK_SELECTION_REQUIRED') {
          const chunked = chunkTextAcquisition(acquisition, {max_chunk_bytes: 180_000, max_chunks: 12}, {id: this.id});
          for (const chunk of chunked.chunks) {
            chunk.source.owner = 'EXPORTED_SOURCE';
            chunk.source.type = 'transfer_text_chunk';
            this.persistAcquisition(chunk, chunk.workflow_record.content);
            this.rememberAcquisition(chunk);
          }
          imported.push(...chunked.chunks.map(chunk => ({item_id: item.item_id,
            acquisition_id: chunk.acquisition_id, source_id: chunk.source.id, content_sha256: chunk.content_sha256,
            kind: item.kind, declared_origin: clone(item.declared_origin), script_executed: false,
            coverage: chunked.coverage})));
          continue;
        }
      } else {
        acquisition = await ingestFile({project_id: projectId, file_path: locator, name: item.name,
          format_hint: 'BINARY', retain_raw: project.retention_policy === 'RETAIN_TEXT',
          retention_authorization_ref: project.retention_policy === 'RETAIN_TEXT'
            ? `project-retention://${projectId}/RETAIN_TEXT` : null,
          observed_at_utc: utc(this.clock)
        }, {id: this.id, statPath: async () => ({isSymbolicLink: () => false}), resolveRealPath: async () => locator,
          readFile: async () => ({bytes, stat: {size: bytes.length, mtimeMs: 0, isFile: () => true}})});
        acquisition.source.owner = 'EXPORTED_SOURCE';
        acquisition.source.type = 'transfer_binary';
        acquisition.source.native_locator = locator;
        this.persistAcquisition(acquisition, null);
        this.rememberAcquisition(acquisition);
      }
      imported.push({item_id: item.item_id, acquisition_id: acquisition.acquisition_id,
        source_id: acquisition.source.id, content_sha256: acquisition.content_sha256, kind: item.kind,
        declared_origin: clone(item.declared_origin), script_executed: false});
    }
    const safeReceipt = {
      schema_version: 'MPC_WORKSPACE_TRANSFER_IMPORT_RECEIPT_1',
      status: 'IMPORTED',
      transfer_id: envelope.transfer_id,
      envelope_sha256: envelope.envelope_sha256,
      target_project_id: projectId,
      exported_project_mapping: clone(envelope.project_mapping),
      imported_at_utc: utc(this.clock),
      imported,
      item_count: envelope.items.length,
      scripts_executed: false,
      historical_receipts_activated: false,
      native_read_performed: false,
      source_authenticated: false,
      automatic_run_performed: false,
      verification
    };
    const receiptArtifactId = `TRANSFER-IMPORT-${sha256(`${envelope.transfer_id}\n${envelope.envelope_sha256}`).slice(0, 40)}`;
    const receiptFile = this.writeArtifact(projectId, receiptArtifactId, '.json', json(safeReceipt));
    this.store.createArtifact({project_id: projectId, artifact_id: receiptArtifactId, artifact_kind: 'OTHER',
      display_name: receiptName, media_type: 'application/vnd.mpc-workspace.transfer-receipt+json', ...receiptFile});
    return safeReceipt;
  }

  search(input) {
    this.assertOpen();
    const projectId = input.project_id ?? this.activeProjectId;
    this.project(projectId);
    const scopes = Array.isArray(input.scopes) ? input.scopes : ['LOCAL'];
    const filters = plainObject(input.filters) ? input.filters : {};
    if (![null, undefined, '', 'TEXT', 'FILE'].includes(filters.kind)) fail('MPC_WORKSPACE_SEARCH_KIND_INVALID');
    if (![null, undefined, '', 'ACQUIRED'].includes(filters.status)) fail('MPC_WORKSPACE_SEARCH_STATUS_INVALID');
    if (![null, undefined, '', 'DAY', 'WEEK', 'MONTH'].includes(filters.time)) fail('MPC_WORKSPACE_SEARCH_TIME_INVALID');
    const local = scopes.includes('LOCAL') ? this.store.searchRetained({project_id: projectId, query: input.query, limit: input.limit ?? 50}) : [];
    const unavailable = scopes.filter(scope => scope !== 'LOCAL').map(scope => ({scope, status: 'UNAVAILABLE', next_action: `Configure and test ${scope} for this project.`}));
    const cutoffDays = {DAY: 1, WEEK: 7, MONTH: 31}[filters.time] ?? null;
    const cutoff = cutoffDays === null ? null : Date.parse(utc(this.clock)) - cutoffDays * 86_400_000;
    const results = local.map(row => {
      const source = this.store.getSource(projectId, row.source_id);
      const type = source?.native_id_type ?? '';
      const kind = ['PASTED_TEXT', 'DERIVED_TEXT_CHUNK', 'transfer_text', 'transfer_text_chunk',
        'transfer_script_draft', 'SCRIPT_OUTPUT_TEXT'].includes(type) ? 'TEXT' : 'FILE';
      return {...row, ...(source ?? {}), kind, excerpt: row.snippet, scope: 'LOCAL', status: 'ACQUIRED', open_action_available: false};
    }).filter(row => (!filters.kind || row.kind === filters.kind) &&
      (cutoff === null || Number.isFinite(Date.parse(row.acquired_at_utc)) && Date.parse(row.acquired_at_utc) >= cutoff));
    return {
      project_id: projectId,
      query: input.query,
      results,
      coverage: {status: 'RETAINED_TEXT_ONLY', LOCAL: 'RETAINED_TEXT_ONLY', filters_applied: {
        kind: filters.kind || null, status: filters.status || null, time: filters.time || null}},
      unavailable
    };
  }

  compareSnapshots(input) {
    this.assertOpen();
    const projectId = input.project_id ?? this.activeProjectId;
    const fromStored = snapshotId => {
      if (!snapshotId) return null;
      const snapshot = this.store.getSnapshot(projectId, snapshotId);
      if (!snapshot) fail('MPC_WORKSPACE_SNAPSHOT_NOT_FOUND', 404);
      const artifact = this.store.getArtifact(projectId, snapshot.manifest_artifact_id);
      if (!artifact?.artifact_ref?.startsWith('mpc-workspace-artifact://')) {
        fail('MPC_WORKSPACE_SNAPSHOT_MANIFEST_UNAVAILABLE', 409);
      }
      return this.parseStoredJsonArtifact(artifact);
    };
    const left = input.left_manifest ?? input.left ?? fromStored(input.left_snapshot_id);
    const right = input.right_manifest ?? input.right ?? fromStored(input.right_snapshot_id);
    if (!plainObject(left) || !plainObject(right)) fail('MPC_WORKSPACE_SNAPSHOT_MANIFESTS_REQUIRED');
    const result = compareWorkspaceSnapshots(left, right);
    const storedPair = input.left_snapshot_id && input.right_snapshot_id &&
      input.left_manifest === undefined && input.left === undefined &&
      input.right_manifest === undefined && input.right === undefined;
    if (!storedPair) return {...result, persistence: {
      status: 'NOT_PERSISTED',
      basis: 'CALLER_SUPPLIED_MANIFESTS',
      reason: 'TWO_STORED_SNAPSHOT_IDS_REQUIRED',
      live_remote_read_performed: false
    }};
    const leftSnapshotId = identifier(input.left_snapshot_id, 'MPC_WORKSPACE_SNAPSHOT_ID_INVALID');
    const rightSnapshotId = identifier(input.right_snapshot_id, 'MPC_WORKSPACE_SNAPSHOT_ID_INVALID');
    if (leftSnapshotId === rightSnapshotId) return {...result, persistence: {
      status: 'NOT_PERSISTED',
      basis: 'TWO_STORED_SNAPSHOT_MANIFESTS',
      reason: 'DISTINCT_STORED_SNAPSHOT_IDS_REQUIRED',
      live_remote_read_performed: false
    }};
    const leftStored = this.store.getSnapshot(projectId, leftSnapshotId);
    const rightStored = this.store.getSnapshot(projectId, rightSnapshotId);
    const scopeFields = ['comparison_scope_owner', 'comparison_scope_namespace',
      'comparison_scope_id_type', 'comparison_scope_id'];
    if (scopeFields.some(field => leftStored[field] !== rightStored[field])) return {...result, persistence: {
      status: 'NOT_PERSISTED',
      basis: 'TWO_STORED_SNAPSHOT_MANIFESTS',
      reason: 'STORED_SNAPSHOT_SCOPE_MISMATCH',
      live_remote_read_performed: false
    }};
    const comparisonId = this.next('COMPARISON');
    const artifactId = this.next('SNAPSHOT-COMPARISON');
    const artifact = this.writeArtifact(projectId, artifactId, '.json', json(result));
    const inventoryStatus = result.inventory_comparison?.status;
    const comparisonState = inventoryStatus === 'COMPLETE_DECLARED_SCOPE' ? 'COMPLETE'
      : inventoryStatus === 'UNAVAILABLE_SCOPE' ? 'BLOCKED' : 'PARTIAL';
    const stored = this.store.recordSnapshotComparison({
      project_id: projectId,
      comparison_id: comparisonId,
      left_snapshot_id: leftSnapshotId,
      right_snapshot_id: rightSnapshotId,
      comparison_state: comparisonState,
      result_artifact: {
        artifact_id: artifactId,
        display_name: `Stored snapshot comparison ${leftSnapshotId} to ${rightSnapshotId}`,
        media_type: 'application/json',
        ...artifact
      }
    });
    return {...result, persistence: {
      status: 'PERSISTED_LOCAL',
      storage: 'LOCAL_WORKSPACE_DATABASE_AND_ARTIFACT',
      basis: 'TWO_STORED_SNAPSHOT_MANIFESTS',
      comparison_id: stored.comparison_id,
      result_artifact_id: stored.result_artifact_id,
      live_remote_read_performed: false
    }};
  }

  getSnapshotComparison(comparisonId, projectId = this.activeProjectId) {
    this.assertOpen();
    const stored = this.store.getSnapshotComparison(projectId, identifier(comparisonId));
    if (!stored?.result_artifact) fail('MPC_WORKSPACE_SNAPSHOT_COMPARISON_NOT_FOUND', 404);
    const bytes = this.readStoredArtifact(stored.result_artifact,
      'MPC_WORKSPACE_SNAPSHOT_COMPARISON_INTEGRITY_FAILED');
    return {
      ...stored,
      comparison: JSON.parse(bytes.toString('utf8')),
      persistence: {
        status: 'PERSISTED_LOCAL',
        storage: 'LOCAL_WORKSPACE_DATABASE_AND_ARTIFACT',
        basis: 'TWO_STORED_SNAPSHOT_MANIFESTS',
        live_remote_read_performed: false
      }
    };
  }

  createFolderSnapshot(input) {
    return buildSnapshotManifest(input.index, input.options);
  }

  createReport(input) {
    this.assertOpen();
    const projectId = input.project_id ?? this.activeProjectId;
    const jobId = identifier(input.job_id, 'MPC_WORKSPACE_JOB_ID_REQUIRED');
    const job = this.store.getJob(projectId, jobId);
    if (!job) fail('MPC_WORKSPACE_JOB_NOT_FOUND', 404);
    const journey = this.journeyForJob(projectId, jobId);
    if (!journey) fail('MPC_WORKSPACE_JOURNEY_RECEIPT_NOT_FOUND', 404);
    const report = createWorkspaceReport({
      ...input,
      project_id: projectId,
      task_id: job.task_id,
      question: input.question ?? journey.checkpoint?.request?.question ?? job.operation_name,
      journey,
      title: input.title ?? 'MPC Workspace report',
      limits: input.limits ?? ['Model observations remain provisional.', 'External delivery was not performed.']
    }, {id: this.id, clock: this.clock});
    if (!verifyWorkspaceReport(report).valid) fail('MPC_WORKSPACE_REPORT_VERIFICATION_FAILED', 500);
    const markdownId = this.next('REPORT');
    const markdown = this.writeArtifact(projectId, markdownId, '.md', report.formats.markdown);
    const jsonFile = this.writeArtifact(projectId, `${markdownId}-json`, '.json', report.formats.json);
    const html = this.writeArtifact(projectId, `${markdownId}-html`, '.html', report.formats.html);
    const stored = this.store.createReport({
      project_id: projectId,
      report_id: report.report_id,
      job_id: jobId,
      title: report.title,
      artifact_ref: markdown.artifact_ref,
      artifact_sha256: markdown.artifact_sha256,
      artifact_bytes: markdown.artifact_bytes,
      artifact_id: markdownId,
      report_state: report.report_state,
      representations: [{
        artifact_id: `${markdownId}-json`,
        display_name: `${report.report_id} JSON report`,
        media_type: 'application/json',
        ...jsonFile
      }, {
        artifact_id: `${markdownId}-html`,
        display_name: `${report.report_id} HTML report`,
        media_type: 'text/html',
        ...html
      }],
      source_links: report.source_bindings.filter(row => this.store.getSource(projectId, row.source_ref)).map(row => ({source_id: row.source_ref, source_role: 'EVIDENCE'}))
    });
    return {...stored, report, formats: {
      markdown: markdown.artifact_ref,
      json: jsonFile.artifact_ref,
      html: html.artifact_ref
    }};
  }

  getReport(reportId, projectId = this.activeProjectId) {
    this.assertOpen();
    const stored = this.store.getReport(projectId, identifier(reportId));
    if (!stored) fail('MPC_WORKSPACE_REPORT_NOT_FOUND', 404);
    const artifacts = stored.representations.length ? stored.representations : [{
      artifact_id: null,
      media_type: 'text/markdown',
      artifact_ref: stored.artifact_ref,
      artifact_sha256: stored.artifact_sha256,
      artifact_bytes: null
    }];
    const formatByMediaType = new Map([
      ['text/markdown', 'markdown'],
      ['application/json', 'json'],
      ['text/html', 'html']
    ]);
    const contents = {}, formats = {}, formatArtifacts = {};
    for (const artifact of artifacts) {
      const format = formatByMediaType.get(artifact.media_type);
      if (!format || contents[format] !== undefined) continue;
      const bytes = this.readStoredArtifact(artifact, 'MPC_WORKSPACE_REPORT_ARTIFACT_INTEGRITY_FAILED');
      contents[format] = bytes.toString('utf8');
      formats[format] = artifact.artifact_ref;
      formatArtifacts[format] = clone(artifact);
    }
    if (contents.markdown === undefined) fail('MPC_WORKSPACE_REPORT_MARKDOWN_UNAVAILABLE', 500);
    return {...stored, ...contents, formats, format_artifacts: formatArtifacts,
      available_formats: Object.keys(contents)};
  }

  configureConnection(input) {
    this.assertOpen();
    const operation = String(input.operation ?? 'CONFIGURE').toUpperCase();
    if (operation !== 'CONFIGURE') {
      const projectId = input.project_id ?? this.activeProjectId;
      const connection = this.store.getConnection(projectId, identifier(input.connection_id));
      if (!connection) fail('MPC_WORKSPACE_CONNECTION_NOT_FOUND', 404);
      if (operation === 'CONNECT') return {...this.store.setConnectionEnabled(projectId, connection.connection_id, true),
        status: 'ENABLED_LOCALLY', next_action: 'Run one permitted operation to observe actual access.'};
      if (operation === 'DISCONNECT') return {...this.store.setConnectionEnabled(projectId, connection.connection_id, false),
        status: 'DISABLED_LOCALLY', next_action: 'Prior operation receipts remain immutable local history.'};
      fail('MPC_WORKSPACE_CONNECTION_OPERATION_UNSUPPORTED');
    }
    const configuration = plainObject(input.configuration) ? input.configuration : input;
    const projectId = input.project_id ?? this.activeProjectId;
    this.project(projectId);
    const connectionId = identifier(configuration.connection_id ?? input.connection_id ?? this.next('CONNECTION'));
    const endpoint = required(configuration.endpoint_ref ?? configuration.endpoint_or_command, 'MPC_WORKSPACE_CONNECTION_ENDPOINT_REQUIRED', 2_048);
    if (endpoint.includes('@') || endpoint.includes('?') || endpoint.includes('#') || RAW_CREDENTIAL_VALUE.test(endpoint)) {
      fail('MPC_WORKSPACE_CONNECTION_ENDPOINT_REJECTED');
    }
    const secretRef = configuration.secret_store_ref ?? configuration.credential_ref ?? null;
    if (secretRef !== null && !/^os-secret:\/\/[A-Za-z0-9._:/-]+$/u.test(secretRef)) fail('MPC_WORKSPACE_CREDENTIAL_REFERENCE_INVALID');
    const transports = {loopback_http: 'OLLAMA', stdio: 'STDIO_MCP', streamable_http: 'HTTPS_MCP', secure_mcp_tunnel: 'SECURE_MCP_TUNNEL'};
    const rawTransport = configuration.transport;
    const transport = transports[rawTransport] ?? rawTransport;
    return this.store.configureConnection({
      project_id: projectId,
      connection_id: connectionId,
      display_name: required(configuration.display_name, 'MPC_WORKSPACE_CONNECTION_NAME_REQUIRED', 240),
      provider_namespace: required(configuration.provider_namespace ?? configuration.provider_type ?? configuration.provider, 'MPC_WORKSPACE_CONNECTION_PROVIDER_REQUIRED', 128),
      transport,
      endpoint_ref: endpoint,
      secret_store_ref: secretRef,
      enabled: configuration.enabled !== false
    });
  }

  async testConnection(input) {
    this.assertOpen();
    const projectId = input.project_id ?? this.activeProjectId;
    const connection = this.store.getConnection(projectId, identifier(input.connection_id));
    if (!connection) fail('MPC_WORKSPACE_CONNECTION_NOT_FOUND', 404);
    if (!connection.enabled) fail('MPC_WORKSPACE_CONNECTION_DISABLED', 409,
      'This connection is disabled in the local project.', 'Enable it locally before running a provider operation.');
    const operation = required(input.operation ?? 'CAPABILITY_READ', 'MPC_WORKSPACE_CONNECTION_OPERATION_REQUIRED', 240).toUpperCase();
    if (!/^[A-Z][A-Z0-9_:-]*$/u.test(operation)) fail('MPC_WORKSPACE_CONNECTION_OPERATION_INVALID');
    let hostContext = null;
    if (typeof this.adapters.getConnectionContext === 'function') {
      hostContext = await this.adapters.getConnectionContext(clone(connection));
      if (!plainObject(hostContext)) fail('MPC_WORKSPACE_CONNECTION_CONTEXT_INVALID', 502);
    }
    const expected = {
      provider: connection.provider_namespace,
      surface: 'WINDOWS_LOCAL',
      host_id: typeof hostContext?.host_id === 'string' && hostContext.host_id ? hostContext.host_id : 'MPC_WORKSPACE_LOCAL_HOST',
      account_id: typeof hostContext?.account_id === 'string' && hostContext.account_id ? hostContext.account_id : 'ACCOUNT_NOT_OBSERVED',
      operation
    };
    if (plainObject(input.expected) && ['provider', 'surface', 'host_id', 'account_id', 'operation']
      .some(key => input.expected[key] !== undefined && input.expected[key] !== expected[key])) {
      fail('MPC_WORKSPACE_CONNECTION_EXPECTED_CONTEXT_REJECTED', 409,
        'Connection identity comes from the saved configuration and host adapter, not renderer input.');
    }
    const invoke = this.adapters.connections?.[connection.provider_namespace] ?? this.adapters.testConnection;
    let assessedConfiguration = null;
    try {
      const endpoint = new URL(connection.endpoint_ref);
      if (['http:', 'https:'].includes(endpoint.protocol) && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash) {
        assessedConfiguration = {provider: connection.provider_namespace, label: connection.display_name, endpoint: endpoint.href};
      }
    } catch {}
    const observation = await observeConnectorOperation({
      configuration: assessedConfiguration,
      expected,
      operation_input: input.operation_input ?? {}
    }, {invoke, clock: this.clock});
    const taskId = this.next('TASK');
    this.store.createTask({project_id: projectId, task_id: taskId, title: `Connection ${expected.operation}`, next_action: 'Review the observed operation result.'});
    const job = this.store.startJob({project_id: projectId, task_id: taskId, operation_name: 'CONNECTION_OPERATION', idempotency_key: this.next('IDEMPOTENCY'), request: {connection_id: connection.connection_id, expected}});
    const receiptBackedSuccess = observation.current_observation.status === 'SUCCESS' &&
      typeof observation.current_observation.receipt_id === 'string' && observation.current_observation.receipt_id.length > 0;
    const state = receiptBackedSuccess ? 'SUCCEEDED' : observation.current_observation.status === 'ERROR' ? 'FAILED' : 'UNAVAILABLE';
    let operationReceiptId = null;
    if (receiptBackedSuccess) {
      operationReceiptId = this.next('RECEIPT');
      const operationKind = /SEARCH/iu.test(expected.operation) ? 'SEARCH'
        : /SUBMIT/iu.test(expected.operation) ? 'SUBMIT'
          : /SEND/iu.test(expected.operation) ? 'SEND'
            : /WRITE|CREATE|UPDATE/iu.test(expected.operation) ? 'WRITE' : 'READ';
      this.store.recordOperationReceipt({
        project_id: projectId,
        receipt_id: operationReceiptId,
        job_id: job.job_id,
        connection_id: connection.connection_id,
        operation_kind: operationKind,
        operation_status: 'SUCCEEDED',
        receipt_origin: 'NATIVE_CONNECTOR',
        native_receipt_ref: `native-receipt://${connection.provider_namespace}/${encodeURIComponent(observation.current_observation.receipt_id)}`,
        receipt_sha256: sha256(JSON.stringify(observation.operation_result ?? observation.current_observation))
      });
    }
    const observationId = this.next('OBSERVATION');
    this.store.recordConnectionObservation({
      project_id: projectId,
      observation_id: observationId,
      connection_id: connection.connection_id,
      job_id: job.job_id,
      provider_surface: expected.surface,
      host_id: expected.host_id,
      account_id: expected.account_id,
      operation_name: expected.operation,
      observation_state: state,
      operation_receipt_id: operationReceiptId,
      error_code: observation.current_observation.error?.code ?? ''
    });
    this.store.appendJobEvent({project_id: projectId, job_id: job.job_id,
      job_state: state === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED',
      fact_summary: `Connection operation ${state}`,
      action_label: state === 'SUCCEEDED' ? 'Connection operation succeeded' : 'Connection setup or retry required',
      completed_count: state === 'SUCCEEDED' ? 1 : 0, total_count: 1});
    return {...observation, persisted_observation_id: observationId, operation_receipt_id: operationReceiptId,
      last_operation_verified: receiptBackedSuccess};
  }

  scriptArtifact(projectId, scriptId) {
    const script = this.store.getScript(projectId, scriptId);
    if (!script) fail('MPC_WORKSPACE_SCRIPT_NOT_FOUND', 404);
    const row = this.store.getArtifact(projectId, script.artifact_id);
    if (!row) fail('MPC_WORKSPACE_SCRIPT_ARTIFACT_NOT_FOUND', 404);
    const base = this.parseStoredJsonArtifact(row);
    const exportedRef = `mpc-workspace-artifact://${projectId}/${scriptId}-exported.json`;
    if (existsSync(join(this.artifactDirectory(projectId), `${scriptId}-exported.json`))) return JSON.parse(this.readArtifact(exportedRef).toString('utf8'));
    return base;
  }

  createScript(input) {
    return this.handleScript(input);
  }

  handleScript(input) {
    this.assertOpen();
    const action = String(input.operation ?? input.action ?? 'CREATE').toUpperCase();
    if (action === 'EXPORT' || action === 'EXPORTED') {
      const projectId = input.project_id ?? this.activeProjectId;
      const scriptId = identifier(input.script_id);
      const current = this.scriptArtifact(projectId, scriptId);
      if (input.content !== undefined) {
        const content = required(input.content, 'SCRIPT_CONTENT_REQUIRED', 200_000);
        if (input.content_sha256 !== sha256(content)) fail('SCRIPT_CONTENT_HASH_MISMATCH', 409);
        if (content !== current.content) {
          const row = this.store.getScript(projectId, scriptId);
          const saved = this.handleScript({...input, operation: 'SAVE_DRAFT', project_id: projectId,
            job_id: row.job_id, goal: current.goal, language: current.language, content});
          return this.exportScript(saved.script_id, {...input, project_id: projectId, content: undefined});
        }
      }
      return this.exportScript(scriptId, input);
    }
    if (action === 'INGEST_OUTPUT') return this.ingestScriptOutput(input.script_id, input);
    const projectId = input.project_id ?? this.activeProjectId;
    const job = this.store.getJob(projectId, identifier(input.job_id, 'MPC_WORKSPACE_JOB_ID_REQUIRED'));
    if (!job) fail('MPC_WORKSPACE_JOB_NOT_FOUND', 404);
    const previous = action === 'SAVE_DRAFT' && input.script_id ? this.scriptArtifact(projectId, input.script_id) : null;
    if (!['CREATE', 'DRAFT', 'SAVE_DRAFT'].includes(action)) fail('MPC_WORKSPACE_SCRIPT_OPERATION_UNSUPPORTED');
    const language = normalizeLanguage(input.language ?? previous?.language);
    const goal = required(input.goal ?? input.request ?? previous?.goal, 'SCRIPT_GOAL_REQUIRED', 4_000);
    const safeGoal = goal.replaceAll(/\r?\n/gu, ' ');
    const templates = {
      POWERSHELL: `param(\n  [Parameter(Mandatory = $true)]\n  [string]$TargetPath\n)\nSet-StrictMode -Version Latest\n$ErrorActionPreference = 'Stop'\n# Draft only: never auto-executed by MPC Workspace.\n# Requested inspection: ${safeGoal}\n$resolved = (Resolve-Path -LiteralPath $TargetPath -ErrorAction Stop).Path\n$item = Get-Item -LiteralPath $resolved -Force\nif ($item.PSIsContainer) {\n  Get-ChildItem -LiteralPath $resolved -Force | Select-Object -First 1000 -Property FullName, Length, LastWriteTimeUtc, Attributes | ConvertTo-Json -Depth 4\n} else {\n  [ordered]@{ FullName = $item.FullName; Length = $item.Length; LastWriteTimeUtc = $item.LastWriteTimeUtc; SHA256 = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash } | ConvertTo-Json\n}`,
      PYTHON: `# Draft only: never auto-executed by MPC Workspace.\n# Requested inspection: ${safeGoal}\nimport hashlib, json, pathlib, sys\nfrom itertools import islice\ntarget = pathlib.Path(sys.argv[1]).expanduser().resolve(strict=True)\ndef row(path):\n    stat = path.stat()\n    return {"path": str(path), "kind": "directory" if path.is_dir() else "file", "bytes": stat.st_size, "mtime_ns": stat.st_mtime_ns}\ndef digest(path):\n    value = hashlib.sha256()\n    with path.open("rb") as stream:\n        for block in iter(lambda: stream.read(1024 * 1024), b""):\n            value.update(block)\n    return value.hexdigest()\nif target.is_dir():\n    selected = list(islice(target.iterdir(), 1001))\n    result = {"target": row(target), "entries": [row(path) for path in selected[:1000]], "truncated": len(selected) > 1000}\nelse:\n    result = {"target": row(target), "sha256": digest(target)}\nprint(json.dumps(result, indent=2, sort_keys=True))`,
      SHELL: `set -eu\n# Draft only: never auto-executed by MPC Workspace.\n# Requested inspection: ${safeGoal}\ntarget=\${1:?Usage: script.sh PATH}\nif [ -d "$target" ]; then\n  find "$target" -mindepth 1 -maxdepth 1 -printf '%y\\t%s\\t%TY-%Tm-%TdT%TH:%TM:%TSZ\\t%p\\n' | head -n 1000\nelse\n  wc -c -- "$target"\n  sha256sum -- "$target"\nfi`
    };
    const draft = createScriptDraft({
      ...input,
      project_id: projectId,
      task_id: job.task_id,
      language,
      goal,
      content: required(input.content ?? previous?.content ?? templates[language], 'SCRIPT_CONTENT_REQUIRED', 200_000),
      target_parameters: input.target_parameters ?? {TargetPath: 'Supply one operator-selected local file or folder path.'},
      reads: input.reads ?? ['One operator-selected local file or one directory level (maximum 1000 entries).'],
      changes: input.changes ?? [],
      prerequisites: input.prerequisites ?? [language === 'POWERSHELL' ? 'PowerShell 5.1 or newer' : language === 'PYTHON' ? 'Python 3.10 or newer' : 'POSIX shell with find, sort, head and sha256sum'],
      dry_run_supported: input.dry_run_supported ?? true,
      expected_output: required(input.expected_output ?? (language === 'SHELL'
        ? 'Bounded tabular metadata and SHA-256 output on standard output.'
        : 'Bounded JSON metadata and SHA-256 output on standard output.'), 'SCRIPT_EXPECTED_OUTPUT_REQUIRED', 8_000)
    }, {id: this.id, clock: this.clock});
    const artifactId = this.next('SCRIPT-ARTIFACT');
    const file = this.writeArtifact(projectId, artifactId, '.json', json(toStoredJson(draft)));
    const stored = this.store.createScript({
      project_id: projectId,
      script_id: draft.script_id,
      job_id: job.job_id,
      artifact: {artifact_id: artifactId, display_name: `${draft.language} script draft`, media_type: 'application/json', ...file},
      language: draft.language,
      explanation: input.explanation ?? draft.goal,
      prerequisites: Array.isArray(draft.prerequisites) ? draft.prerequisites.join('\n') : '',
      expected_output_schema: typeof draft.output_schema === 'string' ? draft.output_schema : JSON.stringify(draft.output_schema ?? {})
    });
    return {...stored, ...draft, artifact: draft, supersedes_script_id: previous?.script_id ?? null};
  }

  exportScript(scriptId, input = {}) {
    const projectId = input.project_id ?? this.activeProjectId;
    const draft = this.scriptArtifact(projectId, identifier(scriptId));
    if (draft.state === 'EXPORTED_FOR_MANUAL_RUN') return draft;
    const exported = markScriptExported(draft, {host_id: input.host_id ?? null, export_locator: input.export_locator ?? null}, {clock: this.clock});
    this.writeArtifact(projectId, `${scriptId}-exported`, '.json', json(toStoredJson(exported)));
    this.store.markScriptExported(projectId, scriptId);
    return exported;
  }

  ingestScriptOutput(scriptId, input = {}) {
    const projectId = input.project_id ?? this.activeProjectId;
    const exported = this.scriptArtifact(projectId, identifier(scriptId));
    const project = this.project(projectId);
    const completed = createScriptOutput(exported, {
      ...input,
      output: typeof input.output === 'string' ? input.output : input.content,
      observed_run_time: input.observed_run_time ?? input.observed_run_at_utc ?? null,
      retain_raw: project.retention_policy === 'RETAIN_TEXT',
      retention_authorization_ref: project.retention_policy === 'RETAIN_TEXT' ? `project-retention://${projectId}/RETAIN_TEXT` : null
    }, {id: this.id, clock: this.clock});
    if (!verifyScriptArtifact(completed).valid) fail('MPC_WORKSPACE_SCRIPT_VERIFICATION_FAILED', 500);
    const acquisition = completed.output_acquisition;
    const executionBasis = input.execution_receipt ? 'AUTHORIZED_LOCAL_RECEIPT' : 'USER_SUPPLIED_UNVERIFIED';
    const existing = this.store.findScriptOutput({
      project_id: projectId,
      script_id: scriptId,
      content_sha256: acquisition.content_sha256,
      supplied_host: input.observed_host_id ?? '',
      supplied_exit_status: input.exit_status ?? null,
      execution_basis: executionBasis,
      local_receipt_id: input.execution_receipt?.receipt_id ?? null
    });
    if (existing) {
      acquisition.source.id = existing.source_id;
      if (acquisition.workflow_record) acquisition.workflow_record.source_ref = existing.source_id;
      acquisition.acquisition_id = existing.output_id;
      this.rememberAcquisition(acquisition);
      return {...existing, ...completed, output_acquisition: publicAcquisition(acquisition), artifact: completed, reused: true};
    }
    const artifactId = this.next('SCRIPT-OUTPUT-ARTIFACT');
    const persistedOutput = project.retention_policy === 'RETAIN_TEXT' ? completed : {
      schema_version: 'MPC_WORKSPACE_SCRIPT_OUTPUT_RECEIPT_1',
      script_id: completed.script_id,
      state: completed.state,
      source_script_sha256: completed.content_sha256,
      output: {
        acquisition_id: acquisition.acquisition_id,
        source: acquisition.source,
        content_sha256: acquisition.content_sha256,
        byte_length: acquisition.byte_length,
        raw_content_retained: false
      },
      observed_run_time: completed.observed_run_time,
      observed_host_id: completed.observed_host_id,
      exit_status: completed.exit_status,
      execution_observed: completed.execution_observed,
      execution_receipt: completed.execution_receipt
    };
    const artifact = this.writeArtifact(projectId, artifactId, '.json', json(toStoredJson(persistedOutput)));
    const stored = this.store.ingestScriptOutput({
      project_id: projectId,
      script_id: scriptId,
      source: {
        source_id: acquisition.source.id,
        source_owner: acquisition.source.owner,
        source_namespace: 'SCRIPT_OUTPUT',
        native_id_type: acquisition.source.type,
        native_id: acquisition.source.native_locator,
        native_version: acquisition.source.version,
        content_sha256: acquisition.content_sha256
      },
      artifact: {artifact_id: artifactId, display_name: acquisition.name, media_type: 'application/json', ...artifact},
      supplied_host: input.observed_host_id ?? '',
      supplied_exit_status: input.exit_status ?? null,
      execution_basis: executionBasis,
      local_receipt_id: input.execution_receipt?.receipt_id ?? null
    });
    acquisition.source.id = stored.source_id;
    if (acquisition.workflow_record) acquisition.workflow_record.source_ref = stored.source_id;
    acquisition.acquisition_id = stored.output_id;
    if (project.retention_policy === 'RETAIN_TEXT' && acquisition.workflow_record?.content !== undefined) {
      this.store.retainTextForExistingSource({project_id: projectId, source_id: stored.source_id,
        text: acquisition.workflow_record.content, display_name: acquisition.name});
    }
    this.rememberAcquisition(acquisition);
    return {...stored, ...completed, output_acquisition: publicAcquisition(acquisition), artifact: completed};
  }

  listScripts(projectId = this.activeProjectId) {
    if (!projectId) return [];
    return this.store.listScripts(projectId);
  }

  getScript(scriptId, projectId = this.activeProjectId) {
    const stored = this.store.getScript(projectId, identifier(scriptId));
    if (!stored) fail('MPC_WORKSPACE_SCRIPT_NOT_FOUND', 404);
    const artifact = this.scriptArtifact(projectId, scriptId);
    return {...stored, ...artifact, state: stored.outputs.length ? 'OUTPUT_INGESTED' : artifact.state, artifact};
  }

  status() {
    return {...this.store.status(), service_version: MPC_WORKSPACE_SERVICE_VERSION, data_root: this.dataRoot};
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.modelSetup.close();
    for (const controller of this.activeJobControllers.values()) controller.abort('SERVICE_CLOSED');
    this.activeJobControllers.clear();
    this.connectionSetupAttempts.clear();
    this.connectionSetupInFlight.clear();
    this.chatStore.close();
    this.store.close();
  }
}

export function createMpcWorkspaceService(options = {}) {
  return new MpcWorkspaceService(options);
}

