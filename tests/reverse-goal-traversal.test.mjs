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
test('Native graph IDs and state references reject missing, null and numeric values',()=>{
 const setFields=[
  (q,v)=>q.subject_id=v,
  (q,v)=>q.states[0]=v,
  (q,v)=>q.start_state=v,
  (q,v)=>q.transitions[0].id=v,
  (q,v)=>q.transitions[0].from=v,
  (q,v)=>q.transitions[0].to=v,
  (q,v)=>q.transitions[0].source_refs[0]=v,
  (q,v)=>q.goals[0].id=v,
  (q,v)=>q.goals[0].target_state=v,
  (q,v)=>q.remove_transition_id=v
 ];
 for(const setField of setFields)for(const value of [undefined,null,0]){
  const q=fixture();setField(q,value);
  assert.throws(()=>reviewReverseGoals(q),/INVALID_|UNKNOWN|GOAL_/);
 }
 for(const setSparse of [q=>q.states=Array(1),q=>q.transitions[0].source_refs=Array(1)]){
  const q=fixture();setSparse(q);
  assert.throws(()=>reviewReverseGoals(q),/INVALID_|GOAL_/);
 }
 const wrongCase=fixture();wrongCase.transitions[0].from='start';
 assert.throws(()=>reviewReverseGoals(wrongCase),/GOAL_EDGE/);
});
test('String zero remains an exact removable identifier and an omitted removal remains optional',()=>{
 const q=fixture();q.transitions[1].id='0';q.remove_transition_id='0';
 const r=reviewReverseGoals(q);
 assert.equal(r.variation_kind,'SINGLE_EDGE_REMOVAL_SYNTHETIC');
 assert.equal(r.goal_review[0].deletion_counterfactual.removed_transition_id,'0');
 assert.equal(r.goal_review[0].deletion_counterfactual.reachability,'NO_DECLARED_PATH');
 delete q.remove_transition_id;
 const baseline=reviewReverseGoals(q);
 assert.equal(baseline.variation_kind,'NONE');
 assert.ok(baseline.goal_review.every(g=>g.deletion_counterfactual===null));
});
test('Unreachable goals have no source-bound path, including after one-edge removal',()=>{
 const q=fixture();q.transitions=q.transitions.filter(e=>e.id!=='settle');
 const r=reviewReverseGoals(q).goal_review[0];
 assert.equal(r.baseline.reachability,'NO_DECLARED_PATH');
 assert.equal(r.path_source_bound,null);
 assert.equal(r.baseline.path_source_bound,null);
 assert.equal(r.baseline.path_source_binding_state,'NO_DECLARED_PATH');
 assert.equal(r.deletion_counterfactual.path_source_bound,null);
 assert.equal(r.deletion_counterfactual.path_source_binding_state,'NO_DECLARED_PATH');
 const reachable=reviewReverseGoals(fixture()).goal_review[0];
 assert.equal(reachable.baseline.path_source_bound,true);
 assert.equal(reachable.deletion_counterfactual.path_source_bound,null);
});
test('A goal already at start is reachable without inventing a source-bound transition',()=>{
 const q=fixture();q.goals=[{id:'already-started',target_state:'START',sign:'INTENT_MINUS'}];
 const r=reviewReverseGoals(q).goal_review[0];
 assert.equal(r.sign,'INTENT_MINUS');
 assert.deepEqual(r.baseline.path,['START']);
 assert.equal(r.baseline.reachability,'REACHABLE_IN_SUPPLIED_GRAPH');
 assert.equal(r.baseline.path_source_bound,null);
 assert.equal(r.baseline.path_source_binding_state,'NO_TRANSITIONS_REQUIRED');
 assert.equal(r.deletion_counterfactual.path_source_bound,null);
 assert.equal(r.intent_inferred,false);
});
test('Removal retains an unbound alternate path as unbound in its own counterfactual receipt',()=>{
 const q={subject_id:'fixture:subject',states:['START','GOAL'],start_state:'START',
  transitions:[{id:'a-bound',from:'START',to:'GOAL',source_refs:['fixture:record']},{id:'b-unbound',from:'START',to:'GOAL',source_refs:[]}],
  goals:[{id:'plus',target_state:'GOAL',sign:'INTENT_PLUS'}],remove_transition_id:'a-bound'};
 const snapshot=structuredClone(q);
 const r=reviewReverseGoals(q).goal_review[0];
 assert.equal(r.baseline.path_source_bound,true);
 assert.equal(r.baseline.path_source_binding_state,'DECLARED_SOURCE_REFERENCES_ONLY');
 assert.deepEqual(r.baseline.unbound_transition_ids,[]);
 assert.equal(r.path_source_bound,r.baseline.path_source_bound);
 assert.deepEqual(r.deletion_counterfactual.transition_ids,['b-unbound']);
 assert.equal(r.deletion_counterfactual.reachability,'REACHABLE_IN_SUPPLIED_GRAPH');
 assert.equal(r.deletion_counterfactual.material_reachability_change,false);
 assert.equal(r.deletion_counterfactual.path_source_bound,false);
 assert.equal(r.deletion_counterfactual.path_source_binding_state,'UNBOUND_TRANSITIONS');
 assert.deepEqual(r.deletion_counterfactual.unbound_transition_ids,['b-unbound']);
 assert.equal(r.source_authenticated,false);
 assert.deepEqual(q,snapshot);
});
test('Bounded cycles and alternate paths stay deterministic when declaration order changes',()=>{
 const q={subject_id:'fixture:subject',states:['START','A','B','GOAL'],start_state:'START',
  transitions:[
   {id:'a',from:'START',to:'A',source_refs:['fixture:record']},
   {id:'b',from:'START',to:'B',source_refs:['fixture:record']},
   {id:'cycle',from:'A',to:'START',source_refs:['fixture:record']},
   {id:'finish-a',from:'A',to:'GOAL',source_refs:['fixture:record']},
   {id:'finish-b',from:'B',to:'GOAL',source_refs:['fixture:record']}
  ],goals:[{id:'minus',target_state:'GOAL',sign:'INTENT_MINUS'}],remove_transition_id:'finish-a'};
 const r=reviewReverseGoals(q);
 assert.deepEqual(r.goal_review[0].baseline.transition_ids,['a','finish-a']);
 assert.deepEqual(r.goal_review[0].deletion_counterfactual.transition_ids,['b','finish-b']);
 assert.equal(r.goal_review[0].deletion_counterfactual.path_source_bound,true);
 const reordered=structuredClone(q);reordered.states.reverse();reordered.transitions.reverse();
 assert.deepEqual(reviewReverseGoals(reordered),r);
});
