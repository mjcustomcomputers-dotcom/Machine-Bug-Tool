import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import research from '../research/linguistic-method-space-v28.json' with {type:'json'};
import {
 linguisticV28Contract,linguisticFrameOrderV28,validateLinguisticFramesV28,
 renderControlledLinguisticOutputV28,bindExactQuoteSpanV28
} from '../lib/mpc-linguistic-output-v28.mjs';
import {linguisticReplayContractV28,auditControlledLinguisticOutputV28
} from '../lib/mpc-linguistic-audit-v28.mjs';
import {linguisticMethodRouteV28Contract,runLinguisticMethodsOnMethodsV28
} from '../lib/mpc-linguistic-method-router-v28.mjs';
import {renderOutput} from '../lib/audience-output.mjs';

const source_commit='8cf6888c46f040519b1342cfe21baf02431423ff';
const scope_id='fixture:linguistic-28',subject_id='fixture:record-28';
const base={source_commit,scope_id,subject_id};
const src=(id,owner='fixture:custodian',version='v1')=>({id,owner,version});
const main=()=>({
 id:'claim:main',role:'MAIN',actor:'Agency',action:'DELIVER',
 patient:'notice',quantity:'ONE',polarity:'AFFIRMED',
 event_time:'PAST',speech_act:'REPORT',evidence_state:'OBSERVED',
 finality_state:'NONE',finality_owner:null,
 support_refs:[src('fixture:notice')],contrary_refs:[]
});
const limitation=()=>({
 ...main(),id:'claim:limit',role:'LIMITATION',
 evidence_state:'CLAIMED',support_refs:[src('fixture:limitations')],
 action:'VERIFY',patient:'delivery'
});
const opposing=()=>({
 ...main(),id:'claim:opposing',role:'CONTRARY',
 action:'SETTLE',patient:'invoice',polarity:'UNKNOWN',
 event_time:'UNSPECIFIED',evidence_state:'CONTESTED',
 support_refs:[src('fixture:ledger-1')],contrary_refs:[src('fixture:ledger-2')]
});
const packet=(frames=[main()],format='PLAIN',world='RECORD')=>
 ({...base,world,format,frames:structuredClone(frames)});
const render=x=>renderControlledLinguisticOutputV28(x);
const review=(x,output=render(x))=>auditControlledLinguisticOutputV28(x,output);
const encoded=t=>createHash('sha256').update(t,'utf8').digest('hex');

