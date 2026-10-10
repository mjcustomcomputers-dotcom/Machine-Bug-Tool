// MPC V24 — finite network and relationship meta-method science.
// Local, read-only review of caller-declared records. Not a packet capture,
// network scanner, causal model, authorized outreach engine or native evaluator.
import {createHash} from 'node:crypto';
import frontier from '../research/network-meta-method-frontier-v24.json' with {type:'json'};
import {planMethodInteractionCoverage,auditMethodInteractionCoverage} from './method-synergy-v22.mjs';

const fail=s=>{throw Error(s)};
const ID=/^[A-Za-z0-9][A-Za-z0-9:._/@-]{0,119}$/u;
const DIM=/^[A-Z][A-Z0-9_]{0,63}$/u;
const SHA=/^[a-f0-9]{40}$/u;
const STATES=new Set(['OBSERVED','CLAIMED','CONTRADICTED','UNKNOWN','SYNTHETIC']);
const sort=(a,b)=>a<b?-1:a>b?1:0;
const sorted=xs=>[...new Set(xs)].sort(sort);
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const record=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
const name=x=>typeof x==='string'&&ID.test(x);
const distinct=(xs,max,label)=>{
 if(!dense(xs)||xs.length>max||new Set(xs).size!==xs.length)fail('INVALID_'+label);
 return xs;
};
const keys=(o,allowed,label)=>{
 if(!record(o)||Object.keys(o).some(k=>!allowed.includes(k)))fail('INVALID_'+label+'_FIELDS');
};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const methods=frontier.methods;
if(frontier.namespace!=='RH-V24_NONCANONICAL'||frontier.registry_promotion!==false||
 !dense(methods)||methods.length!==22||
 new Set(methods.map(m=>m.id)).size!==22||
 methods.some(m=>!/^RH-V24-[0-9]{2}$/u.test(m.id)||!dense(m.requires)||!dense(m.produces)||
  m.requires.length===0||m.produces.length===0||[...m.requires,...m.produces].some(x=>!DIM.test(x))||
  !dense(m.sources)||!m.sources.length||m.sources.some(x=>!x.startsWith('https://'))))fail('INVALID_V24_RESEARCH_CONTRACT');
const derived=new Set(methods.flatMap(x=>x.produces));

