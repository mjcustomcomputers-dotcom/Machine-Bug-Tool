// Deterministic, local-only Method Atlas self scan.
// This compares registered metadata; it does not execute a method, authenticate
// a source, infer equivalence, or prove that two observations are independent.
import {createHash} from 'node:crypto';

const METHOD_ID=/^MHA-[0-9]{4}$/u;
const CLASSIFIER_ID=/^MHC-[0-9]{4}$/u;
const HASH=/^[a-f0-9]{64}$/u;
const IMPLEMENTED_ID=/^[a-z][a-z0-9_]{1,63}$/u;
const TYPED_KEY=/^[A-Z][A-Z0-9_]{0,100}$/u;
const EXPECTED_IMPLEMENTED_IDS=['abductive_cover','ach','authority_graph','casino_meter_finality','claw_accumulator','coin_pusher_deferred','conservation','coverage','fault_tree','finite_invariant','fmea','harsanyi','identity','identity_graph','ledger','metamorphic','minimal_cut_sets','nash','partial_order','propositional_entailment','relational','selten','state_trace','temporal'];
const LIMITS=Object.freeze({methods:512,sources:512,triggers:16384,classifiers:512,crosswalks:16384,relations:4096,taxonomy:32768});
const fail=message=>{throw Error(message)};
const compare=(a,b)=>a<b?-1:a>b?1:0;
const dense=value=>{
 if(!Array.isArray(value))return false;
 for(let index=0;index<value.length;index++)if(!Object.hasOwn(value,index))return false;
 return true;
};
const canonical=value=>{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort(compare).map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 return JSON.stringify(value);
};
const digest=value=>createHash('sha256').update(typeof value==='string'?value:canonical(value),'utf8').digest('hex');
const text=(value,label,max=20000)=>{if(typeof value!=='string'||!value.length||value.length>max)fail(label);return value};
const sortedUnique=values=>[...new Set(values)].sort(compare);
const uniqueList=(values,label)=>{if(new Set(values).size!==values.length)fail('DUPLICATE_'+label);return [...values].sort(compare)};
const pairKey=(a,b)=>compare(a,b)<=0?a+'|'+b:b+'|'+a;
const tupleKey=(...values)=>canonical(values);
const relationKey=row=>tupleKey(row.method_id,row.related_method_id,row.relation_type);
const shared=(left,right)=>{const rightSet=new Set(right);return left.filter(value=>rightSet.has(value)).sort(compare)};
const sameArray=(left,right)=>left.length===right.length&&left.every((value,index)=>value===right[index]);

export const methodSelfScanContract=Object.freeze({
 version:'MPC_METHOD_SELF_SCAN_1.0',maximum_methods:LIMITS.methods,maximum_pair_rows:LIMITS.methods*(LIMITS.methods+1)/2,
 comparison_basis:'REGISTERED_STATIC_METADATA_ONLY',pair_order:'CANONICAL_UNORDERED_WITH_DIRECTIONAL_RELATIONS_PRESERVED',
 automatic_method_execution:false,source_authentication:false,runtime_execution_lineage_available:false,
 independent_evidence_proven:false,equivalence_proven:false,catalog_completeness_proven:false,
 target_actions:false,canonical_promotion:false
});

function validateArray(value,cap,label){
 if(!dense(value))fail(label+'_ARRAY_REQUIRED');
 if(value.length>cap)fail(label+'_OVER_CAP');
 return value;
}

