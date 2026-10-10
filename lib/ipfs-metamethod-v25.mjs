// MPC V25 — limited real CIDv1 integrity, declared IPLD graph, 2P-set CRDT,
// rendezvous placement and source-typed research hooks. NO IPFS networking.
// The 28 source-attributed hooks are proposals, not native evaluator IDs.
import {createHash} from 'node:crypto';
import frontier from '../research/ipfs-unconventional-metamethod-v25.json' with {type:'json'};
const fail=x=>{throw Error(x)};
const IDENT=/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,119}$/u;
const DIM=/^[A-Z][A-Z0-9_]{0,63}$/u;
const GIT=/^[a-f0-9]{40}$/u;
const B32='abcdefghijklmnopqrstuvwxyz234567';
const COMMIT=frontier.parent_git_head;
const sha=x=>createHash('sha256').update(x).digest();
const hex=d=>sha(d).toString('hex');
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x,allowed,label)=>{if(!obj(x)||Object.keys(x).some(k=>!allowed.includes(k)))fail('INVALID_'+label+'_FIELDS')};
const uid=x=>typeof x==='string'&&IDENT.test(x);
const items=(a,limit,label)=>{if(!dense(a)||a.length>limit)fail('INVALID_'+label);return a};
const unique=a=>[...new Set(a)];
const sorted=a=>unique(a).sort();
const compare=(a,b)=>a<b?-1:a>b?1:0;
const signed=(v,label)=>{if(!Number.isSafeInteger(v)||v<0)fail(label);return v};
function scope(input){
 if(!obj(input)||!GIT.test(input.source_commit||'')||!uid(input.scope_id)||
  !uid(input.subject_id))fail('INVALID_V25_SCOPE');
 return {source_commit:input.source_commit,scope_id:input.scope_id,subject_id:input.subject_id};
}
if(frontier.namespace!=='RH_V25_NONCANONICAL_RESEARCH_OVERLAY'||
 frontier.native_evaluators_unchanged!==24||frontier.original_atlas_candidates_unchanged!==239||
 frontier.canonical_promotion!==false||frontier.hooks.length!==28||
 new Set(frontier.hooks.map(x=>x.id)).size!==28||
 frontier.hooks.some(h=>!/^RH-V25-[0-9]{2}$/u.test(h.id)||
 !dense(h.requires)||!dense(h.produces)||!h.requires.length||!h.produces.length||
 [...h.requires,...h.produces].some(x=>!DIM.test(x))||
 !items(h.primary_sources,4,'PRIMARY_SOURCES').every(x=>typeof x==='string'&&x.startsWith('https://'))))
 fail('V25_FRONTIER_INVALID');

