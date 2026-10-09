// Deterministic full-inventory atomic variation consideration: every method,
// every supplied atom + variant, two directions x two evidence boundaries.
// This is a planner, not an evaluator, target request, or evidence authenticator.
const ID=/^[A-Za-z0-9_:.-]{1,200}$/u;
const HEX=/^[a-f0-9]{64}$/u;
const DIMS=/^[A-Z][A-Z0-9_]{1,39}$/u;
const DIRECTIONS=Object.freeze(['FORWARD','BACKWARD']);
const BOUNDARIES=Object.freeze(['INTERNAL_MODEL','EXTERNAL_SOURCE']);
const VARIATIONS=new Set(['BASELINE','REMOVE','INVERT_EDGE','MASK_CHANNEL','SUBSTITUTE','RESTORE']);
const MAX_METHODS=512,MAX_ATOMS=8,MAX_VARIANTS=4;
const stop=x=>{throw Error(x)};
const assertID=(v,label)=>{if(typeof v!=='string'||!ID.test(v))stop('INVALID_'+label);return v};
const unique=(a,label)=>{if(new Set(a).size!==a.length)stop('DUPLICATE_'+label);return a};
const strings=(arr,label,limit,pattern=ID)=>{
 if(!Array.isArray(arr)||arr.length>limit||arr.some(x=>typeof x!=='string'||!pattern.test(x)))stop('INVALID_'+label);
 return unique(arr,label).sort();
};
const keyOf=o=>[o.subject_id,o.atom_id,o.variant_id,o.method_id,o.direction,o.boundary].join('|');
const makeSourceSignature=(atom,crossRef)=>[...atom.source_refs,...atom.external_source_refs.map(x=>'external:'+x),...(crossRef?.source_refs??[]).map(x=>'cross:'+x)].sort().join('|');
const supportedDirection=(state,direction)=>state===direction||['BIDIRECTIONAL','COMPARATIVE','COUNTERFACTUAL'].includes(state);
export const atomicVariationContract=Object.freeze({
 version:'MPC_ATOMIC_VARIATION_1.0',
 max_methods:MAX_METHODS,max_atoms:MAX_ATOMS,max_variants_per_request:MAX_VARIANTS,
 directions:DIRECTIONS,boundaries:BOUNDARIES,
 coverage:'ALL_METHODS_EACH_ATOM_VARIANT_DIRECTION_BOUNDARY',
 cached_meaning:'SAME_DECLARED_EVIDENCE_ALREADY_CONSIDERED_NOT_ALREADY_TESTED',
 source_authentication:false,method_execution:false,external_network_action:false,
 physical_optics:false,canonical_promotion:false
});
export function planAtomicVariations({methods,taxonomy,atoms,variations=[],prior=[],cross_reference=null}){
 if(!Array.isArray(methods)||!methods.length||methods.length>MAX_METHODS)stop('METHOD_INVENTORY_BOUNDS');
 if(!Array.isArray(taxonomy)||!taxonomy.length)stop('TAXONOMY_REQUIRED');
 if(!Array.isArray(atoms)||!atoms.length||atoms.length>MAX_ATOMS)stop('ATOM_BATCH_BOUNDS');
 if(!Array.isArray(variations)||variations.length>MAX_VARIANTS)stop('VARIATION_BOUNDS');
 if(!Array.isArray(prior)||prior.length>MAX_ATOMS*(MAX_VARIANTS+1)*MAX_METHODS*4)stop('PRIOR_RECEIPT_BOUNDS');
 const methodsById=new Map(),directionByMethod=new Map(),methodDimensions=new Map();
 for(const m of methods){
  assertID(m.method_id,'METHOD_ID');
  if(!/^MHA-[0-9]{4}$/.test(m.method_id))stop('METHOD_NAMESPACE_NOT_MHA');
  if(methodsById.has(m.method_id))stop('DUPLICATE_METHOD_ID');
  const dims=strings(m.dimensions,'METHOD_DIMENSIONS',8,DIMS);
  if(!dims.length)stop('EMPTY_METHOD_DIMENSIONS');
  methodsById.set(m.method_id,m);
  methodDimensions.set(m.method_id,new Set(dims));
 }
 for(const t of taxonomy){
  if(t.axis!=='DIRECTION')continue;
  if(!methodsById.has(t.method_id))stop('UNKNOWN_TAXONOMY_METHOD');
  if(directionByMethod.has(t.method_id))stop('DUPLICATE_METHOD_DIRECTION');
  directionByMethod.set(t.method_id,t.class_key);
 }
 if(directionByMethod.size!==methods.length)stop('INCOMPLETE_DIRECTION_TAXONOMY');
 const atomsById=new Map();
 for(const a of atoms){
  if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['id','subject_id','dimensions','source_refs','external_source_refs','evidence_digest'].includes(k)))stop('INVALID_ATOM_FIELDS');
  assertID(a.id,'ATOM_ID');assertID(a.subject_id,'SUBJECT_ID');
  if(atomsById.has(a.id))stop('DUPLICATE_ATOM_ID');
  const dims=strings(a.dimensions,'ATOM_DIMENSIONS',8,DIMS);
  if(!dims.length)stop('EMPTY_ATOM_DIMENSIONS');
  strings(a.source_refs,'ATOM_SOURCES',8);
  strings(a.external_source_refs??[],'EXTERNAL_SOURCES',8);
  if(typeof a.evidence_digest!=='string'||!HEX.test(a.evidence_digest))stop('EVIDENCE_DIGEST_REQUIRED');
  atomsById.set(a.id,{...a,dimensions:dims,source_refs:[...a.source_refs].sort(),external_source_refs:[...(a.external_source_refs??[])].sort()});
 }
 const variationMap=new Map();
 for(const v of variations){
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['id','atom_id','kind','variant_digest'].includes(k)))stop('INVALID_VARIATION_FIELDS');
  assertID(v.id,'VARIANT_ID');
  if(v.id==='BASELINE'||v.kind==='BASELINE'||!VARIATIONS.has(v.kind)||variationMap.has(v.id)||!atomsById.has(v.atom_id)||!HEX.test(v.variant_digest))stop('INVALID_VARIATION');
  variationMap.set(v.id,v);
 }
 if(cross_reference!==null){
  if(!cross_reference||typeof cross_reference!=='object'||Array.isArray(cross_reference)||Object.keys(cross_reference).some(k=>!['method_ids','source_refs','reason'].includes(k)))stop('CROSS_REFERENCE_FIELDS');
  const ids=strings(cross_reference.method_ids,'CROSSREF_METHODS',12);
  const refs=strings(cross_reference.source_refs,'CROSSREF_SOURCES',8);
  if(!ids.length||!refs.length||typeof cross_reference.reason!=='string'||!cross_reference.reason.trim()||cross_reference.reason.length>1000)stop('INVALID_CROSS_REFERENCE');
  if(ids.some(id=>!methodsById.has(id)))stop('UNKNOWN_CROSS_REFERENCE_METHOD');
 }
 const priorMap=new Map(prior.map(r=>[keyOf(r),r]));
 const counts={},perAtom=[],ledger_rows=[],examples=[];
 const sortedMethods=[...methods].sort((a,b)=>a.method_id.localeCompare(b.method_id));
 for(const atom of [...atomsById.values()].sort((a,b)=>a.id.localeCompare(b.id))){
  const atomDims=new Set(atom.dimensions),applicable=sortedMethods.filter(m=>m.dimensions.some(d=>atomDims.has(d)));
  const variants=[{id:'BASELINE',atom_id:atom.id,kind:'BASELINE',variant_digest:atom.evidence_digest},...variations.filter(v=>v.atom_id===atom.id).sort((a,b)=>a.id.localeCompare(b.id))];
  const per={subject_id:atom.subject_id,atom_id:atom.id,variant_count:variants.length,methods_considered_per_lane:methods.length,typed_trigger_matches:applicable.length,decisions:{}};
  for(const variant of variants)for(const direction of DIRECTIONS)for(const boundary of BOUNDARIES){
   for(const method of sortedMethods){
    const ckey=keyOf({subject_id:atom.subject_id,atom_id:atom.id,variant_id:variant.id,method_id:method.method_id,direction,boundary});
    const priorRow=priorMap.get(ckey);
    const matches=methodDimensions.get(method.method_id);
    const overlap=atom.dimensions.some(d=>matches.has(d));
    const sourceSignature=makeSourceSignature(atom,cross_reference);
    let decision;
    if(!overlap)decision='DIMENSION_NOT_MATCHED';
    else if(!supportedDirection(directionByMethod.get(method.method_id),direction))decision='DIRECTION_UNSUPPORTED';
    else if(!atom.source_refs.length)decision='SOURCE_UNBOUND';
    else if(boundary==='EXTERNAL_SOURCE'&&!atom.external_source_refs.length)decision='EXTERNAL_SOURCE_UNBOUND';
    else if(variant.kind!=='BASELINE'&&variant.variant_digest===atom.evidence_digest)decision='NO_MATERIAL_VARIATION';
    else decision='TRIGGERED_INPUT_REVIEW_REQUIRED';
    const repeat=!!priorRow &&
      priorRow.evidence_digest===atom.evidence_digest &&
      priorRow.variant_digest===variant.variant_digest &&
      priorRow.source_signature===sourceSignature &&
      priorRow.dimension_signature===atom.dimensions.join(',') &&
      priorRow.decision===decision;
    const cross=overlap&&cross_reference?.method_ids.includes(method.method_id)===true&&
      cross_reference.source_refs.some(s=>!atom.source_refs.includes(s)&&!atom.external_source_refs.includes(s));
    // Exact repetition is never reissued. A genuinely changed source binding can
    // reopen a method; a different verbal reason alone cannot defeat the cache.
    const assessment=repeat?'CACHED_NO_MATERIAL_DELTA':
      cross&&decision==='TRIGGERED_INPUT_REVIEW_REQUIRED'?'REOPEN_DECLARED_CROSS_REFERENCE':
      decision;
    counts[assessment]=(counts[assessment]??0)+1;
    per.decisions[assessment]=(per.decisions[assessment]??0)+1;
    if(!repeat)ledger_rows.push({subject_id:atom.subject_id,atom_id:atom.id,variant_id:variant.id,variation_kind:variant.kind,method_id:method.method_id,
      direction,boundary,evidence_digest:atom.evidence_digest,variant_digest:variant.variant_digest,source_signature:sourceSignature,
      dimension_signature:atom.dimensions.join(','),decision});
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
