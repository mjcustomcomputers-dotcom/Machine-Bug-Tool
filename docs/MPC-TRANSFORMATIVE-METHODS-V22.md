# MPC V22 — Transformative Methods, Classifier Frontiers, and Synchronicity Hook Pass

**Review source:** `mjcustomcomputers-dotcom/Machine-Bug-Tool`, V21 branch tip `761c4445ec1b7c063dc70cb599e37b7eb5f7487e` ([PR #21](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/pull/21)). The V22 branch builds **on that commit**, not an older checkout or a replacement MPC engine.

## Actual source comparison

Verified directly in the V21 GitHub source: `lib/method-hooks.json` has 10 existing research hooks; the native evaluator inventory has 24 bounded evaluators; `method-atlas/candidates.json` and its versioned expansions contain 239 MHA candidates. `lib/method-self-scan.mjs`, `lib/method-hook-cascade.mjs` and `lib/reasoning-selfplay.mjs` already address metamorphic oracles, method dependency loops, falsifier construction, evidence-source dependence and other method-on-method questions. Do not count these as V22 inventions. The earlier source's BL32/384, original coordinates and jacket axes, typed method packets, MAXVAR/NESTMAX/MBSS/EXT registries, V20 three-valued virtual OSI, V21 inverse OCR crop, and canonical source pointers remain unchanged.

The independent `RH-V22` **research-overlay namespace** is separate from MHA, MHC and native evaluator IDs. The 13 contracts represent **newly investigated methods plus derived counterchecks**, not 13 newly executable scientific algorithms. Publicly known methods retain attribution; project source ownership applies to original implementations and orchestration, not third-party mathematics.

## New research hooks and transformation bridges

| Hook | Method / countercheck | Declared typed input → *hypothetical* output | Status |
|---|---|---|---|
| RH-V22-01 | Database provenance semiring expressions | `SOURCE_GRAPH`, `DERIVATION_RULES` → `PROVENANCE_EXPRESSION` | RESEARCH_CONTRACT_ONLY |
| RH-V22-02 | Method provenance collision analysis | `PROVENANCE_EXPRESSION`, `CLAIM_DEPENDENCIES` → `DEPENDENCE_COLLISION_WARNINGS` | RESEARCH_CONTRACT_ONLY |
| RH-V22-03 | Model-based minimal conflict extraction | `COMPONENT_MODEL`, `OBSERVED_CONTRADICTION` → `MINIMAL_CONFLICT_SETS` | RESEARCH_CONTRACT_ONLY |
| RH-V22-04 | Minimal hitting-set diagnosis from conflicts | `MINIMAL_CONFLICT_SETS` → `DIAGNOSIS_CANDIDATES` | RESEARCH_CONTRACT_ONLY |
| RH-V22-05 | Finite pairwise covering-array-inspired test design | `FACTOR_DOMAINS` → `INTERACTION_TEST_DESIGN` | LOCAL_BOUNDED_TEST_DESIGN_IMPLEMENTED_NOT_ATLAS_EVALUATOR |
| RH-V22-06 | Independent coverage receipt replay against oracle plan | `INTERACTION_TEST_DESIGN`, `ORACLE_RESULTS` → `INTERACTION_COVERAGE_FALSIFIERS` | COVERAGE_DESIGN_REPLAY_ONLY_NOT_RESULT_ORACLE_IMPLEMENTED |
| RH-V22-07 | Guarded equality saturation with e-graphs | `TYPED_EXPRESSION`, `PROVEN_EQUALITIES` → `EQUIVALENT_EXPRESSION_CANDIDATES` | RESEARCH_CONTRACT_ONLY |
| RH-V22-08 | Dynamic partial-order reduction over independent events | `CONCURRENT_TRACE`, `INDEPENDENCE_ORACLE` → `SCHEDULE_REDUCTIONS` | RESEARCH_CONTRACT_ONLY |
| RH-V22-09 | Active automata learning with counterexample refinement | `FINITE_ALPHABET`, `CONSENTED_MEMBERSHIP_ORACLE`, `CONSENTED_EQUIVALENCE_ORACLE` → `FINITE_AUTOMATON_HYPOTHESES` | RESEARCH_CONTRACT_ONLY_NO_TARGET_QUERIES |
| RH-V22-10 | Causal transportability and intervention identifiability | `CAUSAL_GRAPH`, `DOMAIN_DIFFERENCES`, `INTERVENTION_DATA` → `TRANSPORTABILITY_OBLIGATIONS` | RESEARCH_CONTRACT_ONLY |
| RH-V22-11 | Formal concept analysis for candidate classifier taxonomy | `METHOD_ATTRIBUTE_MATRIX` → `FORMAL_CONCEPT_CANDIDATES` | RESEARCH_CONTRACT_ONLY |
| RH-V22-12 | Modified condition decision coverage for classifier gates | `BOOLEAN_DECISION_FORMULA`, `EXECUTABLE_ORACLE` → `CONDITION_INDEPENDENCE_WITNESSES` | RESEARCH_CONTRACT_ONLY |
| RH-V22-13 | Trace-order reduction independent audit | `SCHEDULE_REDUCTIONS`, `CONCURRENT_TRACE` → `SCHEDULE_FALSIFIER_CANDIDATES` | RESEARCH_CONTRACT_ONLY |

Each hook has a source locator, inherited MPC method-ID attachments (structural proposals, not canonical registry links), transformation operators and a concrete falsifier in [the separate research overlay](../research/method-synergy-frontier-v22.json). `RESEARCH_CONTRACT_ONLY` means no algorithm implementation; `LOCAL_BOUNDED_TEST_DESIGN_IMPLEMENTED_NOT_ATLAS_EVALUATOR` means only the deterministic pairwise **test design** helper is executable; `COVERAGE_DESIGN_REPLAY_ONLY_NOT_RESULT_ORACLE_IMPLEMENTED` means coverage receipt checks execute, **not** underlying tests or outcome adjudication.

The distinct scientific research families are: provenance semirings and shared-source detection; Reiter minimal conflicts/hitting-set diagnosis (not equivalent to existing monotone fault-tree cut sets); finite combinatorial interaction coverage; guarded e-graph equivalence exploration; dynamic partial-order reduction; active finite-automata learning; causal intervention/transportability gates; formal-concept classifier lattice analysis; and MC/DC Boolean condition independence. None replaces MPC's original transformation grammar. Use the original SOURCE → ATOM → METHOD → PROCESS → INVERSE → FALSIFIER → DECISION identity discipline.

## Methods on methods: finite planning code

New `lib/method-synergy-v22.mjs` exports:

- `proposeMethodSynergies(input)`: for up to 16 sourced hook contracts and 48 explicit source-bound observations, check up to 240 ordered hook pairs. Admit A → B only when A's declared output intersects B's required input. Report missing upstream and nonbridged downstream inputs, unknown evidence, same-subject scope, and competing or unspecified clocks for order-dependent contracts. Return **research compositions only**, never output-as-observed evidence, automatic method execution, actor attribution, or proof of independent witnesses.
- `planMethodInteractionCoverage(input)`: deterministic finite greedy pair cover for 2–6 factors with 2–4 values each; hard cap of 4096 Cartesian worlds and 64 suggested cases. Report every uncovered 2-way combination on budget exhaustion. Does not infer a target oracle, test pass, or 3-way-or-higher coverage. A greedy design may not be the *globally smallest* covering array.
- `auditMethodInteractionCoverage(input, design)`: independently enumerate planned pair coverage and check source-commit fingerprint, case values, marginal pair gains, totals and stop/promotion claims. A tampered receipt is contradicted or rejected rather than silently elevated. The method-on-method adversarial review caught an initial audit weakness: budget drift and redundant test rows could evade the coverage-consistency result. The V22 audit now fingerprints the maximum case budget, rejects over-budget and duplicate/no-information-gain rows, enforces sequential case IDs, and checks objective, version and Cartesian-world counts against the replay. These additions have their own negative regression test.

These helpers are local code; **not** extra registered `evaluateMethod()` methods, authenticated native MPC calls, or a replacement for `lib/method-hook-cascade.mjs`. The input `source_commit` is a 40-hex user-supplied version label checked for structure, **not cryptographic proof of what GitHub currently serves**. The parent branch and source provenance must be verified by a separate native GitHub readback.

## Synthetic synchronicity result and its falsifiers

`node research/run-method-synergy-v22.mjs` uses declared, synthetic inputs and no target or connector actions. The sample finds four dependency-linked directed method pairs: provenance algebra → shared-source challenge; conflict sets → minimal hitting sets; finite pairwise design → coverage check; and concurrent schedule reduction → independent continuation audit. On the sample's supplied input availability, the first three are composition **candidates**, while the last remains `INPUT_ACQUISITION_REQUIRED`. No underlying research algorithms are executed by these composition labels.

The separate synthetic method-interaction fixture has **5 binary factors, 32 Cartesian combinations, 40 required two-way value pairs**. The bounded greedy planner selects **6 test cases**, and the separate auditor confirms 40/40 **planned** pair coverage. This demonstrates correct bounded test-design selection on this fixture, not a security vulnerability, an OCR speed improvement, independently verified evidence, a valid causal finding, or a proof of 3-way interaction coverage.

Method-on-method adversarial controls: invert pair order without assuming commutativity; ablate an upstream input; change source/subject scope; mark a required observation `UNKNOWN`; perturb clocks; merge independent-looking source ancestry; exhaust case budgets; mutate case values or coverage totals; and alter the pinned source version. Missing proof remains an explicit open acquisition, not an inferred negative.

## New classifier routing proposals (no MHC allocation)

Candidate conceptual dimensions only: `PROVENANCE_ALGEBRA`, `CONFLICT_SET_DIAGNOSIS`, `INTERACTION_COVERAGE`, `REWRITE_EQUIVALENCE`, `PARTIAL_ORDER_INDEPENDENCE`, `ACTIVE_ORACLE_ACCESS`, `CAUSAL_TRANSPORTABILITY`, `FORMAL_CONCEPT_CLOSURE`, and `CONDITION_INDEPENDENCE`. To promote *later*, first run existing MHA-0192/0193/0194/0195/0196/0198 and MHA-0229 false-positive/lineage/zero-delta gates against each. The 239 existing MHA and corresponding MHC IDs are not renumbered or edited in this branch.

## Verification and exact next step

For the **V22 feature branch** in an existing prepared local/Codex source checkout (Node >=22.13, lockfile unchanged):

```sh
node --test tests/method-synergy-v22.test.mjs
node research/run-method-synergy-v22.mjs
node --test
npm run build
```

Isolated V22 code was tested on the preparing local Linux runtime under Node v22.16.0: **9/9 V22 unit tests passed**, 0 failed, and the separate synthetic runner gave the finite counts above. Those local tests are *not* proof that GitHub-hosted CI, the complete repository suite, the Windows Electron portable build, production MPC, or any authenticated target passed. The existing Windows release workflow's push branches do not automatically cover this new branch. Seek exact branch-commit and build receipts before merging, packaging or deploying.

**PASS frontier:** `MPC_V22_METHOD_SYNERGY_RESEARCH_OVERLAY`. Completed: bounded local planner/auditor, research hook overlay, nine synthetic controls, source-parent selection and review-only GitHub source additions. **Open:** complete native repository tests/build; source-exact CI; more adversarial non-Boolean factor fixtures; actual source-authenticated data for future scientific method execution; UI integration with explicit user review. **Next:** validate full V22 branch tests/build and then add only an opt-in Research Workbench adapter. Do not merge or deploy merely because the research overlay exists.

## Primary attribution and paper locators

1. https://web.cs.ucdavis.edu/~green/papers/pods07.pdf
2. https://www.w3.org/TR/prov-o/
3. https://doi.org/10.1016/0004-3702(87)90062-2
4. https://www.nist.gov/publications/combinatorial-coverage-measurement
5. https://doi.org/10.1145/3434304
6. https://doi.org/10.1145/1040305.1040315
7. https://doi.org/10.1016/0890-5401(87)90052-6
8. https://ojs.aaai.org/index.php/AAAI/article/view/7861
9. https://proceedings.mlr.press/v6/pearl10a.html
10. https://link.springer.com/book/10.1007/978-3-031-63422-2
11. https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20010057789.pdf

No third-party code, academic paper text, institutional sponsorship claim or implied exclusive rights are imported by this pass. No production connector, private Sites project, Google Drive, Windows binary, privacy mask, capture choice, or external bug bounty scope is changed.
