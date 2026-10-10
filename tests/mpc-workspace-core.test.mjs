import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {
  ingestText,
  ingestFile,
  chunkTextAcquisition,
  indexAttachedFolder,
  createFolderDetachReceipt,
  buildSnapshotManifest
} from '../lib/mpc-workspace-ingest.mjs';
import {
  createWorkspacePacket,
  discoverImplementedMethodCandidates,
  runWorkspaceJourney,
  resumeWorkspaceJourney,
  compareWorkspaceSnapshots
} from '../lib/mpc-workspace-orchestrator.mjs';
import {
  observeConnectorOperation,
  redactConnectionReceipt
} from '../lib/mpc-workspace-connections.mjs';
import {
  createScriptDraft,
  markScriptExported,
  ingestScriptOutput,
  verifyScriptArtifact
} from '../lib/mpc-workspace-script-workshop.mjs';
import {createWorkspaceReport, verifyWorkspaceReport} from '../lib/mpc-workspace-reports.mjs';
import {discoverOllamaModels, runOllamaWorkspaceModel} from '../lib/mpc-workspace-models.mjs';
import {routeProblem} from '../lib/universal-router.mjs';

const fixed = new Date('2026-10-09T20:00:00.000Z');
const clock = () => fixed;
const ids = (...values) => { let index = 0; return () => values[index++] ?? `id-${index}`; };
const selection = (overrides = {}) => ({
  selection_id: 'selection-local-1', requested_by_user: true,
  provider: 'OLLAMA', model: 'qwen3:4b-instruct', availability: 'AVAILABLE', ...overrides
});
test('pasted malformed JSON and line endings remain exact evidence with an explicit parse error', () => {
  const text = '{"a":1,"\\u0061":2}\r\nnext';
  const actual = ingestText({project_id: 'project-a', text, name: 'duplicate.json', retain_raw: true,
    retention_authorization_ref: 'user-choice-1', observed_at_utc: fixed}, {id: ids('source-a', 'acquisition-a')});
  assert.equal(actual.parse.status, 'INVALID_RETAINED');
  assert.match(actual.parse.error_code, /DUPLICATE_JSON_KEY|Unexpected non-whitespace/u);
  assert.equal(actual.workflow_record.content, text);
  assert.deepEqual(actual.original_bytes, Buffer.from(text));
  assert.equal(actual.retention.policy, 'RETAIN_RAW');
  assert.equal(actual.coverage.silent_truncation, false);
});
test('large text requires explicit chunks and reports exact partial coverage', () => {
  const raw = 'é'.repeat(110_000);
  const acquired = ingestText({project_id: 'project-a', text: raw, source_id: 'source-large', observed_at_utc: fixed},
    {id: ids('acquisition-large')});
  assert.equal(acquired.workflow_record, null);
  assert.equal(acquired.coverage.state, 'CHUNK_SELECTION_REQUIRED');
  const result = chunkTextAcquisition(acquired, {max_chunk_bytes: 100_000, max_chunks: 2},
    {id: ids('chunk-source-1', 'chunk-acq-1', 'chunk-source-2', 'chunk-acq-2')});
  assert.equal(result.chunks.length, 2);
  assert.equal(result.coverage.complete, false);
  assert.ok(result.coverage.omitted > 0);
  assert.ok(result.chunks.every(chunk => Buffer.byteLength(chunk.workflow_record.content) <= 100_000));
});

test('selected files with spaces are acquired as data and never executed', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'mpc workspace file '));
  t.after(() => rm(root, {recursive: true, force: true}));
  const file = path.join(root, 'input with spaces.log');
  await writeFile(file, 'line one\r\nline two', 'utf8');
  const actual = await ingestFile({project_id: 'project-a', file_path: file, observed_at_utc: fixed},
    {id: ids('source-file', 'acquisition-file')});
  assert.equal(actual.name, 'input with spaces.log');
  assert.equal(actual.workflow_record.content, 'line one\r\nline two');
  assert.equal(actual.executed, false);
  assert.equal(actual.source.native_locator, await import('node:fs/promises').then(fs => fs.realpath(file)));
});

