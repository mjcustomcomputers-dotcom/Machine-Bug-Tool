// MPC V29 — finite method blocks -> dependency mountains -> primary-input reduction.
// One additive, opt-in research planner on the 46-hook cross-domain frontier.
import {createHash} from 'node:crypto';
import frontier from '../research/linguistic-code-can-method-mountains-v29.json' with {type:'json'};
const error=x=>{throw Error(x)};
const gh=/^[a-f0-9]{40}$/u,ref=/^[A-Za-z0-9][A-Za-z0-9_:./@-]{0,111}$/u;
const DIM=/^[A-Z][A-Z0-9_]{1,63}$/u;
const obj=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 [Object.prototype,null].includes(Object.getPrototypeOf(o));
const only=(o,k,label)=>{if(!obj(o)||Object.keys(o).some(x=>!k.includes(x)))error('INVALID_'+label+'_FIELDS')};
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const valid=s=>typeof s==='string'&&ref.test(s);
const uniq=x=>[...new Set(x)].sort();
const hex=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const manifest=frontier.hooks;
if(frontier.namespace!=='RH_V29_NONCANONICAL'||manifest.length!==46||
 new Set(manifest.map(x=>x.id)).size!==46||frontier.original_native_evaluators!==24||
 frontier.original_atlas_candidates!==239||frontier.canonical_registry_change!==false||
 manifest.some(x=>!/^RH-V29-[0-9]{2}$/u.test(x.id)||
 !['LANGUAGE','JAVA','CAN','META'].includes(x.domain)||
 !dense(x.requires)||!dense(x.produces)||
 [...x.requires,...x.produces].some(y=>!DIM.test(y))))error('INVALID_V29_MOUNTAIN_FRONTIER');
