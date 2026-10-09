// Additive local review of two existing native numerical contracts. The native
// receipt is retained verbatim as data; exact results are a separate refinement
// of supplied binary64 values, never a claim about intended decimal values.
import {getMethodCatalog} from './methods.mjs';
import {validate} from './schema.mjs';
import {canonical, digest} from './universal.mjs';

const VERSION = 'MPC_EXACT_NATIVE_NUMERICAL_REVIEW_V1';
const NATIVE_VERSION = '1.2.0';
const fail = code => { throw Error(code); };
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const abs = n => n < 0n ? -n : n;
const ZERO = Object.freeze({n: 0n, d: 1n});
const ONE = Object.freeze({n: 1n, d: 1n});

export const exactNativeNumericalReviewContract = Object.freeze({
  version: VERSION,
  native_implementation_version: NATIVE_VERSION,
  methods: Object.freeze(['nash', 'conservation']),
  nash_scope: 'EXACT_2X2_INDIFFERENCE_AND_PURE_EQUILIBRIA;DEGENERATE_FAMILIES_NOT_ENUMERATED',
  conservation_scope: 'EXACT_SUPPLIED_OPENING_PLUS_INFLOWS_MINUS_OUTFLOWS_AND_TOLERANCE',
  arithmetic: 'EXACT_RATIONAL_SUPPLIED_BINARY64;NEAREST_BINARY64_TIES_TO_EVEN_DISPLAY',
  projection_comparison: 'NEAREST_COMPONENTS_OR_NEAREST_FIRST_COMPONENT_WITH_BINARY64_COMPLEMENT',
  native_method_calls_made: 0,
  source_authentication: false,
  native_receipt_authentication: false,
  canonical_registry_mutation: false,
  external_actions: false
});

// Snapshot JSON-shaped data before the asynchronous fingerprint operation. This
// also prevents sparse arrays or non-data properties from changing the meaning
// of the native JSON schema when called directly from Node.
function snapshot(value, depth = 0, budget = {remaining: 10000}) {
  if (depth > 32 || --budget.remaining < 0) fail('NUMERICAL_REVIEW_JSON_BOUNDS');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('NUMERICAL_REVIEW_NONFINITE_NUMBER');
    return value;
  }
  if (!value || typeof value !== 'object') fail('NUMERICAL_REVIEW_JSON_REQUIRED');
  const isArray = Array.isArray(value);
  if (isArray ? Object.getPrototypeOf(value) !== Array.prototype :
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('NUMERICAL_REVIEW_JSON_REQUIRED');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (isArray && value.length > 1024) fail('NUMERICAL_REVIEW_JSON_BOUNDS');
  const result = isArray ? [] : {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (isArray && key === 'length') continue;
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') ||
      (isArray && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length))) fail('NUMERICAL_REVIEW_JSON_REQUIRED');
    Object.defineProperty(result, key, {value: snapshot(descriptor.value, depth + 1, budget),
      enumerable: true, writable: true, configurable: true});
  }
  if (isArray && (result.length !== value.length || Object.keys(result).length !== value.length)) fail('NUMERICAL_REVIEW_SPARSE_ARRAY');
  return result;
}