function validateImplementedCapsules(value){
 validateArray(value,128,'IMPLEMENTED_CAPSULES');
 if(!value.length)fail('EMPTY_IMPLEMENTED_CAPSULES');
 const ids=new Set();
 for(const capsule of value){
  if(!capsule||typeof capsule!=='object'||Array.isArray(capsule))fail('INVALID_IMPLEMENTED_CAPSULE');
  const id=text(capsule.method_id,'INVALID_IMPLEMENTED_METHOD_ID');
  if(!IMPLEMENTED_ID.test(id))fail('INVALID_IMPLEMENTED_METHOD_ID');
  if(ids.has(id))fail('DUPLICATE_IMPLEMENTED_METHOD_ID');
  ids.add(id);
 }
 if(!sameArray([...ids].sort(compare),EXPECTED_IMPLEMENTED_IDS))fail('IMPLEMENTED_REGISTRY_ID_MISMATCH');
 const output=[];
 for(const capsule of value){
  if(capsule.implementation_state!=='EXECUTABLE_BOUNDED_MODEL')fail('INVALID_IMPLEMENTED_METHOD_STATE');
  if(!capsule.input_schema||typeof capsule.input_schema!=='object'||Array.isArray(capsule.input_schema)||capsule.input_schema.type!=='object'||
   !capsule.input_schema.properties||typeof capsule.input_schema.properties!=='object'||Array.isArray(capsule.input_schema.properties)||capsule.input_schema.additionalProperties!==false)fail('IMPLEMENTED_SCHEMA_NOT_STRICT');
  const schemaRequired=uniqueList(validateArray(capsule.input_schema.required??[],128,'IMPLEMENTED_SCHEMA_REQUIRED').map(value=>text(value,'INVALID_IMPLEMENTED_SCHEMA_REQUIRED')),'IMPLEMENTED_SCHEMA_REQUIRED');
  if(schemaRequired.some(name=>!Object.hasOwn(capsule.input_schema.properties,name)))fail('IMPLEMENTED_REQUIRED_SCHEMA_PROPERTY_MISSING');
  const capsuleRequired=uniqueList(validateArray(capsule.required_inputs,128,'IMPLEMENTED_REQUIRED_INPUTS').map(value=>text(value,'INVALID_IMPLEMENTED_REQUIRED_INPUT')),'IMPLEMENTED_REQUIRED_INPUT');
  if(!sameArray(schemaRequired,capsuleRequired))fail('IMPLEMENTED_REQUIRED_INPUT_SCHEMA_MISMATCH');
  const schemaOptional=Object.keys(capsule.input_schema.properties).filter(name=>!schemaRequired.includes(name)).sort(compare);
  const capsuleOptional=uniqueList(validateArray(capsule.optional_inputs,128,'IMPLEMENTED_OPTIONAL_INPUTS').map(value=>text(value,'INVALID_IMPLEMENTED_OPTIONAL_INPUT')),'IMPLEMENTED_OPTIONAL_INPUT');
  if(!sameArray(schemaOptional,capsuleOptional))fail('IMPLEMENTED_OPTIONAL_INPUT_SCHEMA_MISMATCH');
  const complements=uniqueList(validateArray(capsule.complement_methods,128,'IMPLEMENTED_COMPLEMENTS').map(value=>text(value,'INVALID_IMPLEMENTED_COMPLEMENT')),'IMPLEMENTED_COMPLEMENT');
  if(complements.some(id=>!ids.has(id)))fail('UNRESOLVED_IMPLEMENTED_COMPLEMENT');
  if(capsule.inversion_pair?.implementation_state!=='REVIEW_METADATA_ONLY')fail('IMPLEMENTED_INVERSE_STATE_MISMATCH');
  for(const field of ['purpose','problem_shape','what_it_supports','falsifier'])text(capsule[field],'INVALID_IMPLEMENTED_'+field.toUpperCase());
  for(const field of ['assumptions','procedure','what_it_does_not_support','known_failure_modes']){
   const values=validateArray(capsule[field],128,'IMPLEMENTED_'+field.toUpperCase()).map(value=>text(value,'INVALID_IMPLEMENTED_'+field.toUpperCase()));
   if(!values.length)fail('EMPTY_IMPLEMENTED_'+field.toUpperCase());
  }
  if(!capsule.source_pointer||typeof capsule.source_pointer!=='object'||Array.isArray(capsule.source_pointer)||
   !capsule.source_pointer.provenance_pointers)fail('IMPLEMENTED_SOURCE_POINTER_REQUIRED');
  output.push({
   method_id:capsule.method_id,canonical_name:text(capsule.canonical_name,'INVALID_IMPLEMENTED_CANONICAL_NAME'),
   implementation_state:capsule.implementation_state,required_inputs:capsuleRequired,complement_methods:complements,
   inverse:{name:text(capsule.inversion_pair.name,'INVALID_IMPLEMENTED_INVERSE'),implementation_state:capsule.inversion_pair.implementation_state},
   output_type:text(capsule.output_type,'INVALID_IMPLEMENTED_OUTPUT_TYPE'),input_schema_sha256:digest(capsule.input_schema),capsule_sha256:digest(capsule),
   contract_status:'IMPLEMENTED_CAPSULE_REGISTERED_STRUCTURE_MATCH',method_execution_performed:false
  });
 }
 return output.sort((a,b)=>compare(a.method_id,b.method_id));
}

function stronglyConnected(ids,relations){
 const adjacency=new Map(ids.map(id=>[id,[]]));
 for(const row of relations)adjacency.get(row.method_id).push(row.related_method_id);
 for(const values of adjacency.values())values.sort(compare);
 let nextIndex=0;
 const indices=new Map(),low=new Map(),stack=[],active=new Set(),groups=[];
 function visit(id){
  indices.set(id,nextIndex);low.set(id,nextIndex);nextIndex++;stack.push(id);active.add(id);
  for(const related of adjacency.get(id)){
   if(!indices.has(related)){visit(related);low.set(id,Math.min(low.get(id),low.get(related)))}
   else if(active.has(related))low.set(id,Math.min(low.get(id),indices.get(related)));
  }
  if(low.get(id)===indices.get(id)){
   const group=[];let member;
   do{member=stack.pop();active.delete(member);group.push(member)}while(member!==id);
   group.sort(compare);groups.push(group);
  }
 }
 for(const id of ids)if(!indices.has(id))visit(id);
 return groups.sort((a,b)=>compare(a[0],b[0]));
}

