// Local, finite, single-decision information reasoning. This is an additive
// consumer of the existing Harsanyi evaluator, not a new hosted evaluator,
// poker/CFR solver, source authenticator, or policy-training system.
import {createHash} from 'node:crypto';
import {canonical} from './universal.mjs';
import {evaluateMethod} from './methods.mjs';

const VERSION = 'MPC_FINITE_INFORMATION_REASONING_V1';
const ID = /^[A-Za-z0-9_:.-]{1,200}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const PROBABILITY_TOLERANCE = 1e-12;
const MAX_UTILITY = 1e6;
const fail = (code, detail = '') => { throw Error(code + (detail ? ':' + detail : '')); };
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const copy = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');

export const finiteInformationContract = Object.freeze({
  version: VERSION,
  model_scope: 'FINITE_SINGLE_ACTOR_SINGLE_DECISION_WITH_SUPPLIED_OBSERVABLE_HISTORY',
  max_states: 16, max_actions: 16, max_observations: 16, max_history_tokens: 32,
  utility_absolute_bound: MAX_UTILITY, cost_bound: MAX_UTILITY,
  probability_sum_tolerance: PROBABILITY_TOLERANCE,
  arithmetic: 'EXACT_RATIONAL_REFINEMENT_OF_SUPPLIED_BINARY64_INPUTS;NATIVE_HARSANYI_CROSS_CHECK;NEAREST_EVEN_OUTPUT',
  information_set_rule: 'SAME_ACTOR_AND_ORDERED_OBSERVABLE_HISTORY_REQUIRE_IDENTICAL_LEGAL_ACTIONS_AND_POLICY',
  observation_rule: 'COMPLETE_DETERMINISTIC_PARTITION_REFINES_EXISTING_INFORMATION_BY_INTERSECTION',
  source_authentication: false, probabilities_inferred: false,
  cfr_performed: false, general_game_equilibrium_computed: false,
  external_actions: false, canonical_registry_mutation: false
});

// Do not let sparse arrays, accessors, symbols, or custom prototypes bypass a
// JSON-shaped input contract when the module is called directly from Node.
function object(value, fields, optional = [], name = 'OBJECT') {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_' + name);
  const allowed = new Set([...fields, ...optional]);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !allowed.has(key) || !descriptor.enumerable ||
        !Object.hasOwn(descriptor, 'value')) fail('INVALID_' + name + '_FIELD');
  }
  if (fields.some(key => !Object.hasOwn(descriptors, key))) fail('MISSING_' + name + '_FIELD');
}

function array(value, min, max, name) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length < min || value.length > max) fail('INVALID_' + name + '_BOUNDS');
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length) fail('INVALID_' + name + '_FIELD');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('INVALID_' + name + '_FIELD');
  }
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) fail('SPARSE_' + name);
  return value;
}

function id(value, name) {
  if (typeof value !== 'string' || !ID.test(value)) fail('INVALID_' + name);
  return value;
}

function text(value, name, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('INVALID_' + name);
  return value;
}

function number(value, min, max, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail('INVALID_' + name);
  return value === 0 ? 0 : value;
}

function distinct(values, name) {
  if (new Set(values).size !== values.length) fail('DUPLICATE_' + name);
}

