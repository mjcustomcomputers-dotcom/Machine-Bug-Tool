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
test('All four claim states retain eligible UNKNOWN records without treating them as support',()=>{
 const states=[
  [[], 'UNRESOLVED'],
  [['SUPPORT'], 'SUPPORTED_BY_SUPPLIED_RECORDS'],
  [['CONTRADICT'], 'CONTRADICTED_BY_SUPPLIED_RECORDS'],
  [['SUPPORT','CONTRADICT'], 'CONFLICTING_SUPPLIED_RECORDS']
 ];
 for(const [polarities,status] of states){
  const q=fixture();q.claims=[q.claims[0]];q.goals=[];q.variations=[];
  q.observations=[
   {...q.observations[0],id:'unknown-observed',polarity:'UNKNOWN'},
   {...q.observations[0],id:'unknown-derived',polarity:'UNKNOWN',epistemic_state:'DERIVED'},
   {...q.observations[0],id:'unknown-unadmitted',polarity:'UNKNOWN',epistemic_state:'SYNTHETIC'},
   ...polarities.map((polarity,i)=>({...q.observations[0],id:'evidence-'+i,polarity}))
  ];
  const [claim]=reviewEvidenceIntent(q).claim_review;
  assert.equal(claim.status,status);
  assert.deepEqual(claim.unknown_observation_ids,['unknown-derived','unknown-observed']);
  assert.deepEqual(claim.unadmitted_observation_ids,['unknown-unadmitted']);
  const retained=[...claim.support_observation_ids,...claim.contradiction_observation_ids,...claim.unknown_observation_ids,...claim.unadmitted_observation_ids];
  assert.deepEqual(retained.sort(),q.observations.map(o=>o.id).sort());
 }
});
test('Intent plus, intent minus and benign alternatives are explicit independent hypotheses',()=>{
 const q=fixture();q.observations=q.observations.filter(o=>o.id!=='log-b');q.variations=[];
 const signs=['INTENT_PLUS','INTENT_MINUS','BENIGN_ALTERNATIVE'];
 q.goals=signs.map((sign,i)=>({id:'goal-'+i,description:'Caller-supplied alternative',sign,claim_ids:['claim-action']}));
 const r=reviewEvidenceIntent(q);
 assert.deepEqual(r.goal_review.map(g=>g.sign),signs);
 assert.ok(r.goal_review.every(g=>g.compatible_with_supplied_claims&&!g.fact_or_intent_determined));
 assert.equal(r.intention_inferred,false);
});
test('Evidence IDs and references reject missing, null and numeric values without coercion',()=>{
 const setFields=[
  (q,v)=>q.subject_id=v,
  (q,v)=>q.claims[0].id=v,
  (q,v)=>q.claims[0].source_refs[0]=v,
  (q,v)=>q.observations[0].id=v,
  (q,v)=>q.observations[0].claim_id=v,
  (q,v)=>q.observations[0].source_owner=v,
  (q,v)=>q.observations[0].source_refs[0]=v,
  (q,v)=>q.goals[0].id=v,
  (q,v)=>q.goals[0].claim_ids[0]=v,
  (q,v)=>q.goals[0].required_observation_ids[0]=v,
  (q,v)=>q.variations[0].id=v,
  (q,v)=>q.variations[0].observation_id=v
 ];
 for(const setField of setFields)for(const value of [undefined,null,0]){
  const q=fixture();setField(q,value);
  assert.throws(()=>reviewEvidenceIntent(q),/INVALID_/);
 }
 const q=fixture();q.observations[0].claim_id='CLAIM-ACTION';
 assert.throws(()=>reviewEvidenceIntent(q),/UNRESOLVED_CLAIM/);
});
test('Absent optional collections remain valid, but explicit invalid collections and sparse refs reject',()=>{
 const q=fixture();delete q.goals;delete q.variations;
 assert.deepEqual(reviewEvidenceIntent(q).goal_review,[]);
 for(const key of ['goals','variations'])for(const value of [undefined,null,0]){
  const bad=fixture();bad[key]=value;
  assert.throws(()=>reviewEvidenceIntent(bad),/INVALID_/);
 }
 for(const value of [undefined,null,0]){
  const bad=fixture();bad.goals[0].required_observation_ids=value;
  assert.throws(()=>reviewEvidenceIntent(bad),/INVALID_GOAL_OBSERVATIONS/);
 }
 for(const setSparse of [
  x=>x.observations[0].source_refs=Array(1),
  x=>x.goals[0].claim_ids=Array(1),
  x=>x.goals[0].required_observation_ids=Array(1)
 ]){
  const bad=fixture();setSparse(bad);
  assert.throws(()=>reviewEvidenceIntent(bad),/INVALID_/);
 }
});
test('Cue inferences and caller attestation flags cannot establish intent or authenticate evidence',()=>{
 const q=fixture();q.claims=[q.claims[1]];q.goals=[];q.variations=[];
 q.observations=[{id:'cue-inference',claim_id:'claim-intent',polarity:'SUPPORT',epistemic_state:'INFERRED',source_owner:'fixture:analyst',source_refs:['fixture:cue-report']}];
 const inferred=reviewEvidenceIntent(q);
 assert.equal(inferred.claim_review[0].status,'UNRESOLVED');
 assert.deepEqual(inferred.claim_review[0].unadmitted_observation_ids,['cue-inference']);
 for(const field of ['source_authenticated','deception_determined','criminal_activity_determined']){
  const bad=structuredClone(q);bad[field]=true;
  assert.throws(()=>reviewEvidenceIntent(bad),/INVALID_REVIEW_FIELDS/);
 }
 const extra=structuredClone(q);extra.observations[0].behavioral_cue='voice stress';
 assert.throws(()=>reviewEvidenceIntent(extra),/INVALID_OBSERVATION_FIELDS/);
 // A supplied record of an attestation still cannot establish the mental state asserted.
 q.observations=[{...q.observations[0],id:'declared-attestation',epistemic_state:'OBSERVED',source_refs:['fixture:attestation']}];
 const attested=reviewEvidenceIntent(q);
 assert.equal(attested.claim_review[0].status,'SUPPORTED_BY_SUPPLIED_RECORDS');
 assert.equal(attested.claim_review[0].factual_truth_established,false);
 assert.equal(attested.claim_review[0].source_authenticated,false);
 assert.equal(attested.intention_inferred,false);
 assert.equal(attested.deception_determined,false);
 assert.equal(attested.criminal_activity_determined,false);
});
