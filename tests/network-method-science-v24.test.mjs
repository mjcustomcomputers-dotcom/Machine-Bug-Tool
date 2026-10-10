import test from 'node:test';
import assert from 'node:assert/strict';
import frontier from '../research/network-meta-method-frontier-v24.json' with {type:'json'};
import {networkMethodContract,reviewNetworkMethods,planNetworkMethodInteractions,
 auditNetworkProtocolClaims,analyzeDeclaredNetworkGraph,
 auditNetworkObservationAlignment,planNetworkPairwiseControls
} from '../lib/network-method-science-v24.mjs';
const source_commit='cc6f19023fd852154f463421f6e50727419ac687';
const ctx={source_commit,scope_id:'synthetic:network-task',subject_id:'synthetic:owned-system'};
const base=(domain='DIGITAL')=>({...ctx,world:'SYNTHETIC',domain});
const atom=(dimension,n,state='SYNTHETIC')=>({
 id:'a'+n,dimension,state,scope_id:ctx.scope_id,subject_id:ctx.subject_id,
 source_owner:'fixture:owner',source_ref:'fixture:source'+n,source_version:'r1'});
const kinds=['ENDPOINT_SNAPSHOT','SNAPSHOT_SCOPE','TCP_STATE','UDP_ENDPOINT',
 'PROTOCOL_EVIDENCE','TLS_EVIDENCE','SPECIFICATION_VERSION',
 'HTTP_RESPONSE','BUSINESS_OWNER_RECORD','IDENTITY_EVIDENCE','POLICY_DECISION',
 'RESOURCE_OWNER','TRACE_CONTEXT','TRACE_LINEAGE','TELEMETRY_ATTRIBUTES',
 'INSTRUMENTATION_SCOPE','ETW_EVENT','PROCESS_IDENTITY',
 'OBSERVATION_TIMES','CLOCK_DOMAINS','ADDRESS_TRANSLATION_CONTEXT','NETWORK_TOPOLOGY',
 'DEPENDENCY_EDGES','SERVICE_IDENTITY','INFORMATION_CONTEXT','GRAPH_EDGE_EVIDENCE',
 'CONSENTED_RELATIONSHIP_GRAPH','RELATIONSHIP_ASSERTION',
 'RECIPROCAL_CONFIRMATION','PURPOSE_DISCLOSURE','ROLE_VERSION',
 'TECH_GRAPH','PROFESSIONAL_GRAPH','SOURCE_LINEAGE'];
const sample=()=>({...base(),atoms:kinds.map((k,i)=>atom(k,i))});
const obs=(id,kind,state='SYNTHETIC')=>({id,kind,state,source_ref:'fixture:'+id,
 source_owner:'fixture:owner',source_version:'v1',scope_id:ctx.scope_id,subject_id:ctx.subject_id});
const claim=(id,type,support_ids)=>({id,type,support_ids});
const claimInput=(observations,claims)=>({...base(),observations,claims});
const node=id=>({id,scope_id:ctx.scope_id,subject_id:ctx.subject_id,
 source_ref:'fixture:node:'+id,source_owner:'fixture:owner'});
const edge=(id,from,to,domain='DIGITAL',evidence_state='DECLARED_OBSERVATION',consent_state='NOT_APPLICABLE')=>({
 id,from,to,relation:domain==='DIGITAL'?'PHYSICAL_DEPENDENCY':'DECLARED_TIE',
 evidence_state,consent_state,source_ref:'fixture:edge:'+id,source_version:'v1',
 source_owner:'fixture:owner',scope_id:ctx.scope_id,subject_id:ctx.subject_id});
const topology=()=>({...base(),nodes:['a','b','c'].map(node),edges:[
 edge('ab','a','b'),edge('bc','b','c')]});
