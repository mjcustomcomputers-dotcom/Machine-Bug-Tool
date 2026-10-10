import test from 'node:test';
import assert from 'node:assert/strict';
import frontier from '../research/ipfs-unconventional-metamethod-v25.json' with {type:'json'};
import {
 ipfsMetaContract,decodeLimitedCidv1,makeSyntheticCidv1Raw,
 verifyCidv1Block,planDeclaredDagTraversal,joinTwoPhaseReplicas,
 planRendezvousPlacement,auditIpfsEvidenceClaims,planOddMethodCompositions
} from '../lib/ipfs-metamethod-v25.mjs';
import {ibltV25Contract,reconcileFiniteIblt} from '../lib/ipfs-set-reconciliation-v25.mjs';
const source_commit='902bedcfc296d3a5f53456f872b4aefcf153dc56',
 scope_id='fixture:scope-v25',subject_id='fixture:subject-v25',
 ctx={source_commit,scope_id,subject_id};
const HELLO_CID='bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq';
const buffer=x=>Buffer.from(x);
const cid=x=>makeSyntheticCidv1Raw(buffer(x));
const block=(data='hello')=>({...ctx,cid:cid(data),
 block_base64:buffer(data).toString('base64'),
 source_ref:'fixture:block-source',source_owner:'fixture:owner',source_version:'revision1'});
const node=(id,links=[],state='PRESENT')=>({
 id,cid:cid('block:'+id),links,state,source_ref:'fixture:'+id});
const dag=(nodes,max_depth=8,max_selected_nodes=64)=>({...ctx,
 root_id:'root',nodes,max_depth,max_selected_nodes});
const replica=(replica_id,adds,removes=[])=>({replica_id,adds,removes,
 source_ref:'fixture:'+replica_id,source_version:'r1'});
const repl=(replicas)=>({...ctx,replicas});
const hrw=()=>({...ctx,keys:['alpha','beta','gamma','delta'],replica_count:2,
 nodes:[{id:'nodeA',failure_domain:'zoneA',source_ref:'fixture:A'},
 {id:'nodeB',failure_domain:'zoneB',source_ref:'fixture:B'},
 {id:'nodeC',failure_domain:'zoneC',source_ref:'fixture:C'}]});
const observation=(id,kind,state='SYNTHETIC')=>({id,kind,state,
 source_ref:'fixture:'+id,source_owner:'fixture:owner',source_version:'v1',scope_id,subject_id});
const claim=(id,kind,support_ids)=>({id,claim:kind,support_ids});
const claims=(observations,arr,world='SYNTHETIC')=>({...ctx,world,observations,claims:arr});
const atom=(id,kind,state='SUPPLIED')=>({id,kind,state,
 source_ref:'fixture:'+id,source_owner:'fixture:owner',source_version:'v1'});
