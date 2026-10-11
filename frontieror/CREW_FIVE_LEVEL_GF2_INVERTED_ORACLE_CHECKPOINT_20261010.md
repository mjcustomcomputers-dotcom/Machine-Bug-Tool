# FrontierOR Crew — five-level Atlas/GF2 inversion and test-the-test checkpoint

**Native execution completed:** 2026-10-10 CDT / 2026-10-11 UTC.
**Branch:** `frontieror-crew-five-level-parity-20261010`.
**Source code at final test:** `328ab8876924aabf632c1c3d1cd12e2994c0d7ee`.
**Solver `solve.py` Git blob:** `0b4b8dd7e288912f4f5449f1549cf602ded06b5d`.
**Focused adversarial test Git blob:** `58814629978d136baf14f08e8f04da15714a237a`.
**Full focused CI:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38107015688 — SUCCESS, five test methods, same-source 240/480 solver A/B.
**Additional first run:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38106932338.
**Frozen earlier 17–18x cycle breakthrough:** source `05df8ff9c10b898d7c1832217f504e9c53c91089` and frozen branch `frontieror-snapshot-inverse-cycle-20261010`.
**No ZIP, no main branch change, no 4GB/60s container acceptance, no organizer submission.**

## Five levels / dimension crossings

1. **Problem change:** Exact pair-only coupled Crew cover -> one Boolean per residual even cycle, original global side bounds retained, original rotation IDs reconstructed. Implementation from parent branch `frontieror-crew-coupled-cycle-rescue-20261010`.
2. **Symbol reduction:** For exactly integral equality side constraints, project the binary coefficient matrix to GF(2), eliminate dependent modulo-2 equations via Python bitsets, and retain an independent basis as **supplementary** parity constraints. The full integer and original side inequalities remain authoritative. Function `independent_parity_atoms`.
3. **Solver selection:** Route identical models to CP-SAT with or without the extra `add_bool_xor` propagation. `cp_parity=False` default preserves existing portfolio. Both paths use original `verify`, with no optimality certificate for first-feasible results.
4. **Inverse/metamorphic checks:** Random side coefficient sign inversion, rotation-order permutation, noninteger coefficients, contradictory side bounds, and optional negative-cost empty rotations. Swapping order of algorithm variants in the benchmark exposes first-run/library effects.
5. **Test the test:** The original parity test checked only source-valid assignments => compressed-valid assignments. A second independent generated-planted system exhaustively checks the *biconditional* over all 0/1 vectors, catching over-permissive parity bases. The independent original cover/side checker is independently implemented and deliberately fed a missing-rotation mutant and a perturbed source bound; it must reject both. Final five test methods PASS.

## Newly inspected bottom-of-Atlas methods

MPC UMTB-4 Method Ark included the **unusual catalog-tail** research hooks `information_flow_hyperproperty_check`, `guarded_operation_commutativity`, and `finite_epistemic_indistinguishability`. Their status is **RESEARCH_HOOK_IMPLEMENTATION_REQUIRED**. Applied as conceptual falsifiers for oracle leakage, order dependence and hidden source witness availability; these are not production Crew optimizers. Additional cross-reference IDs `BL24.07`, `BL24.06`, `BL24.05`, `BL22.01`, `BL21.11` share analytical review concepts only, with semantic_equivalence_established=false. MPC registry fingerprint `436fe6b88f5b9202e85e52b8d6320f2fec3df88a5baa40d0b1110c2d90abf7f2`. Also inspected the final MBSS-B63/B64 and extension candidate registry pages **without** incorrectly mapping unrelated business-domain definitions into executable Crew methods.

## Native source-matched outcome

Final CI `38107015688`, Python 3.12, NumPy 2.5.3, SciPy 1.18.1 and OR-Tools 9.15.6755:

| Generated original Crew instance | CP-SAT literal side rows | CP-SAT + GF2 XOR | Original verification |
| --- | ---: | ---: | --- |
| 240 rows / 20 sides / seed 23 / budget 12s | 6.93200s, obj 545 | **6.56261s**, obj 545 | Both PASS |
| 240 rows / 20 sides / seed 31 / budget 12s | 3.97764s, obj 619 | **1.25090s**, obj 619 | Both PASS |
| 480 rows / 25 sides / seed 17 / budget 30s | 29.92215s, no incumbent | 29.92328s, no incumbent | No result from either |

Seed 31 ratio 3.18x, seed 23 ratio ~1.06x. Neither wins on the 480-row failure. Previous earlier single-run A/B recorded 5.06907 -> 1.94281 (2.61x) for seed 31 and 9.13751 -> 8.68437 (1.05x) for seed 23. Do not extrapolate; these are CPU/runner-dependent synthetic numbers, only one or two samples each.

**Disposition:** GF2 parity is a *validated optional research candidate*, not a general rescue or score improvement. No production automatic dispatch until larger seed/sparsity distributions demonstrate a repeatable gain; preserve the frozen complete Crew baseline. Critical unresolved target remains 480-row/25-side coupled instance with no verified incumbent in 30s and the organizer's actual hidden Crew score gap.

## Next high-information pass

- Vary GF2 **rank-to-variable ratio**, q-density and coefficient sparsity instead of collecting unrelated fast microbenchmarks; use a 2×2 matrix of high/low rank and high/low cycle count.
- Run a guarded adaptive switch based on *actually measured first-stage progress*, not unproven thresholds or planted-witness access.
- For highly underdetermined but tight multi-side instances, try block subset-sum meet-in-middle and reversible CP partial assignments, with original independent oracle and same-budget comparator.
- Only after positive original-source result across meaningful distribution should integrated 2 CPU/4GB / 60s resource checks and any ZIP be considered.
