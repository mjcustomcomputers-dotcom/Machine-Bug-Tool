import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {rankFiniteStochasticObservations, stochasticObservationContract} from '../lib/finite-stochastic-observation.mjs';

const clone = value => structuredClone(value);
const close = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} should equal ${expected} within ${tolerance}`);
const source = {namespace: 'SYNTHETIC', native_id: 'fixture:stochastic-hidden-bit', owner: 'MPC-LOCAL-TEST', version: '1',
  content_sha256: createHash('sha256').update('stochastic-hidden-bit:v1').digest('hex')};
const model = () => ({
  model_id: 'fixture:stochastic-hidden-bit', actor_id: 'actor:chooser', source_refs: [clone(source)],
  assumptions: ['Fair hidden bit.', 'Correct guess pays one supplied utility unit.'],
  actions: [{action_id: 'guess0', cost: 0}, {action_id: 'guess1', cost: 0}],
  states: [0, 1].map(bit => ({state_id: 'bit' + bit, probability: 0.5, observable_history: ['before-signal'],
    legal_action_ids: ['guess0', 'guess1'], payoffs: [0, 1].map(guess => ({action_id: 'guess' + guess, utility: guess === bit ? 1 : 0}))}))
});
const signal = (observation_id, accuracy, cost = 0) => ({
  observation_id, actor_id: 'actor:chooser', access_state: 'AVAILABLE', available_before_action: true,
  cost, source_refs: [clone(source)], outcomes: [0, 1].map(outcome => ({outcome_id: 'signal' + outcome,
    likelihoods: [0, 1].map(state => ({state_id: 'bit' + state, probability: state === outcome ? accuracy : 1 - accuracy}))}))
});

test('bounded noisy signal uses native posterior decisions and matches the independent binary oracle', async () => {
  const result = await rankFiniteStochasticObservations({model: model(), observations: [signal('accurate', 0.75, 0.1)], budget: 0.1});
  assert.equal(result.status, 'FINITE_STOCHASTIC_OBSERVATIONS_RANKED');
  assert.equal(result.selected_option, 'accurate');
  assert.equal(result.ranked_observations.length, 1);
  const row = result.ranked_observations[0];
  assert.equal(row.prior_optimal_expected_utility, 0.5);
  assert.equal(row.posterior_optimal_expected_utility, 0.75);
  assert.equal(row.gross_evsi, 0.25);
  close(row.net_evsi, 0.15);
  assert.equal(row.expanded_adapter_receipt.native_method_used, 'harsanyi');
  assert.equal(row.expanded_adapter_receipt.ranked_observations[0].refined_information_sets.length, 2);
  assert.equal(result.boundaries.stochastic_probabilities_inferred, false);
  assert.equal(result.boundaries.target_actions_performed, false);
});

test('accuracy one-half is the explicit no-information negative control', async () => {
  const result = await rankFiniteStochasticObservations({model: model(), observations: [signal('coin-flip', 0.5)], budget: 0});
  assert.equal(result.selected_option, 'NO_OBSERVATION');
  assert.equal(result.ranked_observations[0].gross_evsi, 0);
  assert.equal(result.ranked_observations[0].net_evsi, 0);
});

test('cost beyond the supplied observation budget is blocked before evaluator calls', async () => {
  const result = await rankFiniteStochasticObservations({model: model(), observations: [signal('too-expensive', 1, 0.2)], budget: 0.1});
  assert.equal(result.selected_option, 'NO_OBSERVATION');
  assert.equal(result.ranked_observations.length, 0);
  assert.equal(result.blocked_observations[0].status, 'BLOCKED_OBSERVATION_BUDGET');
  assert.equal(result.blocked_observations[0].required_cost, 0.2);
  assert.equal(result.blocked_observations[0].available_budget, 0.1);
  assert.equal(result.blocked_observations[0].evaluator_calls, 0);
});

test('likelihood rows are complete, bounded and normalized for every state', async () => {
  const incomplete = signal('bad', 0.75);
  incomplete.outcomes[1].likelihoods.pop();
  await assert.rejects(rankFiniteStochasticObservations({model: model(), observations: [incomplete], budget: 0}), /LIKELIHOOD_STATE_COVERAGE/);
  const invalid = signal('bad', 0.75);
  invalid.outcomes[0].likelihoods[0].probability = 1.1;
  await assert.rejects(rankFiniteStochasticObservations({model: model(), observations: [invalid], budget: 0}), /INVALID_LIKELIHOOD_PROBABILITY/);
  const notNormalized = signal('bad', 0.75);
  notNormalized.outcomes[0].likelihoods[0].probability = 0.7;
  await assert.rejects(rankFiniteStochasticObservations({model: model(), observations: [notNormalized], budget: 0}), /LIKELIHOODS_MUST_SUM_TO_ONE/);
});

test('observation and likelihood ordering does not change the receipt', async () => {
  const input = {model: model(), observations: [signal('coin-flip', 0.5), signal('accurate', 0.8, 0.05)], budget: 0.1};
  const expected = await rankFiniteStochasticObservations(input);
  input.observations.reverse();
  input.observations.forEach(observation => {
    observation.outcomes.reverse();
    observation.outcomes.forEach(outcome => outcome.likelihoods.reverse());
  });
  input.model.actions.reverse();
  input.model.states.reverse();
  input.model.assumptions.reverse();
  input.model.source_refs.reverse();
  input.model.states.forEach(state => {state.legal_action_ids.reverse(); state.payoffs.reverse();});
  assert.deepEqual(await rankFiniteStochasticObservations(input), expected);
});

test('accessors, sparse arrays, side properties and custom prototypes fail before expansion', async () => {
  const accessor = signal('poisoned', 0.75);
  Object.defineProperty(accessor.outcomes[0].likelihoods[0], 'probability', {enumerable: true, get() { throw Error('GETTER_EXECUTED'); }});
  await assert.rejects(rankFiniteStochasticObservations({model: model(), observations: [accessor], budget: 0}), /INVALID_OBSERVATION_LIKELIHOOD_FIELD/);
  const side = signal('side', 0.75);
  side.outcomes.extra = true;
  await assert.rejects(rankFiniteStochasticObservations({model: model(), observations: [side], budget: 0}), /INVALID_OBSERVATION_OUTCOMES_FIELD/);
  const custom = signal('custom', 0.75);
  Object.setPrototypeOf(custom.outcomes, {custom: true});
  await assert.rejects(rankFiniteStochasticObservations({model: model(), observations: [custom], budget: 0}), /INVALID_OBSERVATION_OUTCOMES_BOUNDS/);
});

test('contract preserves existing native evaluator and catalog identities', () => {
  assert.equal(stochasticObservationContract.native_evaluator_added, false);
  assert.equal(stochasticObservationContract.native_method_used, 'harsanyi');
  assert.equal(stochasticObservationContract.max_expanded_states, 16);
});
