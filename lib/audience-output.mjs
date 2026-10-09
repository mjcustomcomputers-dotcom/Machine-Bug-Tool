import {validate} from './schema.mjs';
import {fingerprint} from './solid-state.mjs';
const str={type:'string',minLength:1,maxLength:2000};
const id={type:'string',minLength:1,maxLength:200};
const formats=['STRAIGHT_NEWS','FACT_CHECK','EXPLAINER','INVESTIGATIVE','BUSINESS_ANALYSIS','TECHNICAL','SECURITY_WRITEUP','LEGAL','EXECUTIVE','SCIENTIFIC','MORPHOLOGY_MIRROR'];
export const renderSchema={type:'object',additionalProperties:false,required:['format','audience','claims','headline_claim_id','lead_claim_id'],properties:{format:{type:'string',enum:formats},audience:str,headline_claim_id:id,lead_claim_id:id,analysis_fingerprint:{type:'string',minLength:64,maxLength:64},claims:{type:'array',minItems:1,maxItems:24,items:{type:'object',additionalProperties:false,required:['id','text','role','epistemic_state','finality_state','finality_owner','source_refs'],properties:{id,text:str,role:{type:'string',enum:['MAIN','CONTEXT','BODY','CONTRARY','LIMITATION']},epistemic_state:{type:'string',enum:['OBSERVED','DERIVED','INFERRED','ADOPTED']},finality_state:{type:'string',enum:['NONE','PROPOSED','PENDING','PROVISIONAL','DECIDED','FINALIZED','SETTLED','ENFORCED','IRREVERSIBLE']},finality_owner:{type:['string','null'],maxLength:200},source_refs:{type:'array',maxItems:8,items:id}}}}}};
export async function renderOutput(input){
 validate(input,renderSchema);
 const claims=new Map(input.claims.map(c=>[c.id,c]));
 if(claims.size!==input.claims.length)throw Error('DUPLICATE_CLAIM_ID');
 for(const c of claims.values()){
  if(!c.text.trim())throw Error('EMPTY_CLAIM');
  if(c.finality_state!=='NONE'&&!c.finality_owner?.trim())throw Error('FINALITY_OWNER_REQUIRED');
  if(['OBSERVED','DERIVED','ADOPTED'].includes(c.epistemic_state)&&!c.source_refs.length)throw Error('SOURCE_REFERENCE_REQUIRED');
 }
 const head=claims.get(input.headline_claim_id),lead=claims.get(input.lead_claim_id);
 if(!head||!lead)throw Error('UNRESOLVED_HEADLINE_OR_LEAD');
 if(head.role!=='MAIN'||lead.role!=='MAIN')throw Error('HEADLINE_AND_LEAD_REQUIRE_MAIN_CLAIM');
 const roleOrder={FACT_CHECK:['CONTRARY','BODY','LIMITATION','MAIN'],SCIENTIFIC:['BODY','CONTRARY','LIMITATION','MAIN'],LEGAL:['BODY','CONTRARY','LIMITATION','MAIN'],EXECUTIVE:['LIMITATION','BODY','CONTRARY','MAIN']}[input.format]??['BODY','CONTRARY','LIMITATION','MAIN'];
 const ordered=[lead,...input.claims.filter(c=>c.role==='CONTEXT'&&c.id!==lead.id),...roleOrder.flatMap(role=>input.claims.filter(c=>c.id!==lead.id&&c.role===role))];
 const line=c=>`${c.text}\n[${c.epistemic_state}; ${c.finality_state}; finality owner: ${c.finality_owner??'none'}; source refs: ${c.source_refs.join(', ')||'UNKNOWN'}]`;
 return {version:'UMTB-4.0',status:'EVIDENCE_PRESERVING_RENDER',format:input.format,audience:input.audience,document:[line(head),...ordered.map(line)].join('\n\n'),ordered_claim_ids:ordered.map(c=>c.id),claims:input.claims,input_fingerprint:await fingerprint(input),analysis_fingerprint:input.analysis_fingerprint??null,analysis_binding_verified:false,headline_binding:'EXACT_BODY_CLAIM_WITH_STATE_LABEL',context_placement:'IMMEDIATELY_AFTER_LEAD',morphology:'BOUNDED_ROLE_ORDER_TEMPLATE; NO_AUTHOR_VOICE_OR_SEMANTIC_REWRITE',semantic_headline_support_verified:false,factual_validation:false,distinctive_voice_transfer:false,canonical_promotion:false,external_action_authorized:false};
}
