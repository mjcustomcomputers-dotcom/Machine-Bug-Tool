// MPC V28 — metarouter: a language output method selected by source-typed
// dimensions, followed by an independently reconstructed linguistic audit.
// Existing audience-output, 24 native evaluators and V20–V27 stay unchanged.
import {createHash} from 'node:crypto';
import frontier from '../research/linguistic-method-space-v28.json' with {type:'json'};
import {validateLinguisticFramesV28,renderControlledLinguisticOutputV28} from './mpc-linguistic-output-v28.mjs';
import {auditControlledLinguisticOutputV28} from './mpc-linguistic-audit-v28.mjs';

const fail=c=>{throw Error(c)};
const DIM=/^[A-Z][A-Z0-9_]{0,63}$/u;
const HEX=/^[a-f0-9]{64}$/u;
const availableDomains=['SEMANTIC','PRAGMATICS','DISCOURSE','PROVENANCE','OUTPUT','META'];
const validArray=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const sortedUnique=a=>[...new Set(a)].sort();
const hooks=frontier.hooks;
if(frontier.namespace!=='NONCANONICAL_RH_V28'||frontier.existing_native_evaluators!==24||
 frontier.existing_method_atlas_candidates!==239||frontier.original_audience_output_unchanged!==true||
 hooks.length!==34||new Set(hooks.map(h=>h.id)).size!==34||
 hooks.some(h=>!/^RH-V28-[0-9]{2}$/u.test(h.id)||
 !availableDomains.includes(h.domain)||!validArray(h.requires)||!validArray(h.produces)||
 !h.requires.length||!h.produces.length||
 [...h.requires,...h.produces].some(x=>!DIM.test(x))||
 !validArray(h.sources)||!h.sources.length||
 h.sources.some(u=>typeof u!=='string'||!u.startsWith('https://'))))
 fail('INVALID_V28_LINGUISTIC_METHOD_FRONTIER');