test('folder indexing is nested, bounded, exclusion-aware and never follows a symlink cycle', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'mpc-folder-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(path.join(root, 'nested'));
  await mkdir(path.join(root, 'node_modules'));
  await writeFile(path.join(root, 'root.txt'), 'root');
  await writeFile(path.join(root, 'nested', 'child.txt'), 'child');
  await writeFile(path.join(root, 'node_modules', 'skip.txt'), 'skip');
  try { await symlink(root, path.join(root, 'nested', 'cycle'), 'dir'); } catch {}
  const index = await indexAttachedFolder({project_id: 'project-a', root_path: root, mount_id: 'mount-a',
    observed_at_utc: fixed});
  assert.deepEqual(index.entries.filter(row => row.kind === 'FILE').map(row => row.relative_locator),
    ['nested/child.txt', 'root.txt']);
  assert.equal(index.originals_modified, false);
  assert.equal(index.coverage.followed_symlinks, false);
  assert.ok(index.counts.excluded >= 1);
  const detached = createFolderDetachReceipt(index, {detached_at_utc: fixed});
  assert.equal(detached.original_files_deleted, false);
  assert.equal(detached.retained_entry_count, index.entries.length);
});

test('a partial local inventory cannot prove removal from a complete Drive snapshot', () => {
  const identity = native_id => ({owner: 'owner-a', namespace: 'collection', native_id_type: 'string', native_id});
  const baseIndex = {schema_version: 'MPC_WORKSPACE_INGEST_1', project_id: 'project-a', mount_id: 'mount-a',
    observed_at_utc: fixed.toISOString(), connection_state: 'ONLINE', inventory_complete: true, entries: [
      {relative_locator: 'one.txt', kind: 'FILE', file_state: 'PRESENT', version: 'v1', content_sha256: 'a'.repeat(64), source_id: identity('one')},
      {relative_locator: 'two.txt', kind: 'FILE', file_state: 'PRESENT', version: 'v1', content_sha256: 'b'.repeat(64), source_id: identity('two')}
    ]};
  const old = buildSnapshotManifest(baseIndex, {snapshot_id: 'drive-old', source_id: identity('drive-snapshot'),
    comparison_scope: identity('project-files'), version: 'drive-v1'});
  const partialIndex = {...baseIndex, inventory_complete: false, entries: [baseIndex.entries[0]]};
  const current = buildSnapshotManifest(partialIndex, {snapshot_id: 'local-now', source_id: identity('local-snapshot'),
    comparison_scope: identity('project-files'), version: 'local-v1'});
  const delta = compareWorkspaceSnapshots(old, current);
  assert.equal(delta.summary.removed, 0);
  assert.equal(delta.summary.unknown, 1);
  assert.equal(delta.same_inventory_scope, true);
});

test('orchestration gives the selected model the complete router receipt, not the compact work summary', async () => {
  const acquired = ingestText({project_id: 'project-a', text: 'Alpha approved record identity R1.', source_id: 'record-a', observed_at_utc: fixed},
    {id: ids('acquisition-a')});
  let seen;
  const model = async (packet, routed, options) => {
    seen = {packet, routed, options};
    return {status: 'MODEL_PROPOSAL_READY', model_invoked: true, provider: 'OLLAMA_LOOPBACK_ONLY', model: options.model,
      observed_model: options.model,
      proposal: {observations: [{source_ref: 'record-a', version: acquired.source.version, quote: 'identity R1', meaning: 'Identity string present.', status: 'QUOTATION_MATCHED_INTERPRETATION_UNVERIFIED'}],
        interpretation: 'The record contains an identity string.', next_question: 'Is there a newer version?', assessment: 'UNDETERMINED'}};
  };
  const result = await runWorkspaceJourney({project_id: 'project-a', question: 'What does the identity record say?',
    acquisitions: [acquired], provider_selection: selection()}, {runModel: model, clock, id: ids('job-a', 'checkpoint-a')});
  assert.equal(result.state, 'COMPLETE');
  assert.equal(result.full_router_receipt_retained, true);
  assert.equal(seen.routed, result.router_receipt);
  assert.equal(seen.routed.workflow.source_records[0].source_ref, 'record-a');
  assert.equal(seen.packet.workflow.records[0].content, 'Alpha approved record identity R1.');
  assert.equal(result.completion_indicators.ACQUIRED.completed, true);
  assert.equal(result.completion_indicators.ANALYZED.completed, true);
});

