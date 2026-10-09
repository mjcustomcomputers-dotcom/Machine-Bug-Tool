// Read-only, evidence-state-aware router for the additive SQLite/D1 Method Atlas.
// No canonical MPC registry mutation, automatic evaluator, network action, or source authentication.
import {taxonomyPurposeKeys} from './method-reclassification.mjs';
const VALID_DIMENSION = /^[A-Z][A-Z0-9_]{1,39}$/u;
const VALID_ID = /^[A-Za-z0-9_:.\-]{1,200}$/u;
const STAGES = Object.freeze([
  ['QUICK_SOLID_STATE','Account for exact native object and declared state before any decomposition.'],
  ['INDUCTION','Compare observed transitions with declared invariant; unobserved transitions stay unknown.'],
  ['REDUCTION','Reduce to the smallest source-owned distinguishing question and unresolved dependency.'],
  ['TRAVERSAL','Traverse owner, authority, prerequisite, and temporal edges without inventing them.'],
  ['TRANSFORMATION','Specify one bounded counterfactual swap or ablation; only supplied model variants may run.'],
  ['SYNCHRONICITY','Align clock domains, event versions, channels, and delayed reconciliation before deciding impact.'],
  ['VERIFICATION','Preserve expected vs actual, strongest benign explanation, disconfirmation and exact next check.']
]);
function fail(message){throw Error(message)}
function keys(value){if(!Array.isArray(value)||value.length>8||new Set(value).size!==value.length||value.some(x=>typeof x!=='string'||!VALID_ID.test(x)))fail('INVALID_SOURCE_OR_SUBJECT_IDS');return value}
function dimensions(value){
 if(!Array.isArray(value)||!value.length||value.length>8||new Set(value).size!==value.length||value.some(x=>typeof x!=='string'||!VALID_DIMENSION.test(x)))fail('INVALID_TYPED_DIMENSIONS');
 return [...value].sort();
}
function normalizeResult(result){if(Array.isArray(result))return result;if(result&&Array.isArray(result.results))return result.results;fail('DATABASE_RESULT_NOT_ROWS')}
export const methodAtlasRouteContract=Object.freeze({
 version:'METHOD-ATLAS-ROUTER-1.0',max_dimensions:8,max_candidates:12,
 accepted_input:'Typed dimension labels, exact source and subject identifiers, optional BUSINESS/GAMING/GENERAL domain and typed purpose',
 ranking:'SOURCE_BOUND_TRIGGER_WEIGHT_AND_DIMENSION_COVERAGE_HEURISTIC',
 source_authentication:false,automatic_execution:false,authorization_determined:false,
 existing_registry_mutation:false,global_optimum_proven:false
});
export async function routeMethodAtlas(db,input){
 if(!db||typeof db.prepare!=='function')fail('DATABASE_ADAPTER_REQUIRED');
 if(!input||typeof input!=='object'||Array.isArray(input))fail('TYPED_QUERY_REQUIRED');
 const allowed=new Set(['dimensions','source_refs','subject_ids','domain_profile','max_candidates','purpose']);
 if(Object.keys(input).some(k=>!allowed.has(k)))fail('UNKNOWN_ROUTER_FIELD');
 const dims=dimensions(input.dimensions),sourceRefs=keys(input.source_refs??[]),subjectIds=keys(input.subject_ids??[]);
 const profile=input.domain_profile??'GENERAL';
 if(!['GENERAL','BUSINESS','GAMING'].includes(profile))fail('INVALID_DOMAIN_PROFILE');
 const max=input.max_candidates??8;
 if(!Number.isInteger(max)||max<1||max>12)fail('INVALID_CANDIDATE_LIMIT');
 const purpose=input.purpose??null;
 if(purpose!==null&&!taxonomyPurposeKeys().includes(purpose))fail('UNKNOWN_ROUTING_PURPOSE');
 // Data shape is fixed. SQL placeholders bind only the caller's validated dimension labels.
 const sql=`SELECT m.method_id,m.method_name,m.family,m.mechanism,m.required_input,m.falsifier,
 m.primary_source_id,m.implementation_state,m.quantum_requirement,m.provenance_state,
 COUNT(DISTINCT t.dimension) AS matching_dimensions,SUM(t.trigger_strength) AS trigger_weight
 FROM atlas_methods AS m JOIN atlas_triggers AS t ON m.method_id=t.method_id
 WHERE t.dimension IN (${dims.map(()=>'?').join(',')})
 GROUP BY m.method_id
 ORDER BY matching_dimensions DESC,trigger_weight DESC,m.method_id ASC LIMIT 513`;
 const raw=normalizeResult(await db.prepare(sql).bind(...dims).all());
 if(raw.length>512)fail('METHOD_CANDIDATE_BUDGET_EXCEEDED_NO_SILENT_TRUNCATION');
 const matchedPurpose=purpose===null?null:new Set(normalizeResult(await db.prepare(
  "SELECT method_id FROM atlas_method_taxonomy WHERE axis='PURPOSE' AND class_key=? ORDER BY method_id"
 ).bind(purpose).all()).map(x=>x.method_id));
 const admissible=sourceRefs.length>0&&subjectIds.length>0;
 const candidateOrder=[...raw].sort((a,b)=>{
  const preferred=(x)=>{
   if(profile==='GAMING')return x.family.startsWith('GAMING_')?2:0;
   return x.family.startsWith('GAMING_')?-2:x.family.startsWith('QUANTUM_')?-1:0;
  };
  return b.matching_dimensions-a.matching_dimensions||preferred(b)-preferred(a)||b.trigger_weight-a.trigger_weight||a.method_id.localeCompare(b.method_id);
 });
 const gamingCap=profile==='GAMING'||dims.includes('GAME')?max:Math.min(2,max);
 const quantumCap=dims.includes('QUANTUM')||dims.includes('QUANTUM_INSPIRED')?max:Math.min(1,max);
 let games=0,quantum=0;
 const selected=[],deferred=[];
 for(const m of candidateOrder){
  const game=m.family.startsWith('GAMING_'),q=m.family.startsWith('QUANTUM_');
  let reason=null;
  if(!admissible)reason='MISSING_SOURCE_OR_SUBJECT_BINDING';
  else if(matchedPurpose!==null&&!matchedPurpose.has(m.method_id))reason='PURPOSE_CLASS_MISMATCH';
  else if(selected.length>=max)reason='CANDIDATE_BUDGET';
  else if(game&&games>=gamingCap)reason='DOMAIN_FAMILY_CAP';
  else if(q&&quantum>=quantumCap)reason='DOMAIN_FAMILY_CAP';
  if(reason)deferred.push({method_id:m.method_id,family:m.family,reason});
  else{selected.push({...m,route_state:'STRUCTURAL_CANDIDATE',source_authenticated:false,execution_performed:false});if(game)games++;if(q)quantum++;}
 }
 const selectedIds=selected.map(m=>m.method_id);
 let classifiers=[],crosswalk=[],methodTaxonomy=[];
 if(selectedIds.length){
  const q=selectedIds.map(()=>'?').join(',');
  classifiers=normalizeResult(await db.prepare(`SELECT classifier_id,method_id,question,missing_evidence,falsifier,classifier_state FROM atlas_classifiers WHERE method_id IN (${q}) ORDER BY classifier_id`).bind(...selectedIds).all());
  crosswalk=normalizeResult(await db.prepare(`SELECT method_id,parent_namespace,parent_native_id,link_status,basis FROM atlas_crosswalk WHERE method_id IN (${q}) ORDER BY method_id,parent_namespace,parent_native_id`).bind(...selectedIds).all());
  methodTaxonomy=normalizeResult(await db.prepare(`SELECT method_id,axis,class_key,classification_basis,review_state FROM atlas_method_taxonomy WHERE method_id IN (${q}) ORDER BY method_id,axis,class_key`).bind(...selectedIds).all());
 }
 const checklist=STAGES.map(([stage,purpose],i)=>({order:i+1,stage,purpose,state:'PLANNED_NOT_EXECUTED',source_refs:sourceRefs,subject_ids:subjectIds,stop_on_missing_evidence:true}));
 return {
  status:admissible?'ATLAS_STRUCTURAL_CANDIDATES':'BLOCKED_MISSING_TYPED_BINDINGS',
  atlas_version:'METHOD-ATLAS-SQLITE-1.0',router_contract:methodAtlasRouteContract,
  dimensions:dims,domain_profile:profile,purpose_filter:purpose,source_refs:sourceRefs,subject_ids:subjectIds,
  total_trigger_matches:raw.length,selected_count:selected.length,deferred_count:deferred.length,
  selected_methods:selected,classifier_questions:classifiers,method_taxonomy:methodTaxonomy,
  taxonomy_review_state:'PROPOSED_NOT_SOURCE_AUTHENTICATED',
  proposed_canonical_crosswalk:crosswalk,deferred_methods:deferred,
  solid_state_checklist:checklist,
  no_method_executed:true,source_authentication:false,authorization_determined:false,
  target_traffic:false,canonical_promotion:false,global_optimum_proven:false,
  next_action:admissible?'Resolve the selected method input requirements against native evidence, run the first supported bounded synthetic or approved check, retain the falsifier.':'Supply exact source_refs and subject_ids. Do not interpret catalog keyword matches as evidence.'
 };
}
