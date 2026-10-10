// V29 professional output path: compact V28 linguistic receipts while retaining
// V28 renderer + independent audit and original exact source/citation records.
import {renderControlledLinguisticOutputV28} from './mpc-linguistic-output-v28.mjs';
import {auditControlledLinguisticOutputV28} from './mpc-linguistic-audit-v28.mjs';

const prefix=[
 ['A caller-supplied observation reports that ',''],
 ['A supplied source claims that ','Reported: '],
 ['An unverified inference proposes that ','Inference: '],
 ['In the synthetic model, ','Model: '],
 ['The supplied evidence does not resolve whether ','Unresolved: '],
 ['Supplied accounts conflict on whether ','Contested: '],
 ['Review question (not an established fact): whether ','Question: '],
 ['Proposed review step (not authorized): examine whether ','Review next: ']
];
const explain=(s)=>{
 const i=s.indexOf(' [Polarity=');
 if(i<0)throw Error('UNSUPPORTED_V28_CLAUSE_SURFACE');
 let t=s.slice(0,i);
 for(const [a,b] of prefix)if(t.startsWith(a)){t=b+t.slice(a.length);break;}
 return t;
};
export function formatCondensedLinguisticOutputV29(input){
 const r=renderControlledLinguisticOutputV28(input);
 const audit=auditControlledLinguisticOutputV28(input,r);
 if(audit.state!=='CONTROLLED_TEMPLATE_REPLAY_CONSISTENT_NOT_SOURCE_VERIFIED')
  throw Error('V28_LINGUISTIC_AUDIT_REJECTED');
 const roles=new Map(input.frames.map(x=>[x.id,x]));
 const claims=r.clauses.map(x=>{
  const f=roles.get(x.claim_id);
  if(!f)throw Error('V28_CLAIM_ROLE_MISSING');
  const cited=f.support_refs.map(y=>y.id+'@'+y.version);
  const opposite=f.contrary_refs.map(y=>y.id+'@'+y.version);
  return {claim_id:x.claim_id,role:f.role,
   statement:explain(x.exact_text),
   epistemic:f.evidence_state,finality:f.finality_state,
   sources:cited,contrary_sources:opposite,
   polarity:f.polarity,quantity:f.quantity,event_time:f.event_time,
   speech_act:f.speech_act};
 });
 const sections=claims.map(x=>{
  const source=x.sources.length?' | '+x.sources.join(', '):'';
  const adverse=x.contrary_sources.length?' | contrary '+x.contrary_sources.join(', '):'';
  const role=x.role==='MAIN'?'RESULT':x.role==='NEXT_ACTION'?'NEXT':x.role;
  return role+'  '+x.statement+' ('+x.epistemic+source+adverse+')';
 });
 return {version:'MPC_V29_CONDENSED_LINGUISTIC_RECEIPT_1',
  content:sections.join('\n'),claims,
  prior_exact_output_digest:r.input_digest,
  exact_full_render:r,independent_audit:audit,
  full_receipt_preserved:true,claim_count:claims.length,
  source_versions:input.frames.flatMap(f=>f.support_refs.map(x=>[x.id,x.version])),
  style:'ENGINEERING_RESULT_FIRST',
  language_drift_detected:false,source_authenticated:false,
  external_actions:0};
}
