// Pure finite supplied-model evaluators. The caller must apply atomicSchemas
// through the existing schema.mjs validator before invoking atomicFunctions.
// No source authentication, external state, I/O, or unbounded theorem proving.
const idSchema = {type: 'string', minLength: 1, maxLength: 200};
const array = (items, minItems, maxItems) => ({type: 'array', items, minItems, maxItems});
const object = (properties, required = Object.keys(properties)) => ({type: 'object', properties, required, additionalProperties: false});
const enumeration = (...values) => ({type: 'string', enum: values});
const budgetSchema = maximum => ({type: 'integer', minimum: 1, maximum});
const boundary = {
  source_authentication: false,
  factual_truth_established: false,
  target_vulnerability_proven: false,
  unbounded_proof: false
};

export const atomicSchemas = {
  propositional_entailment: object({
    variables: array(idSchema, 1, 12),
    nodes: array(object({
      id: idSchema,
      op: enumeration('VAR', 'NOT', 'AND', 'OR', 'IMPLIES'),
      variable: idSchema,
      args: array(idSchema, 1, 8)
    }, ['id', 'op']), 1, 127),
    assumptions: array(idSchema, 0, 32),
    conclusion: idSchema,
    max_assignments: budgetSchema(4096)
  }, ['variables', 'nodes', 'assumptions', 'conclusion']),
  finite_invariant: object({
    invariant_label: idSchema,
    states: array(object({id: idSchema, invariant_holds: {type: ['boolean', 'null']}}), 1, 256),
    initial_states: array(idSchema, 1, 256),
    transitions: array(object({id: idSchema, from: idSchema, to: idSchema}), 0, 512),
    forbidden_states: array(idSchema, 0, 256),
    max_states_examined: budgetSchema(256)
  }, ['invariant_label', 'states', 'initial_states', 'transitions', 'forbidden_states']),
  abductive_cover: object({
    effects_semantics: enumeration('ALL_LISTED_EFFECTS_MANDATORY'),
    hypotheses: array(object({id: idSchema, effects: array(idSchema, 0, 64)}), 0, 12),
    observed_effects: array(idSchema, 0, 64),
    contradicted_effects: array(idSchema, 0, 64),
    max_subsets: budgetSchema(4096)
  }, ['effects_semantics', 'hypotheses', 'observed_effects', 'contradicted_effects']),
  minimal_cut_sets: object({
    root: idSchema,
    nodes: array(object({
      id: idSchema,
      kind: enumeration('LEAF', 'AND', 'OR'),
      children: array(idSchema, 1, 8)
    }, ['id', 'kind']), 1, 63),
    max_assignments: budgetSchema(4096)
  }, ['root', 'nodes'])
};

function fail(message) { throw new Error(message); }
function unique(ids) {
  if (new Set(ids).size !== ids.length) fail('DUPLICATE_ID');
}
function index(rows) {
  unique(rows.map(row => row.id));
  return new Map(rows.map(row => [row.id, row]));
}
function budget(value, maximum) {
  if (value === undefined) return maximum;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail('INVALID_COMPUTATION_BUDGET');
  return value;
}
function countWithin(count, minimum, maximum) {
  if (!Number.isSafeInteger(count) || count < minimum || count > maximum) fail('MODEL_SIZE_LIMIT');
}

// Shared children are valid references. Node definitions must have unique IDs.
// Every supplied node must be reachable from one of the declared roots.
function dag(nodes, roots, childIds) {
  const byId = index(nodes);
  const children = new Map(nodes.map(node => [node.id, childIds(node)]));
  const active = new Set(), complete = new Set(), order = [];
  function visit(id) {
    if (!byId.has(id)) fail('UNRESOLVED_NODE_REFERENCE');
    if (active.has(id)) fail('MODEL_CYCLE');
    if (complete.has(id)) return;
    active.add(id);
    for (const child of children.get(id)) visit(child);
    active.delete(id);
    complete.add(id);
    order.push(byId.get(id));
  }
  for (const root of new Set(roots)) visit(root);
  if (complete.size !== nodes.length) fail('UNREACHABLE_NODE');
  return {order, byId};
}

function bitCount(mask) {
  let count = 0;
  while (mask) { mask &= mask - 1; count++; }
  return count;
}
function orderedMinimalMasks(masks) {
  return [...masks].sort((a, b) => bitCount(a) - bitCount(b) || a - b);
}
function hasKnownSubset(masks, mask) {
  return masks.some(subset => (subset & mask) === subset);
}
function selectedIds(ids, mask) {
  return ids.filter((_, i) => (mask & (1 << i)) !== 0);
}

