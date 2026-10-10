# MPC V31 — Bidirectional Intelligence: Methods versus Methods

**Base:** `mjcustomcomputers-dotcom/Machine-Bug-Tool`, V30 pinned `1749089a1666cfa47daf0d2b2a131d02f568cf54`.  
**Branch:** `feature/mpc-bidirectional-intelligence-v31`.  
**Pass:** `MPC_V31_BIDIRECTIONAL_REASONING_META_ORACLES`.

## METHOD → RESULT → EVIDENCE → NEXT

**METHOD:** independent AND/OR forward and backward source-reasoners; minimum abductive explanation; model-based diagnosis by minimum conflict transversal; proof-cut counterfactual; mutation/invariance oracles; per-case reasoning tournament.

**RESULT:** one bounded source-owned input can now be examined by *competing algorithms* rather than relying on a single reasoner's confident explanation.

**EVIDENCE:** proof supports and counterexample withdrawals are compared as exact finite fact-ID sets. A rewritten claim or source owner cannot silently introduce additional support. The forward engine saturates declared positive Horn rules; the backward engine proves a goal by independent recursive AND-premise/OR-rule decomposition. Metamorphic controls reorder rules, duplicate one rule, and introduce a disconnected synthetic atom; their proof-support output is required to remain equal.

**NEXT:** choose **Engineering Lab → Forward vs Reverse** in the existing Workspace, load an example, run it, then inspect the independent replay and minimal evidence cut receipt. Missing facts become an exact acquisition target; unsupported explanations remain alternatives for investigation.

## The 36 noncanonical research contracts

| Method family | Hooks | Exact IDs |
|---|---:|---|
| LOGIC | 12 | RH-V31-01, RH-V31-02, RH-V31-03, RH-V31-04, RH-V31-05, RH-V31-06, RH-V31-07, RH-V31-08, RH-V31-09, RH-V31-10, RH-V31-11, RH-V31-12 |
| DIAGNOSIS | 8 | RH-V31-13, RH-V31-14, RH-V31-15, RH-V31-16, RH-V31-17, RH-V31-18, RH-V31-19, RH-V31-20 |
| FALSIFICATION | 8 | RH-V31-21, RH-V31-22, RH-V31-23, RH-V31-24, RH-V31-25, RH-V31-26, RH-V31-27, RH-V31-28 |
| PORTFOLIO | 8 | RH-V31-29, RH-V31-30, RH-V31-31, RH-V31-32, RH-V31-33, RH-V31-34, RH-V31-35, RH-V31-36 |

[Method contracts and sources](../research/bidirectional-intelligence-methods-v31.json) include required typed evidence, proposed output, falsifier and actual implementation state. These `RH-V31` entries stay outside the historical 24 native MPC evaluators and 239 prior Atlas candidates.

### New computational core

**`lib/mpc-v31-bidirectional-logic.mjs`**
- `validateHornModelV31`: exact subject/scope/commit plus source ref/owner/version. Positive Horn-only, ≤12 declared seed records, ≤24 rules, ≤4 premises/rule, ≤40 symbols and bounded proof-antichains. Claimed/unknown source data is excluded from a supported proof.
- `forwardHornV31`: saturate all available rules until a finite fixpoint; preserve an **antichain of minimal fact-ID supports**, retaining alternative source routes.
- `backwardHornV31`: independent backward goal recursion, AND decomposition inside rules, OR alternatives between rules, cycle guard and missing leaf records.
- `compareDirectionsV31`: exact target/status/support-set agreement, with actual algorithmic effort counters. Two independent codepaths supply a bounded oracle.

**`lib/mpc-v31-diagnostic-methods.mjs`**
- `diagnoseDeclaredConflictsV31`: enumerate finite subset-minimal hitting sets of provided conflict sets with source labels and declared costs, then independently verify every set intersects every conflict and is minimal.
- `abduceFiniteGoalV31`: enumerate ≤8 hypothetical missing source atoms; find subset-minimal assumption sets that would satisfy the goal through actual finite forward replay. Distinguish hypothesis costs from measured probability.
- `calculateMinimalRetractionCutsV31`: solve the *dual* of minimal proof supports. Find every subset-minimal fact withdrawal that intersects all proof routes; recompute the goal after each cut and each candidate's smaller subset.
- `metamorphicBidirectionalChecksV31`: reorder rules, duplicate a rule and introduce an irrelevant synthetic fact; verify that exactly the same minimal target source proofs emerge.
- `selectMethodPortfolioV31`: compare per-input actual work counts (forward rule checks versus backward goal calls and rule checks); choose the cheaper locally observed reasoning method **only after** source-provenance agreement and **all three** metamorphic controls pass. If input caps prevent rule duplication or an irrelevant-seed check, return `METHOD_COMPARISON_COVERAGE_INCOMPLETE` and withhold method promotion.
- `auditMethodPortfolioV31`: recompute the proof and method workload from the original source input, checking for edited winners, dropped source proof sets, forged status, missing negative-control coverage, incorrect source-authentication claims, and tampered four-line engineering output.

