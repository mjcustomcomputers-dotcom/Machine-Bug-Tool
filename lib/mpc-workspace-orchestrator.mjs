import {createHash, randomUUID} from 'node:crypto';

import {compareSnapshotManifests} from '../command-center-build/lib/snapshot-compare.mjs';
import {verifyNativeNumericalReceipt} from './exact-native-numerical-review.mjs';
import {runOllamaWorkspaceConversation} from './mpc-workspace-chat.mjs';
import {runOllamaWorkspaceModel} from './mpc-workspace-models.mjs';
import {getMethodCatalog} from './methods.mjs';
import {callTool} from './tools.mjs';
import {routeProblem} from './universal-router.mjs';

export const MPC_WORKSPACE_ORCHESTRATOR_VERSION = 'MPC_WORKSPACE_ORCHESTRATOR_1';
const CHECKPOINT_VERSION = 'MPC_WORKSPACE_CHECKPOINT_1';
const OPERATION_MODES = new Set(['CHAT', 'EVIDENCE_ANALYSIS']);
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = code => { const error = new TypeError(code); error.code = code; throw error; };
const requiredText = (value, code, limit = 2_000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) fail(code);
  return value;
};
const canonical = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value), 'utf8').digest('hex');
const nowIso = clock => {
  const value = clock();
  const result = value instanceof Date ? value.toISOString() : String(value);
  if (!Number.isFinite(Date.parse(result))) fail('VALID_CLOCK_REQUIRED');
  return result;
};
const clone = value => structuredClone(value);

function normalizeMethodRequest(value, packet) {
  if (value === null || value === undefined) return null;
  if (!plainObject(value) || value.tool !== 'evaluate_method' || !plainObject(value.arguments)) {
    fail('WORKSPACE_METHOD_REQUEST_INVALID');
  }
  const method = requiredText(value.arguments.method, 'WORKSPACE_METHOD_REQUIRED', 100);
  if (!plainObject(value.arguments.input)) fail('WORKSPACE_METHOD_INPUT_REQUIRED');
  if (value.selection_basis !== 'USER_SELECTED_SCHEMA_VALID_INPUT') fail('WORKSPACE_METHOD_SELECTION_BASIS_INVALID');
  const inputArtifactId = requiredText(value.input_artifact_id, 'WORKSPACE_METHOD_INPUT_ARTIFACT_REQUIRED', 240);
  if (!Array.isArray(value.source_refs) || value.source_refs.length < 1 || value.source_refs.length > 32) {
    fail('WORKSPACE_METHOD_SOURCE_REFS_INVALID');
  }
  const sourceRefs = value.source_refs.map(sourceRef => requiredText(sourceRef, 'WORKSPACE_METHOD_SOURCE_REF_INVALID', 240));
  if (new Set(sourceRefs).size !== sourceRefs.length) fail('WORKSPACE_METHOD_SOURCE_REFS_DUPLICATE');
  const available = new Set((packet.sources ?? []).map(source => source.id));
  if (sourceRefs.some(sourceRef => !available.has(sourceRef))) fail('WORKSPACE_METHOD_SOURCE_NOT_ACQUIRED');
  return {
    tool: 'evaluate_method',
    arguments: {method, input: clone(value.arguments.input)},
    source_refs: sourceRefs,
    input_artifact_id: inputArtifactId,
    selection_basis: value.selection_basis
  };
}
function normalizedAcquisition(value) {
  if (!plainObject(value) || !plainObject(value.source)) fail('VALID_ACQUISITION_REQUIRED');
  const source = value.source;
  for (const key of ['id', 'owner', 'type', 'version', 'time', 'native_locator']) requiredText(source[key], `ACQUISITION_SOURCE_${key.toUpperCase()}_REQUIRED`, key === 'native_locator' || key === 'time' ? 2_000 : 200);
  const record = value.workflow_record;
  if (record !== null && record !== undefined) {
    if (!plainObject(record) || record.source_ref !== source.id || record.version !== source.version || typeof record.content !== 'string') fail('ACQUISITION_WORKFLOW_BINDING_INVALID');
  }
  return {source: clone(source), workflow_record: record == null ? null : clone(record), acquisition_id: value.acquisition_id ?? null};
}
/** Build the exact V16 router packet from explicit project inputs. */
export function createWorkspacePacket({project_id, question, acquisitions = [], requested_phase = 'AUTO',
  domain_profile = 'GENERAL', object_id, unit_of_analysis = 'MPC Workspace project input'} = {}) {
  requiredText(project_id, 'PROJECT_ID_REQUIRED', 200);
  requiredText(question, 'QUESTION_REQUIRED', 64_000);
  if (!Array.isArray(acquisitions) || acquisitions.length > 32) fail('ACQUISITION_LIST_INVALID');
  if (!['AUTO', 'EVIDENCE_ACQUISITION', 'ANALYSIS', 'VERIFICATION'].includes(requested_phase)) fail('REQUESTED_PHASE_INVALID');
  if (!['BUSINESS', 'LEGAL', 'NEWS', 'SCIENCE', 'GENERAL'].includes(domain_profile)) fail('DOMAIN_PROFILE_INVALID');
  const normalized = acquisitions.map(normalizedAcquisition), ids = new Set();
  for (const item of normalized) {
    if (ids.has(item.source.id)) fail('DUPLICATE_ACQUISITION_SOURCE_ID');
    ids.add(item.source.id);
  }
  return {
    problem: question,
    object_id: object_id ?? `workspace:${project_id}`.slice(0, 200),
    unit_of_analysis,
    domain_profile,
    sources: normalized.map(item => item.source),
    workflow: {
      requested_phase,
      records: normalized.flatMap(item => item.workflow_record === null ? [] : [item.workflow_record])
    },
    unknowns: [],
    limitations: ['Local/imported representations are not authenticated native provider records without an owner receipt.'],
    stop_condition: 'Stop when a required exact source, supported model input, or authorized operation is unavailable.'
  };
}

