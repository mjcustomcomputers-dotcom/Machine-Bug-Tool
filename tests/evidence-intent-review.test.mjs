import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewEvidenceIntent} from '../lib/evidence-intent-review.mjs';
const fixture=()=>({
 subject_id:'fixture:actor-1',
 claims:[
  {id:'claim-action',kind:'EVENT',statement:'The actor completed operation A.',source_refs:['source:claim']},
  {id:'claim-intent',kind:'INTENT',statement:'The actor intended result B.',source_refs:['source:intent']},
  {id:'claim-benign',kind:'BENIGN_EXPLANATION',statement:'A legitimate workflow could explain operation A.',source_refs:['source:rule']}
 ],
 observations:[
  {id:'log-a',claim_id:'claim-action',polarity:'SUPPORT',epistemic_state:'OBSERVED',source_owner:'owner:app',source_refs:['source:app-log']},
  {id:'log-b',claim_id:'claim-action',polarity:'CONTRADICT',epistemic_state:'OBSERVED',source_owner:'owner:admin',source_refs:['source:admin-log']},
  {id:'intent-model',claim_id:'claim-intent',polarity:'SUPPORT',epistemic_state:'INFERRED',source_owner:'owner:analyst',source_refs:['source:model']},
  {id:'benign-record',claim_id:'claim-benign',polarity:'SUPPORT',epistemic_state:'OBSERVED',source_owner:'owner:rule',source_refs:['source:rule']}
 ],
 goals:[
  {id:'plus',description:'Possible intentional goal',sign:'INTENT_PLUS',claim_ids:['claim-intent'],required_observation_ids:['intent-model']},
  {id:'minus',description:'Possible benign goal',sign:'BENIGN_ALTERNATIVE',claim_ids:['claim-benign'],required_observation_ids:['benign-record']}
 ],
 variations:[
  {id:'remove-b',operator:'REMOVE',observation_id:'log-b'},
  {id:'invert-a',operator:'FLIP_POLARITY',observation_id:'log-a'},
  {id:'mask-a',operator:'MASK_UNKNOWN',observation_id:'log-a'}
 ]
});
test('Contradictions remain BOTH, not a lie/guilt finding',()=>{
 const x=reviewEvidenceIntent(fixture());
 assert.equal(x.claim_review[0].status,'CONFLICTING_SUPPLIED_RECORDS');
 assert.equal(x.claim_review[1].status,'UNRESOLVED'); // inferred model is not a native observation
 assert.equal(x.deception_determined,false);
 assert.equal(x.criminal_activity_determined,false);
 assert.equal(x.intention_inferred,false);
 assert.equal(x.attribution_established,false);
 assert.equal(x.source_authentication,false);
});
test('Plus and minus goal hypotheses remain separate and neither proves intent',()=>{
 const x=reviewEvidenceIntent(fixture());
 assert.equal(x.goal_review[0].sign,'INTENT_PLUS');
 assert.equal(x.goal_review[0].compatible_with_supplied_claims,false);
 assert.equal(x.goal_review[0].missing_required_observation_ids.length,1);
 assert.equal(x.goal_review[1].compatible_with_supplied_claims,true);
 assert.ok(x.goal_review.every(x=>x.state==='GOAL_HYPOTHESIS_ONLY_NOT_INTENT_PROOF'&&!x.fact_or_intent_determined));
});
test('Synthetic removal flip and mask preserve baseline and display only material changes',()=>{
 const input=fixture();
 const frozen=structuredClone(input);
 const x=reviewEvidenceIntent(input);
 assert.deepEqual(input,frozen);
 assert.ok(x.variations_review[0].changes.some(y=>y.after==='SUPPORTED_BY_SUPPLIED_RECORDS'));
 assert.ok(x.variations_review[1].changes.some(y=>y.after==='CONTRADICTED_BY_SUPPLIED_RECORDS'));
 assert.ok(x.variations_review[2].changes.some(y=>y.after==='CONTRADICTED_BY_SUPPLIED_RECORDS'));
 assert.ok(x.variations_review.every(y=>y.state==='SYNTHETIC_COUNTERFACTUAL_NOT_REAL_WORLD_CHANGE'));
});
test('Empty or unsupported observations never become true or false',()=>{
 const f=fixture();f.observations=[];f.goals=[];f.variations=[];
 const x=reviewEvidenceIntent(f);
 assert.ok(x.claim_review.every(y=>y.status==='UNRESOLVED'));
});
test('Reject fabricated refs duplicate identifiers and dangling goals',()=>{
 const x=fixture();x.observations[0].claim_id='missing';
 assert.throws(()=>reviewEvidenceIntent(x),/UNRESOLVED_CLAIM/);
 const y=fixture();y.observations[0].id='log-b';
 assert.throws(()=>reviewEvidenceIntent(y),/DUPLICATE_OBSERVATION_IDS/);
 const z=fixture();z.goals[0].claim_ids=['missing'];
 assert.throws(()=>reviewEvidenceIntent(z),/GOAL_CLAIM_UNRESOLVED/);
});
test('Reject unbounded inputs and unauthorized extra fields',()=>{
 const x=fixture();x.claims=Array.from({length:13},(_,i)=>({id:'q'+i,kind:'EVENT',statement:'Statement',source_refs:[]}));
 assert.throws(()=>reviewEvidenceIntent(x),/INVALID_CLAIMS/);
 const y=fixture();y.automatic_target_test=true;
 assert.throws(()=>reviewEvidenceIntent(y),/INVALID_REVIEW_FIELDS/);
});
