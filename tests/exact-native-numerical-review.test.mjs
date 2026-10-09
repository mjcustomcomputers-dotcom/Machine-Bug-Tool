import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMethod, getMethodCatalog} from '../lib/methods.mjs';
import {digest} from '../lib/universal.mjs';
import {exactNativeNumericalReviewContract, verifyNativeNumericalReceipt} from '../lib/exact-native-numerical-review.mjs';

const d = 2 ** -54;
const trap = () => ({row_payoffs: [[1 - 2 ** -52, d], [1, -d]], column_payoffs: [[0, 1], [1, 0]]});
const translated = () => ({row_payoffs: [[-(2 ** -52), d], [0, -d]], column_payoffs: [[0, 1], [1, 0]]});
const pennies = () => ({row_payoffs: [[1, -1], [-1, 1]], column_payoffs: [[-1, 1], [1, -1]]});
const conservation = () => ({unit: 'SYNTHETIC_UTILITY', opening: 1, inflows: [d], outflows: [1], closing: 0, tolerance: 0});
const fraction = value => ({numerator: value.numerator, denominator: value.denominator});
const f = (numerator, denominator = 1) => ({numerator: String(numerator), denominator: String(denominator)});
async function review(method, input) {
  return verifyNativeNumericalReceipt({method, input, native_receipt: await evaluateMethod({method, input})});
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {Object.values(value).forEach(deepFreeze); Object.freeze(value);}
  return value;
}

test('retains the exact supplied native receipt and makes no evaluator calls', async () => {
  const input = deepFreeze(trap()), native = deepFreeze(await evaluateMethod({method: 'nash', input}));
  const before = structuredClone(native), result = await verifyNativeNumericalReceipt({method: 'nash', input, native_receipt: native});
  assert.deepEqual(native, before);
  assert.deepEqual(result.native_receipt, native);
  assert.notEqual(result.native_receipt, native);
  assert.equal(result.native_receipt_fingerprint, await digest(native));
  assert.equal(result.model_fingerprint, native.model_fingerprint);
  assert.equal(result.native_method_calls_made, 0);
  for (const field of ['source_authentication', 'native_receipt_authentication', 'canonical_promotion', 'court_release_allowed', 'external_action_authorized']) {
    assert.equal(result[field], false);
  }
  assert.deepEqual(exactNativeNumericalReviewContract.methods, ['nash', 'conservation']);
  assert.equal(getMethodCatalog().methods.length, 24);
});

test('independent Nash cancellation oracle gives p=1/2 and q=1/3, not native q=0.4', async () => {
  const result = await review('nash', trap());
  assert.equal(result.native_receipt.result.strict_interior_mixed.column_probabilities[0], 0.4);
  assert.deepEqual(fraction(result.exact_result.strict_interior_mixed.row_probabilities[0]), f(1, 2));
  assert.deepEqual(fraction(result.exact_result.strict_interior_mixed.column_probabilities[0]), f(1, 3));
  assert.deepEqual(fraction(result.exact_result.strict_interior_mixed.column_probabilities[1]), f(2, 3));
  assert.equal(result.comparison.classification, 'NATIVE_NUMERICAL_DISAGREEMENT_BEYOND_PROJECTION');
  assert.equal(result.comparison.native_differs_beyond_projection, true);
  assert.equal(result.comparison.conditioning_review_required, true);
  assert.deepEqual(fraction(result.comparison.native_indifference_residuals.row_payoff_difference),
    f(-1801439850948199n, 81129638414606681695789005144064n));
  assert.equal(result.comparison.native_indifference_residuals.preferred_row, 1);
});