test('missing native content is acquired once, identity-bound and not repeated when a complete checkpoint reopens', async () => {
  const source = {id: 'record-a', owner: 'Fixture owner', type: 'NATIVE_RECORD', version: 'r1',
    time: fixed.toISOString(), native_locator: 'fixture://record-a'};
  const pointer = {source, workflow_record: null, acquisition_id: 'pointer-a'};
  let acquisitions = 0, modelCalls = 0;
  const runModel = async (packet, routed) => {
    modelCalls++;
    assert.equal(routed.workflow.source_records[0].state, 'CONTENT_AVAILABLE');
    return {status: 'MODEL_PROPOSAL_READY', model_invoked: true, observed_model: 'qwen3:4b-instruct',
      proposal: {observations: [], interpretation: 'Bound content available.', next_question: 'None?', assessment: 'UNDETERMINED'}};
  };
  const result = await runWorkspaceJourney({project_id: 'project-a', question: 'Read the selected record.',
    acquisitions: [pointer], provider_selection: selection()}, {
    acquireSource: async action => { acquisitions++; return {source_ref: action.source_ref, version: action.version,
      content: 'Bound content from r1.', receipt: {receipt_id: 'native-read-1', status: 'SUCCEEDED'}}; },
    runModel, clock, id: ids('job-a', 'checkpoint-a')
  });
  assert.equal(acquisitions, 1);
  assert.equal(result.progress.remaining, 0);
  const reopened = await resumeWorkspaceJourney(result.checkpoint, {}, {runModel: async () => { throw Error('must not repeat'); }});
  assert.equal(reopened.resume.status, 'ALREADY_COMPLETE_REUSED');
  assert.equal(acquisitions, 1);
  assert.equal(modelCalls, 1);
});

test('an unavailable explicitly selected provider never silently invokes or falls back', async () => {
  const acquired = ingestText({project_id: 'project-a', text: 'Evidence text.', source_id: 'record-a', observed_at_utc: fixed},
    {id: ids('acquisition-a')});
  let called = false;
  const result = await runWorkspaceJourney({project_id: 'project-a', question: 'Analyze it.', acquisitions: [acquired],
    provider_selection: selection({availability: 'UNAVAILABLE', setup_action: 'Start Ollama.'})}, {
    runModel: async () => { called = true; }, clock, id: ids('job-a', 'checkpoint-a')
  });
  assert.equal(called, false);
  assert.equal(result.model_result.status, 'PROVIDER_UNAVAILABLE');
  assert.equal(result.model_result.setup_action, 'Start Ollama.');
  assert.equal(result.automatic_provider_fallback, false);
  assert.equal(result.state, 'BLOCKED_MODEL_UNAVAILABLE');
});

test('cancellation is passed to the selected adapter and an unfinished job resumes without reacquisition', async () => {
  const acquired = ingestText({project_id: 'project-a', text: 'Stable acquired content.', source_id: 'record-a', observed_at_utc: fixed},
    {id: ids('acquisition-a')});
  const controller = new AbortController(); controller.abort('user stop');
  let firstModelCalls = 0, acquireCalls = 0;
  const first = await runWorkspaceJourney({project_id: 'project-a', job_id: 'job-a', question: 'Analyze stable content.',
    acquisitions: [acquired], provider_selection: selection(), signal: controller.signal}, {
    acquireSource: async () => { acquireCalls++; throw Error('must not reacquire'); },
    runModel: async (_packet, _routed, options) => {
      firstModelCalls++; assert.equal(options.signal, controller.signal);
      return {status: 'CANCELLED', outcome: 'CANCELLED', model_invoked: true, proposal: null};
    }, clock, id: ids('checkpoint-a')
  });
  assert.equal(first.state, 'BLOCKED_MODEL_UNAVAILABLE');
  const resumeController = new AbortController();
  const resumed = await resumeWorkspaceJourney(first.checkpoint, {
    resume_reason: 'The user selected Resume after cancellation.', signal: resumeController.signal
  }, {
    acquireSource: async () => { acquireCalls++; throw Error('must not reacquire'); },
    runModel: async (_packet, routed, options) => {
      assert.equal(routed.workflow.source_records[0].state, 'CONTENT_AVAILABLE');
      assert.equal(options.signal, resumeController.signal);
      return {status: 'MODEL_PROPOSAL_READY', model_invoked: true, observed_model: 'qwen3:4b-instruct', proposal: {observations: [],
        interpretation: 'The acquired content remains bound.', next_question: 'Any newer version?', assessment: 'UNDETERMINED'}};
    }, clock, id: ids('checkpoint-b')
  });
  assert.equal(firstModelCalls, 1);
  assert.equal(acquireCalls, 0);
  assert.equal(resumed.state, 'COMPLETE');
  assert.equal(resumed.resume.repeated_acquisitions, 0);
  assert.equal(resumed.checkpoint.resumed_from, first.checkpoint.checkpoint_id);
});