const words = value => String(value ?? '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu) ?? [];

/** Lexically rank only the existing implemented evaluator catalog. Listing a candidate is not execution. */
export function discoverImplementedMethodCandidates(question, {limit = 8} = {}) {
  requiredText(question, 'QUESTION_REQUIRED', 20_000);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 24) fail('METHOD_CANDIDATE_LIMIT_INVALID');
  const needles = [...new Set(words(question))], catalog = getMethodCatalog();
  return catalog.methods.map(method => {
    const fields = [
      ['method_id', method.id, 12], ['name', method.methods, 8], ['scope', method.scope, 2]
    ];
    let score = 0;
    const reasons = [];
    for (const needle of needles) for (const [field, raw, weight] of fields) {
      const value = String(raw ?? '').toLowerCase();
      if (value.includes(needle)) { score += value === needle ? weight * 2 : weight; reasons.push({field, term: needle}); }
    }
    return {
      method_id: method.id,
      name: method.methods,
      implementation_state: method.level,
      scope: method.scope,
      score,
      match_reasons: reasons,
      method_execution_performed: false
    };
  }).filter(row => row.score > 0).sort((left, right) => right.score - left.score || left.method_id.localeCompare(right.method_id)).slice(0, limit);
}

function normalizeSelection(value) {
  if (value === null || value === undefined) return null;
  if (!plainObject(value)) fail('PROVIDER_SELECTION_INVALID');
  const requested = plainObject(value.requested) ? value.requested : value;
  const provider = requiredText(requested.provider, 'SELECTED_PROVIDER_REQUIRED', 100);
  const model = requiredText(requested.model, 'SELECTED_MODEL_REQUIRED', 100);
  const selectionId = value.selection_id ?? value.selectionId;
  requiredText(selectionId, 'SELECTION_ID_REQUIRED', 200);
  const explicit = value.selection_basis === 'USER_SELECTED_PROVIDER_PROFILE' || value.requested_by_user === true || value.explicit_user_selection === true;
  if (!explicit) fail('EXPLICIT_PROVIDER_SELECTION_REQUIRED');
  const availability = value.availability ?? 'UNKNOWN';
  if (!['UNKNOWN', 'AVAILABLE', 'UNAVAILABLE', 'NOT_CONFIGURED'].includes(availability)) fail('PROVIDER_AVAILABILITY_INVALID');
  return {
    selection_id: selectionId,
    profile_id: value.profile_id ?? requested.id ?? null,
    provider,
    surface: requested.surface ?? null,
    model,
    model_digest: requested.observation?.digest ?? null,
    access_programs: requested.access_programs ?? null,
    availability,
    setup_action: value.setup_action ?? null,
    explicit_user_selection: true
  };
}

