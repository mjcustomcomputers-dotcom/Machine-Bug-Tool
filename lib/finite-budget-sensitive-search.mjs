// Bounded metareasoning over one caller-supplied finite search tree. Each
// expansion consumes the same integer amount from an explicit computation
// budget and from terminal utility. Dynamic programming is cross-checked with
// the retained Selten evaluator. This is not a general planner or target search.
import {createHash} from 'node:crypto';
import {canonical} from './universal.mjs';
import {evaluateMethod} from './methods.mjs';

const VERSION='MPC_FINITE_BUDGET_SENSITIVE_SEARCH_V1';
const ID=/^[A-Za-z0-9_:.-]{1,200}$/u;
const MAX_NODES=15,MAX_BRANCHING=3,MAX_DEPTH=8,MAX_BUDGET=1_000_000,MAX_UTILITY=1_000_000;
const fail=(code,detail='')=>{throw Error(code+(detail?':'+detail:''));};
const copy=value=>structuredClone(value);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');

export const budgetSensitiveSearchContract=Object.freeze({
 version:VERSION,model_scope:'ONE_FINITE_CALLER_SUPPLIED_ROOTED_SEARCH_TREE',max_nodes:MAX_NODES,
 max_branching:MAX_BRANCHING,max_depth:MAX_DEPTH,max_budget:MAX_BUDGET,integer_utility_bound:MAX_UTILITY,
 native_methods_used:['selten'],native_evaluator_added:false,
 objective:'MAXIMIZE_SUPPLIED_GROSS_UTILITY_MINUS_CUMULATIVE_COMPUTATION_COST_WITHIN_BUDGET',
 independent_oracle_requirement:'ENUMERATE_EVERY_AFFORDABLE_STOP_AND_TERMINAL_PATH_SEPARATELY',
 general_planner:false,target_search:false,source_authentication:false,canonical_registry_mutation:false
});

