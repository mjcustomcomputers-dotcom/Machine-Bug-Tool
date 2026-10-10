# MPC V24 — Network Method Science and Relationship Graphs

**Base/source:** `mjcustomcomputers-dotcom/Machine-Bug-Tool` V23 head `cc6f19023fd852154f463421f6e50727419ac687`, PR #23. **Review branch:** `feature/mpc-network-meta-methods-v24`. This pass adds only research overlay, local bounded analysis, tests, synthetic runner and CI; no native MPC/Atlas/BL reclassification, production deployment, Windows binary replacement, user-machine network access, cloud connector call, automatic third-party scan or contact outreach.

## Purpose: networking, science of method-on-method, and explicit evidence

The two meanings of **networking** are related through graph theory yet remain different evidence domains: **digital computer networking** (TCP, UDP/QUIC, HTTP, TLS, telemetry, endpoints, service identity and failure boundaries) and **professional networking** (consented human relationships, introductions, weak ties and network brokerage). Never map reachability or centrality directly to an individual's trustworthiness, psychological disposition, consent or buying propensity.

Native historical inventory remains: 24 executable MPC evaluators, 239 research Method Atlas candidates, original BL32/384 and MAXVAR/NESTMAX/MBSS namespaces, V20 virtual network observation stack and V23 behavioral methods. The new `RH-V24-xx` IDs belong only to **noncanonical research contracts** and do not inflate executable counts. Existing V20 network observation is a virtual seven-stage evidence interpretation stack, not the physical OSI standard or a packet capture. Preserve the existing local PowerShell and Windows GUI permissions, Stop and project identities.

## Research findings and recommended hooks

| ID | Area | New capability to investigate |
|---|---|---|
| `RH-V24-01` | DIGITAL | ENDPOINT SNAPSHOT SCOPE: A socket table is an instantaneous, bounded OS view and does not prove packets, application calls or ownership. |
| `RH-V24-02` | DIGITAL | TCP CONNECTION STATE GUARD: ESTABLISHED or LISTEN cannot prove bytes delivered, a TLS peer authenticated, or business finality. |
| `RH-V24-03` | DIGITAL | UDP QUIC CLASSIFICATION GUARD: UDP/443 by itself is insufficient to identify QUIC or HTTP/3; preserve UNKNOWN. |
| `RH-V24-04` | DIGITAL | TLS SPEC VERSION REVIEW: Do not use superseded RFC 8446 as the current controlling TLS 1.3 specification; negotiated identity needs its own evidence. |
| `RH-V24-05` | DIGITAL | HTTP RESPONSE VS BUSINESS FINALITY: An HTTP success status does not prove the owning service committed or settled the business operation. |
| `RH-V24-06` | DIGITAL | ZERO TRUST POLICY OWNER: Same subnet, reachable IP, or successful connection does not prove user/device/service authorization. |
| `RH-V24-07` | DIGITAL | TRACE CONTEXT NONINDEPENDENCE: A shared trace identifier is a correlation hint and can be propagated through the same originating observation. |
| `RH-V24-08` | DIGITAL | OTEL INSTRUMENTATION COVERAGE: Missing span or attribute may reflect sampling, instrumentation or version changes rather than a missing network event. |
| `RH-V24-09` | DIGITAL | WINDOWS ETW PROCESS ATTRIBUTION: A PID, socket or event-header ProcessId alone does not establish signed process or individual attribution. |
| `RH-V24-10` | DIGITAL | TEMPORAL CLOCK ALIGNMENT: Differing clocks/snapshot cuts cannot establish a single common event chronology. |
| `RH-V24-11` | DIGITAL | NETWORK TRANSLATION IDENTITY: Same public endpoint or changed address need not identify a single device or process. |
| `RH-V24-12` | DIGITAL | GRAPH BRIDGE FAILURE MODE: Graph cut points can be candidates only for the supplied graph; unknown alternate links defeat real blast-radius claims. |
| `RH-V24-13` | DIGITAL | SERVICE TRUST BOUNDARY: A passing network policy does not establish authenticated application identity or data owner consent. |
| `RH-V24-14` | DIGITAL | NETWORK COVERAGE FALSIFIER: Quiet logs cannot establish no traffic when capture windows/instrumentation do not cover the event. |
| `RH-V24-15` | PROFESSIONAL | WEAK TIE INFORMATION BRIDGE: Network position does not prove influence, trust, referral willingness or a valid buying need. |
| `RH-V24-16` | PROFESSIONAL | STRUCTURAL HOLE BROKERAGE: A bridge in an incomplete consented graph is not proof of business power or a willing intermediary. |
| `RH-V24-17` | PROFESSIONAL | RECIPROCAL RELATIONSHIP EVIDENCE: A one-sided mention, imported address book entry or social follow is not a mutual relationship. |
| `RH-V24-18` | PROFESSIONAL | CONSENTED REFERRAL PATH: No inferred outreach permission, endorsement or sending authority from proximity in a graph. |
| `RH-V24-19` | PROFESSIONAL | RELATIONSHIP TIME AND ROLE: An old title or past relationship cannot verify current role, consent or affiliation. |
| `RH-V24-20` | META | NETWORK ANALOGY DOMAIN GUARD: Do not map packet delivery/centrality to human persuasion, permission or moral responsibility. |
| `RH-V24-21` | META | NETWORK METHOD NONINDEPENDENCE: Two methods using one trace/source are not two independent witnesses. |
| `RH-V24-22` | META | CROSS LAYER INTERACTION TEST: An enumerated test design is not executed service reachability, impact or outage proof. |

