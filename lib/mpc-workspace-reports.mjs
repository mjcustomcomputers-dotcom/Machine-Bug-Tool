import {createHash, randomUUID} from 'node:crypto';

export const MPC_WORKSPACE_REPORT_VERSION = 'MPC_WORKSPACE_REPORT_1';
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = code => { const error = new TypeError(code); error.code = code; throw error; };
const requiredText = (value, code, limit = 8_000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) fail(code);
  return value;
};
const optionalText = (value, code, limit = 20_000) => value === null || value === undefined || value === '' ? null : requiredText(value, code, limit);
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ?
  `[${value.map(canonical).join(',')}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const iso = value => {
  const result = value instanceof Date ? value.toISOString() : String(value);
  if (!Number.isFinite(Date.parse(result))) fail('VALID_UTC_TIMESTAMP_REQUIRED');
  return result;
};
const markdownText = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const htmlText = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const list = (value, code, maximum = 64) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maximum || value.some(item => typeof item !== 'string' || item.length > 20_000)) fail(code);
  return [...value];
};

function sourceBindings(journey) {
  const rows = journey.router_receipt?.workflow?.source_records ?? [];
  if (!Array.isArray(rows)) fail('ROUTER_SOURCE_RECORDS_INVALID');
  return rows.map(row => ({
    source_ref: row.source_ref,
    owner: row.owner,
    native_locator: row.native_locator,
    version: row.version,
    state: row.state,
    content_fingerprint: row.content_fingerprint ?? null,
    target_fact: row.target_fact ?? null
  }));
}
function numericalReviewSummary(receipt) {
  const native = receipt?.result;
  const exact = receipt?.exact_comparison_receipt;
  if (!plainObject(native) && !plainObject(exact)) return null;
  const method = native?.method ?? exact?.method ?? null;
  let native_value = null, exact_value = null;
  if (method === 'conservation') {
    native_value = native?.result ? {
      residual: native.result.residual,
      within_supplied_tolerance: native.result.within_supplied_tolerance
    } : null;
    exact_value = exact?.exact_result ? {
      residual: exact.exact_result.residual,
      within_supplied_tolerance: exact.exact_result.within_supplied_tolerance
    } : null;
  } else if (method === 'nash') {
    native_value = native?.result ? {
      mixed_status: native.result.mixed_status,
      strict_interior_mixed: native.result.strict_interior_mixed
    } : null;
    exact_value = exact?.exact_result ? {
      mixed_status: exact.exact_result.mixed_status,
      strict_interior_mixed: exact.exact_result.strict_interior_mixed
    } : null;
  }
  return {
    method,
    native_status: receipt?.native_status ?? (receipt?.status === 'SUCCEEDED' ? 'SUCCEEDED' : null),
    exact_review_status: exact?.status ?? (receipt?.exact_review_error_code ? 'FAILED' : 'NOT_APPLICABLE'),
    classification: exact?.comparison?.classification ?? null,
    native_differs_beyond_projection: exact?.comparison?.native_differs_beyond_projection ?? null,
    review_scope: exact?.review_scope ?? null,
    arithmetic: exact?.arithmetic ?? null,
    native_value,
    exact_value,
    exact_review_error_code: receipt?.exact_review_error_code ?? null
  };
}
function modelExecutionSummary(journey) {
  const selection = plainObject(journey.provider_selection) ? journey.provider_selection : {};
  const result = plainObject(journey.model_result) ? journey.model_result : {};
  const bounded = (value, limit = 512) => value === null || value === undefined || value === ''
    ? null : requiredText(String(value), 'REPORT_MODEL_OBSERVATION_INVALID', limit);
  const boundedStructured = (value, limit = 1_000) => {
    if (value === null || value === undefined || value === '') return null;
    return bounded(typeof value === 'object' ? canonical(value) : value, limit);
  };
  const diagnostics = plainObject(result.diagnostics) ? result.diagnostics : {};
  return {
    model_invoked: result.model_invoked === true,
    status: bounded(result.status, 200),
    outcome: bounded(result.outcome, 200),
    requested: {
      profile_id: bounded(selection.profile_id, 240),
      provider: bounded(selection.provider ?? selection.requested?.provider, 240),
      model: bounded(selection.model ?? selection.requested?.model ?? result.requested_model ?? result.model, 240),
      model_digest: bounded(selection.model_digest ?? selection.observation?.digest ?? result.model_digest, 512),
      access_programs: boundedStructured(selection.access_programs)
    },
    observed: {
      provider: bounded(result.provider, 240),
      model: bounded(result.observed_model, 240),
      model_digest: bounded(result.observed_model_digest ?? result.model_digest, 512),
      access_program: boundedStructured(result.observed_access_program)
    },
    diagnostics: Object.fromEntries([
      'first_token_ms', 'elapsed_ms', 'prompt_tokens', 'output_tokens', 'tokens_per_second',
      'context_length', 'source_excerpt_count', 'eligible_source_count', 'omitted_source_count',
      'truncated_source_count'
    ].map(key => [key, Number.isFinite(diagnostics[key]) ? diagnostics[key] : null]))
  };
}

function reportCore({project_id, task_id, title, question, journey, evidence_finding, benign_explanation,
  impact, reproduction, remediation, retest, limits, created_at_utc, report_id}) {
  if (!plainObject(journey) || !plainObject(journey.router_receipt)) fail('WORKSPACE_JOURNEY_RECEIPT_REQUIRED');
  const sources = sourceBindings(journey);
  const proposal = journey.model_result?.proposal ?? null;
  const analyzed = journey.model_result?.status === 'MODEL_PROPOSAL_READY' ||
    journey.model_result?.status === 'CONVERSATION_COMPLETE' || journey.finite_method_receipt?.status === 'SUCCEEDED';
  const acquired = sources.filter(source => source.state === 'CONTENT_AVAILABLE');
  const chatAnswer = journey.operation_mode === 'CHAT' &&
    typeof journey.model_result?.answer === 'string' && journey.model_result.answer.trim()
    ? journey.model_result.answer : null;
  const reportState = analyzed && (acquired.length > 0 || chatAnswer !== null) ? 'READY' : 'DRAFT';
  const modelCoverage = plainObject(journey.model_result?.source_coverage)
    ? structuredClone(journey.model_result.source_coverage) : null;
  const coverageLimits = [];
  if (modelCoverage?.omitted_source_count > 0) coverageLimits.push(
    `${modelCoverage.omitted_source_count} acquired source(s) were outside the model excerpt count limit.`);
  if (modelCoverage?.truncated_source_count > 0) coverageLimits.push(
    `${modelCoverage.truncated_source_count} included source excerpt(s) were character-limited; omitted text remains unanalyzed.`);
  if (journey.model_result?.status === 'MODEL_IDENTITY_UNOBSERVED') coverageLimits.push(
    'The model adapter did not return an observed model identity; its proposal was not promoted to a completed analysis.');
  return {
    schema_version: MPC_WORKSPACE_REPORT_VERSION,
    report_id,
    project_id,
    task_id,
    title,
    created_at_utc,
    report_state: reportState,
    objective: question,
    work_stage: journey.work_stage,
    job_state: journey.state,
    completed_work: structuredClone(journey.completion_indicators ?? {}),
    fact_summary: list(journey.fact_summary, 'REPORT_FACT_SUMMARY_INVALID'),
    source_bindings: sources,
    evidence_finding: evidence_finding ?? proposal?.interpretation ?? chatAnswer,
    chat_answer: chatAnswer,
    model_observations: structuredClone(proposal?.observations ?? []),
    model_assessment: proposal?.assessment ?? null,
    benign_explanation: benign_explanation ?? journey.router_receipt.strongest_benign_explanation ?? null,
    impact,
    reproduction,
    remediation,
    retest,
    next_action: structuredClone(journey.next_action ?? null),
    method_receipt: structuredClone(journey.finite_method_receipt ?? null),
    numerical_review: numericalReviewSummary(journey.finite_method_receipt),
    provider_selection: structuredClone(journey.provider_selection ?? null),
    model_observation: modelExecutionSummary(journey),
    model_result_status: journey.model_result?.status ?? null,
    model_source_coverage: modelCoverage,
    limits: [...new Set([...limits, ...coverageLimits])],
    router_receipt_sha256: sha256(canonical(journey.router_receipt)),
    router_receipt: structuredClone(journey.router_receipt),
    source_authentication: false,
    external_action_performed: false,
    destination_state: 'LOCAL_DRAFT'
  };
}

function renderMarkdown(report) {
  const lines = [
    `# ${markdownText(report.title)}`,
    '',
    `Project: ${markdownText(report.project_id)}  `,
    `Task: ${markdownText(report.task_id)}  `,
    `Created: ${markdownText(report.created_at_utc)}  `,
    `State: ${markdownText(report.report_state)} / ${markdownText(report.work_stage)}`,
    '',
    '## Objective', '', markdownText(report.objective), '',
    '## Acquired facts', ''
  ];
  if (report.fact_summary.length) for (const fact of report.fact_summary) lines.push(`- ${markdownText(fact)}`);
  else lines.push('- No source-supported fact summary was produced.');
  lines.push('', '## Sources', '');
  if (report.source_bindings.length) for (const source of report.source_bindings) {
    lines.push(`- **${markdownText(source.source_ref ?? 'UNRESOLVED')}** — ${markdownText(source.owner ?? 'UNKNOWN')} · version ${markdownText(source.version ?? 'UNKNOWN')} · ${markdownText(source.state)}`);
  } else lines.push('- No exact source binding is available.');
  const sections = [
    ['Evidence-backed finding', report.evidence_finding],
    ['Benign explanation / falsifier', report.benign_explanation],
    ['Impact', report.impact],
    ['Reproduction from authorized observations', report.reproduction],
    ['Remediation', report.remediation],
    ['Retest', report.retest]
  ];
  for (const [heading, value] of sections) lines.push('', `## ${heading}`, '', markdownText(value ?? 'Not established.'));
  if (report.model_observations.length) {
    lines.push('', '## Model-proposed observations', '');
    for (const observation of report.model_observations) lines.push(`- ${markdownText(observation.source_ref)}: “${markdownText(observation.quote)}” — ${markdownText(observation.meaning)}`);
  }
  const requestedModel = report.model_observation?.requested ?? {};
  const observedModel = report.model_observation?.observed ?? {};
  lines.push('', '## Model execution receipt', '',
    `- Status: ${markdownText(report.model_observation?.status ?? 'Not invoked')}`,
    `- Requested: ${markdownText(requestedModel.provider ?? 'Unknown')} / ${markdownText(requestedModel.model ?? 'Unknown')}`,
    `- Observed: ${markdownText(observedModel.provider ?? 'Unobserved')} / ${markdownText(observedModel.model ?? 'Unobserved')}`,
    `- Model digest: ${markdownText(observedModel.model_digest ?? requestedModel.model_digest ?? 'Unobserved')}`,
    `- Elapsed milliseconds: ${markdownText(report.model_observation?.diagnostics?.elapsed_ms ?? 'Unobserved')}`);
  if (report.numerical_review) {
    const review = report.numerical_review;
    lines.push('', '## Native and exact numerical comparison', '',
      `- Method: ${markdownText(review.method ?? 'Unknown')}`,
      `- Native status: ${markdownText(review.native_status ?? 'Not recorded')}`,
      `- Exact review: ${markdownText(review.exact_review_status)}`,
      `- Classification: ${markdownText(review.classification ?? review.exact_review_error_code ?? 'Not applicable')}`,
      `- Review scope: ${markdownText(review.review_scope ?? 'Not applicable')}`,
      `- Native differs beyond projection: ${markdownText(review.native_differs_beyond_projection ?? 'Not reviewed')}`,
      `- Arithmetic: ${markdownText(review.arithmetic ?? 'Not applicable')}`,
      '', 'Native value:', '', '```json', JSON.stringify(review.native_value, null, 2), '```',
      '', 'Exact value:', '', '```json', JSON.stringify(review.exact_value, null, 2), '```');
  }
  lines.push('', '## Next action', '', markdownText(report.next_action?.description ?? report.next_action?.title ?? 'No next action recorded.'),
    '', '## Limits', '');
  for (const limitation of report.limits) lines.push(`- ${markdownText(limitation)}`);
  lines.push('', 'Router receipt SHA-256: `' + report.router_receipt_sha256 + '`', '',
    '_A model proposal is not source authentication, canonical promotion, external submission, or proof of impact._', '');
  return lines.join('\n');
}

