// MPC V29 — offline Controller Area Network frame and protection-state methods.
// Passive source records. No SocketCAN opening, CAN transmit, UDS or ECU control.
import {createHash} from 'node:crypto';
const fail=s=>{throw Error(s)};
const ID=/^[A-Za-z0-9][A-Za-z0-9_:./@-]{0,111}$/u;
const sha=x=>createHash('sha256').update(x).digest('hex');
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 [Object.prototype,null].includes(Object.getPrototypeOf(x));
const only=(o,fields,label)=>{if(!obj(o)||Object.keys(o).some(k=>!fields.includes(k)))fail('INVALID_'+label+'_FIELDS')};
const fields=['source_commit','scope_id','subject_id','source_ref','source_owner','source_version'];
const source=o=>{
 if(!obj(o)||!(/^[a-f0-9]{40}$/u.test(o.source_commit||''))||
  !fields.slice(1).every(k=>typeof o[k]==='string'&&ID.test(o[k])))
  fail('INVALID_CAN_SOURCE_CONTEXT');
 return Object.fromEntries(fields.map(k=>[k,o[k]]));
};
const DLC_FD=Object.freeze([0,1,2,3,4,5,6,7,8,12,16,20,24,32,48,64]);
export const canV29Contract=Object.freeze({
 version:'MPC_V29_PASSIVE_CAN_FRAME_1',source:'LINUX_SOCKETCAN_CANFD',
 supported:['CLASSIC','FD'],dlc_fd_bytes:DLC_FD,
 can_sff_mask:0x7ff,can_eff_mask:0x1fffffff,
 flag_extended:0x80000000,flag_remote:0x40000000,flag_error:0x20000000,
 max_frames:64,source_capture_mode:'OFFLINE_DECLARED',
 network_open:false,frame_transmit:false,diagnostic_command:false,
 secoc_crypto_execution:false,canonical_promotion:false
});
export function decodeCanDlcV29(kind,dlc){
 if(!['CLASSIC','FD'].includes(kind)||!Number.isInteger(dlc))
  fail('INVALID_CAN_DLC');
 if(kind==='CLASSIC'&&(dlc<0||dlc>8)||
    kind==='FD'&&(dlc<0||dlc>15))fail('INVALID_CAN_DLC');
 return kind==='CLASSIC'?dlc:DLC_FD[dlc];
}
function payload(value){
 if(typeof value!=='string'||value.length>128||value.length%2||
  !/^[a-fA-F0-9]*$/u.test(value))fail('INVALID_CAN_PAYLOAD_HEX');
 return Buffer.from(value,'hex');
}
export function inspectPassiveCanFrameV29(input){
 only(input,[...fields,'frame_kind','can_id_raw','dlc','data_hex','brs','esi'],'CAN_FRAME');
 const c=source(input);
 if(!['CLASSIC','FD'].includes(input.frame_kind)||
  !Number.isSafeInteger(input.can_id_raw)||input.can_id_raw<0||
  input.can_id_raw>0xffffffff||
  typeof input.brs!=='boolean'||typeof input.esi!=='boolean')
   fail('INVALID_CAN_FRAME_METADATA');
 const canid=input.can_id_raw>>>0;
 const extended=(canid&0x80000000)!==0,
  remote=(canid&0x40000000)!==0,
  error=(canid&0x20000000)!==0,
  identifier=canid&(extended?0x1fffffff:0x7ff);
 if(!extended&&(canid&0x1ffff800)!==0)fail('CAN_STANDARD_ID_RESERVED_BITS');
 if(error)fail('CAN_ERROR_FRAME_SEPARATE_CLASSIFIER');
 if(input.frame_kind==='FD'&&remote||input.frame_kind==='CLASSIC'&&(input.brs||input.esi))
  fail('INVALID_CAN_FRAME_FLAG_COMBINATION');
 const expected=decodeCanDlcV29(input.frame_kind,input.dlc),
  bytes=payload(input.data_hex);
 if(bytes.length!==(remote?0:expected))fail('CAN_DLC_PAYLOAD_LENGTH_MISMATCH');
 return {version:canV29Contract.version,...c,
  frame_kind:input.frame_kind,identifier_format:extended?'EXTENDED_29BIT':'STANDARD_11BIT',
  arbitration_identifier:identifier,
  frame_type:remote?'REMOTE_REQUEST':'DATA',
  dlc:input.dlc,expected_payload_length:expected,payload_length:bytes.length,
  payload_sha256:sha(bytes),bitrate_switch_requested:input.brs,
  error_state_indicator:input.esi,
  state:remote?'PASSIVE_CLASSIC_REMOTE_FRAME_PARSED':'PASSIVE_CAN_FRAME_STRUCTURALLY_VALID',
  source_authenticated:false,
  e2e_crc_verified:false,secoc_authenticity_verified:false,
  ecu_owner_verified:false,bus_actuation_performed:false,
  raw_payload_retained:false,canonical_promotion:false};
}
export function inspectCanCounterWindowV29(input){
 only(input,[...fields,'clock_domain','can_identifier','counter_modulus',
   'maximum_expected_period_ms','samples'],'CAN_COUNTER');
 const c=source(input);
 if(!ID.test(input.clock_domain||'')||!Number.isSafeInteger(input.can_identifier)||
  input.can_identifier<0||input.can_identifier>0x1fffffff||
  ![4,16,256].includes(input.counter_modulus)||
  !Number.isFinite(input.maximum_expected_period_ms)||
  input.maximum_expected_period_ms<=0||input.maximum_expected_period_ms>60000||
  !Array.isArray(input.samples)||input.samples.length<2||
  input.samples.length>64)fail('INVALID_CAN_COUNTER_CONTEXT');
 let prev=null,missing=0;
 const checks=[];
 for(const [i,s] of input.samples.entries()){
  only(s,['source_ref','source_version','counter','timestamp_ms'],'CAN_COUNTER_SAMPLE');
  if(!ID.test(s.source_ref||'')||s.source_version!==input.source_version||
    !Number.isInteger(s.counter)||s.counter<0||
    s.counter>=input.counter_modulus||!Number.isFinite(s.timestamp_ms)||
    s.timestamp_ms<0)fail('INVALID_CAN_COUNTER_SAMPLE');
  if(prev){
   const delta=(s.counter-prev.counter+input.counter_modulus)%input.counter_modulus;
   const dt=s.timestamp_ms-prev.timestamp_ms;
   const labels=[];
   if(dt<0)labels.push('CLOCK_REVERSED');
   if(dt>input.maximum_expected_period_ms)labels.push('OBSERVATION_INTERVAL_OVER_LIMIT');
   if(delta===0)labels.push('COUNTER_REPEATED');
   else if(delta>1){labels.push('COUNTER_GAP_CANDIDATE');missing+=delta-1;}
   if(delta===1&&s.counter<prev.counter)labels.push('EXPECTED_COUNTER_WRAP');
   checks.push({transition:i-1+'->'+i,delta_modulo:delta,interval_ms:dt,
    signals:labels});
  }
  prev=s;
 }
 return {version:canV29Contract.version,...c,
  counter_modulus:input.counter_modulus,clock_domain:input.clock_domain,
  can_identifier:input.can_identifier,sample_count:input.samples.length,
  candidate_missing_steps:missing,checks,
  state:checks.some(x=>x.signals.some(s=>s!=='EXPECTED_COUNTER_WRAP'))?
    'PASSIVE_COUNTER_REVIEW_SIGNALS_PRESENT':'PASSIVE_COUNTER_SEQUENCE_CONSISTENT',
  delivery_loss_proven:false,source_authenticated:false,
  sender_authenticated:false,security_violation_proven:false,
  frame_transmission_performed:false};
}
const PROOF=['PASS','FAIL','UNKNOWN'];
export function auditCanProtectionChainV29(input){
 only(input,[...fields,'crc_state','freshness_state','authenticator_state',
  'authorization_state'],'CAN_PROTECTION');
 const c=source(input);
 for(const k of ['crc_state','freshness_state','authenticator_state','authorization_state'])
  if(!PROOF.includes(input[k]))fail('INVALID_CAN_PROTECTION_STATE');
 const cryptographic=input.authenticator_state==='PASS'&&input.freshness_state==='PASS';
 const ready=cryptographic&&input.authorization_state==='PASS';
 const failed=['crc_state','freshness_state','authenticator_state','authorization_state']
  .filter(k=>input[k]==='FAIL').map(x=>x.replace('_state',''));
 const absent=['freshness_state','authenticator_state','authorization_state']
  .filter(k=>input[k]==='UNKNOWN').map(x=>x.replace('_state',''));
 return {version:'MPC_V29_CAN_SECURITY_CHAIN_1',...c,
  integrity_indicator:input.crc_state,authentication_indicator:input.authenticator_state,
  freshness_indicator:input.freshness_state,
  actor_policy_indicator:input.authorization_state,
  state:failed.length?'DECLARED_PROTECTION_FAILURE_REVIEW':
    ready?'DECLARED_AUTH_FRESHNESS_AND_POLICY_STATES_PASS':'PROTECTION_EVIDENCE_ACQUISITION_REQUIRED',
  failed_components:failed,missing_assurances:absent,
  crc_alone_cannot_establish_authenticity:true,
  cryptographic_check_performed:false,secoc_keys_accessed:false,
  policy_owner_authenticated:false,ecu_commands_sent:0,
  source_authenticated:false,canonical_promotion:false};
}
