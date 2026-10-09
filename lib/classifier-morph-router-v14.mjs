// Finite classifier-hypothesis morphs over typed supplied atoms and edges.
// Additive to V8/V13 and native MPC 17 transforms; no evidence/source mutation.
import {createHash} from 'node:crypto';
const fail=x=>{throw Error(x)};
const ID=/^[A-Za-z0-9_:.-]{1,200}$/u;
const HEX=/^[a-f0-9]{64}$/u;
const DIM=/^[A-Z][A-Z0-9_]{1,39}$/u;
const DIRECTIONS=new Set(['FORWARD','BACKWARD']);
const BOUNDARIES=new Set(['INTERNAL_MODEL','EXTERNAL_SOURCE']);
const KINDS=Object.freeze([
 'REMOVE / ABLATE','RESTORE','SUBSTITUTE','SWAP','INVERT EDGE','REORDER / PERMUTE',
 'PERTURB','MASK / HIDE CHANNEL','PROJECT / REDUCE','EXPAND / RECURSE','COMPOSE','CROSS PRODUCT',
 'STATE DIFFERENCE','INVARIANT TEST','QUALITATIVE SENSITIVITY / LOAD-BEARING TEST',
 'NULL / NO-EDGE TEST','ALTERNATIVE-MODEL SET']);