export const ipfsMetaContract=Object.freeze({
 version:frontier.version, research_hooks:frontier.hooks.length,
 native_evaluators_added:0, existing_mha_modified:false,
 cid_version_supported:1, cid_multibase_supported:'base32_lowercase_b',
 multihash_supported:'sha2_256_32_bytes',
 supported_codecs:{raw:0x55,'dag-pb':0x70,'dag-cbor':0x71},
 max_cid_block_bytes:1048576,max_dag_nodes:64,max_dag_edges:256,
 max_replicas:4,max_replica_ids:64,max_methods:28,
 no_network_dispatch:true,no_ipfs_peer_or_gateway_client:true,
 no_verified_ipld_codec_link_extraction:true,
 source_authenticated:false,object_authorship_verified:false,
 canonical_promotion:false
});
function base32bytes(cid){
 if(typeof cid!=='string'||cid.length<5||cid.length>128||cid[0]!=='b'||
  !/^[a-z2-7]+$/u.test(cid.slice(1)))fail('INVALID_CID_BASE32');
 let acc=0,bits=0,out=[];
 for(const c of cid.slice(1)){
  acc=(acc<<5)|B32.indexOf(c);bits+=5;
  if(bits>=8){bits-=8;out.push((acc>>bits)&255);acc&=(1<<bits)-1;}
 }
 if(bits>=5||acc!==0)fail('NONCANONICAL_CID_BASE32');
 return Buffer.from(out);
}
function base32text(bytes){
 let acc=0,bits=0,str='b';
 for(const byte of bytes){acc=(acc<<8)|byte;bits+=8;
  while(bits>=5){bits-=5;str+=B32[(acc>>bits)&31];acc&=(1<<bits)-1;}}
 if(bits>0)str+=B32[(acc<<(5-bits))&31];
 return str;
}
export function decodeLimitedCidv1(cid){
 const b=base32bytes(cid);
 if(b.length!==36||b[0]!==0x01||![0x55,0x70,0x71].includes(b[1])||
 b[2]!==0x12||b[3]!==0x20)fail('UNSUPPORTED_CIDV1_PROFILE');
 if(base32text(b)!==cid)fail('NONCANONICAL_CID');
 const codec=b[1]===0x55?'raw':b[1]===0x70?'dag-pb':'dag-cbor';
 return {version:1,codec,multihash:'sha2-256',digest_hex:b.subarray(4).toString('hex'),
  canonical_cid:cid,block_byte_digest_only:true};
}
export function makeSyntheticCidv1Raw(bytes){
 if(!Buffer.isBuffer(bytes)&&!(bytes instanceof Uint8Array))fail('INVALID_SYNTHETIC_BYTES');
 if(bytes.byteLength>1048576)fail('BLOCK_SIZE_BUDGET');
 return base32text(Buffer.concat([Buffer.from([1,0x55,0x12,0x20]),sha(bytes)]));
}
function decodeBase64(v){
 if(typeof v!=='string'||v.length>1398104||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(v))
  fail('INVALID_BASE64_BLOCK');
 const b=Buffer.from(v,'base64');
 if(b.length>1048576||b.toString('base64')!==v)fail('INVALID_CANONICAL_BLOCK_BYTES');
 return b;
}
// Verifies SHA-256 of one caller-supplied BLOCK against the digest encoded
// inside a bounded CIDv1. Does not claim UnixFS file, DAG, remote peer or owner.
export function verifyCidv1Block(input){
 const ctx=scope(input);
 keys(input,['source_commit','scope_id','subject_id','cid','block_base64','source_ref',
  'source_owner','source_version'],'CID_BLOCK');
 if(!uid(input.source_ref)||!uid(input.source_owner)||!uid(input.source_version))fail('CID_SOURCE_REQUIRED');
 const parsed=decodeLimitedCidv1(input.cid);
 const bytes=decodeBase64(input.block_base64);
 const digest=hex(bytes);
 return {version:frontier.version,...ctx,cid:input.cid,
  codec:parsed.codec,multihash:parsed.multihash,computed_digest_hex:digest,
  block_bytes:bytes.length,source_ref:input.source_ref,source_owner:input.source_owner,
  source_version:input.source_version,
  state:digest===parsed.digest_hex?'BLOCK_SHA256_MATCHED':'BLOCK_SHA256_MISMATCH',
  native_block_digest_recomputed:true,raw_file_identity_proven:false,
  codec_links_decoded:false,source_authenticated:false,
  author_or_legal_owner_verified:false,remote_availability_verified:false,
  canonical_promotion:false};
}
// IPLD-inspired selector traversal over EXPLICIT edges only. No codec parsing.
// Missing nodes and budget truncation are review signals, not inferred deletion.
export function planDeclaredDagTraversal(input){
 const ctx=scope(input);
 keys(input,['source_commit','scope_id','subject_id','root_id','nodes',
  'max_depth','max_selected_nodes'],'DAG_INPUT');
 if(!uid(input.root_id)||!dense(input.nodes)||!input.nodes.length||
  input.nodes.length>64)fail('INVALID_DAG_NODES');
 const maxDepth=input.max_depth??8,maxSelected=input.max_selected_nodes??64;
 if(!Number.isInteger(maxDepth)||maxDepth<0||maxDepth>12||
  !Number.isInteger(maxSelected)||maxSelected<1||maxSelected>64)fail('INVALID_DAG_BUDGET');
 const index=new Map();let countEdges=0;
 for(const n of input.nodes){
  keys(n,['id','cid','links','source_ref','state'],'DAG_NODE');
  if(!uid(n.id)||index.has(n.id)||!uid(n.source_ref)||
   !['PRESENT','MISSING','UNKNOWN'].includes(n.state))fail('INVALID_DAG_NODE');
  decodeLimitedCidv1(n.cid);
  if(!dense(n.links)||n.links.length>32||n.links.some(x=>!uid(x))||
     unique(n.links).length!==n.links.length)fail('INVALID_DAG_LINKS');
  countEdges+=n.links.length;
  index.set(n.id,n);
 }
 if(countEdges>256||!index.has(input.root_id))fail('DAG_EDGE_OR_ROOT_BUDGET');
 const queue=[{id:input.root_id,depth:0,ancestors:[]}],visited=new Set(),
  missing=new Set(),truncated=new Set(),cycles=new Set(),chosen=[];
 for(let i=0;i<queue.length;i++){
  const {id,depth,ancestors}=queue[i],node=index.get(id);
  if(!node){missing.add(id);continue;}
  if(ancestors.includes(id)){cycles.add(id);continue;}
  if(visited.has(id))continue;
  if(visited.size>=maxSelected){truncated.add(id);continue;}
  visited.add(id);chosen.push({id,depth,cid:node.cid,state:node.state});
  if(node.state!=='PRESENT')missing.add(id);
  if(depth>=maxDepth){for(const child of node.links)truncated.add(child);continue;}
  for(const child of sorted(node.links)){
   if(ancestors.includes(child)||id===child){cycles.add(child);continue;}
   queue.push({id:child,depth:depth+1,ancestors:[...ancestors,id]});
  }
 }
 return {version:frontier.version,...ctx,root_id:input.root_id,
  declared_nodes:input.nodes.length,declared_edges:countEdges,
  selected:chosen,missing_or_unknown_nodes:sorted([...missing]),
  suspected_cycles:sorted([...cycles]),unvisited_budget_boundary:sorted([...truncated]),
  state:cycles.size?'DECLARED_GRAPH_CYCLE_REVIEW_REQUIRED':
   missing.size?'DECLARED_GRAPH_MISSING_NODES':
   truncated.size?'DECLARED_TRAVERSAL_BUDGET_BOUNDARY':'DECLARED_GRAPH_WALK_COMPLETE_NOT_IPLD_VERIFIED',
  selector_standard_implemented:false,encoded_links_verified:false,
  cid_bytes_verified:false,complete_ipld_dag_proven:false,
  source_authentication:false,network_actions:0,canonical_promotion:false};
}
// State-based 2P-Set (adds/removes grow monotonically). Joining is the
// semilattice componentwise UNION; tombstoned IDs never return in 2P-Set.
// This is not a signed event log, consensus system or data erasure action.
export function joinTwoPhaseReplicas(input){
 const ctx=scope(input);
 keys(input,['source_commit','scope_id','subject_id','replicas'],'CRDT_INPUT');
 if(!dense(input.replicas)||input.replicas.length<2||input.replicas.length>4)fail('INVALID_REPLICAS');
 const sources=new Set(),states=[];
 for(const r of input.replicas){
  keys(r,['replica_id','adds','removes','source_ref','source_version'],'CRDT_REPLICA');
  if(!uid(r.replica_id)||sources.has(r.replica_id)||
   !uid(r.source_ref)||!uid(r.source_version))fail('INVALID_REPLICA_ID');
  sources.add(r.replica_id);
  for(const p of ['adds','removes']){
   items(r[p],64,'REPLICA_'+p.toUpperCase());
   if(r[p].some(x=>!uid(x))||unique(r[p]).length!==r[p].length)fail('INVALID_REPLICA_ELEMENTS');
  }
  if(r.removes.some(x=>!r.adds.includes(x)))fail('TOMBSTONE_WITHOUT_LOCAL_ADD');
  states.push({adds:sorted(r.adds),removes:sorted(r.removes)});
 }
 const j=(a,b)=>({adds:sorted([...a.adds,...b.adds]),removes:sorted([...a.removes,...b.removes])});
 const canon=x=>JSON.stringify(x);
 let associative=true,commutative=true,idempotent=true;
 for(const a of states){if(canon(j(a,a))!==canon(a))idempotent=false;
  for(const b of states){if(canon(j(a,b))!==canon(j(b,a)))commutative=false;
   for(const c of states)if(canon(j(j(a,b),c))!==canon(j(a,j(b,c)))associative=false;}}
 let merged=states[0];for(const x of states.slice(1))merged=j(merged,x);
 const tombstones=new Set(merged.removes);
 const live=merged.adds.filter(x=>!tombstones.has(x));
 const flags={commutative,associative,idempotent,
  no_resurrection:merged.removes.every(x=>!live.includes(x))};
 if(Object.values(flags).some(x=>x!==true))fail('CRDT_ALGEBRA_INVARIANT_FAILED');
 return {version:frontier.version,...ctx,replica_count:states.length,
  source_refs:sorted(input.replicas.map(r=>r.source_ref)),
  merged_adds:merged.adds,merged_tombstones:merged.removes,effective_ids:live,
  invariants:flags,model:'STATE_BASED_2P_SET_NOT_OR_SET',
  state:'FINITE_JOIN_ALGEBRA_CHECK_PASSED_NOT_SOURCE_RECONCILIATION',
  replica_authentication:false,causal_delivery_proven:false,
  data_erasure_performed:false,underlying_facts_verified:false,
  canonical_promotion:false};
}
// Highest Random Weight (HRW) placement in a supplied set of node identities.
// Hash-ranking is deterministic but supplies no network / uptime information.
export function planRendezvousPlacement(input){
 const ctx=scope(input);
 keys(input,['source_commit','scope_id','subject_id','keys','nodes','replica_count'],'HRW_INPUT');
 items(input.keys,64,'HRW_KEYS');items(input.nodes,24,'HRW_NODES');
 if(!input.keys.length||input.nodes.length<2||
  input.keys.some(x=>!uid(x))||unique(input.keys).length!==input.keys.length||
  !Number.isInteger(input.replica_count)||input.replica_count<1||
  input.replica_count>Math.min(5,input.nodes.length))fail('INVALID_HRW_CAPACITY');
 const nodeIDs=new Set();
 for(const n of input.nodes){
  keys(n,['id','failure_domain','source_ref'],'HRW_NODE');
  if(!uid(n.id)||nodeIDs.has(n.id)||!uid(n.failure_domain)||!uid(n.source_ref))fail('INVALID_HRW_NODE');
  nodeIDs.add(n.id);
 }
 const plans=input.keys.slice().sort().map(k=>{
  const ranking=input.nodes.map(n=>({id:n.id,failure_domain:n.failure_domain,
   score:hex(Buffer.from(JSON.stringify(['MPC_HRW_V25',k,n.id]),'utf8'))}))
    .sort((a,b)=>compare(b.score,a.score)||compare(a.id,b.id));
  const selected=ranking.slice(0,input.replica_count);
  const domainCount=unique(selected.map(x=>x.failure_domain)).length;
  return {key:k,selected_node_ids:selected.map(x=>x.id),
   selected_failure_domains:selected.map(x=>x.failure_domain),
   distinct_failure_domains:domainCount,
   shared_failure_domain_risk:domainCount<selected.length,
   ranking_algorithm:'SHA256_DETERMINISTIC_HRW_RESEARCH_MODEL'};
 });
 return {version:frontier.version,...ctx,keys:plans,
  node_count:input.nodes.length,replica_count:input.replica_count,
  live_network_or_node_availability_checked:false,
  content_placement_performed:false,independent_failure_proven:false,
  source_authentication:false,canonical_promotion:false};
}
const PROOF=Object.freeze({
 BLOCK_INTEGRITY:['CID_BLOCK_VERIFICATION_RECEIPT'],
 FILE_AUTHENTICITY:['OWNER_AUTHENTICATION_RECORD','NATIVE_FILE_PROVENANCE_RECORD'],
 RETRIEVABLE_NOW:['FRESH_SUCCESSFUL_FETCH','FETCH_BLOCK_VERIFIED'],
 PIN_RETAINED:['PIN_RECEIPT','PIN_SCOPE_RECEIPT'],
 IPNS_VALID_NOW:['IPNS_CRYPTO_VERIFICATION','IPNS_CLOCK_VALIDITY'],
 IPNS_LATEST_RESOLVED:['IPNS_CRYPTO_VERIFICATION','IPNS_SEQUENCE_COMPARISON','IPNS_CLOCK_VALIDITY'],
 DAG_COMPLETE:['CODEC_LINKS_PARSED','ALL_LINKED_BLOCKS_VERIFIED'],
 PEER_CURRENTLY_HAS_CONTENT:['PEER_FRESH_FETCH','FETCH_BLOCK_VERIFIED'],
 TRANSPARENCY_APPEND_ONLY:['MERKLE_CONSISTENCY_PROOF_VERIFIED','SIGNED_TREE_HEAD_VERIFIED'],
 PROVIDER_ADVERTISED:['PROVIDER_ROUTING_RECORD']
});
export function auditIpfsEvidenceClaims(input){
 const ctx=scope(input);
 keys(input,['source_commit','scope_id','subject_id','world','observations','claims'],'EVIDENCE_INPUT');
 if(!['SYNTHETIC','RECORD'].includes(input.world))fail('INVALID_EVIDENCE_WORLD');
 items(input.observations,64,'IPFS_OBSERVATIONS');
 items(input.claims,24,'IPFS_CLAIMS');
 const evidence=new Map(),claimIDs=new Set();
 for(const r of input.observations){
  keys(r,['id','kind','state','source_ref','source_owner','source_version','scope_id','subject_id'],'IPFS_OBSERVATION');
  if(!uid(r.id)||evidence.has(r.id)||!DIM.test(r.kind||'')||
   !['OBSERVED','CLAIMED','CONTRADICTED','UNKNOWN','SYNTHETIC'].includes(r.state)||
   !uid(r.source_ref)||!uid(r.source_owner)||!uid(r.source_version)||
   r.scope_id!==ctx.scope_id||r.subject_id!==ctx.subject_id||
   input.world==='SYNTHETIC'&&!['SYNTHETIC','UNKNOWN'].includes(r.state)||
   input.world==='RECORD'&&r.state==='SYNTHETIC')fail('INVALID_IPFS_OBSERVATION');
  evidence.set(r.id,r);
 }
 const results=[];
 for(const c of input.claims){
  keys(c,['id','claim','support_ids'],'IPFS_CLAIM');
  if(!uid(c.id)||claimIDs.has(c.id)||!dense(c.support_ids)||
   !c.support_ids.length||c.support_ids.length>16||
   unique(c.support_ids).length!==c.support_ids.length||
   c.support_ids.some(x=>!evidence.has(x)))fail('INVALID_IPFS_CLAIM');
  claimIDs.add(c.id);
  if(c.claim==='GLOBAL_DELETION'){
   results.push({claim_id:c.id,claim:c.claim,state:'GLOBAL_ERASURE_NOT_PROVABLE_BY_THESE_INPUTS',
    unsatisfied_evidence_types:['GLOBAL_RETENTION_OWNER_EXHAUSTIVENESS'],
    independent_sources_established:false,verified_real_world:false});continue;
  }
  if(!Object.hasOwn(PROOF,c.claim))fail('UNKNOWN_IPFS_CLAIM_KIND');
  const refs=c.support_ids.map(id=>evidence.get(id)),missing=[],conflicts=[];
  for(const kind of PROOF[c.claim]){
   const matching=refs.filter(x=>x.kind===kind);
   if(matching.some(x=>x.state==='CONTRADICTED'))conflicts.push(kind);
   if(!matching.some(x=>x.state==='OBSERVED'||x.state==='SYNTHETIC'))missing.push(kind);
  }
  const src=sorted(refs.map(x=>x.source_ref));
  results.push({claim_id:c.id,claim:c.claim,
   state:conflicts.length?'CONTRADICTORY_EVIDENCE_REVIEW':
    missing.length?'EVIDENCE_TYPE_OR_STATE_MISSING':'REQUIRED_EVIDENCE_TYPES_DECLARED_UNAUTHENTICATED',
   unsatisfied_evidence_types:missing,contradicted_types:conflicts,
   shared_source_dependency:src.length<refs.length,
   independent_sources_established:false,
   accepted_type_witness_count:PROOF[c.claim].length-missing.length,
   verified_real_world:false});
 }
 return {version:frontier.version,...ctx,world:input.world,
  claim_reviews:results,claims_verified:0,
  source_authentication:false,outside_provider_calls:0,
  canonical_promotion:false};
}
export function planOddMethodCompositions(input){
 const ctx=scope(input);
 keys(input,['source_commit','scope_id','subject_id','atoms'],'METHOD_COMPOSITION_INPUT');
 items(input.atoms,64,'METHOD_ATOMS');
 const seen=new Set(),present=new Set(),lineages=new Map();
 for(const a of input.atoms){
  keys(a,['id','kind','state','source_ref','source_owner','source_version'],'METHOD_ATOM');
  if(!uid(a.id)||seen.has(a.id)||!DIM.test(a.kind||'')||
   !['SUPPLIED','UNKNOWN'].includes(a.state)||!uid(a.source_ref)||
   !uid(a.source_owner)||!uid(a.source_version))fail('INVALID_METHOD_ATOM');
  seen.add(a.id);
  if(a.state==='SUPPLIED')present.add(a.kind);
  const xs=lineages.get(a.kind)||[];xs.push(a.source_ref);lineages.set(a.kind,xs);
 }
 const edges=[];
 for(const left of frontier.hooks)for(const right of frontier.hooks){
  if(left.id===right.id)continue;
  const via=left.produces.filter(x=>right.requires.includes(x));
  if(!via.length)continue;
  const missingUp=left.requires.filter(x=>!present.has(x));
  const missingDown=right.requires.filter(x=>!via.includes(x)&&!present.has(x));
  edges.push({from:left.id,to:right.id,bridge:via,
   missing_upstream:missingUp,missing_downstream:missingDown,
   state:missingUp.length||missingDown.length?'SOURCE_OR_PRIOR_METHOD_OUTPUT_NEEDED':
   'HYPOTHETICAL_COMPOSITION_ONLY',
   transferred_output_observed:false,independent_evidence_proven:false,
   source_urls_shared:left.primary_sources.filter(x=>right.primary_sources.includes(x))});
 }
 edges.sort((a,b)=>compare(a.from,b.from)||compare(a.to,b.to));
 return {version:frontier.version,...ctx,
  method_contracts:frontier.hooks.length,directed_pairs_considered:frontier.hooks.length*(frontier.hooks.length-1),
  matching_dependency_edges:edges.length,edges,
  hypothetical_compositions:edges.filter(x=>x.state==='HYPOTHETICAL_COMPOSITION_ONLY').length,
  source_authentication:false,method_execution:'NOT_EXECUTED',
  canonical_promotion:false};
}
