// Runs outside the Site checkout against its actual existing schema validator.
// When integrating, adjust only this validator import to the local lib path.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validate} from '../lib/schema.mjs';
import {atomicSchemas, atomicFunctions, atomicDescriptors} from '../lib/atomic-models.mjs';

function run(method, input) {
  validate(input, atomicSchemas[method]);
  return atomicFunctions[method](input);
}
const v = id => ({id, op: 'VAR', variable: id});
const mandatory = 'ALL_LISTED_EFFECTS_MANDATORY';
const modusPonens = () => ({
  variables: ['P', 'Q'], nodes: [v('P'), v('Q'), {id: 'RULE', op: 'IMPLIES', args: ['P', 'Q']}],
  assumptions: ['P', 'RULE'], conclusion: 'Q'
});
const safeGraph = () => ({
  invariant_label: 'DECLARED_SAFE',
  states: [{id: 'S0', invariant_holds: true}, {id: 'S1', invariant_holds: true}],
  initial_states: ['S0'], transitions: [{id: 'T01', from: 'S0', to: 'S1'}, {id: 'T10', from: 'S1', to: 'S0'}],
  forbidden_states: []
});
const abduction = () => ({
  effects_semantics: mandatory,
  hypotheses: [{id: 'H', effects: ['E']}], observed_effects: ['E'], contradicted_effects: []
});
const orTree = () => ({
  root: 'TOP', nodes: [{id: 'TOP', kind: 'OR', children: ['A', 'B']}, {id: 'A', kind: 'LEAF'}, {id: 'B', kind: 'LEAF'}]
});

test('propositional: complete modus ponens checks all four Boolean assignments', () => {
  const result = run('propositional_entailment', modusPonens());
  assert.equal(result.status, 'FINITE_ENTAILMENT');
  assert.equal(result.entails, true);
  assert.equal(result.assignments_examined, 4);
  assert.equal(result.satisfying_assumption_assignments_examined, 1);
  assert.equal(result.vacuous, false);
  assert.equal(result.factual_truth_established, false);
});

test('propositional: disjunction does not entail conjunction and returns a countermodel', () => {
  const result = run('propositional_entailment', {
    variables: ['P', 'Q'],
    nodes: [v('P'), v('Q'), {id: 'DISJUNCTION', op: 'OR', args: ['P', 'Q']}, {id: 'CONJUNCTION', op: 'AND', args: ['P', 'Q']}],
    assumptions: ['DISJUNCTION'], conclusion: 'CONJUNCTION'
  });
  assert.equal(result.status, 'COUNTERMODEL_FOUND');
  assert.equal(result.entails, false);
  assert.deepEqual(result.countermodel.assignments, [{variable_id: 'P', value: true}, {variable_id: 'Q', value: false}]);
});

test('propositional: inconsistent assumptions explicitly report vacuous entailment', () => {
  const result = run('propositional_entailment', {
    variables: ['P', 'Q'], nodes: [v('P'), v('Q'), {id: 'NOT_P', op: 'NOT', args: ['P']}],
    assumptions: ['P', 'NOT_P'], conclusion: 'Q'
  });
  assert.equal(result.status, 'VACUOUS_FINITE_ENTAILMENT');
  assert.equal(result.entails, true);
  assert.equal(result.assumptions_satisfiable, false);
  assert.equal(result.vacuous, true);
  assert.equal(result.factual_truth_established, false);
});

test('propositional: exhausted budget yields unknown even when examined rows support a tautology', () => {
  const result = run('propositional_entailment', {
    variables: ['P'], nodes: [v('P'), {id: 'SAME_IMPLIES_SAME', op: 'IMPLIES', args: ['P', 'P']}],
    assumptions: [], conclusion: 'SAME_IMPLIES_SAME', max_assignments: 1
  });
  assert.equal(result.status, 'UNKNOWN_RESOURCE_LIMIT');
  assert.equal(result.entails, null);
  assert.equal(result.enumeration_complete, false);
  assert.equal(result.assignments_examined, 1);
});

test('propositional: rejects duplicate definitions, missing variables, cycles, arity, and stray nodes', () => {
  const cases = [
    [{variables: ['P', 'P'], nodes: [v('P')], assumptions: [], conclusion: 'P'}, /DUPLICATE_ID/],
    [{variables: ['P'], nodes: [v('P'), v('P')], assumptions: [], conclusion: 'P'}, /DUPLICATE_ID/],
    [{variables: ['Q'], nodes: [v('P')], assumptions: [], conclusion: 'P'}, /UNDECLARED_VARIABLE/],
    [{variables: ['P'], nodes: [{id: 'N', op: 'NOT', args: ['N']}], assumptions: [], conclusion: 'N'}, /MODEL_CYCLE/],
    [{variables: ['P'], nodes: [v('P'), {id: 'N', op: 'NOT', args: ['P', 'P']}], assumptions: [], conclusion: 'N'}, /NOT_REQUIRES_ONE_ARGUMENT/],
    [{variables: ['P'], nodes: [v('P')], assumptions: [], conclusion: 'MISSING'}, /UNRESOLVED_NODE_REFERENCE/],
    [{variables: ['P', 'Q'], nodes: [v('P'), v('Q')], assumptions: [], conclusion: 'P'}, /UNREACHABLE_NODE/]
  ];
  for (const [input, expected] of cases) assert.throws(() => run('propositional_entailment', input), expected);
});