test('implemented method discovery is deterministic and never labels listing as execution', () => {
  const rows = discoverImplementedMethodCandidates('Check the Nash equilibrium and payoff matrix.');
  assert.equal(rows[0].method_id, 'nash');
  assert.ok(rows.every(row => row.method_execution_performed === false));
});

test('a source-bound Nash request retains the native result and exact 1/3 disagreement in the report', async () => {
  const acquired = ingestText({project_id: 'project-a', text: '{"fixture":"nash-rounding-trap"}',
    source_id: 'record-nash', observed_at_utc: fixed}, {id: ids('acquisition-nash')});
  const d = 2 ** -54;
  const input = {row_payoffs: [[1 - 2 ** -52, d], [1, -d]], column_payoffs: [[0, 1], [1, 0]]};
  const journey = await runWorkspaceJourney({project_id: 'project-a', job_id: 'job-nash',
    question: 'Evaluate the explicitly supplied Nash fixture.', acquisitions: [acquired],
    provider_selection: selection(), method_request: {tool: 'evaluate_method', arguments: {method: 'nash', input},
      source_refs: ['record-nash'], input_artifact_id: 'method-input-nash',
      selection_basis: 'USER_SELECTED_SCHEMA_VALID_INPUT'}}, {
    runModel: async () => ({status: 'MODEL_PROPOSAL_READY', model_invoked: true, observed_model: 'qwen3:4b-instruct',
      proposal: {observations: [], interpretation: 'The supplied calculation was executed.', next_question: 'None', assessment: 'UNDETERMINED'}}),
    clock, id: ids('checkpoint-nash')
  });
  const receipt = journey.finite_method_receipt;
  assert.equal(receipt.status, 'SUCCEEDED');
  assert.equal(receipt.result.result.strict_interior_mixed.column_probabilities[0], 0.4);
  assert.deepEqual(receipt.exact_comparison_receipt.exact_result.strict_interior_mixed.column_probabilities[0]
    .numerator, '1');
  assert.equal(receipt.exact_comparison_receipt.exact_result.strict_interior_mixed.column_probabilities[0]
    .denominator, '3');
  assert.equal(receipt.exact_comparison_receipt.comparison.classification,
    'NATIVE_NUMERICAL_DISAGREEMENT_BEYOND_PROJECTION');
  const report = createWorkspaceReport({project_id: 'project-a', task_id: 'task-nash', title: 'Nash exact review',
    question: 'Evaluate the explicitly supplied Nash fixture.', journey}, {clock, id: ids('report-nash')});
  assert.match(report.formats.markdown, /NATIVE_NUMERICAL_DISAGREEMENT_BEYOND_PROJECTION/u);
  assert.match(report.formats.markdown, /"denominator": "3"/u);
  assert.match(report.formats.html, /Native and exact numerical comparison/u);
});

