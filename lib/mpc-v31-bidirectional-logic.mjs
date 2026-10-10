// MPC V31 — two independent finite Horn engines and proof-provenance antichains.
// Forward saturation (all rules) versus backward goal-specific AND/OR proof search.
// All sources and rules are caller supplied; output contains exact source handles.
import {createHash} from 'node:crypto';

const fail = code => {throw Error(code);};
const ID=/^[A-Za-z0-9][A-Za-z0-9_:./@-]{0,111}$/u;
const SYMBOL=/^[A-Z][A-Z0-9_]{0,39}$/u;
const COMMIT=/^[a-f0-9]{40}$/u;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(x));
const unique=x=>[...new Set(x)];
const sort=x=>unique(x).sort();
const dense=x=>Array.isArray(x)&&Array.from({length:x.length},(_,i)=>Object.hasOwn(x,i)).every(Boolean);
const fields=(x,allowed,label)=>{if(!obj(x)||Object.keys(x).some(k=>!allowed.includes(k)))fail('INVALID_'+label+'_FIELDS');};
const good=x=>typeof x==='string'&&ID.test(x);
const normal=(groups)=>{
 const signatures=new Set(),a=[];
 for(const original of groups){
  const row=sort(original),k=row.join('|');
  if(signatures.has(k))continue;
  signatures.add(k);a.push(row);
 }
 a.sort((x,y)=>x.length-y.length||x.join('|').localeCompare(y.join('|')));
 const r=[];
 for(const candidate of a){
  if(r.some(sub=>sub.every(id=>candidate.includes(id))))continue;
  r.push(candidate);
 }
 if(r.length>128)fail('V31_PROOF_ANTICHAIN_BUDGET');
 return r;
};
const listEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const CONTEXT=['source_commit','scope_id','subject_id','source_ref','source_owner','source_version'];
const CONTEXT_CHECK=ctx=>{
 if(!obj(ctx)||!COMMIT.test(ctx.source_commit||'')||
  CONTEXT.slice(1).some(k=>!good(ctx[k])))fail('INVALID_V31_SOURCE_CONTEXT');
 return Object.fromEntries(CONTEXT.map(k=>[k,ctx[k]]));
};
export const bidirectionalV31Contract=Object.freeze({
 version:'MPC_V31_FINITE_AND_OR_HORN_1',
 max_facts:12,max_rules:24,max_premises:4,max_symbols:40,
 max_proof_antichain:128,max_steps:60,max_backward_calls:8192,
 positive_horn_only:true,source_owner_binding:true,
 forward_backward_independent:true,
 fact_truth_authenticated:false,canonical_promotion:false
});
export function validateHornModelV31(input){
 fields(input,[...CONTEXT,'world','facts','rules','goal'],'HORN_MODEL');
 const ctx=CONTEXT_CHECK(input);
 if(!['RECORD','SYNTHETIC'].includes(input.world)||!SYMBOL.test(input.goal||'')||
  !dense(input.facts)||input.facts.length>12||
  !dense(input.rules)||input.rules.length>24)fail('INVALID_V31_HORN_BOUND');
 const ids=new Set(),refs=new Map(),symbols=new Set([input.goal]),facts=[],rules=[];
 const sourceBind=(x,label)=>{
  for(const k of ['source_ref','source_owner','source_version'])if(!good(x[k]))
   fail('INVALID_'+label+'_SOURCE');
  const prev=refs.get(x.source_ref);
  if(prev&&(prev.owner!==x.source_owner||prev.version!==x.source_version))
    fail('V31_NATIVE_SOURCE_VERSION_CONFLICT');
  refs.set(x.source_ref,{owner:x.source_owner,version:x.source_version});
 };
 for(const f of input.facts){
  fields(f,['id','symbol','state','source_ref','source_owner','source_version'],'HORN_FACT');
  if(!good(f.id)||ids.has(f.id)||!SYMBOL.test(f.symbol||'')||
    !['SYNTHETIC','OBSERVED','CLAIMED','UNKNOWN'].includes(f.state)||
    input.world==='SYNTHETIC'&&!['SYNTHETIC','UNKNOWN'].includes(f.state)||
    input.world==='RECORD'&&f.state==='SYNTHETIC')fail('INVALID_HORN_FACT');
  ids.add(f.id);sourceBind(f,'HORN_FACT');symbols.add(f.symbol);facts.push(f);
 }
 for(const r of input.rules){
  fields(r,['id','premises','conclusion','source_ref','source_owner','source_version'],'HORN_RULE');
  if(!good(r.id)||ids.has(r.id)||!SYMBOL.test(r.conclusion||'')||
    !dense(r.premises)||r.premises.length<1||r.premises.length>4||
    r.premises.some(x=>!SYMBOL.test(x))||
    unique(r.premises).length!==r.premises.length)fail('INVALID_HORN_RULE');
  ids.add(r.id);sourceBind(r,'HORN_RULE');
  for(const p of r.premises)symbols.add(p);
  symbols.add(r.conclusion);rules.push(r);
 }
 if(symbols.size>40)fail('V31_SYMBOL_BUDGET');
 return {...ctx,world:input.world,goal:input.goal,
  facts:facts.slice().sort((a,b)=>a.id.localeCompare(b.id)),
  rules:rules.slice().sort((a,b)=>a.id.localeCompare(b.id)),
  input_digest:sha(input),unique_symbols:[...symbols].sort()};
}
function supportedSeeds(model,excludedIds=new Set(),extras=[]){
 const seeds=model.facts.filter(f=>!excludedIds.has(f.id)&&
  (f.state==='OBSERVED'||f.state==='SYNTHETIC'));
 return [...seeds,...extras];
}
function mergedCartesian(all,max=128){
 let environments=[[]];
 for(const sets of all){
  const next=[];
  for(const prefix of environments)for(const support of sets){
   next.push(sort([...prefix,...support]));
   if(next.length>8192)fail('V31_PROOF_CANDIDATE_BUDGET');
  }
  environments=normal(next);
 }
 return environments;
}
function forwardRaw(model,{excludedIds=new Set(),extras=[],rules=model.rules}={}){
 const known=new Map(),keys=new Set(),seeds=supportedSeeds(model,excludedIds,extras);
 for(const f of seeds){
  const prev=known.get(f.symbol)??[];
  known.set(f.symbol,normal([...prev,[f.id]]));
 }
 let rule_checks=0,fixpoint_steps=0,changed=true;
 while(changed){
  if(++fixpoint_steps>60)fail('V31_FIXPOINT_BUDGET');
  changed=false;
  for(const r of rules){
   rule_checks++;
   const premises=r.premises.map(symbol=>known.get(symbol)??[]);
   if(premises.some(x=>!x.length))continue;
   const additions=mergedCartesian(premises);
   const prev=known.get(r.conclusion)??[],
    current=normal([...prev,...additions]);
   if(!listEqual(current,prev)){known.set(r.conclusion,current);changed=true;}
  }
 }
 return {known,rule_checks,fixpoint_steps,seeds};
}
export function forwardHornV31(input){
 const model=validateHornModelV31(input),p=forwardRaw(model);
 return {version:bidirectionalV31Contract.version,direction:'FORWARD',
  source_commit:model.source_commit,scope_id:model.scope_id,subject_id:model.subject_id,
  input_digest:model.input_digest,goal:model.goal,
  status:p.known.has(model.goal)?'GOAL_DERIVABLE_IN_FINITE_MODEL':'GOAL_UNSUPPORTED_IN_FINITE_MODEL',
  reachable_symbols:[...p.known.keys()].sort(),
  goal_minimal_fact_supports:p.known.get(model.goal)??[],
  all_symbol_supports:Object.fromEntries([...p.known].sort((a,b)=>a[0].localeCompare(b[0]))),
  declared_seed_ids:p.seeds.map(f=>f.id).sort(),
  declared_unknown_fact_ids:model.facts.filter(f=>!['OBSERVED','SYNTHETIC'].includes(f.state)).map(f=>f.id),
  rule_checks:p.rule_checks,fixpoint_rounds:p.fixpoint_steps,
  source_authenticated:false,real_world_goal_verified:false,
  native_evaluators_added:0,canonical_promotion:false};
}
export function backwardHornV31(input){
 const model=validateHornModelV31(input);
 const byGoal=new Map(),bySymbol=new Map();
 for(const r of model.rules){const x=byGoal.get(r.conclusion)??[];x.push(r);byGoal.set(r.conclusion,x);}
 for(const f of supportedSeeds(model)){
  const a=bySymbol.get(f.symbol)??[];a.push(f);bySymbol.set(f.symbol,a);
 }
 let calls=0,rule_checks=0;
 const cycles=new Set(),missing=new Set();
 function prove(symbol,parents){
  if(++calls>8192)fail('V31_BACKWARD_CALL_BUDGET');
  if(parents.includes(symbol)){cycles.add(symbol);return [];}
  const direct=(bySymbol.get(symbol)??[]).map(f=>[f.id]);
  const environments=[...direct],parent=[...parents,symbol];
  for(const rule of byGoal.get(symbol)??[]){
   rule_checks++;
   const subproofs=rule.premises.map(p=>prove(p,parent));
   if(subproofs.some(x=>x.length===0))continue;
   environments.push(...mergedCartesian(subproofs));
   if(environments.length>8192)fail('V31_BACKWARD_PROOF_CANDIDATE_BUDGET');
  }
  const result=normal(environments);
  if(!result.length&&!(byGoal.get(symbol)?.length))missing.add(symbol);
  return result;
 }
 const proofs=prove(model.goal,[]);
 return {version:bidirectionalV31Contract.version,direction:'BACKWARD',
  source_commit:model.source_commit,scope_id:model.scope_id,subject_id:model.subject_id,
  input_digest:model.input_digest,goal:model.goal,
  status:proofs.length?'GOAL_DERIVABLE_IN_FINITE_MODEL':'GOAL_UNSUPPORTED_IN_FINITE_MODEL',
  goal_minimal_fact_supports:proofs,
  missing_leaf_symbols:[...missing].sort(),cycle_symbols:[...cycles].sort(),
  rules_inspected:rule_checks,goal_calls:calls,
  source_authenticated:false,real_world_goal_verified:false,
  native_evaluators_added:0,canonical_promotion:false};
}
export function compareDirectionsV31(input){
 const a=forwardHornV31(input),b=backwardHornV31(input);
 const agrees=listEqual(a.goal_minimal_fact_supports,b.goal_minimal_fact_supports)&&a.status===b.status;
 return {version:'MPC_V31_INDEPENDENT_BIDIRECTIONAL_REPLAY_1',
  goal:a.goal,source_commit:a.source_commit,scope_id:a.scope_id,subject_id:a.subject_id,
  input_digest:a.input_digest,
  state:agrees?'FORWARD_BACKWARD_PROOF_AGREEMENT':'METHOD_DISAGREEMENT_REVIEW_REQUIRED',
  forward:a,backward:b,
  forward_rule_checks:a.rule_checks,backward_rule_checks:b.rules_inspected,
  exact_minimal_provenance_agreement:agrees,
  cheaper_declared_workload:a.rule_checks<b.rules_inspected?'FORWARD':
    a.rule_checks>b.rules_inspected?'BACKWARD':'TIE',
  source_authenticated:false,factual_truth_verified:false,
  canonical_promotion:false};
}
// Validate a caller-supplied model again at every use; no stale derived
// provenance may cross a source/version boundary.
export function forwardWithSeedModificationsV31(input,changes={}){
 const model=validateHornModelV31(input);
 fields(changes,['remove_seed_ids','hypothetical_seeds'],'SEED_MODIFICATIONS');
 const remove=new Set(changes.remove_seed_ids??[]);
 if(!dense(changes.remove_seed_ids??[])||
    [...remove].some(id=>!model.facts.some(f=>f.id===id)))fail('INVALID_SEED_RETRACTION');
 const extra=changes.hypothetical_seeds??[];
 if(!dense(extra)||extra.length>8)fail('INVALID_SEED_ADDITION');
 const allIds=new Set(model.facts.map(f=>f.id));
 for(const f of extra){
  fields(f,['id','symbol'],'HYPOTHETICAL_SEED');
  if(!good(f.id)||allIds.has(f.id)||!SYMBOL.test(f.symbol||''))
   fail('INVALID_HYPOTHETICAL_SEED');
  allIds.add(f.id);
 }
 const result=forwardRaw(model,{excludedIds:remove,extras:extra});
 return {status:result.known.has(model.goal)?'GOAL_DERIVABLE_IN_FINITE_MODEL':'GOAL_UNSUPPORTED_IN_FINITE_MODEL',
  goal_minimal_fact_supports:result.known.get(model.goal)??[],
  steps:result.rule_checks,seed_count:result.seeds.length,
  hypothetical_model_only:true};
}
