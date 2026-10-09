import test from 'node:test';
import assert from 'node:assert/strict';
import {finiteAbstractionRefinementSchema, runFiniteAbstractionRefinement as run} from '../lib/finite-abstraction-refinement.mjs';

const fixture = () => ({
  invariant_label: 'NOT_FORBIDDEN',
  sources: [{source_id: 'fixture:model', namespace: 'SYNTHETIC', native_id: 'cegar-four-states', revision: '1', content_sha256: 'a'.repeat(64)}],
  states: [{id: 'S', invariant_holds: true}, {id: 'A', invariant_holds: true},
    {id: 'B', invariant_holds: true}, {id: 'F', invariant_holds: false}],
  initial_states: ['S'],
  transitions: [{id: 'SA', from: 'S', to: 'A'}, {id: 'BF', from: 'B', to: 'F'}],
  forbidden_states: ['F'],
  abstraction: [{concrete_state: 'S', abstract_state: 'S'}, {concrete_state: 'A', abstract_state: 'Q'},
    {concrete_state: 'B', abstract_state: 'Q'}, {concrete_state: 'F', abstract_state: 'F'}],
  completeness: {states_complete: true, initial_states_complete: true, transitions_complete: true}
});

test('CEGAR replays the spurious S,Q,F path and splits its failed concrete prefix', () => {
  const result = run(fixture());
  assert.equal(result.status, 'FINITE_SUPPLIED_MODEL_VERIFIED');
  assert.equal(result.reachable_predicate_holds, true);
  assert.equal(result.refinements_performed, 1);
  assert.deepEqual(result.iterations[0].abstract_counterexample.state_path, ['S', 'Q', 'F']);
  assert.equal(result.iterations[0].concrete_replay.status, 'SPURIOUS_TRANSITION');
  assert.deepEqual(result.iterations[0].concrete_replay.frontiers.map(row => row.concrete_state_ids), [['S'], ['A'], []]);
  assert.equal(result.iterations[0].refinement.split_abstract_state, 'Q');
  assert.deepEqual(result.iterations[0].refinement.created_states.flatMap(row => row.concrete_states).sort(), ['A', 'B']);
  assert.equal(result.counterexample, null);
});

test('CEGAR returns the exact concrete S,A,F witness after adding A->F', () => {
  const input = fixture();
  input.transitions.push({id: 'AF', from: 'A', to: 'F'});
  const result = run(input);
  assert.equal(result.status, 'REAL_MODEL_COUNTEREXAMPLE');
  assert.equal(result.refinements_performed, 0);
  assert.deepEqual(result.counterexample.state_path, ['S', 'A', 'F']);
  assert.deepEqual(result.counterexample.transition_ids, ['SA', 'AF']);
  assert.deepEqual(result.counterexample.violations, ['FORBIDDEN_STATE', 'SUPPLIED_INVARIANT_FALSE']);
});

test('an initial state merged with an unreachable forbidden state is refined by concrete labels', () => {
  const input = fixture();
  input.abstraction = input.states.map(state => ({concrete_state: state.id, abstract_state: 'ALL'}));
  const result = run(input);
  assert.equal(result.status, 'FINITE_SUPPLIED_MODEL_VERIFIED');
  assert.equal(result.iterations[0].abstract_predicate_labels[0].invariant_holds, false);
  assert.deepEqual(result.iterations[0].abstract_counterexample.state_path, ['ALL']);
  assert.equal(result.iterations[0].concrete_replay.status, 'SPURIOUS_VIOLATION_LABEL');
  assert.deepEqual(result.iterations[0].concrete_replay.frontiers[0].concrete_state_ids, ['S']);
  assert.ok(result.refinements_performed >= 1);
});

test('an actually forbidden initial state yields a zero-edge concrete witness', () => {
  const input = fixture();
  input.initial_states = ['S', 'F'];
  input.abstraction = input.states.map(state => ({concrete_state: state.id, abstract_state: 'ALL'}));
  const result = run(input);
  assert.equal(result.status, 'REAL_MODEL_COUNTEREXAMPLE');
  assert.deepEqual(result.counterexample.state_path, ['F']);
  assert.deepEqual(result.counterexample.transition_ids, []);
});

test('unknown labels remain unknown, including mixed true/unknown abstract groups', () => {
  const input = fixture();
  input.states.find(state => state.id === 'A').invariant_holds = null;
  const result = run(input);
  assert.equal(result.status, 'UNRESOLVED_INVARIANT_LABELS');
  assert.equal(result.reachable_predicate_holds, null);
  assert.equal(result.iterations[0].abstract_predicate_labels.find(state => state.id === 'Q').invariant_holds, null);
});

test('unknown labels never hide a false invariant or an explicit forbidden ID', () => {
  const input = fixture();
  input.states.forEach(state => { state.invariant_holds = null; });
  input.initial_states = ['F'];
  const result = run(input);
  assert.equal(result.status, 'REAL_MODEL_COUNTEREXAMPLE');
  assert.deepEqual(result.counterexample.violations, ['FORBIDDEN_STATE']);
});