const moment=(id,start_ms,end_ms,clock_domain='clock:one',owner='fixture:owner')=>({
 id,scope_id:ctx.scope_id,subject_id:ctx.subject_id,
 source_ref:'fixture:'+id,source_owner:owner,clock_domain,start_ms,end_ms
});
test('22 research contracts preserve canonical native identities and distinct families',()=>{
 assert.equal(frontier.methods.length,22);
 assert.equal(networkMethodContract.native_evaluators_added,0);
 assert.equal(networkMethodContract.original_mha_count,239);
 assert.equal(frontier.canonical_evaluators_unchanged,24);
 assert.equal(frontier.canonical_mha_unchanged,239);
 assert.equal(frontier.registry_promotion,false);
 assert.equal(frontier.existing_v20_network_osi_untouched,true);
 assert.equal(frontier.existing_v23_behavioral_untouched,true);
 assert.equal(frontier.sources.tls,'https://www.rfc-editor.org/info/rfc9846');
 assert.equal(new Set(frontier.methods.map(m=>m.id)).size,22);
 assert.deepEqual(frontier.methods.reduce((x,m)=>({...x,[m.domain]:(x[m.domain]||0)+1}),{}),
  {DIGITAL:14,PROFESSIONAL:5,META:3});
 for(const m of frontier.methods){assert.ok(m.sources.every(s=>s.startsWith('https://')));
  assert.equal(m.implementation_state,'RESEARCH_CONTRACT_ONLY_NOT_NATIVE_EVALUATOR');
  assert.equal(m.method_execution,false);}
});
test('observed typed atoms yield finite candidates without packet capture or evaluator execution',()=>{
 const r=reviewNetworkMethods(sample());
 assert.equal(r.atom_count,kinds.length);
 assert.equal(r.method_reviews.length,22);
 assert.ok(r.applicable_hook_count>=5);
 assert.equal(r.acquisition_performed,false);
 assert.equal(r.real_method_executions,0);
 assert.equal(networkMethodContract.packet_capture,false);
 assert.equal(networkMethodContract.network_probe,false);
 assert.equal(r.canonical_promotion,false);
});
test('missing primary evidence vs unexecuted derived output are not equated',()=>{
 const r=reviewNetworkMethods({...base(),atoms:[
  atom('ENDPOINT_SNAPSHOT',0),atom('SNAPSHOT_SCOPE',1),atom('TCP_STATE',2)]});
 const tcp=r.method_reviews.find(m=>m.id==='RH-V24-02');
 assert.deepEqual(tcp.missing_primary_records,[]);
 assert.deepEqual(tcp.missing_unexecuted_method_outputs,['ENDPOINT_SCOPE_REVIEW']);
 assert.equal(tcp.state,'METHOD_EXECUTION_REQUIRED');
 const source=r.missing_primary_source_frontier.find(x=>x.dimension==='TLS_EVIDENCE');
 assert.equal(source.source_retrieved,false);
 assert.equal(source.information_gain_probability,'UNKNOWN');
 assert.ok(!r.missing_primary_source_frontier.some(x=>x.dimension==='ENDPOINT_SCOPE_REVIEW'));
});
test('source context and epistemic state reject cross-scope, raw payload or world mixing',()=>{
 const x=sample();x.atoms[0].scope_id='other';
 assert.throws(()=>reviewNetworkMethods(x),/INVALID_NETWORK_ATOM_PROVENANCE/);
 const y=sample();y.atoms[0].raw_payload='secret';
 assert.throws(()=>reviewNetworkMethods(y),/INVALID_NETWORK_ATOM_FIELDS/);
 const z=sample();z.world='RECORD';
 assert.throws(()=>reviewNetworkMethods(z),/NETWORK_WORLD_MIX/);
 const w=sample();w.atoms[0].source_owner='';
 assert.throws(()=>reviewNetworkMethods(w),/INVALID_NETWORK_ATOM_PROVENANCE/);
});
test('contradictory and unknown state cannot silently become supported',()=>{
 const x={...base('DIGITAL'),world:'RECORD',atoms:[
  atom('TLS_EVIDENCE',0,'OBSERVED'),atom('TLS_EVIDENCE',1,'CONTRADICTED'),
  atom('SPECIFICATION_VERSION',2,'UNKNOWN')]};
 const r=reviewNetworkMethods(x);
 assert.equal(r.observed_dimension_states.find(x=>x.dimension==='TLS_EVIDENCE').state,'CONTESTED');
 assert.equal(r.observed_dimension_states.find(x=>x.dimension==='SPECIFICATION_VERSION').state,'UNKNOWN');
 assert.equal(r.method_reviews.find(x=>x.id==='RH-V24-04').state,'SOURCE_ACQUISITION_REQUIRED');
});
test('method-on-method hooks remain hypothesized and nonindependent',()=>{
 const r=planNetworkMethodInteractions(sample());
 assert.equal(r.considered_pairs,22*21);
 assert.equal(r.methods_executed,0);
 assert.equal(r.claims_proven,0);
 assert.ok(r.edges.every(e=>e.outputs_observed===false&&e.evidence_independent===false));
 const edge=r.edges.find(e=>e.from==='RH-V24-01'&&e.to==='RH-V24-02');
 assert.deepEqual(edge.via,['ENDPOINT_SCOPE_REVIEW']);
 assert.equal(edge.state,'HYPOTHETICAL_METHOD_COMPOSITION');
});
test('digital socket evidence never promotes social-network methods or outreach permission',()=>{
 const digital={...base(),atoms:[atom('CONSENTED_RELATIONSHIP_GRAPH',0),atom('GRAPH_EDGE_EVIDENCE',1)]};
 const r=reviewNetworkMethods(digital);
 assert.equal(r.method_reviews.find(x=>x.id==='RH-V24-16').state,'DOMAIN_NOT_APPLICABLE');
 assert.ok(!r.missing_primary_source_frontier.some(x=>x.dimension==='RECIPROCAL_CONFIRMATION'));
 const edges=planNetworkMethodInteractions(digital);
 assert.ok(edges.edges.filter(x=>x.to==='RH-V24-16'||
  x.from==='RH-V24-16').every(x=>x.state==='DOMAIN_METHOD_NOT_APPLICABLE'));
 const permission=claimInput([obs('permission','EXPLICIT_OUTREACH_PERMISSION')],
  [claim('outreach','OUTREACH_AUTHORIZED',['permission'])]);
 assert.throws(()=>auditNetworkProtocolClaims(permission),/CLAIM_DOMAIN_MISMATCH/);
 const professional={...base('PROFESSIONAL'),
  observations:[obs('tcp','SOCKET_STATE')],claims:[claim('sock','SOCKET_PRESENT',['tcp'])]};
 assert.throws(()=>auditNetworkProtocolClaims(professional),/CLAIM_DOMAIN_MISMATCH/);
});

