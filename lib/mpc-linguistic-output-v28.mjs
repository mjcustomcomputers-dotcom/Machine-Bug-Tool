// MPC V28 — linguistic output is a method on other methods.
// Controlled language realization from typed, source-bound propositions.
// No free-text semantic equivalence, autonomous translation or promotion.
import {createHash} from 'node:crypto';

const fail=s=>{throw Error(s)};
const ID=/^[A-Za-z0-9][A-Za-z0-9_:./@-]{0,119}$/u;
const COMMIT=/^[a-f0-9]{40}$/u;
const LABEL=/^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$/u;
const NEG=/\b(?:no|not|never|cannot|without|all|every|none|must|shall)\b/iu;
const PRONOUN=/^(?:he|she|they|them|him|her|it|this|that|those)$/iu;
const ROLES=['MAIN','CONTEXT','CONTRARY','LIMITATION','NEXT_ACTION'];
const EVIDENCE=['OBSERVED','CLAIMED','INFERRED','CONTESTED','UNKNOWN','SYNTHETIC'];
const TIME=['PAST','CURRENT','FUTURE','UNSPECIFIED'];
const POLARITY=['AFFIRMED','NEGATED','UNKNOWN'];
const QUANTITY=['ONE','SOME','ALL','UNSPECIFIED'];
const ACT=['REPORT','QUESTION','PROPOSAL'];
const FINAL=['NONE','PENDING','FINALIZED'];
const FORMATS=['PLAIN','BUSINESS','LEGAL','TECHNICAL','SCIENTIFIC'];
const VERBS=Object.freeze({
 DELIVER:['deliver','delivered','delivers'],
 FILE:['file','filed','files'],
 APPROVE:['approve','approved','approves'],
 SETTLE:['settle','settled','settles'],
 DETECT:['detect','detected','detects'],
 VERIFY:['verify','verified','verifies'],
 AUTHORIZE:['authorize','authorized','authorizes'],
 OBSERVE:['observe','observed','observes'],
 RECEIVE:['receive','received','receives'],
 SEND:['send','sent','sends'],
 PAY:['pay','paid','pays'],
 RECORD:['record','recorded','records'],
 IDENTIFY:['identify','identified','identifies'],
 COMPLETE:['complete','completed','completes']
});
const isObj=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 [Object.prototype,null].includes(Object.getPrototypeOf(o));
const fields=(o,permitted,label)=>{
 if(!isObj(o)||Object.keys(o).some(k=>!permitted.includes(k)))fail('INVALID_'+label+'_FIELDS');
};
const dense=x=>Array.isArray(x)&&Array.from({length:x.length},(_,i)=>Object.hasOwn(x,i)).every(Boolean);
const uniq=x=>[...new Set(x)];
const validId=x=>typeof x==='string'&&ID.test(x);
const validLabel=x=>typeof x==='string'&&LABEL.test(x)&&
 !NEG.test(x)&&!PRONOUN.test(x.trim());
