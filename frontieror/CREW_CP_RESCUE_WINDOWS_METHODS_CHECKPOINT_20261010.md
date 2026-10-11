# FrontierOR Crew — coupled-cycle feasibility rescue and Windows MPC cross-method checkpoint

**Observed at:** 2026-10-10 CDT / 2026-10-11 UTC
**Development branch:** `frontieror-crew-coupled-cycle-rescue-20261010`
**Final source state at test:** `60a59edf8ef81aa004dadcfcc33a1680b6cad6a3`
**Native Crew solver `solve.py` Git blob:** `5a05c8a2c252c0767d737fe5e0018894b1dd2a4d`
**Immutable proven baseline cycle source:** `05df8ff9c10b898d7c1832217f504e9c53c91089`
**Baseline snapshot:** `frontieror-snapshot-inverse-cycle-20261010`
**No ZIP built, no six-solver release, no organizer upload or official private score change.**

## 1. Native computation/result

A previous verified exact cycle inversion solves degree-two residual Crew graphs when the two alternating perfect matchings have the **same** side-effect vector. It demonstrated source-matched 17.682x and 18.551x faster results on two independently executed controlled 2,000-row synthetic tests. This method/source remains frozen and separate.

This pass extended the same **change-the-problem** principle to cycles where the two alternatives have **different** side effects:

`exact-cover choices for pair-cycle c -> y_c in {0,1}` for each cycle; `D_k = offset_k + sum_c (D_k(B_c)-D_k(A_c))*y_c + optional-empty-rotation effects`.

The original global side lower/upper bounds remain in the compressed model. The original objective uses exact original rotation costs, and the complete unchanged `verify(p, selected)` checks the reconstructed selected rotation IDs. Odd cycles, degree-three vertices, non-pair columns, and other non-equivalent source structures return UNKNOWN rather than claim infeasibility.

Methods evaluated independently:
- `sparse_milp` on original reduced row/column model
- `coupled_cycle_choice_milp` on exactly equivalent compressed model
- inverse dense linear-equation candidate reconstruction, always independently verified and never an optimality proof
- compressed CP-SAT first-feasible search, always independently verified and never presented as an objective optimum

**Correctness:** CI https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38106344398 passed **9 focused test methods**, including 100 seeded original brute-force optimum metamorphs, global coupling, infeasible side bounds, forbidden degree-three source structure, negative-cost optional empty decisions, and inverse/CP consistency.

## 2. Real synthetic score-floor findings

**4-way short-budget test**, same generated hard structures, run 38106344398:
- 40-row / 16-side and 120-row / 45-side models: all methods found independently verified feasible solutions; objectives matched in this controlled fixture.
- 240-row / 20-side and 480-row / 25-side models: all original MILP, compressed MILP, least-squares inverse and CP-SAT had **no incumbent** in the short 1.2/1.8-second budgets, despite input construction using a known valid binary witness. This is a search-time failure, not mathematical infeasibility.

**Follow-up equal-budget ladder**, https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38106478218 (SUCCESS; exact solver source `60a59edf8ef81aa004dadcfcc33a1680b6cad6a3`):
- 240 rows, 20 side constraints: no verified witness from any method at 4 seconds. At 12 seconds **compressed CP-SAT found a verified solution in 8.1589 seconds**, objective **545**. Full reduced MILP and exact compressed objective MILP both returned no incumbent after approximately 12 seconds.
- 480 rows, 25 side constraints: CP-SAT, compressed MILP and original MILP found no verified witness in 4 or 12 seconds.
- A native `sparse_milp(..., return_certificate=True)` timeout can return `None`; the test harness now records this as a no-incumbent outcome instead of crashing. No failure is silently converted into an infeasibility proof.

**Independent-seed reliability follow-up**, https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38106630716 (SUCCESS):
| Generated instance | Seed | CP-SAT budget | Wall time | Original verification | Original objective |
| --- | ---: | ---: | ---: | --- | ---: |
| 240 rows / 20 sides | 23 | 15 s | 7.1734 s | PASS | 545 |
| 240 rows / 20 sides | 31 | 15 s | 3.9756 s | PASS | 619 |
| 240 rows / 20 sides | 43 | 15 s | 0.1503 s | PASS | 542 |
| 480 rows / 25 sides | 17 | 30 s | 29.9218 s | NO INCUMBENT | — |

