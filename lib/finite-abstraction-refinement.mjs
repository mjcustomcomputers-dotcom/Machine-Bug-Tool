// Additive local CEGAR adapter over the existing finite_invariant evaluator.
// All states, labels, transitions, source declarations and completeness claims
// are supplied by the caller. Hashes identify those inputs; they authenticate
// neither the sources nor the coverage of an actual external system.
import {createHash} from 'node:crypto';
import {validate} from './schema.mjs';
import {atomicFunctions, atomicSchemas} from './atomic-models.mjs';

const VERSION = 'FINITE_ABSTRACTION_REFINEMENT_1';
const id = {type: 'string', minLength: 1, maxLength: 200};
const array = (items, minItems, maxItems) => ({type: 'array', items, minItems, maxItems});
const object = properties => ({type: 'object', properties, required: Object.keys(properties), additionalProperties: false});
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fail = code => { throw new Error(code); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const boundary = Object.freeze({
  source_authentication: false,
  factual_truth_established: false,
  model_completeness_proven: false,
  real_world_completeness_proven: false,
  target_vulnerability_proven: false,
  unbounded_proof: false,
  canonical_promotion: false,
  external_action_authorized: false,
  native_evaluator_inventory_changed: false
});

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export const finiteAbstractionRefinementSchema = freeze({
  ...object({
    invariant_label: id,
    sources: array(object({source_id: id, namespace: id, native_id: id, revision: id,
      content_sha256: {type: 'string', minLength: 64, maxLength: 64}}), 1, 16),
    states: array(object({id, invariant_holds: {type: ['boolean', 'null']}}), 1, 256),
    initial_states: array(id, 0, 256),
    transitions: array(object({id, from: id, to: id}), 0, 512),
    forbidden_states: array(id, 0, 256),
    abstraction: array(object({concrete_state: id, abstract_state: id}), 1, 256),
    completeness: object({states_complete: {type: 'boolean'}, initial_states_complete: {type: 'boolean'}, transitions_complete: {type: 'boolean'}}),
    max_refinements: {type: 'integer', minimum: 0, maximum: 255},
    max_states_examined: {type: 'integer', minimum: 1, maximum: 256}
  }),
  required: ['invariant_label', 'sources', 'states', 'initial_states', 'transitions', 'forbidden_states', 'abstraction', 'completeness']
});

// The shared schema validator intentionally has a small surface. This adapter
// also rejects sparse arrays, getters, non-JSON prototypes and cycles before
// traversal so that skipped array holes cannot become missing model records.
function denseJson(value, ancestors = new Set(), depth = 0) {
  if (depth > 16) fail('MODEL_JSON_DEPTH_LIMIT');
  if (value === null || typeof value !== 'object') return;
  if (ancestors.has(value)) fail('MODEL_JSON_CYCLE');
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  if (Array.isArray(value)) {
    if (keys.length !== value.length + 1) fail('MODEL_ARRAY_NOT_DENSE_JSON');
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !descriptor.enumerable || !own(descriptor, 'value')) fail('MODEL_ARRAY_NOT_DENSE_JSON');
      denseJson(descriptor.value, ancestors, depth + 1);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail('MODEL_OBJECT_NOT_PLAIN_JSON');
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor.enumerable || !own(descriptor, 'value')) fail('MODEL_OBJECT_NOT_PLAIN_JSON');
      denseJson(descriptor.value, ancestors, depth + 1);
    }
  }
  ancestors.delete(value);
}

function unique(values, label) {
  if (new Set(values).size !== values.length) fail('DUPLICATE_' + label);
}