test('self-loops and unreachable concrete violations terminate without invented edges', () => {
  const input = fixture();
  input.transitions.push({id: 'AA', from: 'A', to: 'A'}, {id: 'BB', from: 'B', to: 'B'}, {id: 'FF', from: 'F', to: 'F'});
  const result = run(input);
  assert.equal(result.status, 'FINITE_SUPPLIED_MODEL_VERIFIED');
  assert.equal(result.counterexample, null);
  assert.ok(result.iterations.length <= input.states.length);
});

test('missing initial states are unresolved instead of a vacuous safety result', () => {
  const input = fixture();
  input.initial_states = [];
  const result = run(input);
  assert.equal(result.status, 'UNRESOLVED_NO_INITIAL_STATE');
  assert.equal(result.reachable_predicate_holds, null);
  assert.deepEqual(result.iterations, []);
});

test('every completeness declaration is required, and any false declaration stays unresolved', () => {
  for (const key of ['states_complete', 'initial_states_complete', 'transitions_complete']) {
    const input = fixture();
    input.completeness[key] = false;
    const result = run(input);
    assert.equal(result.status, 'UNRESOLVED_INCOMPLETE_MODEL');
    assert.deepEqual(result.unresolved_dependencies, [key]);
    assert.equal(result.reachable_predicate_holds, null);
  }
  const input = fixture();
  delete input.completeness.transitions_complete;
  assert.throws(() => run(input), /ARGUMENT_SHAPE_MISMATCH/);
});

test('state and refinement budgets retain unresolved witnesses deterministically', () => {
  const refinement = run({...fixture(), max_refinements: 0});
  assert.equal(refinement.status, 'UNRESOLVED_REFINEMENT_BUDGET');
  assert.equal(refinement.reachable_predicate_holds, null);
  assert.equal(refinement.refinements_performed, 0);
  assert.equal(refinement.iterations[0].concrete_replay.status, 'SPURIOUS_TRANSITION');
  const states = run({...fixture(), max_states_examined: 1});
  assert.equal(states.status, 'UNRESOLVED_STATE_BUDGET');
  assert.deepEqual(states.iterations[0].frontier_state_ids, ['Q']);
  assert.equal(states.reachable_predicate_holds, null);
  assert.throws(() => run({...fixture(), max_refinements: -1}), /ARGUMENT_RANGE/);
  assert.throws(() => run({...fixture(), max_refinements: 0.5}), /ARGUMENT_TYPE_MISMATCH/);
  assert.throws(() => run({...fixture(), max_states_examined: 0}), /ARGUMENT_RANGE/);
});

test('a total abstraction and exact string-typed unique IDs are enforced', () => {
  const missing = fixture();
  missing.abstraction.pop();
  assert.throws(() => run(missing), /INCOMPLETE_ABSTRACTION_MAPPING/);
  const unmapped = fixture();
  unmapped.abstraction[0].concrete_state = 'MISSING';
  assert.throws(() => run(unmapped), /UNKNOWN_CONCRETE_STATE/);
  const duplicate = fixture();
  duplicate.abstraction[0] = {...duplicate.abstraction[1]};
  assert.throws(() => run(duplicate), /DUPLICATE_ABSTRACTION_MAPPING/);
  const idType = fixture();
  idType.states[0].id = 1;
  assert.throws(() => run(idType), /ARGUMENT_TYPE_MISMATCH/);
  const badEdge = fixture();
  badEdge.transitions[0].to = 'MISSING';
  assert.throws(() => run(badEdge), /UNRESOLVED_STATE_REFERENCE/);
  for (const field of ['states', 'transitions', 'initial_states', 'forbidden_states', 'sources']) {
    const input = fixture();
    input[field].push(structuredClone(input[field][0]));
    assert.throws(() => run(input), /DUPLICATE_/);
  }
});

test('strict JSON contract rejects sparse arrays, extra properties, getters and malformed source hashes', () => {
  const sparse = fixture();
  delete sparse.states[0];
  assert.throws(() => run(sparse), /MODEL_ARRAY_NOT_DENSE_JSON/);
  const arrayExtra = fixture();
  arrayExtra.states.extra = true;
  assert.throws(() => run(arrayExtra), /MODEL_ARRAY_NOT_DENSE_JSON/);
  const extra = {...fixture(), inferred_edges: true};
  assert.throws(() => run(extra), /ARGUMENT_SHAPE_MISMATCH/);
  const nested = fixture();
  nested.states[0].source_authenticated = true;
  assert.throws(() => run(nested), /ARGUMENT_SHAPE_MISMATCH/);
  const getter = fixture();
  Object.defineProperty(getter, 'surprise', {enumerable: true, get() { throw new Error('GETTER_RAN'); }});
  assert.throws(() => run(getter), /MODEL_OBJECT_NOT_PLAIN_JSON/);
  const malformed = fixture();
  malformed.sources[0].content_sha256 = 'z'.repeat(64);
  assert.throws(() => run(malformed), /INVALID_SOURCE_CONTENT_SHA256/);
  const duplicateSource = fixture();
  duplicateSource.sources.push({...duplicateSource.sources[0], source_id: 'projection'});
  assert.throws(() => run(duplicateSource), /DUPLICATE_SOURCE_VERSION/);
});