function propositionalEntailment({variables, nodes, assumptions, conclusion, max_assignments}) {
  countWithin(variables.length, 1, 12);
  countWithin(nodes.length, 1, 127);
  unique(variables);
  unique(assumptions);
  const variableBits = new Map(variables.map((id, i) => [id, i]));
  const {order} = dag(nodes, [...assumptions, conclusion], node => {
    if (node.op === 'VAR') {
      if (node.variable === undefined || node.args !== undefined) fail('VARIABLE_NODE_SHAPE');
      if (!variableBits.has(node.variable)) fail('UNDECLARED_VARIABLE');
      return [];
    }
    if (node.variable !== undefined || !Array.isArray(node.args)) fail('OPERATOR_NODE_SHAPE');
    if (node.op === 'NOT' && node.args.length !== 1) fail('NOT_REQUIRES_ONE_ARGUMENT');
    if (node.op === 'IMPLIES' && node.args.length !== 2) fail('IMPLIES_REQUIRES_TWO_ARGUMENTS');
    if (!['NOT', 'AND', 'OR', 'IMPLIES'].includes(node.op)) fail('UNKNOWN_BOOLEAN_OPERATOR');
    countWithin(node.args.length, 1, 8);
    return node.args;
  });
  const total = 2 ** variables.length;
  const limit = budget(max_assignments, 4096);
  let examined = 0, satisfying = 0;
  const assignment = mask => variables.map((variable_id, i) => ({variable_id, value: (mask & (1 << i)) !== 0}));
  for (let mask = 0; mask < total && examined < limit; mask++) {
    const values = new Map();
    for (const node of order) {
      let value;
      if (node.op === 'VAR') value = (mask & (1 << variableBits.get(node.variable))) !== 0;
      else if (node.op === 'NOT') value = !values.get(node.args[0]);
      else if (node.op === 'AND') value = node.args.every(id => values.get(id));
      else if (node.op === 'OR') value = node.args.some(id => values.get(id));
      else value = !values.get(node.args[0]) || values.get(node.args[1]);
      values.set(node.id, value);
    }
    examined++;
    if (!assumptions.every(id => values.get(id))) continue;
    satisfying++;
    if (!values.get(conclusion)) {
      return {
        status: 'COUNTERMODEL_FOUND', entails: false,
        assumptions_satisfiable: true, vacuous: false,
        assignments_examined: examined, total_assignments: total,
        enumeration_complete: examined === total,
        satisfying_assumption_assignments_examined: satisfying,
        countermodel: {assignments: assignment(mask), assumption_root_ids: [...assumptions], conclusion_root_id: conclusion, conclusion_value: false},
        model_scope: 'DECLARED_FINITE_BOOLEAN_VARIABLES_ONLY', ...boundary
      };
    }
  }
  const complete = examined === total;
  return {
    status: !complete ? 'UNKNOWN_RESOURCE_LIMIT' : satisfying ? 'FINITE_ENTAILMENT' : 'VACUOUS_FINITE_ENTAILMENT',
    entails: complete ? true : null,
    assumptions_satisfiable: satisfying ? true : complete ? false : null,
    vacuous: satisfying ? false : complete ? true : null,
    assignments_examined: examined, total_assignments: total,
    enumeration_complete: complete,
    satisfying_assumption_assignments_examined: satisfying,
    countermodel: null,
    model_scope: 'DECLARED_FINITE_BOOLEAN_VARIABLES_ONLY', ...boundary
  };
}