test('exact conservation review catches a native zero-tolerance false pass and is not rerun on resume', async () => {
  const acquired = ingestText({project_id: 'project-a', text: '{"fixture":"conservation-rounding-trap"}',
    source_id: 'record-conservation', observed_at_utc: fixed}, {id: ids('acquisition-conservation')});
  const input = {unit: 'SYNTHETIC_UTILITY', opening: 1, inflows: [2 ** -54], outflows: [1], closing: 0, tolerance: 0};
  let methodCalls = 0;
  const runTool = async (_tool, args) => {
    methodCalls++;
    return (await import('../lib/methods.mjs')).evaluateMethod(args);
  };
  const first = await runWorkspaceJourney({project_id: 'project-a', job_id: 'job-conservation',
    question: 'Evaluate the explicitly supplied conservation fixture.', acquisitions: [acquired],
    provider_selection: selection({availability: 'UNAVAILABLE'}), method_request: {tool: 'evaluate_method',
      arguments: {method: 'conservation', input}, source_refs: ['record-conservation'],
      input_artifact_id: 'method-input-conservation', selection_basis: 'USER_SELECTED_SCHEMA_VALID_INPUT'}},
  {runTool, clock, id: ids('checkpoint-conservation-a')});
  assert.equal(first.state, 'COMPLETE');
  assert.equal(first.finite_method_receipt.result.result.within_supplied_tolerance, true);
  assert.equal(first.finite_method_receipt.exact_comparison_receipt.exact_result.within_supplied_tolerance, false);
  assert.equal(first.finite_method_receipt.exact_comparison_receipt.comparison.classification,
    'NATIVE_TOLERANCE_FALSE_PASS');
  const resumed = await resumeWorkspaceJourney(first.checkpoint, {resume_reason: 'Model is now available.',
    provider_selection: selection()}, {runTool, runModel: async () => ({status: 'MODEL_PROPOSAL_READY',
      model_invoked: true, observed_model: 'qwen3:4b-instruct', proposal: {observations: [],
        interpretation: 'Exact comparison retained.', next_question: 'None', assessment: 'UNDETERMINED'}}),
    clock, id: ids('checkpoint-conservation-b')});
  assert.equal(methodCalls, 1);
  assert.equal(resumed.resume.status, 'ALREADY_COMPLETE_REUSED');
  assert.equal(resumed.resume.repeated_operations, 0);
  assert.equal(resumed.state, 'COMPLETE');
});

test('reports retain exact source versions, reopen in three local formats and escape untrusted HTML', async () => {
  const acquired = ingestText({project_id: 'project-a', text: 'Record <script>alert(1)</script> identity R1.', source_id: 'record-a', observed_at_utc: fixed},
    {id: ids('acquisition-a')});
  const journey = await runWorkspaceJourney({project_id: 'project-a', job_id: 'job-a', question: 'What is present?',
    acquisitions: [acquired], provider_selection: selection({observation: {digest: 'sha256:model-a'},
      access_programs: {cyber: 'daybreak_blue'}})},
  {runModel: async () => ({status: 'MODEL_PROPOSAL_READY', outcome: 'COMPLETED', model_invoked: true,
      provider: 'OLLAMA_LOOPBACK_ONLY', observed_model: 'qwen3:4b-instruct', model_digest: 'sha256:model-a',
      observed_access_program: {cyber: 'daybreak_blue'},
      diagnostics: {first_token_ms: 4, elapsed_ms: 12},
      proposal: {observations: [], interpretation: 'The selected record is available.', next_question: 'Any contrary record?', assessment: 'UNDETERMINED'}}),
    clock, id: ids('checkpoint-a')});
  const report = createWorkspaceReport({project_id: 'project-a', task_id: 'task-a', title: 'Evidence report',
    question: 'What is present?', journey, evidence_finding: '<script>alert(1)</script>', limits: ['Local source is not a native Drive receipt.']},
    {clock, id: ids('report-a')});
  assert.equal(report.report_state, 'READY');
  assert.equal(report.source_bindings[0].version, acquired.source.version);
  assert.equal(report.model_observation.requested.model, 'qwen3:4b-instruct');
  assert.equal(report.model_observation.observed.model, 'qwen3:4b-instruct');
  assert.equal(report.model_observation.observed.model_digest, 'sha256:model-a');
  assert.equal(report.model_observation.requested.access_programs, '{"cyber":"daybreak_blue"}');
  assert.equal(report.model_observation.observed.access_program, '{"cyber":"daybreak_blue"}');
  assert.equal(report.model_observation.diagnostics.elapsed_ms, 12);
  assert.doesNotMatch(report.formats.html, /<script>alert/u);
  assert.match(report.formats.markdown, /&lt;script&gt;/u);
  assert.match(report.formats.markdown, /Model execution receipt/u);
  assert.deepEqual(verifyWorkspaceReport(report), {valid: true, formats: {markdown: true, json: true, html: true}, report_id: report.report_id, report_state: 'READY'});
});

