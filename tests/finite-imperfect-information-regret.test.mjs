import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateFiniteImperfectInformationRegret} from '../lib/finite-imperfect-information-regret.mjs';

const matchingPennies = (rowWeights=[1,1], columnWeights=[1,1]) => ({
  game_id:'fixture:matching-pennies',
  row_payoffs:[[1,-1],[-1,1]],
  column_payoffs:[[-1,1],[1,-1]],
  row_strategy_weights:rowWeights,
  column_strategy_weights:columnWeights
});

test('uniform matching pennies is an equilibrium-consistent zero-regret control', async () => {
  const result=await evaluateFiniteImperfectInformationRegret(matchingPennies());
  assert.equal(result.status,'FINITE_IMPERFECT_INFORMATION_REGRET_EVALUATED');
  assert.deepEqual(result.exact_regret.row,{numerator:'0',denominator:'4'});
  assert.deepEqual(result.exact_regret.column,{numerator:'0',denominator:'4'});
  assert.equal(result.max_unilateral_regret,0);
  assert.equal(result.equilibrium_consistent,true);
  assert.equal(result.native_receipts.nash.method,'nash');
  assert.equal(result.native_receipts.row_best_response.method,'harsanyi');
  assert.equal(result.native_receipts.column_best_response.method,'harsanyi');
  assert.equal(result.boundaries.cfr_performed,false);
});

test('biased play exposes exact independently enumerable unilateral regret', async () => {
  const result=await evaluateFiniteImperfectInformationRegret(matchingPennies([3,1],[1,1]));
  assert.deepEqual(result.exact_profile_utility.row,{numerator:'0',denominator:'8'});
  assert.deepEqual(result.exact_profile_utility.column,{numerator:'0',denominator:'8'});
  assert.deepEqual(result.exact_regret.row,{numerator:'0',denominator:'8'});
  assert.deepEqual(result.exact_regret.column,{numerator:'4',denominator:'8'});
  assert.equal(result.equilibrium_consistent,false);
  assert.deepEqual(result.best_response_actions.column,['column1']);
});

test('ties are retained and exact integer arithmetic survives large bounded payoffs', async () => {
  const result=await evaluateFiniteImperfectInformationRegret({
    game_id:'fixture:ties',
    row_payoffs:[[1000000,1000000],[1000000,1000000]],
    column_payoffs:[[7,7],[7,7]],
    row_strategy_weights:[999999,1],column_strategy_weights:[1,999999]
  });
  assert.deepEqual(result.best_response_actions.row,['row0','row1']);
  assert.deepEqual(result.best_response_actions.column,['column0','column1']);
  assert.equal(result.max_unilateral_regret,0);
});

test('contract rejects malformed, oversized, non-integer and zero-mass strategies', async () => {
  const invalid=[
    {...matchingPennies(),extra:true},
    {...matchingPennies(),row_payoffs:[[1,-1],[-1,1],[0,0]],column_payoffs:[[-1,1],[1,-1]]},
    {...matchingPennies(),row_strategy_weights:[0,0]},
    {...matchingPennies(),column_strategy_weights:[1,0.5]},
    {...matchingPennies(),row_payoffs:[[1,Number.NaN],[-1,1]]},
    {...matchingPennies(),row_payoffs:Array.from({length:9},()=>[0,0]),column_payoffs:Array.from({length:9},()=>[0,0]),row_strategy_weights:Array(9).fill(1)}
  ];
  for(const input of invalid) await assert.rejects(()=>evaluateFiniteImperfectInformationRegret(input));
});
