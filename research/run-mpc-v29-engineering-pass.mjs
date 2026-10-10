#!/usr/bin/env node
// V29 deterministic engineering methods pass over synthetic source records.
import {emitControlledTranslationV29,inspectUnicodeNormalFormsV29}
 from '../lib/mpc-v29-language-translation.mjs';
import {replayControlledTranslationV29} from '../lib/mpc-v29-language-audit.mjs';
import {compileTinyJavaExpressionV29,auditTinyCompilerReplayV29}
 from '../lib/mpc-v29-java-ir.mjs';
import {inspectPassiveCanFrameV29,inspectCanCounterWindowV29,
 auditCanProtectionChainV29} from '../lib/mpc-v29-can-observation.mjs';
import {planMethodMountainsV29,formatCompactEngineeringReceiptV29}
 from '../lib/mpc-v29-method-mountains.mjs';
import {formatCondensedLinguisticOutputV29}
 from '../lib/mpc-v29-compact-linguistic.mjs';

const ctx={source_commit:'7e0ead087b8fd786fc5e8dcb69d53457f369060f',
 scope_id:'fixture:mpc-v29',subject_id:'fixture:vehicle',
 source_ref:'fixture:local-record',source_owner:'fixture:lab',source_version:'v1'};
const lex={...ctx,message_code:'VERIFICATION_PASSED',locale_tag:'es-MX',register:'ENGINEERING'};
const translated=emitControlledTranslationV29(lex),
 roundtrip=replayControlledTranslationV29(lex,translated);
const unicode=inspectUnicodeNormalFormsV29({...ctx,text:'Cafe\u0301'});
const expression={op:'ADD',left:{op:'MUL',left:{op:'LIT',value:1234},
  right:{op:'LIT',value:25}},right:{op:'LIT',value:-1}};
const compiled=compileTinyJavaExpressionV29({...ctx,expression});
const compilerAudit=auditTinyCompilerReplayV29({...ctx,expression,candidate_bytecode_hex:compiled.bytecode_hex});
const frame=inspectPassiveCanFrameV29({...ctx,frame_kind:'FD',can_id_raw:0x80000123,
 dlc:9,data_hex:'1a'.repeat(12),brs:true,esi:false});
const counter=inspectCanCounterWindowV29({...ctx,clock_domain:'fixture:clock',
 can_identifier:0x123,counter_modulus:16,maximum_expected_period_ms:25,
 samples:[14,15,0,2].map((n,i)=>({source_ref:'fixture:event'+i,
 source_version:'v1',counter:n,timestamp_ms:i*10}))});
const secoc=auditCanProtectionChainV29({...ctx,
 crc_state:'PASS',freshness_state:'UNKNOWN',
 authenticator_state:'UNKNOWN',authorization_state:'UNKNOWN'});
const atom=(id,dimension)=>({id,dimension,state:'SYNTHETIC',
 source_ref:'fixture:'+id,source_owner:'fixture:lab',source_version:'v1',
 scope_id:ctx.scope_id,subject_id:ctx.subject_id});
const methodPlan=planMethodMountainsV29({...ctx,domain:'CAN',world:'SYNTHETIC',
 max_methods:10,atoms:[atom('can','RAW_CANID'),atom('frame','FRAME_KIND'),
  atom('dlc','DLC'),atom('codec','CODEC_KIND')]});
const compact=formatCompactEngineeringReceiptV29(methodPlan);
const language= formatCondensedLinguisticOutputV29({
 source_commit:ctx.source_commit,scope_id:ctx.scope_id,subject_id:ctx.subject_id,
 world:'RECORD',format:'TECHNICAL',frames:[{
  id:'main',role:'MAIN',actor:'System',patient:'frame',action:'RECEIVE',
  quantity:'ONE',polarity:'NEGATED',event_time:'PAST',speech_act:'REPORT',
  evidence_state:'OBSERVED',finality_state:'NONE',finality_owner:null,
  support_refs:[{id:'fixture:frame-record',owner:'fixture:lab',version:'v1'}],
  contrary_refs:[]
 }]});
const outputs={kind:'MPC_V29_ENGINEERING_METHODS_SYNTHETIC_PASS',
 status:'ACQUIRED_ANALYZED_DECIDED',method_hooks:46,
 language:{locale:translated.canonical_locale,text:translated.output_text,
  replay:roundtrip.state},
 unicode:{nfc_changed:unicode.nfc_changed,nfkc_changed:unicode.nfkc_changed},
 java:{result:compiled.executed_int32,oracle:compilerAudit.state},
 can:{frame:frame.state,fd_length:frame.payload_length,counter:counter.state,
  gap_candidates:counter.candidate_missing_steps,security:secoc.state},
 methods:{blocks:methodPlan.blocks.map(b=>({domain:b.domain,methods:b.method_ids.length})),
  mountain_layers:methodPlan.mountain_layers.length,source_next:methodPlan.next_action},
 compact_output:compact.content,
 verified_linguistic_output:language.content,
 focused_methods_executed:7,remote_actions:0,
 original_v28_receipt:language.independent_audit.state};
if(roundtrip.state!=='CONTROLLED_TRANSLATION_REPLAY_PASS'||
 compilerAudit.state!=='DIFFERENTIAL_REPLAY_MATCH'||
 frame.state!=='PASSIVE_CAN_FRAME_STRUCTURALLY_VALID'||
 counter.candidate_missing_steps!==1||
 language.independent_audit.state!=='CONTROLLED_TEMPLATE_REPLAY_CONSISTENT_NOT_SOURCE_VERIFIED')
 throw Error('V29_SYNTHETIC_REPLAY_CONTROL_FAILED');
console.log(JSON.stringify(outputs,null,2));
