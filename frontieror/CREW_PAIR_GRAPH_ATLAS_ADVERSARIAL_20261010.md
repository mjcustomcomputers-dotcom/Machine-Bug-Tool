# FrontierOR Crew — pair-graph conservation adversarial Atlas pass

**Native source:** GitHub branch `frontieror-crew-pair-potential-recon-20261010`.
**Parent commit:** `f3002c773323dbf6c29b0c3fc12d15c88a73d873` (singletons-only exact conservation, 3.039x on its specific fixture).
**Final tested source commit:** `6bb7abf7c94c137339f6b99e4278c7fdb3775902`
**Final solve.py Git blob:** `e695bcbf2b542444370c9bc24b442911580e4a11`.
**Focused final micro-CI:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38104516967 (SUCCESS).
**Older pure Python pair proof CI:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38104244452
**Vectorized CI:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38104307990
**Final source/tests:** `frontieror/solvers/hoffman1993/solve.py`, `frontieror/tests/test_crew_pair_potentials.py`, `frontieror/tests/bench_crew_pair_potentials.py`.
**Build scope:** focused Python 3.12 + NumPy/SciPy, original-model oracle. **No ZIP, no organizer submission, no six-problem or Docker check.**

## Cross-direction Atlas hook and proof

MPC UMTB-4 contract read before method activation. Relevant Method Ark lenses: Graph/Network/Shah-style (branch 8); conservation; counterexample-guided refinement, 31/32 controlled swaps, PERTURB and REMOVE/ABLATE. MPC atomic review generated bounded TEST-ONLY perturb-edge and remove-basis variants; those do not constitute authenticated GitHub test results or change native source.

**Upstream:** Original exact-cover incidence -> duplicate/forced rotations -> residual pair-only graph.
**Downstream:** Row-activity conservation certificates -> omit proven redundant side inequalities in SciPy MILP/HiGHS -> independent verification and objective certificate -> organizer scoring still unknown.
**Left / control:** Existing singletons-based vector conservation at `f300...`; it abstains when some flights have no singleton alternative.
**Right / inverse:** Pair-only graph where every nonempty active rotation covers exactly two distinct flights. Each edge requires `t[u]+t[v]=2*b[edge]` with `t=2*u`. Graph traversal determines affine row-potential signs and offsets. Odd cycles pin the free gauge. Even/bipartite components must have equal sign partitions for the total to be independent of its gauge. Optional empty columns must have zero side effect. Only exact integer coefficients with conservative bounded arithmetic may generate a certificate. Inconsistent cycles, unsafe magnitudes or outside original bounds -> UNKNOWN, return to original MILP.
**Adversary:** Perturb one edge coefficient; reorder columns; flip signed potentials; add optional negative-cost zero-cover rotation; use near-integer coefficient; impose impossible fixed bound; oversized integer; or create imbalanced bipartite graph. All preserve original solver validation.

The first correct Python per-side graph implementation performed worse (220 rows, 65 side rows: 0.01416s baseline vs 0.018485s transformed; negative control 0.01361s vs 0.02197s). Array-batched graph computation solved the overhead: 220-row conserved fixture 0.01434s baseline vs 0.005965s new, **2.404x** on that run, exact objective 275. Counterexample-driven early exit returns when no candidate side row survives; it does not alter proof semantics. The final method router bypasses pair-conservation preprocessing when residual `len(active)*len(d)<8000`, based on comparisons of small and larger side workloads.

## Measured final A/B fault matrix (GitHub Actions 38104516967)

Synthetic warm-optimizer, same-instance ABBA; source after router change, no official score.

| Graph rows | Side rows | Structural state | Literal median | Candidate median | Ratio old/new | Objective |
|---:|---:|---|---:|---:|---:|---:|
| 60 | 8 | conserved | 0.001435 s | 0.001390 s | 1.032x | 75 |
| 60 | 8 | one corrupted pair | 0.001350 s | 0.001365 s | 0.989x | 75 |
| 220 | 8 | conserved | 0.002570 s | 0.002580 s | 0.996x | 275 |
| 220 | 8 | one corrupted pair | 0.002615 s | 0.002610 s | 1.002x | 275 |
| 220 | 65 | conserved (65/65) | 0.007690 s | 0.003515 s | **2.188x** | 275 |
| 220 | 65 | one corrupted pair (0/65) | 0.013070 s | 0.008325 s | 1.570x | 275 |
| 600 | 65 | conserved (65/65) | 0.019720 s | 0.007870 s | **2.506x** | 750 |
| 600 | 65 | one corrupted pair (0/65) | 0.019335 s | 0.020815 s | **0.929x** | 750 |

Original-model objective is unchanged within each treatment pair. No source-declared score increase, no aggregator multiplication of these ratios, no private instances.

Final focused CI **8/8 test methods PASS**, including 200 seeded graph and cost metamorphs compared to brute-force objective and all complete original-side constraints where applicable. All 8 A/B fixture groups completed with equal original objective.

## Next adversarial fault / priority

1. Investigate why the 600-row corrupted-side case still costs ~7.7% overhead. Search for cheaper *necessary* cycle-consistency rejection and stronger method dispatch; do not assume every conserved-looking graph is useful. Reject first, then prove only where a cheap signal exists. Test mixed pairs, row-degree skew, connected and disconnected graph, large side count, numerical edge bounds.
2. Promote only after cross-source benchmark and organizer score: no full 60-second/4GiB or hidden fixture coverage was measured here. Preserve last official completed score 0.7909 and earlier ZIPs; source changes stay isolated.
3. Potential extension: row-span conservation of general 3+ column hypergraphs, only with exact rational or integer proof and measured budget gain.

This checkpoint follows MPC original-source precedence: current GitHub native commit and CI are authoritative; chat handoff and Atlas labels are navigation, not proof of execution.
