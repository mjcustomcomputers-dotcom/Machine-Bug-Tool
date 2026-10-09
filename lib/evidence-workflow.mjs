import {validate} from './schema.mjs';
import {digest} from './universal.mjs';
import {getMethodCatalog} from './methods.mjs';

const id={type:'string',minLength:1,maxLength:200};
const text={type:'string',minLength:1,maxLength:2000};
const arr=(items,max=32)=>({type:'array',items,minItems:0,maxItems:max});
const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const refs=arr(id,32);
export const workflowSchema=obj({
 requested_phase:{type:'string',enum:['AUTO','EVIDENCE_ACQUISITION','ANALYSIS','VERIFICATION']},
 records:arr(obj({source_ref:id,version:id,content:{type:'string',maxLength:200000}},['source_ref','version']),32),
 verification_target:obj({claim:text,source_refs:refs,expected_support:text,expected_counterevidence:text},[])
},[]);
const fail=message=>{throw Error(message)};
const specified=value=>typeof value==='string'&&value.trim().length>0;
const key=(source,version)=>JSON.stringify([source,version]);
const compare=(a,b)=>a<b?-1:a>b?1:0;
const priority={REQUIRED:5,ACTIVE:4,BLOCKED:3,WATCH:2,DORMANT:1,NOT_APPLICABLE:0};
const fieldsForTarget=['claim','source_refs','expected_support','expected_counterevidence'];

function action(kind,title,target,description,completionCondition,extra={}){
 return {
  kind,title,description,source_ref:target?.source_ref??null,owner:target?.owner??null,
  native_locator:target?.native_locator??null,version:target?.version??null,
  target_fact:target?.target_fact??null,question_ids:target?.question_ids??[],
  completion_condition:completionCondition,...extra
 };
}

