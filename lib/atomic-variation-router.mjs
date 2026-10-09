// Deterministic full-inventory atomic variation consideration: every method,
// every supplied atom + variant, two directions x two evidence boundaries.
// This is a planner, not an evaluator, target request, or evidence authenticator.
import {createHash} from 'node:crypto';
const ID=/^[A-Za-z0-9_:.-]{1,200}$/u;
const HEX=/^[a-f0-9]{64}$/u;
const DIMS=/^[A-Z][A-Z0-9_]{1,39}$/u;
const DIRECTIONS=Object.freeze(['FORWARD','BACKWARD']);
const BOUNDARIES=Object.freeze(['INTERNAL_MODEL','EXTERNAL_SOURCE']);
const VARIATIONS=new Set(['BASELINE','REMOVE','INVERT_EDGE','MASK_CHANNEL','SUBSTITUTE','RESTORE']);
const MAX_METHODS=512,MAX_ATOMS=8,MAX_VARIANTS=4;
const MAX_TAXONOMY_ROWS=MAX_METHODS*64,MAX_METHOD_STATE_BYTES=32768;
const TAXONOMY_AXES=new Set(['DISCIPLINE','PURPOSE','MODEL_KIND','DIRECTION','EVIDENCE','IMPLEMENTATION','SOURCE_REVIEW','QUANTUM_REQUIREMENT','WORKFLOW_STAGE']);
const METHOD_DIRECTIONS=new Set(['FORWARD','REVERSE','BIDIRECTIONAL','COMPARATIVE','COUNTERFACTUAL']);
const DECISIONS=new Set(['DIMENSION_NOT_MATCHED','DIRECTION_UNSUPPORTED','SOURCE_UNBOUND','EXTERNAL_SOURCE_UNBOUND','TRIGGERED_INPUT_REVIEW_REQUIRED','NO_MATERIAL_VARIATION']);
const SOURCE_SIGNATURE_PREFIX='SOURCE_BINDINGS_V2:';
const METHOD_SIGNATURE=/^METHOD_STATE_V2:[a-f0-9]{64}$/u;
const stop=x=>{throw Error(x)};
const assertID=(v,label)=>{if(typeof v!=='string'||!ID.test(v))stop('INVALID_'+label);return v};
const unique=(a,label)=>{if(new Set(a).size!==a.length)stop('DUPLICATE_'+label);return a};
const bounded=(arr,min,max,error)=>{
 if(!Array.isArray(arr)||arr.length<min||arr.length>max)stop(error);
 for(let i=0;i<arr.length;i++)if(!Object.hasOwn(arr,i))stop(error);
 return arr;
};
const strings=(arr,label,limit,pattern=ID)=>{
 bounded(arr,0,limit,'INVALID_'+label);
 if(arr.some(x=>typeof x!=='string'||!pattern.test(x)))stop('INVALID_'+label);
 return unique([...arr],label).sort();
};
export const atomicVariationIdentityFields=Object.freeze(['subject_id','atom_id','variant_id','variation_kind','method_id','direction','boundary','evidence_digest','variant_digest','source_signature','dimension_signature','method_signature']);
const keyOf=o=>JSON.stringify(atomicVariationIdentityFields.map(field=>o[field]));
const makeSourceSignature=(atom,crossRef,methodId)=>SOURCE_SIGNATURE_PREFIX+JSON.stringify([
 atom.source_refs,atom.external_source_refs,
 crossRef?.method_ids.includes(methodId)?crossRef.source_refs.filter(x=>!atom.source_refs.includes(x)&&!atom.external_source_refs.includes(x)):[]
]);
const supportedDirection=(state,direction)=>(direction==='BACKWARD'?state==='REVERSE':state==='FORWARD')||['BIDIRECTIONAL','COMPARATIVE','COUNTERFACTUAL'].includes(state);
const compare=(a,b)=>a<b?-1:a>b?1:0;
function methodSignature(method,tags){
 let nodes=0;
 const canonical=(value,depth=0)=>{
  if(++nodes>4096||depth>8)stop('METHOD_STATE_BOUNDS');
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='string'){if(value.length>MAX_METHOD_STATE_BYTES)stop('METHOD_STATE_BOUNDS');return value}
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(Array.isArray(value))return bounded(value,0,4096,'METHOD_STATE_BOUNDS').map(x=>canonical(x,depth+1));
  if(value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))){
   const keys=Object.keys(value).sort();
   if(keys.length>4096)stop('METHOD_STATE_BOUNDS');
   return Object.fromEntries(keys.map(key=>[key,canonical(value[key],depth+1)]));
  }
  stop('INVALID_METHOD_STATE');
 };
 const sortedTags=[...tags].sort((a,b)=>compare(a.axis,b.axis)||compare(a.class_key,b.class_key));
 const text=JSON.stringify(canonical({method,taxonomy:sortedTags}));
 if(text.length>MAX_METHOD_STATE_BYTES||new TextEncoder().encode(text).length>MAX_METHOD_STATE_BYTES)stop('METHOD_STATE_BOUNDS');
 return 'METHOD_STATE_V2:'+createHash('sha256').update(text).digest('hex');
}
function priorRowsByIdentity(prior){
 const result=new Map(),checkedSources=new Set();
 const allowed=new Set([...atomicVariationIdentityFields,'decision','recorded_at']);
 for(const row of prior){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!allowed.has(k)))stop('INVALID_PRIOR_FIELDS');
  for(const name of ['subject_id','atom_id','variant_id','method_id'])assertID(row[name],'PRIOR_'+name.toUpperCase());
  if(!/^MHA-[0-9]{4}$/u.test(row.method_id)||!VARIATIONS.has(row.variation_kind)||!DIRECTIONS.includes(row.direction)||!BOUNDARIES.includes(row.boundary)||!DECISIONS.has(row.decision))stop('INVALID_PRIOR_STATE');
  if((row.variant_id==='BASELINE')!==(row.variation_kind==='BASELINE'))stop('INVALID_PRIOR_VARIATION');
  for(const name of ['evidence_digest','variant_digest'])if(typeof row[name]!=='string'||!HEX.test(row[name]))stop('INVALID_PRIOR_DIGEST');
  if(row.variation_kind==='BASELINE'&&row.variant_digest!==row.evidence_digest)stop('INVALID_PRIOR_VARIATION');
  if(typeof row.method_signature!=='string'||!METHOD_SIGNATURE.test(row.method_signature)||typeof row.source_signature!=='string'||!row.source_signature.startsWith(SOURCE_SIGNATURE_PREFIX))stop('PRIOR_IDENTITY_VERSION_UNSUPPORTED');
  if(row.source_signature.length>5000)stop('INVALID_PRIOR_SOURCE_SIGNATURE');
  if(!checkedSources.has(row.source_signature)){
   let roles;
   try{roles=JSON.parse(row.source_signature.slice(SOURCE_SIGNATURE_PREFIX.length))}catch{stop('INVALID_PRIOR_SOURCE_SIGNATURE')}
   bounded(roles,3,3,'INVALID_PRIOR_SOURCE_SIGNATURE');
   const normalized=roles.map(role=>strings(role,'PRIOR_SOURCE_IDS',8));
   if(normalized[2].some(id=>normalized[0].includes(id)||normalized[1].includes(id))||SOURCE_SIGNATURE_PREFIX+JSON.stringify(normalized)!==row.source_signature)stop('INVALID_PRIOR_SOURCE_SIGNATURE');
   checkedSources.add(row.source_signature);
  }
  if(typeof row.dimension_signature!=='string'||!row.dimension_signature.length||row.dimension_signature.length>8*40+7)stop('INVALID_PRIOR_DIMENSION_SIGNATURE');
  if(strings(row.dimension_signature.split(','),'PRIOR_DIMENSIONS',8,DIMS).join(',')!==row.dimension_signature)stop('INVALID_PRIOR_DIMENSION_SIGNATURE');
  if(Object.hasOwn(row,'recorded_at')&&(typeof row.recorded_at!=='string'||row.recorded_at.length>64))stop('INVALID_PRIOR_TIMESTAMP');
  const key=keyOf(row),existing=result.get(key);
  if(existing&&existing.decision!==row.decision)stop('CONFLICTING_PRIOR_DECISION');
  result.set(key,row);
 }
 return result;
}
export const atomicVariationContract=Object.freeze({
 version:'MPC_ATOMIC_VARIATION_1.1',
 max_methods:MAX_METHODS,max_atoms:MAX_ATOMS,max_variants_per_request:MAX_VARIANTS,
 max_taxonomy_rows:MAX_TAXONOMY_ROWS,max_method_state_bytes:MAX_METHOD_STATE_BYTES,
 directions:DIRECTIONS,boundaries:BOUNDARIES,
 coverage:'ALL_METHODS_EACH_ATOM_VARIANT_DIRECTION_BOUNDARY',
 cached_meaning:'SAME_DECLARED_EVIDENCE_ALREADY_CONSIDERED_NOT_ALREADY_TESTED',
 source_authentication:false,method_execution:false,external_network_action:false,
 physical_optics:false,canonical_promotion:false
});
export function planAtomicVariations(input){
 if(!input||typeof input!=='object'||Array.isArray(input))stop('VARIATION_INPUT_REQUIRED');
 if(Object.keys(input).some(k=>!['methods','taxonomy','atoms','variations','prior','cross_reference'].includes(k)))stop('UNKNOWN_VARIATION_INPUT');
 const {methods,taxonomy,atoms}=input;
 const variations=Object.hasOwn(input,'variations')?input.variations:[];
 const prior=Object.hasOwn(input,'prior')?input.prior:[];
 const cross_reference=Object.hasOwn(input,'cross_reference')?input.cross_reference:null;
 bounded(methods,1,MAX_METHODS,'METHOD_INVENTORY_BOUNDS');
 bounded(taxonomy,1,MAX_TAXONOMY_ROWS,'TAXONOMY_REQUIRED');
 bounded(atoms,1,MAX_ATOMS,'ATOM_BATCH_BOUNDS');
 bounded(variations,0,MAX_VARIANTS,'VARIATION_BOUNDS');
 bounded(prior,0,MAX_ATOMS*(MAX_VARIANTS+1)*MAX_METHODS*4,'PRIOR_RECEIPT_BOUNDS');
 const methodsById=new Map(),directionByMethod=new Map(),methodDimensions=new Map(),taxonomyByMethod=new Map(),methodSignatures=new Map();
 for(const m of methods){
  if(!m||typeof m!=='object'||Array.isArray(m))stop('INVALID_METHOD_FIELDS');
  assertID(m.method_id,'METHOD_ID');
  if(!/^MHA-[0-9]{4}$/.test(m.method_id))stop('METHOD_NAMESPACE_NOT_MHA');
  if(methodsById.has(m.method_id))stop('DUPLICATE_METHOD_ID');
  const dims=strings(m.dimensions,'METHOD_DIMENSIONS',8,DIMS);
  if(!dims.length)stop('EMPTY_METHOD_DIMENSIONS');
  methodsById.set(m.method_id,m);
  methodDimensions.set(m.method_id,new Set(dims));
  taxonomyByMethod.set(m.method_id,[]);
 }
 const seenTags=new Set();
 for(const t of taxonomy){
  if(!t||typeof t!=='object'||Array.isArray(t)||!TAXONOMY_AXES.has(t.axis)||typeof t.class_key!=='string'||!/^[A-Z][A-Z0-9_]{1,100}$/u.test(t.class_key))stop('INVALID_METHOD_TAXONOMY');
  assertID(t.method_id,'TAXONOMY_METHOD_ID');
  if(!methodsById.has(t.method_id))stop('UNKNOWN_TAXONOMY_METHOD');
  const tagKey=JSON.stringify([t.method_id,t.axis,t.class_key]);
  if(seenTags.has(tagKey))stop('DUPLICATE_METHOD_TAXONOMY');
  seenTags.add(tagKey);taxonomyByMethod.get(t.method_id).push(t);
  if(t.axis!=='DIRECTION')continue;
  if(directionByMethod.has(t.method_id))stop('DUPLICATE_METHOD_DIRECTION');
  if(!METHOD_DIRECTIONS.has(t.class_key))stop('INVALID_METHOD_DIRECTION');
  directionByMethod.set(t.method_id,t.class_key);
 }
 if(directionByMethod.size!==methods.length)stop('INCOMPLETE_DIRECTION_TAXONOMY');
 for(const method of methods)methodSignatures.set(method.method_id,methodSignature(method,taxonomyByMethod.get(method.method_id)));
 const atomsById=new Map();
 for(const a of atoms){
  if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['id','subject_id','dimensions','source_refs','external_source_refs','evidence_digest'].includes(k)))stop('INVALID_ATOM_FIELDS');
  assertID(a.id,'ATOM_ID');assertID(a.subject_id,'SUBJECT_ID');
  if(atomsById.has(a.id))stop('DUPLICATE_ATOM_ID');
  const dims=strings(a.dimensions,'ATOM_DIMENSIONS',8,DIMS);
  if(!dims.length)stop('EMPTY_ATOM_DIMENSIONS');
  const source_refs=strings(a.source_refs,'ATOM_SOURCES',8);
  const external_source_refs=strings(Object.hasOwn(a,'external_source_refs')?a.external_source_refs:[],'EXTERNAL_SOURCES',8);
  if(typeof a.evidence_digest!=='string'||!HEX.test(a.evidence_digest))stop('EVIDENCE_DIGEST_REQUIRED');
  atomsById.set(a.id,{...a,dimensions:dims,source_refs,external_source_refs});
 }
 const variationMap=new Map();
 for(const v of variations){
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['id','atom_id','kind','variant_digest'].includes(k)))stop('INVALID_VARIATION_FIELDS');
  assertID(v.id,'VARIANT_ID');
  assertID(v.atom_id,'VARIATION_ATOM_ID');
  if(v.id==='BASELINE'||v.kind==='BASELINE'||!VARIATIONS.has(v.kind)||variationMap.has(v.id)||!atomsById.has(v.atom_id)||typeof v.variant_digest!=='string'||!HEX.test(v.variant_digest))stop('INVALID_VARIATION');
  variationMap.set(v.id,v);
 }
 let crossRef=null;
 if(cross_reference!==null){
  if(!cross_reference||typeof cross_reference!=='object'||Array.isArray(cross_reference)||Object.keys(cross_reference).some(k=>!['method_ids','source_refs','reason'].includes(k)))stop('CROSS_REFERENCE_FIELDS');
  const ids=strings(cross_reference.method_ids,'CROSSREF_METHODS',12);
  const refs=strings(cross_reference.source_refs,'CROSSREF_SOURCES',8);
  if(!ids.length||!refs.length||typeof cross_reference.reason!=='string'||!cross_reference.reason.trim()||cross_reference.reason.length>1000)stop('INVALID_CROSS_REFERENCE');
  if(ids.some(id=>!methodsById.has(id)))stop('UNKNOWN_CROSS_REFERENCE_METHOD');
  crossRef={...cross_reference,method_ids:ids,source_refs:refs};
 }
 const priorMap=priorRowsByIdentity(prior);
 const counts={},perAtom=[],ledger_rows=[],examples=[];
 const sortedMethods=[...methods].sort((a,b)=>a.method_id.localeCompare(b.method_id));
 for(const atom of [...atomsById.values()].sort((a,b)=>a.id.localeCompare(b.id))){
  const atomDims=new Set(atom.dimensions),applicable=sortedMethods.filter(m=>m.dimensions.some(d=>atomDims.has(d)));
  const variants=[{id:'BASELINE',atom_id:atom.id,kind:'BASELINE',variant_digest:atom.evidence_digest},...variations.filter(v=>v.atom_id===atom.id).sort((a,b)=>a.id.localeCompare(b.id))];
  const per={subject_id:atom.subject_id,atom_id:atom.id,variant_count:variants.length,methods_considered_per_lane:methods.length,typed_trigger_matches:applicable.length,decisions:{}};
  for(const variant of variants)for(const direction of DIRECTIONS)for(const boundary of BOUNDARIES){
   for(const method of sortedMethods){
    const sourceSignature=makeSourceSignature(atom,crossRef,method.method_id);
    const identity={subject_id:atom.subject_id,atom_id:atom.id,variant_id:variant.id,variation_kind:variant.kind,method_id:method.method_id,direction,boundary,evidence_digest:atom.evidence_digest,variant_digest:variant.variant_digest,source_signature:sourceSignature,dimension_signature:atom.dimensions.join(','),method_signature:methodSignatures.get(method.method_id)};
    const priorRow=priorMap.get(keyOf(identity));
    const matches=methodDimensions.get(method.method_id);
    const overlap=atom.dimensions.some(d=>matches.has(d));
    let decision;
    if(!overlap)decision='DIMENSION_NOT_MATCHED';
    else if(!supportedDirection(directionByMethod.get(method.method_id),direction))decision='DIRECTION_UNSUPPORTED';
    else if(!atom.source_refs.length)decision='SOURCE_UNBOUND';
    else if(boundary==='EXTERNAL_SOURCE'&&!atom.external_source_refs.length)decision='EXTERNAL_SOURCE_UNBOUND';
    else if(variant.kind!=='BASELINE'&&variant.variant_digest===atom.evidence_digest)decision='NO_MATERIAL_VARIATION';
    else decision='TRIGGERED_INPUT_REVIEW_REQUIRED';
    if(priorRow&&priorRow.decision!==decision)stop('CONFLICTING_PRIOR_DECISION');
    const repeat=!!priorRow;
    const cross=overlap&&crossRef?.method_ids.includes(method.method_id)===true&&
      crossRef.source_refs.some(s=>!atom.source_refs.includes(s)&&!atom.external_source_refs.includes(s));
    // Exact repetition is never reissued. A genuinely changed source binding can
    // reopen a method; a different verbal reason alone cannot defeat the cache.
    const assessment=repeat?'CACHED_NO_MATERIAL_DELTA':
      cross&&decision==='TRIGGERED_INPUT_REVIEW_REQUIRED'?'REOPEN_DECLARED_CROSS_REFERENCE':
      decision;
    counts[assessment]=(counts[assessment]??0)+1;
    per.decisions[assessment]=(per.decisions[assessment]??0)+1;
    if(!repeat)ledger_rows.push({...identity,decision});
    if(examples.length<12&&['TRIGGERED_INPUT_REVIEW_REQUIRED','REOPEN_DECLARED_CROSS_REFERENCE'].includes(assessment))
      examples.push({atom_id:atom.id,variant_id:variant.id,method_id:method.method_id,direction,boundary,decision:assessment});
   }
  }
  perAtom.push(per);
 }
 const considered=Object.values(counts).reduce((a,b)=>a+b,0);
 const expected=sortedMethods.length*DIRECTIONS.length*BOUNDARIES.length*atoms.reduce((sum,a)=>sum+1+variations.filter(v=>v.atom_id===a.id).length,0);
 if(considered!==expected)stop('COVERAGE_ACCOUNTING_INCOMPLETE');
 return {kind:'ATOMIC_VARIATION_CONSIDERATION_PLAN',version:atomicVariationContract.version,
  methods_total:methods.length,atoms_total:atoms.length,variations_total:variations.length,directions:DIRECTIONS,boundaries:BOUNDARIES,
  slots_considered:considered,expected_slots:expected,complete_consideration:considered===expected,
  decision_counts:counts,per_atom:perAtom,examples,
  ledger_rows,ledger_new_or_changed:ledger_rows.length,
  source_authentication:false,actual_method_execution:false,external_network_actions:false,
  variation_executed:false,canonical_promotion:false,
  next_action:'Resolve selected source-bound requirements, then run only verified bounded methods independently; reuse exact prior source/variation decisions unless evidence or cross-reference source changes.'};
}
