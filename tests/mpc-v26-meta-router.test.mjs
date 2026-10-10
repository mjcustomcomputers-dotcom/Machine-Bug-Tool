import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {loadMethodAtlas,dbAdapter} from '../scripts/method-atlas-cli.mjs';
import {routeMethodAtlas,routeMethodAtlasWithV26} from '../lib/method-atlas-router.mjs';
import {routeMethodsOnMethodsV26,v26RouteContract} from '../lib/mpc-v26-meta-router.mjs';
import {
 v26PrimitiveContract,knowledgeJoinV26,evidenceNegationV26,
 reviewFourValuedEvidenceV26,compareVectorClockIntervalsV26,
 verifyEd25519BytesV26,reviewDeclaredCapabilitySandboxV26,
 planMinimalDistinguishingQuestionsV26,simulateFiniteLemonsScreenV26
} from '../lib/mpc-v26-meta-primitives.mjs';
import overlay from '../research/meta-router-time-auth-v26.json' with {type:'json'};
const sha='bc134031b2d251de5ac0093d9a13aca0a8d955c6';
const scope_id='fixture:business-27',subject_id='fixture:operator-27';
const ctx={source_commit:sha,scope_id,subject_id};
const atom=(dimension,i,extra={})=>({
 id:'atom'+i,dimension,state:'SYNTHETIC',source_ref:'fixture:src'+i,
 source_owner:'fixture:owner',source_version:'v1',scope_id,subject_id,...extra});
const receipt=(a,i)=>({id:'claim'+i,proposition:'BUSINESS_QUALITY',
 polarity:a,epistemic_state:'SYNTHETIC',source_ref:'fixture:'+i,
 source_owner:'fixture:owner',source_version:'v1'});
const clock=(id,vector,lo,hi,domain='clock:one')=>({
 id,source_ref:'fixture:'+id,clock_domain:domain,vector,wall_min_ms:lo,wall_max_ms:hi});
const time=(left,right)=>({...ctx,left,right});
const sig={
 public_key_hex:'d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
 signature_hex:'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'};
const ed=(message_base64='')=>({...ctx,...sig,message_base64,
 key_owner_ref:'fixture:key-owner-unknown',
 message_source_ref:'fixture:message',signature_source_ref:'fixture:signature'});
const caps=(parent_allowed=['READ_SOURCE'],child_requested=['READ_SOURCE'],
 needed_for_method=['READ_SOURCE'],revoked=[])=>({...ctx,parent_allowed,child_requested,needed_for_method,revoked});
const questions=[{id:'Q1',cost:2,source_ref:'fixture:q1'},{id:'Q2',cost:1,source_ref:'fixture:q2'},
 {id:'Q3',cost:9,source_ref:'fixture:q3'}];
const hypotheses=[
 {id:'h1',predictions:{Q1:'YES',Q2:'YES',Q3:'YES'}},
 {id:'h2',predictions:{Q1:'NO',Q2:'YES',Q3:'NO'}},
 {id:'h3',predictions:{Q1:'NO',Q2:'NO',Q3:'YES'}}];
const distinguish=()=>({...ctx,questions,hypotheses,max_questions:3});
const input=(atoms=[],extra={})=>({...ctx,world:'SYNTHETIC',profile:'BUSINESS_STARTUP',atoms,...extra});