function obligation(checked, violations, unknowns) {
  return {status: violations.length ? 'FAIL' : unknowns.length ? 'UNKNOWN' : 'PASS', checked_count: checked, violations, unknowns};
}
function finiteInvariant({invariant_label, states, initial_states, transitions, forbidden_states, max_states_examined}) {
  countWithin(states.length, 1, 256);
  countWithin(transitions.length, 0, 512);
  const byId = index(states);
  unique(initial_states);
  unique(forbidden_states);
  unique(transitions.map(edge => edge.id));
  for (const id of [...initial_states, ...forbidden_states]) {
    if (!byId.has(id)) fail('UNRESOLVED_STATE_REFERENCE');
  }
  for (const edge of transitions) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) fail('UNRESOLVED_STATE_REFERENCE');
  }
  const forbidden = new Set(forbidden_states);
  const predicate = new Map(states.map(state => [state.id, forbidden.has(state.id) ? false : state.invariant_holds]));
  const base = obligation(
    initial_states.length,
    initial_states.filter(id => predicate.get(id) === false),
    initial_states.filter(id => predicate.get(id) === null)
  );
  const stepViolations = [], stepUnknowns = [];
  for (const edge of transitions) {
    const from = predicate.get(edge.from), to = predicate.get(edge.to);
    // Three-valued implication: false antecedent or true consequent suffices.
    const implication = from === false || to === true ? true : from === true && to === false ? false : null;
    const witness = {transition_id: edge.id, from: edge.from, to: edge.to, from_predicate_value: from, to_predicate_value: to};
    if (implication === false) stepViolations.push(witness);
    else if (implication === null) stepUnknowns.push(witness);
  }
  const step = obligation(transitions.length, stepViolations, stepUnknowns);
  const outgoing = new Map(states.map(state => [state.id, []]));
  for (const edge of transitions) outgoing.get(edge.from).push(edge);
  const queue = [...initial_states], parents = new Map(initial_states.map(id => [id, null]));
  const examined = [], unknownStates = [];
  const limit = budget(max_states_examined, 256);
  let head = 0, counterexample = null;
  while (head < queue.length && examined.length < limit) {
    const id = queue[head++];
    examined.push(id);
    if (predicate.get(id) === false) {
      const statePath = [], edgePath = [];
      let current = id;
      while (true) {
        statePath.push(current);
        const predecessor = parents.get(current);
        if (predecessor === null) break;
        edgePath.push(predecessor.id);
        current = predecessor.from;
      }
      counterexample = {
        state_path: statePath.reverse(), transition_ids: edgePath.reverse(), violating_state: id,
        violations: [
          ...(forbidden.has(id) ? ['FORBIDDEN_STATE'] : []),
          ...(byId.get(id).invariant_holds === false ? ['SUPPLIED_INVARIANT_FALSE'] : [])
        ]
      };
      break;
    }
    if (predicate.get(id) === null) unknownStates.push(id);
    for (const edge of outgoing.get(id)) {
      if (!parents.has(edge.to)) { parents.set(edge.to, edge); queue.push(edge.to); }
    }
  }
  const complete = counterexample === null && head === queue.length;
  const status = counterexample ? 'COUNTEREXAMPLE_FOUND' : !complete ? 'UNKNOWN_RESOURCE_LIMIT' : unknownStates.length ? 'UNKNOWN_INVARIANT_LABELS' : 'FINITE_GRAPH_VERIFIED';
  return {
    status,
    invariant_label,
    predicate_basis: 'NOT_FORBIDDEN_AND_SUPPLIED_INVARIANT_HOLDS',
    reachable_predicate_holds: counterexample ? false : complete && !unknownStates.length ? true : null,
    reachability_complete: complete,
    state_ids_examined: examined, states_examined: examined.length,
    states_discovered: parents.size, supplied_state_count: states.length,
    frontier_state_ids: queue.slice(head), unknown_reachable_state_ids: unknownStates,
    counterexample,
    induction_obligations: {
      scope: 'ALL_SUPPLIED_INITIAL_STATES_AND_TRANSITIONS',
      base, step,
      finite_induction_passed: base.status === 'PASS' && step.status === 'PASS',
      checked_separately_from_bfs_budget: true
    },
    model_scope: 'SUPPLIED_FINITE_GRAPH_AND_CALLER_LABELS_ONLY',
    transition_relation_is_caller_supplied: true,
    model_completeness_proven: false, ...boundary
  };
}

function abductiveCover({effects_semantics, hypotheses, observed_effects, contradicted_effects, max_subsets}) {
  if (effects_semantics !== 'ALL_LISTED_EFFECTS_MANDATORY') fail('MANDATORY_EFFECT_SEMANTICS_REQUIRED');
  countWithin(hypotheses.length, 0, 12);
  index(hypotheses);
  unique(observed_effects);
  unique(contradicted_effects);
  const contradicted = new Set(contradicted_effects);
  if (observed_effects.some(id => contradicted.has(id))) fail('OBSERVED_CONTRADICTED_EFFECT_CONFLICT');
  const eligible = [], excluded = [];
  for (const hypothesis of hypotheses) {
    unique(hypothesis.effects);
    const conflicts = hypothesis.effects.filter(id => contradicted.has(id));
    if (conflicts.length) excluded.push({hypothesis_id: hypothesis.id, contradicted_effects: conflicts});
    else eligible.push(hypothesis);
  }
  const total = 2 ** eligible.length, limit = budget(max_subsets, 4096), minimal = [];
  let examined = 0;
  // Every proper subset has a smaller numeric mask. Thus each accepted result
  // is inclusion-minimal even if a later resource limit stops enumeration.
  for (let mask = 0; mask < total && examined < limit; mask++) {
    examined++;
    if (hasKnownSubset(minimal, mask)) continue;
    const effects = new Set();
    for (let i = 0; i < eligible.length; i++) {
      if (mask & (1 << i)) for (const id of eligible[i].effects) effects.add(id);
    }
    if (observed_effects.every(id => effects.has(id))) minimal.push(mask);
  }
  const complete = examined === total;
  const explanations = orderedMinimalMasks(minimal).map(mask => selectedIds(eligible.map(h => h.id), mask));
  return {
    status: !complete ? 'UNKNOWN_RESOURCE_LIMIT' : explanations.length ? 'MINIMAL_EXPLANATIONS_FOUND' : 'NO_EXPLANATION_IN_SUPPLIED_MODEL',
    enumeration_complete: complete,
    subsets_examined: examined, total_subsets: total,
    eligible_hypothesis_ids: eligible.map(h => h.id), excluded_hypotheses: excluded,
    effects_semantics,
    observed_effects: [...observed_effects], contradicted_effects: [...contradicted_effects],
    minimal_explanations: explanations,
    minimality: 'SET_INCLUSION',
    minimum_cardinality: complete && explanations.length ? explanations[0].length : null,
    model_scope: 'SUPPLIED_FINITE_SET_COVER_ONLY',
    probability_computed: false, causality_established: false, ...boundary
  };
}

