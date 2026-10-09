import framework from './atomic-framework.json' with {type:'json'};
import hookRegistry from './method-hooks.json' with {type:'json'};
import pack from './solid-state-pack.json' with {type:'json'};
import {getMethodCatalog,evaluateMethod} from './methods.mjs';
import {validate} from './schema.mjs';
import {digest,canonical} from './universal.mjs';
import {nativeIdentitySchema,classifierReferenceSchema,validateTypedRecords} from './typed-references.mjs';

const id={type:'string',minLength:1,maxLength:200};
const text={type:'string',minLength:1,maxLength:2000};
const scalar={type:['string','number','boolean','null'],maxLength:4000,minimum:-Number.MAX_SAFE_INTEGER,maximum:Number.MAX_SAFE_INTEGER};
const arr=(items,max=32,min=0)=>({type:'array',items,minItems:min,maxItems:max});
const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const en=(...values)=>({type:'string',enum:values});
const refs=arr(id,16);
const methods=()=>getMethodCatalog().methods.map(m=>m.id);
const operators=framework.transformation_algebra.map(x=>x.split(':')[0].trim());
const own=(o,k)=>o!==null&&typeof o==='object'&&Object.hasOwn(o,k);
const fail=m=>{throw Error(m)};
const unique=(xs,label)=>{if(new Set(xs).size!==xs.length)fail('DUPLICATE_'+label)};
const equal=(a,b)=>canonical(a)===canonical(b);
const clone=x=>structuredClone(x);
const maxGenerated=64,maxEvaluations=32;
const byteLength=x=>new TextEncoder().encode(JSON.stringify(x)).length;
const maxAtomBytes=100000,maxModelReceiptBytes=150000,maxTransformSteps=512;

export const atomSchema=obj({
 id,parent_id:{type:['string','null'],maxLength:200},depth:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},
 subject:nativeIdentitySchema,coordinate:en(...framework.object_coordinates),jacket_axis:en(...framework.jacket_axes),
 variable:id,value:scalar,source_refs:refs,epistemic_state:en('OBSERVED','DERIVED','INFERRED','UNKNOWN','SYNTHETIC'),
 classifier_refs:arr(classifierReferenceSchema,16),depends_on:refs,
 falsifier:text,expected_record:text,custodian:id,material_change_basis:text
});
const transformSchema=obj({
 id,operator:en(...operators),atom_ids:refs,values:arr(scalar,16),delta:{type:'number',minimum:-1e9,maximum:1e9},
 permutation:refs,children:arr(atomSchema,16),components:arr(id,8),
 choices:arr(obj({atom_id:id,values:arr(scalar,4,1)}),8,1),
 rationale:text,material_change_basis:text,source_refs:refs
},['id','operator','atom_ids','rationale','material_change_basis','source_refs']);
const bindingSchema=obj({atom_id:id,input_pointer:text,facet:en('value','depends_on','present')});
const modelSchema=obj({id,method:en(...methods()),input:{type:'object',additionalProperties:true},bindings:arr(bindingSchema,64),source_refs:refs});
const checkSchema=obj({
 id,target:en('ATOM','MODEL_OUTPUT'),subject_id:id,pointer:{type:'string',maxLength:500},
 operator:en('EQ','NE','LT','LE','GT','GE','PRESENT','ABSENT'),expected:scalar,
 source_refs:refs,falsifier:text,expected_record:text,custodian:id
});
export const atomicReviewSchema=obj({
 project_id:id,object_id:id,namespace:id,mode:en('PLAN','EXECUTE_SUPPLIED_MODELS'),
 sources:arr(obj({id,project_id:id,role:en('EVIDENCE','RULE','METHOD','SYNTHETIC_FIXTURE'),owner:id,version:id,native_locator:text}),32),
 boundary_parent_ids:refs,atoms:arr(atomSchema,64,1),transforms:arr(transformSchema,16),
 models:arr(modelSchema,4),checks:arr(checkSchema,32),
 method_applicability:arr(obj({method:en(...methods()),state:en('APPLIES','NOT_APPLICABLE','UNKNOWN'),atom_ids:refs,reason:text,source_refs:refs}),64),
 hook_applicability:arr(obj({hook_id:en(...hookRegistry.hooks.map(h=>h.review_key)),state:en('APPLIES','NOT_APPLICABLE','UNKNOWN'),atom_ids:refs,reason:text,source_refs:refs}),32),
 variant_offset:{type:'integer',minimum:0,maximum:1024},max_variants:{type:'integer',minimum:1,maximum:16},
 expected_base_fingerprint:{type:'string',minLength:64,maxLength:64},stop_condition:text
},['project_id','object_id','namespace','atoms','sources','stop_condition']);