test('socket state cannot prove authenticated TLS peer or observed packet',()=>{
 const x=claimInput([obs('socket','SOCKET_STATE')],[
  claim('one','SOCKET_PRESENT',['socket']),
  claim('auth','PEER_AUTHENTICATED',['socket']),
  claim('packet','PACKET_OBSERVED',['socket'])
 ]);
 const r=auditNetworkProtocolClaims(x);
 assert.equal(r.reviews[0].state,'REQUIRED_EVIDENCE_TYPE_DECLARED_UNAUTHENTICATED');
 assert.equal(r.reviews[1].state,'INSUFFICIENT_EVIDENCE_TYPE');
 assert.equal(r.reviews[2].state,'INSUFFICIENT_EVIDENCE_TYPE');
 assert.equal(r.verified_real_world_claims,0);
});
test('UDP endpoint does not prove QUIC; TLS proof class distinct from socket address',()=>{
 const x=claimInput([obs('udp','UDP_ENDPOINT'),obs('quic','QUIC_HANDSHAKE_EVIDENCE')],[
  claim('q-no','QUIC_TRANSPORT_CONFIRMED',['udp']),
  claim('q-witness','QUIC_TRANSPORT_CONFIRMED',['udp','quic'])
 ]);
 const r=auditNetworkProtocolClaims(x);
 assert.equal(r.reviews[0].state,'INSUFFICIENT_EVIDENCE_TYPE');
 assert.equal(r.reviews[1].matching_evidence_ids[0],'quic');
 assert.equal(r.reviews[1].source_authenticated,false);
});
test('HTTP success, trace propagation and OS PID do not prove ledger finality or actor identity',()=>{
 const x=claimInput([obs('http','HTTP_RESPONSE'),obs('trace','TRACE_CONTEXT'),obs('pid','OS_PROCESS_ID')],[
  claim('settlement','BUSINESS_OPERATION_FINAL',['http']),
  claim('trace-lineage','TRACE_LINEAGE_IDENTIFIED',['trace']),
  claim('owner','PROCESS_IDENTITY_VERIFIED',['pid'])
 ]);
 const r=auditNetworkProtocolClaims(x);
 assert.ok(r.reviews.every(x=>x.state==='INSUFFICIENT_EVIDENCE_TYPE'));
});
test('explicitly supplied owner evidence only qualifies structurally, never real-world verification',()=>{
 const x=claimInput([obs('owner','BUSINESS_OWNER_COMMIT_RECORD'),
  obs('auth','TLS_PEER_VERIFICATION')],[
  claim('close','BUSINESS_OPERATION_FINAL',['owner']),
  claim('peer','PEER_AUTHENTICATED',['auth'])
 ]);
 const r=auditNetworkProtocolClaims(x);
 assert.ok(r.reviews.every(x=>x.state==='REQUIRED_EVIDENCE_TYPE_DECLARED_UNAUTHENTICATED'));
 assert.equal(r.verified_real_world_claims,0);
 assert.ok(r.reviews.every(x=>x.claim_fully_verified===false));
 const professional={...base('PROFESSIONAL'),
  observations:[obs('permission','EXPLICIT_OUTREACH_PERMISSION')],
  claims:[claim('outreach','OUTREACH_AUTHORIZED',['permission'])]};
 const social=auditNetworkProtocolClaims(professional);
 assert.equal(social.reviews[0].state,'REQUIRED_EVIDENCE_TYPE_DECLARED_UNAUTHENTICATED');
 assert.equal(social.reviews[0].claim_fully_verified,false);
});
test('contradicted matching authority witness cannot be promoted',()=>{
 const x=claimInput([obs('one','BUSINESS_OWNER_COMMIT_RECORD','SYNTHETIC'),
  obs('bad','BUSINESS_OWNER_COMMIT_RECORD','UNKNOWN')],
  [claim('commit','BUSINESS_OPERATION_FINAL',['one','bad'])]);
 const r=auditNetworkProtocolClaims(x);
 assert.equal(r.reviews[0].state,'REQUIRED_EVIDENCE_TYPE_DECLARED_UNAUTHENTICATED');
 const y={...base(),world:'RECORD',observations:[obs('one','BUSINESS_OWNER_COMMIT_RECORD','OBSERVED'),
  obs('contr','BUSINESS_OWNER_COMMIT_RECORD','CONTRADICTED')],
 claims:[claim('commit','BUSINESS_OPERATION_FINAL',['one','contr'])]};
 const q=auditNetworkProtocolClaims(y);
 assert.equal(q.reviews[0].state,'CONTESTED_REVIEW_REQUIRED');
});
test('unsupported claim kind, duplicate support or foreign subject reject',()=>{
 const x=claimInput([obs('one','SOCKET_STATE')],[claim('c','SUPERPOWERS',['one'])]);
 assert.throws(()=>auditNetworkProtocolClaims(x),/INVALID_NETWORK_CLAIM/);
 const y=claimInput([obs('one','SOCKET_STATE')],[claim('c','SOCKET_PRESENT',['one','one'])]);
 assert.throws(()=>auditNetworkProtocolClaims(y),/INVALID_NETWORK_CLAIM/);
 const z=claimInput([obs('one','SOCKET_STATE')],[claim('c','SOCKET_PRESENT',['one'])]);
 z.observations[0].subject_id='other';
 assert.throws(()=>auditNetworkProtocolClaims(z),/INVALID_PROTOCOL_OBSERVATION/);
});
test('three-node digital chain has two review-only bridge links and one articulation',()=>{
 const r=analyzeDeclaredNetworkGraph(topology());
 assert.deepEqual(r.components,[['a','b','c']]);
 assert.deepEqual(r.bridge_edge_candidates,['ab','bc']);
 assert.deepEqual(r.articulation_node_candidates,['b']);
 assert.equal(r.failure_or_social_influence_proven,false);
 assert.equal(r.graph_incomplete_by_default,true);
});
test('declared alternative edge removes network bridge and articulation candidate',()=>{
 const x=topology();x.edges.push(edge('ac','a','c'));
 const r=analyzeDeclaredNetworkGraph(x);
 assert.deepEqual(r.bridge_edge_candidates,[]);
 assert.deepEqual(r.articulation_node_candidates,[]);
});
test('unobserved topology edge cannot be counted as working link',()=>{
 const x=topology();x.edges.push(edge('ac','a','c','DIGITAL','HYPOTHESIS'));
 const r=analyzeDeclaredNetworkGraph(x);
 assert.deepEqual(r.bridge_edge_candidates,['ab','bc']);
 assert.deepEqual(r.excluded_edges,[{edge_id:'ac',reason:'UNOBSERVED_EDGE'}]);
});
test('professional network must have recorded reciprocal consent before an edge is considered',()=>{
 const x={...base('PROFESSIONAL'),nodes:['alice','bob','cara'].map(node),
 edges:[edge('ab','alice','bob','PROFESSIONAL','DECLARED_OBSERVATION','RECIPROCAL_RECORDED'),
 edge('bc','bob','cara','PROFESSIONAL','DECLARED_OBSERVATION','ONE_SIDED')]};
 const r=analyzeDeclaredNetworkGraph(x);
 assert.equal(r.included_edges,1);
 assert.equal(r.excluded_edges.length,1);
 assert.equal(r.excluded_edges[0].reason,'RECIPROCAL_CONSENT_NOT_RECORDED');
 assert.deepEqual(r.components,[['alice','bob'],['cara']]);
 assert.equal(r.person_identity_or_consent_authenticated,false);
 assert.equal(r.actions_dispatched,0);
});
test('network and professional graph edge semantics remain distinct',()=>{
 const x=topology();x.edges[0].relation='DECLARED_TIE';
 assert.throws(()=>analyzeDeclaredNetworkGraph(x),/INVALID_GRAPH_EDGE/);
 const y={...base('META'),nodes:['a','b'].map(node),edges:[edge('ab','a','b')]};
 assert.throws(()=>analyzeDeclaredNetworkGraph(y),/GRAPH_SINGLE_DOMAIN_REQUIRED/);
});
test('topology budget, parallel edges, and cross-owner subject limits',()=>{
 const x=topology();x.nodes[0].source_ref='';
 assert.throws(()=>analyzeDeclaredNetworkGraph(x),/INVALID_GRAPH_NODE/);
 const y=topology();y.edges.push(edge('ab','a','c'));
 assert.throws(()=>analyzeDeclaredNetworkGraph(y),/INVALID_GRAPH_EDGE/);
 const z=topology();z.edges.push(edge('ab2','a','b'));
 const r=analyzeDeclaredNetworkGraph(z);
 assert.deepEqual(r.bridge_edge_candidates,['bc']);
});
test('different clock domains block time correlation even with equal numbers',()=>{
 const x={...base(),left:moment('l',10,20,'clock:a'),
  right:moment('r',15,16,'clock:b')};
 const r=auditNetworkObservationAlignment(x);
 assert.equal(r.state,'CLOCK_ALIGNMENT_REQUIRED');
 assert.equal(r.overlapping_declared_windows,false);
 assert.equal(r.event_identity_proven,false);
});
test('overlapping comparable windows do not prove same actor or independent evidence',()=>{
 const x={...base(),left:moment('l',100,130),
  right:moment('r',130,160)};
 const r=auditNetworkObservationAlignment(x);
 assert.equal(r.state,'POSSIBLE_TEMPORAL_OVERLAP_NO_EVENT_IDENTITY');
 assert.equal(r.overlapping_declared_windows,true);
 assert.equal(r.shared_source_owner,true);
 assert.equal(r.independent_witnesses_proven,false);
 x.right.start_ms=131;
 assert.equal(auditNetworkObservationAlignment(x).state,'NO_OVERLAP_IN_DECLARED_WINDOWS');
});
test('clock correlation rejects cross-subject source and nonfinite timestamps',()=>{
 const x={...base(),left:moment('l',10,11),right:moment('r',10,11)};
 x.right.subject_id='other';
 assert.throws(()=>auditNetworkObservationAlignment(x),/INVALID_ALIGNMENT_SOURCE/);
 x.right.subject_id=ctx.subject_id;x.right.start_ms=Infinity;
 assert.throws(()=>auditNetworkObservationAlignment(x),/INVALID_ALIGNMENT_SOURCE/);
});
test('V22 finite interaction design reused for source, clock, protocol and identity contrasts',()=>{
 const input={source_commit,scope_id:ctx.scope_id,max_cases:24,factors:[
  {name:'SOURCE',values:['ONE','TWO']},
  {name:'CLOCK',values:['SAME','DIFFERENT']},
  {name:'PROTOCOL',values:['TCP','UDP']},
  {name:'OWNER',values:['SIGNED','UNVERIFIED']},
  {name:'EDGE',values:['PRESENT','UNKNOWN']}
 ]};
 const r=planNetworkPairwiseControls(input);
 assert.equal(r.design.exhaustive_worlds,32);
 assert.equal(r.design.total_pairs,40);
 assert.equal(r.design.covered_pairs,40);
 assert.equal(r.audit.state,'DESIGN_REPLAY_CONSISTENT');
 assert.equal(r.test_cases_executed,0);
 assert.equal(r.native_packet_capture,false);
});
test('bounded pairwise planner preserves noncompletion when budget cannot cover',()=>{
 const input={source_commit,scope_id:ctx.scope_id,max_cases:1,factors:[
  {name:'CLOCK',values:['SAME','OTHER']},
  {name:'OWNER',values:['ONE','TWO']},
  {name:'PATH',values:['DIRECT','PROXY']}
 ]};
 const r=planNetworkPairwiseControls(input);
 assert.equal(r.design.complete_design,false);
 assert.ok(r.design.missing_pairs.length>0);
 assert.equal(r.audit.state,'DESIGN_REPLAY_CONSISTENT');
});
