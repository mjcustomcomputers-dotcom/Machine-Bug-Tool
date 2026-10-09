// Diagnostic gate for a proposed Method Atlas method. This does not run a method,
// authenticate a source, decide guilt, or execute a target-facing action.
const ID=/^MHA-[0-9]{4}$/u;
const KEY=/^[A-Za-z0-9_:.\-]{1,200}$/u;
const LEVEL=new Set(['RESEARCH_HOOK','PROTOTYPE','VALIDATED_IMPLEMENTATION']);
const ORACLE=new Set(['NOT_SUPPLIED','SUPPLIED_UNVERIFIED','CONFLICTING','DECLARED_INDEPENDENT']);
const CONTROL=new Set(['NOT_RUN','PASSED_DECLARED','FAILED_DECLARED']);
const fail=s=>{throw Error(s)};
const goodList=(xs,name,max)=>{
 if(!Array.isArray(xs)||xs.length>max||new Set(xs).size!==xs.length||xs.some(x=>typeof x!=='string'||!KEY.test(x)))fail('INVALID_'+name);
 return [...xs].sort();
};
export function diagnoseMethod(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('DIAGNOSTIC_INPUT_REQUIRED');
 const fields=new Set(['method_id','implementation_state','required_inputs','provided_inputs','source_refs','oracle_state','negative_control_state','prior_fingerprint','current_fingerprint','caller_execution_claim']);
 if(Object.keys(input).some(k=>!fields.has(k)))fail('UNKNOWN_DIAGNOSTIC_FIELD');
 if(typeof input.method_id!=='string'||!ID.test(input.method_id)||!LEVEL.has(input.implementation_state))fail('INVALID_METHOD_ID_OR_LEVEL');
 if(!ORACLE.has(input.oracle_state)||!CONTROL.has(input.negative_control_state))fail('INVALID_DIAGNOSTIC_STATES');
 if(input.caller_execution_claim!==undefined&&typeof input.caller_execution_claim!=='boolean')fail('INVALID_EXECUTION_CLAIM');
 const required=goodList(input.required_inputs,'REQUIRED_INPUTS',16);
 const provided=goodList(input.provided_inputs,'PROVIDED_INPUTS',16);
 const sources=goodList(input.source_refs,'SOURCE_REFS',8);
 const missing=required.filter(x=>!provided.includes(x));
 for(const name of ['prior_fingerprint','current_fingerprint']){
  if(input[name]!==null&&input[name]!==undefined&&(typeof input[name]!=='string'||!/^[a-f0-9]{64}$/u.test(input[name])))fail('INVALID_FINGERPRINT');
 }
 const hasPrior=input.prior_fingerprint!==null&&input.prior_fingerprint!==undefined;
 const hasCurrent=input.current_fingerprint!==null&&input.current_fingerprint!==undefined;
 const unchanged=hasPrior&&hasCurrent&&input.prior_fingerprint===input.current_fingerprint;
 const flags=[];
 if(input.caller_execution_claim&&input.implementation_state!=='VALIDATED_IMPLEMENTATION')flags.push('CLAIMED_EXECUTION_EXCEEDS_DECLARED_LEVEL');
 if(!sources.length)flags.push('SOURCE_REFERENCE_MISSING');
 if(missing.length)flags.push('REQUIRED_METHOD_INPUTS_MISSING');
 if(input.negative_control_state==='FAILED_DECLARED')flags.push('NEGATIVE_CONTROL_FAILURE');
 if(input.oracle_state==='CONFLICTING')flags.push('ORACLE_DISAGREEMENT');
 if(unchanged)flags.push('NO_MATERIAL_INPUT_DELTA');
 if(input.oracle_state==='NOT_SUPPLIED')flags.push('ORACLE_NOT_SUPPLIED');
 let decision='CANDIDATE_ONLY_RESEARCH_HOOK';
 if(flags.includes('CLAIMED_EXECUTION_EXCEEDS_DECLARED_LEVEL'))decision='QUARANTINED_UNVERIFIED_EXECUTION';
 else if(flags.includes('NEGATIVE_CONTROL_FAILURE'))decision='QUARANTINED_NEGATIVE_CONTROL';
 else if(flags.includes('SOURCE_REFERENCE_MISSING')||flags.includes('REQUIRED_METHOD_INPUTS_MISSING'))decision='BLOCKED_SOURCE_OR_INPUT';
 else if(flags.includes('ORACLE_DISAGREEMENT'))decision='BLOCKED_DISAGREEING_ORACLE';
 else if(flags.includes('NO_MATERIAL_INPUT_DELTA'))decision='STOP_NO_MATERIAL_INFORMATION_GAIN';
 else if(input.oracle_state==='NOT_SUPPLIED')decision='BLOCKED_MISSING_ORACLE';
 else if(input.implementation_state==='PROTOTYPE')decision='PROTOTYPE_REVIEW_ONLY';
 else if(input.implementation_state==='VALIDATED_IMPLEMENTATION')decision='SCHEMA_READY_EXECUTION_REQUIRES_SEPARATE_APPROVAL';
 const recommendedChecks=[];
 if(flags.includes('SOURCE_REFERENCE_MISSING'))recommendedChecks.push('MHA-0194');
 if(flags.includes('REQUIRED_METHOD_INPUTS_MISSING'))recommendedChecks.push('MHA-0192');
 if(flags.includes('NEGATIVE_CONTROL_FAILURE'))recommendedChecks.push('MHA-0193');
 if(flags.includes('ORACLE_DISAGREEMENT'))recommendedChecks.push('MHA-0216');
 if(flags.includes('NO_MATERIAL_INPUT_DELTA'))recommendedChecks.push('MHA-0199');
 if(!recommendedChecks.length)recommendedChecks.push('MHA-0231');
 return {version:'MPC_METHOD_DIAGNOSTIC_1.0',method_id:input.method_id,implementation_state:input.implementation_state,
   decision,flags,missing_required_inputs:missing,source_ref_count:sources.length,
   oracle_state:input.oracle_state,negative_control_state:input.negative_control_state,
   no_material_delta:unchanged,proposed_diagnostic_method_ids:[...new Set(recommendedChecks)],
   claims_authenticated:false,independent_verification_performed:false,
   target_test_authorized:false,method_execution_performed:false,canonical_promotion:false,
   next_step:'Resolve the highest priority blocked gate using actual source-owned evidence; run any method only through its separately verified evaluator and approved scope.'};
}