function normalizedInput(input) {
  denseJson(input);
  validate(input, finiteAbstractionRefinementSchema);
  unique(input.states.map(state => state.id), 'STATE_ID');
  unique(input.transitions.map(edge => edge.id), 'TRANSITION_ID');
  unique(input.initial_states, 'INITIAL_STATE');
  unique(input.forbidden_states, 'FORBIDDEN_STATE');
  unique(input.sources.map(source => source.source_id), 'SOURCE_ID');
  unique(input.sources.map(source => JSON.stringify([source.namespace, source.native_id, source.revision])), 'SOURCE_VERSION');
  unique(input.abstraction.map(row => row.concrete_state), 'ABSTRACTION_MAPPING');
  const stateIds = new Set(input.states.map(state => state.id));
  for (const stateId of [...input.initial_states, ...input.forbidden_states]) {
    if (!stateIds.has(stateId)) fail('UNRESOLVED_STATE_REFERENCE');
  }
  for (const edge of input.transitions) {
    if (!stateIds.has(edge.from) || !stateIds.has(edge.to)) fail('UNRESOLVED_STATE_REFERENCE');
  }
  for (const row of input.abstraction) {
    if (!stateIds.has(row.concrete_state)) fail('UNKNOWN_CONCRETE_STATE');
  }
  if (input.abstraction.length !== input.states.length) fail('INCOMPLETE_ABSTRACTION_MAPPING');
  for (const source of input.sources) {
    if (!/^[0-9a-f]{64}$/.test(source.content_sha256)) fail('INVALID_SOURCE_CONTENT_SHA256');
  }
  return {
    invariant_label: input.invariant_label,
    sources: input.sources.map(source => ({source_id: source.source_id, namespace: source.namespace,
      native_id: source.native_id, revision: source.revision, content_sha256: source.content_sha256})).sort((a, b) => order(a.source_id, b.source_id)),
    states: input.states.map(state => ({id: state.id, invariant_holds: state.invariant_holds})).sort((a, b) => order(a.id, b.id)),
    initial_states: [...input.initial_states].sort(order),
    transitions: input.transitions.map(edge => ({id: edge.id, from: edge.from, to: edge.to})).sort((a, b) => order(a.from, b.from) || order(a.to, b.to) || order(a.id, b.id)),
    forbidden_states: [...input.forbidden_states].sort(order),
    abstraction: input.abstraction.map(row => ({concrete_state: row.concrete_state, abstract_state: row.abstract_state})).sort((a, b) => order(a.concrete_state, b.concrete_state)),
    completeness: {states_complete: input.completeness.states_complete,
      initial_states_complete: input.completeness.initial_states_complete,
      transitions_complete: input.completeness.transitions_complete},
    max_refinements: input.max_refinements ?? 32,
    max_states_examined: input.max_states_examined ?? 256
  };
}

function partitionRows(partition) {
  return [...partition].map(([abstract_state, members]) => ({abstract_state, concrete_states: [...members].sort(order)}))
    .sort((a, b) => order(a.abstract_state, b.abstract_state));
}

function abstractGraph(model, partition, predicate, forbidden) {
  const rows = partitionRows(partition);
  const stateToAbstract = new Map(rows.flatMap(row => row.concrete_states.map(member => [member, row.abstract_state])));
  const states = rows.map(row => {
    const values = row.concrete_states.map(member => predicate.get(member));
    // Unsafe is the OR of represented unsafe states. True safety requires all
    // represented states to be true; an unknown label is never coerced true.
    return {id: row.abstract_state, invariant_holds: values.includes(false) ? false : values.includes(null) ? null : true};
  });
  const pairs = new Map();
  for (const edge of model.transitions) {
    const from = stateToAbstract.get(edge.from), to = stateToAbstract.get(edge.to);
    const key = JSON.stringify([from, to]);
    if (!pairs.has(key)) pairs.set(key, {from, to, concrete_transition_ids: []});
    pairs.get(key).concrete_transition_ids.push(edge.id);
  }
  const witnesses = [...pairs.values()].sort((a, b) => order(a.from, b.from) || order(a.to, b.to))
    .map((edge, index) => ({id: 'AT:' + String(index).padStart(4, '0'), ...edge,
      concrete_transition_ids: edge.concrete_transition_ids.sort(order)}));
  const input = {
    invariant_label: model.invariant_label,
    states,
    initial_states: [...new Set(model.initial_states.map(state => stateToAbstract.get(state)))].sort(order),
    transitions: witnesses.map(edge => ({id: edge.id, from: edge.from, to: edge.to})),
    forbidden_states: rows.filter(row => row.concrete_states.some(state => forbidden.has(state))).map(row => row.abstract_state),
    max_states_examined: model.max_states_examined
  };
  validate(input, atomicSchemas.finite_invariant);
  return {input, rows, stateToAbstract, witnesses};
}

