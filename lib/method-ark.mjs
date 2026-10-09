import {getMethodCatalog} from './methods.mjs';
import framework from './atomic-framework.json' with {type:'json'};
import hookRegistry from './method-hooks.json' with {type:'json'};
const s={type:'string',minLength:1,maxLength:1000};
const layers=['IMPLEMENTED','METHOD_HOOKS','FRAMEWORK_OPERATORS','REDUCTION_METHODS','TRANSFORMATIONS','MIRRORS'];
export const arkSchema={type:'object',additionalProperties:false,properties:{catalog_layer:{type:'string',enum:layers},method_id:{type:'string',maxLength:200},function_query:s,offset:{type:'integer',minimum:0,maximum:getMethodCatalog().methods.length},limit:{type:'integer',minimum:1,maximum:5}}};
export const methodArkInventory={
 implemented_evaluators:getMethodCatalog().methods.length,research_hooks:hookRegistry.hooks.length,
 framework_operators:framework.framework_operators.length,reduction_methods:framework.reduction_methods.length,
 transformations:framework.transformation_algebra.length,mirrors:framework.mirrors.length,
 object_coordinates:framework.object_coordinates.length,jacket_axes:framework.jacket_axes.length,
 layers,counting_rule:'Overlapping framework families, mirrors, transformations and executable evaluators are separate inventories. Do not sum them as executed methods.',
 rule:framework.dimension_trigger_rule
};
const profiles={
 propositional_entailment:['explicit Boolean assumptions and one conclusion','deduction entailment logic truth table countermodel vacuity',['ach','abductive_cover'],'countermodel rather than unsupported entailment'],
 finite_invariant:['finite state graph with explicit invariant labels','induction invariant reachability graph state base step forbidden',['state_trace','partial_order'],'reachable counterexample versus unreachable induction failure'],
 abductive_cover:['observed effects and mandatory hypothesis consequences','abduction explanation minimal set cover alternative hypothesis',['ach','propositional_entailment'],'contradicted mandatory effect'],
 minimal_cut_sets:['monotone fault structure and shared basic event identity','minimal cut set fault tree common shared cause barrier combination',['fault_tree','fmea'],'path or success analysis requires a separate model'],
 nash:['strategic choice with simultaneous supplied payoff matrices','strategy payoff equilibrium unilateral deviation',['harsanyi'],'counterfactual strategy comparison'],
 harsanyi:['expected utility with supplied probabilities and payoffs','uncertainty belief expected value incomplete information',['nash'],'alternative belief assumptions'],
 selten:['finite sequential choice tree','backward decision sequential payoff tree',['nash'],'forward trace'],
 conservation:['scalar quantity reconciliation','opening inflow outflow closing conservation stock',['ledger'],'unexplained residual'],
 ledger:['multiple account quantity reconciliation','money unit transfers balances accounting conservation',['conservation','authority_graph'],'source and destination reversal review'],
 identity:['two object representations','identifier alias version owner same object',['identity_graph'],'non-equivalence'],
 identity_graph:['multiple linked object representations','identifier parent alias namespace entity graph version',['identity'],'non-equivalence'],
 state_trace:['recorded sequential state transitions','event transition ordered forward trace first divergence',['partial_order'],'backward predecessor review'],
 partial_order:['recorded order with declared prerequisites','event concurrent prerequisite precedence ordering',['state_trace','temporal'],'reversed precedence review'],
 temporal:['same-subject prior event requirement','before earlier time window expiry prior event',['state_trace'],'expected but absent record'],
 relational:['finite supplied rows and declared relations','foreign key uniqueness parent relation equality records',['identity_graph'],'supplied mismatch witness'],
 metamorphic:['two supplied records with exactly one changed control','controlled comparison one variable difference country channel version',['ach'],'strongest benign explanation'],
 authority_graph:['actor subject action and explicit governing rules','authority permission owner finalizer delegation capacity',['identity_graph'],'permission versus ownership'],
 fault_tree:['undesired top event with supplied Boolean causal structure','bad outcome backward necessary causes failure deductive fault tree',['ach'],'success-tree review (conceptual; not implemented)'],
 fmea:['failure modes and supplied ratings','failure propagation severity occurrence detection effects',['fault_tree'],'successful barrier review'],
 ach:['competing hypotheses and evidence assessments','alternative explanations confirming disconfirming evidence hypotheses falsification',['metamorphic'],'confirming versus disconfirming evidence'],
 coverage:['caller-reported evidence check coverage','review states fingerprint unresolved coverage completeness',['ach'],'missing evidence'],
 claw_accumulator:['explicit retained state threshold and reset','accumulation counter threshold reset award',['conservation'],'depletion'],
 coin_pusher_deferred:['pending inventory and later release','deferred delayed queue inventory pending release',['conservation'],'release versus retained state'],
 casino_meter_finality:['displayed finalized and paid amounts','meter display finality settlement payment states',['authority_graph'],'finality versus reversibility']
};
export function methodCapsules(){return getMethodCatalog().methods.map(d=>{const [shape,terms,complements,inverse]=profiles[d.id],schema=getMethodCatalog({method:d.id}).input_schemas[d.id];return {method_id:d.id,canonical_name:d.methods,aliases:[d.id],origin_domain:d.methods,provenance:{class:'IMPLEMENTED_BOUNDED_ADAPTATION',authority_transfer:false},purpose:d.scope,problem_shape:shape,discovery_terms:terms,required_inputs:schema.required??[],optional_inputs:Object.keys(schema.properties).filter(k=>!schema.required.includes(k)),input_schema:schema,assumptions:['Caller supplies a finite model and its source bindings.','Input schema validity does not authenticate the underlying facts.'],procedure:['Validate the selected input schema.','Execute the named bounded evaluator.','Return model fingerprint, result and limitations.'],transformation_logic:d.scope,output_type:'BOUNDED_MODEL_RESULT',what_it_supports:'The stated computation over this supplied model only.',what_it_does_not_support:['Source authenticity','Target vulnerability','Legal applicability','Automatic truth or finality'],known_failure_modes:['Wrong object or incomplete model','Unjustified assumptions','Shared evidence counted twice'],falsifier:'Contrary native evidence or a corrected input model that changes the result.',inversion_pair:{name:inverse,implementation_state:'REVIEW_METADATA_ONLY'},complement_methods:complements,transferable_structure:shape,source_pointer:{implementation:Object.hasOwn(getMethodCatalog().atomic_source_pointers.methods,d.id)?'lib/atomic-models.mjs':'lib/methods.mjs',detail_contract:'get_method_catalog',provenance_pointers:getMethodCatalog({method:d.id}).atomic_source_pointers.methods[d.id]??getMethodCatalog({method:d.id}).forensic_source_pointers},version:'UMTB-4.0',implementation_state:'EXECUTABLE_BOUNDED_MODEL'};})}
export function getMethodArk({catalog_layer='IMPLEMENTED',method_id,function_query,offset=0,limit=3}={}){
 let rows;
 if(catalog_layer==='IMPLEMENTED')rows=methodCapsules();
 else if(catalog_layer==='METHOD_HOOKS')rows=hookRegistry.hooks.map(h=>({...h,lookup_id:h.review_key,canonical_method_id:null,source_pointers:hookRegistry.sources.filter(s=>h.source_keys.includes(s.key))}));
 else{
  const values=catalog_layer==='FRAMEWORK_OPERATORS'?framework.framework_operators:
   catalog_layer==='REDUCTION_METHODS'?framework.reduction_methods:catalog_layer==='TRANSFORMATIONS'?framework.transformation_algebra:framework.mirrors;
  rows=values.map((declaration,i)=>({lookup_id:catalog_layer+':'+(i+1),declaration,
   implementation_state:catalog_layer==='TRANSFORMATIONS'?'FINITE_ATOM_OPERATOR':'NATIVE_ANALYTICAL_FRAMEWORK_DECLARATION',
   canonical_method_id:null,execution_performed:false,framework_source_id:catalog_layer==='REDUCTION_METHODS'?framework.reduction_source_id:framework.framework_source_id}));
 }
 if(method_id){rows=rows.filter(x=>(x.method_id??x.lookup_id)===method_id);if(!rows.length)throw Error('UNKNOWN_METHOD_OR_LOOKUP_ID')}
 if(function_query){const terms=[...new Set(function_query.toLowerCase().match(/[a-z]{3,}/g)??[])].filter(t=>!['the','and','from','through','with','that','starts','reasons'].includes(t));rows=rows.map(x=>({...x,discovery_score:terms.filter(t=>JSON.stringify(x).toLowerCase().includes(t)).length})).filter(x=>x.discovery_score>0).sort((a,b)=>b.discovery_score-a.discovery_score||(a.method_id??a.lookup_id).localeCompare(b.method_id??b.lookup_id))}
 return {version:'UMTB-4.0',status:'METHOD_DNA_LOOKUP',catalog_layer,inventory:methodArkInventory,discovery_basis:'FUNCTION_TERM_SEARCH_NOT_SEMANTIC_PROOF',total:rows.length,offset,next_offset:offset+limit<rows.length?offset+limit:null,methods:rows.slice(offset,offset+limit),canonical_promotion:false};
}
