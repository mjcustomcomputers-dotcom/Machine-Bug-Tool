import {reviewAtomicVariants,atomicReviewSchema} from './atomic-review.mjs';
import pack from './solid-state-pack.json' with {type:'json'};
import {getBusinessLogicRegistry,fingerprint,analysisSchema} from './solid-state.mjs';
import {validate} from './schema.mjs';
import {getMethodCatalog} from './methods.mjs';
import {methodCapsules,getMethodArk,arkSchema} from './method-ark.mjs';
import {renderOutput,renderSchema} from './audience-output.mjs';
import {workflowSchema,planEvidenceWorkflow,attachWorkflowExecution} from './evidence-workflow.mjs';
const s={type:'string',minLength:1,maxLength:2000},id={type:'string',minLength:1,maxLength:200};
const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const arr=(items,max=32)=>({type:'array',items,minItems:0,maxItems:max});
const en=(...values)=>({type:'string',enum:values});
const refs=arr(id,8);
const lensNames=pack.classifiers.slice(0,12).map(c=>c.lens);
// Rules are an additive routing overlay. Canonical definitions and hashes are unchanged.
export const routingRules={
 IDENTITY:{branches:['BL10','BL11'],types:['REPRESENTATION','ENTITY'],methods:['identity_graph'],lenses:['WRONG_OBJECT']},
 ACTOR_CAPACITY:{branches:['BL08'],types:['ACTOR'],methods:['authority_graph'],lenses:['WRONG_ACTOR']},
 PERMISSION_OWNERSHIP:{branches:['BL09'],types:['AUTHORITY'],methods:['authority_graph'],lenses:['WRONG_ACTOR','WRONG_OBJECT']},
 SOURCE_AUTHORITY:{branches:['BL06'],types:['SOURCE_RECORD'],methods:['identity'],lenses:['WRONG_OBJECT']},
 CONFIGURATION:{branches:['BL19'],types:['CONFIGURATION'],methods:['metamorphic'],lenses:['CROSS_VERSION']},
 COMPARISON:{branches:['BL22'],types:['COMPARISON'],methods:['metamorphic'],lenses:['WRONG_OBJECT']},
 ALTERNATIVES:{branches:['BL32'],types:['HYPOTHESES'],methods:['ach'],lenses:['UNEXPECTED']},
 CONTROL_PRESENCE:{branches:['BL01'],types:['CONTROL_ACTION'],methods:['state_trace'],lenses:['OMITTED']},
 CONTROL_PRECONDITION:{branches:['BL02'],types:['CONTROL_ACTION'],methods:['relational'],lenses:['WRONG_STATE']},
 ORDER:{branches:['BL03'],types:['EVENT_TRACE'],methods:['partial_order'],lenses:['WRONG_ORDER']},
 DURATION:{branches:['BL04'],types:['EVENT_TRACE'],methods:['temporal'],lenses:['STALE_OR_DELAYED']},
 FRESHNESS:{branches:['BL05'],types:['FEEDBACK'],methods:['temporal'],lenses:['STALE_OR_DELAYED']},
 FINALIZER_CONFLICT:{branches:['BL07'],types:['AUTHORITY'],methods:['authority_graph'],lenses:['WRONG_ACTOR']},
 TRANSITION:{branches:['BL12'],types:['STATE_TRACE'],methods:['state_trace'],lenses:['WRONG_STATE']},
 FINALITY:{branches:['BL13'],types:['FINALITY_RECORD'],methods:['authority_graph'],lenses:['WRONG_STATE']},
 IDEMPOTENCY:{branches:['BL14'],types:['REPEATED_EVENT'],methods:['relational'],lenses:['DUPLICATE_OR_REPLAY']},
 REPLAY:{branches:['BL15'],types:['REPEATED_EVENT'],methods:['state_trace'],lenses:['DUPLICATE_OR_REPLAY']},
 ASYNC:{branches:['BL16'],types:['ASYNC_TRACE'],methods:['partial_order'],lenses:['WRONG_ORDER']},
 INTERFACE:{branches:['BL17'],types:['INTERFACE'],methods:['relational'],lenses:['WRONG_OBJECT']},
 FIELD_AUTHORITY:{branches:['BL18'],types:['FIELD_RECORD'],methods:['authority_graph'],lenses:['WRONG_OBJECT']},
 LEGACY:{branches:['BL20'],types:['VERSION_PAIR'],methods:['metamorphic'],lenses:['CROSS_VERSION']},
 RELATION:{branches:['BL21'],types:['RELATION_TABLE'],methods:['relational'],lenses:['WRONG_OBJECT']},
 REQUIREMENT:{branches:['BL23'],types:['REQUIREMENT'],methods:['relational'],lenses:['OMITTED']},
 VALIDATION:{branches:['BL24'],types:['OUTCOME'],methods:['state_trace'],lenses:['WRONG_STATE']},
 FAULT:{branches:['BL25'],types:['FAULT_MODEL'],methods:['fault_tree'],lenses:['PARTIAL_FAILURE']},
 FAILURE_EFFECT:{branches:['BL26'],types:['FAILURE_MODEL'],methods:['fmea'],lenses:['PARTIAL_FAILURE']},
 CONSERVATION:{branches:['BL27'],types:['LEDGER'],methods:['ledger'],lenses:['WRONG_STATE']},
 DELAY:{branches:['BL28'],types:['QUEUE'],methods:['coin_pusher_deferred'],lenses:['STALE_OR_DELAYED']},
 MONEY:{branches:['BL29'],types:['MONEY_RECORD'],methods:['ledger'],lenses:['WRONG_OBJECT']},
 REVERSAL:{branches:['BL30'],types:['REVERSAL_RECORD'],methods:['ledger'],lenses:['RECOVERY_OR_ROLLBACK']},
 ENTITLEMENT:{branches:['BL31'],types:['ENTITLEMENT_RECORD'],methods:['relational'],lenses:['WRONG_OBJECT']}
};
const finalityStates=['NONE','PROPOSED','PENDING','PROVISIONAL','DECIDED','FINALIZED','SETTLED','ENFORCED','IRREVERSIBLE'];
export const routerCapabilities={universal_router_version:'UMTB-4.0',evidence_workflow_revision:'MPC-EVIDENCE-WORKFLOW-1',method_selection_implementation_revision:'UMTB4-PRIORITY-1',method_selection_rule:'QUESTION_STATE_THEN_SCHEMA_READINESS_THEN_METHOD_ID',semantic_branch_gate:true,semantic_gate_implementation:'DECLARED_TYPE_AND_QUESTION_RULES',child_classifier_gate:true,method_ark:'enabled',method_dna_lookup:'enabled',inversion_engine:'METADATA_AND_COMPLEMENT_ROUTING',dual_epistemic_finality:'enabled',cross_border_adapter:'TYPED_ENTITY_AND_CONTEXT_BINDING',audience_morphology:'EVIDENCE_PRESERVING_TEMPLATE_RENDERER',routing_basis:'CALLER_TYPED_STRUCTURES_NOT_AUTOMATIC_NATURAL_LANGUAGE_UNDERSTANDING',automatic_method_execution:false};
const strings=arr(s,16);
export const routeSchema=obj({
 workflow:workflowSchema,atomic_review:atomicReviewSchema,presentation:renderSchema,method_lookup:arkSchema,problem:s,object_id:id,unit_of_analysis:s,domain_profile:en('BUSINESS','LEGAL','NEWS','SCIENCE','GENERAL'),domain_subprofile:s,
 sources:arr(obj({id,owner:id,type:id,version:id,time:s,native_locator:s}),32),
 structures:arr(obj({id,type:en(...new Set(Object.values(routingRules).flatMap(r=>r.types))),subject_ids:refs,source_refs:refs}),64),
 questions:arr(obj({id,kind:en(...Object.keys(routingRules)),invariant:s,structure_ids:refs,rule_source_refs:refs,necessity:en('REQUIRED','OPTIONAL'),applicability:en('APPLIES','UNKNOWN','NOT_APPLICABLE'),lenses:arr(obj({lens:en(...lensNames),source_refs:refs}),12)}),12),
 models:arr(obj({method:en(...getMethodCatalog().methods.map(m=>m.id)),input:{type:'object',additionalProperties:true}}),4),
 epistemic_state:en('OBSERVED','DERIVED','INFERRED','ADOPTED'),finality_state:en(...finalityStates),finality_owner:{type:['string','null'],maxLength:200},
 cross_border:obj({entities:arr(obj({id,role:en('BRAND','PARENT','SUBSIDIARY','ASSET_OWNER','OPERATOR','PROGRAM_OWNER','PLATFORM','PAYMENT_ENTITY'),source_refs:refs}),24),countries:strings,terms_version:s,governing_law:s,controlling_language:s,configuration:s,authorization:obj({actor:s,asset:s,action:s,environment:s,time:s,account:s,data_class:s,impact_limit:s,source_refs:refs})}),
 strongest_benign_explanation:s,falsifier:s,unknowns:strings,limitations:strings,stop_condition:s,
 context:{type:'object',properties:Object.fromEntries(['actor','capacity','counterparty','authority_owner','representation','state_before','event_or_action','state_after','input','transformation','output','requirement_or_rule','permission','actual_use','channel','recipient','version','configuration','timing_context','event_order','observation_window','value_object','unit','quantity','feedback','hidden_state','claim','contradictions','alternative_explanations'].map(k=>[k,s])),additionalProperties:false}
},['problem','object_id','unit_of_analysis','domain_profile']);
export const sweepSchema={...analysisSchema,properties:{...analysisSchema.properties,routing:routeSchema}};
const states=['REQUIRED','ACTIVE','WATCH','BLOCKED','DORMANT','NOT_APPLICABLE'];
const rank={REQUIRED:5,ACTIVE:4,BLOCKED:3,WATCH:2,DORMANT:1,NOT_APPLICABLE:0};
const fail=m=>{throw Error(m)};
function unique(xs){if(new Set(xs).size!==xs.length)fail('DUPLICATE_ID')}
function checkRefs(xs,sources){for(const x of xs)if(!sources.has(x))fail('UNRESOLVED_SOURCE_REF:'+x)}
function merge(a,b){return rank[b]>rank[a]?b:a}
function compareMethodPriority(a,b){
 return rank[b.routing_state]-rank[a.routing_state]
  || Number(b.input_readiness==='SCHEMA_VALID_CALLER_MODEL')-Number(a.input_readiness==='SCHEMA_VALID_CALLER_MODEL')
  || (a.method<b.method?-1:a.method>b.method?1:0);
}
export async function routeProblem(input){
 validate(input,routeSchema);const registry=await getBusinessLogicRegistry();
 const sources=input.sources??[],structures=input.structures??[],questions=input.questions??[];for(const xs of [sources,structures,questions])unique(xs.map(x=>x.id));
 const sourceMap=new Map(sources.map(x=>[x.id,x])),structMap=new Map(structures.map(x=>[x.id,x]));
 for(const x of structures)checkRefs(x.source_refs,sourceMap);
 if(input.finality_state&&input.finality_state!=='NONE'&&!input.finality_owner?.trim())fail('FINALITY_OWNER_REQUIRED');
 for(const e of input.cross_border?.entities??[])checkRefs(e.source_refs,sourceMap);if(input.cross_border){unique(input.cross_border.entities.map(e=>e.id));checkRefs(input.cross_border.authorization.source_refs,sourceMap)}
 const branchStates=new Map(pack.branches.map(b=>[b.branch_id,'DORMANT'])),childStates=new Map(pack.classifiers.map(c=>[c.id,'DORMANT'])),receipts=[],methodMap=new Map();
 for(const q of questions){
  checkRefs(q.rule_source_refs,sourceMap);for(const l of q.lenses)checkRefs(l.source_refs,sourceMap);unique(q.lenses.map(l=>l.lens));unique(q.structure_ids);
  const rule=routingRules[q.kind],bound=q.structure_ids.map(id=>structMap.get(id)),typed=bound.length>0&&bound.every(Boolean)&&bound.every(x=>rule.types.includes(x.type));
  const evidence=typed&&bound.every(x=>x.source_refs.length>0&&x.subject_ids.length>0)&&q.rule_source_refs.length>0;
  const state=q.applicability==='NOT_APPLICABLE'?'NOT_APPLICABLE':q.applicability==='UNKNOWN'?'WATCH':!typed||!evidence?'BLOCKED':q.necessity==='REQUIRED'?'REQUIRED':'ACTIVE';
  const missing=[];if(!typed)missing.push('Typed bound structure required: '+rule.types.join(' or '));if(typed&&!bound.every(x=>x.source_refs.length&&x.subject_ids.length))missing.push('Source and subject references for every bound structure');if(!q.rule_source_refs.length)missing.push('Source for analytical invariant');
  receipts.push({question_id:q.id,kind:q.kind,invariant:q.invariant,state,branch_ids:rule.branches,missing_evidence:missing,structure_ids:q.structure_ids,rule_source_refs:q.rule_source_refs});
  for(const bid of rule.branches){const previous=branchStates.get(bid);branchStates.set(bid,previous==='DORMANT'?state:merge(previous,state));
   for(const c of pack.classifiers.filter(c=>c.branch_id===bid)){const explicit=q.lenses.find(l=>l.lens===c.lens),hasLens=rule.lenses.includes(c.lens)||!!explicit;let cs='DORMANT';
    if(state==='NOT_APPLICABLE')cs='NOT_APPLICABLE';else if(hasLens){cs=state;if(['ACTIVE','REQUIRED'].includes(state)&&explicit&&(!explicit.source_refs.length||!rule.lenses.includes(c.lens)))cs='BLOCKED';}
    const old=childStates.get(c.id);childStates.set(c.id,old==='DORMANT'?cs:merge(old,cs));
   }
  }
  if(state!=='NOT_APPLICABLE')for(const method of rule.methods){
   if(!methodMap.has(method))methodMap.set(method,{method,question_ids:[],routing_state:state,input_readiness:'BLOCKED_MISSING_MODEL'});
   const candidate=methodMap.get(method);candidate.question_ids.push(q.id);candidate.routing_state=merge(candidate.routing_state,state);
  }
 }
 const suppliedModels=input.models??[];unique(suppliedModels.map(m=>m.method));for(const m of suppliedModels){validate(m.input,getMethodCatalog({method:m.method}).input_schemas[m.method]);if(methodMap.has(m.method))methodMap.get(m.method).input_readiness='SCHEMA_VALID_CALLER_MODEL'}
 const dna=new Map(methodCapsules().map(m=>[m.method_id,m]));
 const methods=[...methodMap.values()].map(m=>{
  const questionIds=m.question_ids.toSorted();
  return {...m,question_ids:questionIds,method_reason:'Declared structural questions: '+questionIds.join(', '),inverse_method:dna.get(m.method).inversion_pair,complement_methods:dna.get(m.method).complement_methods.map(method=>({method,selected:methodMap.has(method),execution:'NOT_EXECUTED'}))};
 }).sort(compareMethodPriority),selected=methods.slice(0,4),selectedIds=[...childStates].filter(([,s])=>['REQUIRED','ACTIVE'].includes(s)).map(([id])=>id);
 const groups=Object.fromEntries(states.map(s=>[s.toLowerCase()+'_branches',[...branchStates].filter(([,x])=>x===s).map(([id])=>id)]));
 const childGroups=Object.fromEntries(states.map(s=>[s.toLowerCase()+'_classifier_ids',[...childStates].filter(([,x])=>x===s).map(([id])=>id)]));
 const frameFields=['domain_subprofile','actor','capacity','counterparty','authority_owner','representation','state_before','event_or_action','state_after','input','transformation','output','invariant','requirement_or_rule','permission','actual_use','channel','recipient','version','configuration','timing_context','event_order','observation_window','value_object','unit','quantity','feedback','hidden_state','claim','contradictions','alternative_explanations'];
 const frame=Object.fromEntries(frameFields.map(k=>[k,input.context?.[k]??input[k]??'UNKNOWN']));
 if(input.atomic_review&&input.atomic_review.object_id!==input.object_id)fail('ATOMIC_OBJECT_MISMATCH');
 const workflowPlan=await planEvidenceWorkflow(input,{question_receipts:receipts,method_candidates:methods});
 const requestedMode=input.atomic_review?(input.atomic_review.mode??'PLAN'):null;
 const effectiveMode=workflowPlan.phase==='EVIDENCE_ACQUISITION'&&requestedMode==='EXECUTE_SUPPLIED_MODELS'?'PLAN':requestedMode;
 const atomicReview=input.atomic_review?await reviewAtomicVariants(effectiveMode===requestedMode?input.atomic_review:{...input.atomic_review,mode:effectiveMode}):null;
 const workflow=attachWorkflowExecution(workflowPlan,{atomic_review:atomicReview,requested_mode:requestedMode,effective_mode:effectiveMode});
 return {work_stage:workflow.phase,fact_summary:workflow.fact_summary,next_action:workflow.next_action,workflow,atomic_review:atomicReview,next_step:workflow.next_action.description,method_dna:input.method_lookup?getMethodArk(input.method_lookup):null,rendered_output:input.presentation?await renderOutput(input.presentation):null,status:questions.length?'UMTB4_ROUTING_RECEIPT':'BLOCKED_TYPED_FRAME_REQUIRED',...routerCapabilities,input_fingerprint:await fingerprint(input),pack_fingerprint:registry.pack_fingerprint,normalized_frame:{...frame,subject_ids:[...new Set(structures.flatMap(x=>x.subject_ids))],native_sources:sources.map(x=>({native_source:x.native_locator,source_owner:x.owner,source_type:x.type,source_version:x.version,source_time:x.time})),country_or_jurisdiction:input.cross_border?.countries??'UNKNOWN',finalizer:input.finality_owner??'UNKNOWN',finality_state:input.finality_state??'NONE',claim_state:input.epistemic_state??'INFERRED',strongest_benign_explanation:input.strongest_benign_explanation??'UNKNOWN',falsifiers:input.falsifier??'UNKNOWN',unknowns:input.unknowns??[],limitations:input.limitations??[],stop_condition:input.stop_condition??'Missing evidence blocks evaluation',object_id:input.object_id,unit_of_analysis:input.unit_of_analysis,domain_profile:input.domain_profile,sources,structures,cross_border:input.cross_border??'UNKNOWN'},...groups,...childGroups,branches_accounted:32,classifiers_accounted:384,coverage_is_applicability:false,branch_count:32,classifier_count:384,selected_classifier_ids:selectedIds,active_classifier_count:childGroups.active_classifier_ids.length,required_classifier_count:childGroups.required_classifier_ids.length,watch_classifier_count:childGroups.watch_classifier_ids.length,blocked_classifier_count:childGroups.blocked_classifier_ids.length,dormant_classifier_count:childGroups.dormant_classifier_ids.length,not_applicable_classifier_count:childGroups.not_applicable_classifier_ids.length,branch_receipts:receipts,selected_methods:selected,method_candidates:methods,method_selection_limit:4,remaining_method_count:Math.max(0,methods.length-4),method_selection_claim:'BOUNDED_RULE_MAPPING_NOT_GLOBAL_MINIMUM_PROOF',epistemic_state:input.epistemic_state??'INFERRED',epistemic_state_basis:input.epistemic_state?'CALLER_DECLARED_NOT_AUTHENTICATED':'ROUTING_INFERENCE_ONLY',finality_state:input.finality_state??'NONE',finality_owner:input.finality_owner??null,strongest_benign_explanation:input.strongest_benign_explanation??'UNKNOWN',falsifier:input.falsifier??'UNKNOWN',missing_evidence:questions.length?receipts.flatMap(x=>x.missing_evidence.map(m=>({question_id:x.question_id,missing:m}))):[{missing:'Supply typed structures and analytical questions; prose alone does not activate classifiers.'}],unknowns:input.unknowns??[],limitations:input.limitations??[],stop_condition:input.stop_condition??'Stop when required source/input is absent; retain unresolved state.',source_refs_authenticated:false,authorization_determined:false,method_execution_performed:!!atomicReview?.explicit_model_evaluations,canonical_promotion:false,court_release_allowed:false,external_action_authorized:false};
}
export async function routeLegacySweep(data){
 validate(data,sweepSchema);for(const [k,v] of Object.entries(data)){if(typeof v==='string'&&(!v.replace(/[\s\u0085\u001c-\u001f]/g,'')||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v)))fail('INVALID_'+k.toUpperCase())}let routing=data.routing;
 if(!routing&&data.context.startsWith('UMTB4:')){try{routing=JSON.parse(data.context.slice(6))}catch{fail('INVALID_UMTB4_CONTEXT')}}
 if(routing&&routing.object_id!==data.object_id)fail('ROUTING_OBJECT_MISMATCH');
 const receipt=await routeProblem(routing??{problem:data.invariant,object_id:data.object_id,unit_of_analysis:data.namespace,domain_profile:'GENERAL',context:{actor:data.actor,state_before:data.state_before,event_or_action:data.action,state_after:data.state_after,channel:data.channel}});
 return {...receipt,input_fingerprint:await fingerprint(data),routing_fingerprint:receipt.input_fingerprint,namespace:data.namespace,object_id:data.object_id,analysis_mode:'STRUCTURAL_ROUTING_BEFORE_ACTIVATION',legacy_workflow_preserved:data,legacy_keyword_activation_used:false};
}

