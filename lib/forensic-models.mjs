// Bounded checks of supplied records. No generated target interactions or hypothetical attack traces.
const s={type:'string',minLength:1,maxLength:200},value={type:'string',maxLength:500};
const integer={type:'integer',minimum:0,maximum:1000000000};
const time={type:'integer',minimum:0,maximum:9000000000000};
const obj=p=>({type:'object',properties:p,required:Object.keys(p),additionalProperties:false});
const arr=(items,max=64,min=0)=>({type:'array',items,minItems:min,maxItems:max});
const en=(...xs)=>({type:'string',enum:xs});
const fields=arr(obj({field:s,value}),16);
const row=obj({id:s,fields,source_ref:s});
const event=obj({id:s,subject:s,kind:s,time,source_ref:s});
export const forensicSchemas={
 ledger:obj({accounts:arr(obj({id:s,unit:s,opening:integer,observed_closing:integer,source_ref:s}),32,1),transfers:arr(obj({id:s,from:s,to:s,amount:integer,source_ref:s}),128)}),
 relational:obj({rows:arr(row,64,1),rules:arr(obj({id:s,kind:en('UNIQUE','FOREIGN_KEY','EQUAL_FIELDS'),field:s,other_field:s,source_ref:s}),16,1)}),
 partial_order:obj({events:arr(obj({id:s,source_ref:s}),64,1),precedes:arr(obj({before:s,after:s,source_ref:s}),128),observed_order:arr(s,64,1)}),
 metamorphic:obj({left:obj({id:s,controls:fields,observations:fields,source_ref:s}),right:obj({id:s,controls:fields,observations:fields,source_ref:s}),changed_control:s}),
 temporal:obj({events:arr(event,64),rules:arr(obj({id:s,trigger:s,required_prior:s,max_age_ms:time,source_ref:s}),16,1),window_start:time,window_end:time}),
 identity_graph:obj({nodes:arr(obj({id:s,namespace:s,native_id:s,version:s,owner:s,label:s,source_ref:s}),64,1),links:arr(obj({from:s,to:s,kind:en('SAME_IDENTITY','PARENT'),source_ref:s}),128)}),
 authority_graph:obj({rules:arr(obj({id:s,actor:s,subject:s,action:s,source_ref:s}),64),records:arr(obj({id:s,actor:s,subject:s,action:s,state:en('DISPLAYED','PENDING','FINALIZED','PAID'),source_ref:s}),64),rule_set_complete:{type:'boolean'}})
};
const fail=m=>{throw Error(m)};
function unique(xs){if(new Set(xs).size!==xs.length)fail('DUPLICATE_ID')}
function index(rows){unique(rows.map(x=>x.id));return new Map(rows.map(x=>[x.id,x]))}
function fieldMap(xs){unique(xs.map(x=>x.field));return new Map(xs.map(x=>[x.field,x.value]))}
function refsExist(edges,nodes,a,b){for(const e of edges)if(!nodes.has(e[a])||!nodes.has(e[b]))fail('UNRESOLVED_NODE_REFERENCE')}
function cycle(nodes,edges){const next=new Map([...nodes.keys()].map(k=>[k,[]]));for(const [a,b]of edges)next.get(a).push(b);const active=new Set(),done=new Set();function visit(k){if(active.has(k))return true;if(done.has(k))return false;active.add(k);for(const n of next.get(k))if(visit(n))return true;active.delete(k);done.add(k);return false}return [...nodes.keys()].some(visit)}
export const forensicFunctions={
 ledger({accounts,transfers}){
  const map=index(accounts);unique(transfers.map(t=>t.id));const balance=new Map(accounts.map(a=>[a.id,a.opening]));
  for(const t of transfers){const from=map.get(t.from),to=map.get(t.to);if(!from||!to)fail('UNRESOLVED_ACCOUNT');if(from.unit!==to.unit)fail('CROSS_UNIT_TRANSFER_REQUIRES_SEPARATE_CONVERSION_RECORDS');if(t.from===t.to)fail('SELF_TRANSFER');balance.set(t.from,balance.get(t.from)-t.amount);balance.set(t.to,balance.get(t.to)+t.amount)}
  return {accounts:accounts.map(a=>({...a,expected_closing:balance.get(a.id),residual:a.observed_closing-balance.get(a.id)})),units:[...new Set(accounts.map(a=>a.unit))].map(unit=>{const xs=accounts.filter(a=>a.unit===unit);return {unit,opening:xs.reduce((v,a)=>v+a.opening,0),observed_closing:xs.reduce((v,a)=>v+a.observed_closing,0)}}),transfer_count:transfers.length,transfers,boundary:'CLOSED_SUPPLIED_ACCOUNTS',external_accounts_must_be_explicit:true,negative_expected_balances_are_observations:true,mismatch_proves_loss:false};
 },
 relational({rows,rules}){
  index(rows);index(rules);const maps=new Map(rows.map(r=>[r.id,fieldMap(r.fields)]));
  return {rules:rules.map(rule=>{const violations=[],unknown=[];const seen=new Map();for(const row of rows){const f=maps.get(row.id);if(!f.has(rule.field)){unknown.push(row.id);continue}const v=f.get(rule.field);
   if(rule.kind==='UNIQUE'){if(seen.has(v))violations.push({row_ids:[seen.get(v),row.id]});else seen.set(v,row.id)}
   else if(rule.kind==='EQUAL_FIELDS'){if(!f.has(rule.other_field))unknown.push(row.id);else if(v!==f.get(rule.other_field))violations.push({row_ids:[row.id]})}
   else{const matches=rows.filter(r=>maps.get(r.id).get(rule.other_field)===v&&maps.get(r.id).has(rule.other_field));if(!matches.length){if(rows.some(r=>!maps.get(r.id).has(rule.other_field)))unknown.push(row.id);else violations.push({row_ids:[row.id]})}}
  }return {rule_id:rule.id,status:violations.length?'MISMATCH_IN_SUPPLIED_ROWS':unknown.length?'INCOMPLETE':'MATCH_IN_SUPPLIED_ROWS',violations,unknown_row_ids:unknown,rule_source_ref:rule.source_ref}}),rows:rows.map(r=>({id:r.id,source_ref:r.source_ref})),scope:'SUPPLIED_ROWS_ONLY',model_search_performed:false,global_completeness_proven:false};
 },
 partial_order({events,precedes,observed_order}){
  const nodes=index(events);refsExist(precedes,nodes,'before','after');unique(observed_order);if(observed_order.length!==events.length||observed_order.some(x=>!nodes.has(x)))fail('OBSERVED_ORDER_MUST_COVER_EACH_EVENT');if(cycle(nodes,precedes.map(e=>[e.before,e.after])))fail('CYCLIC_PRECEDENCE');const pos=new Map(observed_order.map((id,i)=>[id,i]));return {violations:precedes.filter(e=>pos.get(e.before)>=pos.get(e.after)),events,declared_precedence_count:precedes.length,observed_order,unconstrained_pairs_are_concurrent:false,causal_order_authenticated:false,alternative_schedules_generated:false};
 },
 metamorphic({left,right,changed_control}){
  const l=fieldMap(left.controls),r=fieldMap(right.controls),lo=fieldMap(left.observations),ro=fieldMap(right.observations);if(l.size!==r.size||[...l.keys()].some(k=>!r.has(k)))fail('CONTROL_FIELDS_MUST_MATCH');const changes=[...l.keys()].filter(k=>l.get(k)!==r.get(k));if(changes.length!==1||changes[0]!==changed_control)fail('EXACTLY_ONE_DECLARED_CONTROL_CHANGE_REQUIRED');
  const keys=[...new Set([...lo.keys(),...ro.keys()])].sort();return {changed_control,before:l.get(changed_control),after:r.get(changed_control),preserved_controls:[...l.keys()].filter(k=>k!==changed_control),observations:keys.map(field=>({field,left:lo.get(field)??null,right:ro.get(field)??null,state:!lo.has(field)||!ro.has(field)?'MISSING_SIDE':lo.get(field)===ro.get(field)?'EQUAL':'DIFFERENT'})),source_refs:[left.source_ref,right.source_ref],causation_established:false,ordered_first_divergence_computed:false};
 },
 temporal({events,rules,window_start,window_end}){
  index(events);index(rules);if(window_start>window_end||events.some(e=>e.time<window_start||e.time>window_end))fail('INVALID_OBSERVATION_WINDOW');
  return {checks:rules.flatMap(rule=>events.filter(e=>e.kind===rule.trigger).map(e=>{const prior=events.filter(p=>p.subject===e.subject&&p.kind===rule.required_prior&&p.time<e.time&&e.time-p.time<=rule.max_age_ms);return {rule_id:rule.id,event_id:e.id,subject:e.subject,status:prior.length?'PRIOR_EVENT_PRESENT':'PRIOR_NOT_OBSERVED',prior_ids:prior.map(p=>p.id),source_ref:e.source_ref,rule_source_ref:rule.source_ref,left_censored:e.time-rule.max_age_ms<window_start}})),window_start,window_end,rules,missing_means_violation:false,timestamp_order_proves_causation:false,eventuality_proven:false,events};
 },
 identity_graph({nodes,links}){
  const map=index(nodes);refsExist(links,map,'from','to');const parents=links.filter(e=>e.kind==='PARENT');return {links:links.map(e=>{const a=map.get(e.from),b=map.get(e.to);return {...e,status:e.kind==='PARENT'?'DECLARED_PARENT_ONLY':['namespace','native_id','owner'].every(k=>a[k]===b[k])?'DECLARED_NATIVE_KEY_MATCH':'DECLARED_NATIVE_KEY_DIFFERENCE',version_match:a.version===b.version,label_match:a.label===b.label}}),parent_cycle:cycle(map,parents.map(e=>[e.from,e.to])),nodes,identity_authenticated:false,aliases_automatically_merged:false};
 },
 authority_graph({rules,records,rule_set_complete}){
  index(rules);index(records);return {records:records.map(record=>{const matches=rules.filter(r=>r.actor===record.actor&&r.subject===record.subject&&r.action===record.action);return {...record,matching_rule_ids:matches.map(r=>r.id),authority_status:matches.length?'DECLARED_RULE_MATCH':rule_set_complete?'NO_MATCH_IN_DECLARED_COMPLETE_RULE_SET':'UNKNOWN'}}),rules,rule_set_complete_is_caller_assertion:true,authority_authenticated:false,display_implies_finality:false,permission_implies_ownership:false,rule_match_proves_execution:false};
 }
};
export const forensicDescriptors=[
 ['ledger','Multi-ledger conservation','COMPUTATION','Closed-set, double-entry transfers in explicit integer units; currencies never silently combined. Observed residuals do not prove loss. Up to 32 accounts and 128 transfers.'],
 ['relational','Finite relation checks','COMPUTATION','Check unique values, foreign keys and field equality in up to 64 supplied rows and 16 declared rules. Missing fields stay unresolved. No Alloy solver or hypothetical counterexample search.'],
 ['partial_order','Declared partial-order conformance','COMPUTATION','Check one supplied complete event order against up to 128 declared precedence edges; reject cycles. No Petri-net reachability or generated concurrent schedules.'],
 ['metamorphic','31/32 controlled record comparison','COMPUTATION','Require exactly one declared changed control; compare aligned observation fields. Does not perform an experiment or prove causation.'],
 ['temporal','Finite-window prior-event checks','COMPUTATION','Check same-subject, strictly earlier events within a supplied time bound; retain observation-window censoring and unknown absence. No eventuality proof.'],
 ['identity_graph','Johnny5 / Susan identity graph','COMPUTATION','Compare declared links among up to 64 source-linked objects and detect parent cycles; preserve namespace, ownership, version and labels independently. No automatic alias merge.'],
 ['authority_graph','Machine Legal authority/finality','COMPUTATION','Match supplied actor/subject/action records to explicit rules; preserve displayed, pending, finalized and paid states. Rule match does not authenticate authority or prove action execution.']
];