function undirectedComponents(ids,relations){
 const adjacency=new Map(ids.map(id=>[id,new Set()]));
 for(const row of relations){adjacency.get(row.method_id).add(row.related_method_id);adjacency.get(row.related_method_id).add(row.method_id)}
 const seen=new Set(),groups=[];
 for(const root of ids){
  if(seen.has(root))continue;
  const group=[],queue=[root];seen.add(root);
  for(let index=0;index<queue.length;index++){
   const id=queue[index];group.push(id);
   for(const related of [...adjacency.get(id)].sort(compare))if(!seen.has(related)){seen.add(related);queue.push(related)}
  }
  group.sort(compare);groups.push(group);
 }
 return groups.sort((a,b)=>compare(a[0],b[0]));
}

function maximumShortestDirectedPath(ids,relations){
 const adjacency=new Map(ids.map(id=>[id,[]]));
 for(const row of relations)adjacency.get(row.method_id).push(row.related_method_id);
 let maximum=0;
 for(const root of ids){
  const distance=new Map([[root,0]]),queue=[root];
  for(let index=0;index<queue.length;index++){
   const id=queue[index];
   for(const related of adjacency.get(id))if(!distance.has(related)){
    const value=distance.get(id)+1;distance.set(related,value);maximum=Math.max(maximum,value);queue.push(related);
   }
  }
 }
 return maximum;
}

function duplicateGroups(rows,field,idField){
 const groups=new Map();
 for(const row of rows){const key=row[field];if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row[idField])}
 return [...groups.entries()].filter(([,ids])=>ids.length>1).map(([value,ids])=>({value,ids:ids.sort(compare)})).sort((a,b)=>compare(a.ids[0],b.ids[0]));
}

function duplicateSelectedStoredContracts(methods){
 const groups=new Map();
 for(const method of methods){
  const value={method_name:method.method_name,family:method.family,mechanism:method.mechanism,required_input:method.required_input,
   falsifier:method.falsifier,implementation_state:method.implementation_state,quantum_requirement:method.quantum_requirement,
   primary_source_id:method.primary_source_id,provenance_state:method.provenance_state,dimensions:method.dimensions,
   trigger_profile:method.trigger_profile,
   classifier:{question:method.classifier.question,missing_evidence:method.classifier.missing_evidence,
    falsifier:method.classifier.falsifier,classifier_state:method.classifier.classifier_state},
   taxonomy_tags:method.taxonomy_tags,crosswalks:method.crosswalks.map(row=>({parent_namespace:row.parent_namespace,parent_native_id:row.parent_native_id,link_status:row.link_status,basis:row.basis}))};
  const key=digest(value);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(method.method_id);
 }
 return [...groups.entries()].filter(([,ids])=>ids.length>1).map(([structure_sha256,method_ids])=>({structure_sha256,method_ids:method_ids.sort(compare)})).sort((a,b)=>compare(a.method_ids[0],b.method_ids[0]));
}

