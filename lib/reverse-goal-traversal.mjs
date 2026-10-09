// Bounded reverse-goal reachability over caller-supplied finite state graphs.
// No criminal intent inference, target testing, evidence authentication, or source mutation.
const ID=/^[A-Za-z0-9_:.\-]{1,200}$/u;
const INTENT=new Set(['INTENT_PLUS','INTENT_MINUS','BENIGN_ALTERNATIVE']);
const invalid=m=>{throw Error(m)};
const validID=v=>typeof v==='string'&&ID.test(v);
function ids(xs,limit,label){
 if(!Array.isArray(xs)||xs.length<1||xs.length>limit||[...xs].some(x=>!validID(x))||new Set(xs).size!==xs.length)invalid('INVALID_'+label);
 return xs;
}
function graphSearch(states,transitions,start,goal){
 const byFrom=new Map(states.map(s=>[s,[]])),byTo=new Map(states.map(s=>[s,[]]));
 for(const t of transitions){byFrom.get(t.from).push(t);byTo.get(t.to).push(t)}
 for(const edges of byFrom.values())edges.sort((a,b)=>a.id.localeCompare(b.id));
 for(const edges of byTo.values())edges.sort((a,b)=>a.id.localeCompare(b.id));
 // Backward traverse only declared predecessors; reachability here is synthetic.
 const predecessors=new Set([goal]),reverse=[goal];
 for(let i=0;i<reverse.length;i++)for(const t of byTo.get(reverse[i])){
  if(!predecessors.has(t.from)){predecessors.add(t.from);reverse.push(t.from)}
 }
 if(!predecessors.has(start))return {reachability:'NO_DECLARED_PATH',path:[],transition_ids:[],reverse_dependency_state_ids:[...predecessors].sort()};
 const q=[start], seen=new Set([start]),prev=new Map();
 for(let i=0;i<q.length;i++){
  const s=q[i];if(s===goal)break;
  for(const t of byFrom.get(s)){
   if(!predecessors.has(t.to)||seen.has(t.to))continue;
   prev.set(t.to,{state:s,transition_id:t.id});seen.add(t.to);q.push(t.to);
  }
 }
 if(!seen.has(goal))invalid('INTERNAL_FORWARD_REVERSE_REACHABILITY_DISAGREEMENT');
 const path=[goal],edges=[];let current=goal;
 while(current!==start){const p=prev.get(current);edges.push(p.transition_id);path.push(p.state);current=p.state}
 path.reverse();edges.reverse();
 return {reachability:'REACHABLE_IN_SUPPLIED_GRAPH',path,transition_ids:edges,reverse_dependency_state_ids:[...predecessors].sort()};
}
function withPathBinding(result,byId){
 const unbound=result.transition_ids.filter(id=>!byId.get(id).source_refs.length);
 const noPath=result.reachability==='NO_DECLARED_PATH';
 const zeroEdges=result.transition_ids.length===0;
 return {...result,
  path_source_bound:noPath||zeroEdges?null:unbound.length===0,
  path_source_binding_state:noPath?'NO_DECLARED_PATH':zeroEdges?'NO_TRANSITIONS_REQUIRED':
   unbound.length?'UNBOUND_TRANSITIONS':'DECLARED_SOURCE_REFERENCES_ONLY',
  unbound_transition_ids:unbound};
}
export function reviewReverseGoals(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['subject_id','states','transitions','start_state','goals','remove_transition_id'].includes(k)))invalid('GOAL_GRAPH_FIELDS');
 if(!validID(input.subject_id))invalid('INVALID_GOAL_SUBJECT');
 const states=ids(input.states,64,'GOAL_STATES'),start=input.start_state;
 if(!validID(start)||!states.includes(start))invalid('START_STATE_UNKNOWN');
 const t=input.transitions;
 if(!Array.isArray(t)||t.length>128)invalid('GOAL_TRANSITIONS');
 const seen=new Set();
 for(const e of t){
  if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).some(k=>!['id','from','to','source_refs'].includes(k))||
     !validID(e.id)||!validID(e.from)||!validID(e.to)||!states.includes(e.from)||!states.includes(e.to)||
     !Array.isArray(e.source_refs)||e.source_refs.length>8||[...e.source_refs].some(x=>!validID(x)))invalid('GOAL_EDGE');
  if(seen.has(e.id))invalid('DUPLICATE_GOAL_EDGE');seen.add(e.id);
 }
 const goals=input.goals;if(!Array.isArray(goals)||!goals.length||goals.length>8)invalid('GOALS_LIMIT');
 const gseen=new Set();
 for(const g of goals){
  if(!g||typeof g!=='object'||Array.isArray(g)||Object.keys(g).some(k=>!['id','target_state','sign'].includes(k))||
     !validID(g.id)||!validID(g.target_state)||!states.includes(g.target_state)||!INTENT.has(g.sign))invalid('GOAL_FIELDS');
  if(gseen.has(g.id))invalid('DUPLICATE_GOAL_ID');gseen.add(g.id);
 }
 const hasRemoval=Object.hasOwn(input,'remove_transition_id');
 const remove=hasRemoval?input.remove_transition_id:null;
 if(hasRemoval&&!validID(remove))invalid('INVALID_REMOVED_TRANSITION');
 if(hasRemoval&&!seen.has(remove))invalid('UNKNOWN_REMOVED_TRANSITION');
 const byId=new Map(t.map(e=>[e.id,e]));
 // Source references are caller declarations, not authenticated ownership.
 // Report each scenario's path binding without vacuous success for an absent path.
 const cases=goals.map(g=>{
  const all=withPathBinding(graphSearch(states,t,start,g.target_state),byId);
  const variant=hasRemoval?withPathBinding(graphSearch(states,t.filter(e=>e.id!==remove),start,g.target_state),byId):null;
  return {goal_id:g.id,sign:g.sign,target_state:g.target_state,baseline:all,
    path_source_bound:all.path_source_bound,unbound_transition_ids:all.unbound_transition_ids,
    deletion_counterfactual:variant?{removed_transition_id:remove,...variant,
      material_reachability_change:all.reachability!==variant.reachability}:null,
    intent_inferred:false,outcome_observed:false,source_authenticated:false,
    status:'FINITE_DECLARED_MODEL_ONLY'};
 });
 return {version:'MPC_REVERSE_GOAL_TRAVERSAL_1.0',status:'BOUNDED_GRAPH_REVIEW_COMPLETE',
  subject_id:input.subject_id,start_state:start,state_count:states.length,transition_count:t.length,goal_review:cases,
  variation_kind:hasRemoval?'SINGLE_EDGE_REMOVAL_SYNTHETIC':'NONE',
  no_target_actions:true,no_intent_or_guilt_determination:true,
  no_evidence_authentication:true,canonical_promotion:false};
}