test('strategically irrelevant column translation preserves exact equilibrium with projection-only native agreement', async () => {
  const original = await review('nash', trap()), control = await review('nash', translated());
  assert.deepEqual(original.exact_result.strict_interior_mixed, control.exact_result.strict_interior_mixed);
  assert.equal(control.native_receipt.result.strict_interior_mixed.column_probabilities[0], 1 / 3);
  assert.equal(control.comparison.classification, 'BINARY64_PROJECTION_ONLY');
  assert.equal(control.comparison.native_differs_beyond_projection, false);
  assert.equal(control.comparison.conditioning_review_required, false);
  assert.equal(control.comparison.probability_reviews.column_probabilities[1].classification, 'COMPLEMENT_OF_NEAREST_FIRST_PROBABILITY');
  assert.deepEqual(fraction(control.exact_result.strict_interior_mixed.column_probabilities[0].absolute_projection_error),
    f(1, 54043195528445952n));
  // A representational residual is disclosed, rather than mistaken for proof
  // that every rounded equilibrium display has a material conditioning error.
  assert.notEqual(control.comparison.native_indifference_residuals.row_payoff_difference.numerator, '0');
});

test('matching pennies remains an exact no-op control', async () => {
  const result = await review('nash', pennies());
  assert.equal(result.comparison.classification, 'EXACT_AGREEMENT');
  assert.equal(result.comparison.native_differs_beyond_projection, false);
  assert.deepEqual(result.exact_result.pure_equilibria, []);
  assert.equal(result.comparison.native_indifference_residuals.row_payoff_difference.numerator, '0');
  assert.equal(result.comparison.native_indifference_residuals.column_payoff_difference.numerator, '0');
});

test('six exact dyadic rescalings preserve the Nash oracle and its translated control', async () => {
  for (const power of [-900, -500, -52, -10, 0, 20]) {
    for (const [fixture, classification] of [[trap, 'NATIVE_NUMERICAL_DISAGREEMENT_BEYOND_PROJECTION'], [translated, 'BINARY64_PROJECTION_ONLY']]) {
      const input = fixture();
      input.row_payoffs = input.row_payoffs.map(row => row.map(x => x * 2 ** power));
      const result = await review('nash', input);
      assert.deepEqual(fraction(result.exact_result.strict_interior_mixed.column_probabilities[0]), f(1, 3), `scale 2^${power}`);
      assert.equal(result.comparison.classification, classification, `scale 2^${power}`);
    }
  }
});

test('row and column permutations preserve independently transformed equilibrium probabilities', async () => {
  for (const swapRows of [false, true]) for (const swapColumns of [false, true]) {
    const input = trap();
    for (const key of ['row_payoffs', 'column_payoffs']) {
      if (swapRows) input[key].reverse();
      if (swapColumns) input[key].forEach(row => row.reverse());
    }
    const result = await review('nash', input);
    assert.deepEqual(fraction(result.exact_result.strict_interior_mixed.row_probabilities[0]), f(1, 2));
    assert.deepEqual(fraction(result.exact_result.strict_interior_mixed.column_probabilities[0]), f(swapColumns ? 2 : 1, 3));
  }
});

test('subnormal payoff units retain the exact matching-pennies mixture', async () => {
  const input = pennies();
  input.row_payoffs = input.row_payoffs.map(row => row.map(x => x * Number.MIN_VALUE));
  const result = await review('nash', input);
  assert.deepEqual(fraction(result.exact_result.strict_interior_mixed.column_probabilities[0]), f(1, 2));
  assert.equal(result.comparison.classification, 'EXACT_AGREEMENT');
});

test('a rounded complement of one is retained as projection, not rejected as malformed native output', async () => {
  const input = {row_payoffs: [[1, 0], [0, Number.MIN_VALUE]], column_payoffs: [[0, 1], [1, 0]]};
  const result = await review('nash', input), q = result.exact_result.strict_interior_mixed.column_probabilities[0];
  assert.deepEqual(fraction(q), f(1, (1n << 1074n) + 1n));
  assert.deepEqual(result.native_receipt.result.strict_interior_mixed.column_probabilities, [Number.MIN_VALUE, 1]);
  assert.equal(result.comparison.classification, 'BINARY64_PROJECTION_ONLY');
  assert.equal(result.comparison.native_differs_beyond_projection, false);
  assert.deepEqual(fraction(result.comparison.native_indifference_residuals.column_probability_total), f((1n << 1074n) + 1n, 1n << 1074n));
});