// A finite binary64 input has an exact rational representation. Keeping that
// representation through weighted sums, subtraction and policy comparison
// prevents cancellation and display-label order from manufacturing EVSI.
// These are exact operations on the supplied *binary64* numbers, not a claim
// that the user's decimal intent, source measurements or probabilities are exact.
const ZERO = Object.freeze({n: 0n, d: 1n});
const ONE = Object.freeze({n: 1n, d: 1n});
const abs = x => x < 0n ? -x : x;
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
function rational(n, d = 1n) {
  if (d === 0n) fail('ZERO_RATIONAL_DENOMINATOR');
  if (n === 0n) return ZERO;
  if (d < 0n) {n = -n; d = -d;}
  const divisor = gcd(abs(n), d);
  return {n: n / divisor, d: d / divisor};
}
function exact(value) {
  if (value === 0) return ZERO;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  const bits = view.getBigUint64(0, false);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const significand = (bits >> 63n ? -1n : 1n) * (exponent === 0 ? fraction : (1n << 52n) + fraction);
  const power = exponent === 0 ? -1074 : exponent - 1023 - 52;
  return power < 0 ? rational(significand, 1n << BigInt(-power)) : rational(significand << BigInt(power));
}
const plus = (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
const minus = (a, b) => rational(a.n * b.d - b.n * a.d, a.d * b.d);
const times = (a, b) => rational(a.n * b.n, a.d * b.d);
const divide = (a, b) => rational(a.n * b.d, a.d * b.n);
const compareExact = (a, b) => cmp(a.n * b.d, b.n * a.d);
const exactSum = values => values.reduce(plus, ZERO);
const fractionJSON = r => ({numerator: String(r.n), denominator: String(r.d)});
const fromFractionJSON = r => rational(BigInt(r.numerator), BigInt(r.denominator));
function roundedInteger(n, d) {
  const q = n / d, remainder = n % d;
  return q + (2n * remainder > d || (2n * remainder === d && (q & 1n)) ? 1n : 0n);
}
function projected(r) {
  if (r.n === 0n) return 0;
  const sign = r.n < 0n ? -1 : 1, n = abs(r.n), d = r.d;
  let exponent = n.toString(2).length - d.toString(2).length;
  if ((exponent >= 0 ? n < (d << BigInt(exponent)) : (n << BigInt(-exponent)) < d)) exponent--;
  if (exponent < -1022) {
    const value = sign * Number(roundedInteger(n << 1074n, d)) * Number.MIN_VALUE;
    return value === 0 ? 0 : value;
  }
  const shift = 52 - exponent;
  const significand = shift >= 0 ? roundedInteger(n << BigInt(shift), d) : roundedInteger(n, d << BigInt(-shift));
  const value = sign * Number(significand) * 2 ** (exponent - 52);
  if (!Number.isFinite(value)) fail('NUMERIC_OUTPUT_OUT_OF_RANGE');
  return value === 0 ? 0 : value;
}
function numericalReceipt(r) {
  const value = projected(r), error = minus(r, exact(value));
  return {...fractionJSON(r), rounded_value: value,
    absolute_projection_error: fractionJSON(rational(abs(error.n), error.d)),
    projection: error.n === 0n ? 'EXACT_BINARY64' : value === 0 ? 'BINARY64_UNDERFLOW;EXACT_FRACTION_RETAINED' : 'NEAREST_BINARY64_TIES_TO_EVEN'};
}
function probabilityTotal(values, name) {
  const total = exactSum(values.map(exact)), deviation = minus(total, ONE);
  if (compareExact(rational(abs(deviation.n), deviation.d), exact(PROBABILITY_TOLERANCE)) > 0) {
    fail('PROBABILITIES_MUST_SUM_TO_ONE', name);
  }
  return projected(total);
}

function source(value) {
  object(value, ['namespace', 'native_id', 'version', 'owner', 'content_sha256'], [], 'SOURCE');
  for (const key of ['namespace', 'native_id', 'version', 'owner']) text(value[key], 'SOURCE_' + key, 300);
  if (typeof value.content_sha256 !== 'string' || !HASH.test(value.content_sha256)) fail('INVALID_SOURCE_HASH');
  return {...value};
}

const nativeSourceKey = value => canonical([value.namespace, value.native_id]);
const sourceDifference = (a, b) => ['version', 'owner', 'content_sha256'].filter(field => a[field] !== b[field]);

function observationSourceAlignment(context, observation, observations) {
  const modelSources = new Map(context.model.source_refs.map(s => [nativeSourceKey(s), s]));
  const conflicts = [], matches = [], separatelyNamed = [];
  for (const record of observation.source_refs) {
    const key = nativeSourceKey(record), anchor = modelSources.get(key);
    if (anchor) {
      const mismatches = sourceDifference(anchor, record);
      if (mismatches.length) conflicts.push({namespace: record.namespace, native_id: record.native_id,
        mismatched_fields: mismatches, reference_origin: 'SUPPLIED_MODEL', reference: {...anchor}, observation_source: {...record}});
      else matches.push({namespace: record.namespace, native_id: record.native_id});
    } else {
      separatelyNamed.push({namespace: record.namespace, native_id: record.native_id});
      // When no model record anchors this native identity, conflicting candidate
      // records remain unresolved. Never select a version by string ordering.
      for (const other of observations.flatMap(o => o.source_refs)) {
        if (nativeSourceKey(other) !== key) continue;
        const mismatches = sourceDifference(other, record);
        if (mismatches.length) conflicts.push({namespace: record.namespace, native_id: record.native_id,
          mismatched_fields: mismatches, reference_origin: 'SUPPLIED_OBSERVATION_SET', reference: {...other}, observation_source: {...record}});
      }
    }
  }
  const uniqueConflicts = [...new Map(conflicts.map(c => [canonical(c), c])).values()].sort((a, b) => cmp(canonical(a), canonical(b)));
  return {status: uniqueConflicts.length ? 'SOURCE_ALIGNMENT_UNRESOLVED' : 'DECLARED_SOURCE_ALIGNMENT_NO_CONFLICT',
    conflicts: uniqueConflicts, model_native_matches: matches, separately_named_sources: separatelyNamed,
    source_authentication: false, version_order_inferred: false,
    limitation: 'EXACT_DECLARATION_ALIGNMENT_ONLY;DIFFERENT_NATIVE_NAMES_DO_NOT_ESTABLISH_INDEPENDENCE_OR_AUTHENTICITY'};
}

// Group/display hashes bind identities, but must never select arithmetic order.
const byStateMembership = (a, b) => cmp(canonical(a.states.map(s => s.state_id)), canonical(b.states.map(s => s.state_id)));

function historyKey(actor, history) {
  return canonical({actor_id: actor, observable_history: history});
}

function normalizeModel(input) {
  object(input, ['model_id', 'actor_id', 'source_refs', 'assumptions', 'actions', 'states'], [], 'MODEL');
  id(input.model_id, 'MODEL_ID');
  id(input.actor_id, 'ACTOR_ID');
  const sources = array(input.source_refs, 1, 8, 'SOURCE_REFS').map(source).sort((a, b) => cmp(canonical(a), canonical(b)));
  distinct(sources.map(s => canonical([s.namespace, s.native_id, s.version])), 'SOURCE_VERSION');
  if (new Set(sources.map(nativeSourceKey)).size !== sources.length) fail('MODEL_SOURCE_ALIGNMENT_UNRESOLVED');
  const assumptions = array(input.assumptions, 1, 16, 'ASSUMPTIONS').map(s => text(s, 'ASSUMPTION')).sort(cmp);
  distinct(assumptions, 'ASSUMPTION');
  const actions = array(input.actions, 1, 16, 'ACTIONS').map(a => {
    object(a, ['action_id', 'cost'], [], 'ACTION');
    return {action_id: id(a.action_id, 'ACTION_ID'), cost: number(a.cost, 0, MAX_UTILITY, 'ACTION_COST')};
  }).sort((a, b) => cmp(a.action_id, b.action_id));
  distinct(actions.map(a => a.action_id), 'ACTION_ID');
  const actionIDs = actions.map(a => a.action_id), actionSet = new Set(actionIDs);
  const states = array(input.states, 1, 16, 'STATES').map(s => {
    object(s, ['state_id', 'probability', 'observable_history', 'legal_action_ids', 'payoffs'], [], 'STATE');
    const history = array(s.observable_history, 0, 32, 'HISTORY').map(h => text(h, 'HISTORY_TOKEN', 200));
    const legal = array(s.legal_action_ids, 1, 16, 'LEGAL_ACTIONS').map(a => id(a, 'LEGAL_ACTION_ID')).sort(cmp);
    distinct(legal, 'LEGAL_ACTION');
    if (legal.some(a => !actionSet.has(a))) fail('UNKNOWN_LEGAL_ACTION');
    const payoffs = array(s.payoffs, 1, 16, 'PAYOFFS').map(p => {
      object(p, ['action_id', 'utility'], [], 'PAYOFF');
      return {action_id: id(p.action_id, 'PAYOFF_ACTION_ID'), utility: number(p.utility, -MAX_UTILITY, MAX_UTILITY, 'UTILITY')};
    }).sort((a, b) => cmp(a.action_id, b.action_id));
    distinct(payoffs.map(p => p.action_id), 'PAYOFF_ACTION');
    if (canonical(payoffs.map(p => p.action_id)) !== canonical(actionIDs)) fail('INCOMPLETE_OR_UNKNOWN_PAYOFF_ACTIONS');
    return {state_id: id(s.state_id, 'STATE_ID'), probability: number(s.probability, 0, 1, 'STATE_PROBABILITY'),
      observable_history: history, legal_action_ids: legal, payoffs};
  }).sort((a, b) => cmp(a.state_id, b.state_id));
  distinct(states.map(s => s.state_id), 'STATE_ID');
  const total = probabilityTotal(states.map(s => s.probability), 'PRIOR');
  const totalExact = exactSum(states.map(s => exact(s.probability)));
  const model = {model_id: input.model_id, actor_id: input.actor_id, source_refs: sources, assumptions, actions, states};
  const effectiveExact = new Map(states.map(s => [s.state_id, divide(exact(s.probability), totalExact)]));
  const effective = new Map(states.map(s => [s.state_id, projected(effectiveExact.get(s.state_id))]));
  const costs = new Map(actions.map(a => [a.action_id, a.cost]));
  const netExact = new Map(states.map(s => [s.state_id, new Map(s.payoffs.map(p => [p.action_id, minus(exact(p.utility), exact(costs.get(p.action_id)))]))]));
  const net = new Map(states.map(s => [s.state_id, new Map(s.payoffs.map(p => [p.action_id, projected(netExact.get(s.state_id).get(p.action_id))]))]));
  const groups = new Map();
  for (const state of states) {
    const key = historyKey(model.actor_id, state.observable_history);
    const group = groups.get(key) ?? {information_set_id: 'info:' + hash(JSON.parse(key)),
      observable_history: [...state.observable_history], legal_action_ids: [...state.legal_action_ids], states: []};
    if (canonical(group.legal_action_ids) !== canonical(state.legal_action_ids)) fail('UNEQUAL_LEGAL_ACTIONS_WITHIN_INFORMATION_SET', state.state_id);
    group.states.push(state);
    groups.set(key, group);
  }
  return {model, groups: [...groups.values()].sort(byStateMembership), effective, effectiveExact, net, netExact,
    probability_total: total, probabilityTotalExact: totalExact};
}

function normalizePolicy(policy, context) {
  const rows = array(policy, context.model.states.length, context.model.states.length, 'POLICY').map(row => {
    object(row, ['state_id', 'distribution'], [], 'POLICY_ROW');
    const stateID = id(row.state_id, 'POLICY_STATE_ID');
    const state = context.model.states.find(s => s.state_id === stateID);
    if (!state) fail('UNKNOWN_POLICY_STATE', stateID);
    const distribution = array(row.distribution, 1, 16, 'POLICY_DISTRIBUTION').map(d => {
      object(d, ['action_id', 'probability'], [], 'POLICY_ACTION');
      return {action_id: id(d.action_id, 'POLICY_ACTION_ID'), probability: number(d.probability, 0, 1, 'POLICY_PROBABILITY')};
    }).sort((a, b) => cmp(a.action_id, b.action_id));
    distinct(distribution.map(d => d.action_id), 'POLICY_ACTION');
    if (canonical(distribution.map(d => d.action_id)) !== canonical(state.legal_action_ids)) fail('POLICY_LEGAL_ACTION_COVERAGE', stateID);
    const total = probabilityTotal(distribution.map(d => d.probability), 'POLICY:' + stateID);
    const totalExact = exactSum(distribution.map(d => exact(d.probability)));
    return {state_id: stateID, distribution, probability_total: total,
      probability_total_exact: fractionJSON(totalExact),
      effective_distribution: distribution.map(d => ({action_id: d.action_id, probability: projected(divide(exact(d.probability), totalExact))})),
      effective_distribution_exact: distribution.map(d => ({action_id: d.action_id, probability: fractionJSON(divide(exact(d.probability), totalExact))}))};
  }).sort((a, b) => cmp(a.state_id, b.state_id));
  distinct(rows.map(r => r.state_id), 'POLICY_STATE');
  const byState = new Map(rows.map(r => [r.state_id, r]));
  for (const group of context.groups) {
    const expected = canonical(byState.get(group.states[0].state_id).effective_distribution_exact);
    if (group.states.some(s => canonical(byState.get(s.state_id).effective_distribution_exact) !== expected)) {
      fail('HIDDEN_STATE_DEPENDENT_POLICY', group.information_set_id);
    }
  }
  return rows;
}

function envelope(context, request) {
  return {
    version: VERSION, model_fingerprint: hash(context.model),
    source_fingerprint: hash(context.model.source_refs), request_fingerprint: hash(request),
    supplied_model: copy(context.model),
    probability_accounting: {
      supplied_total: context.probability_total,
      supplied_total_exact: numericalReceipt(context.probabilityTotalExact),
      normalization_applied: compareExact(context.probabilityTotalExact, ONE) !== 0,
      effective_probabilities: context.model.states.map(s => ({state_id: s.state_id, probability: context.effective.get(s.state_id)})),
      rule: 'REQUIRE_SUPPLIED_TOTAL_WITHIN_1E-12_OF_ONE_THEN_DIVIDE_BY_EXACT_BINARY64_INPUT_TOTAL;NO_INFERRED_PRIOR'
    },
    arithmetic: {internal: 'EXACT_RATIONAL_OPERATIONS_ON_SUPPLIED_BINARY64_VALUES',
      output: 'NEAREST_BINARY64_TIES_TO_EVEN_WITH_EXACT_FRACTIONS_AND_PROJECTION_ERRORS',
      native_harsanyi: 'ACTUAL_LOCAL_CROSS_CHECK;ORIGINAL_RECEIPT_UNCHANGED',
      grouping: 'CANONICAL_STATE_MEMBERSHIP;DISPLAY_LABELS_AND_HASHES_NEVER_ORDER_NUMERIC_AGGREGATION',
      source_measurement_precision_inferred: false},
    boundaries: {source_authentication: false, actor_access_verified: false, probabilities_inferred: false,
      cfr_performed: false, game_equilibrium_computed: false, target_actions_performed: false,
      canonical_promotion: false, registry_mutation: false, persisted: false},
    scope: 'FINITE_SUPPLIED_SINGLE_DECISION_MODEL;OBSERVABLE_HISTORY_AND_ACCESS_ARE_CALLER_DECLARED'
  };
}

/** Validate a complete state-indexed behavioral policy before arithmetic.
 * Policy rows must include every legal action, including zero-probability ones.
 * Even zero-prior-mass states cannot secretly use unavailable information.
 */
export function validateFiniteInformationPolicy(input) {
  object(input, ['model', 'policy'], [], 'POLICY_REQUEST');
  const context = normalizeModel(input.model);
  const policy = normalizePolicy(input.policy, context);
  return {...envelope(context, {model: context.model, policy}),
    status: 'INFORMATION_POLICY_ADMISSIBLE_IN_SUPPLIED_MODEL', policy_fingerprint: hash(policy),
    normalized_policy: copy(policy),
    information_sets: context.groups.map(g => ({information_set_id: g.information_set_id,
      observable_history: [...g.observable_history], state_ids: g.states.map(s => s.state_id),
      legal_action_ids: [...g.legal_action_ids], prior_mass: projected(exactSum(g.states.map(s => context.effectiveExact.get(s.state_id))))}))};
}

async function optimizeGroups(context, groups) {
  const results = [], exactWeightedValues = [];
  for (const group of [...groups].sort(byStateMembership)) {
    const massExact = exactSum(group.states.map(s => context.effectiveExact.get(s.state_id)));
    const mass = projected(massExact);
    if (massExact.n === 0n) {
      results.push({information_set_id: group.information_set_id,
        observable_history: [...group.observable_history], observation_id: group.observation_id ?? null,
        observed_outcome_id: group.observed_outcome_id ?? null,
        state_ids: group.states.map(s => s.state_id), prior_mass: 0, posterior: null,
        status: 'ZERO_PROBABILITY_INFORMATION_SET', best_conditional_utility: null,
        weighted_utility: 0, optimal_action_ids: [], chosen_action_id: null,
        action_values: [], native_evaluation: null,
        numerical_accounting: {prior_mass: numericalReceipt(ZERO), weighted_utility: numericalReceipt(ZERO)}});
      continue;
    }
    const posterior = group.states.map(s => ({id: s.state_id, probability: projected(divide(context.effectiveExact.get(s.state_id), massExact))}));
    const native = await evaluateMethod({method: 'harsanyi', input: {states: posterior,
      actions: group.legal_action_ids.map(action_id => ({id: action_id,
        payoffs: group.states.map(s => context.net.get(s.state_id).get(action_id))}))}});
    // Maximize unnormalized weighted utility: the positive information-set
    // mass is common to every legal action. This avoids rounding posterior
    // probabilities or multiplying rounded conditional means back by mass.
    const actionWeights = group.legal_action_ids.map(action_id => ({action_id,
      weighted: exactSum(group.states.map(s => times(context.effectiveExact.get(s.state_id), context.netExact.get(s.state_id).get(action_id))))}));
    const bestWeight = actionWeights.reduce((best, row) => compareExact(row.weighted, best) > 0 ? row.weighted : best, actionWeights[0].weighted);
    const maximizers = actionWeights.filter(row => compareExact(row.weighted, bestWeight) === 0).map(row => row.action_id).sort(cmp);
    const bestExact = divide(bestWeight, massExact), best = projected(bestExact);
    const values = actionWeights.map(row => ({id: row.action_id,
      expected_utility: projected(divide(row.weighted, massExact)),
      exact_expected_utility: fractionJSON(divide(row.weighted, massExact))}));
    exactWeightedValues.push(bestWeight);
    results.push({information_set_id: group.information_set_id,
      observable_history: [...group.observable_history], observation_id: group.observation_id ?? null,
      observed_outcome_id: group.observed_outcome_id ?? null,
      state_ids: group.states.map(s => s.state_id), prior_mass: mass,
      posterior: posterior.map(p => ({state_id: p.id, probability: p.probability})),
      status: 'FINITE_POSTERIOR_DECISION', best_conditional_utility: best,
      weighted_utility: projected(bestWeight), optimal_action_ids: maximizers,
      chosen_action_id: maximizers[0], action_values: values,
      native_evaluation: native,
      numerical_accounting: {prior_mass: numericalReceipt(massExact),
        best_conditional_utility: numericalReceipt(bestExact), weighted_utility: numericalReceipt(bestWeight),
        native_maximizers_agree: canonical([...native.result.maximizers].sort(cmp)) === canonical(maximizers),
        native_utility_residuals: values.map(v => ({action_id: v.id,
          exact_refined_minus_native: fractionJSON(minus(fromFractionJSON(v.exact_expected_utility),
            exact(native.result.values.find(n => n.id === v.id).expected_utility)))}))}});
  }
  const expected = exactSum(exactWeightedValues);
  return {expected_utility: projected(expected), expected_exact: expected, information_sets: results};
}

function nonnegativeDifference(high, low, name) {
  const difference = minus(high, low);
  if (difference.n < 0n) fail('EXACT_INFORMATION_BOUND_VIOLATION', name);
  return difference;
}

/** Compare the best actor-admissible policy, an optional supplied policy, and
 * an explicitly unattainable omniscient bound. Action cost is subtracted once.
 */
export async function compareFiniteDecisions(input) {
  object(input, ['model'], ['policy'], 'DECISION_REQUEST');
  const context = normalizeModel(input.model);
  const policy = Object.hasOwn(input, 'policy') ? normalizePolicy(input.policy, context) : null;
  const optimal = await optimizeGroups(context, context.groups);
  const omniscient = exactSum(context.model.states.map(s => {
    const utilities = s.legal_action_ids.map(a => context.netExact.get(s.state_id).get(a));
    const best = utilities.reduce((a, b) => compareExact(a, b) >= 0 ? a : b);
    return times(context.effectiveExact.get(s.state_id), best);
  }));
  const value = policy === null ? null : exactSum(policy.map(row => times(context.effectiveExact.get(row.state_id),
    exactSum(row.effective_distribution_exact.map(d => times(fromFractionJSON(d.probability), context.netExact.get(row.state_id).get(d.action_id)))))));
  const regret = value === null ? null : nonnegativeDifference(optimal.expected_exact, value, 'SUPPLIED_POLICY');
  const gap = nonnegativeDifference(omniscient, optimal.expected_exact, 'OMNISCIENT_BOUND');
  return {...envelope(context, {model: context.model, policy}),
    status: 'FINITE_INFORMATION_DECISION_COMPARISON', native_method_used: 'harsanyi',
    optimal_admissible_expected_utility: optimal.expected_utility,
    supplied_policy_expected_utility: value === null ? null : projected(value),
    supplied_policy_fingerprint: policy === null ? null : hash(policy),
    normalized_supplied_policy: policy === null ? null : copy(policy),
    supplied_policy_regret: regret === null ? null : projected(regret),
    omniscient_upper_bound: projected(omniscient),
    information_gap: projected(gap),
    numerical_accounting: {optimal_admissible_expected_utility: numericalReceipt(optimal.expected_exact),
      supplied_policy_expected_utility: value === null ? null : numericalReceipt(value),
      supplied_policy_regret: regret === null ? null : numericalReceipt(regret),
      omniscient_upper_bound: numericalReceipt(omniscient), information_gap: numericalReceipt(gap)},
    omniscient_bound_is_policy_recommendation: false,
    optimal_information_sets: optimal.information_sets,
    utility_rule: 'SUPPLIED_PAYOFF_MINUS_ACTION_COST;NO_OBSERVATION_COST_IN_THIS_COMPARISON',
    tie_rule: 'RETAIN_ALL_EXACT_TIES;LEXICOGRAPHIC_ACTION_ID_SELECTS_ONE'
  };
}

function normalizeObservations(input, context) {
  const stateIDs = context.model.states.map(s => s.state_id), stateSet = new Set(stateIDs);
  const observations = array(input, 0, 16, 'OBSERVATIONS').map(o => {
    object(o, ['observation_id', 'actor_id', 'access_state', 'available_before_action', 'cost', 'source_refs', 'partition'], [], 'OBSERVATION');
    id(o.observation_id, 'OBSERVATION_ID');
    id(o.actor_id, 'OBSERVATION_ACTOR_ID');
    if (!['AVAILABLE', 'MISSING', 'UNKNOWN'].includes(o.access_state)) fail('INVALID_OBSERVATION_ACCESS_STATE');
    if (typeof o.available_before_action !== 'boolean') fail('INVALID_OBSERVATION_TIMING');
    const sources = array(o.source_refs, 1, 8, 'OBSERVATION_SOURCES').map(source).sort((a, b) => cmp(canonical(a), canonical(b)));
    distinct(sources.map(s => canonical([s.namespace, s.native_id, s.version])), 'OBSERVATION_SOURCE_VERSION');
    const partition = array(o.partition, 1, stateIDs.length, 'PARTITION').map(cell => {
      object(cell, ['outcome_id', 'state_ids'], [], 'PARTITION_CELL');
      const ids = array(cell.state_ids, 1, stateIDs.length, 'PARTITION_STATES').map(s => id(s, 'PARTITION_STATE_ID')).sort(cmp);
      distinct(ids, 'PARTITION_CELL_STATE');
      if (ids.some(s => !stateSet.has(s))) fail('UNKNOWN_PARTITION_STATE');
      return {outcome_id: id(cell.outcome_id, 'PARTITION_OUTCOME_ID'), state_ids: ids};
    }).sort((a, b) => cmp(a.outcome_id, b.outcome_id));
    distinct(partition.map(c => c.outcome_id), 'PARTITION_OUTCOME');
    const flattened = partition.flatMap(c => c.state_ids).sort(cmp);
    if (canonical(flattened) !== canonical(stateIDs)) fail('PARTITION_MUST_COVER_EACH_STATE_EXACTLY_ONCE');
    return {observation_id: o.observation_id, actor_id: o.actor_id, access_state: o.access_state,
      available_before_action: o.available_before_action,
      cost: number(o.cost, 0, MAX_UTILITY, 'OBSERVATION_COST'), source_refs: sources, partition};
  }).sort((a, b) => cmp(a.observation_id, b.observation_id));
  distinct(observations.map(o => o.observation_id), 'OBSERVATION_ID');
  return observations;
}

function refineGroups(context, observation) {
  const signal = new Map(observation.partition.flatMap(cell => cell.state_ids.map(id => [id, cell.outcome_id])));
  const groups = [];
  for (const prior of context.groups) {
    const cells = new Map();
    for (const state of prior.states) {
      const outcome = signal.get(state.state_id);
      const cell = cells.get(outcome) ?? {information_set_id: 'info:' + hash({prior: prior.information_set_id,
        observation: observation.observation_id, outcome}), observable_history: [...prior.observable_history],
        observation_id: observation.observation_id, observed_outcome_id: outcome,
        legal_action_ids: [...prior.legal_action_ids], states: []};
      cell.states.push(state);
      cells.set(outcome, cell);
    }
    groups.push(...cells.values());
  }
  return groups.sort(byStateMembership);
}

/** Rank complete deterministic observation partitions by decision value.
 * EVSI = posterior optimum - prior optimum. Net EVSI then subtracts the
 * supplied observation cost. Unknown/missing/other-actor/late observations
 * stay blocked and never receive an actionable information value.
 */
export async function rankObservationPartitions(input) {
  object(input, ['model', 'observations'], [], 'OBSERVATION_REQUEST');
  const context = normalizeModel(input.model);
  const observations = normalizeObservations(input.observations, context);
  const prior = await optimizeGroups(context, context.groups);
  const ranked = [], blocked = [], netValues = new Map();
  for (const observation of observations) {
    const alignment = observationSourceAlignment(context, observation, observations);
    const reason = observation.actor_id !== context.model.actor_id ? 'BLOCKED_DIFFERENT_ACTOR' :
      observation.access_state !== 'AVAILABLE' ? 'BLOCKED_OBSERVATION_' + observation.access_state :
      !observation.available_before_action ? 'BLOCKED_OBSERVATION_AFTER_ACTION' :
      alignment.status === 'SOURCE_ALIGNMENT_UNRESOLVED' ? 'BLOCKED_SOURCE_ALIGNMENT_UNRESOLVED' : null;
    const metadata = {observation_id: observation.observation_id,
      observation_fingerprint: hash(observation), supplied_observation: copy(observation),
      prior_optimal_expected_utility: prior.expected_utility, observation_cost: observation.cost,
      access_basis: 'CALLER_DECLARED_NOT_AUTHENTICATED', source_alignment: alignment};
    if (reason) {
      blocked.push({...metadata, status: reason, posterior_optimal_expected_utility: null,
        gross_evsi: null, net_evsi: null, refined_information_sets: []});
      continue;
    }
    const posterior = await optimizeGroups(context, refineGroups(context, observation));
    const gross = nonnegativeDifference(posterior.expected_exact, prior.expected_exact, 'EVSI');
    const net = minus(gross, exact(observation.cost));
    netValues.set(observation.observation_id, net);
    ranked.push({...metadata, status: 'FINITE_OBSERVATION_VALUE_COMPUTED',
      posterior_optimal_expected_utility: posterior.expected_utility,
      gross_evsi: projected(gross), net_evsi: projected(net),
      expected_utility_after_observation_cost: projected(minus(posterior.expected_exact, exact(observation.cost))),
      numerical_accounting: {prior_utility: numericalReceipt(prior.expected_exact),
        posterior_utility: numericalReceipt(posterior.expected_exact), gross_evsi: numericalReceipt(gross), net_evsi: numericalReceipt(net)},
      refined_information_sets: posterior.information_sets});
  }
  ranked.sort((a, b) => compareExact(netValues.get(b.observation_id), netValues.get(a.observation_id)) ||
    a.observation_cost - b.observation_cost || cmp(a.observation_id, b.observation_id));
  const best = ranked.length ? netValues.get(ranked[0].observation_id) : ZERO;
  return {...envelope(context, {model: context.model, observations}),
    status: 'FINITE_OBSERVATION_PARTITIONS_RANKED', native_method_used: 'harsanyi',
    prior_optimal_expected_utility: prior.expected_utility, prior_information_sets: prior.information_sets,
    ranked_observations: ranked, blocked_observations: blocked,
    best_positive_observation_ids: best.n > 0n ? ranked.filter(r => compareExact(netValues.get(r.observation_id), best) === 0).map(r => r.observation_id) : [],
    selected_option: best.n > 0n ? ranked[0].observation_id : 'NO_OBSERVATION',
    no_observation_net_evsi: 0,
    value_rule: 'DETERMINISTIC_PARTITION;POSTERIOR_BEST_NET_ACTION_UTILITY_MINUS_PRIOR_BEST_NET_ACTION_UTILITY_MINUS_OBSERVATION_COST',
    preserves_prior_information: true, observation_performed: false,
    prior_numerical_accounting: numericalReceipt(prior.expected_exact),
    limitations: ['All probabilities, utility scales, costs, actor visibility and access are supplied assumptions.',
      'A zero-probability cell has no posterior and contributes zero; policy consistency still applies to its states.',
      'Exact rational arithmetic interprets the supplied binary64 inputs; it does not infer measurement precision or decimal intent. Native Harsanyi floating receipts remain unchanged and any numerical residual is disclosed.',
      'No stochastic observation likelihood, sequential search, adversarial equilibrium, CFR or general poker solution is computed.']
  };
}
