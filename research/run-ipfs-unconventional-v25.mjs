#!/usr/bin/env node
// Deterministic synthetic IPFS/odd-method laboratory. No network, uploads, pinning.
import {verifyCidv1Block,planDeclaredDagTraversal,joinTwoPhaseReplicas,
 planRendezvousPlacement,auditIpfsEvidenceClaims,planOddMethodCompositions
} from '../lib/ipfs-metamethod-v25.mjs';
import {reconcileFiniteIblt} from '../lib/ipfs-set-reconciliation-v25.mjs';
const scope={source_commit:'902bedcfc296d3a5f53456f872b4aefcf153dc56',
 scope_id:'fixture:odd-method-v25',subject_id:'fixture:local-atom-25'};
const cid='bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq';
const block=verifyCidv1Block({...scope,cid,block_base64:Buffer.from('hello').toString('base64'),
 source_ref:'fixture:block',source_owner:'fixture:lab',source_version:'v25'});
const n=(id,links)=>({id,cid,links,source_ref:'fixture:'+id,state:'PRESENT'});
const dag=planDeclaredDagTraversal({...scope,root_id:'root',nodes:[
 n('root',['a','b']),n('a',['leaf']),n('b',[]),n('leaf',[])]});
const crdt=joinTwoPhaseReplicas({...scope,replicas:[
 {replica_id:'a',adds:['a','b'],removes:['b'],source_ref:'fixture:a',source_version:'v1'},
 {replica_id:'b',adds:['b','c'],removes:[],source_ref:'fixture:b',source_version:'v2'}]});
const placement=planRendezvousPlacement({...scope,
 keys:['assetA','assetB','assetC'],replica_count:2,
 nodes:[{id:'node1',failure_domain:'zoneA',source_ref:'fixture:1'},
 {id:'node2',failure_domain:'zoneB',source_ref:'fixture:2'},
 {id:'node3',failure_domain:'zoneB',source_ref:'fixture:3'}]});
const iblt=reconcileFiniteIblt({...scope,cell_count:64,
 left:[1,2,3,7],right:[2,3,4,8]});
const origin=(id,kind)=>({id,kind,state:'SYNTHETIC',source_ref:'fixture:'+id,
 source_owner:'fixture:lab',source_version:'v1',scope_id:scope.scope_id,subject_id:scope.subject_id});
const claims=auditIpfsEvidenceClaims({...scope,world:'SYNTHETIC',
 observations:[origin('provider','PROVIDER_ROUTING_RECORD')],
 claims:[{id:'discover',claim:'PROVIDER_ADVERTISED',support_ids:['provider']},
 {id:'available',claim:'RETRIEVABLE_NOW',support_ids:['provider']}]});
const atoms=(id,kind)=>({id,kind,state:'SUPPLIED',source_ref:'fixture:'+id,
 source_owner:'fixture:lab',source_version:'v1'});
const meta=planOddMethodCompositions({...scope,atoms:[
 atoms('data','BLOCK_BYTES'),atoms('cid','CID_TEXT'),
 atoms('codec','CODEC_PROFILE'),atoms('provider','PROVIDER_RECORD'),
 atoms('key','CONTENT_KEY')]});
console.log(JSON.stringify({
 kind:'MPC_V25_IPFS_UNCONVENTIONAL_SYNTHETIC_PASS',
 source_commit:scope.source_commit,research_hook_contracts:meta.method_contracts,
 cid_block_digest_result:block.state,cid_file_identity_verified:block.raw_file_identity_proven,
 declared_dag_state:dag.state,declared_dag_nodes:dag.selected.length,
 dag_codec_link_proof:dag.encoded_links_verified,
 crdt_laws:crdt.invariants,crdt_effective_keys:crdt.effective_ids.length,
 hrw_keys:placement.keys.length,
 correlated_failure_domain_flags:placement.keys.filter(k=>k.shared_failure_domain_risk).length,
 iblt_status:iblt.status,iblt_left_only:iblt.reconstructed_left_only,
 iblt_right_only:iblt.reconstructed_right_only,
 declared_ipfs_claim_states:claims.claim_reviews.map(x=>({claim:x.claim,state:x.state})),
 method_dependency_edges:meta.matching_dependency_edges,
 hypothetical_compositions:meta.hypothetical_compositions,
 method_executions:0,remote_ipfs_requests:0,
 authenticated_real_world_claims:0,canonical_promotion:false
},null,2));
