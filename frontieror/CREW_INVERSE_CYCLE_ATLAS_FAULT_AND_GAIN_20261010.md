# FrontierOR Crew — cycle-inversion Atlas method cross-reference and measured fault matrix

**Branch:** `frontieror-crew-inverse-cycle-factor-20261010`
**Native parent:** `0d2c2ed03dd5334ed07cdfe3e703f4071e4c56f8` (previous verified graph-conservation pass)
**Final tested source commit:** `05df8ff9c10b898d7c1832217f504e9c53c91089`
**Crew `solve.py` Git blob:** `9b1f5d887913790903eba8a10dd12ebd348af383`
**Focused final run:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38105262275 — SUCCESS
**Previous scale run:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38105234909 — SUCCESS
**Paths:** `frontieror/solvers/hoffman1993/solve.py`, `frontieror/tests/test_crew_inverse_cycle.py`, `frontieror/tests/bench_crew_inverse_cycle.py`.
**Workscope:** Core solver, targeted Python 3.12 NumPy/SciPy tests, exact original-model and brute-force oracle. No ZIP packaging, no six-solver CI, no 4GiB container acceptance, no official organizer score.

## MPC Method Ark and classifier provenance

Read universal contract UMTB-4 and original native source before transforming. Explored all 17 inversion/atomic transformation declarations, 15 mirrors and 15 framework operators across Atlas layers. Applied the *computational interpretations* of `TRANSFORMATIONS:3 SUBSTITUTE`, `:5 INVERT EDGE`, `:6 REORDER/PERMUTE`, `:7 PERTURB`, `:9 PROJECT/REDUCE`, `:11 COMPOSE`, `:13 STATE DIFFERENCE`, `:14 INVARIANT TEST`, `:15 QUALITATIVE SENSITIVITY`, `:16 NULL/NO-EDGE TEST` and `:17 ALTERNATIVE MODEL SET`. Relevant framework operators: relational counterexample finder, synthesis/search-space pruning, proof/refinement, graph inference, impossibility lower bounds, error-correcting redundancy, compositionality, anti-overfitting.

Cross-referenced exact Atlas classifier definitions `BL21.04` (correct-looking value bound to wrong underlying object), `BL21.09` (change authority/channel), `BL21.11` (partial failure intermediate state), `BL24.05` (decision on incompatible/stale state). These are *analytical analogies*, **not executable solver routines or semantically equivalent combinatorial identities**. MPC `review_atomic_variants` produced two test-only counterfactuals—ABLATe side-effect invariance and PERTURB degree 2→3. Its records are metadata; GitHub source and executed CI own actual proof/readback.

### Mathematical symbols and proof

Original exact cover: `sum_{j:r in C_j} x_j=1` for every residual flight `r`.
Constrained subclass: every active nonempty rotation covers exactly two distinct residual flights; each residual flight is incident to **exactly two** active pair rotations. The multigraph is a union of degree-2 cycles. Each even cycle `c` has exactly two alternating perfect matchings `A_c, B_c`. Odd cycles fail the perfect-cover precondition and return UNKNOWN.

Full mathematical side invariance is established iff for every side index `k` and **every** component `c`,
`sum_{j in A_c} D[k,j] = sum_{j in B_c} D[k,j]`.
Only exactly integral, binary64-safe bounded coefficients are accepted; each optional empty rotation must have zero side effects, and total original side activity (plus forced-column effects) must lie within every original literal bound. When these conditions hold, constraints cannot couple the two choices. Choose `argmin(cost(A_c),cost(B_c))` in each component, add every negative-cost optional empty rotation and all forced rotations. The complete unchanged `verify(p, selected)` checks the result. The proof is global for the constrained subclass, and every invalid/uncertain case returns UNKNOWN to the preexisting full MILP portfolio.

### Implementation substitutions and inversions

1. **MILP→finite-state two-choice factorization**: no branch-and-bound needed for certified degree-two cycle components.
2. **Two graph traversals→single alternating walk** per component recovering both disjoint choices.
3. **Python q×component scalar reduction→batched exact int64 array reduceat** for side sums; very small q×n work uses a cheaper scalar path.
4. **Positive proof→negative early falsifier**: if the first side row disagrees within any encountered cycle, reject immediately rather than constructing every remaining component.
5. **Opaque size classifier→actual structural eligibility and witness**: all output stays in original rotation IDs, cost and side bounds are checked, and original MILP retains its full fallback.

## Adversarial exactness

**12/12 focused test methods PASS** in final CI, covering 320 randomized signed-cost/permutation/side-inversion cases with exhaustive optimum comparisons, 6-vertex even cycle, separate odd degree-two cycles, degree-3 edge, negative-cost optional empties, differing side effects whose global deltas could cancel, a side-bound contradiction, near-integer coefficient perturbations (including large-q array path), oversized integer coefficients, and a 600-row direct-vs-solve equality test. Nonpromotion of ambiguous cases was tested explicitly. No synthetic test can establish hidden organizer improvement.

## Reproducible final ABBA matrix (run 38105262275)

Warmed SciPy, same input and objective, two runs per treatment, clean vs single edge corrupted controls. Times exclude importing Python and initial parsing, and are not full 60-second contest runtimes.

| Rows | Side rows | Clean original MILP | Clean exact inverse | Clean speed ratio | Corrupt original | Corrupt inverse + fallback | Corrupt speed ratio |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 | 8 | 0.002438 s | 0.000421 s | **5.791x** | 0.001792 s | 0.001814 s | 0.988x |
| 220 | 65 | 0.004691 s | 0.001048 s | **4.478x** | 0.004965 s | 0.005016 s | 0.990x |
| 600 | 65 | 0.011258 s | 0.002929 s | **3.844x** | 0.012431 s | 0.012361 s | 1.006x |
| 600 | 120 | 0.014339 s | 0.005017 s | **2.858x** | 0.014641 s | 0.014864 s | 0.985x |
| 1200 | 65 | 0.021928 s | 0.006092 s | **3.599x** | 0.022907 s | 0.024119 s | 0.950x |
| 2000 | 120 | 0.281260 s | 0.015907 s | **17.682x** | 0.275864 s | 0.277389 s | 0.995x |

Every matched pair returned **identical original objective** and a full original feasibility pass. Clean objective at 2,000 rows: **1539**. Both treatments' MILP solutions had certificates in measured cases; cycle inverse returns mathematically exact certificate for applicable structure.

The preceding source-matched scale run 38105234909 recorded 2000/120 original **0.337414s** versus inverse **0.018189s**, **18.551x**. This is a different runner timing sample; report both results rather than cherry-picking. Tiny samples do not provide robust throughput confidence intervals or private-score estimates.

## Next method pass / faults

- Detect near-cycle structures and decompose bounded irregular components (degree>2) with exact DP but preserve side vectors and proof; weigh against native MILP and compiled matching.
- Explore reducing q×n array construction and vector cost (100+ side rows), but preserve exact integer bounds and conservative fallback.
- Add deterministic end-to-end CPU, 4GiB memory, 60-second deadline, original JSON parsing overhead and all six solvers only *after* the user requests promotion/packaging.
- Last owner-supplied official Dignity Main Testing score remains **0.7909**. There has been no organizer submission or official score measured here. Never multiply gains across unrelated instances, claim all instances speed up 17–18x, or confuse MPC metadata with native execution.

**User directive preserved:** do **not** build a ZIP yet; attack the solver problem first.
