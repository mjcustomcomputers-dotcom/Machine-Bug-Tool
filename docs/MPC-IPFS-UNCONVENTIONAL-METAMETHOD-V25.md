# MPC V25 — IPFS / Unconventional Method-Science / Methods-on-Methods

**Base:** `mjcustomcomputers-dotcom/Machine-Bug-Tool` at verified V24 development head `902bedcfc296d3a5f53456f872b4aefcf153dc56` (draft PR #24). **Review branch:** `feature/mpc-ipfs-unconventional-metamethod-v25`.

**Mission:** extend *existing* MPC atom → method → process → inverse → falsifier → human decision logic with less conventional distributed-systems and computational science methods. Preserve native 24 bounded evaluators, 239 Method Atlas candidates, original MHA/MHC IDs, BL32/384, MAXVAR/NESTMAX/MBSS, connector and checkpoint semantics, V20 OSI, V21 screen, V22 method synergy, V23 behavioral science, and V24 networking. These 28 `RH-V25` contracts form a **noncanonical research overlay**, not 28 new runnable scientific evaluators.

## Distinguishing IPFS semantics from tempting but false equivalences

The IPFS CID specification's June 26, 2026 text is authoritative for the subset considered here: [IPFS CID specification](https://specs.ipfs.tech/cid/). A CIDv1 is a typed, self-describing content address, incorporating multicodec and multihash with textual multibase. **A root UnixFS file CID is not generally the file's flat SHA-256.** Chunking, codec and Merkle layout can change the CID for the same reassembled bytes. A block digest match only verifies the *specific block bytes* under the chosen algorithm and structure; it does not authenticate who authored the data, who owns it, whether it was admissible, or whether any IPFS node actually retains it. [IPFS content addressing](https://docs.ipfs.tech/concepts/content-addressing/).

Material non-equivalences:

- `CID_BLOCK_HASH_MATCHED ≠ FILE_AUTHENTICATED ≠ AUTHOR_IDENTIFIED`;
- `DHT_PROVIDER_RECORD ≠ BLOCK_FETCH_COMPLETED ≠ VERIFIED_BLOCK ≠ FULL_DAG_AVAILABLE`;
- `SIGNED_IPNS_RECORD ≠ LATEST_MUTABLE_NAME_RECORD ≠ CURRENT_RETRIEVABILITY`;
- `PIN_STATUS ≠ END-TO-END_RETRIEVAL_NOW ≠ PERMANENT_RETENTION`;
- `GATEWAY_HTTP_SUCCESS ≠ TRUSTLESS_VERIFIED_CAR_OR_RAW_BLOCK`;
- `MERKLE_INCLUSION ≠ APPEND_ONLY_CONSISTENCY ≠ INDEPENDENT_SIGNED_SOURCE`;
- `CRDT_CONVERGENCE ≠ CAUSAL_EVENT_HISTORY ≠ TRUE_SOURCE_CONTENT`;
- `IBLT_SKETCH_DECODE ≠ AUTHENTICATED_REMOTE_SET_RECONCILIATION`;
- `HRW_NODE_SELECTION ≠ ONLINE_NODE ≠ INDEPENDENT_FAILURE_DOMAINS`.

[IPFS data lifecycle](https://docs.ipfs.tech/concepts/lifecycle/) distinguishes creating, providing and retrieving. [Pinning](https://docs.ipfs.tech/concepts/persistence/) protects against local garbage collection, not permanent global replication. [IPNS](https://specs.ipfs.tech/ipns/ipns-record/) requires correctly encoded and verified signatures with sequence/freshness controls. [Trustless gateways](https://specs.ipfs.tech/http-gateways/trustless-gateway/) let clients check raw/CAR data against CIDs, without delegating integrity verification to a gateway. None of the latter protocol stacks is implemented or contacted by V25.

## Unconventional research hook inventory

| Hook | Method family | Declared inputs → hypothetical output | Status |
|---|---|---|---|
| `RH-V25-01` | CIDV1_RAW_BLOCK_DIGEST | `BLOCK_BYTES + CID_TEXT` → `BLOCK_INTEGRITY_RECEIPT` | `LOCAL_BOUNDED_SHA256_CIDV1_VERIFIER` |
| `RH-V25-02` | CHUNK_CODEC_PROFILE_NON_EQUIVALENCE | `BLOCK_INTEGRITY_RECEIPT + CODEC_PROFILE` → `CID_FILE_NON_EQUIVALENCE` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-03` | IPLD_DECLARED_SELECTOR_TRAVERSAL | `DECLARED_DAG + SELECTOR_POLICY` → `DAG_TRAVERSAL_CANDIDATES` | `LOCAL_FINITE_GRAPH_TRAVERSAL_ANALOGUE` |
| `RH-V25-04` | IPLD_DAG_LINK_CLOSURE | `DAG_TRAVERSAL_CANDIDATES + VERIFIED_LINK_WITNESSES` → `DAG_CLOSURE_AUDIT` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-05` | BITSWAP_WANT_CANCEL_STATE | `BITSWAP_WANTLIST + PEER_RESPONSE` → `BLOCK_EXCHANGE_HYPOTHESIS` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-06` | KADEMLIA_PROVIDER_ROUTING | `PROVIDER_RECORD + CONTENT_KEY` → `PROVIDER_DISCOVERY_REVIEW` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-07` | IPNS_SIGNED_MUTABLE_NAME | `IPNS_RECORD_SIGNATURE + IPNS_SEQUENCE` → `MUTABLE_NAME_RECORD_REVIEW` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-08` | IPNS_FRESHNESS_CACHE_BOUNDARY | `MUTABLE_NAME_RECORD_REVIEW + CLOCK_EVIDENCE` → `IPNS_FRESHNESS_REVIEW` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-09` | TRUSTLESS_GATEWAY_PROOF_SPLIT | `GATEWAY_RESPONSE + BLOCK_INTEGRITY_RECEIPT` → `GATEWAY_VERIFICATION_LIMITS` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-10` | PINNING_VS_RETRIEVAL | `PIN_RECEIPT + FRESH_RETRIEVAL_RECEIPT` → `AVAILABILITY_EVIDENCE_REVIEW` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-11` | GOSSIPSUB_PEER_SCORE_BIAS | `PEER_GOSSIP_OBSERVATIONS + PEER_POLICY` → `GOSSIP_SOURCE_BIAS` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-12` | ERASURE_THRESHOLD_COMMON_FAILURE | `DATA_SHARDS + FAILURE_DOMAINS` → `ERASURE_AVAILABILITY_HYPOTHESIS` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-13` | CONTENT_DEFINED_CHUNKING_DELTA | `CHUNKING_PROFILE + CONTENT_BYTES` → `CONTENT_DEFINED_CHUNK_VARIANTS` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-14` | MERKLE_LOG_CONSISTENCY_CHALLENGE | `MERKLE_LOG_ROOTS + MERKLE_PROOFS` → `APPEND_ONLY_CONSISTENCY_CANDIDATE` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-15` | CRDT_SEMILATTICE_JOIN | `REPLICA_2P_STATES` → `MERGED_SEMILATTICE_STATE` | `LOCAL_FINITE_2P_SET_JOIN` |
| `RH-V25-16` | TOMBSTONE_NON_RESURRECTION | `MERGED_SEMILATTICE_STATE + TOMBSTONE_HISTORY` → `NO_RESURRECTION_WITNESS` | `LOCAL_FINITE_2P_SET_INVARIANT` |
| `RH-V25-17` | DELTA_STATE_ANTIENTROPY | `DELTA_STATE_MESSAGES + DELIVERY_MODEL` → `CONVERGENCE_HYPOTHESIS` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-18` | IBLT_RECONCILIATION_SKETCH | `TWO_SOURCE_SETS + SKETCH_PARAMS` → `SET_DIFF_SKETCH_REVIEW` | `LOCAL_FINITE_IBLT_SKETCH` |
| `RH-V25-19` | SKETCH_INDEPENDENT_REPLAY | `SET_DIFF_SKETCH_REVIEW + EXACT_SET_WITNESS` → `SKETCH_FALSIFIER` | `LOCAL_EXACT_SET_FALSIFIER` |
| `RH-V25-20` | BLOOM_MEMBERSHIP_FALSE_POSITIVE | `BLOOM_QUERY + FILTER_POLICY` → `PROBABILISTIC_MEMBERSHIP_REVIEW` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-21` | RENDEZVOUS_HASHING_PLACEMENT | `RENDEZVOUS_KEYS + CANDIDATE_NODES` → `PLACEMENT_RANKING` | `LOCAL_FINITE_HRW_PLANNER` |
| `RH-V25-22` | VECTOR_CLOCK_CAUSAL_PARTIAL_ORDER | `VECTOR_EVENT_PAIRS + CAUSAL_EDGES` → `CAUSAL_ORDER_HYPOTHESIS` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-23` | REPLICA_COMMON_FAILURE_GUARD | `REPLICA_PLACEMENT_FAILURE_DOMAINS + PLACEMENT_RANKING` → `SHARED_FAILURE_RISK_REVIEW` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-24` | SHARED_SOURCE_PROVENANCE_HYPEREDGE | `SOURCE_GRAPH + INDEPENDENCE_ASSERTIONS` → `INDEPENDENCE_AUDIT` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-25` | INTEGRITY_VS_AVAILABILITY_INVERSION | `BLOCK_INTEGRITY_RECEIPT + PROVIDER_DISCOVERY_REVIEW` → `INTEGRITY_AVAILABILITY_SPLIT` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-26` | CROSS_LAYER_METHOD_FALSIFIER | `INTEGRITY_AVAILABILITY_SPLIT + IPNS_FRESHNESS_REVIEW` → `METHOD_TRANSFER_FALSIFIERS` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-27` | DAG_LOG_DOUBLE_ORACLE_CHALLENGE | `DAG_CLOSURE_AUDIT + APPEND_ONLY_CONSISTENCY_CANDIDATE` → `PROVENANCE_COMPLETENESS_CHALLENGE` | `RESEARCH_CONTRACT_ONLY` |
| `RH-V25-28` | PLACEMENT_SKETCH_CORRELATED_BIAS | `SHARED_FAILURE_RISK_REVIEW + SKETCH_FALSIFIER` → `SELECTION_BIAS_WARNING` | `RESEARCH_CONTRACT_ONLY` |

All 28 hook contracts in [the versioned research overlay](../research/ipfs-unconventional-metamethod-v25.json) retain source URLs, input/output types, adverse falsifiers and honest implementation states. Research-method names are not an ownership assertion or evidence of institutional endorsement. The algorithms written for V25 are original bounded code using Node's built-in crypto and ordinary JavaScript. No third-party code, algorithms disguised as institutional sponsorship, original Atlas ID replacement, lockfile change or new external package is imported.

## Operationally executable, bounded finite methods

**1. `verifyCidv1Block` / `decodeLimitedCidv1` / `makeSyntheticCidv1Raw`**. Parse a strictly canonical lowercase base32 (`b...`) **CIDv1** using a 36-byte `[0x01, codec, 0x12, 0x20, SHA256]` profile. Supported block codecs: raw `0x55`, dag-pb `0x70`, dag-cbor `0x71`; supported digest sha2-256 only. Compute SHA-256 over a caller-supplied, canonical base64 decoded block (up to 1 MiB). Reject malformed, overlong, alternative alg/hash or noncanonical encoding. Confirm **block digest integrity only**. No CIDv0 support is claimed; no dag-pb/dag-cbor codec link decoding, UnixFS reassembly, source signature or network availability is inferred. The synthetic `hello` reference is `bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq`.

**2. `planDeclaredDagTraversal`**. Walk an explicitly caller-described graph of at most 64 nodes and 256 named edges, with source refs, maximum depth and budget-limited selection. Report missing nodes, cycles and truncated traversal as distinct states. This is an **IPLD-inspired declared-graph planner**, not a standardized IPLD selector interpreter and not a cryptographic proof of links embedded inside actual CBOR/protobuf blocks. IPFS source: [IPLD selectors](https://ipld.io/specs/selectors/).

**3. `joinTwoPhaseReplicas`**. Implement componentwise set union for a finite state-based **2P-set CRDT**, including irreversible tombstones, and check idempotence, commutativity, associativity and no-resurrection across a small supplied replica sample. It is not an OR-set, distributed replication transport, proof of chronological causal order, source authentication or actual erasure. Literature: [Almeida et al., delta-state CRDTs](https://arxiv.org/abs/1603.01529).

**4. `reconcileFiniteIblt`**. Implement a finite three-hash invertible Bloom lookup table, signed insert-minus-remove counts, checksum/key XOR, bounded peeling, and independent exact local-set replay. If the table is overloaded or cannot peel, return `SKETCH_NON_DECODABLE` with residual cells: never claim a successful reconciliation. Positive decode must exactly match independently computed A−B and B−A. This is a **local algorithm exercise** on supplied integer sets, not a remote protocol, cryptographic accumulator or authenticated set owner. Primary: [Goodrich & Mitzenmacher, IBLT](https://arxiv.org/abs/1101.2245).

**5. `planRendezvousPlacement`**. Compute deterministic SHA-256-based highest-random-weight rankings over caller-supplied opaque keys and node IDs (max 64 keys, 24 nodes, replica count ≤5). Report selected failure domains and warn when independently ranked nodes share a failure domain. Ranking is a **placement proposal**, not actual network uptime or availability.

**6. `auditIpfsEvidenceClaims`**. Map proposed claims (CID integrity, file authenticity, availability, pinning, IPNS current/latest, full DAG closure, peer possession, append-only log and provider advertisement) to distinct *required evidence types*. Even appropriate types remain `REQUIRED_EVIDENCE_TYPES_DECLARED_UNAUTHENTICATED` until the actual owner record is obtained and verified. A universal `GLOBAL_DELETION` claim is explicitly quarantined: distributed replicas make global erasure unprovable from a local pin or removal.

**7. `planOddMethodCompositions`**. Finite directed **method-on-method** graph: A's typed hypothetical output matches B's typed required input. Track missing upstream/downstream source prerequisites, shared source URLs and the fact that none of these research contracts executed. The original method-selection and inverse/reduction controllers stay unchanged.

## Cross-method experiments and adversarial falsifiers

| Composite pass | Why it is valuable | Falsifier |
|---|---|---|
| CID → IPLD graph → trustless retrieval | Separate verified block bytes, authenticated link graph and current availability | Valid CID bytes with missing children/provider never counts as complete file |
| DHT provider → Bitswap → CID verifier | Detect source states lost when converting one layer's receipt into another | Provider lookup plus WANT does not imply successful block fetch |
| IPNS sequence → freshness → source provenance | Distinguish mutable route, content root and authorization owner | Older signed value, invalid expiry or unrelated publisher |
| CRDT join → IBLT sketch → anti-entropy | Compare a reliable merge law with approximate difference reporting | Failed peeling; different source versions; tombstone resurrection |
| Rendezvous placement → failure-domain guard | Challenge naive claim of 2 independent replicas | Two node IDs with the same site/operator/failure domain |
| Merkle inclusion → consistency → provenance | Append-only evidence with independent checkpoint version | Inclusion without consistency, unsigned STH or disputed source owner |
| Method A → method B → inverse falsifier | A fast agreeing result might share one biased input | Same source ancestor or incompatible clock/source versions |

These hooks are scientific **candidate mechanisms** with falsifiers, not evidence of production operation, bug-bounty impact, a valid legal chain of custody, or a measured performance gain. Actual operational research should use user-selected, authorized source objects and preserve the exact version/owner identity. Do not publish private legal records or sensitive local-device data to a public IPFS gateway as part of methodology development.

## Source exact validation

```sh
git fetch origin feature/mpc-ipfs-unconventional-metamethod-v25
git switch feature/mpc-ipfs-unconventional-metamethod-v25
node --test tests/ipfs-unconventional-metamethod-v25.test.mjs
node research/run-ipfs-unconventional-v25.mjs
node --test
pnpm run build
```

The V25 GitHub workflow runs the V25 tests with inherited V24/V23/V22 regressions, the full repository test suite and source build on pinned Node 24.19 / pnpm 11.25. **Actual PASS numbers and the exact SHA must come from GitHub Actions**; source files or previous runs do not establish completion. Windows Electron receiving, live IPFS networking, Kubo/libp2p, Filecoin storage, signed IPNS/CAR verification, actual node availability and hosted MPC deployment remain separate future acceptance work.

## Next method research (do not inflate the executed count)

Investigate optional content-defined chunking (Rabin/Buzhash, profile-pinned), threshold erasure codes with correlated failure sets, real typed CAR traversal and client verification, DHT provider vs block fetch, signed IPNS freshness and sequence, append-only transparency-log inclusion/consistency, vector-clock partial ordering, GossipSub common-source and score misattribution, and probabilistic Bloom-filter false positive boundaries. Choose one per source-identified task, implement it with an independent oracle and falsifiable witness, then check its interaction with existing MPC methods; do not run all candidate hooks indiscriminately.

**Checkpoint:** `MPC_V25_IPFS_UNCONVENTIONAL_METHOD_SCIENCE`.
**Completed at source level:** new research hooks, finite algorithms, synthetic negative tests and review-only CI workflow (subject to exact-head CI readback). **Unresolved:** scientific algorithm coverage outside the implemented subset, external owner authentication, remote retrieval, confidentiality/retention, native Windows receive, operational integration. **Next:** read CI for exact head; repair only evidence-backed failures, save result in draft PR, do not merge/deploy automatically.