function bindAcquiredRecord(packet, action, acquisition) {
  if (!plainObject(acquisition) || typeof acquisition.content !== 'string') fail('ACQUISITION_CALLBACK_CONTENT_REQUIRED');
  if (acquisition.source_ref !== action.source_ref || acquisition.version !== action.version) fail('ACQUISITION_CALLBACK_IDENTITY_MISMATCH');
  if (new TextEncoder().encode(acquisition.content).byteLength > 200_000) fail('ACQUISITION_CALLBACK_CONTENT_LIMIT');
  const records = packet.workflow?.records ?? [];
  const duplicate = records.find(row => row.source_ref === acquisition.source_ref && row.version === acquisition.version);
  if (duplicate?.content === acquisition.content) return {packet, changed: false};
  if (duplicate) fail('ACQUISITION_CALLBACK_CONFLICT');
  return {
    packet: {...packet, workflow: {...packet.workflow, records: [...records, {
      source_ref: acquisition.source_ref, version: acquisition.version, content: acquisition.content
    }]}},
    changed: true
  };
}

function selectionUnavailable(selection, code) {
  return {
    adapter: 'MPC_WORKSPACE_MODEL_SELECTION_1',
    status: code,
    model_invoked: false,
    provider: selection?.provider ?? null,
    model: selection?.model ?? null,
    selection_id: selection?.selection_id ?? null,
    setup_action: selection?.setup_action ?? null,
    fallback: null,
    silent_substitution_performed: false
  };
}

function outcomeState(routed, selection, modelResult, finiteMethodReceipt, operationMode, explicitMethodRequested = false) {
  if (operationMode === 'CHAT') {
    if (selection === null) return 'ANALYSIS_READY_MODEL_NOT_SELECTED';
    if (modelResult?.status === 'CONVERSATION_COMPLETE') return 'COMPLETE';
    return 'BLOCKED_MODEL_UNAVAILABLE';
  }
  if (routed.work_stage === 'EVIDENCE_ACQUISITION') return 'BLOCKED_SOURCE_REQUIRED';
  if (['FAILED', 'EXACT_REVIEW_FAILED'].includes(finiteMethodReceipt?.status)) return 'BLOCKED_METHOD_FAILED';
  if (explicitMethodRequested && finiteMethodReceipt?.status === 'SUCCEEDED') return 'COMPLETE';
  if (selection === null) return 'ANALYSIS_READY_MODEL_NOT_SELECTED';
  if (modelResult?.status === 'MODEL_PROPOSAL_READY') return 'COMPLETE';
  if (['PLAN_ONLY', 'EVIDENCE_ACTION_READY'].includes(modelResult?.status)) return 'ANALYSIS_READY';
  return 'BLOCKED_MODEL_UNAVAILABLE';
}

function checkpointFor(output, request, packet, {clock, id, resumedFrom = null, resumeCount = 0}) {
  const body = {
    schema_version: CHECKPOINT_VERSION,
    checkpoint_id: `CHECKPOINT-${id()}`,
    recorded_at_utc: nowIso(clock),
    project_id: output.project_id,
    job_id: output.job_id,
    state: output.state,
    resumed_from: resumedFrom,
    resume_count: resumeCount,
    request: clone(request),
    packet: clone(packet),
    output: clone(output)
  };
  return {...body, checkpoint_sha256: sha256(body)};
}

/** Re-seal a host-owned checkpoint after a retention-safe persistence transform. */
export function sealWorkspaceCheckpoint(checkpoint) {
  if (!plainObject(checkpoint) || checkpoint.schema_version !== CHECKPOINT_VERSION) fail('VALID_WORKSPACE_CHECKPOINT_REQUIRED');
  const body = clone(checkpoint);
  delete body.checkpoint_sha256;
  return {...body, checkpoint_sha256: sha256(body)};
}

/**
 * Execute one bounded project journey. All external behavior is adapter-owned.
 * The full routeProblem result, including workflow.source_records, is retained
 * and is the exact object supplied to the selected model adapter.
 */