test('input and source ordering never change results, and inputs remain immutable', () => {
  const input = fixture();
  input.sources.push({source_id: 'fixture:second', namespace: 'SYNTHETIC', native_id: 'notes', revision: 'r3', content_sha256: 'b'.repeat(64)});
  const original = structuredClone(input);
  const result = run(input);
  assert.deepEqual(input, original);
  const reversed = Object.fromEntries(Object.entries(structuredClone(input)).reverse());
  for (const field of ['sources', 'states', 'initial_states', 'transitions', 'forbidden_states', 'abstraction']) reversed[field].reverse();
  reversed.sources = reversed.sources.map(source => Object.fromEntries(Object.entries(source).reverse()));
  assert.deepEqual(run(reversed), result);
});

test('source revision changes semantic fingerprints; budgets change run fingerprint separately', () => {
  const input = fixture();
  const first = run(input);
  input.sources[0].revision = '2';
  const changed = run(input);
  assert.notEqual(first.source_fingerprint, changed.source_fingerprint);
  assert.notEqual(first.model_fingerprint, changed.model_fingerprint);
  assert.notEqual(first.input_fingerprint, changed.input_fingerprint);
  const budget = run({...fixture(), max_refinements: 3});
  assert.equal(first.model_fingerprint, budget.model_fingerprint);
  assert.notEqual(first.input_fingerprint, budget.input_fingerprint);
  assert.ok(Object.isFrozen(finiteAbstractionRefinementSchema.properties.states.items));
});

test('special IDs remain exact, and every result preserves the nonpromotion boundaries', () => {
  const input = fixture();
  const rename = new Map([['S', '__proto__'], ['A', 'constructor'], ['B', '1'], ['F', '01']]);
  input.states.forEach(state => { state.id = rename.get(state.id); });
  input.initial_states = input.initial_states.map(state => rename.get(state));
  input.forbidden_states = input.forbidden_states.map(state => rename.get(state));
  input.transitions.forEach(edge => { edge.from = rename.get(edge.from); edge.to = rename.get(edge.to); });
  input.abstraction.forEach(row => { row.concrete_state = rename.get(row.concrete_state); });
  const result = run(input);
  assert.equal(result.status, 'FINITE_SUPPLIED_MODEL_VERIFIED');
  for (const flag of ['source_authentication', 'factual_truth_established', 'model_completeness_proven',
    'real_world_completeness_proven', 'target_vulnerability_proven', 'unbounded_proof',
    'canonical_promotion', 'external_action_authorized', 'native_evaluator_inventory_changed']) assert.equal(result[flag], false);
});

test('all three-state directed graphs and five partitions agree with independent direct reachability', () => {
  const partitions = [['X', 'X', 'X'], ['X', 'X', 'Y'], ['X', 'Y', 'X'], ['X', 'Y', 'Y'], ['X', 'Y', 'Z']];
  const names = ['0', '1', '2'];
  for (let mask = 0; mask < 512; mask++) {
    const transitions = [];
    for (let from = 0; from < 3; from++) for (let to = 0; to < 3; to++) {
      if (mask & (1 << (from * 3 + to))) transitions.push({id: `${from}>${to}`, from: String(from), to: String(to)});
    }
    // Independent closure uses no abstraction and no native evaluator.
    const reachable = new Set(['0']);
    for (let step = 0; step < 3; step++) for (const edge of transitions) if (reachable.has(edge.from)) reachable.add(edge.to);
    for (const partition of partitions) {
      const result = run({...fixture(),
        states: names.map(id => ({id, invariant_holds: id !== '2'})), initial_states: ['0'], transitions,
        forbidden_states: ['2'], abstraction: names.map((id, index) => ({concrete_state: id, abstract_state: partition[index]}))});
      assert.equal(result.status, reachable.has('2') ? 'REAL_MODEL_COUNTEREXAMPLE' : 'FINITE_SUPPLIED_MODEL_VERIFIED', `graph ${mask}, partition ${partition}`);
      assert.ok(result.refinements_performed <= 2);
      if (result.counterexample) {
        const path = result.counterexample.state_path;
        assert.equal(path[0], '0');
        assert.equal(path.at(-1), '2');
        for (let i = 1; i < path.length; i++) assert.ok(transitions.some(edge => edge.from === path[i - 1] && edge.to === path[i] && edge.id === result.counterexample.transition_ids[i - 1]));
      }
    }
  }
});