test('a positive exact interior probability below display range survives native solution loss', async () => {
  const input = {row_payoffs: [[4, 0], [0, Number.MIN_VALUE]], column_payoffs: [[0, 1], [1, 0]]};
  const result = await review('nash', input), q = result.exact_result.strict_interior_mixed.column_probabilities[0];
  assert.equal(result.native_receipt.result.strict_interior_mixed, null);
  assert.equal(result.exact_result.strict_interior_mixed_exists, true);
  assert.deepEqual(fraction(q), f(1, (1n << 1076n) + 1n));
  assert.equal(q.rounded_value, 0);
  assert.equal(q.projection, 'BINARY64_UNDERFLOW;EXACT_FRACTION_RETAINED');
  assert.equal(result.comparison.classification, 'EXACT_INTERIOR_SOLUTION_ROUNDS_TO_BOUNDARY');
  assert.equal(result.comparison.native_differs_beyond_projection, false);
});

test('exactly half the minimum subnormal probability rounds to even zero with its fraction retained', async () => {
  const input = {row_payoffs: [[2, 0], [Number.MIN_VALUE, Number.MIN_VALUE]], column_payoffs: [[0, 1], [1, 0]]};
  const result = await review('nash', input), q = result.exact_result.strict_interior_mixed.column_probabilities[0];
  assert.deepEqual(fraction(q), f(1, 1n << 1075n));
  assert.equal(q.rounded_value, 0);
  assert.deepEqual(q.absolute_projection_error, fraction(q));
});

test('all-zero and one-degenerate-equation games report unenumerated interior families without claiming native failure', async () => {
  for (const column_payoffs of [[[0, 0], [0, 0]], [[0, 1], [1, 0]]]) {
    const result = await review('nash', {row_payoffs: [[0, 0], [0, 0]], column_payoffs});
    assert.equal(result.exact_result.strict_interior_mixed_exists, true);
    assert.equal(result.exact_result.strict_interior_mixed, null);
    assert.equal(result.exact_result.mixed_status, 'DEGENERATE_STRICT_INTERIOR_FAMILY_NOT_ENUMERATED');
    assert.equal(result.comparison.classification, 'DEGENERATE_INTERIOR_FAMILY_OUTSIDE_NATIVE_MIXED_SCOPE');
    assert.equal(result.comparison.native_differs_beyond_projection, false);
  }
});

test('constant strict preference and boundary indifference do not become strict interior equilibria', async () => {
  for (const [row_payoffs, equationStatus] of [
    [[[1, 1], [0, 0]], 'NO_PROBABILITY'], [[[1, 0], [0, 0]], 'BOUNDARY_PROBABILITY']
  ]) {
    const result = await review('nash', {row_payoffs, column_payoffs: [[0, 1], [1, 0]]});
    assert.equal(result.exact_result.row_indifference.status, equationStatus);
    assert.equal(result.exact_result.strict_interior_mixed_exists, false);
    assert.equal(result.comparison.classification, 'EXACT_AGREEMENT');
    assert.ok(result.exact_result.pure_equilibria.length > 0);
  }
});

test('an out-of-simplex algebraic solution beyond binary64 range remains an explicit exact fraction', async () => {
  const input = {row_payoffs: [[1, 1], [0, Number.MIN_VALUE]], column_payoffs: [[0, 1], [1, 0]]};
  const result = await review('nash', input), q = result.exact_result.row_indifference.probability;
  assert.equal(result.exact_result.row_indifference.status, 'OUTSIDE_PROBABILITY_SIMPLEX');
  assert.deepEqual(fraction(q), f(1n - (1n << 1074n)));
  assert.equal(q.rounded_value, null);
  assert.equal(q.projection, 'BINARY64_OVERFLOW;EXACT_FRACTION_RETAINED');
  assert.equal(result.comparison.classification, 'EXACT_AGREEMENT');
});