test('a retained chat answer and observed model identity survive report rendering while missing text stays draft', async () => {
  const journey = await runWorkspaceJourney({project_id: 'project-chat', job_id: 'job-chat',
    question: 'Give me a bounded project summary.', operation_mode: 'CHAT', provider_selection: selection()}, {
    runConversation: async () => ({status: 'CONVERSATION_COMPLETE', outcome: 'COMPLETED', model_invoked: true,
      provider: 'OLLAMA_LOOPBACK_ONLY', requested_model: 'qwen3:4b-instruct', observed_model: 'qwen3:4b-instruct',
      model_digest: 'sha256:chat-model', answer: 'The project has one bounded next action.',
      diagnostics: {first_token_ms: 3, elapsed_ms: 9}}), clock, id: ids('checkpoint-chat')
  });
  const report = createWorkspaceReport({project_id: 'project-chat', task_id: 'task-chat', title: 'Chat report',
    question: 'Give me a bounded project summary.', journey}, {clock, id: ids('report-chat')});
  assert.equal(report.report_state, 'READY');
  assert.equal(report.chat_answer, 'The project has one bounded next action.');
  assert.equal(report.evidence_finding, report.chat_answer);
  assert.equal(report.model_observation.observed.model, 'qwen3:4b-instruct');
  assert.match(report.formats.markdown, /The project has one bounded next action/u);
  assert.equal(verifyWorkspaceReport(report).valid, true);

  const metadataOnlyJourney = structuredClone(journey);
  delete metadataOnlyJourney.model_result.answer;
  const metadataOnlyReport = createWorkspaceReport({project_id: 'project-chat', task_id: 'task-chat',
    title: 'Metadata-only chat report', question: 'Give me a bounded project summary.', journey: metadataOnlyJourney},
  {clock, id: ids('report-chat-metadata')});
  assert.equal(metadataOnlyReport.report_state, 'DRAFT');
  assert.equal(metadataOnlyReport.chat_answer, null);
});

test('script workshop keeps draft, manual export and returned-output ingestion distinct', () => {
  const draft = createScriptDraft({project_id: 'project-a', task_id: 'task-a', language: 'POWERSHELL',
    goal: 'Read an operator-selected log.', content: 'Get-Content -LiteralPath $Args[0]', target_parameters: {path: 'chosen by user'},
    reads: ['Selected local log'], changes: [], prerequisites: ['PowerShell'], expected_output: 'Text lines on standard output',
    dry_run_supported: false}, {clock, id: ids('script-a')});
  assert.equal(draft.state, 'DRAFT');
  const exported = markScriptExported(draft, {host_id: 'windows-a', export_locator: 'C:\\Temp\\Read-Log.ps1'}, {clock});
  assert.equal(exported.state, 'EXPORTED_FOR_MANUAL_RUN');
  assert.equal(exported.execution_observed, false);
  const ingested = ingestScriptOutput(exported, {output: 'synthetic returned line', observed_host_id: 'windows-a', exit_status: 0},
    {clock, id: ids('output-source', 'output-acquisition')});
  assert.equal(ingested.state, 'OUTPUT_INGESTED');
  assert.equal(ingested.execution_observed, false);
  assert.equal(ingested.output_acquisition.workflow_record.content, 'synthetic returned line');
  assert.equal(verifyScriptArtifact(ingested).valid, true);
});

test('connector first use records the actual protected receipt and redacts credential fields', async () => {
  const expected = {provider: 'GITHUB', surface: 'WINDOWS', host_id: 'host-a', account_id: 'account-a', operation: 'READ_REPOSITORY_FILE'};
  let calls = 0;
  const actual = await observeConnectorOperation({configuration: {provider: 'GITHUB', label: 'GitHub', endpoint: 'https://api.github.com'},
    expected, operation_input: {repository: 'owner/repo'}}, {clock, invoke: async () => {
      calls++; return {status: 'SUCCESS', receipt_id: 'github-read-1', native_id: 'blob-a', token: 'must-not-persist'};
    }});
  assert.equal(calls, 1);
  assert.equal(actual.assessment.status, 'LAST_OPERATION_VERIFIED');
  assert.equal(actual.assessment.prior_success_required_for_attempt, false);
  assert.equal(actual.operation_result.token, '[REDACTED]');
  assert.deepEqual(redactConnectionReceipt({authorization: 'Bearer private', nested: {ok: true}}),
    {authorization: '[REDACTED]', nested: {ok: true}});
});

