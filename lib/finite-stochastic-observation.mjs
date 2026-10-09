// Bounded stochastic observation value by finite joint-state expansion. This
// is an additive local adapter over the existing deterministic information
// reasoner and native Harsanyi evaluator; it adds no hosted evaluator or ID.
import {createHash} from 'node:crypto';
import {canonical} from './universal.mjs';
import {rankObservationPartitions, validateFiniteInformationModel} from './finite-information-reasoning.mjs';

const VERSION = 'MPC_FINITE_STOCHASTIC_OBSERVATION_V1';
const ID = /^[A-Za-z0-9_:.-]{1,200}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const MAX_COST = 1e6;
const MAX_EXPANDED_STATES = 16;
const TOLERANCE = 1e-12;
const fail = (code, detail = '') => { throw Error(code + (detail ? ':' + detail : '')); };
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const copy = value => structuredClone(value);

export const stochasticObservationContract = Object.freeze({
  version: VERSION,
  model_scope: 'FINITE_SINGLE_DECISION_WITH_CALLER_SUPPLIED_STOCHASTIC_SIGNAL_LIKELIHOODS',
  max_observations: 8,
  max_outcomes_per_observation: 8,
  max_expanded_states: MAX_EXPANDED_STATES,
  probability_sum_tolerance: TOLERANCE,
  observation_cost_bound: MAX_COST,
  native_method_used: 'harsanyi',
  native_evaluator_added: false,
  implementation: 'JOINT_STATE_EXPANSION_THEN_EXISTING_DETERMINISTIC_PARTITION_ADAPTER',
  probabilities_inferred: false,
  source_authentication: false,
  target_actions: false,
  canonical_registry_mutation: false
});

function object(value, fields, optional = [], name = 'OBJECT') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_' + name);
  const allowed = new Set([...fields, ...optional]), descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !allowed.has(key) || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('INVALID_' + name + '_FIELD');
  }
  if (fields.some(key => !Object.hasOwn(descriptors, key))) fail('MISSING_' + name + '_FIELD');
}

function array(value, min, max, name) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < min || value.length > max) fail('INVALID_' + name + '_BOUNDS');
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length) fail('INVALID_' + name + '_FIELD');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('INVALID_' + name + '_FIELD');
  }
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) fail('SPARSE_' + name);
  return value;
}

function id(value, name) {
  if (typeof value !== 'string' || !ID.test(value)) fail('INVALID_' + name);
  return value;
}

function number(value, min, max, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail('INVALID_' + name);
  return value === 0 ? 0 : value;
}

function distinct(values, name) {
  if (new Set(values).size !== values.length) fail('DUPLICATE_' + name);
}

function source(value) {
  object(value, ['namespace', 'native_id', 'version', 'owner', 'content_sha256'], [], 'OBSERVATION_SOURCE');
  for (const field of ['namespace', 'native_id', 'version', 'owner']) if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > 300) fail('INVALID_OBSERVATION_SOURCE_' + field);
  if (typeof value.content_sha256 !== 'string' || !HASH.test(value.content_sha256)) fail('INVALID_OBSERVATION_SOURCE_HASH');
  return copy(value);
}