export async function planEvidenceWorkflow(input,{question_receipts=[],method_candidates=[]}={}){
 const request=input.workflow??{};validate(request,workflowSchema);
 const requested=request.requested_phase??'AUTO',sources=input.sources??[],records=request.records??[];
 const sourceMap=new Map(sources.map(source=>[source.id,source])),recordMap=new Map();
 for(const record of records){
  if(!sourceMap.has(record.source_ref))fail('WORKFLOW_RECORD_SOURCE_NOT_DECLARED:'+record.source_ref);
  const identity=key(record.source_ref,record.version);if(recordMap.has(identity))fail('DUPLICATE_WORKFLOW_SOURCE_VERSION');
  recordMap.set(identity,record);
 }
 if(records.reduce((bytes,record)=>bytes+new TextEncoder().encode(record.content??'').length,0)>600000)fail('WORKFLOW_RECORD_CONTENT_BUDGET');
 const target=request.verification_target??null;
 if(target?.source_refs&&new Set(target.source_refs).size!==target.source_refs.length)fail('DUPLICATE_WORKFLOW_TARGET_SOURCE');
 const missingTargetFields=fieldsForTarget.filter(field=>field==='source_refs'?!target?.source_refs?.length:!specified(target?.[field]));
 const targetComplete=missingTargetFields.length===0;
 const explicitModelAnalysis=!Object.hasOwn(input,'workflow')&&input.atomic_review?.mode==='EXECUTE_SUPPLIED_MODELS'&&(input.atomic_review.models??[]).length>0;
 const questions=input.questions??[],structures=new Map((input.structures??[]).map(structure=>[structure.id,structure]));
 const receipts=new Map(question_receipts.map(receipt=>[receipt.question_id,receipt]));
 const requirements=new Map();
 function requireSource(sourceRef,questionId,state,targetFact){
  if(!requirements.has(sourceRef))requirements.set(sourceRef,{source_ref:sourceRef,question_ids:new Set(),priority:0,target_facts:new Set()});
  const requirement=requirements.get(sourceRef);
  if(questionId)requirement.question_ids.add(questionId);
  if(targetFact)requirement.target_facts.add(targetFact);
  requirement.priority=Math.max(requirement.priority,priority[state]??0);
 }
 if(!explicitModelAnalysis){
  const activeQuestions=questions.filter(question=>question.applicability!=='NOT_APPLICABLE');
  const requiredQuestions=activeQuestions.filter(question=>question.necessity==='REQUIRED'||receipts.get(question.id)?.state==='ACTIVE');
  const workQuestions=requiredQuestions.length?requiredQuestions:activeQuestions;
  const targetSources=new Set(target?.source_refs??[]);
  for(const question of workQuestions){
   const state=receipts.get(question.id)?.state??(question.applicability==='NOT_APPLICABLE'?'NOT_APPLICABLE':question.necessity==='REQUIRED'?'REQUIRED':'ACTIVE');
   if(state==='NOT_APPLICABLE')continue;
   for(const sourceRef of question.rule_source_refs??[])if(!targetSources.size||targetSources.has(sourceRef))requireSource(sourceRef,question.id,state,question.invariant);
   for(const structureId of question.structure_ids??[])for(const sourceRef of structures.get(structureId)?.source_refs??[])if(!targetSources.size||targetSources.has(sourceRef))requireSource(sourceRef,question.id,state,question.invariant);
  }
  for(const sourceRef of target?.source_refs??[])requireSource(sourceRef,null,'REQUIRED',target.claim??input.problem);
  if(!requirements.size)for(const source of sources)requireSource(source.id,null,'ACTIVE',input.problem);
 }
 const sourceStates=[];
 for(const requirement of [...requirements.values()].sort((a,b)=>b.priority-a.priority||compare(a.source_ref,b.source_ref))){
  const source=sourceMap.get(requirement.source_ref),record=source?recordMap.get(key(source.id,source.version)):null;
  const hasContent=specified(record?.content),otherVersions=records.filter(row=>row.source_ref===requirement.source_ref&&row.version!==source?.version).map(row=>row.version).sort();
  const state=!source?'SOURCE_LOCATION_REQUIRED':hasContent?'CONTENT_AVAILABLE':record?'CONTENT_REQUIRED':otherVersions.length?'CURRENT_VERSION_REQUIRED':'CONTENT_REQUIRED';
  sourceStates.push({
   source_ref:requirement.source_ref,owner:source?.owner??null,native_locator:source?.native_locator??null,version:source?.version??null,
   question_ids:[...requirement.question_ids].sort(),target_fact:[...requirement.target_facts].sort().join(' | '),
   state,available_other_versions:otherVersions,
   content_fingerprint:hasContent?await digest(record.content):null,
   content_excerpt:hasContent?record.content.slice(0,600):null,
   completion_condition:source?`Supply the content of ${source.id} at version ${source.version}, from ${source.native_locator}.`:`Identify the owner, native locator and version of ${requirement.source_ref}, then supply its content.`
  });
 }
 if(!sourceStates.length&&!explicitModelAnalysis){
  const activeQuestions=questions.filter(question=>question.applicability!=='NOT_APPLICABLE');
  sourceStates.push({source_ref:null,owner:null,native_locator:null,version:null,question_ids:activeQuestions.map(question=>question.id).sort(),
   target_fact:target?.claim??activeQuestions[0]?.invariant??input.problem,state:'SOURCE_LOCATION_REQUIRED',available_other_versions:[],content_fingerprint:null,content_excerpt:null,
   completion_condition:'Identify the relevant native record, its owner, locator and version, then supply the record content.'});
 }
 const acquired=sourceStates.filter(source=>source.state==='CONTENT_AVAILABLE'),remaining=sourceStates.filter(source=>source.state!=='CONTENT_AVAILABLE');
 let phase,reason;
 if(explicitModelAnalysis){phase='ANALYSIS';reason='The caller explicitly requested computation on supplied models.'}
 else if(remaining.length){phase='EVIDENCE_ACQUISITION';reason=`${remaining.length} required record${remaining.length===1?' needs':'s need'} content or a current version.`}
 else if(requested==='EVIDENCE_ACQUISITION'){phase='EVIDENCE_ACQUISITION';reason='The requested collection step has its declared records.'}
 else if(requested==='ANALYSIS'){phase='ANALYSIS';reason='The requested analysis has record content to work with.'}
 else if(targetComplete){phase='VERIFICATION';reason='A specific claim, supporting and contrary conditions, and its record content are supplied.'}
 else{phase='ANALYSIS';reason='Record content is available for interpretation and model formulation.'}
 let next;
 if(phase==='EVIDENCE_ACQUISITION'&&remaining.length){
  const record=remaining[0];
  next=record.native_locator?action('ACQUIRE_RECORD',`Read ${record.source_ref} at version ${record.version}`,record,
   `Acquire ${record.source_ref} from ${record.owner} at ${record.native_locator} to establish: ${record.target_fact}`,record.completion_condition):
   action('LOCATE_RECORD','Locate the record needed for this question',record,`Find the native record that establishes: ${record.target_fact}`,record.completion_condition);
 }else if(phase==='EVIDENCE_ACQUISITION'){
  next=action('BEGIN_ANALYSIS','Analyze the acquired records',acquired[0],`The ${acquired.length} declared record${acquired.length===1?' is':'s are'} collected. Use the content to answer: ${input.problem}`,'Continue in ANALYSIS or AUTO using the same source versions and record content.');
 }else if(phase==='VERIFICATION'){
  next=action('VERIFY_CLAIM','Check the specific claim against the records',acquired[0],target.claim,
   'Record the supporting or contrary passages and the outcome for this claim.',
   {target_fact:target.claim,source_refs:[...target.source_refs],expected_support:target.expected_support,expected_counterevidence:target.expected_counterevidence});
 }else if(requested==='VERIFICATION'&&!targetComplete){
  next=action('FORMULATE_VERIFICATION_TARGET','Define the claim and what would settle it',acquired[0],
   `Use the acquired records to specify ${missingTargetFields.join(', ')}.`,
   'Supply one specific claim, its source references, the expected support and the expected contrary evidence.',{missing_fields:missingTargetFields});
 }else if(input.atomic_review?.models?.length){
  next=action('ANALYZE_SUPPLIED_MODELS','Analyze the supplied model variations',acquired[0],input.problem,
   'Interpret the explicit model results against the supplied question and its source content.',{model_ids:input.atomic_review.models.map(model=>model.id)});
 }else{
  const candidate=method_candidates.find(method=>['REQUIRED','ACTIVE'].includes(method.routing_state))??method_candidates[0];
  const model=(input.models??[]).find(model=>model.method===candidate?.method);
  if(model){
   next=action('EVALUATE_SUPPLIED_MODEL',`Analyze the supplied ${model.method} model`,acquired[0],input.problem,
    'Run the supplied model and interpret its result against the acquired record.',{method:model.method,ready_call:{tool:'evaluate_method',arguments:structuredClone(model)}});
  }else if(candidate){
   const schema=getMethodCatalog({method:candidate.method}).input_schemas[candidate.method];
   next=action('FORMULATE_MODEL',`Build the ${candidate.method} comparison from the records`,acquired[0],
    `Extract ${schema.required.join(', ')} from the acquired records for the selected question.`,
    'Supply the bounded model inputs with their source references.',{method:candidate.method,question_ids:candidate.question_ids,required_model_fields:schema.required});
  }else{
   next=action('ANALYZE_RECORDS','Analyze the acquired record content',acquired[0],`Use the acquired content to answer: ${input.problem}`,
    'State the source-supported observations, remaining questions and a suitable model or specific claim to check.');
  }
 }
 if(!next.target_fact)next.target_fact=target?.claim??input.problem;
 const facts=explicitModelAnalysis?[`${input.atomic_review.models?.length??0} supplied model${input.atomic_review.models?.length===1?' is':'s are'} ready for the explicitly requested analysis.`]:
  [`${acquired.length} of ${sourceStates.length} required record${sourceStates.length===1?' has':'s have'} content at the declared version.`,
   ...acquired.map(record=>`Record content is available for ${record.source_ref}, version ${record.version}, owned by ${record.owner}.`),
   ...remaining.map(record=>record.state==='CURRENT_VERSION_REQUIRED'?`${record.source_ref} needs version ${record.version}; supplied content is from ${record.available_other_versions.join(', ')}.`:record.state==='SOURCE_LOCATION_REQUIRED'?`The record needed to establish "${record.target_fact}" needs its native location.`:`${record.source_ref} has a source pointer; its current content is needed.`)];
 return {
  implementation_revision:'MPC-EVIDENCE-WORKFLOW-1',requested_phase:requested,phase,phase_reason:reason,
  analysis_basis:explicitModelAnalysis?'EXPLICIT_SUPPLIED_MODELS':'SOURCE_RECORD_CONTENT',
  fact_summary:facts,next_action:next,acquired_record_count:acquired.length,remaining_record_count:remaining.length,
  required_record_count:sourceStates.length,source_pointer_count:sources.length,source_records:sourceStates,
  evidence_fingerprint:await digest(acquired.map(record=>({source_ref:record.source_ref,owner:record.owner,native_locator:record.native_locator,version:record.version,content_fingerprint:record.content_fingerprint}))),
  verification_target:target?structuredClone(target):null,missing_verification_fields:missingTargetFields
 };
}

