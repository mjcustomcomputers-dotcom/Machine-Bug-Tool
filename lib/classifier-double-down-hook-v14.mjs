// MPC V14: double-adversarial introspection over existing V13/V8 planning RECEIPTS.
// Read-only and additive: never mutates a native classifier, controller or ledger.
import {createHash} from 'node:crypto';
const fail=code=>{throw Error(code)};
const ID=/^[A-Za-z0-9_:.-]{1,200}$/u;
const SHA=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const SOURCE_STATES=new Set(['VERIFIED_MATCH','CHANGED','UNVERIFIED']);
const routes=Object.freeze({
  CACHE_NATIVE_REVISION:['L1_SOURCE_AND_AUTHORITY','COMPARE_NATIVE_VERSION_DIGEST','What native revision and content digest actually governed the cached method decision?'],
  DECLARED_INPUT_ONLY:['L4_METHOD_APPLICABILITY','BIND_EXECUTABLE_INPUT_SCHEMA','Does the candidate have a real executable method ID and fully bound typed inputs, independently of caller-declared AVAILABLE?'],
  RESEARCH_IMPLEMENTATION:['L5_BOUNDED_REASONING_PLAN','FIND_EXECUTABLE_COMPLEMENT','Can an implemented evaluator or an explicitly specified research-only adapter answer the same classifier question?'],
  NEGATIVE_CONTROL_MISSING:['L6_CHALLENGE_AND_FALSIFICATION','BUILD_NEGATIVE_CONTROL','What source-supported negative case would reject this method if the hypothesis is false?'],
  FALSIFIER_MISSING:['L6_CHALLENGE_AND_FALSIFICATION','BUILD_FALSIFIER','What concrete counterexample or adverse observation would overturn this classification?'],
  CHALLENGER_UNREADY:['L6_CHALLENGE_AND_FALSIFICATION','PREPARE_CHALLENGER_INPUT','Does the chosen challenger have its own independent typed inputs rather than only a catalog link?'],
  DIMENSION_UNCOVERED:['L4_METHOD_APPLICABILITY','SEARCH_ALTERNATE_TYPED_METHOD','Which registered method addresses the unresolved typed dimension in the opposite direction or boundary?'],
  SOURCE_UNBOUND:['L1_SOURCE_AND_AUTHORITY','RECOVER_OWNER_SOURCE','What exact native source owner and revision would bind this unresolved classifier?'],
  NO_INPUT_READY:['L4_METHOD_APPLICABILITY','RESOLVE_MINIMAL_EXECUTABLE_INPUT','What smallest complete typed input unlocks one of the already registered methods?'],
  EXTERNAL_SOURCE_MISSING:['L3_STRUCTURE_AND_INTERFACES','FIND_INDEPENDENT_SOURCE','Which separately owned external source could challenge the internal interpretation?']
});
const priority={CACHE_NATIVE_REVISION:1,DECLARED_INPUT_ONLY:2,RESEARCH_IMPLEMENTATION:3,NEGATIVE_CONTROL_MISSING:4,FALSIFIER_MISSING:5,CHALLENGER_UNREADY:6,DIMENSION_UNCOVERED:7,SOURCE_UNBOUND:8,NO_INPUT_READY:9,EXTERNAL_SOURCE_MISSING:10};
const stableHash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const validObj=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const sorted=(a)=>[...a].sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y)));
const textID=x=>typeof x==='string'&&ID.test(x);
export const doubleDownContract=Object.freeze({version:'MPC_DOUBLE_DOWN_HOOK_V14',passes:2,
  primary:'MORPH_ROUTER_DECISIONS',secondary:'INVERT_AND_FALSIFY_EACH_MORPH',
  native_classifier_mutation:false,method_execution:false,source_authentication:false,
  external_target_actions:false,canonical_promotion:false});