Each contract in [the source-attributed JSON](../research/network-meta-method-frontier-v24.json) records input/output atom types, proposed relationships to the existing MHA catalog, source locators and an adverse falsifier. These are **ideas requiring separate scientific implementation**, not already executed algorithms or verified target findings.

### Precise standards and source boundaries

- **TCP:** [RFC 9293](https://www.rfc-editor.org/info/rfc9293). `Get-NetTCPConnection` returns local OS connection properties. A TCP `ESTABLISHED` or listening endpoint cannot establish packets delivered, peer authentication, a specific process binary or an application-level transaction.
- **QUIC / HTTP/3:** [RFC 9000](https://www.rfc-editor.org/info/rfc9000), [RFC 9114](https://www.rfc-editor.org/info/rfc9114). An observed UDP socket—even one with remote port 443—cannot alone establish QUIC or HTTP/3. Recognized transport requires direct protocol evidence.
- **TLS version:** use **[RFC 9846](https://www.rfc-editor.org/info/rfc9846)** for current TLS 1.3. It obsoletes RFC 8446. A reported TLS version alone does not prove peer identity; require source-bound handshake and identity verification data, and scope source/version changes.
- **HTTP semantics:** [RFC 9110](https://www.rfc-editor.org/info/rfc9110). An HTTP status is not a receipt of business-ledger settlement. Only a relevant owner/version-specific finalization record can support finality analysis.
- **Zero Trust:** [NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final) and [SP 800-207A](https://csrc.nist.gov/pubs/sp/800/207/a/final). IP neighborhood or transport reachability is not effective application authorization. Distinguish identity owner, policy decision and enforcement outcome.
- **Distributed traces and telemetry:** [W3C Trace Context L2](https://www.w3.org/TR/trace-context-2/) and [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/). A propagated trace ID can correlate events while creating a **shared-dependency nonindependence hazard**; missing spans can reflect incomplete instrumentation or sampling. Trace propagation does not prove same actor or causation.
- **Windows acquisition:** [Get-NetTCPConnection](https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-nettcpconnection?view=windowsserver2025-ps) exposes endpoint state and owning PID; [Microsoft ETW TCP/IP](https://learn.microsoft.com/en-us/windows/win32/etw/tcpip) has additional events, but even certain ETW process IDs do not establish the originating application. ETW collection is a **separate future operator-approved action** and not implemented by V24.
- **Professional graph science:** [Granovetter, Strength of Weak Ties](https://www.jstor.org/stable/2776392) and [Burt, Structural Holes and Good Ideas](https://doi.org/10.1086/421787). Bridge nodes may offer hypotheses about information exchange; incomplete graphs, nonreciprocal relationships, stale roles and missing consent defeat automatic commercial conclusions. See the [limits of secondhand brokerage](https://doi.org/10.5465/amj.2007.24162082) and V23 SPIN/Jobs-to-Be-Done constraints.

## The new executable bounded structural reviews

`lib/network-method-science-v24.mjs` implements six finite functions, without adding native evaluators:

1. `reviewNetworkMethods(input)`: up to 64 caller-typed atoms with source owner, version, state and native scope/subject. Chooses applicable research contracts, separates missing primary records from hypothetical unexecuted method outputs, and ranks **which record to acquire** by exact structural unlock count. Recorded sources are not independently authenticated. **Domain-lock adversary:** DIGITAL evidence cannot activate PROFESSIONAL methods merely because atom dimension strings match; META-domain links are review hypotheses only. DIGITAL protocol claims reject human relationship/outreach claims, and PROFESSIONAL claims reject computer-socket/transport outcomes. The required human-permission record cannot be manufactured from connectivity or a social graph.
2. `planNetworkMethodInteractions(input)`: bounded typed **A.produces → B.requires** research links, refusing to treat links as observed evidence. Exposes missing source and prior-method prerequisites; direct cross-domain transfers remain explicitly non-equivalent.
3. `auditNetworkProtocolClaims(input)`: at most 48 typed observations and 24 claim proposals. Separates ten claims (socket, QUIC, TLS peer, policy, payment finality, packet, process identity, mutual human tie, outreach permission and trace lineage) by *the specific type of record required to support each claim*. TCP state will not qualify for TLS authentication; UDP socket will not qualify for QUIC; HTTP response will not qualify for settlement; OS PID will not qualify for signed process identity. Even appropriate **caller-provided** record types yield `REQUIRED_EVIDENCE_TYPE_DECLARED_UNAUTHENTICATED`, not a verified real-world claim.
4. `analyzeDeclaredNetworkGraph(input)`: at most 32 nodes and 64 edges, bounded weak/undirected connected components plus bridge-edge and articulation-node **candidates**, recomputed on edge/node removal. This is neither directed reachability nor full-blast-radius proof: incomplete topology may omit alternate links. Professional networks include only edges that the caller marks both `DECLARED_OBSERVATION` and `RECIPROCAL_RECORDED`; that label is **not** a trusted consent verification and no outreach is enabled.
5. `auditNetworkObservationAlignment(input)`: evaluate caller-declared time windows under exactly matching clock domains; competing clocks require alignment. Overlap remains a candidate time coincidence, not the same event, person, process, or independent corroboration. Reject cross-subject/source identity errors.
6. `planNetworkPairwiseControls(input)`: strictly reuse V22 finite combinatorial coverage and independent replay. Plan selected source/clock/protocol/identity/edge-state pairs without executing a scan, recording traffic, proving speed or testing an actual target.

All input schemas reject extraneous atom fields; image, packet contents, passwords, emails, phone numbers, contact details and person profiles are **not** required. The source `source_commit` is structurally checked but not a cryptographic API authentication receipt. No external network calls are implemented in these functions. Defect findings require independently authenticated native records and a separate authorized process.

### Required adversarial hook pass

`SOCKET_STATE` **≠** `PACKET_CAPTURE_RECEIPT` **≠** `TLS_PEER_VERIFICATION` **≠** `POLICY_DECISION` **≠** `BUSINESS_OWNER_COMMIT_RECORD`.

`OS_PROCESS_ID` **≠** signed binary identity; `TRACE_CONTEXT` **≠** actual causal trace lineage; `DECLARED_TIE` **≠** `RECIPROCAL_CONFIRMATION` **≠** `EXPLICIT_OUTREACH_PERMISSION`.

Method A and method B may both be true to their input, but shared source ancestry blocks claims of independent corroboration. A bridge in the declared graph is a model-specific observation—not proof of network outage or human influence. Preserve coverage gaps and time skews rather than filling them with a confident label. Process phase returns immediately to the next concrete evidence acquisition rather than endless architecture discussion.

## Validation and integration

Existing prepared Node/pnpm environment; no dependency changes:

```sh
git switch feature/mpc-network-meta-methods-v24
node --test tests/network-method-science-v24.test.mjs tests/behavioral-meta-methods-v23.test.mjs tests/method-synergy-v22.test.mjs
node research/run-network-methods-v24.mjs
node --test
pnpm run build
```

The V24 GitHub Actions source-exact workflow separately runs focused **24 V24 negative/acceptance tests** plus retained V23/V22 regressions, full tests and build. Do not call source files **CI-validated** until the workflow for that exact head SHA completes successfully. Windows Electron native receiving and a packaged Windows binary remain separate future acceptance steps. No deployment, merge, notification or target contact is authorized by synthetic tests.

## Source, scope, and continuation checkpoint

`PASS: MPC_V24_NETWORK_AND_RELATIONSHIP_META_HOOKS`; original MPC controller/checkpoints preserved.

- **Completed on review branch:** source-attributed research overlay; passive protocol/graph/correlation/method routing code; negative controls; separate source-exact CI workflow (when the runner is committed).
- **Unresolved:** authentication/recency of external records, actual Windows capture event correlation, packet-level traces, QUIC/TLS handshake data, graph completeness, professional relationship consent verification, real-world performance/impact, optional UI integration.
- **Next bounded task:** run and read the exact V24 CI result, repair failures without touching original registries, keep draft PR for review. For real-world results later, acquire explicit native source and verify its owner, scope, timestamp and target authorization before any analysis.
