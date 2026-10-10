import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeCanDlcV29,inspectPassiveCanFrameV29,inspectCanCounterWindowV29,
 auditCanProtectionChainV29} from '../lib/mpc-v29-can-observation.mjs';
import {planMethodMountainsV29,formatCompactEngineeringReceiptV29}
 from '../lib/mpc-v29-method-mountains.mjs';
import {formatCondensedLinguisticOutputV29}
 from '../lib/mpc-v29-compact-linguistic.mjs';
import {renderControlledLinguisticOutputV28}
 from '../lib/mpc-linguistic-output-v28.mjs';

const source_commit='7e0ead087b8fd786fc5e8dcb69d53457f369060f';
const scope_id='fixture:v29',subject_id='fixture:asset';
const src={source_commit,scope_id,subject_id,source_ref:'fixture:s1',
 source_owner:'fixture:owner',source_version:'v1'};
const frame=(frame_kind='CLASSIC',can_id_raw=0x123,dlc=3,data_hex='112233',
 brs=false,esi=false)=>({...src,frame_kind,can_id_raw,dlc,data_hex,brs,esi});
const samples=(values=[14,15,0,1],times=[0,10,20,30])=>({...src,
 clock_domain:'fixture:clock',can_identifier:0x123,counter_modulus:16,
 maximum_expected_period_ms:15,
 samples:values.map((counter,i)=>({source_ref:'fixture:sample'+i,
 source_version:'v1',counter,timestamp_ms:times[i]}))});
const atom=(id,dimension,source_ref='fixture:s1',source_version='v1',
 state='SYNTHETIC')=>({id,dimension,source_ref,source_owner:'fixture:owner',
 source_version,state,scope_id,subject_id});
const mountain=(domain='CAN',atoms=[],opts={})=>({
 source_commit,scope_id,subject_id,domain,world:'SYNTHETIC',
 atoms,max_methods:10,...opts});
const linguistic=()=>({source_commit,scope_id,subject_id,world:'RECORD',format:'LEGAL',
 frames:[
  {id:'main',role:'MAIN',actor:'Agency',patient:'notice',action:'DELIVER',
   polarity:'NEGATED',quantity:'ONE',event_time:'PAST',speech_act:'REPORT',
   evidence_state:'OBSERVED',finality_state:'NONE',finality_owner:null,
   support_refs:[{id:'fixture:receipt',owner:'fixture:owner',version:'v1'}],
   contrary_refs:[]},
  {id:'limitation',role:'LIMITATION',actor:'Agency',patient:'payment',
   action:'VERIFY',polarity:'UNKNOWN',quantity:'SOME',
   event_time:'UNSPECIFIED',speech_act:'REPORT',
   evidence_state:'UNKNOWN',finality_state:'NONE',finality_owner:null,
   support_refs:[],contrary_refs:[]}
 ]});
