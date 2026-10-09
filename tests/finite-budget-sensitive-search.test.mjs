import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateFiniteBudgetSensitiveSearch} from '../lib/finite-budget-sensitive-search.mjs';

const nestedSearch = budget => ({
  search_id:'fixture:nested-budget-search',
  budget,
  root:'root',
  nodes:[
    {id:'root',kind:'SEARCH',stop_utility:2,expansions:[{id:'inspect',to:'detail',cost:1}]},
    {id:'detail',kind:'SEARCH',stop_utility:5,expansions:[{id:'deepen',to:'answer',cost:2}]},
    {id:'answer',kind:'TERMINAL',utility:10}
  ]
});

test('finite search changes plan only when the explicit budget admits the next useful expansion', async () => {
  const blocked=await evaluateFiniteBudgetSensitiveSearch(nestedSearch(0));
  assert.equal(blocked.selected_plan.status,'STOP');
  assert.equal(blocked.selected_plan.net_utility,2);
  assert.deepEqual(blocked.selected_plan.expansion_ids,[]);

  const shallow=await evaluateFiniteBudgetSensitiveSearch(nestedSearch(1));
  assert.equal(shallow.selected_plan.status,'EXPAND_THEN_STOP');
  assert.equal(shallow.selected_plan.gross_utility,5);
  assert.equal(shallow.selected_plan.computation_cost,1);
  assert.equal(shallow.selected_plan.net_utility,4);
  assert.deepEqual(shallow.selected_plan.expansion_ids,['inspect']);

  const deep=await evaluateFiniteBudgetSensitiveSearch(nestedSearch(3));
  assert.equal(deep.selected_plan.status,'EXPAND_TO_TERMINAL');
  assert.equal(deep.selected_plan.gross_utility,10);
  assert.equal(deep.selected_plan.computation_cost,3);
  assert.equal(deep.selected_plan.net_utility,7);
  assert.deepEqual(deep.selected_plan.expansion_ids,['inspect','deepen']);
  assert.equal(deep.native_receipt.method,'selten');
  assert.equal(deep.native_receipt.result.root_payoffs[0],7);
});

test('positive-cost search that cannot improve the decision is a dominated negative control', async () => {
  const result=await evaluateFiniteBudgetSensitiveSearch({
    search_id:'fixture:dominated-search',budget:8,root:'root',nodes:[
      {id:'root',kind:'SEARCH',stop_utility:5,expansions:[{id:'waste',to:'same',cost:1}]},
      {id:'same',kind:'TERMINAL',utility:5}
    ]
  });
  assert.equal(result.selected_plan.status,'STOP');
  assert.equal(result.selected_plan.net_utility,5);
  assert.equal(result.search_improves_decision,false);
  assert.deepEqual(result.selected_plan.expansion_ids,[]);
  assert.equal(result.boundaries.general_planner,false);
});

test('the adapter maximizes net utility rather than gross terminal utility', async () => {
  const result=await evaluateFiniteBudgetSensitiveSearch({
    search_id:'fixture:net-not-gross',budget:4,root:'root',nodes:[
      {id:'root',kind:'SEARCH',stop_utility:4,expansions:[
        {id:'cheap',to:'cheap-result',cost:1},
        {id:'expensive',to:'expensive-result',cost:4}
      ]},
      {id:'cheap-result',kind:'TERMINAL',utility:7},
      {id:'expensive-result',kind:'TERMINAL',utility:9}
    ]
  });
  assert.deepEqual(result.selected_plan.expansion_ids,['cheap']);
  assert.equal(result.selected_plan.gross_utility,7);
  assert.equal(result.selected_plan.net_utility,6);
  assert.ok(result.enumerated_candidates.some(row=>row.expansion_ids[0]==='expensive'&&row.net_utility===5));
});

test('malformed, cyclic, shared, unreachable and over-budget search models fail closed', async () => {
  const invalid=[
    {...nestedSearch(1),extra:true},
    {...nestedSearch(1),budget:-1},
    {...nestedSearch(1),nodes:[{id:'root',kind:'SEARCH',stop_utility:0,expansions:[{id:'bad',to:'answer',cost:0}]},{id:'answer',kind:'TERMINAL',utility:1}]},
    {...nestedSearch(1),nodes:[{id:'root',kind:'SEARCH',stop_utility:0,expansions:[{id:'loop',to:'root',cost:1}]}]},
    {...nestedSearch(2),nodes:[
      {id:'root',kind:'SEARCH',stop_utility:0,expansions:[{id:'a',to:'left',cost:1},{id:'b',to:'right',cost:1}]},
      {id:'left',kind:'SEARCH',stop_utility:0,expansions:[{id:'c',to:'shared',cost:1}]},
      {id:'right',kind:'SEARCH',stop_utility:0,expansions:[{id:'d',to:'shared',cost:1}]},
      {id:'shared',kind:'TERMINAL',utility:1}
    ]},
    {...nestedSearch(1),nodes:[...nestedSearch(1).nodes,{id:'orphan',kind:'TERMINAL',utility:0}]}
  ];
  for(const input of invalid)await assert.rejects(()=>evaluateFiniteBudgetSensitiveSearch(input));
});
