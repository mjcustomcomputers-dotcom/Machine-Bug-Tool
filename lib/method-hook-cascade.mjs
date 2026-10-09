// Finite method-on-method hook traversal. Typed, deterministic and read-only.
// No recursive LLM calls, target traffic, source authentication or claim promotion.
const ID=/^MHA-[0-9]{4}$/u;
const RELATION_TYPES=['CHALLENGE','CROSS_CHECK','COMPLEMENT'];
const priority=new Map(RELATION_TYPES.map((x,i)=>[x,i]));
const fail=s=>{throw Error(s)};
const rows=r=>Array.isArray(r)?r:Array.isArray(r?.results)?r.results:fail('INVALID_DATABASE_ROWS');
const distinct=(x)=>new Set(x).size===x.length;

export const hookCascadeContract=Object.freeze({
 version:'MPC_METHOD_HOOK_CASCADE_1.0',maximum_depth:3,maximum_nodes:24,maximum_edges:48,
 index_usage:'ATLAS_METHOD_RELATIONS_METHOD_ID',automatic_method_execution:false,
 recursive_model_calls:false,source_authentication:false,target_traffic:false,
 independent_evidence_proven:false,canonical_promotion:false
});

export async function traceMethodHooks(db,input){
 if(!db||typeof db.prepare!=='function')fail('DATABASE_ADAPTER_REQUIRED');
 if(!input||typeof input!=='object'||Array.isArray(input))fail('CASCADE_INPUT_REQUIRED');
 const allowed=['root_method_ids','max_depth','max_nodes','max_edges','relations'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))fail('UNKNOWN_CASCADE_INPUT');
 const roots=input.root_method_ids;
 if(!Array.isArray(roots)||!roots.length||roots.length>4||!distinct(roots)||roots.some(id=>typeof id!=='string'||!ID.test(id)))fail('INVALID_CASCADE_ROOTS');
 const max_depth=input.max_depth??2,max_nodes=input.max_nodes??16,max_edges=input.max_edges??32;
 if(!Number.isInteger(max_depth)||max_depth<0||max_depth>3||!Number.isInteger(max_nodes)||max_nodes<roots.length||max_nodes>24||!Number.isInteger(max_edges)||max_edges<1||max_edges>48)fail('CASCADE_BUDGET_VIOLATION');
 const relations=input.relations??RELATION_TYPES;
 if(!Array.isArray(relations)||!relations.length||relations.length>3||!distinct(relations)||relations.some(t=>!priority.has(t)))fail('INVALID_RELATION_FILTER');
 const sortedRoots=[...roots].sort();
 const found=rows(await db.prepare('SELECT method_id,method_name,family,implementation_state FROM atlas_methods WHERE method_id IN ('+sortedRoots.map(()=>'?').join(',')+') ORDER BY method_id').bind(...sortedRoots).all());
 if(found.length!==sortedRoots.length||found.some((m,i)=>m.method_id!==sortedRoots[i]))fail('CASCADE_UNKNOWN_METHOD');
 const visited=new Map(sortedRoots.map(id=>[id,0]));
 let frontier=[...sortedRoots];
 const edges=[],cycleEdges=[],nodes=new Map(found.map(m=>[m.method_id,{...m,depth:0,execution:'NOT_EXECUTED',source_authentication:false}]));
 let stopped='EXHAUSTED';
 for(let depth=0;depth<max_depth&&frontier.length;depth++){
  const current=frontier.sort();
  const q='SELECT r.method_id,r.related_method_id,r.relation_type,r.rationale,r.link_status,r.evidence_independent,m.method_name,m.family,m.implementation_state FROM atlas_method_relations r JOIN atlas_methods m ON m.method_id=r.related_method_id WHERE r.method_id IN ('+current.map(()=>'?').join(',')+') ORDER BY r.method_id,r.related_method_id,r.relation_type';
  const all=rows(await db.prepare(q).bind(...current).all()).filter(r=>relations.includes(r.relation_type))
    .sort((a,b)=>a.method_id.localeCompare(b.method_id)||priority.get(a.relation_type)-priority.get(b.relation_type)||a.related_method_id.localeCompare(b.related_method_id));
  const next=[];
  for(const edge of all){
   if(edges.length+cycleEdges.length>=max_edges){stopped='EDGE_BUDGET';break}
   const known=visited.has(edge.related_method_id);
   const item={from_method_id:edge.method_id,to_method_id:edge.related_method_id,relation_type:edge.relation_type,
    rationale:edge.rationale,link_status:edge.link_status,depth:depth+1,back_reference:known,
    evidence_independent:false,method_execution:'NOT_EXECUTED'};
   if(known){cycleEdges.push(item);continue}
   if(visited.size>=max_nodes){stopped='NODE_BUDGET';break}
   visited.set(edge.related_method_id,depth+1);
   nodes.set(edge.related_method_id,{method_id:edge.related_method_id,method_name:edge.method_name,family:edge.family,implementation_state:edge.implementation_state,depth:depth+1,execution:'NOT_EXECUTED',source_authentication:false});
   edges.push(item);next.push(edge.related_method_id);
  }
  if(stopped!=='EXHAUSTED')break;
  frontier=next;
  if(frontier.length&&depth+1===max_depth)stopped='DEPTH_BUDGET';
 }
 return {status:'FINITE_HOOK_CASCADE_PLAN',contract:hookCascadeContract,root_method_ids:sortedRoots,
  method_nodes:[...nodes.values()].sort((a,b)=>a.depth-b.depth||a.method_id.localeCompare(b.method_id)),
  proposed_edges:edges,back_references:cycleEdges,
  visited_count:visited.size,edge_count:edges.length+cycleEdges.length,max_depth,max_nodes,max_edges,stop_reason:stopped,
  next_step:'Resolve required inputs, source owners, negative controls and method readiness independently; the graph is not an execution plan or corroboration.',
  no_methods_executed:true,no_target_actions:true,independent_evidence_proven:false,canonical_promotion:false};
}