function normalizeObservation(value, stateIDs) {
  object(value, ['observation_id', 'actor_id', 'access_state', 'available_before_action', 'cost', 'source_refs', 'outcomes'], [], 'STOCHASTIC_OBSERVATION');
  const observation_id = id(value.observation_id, 'OBSERVATION_ID');
  const actor_id = id(value.actor_id, 'OBSERVATION_ACTOR_ID');
  if (!['AVAILABLE', 'MISSING', 'UNKNOWN'].includes(value.access_state)) fail('INVALID_OBSERVATION_ACCESS_STATE');
  if (typeof value.available_before_action !== 'boolean') fail('INVALID_OBSERVATION_TIMING');
  const sources = array(value.source_refs, 1, 8, 'OBSERVATION_SOURCES').map(source).sort((a, b) => cmp(canonical(a), canonical(b)));
  distinct(sources.map(row => canonical([row.namespace, row.native_id, row.version])), 'OBSERVATION_SOURCE_VERSION');
  const outcomes = array(value.outcomes, 1, 8, 'OBSERVATION_OUTCOMES').map(outcome => {
    object(outcome, ['outcome_id', 'likelihoods'], [], 'OBSERVATION_OUTCOME');
    const outcome_id = id(outcome.outcome_id, 'OBSERVATION_OUTCOME_ID');
    const likelihoods = array(outcome.likelihoods, 1, stateIDs.length, 'OBSERVATION_LIKELIHOODS').map(row => {
      object(row, ['state_id', 'probability'], [], 'OBSERVATION_LIKELIHOOD');
      return {state_id: id(row.state_id, 'LIKELIHOOD_STATE_ID'), probability: number(row.probability, 0, 1, 'LIKELIHOOD_PROBABILITY')};
    }).sort((a, b) => cmp(a.state_id, b.state_id));
    if (canonical(likelihoods.map(row => row.state_id)) !== canonical(stateIDs)) fail('LIKELIHOOD_STATE_COVERAGE', outcome_id);
    return {outcome_id, likelihoods};
  }).sort((a, b) => cmp(a.outcome_id, b.outcome_id));
  distinct(outcomes.map(outcome => outcome.outcome_id), 'OBSERVATION_OUTCOME_ID');
  if (stateIDs.length * outcomes.length > MAX_EXPANDED_STATES) fail('STOCHASTIC_EXPANSION_BUDGET_EXCEEDED');
  for (const stateID of stateIDs) {
    const total = outcomes.reduce((sum, outcome) => sum + outcome.likelihoods.find(row => row.state_id === stateID).probability, 0);
    if (Math.abs(total - 1) > TOLERANCE) fail('LIKELIHOODS_MUST_SUM_TO_ONE', stateID);
  }
  return {observation_id, actor_id, access_state: value.access_state, available_before_action: value.available_before_action,
    cost: number(value.cost, 0, MAX_COST, 'OBSERVATION_COST'), source_refs: sources, outcomes};
}

function expand(model, observation) {
  const states = [...model.states].sort((a, b) => cmp(a.state_id, b.state_id));
  const raw = [];
  for (const [stateIndex, state] of states.entries()) for (const [outcomeIndex, outcome] of observation.outcomes.entries()) {
    const likelihood = outcome.likelihoods.find(row => row.state_id === state.state_id).probability;
    raw.push({state, outcome, likelihood, expanded_state_id: `joint:s${stateIndex}:o${outcomeIndex}`, joint_probability: state.probability * likelihood});
  }
  const total = raw.reduce((sum, row) => sum + row.joint_probability, 0);
  if (!Number.isFinite(total) || total <= 0 || Math.abs(total - 1) > TOLERANCE) fail('EXPANDED_PROBABILITIES_MUST_SUM_TO_ONE');
  const expandedModel = {...copy(model), model_id: 'stochastic:' + hash({model_id: model.model_id, observation}).slice(0, 24),
    states: raw.map(row => ({...copy(row.state), state_id: row.expanded_state_id, probability: row.joint_probability / total}))};
  const deterministic = {observation_id: observation.observation_id, actor_id: observation.actor_id,
    access_state: observation.access_state, available_before_action: observation.available_before_action,
    cost: observation.cost, source_refs: copy(observation.source_refs),
    partition: observation.outcomes.map(outcome => ({outcome_id: outcome.outcome_id,
      state_ids: raw.filter(row => row.outcome.outcome_id === outcome.outcome_id).map(row => row.expanded_state_id)}))};
  return {expandedModel, deterministic, state_mapping: raw.map(row => ({expanded_state_id: row.expanded_state_id,
    original_state_id: row.state.state_id, outcome_id: row.outcome.outcome_id, supplied_likelihood: row.likelihood,
    joint_probability_before_normalization: row.joint_probability, effective_joint_probability: row.joint_probability / total})),
    supplied_joint_probability_total: total, normalization_applied: total !== 1};
}

function exactFraction(row) {
  const value = row.numerical_accounting.net_evsi;
  return {n: BigInt(value.numerator), d: BigInt(value.denominator)};
}

function compareFractions(a, b) {
  return a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
}