function record(value,allowed,required,name){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('INVALID_'+name);
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 for(const key of keys){
  const descriptor=descriptors[key];
  if(typeof key!=='string'||!allowed.includes(key)||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('INVALID_'+name+'_FIELD');
 }
 if(required.some(key=>!Object.hasOwn(descriptors,key)))fail('MISSING_'+name+'_FIELD');
 return value;
}

function array(value,min,max,name){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<min||value.length>max)fail('INVALID_'+name+'_BOUNDS');
 for(const key of Reflect.ownKeys(value)){
  if(key==='length')continue;
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(typeof key!=='string'||!/^(0|[1-9][0-9]*)$/u.test(key)||Number(key)>=value.length||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('INVALID_'+name+'_FIELD');
 }
 for(let index=0;index<value.length;index++)if(!Object.hasOwn(value,index))fail('SPARSE_'+name);
 return value;
}

function integer(value,min,max,name){
 if(!Number.isSafeInteger(value)||value<min||value>max)fail('INVALID_'+name);
 return value;
}

function identifier(value,name){
 if(typeof value!=='string'||!ID.test(value))fail('INVALID_'+name);
 return value;
}

function validate(input){
 record(input,['search_id','budget','root','nodes'],['search_id','budget','root','nodes'],'SEARCH_REQUEST');
 const searchId=identifier(input.search_id,'SEARCH_ID'),budget=integer(input.budget,0,MAX_BUDGET,'SEARCH_BUDGET'),root=identifier(input.root,'SEARCH_ROOT');
 const ids=new Set(),expansionIds=new Set();
 const nodes=array(input.nodes,2,MAX_NODES,'SEARCH_NODES').map((raw,index)=>{
  record(raw,['id','kind','stop_utility','expansions','utility'],['id','kind'],'SEARCH_NODE');
  const id=identifier(raw.id,'NODE_ID');if(ids.has(id))fail('DUPLICATE_NODE_ID',id);ids.add(id);
  if(raw.kind==='TERMINAL'){
   if(!Object.hasOwn(raw,'utility')||Object.hasOwn(raw,'stop_utility')||Object.hasOwn(raw,'expansions'))fail('INVALID_TERMINAL_NODE_SHAPE',id);
   return {id,kind:'TERMINAL',utility:integer(raw.utility,-MAX_UTILITY,MAX_UTILITY,'TERMINAL_UTILITY_'+index)};
  }
  if(raw.kind!=='SEARCH'||!Object.hasOwn(raw,'stop_utility')||!Object.hasOwn(raw,'expansions')||Object.hasOwn(raw,'utility'))fail('INVALID_SEARCH_NODE_SHAPE',id);
  const expansions=array(raw.expansions,1,MAX_BRANCHING,'SEARCH_EXPANSIONS').map((edge,edgeIndex)=>{
   record(edge,['id','to','cost'],['id','to','cost'],'SEARCH_EXPANSION');
   const expansionId=identifier(edge.id,'EXPANSION_ID');if(expansionIds.has(expansionId))fail('DUPLICATE_EXPANSION_ID',expansionId);expansionIds.add(expansionId);
   return {id:expansionId,to:identifier(edge.to,'EXPANSION_TARGET'),cost:integer(edge.cost,1,MAX_BUDGET,'EXPANSION_COST_'+index+'_'+edgeIndex)};
  });
  return {id,kind:'SEARCH',stop_utility:integer(raw.stop_utility,-MAX_UTILITY,MAX_UTILITY,'STOP_UTILITY_'+index),expansions};
 });
 const map=new Map(nodes.map(node=>[node.id,node]));if(!map.has(root))fail('MISSING_ROOT_NODE');if(map.get(root).kind!=='SEARCH')fail('ROOT_SEARCH_NODE_REQUIRED');
 const seen=new Set(),active=new Set();
 function walk(id,depth){
  if(depth>MAX_DEPTH)fail('SEARCH_DEPTH_LIMIT');
  if(active.has(id))fail('SEARCH_TREE_CYCLE',id);if(seen.has(id))fail('SEARCH_TREE_SHARED_CHILD',id);
  const node=map.get(id);if(!node)fail('MISSING_SEARCH_NODE',id);seen.add(id);active.add(id);
  if(node.kind==='SEARCH')for(const edge of node.expansions)walk(edge.to,depth+1);
  active.delete(id);
 }
 walk(root,0);if(seen.size!==nodes.length)fail('UNREACHABLE_SEARCH_NODE');
 return {search_id:searchId,budget,root,nodes};
}

function choosePlan(model){
 const map=new Map(model.nodes.map(node=>[node.id,node]));
 function solve(id,remaining){
  const node=map.get(id);
  if(node.kind==='TERMINAL')return {status:'EXPAND_TO_TERMINAL',ending_node_id:id,gross_utility:node.utility,computation_cost:0,net_utility:node.utility,expansion_ids:[],node_path:[id]};
  let best={status:'STOP',ending_node_id:id,gross_utility:node.stop_utility,computation_cost:0,net_utility:node.stop_utility,expansion_ids:[],node_path:[id]};
  for(const edge of node.expansions){
   if(edge.cost>remaining)continue;
   const child=solve(edge.to,remaining-edge.cost),candidate={...child,
    status:child.status==='STOP'?'EXPAND_THEN_STOP':child.status,
    computation_cost:edge.cost+child.computation_cost,
    net_utility:child.gross_utility-edge.cost-child.computation_cost,
    expansion_ids:[edge.id,...child.expansion_ids],node_path:[id,...child.node_path]};
   if(candidate.net_utility>best.net_utility)best=candidate;
  }
  return best;
 }
 return solve(model.root,model.budget);
}

function enumerateCandidates(model){
 const map=new Map(model.nodes.map(node=>[node.id,node])),rows=[];
 function walk(id,remaining,cost,expansionIds,nodePath){
  const node=map.get(id);
  if(node.kind==='TERMINAL'){
   rows.push({status:'EXPAND_TO_TERMINAL',ending_node_id:id,gross_utility:node.utility,computation_cost:cost,net_utility:node.utility-cost,expansion_ids:expansionIds,node_path:[...nodePath,id]});return;
  }
  rows.push({status:expansionIds.length?'EXPAND_THEN_STOP':'STOP',ending_node_id:id,gross_utility:node.stop_utility,computation_cost:cost,net_utility:node.stop_utility-cost,expansion_ids:expansionIds,node_path:[...nodePath,id]});
  for(const edge of node.expansions)if(edge.cost<=remaining)walk(edge.to,remaining-edge.cost,cost+edge.cost,[...expansionIds,edge.id],[...nodePath,id]);
 }
 walk(model.root,model.budget,0,[],[]);return rows;
}

function toSelten(model){
 const map=new Map(model.nodes.map(node=>[node.id,node])),nodes=[];
 function walk(id,remaining,cost){
  const node=map.get(id);
  if(node.kind==='TERMINAL'){nodes.push({id,payoffs:[node.utility-cost,-cost]});return;}
  const children=['stop:'+id];nodes.push({id,player:0,children});
  nodes.push({id:'stop:'+id,payoffs:[node.stop_utility-cost,-cost]});
  for(const edge of node.expansions)if(edge.cost<=remaining){children.push(edge.to);walk(edge.to,remaining-edge.cost,cost+edge.cost);}
 }
 walk(model.root,model.budget,0);return {root:model.root,nodes};
}

function nativePlan(model,receipt){
 const map=new Map(model.nodes.map(node=>[node.id,node])),choices=new Map(receipt.result.choices.map(choice=>[choice.node,choice.chosen]));
 const expansionIds=[],nodePath=[];let id=model.root,status='STOP';
 while(true){
  nodePath.push(id);const node=map.get(id);if(node.kind==='TERMINAL'){status='EXPAND_TO_TERMINAL';break;}
  const chosen=choices.get(id);if(chosen==='stop:'+id){status=expansionIds.length?'EXPAND_THEN_STOP':'STOP';break;}
  const edge=node.expansions.find(row=>row.to===chosen);if(!edge)fail('NATIVE_SEARCH_PLAN_UNMAPPED',id);
  expansionIds.push(edge.id);id=edge.to;
 }
 return {status,ending_node_id:id,expansion_ids:expansionIds,node_path:nodePath};
}

/** Evaluate one bounded search tree. Search cost is both an explicit budget
 * debit and a utility debit; all quantities are supplied bounded integers.
 */
export async function evaluateFiniteBudgetSensitiveSearch(input){
 const model=validate(input),selected=choosePlan(model),enumerated=enumerateCandidates(model);
 const nativeReceipt=await evaluateMethod({method:'selten',input:toSelten(model)}),native=nativePlan(model,nativeReceipt);
 if(nativeReceipt.result.root_payoffs[0]!==selected.net_utility||canonical(native.expansion_ids)!==canonical(selected.expansion_ids)||native.ending_node_id!==selected.ending_node_id)fail('NATIVE_BACKWARD_INDUCTION_CROSSCHECK_MISMATCH');
 const rootStop=model.nodes.find(node=>node.id===model.root).stop_utility;
 return {version:VERSION,status:'FINITE_BUDGET_SENSITIVE_SEARCH_EVALUATED',request_fingerprint:hash(model),supplied_search:model,
  selected_plan:selected,enumerated_candidates:enumerated,affordable_candidate_count:enumerated.length,
  search_improves_decision:selected.net_utility>rootStop,native_plan:native,native_receipt:nativeReceipt,
  oracle:'Finite dynamic programming over every affordable stop/expand branch; cumulative expansion cost is subtracted from supplied gross utility. The curriculum separately enumerates every affordable path.',
  tie_rule:'STOP_FIRST_THEN_SUPPLIED_EXPANSION_ORDER',
  boundaries:{general_planner:false,target_search:false,probabilities_inferred:false,hidden_state_inferred:false,native_evaluator_added:false,source_authentication:false,target_actions_performed:false,canonical_promotion:false,registry_mutation:false,persisted:false},
  limitations:['One supplied finite rooted tree only; no graph search, target enumeration, learned heuristic, probabilistic belief update, CFR or general planning.','A selected plan is optimal only for the supplied integer utilities, costs, budget and complete finite tree declaration.']};
}
