import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateFiniteAdaptiveTwoStageChoice} from '../lib/finite-adaptive-two-stage-choice.mjs';

const complementaryFixture = () => ({
  experiment_id:'fixture:adaptive-complementary-tests',
  likelihood_scale:4,
  budget:1,
  states:[{id:'bit0',weight:1},{id:'bit1',weight:1}],
  actions:[
    {id:'guess0',payoffs:[10,0]},
    {id:'guess1',payoffs:[0,10]}
  ],
  first_stage:{id:'coarse',cost:0,outcomes:[
    {id:'signal0',likelihood_weights:[3,1]},
    {id:'signal1',likelihood_weights:[1,3]}
  ]},
  second_stage_options:[
    {id:'confirm0',cost:1,outcomes:[
      {id:'hit0',likelihood_weights:[4,2]},
      {id:'miss0',likelihood_weights:[0,2]}
    ]},
    {id:'confirm1',cost:1,outcomes:[
      {id:'hit1',likelihood_weights:[2,4]},
      {id:'miss1',likelihood_weights:[2,0]}
    ]}
  ]
});

test('second computation can depend on the first result and beat every fixed second choice', async () => {
  const result=await evaluateFiniteAdaptiveTwoStageChoice(complementaryFixture());
  assert.deepEqual(result.adaptive_policy.map(row=>[row.first_outcome_id,row.second_choice_id]),[
    ['signal0','confirm0'],['signal1','confirm1']
  ]);
  assert.deepEqual(result.exact_values.adaptive_net,{numerator:'31',denominator:'4'});
  assert.deepEqual(result.exact_values.best_nonadaptive_net,{numerator:'15',denominator:'2'});
  assert.deepEqual(result.exact_values.adaptivity_gain,{numerator:'1',denominator:'4'});
  assert.equal(result.adaptive_improves_on_nonadaptive,true);
  assert.equal(result.native_receipts.length,4);
  assert.ok(result.native_receipts.every(row=>row.receipt.method==='harsanyi'));
});

test('uninformative second computations are a nonadaptive-equivalence negative control', async () => {
  const input=complementaryFixture();
  input.experiment_id='fixture:nonadaptive-equivalence';
  input.second_stage_options=[
    {id:'noise-a',cost:1,outcomes:[
      {id:'heads',likelihood_weights:[2,2]},
      {id:'tails',likelihood_weights:[2,2]}
    ]},
    {id:'noise-b',cost:1,outcomes:[
      {id:'red',likelihood_weights:[2,2]},
      {id:'blue',likelihood_weights:[2,2]}
    ]}
  ];
  const result=await evaluateFiniteAdaptiveTwoStageChoice(input);
  assert.deepEqual(result.adaptive_policy.map(row=>row.second_choice_id),['STOP','STOP']);
  assert.equal(result.best_nonadaptive_policy.second_choice_id,'STOP');
  assert.deepEqual(result.exact_values.adaptivity_gain,{numerator:'0',denominator:'1'});
  assert.equal(result.adaptive_improves_on_nonadaptive,false);
  assert.equal(result.nonadaptive_equivalence,true);
});

test('budget gates every branch before native evaluation', async () => {
  const input=complementaryFixture();
  input.budget=0;
  const result=await evaluateFiniteAdaptiveTwoStageChoice(input);
  assert.deepEqual(result.adaptive_policy.map(row=>row.second_choice_id),['STOP','STOP']);
  assert.ok(result.blocked_second_stage_options.every(row=>row.reason==='COMPUTATION_BUDGET'));
  assert.equal(result.native_receipts.length,2);
});

test('malformed probability weights, duplicate IDs, and oversized or unknown shapes fail closed', async () => {
  const invalid=[];
  invalid.push({...complementaryFixture(),extra:true});
  const wrongMass=complementaryFixture();wrongMass.first_stage.outcomes[0].likelihood_weights[0]=2;invalid.push(wrongMass);
  const duplicate=complementaryFixture();duplicate.second_stage_options[1].id='confirm0';invalid.push(duplicate);
  const negative=complementaryFixture();negative.states[0].weight=-1;invalid.push(negative);
  const sparse=complementaryFixture();delete sparse.actions[0].payoffs[1];invalid.push(sparse);
  for(const input of invalid)await assert.rejects(()=>evaluateFiniteAdaptiveTwoStageChoice(input));
});
