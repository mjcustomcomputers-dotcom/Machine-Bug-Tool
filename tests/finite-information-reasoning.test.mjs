import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compareFiniteDecisions, finiteInformationContract, rankObservationPartitions,
  validateFiniteInformationPolicy} from '../lib/finite-information-reasoning.mjs';

const clone = x => structuredClone(x);
const close = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} should equal ${expected} within ${tolerance}`);
const source = {namespace: 'SYNTHETIC', native_id: 'fixture:hidden-bit', owner: 'MPC-LOCAL-TEST', version: '1',
  content_sha256: createHash('sha256').update('finite-information-fixture:hidden-bit:v1').digest('hex')};
const model = () => ({
  model_id: 'fixture:hidden-bit', actor_id: 'actor:chooser', source_refs: [clone(source)],
  assumptions: ['Two equiprobable hidden outcomes.', 'The chooser sees no outcome before acting.',
    'Correct guess pays one utility unit; all costs are explicit supplied utility units.'],
  actions: [{action_id: 'guess0', cost: 0}, {action_id: 'guess1', cost: 0}],
  states: [
    {state_id: 'zero', probability: 0.5, observable_history: ['phase:before-reveal'],
      legal_action_ids: ['guess0', 'guess1'], payoffs: [{action_id: 'guess0', utility: 1}, {action_id: 'guess1', utility: 0}]},
    {state_id: 'one', probability: 0.5, observable_history: ['phase:before-reveal'],
      legal_action_ids: ['guess0', 'guess1'], payoffs: [{action_id: 'guess0', utility: 0}, {action_id: 'guess1', utility: 1}]}
  ]
});
const policy = (p = 0.5) => ['zero', 'one'].map(state_id => ({state_id,
  distribution: [{action_id: 'guess0', probability: p}, {action_id: 'guess1', probability: 1 - p}]}));
const reveal = (cost = 0.1) => ({observation_id: 'reveal', actor_id: 'actor:chooser', access_state: 'AVAILABLE',
  available_before_action: true, cost, source_refs: [clone(source)],
  partition: [{outcome_id: 'seen0', state_ids: ['zero']}, {outcome_id: 'seen1', state_ids: ['one']}]});
const useless = () => ({...reveal(0), observation_id: 'useless', partition: [{outcome_id: 'same', state_ids: ['zero', 'one']}]});

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

test('analytic hidden fair bit: admissible guessing is 0.5, omniscient bound is 1', async () => {
  const x = await compareFiniteDecisions({model: model(), policy: policy()});
  assert.equal(x.optimal_admissible_expected_utility, 0.5);
  assert.equal(x.supplied_policy_expected_utility, 0.5);
  assert.equal(x.supplied_policy_regret, 0);
  assert.equal(x.omniscient_upper_bound, 1);
  assert.equal(x.information_gap, 0.5);
  assert.equal(x.optimal_information_sets.length, 1);
  assert.deepEqual(x.optimal_information_sets[0].optimal_action_ids, ['guess0', 'guess1']);
  assert.equal(x.optimal_information_sets[0].native_evaluation.method, 'harsanyi');
  assert.equal(x.native_method_used, 'harsanyi');
  assert.equal(x.omniscient_bound_is_policy_recommendation, false);
});

test('a policy secretly using the hidden state is rejected before utility evaluation', async () => {
  const p = policy();
  p[0].distribution = [{action_id: 'guess0', probability: 1}, {action_id: 'guess1', probability: 0}];
  p[1].distribution = [{action_id: 'guess0', probability: 0}, {action_id: 'guess1', probability: 1}];
  assert.throws(() => validateFiniteInformationPolicy({model: model(), policy: p}), /HIDDEN_STATE_DEPENDENT_POLICY/);
  await assert.rejects(compareFiniteDecisions({model: model(), policy: p}), /HIDDEN_STATE_DEPENDENT_POLICY/);
});

test('legitimate reveal in ordered observable history permits distinct state policies', async () => {
  const m = model(), p = policy();
  for (let i = 0; i < 2; i++) {
    m.states[i].observable_history.push('reveal:' + m.states[i].state_id);
    p[i].distribution.forEach(d => {d.probability = d.action_id === 'guess' + (m.states[i].state_id === 'zero' ? '0' : '1') ? 1 : 0;});
  }
  const admitted = validateFiniteInformationPolicy({model: m, policy: p});
  assert.equal(admitted.information_sets.length, 2);
  const x = await compareFiniteDecisions({model: m, policy: p});
  assert.equal(x.supplied_policy_expected_utility, 1);
  assert.equal(x.optimal_admissible_expected_utility, 1);
  assert.equal(x.information_gap, 0);
});

test('unequal legal actions cannot silently split identical observable histories', async () => {
  const m = model();
  m.states[1].legal_action_ids = ['guess1'];
  await assert.rejects(compareFiniteDecisions({model: m}), /UNEQUAL_LEGAL_ACTIONS_WITHIN_INFORMATION_SET/);
  m.states[1].observable_history.push('public:guess0-disabled');
  const x = await compareFiniteDecisions({model: m});
  assert.equal(x.optimal_information_sets.length, 2);
});

test('analytic EVSI: a reveal costs 0.1, has gross 0.5 and net 0.4; useless observation has zero', async () => {
  const x = await rankObservationPartitions({model: model(), observations: [useless(), reveal()]});
  assert.equal(x.prior_optimal_expected_utility, 0.5);
  assert.deepEqual(x.ranked_observations.map(o => o.observation_id), ['reveal', 'useless']);
  assert.equal(x.ranked_observations[0].gross_evsi, 0.5);
  close(x.ranked_observations[0].net_evsi, 0.4);
  assert.equal(x.ranked_observations[0].expected_utility_after_observation_cost, 0.9);
  assert.equal(x.ranked_observations[1].gross_evsi, 0);
  assert.equal(x.ranked_observations[1].net_evsi, 0);
  assert.equal(x.selected_option, 'reveal');
});

test('information quantity is not decision value: equally sized partitions have different EVSI', async () => {
  const m = model();
  m.states = ['h1', 'h2', 'h3', 'h4'].map((state_id, i) => ({state_id, probability: 0.25,
    observable_history: ['before'], legal_action_ids: ['guess0', 'guess1'],
    payoffs: [{action_id: 'guess0', utility: i < 2 ? 1 : 0}, {action_id: 'guess1', utility: i < 2 ? 0 : 1}]}));
  const irrelevant = {...reveal(0), observation_id: 'irrelevant-bit',
    partition: [{outcome_id: 'odd', state_ids: ['h1', 'h3']}, {outcome_id: 'even', state_ids: ['h2', 'h4']}]};
  const relevant = {...reveal(0.1), observation_id: 'decision-bit',
    partition: [{outcome_id: 'left', state_ids: ['h1', 'h2']}, {outcome_id: 'right', state_ids: ['h3', 'h4']}]};
  const overkill = {...reveal(0.6), observation_id: 'full-ID',
    partition: m.states.map(s => ({outcome_id: s.state_id, state_ids: [s.state_id]}))};
  const x = await rankObservationPartitions({model: m, observations: [overkill, irrelevant, relevant]});
  const rows = new Map(x.ranked_observations.map(o => [o.observation_id, o]));
  assert.equal(rows.get('irrelevant-bit').gross_evsi, 0);
  assert.equal(rows.get('decision-bit').gross_evsi, 0.5);
  close(rows.get('decision-bit').net_evsi, 0.4);
  assert.equal(rows.get('full-ID').gross_evsi, 0.5);
  close(rows.get('full-ID').net_evsi, -0.1);
  assert.equal(x.selected_option, 'decision-bit');
});

test('reobserving an already known state partition contributes zero new decision value', async () => {
  const m = model();
  m.states.forEach(s => s.observable_history.push('revealed:' + s.state_id));
  const x = await rankObservationPartitions({model: m, observations: [reveal(0)]});
  assert.equal(x.prior_optimal_expected_utility, 1);
  assert.equal(x.ranked_observations[0].gross_evsi, 0);
  assert.equal(x.ranked_observations[0].net_evsi, 0);
  assert.equal(x.selected_option, 'NO_OBSERVATION');
});

test('zero or negative net value selects no observation and keeps competing results visible', async () => {
  const x = await rankObservationPartitions({model: model(), observations: [reveal(0.6), useless()]});
  assert.equal(x.selected_option, 'NO_OBSERVATION');
  assert.deepEqual(x.best_positive_observation_ids, []);
  assert.equal(x.ranked_observations.length, 2);
  assert.equal(x.ranked_observations[0].net_evsi, 0);
  assert.ok(x.ranked_observations[1].net_evsi < 0);
});

test('actor-private, missing, unknown and after-action observations are excluded from actionable rankings', async () => {
  const inaccessible = [
    {...reveal(), observation_id: 'private', actor_id: 'actor:opponent'},
    {...reveal(), observation_id: 'missing', access_state: 'MISSING'},
    {...reveal(), observation_id: 'unknown', access_state: 'UNKNOWN'},
    {...reveal(), observation_id: 'too-late', available_before_action: false}
  ];
  const x = await rankObservationPartitions({model: model(), observations: inaccessible});
  assert.equal(x.ranked_observations.length, 0);
  assert.equal(x.blocked_observations.length, 4);
  assert.equal(x.selected_option, 'NO_OBSERVATION');
  assert.ok(x.blocked_observations.every(o => o.gross_evsi === null && o.net_evsi === null && o.refined_information_sets.length === 0));
  assert.deepEqual(new Set(x.blocked_observations.map(o => o.status)), new Set([
    'BLOCKED_DIFFERENT_ACTOR', 'BLOCKED_OBSERVATION_MISSING', 'BLOCKED_OBSERVATION_UNKNOWN', 'BLOCKED_OBSERVATION_AFTER_ACTION'
  ]));
});

test('zero-probability cells have no posterior and contribute zero without dropping their states', async () => {
  const m = model();
  m.states[0].probability = 1;
  m.states[1].probability = 0;
  m.states[1].observable_history.push('unreachable-declared-history');
  const x = await compareFiniteDecisions({model: m});
  assert.equal(x.optimal_admissible_expected_utility, 1);
  const zero = x.optimal_information_sets.find(g => g.prior_mass === 0);
  assert.equal(zero.status, 'ZERO_PROBABILITY_INFORMATION_SET');
  assert.equal(zero.posterior, null);
  assert.equal(zero.native_evaluation, null);
  assert.equal(zero.weighted_utility, 0);
  const r = await rankObservationPartitions({model: m, observations: [reveal(0)]});
  assert.equal(r.ranked_observations[0].gross_evsi, 0);
  assert.equal(r.ranked_observations[0].refined_information_sets.length, 2);
});

test('zero prior probability does not permit hidden-state-dependent policies or action-set leakage', () => {
  const m = model(), p = policy();
  m.states[0].probability = 1;
  m.states[1].probability = 0;
  p[1].distribution = [{action_id: 'guess0', probability: 1}, {action_id: 'guess1', probability: 0}];
  assert.throws(() => validateFiniteInformationPolicy({model: m, policy: p}), /HIDDEN_STATE_DEPENDENT_POLICY/);
});

test('unknown probabilities are rejected instead of becoming a uniform prior', async () => {
  for (const probability of [undefined, null, 'UNKNOWN', NaN, Infinity, -0.1, 1.1]) {
    const m = model();
    m.states[0].probability = probability;
    await assert.rejects(compareFiniteDecisions({model: m}), /INVALID_STATE_PROBABILITY/);
  }
  const m = model();
  delete m.states[0].probability;
  await assert.rejects(compareFiniteDecisions({model: m}), /MISSING_STATE_FIELD/);
});

test('non-normalized priors are rejected; tiny accepted floating discrepancy is disclosed', async () => {
  const bad = model();
  bad.states[0].probability = 0.6;
  await assert.rejects(compareFiniteDecisions({model: bad}), /PROBABILITIES_MUST_SUM_TO_ONE/);
  const closePrior = model();
  closePrior.states[0].probability += 2e-13;
  const x = await compareFiniteDecisions({model: closePrior});
  assert.equal(x.probability_accounting.normalization_applied, true);
  assert.equal(x.supplied_model.states.find(s => s.state_id === 'zero').probability, closePrior.states[0].probability);
  close(x.probability_accounting.effective_probabilities.reduce((n, p) => n + p.probability, 0), 1);
});

test('explicit action costs are applied once to both prior and posterior action choices', async () => {
  const m = model();
  m.states[0].probability = 0.8;
  m.states[1].probability = 0.2;
  m.actions[0].cost = 0.1;
  const x = await compareFiniteDecisions({model: m, policy: policy(1)});
  close(x.supplied_policy_expected_utility, 0.7);
  close(x.optimal_admissible_expected_utility, 0.7);
  close(x.omniscient_upper_bound, 0.92);
  close(x.information_gap, 0.22);
  const r = await rankObservationPartitions({model: m, observations: [reveal(0.05)]});
  close(r.ranked_observations[0].gross_evsi, 0.22);
  close(r.ranked_observations[0].net_evsi, 0.17);
});

test('equal negative payoffs preserve all exact ties and reveal has zero value', async () => {
  const m = model();
  m.states.forEach(s => s.payoffs.forEach(p => {p.utility = -5;}));
  const x = await compareFiniteDecisions({model: m});
  assert.equal(x.optimal_admissible_expected_utility, -5);
  assert.equal(x.omniscient_upper_bound, -5);
  assert.equal(x.information_gap, 0);
  assert.deepEqual(x.optimal_information_sets[0].optimal_action_ids, ['guess0', 'guess1']);
  const r = await rankObservationPartitions({model: m, observations: [reveal(0)]});
  assert.equal(r.ranked_observations[0].gross_evsi, 0);
});

test('large finite negative and positive utilities remain within native evaluator bounds', async () => {
  const m = model();
  m.states.forEach(s => s.payoffs.forEach(p => {p.utility = p.utility ? 1e6 : -1e6;}));
  m.actions.forEach(a => {a.cost = 1e6;});
  const x = await compareFiniteDecisions({model: m});
  assert.equal(x.optimal_admissible_expected_utility, -1e6);
  assert.equal(x.omniscient_upper_bound, 0);
  assert.equal(x.information_gap, 1e6);
  const r = await rankObservationPartitions({model: m, observations: [reveal(1)]});
  assert.equal(r.ranked_observations[0].net_evsi, 999999);
});

test('invalid partitions cannot omit, duplicate, invent or empty a state cell', async () => {
  const bad = [
    [{outcome_id: 'one', state_ids: ['zero']}],
    [{outcome_id: 'a', state_ids: ['zero']}, {outcome_id: 'b', state_ids: ['zero', 'one']}],
    [{outcome_id: 'a', state_ids: ['zero', 'ghost']}],
    [{outcome_id: 'a', state_ids: []}, {outcome_id: 'b', state_ids: ['zero', 'one']}],
    [{outcome_id: 'a', state_ids: ['zero']}, {outcome_id: 'a', state_ids: ['one']}]
  ];
  for (const partition of bad) await assert.rejects(rankObservationPartitions({model: model(),
    observations: [{...reveal(), partition}]}), /PARTITION/);
});

test('canonical ordering preserves full receipts, policy identity and observation rankings', async () => {
  const m = model(), p = policy(), observations = [useless(), reveal()];
  const a = await compareFiniteDecisions({model: m, policy: p});
  const ra = await rankObservationPartitions({model: m, observations});
  m.actions.reverse(); m.states.reverse(); m.assumptions.reverse(); m.source_refs.reverse();
  m.states.forEach(s => {s.legal_action_ids.reverse(); s.payoffs.reverse();});
  p.reverse(); p.forEach(r => r.distribution.reverse());
  observations.reverse(); observations.forEach(o => {o.partition.reverse(); o.partition.forEach(c => c.state_ids.reverse());});
  assert.deepEqual(await compareFiniteDecisions({model: m, policy: p}), a);
  assert.deepEqual(await rankObservationPartitions({model: m, observations}), ra);
});

test('histories are ordered observations; reorder and reveal are not silently treated as the same information', () => {
  const m = model();
  m.states[0].observable_history = ['signal:a', 'signal:b'];
  m.states[1].observable_history = ['signal:b', 'signal:a'];
  const p = policy();
  p[0].distribution[0].probability = 1; p[0].distribution[1].probability = 0;
  p[1].distribution[0].probability = 0; p[1].distribution[1].probability = 1;
  assert.equal(validateFiniteInformationPolicy({model: m, policy: p}).information_sets.length, 2);
});

test('equivalent profitable observations preserve ties and deterministic recommendation', async () => {
  const x = await rankObservationPartitions({model: model(), observations: [
    {...reveal(), observation_id: 'test:b'}, {...reveal(), observation_id: 'test:a'}
  ]});
  assert.deepEqual(x.best_positive_observation_ids, ['test:a', 'test:b']);
  assert.equal(x.selected_option, 'test:a');
});

test('model, source, policy and observation changes alter the appropriate fingerprints', async () => {
  const m = model();
  const a = await compareFiniteDecisions({model: m, policy: policy()});
  m.states[0].payoffs[0].utility = 0.9;
  const b = await compareFiniteDecisions({model: m, policy: policy()});
  assert.notEqual(a.model_fingerprint, b.model_fingerprint);
  assert.equal(a.source_fingerprint, b.source_fingerprint);
  const c = await compareFiniteDecisions({model: model(), policy: policy(1)});
  assert.equal(a.model_fingerprint, c.model_fingerprint);
  assert.notEqual(a.supplied_policy_fingerprint, c.supplied_policy_fingerprint);
  const r1 = await rankObservationPartitions({model: model(), observations: [reveal()]});
  const r2 = await rankObservationPartitions({model: model(), observations: [reveal(0.2)]});
  assert.notEqual(r1.request_fingerprint, r2.request_fingerprint);
  m.source_refs[0].version = '2';
  const d = await compareFiniteDecisions({model: m});
  assert.notEqual(b.source_fingerprint, d.source_fingerprint);
});

test('deep frozen inputs are preserved and returned objects do not alias them', async () => {
  const request = deepFreeze({model: model(), policy: policy()});
  const original = JSON.stringify(request);
  const x = await compareFiniteDecisions(request);
  assert.equal(JSON.stringify(request), original);
  x.supplied_model.states[0].payoffs[0].utility = 123;
  assert.equal(JSON.stringify(request), original);
  const observationRequest = deepFreeze({model: model(), observations: [reveal()]});
  await rankObservationPartitions(observationRequest);
});

test('strict bounds reject sparse arrays, unknown keys, scalar coercions and oversized values', async () => {
  const edits = [
    m => {delete m.states[0];},
    m => {delete m.states[0].payoffs[0];},
    m => {m.states[0].probability = '0.5';},
    m => {m.actions[0].cost = -1;},
    m => {m.actions[0].cost = Infinity;},
    m => {m.states[0].payoffs[0].utility = 1e6 + 1;},
    m => {m.hidden_truth = true;},
    m => {m.states = Array.from({length: 17}, (_, i) => ({...m.states[0], state_id: 'state:' + i, probability: 1 / 17}));},
    m => {m.source_refs = [];},
    m => {m.source_refs[0].content_sha256 = 'fake';}
  ];
  for (const edit of edits) {
    const m = model(); edit(m);
    await assert.rejects(compareFiniteDecisions({model: m}));
  }
});

test('accessors, array side properties and custom prototypes cannot disguise input data', async () => {
  const m = model();
  let read = false;
  Object.defineProperty(m, 'model_id', {enumerable: true, get() {read = true; return 'secret';}});
  await assert.rejects(compareFiniteDecisions({model: m}), /INVALID_MODEL_FIELD/);
  assert.equal(read, false);
  const arrayExtra = model(); arrayExtra.states.secret = 'not-json';
  await assert.rejects(compareFiniteDecisions({model: arrayExtra}), /INVALID_STATES_FIELD/);
  const inherited = Object.create(model());
  await assert.rejects(compareFiniteDecisions({model: inherited}), /INVALID_MODEL/);
});

test('policy schema requires complete state/action coverage and normalized dense distributions', () => {
  const bad = [
    () => policy().slice(1),
    () => [policy()[0], policy()[0]],
    () => {const p = policy(); p[0].distribution.pop(); return p;},
    () => {const p = policy(); p[0].distribution[0].probability = 0.9; return p;},
    () => {const p = policy(); delete p[0].distribution[0]; return p;},
    () => {const p = policy(); p[0].distribution[0].action_id = 'unknown'; return p;}
  ];
  for (const make of bad) assert.throws(() => validateFiniteInformationPolicy({model: model(), policy: make()}));
});

test('no observation request is valid and the module never infers truth, source access or general poker results', async () => {
  const x = await rankObservationPartitions({model: model(), observations: []});
  assert.deepEqual(x.ranked_observations, []);
  assert.equal(x.selected_option, 'NO_OBSERVATION');
  for (const value of Object.values(x.boundaries)) assert.equal(value, false);
  assert.equal(finiteInformationContract.cfr_performed, false);
  assert.equal(finiteInformationContract.canonical_registry_mutation, false);
});

test('same-native model/observation version, owner and content disagreements block actionable EVSI', async () => {
  for (const [field, changed] of [['version', 'unordered:other-version'], ['owner', 'other-owner'], ['content_sha256', 'b'.repeat(64)]]) {
    const observation = reveal();
    observation.source_refs[0][field] = changed;
    const x = await rankObservationPartitions({model: model(), observations: [observation]});
    assert.equal(x.selected_option, 'NO_OBSERVATION');
    assert.equal(x.ranked_observations.length, 0);
    assert.equal(x.blocked_observations.length, 1);
    const row = x.blocked_observations[0];
    assert.equal(row.status, 'BLOCKED_SOURCE_ALIGNMENT_UNRESOLVED');
    assert.equal(row.gross_evsi, null);
    assert.equal(row.net_evsi, null);
    assert.ok(row.source_alignment.conflicts.some(c => c.mismatched_fields.includes(field)));
    assert.equal(row.source_alignment.version_order_inferred, false);
    assert.equal(row.source_alignment.source_authentication, false);
  }
});

test('source mismatch does not erase a separately observed missing-access status', async () => {
  const observation = {...reveal(), access_state: 'MISSING'};
  observation.source_refs[0].version = 'mismatch';
  const x = await rankObservationPartitions({model: model(), observations: [observation]});
  assert.equal(x.blocked_observations[0].status, 'BLOCKED_OBSERVATION_MISSING');
  assert.equal(x.blocked_observations[0].source_alignment.status, 'SOURCE_ALIGNMENT_UNRESOLVED');
});

test('distinctly named observation sources remain caller-declared inputs without independence or authenticity promotion', async () => {
  const observation = reveal();
  observation.source_refs[0] = {...observation.source_refs[0], native_id: 'fixture:separate-observation', version: 'other-version', owner: 'other-owner'};
  const x = await rankObservationPartitions({model: model(), observations: [observation]});
  assert.equal(x.selected_option, 'reveal');
  close(x.ranked_observations[0].net_evsi, 0.4);
  const alignment = x.ranked_observations[0].source_alignment;
  assert.equal(alignment.status, 'DECLARED_SOURCE_ALIGNMENT_NO_CONFLICT');
  assert.equal(alignment.separately_named_sources.length, 1);
  assert.equal(alignment.source_authentication, false);
  assert.match(alignment.limitation, /DO_NOT_ESTABLISH_INDEPENDENCE/);
});

test('unanchored same-native candidate-source conflicts are unresolved for both candidates', async () => {
  const a = {...reveal(), observation_id: 'candidate:a'}, b = {...reveal(), observation_id: 'candidate:b'};
  a.source_refs[0].native_id = 'fixture:separate-observation';
  b.source_refs[0] = {...a.source_refs[0], version: 'another-version'};
  const x = await rankObservationPartitions({model: model(), observations: [a, b]});
  assert.equal(x.ranked_observations.length, 0);
  assert.equal(x.blocked_observations.length, 2);
  assert.ok(x.blocked_observations.every(r => r.status === 'BLOCKED_SOURCE_ALIGNMENT_UNRESOLVED'));
});

test('a matching anchored source is not invalidated by another conflicting candidate', async () => {
  const good = {...reveal(), observation_id: 'aligned'}, bad = {...reveal(), observation_id: 'conflicting'};
  bad.source_refs[0].content_sha256 = 'b'.repeat(64);
  const x = await rankObservationPartitions({model: model(), observations: [bad, good]});
  assert.equal(x.selected_option, 'aligned');
  assert.deepEqual(x.ranked_observations.map(r => r.observation_id), ['aligned']);
  assert.deepEqual(x.blocked_observations.map(r => r.observation_id), ['conflicting']);
});

test('a model with multiple versions of one native identity has unresolved source alignment', async () => {
  const m = model();
  m.source_refs.push({...m.source_refs[0], version: 'other'});
  await assert.rejects(compareFiniteDecisions({model: m}), /MODEL_SOURCE_ALIGNMENT_UNRESOLVED/);
});

function cancellationModel(tiny = 1e-6, historyVisible = true) {
  const m = model();
  m.actions = [{action_id: 'take', cost: 0}];
  m.states = [1e6, -1e6, tiny].map((utility, i) => ({state_id: 's' + i, probability: 1 / 3,
    observable_history: historyVisible ? ['visible-' + i] : [], legal_action_ids: ['take'],
    payoffs: [{action_id: 'take', utility}]}));
  return m;
}
const cancellationPolicy = () => [0, 1, 2].map(i => ({state_id: 's' + i, distribution: [{action_id: 'take', probability: 1}]}));
const constantObservation = id => ({...reveal(0), observation_id: id,
  partition: [{outcome_id: 'all', state_ids: ['s0', 's1', 's2']}]});

test('cancellation oracle: 40 no-op labels × positive/negative/zero tiny payoffs never invent EVSI', async () => {
  for (const tiny of [1e-6, -1e-6, 0]) {
    const m = cancellationModel(tiny), expected = tiny / 3;
    for (let i = 0; i < 40; i++) {
      const x = await rankObservationPartitions({model: m, observations: [constantObservation('noop' + i)]});
      const row = x.ranked_observations[0];
      assert.equal(x.prior_optimal_expected_utility, expected);
      assert.equal(row.posterior_optimal_expected_utility, expected);
      assert.equal(row.gross_evsi, 0);
      assert.equal(row.net_evsi, 0);
      assert.equal(row.numerical_accounting.gross_evsi.numerator, '0');
      assert.equal(row.numerical_accounting.gross_evsi.absolute_projection_error.numerator, '0');
      assert.equal(x.selected_option, 'NO_OBSERVATION');
    }
  }
});

test('shared exact accumulation preserves zero omniscient gap and policy regret under cancellation', async () => {
  for (const tiny of [1e-6, -1e-6, 0]) for (const visible of [true, false]) {
    const m = cancellationModel(tiny, visible);
    for (const suppliedPolicy of [undefined, cancellationPolicy()]) {
      const x = await compareFiniteDecisions({model: m, ...(suppliedPolicy ? {policy: suppliedPolicy} : {})});
      assert.equal(x.optimal_admissible_expected_utility, tiny / 3);
      assert.equal(x.omniscient_upper_bound, tiny / 3);
      assert.equal(x.information_gap, 0);
      assert.equal(x.numerical_accounting.information_gap.numerator, '0');
      if (suppliedPolicy) {
        assert.equal(x.supplied_policy_expected_utility, tiny / 3);
        assert.equal(x.supplied_policy_regret, 0);
      }
    }
  }
});

test('equivalent partition renaming and state/array permutation do not change cancellation arithmetic', async () => {
  const m = cancellationModel(-1e-6);
  const observations = Array.from({length: 16}, (_, i) => ({...constantObservation('obs:' + i),
    partition: m.states.map((s, j) => ({outcome_id: 'renamed:' + i + ':' + j, state_ids: [s.state_id]})).reverse()}));
  const x = await rankObservationPartitions({model: m, observations});
  assert.ok(x.ranked_observations.every(row => row.gross_evsi === 0 && row.net_evsi === 0));
  assert.equal(x.selected_option, 'NO_OBSERVATION');
  m.states.reverse(); observations.reverse();
  assert.deepEqual(await rankObservationPartitions({model: m, observations}), x);
});

test('a genuinely positive tiny decision gain survives exact refinement and is not blanket-clamped', async () => {
  const m = model();
  m.states.forEach(s => s.payoffs.forEach(p => {p.utility *= 1e-20;}));
  const x = await rankObservationPartitions({model: m, observations: [reveal(0)]});
  assert.equal(x.ranked_observations[0].gross_evsi, 5e-21);
  assert.equal(x.ranked_observations[0].net_evsi, 5e-21);
  assert.equal(x.selected_option, 'reveal');
  assert.notEqual(x.ranked_observations[0].numerical_accounting.gross_evsi.numerator, '0');
});

test('native floating arithmetic discrepancies are retained and disclosed without changing its receipt', async () => {
  const m = cancellationModel(1e-6, false);
  const x = await compareFiniteDecisions({model: m});
  const g = x.optimal_information_sets[0];
  assert.equal(g.native_evaluation.method, 'harsanyi');
  assert.equal(g.native_evaluation.status, 'BOUNDED_MODEL_RESULT');
  assert.ok(g.numerical_accounting.native_utility_residuals.some(r => r.exact_refined_minus_native.numerator !== '0'));
  assert.equal(x.arithmetic.internal, 'EXACT_RATIONAL_OPERATIONS_ON_SUPPLIED_BINARY64_VALUES');
  assert.equal(x.arithmetic.source_measurement_precision_inferred, false);
});

test('subnormal projection underflow is explicit while the exact positive value is retained', async () => {
  const m = model();
  m.states.forEach(s => s.payoffs.forEach(p => {p.utility *= Number.MIN_VALUE;}));
  const x = await rankObservationPartitions({model: m, observations: [reveal(0)]});
  const row = x.ranked_observations[0];
  assert.equal(row.gross_evsi, 0);
  assert.notEqual(row.numerical_accounting.gross_evsi.numerator, '0');
  assert.equal(row.numerical_accounting.gross_evsi.projection, 'BINARY64_UNDERFLOW;EXACT_FRACTION_RETAINED');
  assert.equal(x.selected_option, 'reveal');
});

// 2^-92 is one binary64 step at 1e-12. The deficient-mass construction
// subtracts nearby powers at exactly representable spacings, so its true
// deviation is the same supplied delta rather than a rounded 1-minus-delta.
const toleranceBoundaryMass = (delta, excess) => excess ? [1, delta] : [1 - 2 ** -39, 2 ** -39 - delta];
const toleranceBoundaries = [
  {name: 'inside', delta: 1e-12 - 2 ** -92, accepted: true},
  {name: 'equal', delta: 1e-12, accepted: true},
  {name: 'outside', delta: 1e-12 + 2 ** -92, accepted: false}
];

test('exact prior mass tolerance handles inside, equal and outside limits in both directions', async () => {
  for (const excess of [true, false]) for (const boundary of toleranceBoundaries) {
    const m = model(), probabilities = toleranceBoundaryMass(boundary.delta, excess);
    m.states.forEach((state, index) => {state.probability = probabilities[index];});
    if (!boundary.accepted) {
      await assert.rejects(compareFiniteDecisions({model: m}), /PROBABILITIES_MUST_SUM_TO_ONE:PRIOR/,
        `${boundary.name}; excess=${excess}`);
    } else {
      const result = await compareFiniteDecisions({model: m});
      assert.equal(result.status, 'FINITE_INFORMATION_DECISION_COMPARISON');
      assert.equal(result.probability_accounting.normalization_applied, true);
      assert.notEqual(result.probability_accounting.supplied_total_exact.numerator,
        result.probability_accounting.supplied_total_exact.denominator);
    }
  }
});

test('exact policy mass tolerance handles inside, equal and outside limits in both directions', () => {
  for (const excess of [true, false]) for (const boundary of toleranceBoundaries) {
    const p = policy(), probabilities = toleranceBoundaryMass(boundary.delta, excess);
    p.forEach(row => row.distribution.forEach((action, index) => {action.probability = probabilities[index];}));
    if (!boundary.accepted) {
      assert.throws(() => validateFiniteInformationPolicy({model: model(), policy: p}),
        /PROBABILITIES_MUST_SUM_TO_ONE:POLICY:/, `${boundary.name}; excess=${excess}`);
    } else {
      const result = validateFiniteInformationPolicy({model: model(), policy: p});
      assert.equal(result.status, 'INFORMATION_POLICY_ADMISSIBLE_IN_SUPPLIED_MODEL');
      assert.ok(result.normalized_policy.every(row => row.probability_total_exact.numerator !== row.probability_total_exact.denominator));
    }
  }
});