export const networkMethodContract=Object.freeze({
 version:frontier.version,research_hooks:methods.length,original_mha_count:239,
 native_evaluators_added:0,existing_network_osi_replaced:false,
 max_atoms:64,max_graph_nodes:32,max_graph_edges:64,max_protocol_observations:48,
 max_protocol_claims:24,max_method_links:462,
 data_source_authentication:false,packet_capture:false,network_probe:false,
 contact_discovery:false,outreach:false,performance_or_effectiveness_claim:false,
 canonical_promotion:false
});
function context(input){
 if(!record(input)||!SHA.test(input.source_commit||'')||!name(input.scope_id)||!name(input.subject_id)||
  !['DIGITAL','PROFESSIONAL','META'].includes(input.domain)||
  !['SYNTHETIC','RECORD'].includes(input.world))fail('INVALID_NETWORK_CONTEXT');
 return {source_commit:input.source_commit,scope_id:input.scope_id,
  subject_id:input.subject_id,domain:input.domain,world:input.world};
}
function atomIndex(input){
 const ctx=context(input);
 if(!dense(input.atoms)||input.atoms.length>64)fail('INVALID_NETWORK_ATOMS');
 const seen=new Set(),types=new Map();
 const allowed=['id','dimension','scope_id','subject_id','source_owner','source_ref',
  'source_version','state','clock_domain','captured_at_ms'];
 for(const a of input.atoms){
  keys(a,allowed,'NETWORK_ATOM');
  if(!name(a.id)||seen.has(a.id)||!DIM.test(a.dimension||'')||
   a.scope_id!==ctx.scope_id||a.subject_id!==ctx.subject_id||
   !name(a.source_owner)||!name(a.source_ref)||!name(a.source_version)||
   !STATES.has(a.state)|| (a.clock_domain!==undefined&&!name(a.clock_domain))||
   (a.captured_at_ms!==undefined&&(!Number.isSafeInteger(a.captured_at_ms)||a.captured_at_ms<0)))fail('INVALID_NETWORK_ATOM_PROVENANCE');
  if(ctx.world==='SYNTHETIC'&&!['SYNTHETIC','UNKNOWN'].includes(a.state)||
     ctx.world==='RECORD'&&a.state==='SYNTHETIC')fail('NETWORK_WORLD_MIX');
  seen.add(a.id);
  const q=types.get(a.dimension)||[];q.push(a);types.set(a.dimension,q);
 }
 const state=t=>{
  const q=types.get(t)||[];
  if(!q.length)return 'MISSING';
  const ss=new Set(q.map(x=>x.state));
  if(ss.has('CONTRADICTED')&&['SYNTHETIC','OBSERVED','CLAIMED'].some(x=>ss.has(x)))return 'CONTESTED';
  if(ss.has('CONTRADICTED'))return 'CONTRADICTED';
  if(ss.has('SYNTHETIC')||ss.has('OBSERVED'))return 'SUPPLIED_UNAUTHENTICATED';
  if(ss.has('CLAIMED'))return 'CLAIMED_UNVERIFIED';
  return 'UNKNOWN';
 };
 return {ctx,types,state};
}
export function reviewNetworkMethods(input){
 const {ctx,types,state}=atomIndex(input),items=[];
 const active=methods.filter(m=>m.domain===ctx.domain||m.domain==='META');
 for(const m of methods){
  if(!active.includes(m)){
   items.push({id:m.id,domain:m.domain,family:m.key,method_name:m.name,
    requires:m.requires,produces:m.produces,source_urls:m.sources,
    state:'DOMAIN_NOT_APPLICABLE',missing_or_unverified:[],missing_primary_records:[],
    missing_unexecuted_method_outputs:[],contradiction_types:[],
    method_executed:false,source_authentication:false});
   continue;
  }
  const missing=m.requires.filter(t=>state(t)!=='SUPPLIED_UNAUTHENTICATED');
  const conflicts=m.requires.filter(t=>state(t)==='CONTESTED');
  const primary=missing.filter(t=>!derived.has(t));
  const outputs=missing.filter(t=>derived.has(t));
  items.push({id:m.id,domain:m.domain,family:m.key,method_name:m.name,
   cross_domain:m.domain==='META',
   source_urls:m.sources,falsifier:m.falsifier,
   requires:m.requires,produces:m.produces,
   missing_or_unverified:missing,missing_primary_records:primary,
   missing_unexecuted_method_outputs:outputs,contradiction_types:conflicts,
   state:missing.length?primary.length?'SOURCE_ACQUISITION_REQUIRED':'METHOD_EXECUTION_REQUIRED':
    'RESEARCH_APPLICABLE_NOT_EXECUTED',
   method_executed:false,source_authentication:false});
 }
 const primary=sorted(active.flatMap(m=>m.requires).filter(t=>!derived.has(t)&&state(t)!=='SUPPLIED_UNAUTHENTICATED'));
 const missingRecordTargets=primary.map(t=>{
  const associated=items.filter(m=>m.requires.includes(t));
  const unlocks=associated.filter(m=>m.missing_or_unverified.every(x=>x===t));
  return {dimension:t,source_custodian:'NOT_IDENTIFIED',locator:'NOT_ACQUIRED',
   method_dependents:associated.map(m=>m.id),
   one_atom_structural_unlocks:unlocks.map(m=>m.id),
   unlock_count:unlocks.length,method_dependents_count:associated.length,
   information_gain_probability:'UNKNOWN',source_retrieved:false};
 }).sort((a,b)=>b.unlock_count-a.unlock_count||
  b.method_dependents_count-a.method_dependents_count||sort(a.dimension,b.dimension));
 return {version:networkMethodContract.version,...ctx,
  atom_count:input.atoms.length,observed_dimension_states:[...types.keys()].sort(sort).map(d=>({
   dimension:d,state:state(d),source_refs:sorted(types.get(d).map(a=>a.source_ref)),
   owner_refs:sorted(types.get(d).map(a=>a.source_owner))})),
  method_reviews:items,applicable_hook_count:items.filter(x=>x.state==='RESEARCH_APPLICABLE_NOT_EXECUTED').length,
  missing_primary_source_frontier:missingRecordTargets,unexecuted_method_outputs:
   sorted(active.flatMap(m=>m.requires).filter(t=>derived.has(t)&&state(t)!=='SUPPLIED_UNAUTHENTICATED')),
  acquisition_performed:false,real_method_executions:0,canonical_promotion:false};
}
export function planNetworkMethodInteractions(input){
 const result=reviewNetworkMethods(input),known=new Map(result.observed_dimension_states.map(x=>[x.dimension,x.state]));
 const edges=[];
 for(const a of methods)for(const b of methods){
  if(a.id===b.id)continue;
  const via=a.produces.filter(t=>b.requires.includes(t)).sort(sort);
  if(!via.length)continue;
  const missingUp=a.requires.filter(t=>known.get(t)!=='SUPPLIED_UNAUTHENTICATED');
  const missingDown=b.requires.filter(t=>!via.includes(t)&&known.get(t)!=='SUPPLIED_UNAUTHENTICATED');
  const cross=a.domain!==b.domain;
  const outsideContext=![a,b].every(m=>m.domain===result.domain||m.domain==='META');
  const crossBoundary=(cross&&a.domain!=='META'&&b.domain!=='META');
  edges.push({from:a.id,to:b.id,via,missing_upstream:missingUp,
   missing_downstream:missingDown,scope:result.scope_id,
   boundary:crossBoundary?'UNRELATED_DOMAINS_CANNOT_IMPLY_EQUIVALENCE':
    cross?'META_RESEARCH_LINK_ONLY':'SAME_FAMILY_CONTRACT_LINK',
   state:outsideContext?'DOMAIN_METHOD_NOT_APPLICABLE':
    crossBoundary?'DOMAIN_NON_EQUIVALENCE_GUARD':
    missingUp.length||missingDown.length?'REQUIRES_SOURCE_OR_PRIOR_METHOD_OUTPUT':
    'HYPOTHETICAL_METHOD_COMPOSITION',
   evidence_independent:false,outputs_observed:false,target_actions:false});
 }
 edges.sort((x,y)=>sort(x.from,y.from)||sort(x.to,y.to));
 if(edges.length>462)fail('NETWORK_METHOD_LINK_BUDGET');
 return {version:networkMethodContract.version,source_commit:result.source_commit,
  scope_id:result.scope_id,subject_id:result.subject_id,
  considered_pairs:methods.length*(methods.length-1),edges,
  hypothetical_compositions:edges.filter(x=>x.state==='HYPOTHETICAL_METHOD_COMPOSITION').length,
  methods_executed:0,claims_proven:0,source_authentication:false,canonical_promotion:false};
}
const VALID_KINDS=new Set(['SOCKET_STATE','UDP_ENDPOINT','QUIC_HANDSHAKE_EVIDENCE',
 'TLS_PEER_VERIFICATION','POLICY_DECISION','HTTP_RESPONSE','BUSINESS_OWNER_COMMIT_RECORD',
 'TRACE_CONTEXT','TRACE_SPAN_LINEAGE','OS_PROCESS_ID','SIGNED_PROCESS_IDENTITY',
 'PACKET_CAPTURE_RECEIPT','RECIPROCAL_CONFIRMATION','EXPLICIT_OUTREACH_PERMISSION']);