function minimalCutSets({root, nodes, max_assignments}) {
  countWithin(nodes.length, 1, 63);
  const {order} = dag(nodes, [root], node => {
    if (node.kind === 'LEAF') {
      if (node.children !== undefined) fail('LEAF_NODE_SHAPE');
      return [];
    }
    if (!['AND', 'OR'].includes(node.kind) || !Array.isArray(node.children)) fail('GATE_NODE_SHAPE');
    countWithin(node.children.length, 1, 8);
    unique(node.children);
    return node.children;
  });
  const leaves = nodes.filter(node => node.kind === 'LEAF').map(node => node.id);
  if (leaves.length < 1 || leaves.length > 12) fail('UNIQUE_LEAF_LIMIT');
  const leafBits = new Map(leaves.map((id, i) => [id, i]));
  const total = 2 ** leaves.length, limit = budget(max_assignments, 4096), minimal = [];
  let examined = 0;
  for (let mask = 0; mask < total && examined < limit; mask++) {
    examined++;
    if (hasKnownSubset(minimal, mask)) continue;
    const values = new Map();
    for (const node of order) {
      const value = node.kind === 'LEAF' ? (mask & (1 << leafBits.get(node.id))) !== 0
        : node.kind === 'AND' ? node.children.every(id => values.get(id))
        : node.children.some(id => values.get(id));
      values.set(node.id, value);
    }
    if (values.get(root)) minimal.push(mask);
  }
  const complete = examined === total;
  return {
    status: complete ? 'MINIMAL_CUT_SETS_COMPLETE' : 'UNKNOWN_RESOURCE_LIMIT',
    root, leaf_ids: leaves, unique_leaf_count: leaves.length,
    assignments_examined: examined, total_assignments: total,
    enumeration_complete: complete,
    minimal_cut_sets: orderedMinimalMasks(minimal).map(mask => selectedIds(leaves, mask)),
    minimality: 'SET_INCLUSION',
    model_scope: 'SUPPLIED_MONOTONE_AND_OR_FAULT_STRUCTURE_ONLY',
    probability_computed: false, independence_assumed: false,
    observed_failure_inferred: false, ...boundary
  };
}

export const atomicFunctions = {
  propositional_entailment: propositionalEntailment,
  finite_invariant: finiteInvariant,
  abductive_cover: abductiveCover,
  minimal_cut_sets: minimalCutSets
};

export const atomicDescriptors = [
  ['propositional_entailment', 'Finite propositional entailment', 'COMPUTATION', 'Truth-table entailment for at most 12 declared Boolean variables and a 127-node expression DAG with explicit assumptions. Reports countermodels, vacuous entailment, or unknown on budget exhaustion; no factual truth or unbounded theorem proving.'],
  ['finite_invariant', 'Finite reachability and induction obligations', 'COMPUTATION', 'BFS over at most 256 supplied states and 512 transitions, with forbidden states and caller-supplied true/false/unknown invariant labels. Checks base and step obligations separately. No unbounded induction, inferred state labels, or completeness beyond the supplied graph.'],
  ['abductive_cover', 'Finite set-cover abduction', 'COMPUTATION', 'Enumerate inclusion-minimal explanations among at most 12 supplied hypotheses whose listed effects are explicitly declared mandatory, covering observed effects and excluding contradicted effects. Set-cover explanations are not causal proof, probability, or inferred hypotheses. Exhaustion remains unknown.'],
  ['minimal_cut_sets', 'Monotone fault-tree minimal cut sets', 'COMPUTATION', 'Enumerate inclusion-minimal leaf sets for a supplied acyclic monotone AND/OR fault structure with at most 63 nodes and 12 unique leaves. Shared leaves retain one identity. No probabilities, independence assumption, observed-failure claim, or non-monotone gates.']
];