### Concrete three-way experiment

```text
Source facts: A [fA], B [fB], C [fC]
Model rules:
  A AND B -> X
  X       -> GOAL
  C       -> GOAL

Forward proof: GOAL from {fA, fB} OR {fC}
Backward proof: GOAL from {fA, fB} OR {fC}
Reverse challenger: remove {fA, fC} OR remove {fB, fC}
                    -> GOAL no longer follows
Abduction with no original facts:
  assume {A,B} or assume {C} to explain GOAL
Diagnosis from declared conflicts:
  {a,b} and {b,c} -> subset-minimal diagnoses {b} or {a,c}

Method portfolio: compare independent proof receipts, mutation
controls and actual finite work units; select a review method.
```

Notice the core algebra: **AND within a proof route, OR among proof routes, minimal hitting sets across counterexamples.** This scales a useful reasoning principle across legal records, application events, networking investigations and product/business workflows without changing the identity of the underlying evidence.

### Distinct existing methods reused or preserved

MPC already contains `reviewReverseGoals` (supplied finite graph reachability), `finite-abstraction-refinement.mjs` (bounded CEGAR adapter), V26 four-valued conflict states, V29 method mountains and V30's local Engineering Lab. V31 **does not replace** those approaches. Positive Horn fact inference and source-support antichains are a separate domain from V15 CEGAR, V26 epistemic four-value algebra and V30 device receiving. Future bridge work can use a typed adapter only when its source and semantics are explicitly matched.

## Research sources and intellectual transfer

- [Bancilhon, Maier, Sagiv & Ullman, Magic Sets and Other Strange Ways to Implement Logic Programs (1986)](https://cris.huji.ac.il/en/publications/magic-sets-and-other-strange-ways-to-implement-logic-programs/): backward relevance and bottom-up logic are complementary method-selection strategies.
- [Johan de Kleer, An Assumption-Based TMS (1986)](https://www.sciencedirect.com/science/article/pii/0004370286900809): explicit assumption environments and multiple explanations in a provenance-aware problem-solving system.
- [Raymond Reiter, A Theory of Diagnosis from First Principles (1987)](https://www.sciencedirect.com/science/article/pii/0004370287900622): a principled link between minimal conflict sets and candidate diagnoses.
- [Clarke et al., Counterexample-Guided Abstraction Refinement (2000)](https://web.stanford.edu/class/cs357/cegar.pdf): finite counterexamples can drive *targeted* refinement of an abstraction. The existing MPC adapter already addresses that family and is retained.
- [ASlib, Algorithm Selection Benchmarks (2016)](https://research.ibm.com/publications/aslib-a-benchmark-library-for-algorithm-selection): choose methods per task and measured input workload instead of naming one universally best algorithm.
- [Zeller & Hildebrandt, Simplifying and Isolating Failure-Inducing Input (2002)](https://www.st.cs.uni-saarland.de/papers/tse2002/): reduction to minimal adverse dependencies. V31 uses its own proof-set duality and exhaustive finite replay, not a generic arbitrary program delta-debugger.

## Workspace and source receiving

The existing V30 Engineering Lab receives three additional operations (**10 total**, with the original seven preserved):

| Operator choice | Executed method | Output |
|---|---|---|
| `REASONING_DUEL` | forward + backward + metamorphic + independent portfolio audit + source retraction cuts | Winning review strategy and source-proof falsifiers |
| `ABDUCTIVE_EXPLANATIONS` | minimum hypothetical assumption enumeration with forward replay | Alternative missing-explanation sets ranked by declared cost |
| `DIAGNOSIS_HITTING_SETS` | minimum hitting-set enumeration and independent set-minimality audit | Distinct diagnostic alternatives, source-bound conflicts and ranking |

The loopback endpoint, CSRF, exact current project scope, explicit Run, privacy/retention policies, method input limits and full copyable receipts from V30 are reused. No default workflow is redirected or background source acquisition started.

## Source-exact acceptance

```sh
node --test tests/mpc-v31-bidirectional-intelligence.test.mjs tests/mpc-v31-workspace-reasoner.test.mjs
node research/run-mpc-v31-method-duel.mjs
node --test tests/mpc-v30-engineering-lab.test.mjs tests/mpc-v30-engineering-server.test.mjs
node --test
pnpm run build
```

The dedicated V31 Actions gate records exact source SHA, focused V31/V30 acceptance, total MPC suite and build. **Use only the actually completed source-exact CI receipt for final PASS numbers.**

**Checkpoint:** `MPC_V31_BIDIRECTIONAL_REASONING_META_ORACLES`.
**Completion condition:** actual verified CI, unchanged historical registries/source owners, no regression of V30's original seven operations.  
**Next frontier:** Windows source-exact packaged receiving with a user-selected evidence record and independent end-user usability feedback. Preserve draft/unmerged state until separately authorized.
