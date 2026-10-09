// Type-derived, multi-axis discovery metadata for existing MHA/MHC candidates.
// Not a human semantic classifier, source authenticator or canonical registry.
import policy from '../method-atlas/reclassification-policy-v7.json' with {type:'json'};
const ID=/^MHA-[0-9]{4}$/u;
const VALID_KEY=/^[A-Z][A-Z0-9_]{1,100}$/u;
const AXES=new Set(['DISCIPLINE','PURPOSE','MODEL_KIND','DIRECTION','EVIDENCE','IMPLEMENTATION','SOURCE_REVIEW','QUANTUM_REQUIREMENT','WORKFLOW_STAGE']);
const err=s=>{throw Error(s)};
const normalize=result=>Array.isArray(result)?result:Array.isArray(result?.results)?result.results:err('TAXONOMY_DATABASE_ROWS_REQUIRED');
export function classifyAtlasMethod(method,source) {
 if(!method||typeof method!=='object'||!ID.test(method.method_id))err('INVALID_TAXONOMY_METHOD');
 const family=policy.families[method.family];
 if(!family)err('UNCLASSIFIED_METHOD_FAMILY:'+method.family);
 if(!Array.isArray(method.dimensions)||!method.dimensions.length||new Set(method.dimensions).size!==method.dimensions.length)err('INVALID_METHOD_DIMENSIONS');
 const sourceStatus=source?.review_state;
 if(!['DIRECTLY_RETRIEVED','LOCATOR_ONLY'].includes(sourceStatus)||source.source_id!==method.primary_source_id)err('TAXONOMY_SOURCE_UNRESOLVED');
 const output=new Map();
 function put(axis,key,basis){
  if(!AXES.has(axis)||typeof key!=='string'||!VALID_KEY.test(key))err('INVALID_TAXONOMY_TAG');
  const id=axis+'|'+key;
  if(!output.has(id))output.set(id,{method_id:method.method_id,axis,class_key:key,classification_basis:basis,review_state:'PROPOSED'});
 }
 put('DISCIPLINE',family.discipline,'FAMILY_DECLARED');
 put('MODEL_KIND',family.model_kind,'FAMILY_DECLARED');
 put('WORKFLOW_STAGE',family.workflow_stage,'FAMILY_DECLARED');
 put('DIRECTION',policy.method_overrides[method.method_id]?.reasoning_direction??family.reasoning_direction,policy.method_overrides[method.method_id]?.reasoning_direction?'METHOD_ID_OVERRIDE':'FAMILY_DECLARED');
 const override=policy.method_overrides[method.method_id]??{};
 put('PURPOSE',override.primary_purpose??family.primary_purpose,override.primary_purpose?'METHOD_ID_OVERRIDE':'FAMILY_DECLARED');
 for(const purpose of override.secondary_purposes??[])put('PURPOSE',purpose,'METHOD_ID_OVERRIDE');
 for(const dim of method.dimensions){
  const secondary=policy.dimension_purposes[dim],kind=policy.dimension_evidence[dim];
  if(!secondary||!kind)err('UNCLASSIFIED_TYPED_DIMENSION:'+dim);
  for(const key of secondary)put('PURPOSE',key,'DIMENSION_TYPED');
  put('EVIDENCE',kind,'DIMENSION_TYPED');
 }
 if(!['RESEARCH_HOOK','PROTOTYPE','VALIDATED_IMPLEMENTATION'].includes(method.implementation_state))err('INVALID_IMPLEMENTATION_STATUS');
 put('IMPLEMENTATION',method.implementation_state,'NATIVE_METHOD_METADATA');
 put('SOURCE_REVIEW',sourceStatus,'SOURCE_LOCATOR_METADATA');
 if(method.quantum_requirement&&method.quantum_requirement!=='NONE')put('QUANTUM_REQUIREMENT',method.quantum_requirement,'NATIVE_METHOD_METADATA');
 return [...output.values()].sort((a,b)=>a.axis.localeCompare(b.axis)||a.class_key.localeCompare(b.class_key));
}
export function compileAtlasTaxonomy(methods,sources){
 if(!Array.isArray(methods)||!Array.isArray(sources))err('TAXONOMY_ARRAYS_REQUIRED');
 const bySource=new Map(sources.map(s=>[s.source_id,s]));
 if(bySource.size!==sources.length)err('DUPLICATE_TAXONOMY_SOURCE');
 const seen=new Set(),results=[];
 for(const method of methods){
  if(seen.has(method.method_id))err('DUPLICATE_TAXONOMY_METHOD');seen.add(method.method_id);
  results.push(...classifyAtlasMethod(method,bySource.get(method.primary_source_id)));
 }
 return {taxonomy_version:policy.version,method_count:seen.size,tag_count:results.length,tags:results,
  classification_review_state:'PROPOSED',source_authentication:false,method_execution_performed:false,
  canonical_promotion:false,automatic_target_action:false};
}
export function taxonomyPurposeKeys(){
 const x=new Set();
 for(const f of Object.values(policy.families))x.add(f.primary_purpose);
 for(const keys of Object.values(policy.dimension_purposes))for(const p of keys)x.add(p);
 for(const o of Object.values(policy.method_overrides)){
  if(o.primary_purpose)x.add(o.primary_purpose);
  for(const p of o.secondary_purposes??[])x.add(p);
 }
 return [...x].sort();
}
export async function queryMethodTaxonomy(db,input){
 if(!db||typeof db.prepare!=='function')err('TAXONOMY_DB_REQUIRED');
 if(!input||typeof input!=='object'||Array.isArray(input))err('TAXONOMY_QUERY_REQUIRED');
 const allowed=['method_ids','axis','class_key','limit'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))err('UNKNOWN_TAXONOMY_QUERY_FIELD');
 const ids=input.method_ids??[],axis=input.axis,classKey=input.class_key,limit=input.limit??12;
 if(!Array.isArray(ids)||ids.length>12||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'||!ID.test(x)))err('INVALID_TAXONOMY_IDS');
 if(axis!==undefined&&!AXES.has(axis))err('UNKNOWN_TAXONOMY_AXIS');
 if(classKey!==undefined&&(!axis||typeof classKey!=='string'||!VALID_KEY.test(classKey)))err('INVALID_TAXONOMY_CLASS_FILTER');
 if(!ids.length&&axis===undefined)err('TAXONOMY_QUERY_NEEDS_FILTER');
 if(!Number.isInteger(limit)||limit<1||limit>24)err('TAXONOMY_QUERY_LIMIT');
 const cond=[],args=[];
 if(ids.length){cond.push('method_id IN ('+ids.map(()=>'?').join(',')+')');args.push(...ids)}
 if(axis){cond.push('axis=?');args.push(axis)}
 if(classKey){cond.push('class_key=?');args.push(classKey)}
 const query='SELECT method_id,axis,class_key,classification_basis,review_state FROM atlas_method_taxonomy WHERE '+cond.join(' AND ')+' ORDER BY method_id,axis,class_key LIMIT '+limit;
 const result=normalize(await db.prepare(query).bind(...args).all());
 return {status:'PROPOSED_TYPED_TAXONOMY_ROWS',taxonomy_version:policy.version,
  tags:result,limit,source_authentication:false,canonical_promotion:false,no_method_executed:true};
}