export async function runWorkspaceJourney({project_id, job_id, question, acquisitions = [], packet = null,
  provider_selection = null, requested_phase = 'AUTO', domain_profile = 'GENERAL', execute_ready_call = true,
  max_acquisitions = 3, signal = null, operation_mode = 'EVIDENCE_ANALYSIS', conversation_history = [],
  assistant_instructions = null, method_request = null} = {}, {
  route = routeProblem,
  runModel = runOllamaWorkspaceModel,
  runConversation = runOllamaWorkspaceConversation,
  runTool = callTool,
  acquireSource = null,
  clock = () => new Date(),
  id = randomUUID,
  resumedFrom = null,
  resumeCount = 0,
  priorMethodReceipt = null
} = {}) {
  requiredText(project_id, 'PROJECT_ID_REQUIRED', 200);
  if (!OPERATION_MODES.has(operation_mode)) fail('WORKSPACE_OPERATION_MODE_INVALID');
  requiredText(question, 'QUESTION_REQUIRED', operation_mode === 'CHAT' ? 64_000 : 2_000);
  if (!Array.isArray(conversation_history)) fail('WORKSPACE_CONVERSATION_HISTORY_INVALID');
  if (!Number.isSafeInteger(max_acquisitions) || max_acquisitions < 0 || max_acquisitions > 8) fail('ACQUISITION_LIMIT_INVALID');
  if (typeof route !== 'function' || typeof runModel !== 'function' || typeof runConversation !== 'function' || typeof runTool !== 'function') fail('WORKSPACE_ADAPTER_REQUIRED');
  const selected = normalizeSelection(provider_selection);
  let currentPacket = packet === null ? createWorkspacePacket({project_id, question, acquisitions, requested_phase, domain_profile}) : clone(packet);
  if (!plainObject(currentPacket) || currentPacket.problem !== question) fail('WORKSPACE_PACKET_QUESTION_MISMATCH');
  if (operation_mode === 'CHAT' && ((currentPacket.sources?.length ?? 0) > 0 || (currentPacket.workflow?.records?.length ?? 0) > 0)) {
    fail('WORKSPACE_CHAT_MODE_EVIDENCE_CONFLICT');
  }
  if (operation_mode === 'CHAT' && method_request !== null) fail('WORKSPACE_CHAT_MODE_METHOD_CONFLICT');
  const explicitMethodRequest = normalizeMethodRequest(method_request, currentPacket);
  const actualJobId = job_id ?? `JOB-${id()}`;
  requiredText(actualJobId, 'JOB_ID_REQUIRED', 200);
  const progressEvents = [], acquisitionReceipts = [];
  progressEvents.push({sequence: 1, label: 'Reading project input', completed: true});
  let routed = operation_mode === 'CHAT' ? {
    schema_version: 'MPC_WORKSPACE_CHAT_ROUTE_1',
    router_invoked: false,
    work_stage: 'CONVERSATION',
    fact_summary: [],
    next_action: {kind: 'MODEL_CONVERSATION', title: 'Ask the selected local model'},
    workflow: {source_records: [], acquired_record_count: 0, required_record_count: 0, remaining_record_count: 0}
  } : await route(currentPacket);
  let acquisitionAttempts = 0;
  while (operation_mode === 'EVIDENCE_ANALYSIS' && routed.work_stage === 'EVIDENCE_ACQUISITION' && typeof acquireSource === 'function' && acquisitionAttempts < max_acquisitions) {
    const action = routed.next_action;
    if (action?.kind !== 'ACQUIRE_RECORD' || !action.source_ref || !action.version) break;
    const beforeKey = JSON.stringify([action.source_ref, action.version]);
    if ((currentPacket.workflow?.records ?? []).some(row => JSON.stringify([row.source_ref, row.version]) === beforeKey && row.content?.trim())) break;
    progressEvents.push({sequence: progressEvents.length + 1, label: `Reading ${action.source_ref}`, completed: false});
    const acquired = await acquireSource(clone(action), {project_id, job_id: actualJobId, packet: clone(currentPacket)});
    acquisitionAttempts++;
    if (acquired === null || acquired === undefined) break;
    const bound = bindAcquiredRecord(currentPacket, action, acquired);
    acquisitionReceipts.push(acquired.receipt ?? {
      source_ref: acquired.source_ref, version: acquired.version, status: 'HOST_CONTENT_BOUND_NO_NATIVE_RECEIPT'
    });
    progressEvents.at(-1).completed = bound.changed;
    if (!bound.changed) break;
    currentPacket = bound.packet;
    routed = await route(currentPacket);
  }

  let finiteMethodReceipt = null;
  const readyCall = explicitMethodRequest ?? routed.next_action?.ready_call;
  if (operation_mode === 'EVIDENCE_ANALYSIS' && execute_ready_call && plainObject(readyCall)) {
    const argumentsSha256 = sha256(readyCall.arguments);
    const canReuse = priorMethodReceipt?.status === 'SUCCEEDED' &&
      priorMethodReceipt.tool === readyCall.tool && priorMethodReceipt.arguments_sha256 === argumentsSha256;
    progressEvents.push({sequence: progressEvents.length + 1,
      label: `${canReuse ? 'Reusing' : 'Evaluating'} ${readyCall.tool}`, completed: false});
    if (canReuse) {
      finiteMethodReceipt = {...clone(priorMethodReceipt), reused_from_checkpoint: true};
      progressEvents.at(-1).completed = true;
    } else try {
      const result = await runTool(readyCall.tool, clone(readyCall.arguments));
      finiteMethodReceipt = {
        status: 'SUCCEEDED',
        tool: readyCall.tool,
        arguments_sha256: argumentsSha256,
        source_refs: explicitMethodRequest?.source_refs ?? [],
        input_artifact_id: explicitMethodRequest?.input_artifact_id ?? null,
        selection_basis: explicitMethodRequest?.selection_basis ?? 'ROUTER_READY_CALL',
        result
      };
      if (readyCall.tool === 'evaluate_method' && ['nash', 'conservation'].includes(readyCall.arguments.method)) {
        try {
          finiteMethodReceipt.exact_comparison_receipt = await verifyNativeNumericalReceipt({
            method: readyCall.arguments.method,
            input: clone(readyCall.arguments.input),
            native_receipt: clone(result)
          });
        } catch (error) {
          finiteMethodReceipt.status = 'EXACT_REVIEW_FAILED';
          finiteMethodReceipt.native_status = 'SUCCEEDED';
          finiteMethodReceipt.exact_review_error_code = String(error?.code ?? error?.message ?? 'EXACT_REVIEW_FAILED').slice(0, 300);
        }
      }
      progressEvents.at(-1).completed = finiteMethodReceipt.status === 'SUCCEEDED';
    } catch (error) {
      finiteMethodReceipt = {status: 'FAILED', tool: readyCall.tool, arguments_sha256: argumentsSha256,
        error_code: String(error?.code ?? error?.message ?? 'METHOD_FAILED').slice(0, 300)};
    }
  }

  let modelResult;
  if (selected === null) modelResult = selectionUnavailable(null, 'NO_MODEL_SELECTED');
  else if (['UNAVAILABLE', 'NOT_CONFIGURED'].includes(selected.availability)) modelResult = selectionUnavailable(selected, selected.availability === 'NOT_CONFIGURED' ? 'PROVIDER_NOT_CONFIGURED' : 'PROVIDER_UNAVAILABLE');
  else if (selected.provider !== 'OLLAMA' &&
      (operation_mode === 'CHAT' ? runConversation === runOllamaWorkspaceConversation : runModel === runOllamaWorkspaceModel)) {
    modelResult = selectionUnavailable(selected, 'PROVIDER_ADAPTER_UNAVAILABLE');
  }
  else {
    progressEvents.push({sequence: progressEvents.length + 1, label: `Evaluating ${selected.model}`, completed: false});
    if (operation_mode === 'CHAT') {
      modelResult = await runConversation({question, history: conversation_history, instructions: assistant_instructions}, {
        model: selected.model,
        model_digest: selected.model_digest ?? null,
        selection: clone(selected),
        signal
      });
    } else {
      // Do not replace `routed` with a compact summary. It is the complete native receipt.
      modelResult = await runModel(currentPacket, routed, {model: selected.model,
        model_digest: selected.model_digest ?? null, selection: clone(selected), signal});
    }
    if (modelResult?.status === 'MODEL_PROPOSAL_READY' &&
        (typeof modelResult.observed_model !== 'string' || !modelResult.observed_model.trim())) {
      modelResult = {...modelResult, status: 'MODEL_IDENTITY_UNOBSERVED', outcome: 'INCOMPLETE',
        error: {code: 'MODEL_ADAPTER_DID_NOT_RETURN_OBSERVED_IDENTITY'}};
    }
    progressEvents.at(-1).completed = modelResult?.model_invoked === true || modelResult?.status === 'PLAN_ONLY';
  }

  const candidates = discoverImplementedMethodCandidates(question);
  const state = outcomeState(routed, selected, modelResult, finiteMethodReceipt, operation_mode,
    explicitMethodRequest !== null);
  const chatComplete = operation_mode === 'CHAT' && modelResult?.status === 'CONVERSATION_COMPLETE';
  const workStage = operation_mode === 'CHAT' ? 'CONVERSATION' : routed.work_stage;
  const nextAction = operation_mode === 'CHAT'
    ? chatComplete
      ? {kind: 'CONTINUE_OR_ATTACH', title: 'Continue or attach project evidence', description: 'Ask a follow-up, or attach material for source-bound MPC analysis.'}
      : {kind: 'MODEL_SETUP', title: 'Make the selected local model available', description: selected?.setup_action ?? 'Start Ollama, install the selected model, then retry this saved question.'}
    : clone(routed.next_action);
  const output = {
    schema_version: MPC_WORKSPACE_ORCHESTRATOR_VERSION,
    project_id,
    job_id: actualJobId,
    state,
    operation_mode,
    work_stage: workStage,
    fact_summary: operation_mode === 'CHAT' ? [] : clone(routed.fact_summary ?? []),
    next_action: nextAction,
    progress: {
      acquired: operation_mode === 'CHAT' ? 0 : routed.workflow?.acquired_record_count ?? 0,
      required: operation_mode === 'CHAT' ? 0 : routed.workflow?.required_record_count ?? 0,
      remaining: operation_mode === 'CHAT' ? 0 : routed.workflow?.remaining_record_count ?? 0,
      events: progressEvents
    },
    method_candidates: candidates,
    finite_method_receipt: finiteMethodReceipt,
    acquisition_receipts: acquisitionReceipts,
    provider_selection: selected,
    model_result: modelResult,
    router_receipt: routed,
    full_router_receipt_retained: operation_mode === 'EVIDENCE_ANALYSIS' && routed.workflow?.source_records !== undefined,
    completion_indicators: {
      ACQUIRED: {completed: (routed.workflow?.acquired_record_count ?? 0) > 0, count: routed.workflow?.acquired_record_count ?? 0},
      ANALYZED: {completed: modelResult?.status === 'MODEL_PROPOSAL_READY' || chatComplete || finiteMethodReceipt?.status === 'SUCCEEDED', count: Number(modelResult?.status === 'MODEL_PROPOSAL_READY' || chatComplete) + Number(finiteMethodReceipt?.status === 'SUCCEEDED')},
      DECIDED: {completed: routed.work_stage === 'VERIFICATION' && ['SUPPORTS', 'CONTRADICTS'].includes(modelResult?.proposal?.assessment), count: routed.work_stage === 'VERIFICATION' && ['SUPPORTS', 'CONTRADICTS'].includes(modelResult?.proposal?.assessment) ? 1 : 0}
    },
    automatic_provider_fallback: false,
    source_authentication: false,
    external_action_performed: false
  };
  const request = {project_id, job_id: actualJobId, question, requested_phase, domain_profile,
    operation_mode, conversation_history: clone(conversation_history), assistant_instructions,
    provider_selection: selected, execute_ready_call, max_acquisitions,
    method_request: explicitMethodRequest};
  return {...output, checkpoint: checkpointFor(output, request, currentPacket, {clock, id, resumedFrom, resumeCount})};
}