test('finite invariant: BFS returns a shortest exact-ID reachable counterexample', () => {
  const result = run('finite_invariant', {
    invariant_label: 'SAFE', states: [{id: 'S0', invariant_holds: true}, {id: 'MID', invariant_holds: true}, {id: 'BAD', invariant_holds: false}],
    initial_states: ['S0'], forbidden_states: ['BAD'],
    transitions: [{id: 'LONG_FIRST', from: 'S0', to: 'MID'}, {id: 'DIRECT', from: 'S0', to: 'BAD'}, {id: 'LATER', from: 'MID', to: 'BAD'}]
  });
  assert.equal(result.status, 'COUNTEREXAMPLE_FOUND');
  assert.equal(result.reachable_predicate_holds, false);
  assert.deepEqual(result.counterexample.state_path, ['S0', 'BAD']);
  assert.deepEqual(result.counterexample.transition_ids, ['DIRECT']);
  assert.deepEqual(result.counterexample.violations, ['FORBIDDEN_STATE', 'SUPPLIED_INVARIANT_FALSE']);
});

test('finite invariant: a supplied cyclic graph can satisfy finite base and step obligations', () => {
  const result = run('finite_invariant', safeGraph());
  assert.equal(result.status, 'FINITE_GRAPH_VERIFIED');
  assert.equal(result.reachable_predicate_holds, true);
  assert.equal(result.states_examined, 2);
  assert.equal(result.induction_obligations.base.status, 'PASS');
  assert.equal(result.induction_obligations.step.status, 'PASS');
  assert.equal(result.induction_obligations.finite_induction_passed, true);
  assert.equal(result.unbounded_proof, false);
});

test('finite invariant: unreachable step failure is not misreported as reachable counterexample', () => {
  const result = run('finite_invariant', {
    invariant_label: 'SAFE', states: [{id: 'START', invariant_holds: true}, {id: 'UNREACHABLE_GOOD', invariant_holds: true}, {id: 'UNREACHABLE_BAD', invariant_holds: false}],
    initial_states: ['START'], forbidden_states: [],
    transitions: [{id: 'UNREACHABLE_EDGE', from: 'UNREACHABLE_GOOD', to: 'UNREACHABLE_BAD'}]
  });
  assert.equal(result.status, 'FINITE_GRAPH_VERIFIED');
  assert.equal(result.reachable_predicate_holds, true);
  assert.equal(result.counterexample, null);
  assert.equal(result.induction_obligations.step.status, 'FAIL');
  assert.equal(result.induction_obligations.step.violations[0].transition_id, 'UNREACHABLE_EDGE');
});

test('finite invariant: unknown caller label remains unknown, while a forbidden initial ID is decisive', () => {
  const input = {invariant_label: 'SAFE', states: [{id: 'S', invariant_holds: null}], initial_states: ['S'], transitions: [], forbidden_states: []};
  const result = run('finite_invariant', input);
  assert.equal(result.status, 'UNKNOWN_INVARIANT_LABELS');
  assert.equal(result.reachable_predicate_holds, null);
  assert.equal(result.induction_obligations.base.status, 'UNKNOWN');
  const forbidden = run('finite_invariant', {...input, forbidden_states: ['S']});
  assert.equal(forbidden.status, 'COUNTEREXAMPLE_FOUND');
  assert.deepEqual(forbidden.counterexample.state_path, ['S']);
  assert.deepEqual(forbidden.counterexample.transition_ids, []);
  assert.deepEqual(forbidden.counterexample.violations, ['FORBIDDEN_STATE']);
});

test('finite invariant: limited BFS stays unknown independently of separately checked induction', () => {
  const result = run('finite_invariant', {...safeGraph(), max_states_examined: 1});
  assert.equal(result.status, 'UNKNOWN_RESOURCE_LIMIT');
  assert.equal(result.reachable_predicate_holds, null);
  assert.equal(result.states_examined, 1);
  assert.deepEqual(result.frontier_state_ids, ['S1']);
  assert.equal(result.induction_obligations.finite_induction_passed, true);
  assert.equal(result.induction_obligations.checked_separately_from_bfs_budget, true);
});