function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
function rational(n, d = 1n) {
  if (d === 0n) fail('NUMERICAL_REVIEW_ZERO_DENOMINATOR');
  if (n === 0n) return ZERO;
  if (d < 0n) {n = -n; d = -d;}
  const divisor = gcd(abs(n), d);
  return {n: n / divisor, d: d / divisor};
}
function exact(value) {
  if (value === 0) return ZERO;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  const bits = view.getBigUint64(0, false), exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const significand = (bits >> 63n ? -1n : 1n) * (exponent === 0 ? fraction : (1n << 52n) + fraction);
  const power = exponent === 0 ? -1074 : exponent - 1023 - 52;
  return power < 0 ? rational(significand, 1n << BigInt(-power)) : rational(significand << BigInt(power));
}
const plus = (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
const minus = (a, b) => rational(a.n * b.d - b.n * a.d, a.d * b.d);
const times = (a, b) => rational(a.n * b.n, a.d * b.d);
const divide = (a, b) => rational(a.n * b.d, a.d * b.n);
const compare = (a, b) => cmp(a.n * b.d, b.n * a.d);
const sum = values => values.reduce(plus, ZERO);
const magnitude = r => rational(abs(r.n), r.d);
const fractionJSON = r => ({numerator: String(r.n), denominator: String(r.d)});

function roundedInteger(n, d) {
  const q = n / d, remainder = n % d;
  return q + (2n * remainder > d || (2n * remainder === d && (q & 1n)) ? 1n : 0n);
}
function projected(r) {
  if (r.n === 0n) return 0;
  const sign = r.n < 0n ? -1 : 1, n = abs(r.n), d = r.d;
  let exponent = n.toString(2).length - d.toString(2).length;
  if (exponent >= 0 ? n < (d << BigInt(exponent)) : (n << BigInt(-exponent)) < d) exponent--;
  if (exponent < -1022) {
    const value = sign * Number(roundedInteger(n << 1074n, d)) * Number.MIN_VALUE;
    return value === 0 ? 0 : value;
  }
  if (exponent > 1023) return null;
  const shift = 52 - exponent;
  const significand = shift >= 0 ? roundedInteger(n << BigInt(shift), d) : roundedInteger(n, d << BigInt(-shift));
  const value = sign * Number(significand) * 2 ** (exponent - 52);
  return Number.isFinite(value) ? value : null;
}
function numericalReceipt(r) {
  const value = projected(r);
  if (value === null) return {...fractionJSON(r), rounded_value: null, absolute_projection_error: null,
    projection: 'BINARY64_OVERFLOW;EXACT_FRACTION_RETAINED'};
  const error = magnitude(minus(r, exact(value)));
  return {...fractionJSON(r), rounded_value: value, absolute_projection_error: fractionJSON(error),
    projection: error.n === 0n ? 'EXACT_BINARY64' : value === 0 ?
      'BINARY64_UNDERFLOW;EXACT_FRACTION_RETAINED' : 'NEAREST_BINARY64_TIES_TO_EVEN'};
}

const string = {type: 'string', minLength: 1, maxLength: 10000};
const finite = {type: 'number'};
const flag = {type: 'boolean'};
const falseFlag = {type: 'boolean', enum: [false]};
const array = (items, minItems, maxItems) => ({type: 'array', items, minItems, maxItems});
const object = (properties, additionalProperties = false) => ({type: 'object', properties,
  required: Object.keys(properties), additionalProperties});
const probabilityPair = array({type: 'number', minimum: 0, maximum: 1}, 2, 2);
const nashResultSchema = object({
  pure_equilibria: array(object({row: {type: 'integer', minimum: 0, maximum: 7},
    column: {type: 'integer', minimum: 0, maximum: 7}, payoffs: array(finite, 2, 2)}), 0, 64),
  strict_interior_mixed: {...object({row_probabilities: probabilityPair, column_probabilities: probabilityPair}), type: ['object', 'null']},
  mixed_status: {type: 'string', enum: ['NOT_COMPUTED_FOR_THIS_SIZE', 'DEGENERATE_OR_NO_STRICT_INTERIOR_SOLUTION', 'STRICT_INTERIOR_SOLUTION']},
  index_base: {type: 'integer', enum: [0]}, numeric_model: string
});
const conservationResultSchema = object({unit: string, expected_closing: finite, observed_closing: finite,
  residual: finite, within_supplied_tolerance: flag, causation_established: falseFlag});

function reviewConservation(input, result) {
  const expected = minus(plus(exact(input.opening), sum(input.inflows.map(exact))), sum(input.outflows.map(exact)));
  const closing = exact(input.closing), residual = minus(closing, expected), tolerance = exact(input.tolerance);
  const within = compare(magnitude(residual), tolerance) <= 0;
  const errors = {expected_closing: minus(exact(result.expected_closing), expected),
    residual: minus(exact(result.residual), residual)};
  const projectionMatches = {expected_closing: result.expected_closing === projected(expected),
    residual: result.residual === projected(residual)};
  const metadataMatches = result.unit === input.unit && result.observed_closing === input.closing;
  const beyondProjection = !metadataMatches || Object.values(projectionMatches).some(x => !x);
  const decisionMatches = result.within_supplied_tolerance === within;
  const classification = !metadataMatches ? 'NATIVE_RESULT_METADATA_DISAGREEMENT' : !decisionMatches ?
    (within ? 'NATIVE_TOLERANCE_FALSE_FAIL' : 'NATIVE_TOLERANCE_FALSE_PASS') : beyondProjection ?
      'NATIVE_NUMERICAL_DISAGREEMENT_BEYOND_PROJECTION' : Object.values(errors).some(r => r.n !== 0n) ?
        'BINARY64_PROJECTION_ONLY' : 'EXACT_AGREEMENT';
  return {exact_result: {unit: input.unit, expected_closing: numericalReceipt(expected), observed_closing: numericalReceipt(closing),
    residual: numericalReceipt(residual), tolerance: numericalReceipt(tolerance), within_supplied_tolerance: within,
    causation_established: false}, comparison: {classification, native_differs_beyond_projection: beyondProjection,
    native_tolerance_decision_matches_exact: decisionMatches, native_result_metadata_matches: metadataMatches,
    native_values_match_nearest_projection: projectionMatches,
    native_minus_exact: Object.fromEntries(Object.entries(errors).map(([key, r]) => [key, numericalReceipt(r)]))}};
}

// Solve x*difference_at_one + (1-x)*difference_at_zero = 0 exactly.
function indifference(atOne, atZero) {
  const slope = minus(atOne, atZero);
  if (slope.n === 0n) return {status: atZero.n === 0n ? 'ALL_PROBABILITIES' : 'NO_PROBABILITY', value: null, atOne, atZero, slope};
  const value = divide(minus(ZERO, atZero), slope);
  const lower = compare(value, ZERO), upper = compare(value, ONE);
  return {status: lower > 0 && upper < 0 ? 'UNIQUE_INTERIOR_PROBABILITY' : lower === 0 || upper === 0 ?
    'BOUNDARY_PROBABILITY' : 'OUTSIDE_PROBABILITY_SIMPLEX', value, atOne, atZero, slope};
}
const permitsInterior = equation => ['ALL_PROBABILITIES', 'UNIQUE_INTERIOR_PROBABILITY'].includes(equation.status);
const equationReceipt = equation => ({status: equation.status, probability: equation.value ? numericalReceipt(equation.value) : null,
  payoff_difference_at_zero: numericalReceipt(equation.atZero), payoff_difference_at_one: numericalReceipt(equation.atOne),
  slope: numericalReceipt(equation.slope)});
const pureKey = value => canonical([value.row, value.column, value.payoffs]);

function probabilityReview(native, exactFirst) {
  const values = [exactFirst, minus(ONE, exactFirst)], firstProjection = projected(exactFirst);
  return native.map((value, i) => {
    const error = minus(exact(value), values[i]);
    const classification = error.n === 0n ? 'EXACT_BINARY64' : value === projected(values[i]) ?
      'NEAREST_BINARY64_PROJECTION' : i === 1 && native[0] === firstProjection && value === 1 - firstProjection ?
        'COMPLEMENT_OF_NEAREST_FIRST_PROBABILITY' : 'DIFFERENCE_BEYOND_PROJECTION';
    return {native_value: value, native_minus_exact: numericalReceipt(error), classification};
  });
}

function nativeIndifference(input, profile) {
  const rowWeights = profile.row_probabilities.map(exact), columnWeights = profile.column_probabilities.map(exact);
  const rowValues = input.row_payoffs.map(row => sum(row.map((value, i) => times(exact(value), columnWeights[i]))));
  const columnValues = [0, 1].map(j => sum(input.column_payoffs.map((row, i) => times(exact(row[j]), rowWeights[i]))));
  const rowDifference = minus(rowValues[0], rowValues[1]), columnDifference = minus(columnValues[0], columnValues[1]);
  return {row_payoff_difference: numericalReceipt(rowDifference), column_payoff_difference: numericalReceipt(columnDifference),
    preferred_row: rowDifference.n === 0n ? null : rowDifference.n > 0n ? 0 : 1,
    preferred_column: columnDifference.n === 0n ? null : columnDifference.n > 0n ? 0 : 1,
    row_probability_total: numericalReceipt(sum(rowWeights)), column_probability_total: numericalReceipt(sum(columnWeights)),
    probability_totals_normalized: false,
    interpretation: 'EXACT_WEIGHTED_PAYOFF_DIFFERENCES_AT_REPORTED_COMPONENTS;PROJECTION_ALONE_CAN_PRODUCE_NONZERO_RESIDUALS'};
}

function reviewNash(input, result) {
  if (input.row_payoffs.length !== 2 || input.row_payoffs[0].length !== 2) return {
    exact_result: null, comparison: {classification: 'NOT_REVIEWED_OUTSIDE_2X2', native_differs_beyond_projection: null},
    review_scope: 'NOT_APPLICABLE_OUTSIDE_2X2'};
  const A = input.row_payoffs.map(row => row.map(exact)), B = input.column_payoffs.map(row => row.map(exact));
  const q = indifference(minus(A[0][0], A[1][0]), minus(A[0][1], A[1][1]));
  const p = indifference(minus(B[0][0], B[0][1]), minus(B[1][0], B[1][1]));
  const interiorExists = permitsInterior(p) && permitsInterior(q);
  const uniqueInterior = interiorExists && p.value !== null && q.value !== null;
  const mixed = uniqueInterior ? {row_probabilities: [p.value, minus(ONE, p.value)].map(numericalReceipt),
    column_probabilities: [q.value, minus(ONE, q.value)].map(numericalReceipt)} : null;
  const pure = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    if (A.every(row => compare(row[j], A[i][j]) <= 0) && B[i].every(value => compare(value, B[i][j]) <= 0)) {
      pure.push({row: i, column: j, payoffs: [input.row_payoffs[i][j], input.column_payoffs[i][j]]});
    }
  }
  const pureMatches = canonical(pure.map(pureKey).sort()) === canonical(result.pure_equilibria.map(pureKey).sort());
  const nativeProfile = result.strict_interior_mixed;
  const residuals = nativeProfile ? nativeIndifference(input, nativeProfile) : null;
  const reviews = uniqueInterior && nativeProfile ? {row_probabilities: probabilityReview(nativeProfile.row_probabilities, p.value),
    column_probabilities: probabilityReview(nativeProfile.column_probabilities, q.value)} : null;
  let classification, beyondProjection = false;
  if (uniqueInterior && nativeProfile) {
    const components = Object.values(reviews).flat();
    beyondProjection = components.some(x => x.classification === 'DIFFERENCE_BEYOND_PROJECTION');
    classification = beyondProjection ? 'NATIVE_NUMERICAL_DISAGREEMENT_BEYOND_PROJECTION' :
      components.every(x => x.classification === 'EXACT_BINARY64') ? 'EXACT_AGREEMENT' : 'BINARY64_PROJECTION_ONLY';
  } else if (uniqueInterior) {
    const reachesBoundary = [...mixed.row_probabilities, ...mixed.column_probabilities].some(x => x.rounded_value === 0 || x.rounded_value === 1);
    classification = reachesBoundary ? 'EXACT_INTERIOR_SOLUTION_ROUNDS_TO_BOUNDARY' : 'NATIVE_INTERIOR_SOLUTION_NOT_REPORTED';
    beyondProjection = !reachesBoundary;
  } else if (interiorExists) {
    if (!nativeProfile) classification = 'DEGENERATE_INTERIOR_FAMILY_OUTSIDE_NATIVE_MIXED_SCOPE';
    else {
      beyondProjection = residuals.row_payoff_difference.numerator !== '0' || residuals.column_payoff_difference.numerator !== '0';
      classification = beyondProjection ? 'NATIVE_NUMERICAL_DISAGREEMENT_BEYOND_PROJECTION' : 'DEGENERATE_INTERIOR_PROFILE_EXACTLY_VALID';
    }
  } else {
    beyondProjection = nativeProfile !== null;
    classification = beyondProjection ? 'NATIVE_INTERIOR_EXISTENCE_DISAGREEMENT' : 'EXACT_AGREEMENT';
  }
  return {exact_result: {pure_equilibria: pure, row_indifference: equationReceipt(q), column_indifference: equationReceipt(p),
    strict_interior_mixed_exists: interiorExists, mixed_status: uniqueInterior ? 'UNIQUE_STRICT_INTERIOR_SOLUTION' :
      interiorExists ? 'DEGENERATE_STRICT_INTERIOR_FAMILY_NOT_ENUMERATED' : 'NO_STRICT_INTERIOR_SOLUTION',
    strict_interior_mixed: mixed}, comparison: {classification: pureMatches ? classification : 'NATIVE_PURE_EQUILIBRIA_DISAGREEMENT',
    mixed_classification: classification, native_differs_beyond_projection: beyondProjection || !pureMatches,
    pure_equilibria_match: pureMatches, probability_reviews: reviews, native_indifference_residuals: residuals,
    conditioning_review_required: beyondProjection,
    conditioning_attribution: 'A_DIFFERENCE_BEYOND_PROJECTION_DOES_NOT_BY_ITSELF_IDENTIFY_ITS_CAUSE'}};
}

