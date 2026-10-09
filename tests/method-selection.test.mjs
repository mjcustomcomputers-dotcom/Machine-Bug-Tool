import test from 'node:test';
import assert from 'node:assert/strict';
import {selectMethodFrontier} from '../lib/method-selection.mjs';
const make = (method, id, state, readiness='BLOCKED_MISSING_MODEL') => ({
  method: {method, question_ids:[id], input_readiness:readiness},
  receipt: {question_id:id, state}
});
const exercise = items => selectMethodFrontier(items.map(i=>i.method), items.map(i=>i.receipt));

test('a later REQUIRED method outranks an earlier ACTIVE one and blocked methods are excluded', () => {
  const cases = [make('ledger','q1','ACTIVE'), make('state_trace','q2','BLOCKED'), make('authority_graph','q3','REQUIRED')];
  const r = exercise(cases);
  assert.deepEqual(r.selected_methods.map(x=>x.method),['authority_graph','ledger']);
  assert.equal(r.deferred_methods[0].reason,'STRUCTURE_OR_SOURCE_BLOCKED');
  assert.equal(r.method_frontier.source_authentication,false);
  assert.equal(r.method_frontier.external_action_authorized,false);
});
test('no selected methods without structurally admitted questions, even with valid caller models', () => {
  const r=exercise([make('ledger','q1','BLOCKED','SCHEMA_VALID_CALLER_MODEL'), make('ach','q2','WATCH')]);
  assert.equal(r.selected_methods.length,0);
  assert.deepEqual(r.deferred_methods.map(x=>x.reason), ['STRUCTURE_OR_SOURCE_BLOCKED','APPLICABILITY_UNKNOWN']);
  assert.deepEqual(r.method_frontier.selected_question_ids,[]);
});
test('permutation-invariant selection preserves all candidates and names deferred methods', () => {
  const x=['nash','ledger','temporal','ach','relational','coverage'].map((m,i)=>make(m,'q'+i,'REQUIRED'));
  const a=exercise(x),b=exercise([...x].reverse());
  assert.deepEqual(a.selected_methods.map(x=>x.method),b.selected_methods.map(x=>x.method));
  assert.equal(a.selected_methods.length,4);
  assert.equal(a.deferred_methods.length,2);
  assert.ok(a.deferred_methods.every(x=>x.reason==='DEFERRED_BY_BOUNDED_LIMIT'));
  assert.equal(a.method_candidates.length,6);
  assert.equal(a.method_frontier.global_optimum_proven,false);
});
test('multiple declared requirements select the covering method before singleton', () => {
  const methods=[{method:'a',question_ids:['q1'],input_readiness:'SCHEMA_VALID_CALLER_MODEL'}, {method:'b',question_ids:['q2','q3'],input_readiness:'BLOCKED_MISSING_MODEL'}];
  const receipts=['q1','q2','q3'].map(question_id=>({question_id,state:'REQUIRED'}));
  const r=selectMethodFrontier(methods,receipts,1);
  assert.deepEqual(r.selected_methods.map(x=>x.method), ['b']);
  assert.deepEqual(r.method_frontier.unresolved_question_ids,['q1']);
});
test('duplicate methods, unknown questions and invalid limits fail closed', () => {
  assert.throws(()=>selectMethodFrontier([{method:'a',question_ids:['q0']},{method:'a',question_ids:['q1']}],[{question_id:'q0',state:'ACTIVE'},{question_id:'q1',state:'ACTIVE'}]),/DUPLICATE/);
  assert.throws(()=>selectMethodFrontier([{method:'a',question_ids:['missing']}],[]),/UNKNOWN_QUESTION/);
  assert.throws(()=>selectMethodFrontier([],[],5),/LIMIT/);
});
