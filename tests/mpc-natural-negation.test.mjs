import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectNegationScopes,MPC_NEGATION_LIMITS} from '../lib/mpc-natural-negation.mjs';
test('NOT, prohibition and missing-evidence wording are syntax-only, never proof of real-world absence',()=>{
  const a=inspectNegationScopes('Do not share your password. No evidence of outgoing traffic has been seen.');
  assert.equal(a.kind,'MPC_NATURAL_LANGUAGE_NEGATION_OBSERVATION');
  assert.ok(a.markers.some(x=>x.operator==='do not'&&x.scope_kind==='GRAMMATICAL_PROHIBITION_ONLY'));
  assert.ok(a.markers.some(x=>x.scope_kind==='LIMITED_EVIDENCE_CLAIM'));
  assert.equal(a.negative_real_world_claim_established,false);
  assert.equal(a.authority_established,false);
  assert.equal(a.syntax_only,true);
  assert.equal(a.markers.some(x=>Object.hasOwn(x,'text')),false);
});
test('double NOT remains an ambiguous scope requiring a separate falsifier',()=>{
  const a=inspectNegationScopes('This outcome is not not allowed.');
  assert.ok(a.ambiguous_scope_markers>=1);
  assert.equal(a.markers[0].negative_fact_established,false);
  const b=inspectNegationScopes('Nothing about a notebook should be interpreted as a NOT operator.');
  assert.equal(b.markers.some(x=>x.operator==='notebook'),false);
});
test('long screen text and numerous negations are bounded and disclose partial coverage',()=>{
  const limit=MPC_NEGATION_LIMITS;
  const many=inspectNegationScopes('not '.repeat(100));
  assert.equal(many.markers.length,limit.maxMarkers);
  assert.equal(many.coverage,'BOUNDED_INCOMPLETE');
  const long=inspectNegationScopes('ordinary text '.repeat(19000).slice(0,199000));
  assert.equal(long.coverage,'BOUNDED_INCOMPLETE');
  assert.ok(long.inspected_characters<=limit.scanChars);
  assert.throws(()=>inspectNegationScopes('x'.repeat(limit.maxInputChars+1)),/MPC_NEGATION_TEXT_INVALID/u);
  assert.throws(()=>inspectNegationScopes(null),/MPC_NEGATION_TEXT_INVALID/u);
});