const sketch=(left,right,cell_count=64)=>({...ctx,left,right,cell_count});
test('noncanonical 28 hook source registry is separate from native method identities',()=>{
 assert.equal(frontier.hooks.length,28);
 assert.equal(frontier.native_evaluators_unchanged,24);
 assert.equal(frontier.original_atlas_candidates_unchanged,239);
 assert.equal(frontier.canonical_promotion,false);
 assert.equal(ipfsMetaContract.native_evaluators_added,0);
 assert.equal(ibltV25Contract.native_evaluator_added,false);
 assert.equal(new Set(frontier.hooks.map(x=>x.id)).size,28);
 assert.ok(frontier.hooks.every(x=>x.primary_sources.length>0&&
  x.primary_sources.every(s=>s.startsWith('https://'))&&x.method_executed===false));
});
test('exact CIDv1 raw sha2-256 known vector matches independent published hello example',()=>{
 const ours=makeSyntheticCidv1Raw(buffer('hello'));
 assert.equal(ours,HELLO_CID);
 const p=decodeLimitedCidv1(HELLO_CID);
 assert.equal(p.version,1);
 assert.equal(p.codec,'raw');
 assert.equal(p.digest_hex,'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
 const r=verifyCidv1Block(block('hello'));
 assert.equal(r.state,'BLOCK_SHA256_MATCHED');
 assert.equal(r.block_bytes,5);
 assert.equal(r.codec_links_decoded,false);
 assert.equal(r.author_or_legal_owner_verified,false);
 assert.equal(r.remote_availability_verified,false);
});
test('unrelated bytes cannot be promoted simply because a CID was supplied',()=>{
 const x=block('hello');x.block_base64=buffer('goodbye').toString('base64');
 assert.equal(verifyCidv1Block(x).state,'BLOCK_SHA256_MISMATCH');
 assert.equal(verifyCidv1Block(x).source_authenticated,false);
});
test('reject uppercase, overlong, truncated, extra and unsupported multibase CIDs',()=>{
 for(const bad of [HELLO_CID.toUpperCase(),'z'+HELLO_CID.slice(1),
  HELLO_CID.slice(0,-3),HELLO_CID+'a',HELLO_CID.replace(/^b/,'Q')]){
  assert.throws(()=>decodeLimitedCidv1(bad),/INVALID_CID|NONCANONICAL|UNSUPPORTED/);
 }
});
test('strict base64 proof bytes and source identity are bounded',()=>{
 const x=block('hello');x.block_base64='aGVsbG8= ';
 assert.throws(()=>verifyCidv1Block(x),/INVALID_BASE64_BLOCK/);
 const y=block('hello');y.source_version='';
 assert.throws(()=>verifyCidv1Block(y),/CID_SOURCE_REQUIRED/);
 const z=block('hello');z.secret='private';
 assert.throws(()=>verifyCidv1Block(z),/INVALID_CID_BLOCK_FIELDS/);
 const long=buffer('x'.repeat(1048577));
 assert.throws(()=>makeSyntheticCidv1Raw(long),/BLOCK_SIZE_BUDGET/);
});
test('CIDv1 raw block digest proof is not UnixFS graph or file provenance proof',()=>{
 const r=verifyCidv1Block(block());
 assert.equal(r.native_block_digest_recomputed,true);
 assert.equal(r.raw_file_identity_proven,false);
 assert.equal(r.source_authenticated,false);
 assert.equal(r.canonical_promotion,false);
});
test('finite DAG visits declared descendants, never claims IPLD codec verification',()=>{
 const p=planDeclaredDagTraversal(dag([node('root',['a','b']),node('a',['leaf']),
  node('b',[]),node('leaf',[])]));
 assert.deepEqual(p.selected.map(x=>x.id),['root','a','b','leaf']);
 assert.deepEqual(p.missing_or_unknown_nodes,[]);
 assert.equal(p.state,'DECLARED_GRAPH_WALK_COMPLETE_NOT_IPLD_VERIFIED');
 assert.equal(p.encoded_links_verified,false);
 assert.equal(p.cid_bytes_verified,false);
 assert.equal(p.complete_ipld_dag_proven,false);
});
test('missing and unknown DAG children trigger explicit acquisition frontier',()=>{
 const p=planDeclaredDagTraversal(dag([node('root',['missing','known']),
  node('known',[],'UNKNOWN')]));
 assert.deepEqual(p.missing_or_unknown_nodes,['known','missing']);
 assert.equal(p.state,'DECLARED_GRAPH_MISSING_NODES');
});
test('cycle in declared DAG cannot be mistaken for an authenticated Merkle DAG',()=>{
 const p=planDeclaredDagTraversal(dag([node('root',['a']),node('a',['root'])]));
 assert.equal(p.state,'DECLARED_GRAPH_CYCLE_REVIEW_REQUIRED');
 assert.deepEqual(p.suspected_cycles,['root']);
});
test('depth or size budget reports truncation instead of a complete DAG',()=>{
 let p=planDeclaredDagTraversal(dag([node('root',['a']),node('a',['b']),node('b',[])],0));
 assert.equal(p.state,'DECLARED_TRAVERSAL_BUDGET_BOUNDARY');
 assert.deepEqual(p.unvisited_budget_boundary,['a']);
 p=planDeclaredDagTraversal(dag([node('root',['a','b']),node('a',[]),node('b',[])],8,1));
 assert.equal(p.state,'DECLARED_TRAVERSAL_BUDGET_BOUNDARY');
 assert.deepEqual(p.unvisited_budget_boundary,['a','b']);
});
test('DAG rejects invalid foreign graph links, duplicate IDs and unsupported input fields',()=>{
 assert.throws(()=>planDeclaredDagTraversal(dag([node('root',['a','a']),node('a',[])])),/INVALID_DAG_LINKS/);
 assert.throws(()=>planDeclaredDagTraversal(dag([node('root',[]),node('root',[])])),/INVALID_DAG_NODE/);
 const x=dag([node('root',[])]);x.nodes[0].raw_private_data='secret';
 assert.throws(()=>planDeclaredDagTraversal(x),/INVALID_DAG_NODE_FIELDS/);
});
test('2P-set join algebra gives idempotence, commutativity, associativity and no resurrection',()=>{
 const x=repl([replica('one',['a','b'],['b']),replica('two',['b','c'],[]),
   replica('three',['a','d'],['a'])]);
 const r=joinTwoPhaseReplicas(x);
 assert.deepEqual(r.merged_adds,['a','b','c','d']);
 assert.deepEqual(r.merged_tombstones,['a','b']);
 assert.deepEqual(r.effective_ids,['c','d']);
 assert.ok(Object.values(r.invariants).every(Boolean));
 assert.equal(r.data_erasure_performed,false);
 assert.equal(r.replica_authentication,false);
});
test('CRDT variant ordering yields identical semilattice result',()=>{
 const a=replica('a',['x','y'],['x']);
 const b=replica('b',['z'],[]);
 const c=replica('c',['w','x'],['w']);
 const x=joinTwoPhaseReplicas(repl([a,b,c]));
 const y=joinTwoPhaseReplicas(repl([c,a,b]));
 assert.deepEqual(x.effective_ids,y.effective_ids);
 assert.deepEqual(x.merged_tombstones,y.merged_tombstones);
});
test('2P-set forbids unsupported locally tombstoned nonadd and duplicate data',()=>{
 const x=repl([replica('one',['a'],['b']),replica('two',['b'])]);
 assert.throws(()=>joinTwoPhaseReplicas(x),/TOMBSTONE_WITHOUT_LOCAL_ADD/);
 const y=repl([replica('one',['a','a']),replica('two',['b'])]);
 assert.throws(()=>joinTwoPhaseReplicas(y),/INVALID_REPLICA_ELEMENTS/);
 const z=repl([replica('one',['a']),replica('one',['b'])]);
 assert.throws(()=>joinTwoPhaseReplicas(z),/INVALID_REPLICA_ID/);
});
test('tombstones remain visible as nonresurrection warning, not archival source deletion',()=>{
 const r=joinTwoPhaseReplicas(repl([replica('a',['e','f'],['e']),replica('b',['e'],[])]));
 assert.ok(!r.effective_ids.includes('e'));
 assert.ok(r.merged_tombstones.includes('e'));
 assert.equal(r.data_erasure_performed,false);
 assert.equal(r.underlying_facts_verified,false);
});
test('HRW ranking is deterministic with bounded two-node sample and no availability proof',()=>{
 const x=hrw(),r=planRendezvousPlacement(x);
 assert.deepEqual(r,planRendezvousPlacement(x));
 assert.equal(r.keys.length,4);
 assert.ok(r.keys.every(x=>x.selected_node_ids.length===2));
 assert.equal(r.live_network_or_node_availability_checked,false);
 assert.equal(r.content_placement_performed,false);
});
test('HRW same failure domain warns about correlated replicas',()=>{
 const x=hrw();x.nodes.forEach(n=>n.failure_domain='zone:shared');
 const r=planRendezvousPlacement(x);
 assert.ok(r.keys.every(k=>k.shared_failure_domain_risk));
 assert.equal(r.independent_failure_proven,false);
});
test('HRW adding one candidate only displaces previous winner if it wins the key',()=>{
 const x=hrw();x.replica_count=1;
 const baseline=planRendezvousPlacement(x);
 x.nodes.push({id:'nodeD',failure_domain:'zoneD',source_ref:'fixture:D'});
 const changed=planRendezvousPlacement(x);
 for(let i=0;i<baseline.keys.length;i++){
  const old=baseline.keys[i].selected_node_ids[0];
  const now=changed.keys[i].selected_node_ids[0];
  if(old!==now)assert.equal(now,'nodeD');
 }
});
test('HRW invalid source and budget are rejected instead of ranked',()=>{
 const x=hrw();x.nodes[0].source_ref='';
 assert.throws(()=>planRendezvousPlacement(x),/INVALID_HRW_NODE/);
 const y=hrw();y.replica_count=5;
 assert.throws(()=>planRendezvousPlacement(y),/INVALID_HRW_CAPACITY/);
});
test('provider record is not a fresh successful verified block retrieval',()=>{
 const result=auditIpfsEvidenceClaims(claims([observation('provider','PROVIDER_ROUTING_RECORD')],[
  claim('has-provider','PROVIDER_ADVERTISED',['provider']),
  claim('available','RETRIEVABLE_NOW',['provider']),
  claim('authentic','FILE_AUTHENTICITY',['provider'])]));
 assert.equal(result.claim_reviews[0].state,'REQUIRED_EVIDENCE_TYPES_DECLARED_UNAUTHENTICATED');
 assert.equal(result.claim_reviews[1].state,'EVIDENCE_TYPE_OR_STATE_MISSING');
 assert.deepEqual(result.claim_reviews[1].unsatisfied_evidence_types,
  ['FRESH_SUCCESSFUL_FETCH','FETCH_BLOCK_VERIFIED']);
 assert.equal(result.claim_reviews[2].state,'EVIDENCE_TYPE_OR_STATE_MISSING');
 assert.equal(result.claims_verified,0);
});
test('pinning and IPNS sequence without crypto freshness are not sufficient',()=>{
 const xs=claims([observation('pin','PIN_RECEIPT'),
  observation('sequence','IPNS_SEQUENCE_COMPARISON')],[
  claim('available','RETRIEVABLE_NOW',['pin']),
  claim('latest','IPNS_LATEST_RESOLVED',['sequence']),
  claim('pin-receipt','PIN_RETAINED',['pin'])]);
 const r=auditIpfsEvidenceClaims(xs);
 assert.ok(r.claim_reviews.every(c=>c.state==='EVIDENCE_TYPE_OR_STATE_MISSING'));
 assert.ok(r.claim_reviews[1].unsatisfied_evidence_types.includes('IPNS_CRYPTO_VERIFICATION'));
});
test('even all caller-named evidence types stay unauthenticated until native review',()=>{
 const r=auditIpfsEvidenceClaims(claims([observation('fetch','FRESH_SUCCESSFUL_FETCH'),
  observation('digest','FETCH_BLOCK_VERIFIED')],[
   claim('fresh','RETRIEVABLE_NOW',['fetch','digest'])]));
 assert.equal(r.claim_reviews[0].state,'REQUIRED_EVIDENCE_TYPES_DECLARED_UNAUTHENTICATED');
 assert.equal(r.claim_reviews[0].verified_real_world,false);
});
test('global deletion cannot be deduced from any IPFS receipt or pin status',()=>{
 const r=auditIpfsEvidenceClaims(claims([observation('pin','PIN_RECEIPT')],[
  claim('delete','GLOBAL_DELETION',['pin'])]));
 assert.equal(r.claim_reviews[0].state,'GLOBAL_ERASURE_NOT_PROVABLE_BY_THESE_INPUTS');
 assert.equal(r.claims_verified,0);
});
test('contradictory evidence prevents promotion even with positive type witness',()=>{
 const r=auditIpfsEvidenceClaims(claims([
  observation('one','FETCH_BLOCK_VERIFIED','OBSERVED'),
  observation('two','FETCH_BLOCK_VERIFIED','CONTRADICTED'),
  observation('three','FRESH_SUCCESSFUL_FETCH','OBSERVED')],[
  claim('retrievable','RETRIEVABLE_NOW',['one','two','three'])],'RECORD'));
 assert.equal(r.claim_reviews[0].state,'CONTRADICTORY_EVIDENCE_REVIEW');
});
test('world, subject, unsupported claims and extra fields fail closed',()=>{
 const x=claims([observation('fetch','FRESH_SUCCESSFUL_FETCH')],
  [claim('bad','NOT_SUPPORTED',['fetch'])]);
 assert.throws(()=>auditIpfsEvidenceClaims(x),/UNKNOWN_IPFS_CLAIM_KIND/);
 const y=claims([observation('a','PIN_RECEIPT')],[claim('pin','PIN_RETAINED',['a'])]);
 y.observations[0].subject_id='other';
 assert.throws(()=>auditIpfsEvidenceClaims(y),/INVALID_IPFS_OBSERVATION/);
 const z=claims([observation('a','PIN_RECEIPT')],[claim('pin','PIN_RETAINED',['a'])],'RECORD');
 assert.throws(()=>auditIpfsEvidenceClaims(z),/INVALID_IPFS_OBSERVATION/);
});
test('method-on-method connects distinct hypothesis types without treating them as executed',()=>{
 const input={...ctx,atoms:[
 atom('b','BLOCK_BYTES'),atom('c','CID_TEXT'),atom('d','PROVIDER_RECORD'),
 atom('e','CONTENT_KEY'),atom('f','CODEC_PROFILE'),atom('g','IPNS_RECORD_SIGNATURE'),
 atom('h','IPNS_SEQUENCE'),atom('i','CLOCK_EVIDENCE')]};
 const p=planOddMethodCompositions(input);
 assert.equal(p.method_contracts,28);
 assert.equal(p.directed_pairs_considered,756);
 const link=p.edges.find(e=>e.from==='RH-V25-01'&&e.to==='RH-V25-02');
 assert.deepEqual(link.bridge,['BLOCK_INTEGRITY_RECEIPT']);
 assert.equal(link.state,'HYPOTHETICAL_COMPOSITION_ONLY');
 assert.equal(link.transferred_output_observed,false);
 assert.equal(p.method_execution,'NOT_EXECUTED');
 assert.ok(p.edges.some(e=>e.from==='RH-V25-06'&&e.to==='RH-V25-25'));
});
test('method-on-method missing upstream record is acquisition instead of confident result',()=>{
 const p=planOddMethodCompositions({...ctx,atoms:[atom('a','CID_TEXT')]});
 const edge=p.edges.find(e=>e.from==='RH-V25-01'&&e.to==='RH-V25-02');
 assert.equal(edge.state,'SOURCE_OR_PRIOR_METHOD_OUTPUT_NEEDED');
 assert.ok(edge.missing_upstream.includes('BLOCK_BYTES'));
 assert.equal(edge.independent_evidence_proven,false);
});
test('IBLT small signed set difference peels and exactly replays without network',()=>{
 const r=reconcileFiniteIblt(sketch([1,2,3,7],[2,3,4,8],64));
 assert.equal(r.status,'FINITE_DECODE_EXACT_REPLAY_CONSISTENT');
 assert.deepEqual(r.reconstructed_left_only,[1,7]);
 assert.deepEqual(r.reconstructed_right_only,[4,8]);
 assert.equal(r.exact_replay_matches,true);
 assert.equal(r.remote_sets_acquired,false);
});
test('IBLT identical sets produce empty exact difference',()=>{
 const r=reconcileFiniteIblt(sketch([2,4,6],[2,4,6],8));
 assert.equal(r.status,'FINITE_DECODE_EXACT_REPLAY_CONSISTENT');
 assert.deepEqual(r.reconstructed_left_only,[]);
 assert.deepEqual(r.reconstructed_right_only,[]);
 assert.equal(r.residual_cell_count,0);
});
test('overfilled IBLT cannot invent successful decode; exact local replay stays distinct',()=>{
 const r=reconcileFiniteIblt(sketch(Array.from({length:32},(_,i)=>i+1),
  Array.from({length:32},(_,i)=>i+101),6));
 assert.equal(r.status,'SKETCH_NON_DECODABLE');
 assert.ok(r.residual_cell_count>0);
 assert.equal(r.exact_replay_matches,false);
 assert.deepEqual(r.reconstructed_left_only,[]);
 assert.equal(r.exact_local_left_only.length,32);
});
test('IBLT exact input bounds reject duplicate/noninteger/oversize and bad cell budget',()=>{
 const a=sketch([1,1],[2]);
 assert.throws(()=>reconcileFiniteIblt(a),/INVALID_LEFT_SET/);
 const b=sketch([NaN],[2]);
 assert.throws(()=>reconcileFiniteIblt(b),/INVALID_LEFT_SET/);
 const c=sketch([1],[2],2);
 assert.throws(()=>reconcileFiniteIblt(c),/INVALID_IBLT_CELL_BUDGET/);
 const d=sketch([1],[2],64);d.additional_secret=42;
 assert.throws(()=>reconcileFiniteIblt(d),/INVALID_IBLT_INPUT_FIELDS/);
});
