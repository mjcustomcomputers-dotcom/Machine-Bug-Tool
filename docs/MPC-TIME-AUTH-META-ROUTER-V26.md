# MPC V26 — Time, Authentication, Contradiction Algebra & Methods-on-Methods

**Native development base:** `bc134031b2d251de5ac0093d9a13aca0a8d955c6` (V25 PR #25). **This review:** `feature/mpc-temporal-auth-meta-router-v26`. No existing canonical MAXVAR, BL32/384, MBSS, MHA/MHC, 239 Atlas candidates, 24 native evaluators, screen/network/router checkpoint IDs, private Sites service or Windows executable has been replaced.

## 33 research hooks: what is new and what is inherited

The complete source-attributed inventory and each hook's exact required input, hypothetical output, falsifier and executable/research-only status is in [the V26 overlay](../research/meta-router-time-auth-v26.json). These `RH-V26` identifiers are **not** new native evaluator or Method Atlas IDs.

| Family | Research hooks | Actual local change |
|---|---:|---|
| TIME | 7 | Bounded supplied vector-clock/clock-interval comparison |
| AUTHENTICATION | 7 | Actual Ed25519 cryptographic signature check of supplied bytes |
| REDUCTION | 6 | Four-valued information lattice and exact minimum distinguishing questions |
| SANDBOX | 4 | Finite nested parent/child/revocation permission comparison |
| BUSINESS | 4 | One intentionally narrow finite Akerlof adverse-selection illustration |
| ROUTER | 5 | Business-first finite source-bound router + explicit Atlas opt-in wrapper |

### Atom → process → method → mirror → falsifier

1. **ATOM:** exact source reference, source owner, source version, subject, scope and epistemic state; caller-provided data is *not independently authenticated*.
2. **REDUCE:** distinguish required **primary records** from hypothetical outputs that only a method could produce. Preserve unknown or contradictory evidence.
3. **ROUTE:** choose the most applicable bounded method on provided source atoms. Default `BUSINESS_STARTUP` is a *routing preference*, never a claim that an operating business exists. Other profiles are SECURITY_RESEARCH, LEGAL_RESEARCH, NETWORK_RESEARCH and GENERAL.
4. **INVERT:** every selected hook keeps its concrete falsifier; a converse or opposite method output is a hypothesis, never a proven fact.
5. **SYNCHRONIZE:** source-version collision must outrank reuse, and wall-clock numeric precedence must not override causal vector clocks from another domain.
6. **VERIFY:** distinct crypto, source identity, freshness, authorization, evidence and causal checkpoints. Missing independent oracle blocks promotion.
7. **STOP:** same input fingerprint with no new source/version or changed question returns `STOP_NO_MATERIAL_INFORMATION_GAIN`, rather than recursing through the catalog.

## The six finite algorithms and what they cannot prove

**Four-valued bilattice** — `knowledgeJoinV26`, `evidenceNegationV26`, `reviewFourValuedEvidenceV26`: `NEITHER`, `SUPPORT`, `REFUTE`, `BOTH`. Distinct evidence directions combine by information join. A contested proposition remains BOTH and its source-ref lineage is disclosed; neither truth nor causal independence follows. Foundation: [Belnap and bilattices overview](https://arxiv.org/abs/2503.20679).

**Temporal/causal clocks** — `compareVectorClockIntervalsV26`: compares finite vectors on the same declared process coordinates. `A < B` is recognized only if every component is ≤ and at least one <. Wall-clock intervals are evaluated *separately*, with same declared domain; opposite non-overlapping order produces an explicit contradiction review. This is a finite model of [Lamport's event ordering](https://www.microsoft.com/en-us/research/publication/time-clocks-ordering-events-distributed-system/), **not** an authenticated distributed clock service.

**Ed25519 bytes** — `verifyEd25519BytesV26`: independently verify an Ed25519 signature over ≤8 KiB caller-supplied exact bytes, using Node crypto, strict base64 and raw public-key dimensions; includes [RFC 8032 official test vector](https://www.rfc-editor.org/rfc/rfc8032). True signature math **does not** prove the owner of that public key, source identity, legal authenticity, challenge freshness or permission to act. Compare [NIST SP 800-63-4](https://csrc.nist.gov/pubs/sp/800/63/4/final) and [Zanzibar's causal authorization](https://www.usenix.org/conference/atc19/presentation/pang).

**Declared sandbox policy** — `reviewDeclaredCapabilitySandboxV26`: `child_effective = child_requested ∩ parent_allowed − revoked`. Attempts to broaden a parent permission or to run an underprivileged method are blocked *in the declared policy*. No shell, network, kernel Landlock/Windows token enforcement or sandbox escape test happens here. Reference: [Linux kernel Landlock](https://cdn.kernel.org/doc/html/latest/security/landlock.html).

**Distinguishing hypotheses** — `planMinimalDistinguishingQuestionsV26`: at most 8 explicit competing hypotheses and 12 YES/NO/UNKNOWN prediction questions; enumerate finite subsets and choose minimum-cardinality then minimum-cost sets that distinguish every specified pair. Unknown or indistinguishable predictions stay unresolved. This is a bounded set-cover experiment planner, not a statistical forecast or original delta-debugger implementation. See [Zeller and Hildebrandt](https://www.st.cs.uni-saarland.de/papers/tse2002/).

**Akerlof's lemons** — `simulateFiniteLemonsScreenV26`: illustrates a simplified *no-reentry* market with supplied quality/reservation/quantity tiers. No buyer psychology, actual product quality, price forecast or economic equilibrium is inferred. [Akerlof, 1970](https://doi.org/10.2307/1879431).

## A real additive router integration, not a replacement

The existing `lib/method-atlas-router.mjs` now *also exports* `routeMethodAtlasWithV26(db,{opt_in:true,atlas,meta})`. It invokes the original `routeMethodAtlas(db,atlas)` and preserves that untouched legacy result under `original_atlas_route`, then attaches `meta_method_overlay`. Missing opt-in or source/subject mismatch rejects; no default existing route caller is redirected. The original SQL, classifier seed/relations, 7-stage labels and previously tested routes remain unchanged. The new function `routeMethodsOnMethodsV26` is independently callable with finite typed source atoms and guards.

The V26 router selects at most eight research hooks from its 33 supplied typed source-bound contracts, distinguishes source acquisition from method outputs, and prefers an already-ready bounded method over unnecessary broad data collection. It records reverse/mirror falsifiers, proposed method-to-method interfaces, contradictory source versions, candidate phase, stopping state and a concrete next action. **It never executes the underlying research hooks or asserts a target finding.**

## Adversarial verification and tests

- Four-valued knowledge join commutative/associative/idempotent on all four states; BOTH cannot become simple supported.
- Logical vector precedence vs physical timestamp contradiction and cross-clock non-equivalence.
- Positive RFC Ed25519 vector, bad signature, changed message, noncanonical input, unknown key owner.
- Sandbox privilege escalation, revoked capabilities, unavailable requirements and no enforcement claims.
- Exact minimal hypothesis questions, unknown predictions, inadequate question budget and costs.
- Quality-asymmetry example as illustrative no-reentry model, no real-world demand prediction.
- Cached fingerprint no-delta STOP; changed source versions override cache; verification requires independent oracle; early usable method wins over unrelated missing hooks.
- **Original Atlas route output must equal the opt-in wrapper's `original_atlas_route`**, and a source/subject mismatch must reject.

Run on the exact V26 head with the existing prepared Node/pnpm environment:

```sh
node --test tests/mpc-v26-meta-router.test.mjs tests/ipfs-unconventional-metamethod-v25.test.mjs
node research/run-mpc-v26-method-science.mjs
node --test
pnpm run build
```

Source acceptance requires the actual matching CI receipt; source code alone is not a test result. No Windows binary packaging, deployment, source authentication, real capability enforcement, legal promotion, business intervention, external scan or automatic connector write is claimed.

**Checkpoint:** `MPC_V26_TIME_AUTH_METHODS_ON_METHODS`. **Next:** inspect the exact CI result, repair falsified cases, pin the passing source and preserve a draft, unmerged PR.