// Deterministic, bounded selection over caller-declared router receipts.
// Structural applicability is not evidence authenticity or permission to execute.
const ELIGIBLE = new Set(['REQUIRED', 'ACTIVE']);
const PRIORITY = Object.freeze({REQUIRED: 4, ACTIVE: 3, WATCH: 2, BLOCKED: 1, NOT_APPLICABLE: 0});
const stable = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function selectMethodFrontier(methods, receipts, limit = 4) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 4) throw Error('METHOD_FRONTIER_LIMIT');
  const byQuestion = new Map(receipts.map(r => [r.question_id, r]));
  const candidates = methods.map(method => {
    const ids = [...new Set(method.question_ids)].sort(stable);
    const questions = ids.map(id => {
      const receipt = byQuestion.get(id);
      if (!receipt) throw Error('METHOD_FRONTIER_UNKNOWN_QUESTION:' + id);
      return receipt;
    });
    const state = questions.reduce((current, receipt) => PRIORITY[receipt.state] > PRIORITY[current] ? receipt.state : current, 'NOT_APPLICABLE');
    return {
      ...method,
      question_ids: ids,
      structural_state: state,
      structurally_eligible: questions.some(q => ELIGIBLE.has(q.state)),
      source_authentication: false,
      execution_authorized: false,
      selection_state: 'NOT_SELECTED',
      selection_reason: 'NOT_EVALUATED'
    };
  });
  const byMethod = new Map(candidates.map(c => [c.method, c]));
  if (byMethod.size !== candidates.length) throw Error('METHOD_FRONTIER_DUPLICATE_METHOD');
  const selected = [];
  const covered = new Set();
  while (selected.length < limit) {
    const pending = candidates.filter(c => c.structurally_eligible && c.selection_state === 'NOT_SELECTED');
    if (!pending.length) break;
    const ordered = pending.map(c => {
      const uncovered = c.question_ids.map(id => byQuestion.get(id)).filter(q => !covered.has(q.question_id));
      const required = uncovered.filter(q => q.state === 'REQUIRED').length;
      const active = uncovered.filter(q => q.state === 'ACTIVE').length;
      const ready = c.input_readiness === 'SCHEMA_VALID_CALLER_MODEL' ? 1 : 0;
      return {candidate: c, required, active, ready};
    }).sort((a,b) =>
      (b.required > 0) - (a.required > 0) ||
      (b.active > 0) - (a.active > 0) ||
      b.required - a.required ||
      b.active - a.active ||
      b.ready - a.ready ||
      stable(a.candidate.method, b.candidate.method)
    );
    if (ordered[0].required === 0 && ordered[0].active === 0) break;
    const winner = ordered[0].candidate;
    winner.selection_state = 'SELECTED';
    winner.selection_reason = 'DECLARED_QUESTION_COVERAGE';
    winner.covered_question_ids = winner.question_ids.filter(id => ELIGIBLE.has(byQuestion.get(id).state)).sort(stable);
    winner.covered_question_ids.forEach(id => covered.add(id));
    selected.push(winner);
  }
  for (const c of candidates) {
    if (c.selection_state === 'SELECTED') continue;
    c.selection_reason = c.structurally_eligible
      ? c.question_ids.some(id => ELIGIBLE.has(byQuestion.get(id).state) && !covered.has(id)) ? 'DEFERRED_BY_BOUNDED_LIMIT' : 'COVERED_BY_SELECTED_METHOD'
      : c.structural_state === 'WATCH' ? 'APPLICABILITY_UNKNOWN'
      : 'STRUCTURE_OR_SOURCE_BLOCKED';
  }
  // Preserve original candidate enumeration; selection order and frontier are explicit.
  const deferred = candidates.filter(c => c.selection_state !== 'SELECTED');
  return {
    selected_methods: selected,
    method_candidates: candidates,
    deferred_methods: deferred.map(c => ({method: c.method, question_ids: c.question_ids, structural_state: c.structural_state, reason: c.selection_reason, input_readiness: c.input_readiness})),
    method_frontier: {
      policy: 'EVIDENCE_GATED_GREEDY_QUESTION_COVERAGE_V1',
      question_coverage: 'DECLARED_STRUCTURAL_APPLICABILITY_ONLY',
      selected_question_ids: [...covered].sort(stable),
      unresolved_question_ids: [...new Set(receipts.filter(r => r.state !== 'NOT_APPLICABLE' && !covered.has(r.question_id)).map(r => r.question_id))].sort(stable),
      selected_count: selected.length,
      candidate_count: candidates.length,
      deferred_count: deferred.length,
      source_authentication: false,
      external_action_authorized: false,
      global_optimum_proven: false,
      execution_performed: false
    }
  };
}