const digest=o=>createHash('sha256').update(JSON.stringify(o),'utf8').digest('hex');
const refs=['id','owner','version'];
export const linguisticV28Contract=Object.freeze({
 version:'MPC_V28_CONTROLLED_LINGUISTIC_METHOD_1',
 template_family:'SOURCE_BOUND_ENGLISH_CLAUSE_ONLY',
 max_claims:16,max_refs_each:6,max_quote_chars:1200,
 supported_formats:FORMATS,
 supported_verbs:Object.keys(VERBS),
 general_paraphrase_equivalence:false,
 full_amr_parser:false,free_text_translation:false,
 raw_source_authenticated:false,truth_established:false,
 speech_act_permission:false,external_send:false,
 original_audience_output_replaced:false,canonical_promotion:false
});
function sourceRef(r){
 fields(r,refs,'LINGUISTIC_REFERENCE');
 if(!validId(r.id)||!validId(r.owner)||!validId(r.version))
  fail('INVALID_LINGUISTIC_REFERENCE');
 return r;
}
function sourceList(value,max,label){
 if(!dense(value)||value.length>max)fail('INVALID_'+label);
 const seen=new Set();
 for(const r of value){
  sourceRef(r);const key=JSON.stringify([r.id,r.version,r.owner]);
  if(seen.has(key))fail('DUPLICATE_'+label);
  seen.add(key);
 }
 return value;
}
export function validateLinguisticFramesV28(input){
 fields(input,['source_commit','scope_id','subject_id','world','format','frames'],'LINGUISTIC_REQUEST');
 if(!COMMIT.test(input.source_commit||'')||!validId(input.scope_id)||
  !validId(input.subject_id)||!['RECORD','SYNTHETIC'].includes(input.world)||
  !FORMATS.includes(input.format)||!dense(input.frames)||
  !input.frames.length||input.frames.length>16)fail('INVALID_LINGUISTIC_CONTEXT');
 const ids=new Set(),knownSources=new Map();let mains=0;
 for(const f of input.frames){
  fields(f,['id','role','actor','action','patient','quantity','polarity','event_time',
   'speech_act','evidence_state','finality_state','finality_owner',
   'support_refs','contrary_refs'],'SEMANTIC_FRAME');
  if(!validId(f.id)||ids.has(f.id)||!ROLES.includes(f.role)||!validLabel(f.actor)||
   !validLabel(f.patient)||!Object.hasOwn(VERBS,f.action)||
   !QUANTITY.includes(f.quantity)||!POLARITY.includes(f.polarity)||
   !TIME.includes(f.event_time)||!ACT.includes(f.speech_act)||
   !EVIDENCE.includes(f.evidence_state)||!FINAL.includes(f.finality_state))
   fail('INVALID_SEMANTIC_FRAME');
  ids.add(f.id);if(f.role==='MAIN')mains++;
  sourceList(f.support_refs,6,'SUPPORT_REFS');
  sourceList(f.contrary_refs,6,'CONTRARY_REFS');
  for(const r of [...f.support_refs,...f.contrary_refs]){
   const last=knownSources.get(r.id);
   if(last&&(last.owner!==r.owner||last.version!==r.version))
    fail('LINGUISTIC_SOURCE_VERSION_OR_OWNER_CONFLICT');
   knownSources.set(r.id,{owner:r.owner,version:r.version});
  }
  if(input.world==='SYNTHETIC'&&f.evidence_state!=='SYNTHETIC'&&
     f.evidence_state!=='UNKNOWN'||
     input.world==='RECORD'&&f.evidence_state==='SYNTHETIC')
   fail('LINGUISTIC_WORLD_MIX');
  if(f.evidence_state==='UNKNOWN'||f.evidence_state==='CONTESTED'){
   if(f.polarity!=='UNKNOWN')fail('UNSUPPORTED_POLARITY_PROMOTION');
  }else if(f.polarity==='UNKNOWN')fail('UNKNOWN_POLARITY_WITH_POSITIVE_ASSERTION');
  if(f.evidence_state==='CONTESTED'&&
    (!f.support_refs.length||!f.contrary_refs.length))fail('CONTESTED_SOURCES_REQUIRED');
  if(f.evidence_state==='UNKNOWN'&&
     (f.support_refs.length||f.contrary_refs.length))fail('UNKNOWN_CLAIM_HAS_ASSERTED_SOURCES');
  if(!['UNKNOWN','CONTESTED'].includes(f.evidence_state)&&!f.support_refs.length)
    fail('SOURCE_REFERENCE_REQUIRED');
  if(!['CONTESTED'].includes(f.evidence_state)&&f.contrary_refs.length)
    fail('CONTRARY_SOURCE_WITHOUT_CONTESTED_FRAME');
  if(f.role==='NEXT_ACTION'&&f.speech_act!=='PROPOSAL'||
     f.role!=='NEXT_ACTION'&&f.speech_act==='PROPOSAL')
    fail('SPEECH_ACT_ROLE_CONFLICT');
  if(f.evidence_state==='UNKNOWN'&&f.finality_state!=='NONE')
    fail('UNKNOWN_FINALITY_UPGRADE');
  if(f.finality_state!=='NONE'){
   if(!validId(f.finality_owner))fail('FINALITY_OWNER_REQUIRED');
  }else if(f.finality_owner!==null)fail('FINALITY_OWNER_WITH_NONE');
  if(f.event_time==='FUTURE'&&f.finality_state==='FINALIZED')
    fail('FUTURE_FINALITY_CONTRADICTION');
  const supportKeys=new Set(f.support_refs.map(r=>r.id+'@'+r.version));
  if(f.contrary_refs.some(r=>supportKeys.has(r.id+'@'+r.version)))
    fail('SAME_VERSION_AS_SUPPORT_AND_REFUTATION');
 }
 if(mains!==1)fail('ONE_MAIN_CLAIM_REQUIRED');
 return {version:linguisticV28Contract.version,
  source_commit:input.source_commit,scope_id:input.scope_id,
  subject_id:input.subject_id,world:input.world,format:input.format,
  frames:input.frames,
  input_digest:digest({source_commit:input.source_commit,scope_id:input.scope_id,
   subject_id:input.subject_id,world:input.world,format:input.format,
   frames:input.frames})};
}
const sourceToken=r=>r.id+'@'+r.version+' (owner '+r.owner+')';
const actionClause=f=>{
 const [base,past,present]=VERBS[f.action];
 const target=f.quantity==='ONE'?'one '+f.patient:
   f.quantity==='SOME'?'some '+f.patient:
   f.quantity==='ALL'?'all '+f.patient:f.patient;
 if(f.event_time==='UNSPECIFIED')
  return f.actor+' / '+f.action+' / '+target+' (event time unspecified)';
 if(f.event_time==='PAST')
  return f.actor+' '+(f.polarity==='NEGATED'?'did not '+base:past)+' '+target;
 if(f.event_time==='CURRENT')
  return f.actor+' '+(f.polarity==='NEGATED'?'does not '+base:present)+' '+target;
 return f.actor+' '+(f.polarity==='NEGATED'?'will not '+base:'will '+base)+' '+target;
};
const whether=f=>f.actor+' / '+f.action+' / '+(
 f.quantity==='ONE'?'one '+f.patient:
 f.quantity==='SOME'?'some '+f.patient:
 f.quantity==='ALL'?'all '+f.patient:f.patient);