test('CAN classic standard-ID payload parsing is precise and offline',()=>{
 const r=inspectPassiveCanFrameV29(frame());
 assert.equal(r.state,'PASSIVE_CAN_FRAME_STRUCTURALLY_VALID');
 assert.equal(r.identifier_format,'STANDARD_11BIT');
 assert.equal(r.arbitration_identifier,0x123);
 assert.equal(r.payload_length,3);
 assert.equal(r.raw_payload_retained,false);
 assert.equal(r.bus_actuation_performed,false);
});
test('CAN FD 29-bit ID and DLC9 maps to exactly 12 bytes',()=>{
 const r=inspectPassiveCanFrameV29(frame('FD',0x80000123,9,'ab'.repeat(12),true,false));
 assert.equal(r.identifier_format,'EXTENDED_29BIT');
 assert.equal(r.expected_payload_length,12);
 assert.equal(r.payload_length,12);
 assert.equal(r.bitrate_switch_requested,true);
 assert.equal(decodeCanDlcV29('FD',15),64);
 assert.equal(decodeCanDlcV29('FD',10),16);
});
test('CAN classic and FD DLC constraints are independent',()=>{
 assert.throws(()=>decodeCanDlcV29('CLASSIC',9),/INVALID_CAN_DLC/);
 assert.equal(decodeCanDlcV29('CLASSIC',8),8);
 assert.throws(()=>inspectPassiveCanFrameV29(frame('FD',0x123,9,'00'.repeat(8))),
  /CAN_DLC_PAYLOAD_LENGTH_MISMATCH/);
});
test('CAN ID flag checker rejects reserved bits, FD RTR and error-frame confusion',()=>{
 assert.throws(()=>inspectPassiveCanFrameV29(frame('CLASSIC',0x1000,0,'')),
  /CAN_STANDARD_ID_RESERVED_BITS/);
 assert.throws(()=>inspectPassiveCanFrameV29(frame('FD',0x40000123,0,'')),
  /INVALID_CAN_FRAME_FLAG_COMBINATION/);
 assert.throws(()=>inspectPassiveCanFrameV29(frame('CLASSIC',0x20000123,0,'')),
  /CAN_ERROR_FRAME_SEPARATE_CLASSIFIER/);
});
test('classic RTR frame with requested DLC has no data bytes',()=>{
 const r=inspectPassiveCanFrameV29(frame('CLASSIC',0x40000123,8,''));
 assert.equal(r.frame_type,'REMOTE_REQUEST');
 assert.equal(r.payload_length,0);
 assert.equal(r.state,'PASSIVE_CLASSIC_REMOTE_FRAME_PARSED');
});
test('CAN counter rollover 14 15 0 1 carries no inferred loss',()=>{
 const r=inspectCanCounterWindowV29(samples());
 assert.equal(r.state,'PASSIVE_COUNTER_SEQUENCE_CONSISTENT');
 assert.equal(r.candidate_missing_steps,0);
 assert.ok(r.checks.some(x=>x.signals.includes('EXPECTED_COUNTER_WRAP')));
});
test('CAN counter gap, repeat and clock inversion are independent signals',()=>{
 const r=inspectCanCounterWindowV29(samples([1,3,3,4],[5,16,14,99]));
 assert.equal(r.state,'PASSIVE_COUNTER_REVIEW_SIGNALS_PRESENT');
 assert.equal(r.candidate_missing_steps,1);
 assert.ok(r.checks.some(x=>x.signals.includes('COUNTER_GAP_CANDIDATE')));
 assert.ok(r.checks.some(x=>x.signals.includes('CLOCK_REVERSED')));
 assert.ok(r.checks.some(x=>x.signals.includes('COUNTER_REPEATED')));
});
test('CAN sample version and modulus guards reject malformed records',()=>{
 const x=samples();x.samples[0].source_version='v2';
 assert.throws(()=>inspectCanCounterWindowV29(x),/INVALID_CAN_COUNTER_SAMPLE/);
 const y=samples();y.samples[0].counter=16;
 assert.throws(()=>inspectCanCounterWindowV29(y),/INVALID_CAN_COUNTER_SAMPLE/);
});
test('CRC integrity alone is classified separately from MAC and freshness',()=>{
 const r=auditCanProtectionChainV29({...src,crc_state:'PASS',
  freshness_state:'UNKNOWN',authenticator_state:'UNKNOWN',authorization_state:'UNKNOWN'});
 assert.equal(r.state,'PROTECTION_EVIDENCE_ACQUISITION_REQUIRED');
 assert.equal(r.crc_alone_cannot_establish_authenticity,true);
 assert.ok(r.missing_assurances.includes('authenticator'));
});
test('SecOC reported MAC, freshness, and policy are separate proof stages',()=>{
 const x={...src,crc_state:'PASS',freshness_state:'PASS',
  authenticator_state:'PASS',authorization_state:'PASS'};
 assert.equal(auditCanProtectionChainV29(x).state,
  'DECLARED_AUTH_FRESHNESS_AND_POLICY_STATES_PASS');
 x.authorization_state='FAIL';
 const r=auditCanProtectionChainV29(x);
 assert.equal(r.state,'DECLARED_PROTECTION_FAILURE_REVIEW');
 assert.equal(r.cryptographic_check_performed,false);
 assert.equal(r.ecu_commands_sent,0);
});
test('CAN security receipts reject key material and command instructions',()=>{
 const x={...src,crc_state:'PASS',freshness_state:'PASS',
  authenticator_state:'PASS',authorization_state:'PASS',key:'sensitive'};
 assert.throws(()=>auditCanProtectionChainV29(x),/INVALID_CAN_PROTECTION_FIELDS/);
});
test('method mountains route ready CAN blocks by typed inputs',()=>{
 const r=planMethodMountainsV29(mountain('CAN',[atom('a','RAW_CANID'),atom('b','FRAME_KIND'),
  atom('c','DLC'),atom('d','CODEC_KIND')]));
 assert.equal(r.phase,'ANALYSIS');
 assert.equal(r.method_count_in_research_frontier,46);
 assert.ok(r.selected_methods.some(m=>m.missing.length===0));
 assert.ok(r.blocks.length<=4);
 assert.ok(r.mountain_layers.length>0);
 assert.ok(r.mountain_edges.every(x=>x.observed_intermediate===false));
 assert.equal(r.methods_executed,0);
});
test('method mountains with missing JAVA inputs produce acquisition frontier',()=>{
 const r=planMethodMountainsV29(mountain('JAVA',[]));
 assert.equal(r.phase,'EVIDENCE_ACQUISITION');
 assert.ok(r.smallest_primary_acquisition_frontier.length>0);
 assert.ok(r.smallest_primary_acquisition_frontier.every(x=>x.fetched===false));
});
test('mountain zero delta stops, but source version mismatch wins',()=>{
 const x=mountain('LANGUAGE',[atom('a','SEMANTIC_MESSAGE')]);
 const r=planMethodMountainsV29(x);
 assert.equal(planMethodMountainsV29({...x,previous_fingerprint:r.fingerprint}).phase,'STOP');
 const conflict=mountain('LANGUAGE',[atom('a','SEMANTIC_MESSAGE','fixture:same','v1'),
 atom('b','LOCALE_TAG','fixture:same','v2')],{previous_fingerprint:r.fingerprint});
 assert.equal(planMethodMountainsV29(conflict).status,'SOURCE_VERSION_CONFLICT');
});
test('mountains reject foreign subjects, synthetic-world mixing and hidden controls',()=>{
 const x=mountain('JAVA',[atom('a','CLASS_BYTES')]);x.atoms[0].subject_id='other';
 assert.throws(()=>planMethodMountainsV29(x),/INVALID_MOUNTAIN_ATOM/);
 const y=mountain('JAVA',[atom('a','CLASS_BYTES')],{world:'RECORD'});
 assert.throws(()=>planMethodMountainsV29(y),/MOUNTAIN_WORLD_MIX/);
 const z=mountain('CAN',[],{perform_scan:true});
 assert.throws(()=>planMethodMountainsV29(z),/INVALID_MOUNTAIN_INPUT_FIELDS/);
});
test('compact professional output shows four actionable lines and full receipt digest',()=>{
 const r=planMethodMountainsV29(mountain('CAN',[atom('a','RAW_CANID')]));
 const p=formatCompactEngineeringReceiptV29(r);
 assert.equal(p.content.split('\n').length,4);
 for(const title of ['METHOD','RESULT','EVIDENCE','NEXT'])assert.ok(p.content.includes(title+'  '));
 assert.equal(p.full_receipt_fingerprint,r.fingerprint);
 assert.equal(p.full_receipt_preserved,true);
 assert.ok(!p.content.includes('CANONICAL_PROMOTION'));
});
test('condensed linguistic output preserves V28 audit and real negation',()=>{
 const input=linguistic(),r=formatCondensedLinguisticOutputV29(input);
 assert.equal(r.claim_count,2);
 assert.match(r.content,/Agency did not deliver one notice/);
 assert.equal(r.independent_audit.state,'CONTROLLED_TEMPLATE_REPLAY_CONSISTENT_NOT_SOURCE_VERIFIED');
 assert.equal(r.full_receipt_preserved,true);
 assert.ok(!r.content.includes('[Polarity='));
 assert.match(r.content,/Unresolved:/);
 assert.equal(r.claims[0].polarity,'NEGATED');
});
test('condensed report retains complete underlying original V28 clause order',()=>{
 const input=linguistic(),old=renderControlledLinguisticOutputV28(input);
 const r=formatCondensedLinguisticOutputV29(input);
 assert.deepEqual(r.exact_full_render,old);
 assert.deepEqual(r.claims.map(x=>x.claim_id),old.ordered_claim_ids);
});