function pointerParts(pointer){
 if(pointer==='')return [];
 if(!pointer.startsWith('/'))fail('JSON_POINTER_REQUIRED');
 return pointer.slice(1).split('/').map(part=>{
  if(/~(?![01])/u.test(part))fail('INVALID_JSON_POINTER_ESCAPE');
  const key=part.replace(/~1/g,'/').replace(/~0/g,'~');
  if(['__proto__','prototype','constructor'].includes(key))fail('UNSAFE_JSON_POINTER');
  return key;
 });
}
function readPointer(value,pointer){
 let cursor=value;
 for(const key of pointerParts(pointer)){if(!own(cursor,key))return {present:false};cursor=cursor[key]}
 return {present:true,value:cursor};
}
function writePointer(value,pointer,replacement){
 const parts=pointerParts(pointer);if(!parts.length)fail('BINDING_ROOT_REPLACEMENT_FORBIDDEN');
 let cursor=value;
 for(const key of parts.slice(0,-1)){if(!own(cursor,key))fail('MISSING_BINDING_PATH');cursor=cursor[key]}
 const key=parts.at(-1);if(!own(cursor,key))fail('MISSING_BINDING_PATH');
 cursor[key]=clone(replacement);
}
function atomValue(atoms,binding){
 const atom=atoms.find(a=>a.id===binding.atom_id);
 if(binding.facet==='present')return {present:true,value:!!atom};
 if(!atom)return {present:false};
 return {present:true,value:atom[binding.facet]};
}
function refCheck(xs,map){for(const ref of xs)if(!map.has(ref))fail('UNRESOLVED_SOURCE_REF:'+ref)}
function changes(before,after){
 const b=new Map(before.map(a=>[a.id,a])),a=new Map(after.map(x=>[x.id,x]));
 return [...new Set([...b.keys(),...a.keys()])].sort().flatMap(id=>{
  if(!b.has(id))return [{atom_id:id,change:'ADDED',after:a.get(id)}];
  if(!a.has(id))return [{atom_id:id,change:'REMOVED',before:b.get(id)}];
  const fields=Object.keys(b.get(id)).filter(k=>!equal(b.get(id)[k],a.get(id)[k]));
  return fields.length?[{atom_id:id,change:'CHANGED',fields,before:b.get(id),after:a.get(id)}]:[];
 });
}
function select(atoms,ids){return ids.map(id=>{const atom=atoms.find(a=>a.id===id);if(!atom)fail('TRANSFORM_ATOM_NOT_PRESENT:'+id);return atom})}
function requireSize(xs,n,label){if(xs.length!==n)fail(label)}
function variantCount(t,byId,active=new Set(),memo=new Map()){
 if(active.has(t.id))fail('TRANSFORM_COMPOSITION_CYCLE');
 if(memo.has(t.id))return memo.get(t.id);
 if(t.operator==='COMPOSE'){
  if(!t.components?.length)fail('COMPOSITION_COMPONENTS_REQUIRED');
  active.add(t.id);
  for(const id of t.components){const c=byId.get(id);if(!c)fail('UNKNOWN_TRANSFORM_COMPONENT');if(variantCount(c,byId,active,memo)!==1)fail('BRANCHING_COMPOSITION_REQUIRES_EXPLICIT_ALTERNATIVES')}
  active.delete(t.id);memo.set(t.id,1);return 1;
 }
 const count=t.operator==='QUALITATIVE SENSITIVITY / LOAD-BEARING TEST'?t.atom_ids.length:
  t.operator==='CROSS PRODUCT'?(t.choices??[]).reduce((n,c)=>n*c.values.length,1):
  t.operator==='ALTERNATIVE-MODEL SET'?(t.choices??[]).reduce((n,c)=>n+c.values.length,0):1;
 if(count<1||count>maxGenerated)fail('FINITE_VARIANT_BOUND_EXCEEDED');
 memo.set(t.id,count);return count;
}
function transformState(base,current,t,byId,active=new Set(),variantIndex=0,work={used:0}){
 if(++work.used>maxTransformSteps)fail('TRANSFORM_WORK_BUDGET_USE_SMALLER_COMPOSITION_OR_PAGE');
 if(active.has(t.id))fail('TRANSFORM_COMPOSITION_CYCLE');
 const next=clone(current),ids=t.atom_ids;unique(ids,'TRANSFORM_ATOM_ID');
 const selected=t.operator==='RESTORE'?[]:select(next,ids);
 const one=()=>[{atoms:next,transform_id:t.id,operator:t.operator}];
 switch(t.operator){
  case 'REMOVE / ABLATE':
  case 'QUALITATIVE SENSITIVITY / LOAD-BEARING TEST':
   if(!ids.length)fail('REMOVAL_ATOMS_REQUIRED');
   if(t.operator==='REMOVE / ABLATE')return [{atoms:next.filter(a=>!ids.includes(a.id)),transform_id:t.id,operator:t.operator}];
   return [{atoms:next.filter(a=>a.id!==ids[variantIndex]),transform_id:t.id,operator:t.operator,controlled_atom:ids[variantIndex]}];
  case 'RESTORE':
   for(const original of select(base,ids)){const i=next.findIndex(a=>a.id===original.id);if(i<0)next.push(clone(original));else next[i]=clone(original)}
   return one();
  case 'SUBSTITUTE':
  case 'STATE DIFFERENCE':
   if(!t.values||!ids.length)fail('SUBSTITUTION_VALUES_REQUIRED');
   requireSize(t.values,ids.length,'SUBSTITUTION_DIMENSION_MISMATCH');
   selected.forEach((a,i)=>a.value=clone(t.values[i]));return one();
  case 'SWAP': {
   requireSize(ids,2,'SWAP_REQUIRES_TWO_ATOMS');
   if(selected[0].coordinate!==selected[1].coordinate||selected[0].jacket_axis!==selected[1].jacket_axis)fail('SWAP_REQUIRES_SAME_DECLARED_COORDINATE');
   const value=selected[0].value;selected[0].value=selected[1].value;selected[1].value=value;return one();
  }
  case 'INVERT EDGE':
  case 'NULL / NO-EDGE TEST': {
   requireSize(ids,2,'EDGE_OPERATION_REQUIRES_FROM_AND_TO');
   const [from,to]=selected;if(!to.depends_on.includes(from.id))fail('DECLARED_EDGE_NOT_PRESENT');
   to.depends_on=to.depends_on.filter(x=>x!==from.id);
   if(t.operator==='INVERT EDGE'&&!from.depends_on.includes(to.id))from.depends_on.push(to.id);
   return one();
  }
  case 'REORDER / PERMUTE': {
   if(!t.permutation||ids.length<2)fail('PERMUTATION_REQUIRED');
   unique(t.permutation,'PERMUTATION_ID');
   if(!equal([...ids].sort(),[...t.permutation].sort()))fail('PERMUTATION_MEMBER_MISMATCH');
   if(new Set(selected.map(a=>a.coordinate+'|'+a.jacket_axis)).size!==1)fail('PERMUTATION_REQUIRES_SAME_DECLARED_COORDINATE');
   const values=new Map(selected.map(a=>[a.id,clone(a.value)]));
   selected.forEach((a,i)=>a.value=values.get(t.permutation[i]));return one();
  }
  case 'PERTURB':
   if(!ids.length||typeof t.delta!=='number')fail('PERTURBATION_DELTA_REQUIRED');
   for(const a of selected){if(typeof a.value!=='number')fail('NUMERIC_ATOM_REQUIRED');a.value+=t.delta;if(!Number.isFinite(a.value)||Math.abs(a.value)>Number.MAX_SAFE_INTEGER)fail('PERTURBATION_RANGE')}
   return one();
  case 'MASK / HIDE CHANNEL':
   if(!ids.length)fail('MASK_ATOMS_REQUIRED');
   selected.forEach(a=>{a.value=null;a.epistemic_state='UNKNOWN'});return one();
  case 'PROJECT / REDUCE':
   if(!ids.length)fail('PROJECTION_ATOMS_REQUIRED');
   return [{atoms:next.filter(a=>ids.includes(a.id)),transform_id:t.id,operator:t.operator}];
  case 'EXPAND / RECURSE':
   if(!t.children?.length)fail('CHILD_ATOMS_REQUIRED');
   for(const child of t.children){
    if(next.some(a=>a.id===child.id))fail('CHILD_ID_ALREADY_PRESENT');
    const parent=next.find(a=>a.id===child.parent_id);
    if(!parent||child.depth!==parent.depth+1)fail('CHILD_PARENT_DEPTH_MISMATCH');
    if(!equal(child.subject,parent.subject))fail('CHILD_SUBJECT_IDENTITY_CHANGED');
    next.push(clone(child));
   }
   if(next.length>64)fail('ATOM_BATCH_LIMIT');return one();
  case 'COMPOSE': {
   if(!t.components?.length)fail('COMPOSITION_COMPONENTS_REQUIRED');
   active.add(t.id);let state=next;
   for(const id of t.components){
    const component=byId.get(id);if(!component)fail('UNKNOWN_TRANSFORM_COMPONENT');
    const result=transformState(base,state,component,byId,active,0,work);
    if(result.length!==1)fail('BRANCHING_COMPOSITION_REQUIRES_EXPLICIT_ALTERNATIVES');
    state=result[0].atoms;
   }
   active.delete(t.id);return [{atoms:state,transform_id:t.id,operator:t.operator,components:[...t.components]}];
  }
  case 'CROSS PRODUCT':
  case 'ALTERNATIVE-MODEL SET': {
   if(!t.choices?.length)fail('FINITE_CHOICES_REQUIRED');
   unique(t.choices.map(x=>x.atom_id),'CHOICE_ATOM');
   select(next,t.choices.map(x=>x.atom_id));
   // Materialize only this requested alternative, not the entire cross product.
   let index=variantIndex;
   if(t.operator==='CROSS PRODUCT'){
    for(const choice of [...t.choices].reverse()){
     next.find(a=>a.id===choice.atom_id).value=clone(choice.values[index%choice.values.length]);
     index=Math.floor(index/choice.values.length);
    }
   }else{
    for(const choice of t.choices){
     if(index<choice.values.length){next.find(a=>a.id===choice.atom_id).value=clone(choice.values[index]);break}
     index-=choice.values.length;
    }
   }
   return [{atoms:next,transform_id:t.id,operator:t.operator,choice_index:variantIndex}];
  }
  case 'INVARIANT TEST':return one();
  default:fail('UNSUPPORTED_TRANSFORM');
 }
}
function checkValue(check,atoms,modelResults){
 if(check.target==='ATOM'){
  const atom=atoms.find(a=>a.id===check.subject_id);
  return atom?{present:true,value:atom.value}:{present:false};
 }
 const model=modelResults.find(x=>x.model_id===check.subject_id);
 if(!model||model.execution!=='EXECUTED')return {present:false,blocked:true};
 return readPointer(model.receipt.result,check.pointer);
}
function runCheck(check,atoms,modelResults){
 const actual=checkValue(check,atoms,modelResults);
 let state='UNKNOWN',holds;
 if(!check.source_refs.length)return {...check,state,reason:'ANALYTICAL_RULE_SOURCE_REQUIRED'};
 if(actual.blocked)return {...check,state,reason:'MODEL_RESULT_NOT_AVAILABLE'};
 if(check.operator==='PRESENT')holds=actual.present;
 else if(check.operator==='ABSENT')holds=!actual.present;
 else if(!actual.present||actual.value===null)return {...check,state,reason:'MISSING_OR_UNKNOWN_VALUE'};
 else if(check.operator==='EQ')holds=equal(actual.value,check.expected);
 else if(check.operator==='NE')holds=!equal(actual.value,check.expected);
 else if(typeof actual.value==='number'&&typeof check.expected==='number'){
  if(check.operator==='LT')holds=actual.value<check.expected;
  if(check.operator==='LE')holds=actual.value<=check.expected;
  if(check.operator==='GT')holds=actual.value>check.expected;
  if(check.operator==='GE')holds=actual.value>=check.expected;
 }else return {...check,state,reason:'NUMERIC_COMPARISON_REQUIRES_NUMBERS'};
 return {...check,state:holds?'HOLDS':'VIOLATED',actual:actual.present?actual.value:null,scope:'SUPPLIED_MODEL_INVARIANT_ONLY'};
}
export async function reviewAtomicVariants(input){
 validate(input,atomicReviewSchema);
 const mode=input.mode??'PLAN',atoms=input.atoms,sources=input.sources,transforms=input.transforms??[],models=input.models??[],checks=input.checks??[];
 if(byteLength(atoms)>maxAtomBytes)fail('ATOM_BYTE_BUDGET_USE_SMALLER_ATOM_BATCH');
 for(const [rows,label]of [[atoms,'ATOM_ID'],[sources,'SOURCE_ID'],[transforms,'TRANSFORM_ID'],[models,'MODEL_ID'],[checks,'CHECK_ID']])unique(rows.map(x=>x.id),label);
 const sourceMap=new Map(sources.map(x=>[x.id,x]));
 for(const source of sources)if(source.role!=='METHOD'&&source.project_id!==input.project_id)fail('CROSS_PROJECT_SOURCE');
 const allChildren=transforms.flatMap(t=>t.children??[]),allAtomIds=new Set([...atoms,...allChildren].map(a=>a.id));
 unique([...atoms,...allChildren].map(a=>a.id),'ATOM_DEFINITION');
 const allAtomMap=new Map([...atoms,...allChildren].map(a=>[a.id,a]));
 const boundary=new Set(input.boundary_parent_ids??[]);
 for(const atom of [...atoms,...allChildren]){
  refCheck(atom.source_refs,sourceMap);unique(atom.depends_on,'DEPENDENCY_ID');
  if(atom.depends_on.includes(atom.id))fail('SELF_DEPENDENT_ATOM');
  if(atom.parent_id&&!allAtomIds.has(atom.parent_id)&&!boundary.has(atom.parent_id))fail('PARENT_OUTSIDE_DECLARED_BOUNDARY');
  if(atoms.includes(atom)&&atom.parent_id&&!atoms.some(a=>a.id===atom.parent_id)&&!boundary.has(atom.parent_id))fail('BASE_PARENT_NOT_PRESENT');
  const parent=allAtomMap.get(atom.parent_id);
  if(parent&&atom.depth!==parent.depth+1)fail('ATOM_PARENT_DEPTH_MISMATCH');
  if(parent&&!equal(parent.subject,atom.subject))fail('ATOM_PARENT_SUBJECT_MISMATCH');
  if(atom.epistemic_state==='OBSERVED'&&!atom.source_refs.length)fail('OBSERVED_ATOM_REQUIRES_SOURCE');
 }
 const binding=await validateTypedRecords([...atoms,...allChildren].map((a,i)=>({classifier_ids:[],method_ids:[],typed:{identity:a.subject,ordinal:i,classifier_refs:a.classifier_refs,method_refs:[]}})));
 for(const t of transforms){refCheck(t.source_refs,sourceMap);for(const choice of t.choices??[])unique(choice.values.map(v=>JSON.stringify(v)),'CHOICE_VALUE')}
 const applicability=input.method_applicability??[];unique(applicability.map(x=>x.method),'METHOD_APPLICABILITY');
 for(const entry of applicability){refCheck(entry.source_refs,sourceMap);for(const id of entry.atom_ids)if(!allAtomIds.has(id))fail('UNKNOWN_APPLICABILITY_ATOM')}
 const hooks=input.hook_applicability??[];unique(hooks.map(x=>x.hook_id),'HOOK_APPLICABILITY');
 for(const entry of hooks){refCheck(entry.source_refs,sourceMap);for(const id of entry.atom_ids)if(!allAtomIds.has(id))fail('UNKNOWN_APPLICABILITY_ATOM')}
 for(const model of models){
  refCheck(model.source_refs,sourceMap);unique(model.bindings.map(b=>b.input_pointer),'MODEL_BINDING_PATH');
  const paths=model.bindings.map(b=>pointerParts(b.input_pointer));
  for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)if(paths[i].every((k,n)=>paths[j][n]===k)||paths[j].every((k,n)=>paths[i][n]===k))fail('OVERLAPPING_MODEL_BINDING_PATHS');
  if(applicability.find(x=>x.method===model.method)?.state==='NOT_APPLICABLE')fail('MODEL_CONFLICTS_WITH_DECLARED_APPLICABILITY');
  validate(model.input,getMethodCatalog({method:model.method}).input_schemas[model.method]);
  for(const b of model.bindings){
   if(!atoms.some(a=>a.id===b.atom_id))fail('UNKNOWN_BASELINE_BINDING_ATOM');
   const expected=atomValue(atoms,b),actual=readPointer(model.input,b.input_pointer);
   if(!actual.present||!expected.present||!equal(actual.value,expected.value))fail('BASELINE_BINDING_VALUE_MISMATCH');
  }
 }
 for(const c of checks){
  refCheck(c.source_refs,sourceMap);pointerParts(c.pointer);
  if(c.target==='ATOM'&&c.pointer!=='')fail('ATOM_CHECK_POINTER_MUST_BE_EMPTY_FOR_VALUE');
  if(c.target==='MODEL_OUTPUT'&&!models.some(m=>m.id===c.subject_id))fail('UNKNOWN_CHECK_MODEL');
  if(c.target==='ATOM'&&!allAtomIds.has(c.subject_id))fail('UNKNOWN_CHECK_ATOM');
 }
 const baseFingerprint=await digest({project_id:input.project_id,object_id:input.object_id,namespace:input.namespace,atoms,sources,models,checks});
 if(input.expected_base_fingerprint&&input.expected_base_fingerprint!==baseFingerprint)fail('STALE_ATOMIC_BASE_FINGERPRINT');
 const byId=new Map(transforms.map(t=>[t.id,t]));
 const generated=transforms.flatMap(t=>Array.from({length:variantCount(t,byId)},(_,variant_index)=>({transform_id:t.id,variant_index})));
 if(generated.length>1024)fail('FINITE_VARIANT_BOUND_EXCEEDED');
 const offset=input.variant_offset??0,limit=input.max_variants??8;
 if(offset>generated.length)fail('VARIANT_OFFSET_OUT_OF_RANGE');
 const transformWork={used:0};
 const selection=generated.slice(offset,offset+limit).map(v=>transformState(atoms,atoms,byId.get(v.transform_id),byId,new Set(),v.variant_index,transformWork)[0]);
 if(selection.some(v=>byteLength(v.atoms)>maxAtomBytes))fail('VARIANT_ATOM_BYTE_BUDGET_USE_SMALLER_ATOM_BATCH');
 let evaluations=0;
 async function evaluateState(state){
  const results=[];
  for(const model of models){
   const modelInput=clone(model.input),missing=[];
   for(const b of model.bindings){const value=atomValue(state,b);if(!value.present)missing.push(b.atom_id);else writePointer(modelInput,b.input_pointer,value.value)}
   if(missing.length){results.push({model_id:model.id,method:model.method,execution:'BLOCKED_MISSING_ATOM',missing_atom_ids:missing});continue}
   try{validate(modelInput,getMethodCatalog({method:model.method}).input_schemas[model.method])}
   catch(error){results.push({model_id:model.id,method:model.method,execution:'BLOCKED_INVALID_VARIANT_MODEL',reason:error.message});continue}
   if(mode!=='EXECUTE_SUPPLIED_MODELS'){results.push({model_id:model.id,method:model.method,execution:'SCHEMA_VALID_NOT_EXECUTED'});continue}
   if(evaluations>=maxEvaluations){results.push({model_id:model.id,method:model.method,execution:'NOT_EXECUTED_BUDGET',next_action:'Continue this same base with a smaller variant page or fewer explicit models.'});continue}
   evaluations++;
   try{
    const receipt=await evaluateMethod({method:model.method,input:modelInput});
    if(byteLength(receipt)>maxModelReceiptBytes){results.push({model_id:model.id,method:model.method,execution:'EXECUTED_RESULT_TOO_LARGE',model_fingerprint:receipt.model_fingerprint,result_fingerprint:await digest(receipt),next_action:'Use a smaller supplied model or finite enumeration budget. Full result omitted under the atomic response budget; no invariant conclusion is drawn.'});continue}
    results.push({model_id:model.id,method:model.method,execution:'EXECUTED',receipt,method_packet:{
     'METHOD ID':model.method,'INPUT OBJECT ID':input.object_id,
     'PARENT CLASSIFIERS':state.flatMap(a=>a.classifier_refs),
     'PROPOSED STATE':'BOUNDED_SUPPLIED_MODEL_RESULT','PROPOSED EDGE STATE':'UNKNOWN',
     'SUPPORTING SOURCE':model.source_refs,'COUNTEREXAMPLE / FALSIFIER':state.filter(a=>model.bindings.some(b=>b.atom_id===a.id)).map(a=>({atom_id:a.id,falsifier:a.falsifier})),
     'CONTRADICTION':'REQUIRES_SAME_PROPOSITION_RECONCILIATION','TARGET':state.filter(a=>model.bindings.some(b=>b.atom_id===a.id)).map(a=>({atom_id:a.id,expected_record:a.expected_record,custodian:a.custodian})),
     'METHOD LIMITATION':receipt.limitations,'LEGAL EFFECT CLAIMED?':'NO'
    }});
   }catch(error){results.push({model_id:model.id,method:model.method,execution:'MODEL_EVALUATION_REJECTED',reason:error.message})}
  }
  return {model_results:results,invariant_checks:checks.map(c=>runCheck(c,state,results))};
 }
 const baseline=await evaluateState(atoms),variants=[];
 for(let i=0;i<selection.length;i++){
  const variant=selection[i],delta=changes(atoms,variant.atoms);
  const control=['RESTORE','INVARIANT TEST'].includes(variant.operator);
  const noGain=!delta.length&&!control;
  const evaluated=noGain?{model_results:[],invariant_checks:[]}:await evaluateState(variant.atoms);
  const newViolations=evaluated.invariant_checks.filter(c=>c.state==='VIOLATED'&&baseline.invariant_checks.find(b=>b.id===c.id)?.state==='HOLDS');
  const unresolvedDependencies=variant.atoms.flatMap(a=>a.depends_on.filter(id=>!variant.atoms.some(x=>x.id===id)).map(id=>({atom_id:a.id,missing_dependency:id})));
  variants.push({...variant,variant_index:offset+i,variant_fingerprint:await digest({base_fingerprint:baseFingerprint,transform_id:variant.transform_id,atoms:variant.atoms}),
   evidence_state:'TEST_ONLY_COUNTERFACTUAL',epistemic_labels_in_atoms:'PRESERVED_BASE_DECLARATIONS_NOT_VARIANT_FACTS',
   ...evaluated,changed_atoms:delta,changed_coordinates:[...new Set(delta.flatMap(d=>[d.before?.coordinate,d.after?.coordinate].filter(Boolean)))],
   invariant_atom_ids:atoms.filter(a=>!delta.some(d=>d.atom_id===a.id)).map(a=>a.id),
   new_model_counterexamples:newViolations.map(c=>({check_id:c.id,falsifier:c.falsifier,expected_record:c.expected_record,custodian:c.custodian})),
   status:noGain?'STOP_NO_MATERIAL_INFORMATION_GAIN':newViolations.length?'MODEL_COUNTEREXAMPLE_CANDIDATE':'BOUNDED_VARIANT_REVIEW',
   unresolved_dependencies:unresolvedDependencies,source_records_modified:false,legal_delta:'NOT_DETERMINED',
   restore_path:{base_fingerprint:baseFingerprint,action:'Restore the original supplied atom state; no native source was modified.'}
  });
 }
 const catalog=getMethodCatalog(),selectedRefs=new Set(atoms.flatMap(a=>a.classifier_refs.filter(r=>r.namespace==='BL').map(r=>r.native_id)));
 const pendingExecution=variants.flatMap(v=>v.model_results.filter(m=>m.execution==='NOT_EXECUTED_BUDGET').map(m=>({variant_index:v.variant_index,model_id:m.model_id,method:m.method,reason:m.execution})));
 const incompleteModels=[baseline,...variants].flatMap(s=>s.model_results).filter(m=>m.execution!=='EXECUTED');
 const allClasses=pack.classifiers.map(c=>({id:c.id,state:selectedRefs.has(c.id)?'CALLER_REFERENCED':'NOT_SELECTED',branch_id:c.branch_id}));
 return {status:'ATOMIC_METHOD_REVIEW',version:framework.version,project_id:input.project_id,object_id:input.object_id,namespace:input.namespace,
  base_fingerprint:baseFingerprint,input_fingerprint:await digest(input),original_atoms:clone(atoms),baseline,variants,
  generated_variant_count:generated.length,returned_variant_count:variants.length,next_variant_offset:offset+variants.length<generated.length?offset+variants.length:null,
  execution_complete:mode==='EXECUTE_SUPPLIED_MODELS'&&incompleteModels.length===0,
  pending_execution_frontier:pendingExecution,next_execution_variant_offset:pendingExecution.length?Math.min(...pendingExecution.map(p=>p.variant_index)):null,
  continuation_rule:'Follow next_variant_offset for unmaterialized variants and next_execution_variant_offset for budget-pending executions. Resume with the same base fingerprint and a smaller page; null variant pagination alone does not mean execution completed.',
  methods_accounted:catalog.methods.length,method_accounting:catalog.methods.map(m=>{
   const app=applicability.find(x=>x.method===m.id),supplied=models.filter(x=>x.method===m.id);
   return {method:m.id,scope:m.scope,applicability:app?.state??'UNKNOWN',reason:app?.reason??'Requires a dimension-specific applicability decision; inventory alone is not execution.',
    atom_ids:app?.atom_ids??[...new Set(supplied.flatMap(x=>x.bindings.map(b=>b.atom_id)))],supplied_model_ids:supplied.map(x=>x.id),
    execution_receipts:[baseline,...variants].flatMap(x=>x.model_results??[]).filter(x=>x.method===m.id&&x.execution==='EXECUTED').length};
  }),
  classifier_accounting:{pack_id:pack.pack_id,branches_accounted:32,classifiers_accounted:allClasses.length,
   caller_referenced_ids:allClasses.filter(c=>c.state==='CALLER_REFERENCED').map(c=>c.id),
   not_selected_ids:allClasses.filter(c=>c.state==='NOT_SELECTED').map(c=>c.id),registry_binding:binding,
   coverage_is_applicability:false,semantic_minimality_proven:false},
  explicit_model_evaluations:evaluations,evaluation_budget:maxEvaluations,variant_materialization:'REQUESTED_PAGE_ONLY',transform_steps:transformWork.used,transform_step_budget:maxTransformSteps,transform_validation_scope:'DECLARED_SHAPES_AND_MATERIALIZED_PAGE_ONLY',
  reasoning_scope:'Finite declared atom transformations and explicitly supplied models. No automatic natural-language atomization, source authentication, causal identification, or unbounded proof.',
  parent_depth_policy:framework.stop_rule,method_trigger_rule:framework.dimension_trigger_rule,
  hook_accounting:hookRegistry.hooks.map(h=>({hook_id:h.review_key,name:h.name,implementation_state:h.implementation_state,
   applicability:hooks.find(x=>x.hook_id===h.review_key)?.state??'UNKNOWN',declaration:hooks.find(x=>x.hook_id===h.review_key)??null,
   execution_performed:false,required_inputs:h.proposed_input_contract,operator_attachments:h.operator_attachments})),
  reconciliation:{status:'NOT_PERFORMED_REVIEW_REQUIRED',rule:framework.reconciliation_rule,allowed_relations:framework.reconciliation_relations_exact,automatic_averaging:false,method_agreement_is_independent_evidence:false},
  stop_condition:input.stop_condition,source_records_modified:false,canonical_promotion:false,court_release_allowed:false,external_action_authorized:false
 };
}
export const atomicContract={
 version:framework.version,framework_source_id:framework.framework_source_id,input_schema:atomicReviewSchema,
 existing_packet_preserved:true,atom_unit:'One declared variable/value, with identity, source, classifiers, parent, dependencies, falsifier and expected record.',
 identity_policy:'Caller-supplied native atom IDs and typed subject identities are preserved. Test variants do not mint canonical classifiers.',
 object_coordinates:framework.object_coordinates,jacket_axes:framework.jacket_axes,transformation_algebra:framework.transformation_algebra,
 operator_execution_scope:'Finite supplied atom states; model projections are explicitly bound by JSON pointers. Transform labels do not imply formal solver completeness.',
 method_packet_fields:['METHOD ID','INPUT OBJECT ID','PARENT CLASSIFIERS','PROPOSED STATE','PROPOSED EDGE STATE','SUPPORTING SOURCE','COUNTEREXAMPLE / FALSIFIER','CONTRADICTION','TARGET','METHOD LIMITATION','LEGAL EFFECT CLAIMED?'],
 method_packet_key_value_normalization:'The original declaration LEGAL EFFECT CLAIMED? = NO is represented by key LEGAL EFFECT CLAIMED? with value NO.',
 canonical_packet_declarations:framework.method_packet_fields_exact,reduction_identity:framework.reduction_identity,
 analytical_inventory:{framework_operators:framework.framework_operators.length,reduction_methods:framework.reduction_methods.length,mirrors:framework.mirrors.length,research_hooks:hookRegistry.hooks.length},
 method_discovery:'get_method_ark catalog_layer selects IMPLEMENTED, METHOD_HOOKS, FRAMEWORK_OPERATORS, REDUCTION_METHODS, TRANSFORMATIONS or MIRRORS. Limit 1–5; follow next_offset.',
 no_material_gain_stop:framework.stop_rule,max_atom_batch:64,max_model_batch:4,max_variants_per_page:16,max_model_evaluations_per_call:maxEvaluations,
 max_transform_steps:maxTransformSteps,max_atom_bytes:maxAtomBytes,max_model_receipt_bytes:maxModelReceiptBytes,
 default_mode:'PLAN',explicit_execution_mode:'EXECUTE_SUPPLIED_MODELS',automatic_target_actions:false,
 invariants:'A newly violated supplied invariant creates a MODEL_COUNTEREXAMPLE_CANDIDATE; native proof and impact remain separate.',
 canonical_promotion:false,external_action_authorized:false
};