function concretize(model, graph, path, predicate, forbidden) {
  const outgoing = new Map(model.states.map(state => [state.id, []]));
  for (const edge of model.transitions) outgoing.get(edge.from).push(edge);
  let frontier = model.initial_states.filter(state => graph.stateToAbstract.get(state) === path[0]);
  const frontiers = [{abstract_state: path[0], concrete_state_ids: [...frontier]}];
  const parents = [new Map(frontier.map(state => [state, null]))];
  for (let i = 1; i < path.length; i++) {
    const nextParents = new Map();
    for (const state of frontier) {
      for (const edge of outgoing.get(state)) {
        if (graph.stateToAbstract.get(edge.to) === path[i] && !nextParents.has(edge.to)) nextParents.set(edge.to, edge);
      }
    }
    const next = [...nextParents.keys()].sort(order);
    frontiers.push({abstract_state: path[i], concrete_state_ids: next});
    if (!next.length) {
      return {status: 'SPURIOUS_TRANSITION', abstract_state_path: [...path], frontiers,
        first_impossible_prefix: path.slice(0, i + 1), failure_index: i,
        split_abstract_state: path[i - 1], split_reachable_state_ids: [...frontier], counterexample: null};
    }
    parents.push(nextParents);
    frontier = next;
  }
  const unsafe = frontier.filter(state => predicate.get(state) === false);
  if (!unsafe.length) {
    return {status: 'SPURIOUS_VIOLATION_LABEL', abstract_state_path: [...path], frontiers,
      first_impossible_prefix: [...path], failure_index: path.length - 1,
      split_abstract_state: path.at(-1), split_reachable_state_ids: [...frontier], counterexample: null};
  }
  let current = unsafe[0];
  const statePath = [current], transitions = [];
  for (let i = parents.length - 1; i > 0; i--) {
    const edge = parents[i].get(current);
    transitions.push(edge.id);
    current = edge.from;
    statePath.push(current);
  }
  const violatingState = unsafe[0];
  const state = model.states.find(row => row.id === violatingState);
  return {status: 'REAL_CONCRETE_COUNTEREXAMPLE', abstract_state_path: [...path], frontiers,
    first_impossible_prefix: null, failure_index: null, split_abstract_state: null,
    split_reachable_state_ids: [], counterexample: {
      state_path: statePath.reverse(), transition_ids: transitions.reverse(), violating_state: violatingState,
      violations: [...(forbidden.has(violatingState) ? ['FORBIDDEN_STATE'] : []),
        ...(state.invariant_holds === false ? ['SUPPLIED_INVARIANT_FALSE'] : [])]
    }};
}

function splitPartition(partition, replay, reservedIds) {
  const original = replay.split_abstract_state;
  const members = partition.get(original);
  const reachable = new Set(replay.split_reachable_state_ids);
  const pieces = [members.filter(state => reachable.has(state)), members.filter(state => !reachable.has(state))];
  if (pieces.some(piece => !piece.length)) fail('INTERNAL_REFINEMENT_DID_NOT_SPLIT');
  const created = pieces.map(piece => {
    const base = 'CEGAR:' + hash({parent: original, members: piece});
    let name = base, suffix = 0;
    while (reservedIds.has(name)) name = base + ':' + (++suffix);
    reservedIds.add(name);
    return {abstract_state: name, concrete_states: piece};
  });
  partition.delete(original);
  for (const row of created) partition.set(row.abstract_state, row.concrete_states);
  return {split_abstract_state: original, reason: replay.status,
    created_states: created.sort((a, b) => order(a.abstract_state, b.abstract_state))};
}

/**
 * Run finite safety CEGAR on an explicitly complete supplied graph.
 * Defaults: at most 32 partition refinements, 256 BFS states per iteration.
 * This function validates its own input and performs no I/O or persistence.
 */