test('finite invariant: rejects unresolved state references and duplicate transition IDs', () => {
  const input = safeGraph();
  assert.throws(() => run('finite_invariant', {...input, initial_states: ['MISSING']}), /UNRESOLVED_STATE_REFERENCE/);
  assert.throws(() => run('finite_invariant', {...input, transitions: [{id: 'T', from: 'S0', to: 'MISSING'}]}), /UNRESOLVED_STATE_REFERENCE/);
  assert.throws(() => run('finite_invariant', {...input, transitions: [{id: 'T', from: 'S0', to: 'S1'}, {id: 'T', from: 'S1', to: 'S0'}]}), /DUPLICATE_ID/);
});

test('abduction: preserves inclusion-minimal alternatives of different cardinalities and excludes mandatory conflict', () => {
  const result = run('abductive_cover', {
    effects_semantics: mandatory,
    hypotheses: [{id: 'BOTH', effects: ['A', 'B']}, {id: 'ONLY_A', effects: ['A']}, {id: 'ONLY_B', effects: ['B']}, {id: 'CONFLICT', effects: ['A', 'B', 'X']}],
    observed_effects: ['A', 'B'], contradicted_effects: ['X']
  });
  assert.equal(result.status, 'MINIMAL_EXPLANATIONS_FOUND');
  assert.deepEqual(result.minimal_explanations, [['BOTH'], ['ONLY_A', 'ONLY_B']]);
  assert.equal(result.minimality, 'SET_INCLUSION');
  assert.equal(result.minimum_cardinality, 1);
  assert.deepEqual(result.excluded_hypotheses, [{hypothesis_id: 'CONFLICT', contradicted_effects: ['X']}]);
  assert.equal(result.causality_established, false);
});

test('abduction: distinguishes empty explanation from no explanation in supplied candidates', () => {
  const input = {effects_semantics: mandatory, hypotheses: [], observed_effects: [], contradicted_effects: []};
  const empty = run('abductive_cover', input);
  assert.deepEqual(empty.minimal_explanations, [[]]);
  assert.equal(empty.minimum_cardinality, 0);
  const missing = run('abductive_cover', {...input, observed_effects: ['E']});
  assert.equal(missing.status, 'NO_EXPLANATION_IN_SUPPLIED_MODEL');
  assert.deepEqual(missing.minimal_explanations, []);
  assert.equal(missing.enumeration_complete, true);
});

test('abduction: an exhausted partial search cannot claim that no explanation exists', () => {
  const result = run('abductive_cover', {...abduction(), max_subsets: 1});
  assert.equal(result.status, 'UNKNOWN_RESOURCE_LIMIT');
  assert.equal(result.enumeration_complete, false);
  assert.equal(result.minimum_cardinality, null);
  assert.deepEqual(result.minimal_explanations, []);
});

test('abduction: rejects unasserted mandatory semantics, contradictory observations, and duplicate IDs', () => {
  const input = abduction();
  const {effects_semantics, ...missingSemantics} = input;
  assert.throws(() => run('abductive_cover', missingSemantics), /ARGUMENT_SHAPE_MISMATCH/);
  assert.throws(() => run('abductive_cover', {...input, effects_semantics: 'OPTIONAL'}), /ARGUMENT_ENUM_MISMATCH/);
  assert.throws(() => run('abductive_cover', {...input, contradicted_effects: ['E']}), /OBSERVED_CONTRADICTED_EFFECT_CONFLICT/);
  assert.throws(() => run('abductive_cover', {...input, hypotheses: [{id: 'H', effects: ['E']}, {id: 'H', effects: []}]}), /DUPLICATE_ID/);
  assert.throws(() => run('abductive_cover', {...input, hypotheses: [{id: 'H', effects: ['E', 'E']}]}), /DUPLICATE_ID/);
});

test('minimal cuts: (A OR B) AND A has only cut {A}, retaining shared-leaf identity', () => {
  const result = run('minimal_cut_sets', {
    root: 'TOP', nodes: [{id: 'TOP', kind: 'AND', children: ['ANY', 'A']}, {id: 'ANY', kind: 'OR', children: ['A', 'B']}, {id: 'A', kind: 'LEAF'}, {id: 'B', kind: 'LEAF'}]
  });
  assert.equal(result.status, 'MINIMAL_CUT_SETS_COMPLETE');
  assert.deepEqual(result.minimal_cut_sets, [['A']]);
  assert.equal(result.unique_leaf_count, 2);
  assert.equal(result.probability_computed, false);
  assert.equal(result.independence_assumed, false);
});

