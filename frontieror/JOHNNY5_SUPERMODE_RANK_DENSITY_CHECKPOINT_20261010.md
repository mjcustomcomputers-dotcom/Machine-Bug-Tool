# JOHNNY 5 — rank/density Supermode, tolerance-safe GF2 and inverted test oracle

**Base native source:** `103b2fb7f213e9e09c4c4f931425389347107867`, branch `frontieror-crew-five-level-parity-20261010`.
**Source branch:** `frontieror-johnny5-rank-density-supermode-20261010`.
**Final measured source/test commit:** `e5e29f5fec8978e3e509a136d010ba97f7f46033`.
**Crew solver Git blob:** `2ab265a1fc0cec343cc0bdb8445bc0e0081004bf`.
**Rank/density test Git blob:** `1d30d6008f5847ab96ab9732a60f30d000b0b4b7`.
**Measured CI:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38107517058 (SUCCESS).
**Initial router CI:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38107364192 (SUCCESS).
**Test/benchmark:** `frontieror/tests/test_crew_supermode_router.py`, `frontieror/tests/bench_crew_supermode_router.py`.
**No ZIP or organizer submission. Frozen cycle-inversion snapshot remains untouched.**

## New source-bound method

### Five linked dimensions

1. **Structural problem change:** exact pair-only residual Crew -> one binary per even cycle, retaining global side inequalities.
2. **Symbol reduction:** integer-equation side matrix -> exact GF2 row-span basis via bitsets; no side row is removed and independently original-verified results only.
3. **Risk classifier:** measure safe XOR rank `r`, cycle-choice dimension `n`, and side coefficient nonzero density `rho`. `use_parity = n>=12 AND q>=8 AND r>=8 AND r/n>=0.14 AND rho>=0.65`. This is a measured heuristic hypothesis for computational routing, not a universal optimality result.
4. **Inversion / algorithm order:** compare `cp_parity=False`, `cp_parity=True`, and `cp_parity="auto"` on the same generated source. Alternate method order to expose initialization/cache bias.
5. **Test the test:** an independent original Crew cover/side verifier must agree; remove a required rotation to falsify it; generate sign-inverted/permuted cases; reject unsafe high-magnitude source bound tolerance and non-finite coefficient/right-hand-side cases.

### Critical correctness repair

The previous GF2 proof `lhs[k]==rhs[k]` was mathematically exact but didn't account for the original verifier's source-relative `1e-6 * max(1,abs(bound))` tolerances. If the accepted original activity interval contains more than one integer, a GF2 XOR relation may silently remove valid original schedules.

The new `independent_parity_atoms(...,source_tolerance)` inserts a GF2 row **only when the entire expanded original source interval contains exactly its declared integer RHS**. Invalid/ambiguous rows stay in the full model. A nonfinite RHS fails closed before any Python integer conversion. Targeted negative control with a 1,000,000 RHS and a >1 tolerance intentionally omits the unsafe XOR.

## Executed source-matched results

Final CI `38107517058`: **5/5 focused test methods PASS**; Python 3.12, NumPy 2.5.3, SciPy 1.18.1, OR-Tools 9.15.6755. Generated instances only; exact original feasibility/cost recomputed separately. No private score measured.

| Original Crew rows | Side rows | Seed | GF2 rank / choices | Nonzero density | Auto routed XOR | Plain CP-SAT | Auto CP-SAT | Forced GF2 |
| ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| 240 | 20 | 43 | 10/61 | 0.9074 | YES | 0.56316s | **0.17428s** | 0.17559s |
| 240 | 20 | 7 | 10/61 | 0.9041 | YES | 6.27003s | 6.31041s | 6.32694s |
| 240 | 20 | 31 | 10/61 | 0.8967 | YES | 3.94752s | **1.26467s** | 1.25429s |
| 480 | 25 | 17 | 12/121 | 0.9078 | NO | 9.92133s | 9.92220s | 9.92294s |

All 240-row returned original-verifier-valid answers and identical per-seed objectives (seed 43: 542; 7: 498; 31: 619). All 480-row methods returned **NO INCUMBENT** within the 10-second tested limit. No 240-row first-feasible result is a mathematical objective optimum proof. A fast first treatment may differ due to SciPy/OR-Tools initialization; do not treat 0.56316->0.17428 as statistical evidence alone. Seed 31 has repeated prior independent support for a genuine large gap, but exact general throughput confidence is not established.

Initial fixed-threshold `r/n >= 0.25` rejected all these samples. First CI `38107364192` measured seed31 plain 4.35781s vs forced XOR 1.25576s with equal original objective, confirming the classifier false negative. The final calibrated threshold is tested against independent seed 43 and seed 7; one holdout gained, one was slightly slower. This is selection progress, not a successful 480-row score-floor recovery.

## MPC Atlas cross-reference, provenance limits

MPC UMTB-4 Method Ark tail: `information_flow_hyperproperty_check` (cross-world oracle leakage), `guarded_operation_commutativity` (order effects), `finite_epistemic_indistinguishability` (what the candidate actually knows). These are **RESEARCH_HOOK_IMPLEMENTATION_REQUIRED**, used as analytical falsifiers and translated into explicit source tests, not claimed runnable Crew methods.

Cross-referenced hosted BL24.05, BL24.06, BL24.07, BL22.01 and BL21.11 review declarations. Registry fingerprint `436fe6b88f5b9202e85e52b8d6320f2fec3df88a5baa40d0b1110c2d90abf7f2`; semantic_equivalence_established=false. Source ownership and proof: GitHub pinned solver source and executed CI. Atlas classification descriptions alone are not proof or official score.

## Next mathematical obstacle / pause gate

The underdetermined 480-row/25-side/121-choice hard instance remains no-incumbent in 30 seconds in previous experiments and 10 seconds here. The verified rank is 12/121, so parity constraints alone cannot shrink the search sufficiently.

Highest-information next pass: inspect **exact rank-deficient linear rows** and identify a small undecided-variable separator, then apply bounded bidirectional meet-in-the-middle or block-local CP-SAT with strict original model verification; compare against 30-second plain CP on multiple independent seeds. If no verified original incumbent is recovered, classify as UNKNOWN, not infeasible.

No automatic integration into the official six-solver submission was performed. Last owner-reported completed organizer Main score remains **0.7909**, not recalculated from synthetic speedups. Preserve all existing GitHub and MPC methods, classifiers, architecture, checkpoints and package hashes.