const produced=new Set(hooks.flatMap(h=>h.produces));
const digest=x=>createHash('sha256').update(JSON.stringify(x),'utf8').digest('hex');
export const linguisticMethodRouteV28Contract=Object.freeze({
 version:'MPC_V28_LINGUISTIC_META_ROUTE_1',research_hooks:34,
 max_selected:8,zero_delta_stop:true,
 output_method_executed_when_new:true,independent_audit_executed_when_new:true,
 actual_linguistic_research_algorithms_executed:0,
 open_ended_semantic_equivalence:false,external_actions:false,
 legacy_renderer_replaced:false,canonical_promotion:false
});
function have(input,output,audit){
 const s=new Set(['CLAIM_FRAME','SEMANTIC_FRAME','SOURCE_CLAIMS',
 'CLAIM_ROLES','SEMANTIC_ROLES','POLARITY','QUANTITY','SPEECH_ACT',
 'EVENT_TIME','FINALITY_STATE','EVIDENCE_STATE','AUDIENCE_PROFILE',
 'SOURCE_VERSION','VERSION_OWNER','SOURCE_ORIGIN',
 'SOURCE_CLAIM_FRAME','METHOD_SOURCE','CLAIM_SOURCE_REFS']);
 if(input.frames.some(f=>f.support_refs.length)){
  for(const x of ['SOURCE_REFS','SOURCE_OWNER','SOURCE_LINEAGE',
   'CLAIM_SOURCE_REFS','SOURCE_CLAIMS','SOURCE_OWNER'])s.add(x);
 }
 if(input.frames.some(f=>f.contrary_refs.length)){
  s.add('CONTRARY_REFS');s.add('LIMITATIONS');
 }
 if(input.frames.some(f=>f.role==='LIMITATION'))s.add('LIMITATIONS');
 if(input.frames.some(f=>f.role==='MAIN'))s.add('LEAD_CLAIM');
 if(input.frames.some(f=>f.speech_act==='QUESTION'))s.add('DIALOGUE_UNIT');
 if(output&&audit?.state==='CONTROLLED_TEMPLATE_REPLAY_CONSISTENT_NOT_SOURCE_VERIFIED'){
  s.add('CONTROLLED_UTTERANCE');s.add('SEMANTIC_FRAME');
  s.add('OUTPUT_AUDIT');s.add('ORIGINAL_FRAME');
 }
 return s;
}
function planHooks(input,output,audit,max){
 const dimensions=have(input,output,audit);
 const candidates=hooks.map(h=>{
  const missing=h.requires.filter(x=>!dimensions.has(x));
  return {id:h.id,domain:h.domain,name:h.key,
   state:missing.length?'MISSING_REQUIRED_METHOD_INPUT':'RESEARCH_HOOK_APPLICABLE_NOT_EXECUTED',
   missing_primary:missing.filter(x=>!produced.has(x)),
   missing_prior_method_outputs:missing.filter(x=>produced.has(x)),
   requires:h.requires,proposes:h.produces,
   falsifier:h.falsifier,source_urls:h.sources,
   scholarly_method_implemented:false,source_authenticated:false};
 }).sort((a,b)=>a.missing_primary.length-b.missing_primary.length||
    a.missing_prior_method_outputs.length-b.missing_prior_method_outputs.length||
    a.id.localeCompare(b.id));
 const selected=candidates.slice(0,max),linked=[];
 for(const a of selected)for(const b of selected){
  if(a.id===b.id)continue;
  const via=a.proposes.filter(x=>b.requires.includes(x)).sort();
  if(via.length)linked.push({from:a.id,to:b.id,via,
   state:'HYPOTHETICAL_INTERFACE_NOT_SCIENTIFICALLY_EXECUTED',
   output_is_new_independent_evidence:false,source_independence_proven:false});
 }
 return {available_declared_dimensions:sortedUnique([...dimensions]),
  selected,missing_primary:sortedUnique(selected.flatMap(x=>x.missing_primary)),
  missing_prior_method_outputs:sortedUnique(selected.flatMap(x=>x.missing_prior_method_outputs)),
  hypothetical_links:linked};
}
export function runLinguisticMethodsOnMethodsV28(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).some(x=>!['source_commit','scope_id','subject_id','world',
     'format','frames','max_methods','previous_input_digest'].includes(x)))
  fail('INVALID_LINGUISTIC_META_REQUEST');
 const max=input.max_methods??6;
 if(!Number.isInteger(max)||max<1||max>8||
  input.previous_input_digest!==undefined&&input.previous_input_digest!==null&&
  (typeof input.previous_input_digest!=='string'||!HEX.test(input.previous_input_digest)))
  fail('INVALID_LINGUISTIC_META_BUDGET');
 const packet={
  source_commit:input.source_commit,scope_id:input.scope_id,subject_id:input.subject_id,
  world:input.world,format:input.format,frames:input.frames
 };
 const parsed=validateLinguisticFramesV28(packet);
 const skip=parsed.input_digest===input.previous_input_digest;
 if(skip)return {
  version:linguisticMethodRouteV28Contract.version,
  source_commit:parsed.source_commit,scope_id:parsed.scope_id,subject_id:parsed.subject_id,
  input_digest:parsed.input_digest,phase:'STOP',status:'STOP_NO_MATERIAL_LINGUISTIC_INFORMATION_GAIN',
  rendered_output:null,audit_receipt:null,selected_methods:[],
  output_methods_executed:0,research_hooks_executed:0,external_actions:0,
  source_authentication:false,canonical_promotion:false};
 const rendered=renderControlledLinguisticOutputV28(packet);
 const audit=auditControlledLinguisticOutputV28(packet,rendered);
 if(audit.state!=='CONTROLLED_TEMPLATE_REPLAY_CONSISTENT_NOT_SOURCE_VERIFIED')
  fail('LINGUISTIC_META_SELF_AUDIT_REJECTED');
 const plan=planHooks(parsed,rendered,audit,max);
 return {
  version:linguisticMethodRouteV28Contract.version,
  source_commit:parsed.source_commit,scope_id:parsed.scope_id,subject_id:parsed.subject_id,
  input_digest:parsed.input_digest,phase:'VERIFICATION_REVIEW',
  status:'CONTROLLED_RENDER_AND_INDEPENDENT_AUDIT_PASSED_SOURCE_UNVERIFIED',
  format:parsed.format,world:parsed.world,
  ...plan,rendered_output:rendered,audit_receipt:audit,
  no_semantic_promotion:true,
  output_methods_executed:2,research_hooks_executed:0,
  next_action:'Review source owners and exact quote/context before promoting or sending this output.',
  physical_actions:0,external_actions:0,source_authentication:false,
  canonical_promotion:false};
}