function renderHtml(report) {
  const facts = report.fact_summary.length ? report.fact_summary.map(value => `<li>${htmlText(value)}</li>`).join('') : '<li>No source-supported fact summary was produced.</li>';
  const sources = report.source_bindings.length ? report.source_bindings.map(source => `<tr><td>${htmlText(source.source_ref ?? 'UNRESOLVED')}</td><td>${htmlText(source.owner ?? 'UNKNOWN')}</td><td>${htmlText(source.version ?? 'UNKNOWN')}</td><td>${htmlText(source.state)}</td></tr>`).join('') : '<tr><td colspan="4">No exact source binding is available.</td></tr>';
  const section = (heading, value) => `<section><h2>${htmlText(heading)}</h2><p>${htmlText(value ?? 'Not established.')}</p></section>`;
  const numerical = report.numerical_review ? `<section><h2>Native and exact numerical comparison</h2><dl><dt>Method</dt><dd>${htmlText(report.numerical_review.method ?? 'Unknown')}</dd><dt>Native status</dt><dd>${htmlText(report.numerical_review.native_status ?? 'Not recorded')}</dd><dt>Exact review</dt><dd>${htmlText(report.numerical_review.exact_review_status)}</dd><dt>Classification</dt><dd>${htmlText(report.numerical_review.classification ?? report.numerical_review.exact_review_error_code ?? 'Not applicable')}</dd><dt>Review scope</dt><dd>${htmlText(report.numerical_review.review_scope ?? 'Not applicable')}</dd><dt>Native differs beyond projection</dt><dd>${htmlText(report.numerical_review.native_differs_beyond_projection ?? 'Not reviewed')}</dd><dt>Arithmetic</dt><dd>${htmlText(report.numerical_review.arithmetic ?? 'Not applicable')}</dd></dl><h3>Native value</h3><pre>${htmlText(JSON.stringify(report.numerical_review.native_value, null, 2))}</pre><h3>Exact value</h3><pre>${htmlText(JSON.stringify(report.numerical_review.exact_value, null, 2))}</pre></section>` : '';
  const model = report.model_observation ?? {}, requested = model.requested ?? {}, observed = model.observed ?? {};
  const modelReceipt = `<section><h2>Model execution receipt</h2><dl><dt>Status</dt><dd>${htmlText(model.status ?? 'Not invoked')}</dd><dt>Requested</dt><dd>${htmlText(requested.provider ?? 'Unknown')} / ${htmlText(requested.model ?? 'Unknown')}</dd><dt>Observed</dt><dd>${htmlText(observed.provider ?? 'Unobserved')} / ${htmlText(observed.model ?? 'Unobserved')}</dd><dt>Model digest</dt><dd>${htmlText(observed.model_digest ?? requested.model_digest ?? 'Unobserved')}</dd><dt>Elapsed milliseconds</dt><dd>${htmlText(model.diagnostics?.elapsed_ms ?? 'Unobserved')}</dd></dl></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${htmlText(report.title)}</title><style>body{font:16px/1.55 Segoe UI,system-ui,sans-serif;max-width:980px;margin:32px auto;padding:0 24px;color:#14252c}h1,h2{color:#28365b}table{border-collapse:collapse;width:100%}td,th{border:1px solid #426063;padding:8px;text-align:left}code,pre{word-break:break-all;white-space:pre-wrap}@media print{body{margin:0;max-width:none}}</style></head><body><header><h1>${htmlText(report.title)}</h1><p>Project ${htmlText(report.project_id)} · Task ${htmlText(report.task_id)} · ${htmlText(report.created_at_utc)}</p><p><strong>${htmlText(report.report_state)}</strong> · ${htmlText(report.work_stage)}</p></header><section><h2>Objective</h2><p>${htmlText(report.objective)}</p></section><section><h2>Acquired facts</h2><ul>${facts}</ul></section><section><h2>Sources</h2><table><thead><tr><th>ID</th><th>Owner</th><th>Version</th><th>State</th></tr></thead><tbody>${sources}</tbody></table></section>${section('Evidence-backed finding', report.evidence_finding)}${modelReceipt}${section('Benign explanation / falsifier', report.benign_explanation)}${section('Impact', report.impact)}${section('Reproduction from authorized observations', report.reproduction)}${section('Remediation', report.remediation)}${section('Retest', report.retest)}${numerical}${section('Next action', report.next_action?.description ?? report.next_action?.title)}<section><h2>Limits</h2><ul>${report.limits.map(value => `<li>${htmlText(value)}</li>`).join('')}</ul></section><footer><p>Router receipt SHA-256: <code>${report.router_receipt_sha256}</code></p><p>A model proposal is not source authentication, canonical promotion, external submission, or proof of impact.</p></footer></body></html>`;
}