test('V28 research overlay preserves native evaluators, V27 research and legacy output',()=>{
 assert.equal(research.hooks.length,34);
 assert.equal(research.existing_native_evaluators,24);
 assert.equal(research.existing_method_atlas_candidates,239);
 assert.equal(research.existing_v27_hooks,48);
 assert.equal(research.original_audience_output_unchanged,true);
 assert.equal(research.original_negation_scanner_unchanged,true);
 assert.equal(research.canonical_promotion,false);
 assert.equal(new Set(research.hooks.map(h=>h.id)).size,34);
 assert.ok(research.hooks.every(h=>h.sources.every(s=>s.startsWith('https://'))));
 assert.equal(linguisticMethodRouteV28Contract.canonical_promotion,false);
 assert.equal(linguisticV28Contract.original_audience_output_replaced,false);
});
test('controlled surface preserves actor, patient, polarity, source owner and state',()=>{
 const x=packet();
 const r=render(x);
 assert.equal(r.clauses.length,1);
 assert.match(r.document,/A caller-supplied observation reports that Agency delivered one notice\./);
 assert.match(r.document,/Polarity=AFFIRMED/);
 assert.match(r.document,/fixture:notice@v1 \(owner fixture:custodian\)/);
 assert.match(r.document,/Source authentication=NOT_PERFORMED/);
 assert.equal(r.source_authentication,false);
 assert.equal(r.human_review_required,true);
});
test('independent method-on-method replay checks every generated claim',()=>{
 const x=packet([main(),limitation(),opposing()],'LEGAL');
 const r=review(x);
 assert.equal(r.state,'CONTROLLED_TEMPLATE_REPLAY_CONSISTENT_NOT_SOURCE_VERIFIED');
 assert.equal(r.checked_claims,3);
 assert.equal(r.issues.length,0);
 assert.equal(r.independent_surface_reconstruction,true);
 assert.equal(r.general_free_text_semantic_equivalence,false);
});
test('negated source claim is rendered with not, but a flipped output is rejected',()=>{
 const m=main();m.polarity='NEGATED';
 const x=packet([m]);const y=render(x);
 assert.match(y.document,/Agency did not deliver one notice/);
 const bad=structuredClone(y);
 bad.clauses[0].exact_text=bad.clauses[0].exact_text.replace('did not deliver','did deliver');
 bad.document=bad.clauses[0].exact_text;
 const a=review(x,bad);
 assert.equal(a.state,'LINGUISTIC_OUTPUT_AUDIT_REJECTED');
 assert.ok(a.issues.some(k=>k.startsWith('CONTROLLED_SURFACE_SEMANTIC_DRIFT')));
});
test('unknown evidence never becomes did not occur or no event',()=>{
 const x0=main();x0.evidence_state='UNKNOWN';x0.polarity='UNKNOWN';
 x0.support_refs=[];x0.event_time='UNSPECIFIED';
 const x=packet([x0]);const r=render(x);
 assert.match(r.document,/does not resolve whether Agency \/ DELIVER \/ one notice/);
 assert.ok(!r.document.includes('Agency did not deliver'));
 assert.equal(review(x,r).issues.length,0);
});
test('contradiction must retain both sides, and negative material stays near main',()=>{
 const x=packet([limitation(),opposing(),main()],'LEGAL');
 const r=render(x);
 assert.deepEqual(r.ordered_claim_ids,['claim:main','claim:opposing','claim:limit']);
 assert.match(r.clauses[1].exact_text,/Supplied accounts conflict on whether/);
 assert.match(r.clauses[1].exact_text,/fixture:ledger-2@v1/);
 assert.equal(review(x,r).issues.length,0);
 const bad=packet([opposing()]);bad.frames[0].contrary_refs=[];
 assert.throws(()=>render(bad),/CONTESTED_SOURCES_REQUIRED/);
});
test('some-to-all quantifier promotion is rejected by independent realization check',()=>{
 const m=main();m.patient='transactions';m.quantity='SOME';
 const x=packet([m]);const r=render(x);
 assert.match(r.document,/some transactions/);
 const bad=structuredClone(r);
 bad.clauses[0].exact_text=bad.clauses[0].exact_text.replace('some transactions','all transactions');
 bad.document=bad.clauses[0].exact_text;
 assert.ok(review(x,bad).issues.some(x=>x.includes('SEMANTIC_DRIFT')));
});
test('changed epistemic modality in receipt cannot claim verified/observed status',()=>{
 const x=packet([main()]);const r=render(x);
 const bad=structuredClone(r);
 bad.clauses[0].state='VERIFIED';
 assert.ok(review(x,bad).issues.some(x=>x.includes('MODALITY_POLARITY')));
 const tampered=structuredClone(r);
 tampered.clauses[0].exact_text=tampered.clauses[0].exact_text.replace(
  'caller-supplied observation','independently verified finding');
 tampered.document=tampered.clauses[0].exact_text;
 assert.ok(review(x,tampered).issues.some(x=>x.includes('SEMANTIC_DRIFT')));
});
test('speech act question is not an authority to issue a command',()=>{
 const m=main();m.speech_act='QUESTION';
 const x=packet([m]);const r=render(x);
 assert.match(r.document,/Review question \(not an established fact\): whether/);
 assert.equal(r.external_action_authorized,false);
 assert.equal(review(x,r).issues.length,0);
});
test('NEXT_ACTION is a proposal, not action execution or instruction',()=>{
 const m=main();m.role='NEXT_ACTION';m.id='claim:step';m.speech_act='PROPOSAL';
 const x=packet([main(),m]);const r=render(x);
 assert.match(r.document,/Proposed review step \(not authorized\):/);
 assert.equal(r.external_action_authorized,false);
 m.speech_act='REPORT';
 assert.throws(()=>render(packet([main(),m])),/SPEECH_ACT_ROLE_CONFLICT/);
});
test('proposals cannot be disguised as ordinary main claims',()=>{
 const x=main();x.speech_act='PROPOSAL';
 assert.throws(()=>render(packet([x])),/SPEECH_ACT_ROLE_CONFLICT/);
});
test('finality owner required; future promise cannot become completed state',()=>{
 const m=main();m.finality_state='FINALIZED';
 assert.throws(()=>render(packet([m])),/FINALITY_OWNER_REQUIRED/);
 m.finality_owner='fixture:ledger-controller';m.event_time='FUTURE';
 assert.throws(()=>render(packet([m])),/FUTURE_FINALITY_CONTRADICTION/);
 m.event_time='PAST';const r=render(packet([m]));
 assert.match(r.document,/FINALIZED claimed by fixture:ledger-controller \(unverified\)/);
});
test('known missing source with FINALIZED state is rejected',()=>{
 const m=main();m.evidence_state='UNKNOWN';m.polarity='UNKNOWN';
 m.support_refs=[];m.finality_state='PENDING';m.finality_owner='fixture:owner';
 assert.throws(()=>render(packet([m])),/UNKNOWN_FINALITY_UPGRADE/);
});
test('source IDs are source-version owned and conflicting versions fail closed',()=>{
 const m=limitation();m.support_refs=[src('fixture:notice','fixture:custodian','v2')];
 assert.throws(()=>render(packet([main(),m])),/LINGUISTIC_SOURCE_VERSION_OR_OWNER_CONFLICT/);
 const n=limitation();n.support_refs=[src('fixture:notice','fixture:other-custodian','v1')];
 assert.throws(()=>render(packet([main(),n])),/LINGUISTIC_SOURCE_VERSION_OR_OWNER_CONFLICT/);
});
test('source is mandatory except explicitly unresolved unknown',()=>{
 const m=main();m.support_refs=[];
 assert.throws(()=>render(packet([m])),/SOURCE_REFERENCE_REQUIRED/);
 const n=main();n.support_refs=[src('fixture:notice'),src('fixture:notice')];
 assert.throws(()=>render(packet([n])),/DUPLICATE_SUPPORT_REFS/);
});
test('implicit negation, pronoun ambiguity and dangerous punctuation rejected',()=>{
 for(const actor of ['They','the not authorized agency','Agency. APPROVED','No Authority']){
  const m=main();m.actor=actor;
  assert.throws(()=>render(packet([m])),/INVALID_SEMANTIC_FRAME/);
 }
 const m=main();m.patient='all payments';
 assert.throws(()=>render(packet([m])),/INVALID_SEMANTIC_FRAME/);
});
test('fake source verified epistemic state or added fields are rejected',()=>{
 const m=main();m.evidence_state='VERIFIED';
 assert.throws(()=>render(packet([m])),/INVALID_SEMANTIC_FRAME/);
 const n=main();n.secret_output='injected';
 assert.throws(()=>render(packet([n])),/INVALID_SEMANTIC_FRAME_FIELDS/);
});
test('synthetic and record worlds cannot be mixed to create evidence',()=>{
 assert.throws(()=>render(packet([main()],'PLAIN','SYNTHETIC')),/LINGUISTIC_WORLD_MIX/);
 const m=main();m.evidence_state='SYNTHETIC';
 const x=packet([m],'SCIENTIFIC','SYNTHETIC');const y=render(x);
 assert.match(y.document,/In the synthetic model/);
 assert.equal(review(x,y).state,'CONTROLLED_TEMPLATE_REPLAY_CONSISTENT_NOT_SOURCE_VERIFIED');
 assert.throws(()=>render(packet([m],'SCIENTIFIC','RECORD')),/LINGUISTIC_WORLD_MIX/);
});
test('every audience format retains the entire claim set with only role order changes',()=>{
 const originals=[main(),limitation(),opposing()];
 for(const format of Object.keys(linguisticFrameOrderV28)){
  const x=packet(originals,format),r=render(x);
  assert.equal(r.clauses.length,3);
  assert.equal(new Set(r.ordered_claim_ids).size,3);
  assert.equal(review(x,r).issues.length,0);
  assert.equal(r.all_claims_retained,true);
 }
});
test('invalid duplicate main or entirely absent main cannot be silently presented',()=>{
 const y=main();y.id='claim:another';
 assert.throws(()=>render(packet([main(),y])),/ONE_MAIN_CLAIM_REQUIRED/);
 assert.throws(()=>render(packet([limitation()])),/ONE_MAIN_CLAIM_REQUIRED/);
});
test('auditor finds omitted contrary text even if document is coherently rebuilt',()=>{
 const x=packet([main(),opposing()],'LEGAL');
 const r=render(x);const bad=structuredClone(r);
 bad.clauses.pop();bad.ordered_claim_ids.pop();
 bad.document=bad.clauses.map(c=>c.exact_text).join('\n\n');
 assert.ok(review(x,bad).issues.includes('CLAIM_OMISSION_OR_INJECTION'));
});
test('auditor finds altered input hash and source owner without trusting source text',()=>{
 const x=packet([main()]);const r=render(x);const bad=structuredClone(r);
 bad.input_digest='f'.repeat(64);bad.clauses[0].source_refs=['fixture:fake@v1 (owner unknown)'];
 const a=review(x,bad);
 assert.ok(a.issues.includes('SEMANTIC_PACKET_VERSION_OR_SCOPE_MISMATCH'));
 assert.ok(a.issues.some(x=>x.startsWith('SOURCE_REFERENCE_OR_OWNER_MISMATCH')));
});
test('audit rejects extra ungrounded causal sentence appended to document',()=>{
 const x=packet([main()]);const bad=render(x);
 bad.document+='\n\nTherefore every payment is complete.';
 assert.ok(review(x,bad).issues.includes('DOCUMENT_SURFACE_TAMPERED'));
});
test('output receipt cannot claim authentication or automatic permission after audit',()=>{
 const x=packet([main()]);const bad=render(x);
 bad.source_authentication=true;bad.external_action_authorized=true;
 assert.ok(review(x,bad).issues.includes('FALSE_VERIFICATION_OR_PERMISSION_PROMOTION'));
});
test('repeated render and replay are deterministic on one exact typed packet',()=>{
 const x=packet([limitation(),main(),opposing()],'BUSINESS');
 assert.deepEqual(render(x),render(x));
 assert.deepEqual(review(x),review(x));
});
test('quote span verified against caller-supplied Unicode UTF16 offsets and SHA256',()=>{
 const text='0😀AB end';
 const x={...base,source_ref:'fixture:quote',source_owner:'fixture:owner',
  source_version:'v3',source_text:text,source_sha256:encoded(text),
  start_utf16:3,end_utf16:5,claimed_quote:'AB'};
 const r=bindExactQuoteSpanV28(x);
 assert.equal(r.status,'EXACT_UTF16_QUOTE_FROM_CALLER_SUPPLIED_BYTES');
 assert.equal(r.source_authentication,false);
 assert.equal(r.output_quote_text_retained,false);
 assert.ok(!JSON.stringify(r).includes(text));
});
test('quote digest mismatch and altered quote fail exactness independently',()=>{
 const t='The report says YES';
 const x={...base,source_ref:'fixture:q',source_owner:'fixture:o',
  source_version:'v1',source_text:t,source_sha256:encoded(t),
  start_utf16:4,end_utf16:10,claimed_quote:'report'};
 assert.equal(bindExactQuoteSpanV28(x).status,
  'EXACT_UTF16_QUOTE_FROM_CALLER_SUPPLIED_BYTES');
 const y={...x,claimed_quote:'REPORT'};
 assert.equal(bindExactQuoteSpanV28(y).status,'QUOTE_SPAN_MISMATCH');
 const z={...x,source_sha256:'0'.repeat(64)};
 assert.equal(bindExactQuoteSpanV28(z).status,'CALLER_SUPPLIED_SOURCE_DIGEST_MISMATCH');
});
test('quote range, oversized snippet and unrequested fields fail closed',()=>{
 const t='12345';
 const x={...base,source_ref:'fixture:q',source_owner:'fixture:o',
  source_version:'v1',source_text:t,source_sha256:encoded(t),
  start_utf16:5,end_utf16:6,claimed_quote:'5'};
 assert.throws(()=>bindExactQuoteSpanV28(x),/INVALID_QUOTE_BOUNDARY/);
 const y={...x,start_utf16:0,end_utf16:5,claimed_quote:'12345',private_user_token:'secret'};
 assert.throws(()=>bindExactQuoteSpanV28(y),/INVALID_QUOTE_FIELDS/);
});
test('meta pass executes controlled renderer and independent audit only',()=>{
 const x=packet([main(),limitation()],'TECHNICAL');
 const r=runLinguisticMethodsOnMethodsV28({...x,max_methods:8});
 assert.equal(r.phase,'VERIFICATION_REVIEW');
 assert.equal(r.status,'CONTROLLED_RENDER_AND_INDEPENDENT_AUDIT_PASSED_SOURCE_UNVERIFIED');
 assert.equal(r.output_methods_executed,2);
 assert.equal(r.research_hooks_executed,0);
 assert.equal(r.selected.length,8);
 assert.equal(r.audit_receipt.issues.length,0);
 assert.equal(r.source_authentication,false);
 assert.equal(r.external_actions,0);
});
test('meta-router stops zero gain on unchanged source-claim-frame fingerprint',()=>{
 const x=packet([main()],'LEGAL');
 const a=runLinguisticMethodsOnMethodsV28(x);
 const b=runLinguisticMethodsOnMethodsV28({...x,previous_input_digest:a.input_digest});
 assert.equal(b.phase,'STOP');
 assert.equal(b.status,'STOP_NO_MATERIAL_LINGUISTIC_INFORMATION_GAIN');
 assert.equal(b.rendered_output,null);
 assert.equal(b.output_methods_executed,0);
 assert.equal(b.canonical_promotion,false);
});
test('meta-router rejects invalid budgets, extra fields and forged fingerprints',()=>{
 const x=packet([main()]);
 assert.throws(()=>runLinguisticMethodsOnMethodsV28({...x,max_methods:50}),
  /INVALID_LINGUISTIC_META_BUDGET/);
 assert.throws(()=>runLinguisticMethodsOnMethodsV28({...x,authority_override:true}),
  /INVALID_LINGUISTIC_META_REQUEST/);
 assert.throws(()=>runLinguisticMethodsOnMethodsV28({...x,previous_input_digest:'fake'}),
  /INVALID_LINGUISTIC_META_BUDGET/);
});
test('method interfaces remain hypothetical and source-unverified',()=>{
 const x=packet([main(),limitation()],'LEGAL');
 const p=runLinguisticMethodsOnMethodsV28({...x,max_methods:8});
 assert.ok(p.hypothetical_links.every(e=>e.output_is_new_independent_evidence===false));
 assert.ok(p.hypothetical_links.every(e=>e.source_independence_proven===false));
 assert.ok(p.selected.every(h=>h.scholarly_method_implemented===false));
});
test('no baseline change to original UMTB-4 audience renderer',async()=>{
 const original={
  format:'TECHNICAL',audience:'reviewer',
  headline_claim_id:'c1',lead_claim_id:'c1',
  claims:[{id:'c1',text:'The notice was submitted.',role:'MAIN',
   epistemic_state:'OBSERVED',finality_state:'PENDING',
   finality_owner:'custodian',source_refs:['fixture:notice']},
   {id:'c2',text:'Receipt is not verified.',role:'LIMITATION',
   epistemic_state:'INFERRED',finality_state:'NONE',
   finality_owner:null,source_refs:['fixture:check']}]
 };
 const r=await renderOutput(original);
 assert.equal(r.version,'UMTB-4.0');
 assert.equal(r.claims.length,2);
 assert.equal(r.semantic_headline_support_verified,false);
 assert.equal(r.canonical_promotion,false);
 assert.match(r.document,/Receipt is not verified/);
});