test('Ollama discovery reports installed and loaded model identities without calling inference', async () => {
  const fetchImpl = async url => {
    if (url.endsWith('/api/tags')) return new Response(JSON.stringify({models: [{name: 'qwen3:4b-instruct', model: 'qwen3:4b-instruct', digest: 'digest-a', size: 42,
      details: {format: 'gguf', family: 'qwen3', parameter_size: '4B', quantization_level: 'Q4'}}]}));
    if (url.endsWith('/api/ps')) return new Response(JSON.stringify({models: [{name: 'qwen3:4b-instruct', digest: 'digest-a', size: 42, size_vram: 21, context_length: 8192}]}));
    throw Error('unexpected URL');
  };
  const actual = await discoverOllamaModels({}, {fetchImpl});
  assert.equal(actual.status, 'AVAILABLE');
  assert.equal(actual.models[0].digest, 'digest-a');
  assert.equal(actual.loaded_models[0].context_length, 8192);
  assert.equal(actual.discovery_is_inference, false);
});

test('streaming Ollama adapter retains requested/observed identity, digest, cancellation hooks and metrics', async () => {
  const acquired = ingestText({project_id: 'project-a', text: 'Alpha record identity R1.', source_id: 'record-a', observed_at_utc: fixed},
    {id: ids('acquisition-a')});
  const packet = createWorkspacePacket({project_id: 'project-a', question: 'What identity is shown?', acquisitions: [acquired]});
  const routed = await routeProblem(packet);
  const proposal = JSON.stringify({observations: [{source_ref: 'record-a', quote: 'identity R1', meaning: 'The source contains the identity.'}],
    interpretation: 'The acquired source contains R1.', next_question: 'Is R1 current?', assessment: 'UNDETERMINED'});
  const split = Math.floor(proposal.length / 2), tokens = [];
  const rows = [
    {model: 'qwen3:4b-instruct', message: {content: proposal.slice(0, split)}, done: false},
    {model: 'qwen3:4b-instruct', message: {content: proposal.slice(split)}, done: false},
    {model: 'qwen3:4b-instruct', message: {content: ''}, done: true, done_reason: 'stop', prompt_eval_count: 30, eval_count: 20, eval_duration: 500_000_000}
  ];
  const bytes = new TextEncoder().encode(rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  let request;
  const fetchImpl = async (url, options) => {
    if(url.endsWith('/api/show'))return new Response(JSON.stringify({capabilities:['completion'],details:{format:'gguf'},model_info:{'qwen3.context_length':8192}}));
    request = {url, options, body: JSON.parse(options.body)};
    return new Response(new ReadableStream({start(controller) { controller.enqueue(bytes); controller.close(); }}), {status: 200});
  };
  const times = [0, 25, 100]; let timeIndex = 0;
  const actual = await runOllamaWorkspaceModel(packet, routed, {model: 'qwen3:4b-instruct', model_digest: 'digest-a',
    context_length: 8192, fetchImpl, onToken: token => tokens.push(token), nowMs: () => times[Math.min(timeIndex++, times.length - 1)]});
  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(request.body.stream, true);
  assert.equal(actual.status, 'MODEL_PROPOSAL_READY');
  assert.equal(actual.outcome, 'COMPLETED');
  assert.equal(actual.requested_model, 'qwen3:4b-instruct');
  assert.equal(actual.observed_model, 'qwen3:4b-instruct');
  assert.equal(actual.model_digest, 'digest-a');
  assert.equal(actual.diagnostics.first_token_ms, 25);
  assert.equal(actual.diagnostics.elapsed_ms, 100);
  assert.equal(actual.diagnostics.tokens_per_second, 40);
  assert.equal(actual.diagnostics.context_length, 8192);
  assert.equal(tokens.join(''), proposal);
  assert.equal(actual.next_action.kind, routed.next_action.kind);
});

test('streaming Ollama cancellation is a cancelled outcome and never triggers fallback', async () => {
  const acquired = ingestText({project_id: 'project-a', text: 'Alpha record.', source_id: 'record-a', observed_at_utc: fixed},
    {id: ids('acquisition-a')});
  const packet = createWorkspacePacket({project_id: 'project-a', question: 'Read it.', acquisitions: [acquired]});
  const routed = await routeProblem(packet);
  const controller = new AbortController(); controller.abort('stop');
  const actual = await runOllamaWorkspaceModel(packet, routed, {signal: controller.signal,
    fetchImpl: async (_url, options) => { assert.equal(options.signal.aborted, true); throw new DOMException('Aborted', 'AbortError'); }});
  assert.equal(actual.status, 'CANCELLED');
  assert.equal(actual.outcome, 'CANCELLED');
  assert.equal(actual.guarantees.automatic_provider_fallback, false);
});
