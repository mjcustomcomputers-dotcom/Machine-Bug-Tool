import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
  API_PATHS,
  MAX_BROWSER_FILE_BYTES,
  MAX_RESPONSE_BYTES,
  RENDERER_CONTRACT_VERSION,
  buildConnectionActionModel,
  buildEvidenceCardModel,
  buildHomeActionModel,
  buildHomeNextActionModel,
  evidenceSearchSeed,
  buildQuestionEvidenceBinding,
  clampCount,
  collectAcquisitionIds,
  entityApiPath,
  formatBytes,
  jobApiPath,
  providerAvailabilityLabel,
  runtimeIdentityLabel,
  sourceIdentityLabel,
  sourceIdentityText
} from '../desktop/renderer/app.js';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'desktop/renderer/index.html'), 'utf8');
const css = readFileSync(resolve(root, 'desktop/renderer/styles.css'), 'utf8');
const js = readFileSync(resolve(root, 'desktop/renderer/app.js'), 'utf8');

test('renderer declares one bounded same-origin JSON API surface', () => {
  assert.equal(RENDERER_CONTRACT_VERSION, 'MPC_WORKSPACE_RENDERER_1');
  assert.equal(MAX_BROWSER_FILE_BYTES, 2_000_000);
  assert.equal(MAX_RESPONSE_BYTES, 4_000_000);
  assert.deepEqual(API_PATHS, {
    bootstrap: '/api/workspace/bootstrap',
    projects: '/api/workspace/projects',
    inputs: '/api/workspace/inputs',
    screenContext: '/api/workspace/screen-context',
    jobs: '/api/workspace/jobs',
    reports: '/api/workspace/reports',
    search: '/api/workspace/search',
    snapshotCompare: '/api/workspace/snapshots/compare',
    connections: '/api/workspace/connections',
    connectionTest: '/api/workspace/connections/test',
    connectionAcquire: '/api/workspace/connections/acquire',
    connectionSetup: '/api/workspace/connections/setup',
    methodAtlasRoute: '/api/workspace/methods/route',
    scripts: '/api/workspace/scripts',
    transferExport: '/api/workspace/transfers/export',
    transferImport: '/api/workspace/transfers/import',
    localModelStatus: '/api/workspace/local-model/status',
    localModelStart: '/api/workspace/local-model/start',
    localModelPull: '/api/workspace/local-model/pull',
    localModelCreate: '/api/workspace/local-model/create',
    localModelCancel: '/api/workspace/local-model/cancel'
  });
  for (const path of Object.values(API_PATHS)) {
    assert.match(path, /^\/api\/workspace\/[a-z/-]+$/u);
    assert.doesNotMatch(path, /(?:https?:|\\|\.\.|\?|#)/u);
  }
  assert.match(js, /credentials:\s*'same-origin'/u);
  assert.match(js, /redirect:\s*'error'/u);
  assert.match(js, /Content-Type.*application\/json; charset=utf-8/u);
  assert.match(js, /X-MPC-CSRF/u);
});

test('dynamic job routes reject traversal, URLs and unregistered actions', () => {
  assert.equal(jobApiPath('job-001'), '/api/workspace/jobs/job-001');
  assert.equal(jobApiPath('job:001', 'cancel'), '/api/workspace/jobs/job%3A001/cancel');
  assert.equal(jobApiPath('9f2e9f74-0b6f-4cc8-b9fb-e8ebc13418fd', 'resume'), '/api/workspace/jobs/9f2e9f74-0b6f-4cc8-b9fb-e8ebc13418fd/resume');
  for (const value of ['', '../secret', 'job/child', 'job?x=1', 'https://host/job', ' job', 'job#part']) {
    assert.throws(() => jobApiPath(value), /INVALID_JOB_ID/u);
  }
  assert.throws(() => jobApiPath('job-1', 'delete'), /INVALID_JOB_ACTION/u);
  assert.equal(entityApiPath('projects', 'project-1', 'open'), '/api/workspace/projects/project-1/open');
  assert.equal(entityApiPath('projects', 'project-1', 'draft'), '/api/workspace/projects/project-1/draft');
  assert.equal(entityApiPath('reports', 'report:1'), '/api/workspace/reports/report%3A1');
  assert.equal(entityApiPath('scripts', 'script-1', 'output'), '/api/workspace/scripts/script-1/output');
  assert.throws(() => entityApiPath('projects', '../secret', 'open'), /INVALID_ENTITY_ID/u);
  assert.throws(() => entityApiPath('connections', 'one'), /INVALID_ENTITY_KIND/u);
  assert.throws(() => entityApiPath('reports', 'one', 'delete'), /INVALID_ENTITY_ACTION/u);
});

test('complete first-journey controls and all nine product areas remain visible', () => {
  for (const label of ['Work', 'Search', 'Evidence', 'Network', 'Methods', 'Tasks', 'Reports', 'Connections', 'Assistant', 'Settings']) {
    assert.match(html, new RegExp(`data-view="${label.toLowerCase()}"[^>]*>[\\s\\S]{0,80}${label}`, 'u'));
  }
  for (const id of [
    'project-picker', 'new-project', 'model-picker', 'material-input', 'composer-input', 'paste-input', 'attach-files', 'add-folder',
    'home-primary-action', 'home-ask', 'home-paste', 'home-files', 'home-folder', 'home-connections', 'home-screen-context', 'home-next-action',
    'screen-context-panel', 'screen-context-paste-text', 'screen-context-capture', 'screen-context-import-har', 'screen-context-clear',
    'screen-context-status', 'screen-context-selection-list',
    'evidence-add-text', 'evidence-attach-files', 'evidence-add-folder',
    'run-work', 'stop-work', 'resume-work', 'save-report', 'copy-answer', 'search-query', 'compare-snapshots', 'add-connection',
    'method-run-picker', 'method-run-input', 'run-method', 'method-run-status',
    'atlas-dimensions', 'atlas-source-refs', 'atlas-subject-ids', 'atlas-domain', 'atlas-purpose', 'atlas-max',
    'atlas-route', 'atlas-copy', 'atlas-route-status', 'atlas-route-results',
    'draft-script', 'script-content', 'script-output', 'ingest-script-output', 'export-task', 'import-task',
    'portable-task-input', 'open-logs', 'restart-service', 'copy-error',
    'screen-roi-suggest','screen-roi-apply','screen-roi-copy','screen-roi-status',
    'network-refresh', 'network-clear', 'network-consent', 'network-rows', 'network-text', 'network-copy', 'network-save', 'network-use'
  ]) assert.match(html, new RegExp(`id="${id}"`, 'u'), id);
  assert.match(html, /Drop files into this project/u);
  assert.match(html, /Stored snapshot comparison/u);
  assert.match(html, /stored Drive-labeled snapshot is not a fresh Drive read/iu);
  assert.match(html, /Draft → manual run → returned-output ingestion/u);
  assert.match(html, /Export portable task/u);
  assert.match(html, /Import portable task/u);
  assert.match(html, /No external action has been performed/u);
});

test('home, evidence and connection action models preserve independent truth states', () => {
  const empty = buildHomeActionModel();
  assert.equal(empty.primary, 'CREATE_PROJECT');
  const open = buildHomeActionModel({project: {project_id: 'P1', source_coverage: {total: 2}}, reports: [{}],
    connections: [{current_observation: {observation_state: 'SUCCEEDED', operation_receipt_id: 'R1'}}]});
  assert.deepEqual({primary: open.primary, sources: open.sourceCount, reports: open.reportCount, verified: open.verifiedConnections},
    {primary: 'ASK', sources: 2, reports: 1, verified: 1});
  const resumable = buildHomeActionModel({project: {resume_state: {resume_required: true, job: {job_id: 'J1'}}}});
  assert.equal(resumable.primary, 'RESUME');

  const evidence = buildEvidenceCardModel({source_owner: 'LOCAL_WORKSPACE', source_id: 'SOURCE-1', native_version: 'v1',
    display_name: 'Retained note', acquisition_state: 'ACQUIRED', retained_document_id: 'DOC-1', job_count: 2,
    report_count: 1, content_sha256: 'a'.repeat(64)});
  assert.equal(evidence.state, 'ACQUIRED', 'acquired source state must not degrade to UNKNOWN');
  assert.equal(evidence.retention, 'TEXT_RETAINED');
  assert.equal(evidence.jobCount, 2);
  assert.equal(evidence.reportCount, 1);
  assert.equal(evidence.contentSha256, 'a'.repeat(64));

  const unavailable = buildConnectionActionModel({setup: {provider: 'GITHUB', adapter_state: 'NOT_INSTALLED',
    auth_state: 'NOT_APPLICABLE', capability_state: 'UNAVAILABLE', primary_action: 'SETUP_INFO', primary_label: 'Set up GitHub'}}, 'GitHub');
  assert.equal(unavailable.action, 'SETUP_INFO');
  assert.equal(unavailable.canSignIn, false);
  assert.equal(unavailable.status, 'ADAPTER NOT INSTALLED');
  const signIn = buildConnectionActionModel({setup: {provider: 'GITHUB', adapter_state: 'INSTALLED', auth_state: 'SIGNED_OUT',
    capability_state: 'NOT_DISCOVERED', primary_action: 'SIGN_IN', primary_label: 'Sign in with GitHub'}}, 'GitHub');
  assert.equal(signIn.action, 'SIGN_IN');
  assert.equal(signIn.canSignIn, true);
  const verified = buildConnectionActionModel({connection_id: 'C1', enabled: true,
    setup: {provider: 'GITHUB', adapter_state: 'INSTALLED', auth_state: 'ACCOUNT_OBSERVED', capability_state: 'RECEIPT_BACKED'},
    current_observation: {observation_state: 'SUCCEEDED', operation_receipt_id: 'R1'}}, 'GitHub');
  assert.equal(verified.action, 'TEST');
  assert.equal(verified.status, 'LAST OPERATION VERIFIED');
  const manualWithoutDriver = buildConnectionActionModel({connection_id: 'C2', enabled: true,
    setup: {provider: 'GITHUB', adapter_state: 'NOT_INSTALLED', auth_state: 'NOT_APPLICABLE',
      capability_state: 'UNAVAILABLE', primary_action: 'SETUP_INFO', primary_label: 'Set up GitHub'}}, 'GitHub');
  assert.equal(manualWithoutDriver.action, 'SETUP_INFO');
  assert.equal(manualWithoutDriver.actionLabel, 'Set up GitHub');
  assert.equal(manualWithoutDriver.status, 'ADAPTER NOT INSTALLED');

  const staleResume = buildHomeActionModel({project: {resume_state: {resume_required: true, job: {job_id: 'J1'}}},
    currentJob: {job_id: 'J1', job_state: 'SUCCEEDED', terminal: true}});
  assert.equal(staleResume.primary, 'ASK');
  assert.equal(buildHomeNextActionModel({project: {project_id: 'P1'}, currentJob: {job_id: 'J1', job_state: 'BLOCKED',
    next_action: {kind: 'MODEL_SETUP', title: 'Make local model available'}}}).action, 'LOCAL_MODEL_SETUP');
  assert.equal(buildHomeNextActionModel({project: {project_id: 'P1'}, currentJob: {job_id: 'J1', job_state: 'BLOCKED',
    next_action: {kind: 'MODEL_SETUP', title: 'Make local model available'}}, selectedProfileAvailable: true}).action, 'RESUME');
  assert.equal(buildHomeNextActionModel({project: {project_id: 'P1'}, currentJob: {job_id: 'J2', job_state: 'BLOCKED',
    next_action: {kind: 'ACQUIRE_RECORD', title: 'Read exact source'}}}).action, 'EVIDENCE');
  assert.equal(buildHomeNextActionModel({project: {project_id: 'P1', resume_state: {resume_required: true, job: {job_id: 'J3'}}},
    currentJob: {job_id: 'J3', job_state: 'BLOCKED', next_action: {kind: 'BEGIN_ANALYSIS'}}}).action, 'RESUME');

  const nativeIdentity = {source_id: 'internal-row', source_owner: 'LOCAL_HOST', source_namespace: 'LOCAL_INPUT',
    native_id_type: 'WINDOWS_PATH', native_id: 'C:/exact/file.pdf', native_version: 'sha256:abc'};
  assert.equal(sourceIdentityLabel(nativeIdentity), 'LOCAL_HOST · LOCAL_INPUT · WINDOWS_PATH · C:/exact/file.pdf · sha256:abc');
  assert.deepEqual(JSON.parse(sourceIdentityText(nativeIdentity)), {owner: 'LOCAL_HOST', namespace: 'LOCAL_INPUT',
    native_id_type: 'WINDOWS_PATH', native_id: 'C:/exact/file.pdf', version: 'sha256:abc'});
  assert.equal(evidenceSearchSeed({excerpt: 'Alpha retained evidence; exact source 42.'}), 'Alpha retained evidence exact source 42');
  assert.equal(evidenceSearchSeed({excerpt: ''}), '');
});

test('the first screen exposes the core journey and mobile reflow keeps the workspace in the content column', () => {
  assert.match(js, /composerCollapsed:\s*false/u);
  assert.match(html, /id="home-ask"[\s\S]{0,120}Ask or analyze/u);
  assert.match(html, /id="home-paste"[\s\S]{0,120}Paste evidence/u);
  assert.match(html, /id="home-files"[\s\S]{0,120}Attach files/u);
  assert.match(html, /id="home-folder"[\s\S]{0,120}Add a folder/u);
  assert.match(html, /id="home-connections"[\s\S]{0,120}Connect a service/u);
  assert.match(html, /id="home-screen-context"[\s\S]{0,180}Build screen-reader context/u);
  assert.match(html, /id="job-progress" role="progressbar"[^>]*aria-valuenow="0"/u);
  assert.match(html, /id="compare-snapshots"[^>]*disabled/u);
  assert.match(html, /Side panel \(bottom on narrow windows\)/u);
  for (const id of ['service-status', 'network-status', 'work-stage', 'search-coverage', 'method-run-status', 'atlas-route-status']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*role="status"[^>]*aria-live="polite"`, 'u'));
  }
  assert.match(css, /\.workspace-frame\s*\{[^}]*grid-column:\s*2/su);
  assert.match(js, /\$\('sidebar'\)\.inert = !open/u);
  assert.match(js, /workStage === jobState \? workStage : `\$\{workStage\} · \$\{jobState\}`/u);
  assert.match(js, /search\.disabled = model\.retention !== 'TEXT_RETAINED' \|\| !searchSeed/u);
  assert.match(js, /provider_profile_id: state\.selectedProfileId \?\? null/u);
  assert.match(js, /\$\('model-picker'\)\.addEventListener\('change',[\s\S]{0,240}renderHomeNextAction\(\)/u);
  assert.match(js, /setup\.status === 'AUTHORIZING' && setup\.external_action_performed === true/u);
  assert.match(js, /\['OLLAMA', 'LOCAL_MPC', 'CHATGPT_SIGN_IN'\]\.includes\(provider\)/u);
  assert.match(js, /current\.workspace_project_id !== currentProjectId\(\)/u);
  assert.match(js, /row\.dataset\.jobId = task\.job_id/u);
  assert.match(js, /Choose two different acquired snapshot manifests/u);
});

test('screen context is explicit, ordered, project-qualified and bound only to the next run', () => {
  const paste = html.indexOf('id="screen-context-paste-text"');
  const printScreen = html.indexOf('id="screen-context-capture"');
  const firefoxHar = html.indexOf('id="screen-context-import-har"');
  assert.ok(paste >= 0 && paste < firefoxHar && firefoxHar < printScreen,
    'quick pasted text and Firefox HAR precede the clipboard-image fallback');
  for (const label of ['Paste visible text', 'Use clipboard image', 'Import Firefox HAR', 'Clear selected context',
    'use Screen reader for local OCR', 'This quick path starts no live monitoring or packet capture.']) assert.match(html, new RegExp(label.replace(/[/.]/gu, '\\$&'), 'u'));
  assert.match(html, /id="screen-context-panel"[^>]*aria-busy="false"/u);
  assert.match(html, /id="screen-context-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/u);
  assert.match(html, /Firefox context can explain requests, but it does not prove what a pixel says/u);
  assert.match(html, /Screen context: none selected/u);
  assert.doesNotMatch(html, /Network interface online/u);
  assert.doesNotMatch(js, /navigator\.onLine/u);
  assert.match(js, /screenContextAcquisitions:\s*\[\]/u);
  assert.match(js, /screenContextProjectId:\s*null/u);
  assert.match(js, /request\(API_PATHS\.screenContext,\s*\{method:\s*'POST',\s*body:\s*\{[\s\S]{0,120}operation, project_id: projectId, retention_policy: policy/u);
  assert.match(js, /currentProjectId\(\) !== projectId/u);
  assert.match(js, /screen_context_operation:\s*operation/u);
  assert.match(js, /coverage\.summary_entry_count \?\? coverage\.entry_count/u);
  assert.match(js, /omitted from route summary/u);
  assert.match(js, /resetScreenContextSelection\(\)/u);

  const runStart = js.indexOf('async function runWork()');
  const runEnd = js.indexOf('async function stopWork()');
  const runWorkSource = js.slice(runStart, runEnd);
  assert.match(runWorkSource, /const screenContextAcquisitions = orderedScreenContextAcquisitions\(\)/u);
  assert.match(runWorkSource, /const screenContextAcquisitionIds = collectAcquisitionIds\(screenContextAcquisitions\)/u);
  assert.match(runWorkSource, /if \(textAcquisition\) acquisitions\.push\(textAcquisition\);\s*acquisitions\.push\(\.\.\.screenContextAcquisitions\)/u,
    'pasted text remains first and route-ready screen context follows');
  assert.match(runWorkSource, /screenContextAcquisitionIds\.length/u);
  assert.match(runWorkSource, /\['COMPLETE', 'SUCCEEDED'\]\.includes\(completedState\)\) resetEvidenceSelection\(\)/u);
});

test('question instructions and acquired evidence remain separate across repeat runs', () => {
  const first = collectAcquisitionIds([
    {acquisition_id: 'ACQ-text-1'},
    {acquisition_ids: ['ACQ-folder-1', 'ACQ-folder-2', 'ACQ-folder-1']},
    {acquisitions: [{acquisition_id: 'ACQ-nested-1'}, {acquisition_ids: ['ACQ-nested-2']}]}
  ]);
  assert.deepEqual(first, ['ACQ-text-1', 'ACQ-folder-1', 'ACQ-folder-2', 'ACQ-nested-1', 'ACQ-nested-2']);
  assert.deepEqual(collectAcquisitionIds([]), [], 'a later run cannot inherit prior acquisition IDs');
  assert.deepEqual(collectAcquisitionIds([{acquisition_ids: ['ACQ-fresh']}]), ['ACQ-fresh']);
  assert.throws(() => collectAcquisitionIds([{acquisition_ids: 'ACQ-not-an-array'}]), /INVALID_ACQUISITION_IDS/u);
  assert.throws(() => collectAcquisitionIds([{acquisition_id: '../escape'}]), /INVALID_ACQUISITION_ID/u);

  const question = 'Does the acquired log support the timeout hypothesis?';
  const binding = buildQuestionEvidenceBinding(question, [{acquisition_ids: ['ACQ-folder-1', 'ACQ-folder-2']}]);
  assert.deepEqual(binding, {question, acquisition_ids: ['ACQ-folder-1', 'ACQ-folder-2']});
  assert.equal(Object.hasOwn(binding, 'content'), false);
  assert.throws(() => buildQuestionEvidenceBinding('   ', []), /QUESTION_REQUIRED/u);

  const runStart = js.indexOf('async function runWork()');
  const runEnd = js.indexOf('async function stopWork()');
  const runWorkSource = js.slice(runStart, runEnd);
  assert.ok(runStart >= 0 && runEnd > runStart, 'runWork source boundary');
  assert.match(runWorkSource, /const material = \$\('material-input'\)\.value/u);
  assert.match(runWorkSource, /const acquisitions = \[\]/u, 'each run owns a fresh acquisition list');
  assert.match(runWorkSource, /acquireEvidenceText\(material, projectId, policy\)/u);
  assert.match(runWorkSource, /if \(currentProjectId\(\) !== projectId\) return/u,
    'a late result cannot overwrite a newly selected project');
  assert.doesNotMatch(runWorkSource, /acquireEvidenceText\(question\)/u);
  assert.match(runWorkSource, /buildQuestionEvidenceBinding\(question, acquisitions\)/u);
  assert.match(runWorkSource, /resetEvidenceSelection\(\)/u);
  assert.match(js, /function resetEvidenceSelection\(\)[\s\S]{0,500}state\.attachments = \[\][\s\S]{0,500}\$\('material-input'\)[\s\S]{0,500}\$\('browser-file-input'\)/u);
  assert.match(html, /This instruction is sent to the job; it is never acquired as evidence\./u);
});

test('connection controls describe local enablement and refresh canonical state', () => {
  assert.match(js, /model\.enabled \? `Disable \$\{label\} locally` : `Enable \$\{label\} locally`/u);
  assert.doesNotMatch(js, /'Connect'\)|'Disconnect'\)/u);
  assert.match(js, /Authentication remains unverified until a permitted operation returns a receipt/u);
  assert.match(html, /Adapter installed, signed in, capability discovered and protected read verified remain separate facts\./u);
  for (const functionName of ['configureConnection', 'setConnectionEnabled', 'runConnectionRead']) {
    const start = js.indexOf(`async function ${functionName}`);
    const next = js.indexOf('\nasync function ', start + 1);
    const source = js.slice(start, next < 0 ? js.length : next);
    assert.ok(start >= 0, functionName);
    assert.match(source, /await refreshBootstrap\(\)/u, `${functionName} refreshes host-owned state`);
  }
  assert.match(html, /id="connection-read-use"[^>]*>Use as evidence</u);
  assert.match(js, /API_PATHS\.connectionAcquire[\s\S]{0,220}read_handle:readResult\.observation\.read_handle/u);
  assert.match(js, /connectorAcquisitions\.push\(acquisition\)/u);
  assert.match(js, /function connectorAcquisitionChip\([\s\S]{0,900}Remove connected evidence/u);
  assert.match(js, /function renderAttachments\(\)[\s\S]{0,500}connectorAcquisitions\.map\(connectorAcquisitionChip\)/u);
  assert.match(js, /connectorAcquisitions\.push\(acquisition\);[\s\S]{0,100}renderAttachments\(\)/u);
  const connectorSelection = js.slice(js.indexOf("$('connection-read-use').addEventListener"), js.indexOf('bindNavigation();'));
  assert.doesNotMatch(connectorSelection, /useSelectedEvidence\(/u,
    'native connector bytes must not be downgraded into pasted LOCAL_INPUT text');
});

test('Method Atlas display and late responses remain bound to the open project', () => {
  const resetStart = js.indexOf('function resetAtlasRouteState()');
  const resetEnd = js.indexOf('\nfunction resetEvidenceSelection()', resetStart);
  const resetSource = js.slice(resetStart, resetEnd);
  assert.ok(resetStart >= 0 && resetEnd > resetStart);
  assert.match(resetSource, /state\.atlasRouteToken = null/u);
  assert.match(resetSource, /`PROJECT:\$\{projectId\}`/u);
  assert.match(resetSource, /atlas-route-results/u);
  assert.match(resetSource, /NOT ROUTED/u);
  const routeStart = js.indexOf('async function runAtlasRoute()');
  const routeEnd = js.indexOf('\nfunction rerenderMethods()', routeStart);
  const routeSource = js.slice(routeStart, routeEnd);
  assert.match(routeSource, /const projectId = currentProjectId\(\)/u);
  assert.match(routeSource, /const requestToken = makeId\('atlas-route-request'\)/u);
  assert.match(routeSource, /state\.atlasRouteToken !== requestToken \|\| currentProjectId\(\) !== projectId/u);
  assert.match(routeSource, /project_id:projectId/u);
});

test('desktop runtime identity is displayed only from observed metadata', () => {
  assert.equal(runtimeIdentityLabel({source_commit: 'abc123'}), 'Commit abc123');
  assert.equal(runtimeIdentityLabel({runtime: {source_commit: 'nested456'}, app_version: '1.2.3'}), 'Commit nested456');
  assert.equal(runtimeIdentityLabel({app_version: '1.2.3'}), 'App 1.2.3 · source commit not reported');
  assert.equal(runtimeIdentityLabel({}), 'Not reported');
  assert.match(html, /<dt>GUI source<\/dt><dd id="settings-source-commit">Not reported<\/dd>/u);
  assert.match(js, /const observed = await read\(\);[\s\S]{0,100}updateRuntimeIdentity\(observed\)/u);
  assert.doesNotMatch(html, /<dd id="settings-source-commit">[0-9a-f]{7,40}<\/dd>/iu);
});

test('renderer preserves honest provider, evidence, script and delivery states', () => {
  assert.equal(providerAvailabilityLabel({availability: 'AVAILABLE'}), 'available');
  assert.equal(providerAvailabilityLabel({observation: {status: 'ERROR'}}), 'unavailable');
  assert.equal(providerAvailabilityLabel({availability: 'CONFIGURED_ONLY'}), 'configured, unobserved');
  assert.equal(providerAvailabilityLabel({}), 'not yet observed');
  assert.equal(sourceIdentityLabel({owner: 'Drive', id: '001', version: 'v3'}), 'Drive · 001 · v3');
  assert.match(html, /A browser launch or saved account is not “connected\.”/i);
  assert.match(html, /Saving a URL means configured, not connected/u);
  assert.match(html, /Drafting never claims execution/u);
  assert.match(html, /queued destination and provider-confirmed delivery are separate states/u);
  assert.match(html, /Partial inventory cannot establish removal/u);
  assert.match(js, /USER_SUPPLIED_NOT_AUTHENTICATED/u);
  assert.match(js, /No execution was claimed/u);
  assert.match(js, /provider_profile_id:\s*profile\?\.id\s*\?\?\s*null/u);
  assert.doesNotMatch(js, /silent(?:ly)?[_ -]?fallback|fallbackProvider|mockConnected/iu);
});

test('clipboard, imports and native bridge remain explicit and narrow', () => {
  for (const operation of ['getRuntimeStatus', 'chooseFiles', 'chooseFolder', 'readClipboardText', 'copyText', 'openLogs', 'restartService', 'setInterfaceZoom']) {
    assert.match(js, new RegExp(`\\b${operation}\\b`, 'u'));
  }
  assert.match(js, /addEventListener\('click', pasteInput\)/u);
  assert.match(js, /navigator\.clipboard\?\.readText/u);
  assert.match(js, /Files have not executed or left this computer/u);
  assert.match(js, /Original files will not be moved or deleted/u);
  assert.doesNotMatch(js, /\.invoke\(|exec\(|execFile|spawn\(|child_process|shell\.openExternal|readFile\(/u);
  assert.doesNotMatch(js, /localStorage|sessionStorage/u);
});

test('untrusted content is rendered as text under a restrictive policy', () => {
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/u)?.[1] ?? '';
  for (const directive of ["default-src 'none'", "script-src 'self'", "connect-src 'self'", "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"]) {
    assert.ok(policy.includes(directive), directive);
  }
  assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/u);
  assert.doesNotMatch(html, /\son(?:click|load|error|submit)=/iu);
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/u);
  assert.match(js, /element\.textContent = String\(text\)/u);
  assert.match(js, /new TextEncoder\(\)\.encode\(raw\)\.byteLength > MAX_RESPONSE_BYTES/u);
});

test('keyboard, focus, reduced motion, contrast and 200 percent zoom are explicit', () => {
  assert.match(html, /class="skip-link" href="#workspace-main"/u);
  assert.match(html, /aria-live="polite"/u);
  assert.match(html, /aria-live="assertive"/u);
  assert.match(html, /aria-controls="view-work"/u);
  assert.match(html, /<option value="2">200%<\/option>/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /outline:\s*3px solid var\(--focus\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /data-reduced-motion="true"/u);
  assert.match(css, /data-contrast="high"/u);
  assert.match(js, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]/u);
  assert.match(js, /event\.key === 'Enter' && !event\.shiftKey && !event\.altKey && !event\.isComposing/u);
  assert.match(html, /Enter to send · Shift \+ Enter for a new line/u);
});

test('every literal renderer ID lookup resolves to an HTML control', () => {
  const htmlIds = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/gu), match => match[1]));
  const lookedUp = [
    ...Array.from(js.matchAll(/\$\('([^']+)'\)/gu), match => match[1]),
    ...Array.from(js.matchAll(/setText\('([^']+)'/gu), match => match[1])
  ];
  assert.deepEqual([...new Set(lookedUp.filter(id => !htmlIds.has(id)))], []);
  assert.equal(htmlIds.size, Array.from(html.matchAll(/\bid="([^"]+)"/gu)).length, 'HTML IDs must be unique');
});

test('small display helpers are deterministic and bounded', () => {
  assert.equal(clampCount(-1), 0);
  assert.equal(clampCount('3.9'), 3);
  assert.equal(clampCount(Number.NaN), 0);
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.0 KiB');
  assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MiB');
});