test('minimal cuts: shared DAG yields both {A} and {B,C}, not expanded duplicate events', () => {
  const result = run('minimal_cut_sets', {
    root: 'TOP', nodes: [{id: 'TOP', kind: 'AND', children: ['G1', 'G2']}, {id: 'G1', kind: 'OR', children: ['A', 'B']}, {id: 'G2', kind: 'OR', children: ['A', 'C']}, {id: 'A', kind: 'LEAF'}, {id: 'B', kind: 'LEAF'}, {id: 'C', kind: 'LEAF'}]
  });
  assert.deepEqual(result.minimal_cut_sets, [['A'], ['B', 'C']]);
  assert.equal(result.assignments_examined, 8);
  assert.equal(result.observed_failure_inferred, false);
});

test('minimal cuts: resource-limited found cut sets remain an incomplete result', () => {
  const result = run('minimal_cut_sets', {...orTree(), max_assignments: 2});
  assert.equal(result.status, 'UNKNOWN_RESOURCE_LIMIT');
  assert.equal(result.enumeration_complete, false);
  assert.deepEqual(result.minimal_cut_sets, [['A']]);
  assert.equal(result.total_assignments, 4);
});

test('minimal cuts: rejects cycles, missing/unreachable/duplicate nodes, and more than 12 unique leaves', () => {
  const cases = [
    [{root: 'A', nodes: [{id: 'A', kind: 'AND', children: ['A']}]}, /MODEL_CYCLE/],
    [{root: 'TOP', nodes: [{id: 'TOP', kind: 'OR', children: ['MISSING']}]}, /UNRESOLVED_NODE_REFERENCE/],
    [{root: 'A', nodes: [{id: 'A', kind: 'LEAF'}, {id: 'B', kind: 'LEAF'}]}, /UNREACHABLE_NODE/],
    [{root: 'A', nodes: [{id: 'A', kind: 'LEAF'}, {id: 'A', kind: 'LEAF'}]}, /DUPLICATE_ID/]
  ];
  for (const [input, expected] of cases) assert.throws(() => run('minimal_cut_sets', input), expected);
  const leaves = Array.from({length: 13}, (_, i) => ({id: 'L' + i, kind: 'LEAF'}));
  const large = {root: 'TOP', nodes: [{id: 'TOP', kind: 'OR', children: ['G1', 'G2']}, {id: 'G1', kind: 'OR', children: leaves.slice(0, 7).map(n => n.id)}, {id: 'G2', kind: 'OR', children: leaves.slice(7).map(n => n.id)}, ...leaves]};
  assert.throws(() => run('minimal_cut_sets', large), /UNIQUE_LEAF_LIMIT/);
});

test('contract: exact special IDs, deterministic results, immutable inputs, bounded schemas, and no false factual proof', () => {
  const inputs = {
    propositional_entailment: {variables: ['__proto__'], nodes: [{id: 'constructor', op: 'VAR', variable: '__proto__'}], assumptions: ['constructor'], conclusion: 'constructor'},
    finite_invariant: {invariant_label: 'prototype', states: [{id: '__proto__', invariant_holds: true}], initial_states: ['__proto__'], transitions: [], forbidden_states: []},
    abductive_cover: {effects_semantics: mandatory, hypotheses: [{id: '__proto__', effects: ['constructor']}], observed_effects: ['constructor'], contradicted_effects: []},
    minimal_cut_sets: {root: '__proto__', nodes: [{id: '__proto__', kind: 'LEAF'}]}
  };
  function freeze(value) {
    if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
    return value;
  }
  assert.deepEqual(Object.keys(atomicSchemas).sort(), Object.keys(atomicFunctions).sort());
  assert.deepEqual(atomicDescriptors.map(d => d[0]).sort(), Object.keys(atomicFunctions).sort());
  for (const [method, input] of Object.entries(inputs)) {
    const before = JSON.stringify(input);
    const result = run(method, freeze(input));
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual(run(method, input), result);
    for (const flag of ['source_authentication', 'factual_truth_established', 'target_vulnerability_proven', 'unbounded_proof']) assert.equal(result[flag], false);
  }
  assert.deepEqual(run('abductive_cover', inputs.abductive_cover).minimal_explanations, [['__proto__']]);
  assert.deepEqual(run('minimal_cut_sets', inputs.minimal_cut_sets).minimal_cut_sets, [['__proto__']]);
  assert.throws(() => run('propositional_entailment', {...modusPonens(), max_assignments: 4097}), /ARGUMENT_RANGE/);
  assert.throws(() => run('finite_invariant', {...safeGraph(), max_states_examined: 0}), /ARGUMENT_RANGE/);
  assert.throws(() => run('abductive_cover', {...abduction(), max_subsets: 4097}), /ARGUMENT_RANGE/);
  assert.throws(() => run('minimal_cut_sets', {...orTree(), max_assignments: 0}), /ARGUMENT_RANGE/);
});
