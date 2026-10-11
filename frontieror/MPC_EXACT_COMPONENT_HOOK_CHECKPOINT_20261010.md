# FrontierOR SPP — MPC exact residual component hook, verified but isolated

**Source and artifact date:** 2026-10-10 CDT / 2026-10-11 UTC
**Parent/native source:** `d452cdc25d765a830bfaf6d1b2edd06776db4926` (`frontieror-crew-side-activity-20261010`)
**Candidate branch:** `frontieror-mpc-exact-components-20261010`
**Verified CI commit:** `8de10d76cadc23f5ab2ffdadb40df41c1e0c97ce`
**Archive publication commit:** `962e78dbf16d2d661ab2feb5f11d3456d1f97654`
**Final verification run:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38102342662
**Artifact with ZIP, manifest and benchmarks:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38102342662/artifacts/11688461209
**Archive:** `frontieror/downloads/FrontierOR-Main.zip`
**Archive size:** 61,029 bytes
**ZIP SHA-256:** `9ac8092fd730e7b1cd843c1ff434f0d65378ae78839114ac0bd366bd679445d4`
**Crew solve.py SHA-256:** `70e01ba036f149ef4c4bd171a2d7d08b8a1dfc0c90c6a9df638d48fff5cca1a0`

## Source delta and MPC methods

- MPC universal contract UMTB-4 read first, native GitHub source used as owner. MPC route_problem reviewed coverage-side dependency and recovery; method Ark graph reduction / controlled ablation; atomic `REMOVE / ABLATE` variant used to falsify coverage-only decomposition (test-only variant, not an official algorithm proof). `refine_counterexample` generated a scoped candidate guard against ignoring nonredundant side inequalities. No canonical MPC framework, classifiers or registries changed.
- Added `exact_residual_components(p, deadline, reduction)`: union-find components of surviving exact-cover rows; only enter when every nonredundant original side inequality has zero active effect and its forced-column constant satisfies the bound. Optional negative-cost empty rotations remain eligible. Each disconnected coverage block is solved via finite, memoized exact-cover dynamic programming on row masks with a bounded state/time budget.
- Parent worker protocol supports `components` with a checked `proven` certificate. Original full solver and `verify(p, selected)` preserved for inapplicable, timed-out, connected and side-coupled residuals.
- Positive inverse on scheduling order: union-find component discovery before expensive side redundancy scans; do not pay for a side analysis when coverage itself is connected. A residual-size dispatch guard (`effective_rows>=240`, `effective_cols>=400`) avoids launching the component worker for small models.
- Added four tests including adversarial active cross-component side row, independent signed-cost brute-force optimum, negative-cost empty rotation and objective-preserving 400-row dispatch. Existing source architecture and the other five solvers were not modified.

## Native execution receipts

Final run passed **92/92 unit tests**, all six synthetic objective comparisons, all **12/12** constrained Docker smoke/stress cases, and six-problem twelve-file ZIP source readback; Python 3.12, 2 vCPU, 4 GiB, offline, read-only solver container.

Same-instance ABBA, 1,200 original rows, 1,801 columns, 100 loose side rows, exact original objective 1,799:
- Full SciPy reduced MILP median: **0.077160 s**
- Exact component DP median: **0.074025 s**
- Relative solve-phase speed ratio: **1.042x** (about 4.1% faster)
- Both produced cost 1,799 and passed original feasibility; DP additionally returned a component optimality certificate.
- This is controlled **synthetic solve-phase time**, not complete end-to-end timing or organizer private score. An earlier pre-router run reported 1.064x; use the final source-matched result here.

**Resource caveat / regression gate:** the final Crew Docker smoke and stress cases took ~0.185s and ~0.313s. In a prior side-only baseline run they took ~0.131s and ~0.217s. Runner and timing variation may explain some or all of this difference. There is no repeated same-run A/B proving that end-to-end performance improves across case types. Therefore the exact-component candidate is preserved but should NOT replace the last best official-scoring submission without organizer score evidence.

**Official score:** no organizer submission carried out. User-provided best completed Dignity Main Testing score is 0.7909, not raised by this local work.

## Next bounded objective-frontier work

Priority: test exact factorization after separating and assigning nonredundant side rows to individual components, allowing the case where side bounds are local rather than all globally redundant. Use a component/side hypergraph, handle variable-free rows and negative empty columns, and preserve exact reconstructed original constraint verification. Compare end-to-end same-source runtimes and private Crew score if the owner chooses to submit. Do not spend time adding duplicate caches or renaming the competition archive.