/** Rank caller-supplied finite noisy observations under one explicit cost
 * budget. Likelihoods are not learned or inferred. Affordable signals are
 * expanded to joint hidden-state/signal states and delegated to the existing
 * deterministic partition adapter, which executes native Harsanyi checks.
 */
export async function rankFiniteStochasticObservations(input) {
  object(input, ['model', 'observations', 'budget'], [], 'STOCHASTIC_REQUEST');
  const modelValidation = validateFiniteInformationModel({model: input.model}), normalizedModel = modelValidation.supplied_model;
  if (normalizedModel.states.length > MAX_EXPANDED_STATES) fail('STOCHASTIC_MODEL_STATE_BUDGET_EXCEEDED');
  const stateIDs = normalizedModel.states.map(state => state.state_id);
  const observations = array(input.observations, 0, 8, 'STOCHASTIC_OBSERVATIONS').map(value => normalizeObservation(value, stateIDs)).sort((a, b) => cmp(a.observation_id, b.observation_id));
  distinct(observations.map(observation => observation.observation_id), 'OBSERVATION_ID');
  const budget = number(input.budget, 0, MAX_COST, 'OBSERVATION_BUDGET');
  const ranked = [], blocked = [];
  for (const observation of observations) {
    if (observation.cost > budget) {
      blocked.push({observation_id: observation.observation_id, observation_fingerprint: hash(observation), status: 'BLOCKED_OBSERVATION_BUDGET',
        required_cost: observation.cost, available_budget: budget, evaluator_calls: 0, supplied_observation: copy(observation)});
      continue;
    }
    const expanded = expand(normalizedModel, observation);
    const receipt = await rankObservationPartitions({model: expanded.expandedModel, observations: [expanded.deterministic]});
    if (!receipt.ranked_observations.length) {
      blocked.push({...receipt.blocked_observations[0], likelihood_model: copy(observation.outcomes),
        expanded_state_mapping: expanded.state_mapping, expanded_adapter_receipt: receipt});
      continue;
    }
    const row = receipt.ranked_observations[0];
    ranked.push({...row, likelihood_model: copy(observation.outcomes), expanded_state_mapping: expanded.state_mapping,
      expansion_accounting: {supplied_joint_probability_total: expanded.supplied_joint_probability_total,
        normalization_applied: expanded.normalization_applied, expanded_states: expanded.state_mapping.length},
      expanded_adapter_receipt: receipt});
  }
  ranked.sort((a, b) => compareFractions(exactFraction(b), exactFraction(a)) || a.observation_cost - b.observation_cost || cmp(a.observation_id, b.observation_id));
  const best = ranked.length ? exactFraction(ranked[0]) : {n: 0n, d: 1n};
  return {version: VERSION, status: 'FINITE_STOCHASTIC_OBSERVATIONS_RANKED', request_fingerprint: hash({model: normalizedModel, observations, budget}),
    model_validation: modelValidation,
    supplied_budget: budget, ranked_observations: ranked, blocked_observations: blocked,
    selected_option: best.n > 0n ? ranked[0].observation_id : 'NO_OBSERVATION',
    best_positive_observation_ids: best.n > 0n ? ranked.filter(row => compareFractions(exactFraction(row), best) === 0).map(row => row.observation_id) : [],
    value_rule: 'EXPECTED_POSTERIOR_DECISION_VALUE_MINUS_PRIOR_DECISION_VALUE_MINUS_SUPPLIED_OBSERVATION_COST;COST_MUST_NOT_EXCEED_SUPPLIED_BUDGET',
    native_method_used: 'harsanyi', native_evaluator_added: false, observation_performed: false,
    boundaries: {stochastic_probabilities_inferred: false, source_authentication: false, actor_access_verified: false,
      target_actions_performed: false, canonical_promotion: false, registry_mutation: false, persisted: false},
    limitations: ['Finite caller-supplied likelihoods only; no learning, calibration, sequential search, CFR, adversarial equilibrium or general poker solving.',
      'Joint probabilities are binary64 products normalized only within the explicit tolerance; exact downstream arithmetic begins from those supplied expanded binary64 values.',
      'Budget is a supplied utility-unit cap, not money, authority, access or permission.']};
}