const PROOF=new Map([
 ['SOCKET_PRESENT',['SOCKET_STATE']],
 ['QUIC_TRANSPORT_CONFIRMED',['QUIC_HANDSHAKE_EVIDENCE']],
 ['PEER_AUTHENTICATED',['TLS_PEER_VERIFICATION']],
 ['RESOURCE_ACCESS_ALLOWED',['POLICY_DECISION']],
 ['BUSINESS_OPERATION_FINAL',['BUSINESS_OWNER_COMMIT_RECORD']],
 ['PACKET_OBSERVED',['PACKET_CAPTURE_RECEIPT']],
 ['PROCESS_IDENTITY_VERIFIED',['SIGNED_PROCESS_IDENTITY']],
 ['RECIPROCAL_TIE_CONFIRMED',['RECIPROCAL_CONFIRMATION']],
 ['OUTREACH_AUTHORIZED',['EXPLICIT_OUTREACH_PERMISSION']],
 ['TRACE_LINEAGE_IDENTIFIED',['TRACE_SPAN_LINEAGE']]
]);
export function auditNetworkProtocolClaims(input){
 const ctx=context(input);
 if(!dense(input.observations)||input.observations.length>48||
    !dense(input.claims)||input.claims.length>24)fail('NETWORK_CLAIM_BUDGET');
 const observed=new Map(),claimIds=new Set();
 for(const r of input.observations){
  keys(r,['id','kind','state','source_ref','source_owner','source_version','scope_id','subject_id'],'PROTOCOL_OBSERVATION');
  if(!name(r.id)||observed.has(r.id)||!VALID_KINDS.has(r.kind)||
   !STATES.has(r.state)||!name(r.source_ref)||!name(r.source_owner)||!name(r.source_version)||
   r.scope_id!==ctx.scope_id||r.subject_id!==ctx.subject_id||
   ctx.world==='SYNTHETIC'&&!['SYNTHETIC','UNKNOWN'].includes(r.state)||
   ctx.world==='RECORD'&&r.state==='SYNTHETIC')fail('INVALID_PROTOCOL_OBSERVATION');
  observed.set(r.id,r);
 }
 const reviews=[];
 for(const c of input.claims){
  keys(c,['id','type','support_ids'],'NETWORK_CLAIM');
  if(!name(c.id)||claimIds.has(c.id)||!PROOF.has(c.type)||
    !dense(c.support_ids)||!c.support_ids.length||c.support_ids.length>12||
    new Set(c.support_ids).size!==c.support_ids.length||
    c.support_ids.some(id=>!observed.has(id)))fail('INVALID_NETWORK_CLAIM');
  const human=['RECIPROCAL_TIE_CONFIRMED','OUTREACH_AUTHORIZED'].includes(c.type);
  if(ctx.domain==='META'||(ctx.domain==='DIGITAL'&&human)||
   (ctx.domain==='PROFESSIONAL'&&!human))fail('CLAIM_DOMAIN_MISMATCH');
  claimIds.add(c.id);
  const evidence=c.support_ids.map(id=>observed.get(id));
  const required=PROOF.get(c.type);
  const relevant=evidence.filter(r=>required.includes(r.kind));
  const positive=relevant.filter(r=>['OBSERVED','SYNTHETIC'].includes(r.state));
  const conflicting=relevant.some(r=>r.state==='CONTRADICTED');
  const state=conflicting?'CONTESTED_REVIEW_REQUIRED':
    positive.length?'REQUIRED_EVIDENCE_TYPE_DECLARED_UNAUTHENTICATED':'INSUFFICIENT_EVIDENCE_TYPE';
  reviews.push({claim_id:c.id,claim_type:c.type,state,requires:required,
   matching_evidence_ids:positive.map(x=>x.id),all_supplied_ids:c.support_ids,
   non_matching_evidence_ids:evidence.filter(x=>!required.includes(x.kind)).map(x=>x.id),
   distinct_source_owners:sorted(evidence.map(x=>x.source_owner)),
   actual_peer_or_actor_identity_proven:false,business_or_security_impact_proven:false,
   source_authenticated:false,claim_fully_verified:false});
 }
 return {version:networkMethodContract.version,...ctx,
  reviews,requirements_validated:reviews.length,
  verified_real_world_claims:0,source_authentication:false,canonical_promotion:false};
}
const EVIDENCE=new Set(['DECLARED_OBSERVATION','HYPOTHESIS','UNKNOWN']);
const CONSENT=new Set(['RECIPROCAL_RECORDED','ONE_SIDED','UNKNOWN','NOT_APPLICABLE']);
const rels=new Set(['PHYSICAL_DEPENDENCY','LOGICAL_DEPENDENCY','DECLARED_TIE','REFERRAL_PATH']);
function graphComponents(vertices,edges,skipNode=null,skipEdge=null){
 const eligible=vertices.filter(v=>v.id!==skipNode).map(v=>v.id),neighbor=new Map(eligible.map(id=>[id,[]]));
 for(const e of edges){
  if(e.id===skipEdge||e.from===skipNode||e.to===skipNode)continue;
  if(!neighbor.has(e.from)||!neighbor.has(e.to))continue;
  neighbor.get(e.from).push(e.to);neighbor.get(e.to).push(e.from);
 }
 const visited=new Set(),components=[];
 for(const id of eligible){
  if(visited.has(id))continue;
  const part=[],queue=[id];visited.add(id);
  for(let i=0;i<queue.length;i++){
   const x=queue[i];part.push(x);
   for(const n of neighbor.get(x))if(!visited.has(n)){visited.add(n);queue.push(n);}
  }
  components.push(part.sort(sort));
 }
 return components.sort((a,b)=>sort(a[0]??'',b[0]??''));
}
// Graph cut is valid only in the supplied edge set; hidden alternate paths
// and graph incompleteness defeat live failure/influence claims.
export function analyzeDeclaredNetworkGraph(input){
 const ctx=context(input);
 if(ctx.domain==='META')fail('GRAPH_SINGLE_DOMAIN_REQUIRED');
 if(!dense(input.nodes)||input.nodes.length<2||input.nodes.length>32||
    !dense(input.edges)||input.edges.length>64)fail('INVALID_GRAPH_BUDGET');
 const vertices=new Map(),edges=[],edgeIds=new Set(),excluded=[];
 for(const n of input.nodes){
  keys(n,['id','scope_id','subject_id','source_ref','source_owner'],'GRAPH_NODE');
  if(!name(n.id)||vertices.has(n.id)||n.scope_id!==ctx.scope_id||
   n.subject_id!==ctx.subject_id||!name(n.source_ref)||!name(n.source_owner))fail('INVALID_GRAPH_NODE');
  vertices.set(n.id,n);
 }
 for(const e of input.edges){
  keys(e,['id','from','to','relation','evidence_state','consent_state','source_ref','source_version','source_owner','scope_id','subject_id'],'GRAPH_EDGE');
  if(!name(e.id)||edgeIds.has(e.id)||!vertices.has(e.from)||!vertices.has(e.to)||
   e.from===e.to||!rels.has(e.relation)||!EVIDENCE.has(e.evidence_state)||
   !CONSENT.has(e.consent_state)||!name(e.source_ref)||!name(e.source_version)||
   !name(e.source_owner)||e.scope_id!==ctx.scope_id||e.subject_id!==ctx.subject_id||
   (ctx.domain==='DIGITAL'&&!['LOGICAL_DEPENDENCY','PHYSICAL_DEPENDENCY'].includes(e.relation))||
   (ctx.domain==='PROFESSIONAL'&&!['DECLARED_TIE','REFERRAL_PATH'].includes(e.relation)))
    fail('INVALID_GRAPH_EDGE');
  edgeIds.add(e.id);
  const inGraph=e.evidence_state==='DECLARED_OBSERVATION'&&
    (ctx.domain==='DIGITAL'||e.consent_state==='RECIPROCAL_RECORDED');
  if(inGraph)edges.push(e);else excluded.push({edge_id:e.id,
   reason:e.evidence_state!=='DECLARED_OBSERVATION'?'UNOBSERVED_EDGE':
    'RECIPROCAL_CONSENT_NOT_RECORDED'});
 }
 const nodes=[...vertices.values()].sort((a,b)=>sort(a.id,b.id));
 const comps=graphComponents(nodes,edges);
 const bridgingEdges=edges.filter(e=>graphComponents(nodes,edges,null,e.id).length>comps.length).map(e=>e.id).sort(sort);
 const bridgingNodes=nodes.filter(n=>graphComponents(nodes,edges,n.id).length>comps.length).map(n=>n.id).sort(sort);
 return {version:networkMethodContract.version,...ctx,
  directed_reachability_claim:false,graph_projection:'UNDIRECTED_WEAK_CONNECTIVITY_ONLY',
  included_edges:edges.length,excluded_edges:excluded,
  components:comps,bridge_edge_candidates:bridgingEdges,
  articulation_node_candidates:bridgingNodes,
  graph_incomplete_by_default:true,
  failure_or_social_influence_proven:false,person_identity_or_consent_authenticated:false,
  source_authentication:false,actions_dispatched:0,canonical_promotion:false};
}
// Adjacent snapshots, trace IDs or business relationships must not be joined
// across incomparable clocks, owners, subjects or time windows as one event.
export function auditNetworkObservationAlignment(input){
 const ctx=context(input);
 const allowed=['id','scope_id','subject_id','source_ref','source_owner','clock_domain','start_ms','end_ms'];
 for(const side of ['left','right']){
  const o=input[side];keys(o,allowed,'ALIGNMENT');
  if(!name(o.id)||!name(o.source_ref)||!name(o.source_owner)||!name(o.clock_domain)||
   o.scope_id!==ctx.scope_id||o.subject_id!==ctx.subject_id||
   !Number.isSafeInteger(o.start_ms)||o.start_ms<0||
   !Number.isSafeInteger(o.end_ms)||o.end_ms<o.start_ms)fail('INVALID_ALIGNMENT_SOURCE');
 }
 const a=input.left,b=input.right;
 const clocksMatch=a.clock_domain===b.clock_domain;
 const overlap=clocksMatch&&a.start_ms<=b.end_ms&&b.start_ms<=a.end_ms;
 return {version:networkMethodContract.version,...ctx,
  state:!clocksMatch?'CLOCK_ALIGNMENT_REQUIRED':
    overlap?'POSSIBLE_TEMPORAL_OVERLAP_NO_EVENT_IDENTITY':'NO_OVERLAP_IN_DECLARED_WINDOWS',
  comparable_clocks:clocksMatch,overlapping_declared_windows:overlap,
  shared_source_ref:a.source_ref===b.source_ref,
  shared_source_owner:a.source_owner===b.source_owner,
  event_identity_proven:false,independent_witnesses_proven:false,
  source_authentication:false,canonical_promotion:false};
}
export function planNetworkPairwiseControls(input){
 const design=planMethodInteractionCoverage(input);
 const audit=auditMethodInteractionCoverage(input,design);
 return {kind:'MPC_V24_NETWORK_PAIRWISE_TEST_DESIGN',design,audit,
  test_cases_executed:0,actual_network_performance_measured:false,
  native_packet_capture:false,canonical_promotion:false};
}