const BRANCH=new Set(['CROSS PRODUCT','QUALITATIVE SENSITIVITY / LOAD-BEARING TEST','ALTERNATIVE-MODEL SET']);
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const json=x=>JSON.stringify(x);
const hash=x=>createHash('sha256').update(json(x)).digest('hex');
const clone=x=>structuredClone(x);
const valueOK=x=>x===null||typeof x==='string'&&x.length<=500||typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x);
function checkAtom(a){
 if(!isObj(a)||!ID.test(a.id)||!DIM.test(a.coordinate)||!valueOK(a.value)||typeof a.known!=='boolean')fail('MORPH_ATOM');
}
function checkGraph(s){
 if(s.atoms.length<1||s.atoms.length>16||s.edges.length>32)fail('MORPH_GRAPH_LIMIT');
 const ids=s.atoms.map(a=>a.id);if(new Set(ids).size!==ids.length)fail('MORPH_ATOM_DUPLICATE');
 for(const a of s.atoms)checkAtom(a);
 const es=new Set(),graph=new Map(ids.map(id=>[id,[]]));
 for(const e of s.edges){if(!isObj(e)||!ID.test(e.from)||!ID.test(e.to)||!graph.has(e.from)||!graph.has(e.to)||e.from===e.to)fail('MORPH_EDGE');
  const k=e.from+'|'+e.to;if(es.has(k))fail('MORPH_DUPLICATE_EDGE');es.add(k);graph.get(e.from).push(e.to)}
 const visiting=new Set(),done=new Set();
 const dfs=id=>{if(visiting.has(id))fail('MORPH_GRAPH_CYCLE');if(done.has(id))return;visiting.add(id);for(const n of graph.get(id))dfs(n);visiting.delete(id);done.add(id)};
 for(const id of ids)dfs(id);
}
function validateClassifier(c){
 if(!isObj(c)||!ID.test(c.namespace)||!ID.test(c.classifier_id)||!ID.test(c.subject_id)||
  !HEX.test(c.evidence_digest)||!DIRECTIONS.has(c.direction)||!BOUNDARIES.has(c.boundary)||
  !Array.isArray(c.source_refs)||c.source_refs.length>8||c.source_refs.some(x=>!ID.test(x))||
  new Set(c.source_refs).size!==c.source_refs.length||!Array.isArray(c.atoms)||!Array.isArray(c.edges))fail('MORPH_CLASSIFIER');
 checkGraph(c);
}
const find=(s,id)=>{if(typeof id!=='string'||!ID.test(id))fail('MORPH_ATOM_ID');const a=s.atoms.find(a=>a.id===id);if(!a)fail('MORPH_ATOM_NOT_FOUND');return a};
const requireValues=(vs,max=16)=>{if(!Array.isArray(vs)||!vs.length||vs.length>max||vs.some(v=>!valueOK(v)))fail('MORPH_VALUES');};
function replaceValue(s,id,value){const a=find(s,id);if(!valueOK(value))fail('MORPH_VALUE');if(value!==null&&a.value!==null&&typeof value!==typeof a.value)fail('MORPH_TYPE_MISMATCH');a.value=value;a.known=value!==null;}
function one(state,step,baseline){
 if(!isObj(step)||!KINDS.includes(step.operator)||!isObj(step.args))fail('MORPH_OPERATOR');
 const a=step.args,s=clone(state),event={operator:step.operator,kind:'SUPPLIED_HYPOTHESIS_TRANSFORM',semantic_equivalence:'NOT_ASSUMED'};
 switch(step.operator){
 case 'REMOVE / ABLATE':{find(s,a.atom_id);s.atoms=s.atoms.filter(x=>x.id!==a.atom_id);s.edges=s.edges.filter(e=>e.from!==a.atom_id&&e.to!==a.atom_id);break}
 case 'RESTORE':{const original=find(baseline,a.atom_id);const ix=s.atoms.findIndex(x=>x.id===a.atom_id);if(ix<0){s.atoms.push(clone(original));s.atoms.sort((x,y)=>baseline.atoms.findIndex(z=>z.id===x.id)-baseline.atoms.findIndex(z=>z.id===y.id));}
  else s.atoms[ix]=clone(original);s.edges=s.edges.filter(e=>e.from!==a.atom_id&&e.to!==a.atom_id).concat(baseline.edges.filter(e=>e.from===a.atom_id||e.to===a.atom_id).filter(e=>s.atoms.some(x=>x.id===e.from)&&s.atoms.some(x=>x.id===e.to)));const baselineOrder=e=>baseline.edges.findIndex(z=>z.from===e.from&&z.to===e.to);s.edges.sort((x,y)=>baselineOrder(x)-baselineOrder(y));break}
 case 'SUBSTITUTE':replaceValue(s,a.atom_id,a.value);break;
 case 'SWAP':{let x=find(s,a.left_id),y=find(s,a.right_id);if(x.id===y.id||x.coordinate!==y.coordinate||typeof x.value!==typeof y.value)fail('MORPH_INCOMPATIBLE_SWAP');[x.value,y.value]=[y.value,x.value];[x.known,y.known]=[y.known,x.known];break}
 case 'INVERT EDGE':{const ix=s.edges.findIndex(e=>e.from===a.from&&e.to===a.to);if(ix<0)fail('MORPH_EDGE_NOT_FOUND');s.edges[ix]={from:a.to,to:a.from};break}
 case 'REORDER / PERMUTE':{if(!Array.isArray(a.atom_ids)||a.atom_ids.length!==s.atoms.length||new Set(a.atom_ids).size!==s.atoms.length)fail('MORPH_BAD_PERMUTATION');s.atoms=a.atom_ids.map(id=>clone(find(s,id)));break}
 case 'PERTURB':{const x=find(s,a.atom_id);if(typeof x.value!=='number'||!Number.isFinite(a.delta)||a.delta===0)fail('MORPH_PERTURB');const v=x.value+a.delta;if(!Number.isFinite(v))fail('MORPH_NUMERIC_OVERFLOW');x.value=v;break}
 case 'MASK / HIDE CHANNEL':{const x=find(s,a.atom_id);x.known=false;x.value=null;break}
 case 'PROJECT / REDUCE':{if(!Array.isArray(a.keep_ids)||!a.keep_ids.length||new Set(a.keep_ids).size!==a.keep_ids.length)fail('MORPH_PROJECTION');for(const id of a.keep_ids)find(s,id);const keep=new Set(a.keep_ids);s.atoms=s.atoms.filter(x=>keep.has(x.id));s.edges=s.edges.filter(e=>keep.has(e.from)&&keep.has(e.to));break}
 case 'EXPAND / RECURSE':{find(s,a.parent_id);if(!Array.isArray(a.children)||!a.children.length||a.children.length>4)fail('MORPH_CHILDREN');for(const c of a.children){checkAtom(c);if(s.atoms.some(x=>x.id===c.id))fail('MORPH_CHILD_DUPLICATE');s.atoms.push(clone(c));s.edges.push({from:a.parent_id,to:c.id})}break}
 case 'COMPOSE':{if(!Array.isArray(a.steps)||!a.steps.length||a.steps.length>6||a.steps.some(t=>t.operator==='COMPOSE'||BRANCH.has(t.operator)))fail('MORPH_COMPOSITION');let tmp=s;for(const sub of a.steps)tmp=one(tmp,sub,baseline)[0].state;return [{state:tmp,event:{...event,substeps:a.steps.map(x=>x.operator)}}]}
 case 'CROSS PRODUCT':{if(!Array.isArray(a.choices)||!a.choices.length||a.choices.length>4||new Set(a.choices.map(x=>x.atom_id)).size!==a.choices.length)fail('MORPH_CROSS_CHOICES');let states=[s];for(const c of a.choices){find(s,c.atom_id);requireValues(c.values,4);states=states.flatMap(t=>c.values.map(v=>{const u=clone(t);replaceValue(u,c.atom_id,v);return u}));if(states.length>16)fail('MORPH_BRANCH_BUDGET')}return states.map(t=>({state:t,event}))}
 case 'STATE DIFFERENCE':{if(!Array.isArray(a.other_atoms)||a.other_atoms.length!==s.atoms.length)fail('MORPH_STATE_PAIR');const other=new Map(a.other_atoms.map(v=>{checkAtom(v);return [v.id,v]}));if(other.size!==s.atoms.length)fail('MORPH_STATE_PAIR');event.differences=s.atoms.filter(x=>{const y=other.get(x.id);if(!y||y.coordinate!==x.coordinate)fail('MORPH_STATE_MISMATCH');return x.known!==y.known||json(x.value)!==json(y.value)}).map(x=>x.id);break}
 case 'INVARIANT TEST':{const x=find(s,a.atom_id);if(!['EQ','NE','GT','GE','LT','LE'].includes(a.comparator)||!valueOK(a.expected))fail('MORPH_INVARIANT');const v=x.value,q=a.expected;event.check=x.known?(a.comparator==='EQ'?v===q:a.comparator==='NE'?v!==q:typeof v==='number'&&typeof q==='number'&&(a.comparator==='GT'?v>q:a.comparator==='GE'?v>=q:a.comparator==='LT'?v<q:v<=q)):'UNKNOWN';event.check_source='SUPPLIED_MODEL_ONLY';break}
 case 'QUALITATIVE SENSITIVITY / LOAD-BEARING TEST':{find(s,a.atom_id);requireValues(a.values,8);return a.values.map(v=>{const t=clone(s);replaceValue(t,a.atom_id,v);return {state:t,event:{...event,changed_atom:a.atom_id}}})}
 case 'NULL / NO-EDGE TEST':{if(a.atom_id){const x=find(s,a.atom_id);x.value=null;x.known=false}else if(a.from&&a.to){const before=s.edges.length;s.edges=s.edges.filter(e=>!(e.from===a.from&&e.to===a.to));if(before===s.edges.length)fail('MORPH_EDGE_NOT_FOUND')}else fail('MORPH_NULL_ARGUMENT');break}
 case 'ALTERNATIVE-MODEL SET':{if(!Array.isArray(a.models)||!a.models.length||a.models.length>8)fail('MORPH_ALTERNATIVES');return a.models.map(model=>{if(!ID.test(model.id)||!Array.isArray(model.replacements)||!model.replacements.length||model.replacements.length>8)fail('MORPH_ALTERNATIVE');const t=clone(s);for(const r of model.replacements)replaceValue(t,r.atom_id,r.value);return {state:t,event:{...event,model_id:model.id}}})}
 default:fail('MORPH_UNKNOWN_OPERATOR');
 }
 checkGraph(s);return [{state:s,event}];
}
export const classifierMorphContract=Object.freeze({version:'MPC_CLASSIFIER_MORPH_V14',operators:KINDS,maximum_steps:8,maximum_variants:16,
 original_immutable:true,canonical_classifier_rewrite:false,source_authentication:false,method_execution:false,target_actions:false});