export async function resumeWorkspaceJourney(checkpoint, {resume_reason, provider_selection, signal = null} = {}, adapters = {}) {
  if (!plainObject(checkpoint) || checkpoint.schema_version !== CHECKPOINT_VERSION) fail('VALID_WORKSPACE_CHECKPOINT_REQUIRED');
  const suppliedHash = checkpoint.checkpoint_sha256;
  const body = clone(checkpoint); delete body.checkpoint_sha256;
  if (suppliedHash !== sha256(body)) fail('WORKSPACE_CHECKPOINT_HASH_MISMATCH');
  if (checkpoint.state === 'COMPLETE') {
    return {...clone(checkpoint.output), checkpoint: clone(checkpoint), resume: {status: 'ALREADY_COMPLETE_REUSED', repeated_operations: 0}};
  }
  requiredText(resume_reason, 'CHANGED_RESUME_REASON_REQUIRED', 1_000);
  const selection = provider_selection ?? checkpoint.request.provider_selection;
  const result = await runWorkspaceJourney({
    ...checkpoint.request,
    packet: checkpoint.packet,
    provider_selection: selection,
    signal
  }, {
    ...adapters,
    priorMethodReceipt: checkpoint.output?.finite_method_receipt ?? null,
    resumedFrom: checkpoint.checkpoint_id,
    resumeCount: checkpoint.resume_count + 1
  });
  return {...result, resume: {status: 'RESUMED_FROM_CHECKPOINT', reason: resume_reason, repeated_acquisitions: 0}};
}

export function compareWorkspaceSnapshots(leftManifest, rightManifest) {
  return compareSnapshotManifests(leftManifest, rightManifest);
}