/** Produce local Markdown, JSON and printable HTML from one exact journey receipt. */
export function createWorkspaceReport({project_id, task_id, title, question, journey, evidence_finding = null,
  benign_explanation = null, impact = null, reproduction = null, remediation = null, retest = null,
  limits = [], created_at_utc} = {}, {id = randomUUID, clock = () => new Date()} = {}) {
  requiredText(project_id, 'PROJECT_ID_REQUIRED', 200);
  requiredText(task_id, 'TASK_ID_REQUIRED', 200);
  requiredText(title, 'REPORT_TITLE_REQUIRED', 1_000);
  requiredText(question, 'REPORT_QUESTION_REQUIRED', 8_000);
  const fields = {evidence_finding, benign_explanation, impact, reproduction, remediation, retest};
  for (const [key, value] of Object.entries(fields)) fields[key] = optionalText(value, `REPORT_${key.toUpperCase()}_INVALID`);
  const checkedLimits = list(limits, 'REPORT_LIMITS_INVALID');
  const at = iso(created_at_utc ?? clock());
  const report = reportCore({project_id, task_id, title, question, journey, ...fields,
    limits: checkedLimits, created_at_utc: at, report_id: `REPORT-${id()}`});
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = renderMarkdown(report), html = renderHtml(report);
  const formats = {markdown, json: reportJson, html};
  const body = {...report, formats, format_sha256: Object.fromEntries(Object.entries(formats).map(([key, value]) => [key, sha256(value)]))};
  return {...body, artifact_sha256: sha256(canonical(report))};
}

export function verifyWorkspaceReport(value) {
  if (!plainObject(value) || value.schema_version !== MPC_WORKSPACE_REPORT_VERSION || !plainObject(value.formats) || !plainObject(value.format_sha256)) fail('VALID_WORKSPACE_REPORT_REQUIRED');
  const core = structuredClone(value); delete core.formats; delete core.format_sha256; delete core.artifact_sha256;
  const formatStatus = Object.fromEntries(['markdown', 'json', 'html'].map(key => [key,
    typeof value.formats[key] === 'string' && sha256(value.formats[key]) === value.format_sha256[key]]));
  return {
    valid: Object.values(formatStatus).every(Boolean) && sha256(canonical(core)) === value.artifact_sha256,
    formats: formatStatus,
    report_id: value.report_id,
    report_state: value.report_state
  };
}