test('native sizes outside 2x2 retain their receipt with explicitly unreviewed status', async () => {
  const result = await review('nash', {row_payoffs: [[1, 0, -1]], column_payoffs: [[-1, 0, 1]]});
  assert.equal(result.exact_result, null);
  assert.equal(result.review_scope, 'NOT_APPLICABLE_OUTSIDE_2X2');
  assert.equal(result.comparison.classification, 'NOT_REVIEWED_OUTSIDE_2X2');
  assert.equal(result.comparison.native_differs_beyond_projection, null);
  assert.equal(result.native_receipt.result.mixed_status, 'NOT_COMPUTED_FOR_THIS_SIZE');
});

test('exact conservation exposes the zero-tolerance native false pass', async () => {
  const result = await review('conservation', conservation());
  assert.equal(result.native_receipt.result.within_supplied_tolerance, true);
  assert.deepEqual(fraction(result.exact_result.expected_closing), f(1, 1n << 54n));
  assert.deepEqual(fraction(result.exact_result.residual), f(-1, 1n << 54n));
  assert.equal(result.exact_result.within_supplied_tolerance, false);
  assert.equal(result.comparison.classification, 'NATIVE_TOLERANCE_FALSE_PASS');
  assert.equal(result.comparison.native_differs_beyond_projection, true);
});

test('six dyadic scales including a subnormal inflow retain exact conservation residuals', async () => {
  for (const power of [-1000, -900, -500, -52, 0, 20]) {
    const input = conservation();
    for (const key of ['opening', 'closing']) input[key] *= 2 ** power;
    for (const key of ['inflows', 'outflows']) input[key] = input[key].map(x => x * 2 ** power);
    const result = await review('conservation', input);
    assert.deepEqual(fraction(result.exact_result.residual), f(-1, 1n << BigInt(54 - power)));
    assert.equal(result.comparison.classification, 'NATIVE_TOLERANCE_FALSE_PASS');
  }
});

test('tolerance immediately below, exactly equal to and above the residual uses exact comparison', async () => {
  const residual = 2 ** -54, below = residual - 2 ** -107, above = residual + 2 ** -106;
  for (const [tolerance, expected] of [[0, false], [below, false], [residual, true], [above, true]]) {
    const result = await review('conservation', {...conservation(), tolerance});
    assert.equal(result.exact_result.within_supplied_tolerance, expected);
  }
});

test('a native false tolerance pass is detected even when both numeric fields are correctly projected', async () => {
  const result = await review('conservation', {...conservation(), outflows: [], tolerance: 1});
  assert.equal(result.exact_result.within_supplied_tolerance, false);
  assert.equal(result.comparison.classification, 'NATIVE_TOLERANCE_FALSE_PASS');
  assert.equal(result.comparison.native_differs_beyond_projection, false);
  assert.deepEqual(result.comparison.native_values_match_nearest_projection, {expected_closing: true, residual: true});
});

test('half-ULP double rounding can falsely fail an exactly satisfied conservation tolerance', async () => {
  const boundary = 0.5 + 2 ** -53, amount = 2 ** -54;
  const result = await review('conservation', {unit: 'SYNTHETIC_UTILITY', opening: boundary,
    inflows: [amount], outflows: [amount], closing: 0, tolerance: boundary});
  assert.equal(result.exact_result.within_supplied_tolerance, true);
  assert.equal(result.native_receipt.result.within_supplied_tolerance, false);
  assert.equal(result.comparison.classification, 'NATIVE_TOLERANCE_FALSE_FAIL');
});

