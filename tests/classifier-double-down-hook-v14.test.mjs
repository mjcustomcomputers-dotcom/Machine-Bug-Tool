import test from 'node:test';
import assert from 'node:assert/strict';
import {doubleDownClassifierAudit,doubleDownContract} from '../lib/classifier-double-down-hook-v14.mjs';
const blob='a'.repeat(40),other='b'.repeat(40);
const receipt={version:'MPC_NOAHS_ARK_REASONING_V13',status:'EVIDENCE_REVIEW_PLAN_ONLY',
 atom:{subject_id:'fixture:self',atom_id:'fixture:atom',dimensions:['FAULT'],source_refs:['fixture:source'],external_source_refs:[]},
 method_consideration:[{method_id:'MHA-0144'},{method_id:'MHA-0145'}],
 selected_methods:[{method_id:'MHA-0144',decision:'STRUCTURAL_METHOD_CANDIDATE',implementation_state:'RESEARCH_HOOK',negative_control_state:'MISSING',falsifier_state:'UNKNOWN'}],
 proposed_pairs:[{primary_method_id:'MHA-0144',challenger_method_id:'MHA-0145',challenger_readiness:'NEEDS_INPUT_SCHEMA_REVIEW'}],
 outcome_vector:{unresolved_dimensions:['TIME']}};
const variation={version:'MPC_ATOMIC_VARIATION_1.0',decision_counts:{CACHED_NO_MATERIAL_DELTA:4,EXTERNAL_SOURCE_UNBOUND:2},slots_considered:4};
const input={reasoning_receipt:receipt,variation_receipt:variation,reasoning_blob_sha:blob,variation_blob_sha:other};
const run=(o={})=>doubleDownClassifierAudit({...input,...o});
test('double down produces matched morph and inverse challenger packets',()=>{const a=run();assert.equal(a.status,'TWO_PASS_SELF_AUDIT_PLAN');assert.equal(a.primary_pass.length,a.secondary_pass.length);assert.ok(a.emitted_count>=5);assert.ok(a.primary_pass.every(h=>h.derived_status==='PROPOSED_SELF_AUDIT_CLASSIFIER'));assert.ok(a.secondary_pass.every(h=>h.kind==='INVERSE_FALSIFIER'));});
test('exposes both model-readiness and native revision cache hook',()=>{const a=run();assert.ok(a.primary_pass.some(h=>h.type==='RESEARCH_IMPLEMENTATION'));assert.ok(a.primary_pass.some(h=>h.type==='NEGATIVE_CONTROL_MISSING'));assert.ok(a.primary_pass.some(h=>h.type==='CACHE_NATIVE_REVISION'));assert.equal(a.primary_pass[0].type,'CACHE_NATIVE_REVISION');});
test('native version verified match removes only stale-cache hook',()=>{const a=run(),b=run({source_version_state:'VERIFIED_MATCH'});assert.ok(a.primary_pass.some(h=>h.type==='CACHE_NATIVE_REVISION'));assert.ok(!b.primary_pass.some(h=>h.type==='CACHE_NATIVE_REVISION'));assert.ok(b.primary_pass.some(h=>h.type==='RESEARCH_IMPLEMENTATION'));});
test('stable replay and order invariance without overwriting original inputs',()=>{const x=run(),y=run({reasoning_receipt:{...receipt,method_consideration:[...receipt.method_consideration].reverse()}});assert.deepEqual(x.primary_pass,y.primary_pass);assert.equal(x.cache_key,y.cache_key);assert.equal(receipt.selected_methods[0].implementation_state,'RESEARCH_HOOK');assert.equal(variation.decision_counts.CACHED_NO_MATERIAL_DELTA,4);});
test('bounded output and deterministic deferred count',()=>{const x=run({max_hooks:2});assert.equal(x.emitted_count,2);assert.ok(x.deferred_count>0);assert.equal(x.secondary_pass.length,2);});
test('missing source maps to source-owner recovery and never creates fake evidence',()=>{const x=run({reasoning_receipt:{...receipt,status:'BLOCKED_NATIVE_SOURCE',atom:{...receipt.atom,source_refs:[]},selected_methods:[]},variation_receipt:null});assert.ok(x.primary_pass.some(h=>h.type==='SOURCE_UNBOUND'));assert.equal(x.source_authentication,false);assert.equal(x.methods_executed,0);});
test('false source version claims cannot accidentally release the cached state',()=>{assert.throws(()=>run({source_version_state:'FUTURE'}),/DOUBLE_HOOK_INPUT/);});
test('bad router and variation shapes rejected rather than treated as canonical',()=>{assert.throws(()=>run({reasoning_receipt:{...receipt,version:'MPC_FAKED'}}),/DOUBLE_HOOK_ROUTER_VERSION/);assert.throws(()=>run({variation_receipt:{...variation,version:'OTHER'}}),/DOUBLE_HOOK_VARIATION_VERSION/);assert.throws(()=>run({reasoning_blob_sha:'garbage'}),/DOUBLE_HOOK_INPUT/);});
test('research hook remains a candidate and never becomes an implemented solver',()=>{const x=run();const y=run({reasoning_receipt:{...receipt,selected_methods:receipt.selected_methods.map(a=>({...a,implementation_state:'VALIDATED_IMPLEMENTATION'}))}});assert.ok(x.primary_pass.some(h=>h.type==='RESEARCH_IMPLEMENTATION'));assert.ok(!y.primary_pass.some(h=>h.type==='RESEARCH_IMPLEMENTATION'));assert.equal(x.canonical_promotion,false);assert.equal(doubleDownContract.method_execution,false);});