export function attachWorkflowExecution(workflow,{atomic_review,requested_mode,effective_mode}){
 const result=structuredClone(workflow),evaluations=atomic_review?.explicit_model_evaluations??0;
 const deferred=requested_mode==='EXECUTE_SUPPLIED_MODELS'&&effective_mode==='PLAN';
 result.model_execution={requested_mode:requested_mode??null,effective_mode:effective_mode??null,deferred,
  explicit_model_evaluations:evaluations,ready_models:(atomic_review?.baseline.model_results??[]).filter(model=>['SCHEMA_VALID_NOT_EXECUTED','EXECUTED'].includes(model.execution)).map(model=>({model_id:model.model_id,method:model.method,state:deferred?'READY_AFTER_EVIDENCE_ACQUISITION':model.execution}))};
 if(deferred)result.fact_summary.push(`${result.model_execution.ready_models.length} supplied model${result.model_execution.ready_models.length===1?' is':'s are'} prepared for analysis after collection.`);
 if(evaluations){
  result.fact_summary.push(`Executed ${evaluations} supplied-model evaluation${evaluations===1?'':'s'}.`);
  if(result.phase==='ANALYSIS'){
   const currentTarget=result.next_action;
   const executionOffset=atomic_review.next_execution_variant_offset,variantOffset=atomic_review.next_variant_offset;
   if(executionOffset!==null||variantOffset!==null){
    result.next_action=action('CONTINUE_MODEL_ANALYSIS','Continue the remaining model variations',currentTarget,
     `Continue at variant ${executionOffset??variantOffset} using the same baseline.`,
     'Finish the remaining variant and execution frontiers.',{variant_offset:executionOffset??variantOffset,base_fingerprint:atomic_review.base_fingerprint});
   }else if(!atomic_review.execution_complete){
    result.next_action=action('REPAIR_MODEL_INPUT','Complete the model inputs that need attention',currentTarget,
     'Use the model-specific results to repair the missing or invalid input.',
     'Each relevant supplied model has an executed receipt.',{models:[atomic_review.baseline,...atomic_review.variants].flatMap(state=>state.model_results).filter(model=>model.execution!=='EXECUTED').map(model=>({model_id:model.model_id,method:model.method,execution:model.execution,reason:model.reason??null}))});
   }else{
    result.next_action=action('INTERPRET_MODEL_RESULTS','Interpret the completed model comparisons',currentTarget,
     'Use the baseline and changed-model outcomes to answer the analytical question.',
     'Explain the result and identify the next discriminating fact or specific claim to verify.',{model_counterexample_count:atomic_review.variants.reduce((count,variant)=>count+variant.new_model_counterexamples.length,0)});
   }
  }
 }
 return result;
}