export const routerContract={
 ...routerCapabilities,input_schema:routeSchema,
 workflow:{input_property:'workflow',phases:['EVIDENCE_ACQUISITION','ANALYSIS','VERIFICATION'],source_content_binding:'Exact declared source ID and version; a locator alone is an acquisition target.',verification_entry:'One specific claim, its source references, expected support and expected contrary evidence, with the referenced content available.',acquisition_execution:'Explicit supplied models remain prepared in PLAN while required evidence is acquired.'},
 boot_sequence:[
  'Identify the current work phase and the fact the task needs.',
  'Use workflow records for source content at its exact declared version. When only a pointer or a stale record is present, acquire the native record described by next_action.',
  'Analyze available records, formulate missing model inputs, or run an explicitly supplied model. Existing business_logic_sweep accepts routing or UMTB4 JSON in context.',
  'Enter verification when the caller supplies a specific claim and its support/contrary conditions. Keep a request without that target in analysis.',
  'Controlled atomic variations use review_atomic_variants or atomic_review. PLAN remains the default; explicit evidence acquisition defers model execution until analysis has the needed records.',
  'Lead ordinary output with work_stage, fact_summary and next_action. Use optional Method Ark lookup or presentation when the task calls for them.'
 ],
 missing_evidence_policy:'Return the exact acquisition target, owner, locator, version and completion condition. Typed classifier activation still requires the relevant structures and analytical questions.',
 initial_comparison_questions:['IDENTITY','ACTOR_CAPACITY','PERMISSION_OWNERSHIP','CONFIGURATION','COMPARISON','ALTERNATIVES','SOURCE_AUTHORITY'],
 evidence_boundary:'References are caller declarations, not source authentication or authorization. REQUIRED/ACTIVE means structurally selected, not a finding.',
 child_gate_boundary:'Only the question-specific default lenses activate; additional unsupported lenses remain BLOCKED. Registry coverage is not applicability.'
};
