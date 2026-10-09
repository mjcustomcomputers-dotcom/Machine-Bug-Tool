import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseMethod} from '../lib/method-diagnostic.mjs';
const fp=(digit)=>digit.repeat(64);
const fixture=()=>({
 method_id:'MHA-0224',implementation_state:'RESEARCH_HOOK',
 required_inputs:['source-owned-graph','method-contract'],provided_inputs:['source-owned-graph','method-contract'],
 source_refs:['fixture:source'],oracle_state:'SUPPLIED_UNVERIFIED',negative_control_state:'PASSED_DECLARED',
 prior_fingerprint:fp('a'),current_fingerprint:fp('b'),caller_execution_claim:false
});
test('candidate hook stays research-only despite complete caller inputs',()=>{
 const r=diagnoseMethod(fixture());
 assert.equal(r.decision,'CANDIDATE_ONLY_RESEARCH_HOOK');
 assert.equal(r.claims_authenticated,false);
 assert.equal(r.method_execution_performed,false);
 assert.equal(r.target_test_authorized,false);
});
test('missing source, method precondition and oracle produce explicit blockers',()=>{
 const x=fixture();x.source_refs=[];x.provided_inputs=[];
 const r=diagnoseMethod(x);
 assert.equal(r.decision,'BLOCKED_SOURCE_OR_INPUT');
 assert.deepEqual(r.missing_required_inputs,['method-contract','source-owned-graph']);
 assert.ok(r.proposed_diagnostic_method_ids.includes('MHA-0192'));
 const y=fixture();y.oracle_state='NOT_SUPPLIED';
 assert.equal(diagnoseMethod(y).decision,'BLOCKED_MISSING_ORACLE');
});
test('negative controls and claimed execution fail closed without human verdicts',()=>{
 const x=fixture();x.negative_control_state='FAILED_DECLARED';
 assert.equal(diagnoseMethod(x).decision,'QUARANTINED_NEGATIVE_CONTROL');
 const y=fixture();y.caller_execution_claim=true;
 assert.equal(diagnoseMethod(y).decision,'QUARANTINED_UNVERIFIED_EXECUTION');
 assert.equal(diagnoseMethod(y).canonical_promotion,false);
});
test('matching fingerprint stops zero-material-delta method loops',()=>{
 const x=fixture();x.current_fingerprint=x.prior_fingerprint;
 const r=diagnoseMethod(x);
 assert.equal(r.decision,'STOP_NO_MATERIAL_INFORMATION_GAIN');
 assert.deepEqual(r.proposed_diagnostic_method_ids,['MHA-0199']);
});
test('fully implemented method still needs separate execution authorization',()=>{
 const x=fixture();x.implementation_state='VALIDATED_IMPLEMENTATION';
 const r=diagnoseMethod(x);
 assert.equal(r.decision,'SCHEMA_READY_EXECUTION_REQUIRES_SEPARATE_APPROVAL');
 assert.equal(r.method_execution_performed,false);
});
test('invalid method state, fingerprints or extra fields reject',()=>{
 const x=fixture();x.method_id='unknown';
 assert.throws(()=>diagnoseMethod(x),/INVALID_METHOD_ID_OR_LEVEL/);
 const y=fixture();y.prior_fingerprint='not-a-hash';
 assert.throws(()=>diagnoseMethod(y),/INVALID_FINGERPRINT/);
 const z=fixture();z.allow_target_probe=true;
 assert.throws(()=>diagnoseMethod(z),/UNKNOWN_DIAGNOSTIC_FIELD/);
});