/** Accept only exact V13/V8 shaped source-bound receipts. No connector calls. */
export function doubleDownClassifierAudit({reasoning_receipt,variation_receipt=null,source_version_state='UNVERIFIED',
  reasoning_blob_sha,variation_blob_sha,max_hooks=12}){
 if(!validObj(reasoning_receipt)||!Array.isArray(reasoning_receipt.method_consideration)||
    !Array.isArray(reasoning_receipt.selected_methods)||!Array.isArray(reasoning_receipt.proposed_pairs)||
    !validObj(reasoning_receipt.atom)||!validObj(reasoning_receipt.outcome_vector)||
    !SOURCE_STATES.has(source_version_state)||!SHA.test(reasoning_blob_sha)||
    (variation_receipt!==null&&(!validObj(variation_receipt)||!validObj(variation_receipt.decision_counts)||!SHA.test(variation_blob_sha)))||
    !Number.isInteger(max_hooks)||max_hooks<1||max_hooks>32)fail('DOUBLE_HOOK_INPUT');
 if(reasoning_receipt.version!=='MPC_NOAHS_ARK_REASONING_V13')fail('DOUBLE_HOOK_ROUTER_VERSION');
 if(variation_receipt!==null&&variation_receipt.version!=='MPC_ATOMIC_VARIATION_1.0')fail('DOUBLE_HOOK_VARIATION_VERSION');
 if(!Array.isArray(reasoning_receipt.atom.source_refs)||
   reasoning_receipt.selected_methods.some(m=>!textID(m.method_id)))fail('DOUBLE_HOOK_TYPED_REFS');
 const own=new Map();
 const emit=(type,target,sourceState)=>{
  if(!routes[type]||!textID(target))fail('DOUBLE_HOOK_RULE');
  const key=type+'|'+target;
  if(own.has(key))return;
  const [layer,next_action,inverse_question]=routes[type];
  const lineage={reasoning_blob_sha,variation_blob_sha:variation_receipt?variation_blob_sha:null,
    parent_method_id:target.startsWith('MHA-')?target:null,original_classifier_state:sourceState,
    source_refs:[...reasoning_receipt.atom.source_refs].sort()};
  own.set(key,{hook_id:'MORPH:'+stableHash([key,lineage]).slice(0,20),type,atom_id:reasoning_receipt.atom.atom_id,
    target,layer,original_state:sourceState,derived_status:'PROPOSED_SELF_AUDIT_CLASSIFIER',
    next_action,source_lineage:lineage,
    challenge:{kind:'INVERSE_FALSIFIER',question:inverse_question,
      expected_receipt:'EXACT_SOURCE_OR_TYPED_MODEL_RESULT',execution:'PROPOSED_ONLY'}});
 };
 const selected=reasoning_receipt.selected_methods;
 if(reasoning_receipt.atom.source_refs.length===0)emit('SOURCE_UNBOUND',reasoning_receipt.atom.atom_id,reasoning_receipt.status);
 for(const m of selected){
  if(m.decision!=='STRUCTURAL_METHOD_CANDIDATE')continue;
  emit('DECLARED_INPUT_ONLY',m.method_id,m.decision);
  if(m.implementation_state!=='VALIDATED_IMPLEMENTATION')emit('RESEARCH_IMPLEMENTATION',m.method_id,m.implementation_state);
  if(m.negative_control_state!=='AVAILABLE')emit('NEGATIVE_CONTROL_MISSING',m.method_id,m.negative_control_state);
  if(m.falsifier_state!=='AVAILABLE')emit('FALSIFIER_MISSING',m.method_id,m.falsifier_state);
 }
 for(const pair of reasoning_receipt.proposed_pairs){
  if(!textID(pair.challenger_method_id))fail('DOUBLE_HOOK_CHALLENGER');
  if(pair.challenger_readiness!=='STRUCTURAL_METHOD_CANDIDATE')emit('CHALLENGER_UNREADY',pair.challenger_method_id,pair.challenger_readiness);
 }
 for(const dim of reasoning_receipt.outcome_vector.unresolved_dimensions??[]){
  if(!textID(dim))fail('DOUBLE_HOOK_DIMENSION');
  emit('DIMENSION_UNCOVERED',dim,'UNRESOLVED_TYPED_DIMENSION');
 }
 if(reasoning_receipt.status==='BLOCKED_NO_READY_METHOD')emit('NO_INPUT_READY',reasoning_receipt.atom.atom_id,reasoning_receipt.status);
 if(variation_receipt){
  const dc=variation_receipt.decision_counts;
  if((dc.CACHED_NO_MATERIAL_DELTA??0)>0&&source_version_state!=='VERIFIED_MATCH')
    emit('CACHE_NATIVE_REVISION',reasoning_receipt.atom.atom_id,source_version_state);
  if((dc.EXTERNAL_SOURCE_UNBOUND??0)>0)
    emit('EXTERNAL_SOURCE_MISSING',reasoning_receipt.atom.atom_id,'EXTERNAL_SOURCE_UNBOUND');
 }
 const all=[...own.values()].sort((a,b)=>priority[a.type]-priority[b.type]||a.target.localeCompare(b.target));
 const hooks=all.slice(0,max_hooks);
 return {version:doubleDownContract.version,status:'TWO_PASS_SELF_AUDIT_PLAN',
  source_version_state,reasoning_blob_sha,variation_blob_sha:variation_receipt?variation_blob_sha:null,
  original_ark_methods_considered:reasoning_receipt.method_consideration.length,
  original_selected_count:selected.length,original_variation_slots:variation_receipt?.slots_considered??null,
  primary_pass:hooks.map(({challenge,...h})=>h),
  secondary_pass:hooks.map(h=>({hook_id:h.hook_id,parent_original_state:h.original_state,...h.challenge})),
  emitted_count:hooks.length,deferred_count:all.length-hooks.length,
  cache_key:stableHash({reasoning_blob_sha,variation_blob_sha:variation_receipt?variation_blob_sha:null,
    source_version_state,atom:reasoning_receipt.atom,selected:sorted(selected),
    pairs:sorted(reasoning_receipt.proposed_pairs),variation_counts:variation_receipt?.decision_counts??null,max_hooks}),
  source_authentication:false,methods_executed:0,external_actions_performed:false,
  native_classifier_mutation:false,canonical_promotion:false,
  next_action:hooks.length?hooks[0].next_action:'Advance to the next source-owned classifier or method; preserve the unchanged original receipt.'};
}
