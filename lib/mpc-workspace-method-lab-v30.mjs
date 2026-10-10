// MPC V30 — local, opt-in engineering-method receiving adapter.
// Runs exact retained V29/V28 algorithms. No connector dispatch, device control,
// persistent output writes, shell execution or registry promotion.
import {createHash} from 'node:crypto';
import {emitControlledTranslationV29} from './mpc-v29-language-translation.mjs';
import {replayControlledTranslationV29} from './mpc-v29-language-audit.mjs';
import {compileTinyJavaExpressionV29,auditTinyCompilerReplayV29} from './mpc-v29-java-ir.mjs';
import {
 inspectPassiveCanFrameV29,inspectCanCounterWindowV29,auditCanProtectionChainV29
} from './mpc-v29-can-observation.mjs';
import {
 planMethodMountainsV29,formatCompactEngineeringReceiptV29
} from './mpc-v29-method-mountains.mjs';
import {formatCondensedLinguisticOutputV29} from './mpc-v29-compact-linguistic.mjs';

const OPERATIONS=Object.freeze([
 'MOUNTAINS','TRANSLATION','JAVA_EXPRESSION','CAN_FRAME',
 'CAN_COUNTER','CAN_PROTECTION','LINGUISTIC_OUTPUT'
]);
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,239}$/u;
const SOURCE_ID=/^[A-Za-z0-9][A-Za-z0-9_:./@-]{0,111}$/u;
const SHA=/^[a-f0-9]{40}$/u;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 [Object.prototype,null].includes(Object.getPrototypeOf(x));
const sha=value=>createHash('sha256').update(JSON.stringify(value),'utf8').digest('hex');
const fail=(code,message='Selected method input does not match its declared contract.')=>{
 const e=Error(code);
 e.code=code;e.status=422;e.publicMessage=message;
 throw e;
};
const normalError=e=>{
 const internal=String(e?.code??e?.message??'METHOD_INPUT_INVALID');
 const reason=/^[A-Z0-9_]{3,110}$/u.test(internal)?internal:'METHOD_INPUT_INVALID';
 return fail('MPC_WORKSPACE_METHOD_LAB_INPUT_REJECTED',
  'The selected method rejected this input ('+reason+'). Check the source-bound example and method requirements.');
};
function context(input,project){
 if(input.scope_id!==project||!SOURCE_ID.test(input.subject_id??'')||
  !SHA.test(input.source_commit??''))fail('MPC_WORKSPACE_METHOD_LAB_SCOPE_REJECTED',
   'Select the matching project and provide its exact source/subject context.');
}
function evidence(input,project){
 return {
  project_id:project,scope_id:input.scope_id,subject_id:input.subject_id,
  source_commit:input.source_commit,source_ref:input.source_ref??null,
  source_owner:input.source_owner??null,source_version:input.source_version??null,
  identity_state:'CALLER_DECLARED_NOT_AUTHENTICATED'
 };
}
function nextReview(result){
 if(result.state==='TINY_COMPILER_DIFFERENTIAL_REPLAY_PASS')
  return 'Compare a changed opcode against the AST oracle or acquire an independently checked source.';
 return 'Inspect the returned method receipt and obtain the next source-bound observation.';
}
const line=x=>String(x??'UNKNOWN').replace(/[\r\n\u0000-\u001f\u007f]/gu,' ').slice(0,240);
function concise(summary){
 return ['METHOD  '+line(summary.method),'RESULT  '+line(summary.result),
  'EVIDENCE  '+line(summary.evidence),'NEXT  '+line(summary.next)].join('\n');
}
export const ENGINEERING_LAB_V30_CONTRACT=Object.freeze({
 version:'MPC_WORKSPACE_METHOD_LAB_V30_1',
 endpoint:'/api/workspace/methods/engineering',
 operations:OPERATIONS,
 user_opt_in_required:true,project_scope_required:true,
 max_request_json_bytes:32768,max_result_json_bytes:262144,
 execution_host:'LOCAL_LOOPBACK_WORKSPACE',mode:'FINITE_READ_ONLY_COMPUTATION',
 result_format:'METHOD_RESULT_EVIDENCE_NEXT',
 auto_persist:false,external_network:false,can_transmit:false,
 shell_execution:false,source_authentication:false,canonical_promotion:false
});
export function reviewEngineeringMethodLabV30(request){
 if(!plain(request)||Object.keys(request).some(k=>!['opt_in','project_id','operation','input'].includes(k)))
  fail('MPC_WORKSPACE_METHOD_LAB_FIELDS_REJECTED');
 if(request.opt_in!==true)fail('MPC_WORKSPACE_METHOD_LAB_OPT_IN_REQUIRED',
  'Choose the Engineering Lab Run control before any calculation.');
 if(typeof request.project_id!=='string'||!ID.test(request.project_id))
  fail('MPC_WORKSPACE_METHOD_LAB_PROJECT_REQUIRED','Select an open project for this method.');
 if(!OPERATIONS.includes(request.operation)||!plain(request.input))
  fail('MPC_WORKSPACE_METHOD_LAB_OPERATION_REJECTED');
 const bytes=Buffer.byteLength(JSON.stringify(request),'utf8');
 if(bytes>ENGINEERING_LAB_V30_CONTRACT.max_request_json_bytes)
  fail('MPC_WORKSPACE_METHOD_LAB_INPUT_TOO_LARGE','Use a bounded source or smaller method input (32 KiB maximum).');
 const data=request.input,project=request.project_id;
 context(data,project);
 if(request.operation!=='LINGUISTIC_OUTPUT'){
  if(!['source_ref','source_owner','source_version'].every(k=>
    typeof data[k]==='string'&&SOURCE_ID.test(data[k])))
   fail('MPC_WORKSPACE_METHOD_LAB_SOURCE_REQUIRED','Enter source reference, owner and version.');
 }
 const id=evidence(data,project);
 let computation,comparison=null,summary;
 try {
  if(request.operation==='MOUNTAINS'){
   computation=planMethodMountainsV29(data);
   const preview=formatCompactEngineeringReceiptV29(computation);
   summary={...preview.fields,method:preview.fields.method,evidence:preview.fields.evidence,
    next:preview.fields.next};
  } else if(request.operation==='TRANSLATION'){
   computation=emitControlledTranslationV29(data);
   comparison=replayControlledTranslationV29(data,computation);
   summary={method:'CONTROLLED_TRANSLATION',result:comparison.state,
    evidence:data.message_code+' / '+computation.canonical_locale+' / '+data.source_ref,
    next:comparison.problems?.length?
      'Resolve the glossary or source-version disagreement.':'Review terminology and source context before reuse.'};
  } else if(request.operation==='JAVA_EXPRESSION'){
   computation=compileTinyJavaExpressionV29(data);
   comparison=auditTinyCompilerReplayV29({...Object.fromEntries(
      ['source_commit','scope_id','subject_id','source_ref','source_owner','source_version']
        .map(k=>[k,data[k]])),
    expression:data.expression,candidate_bytecode_hex:computation.bytecode_hex});
   summary={method:'TINY_JAVA_AST_VS_JVM',result:comparison.state,
    evidence:'int32='+computation.executed_int32+' / '+data.source_ref,
    next:comparison.state!=='DIFFERENTIAL_REPLAY_MATCH'?
      'Inspect the differing AST and bytecode evaluations.':
      'Vary a bounded expression and replay the independent oracle.'};
  } else if(request.operation==='CAN_FRAME'){
   computation=inspectPassiveCanFrameV29(data);
   summary={method:'PASSIVE_CAN_FRAME',result:computation.state,
    evidence:'CAN ID='+computation.arbitration_identifier+' / bytes='+computation.payload_length+
      ' / '+data.source_ref,
    next:'Review the declared frame ID, DLC and source observation.'};
  } else if(request.operation==='CAN_COUNTER'){
   computation=inspectCanCounterWindowV29(data);
   summary={method:'CAN_COUNTER_WINDOW',result:computation.state,
    evidence:'samples='+computation.sample_count+' / gap candidates='+computation.candidate_missing_steps,
    next:computation.state==='PASSIVE_COUNTER_SEQUENCE_CONSISTENT'?
      'Compare a separate same-clock capture window.':
      'Inspect the flagged transitions against native timestamps and expected rate.'};
  } else if(request.operation==='CAN_PROTECTION'){
   computation=auditCanProtectionChainV29(data);
   summary={method:'CAN_PROTECTION_CHAIN',result:computation.state,
    evidence:'CRC='+computation.integrity_indicator+', freshness='+computation.freshness_indicator+
      ', MAC='+computation.authentication_indicator+', policy='+computation.actor_policy_indicator,
    next:'Acquire the independently verified protection receipts for unresolved stages.'};
  } else if(request.operation==='LINGUISTIC_OUTPUT'){
   computation=formatCondensedLinguisticOutputV29(data);
   comparison=computation.independent_audit;
   summary={method:'LINGUISTIC_OUTPUT_REPLAY',result:comparison.state,
    evidence:'claims='+computation.claim_count+' / '+data.format,
    next:'Compare every source owner, claim polarity and contrary record before using the output.'};
  }
 } catch(e){normalError(e);}
 if(!plain(computation)||!plain(summary))fail('MPC_WORKSPACE_METHOD_LAB_EMPTY_RESULT');
 const full={version:ENGINEERING_LAB_V30_CONTRACT.version,
  operation:request.operation,project_id:project,
  input_json_sha256:sha(data),source:evidence(data,project),
  computation,independent_audit:comparison,
  summary,actions_performed:0,external_access_performed:false,
  output_persisted:false,canonical_promotion:false};
 if(Buffer.byteLength(JSON.stringify(full),'utf8')>ENGINEERING_LAB_V30_CONTRACT.max_result_json_bytes)
  fail('MPC_WORKSPACE_METHOD_LAB_RESULT_TOO_LARGE');
 return {
  ...full,receipt_sha256:sha(full),
  compact_output:concise(summary),receipt_state:'LOCAL_METHOD_EXECUTED_FOR_REVIEW',
  next_action:summary.next
 };
}