test('ordinary balanced and unbalanced conservation controls retain exact native agreement', async () => {
  for (const closing of [8, 7]) {
    const result = await review('conservation', {unit: 'SYNTHETIC_UTILITY', opening: 10,
      inflows: [2, 1], outflows: [3, 2], closing, tolerance: 0});
    assert.equal(result.comparison.classification, 'EXACT_AGREEMENT');
    assert.equal(result.exact_result.within_supplied_tolerance, closing === 8);
  }
});

test('conservation order and neutral signed additions preserve exact totals despite native cancellation', async () => {
  for (const inflows of [[1e9, d, -1e9], [1e9, -1e9, d], [d, 1e9, -1e9]]) {
    const result = await review('conservation', {unit: 'SYNTHETIC_UTILITY', opening: 0, inflows,
      outflows: [], closing: 0, tolerance: 0});
    assert.deepEqual(fraction(result.exact_result.expected_closing), f(1, 1n << 54n));
    assert.equal(result.exact_result.within_supplied_tolerance, false);
  }
});

test('input identity mismatch and incompatible method/version receipts reject before review', async () => {
  const input = trap(), native = await evaluateMethod({method: 'nash', input});
  await assert.rejects(verifyNativeNumericalReceipt({method: 'nash', input: translated(), native_receipt: native}), /NATIVE_RECEIPT_INPUT_FINGERPRINT_MISMATCH/);
  await assert.rejects(verifyNativeNumericalReceipt({method: 'nash', input, native_receipt: {...native, method: 'conservation'}}), /ARGUMENT_ENUM_MISMATCH/);
  await assert.rejects(verifyNativeNumericalReceipt({method: 'nash', input, native_receipt: {...native, implementation_version: 'future'}}), /ARGUMENT_ENUM_MISMATCH/);
  await assert.rejects(verifyNativeNumericalReceipt({method: 'harsanyi', input: {}, native_receipt: native}), /ARGUMENT_ENUM_MISMATCH/);
});

test('native schema, matrix semantics and JSON-shaped direct inputs are checked', async () => {
  const native = await evaluateMethod({method: 'nash', input: trap()});
  await assert.rejects(verifyNativeNumericalReceipt({method: 'nash', input: {...trap(), extra: true}, native_receipt: native}), /ARGUMENT_SHAPE_MISMATCH/);
  await assert.rejects(verifyNativeNumericalReceipt({method: 'nash', input: {row_payoffs: [[1, 0], [1]], column_payoffs: [[1, 0], [1, 0]]}, native_receipt: native}), /RECTANGULAR_MATCHING_MATRICES_REQUIRED/);
  const sparse = trap(); delete sparse.row_payoffs[0][1];
  await assert.rejects(verifyNativeNumericalReceipt({method: 'nash', input: sparse, native_receipt: native}), /NUMERICAL_REVIEW_SPARSE_ARRAY/);
  const nonfinite = trap(); nonfinite.row_payoffs[0][0] = NaN;
  await assert.rejects(verifyNativeNumericalReceipt({method: 'nash', input: nonfinite, native_receipt: native}), /NUMERICAL_REVIEW_NONFINITE_NUMBER/);
});

test('object property order does not change the native input fingerprint', async () => {
  const input = trap(), native = await evaluateMethod({method: 'nash', input});
  const result = await verifyNativeNumericalReceipt({method: 'nash',
    input: {column_payoffs: input.column_payoffs, row_payoffs: input.row_payoffs}, native_receipt: native});
  assert.equal(result.model_fingerprint, native.model_fingerprint);
});

test('receipt binding is not authentication and inconsistent returned results remain separate discrepancies', async () => {
  const input = pennies(), native = await evaluateMethod({method: 'nash', input});
  native.result.pure_equilibria = [{row: 0, column: 0, payoffs: [1, -1]}];
  const result = await verifyNativeNumericalReceipt({method: 'nash', input, native_receipt: native});
  assert.equal(result.comparison.classification, 'NATIVE_PURE_EQUILIBRIA_DISAGREEMENT');
  assert.equal(result.native_receipt_authentication, false);
  assert.deepEqual(result.native_receipt, native);
});