function validateSnapshot(snapshot){
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))fail('METHOD_SELF_SCAN_SNAPSHOT_REQUIRED');
 const allowed=new Set(['implemented_capsules','methods','sources','triggers','classifiers','crosswalks','relations','taxonomy']);
 if(Object.keys(snapshot).some(key=>!allowed.has(key)))fail('UNKNOWN_METHOD_SELF_SCAN_SNAPSHOT_FIELD');
 const implemented=validateImplementedCapsules(snapshot.implemented_capsules);
 const sources=validateArray(snapshot.sources,LIMITS.sources,'SOURCES').map(row=>({...row})).sort((a,b)=>compare(a.source_id,b.source_id));
 const sourceIds=new Set();
 for(const row of sources){
  text(row.source_id,'INVALID_SOURCE_ID');text(row.title,'INVALID_SOURCE_TITLE');text(row.native_url,'INVALID_SOURCE_LOCATOR');
  text(row.source_class,'INVALID_SOURCE_CLASS');text(row.review_state,'INVALID_SOURCE_REVIEW_STATE');text(row.checked_on,'INVALID_SOURCE_CHECK_DATE');
  if(sourceIds.has(row.source_id))fail('DUPLICATE_SOURCE_ID');sourceIds.add(row.source_id);
 }
 const methods=validateArray(snapshot.methods,LIMITS.methods,'METHODS').map(row=>({...row})).sort((a,b)=>compare(a.method_id,b.method_id));
 if(!methods.length)fail('EMPTY_METHOD_ATLAS');
 const methodIds=new Set();
 for(const row of methods){
  if(!METHOD_ID.test(row.method_id))fail('INVALID_METHOD_ID');
  for(const field of ['method_name','family','mechanism','required_input','falsifier','implementation_state','quantum_requirement','primary_source_id','provenance_state'])text(row[field],'INVALID_METHOD_'+field.toUpperCase());
  if(methodIds.has(row.method_id))fail('DUPLICATE_METHOD_ID');
  if(!sourceIds.has(row.primary_source_id))fail('UNRESOLVED_METHOD_SOURCE');
  methodIds.add(row.method_id);
 }
 function normalizeRows(name,cap,keyForRow,check){
  const values=validateArray(snapshot[name],cap,name.toUpperCase()).map(row=>({...row})),seen=new Set();
  for(const row of values){const key=keyForRow(row);if(seen.has(key))fail('DUPLICATE_'+name.toUpperCase()+'_ROW');seen.add(key);check(row)}
  return values.sort((a,b)=>compare(keyForRow(a),keyForRow(b)));
 }
 const triggers=normalizeRows('triggers',LIMITS.triggers,row=>tupleKey(row.method_id,row.dimension),row=>{
  if(!methodIds.has(row.method_id)||typeof row.dimension!=='string'||!TYPED_KEY.test(row.dimension)||!Number.isInteger(row.trigger_strength)||row.trigger_strength<1||row.trigger_strength>5)fail('INVALID_TRIGGER_ROW');
 });
 const classifiers=normalizeRows('classifiers',LIMITS.classifiers,row=>row.classifier_id,row=>{
  if(!CLASSIFIER_ID.test(row.classifier_id)||!methodIds.has(row.method_id))fail('INVALID_CLASSIFIER_ROW');
  for(const field of ['question','missing_evidence','falsifier','classifier_state'])text(row[field],'INVALID_CLASSIFIER_'+field.toUpperCase());
 });
 const classifierMethods=new Set();
 for(const row of classifiers){if(classifierMethods.has(row.method_id))fail('DUPLICATE_METHOD_CLASSIFIER');classifierMethods.add(row.method_id)}
 if(classifierMethods.size!==methods.length||methods.some(row=>!classifierMethods.has(row.method_id)))fail('UNRESOLVED_METHOD_CLASSIFIER');
 const crosswalks=normalizeRows('crosswalks',LIMITS.crosswalks,row=>tupleKey(row.method_id,row.parent_namespace,row.parent_native_id),row=>{
  if(!methodIds.has(row.method_id))fail('UNRESOLVED_CROSSWALK_METHOD');
  for(const field of ['parent_namespace','parent_native_id','link_status','basis'])text(row[field],'INVALID_CROSSWALK_'+field.toUpperCase());
  if(!TYPED_KEY.test(row.parent_namespace))fail('INVALID_CROSSWALK_PARENT_NAMESPACE');
 });
 const relations=normalizeRows('relations',LIMITS.relations,relationKey,row=>{
  if(!methodIds.has(row.method_id)||!methodIds.has(row.related_method_id))fail('UNRESOLVED_RELATION_ENDPOINT');
  if(row.method_id===row.related_method_id)fail('SELF_RELATION_REJECTED');
  if(!['CHALLENGE','CROSS_CHECK','COMPLEMENT'].includes(row.relation_type))fail('INVALID_RELATION_TYPE');
  if(row.evidence_independent!==0&&row.evidence_independent!==false)fail('UNSUPPORTED_INDEPENDENCE_CLAIM');
  text(row.rationale,'INVALID_RELATION_RATIONALE');text(row.link_status,'INVALID_RELATION_STATUS');
  row.evidence_independent=false;
 });
 const taxonomy=normalizeRows('taxonomy',LIMITS.taxonomy,row=>tupleKey(row.method_id,row.axis,row.class_key),row=>{
  if(!methodIds.has(row.method_id))fail('UNRESOLVED_TAXONOMY_METHOD');
  for(const field of ['axis','class_key','classification_basis','review_state'])text(row[field],'INVALID_TAXONOMY_'+field.toUpperCase());
  if(!TYPED_KEY.test(row.axis)||!TYPED_KEY.test(row.class_key))fail('INVALID_TAXONOMY_KEY');
 });
 return {implemented,methods,sources,triggers,classifiers,crosswalks,relations,taxonomy};
}

