// Lightweight deterministic "solid-state" method detector: typed atoms -> bitset ->
// indexed candidate retrieval -> explicit cross-method review graph.
// No natural-language inference, target traffic, source authentication, or method execution.
import {routeMethodAtlas} from './method-atlas-router.mjs';

const MAX_ATOMS=32;
const ATOM_ID=/^[A-Za-z0-9_:.\-]{1,200}$/u;
const VALID_DIMENSION=/^[A-Z][A-Z0-9_]{1,39}$/u;
// Read-only MPC coordinate -> single typed trigger. These are hints, not source
// facts or equivalences between canonical classifier namespaces.
const COORDINATE_SIGNAL=Object.freeze({
 'OBJECT':'IDENTITY','ACTOR':'AUTHORITY','CAPACITY':'AUTHORITY','AUTHORITY':'AUTHORITY',
 'INPUT':'STATE','TRANSFORMATION':'STATE','OUTPUT':'STATE','RECIPIENT':'IDENTITY',
 'CHANNEL':'INTERFACE','ACCESS/POWER':'AUTHORITY','DECISION STANDARD':'VERIFICATION',
 'PROCESS':'STATE','TIME':'TIME','LOCATION/JURISDICTION':'COMPARISON',
 'DATA GOVERNANCE':'INFORMATION','ASSENT/CONTRACT':'AUTHORITY',
 'MONEY/INCENTIVE':'MONEY','FINALITY/CAUSATION':'FINALITY',
 'COMPARATOR':'COMPARISON','ADVERSE/FALSIFIER':'VERIFICATION',
 'RECORD/CUSTODIAN':'VERIFICATION','VERSION':'VERSION',
 'EVIDENTIARY WEIGHT':'UNCERTAINTY','REMEDY':'VERIFICATION',
 'SEARCH/COMPLETION STATE.':'STATE'
});
const JACKET_AXES=new Set(['LITERAL','OWNER_ATTRIBUTION','AUTHENTICATION','ACTOR_CAPACITY','PROCEDURAL_FUNCTION','AUTHORITY','ELECTION_WAIVER','CORROBORATION','CONDITIONAL_OPERATION','ADOPTION','IMPLEMENTATION','FINALITY','TEMPORAL_VERSION','ADVERSE_FALSIFIER']);
const STATES=new Set(['OBSERVED','DERIVED','INFERRED','UNKNOWN','SYNTHETIC']);
const allowed=new Set(['id','subject_id','dimension','coordinate','jacket_axis','source_refs','epistemic_state','depends_on','observed_at','clock_domain']);
const failure=m=>{throw Error(m)};
function validateAtom(atom){
 if(!atom||typeof atom!=='object'||Array.isArray(atom))failure('ATOM_REQUIRED');
 if(Object.keys(atom).some(k=>!allowed.has(k)))failure('UNKNOWN_ATOM_FIELD');
 if(!ATOM_ID.test(atom.id)||!ATOM_ID.test(atom.subject_id)||!STATES.has(atom.epistemic_state))failure('INVALID_ATOM_ID_TYPE_OR_STATE');
 if(atom.dimension!==undefined&&!VALID_DIMENSION.test(atom.dimension))failure('INVALID_ATOM_DIMENSION');
 if(atom.coordinate!==undefined&&!Object.hasOwn(COORDINATE_SIGNAL,atom.coordinate))failure('UNKNOWN_MPC_COORDINATE');
 if(atom.dimension===undefined&&atom.coordinate===undefined)failure('DIMENSION_OR_MPC_COORDINATE_REQUIRED');
 if(atom.jacket_axis!==undefined&&!JACKET_AXES.has(atom.jacket_axis))failure('INVALID_JACKET_AXIS');
 for(const [name,list,max] of [['source_refs',atom.source_refs,8],['depends_on',atom.depends_on,16]]){
  if(!Array.isArray(list)||list.length>max||new Set(list).size!==list.length||list.some(x=>!ATOM_ID.test(x)))failure('INVALID_ATOM_'+name.toUpperCase());
 }
 if(atom.observed_at!==undefined){
  if(typeof atom.observed_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(atom.observed_at)||Number.isNaN(Date.parse(atom.observed_at)))failure('INVALID_OBSERVED_TIMESTAMP');
  if(!ATOM_ID.test(atom.clock_domain))failure('CLOCK_DOMAIN_REQUIRED');
 }else if(atom.clock_domain!==undefined&&!ATOM_ID.test(atom.clock_domain))failure('INVALID_CLOCK_DOMAIN');
}
function analyzeGraph(atoms){
 const byId=new Map(atoms.map(a=>[a.id,a]));
 const indeg=new Map(atoms.map(a=>[a.id,a.depends_on.length]));
 const next=new Map(atoms.map(a=>[a.id,[]]));
 for(const a of atoms)for(const dep of a.depends_on){
  if(!byId.has(dep))failure('UNRESOLVED_ATOM_DEPENDENCY:'+dep);
  next.get(dep).push(a.id);
 }
 const queue=atoms.filter(a=>indeg.get(a.id)===0).map(a=>a.id).sort();
 const visited=[];
 while(queue.length){
  const id=queue.shift();visited.push(id);
  for(const child of next.get(id).sort()){
   indeg.set(child,indeg.get(child)-1);
   if(indeg.get(child)===0){queue.push(child);queue.sort()}
  }
 }
 const cycle=visited.length!==atoms.length;
 // Independent depth-first color walk cross-checks the Kahn frontier result.
 // This checks graph computation consistency, NOT independent evidence or factual truth.
 const color=new Map(atoms.map(a=>[a.id,0]));
 let dfsCycle=false;
 function walk(id){
  if(color.get(id)===1){dfsCycle=true;return}
  if(color.get(id)===2)return;
  color.set(id,1);
  for(const dependency of byId.get(id).depends_on)walk(dependency);
  color.set(id,2);
 }
 for(const id of [...byId.keys()].sort())if(color.get(id)===0)walk(id);
 if(cycle!==dfsCycle)failure('INTERNAL_CYCLE_CHECK_DISAGREEMENT');
 const misordered=[],unalignable=[];
 for(const a of atoms)for(const depId of a.depends_on){
  const before=byId.get(depId);
  if(!a.observed_at||!before.observed_at)continue;
  if(a.clock_domain!==before.clock_domain){unalignable.push([depId,a.id]);continue}
  if(Date.parse(before.observed_at)>Date.parse(a.observed_at))misordered.push([depId,a.id]);
 }
 return {acyclic:!cycle,structural_algorithm_crosscheck:'KAHN_DFS_AGREE',traversal_order:cycle?[]:visited,edge_count:atoms.reduce((n,a)=>n+a.depends_on.length,0),temporal_precedence_conflicts:misordered,unreconciled_clock_domain_edges:unalignable};
}
async function signature(db,dimensions){
 const r=await db.prepare('SELECT DISTINCT dimension FROM atlas_triggers ORDER BY dimension').bind().all();
 const universe=(r.results??r).map(x=>x.dimension);
 if(universe.length>128)failure('DIMENSION_UNIVERSE_BUDGET');
 const indices=new Map(universe.map((d,i)=>[d,i]));
 let bits=0n;
 for(const d of dimensions){if(indices.has(d))bits|=1n<<BigInt(indices.get(d))}
 const unknown=dimensions.filter(d=>!indices.has(d));
 return {dimension_bitset_hex:bits.toString(16).padStart(Math.max(1,Math.ceil(universe.length/4)),'0'),dimension_universe_size:universe.length,unrecognized_dimensions:unknown};
}
export async function detectMethodAtoms(db,input){
 if(!db||typeof db.prepare!=='function')failure('DATABASE_ADAPTER_REQUIRED');
 if(!input||typeof input!=='object'||Array.isArray(input))failure('DETECTOR_INPUT_REQUIRED');
 if(Object.keys(input).some(k=>!['atoms','domain_profile','max_candidates'].includes(k)))failure('UNKNOWN_DETECTOR_FIELD');
 const atoms=input.atoms;
 if(!Array.isArray(atoms)||atoms.length<1||atoms.length>MAX_ATOMS)failure('ATOM_BATCH_BOUNDS');
 for(const a of atoms)validateAtom(a);
 const ids=atoms.map(a=>a.id);
 if(new Set(ids).size!==ids.length)failure('DUPLICATE_ATOM_ID');
 const atom_signals=atoms.map(a=>({atom_id:a.id,dimension:a.dimension??COORDINATE_SIGNAL[a.coordinate],trigger_basis:a.dimension!==undefined?'CALLER_TYPED_DIMENSION':'CANONICAL_COORDINATE_HINT_NOT_FACT',coordinate:a.coordinate??null,jacket_axis:a.jacket_axis??null}));
 const dimensions=[...new Set(atom_signals.map(x=>x.dimension))].sort();
 if(dimensions.length>8)failure('DIMENSION_QUERY_BUDGET_SPLIT_BATCH');
 const subject_ids=[...new Set(atoms.map(a=>a.subject_id))].sort();
 if(subject_ids.length>8)failure('SUBJECT_QUERY_BUDGET_SPLIT_BATCH');
 const source_refs=[...new Set(atoms.flatMap(a=>a.source_refs))].sort();
 if(source_refs.length>8)failure('SOURCE_QUERY_BUDGET_SPLIT_BATCH');
 const graph=analyzeGraph(atoms);
 const sig=await signature(db,dimensions);
 const incomplete=atoms.filter(a=>!a.source_refs.length||a.epistemic_state==='UNKNOWN').map(a=>a.id);
 const bound=source_refs.length>0&&subject_ids.length>0;
 const structuralReady=bound&&!incomplete.length&&graph.acyclic&&!graph.temporal_precedence_conflicts.length;
 // Route only source-bound complete, structurally coherent atoms. Do not turn
 // incomplete evidence or cycles into a selected "finding".
 const routed=await routeMethodAtlas(db,{dimensions,source_refs:structuralReady?source_refs:[],subject_ids,domain_profile:input.domain_profile??'GENERAL',max_candidates:input.max_candidates??8});
 const selected=routed.selected_methods;
 let relations=[];
 if(selected.length){
  const placeholders=selected.map(()=>'?').join(',');
  const results=await db.prepare(`SELECT r.method_id,r.related_method_id,r.relation_type,r.rationale,r.link_status,
    r.evidence_independent,m.family AS related_family,m.required_input AS related_required_input
    FROM atlas_method_relations r JOIN atlas_methods m ON m.method_id=r.related_method_id
    WHERE r.method_id IN (${placeholders})
    ORDER BY r.method_id,CASE r.relation_type WHEN 'CHALLENGE' THEN 0 WHEN 'CROSS_CHECK' THEN 1 ELSE 2 END,r.related_method_id LIMIT 64`).bind(...selected.map(x=>x.method_id)).all();
  const chosen=new Map();
  for(const x of (results.results??results)){
   const used=chosen.get(x.method_id)??0;
   if(used>=3)continue;
   chosen.set(x.method_id,used+1);
   relations.push({...x,candidate_state:'PROPOSED_CROSS_METHOD_REVIEW_NOT_EXECUTED',related_selected:selected.some(m=>m.method_id===x.related_method_id),independent_evidence_proven:false});
  }
 }
 const stages=[
  {stage:'QUICK_SOLID_STATE',state:'STRUCTURAL_CHECK_COMPLETED',result:{atom_count:atoms.length,unknown_or_unbound_atom_ids:incomplete,signature:sig.dimension_bitset_hex}},
  {stage:'INDUCTION',state:'NOT_EXECUTED_REQUIRES_OWNED_INVARIANT'},
  {stage:'REDUCTION',state:'TYPED_DIMENSION_REDUCTION_COMPLETED',result:{dimensions,selected_count:selected.length}},
  {stage:'TRAVERSAL',state:graph.acyclic?'DEPENDENCY_TRAVERSAL_COMPLETED':'BLOCKED_DEPENDENCY_CYCLE',result:graph},
  {stage:'TRANSFORMATION',state:'NOT_EXECUTED_REQUIRES_SUPPLIED_MODEL'},
  {stage:'SYNCHRONICITY',state:'CLOCK_DOMAIN_CHECK_COMPLETED',result:{misordered:graph.temporal_precedence_conflicts,unalignable:graph.unreconciled_clock_domain_edges}},
  {stage:'VERIFICATION',state:'NOT_EXECUTED_REQUIRES_NATIVE_CONTROL_AND_FALSIFIER'}
 ];
 return {
  detector_version:'ATOMIC-METHOD-DETECTOR-1.0',
  status:structuralReady?'DETECTED_STRUCTURAL_METHOD_CANDIDATES':'BLOCKED_STRUCTURAL_EVIDENCE_GATE',
  query_mode:'TYPED_IN_PROCESS_INDEXED_SQL_NO_NL',
  atom_count:atoms.length,...sig,atom_graph:graph,atom_signals,
  source_refs,subject_ids,dimensions,
  evidence_completeness:{all_atoms_bound:incomplete.length===0,unknown_or_unbound_atom_ids:incomplete,source_authentication:false},
  method_route:routed,cross_method_review:relations,
  stages,automatic_execution:false,target_traffic:false,
  verification_by_other_methods_performed:false,independent_evidence_proven:false,
  canonical_promotion:false,external_action_authorized:false,
  stop_condition:structuralReady?'Resolve native source authenticity and each method input before any bounded model or separately approved test':'Resolve unbound/unknown atoms, dependency cycles, or timestamp conflicts before promoting a candidate.'
 };
}