export async function verifyNativeNumericalReceipt(request) {
  const args = snapshot(request);
  validate(args, object({method: {type: 'string', enum: ['nash', 'conservation']}, input: {type: 'object'}, native_receipt: {type: 'object'}}));
  const {method, input, native_receipt: nativeReceipt} = args;
  validate(input, getMethodCatalog({method}).input_schemas[method]);
  if (method === 'nash') {
    const rows = input.row_payoffs.length, columns = input.row_payoffs[0].length;
    if (input.column_payoffs.length !== rows || [...input.row_payoffs, ...input.column_payoffs].some(row => row.length !== columns)) {
      fail('RECTANGULAR_MATCHING_MATRICES_REQUIRED');
    }
  }
  validate(nativeReceipt, object({status: {type: 'string', enum: ['BOUNDED_MODEL_RESULT']},
    method: {type: 'string', enum: [method]}, implementation_version: {type: 'string', enum: [NATIVE_VERSION]},
    model_fingerprint: {type: 'string', minLength: 64, maxLength: 64},
    result: method === 'nash' ? nashResultSchema : conservationResultSchema,
    limitations: string, source_authentication: falseFlag, canonical_promotion: falseFlag,
    court_release_allowed: falseFlag, external_action_authorized: falseFlag}, true));
  const modelFingerprint = await digest({method, input});
  if (nativeReceipt.model_fingerprint !== modelFingerprint) fail('NATIVE_RECEIPT_INPUT_FINGERPRINT_MISMATCH');
  if (method === 'nash') {
    const result = nativeReceipt.result;
    if ((result.strict_interior_mixed !== null) !== (result.mixed_status === 'STRICT_INTERIOR_SOLUTION')) fail('NATIVE_NASH_STATUS_PROFILE_MISMATCH');
    // The native guard checks the first probability. Its rounded complement
    // can equal one for a subnormal first component; retain and review it.
    if (result.strict_interior_mixed && [result.strict_interior_mixed.row_probabilities[0],
      result.strict_interior_mixed.column_probabilities[0]].some(p => p <= 0 || p >= 1)) fail('NATIVE_NASH_NONINTERIOR_PROFILE');
  }
  const review = method === 'nash' ? reviewNash(input, nativeReceipt.result) : reviewConservation(input, nativeReceipt.result);
  return {status: 'EXACT_NATIVE_NUMERICAL_REVIEW', adapter_version: VERSION, method, model_fingerprint: modelFingerprint,
    native_receipt_fingerprint: await digest(nativeReceipt), native_receipt: nativeReceipt,
    review_scope: 'BOUNDED_SUPPLIED_MODEL_NUMERICAL_REVIEW', ...review,
    arithmetic: exactNativeNumericalReviewContract.arithmetic,
    receipt_binding: 'METHOD_VERSION_AND_INPUT_FINGERPRINT;NOT_ORIGIN_AUTHENTICATION',
    native_method_calls_made: 0, source_authentication: false, native_receipt_authentication: false,
    canonical_promotion: false, court_release_allowed: false, external_action_authorized: false};
}
