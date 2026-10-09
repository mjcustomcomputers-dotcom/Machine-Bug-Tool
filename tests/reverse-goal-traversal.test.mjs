import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewReverseGoals} from '../lib/reverse-goal-traversal.mjs';
const fixture=()=>({
 subject_id:'fixture:actor',
 states:['START','AUTHORIZED','ACTION','GOAL','BENIGN'],
 start_state:'START',
 transitions:[
  {id:'permit',from:'START',to:'AUTHORIZED',source_refs:['fixture:policy']},
  {id:'commit',from:'AUTHORIZED',to:'ACTION',source_refs:['fixture:operation']},
  {id:'settle',from:'ACTION',to:'GOAL',source_refs:['fixture:ledger']},
  {id:'normal',from:'START',to:'BENIGN',source_refs:['fixture:workflow']}
 ],
 goals:[{id:'plus',target_state:'GOAL',sign:'INTENT_PLUS'},{id:'alt',target_state:'BENIGN',sign:'BENIGN_ALTERNATIVE'}],
 remove_transition_id:'commit'
});
test('Separate plus and benign goals with bound shortest paths and no intent claims',()=>{
 const q=fixture(),r=reviewReverseGoals(q);
 assert.equal(r.goal_review.length,2);
 assert.deepEqual(r.goal_review[0].baseline.transition_ids,['permit','commit','settle']);
 assert.deepEqual(r.goal_review[1].baseline.transition_ids,['normal']);
 assert.equal(r.goal_review[0].intent_inferred,false);
 assert.equal(r.no_intent_or_guilt_determination,true);
});
test('One-edge removal changes first goal but not benign alternative',()=>{
 const r=reviewReverseGoals(fixture());
 assert.equal(r.goal_review[0].deletion_counterfactual.reachability,'NO_DECLARED_PATH');
 assert.equal(r.goal_review[0].deletion_counterfactual.material_reachability_change,true);
 assert.equal(r.goal_review[1].deletion_counterfactual.material_reachability_change,false);
});
test('No owner reference on path marks unbound and never authenticates',()=>{
 const q=fixture();q.transitions[1].source_refs=[];
 const r=reviewReverseGoals(q);
 assert.deepEqual(r.goal_review[0].unbound_transition_ids,['commit']);
 assert.equal(r.goal_review[0].path_source_bound,false);
 assert.equal(r.no_evidence_authentication,true);
});
test('Invalid graph edges and unknown remove fail closed',()=>{
 const q=fixture();q.transitions[0].to='MISSING';
 assert.throws(()=>reviewReverseGoals(q),/GOAL_EDGE/);
 const k=fixture();k.remove_transition_id='UNKNOWN';
 assert.throws(()=>reviewReverseGoals(k),/UNKNOWN_REMOVED_TRANSITION/);
});
test('Input remains unchanged and foreign subject disallowed by outer detector',()=>{
 const q=fixture(),snap=structuredClone(q);
 reviewReverseGoals(q);
 assert.deepEqual(q,snap);
 const k=fixture();delete k.subject_id;
 assert.throws(()=>reviewReverseGoals(k),/INVALID_GOAL_SUBJECT/);
});
