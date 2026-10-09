import atomicPointers from './atomic-source-pointers.json' with {type:'json'};
import {atomicSchemas,atomicFunctions,atomicDescriptors} from './atomic-models.mjs';
import {forensicSchemas,forensicFunctions,forensicDescriptors} from './forensic-models.mjs';
import forensicPointers from './forensic-source-pointers.json' with {type:'json'};
import {deferredSchemas,deferredFunctions,deferredDescriptors} from './deferred-models.mjs';
import {validate} from './schema.mjs';
import {digest} from './universal.mjs';
import overlay from './method-overlay.json' with {type:'json'};
const s={type:'string',minLength:1,maxLength:200},n={type:'number',minimum:-1e9,maximum:1e9};
const arr=(items,min=1,max=64)=>({type:'array',items,minItems:min,maxItems:max});
const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const enumeration=(...values)=>({type:'string',enum:values});
const matrix=arr(arr(n,1,8),1,8),pair=arr(n,2,2);
const schemas={
 ...deferredSchemas,
 ...forensicSchemas,
 ...atomicSchemas,
 nash:obj({row_payoffs:matrix,column_payoffs:matrix}),
 harsanyi:obj({states:arr(obj({id:s,probability:{type:'number',minimum:0,maximum:1}}),1,16),actions:arr(obj({id:s,payoffs:arr(n,1,16)}),1,16)}),
 selten:obj({root:s,nodes:arr(obj({id:s,player:{type:'integer',minimum:0,maximum:1},children:arr(s,1,8),payoffs:pair},['id']),1,63)}),
 conservation:obj({unit:s,opening:n,inflows:arr(n,0,64),outflows:arr(n,0,64),closing:n,tolerance:{type:'number',minimum:0,maximum:1}}),
 identity:obj({left:obj({native_id:s,version:s,owner:s,namespace:s,label:s,source_ref:s}),right:obj({native_id:s,version:s,owner:s,namespace:s,label:s,source_ref:s})}),
 state_trace:obj({initial:s,transitions:arr(obj({from:s,event:s,to:s}),0,64),events:arr(obj({event:s,observed_state:s,source_ref:s}),0,64)}),
 fault_tree:obj({root:s,nodes:arr(obj({id:s,gate:enumeration('AND','OR'),children:arr(s,1,8),value:{type:['boolean','null']}},['id']),1,63)}),
 fmea:obj({rows:arr(obj({id:s,severity:{type:'integer',minimum:1,maximum:10},occurrence:{type:'integer',minimum:1,maximum:10},detection:{type:'integer',minimum:1,maximum:10},source_ref:s}),1,32)}),
 ach:obj({hypotheses:arr(s,1,16),evidence:arr(obj({id:s,source_ref:s,assessments:arr(enumeration('SUPPORTS','CONTRADICTS','NEUTRAL','UNKNOWN'),1,16)}),1,64)}),
 coverage:obj({input_fingerprint:{type:'string',minLength:64,maxLength:64},pack_fingerprint:{type:'string',minLength:64,maxLength:64},checks:arr(obj({id:s,state:enumeration('LISTED','REVIEWED','SUPPORTED','CONTRADICTED','UNKNOWN'),source_refs:arr(s,0,8)}),1,64)})
};
const fail=m=>{throw Error(m)},unique=xs=>{if(new Set(xs).size!==xs.length)fail('DUPLICATE_ID')};
const descriptors=[
 ...deferredDescriptors,
 ...forensicDescriptors,
 ...atomicDescriptors,
 ['nash','Nash','COMPUTATION','Pure equilibria for supplied two-player matrices up to 8×8; one strictly interior mixed equilibrium for nondegenerate 2×2 matrices. No general mixed-equilibrium enumeration.'],
 ['harsanyi','Harsanyi','COMPUTATION','Expected utility under supplied finite state probabilities; no Bayesian equilibrium or inferred beliefs.'],
 ['selten','Selten','COMPUTATION','Backward induction for a finite two-player perfect-information tree; first listed child breaks exact ties. One equilibrium selection, not all refinements.'],
 ['conservation','Sterman / recipe-math / claw / coin-pusher / casino','COMPUTATION','Supplied opening + inflows − outflows versus closing, in one declared unit. Hidden quantities are not inferred.'],
 ['identity','Johnny5 / Susan','COMPUTATION','Compare supplied namespace, native ID, version, owner and label separately. Does not authenticate identity or infer aliases.'],
 ['state_trace','STPA / NASA / Alloy-style / claw / coin-pusher / casino','COMPUTATION','Validate a supplied event trace against an explicit deterministic transition table; stop at the first divergence. Not an Alloy solver, STPA hazard analysis, or exhaustive state-space proof.'],
 ['fault_tree','NASA-FTA','COMPUTATION','AND/OR evaluation of a supplied acyclic fault tree with unknown leaves; no probability or minimal-cut-set inference.'],
 ['fmea','NASA-FMEA','COMPUTATION','Calculate severity × occurrence × detection from supplied 1–10 ratings, preserve ties. RPN is not probability or independently assessed risk.'],
 ['ach','CIA-ACH / Kryptonite','COMPUTATION','Count supplied supporting, contradictory and unknown evidence judgments per hypothesis. No automatic truth score or probability.'],
 ['coverage','MAXVAR / NESTMAX','COMPUTATION','Bind caller-reported check states to input and pack fingerprints; require source references for reviewed/resolved states. No authenticated proof or durable storage.']
].map(([id,methods,level,scope])=>({id,methods,level,scope}));
export const catalogSchema=obj({method:enumeration(...Object.keys(schemas))},[]);
export const evaluateSchema=obj({method:enumeration(...Object.keys(schemas)),input:{type:'object',additionalProperties:true}});
export function getMethodCatalog({method}={}){return {status:'METHOD_IMPLEMENTATION_CATALOG',recovered_corpus_tool:'get_research_registry',cross_reference_tool:'cross_reference_methods',jacket_comparison_tool:'compare_operative_states',version:'1.2.0',forensic_source_pointers:forensicPointers,atomic_source_pointers:atomicPointers,methods:method?descriptors.filter(x=>x.id===method):descriptors,input_schemas:method?{[method]:schemas[method]}:{},draft_overlay:method?undefined:overlay,model_scope:'Finite supplied models and records only; no target access, traffic generation, exploit planning, or source authentication.',canonical_promotion:false,external_action_authorized:false}}
const functions={
 ...deferredFunctions,
 ...forensicFunctions,
 ...atomicFunctions,
 nash({row_payoffs:A,column_payoffs:B}){
  const rows=A.length,cols=A[0].length;if(B.length!==rows||[...A,...B].some(r=>r.length!==cols))fail('RECTANGULAR_MATCHING_MATRICES_REQUIRED');
  const pure=[];for(let i=0;i<rows;i++)for(let j=0;j<cols;j++)if(A.every(r=>r[j]<=A[i][j])&&B[i].every(v=>v<=B[i][j]))pure.push({row:i,column:j,payoffs:[A[i][j],B[i][j]]});
  let mixed=null,mixed_status='NOT_COMPUTED_FOR_THIS_SIZE';
  if(rows===2&&cols===2){const da=A[0][0]-A[0][1]-A[1][0]+A[1][1],db=B[0][0]-B[0][1]-B[1][0]+B[1][1];mixed_status='DEGENERATE_OR_NO_STRICT_INTERIOR_SOLUTION';if(da!==0&&db!==0){const q=(A[1][1]-A[0][1])/da,p=(B[1][1]-B[1][0])/db;if(p>0&&p<1&&q>0&&q<1){mixed={row_probabilities:[p,1-p],column_probabilities:[q,1-q]};mixed_status='STRICT_INTERIOR_SOLUTION'}}}
  return {pure_equilibria:pure,strict_interior_mixed:mixed,mixed_status,index_base:0,numeric_model:'IEEE754 supplied payoffs; pure comparisons exact, mixed probabilities approximate'};
 },
 harsanyi({states,actions}){unique(states.map(x=>x.id));unique(actions.map(x=>x.id));if(Math.abs(states.reduce((a,s)=>a+s.probability,0)-1)>1e-9)fail('PROBABILITIES_MUST_SUM_TO_ONE');if(actions.some(a=>a.payoffs.length!==states.length))fail('STATE_PAYOFF_DIMENSION_MISMATCH');const values=actions.map(a=>({id:a.id,expected_utility:a.payoffs.reduce((v,p,i)=>v+p*states[i].probability,0)}));const best=Math.max(...values.map(x=>x.expected_utility));return {values,maximizers:values.filter(x=>x.expected_utility===best).map(x=>x.id),beliefs_supplied:true,bayesian_equilibrium_computed:false}},
 selten({root,nodes}){
  unique(nodes.map(x=>x.id));const map=new Map(nodes.map(x=>[x.id,x])),seen=new Set(),active=new Set(),choices=[];
  function visit(id){if(active.has(id))fail('TREE_CYCLE');if(seen.has(id))fail('TREE_SHARED_CHILD');const node=map.get(id);if(!node)fail('MISSING_NODE');seen.add(id);active.add(id);let value;
   if(node.payoffs){if(node.children!==undefined||node.player!==undefined)fail('TERMINAL_NODE_SHAPE');value=node.payoffs}
   else{if(!node.children||node.player===undefined)fail('DECISION_NODE_SHAPE');unique(node.children);const options=node.children.map(child=>({child,payoffs:visit(child)}));const best=Math.max(...options.map(o=>o.payoffs[node.player]));const ties=options.filter(o=>o.payoffs[node.player]===best);value=ties[0].payoffs;choices.push({node:id,player:node.player,chosen:ties[0].child,tied_children:ties.map(x=>x.child)})}active.delete(id);return value;
  }const payoffs=visit(root);if(seen.size!==nodes.length)fail('UNREACHABLE_NODE');return {root_payoffs:payoffs,choices,tie_rule:'FIRST_LISTED_CHILD',perfect_information_assumed:true};
 },
 conservation({unit,opening,inflows,outflows,closing,tolerance}){const expected=opening+inflows.reduce((a,b)=>a+b,0)-outflows.reduce((a,b)=>a+b,0),residual=closing-expected;return {unit,expected_closing:expected,observed_closing:closing,residual,within_supplied_tolerance:Math.abs(residual)<=tolerance,causation_established:false}},
 identity({left,right}){const comparisons=Object.keys(left).map(field=>({field,equal:left[field]===right[field]}));const native_match=['native_id','namespace','owner'].every(k=>left[k]===right[k]);return {comparisons,native_key_match:native_match,version_match:left.version===right.version,presentation_differs:left.label!==right.label,identity_authenticated:false,classification:native_match?'DECLARED_NATIVE_KEY_MATCH':'DECLARED_NATIVE_KEY_DIFFERENCE',source_refs:[left.source_ref,right.source_ref]}},
 state_trace({initial,transitions,events}){const map=new Map();for(const t of transitions){const key=JSON.stringify([t.from,t.event]);if(map.has(key))fail('NONDETERMINISTIC_TRANSITION');map.set(key,t.to)}let state=initial;for(let i=0;i<events.length;i++){const e=events[i],expected=map.get(JSON.stringify([state,e.event]));if(expected===undefined||expected!==e.observed_state)return {trace_matches:false,reviewed_events:i+1,first_divergence:{index:i,prior_state:state,event:e.event,expected_state:expected??null,observed_state:e.observed_state,source_ref:e.source_ref},remaining_events:events.length-i-1};state=expected}return {trace_matches:true,reviewed_events:events.length,final_state:state,remaining_events:0,model_completeness_proven:false}},
 fault_tree({root,nodes}){unique(nodes.map(x=>x.id));const map=new Map(nodes.map(x=>[x.id,x])),active=new Set(),memo=new Map();function visit(id){if(active.has(id))fail('FAULT_TREE_CYCLE');if(memo.has(id))return memo.get(id);const x=map.get(id);if(!x)fail('MISSING_NODE');active.add(id);let value;if(Object.hasOwn(x,'value')){if(x.children!==undefined||x.gate!==undefined)fail('LEAF_NODE_SHAPE');value=x.value}else{if(!x.children||!x.gate)fail('GATE_NODE_SHAPE');unique(x.children);const vs=x.children.map(visit);value=x.gate==='AND'?(vs.includes(false)?false:vs.includes(null)?null:true):(vs.includes(true)?true:vs.includes(null)?null:false)}active.delete(id);memo.set(id,value);return value}const value=visit(root);if(memo.size!==nodes.length)fail('UNREACHABLE_NODE');return {root_value:value,nodes_evaluated:memo.size,probability_computed:false}},
 fmea({rows}){unique(rows.map(x=>x.id));return {rows:rows.map(r=>({...r,rpn:r.severity*r.occurrence*r.detection})).sort((a,b)=>b.rpn-a.rpn),ratings_authenticated:false,rpn_is_probability:false}},
 ach({hypotheses,evidence}){unique(hypotheses);unique(evidence.map(x=>x.id));if(evidence.some(e=>e.assessments.length!==hypotheses.length))fail('HYPOTHESIS_DIMENSION_MISMATCH');return {hypotheses:hypotheses.map((id,i)=>({id,counts:Object.fromEntries(['SUPPORTS','CONTRADICTS','NEUTRAL','UNKNOWN'].map(s=>[s,evidence.filter(e=>e.assessments[i]===s).length])),contradicting_source_refs:evidence.filter(e=>e.assessments[i]==='CONTRADICTS').map(e=>e.source_ref)})),truth_or_probability_computed:false}},
 coverage({input_fingerprint,pack_fingerprint,checks}){if(![input_fingerprint,pack_fingerprint].every(x=>/^[a-f0-9]{64}$/.test(x)))fail('INVALID_FINGERPRINT');unique(checks.map(x=>x.id));for(const c of checks)if(['REVIEWED','SUPPORTED','CONTRADICTED'].includes(c.state)&&!c.source_refs.length)fail('SOURCE_REFERENCE_REQUIRED');return {input_fingerprint,pack_fingerprint,checks,counts:Object.fromEntries(['LISTED','REVIEWED','SUPPORTED','CONTRADICTED','UNKNOWN'].map(s=>[s,checks.filter(c=>c.state===s).length])),receipt_scope:'CALLER_REPORTED_SUBSET',coverage_complete:false,source_references_resolved:false,persisted:false}}
};
export async function evaluateMethod({method,input}){if(!Object.hasOwn(schemas,method))fail('UNKNOWN_METHOD');validate(input,schemas[method]);const output=functions[method](input);return {status:'BOUNDED_MODEL_RESULT',method,implementation_version:'1.2.0',model_fingerprint:await digest({method,input}),result:output,limitations:descriptors.find(x=>x.id===method).scope,source_authentication:false,canonical_promotion:false,court_release_allowed:false,external_action_authorized:false}}
