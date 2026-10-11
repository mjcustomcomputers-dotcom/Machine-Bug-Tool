# FrontierOR Crew — conservation-law microdiagnostic / no packaging

Date: 2026-10-10 CDT / 2026-10-11 UTC.
Parent native source commit: `41f75b11e47d4d4503c1a5ef83502adaedb5f667`
Development branch: `frontieror-crew-conservation-recon-20261010`
Latest tested code: `ea00eb627bf0cabd8245084e2d7c89c1af198056`
GitHub source path: `frontieror/solvers/hoffman1993/solve.py`
Test: `frontieror/tests/test_crew_conservation.py`
Benchmark: `frontieror/tests/bench_crew_conservation.py`
Complete focused CI: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38103934460 (SUCCESS)
No six-solver test or Docker battery, no ZIP, no organizer submission.

## New exact mathematical hook

For a side row b, if all uncovered flight rows have at least one active singleton rotation, all alternatives agree on an exact integer row potential u_r, and every active rotation j has b_j == sum(u_r for r in rotation_j), the total side activity on any exact cover equals sum(u_r) plus forced-rotation effects. Optional empty rotations must have side coefficient zero. If this value satisfies original bounds the side row is provably redundant. The code uses strict binary64 exactly representable integers and guards magnitude, rather than approximate linear dependence. This classifier adds a new type of structural conservation to the existing duplicate/inverse and envelope reductions.

## Fault isolation changed the architecture choice

The first Python-level detector was MATHEMATICALLY SOUND on four directed/randomized test methods (including 100 seeded metamorphic cases) but computationally inferior:
- Conservative tight-side case: old 0.02397s, naive detector 0.05266s.
- Corrupted-side negative control: old 0.03677s, naive 0.07850s.
- Exact conservation proof with an idealized no-cost detector: old 0.017615s, ideal removal 0.002945s on a second controlled ABBA run. This isolated detection overhead as the main problem and demonstrated the hypothetical optimization headroom; it is NOT an achieved runtime.

Latest vectorized NumPy implementation, focused CI 38103934460: **4 test methods passed**. Same 240-row/361-column/80-side-row synthetic ABBA:
- Conservation case: 80/80 side rows proven fixed; old median 0.016835s, new median 0.005540s, **3.039x faster** (67.1% less solve time), both objective 357, both original-model verified and solver certificate.
- Corrupted-pair negative control: no rows certified; old median 0.02914s, new median 0.03265s, **0.892x** speed ratio (~12.0% overhead), both objective 2037 and certified.
- Ideal proven-removal reference 0.002655s further separates potential remaining detection overhead.

The positive/negative cases are controlled small synthetic solve-phase timing, not end-to-end contest runtime or hidden private objective. Limited 2-run medians and different execution timestamps prevent general performance claims.

## Scope and next decisive hook

The method only applies when every residual flight has a singleton alternative with consistent integer side effects. It is a pure structural shortcut for this subclass. Large private Crew model may lack singleton alternatives and this hook might never trigger.

Priority is **structural dispatch to avoid side-data scans when no useful conservation is possible**, then generalizing the exact potential identity to pair-only or mixed hypergraph systems without singletons if exact/certified decomposition is computationally profitable. Measure including preprocessing + native search on larger mixed-instance distributions and preserve 60 s/4 GiB envelope only when a real candidate is ready.

Keep original `frontieror-mpc-atomic-side-compression-20261010` branch, its 98-test pass and prior ZIP intact. Do NOT bundle or publish a competition ZIP as part of this problem-finding pass.