test('V26 overlay is additive, source-attributed, no native evaluator inflation',()=>{
 assert.equal(overlay.hooks.length,33);
 assert.equal(overlay.existing_native_evaluators,24);
 assert.equal(overlay.existing_method_atlas_candidates,239);
 assert.equal(overlay.canonical_promotion,false);
 assert.equal(v26PrimitiveContract.native_evaluators_added,0);
 assert.equal(v26RouteContract.native_evaluators_added,0);
 assert.equal(new Set(overlay.hooks.map(h=>h.id)).size,33);
 assert.ok(overlay.hooks.every(h=>h.source_urls.length&&h.source_urls.every(u=>u.startsWith('https://'))));
 assert.equal(overlay.sources.identity,'https://csrc.nist.gov/pubs/sp/800/63/4/final');
});
test('Belnap information join preserves both, neither, negation and algebraic laws',()=>{
 const states=['NEITHER','SUPPORT','REFUTE','BOTH'];
 assert.equal(knowledgeJoinV26('SUPPORT','REFUTE'),'BOTH');
 assert.equal(knowledgeJoinV26('NEITHER','SUPPORT'),'SUPPORT');
 assert.equal(evidenceNegationV26('SUPPORT'),'REFUTE');
 assert.equal(evidenceNegationV26('BOTH'),'BOTH');
 for(const a of states)for(const b of states)for(const c of states){
  assert.equal(knowledgeJoinV26(a,b),knowledgeJoinV26(b,a));
  assert.equal(knowledgeJoinV26(a,a),a);
  assert.equal(knowledgeJoinV26(a,knowledgeJoinV26(b,c)),
   knowledgeJoinV26(knowledgeJoinV26(a,b),c));
 }
 assert.throws(()=>knowledgeJoinV26('ABSOLUTE_TRUTH','SUPPORT'),/UNKNOWN_EVIDENCE_STATE/);
});
test('contradictory source observations are BOTH, never an unconditional PASS',()=>{
 const r=reviewFourValuedEvidenceV26({...ctx,world:'SYNTHETIC',
  assertions:[receipt('SUPPORT',1),receipt('REFUTE',2)]});
 assert.equal(r.evidence[0].knowledge_state,'BOTH');
 assert.equal(r.contested_count,1);
 assert.equal(r.evidence[0].truth_authentication,false);
 assert.equal(r.evidence_authenticated,false);
});
test('a single source supporting and refuting a fact triggers shared-source warning',()=>{
 const x=receipt('SUPPORT',1);
 const y={...receipt('REFUTE',2),source_ref:x.source_ref};
 const r=reviewFourValuedEvidenceV26({...ctx,world:'SYNTHETIC',assertions:[x,y]});
 assert.equal(r.evidence[0].knowledge_state,'BOTH');
 assert.equal(r.evidence[0].shared_source_contradiction,true);
 assert.equal(r.evidence[0].independent_evidence_proven,false);
});
test('claimed but unverified and unknown assertions cannot become verified support',()=>{
 const x={...receipt('SUPPORT',1),epistemic_state:'CLAIMED'};
 const r=reviewFourValuedEvidenceV26({...ctx,world:'RECORD',assertions:[x]});
 assert.equal(r.evidence[0].knowledge_state,'NEITHER');
 assert.deepEqual(r.evidence[0].ignored_as_unverified,['claim1']);
});
test('source-world mix and unauthorized fields fail closed on evidence receipts',()=>{
 const bad={...receipt('SUPPORT',1),epistemic_state:'OBSERVED'};
 assert.throws(()=>reviewFourValuedEvidenceV26({...ctx,world:'SYNTHETIC',assertions:[bad]}),/MIXED_EVIDENCE_WORLD/);
 bad.epistemic_state='SYNTHETIC';bad.personal_trait='unsourced';
 assert.throws(()=>reviewFourValuedEvidenceV26({...ctx,world:'SYNTHETIC',assertions:[bad]}),/INVALID_EVIDENCE_ASSERTION_FIELDS/);
});
test('vector clock precedence and compatible wall interval are separately reported',()=>{
 const r=compareVectorClockIntervalsV26(time(
  clock('a',{p:1,q:0},10,15),clock('b',{p:2,q:1},20,25)));
 assert.equal(r.vector_relation,'LEFT_BEFORE_RIGHT');
 assert.equal(r.wall_relation,'LEFT_BEFORE_RIGHT');
 assert.equal(r.actual_causal_complete,false);
 assert.equal(r.event_identity_proven,false);
});
test('vector incomparability does not establish real-world noncausation',()=>{
 const r=compareVectorClockIntervalsV26(time(
  clock('a',{p:2,q:0},10,20),clock('b',{p:1,q:2},15,25)));
 assert.equal(r.vector_relation,'VECTOR_INCOMPARABLE');
 assert.equal(r.wall_relation,'WALL_INTERVALS_OVERLAP');
 assert.equal(r.clock_authenticated,false);
});
test('vector-clock precedence opposite same-clock physical order flags contradiction',()=>{
 const r=compareVectorClockIntervalsV26(time(
  clock('a',{p:1,q:0},50,60),clock('b',{p:2,q:1},20,30)));
 assert.equal(r.contradictory_order,true);
 assert.equal(r.state,'DECLARED_CAUSAL_CLOCK_CONTRADICTION_REVIEW');
});
test('different clock domains cannot be silently joined by numeric time',()=>{
 const r=compareVectorClockIntervalsV26(time(
  clock('a',{p:1,q:0},50,60,'clock:a'),clock('b',{p:2,q:1},20,30,'clock:b')));
 assert.equal(r.state,'CLOCK_DOMAIN_RECONCILIATION_REQUIRED');
 assert.equal(r.wall_relation,'CLOCK_ALIGNMENT_REQUIRED');
 assert.equal(r.contradictory_order,false);
});
test('vector dimensions, negative counter and same ID are rejected',()=>{
 const a=clock('a',{p:1,q:0},1,2);
 assert.throws(()=>compareVectorClockIntervalsV26(time(a,clock('b',{p:2},3,4))),/INCOMPARABLE_VECTOR_DIMENSIONS/);
 assert.throws(()=>compareVectorClockIntervalsV26(time(a,clock('b',{p:-1,q:1},3,4))),/INVALID_VECTOR_COMPONENTS/);
 assert.throws(()=>compareVectorClockIntervalsV26(time(a,clock('a',{p:2,q:2},3,4))),/CLOCK_EVENTS_MUST_BE_DISTINCT/);
});
test('Ed25519 validates official RFC8032 empty-message vector without authenticating signer',()=>{
 const r=verifyEd25519BytesV26(ed());
 assert.equal(r.state,'ED25519_SIGNATURE_MATHEMATICALLY_VALID');
 assert.equal(r.bytes_checked,0);
 assert.equal(r.cryptographic_signature_check_performed,true);
 assert.equal(r.public_key_owner_authenticated,false);
 assert.equal(r.authorization_proven,false);
});
test('Ed25519 detects changed message and signature without making attribution claims',()=>{
 const x=verifyEd25519BytesV26(ed(Buffer.from('wrong').toString('base64')));
 assert.equal(x.state,'ED25519_SIGNATURE_INVALID');
 const y=ed();y.signature_hex='00'.repeat(64);
 assert.equal(verifyEd25519BytesV26(y).state,'ED25519_SIGNATURE_INVALID');
 assert.equal(x.legal_document_authenticity_proven,false);
});
test('invalid signature input, owner and noncanonical base64 reject',()=>{
 const x=ed();x.public_key_hex='123';
 assert.throws(()=>verifyEd25519BytesV26(x),/INVALID_SIGNATURE_INPUT/);
 const y=ed('aGVsbG8= ');
 assert.throws(()=>verifyEd25519BytesV26(y),/INVALID_SIGNATURE_INPUT/);
 const z=ed();z.key_owner_ref='';
 assert.throws(()=>verifyEd25519BytesV26(z),/INVALID_SIGNATURE_INPUT/);
});
test('declared sandbox intersects parent/child and revoked caps; no runtime claim',()=>{
 const r=reviewDeclaredCapabilitySandboxV26(caps(
  ['READ_SOURCE','NETWORK','EXECUTE'],['READ_SOURCE','NETWORK'],['READ_SOURCE'],['NETWORK']));
 assert.deepEqual(r.proposed_effective_capabilities,['READ_SOURCE']);
 assert.deepEqual(r.explicitly_revoked_capabilities,['NETWORK']);
 assert.equal(r.state,'POLICY_MODEL_PERMITS_REVIEW_ONLY');
 assert.equal(r.sandbox_enforcement_performed,false);
});
test('sandbox rejects child privilege escalation even when another capability suffices',()=>{
 const r=reviewDeclaredCapabilitySandboxV26(caps(
  ['READ_SOURCE'],['READ_SOURCE','NETWORK'],['READ_SOURCE']));
 assert.equal(r.state,'DECLARED_CHILD_ESCALATION_REJECTED');
 assert.deepEqual(r.disallowed_requested_capabilities,['NETWORK']);
 assert.equal(r.native_os_capability_state_unknown,true);
});
test('sandbox missing required capability blocks plan and does not grant authority',()=>{
 const r=reviewDeclaredCapabilitySandboxV26(caps(['READ_SOURCE'],['READ_SOURCE'],
  ['WRITE_SOURCE']));
 assert.equal(r.state,'DECLARED_METHOD_CAPABILITY_BLOCKED');
 assert.deepEqual(r.missing_required_capabilities,['WRITE_SOURCE']);
 assert.equal(r.authority_to_act_proven,false);
});
test('capability policy rejects duplicate, unsupported and extra fields',()=>{
 const x=caps(['READ_SOURCE','READ_SOURCE']);
 assert.throws(()=>reviewDeclaredCapabilitySandboxV26(x),/INVALID_CAPABILITY_PARENT_ALLOWED/);
 const y=caps();y.shell_access=true;
 assert.throws(()=>reviewDeclaredCapabilitySandboxV26(y),/INVALID_CAPABILITY_REQUEST_FIELDS/);
});
test('minimal distinguishing experiment finds exact two-question solution',()=>{
 const r=planMinimalDistinguishingQuestionsV26(distinguish());
 assert.equal(r.state,'MINIMUM_CARDINALITY_DECLARED_QUESTION_COVER');
 assert.deepEqual(r.selected_question_ids,['Q1','Q2']);
 assert.equal(r.selected_cost,3);
 assert.equal(r.hypothesis_pairs,3);
 assert.equal(r.questions_asked,0);
 assert.equal(r.probabilities_inferred,false);
});
test('unknown model predictions block invented distinguishing evidence',()=>{
 const x=distinguish();
 x.hypotheses=x.hypotheses.map(h=>({...h,predictions:{Q1:'UNKNOWN',Q2:'UNKNOWN',Q3:'UNKNOWN'}}));
 const r=planMinimalDistinguishingQuestionsV26(x);
 assert.equal(r.state,'UNDISTINGUISHABLE_HYPOTHESES_REQUIRE_NEW_QUESTIONS');
 assert.equal(r.unresolved_hypothesis_pairs.length,3);
 assert.deepEqual(r.selected_question_ids,[]);
});
test('limited query budget cannot be misreported as complete',()=>{
 const x=distinguish();x.max_questions=1;
 const r=planMinimalDistinguishingQuestionsV26(x);
 assert.equal(r.state,'QUESTION_BUDGET_INSUFFICIENT');
 assert.equal(r.selected_cost,null);
});
test('cost and hypothesis non-equivalence guard rejects malformed claims',()=>{
 const x=distinguish();x.questions[0].cost=0;
 assert.throws(()=>planMinimalDistinguishingQuestionsV26(x),/INVALID_DISTINGUISHING_QUESTION/);
 const y=distinguish();y.hypotheses[1].predictions.Q3='perhaps';
 assert.throws(()=>planMinimalDistinguishingQuestionsV26(y),/INVALID_HYPOTHESIS_PREDICTIONS/);
});
test('Akerlof lemons model only simulates finite quality-pool shrinkage',()=>{
 const r=simulateFiniteLemonsScreenV26({...ctx,buyer_value_multiplier:1,tiers:[
  {id:'good',quality:90,reservation_price:80,quantity:1},
  {id:'lemon',quality:20,reservation_price:5,quantity:1}]});
 assert.deepEqual(r.final_active_tier_ids,['lemon']);
 assert.deepEqual(r.excluded_tier_ids,['good']);
 assert.equal(r.market_equilibrium_verified,false);
 assert.equal(r.price_forecast_proven,false);
});
test('lemons input is not evidence of actual customer value or sales behavior',()=>{
 const x={...ctx,buyer_value_multiplier:1,tiers:[
  {id:'a',quality:30,reservation_price:0,quantity:1},
  {id:'b',quality:50,reservation_price:0,quantity:2}]};
 const r=simulateFiniteLemonsScreenV26(x);
 assert.deepEqual(r.final_active_tier_ids,['a','b']);
 assert.equal(r.consumer_intent_inferred,false);
 x.tiers[0].product_claim='excellent';
 assert.throws(()=>simulateFiniteLemonsScreenV26(x),/INVALID_LEMONS_TIER_FIELDS/);
});
test('startup default routes ready bounded or research methods without asserting existing business',()=>{
 const r=routeMethodsOnMethodsV26(input([atom('QUALITY_TIERS',1),atom('BUYER_BELIEF',2)]));
 assert.equal(r.profile,'BUSINESS_STARTUP');
 assert.equal(r.profile_is_inference,false);
 assert.equal(r.phase,'ANALYSIS');
 assert.equal(r.status,'RESEARCH_METHOD_INPUTS_PRESENT_NOT_EXECUTED');
 assert.equal(r.claims.methods_executed,0);
 assert.equal(r.canonical_promotion,false);
});
test('router missing records goes to acquisition with one bounded next record',()=>{
 const r=routeMethodsOnMethodsV26(input([]));
 assert.equal(r.phase,'EVIDENCE_ACQUISITION');
 assert.ok(r.primary_acquisition_frontier.length>0);
 assert.equal(r.primary_acquisition_frontier[0].external_fetch_performed,false);
 assert.ok(r.primary_acquisition_frontier.every(x=>x.source_locator==='NOT_ACQUIRED'));
});
test('router zero-delta repeats stop, while version disagreement outranks cache',()=>{
 const x=input([atom('QUALITY_TIERS',1),atom('BUYER_BELIEF',2)]);
 const a=routeMethodsOnMethodsV26(x);
 const b=routeMethodsOnMethodsV26({...x,previous_fingerprint:a.fingerprint});
 assert.equal(b.phase,'STOP');assert.equal(b.status,'STOP_NO_MATERIAL_INFORMATION_GAIN');
 const conflict=input([atom('QUALITY_TIERS',1,{source_ref:'fixture:same',source_version:'r1'}),
  atom('BUYER_BELIEF',2,{source_ref:'fixture:same',source_version:'r2'})],{previous_fingerprint:a.fingerprint});
 const z=routeMethodsOnMethodsV26(conflict);
 assert.equal(z.status,'BLOCKED_SOURCE_VERSION_CONFLICT');
 assert.equal(z.phase,'EVIDENCE_ACQUISITION');
});
test('router explicit verification always asks for independent oracle, no invented PASS',()=>{
 const r=routeMethodsOnMethodsV26(input([atom('QUALITY_TIERS',1),atom('BUYER_BELIEF',2)],
  {requested_stage:'VERIFICATION',verification_target:{claim_id:'fixture:quality',oracle_ref:'fixture:oracle'}}));
 assert.equal(r.phase,'VERIFICATION');
 assert.equal(r.status,'INDEPENDENT_VERIFICATION_RECEIPT_REQUIRED');
 assert.equal(r.claims.factual_claims_verified,0);
});
test('router supplementary minimum-question plan does not promote hypothesis to source',()=>{
 const z=distinguish();
 const r=routeMethodsOnMethodsV26(input([],{hypothesis_input:{
  questions:z.questions,hypotheses:z.hypotheses,max_questions:z.max_questions}}));
 assert.deepEqual(r.distinguishing_question_plan.selected_question_ids,['Q1','Q2']);
 assert.equal(r.distinguishing_question_plan.evidence_acquired,0);
 assert.equal(r.phase,'EVIDENCE_ACQUISITION');
});
test('router rejects context override, unbound source and conflicting world',()=>{
 const a=input([atom('QUALITY_TIERS',1)]);a.atoms[0].subject_id='other';
 assert.throws(()=>routeMethodsOnMethodsV26(a),/INVALID_V26_ATOM_SOURCE/);
 const b=input([atom('QUALITY_TIERS',1)]);b.hypothesis_input={...distinguish(),source_commit:'b'.repeat(40)};
 assert.throws(()=>routeMethodsOnMethodsV26(b),/INVALID_V26_HYPOTHESIS_INPUT_FIELDS/);
 const c=input([atom('QUALITY_TIERS',1)]);c.world='RECORD';
 assert.throws(()=>routeMethodsOnMethodsV26(c),/V26_WORLD_MIX/);
});
test('legacy Atlas default route stays identical under opt-in wrapper and source gate',async()=>{
 const db=new DatabaseSync(':memory:');try{
  loadMethodAtlas(db);const adapter=dbAdapter(db);
  const atlas={dimensions:['TIME','IDENTITY'],source_refs:['fixture:src1','fixture:src2'],
   subject_ids:[subject_id],domain_profile:'BUSINESS',max_candidates:6};
  const legacy=await routeMethodAtlas(adapter,atlas);
  const meta=input([atom('QUALITY_TIERS',1),atom('BUYER_BELIEF',2)]);
  const integrated=await routeMethodAtlasWithV26(adapter,{opt_in:true,atlas,meta});
  assert.deepEqual(integrated.original_atlas_route,legacy);
  assert.equal(integrated.meta_method_overlay.profile,'BUSINESS_STARTUP');
  assert.equal(integrated.canonical_registry_mutation,false);
  assert.equal(integrated.methods_executed,false);
  assert.equal(integrated.source_versions_authenticated,false);
  assert.throws(()=>routeMethodAtlasWithV26(adapter,{opt_in:false,atlas,meta}),/EXPLICIT_V26_OPT_IN_REQUIRED/);
  const wrong=input([atom('QUALITY_TIERS',1,{source_ref:'fixture:other'})]);
  await assert.rejects(()=>routeMethodAtlasWithV26(adapter,{opt_in:true,atlas,meta:wrong}),
   /ATLAS_META_SOURCE_SUBJECT_NON_EQUIVALENCE/);
 }finally{db.close()}
});