**3/3 240-row samples rescued**, and **0/1 480-row sample rescued**. The samples are generated/synthetic, not authenticated organizer hidden cases. CP-SAT outputs are valid witnesses; optimality is not certified. They do not establish that an actual Crew fifth private case has this structure. Results are solve-phase measurements with Python 3.12 matched numerical dependencies, not full six-solver 4-GiB and 60-second platform acceptance.

## 3. Actual Windows / MPC source provenance and reusable controls

The user-requested GitHub cross-reference discovered:
- `feature/mpc-v32-windows-portable-receiving`, source `c0bd4fef64498fd15d452093ae1145d583498f52`, `docs/MPC-V32-WINDOWS-PORTABLE-RECEIVING.md`, Windows portable archive/ASAR/renderer checksum readback and native executable receiving. Use for *versioned source and packaged-runtime verification*; it is **not** a Crew-solving numerical speedup.
- V31 source `feature/mpc-bidirectional-intelligence-v31` at `08216cdc968b3d0688e615d3f220905f7feede55`, `docs/MPC-V31-BIDIRECTIONAL-INTELLIGENCE.md`, independent forward/backward reasoning, minimal witness supports, counterfactual cuts and complete method-portfolio audit. Transfer the *independent oracle and reverse/falsifier methodology*, not untyped solver code.
- V30 `feature/mpc-workspace-engineering-lab-v30`, `1749089a1666cfa47daf0d2b2a131d02f568cf54`, seven bounded native Engineering Lab methods received through the Windows Workspace. This is an operator interface and receipt system, not an intrinsic mathematical Crew improvement.
- `automation/mpc-reasoning-adaptive-two-stage-v15`, source `cb15df82c76063262caae3ab6e3e557cd00cf4b7`; exact finite backward induction to select a conditional second computation. Apply as a *design rule*: choose feasibility-first only on evidenced no-incumbent risk; preserve objective-first for easy residuals.
- `feature/solid-state-optimization-micro-router-20261010`, source `3f8ca18cc267ffb04d2699923633befe3191305d`, `lib/optimization-micro-router.mjs`, typed `TIMEOUT`, `INFEASIBLE`, `QUALITY`, `OBJECTIVE_MISMATCH` and readback-specific routes. The native method is a deterministic supplied-record method planner; the hosted MPC tool is not itself a FrontierOR integer optimizer.
- Research `MPC-ATOM-PROCESS-PROVENANCE.md` separates typed SOURCE, ATOM, METHOD, PROCESS, INVERSE, FALSIFIER, DECISION. Preserve this structure in benchmarking and method-on-method analysis.

**Method synthesis:** change the combinatorial representation → reconstitute exactly the original model's constraints → choose an algorithm **adaptively** based on actual failure mode → verify original-ID answer independently → preserve competing methods and native checkpoint → promote only with source-matched organizer result. The exact user-supplied private source/score remains unknown to this diagnostic.

## 4. Honest readiness

Last owner-supplied completed Dignity Main Testing score: **0.7909** (stale until new authenticated organizer result). The new CP-SAT rescue is a validated **candidate** for a precisely scoped degree-two, tightly side-coupled residual; it has not yet been wired into production `solve()`, tested under the full 2-vCPU/4GB/60s container, or evaluated on organizer private instances.

**Next test before integration:** run multiple high-coupling random fixtures of 240 and 480 rows against a routed two-stage budget, compare full original feasibility/objective, 60s wall-clock and missed-incumbent rate under 2 CPUs, 4 GiB. Seek a rescue for the unresolved 480-row/25-side case. Do not waste time regenerating submission ZIPs until a score-relevant promotion gate is justified.

**Preservation:** all prior Windows/MPC source branches, verified FrontierOR ZIP and frozen 17–18× cycle-inversion source remain untouched; this file is an additive research checkpoint.