const intro=f=>{
 if(f.role==='NEXT_ACTION')return 'Proposed review step (not authorized): examine whether '+whether(f)+'.';
 if(f.speech_act==='QUESTION')return 'Review question (not an established fact): whether '+whether(f)+'?';
 if(f.evidence_state==='UNKNOWN')return 'The supplied evidence does not resolve whether '+whether(f)+'.';
 if(f.evidence_state==='CONTESTED')return 'Supplied accounts conflict on whether '+whether(f)+'.';
 const clause=actionClause(f);
 if(f.evidence_state==='OBSERVED')return 'A caller-supplied observation reports that '+clause+'.';
 if(f.evidence_state==='CLAIMED')return 'A supplied source claims that '+clause+'.';
 if(f.evidence_state==='INFERRED')return 'An unverified inference proposes that '+clause+'.';
 return 'In the synthetic model, '+clause+'.';
};
const metadata=f=>{
 const sources=f.support_refs.map(sourceToken).join('; ')||'NONE';
 const adverse=f.contrary_refs.map(sourceToken).join('; ')||'NONE';
 const finality=f.finality_state==='NONE'?'NONE':
  f.finality_state+' claimed by '+f.finality_owner+' (unverified)';
 return ' [Polarity='+f.polarity+
  '; Quantity='+f.quantity+'; Event time='+f.event_time+
  '; Epistemic='+f.evidence_state+'; Speech act='+f.speech_act+
  '; Finality='+finality+'; Supporting='+sources+
  '; Contrary='+adverse+'; Source authentication=NOT_PERFORMED]';
};
export const linguisticFrameOrderV28=Object.freeze({
 PLAIN:['MAIN','CONTEXT','CONTRARY','LIMITATION','NEXT_ACTION'],
 BUSINESS:['MAIN','CONTEXT','LIMITATION','CONTRARY','NEXT_ACTION'],
 LEGAL:['MAIN','CONTRARY','LIMITATION','CONTEXT','NEXT_ACTION'],
 TECHNICAL:['MAIN','CONTRARY','CONTEXT','LIMITATION','NEXT_ACTION'],
 SCIENTIFIC:['MAIN','LIMITATION','CONTRARY','CONTEXT','NEXT_ACTION']
});
export function renderControlledLinguisticOutputV28(input){
 const x=validateLinguisticFramesV28(input);
 const order=linguisticFrameOrderV28[x.format];
 const sortedFrames=order.flatMap(role=>x.frames.filter(f=>f.role===role));
 const clauses=sortedFrames.map((f,i)=>{
  const text=intro(f)+metadata(f);
  return {claim_id:f.id,role:f.role,index:i,semantic_hash:digest(f),
   exact_text:text,source_refs:f.support_refs.map(sourceToken),
   contrary_refs:f.contrary_refs.map(sourceToken),
   state:f.evidence_state,polarity:f.polarity,quantity:f.quantity,
   speech_act:f.speech_act,event_time:f.event_time,
   output_authentication:false};
 });
 return {version:linguisticV28Contract.version,source_commit:x.source_commit,
  scope_id:x.scope_id,subject_id:x.subject_id,format:x.format,world:x.world,
  input_digest:x.input_digest,ordered_claim_ids:clauses.map(x=>x.claim_id),
  clauses,document:clauses.map(x=>x.exact_text).join('\n\n'),
  status:'CONTROLLED_ENGLISH_OUTPUT_NOT_INDEPENDENTLY_AUTHENTICATED',
  all_claims_retained:clauses.length===x.frames.length,
  exact_semantic_equivalence_outside_template:false,
  human_review_required:true,source_authentication:false,
  source_owners_independently_checked:false,external_action_authorized:false,
  canonical_promotion:false};
}
export function bindExactQuoteSpanV28(input){
 fields(input,['source_commit','scope_id','subject_id','source_ref','source_owner',
  'source_version','source_text','source_sha256','start_utf16','end_utf16','claimed_quote'],'QUOTE');
 if(!COMMIT.test(input.source_commit||'')||!validId(input.scope_id)||
  !validId(input.subject_id)||!validId(input.source_ref)||
  !validId(input.source_owner)||!validId(input.source_version)||
  typeof input.source_text!=='string'||input.source_text.length>20000||
  !/^[0-9a-f]{64}$/u.test(input.source_sha256||'')||
  !Number.isSafeInteger(input.start_utf16)||!Number.isSafeInteger(input.end_utf16)||
  input.start_utf16<0||input.end_utf16>input.source_text.length||
  input.end_utf16<=input.start_utf16||
  input.end_utf16-input.start_utf16>1200||
  typeof input.claimed_quote!=='string'||input.claimed_quote.length>1200)
  fail('INVALID_QUOTE_BOUNDARY');
 const actual=createHash('sha256').update(input.source_text,'utf8').digest('hex');
 const bytesMatch=actual===input.source_sha256;
 const span=input.source_text.slice(input.start_utf16,input.end_utf16);
 const quoteMatch=span===input.claimed_quote;
 return {version:'MPC_V28_SOURCE_SPAN_BIND_1',
  scope_id:input.scope_id,subject_id:input.subject_id,
  source_ref:input.source_ref,source_owner:input.source_owner,
  source_version:input.source_version,start_utf16:input.start_utf16,
  end_utf16:input.end_utf16,source_sha256:input.source_sha256,
  quote_sha256:createHash('sha256').update(input.claimed_quote,'utf8').digest('hex'),
  status:!bytesMatch?'CALLER_SUPPLIED_SOURCE_DIGEST_MISMATCH':
    quoteMatch?'EXACT_UTF16_QUOTE_FROM_CALLER_SUPPLIED_BYTES':'QUOTE_SPAN_MISMATCH',
  source_authentication:false,author_identity_proven:false,
  output_quote_text_retained:false,canonical_promotion:false};
}
