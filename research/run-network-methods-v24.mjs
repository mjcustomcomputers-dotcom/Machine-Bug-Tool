#!/usr/bin/env node
// Synthetic, passive demonstration. No network requests, captures or outreach.
import {reviewNetworkMethods,planNetworkMethodInteractions,auditNetworkProtocolClaims,
 analyzeDeclaredNetworkGraph,auditNetworkObservationAlignment,planNetworkPairwiseControls
} from '../lib/network-method-science-v24.mjs';
const c={source_commit:'cc6f19023fd852154f463421f6e50727419ac687',
 scope_id:'fixture:project-v24',subject_id:'fixture:owned-server',world:'SYNTHETIC',domain:'DIGITAL'};
const atom=(type,n)=>({id:'atom'+n,dimension:type,state:'SYNTHETIC',
 scope_id:c.scope_id,subject_id:c.subject_id,source_owner:'fixture:os',source_ref:'fixture:os'+n,source_version:'v24'});
const x={...c,atoms:['ENDPOINT_SNAPSHOT','SNAPSHOT_SCOPE','TCP_STATE','UDP_ENDPOINT',
 'PROTOCOL_EVIDENCE','NETWORK_TOPOLOGY','DEPENDENCY_EDGES','OBSERVATION_TIMES','CLOCK_DOMAINS'].map(atom)};
const review=reviewNetworkMethods(x);
const m=planNetworkMethodInteractions(x);
const obs=(id,kind)=>({id,kind,state:'SYNTHETIC',scope_id:c.scope_id,
 subject_id:c.subject_id,source_owner:'fixture:os',source_ref:'fixture:'+id,source_version:'v24'});
const claims=auditNetworkProtocolClaims({...c,observations:[
 obs('tcp','SOCKET_STATE'),obs('http','HTTP_RESPONSE'),obs('pid','OS_PROCESS_ID')],
 claims:[{id:'claim:tcp',type:'SOCKET_PRESENT',support_ids:['tcp']},
 {id:'claim:tls',type:'PEER_AUTHENTICATED',support_ids:['tcp']},
 {id:'claim:payment',type:'BUSINESS_OPERATION_FINAL',support_ids:['http']},
 {id:'claim:process',type:'PROCESS_IDENTITY_VERIFIED',support_ids:['pid']}]});
const node=id=>({id,scope_id:c.scope_id,subject_id:c.subject_id,
 source_ref:'fixture:node:'+id,source_owner:'fixture:os'});
const edge=(id,from,to)=>({id,from,to,relation:'LOGICAL_DEPENDENCY',
 evidence_state:'DECLARED_OBSERVATION',consent_state:'NOT_APPLICABLE',
 scope_id:c.scope_id,subject_id:c.subject_id,source_ref:'fixture:edge:'+id,
 source_version:'v24',source_owner:'fixture:os'});
const graph=analyzeDeclaredNetworkGraph({...c,nodes:['a','b','c'].map(node),
 edges:[edge('ab','a','b'),edge('bc','b','c')]});
const align=auditNetworkObservationAlignment({...c,
 left:{id:'left',scope_id:c.scope_id,subject_id:c.subject_id,source_ref:'fixture:l',
 source_owner:'fixture:os',clock_domain:'clock:one',start_ms:100,end_ms:120},
 right:{id:'right',scope_id:c.scope_id,subject_id:c.subject_id,source_ref:'fixture:r',
 source_owner:'fixture:os',clock_domain:'clock:two',start_ms:110,end_ms:125}});
const pair=planNetworkPairwiseControls({source_commit:c.source_commit,scope_id:c.scope_id,max_cases:24,
 factors:[{name:'CLOCK',values:['SAME','DIFFERENT']},{name:'OWNER',values:['MATCH','UNKNOWN']},
 {name:'LINK',values:['VISIBLE','MISSING']},{name:'PROTOCOL',values:['TCP','UDP']},
 {name:'SESSION',values:['FRESH','STALE']}]});
console.log(JSON.stringify({kind:'MPC_V24_SYNTHETIC_NETWORK_METHOD_PASS',
 research_hooks:review.method_reviews.length,
 acquired_evidence_atoms:review.atom_count,
 research_hooks_applicable:review.applicable_hook_count,
 method_dependency_links:m.edges.length,
 hypothetical_method_compositions:m.hypothetical_compositions,
 limited_claim_results:claims.reviews.map(x=>({type:x.claim_type,state:x.state})),
 graph_review:{bridge_edges:graph.bridge_edge_candidates,articulation:graph.articulation_node_candidates,
  authenticated_failure_impact:graph.failure_or_social_influence_proven},
 time_alignment:align.state,
 pairwise_design:{total:pair.design.total_pairs,planned_covered:pair.design.covered_pairs,
 cases:pair.design.cases.length,audit:pair.audit.state},
 actual_network_actions:0,contacts_sent:0,registered_evaluators_added:0,
 source_authentication:false,canonical_promotion:false},null,2));