export function scanMethodsAgainstMethods(snapshot,{prior_fingerprint=null}={}){
 if(prior_fingerprint!==null&&!HASH.test(prior_fingerprint))fail('INVALID_PRIOR_SELF_SCAN_FINGERPRINT');
 const normalized=validateSnapshot(snapshot);
 const {implemented,methods,sources,triggers,classifiers,crosswalks,relations,taxonomy}=normalized;
 const bySource=new Map(sources.map(row=>[row.source_id,row]));
 const byClassifier=new Map(classifiers.map(row=>[row.method_id,row]));
 const dimensions=new Map(methods.map(row=>[row.method_id,[]]));
 for(const row of triggers)dimensions.get(row.method_id).push(row.dimension);
 for(const [id,values] of dimensions){dimensions.set(id,sortedUnique(values));if(!dimensions.get(id).length)fail('METHOD_WITHOUT_TRIGGER_DIMENSION')}
 const triggerProfiles=new Map(methods.map(row=>[row.method_id,[]]));
 for(const row of triggers)triggerProfiles.get(row.method_id).push(tupleKey(row.dimension,row.trigger_strength));
 for(const [id,values] of triggerProfiles)triggerProfiles.set(id,values.sort(compare));
 const tags=new Map(methods.map(row=>[row.method_id,[]]));
 for(const row of taxonomy)tags.get(row.method_id).push(row.axis+':'+row.class_key);
 for(const [id,values] of tags)tags.set(id,sortedUnique(values));
 const methodCrosswalks=new Map(methods.map(row=>[row.method_id,[]]));
 for(const row of crosswalks)methodCrosswalks.get(row.method_id).push(row);
 const crosswalkParents=new Map(methods.map(row=>[row.method_id,[]]));
 for(const row of crosswalks)crosswalkParents.get(row.method_id).push(tupleKey(row.parent_namespace,row.parent_native_id));
 for(const [id,values] of crosswalkParents)crosswalkParents.set(id,values.sort(compare));
 const directed=new Map();
 for(const row of relations){const key=tupleKey(row.method_id,row.related_method_id);if(!directed.has(key))directed.set(key,[]);directed.get(key).push(row)}
 for(const values of directed.values())values.sort((a,b)=>compare(a.relation_type,b.relation_type));
 const incoming=new Map(methods.map(row=>[row.method_id,[]])),outgoing=new Map(methods.map(row=>[row.method_id,[]]));
 for(const row of relations){outgoing.get(row.method_id).push(row);incoming.get(row.related_method_id).push(row)}
 const selfContracts=methods.map(method=>{
  const classifier=byClassifier.get(method.method_id),expectedClassifier='MHC-'+method.method_id.slice(4),mismatches=[];
  if(classifier.classifier_id!==expectedClassifier)mismatches.push('METHOD_CLASSIFIER_ID_SUFFIX');
  if(classifier.missing_evidence!==method.required_input)mismatches.push('REQUIRED_INPUT_MISSING_EVIDENCE');
  if(classifier.falsifier!==method.falsifier)mismatches.push('METHOD_CLASSIFIER_FALSIFIER');
  return {
   method_id:method.method_id,classifier_id:classifier.classifier_id,control:'IDENTITY_CONTROL_ONLY',
   contract_status:mismatches.length?'BLOCKED_METHOD_CLASSIFIER_MISMATCH':'STATIC_SELF_CONTRACT_MATCH',mismatches,
   survival:{question:'PRESENT',required_information:'PRESENT',steps:'PARTIAL_UNSTRUCTURED_MECHANISM',output_contract:'MISSING',
    assumptions:'MISSING',unsupported_conclusions:'MISSING_PER_METHOD',falsifier:'PRESENT',inverse_or_complement:'MISSING_OR_RELATION_METADATA_ONLY',
    provenance:method.provenance_state,example:'MISSING',overall:'INCOMPLETE'},
   method_execution_performed:false,corroboration:false
  };
 });
 const methodRows=methods.map(method=>({
  ...method,source:bySource.get(method.primary_source_id),dimensions:dimensions.get(method.method_id),trigger_profile:triggerProfiles.get(method.method_id),classifier:byClassifier.get(method.method_id),
  taxonomy_tags:tags.get(method.method_id),crosswalks:methodCrosswalks.get(method.method_id),
  incoming_relation_count:incoming.get(method.method_id).length,outgoing_relation_count:outgoing.get(method.method_id).length,
  self_contract:selfContracts.find(row=>row.method_id===method.method_id)
 }));
 const pairs=[];
 const aggregate={same_primary_source_id:0,same_exact_source_locator:0,same_locator_different_source_id:0,same_family:0,shared_dimension:0,
  shared_trigger_profile:0,shared_crosswalk_parent:0,same_dimension_set:0,same_taxonomy_signature:0,same_classifier_question:0,
  declared_relation:0,no_core_static_link:0,no_registered_metadata_overlap:0};
 for(let leftIndex=0;leftIndex<methodRows.length;leftIndex++)for(let rightIndex=leftIndex;rightIndex<methodRows.length;rightIndex++){
  const left=methodRows[leftIndex],right=methodRows[rightIndex],identity=leftIndex===rightIndex;
  const leftDimensions=left.dimensions,rightDimensions=right.dimensions,leftTags=left.taxonomy_tags,rightTags=right.taxonomy_tags;
  const sharedDimensions=shared(leftDimensions,rightDimensions),sharedTags=shared(leftTags,rightTags),
   sharedTriggerProfileKeys=shared(left.trigger_profile,right.trigger_profile),sharedCrosswalkKeys=shared(crosswalkParents.get(left.method_id),crosswalkParents.get(right.method_id));
  const sharedTriggerProfiles=sharedTriggerProfileKeys.map(key=>{const [dimension,trigger_strength]=JSON.parse(key);return {dimension,trigger_strength}});
  const sharedCrosswalkParents=sharedCrosswalkKeys.map(key=>{const [parent_namespace,parent_native_id]=JSON.parse(key);return {parent_namespace,parent_native_id}});
  const aToB=identity?[]:(directed.get(tupleKey(left.method_id,right.method_id))??[]);
  const bToA=identity?[]:(directed.get(tupleKey(right.method_id,left.method_id))??[]);
  const sameSourceId=left.primary_source_id===right.primary_source_id;
  const sameLocator=left.source.native_url===right.source.native_url;
  const sameFamily=left.family===right.family;
  const sameDimensionSet=sameArray(leftDimensions,rightDimensions);
  const sameTaxonomySignature=sameArray(leftTags,rightTags);
  const sameClassifierQuestion=left.classifier.question===right.classifier.question;
  const exactFields=['method_name','mechanism','required_input','falsifier'].filter(field=>left[field]===right[field]);
  const declared=aToB.length+bToA.length>0;
  const coreStatic=sameSourceId||sameLocator||sameFamily||sharedDimensions.length>0||declared;
  // Individual taxonomy tags include universal implementation/source-review
  // labels, so only a complete matching taxonomy signature contributes to the
  // aggregate overlap status. All shared tags remain visible in the vector.
  const metadataOverlap=coreStatic||sameTaxonomySignature||sharedCrosswalkParents.length>0||sameClassifierQuestion||exactFields.length>0;
  if(!identity){
   if(sameSourceId)aggregate.same_primary_source_id++;
   if(sameLocator)aggregate.same_exact_source_locator++;
   if(sameLocator&&!sameSourceId)aggregate.same_locator_different_source_id++;
   if(sameFamily)aggregate.same_family++;
   if(sharedDimensions.length)aggregate.shared_dimension++;
   if(sharedTriggerProfiles.length)aggregate.shared_trigger_profile++;
   if(sharedCrosswalkParents.length)aggregate.shared_crosswalk_parent++;
   if(sameDimensionSet)aggregate.same_dimension_set++;
   if(sameTaxonomySignature)aggregate.same_taxonomy_signature++;
   if(sameClassifierQuestion)aggregate.same_classifier_question++;
   if(declared)aggregate.declared_relation++;
   if(!coreStatic)aggregate.no_core_static_link++;
   if(!metadataOverlap)aggregate.no_registered_metadata_overlap++;
  }
  pairs.push({
   pair_key:pairKey(left.method_id,right.method_id),method_id_a:left.method_id,method_id_b:right.method_id,
   comparison_kind:identity?'IDENTITY_CONTROL_ONLY':'UNORDERED_CROSS_METHOD_METADATA_COMPARISON',
   declared_relations:{a_to_b:aToB,b_to_a:bToA},
   evidence_vector:{same_primary_source_id:sameSourceId,same_exact_source_locator:sameLocator,same_family:sameFamily,
    shared_dimensions:sharedDimensions,shared_trigger_profiles:sharedTriggerProfiles,shared_crosswalk_parents:sharedCrosswalkParents,
    same_dimension_set:sameDimensionSet,shared_taxonomy_tags:sharedTags,same_taxonomy_signature:sameTaxonomySignature,
    same_classifier_question:sameClassifierQuestion,exact_stored_field_matches:exactFields},
   assessment:{
    core_static_link_status:identity?'IDENTITY_CONTROL_ONLY':declared?'DECLARED_RELATION_METADATA':coreStatic?'CORE_STATIC_OVERLAP_OBSERVED':'NO_CORE_STATIC_LINK_OBSERVED',
    metadata_overlap_status:identity?'IDENTITY_CONTROL_ONLY':metadataOverlap?'REGISTERED_METADATA_OVERLAP_OBSERVED':'NO_REGISTERED_METADATA_OVERLAP_OBSERVED',
    source_lineage_status:identity?'IDENTITY_CONTROL_ONLY':sameLocator?'STATIC_SOURCE_LOCATOR_OVERLAP':'RUNTIME_LINEAGE_NOT_AVAILABLE',
    independence_status:'NOT_ESTABLISHED',equivalence_status:'NOT_ESTABLISHED',corroboration:identity?'NOT_CORROBORATION':'NOT_EVALUATED_REQUIRES_SUPPLIED_RECEIPTS'
   }
  });
 }
 const expectedCross=methods.length*(methods.length-1)/2,expectedMatrix=methods.length*(methods.length+1)/2;
 if(pairs.length!==expectedMatrix)fail('PAIR_ACCOUNTING_MISMATCH');
 const ids=methods.map(row=>row.method_id);
 const components=undirectedComponents(ids,relations),sccs=stronglyConnected(ids,relations),cycles=sccs.filter(group=>group.length>1);
 const isolates=components.filter(group=>group.length===1).map(group=>group[0]);
 const degree=ids.map(method_id=>({method_id,incoming:incoming.get(method_id).length,outgoing:outgoing.get(method_id).length,
  total:incoming.get(method_id).length+outgoing.get(method_id).length}));
 const reciprocal=[];
 for(let leftIndex=0;leftIndex<ids.length;leftIndex++)for(let rightIndex=leftIndex+1;rightIndex<ids.length;rightIndex++){
  const left=ids[leftIndex],right=ids[rightIndex],forward=directed.get(tupleKey(left,right))??[],reverse=directed.get(tupleKey(right,left))??[];
  if(forward.length&&reverse.length)reciprocal.push({method_id_a:left,method_id_b:right,a_to_b:forward,b_to_a:reverse});
 }
 const locatorDuplicates=duplicateGroups(sources,'native_url','source_id').map(group=>({native_url:group.value,source_ids:group.ids}));
 const duplicateReviewCandidates={method_name:duplicateGroups(methods,'method_name','method_id'),mechanism:duplicateGroups(methods,'mechanism','method_id'),
  required_input:duplicateGroups(methods,'required_input','method_id'),falsifier:duplicateGroups(methods,'falsifier','method_id'),
  selected_stored_contract_fields:duplicateSelectedStoredContracts(methodRows)};
 const methodById=new Map(methodRows.map(method=>[method.method_id,method]));
 const zeroIncomingCount=degree.filter(row=>row.incoming===0).length,zeroOutgoingCount=degree.filter(row=>row.outgoing===0).length;
 const sameSourceIdEdgeCount=relations.filter(row=>methodById.get(row.method_id).primary_source_id===methodById.get(row.related_method_id).primary_source_id).length;
 const sameLocatorEdgeCount=relations.filter(row=>methodById.get(row.method_id).source.native_url===methodById.get(row.related_method_id).source.native_url).length;
 const maximumDirectedPath=maximumShortestDirectedPath(ids,relations);
 const integrityMeaning='Exact stored-field matches and metadata overlaps are review signals only; their absence does not prove distinctness.';
 const traversalWarning='Directed cycles and incoming-only nodes require a visited set and both edge directions for audit; no reverse edge is inferred.';
 const hookCoverage={
  'MHA-0195':'STATIC_SHARED_SOURCE_AND_DECLARED_RELATION_SCREEN_COMPLETE_NO_RUNTIME_DEPENDENCY_CONCLUSION',
  'MHA-0219':'BLOCKED_NO_RUNTIME_ORACLE_LINEAGE_RECEIPTS',
  'MHA-0224':'REGISTERED_STATIC_RELATION_GRAPH_FULL_ACCOUNTING_COMPLETE',
  'MHA-0227':'STATIC_SOURCE_LOCATOR_OVERLAP_SCREEN_COMPLETE_NO_RUNTIME_LINEAGE_CONCLUSION',
  'MHA-0229':'STATIC_REPEAT_STOP_FINGERPRINT_EVALUATED',
  'MHA-0230':'BLOCKED_NO_PAIRED_METHOD_OUTPUTS_OR_ASSUMPTION_RECEIPTS'
 };
 const dynamicEvaluations={oracle_circularity:'NOT_EVALUATED_REQUIRES_SUPPLIED_RECEIPTS',result_disagreement:'NOT_EVALUATED_REQUIRES_SUPPLIED_RECEIPTS',
  repeatability:'NOT_EVALUATED_REQUIRES_SUPPLIED_RECEIPTS',negative_controls:'NOT_EVALUATED_REQUIRES_SUPPLIED_RECEIPTS',
  runtime_evidence_lineage:'NOT_EVALUATED_REQUIRES_SUPPLIED_RECEIPTS'};
 const openDependencies=['Per-method structured procedure','Per-method output contract','Per-method assumptions and limitations','Per-method example',
  'Authenticated runtime source/oracle lineage receipts','Paired method outputs and negative controls','Reviewed inverse definitions'];
 const boundaries={source_authentication:false,method_execution_performed:false,runtime_execution_lineage_available:false,
  independent_evidence_proven:false,equivalence_proven:false,catalog_completeness_proven:false,target_actions:false,canonical_promotion:false};
 const normalizedForHash={contract:methodSelfScanContract,implemented_contracts:implemented,methods,sources,triggers,classifiers,crosswalks,relations,taxonomy};
 const catalogFingerprint=digest(normalizedForHash),pairFingerprint=digest(pairs);
 const mismatchCount=selfContracts.reduce((sum,row)=>sum+row.mismatches.length,0);
 // Include every material derived section in the repeat-stop identity. A
 // catalog-only hash could incorrectly stop after assessment logic changes.
 const scanFingerprint=digest({catalog_sha256:catalogFingerprint,pair_stream_sha256:pairFingerprint,self_contracts:selfContracts,
  graph:{degree,components,sccs,reciprocal,zeroIncomingCount,zeroOutgoingCount,sameSourceIdEdgeCount,sameLocatorEdgeCount,maximumDirectedPath},
  integrity:{mismatchCount,duplicateReviewCandidates,locatorDuplicates,integrityMeaning},aggregates:aggregate,
  hookCoverage,dynamicEvaluations,openDependencies,boundaries,traversalWarning});
 const scanDelta=prior_fingerprint===null?'NO_PRIOR_SCAN':prior_fingerprint===scanFingerprint?'ZERO_STATIC_SCAN_DELTA':'CHANGED_STATIC_SCAN_INPUT_OR_DERIVATION';
 const status=mismatchCount?'BLOCKED_STATIC_SELF_CONTRACT_MISMATCH':scanDelta==='ZERO_STATIC_SCAN_DELTA'?'STOP_NO_MATERIAL_INFORMATION_GAIN':'STATIC_METHOD_SELF_SCAN_COMPLETE_WITH_OPEN_GAPS';
 return {
  version:methodSelfScanContract.version,status,contract:methodSelfScanContract,
  inventory:{implemented_evaluators:implemented.length,research_methods:methods.length,classifiers:classifiers.length,sources:sources.length,
   triggers:triggers.length,crosswalks:crosswalks.length,taxonomy_tags:taxonomy.length,directed_relations:relations.length,
   unordered_declared_pairs:aggregate.declared_relation,diagonal_identity_controls:methods.length,unordered_cross_method_pairs:expectedCross,
   total_matrix_rows:expectedMatrix,matrix_rows_emitted:pairs.length,matrix_rows_suppressed:0},
  fingerprints:{scan_sha256:scanFingerprint,catalog_sha256:catalogFingerprint,pair_stream_sha256:pairFingerprint,
   scope:'CONTRACT_NORMALIZED_CATALOG_AND_MATERIAL_DERIVED_OUTPUTS',prior_scan_sha256:prior_fingerprint,scan_delta:scanDelta},
  implemented_contracts:implemented,self_contracts:selfContracts,methods:methodRows,sources,
  pair_scan:{formula:'n*(n+1)/2 including diagonal controls; n*(n-1)/2 cross-method pairs',expected_rows:expectedMatrix,examined_rows:pairs.length,
   emitted_rows:pairs.length,suppressed_rows:0,aggregates:aggregate,rows:pairs},
  integrity:{method_classifier_mismatch_count:mismatchCount,
   duplicate_review_candidates:duplicateReviewCandidates,
   duplicate_source_locators:locatorDuplicates,
   meaning:integrityMeaning},
  relation_graph:{edges:relations,degree,zero_incoming_count:zeroIncomingCount,zero_outgoing_count:zeroOutgoingCount,
   same_source_id_edge_count:sameSourceIdEdgeCount,same_exact_source_locator_edge_count:sameLocatorEdgeCount,
   isolated_methods:isolates,undirected_components:components,undirected_component_count:components.length,
   strongly_connected_components:sccs,nontrivial_directed_cycles:cycles,reciprocal_pairs:reciprocal,
   maximum_shortest_directed_path:maximumDirectedPath,traversal_warning:traversalWarning},
  hook_coverage:hookCoverage,dynamic_evaluations:dynamicEvaluations,open_dependencies:openDependencies,...boundaries
 };
}