export function planClassifierMorphs({classifier,steps,max_variants=16}){
 validateClassifier(classifier);
 if(!Array.isArray(steps)||steps.length<1||steps.length>8||!Number.isInteger(max_variants)||max_variants<1||max_variants>16)fail('MORPH_PLAN_LIMIT');
 const baseline=clone(classifier),rawHash=hash(baseline);
 let variants=[{state:clone(baseline),trace:[]}];
 for(const step of steps){
  variants=variants.flatMap(p=>one(p.state,step,baseline).map(q=>({state:q.state,trace:p.trace.concat(q.event)})));
  if(variants.length>max_variants)fail('MORPH_BRANCH_BUDGET');
 }
 return {version:classifierMorphContract.version,status:'PROPOSED_CLASSIFIER_VARIANTS',
  parent:{namespace:baseline.namespace,classifier_id:baseline.classifier_id,subject_id:baseline.subject_id,evidence_digest:baseline.evidence_digest,source_refs:[...baseline.source_refs],parent_digest:rawHash},
  variants:variants.map(v=>({derived_id:'MORPH:'+hash({parent:rawHash,state:v.state,trace:v.trace}).slice(0,24),
    hypothesis_state:v.state,trace:v.trace,epistemic_state:'SYNTHETIC_DERIVED_QUESTION',source_identity_inherited:true,
    execution:'NOT_EXECUTED',source_authentication:false})),
  original_classifier_unchanged:true,operator_count:steps.length,methods_executed:0,native_registry_modified:false,
  external_actions_performed:false,canonical_promotion:false,
  next_action:'Route the derived, source-bound question through the existing V13 OSI/Method Atlas router and independently check falsifiers.'};
}