export const methodMountainsV29Contract=Object.freeze({
 version:'MPC_V29_METHOD_BLOCK_MOUNTAIN_1',max_atoms:64,max_hooks:46,
 max_selected_methods:12,max_blocks:4,
 aggregate_families:['LANGUAGE','JAVA','CAN','META'],
 original_atlas_route_modified:false,native_methods_added:0,
 priority:'READY_BEFORE_ACQUISITION',
 stop_on_no_delta:true,source_identity_required:true,
 external_actions:false,canonical_promotion:false
});
export function planMethodMountainsV29(input){
 only(input,['source_commit','scope_id','subject_id','domain','world',
  'atoms','max_methods','previous_fingerprint','output_register'],'MOUNTAIN_INPUT');
 if(!gh.test(input.source_commit||'')||!valid(input.scope_id)||!valid(input.subject_id)||
  !['LANGUAGE','JAVA','CAN','META'].includes(input.domain)||
  !['SYNTHETIC','RECORD'].includes(input.world)||
  ![undefined,'COMPACT','ENGINEERING'].includes(input.output_register)||
  !Number.isInteger(input.max_methods??10)||
  (input.max_methods??10)<1||(input.max_methods??10)>12||
  input.previous_fingerprint!==undefined&&input.previous_fingerprint!==null&&
  !/^[a-f0-9]{64}$/u.test(input.previous_fingerprint)||
  !dense(input.atoms)||input.atoms.length>64)
  error('INVALID_MOUNTAIN_CONTEXT');
 const seen=new Set(),dimensions=new Map(),owners=new Map(),versionConflicts=[];
 for(const a of input.atoms){
  only(a,['id','dimension','state','source_ref','source_owner','source_version',
   'scope_id','subject_id'],'MOUNTAIN_ATOM');
  if(!valid(a.id)||seen.has(a.id)||!DIM.test(a.dimension||'')||
    !['SYNTHETIC','OBSERVED','CLAIMED','CONTRADICTED','UNKNOWN'].includes(a.state)||
    !valid(a.source_ref)||!valid(a.source_owner)||!valid(a.source_version)||
    a.scope_id!==input.scope_id||a.subject_id!==input.subject_id)
    error('INVALID_MOUNTAIN_ATOM');
  if(input.world==='SYNTHETIC'&&!['SYNTHETIC','UNKNOWN'].includes(a.state)||
    input.world==='RECORD'&&a.state==='SYNTHETIC')error('MOUNTAIN_WORLD_MIX');
  seen.add(a.id);
  const list=dimensions.get(a.dimension)||[];list.push(a);dimensions.set(a.dimension,list);
  const old=owners.get(a.source_ref);
  if(old&&(old.version!==a.source_version||old.owner!==a.source_owner))
    versionConflicts.push({source_ref:a.source_ref,existing:old,
      conflicting:{version:a.source_version,owner:a.source_owner}});
  else owners.set(a.source_ref,{owner:a.source_owner,version:a.source_version});
 }
 const state=dim=>{
  const ss=new Set((dimensions.get(dim)||[]).map(x=>x.state));
  if(ss.has('CONTRADICTED')&&(ss.has('OBSERVED')||ss.has('CLAIMED')))
    return 'CONTESTED';
  if(ss.has('CONTRADICTED'))return 'CONTRADICTED';
  if(ss.has('OBSERVED')||ss.has('SYNTHETIC'))return 'SUPPLIED';
  if(ss.has('CLAIMED'))return 'CLAIMED';
  return 'UNKNOWN';
 };
 const present=new Set([...dimensions.keys()].filter(d=>state(d)==='SUPPLIED'));
 const active=manifest.filter(m=>m.domain===input.domain||m.domain==='META');
 const produced=new Set(active.flatMap(m=>m.produces));
 const eligible=active.map(m=>{
  const missing=m.requires.filter(x=>!present.has(x));
  const primary=missing.filter(x=>!produced.has(x));
  const prior=missing.filter(x=>produced.has(x));
  const coverage=m.requires.length-missing.length;
  return {id:m.id,domain:m.domain,key:m.key,
   requires:m.requires,produces:m.produces,implementation_state:m.implementation_state,
   source_urls:m.source_urls,falsifier:m.falsifier,
   missing,missing_primary:primary,missing_derived:prior,coverage,
   state:!missing.length?'READY_FOR_EXPLICIT_METHOD_EXECUTION':
    primary.length?'REQUIRES_PRIMARY_SOURCE':'REQUIRES_PRIOR_METHOD_OUTPUT',
   executed:false};
 }).sort((a,b)=>{
  const score=x=>x.missing.length===0?0:x.missing_primary.length>0?2:1;
  return score(a)-score(b)||b.coverage-a.coverage||
   a.missing_primary.length-b.missing_primary.length||
   a.missing.length-b.missing.length||a.id.localeCompare(b.id);
 });
 const selected=eligible.slice(0,input.max_methods??10),idx=new Map(selected.map(m=>[m.id,m]));
 const blocks=[...new Set(selected.map(x=>x.domain))].map(domain=>{
  const members=selected.filter(x=>x.domain===domain);
  return {domain,method_ids:members.map(x=>x.id),
   ready_methods:members.filter(x=>!x.missing.length).length,
   source_unverified_inputs:uniq(members.flatMap(x=>x.missing_primary)),
   method_output_deps:uniq(members.flatMap(x=>x.missing_derived))};
 }).sort((a,b)=>a.domain.localeCompare(b.domain));
 const edges=[];
 for(const from of selected)for(const to of selected){
  if(from.id===to.id)continue;
  const via=from.produces.filter(x=>to.requires.includes(x));
  if(via.length)edges.push({from:from.id,to:to.id,via,
   state:'PLANNED_TYPED_METHOD_LINK',
   observed_intermediate:false,source_independence_confirmed:false});
 }
 edges.sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
 const outgoing=new Map(selected.map(x=>[x.id,[]])),
  degrees=new Map(selected.map(x=>[x.id,0]));
 for(const e of edges){outgoing.get(e.from).push(e.to);degrees.set(e.to,degrees.get(e.to)+1);}
 let wave=selected.filter(x=>degrees.get(x.id)===0).map(x=>x.id).sort();
 const mountainLayers=[],visited=new Set();
 while(wave.length){
  mountainLayers.push(wave);
  const next=[];
  for(const x of wave){
   visited.add(x);
   for(const target of outgoing.get(x)){
    degrees.set(target,degrees.get(target)-1);
    if(degrees.get(target)===0)next.push(target);
   }
  }
  wave=uniq(next);
 }
 const cyclic=selected.map(x=>x.id).filter(id=>!visited.has(id)).sort();
 const acquisition=uniq(selected.flatMap(x=>x.missing_primary)).map(d=>{
  const involved=selected.filter(x=>x.missing_primary.includes(d));
  const unlock=involved.filter(x=>x.missing.every(t=>t===d));
  return {dimension:d,prior_state:state(d),owner:'TO_BE_RESOLVED',
   source_locator:'NOT_ACQUIRED',blocked_method_ids:involved.map(x=>x.id),
   one_record_unlock_ids:unlock.map(x=>x.id),
   immediate_unlock_count:unlock.length,impacted_methods:involved.length,
   fetched:false};
 }).sort((a,b)=>b.immediate_unlock_count-a.immediate_unlock_count||
   b.impacted_methods-a.impacted_methods||a.dimension.localeCompare(b.dimension));
 const normalized=input.atoms.slice().sort((a,b)=>a.id.localeCompare(b.id));
 const fingerprint=hex({source_commit:input.source_commit,scope_id:input.scope_id,
  subject_id:input.subject_id,domain:input.domain,world:input.world,
  max_methods:input.max_methods??10,atoms:normalized});
 const same=input.previous_fingerprint===fingerprint;
 let phase,status,action;
 if(versionConflicts.length){
  phase='EVIDENCE_ACQUISITION';status='SOURCE_VERSION_CONFLICT';
  action='Reconcile authoritative source owner and version.';
 }else if(same){
  phase='STOP';status='UNCHANGED_METHOD_INPUT';
  action='Resume when a source version or observation changes.';
 }else if(selected.some(m=>!m.missing.length)){
  phase='ANALYSIS';status='METHOD_BLOCKS_READY';
  action='Run first supported finite method, then its independent replay.';
 }else{
  phase='EVIDENCE_ACQUISITION';status='PRIMARY_SOURCE_OR_INTERMEDIATE_REQUIRED';
  action=acquisition.length?'Acquire '+acquisition[0].dimension+' from its source owner.':
   'Execute and verify the first prerequisite method.';
 }
 return {
  version:methodMountainsV29Contract.version,source_commit:input.source_commit,
  scope_id:input.scope_id,subject_id:input.subject_id,domain:input.domain,
  output_register:input.output_register??'COMPACT',world:input.world,
  fingerprint,phase,status,next_action:action,
  declared_dimensions:uniq([...dimensions.keys()]).map(d=>({dimension:d,state:state(d)})),
  method_count_in_research_frontier:manifest.length,applicable_methods:active.length,
  selected_methods:selected,
  blocks,mountain_layers:mountainLayers,mountain_edges:edges,cyclic_dependency_candidates:cyclic,
  smallest_primary_acquisition_frontier:acquisition,
  source_version_conflicts:versionConflicts,
  methods_executed:0,records_acquired:0,external_actions:0,
  canonical_promotion:false
 };
}
export function formatCompactEngineeringReceiptV29(receipt){
 if(!obj(receipt)||receipt.version!==methodMountainsV29Contract.version||
  !Array.isArray(receipt.selected_methods)||!Array.isArray(receipt.blocks)||
  !Array.isArray(receipt.source_version_conflicts))
  error('INVALID_COMPACT_METHOD_RECEIPT');
 const first=receipt.selected_methods.find(x=>x.state==='READY_FOR_EXPLICIT_METHOD_EXECUTION')||
   receipt.selected_methods[0]||null;
 const detail={
  method:first?.key??'SOURCE_ACQUISITION',
  scope:receipt.domain,
  result:receipt.status,
  evidence:receipt.declared_dimensions?.filter(x=>x.state==='SUPPLIED')
    .map(x=>x.dimension).slice(0,8).join(', ')||'SOURCE_PENDING',
  next:receipt.next_action
 };
 const compact=[
  'METHOD  '+detail.method,
  'RESULT  '+detail.result,
  'EVIDENCE  '+detail.evidence,
  'NEXT  '+detail.next
 ].join('\n');
 return {version:'MPC_V29_COMPACT_ENGINEERING_OUTPUT_1',
  content:compact,fields:detail,source_commit:receipt.source_commit,
  full_receipt_fingerprint:receipt.fingerprint,
  full_receipt_preserved:true,
  status:'COMPACT_REPORT_FROM_STRUCTURED_METHOD_RECEIPT',
  source_authenticated:false,external_actions:false};
}