export function runFiniteAbstractionRefinement(input) {
  const model = normalizedInput(input);
  const {max_refinements, max_states_examined, ...semanticModel} = model;
  const partition = new Map();
  for (const row of model.abstraction) {
    if (!partition.has(row.abstract_state)) partition.set(row.abstract_state, []);
    partition.get(row.abstract_state).push(row.concrete_state);
  }
  const reservedIds = new Set(partition.keys());
  const forbidden = new Set(model.forbidden_states);
  const predicate = new Map(model.states.map(state => [state.id, forbidden.has(state.id) ? false : state.invariant_holds]));
  const iterations = [];
  let refinements = 0;
  const finish = (status, extra = {}) => ({
    adapter_version: VERSION,
    status,
    invariant_label: model.invariant_label,
    model_scope: 'DECLARED_FINITE_GRAPH_AND_CALLER_LABELS_ONLY',
    verification_basis: 'GENERATED_CONSERVATIVE_OVERAPPROXIMATION_AND_CONCRETE_PREFIX_REPLAY',
    source_fingerprint: hash(model.sources),
    model_fingerprint: hash(semanticModel),
    input_fingerprint: hash({adapter_version: VERSION, ...model}),
    sources: model.sources,
    completeness_declarations: model.completeness,
    model_completeness_is_caller_declared: true,
    budgets: {max_refinements, max_states_examined_per_iteration: max_states_examined},
    refinements_performed: refinements,
    abstract_search_states_examined: iterations.reduce((sum, row) => sum + row.states_examined, 0),
    iterations,
    final_partition: partitionRows(partition),
    reachable_predicate_holds: null,
    counterexample: null,
    unresolved_dependencies: [],
    ...boundary,
    ...extra
  });
  if (!model.initial_states.length) return finish('UNRESOLVED_NO_INITIAL_STATE', {unresolved_dependencies: ['NONEMPTY_INITIAL_STATE_SET']});
  const incomplete = Object.entries(model.completeness).filter(([, complete]) => !complete).map(([name]) => name);
  if (incomplete.length) return finish('UNRESOLVED_INCOMPLETE_MODEL', {unresolved_dependencies: incomplete});
  while (true) {
    const graph = abstractGraph(model, partition, predicate, forbidden);
    const result = atomicFunctions.finite_invariant(graph.input);
    const iteration = {iteration: iterations.length, partition: graph.rows,
      abstract_transition_witnesses: graph.witnesses,
      abstract_status: result.status, abstract_state_count: graph.input.states.length,
      abstract_predicate_labels: graph.input.states,
      states_examined: result.states_examined, state_ids_examined: result.state_ids_examined,
      frontier_state_ids: result.frontier_state_ids,
      unknown_reachable_state_ids: result.unknown_reachable_state_ids,
      abstract_counterexample: result.counterexample, concrete_replay: null, refinement: null};
    iterations.push(iteration);
    if (result.status === 'FINITE_GRAPH_VERIFIED') return finish('FINITE_SUPPLIED_MODEL_VERIFIED', {reachable_predicate_holds: true});
    if (result.status === 'UNKNOWN_RESOURCE_LIMIT') return finish('UNRESOLVED_STATE_BUDGET', {unresolved_dependencies: ['ABSTRACT_BFS_BUDGET']});
    if (result.status === 'UNKNOWN_INVARIANT_LABELS') return finish('UNRESOLVED_INVARIANT_LABELS', {unresolved_dependencies: ['REACHABLE_ABSTRACT_INVARIANT_LABELS']});
    if (result.status !== 'COUNTEREXAMPLE_FOUND') fail('UNEXPECTED_FINITE_INVARIANT_STATUS');
    const replay = concretize(model, graph, result.counterexample.state_path, predicate, forbidden);
    iteration.concrete_replay = replay;
    if (replay.counterexample) return finish('REAL_MODEL_COUNTEREXAMPLE', {reachable_predicate_holds: false, counterexample: replay.counterexample});
    if (refinements >= max_refinements) return finish('UNRESOLVED_REFINEMENT_BUDGET', {unresolved_dependencies: ['ABSTRACTION_REFINEMENT_BUDGET']});
    iteration.refinement = splitPartition(partition, replay, reservedIds);
    refinements++;
  }
}