async function readRows(db,sql,cap,label){
 const value=await db.prepare(sql+' LIMIT '+(cap+1)).bind().all();
 const rows=Array.isArray(value)?value:value?.results;
 if(!Array.isArray(rows))fail(label+'_DATABASE_ROWS_REQUIRED');
 if(rows.length>cap)fail(label+'_OVER_CAP');
 return rows;
}

export async function scanMethodAtlas(db,{implemented_capsules,prior_fingerprint=null}={}){
 if(!db||typeof db.prepare!=='function')fail('METHOD_SELF_SCAN_DATABASE_REQUIRED');
 return scanMethodsAgainstMethods({
  implemented_capsules,
  methods:await readRows(db,'SELECT method_id,method_name,family,mechanism,required_input,falsifier,implementation_state,quantum_requirement,primary_source_id,provenance_state FROM atlas_methods ORDER BY method_id',LIMITS.methods,'METHODS'),
  sources:await readRows(db,'SELECT source_id,title,native_url,source_class,review_state,checked_on FROM atlas_sources ORDER BY source_id',LIMITS.sources,'SOURCES'),
  triggers:await readRows(db,'SELECT method_id,dimension,trigger_strength FROM atlas_triggers ORDER BY method_id,dimension',LIMITS.triggers,'TRIGGERS'),
  classifiers:await readRows(db,'SELECT classifier_id,method_id,question,missing_evidence,falsifier,classifier_state FROM atlas_classifiers ORDER BY classifier_id',LIMITS.classifiers,'CLASSIFIERS'),
  crosswalks:await readRows(db,'SELECT method_id,parent_namespace,parent_native_id,link_status,basis FROM atlas_crosswalk ORDER BY method_id,parent_namespace,parent_native_id',LIMITS.crosswalks,'CROSSWALKS'),
  relations:await readRows(db,'SELECT method_id,related_method_id,relation_type,rationale,evidence_independent,link_status FROM atlas_method_relations ORDER BY method_id,related_method_id,relation_type',LIMITS.relations,'RELATIONS'),
  taxonomy:await readRows(db,'SELECT method_id,axis,class_key,classification_basis,review_state FROM atlas_method_taxonomy ORDER BY method_id,axis,class_key',LIMITS.taxonomy,'TAXONOMY')
 },{prior_fingerprint});
}
