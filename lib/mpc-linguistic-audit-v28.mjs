// MPC V28 — independent finite linguistic realization replay.
// This verifier never invokes the renderer's surface-construction function.
// It checks the exact deliberately restricted grammar, not open-ended English.
import {createHash} from 'node:crypto';
import {validateLinguisticFramesV28} from './mpc-linguistic-output-v28.mjs';

const hash=x=>createHash('sha256').update(JSON.stringify(x),'utf8').digest('hex');
const order={
 PLAIN:['MAIN','CONTEXT','CONTRARY','LIMITATION','NEXT_ACTION'],
 BUSINESS:['MAIN','CONTEXT','LIMITATION','CONTRARY','NEXT_ACTION'],
 LEGAL:['MAIN','CONTRARY','LIMITATION','CONTEXT','NEXT_ACTION'],
 TECHNICAL:['MAIN','CONTRARY','CONTEXT','LIMITATION','NEXT_ACTION'],
 SCIENTIFIC:['MAIN','LIMITATION','CONTRARY','CONTEXT','NEXT_ACTION']
};
const verbs={
 DELIVER:['deliver','delivered','delivers'],FILE:['file','filed','files'],
 APPROVE:['approve','approved','approves'],SETTLE:['settle','settled','settles'],
 DETECT:['detect','detected','detects'],VERIFY:['verify','verified','verifies'],
 AUTHORIZE:['authorize','authorized','authorizes'],OBSERVE:['observe','observed','observes'],
 RECEIVE:['receive','received','receives'],SEND:['send','sent','sends'],
 PAY:['pay','paid','pays'],RECORD:['record','recorded','records'],
 IDENTIFY:['identify','identified','identifies'],
 COMPLETE:['complete','completed','completes']
};
function body(f){
 const patient=(f.quantity==='ONE'?'one ':f.quantity==='SOME'?'some ':
  f.quantity==='ALL'?'all ':'')+f.patient;
 const base=verbs[f.action][0];
 if(f.evidence_state==='UNKNOWN'||f.evidence_state==='CONTESTED'||
    f.role==='NEXT_ACTION'||f.speech_act==='QUESTION')
  return f.actor+' / '+f.action+' / '+patient;
 if(f.event_time==='UNSPECIFIED')
  return f.actor+' / '+f.action+' / '+patient+' (event time unspecified)';
 if(f.event_time==='PAST')
  return f.actor+' '+(f.polarity==='NEGATED'?'did not '+base:verbs[f.action][1])+' '+patient;
 if(f.event_time==='CURRENT')
  return f.actor+' '+(f.polarity==='NEGATED'?'does not '+base:verbs[f.action][2])+' '+patient;
 return f.actor+' '+(f.polarity==='NEGATED'?'will not '+base:'will '+base)+' '+patient;
}
function sentence(f){
 const b=body(f);
 if(f.role==='NEXT_ACTION')return 'Proposed review step (not authorized): examine whether '+b+'.';
 if(f.speech_act==='QUESTION')return 'Review question (not an established fact): whether '+b+'?';
 if(f.evidence_state==='UNKNOWN')return 'The supplied evidence does not resolve whether '+b+'.';
 if(f.evidence_state==='CONTESTED')return 'Supplied accounts conflict on whether '+b+'.';
 const starters={
 OBSERVED:'A caller-supplied observation reports that ',
 CLAIMED:'A supplied source claims that ',
 INFERRED:'An unverified inference proposes that ',
 SYNTHETIC:'In the synthetic model, '
 };
 return starters[f.evidence_state]+b+'.';
}
const cite=r=>r.id+'@'+r.version+' (owner '+r.owner+')';
function evidenceTail(f){
 let finality='NONE';
 if(f.finality_state!=='NONE')
  finality=f.finality_state+' claimed by '+f.finality_owner+' (unverified)';
 return ' [Polarity='+f.polarity+
  '; Quantity='+f.quantity+'; Event time='+f.event_time+
  '; Epistemic='+f.evidence_state+'; Speech act='+f.speech_act+
  '; Finality='+finality+'; Supporting='+
  (f.support_refs.map(cite).join('; ')||'NONE')+
  '; Contrary='+(f.contrary_refs.map(cite).join('; ')||'NONE')+
  '; Source authentication=NOT_PERFORMED]';
}
const limitedArray=(a,n)=>Array.isArray(a)&&a.length<=n;
export const linguisticReplayContractV28=Object.freeze({
 version:'MPC_V28_LINGUISTIC_REPLAY_1',
 checks:['SCOPE','FRAME_SET','ROLE_ORDER','POLARITY','QUANTIFIER',
 'TIME','SPEECH_ACT','FINALITY','CITATION','EXACT_SURFACE','FULL_DOCUMENT'],
 generalized_paraphrase_equivalence:false,
 output_truth_verified:false,source_authentication:false,
 canonical_promotion:false
});
export function auditControlledLinguisticOutputV28(input,output){
 const packet=validateLinguisticFramesV28(input);
 if(!output||typeof output!=='object'||Array.isArray(output)||
  !limitedArray(output.clauses,16)||!limitedArray(output.ordered_claim_ids,16))
  throw Error('INVALID_LINGUISTIC_RECEIPT');
 const issues=[];
 const issue=x=>issues.push(x);
 if(output.version!==packet.version||output.input_digest!==packet.input_digest||
  output.source_commit!==packet.source_commit||
  output.scope_id!==packet.scope_id||
  output.subject_id!==packet.subject_id||
  output.format!==packet.format||output.world!==packet.world)
  issue('SEMANTIC_PACKET_VERSION_OR_SCOPE_MISMATCH');
 const expected=order[packet.format].flatMap(role=>packet.frames.filter(f=>f.role===role));
 if(expected.length!==output.clauses.length||output.ordered_claim_ids.length!==expected.length)
  issue('CLAIM_OMISSION_OR_INJECTION');
 const texts=[];
 for(let i=0;i<expected.length;i++){
  const f=expected[i],actual=output.clauses[i],want=sentence(f)+evidenceTail(f);
  texts.push(want);
  if(!actual||typeof actual!=='object'){issue('CLAIM_RECEIPT_MISSING:'+f.id);continue;}
  if(actual.claim_id!==f.id||actual.role!==f.role||
    actual.index!==i||output.ordered_claim_ids[i]!==f.id)
    issue('CLAIM_ROLE_ORDER_OR_ID_MISMATCH:'+f.id);
  if(actual.semantic_hash!==hash(f))issue('SEMANTIC_FRAME_HASH_CHANGED:'+f.id);
  if(actual.exact_text!==want)issue('CONTROLLED_SURFACE_SEMANTIC_DRIFT:'+f.id);
  const citation=x=>x.id+'@'+x.version+' (owner '+x.owner+')';
  if(!Array.isArray(actual.source_refs)||
    JSON.stringify(actual.source_refs)!==JSON.stringify(f.support_refs.map(citation))||
    !Array.isArray(actual.contrary_refs)||
    JSON.stringify(actual.contrary_refs)!==JSON.stringify(f.contrary_refs.map(citation)))
    issue('SOURCE_REFERENCE_OR_OWNER_MISMATCH:'+f.id);
  if(actual.state!==f.evidence_state||actual.polarity!==f.polarity||
    actual.quantity!==f.quantity||actual.speech_act!==f.speech_act||
    actual.event_time!==f.event_time)
    issue('MODALITY_POLARITY_QUANTIFIER_TIME_MISMATCH:'+f.id);
  if(actual.output_authentication!==false)
    issue('FORGED_OUTPUT_AUTHENTICATION_FLAG:'+f.id);
 }
 if(output.document!==texts.join('\n\n'))issue('DOCUMENT_SURFACE_TAMPERED');
 if(output.all_claims_retained!==true||output.exact_semantic_equivalence_outside_template!==false||
    output.human_review_required!==true||output.source_authentication!==false||
    output.source_owners_independently_checked!==false||
    output.external_action_authorized!==false||output.canonical_promotion!==false)
  issue('FALSE_VERIFICATION_OR_PERMISSION_PROMOTION');
 return {
  version:linguisticReplayContractV28.version,
  state:issues.length?'LINGUISTIC_OUTPUT_AUDIT_REJECTED':
    'CONTROLLED_TEMPLATE_REPLAY_CONSISTENT_NOT_SOURCE_VERIFIED',
  checked_claims:expected.length,issues,
  independent_surface_reconstruction:true,
  general_free_text_semantic_equivalence:false,
  source_authentication:false,factual_truth_verified:false,
  human_review_still_required:true,external_action_authorized:false,
  canonical_promotion:false
 };
}
