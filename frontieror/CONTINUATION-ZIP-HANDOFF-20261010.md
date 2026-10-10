# FrontierOR Main — Copy/paste continuation and ZIP handoff (2026-10-10)

## Explicit mission
Continue optimizing **all six** Python 3.12 FrontierOR Main solvers, aiming for 1.5000 overall and where feasible per problem. 1.5000 is a target, NOT an achieved score. Do not build or upload a ZIP before source-pinned regression/official-format verification and user authorization. Preserve all existing MPC source, architecture, classifiers, versions, and protected benchmark variants. Make forward delta-only changes.

## Official organizer baseline (provided from dashboard)
Submission 0a93d9dd, 2026-10-10 21:15 UTC, completed overall 0.7909.
- cordeau2006 DARP 0.9862
- fischetti1998 Orienteering 0.7702
- barnhart2000 ODIMCF 1.0000
- hoffman1993 Crew 0.2463, private large_instance_5 exit code 1
- bodur2017 SCFLP 0.8753
- nagy2015 VRPDDP 0.8676
Each has its own independent original feasibility/output constraints; public instances are gates, private instances determine score. Distinguish objective improvement from speed, synthetic benchmarks from official evaluation, and target from reference 1.0.

## Native GitHub pointers
Repository: mjcustomcomputers-dotcom/Machine-Bug-Tool
Isolated solver branch: frontieror-v6-feasible-cover-validation-20261010
Six solver files: frontieror/solvers/{cordeau2006,fischetti1998,barnhart2000,hoffman1993,bodur2017,nagy2015}/solve.py
Tests: frontieror/tests/
Build: frontieror/build_submission.py
Crew CI: .github/workflows/frontieror-v6-crew.yml
Additive MPC router: draft PR #33, branch feature/solid-state-optimization-micro-router-20261010; objective planner target default changed to 1.5 with reference 1.0 preserved. Hosted MPC does not automatically deploy GitHub sources.
Previously saved objective hooks: docs/frontieror-objective-method-hooks-20261010.md and docs/frontieror-objective-hooks-source-pass2-20261010.md on MPC PR branch.

## Crew completed micro-deltas
- Incremental base-constraint total cached per search path (instead of re-summing path for every child). Signed-coefficient upper-bound pruning guard.
- Cost sign hoisted, static candidate sorting keys cached, redundant selected-set copied state eliminated.
- New local integer bitmask eligibility and uncovered-row scans in bounded greedy DFS. Built-in independent verify() preserved.
- Modified crew solver commit af43d63b95dfd575b4dc983c73eaf24e444bd2b4.
- New equivalence benchmark frontieror/tests/bench_crew_bitsets.py; source commit bf874e6687b579defcb93d4f4e1ce310e63b6ee3.
- Crew workflow now runs regression, base-cache and bitset benches, head commit b400bdbea1d8d4a310ce2a02dd1e1dc2a49ada0f.
- Verified prior GitHub Actions run 38088417376 (commit 51c1b80c): 6 crew tests pass. Cache-screen microbenchmark: 118.548058 ms vs 12.056801 ms over 12,000 isolated comparisons, 89.8296% isolated reduction, equal decisions. Not full solver speedup, not evidence of 1.5 score.
- New bitmask patch has no completed CI receipt as of this handoff; check workflow status before promoting or reporting percentages. Any failure -> fix / revert exact patch; do not mask test failures.

## Transfer methods across other solvers — source-inspected adaptation map
Do NOT duplicate crew-specific set-cover operations in unrelated optimization models.
- cordeau2006 DARP: already precomputes dense Euclidean distance matrix in _problem; focus on reuse cached route costs or insertion marginal delta in _try_best_pair / _solid_improve, avoiding whole-route schedule recomputation only with exact route-feasibility oracle. Pair precedence/ride-time/time windows and capacity always checked.
- nagy2015 VRPDDP: score() and routecost() re-sum route arcs; explore delta scoring during 2-opt / relocation and local affected-route updates, preserving delivery-before-pickup phase constraint, load, completeness.
- bodur2017 SCFLP: shipping tensor dominates memory and serialization; retain sparse output and exact positive-cost unused facility reduction. Memoize equivalent scenario allocations or avoid unnecessary scenario copies only if all scenario probabilities and recourse constraints preserved.
- fischetti1998 OP: check fixed-budget redundant route-cost recomputes in beam_construct / local_neighborhood; incremental tour-edge deltas and memoization can accelerate marginal prize search. Preserve budget/depot/uniqueness and prize exact verification.
- barnhart2000 ODIMCF: improve capped top-10 path generation with residual resource-price candidate enrichment; native graph paths, arc capacities and artificial rejection cost independently recomputed. Avoid any external service/network transfer at solver runtime.
- hoffman1993 SPP: next target MRV pivot repeated scanning and base-constrained feasibility-first solver. CP-SAT currently skips cases where p[5] has side constraints; sparse MILP preserves literal real base bounds. Never infer private instance specifics.

## Execution and measurement contract
Run 1–3 source-bounded microchanges at a time, compare original vs changed identical synthetic instances, and measure end-to-end runtime, solution objective, peak memory, output bytes, validity and hard-deadline exit under Python 3.12, two CPU cores, 4 GiB and <=16MiB JSON. Preserve best existing feasible incumbent and exact source SHAs. Independent oracle first; no objective regression. If public checker reachable, test there before proposing final ZIP.
Expected next actions:
1. Read newest native GitHub CI run for branch and logs; confirm bitset equivalence and six crew regressions.
2. Run end-to-end original-vs-new Crew benchmark with matched inputs and seeds, not solely microcheck percentages.
3. Implement one well-grounded cross-solver improvement (likely VRPDDP affected-route delta scoring), compare matched instances and CI.
4. Consolidate six SHA-pinned solve.py files and final build script for later handoff; do NOT create/submit ZIP until pass gates and user instruction.
Use this document as navigation pointer; native source commits, official dashboard result and action logs outrank chat text.

## Major cross-solver audit delta — dense facility output regression
The V6 `bodur2017/solve.py` previously emitted a full f × c × s dense output map, even though a much earlier organizer-confirmed facility fix depended on sparse output. In shape 120×300×1200, the dense indexing enumerates 43,200,000 potential flow entries and risks the organizer 16-MB solution limit. Sparse nonzero JSON repair commit `737edc43`; independent checker reconstructs missing zeros plus sparse test in `test_facility.py` commit `2de80376`; CI workflow cross-suite commit `db0bda87`, run 38088752602. Validate CI result after completion, then organizer public JSON. Do not treat source-level feasibility or the earlier V5 official score as a new V6 official result. This is a score-protection / no-regression change, not an objective-quality gain. Audit every solver for other resource-limit regressions before ZIP.

## Objective improvement PASS — LP-backed opening neighborhood (October 10)
Added `improve_openings_lp` to `bodur2017/solve.py` on isolated V6 branch, commit 682dc9b3. This reopens the first-stage decisions after LP shipping optimization, searching removal and one-for-one swap configurations with independently feasible scenario LP recourse; measured comparison always uses original expected total objective (opening + probability-weighted shipment). It is bounded to f<=14, c<=100, scenarios<=36 and a limited 3-second slice; larger instances retain existing solver path. Regression fixture in test_facility.py commit f627162f tests strict objective improvement vs all-open baseline. GitHub CI run 38088929537 triggered; read its final logs before claiming test pass or objective percentage. This is a true objective method, not an official score claim. Keep separate reference at 1.0 and stretch target 1.5; no ZIP yet.

## 2026-10-10 Crew major integration fault line
The existing `frontieror/v6/verify_cp_side.py` contained a tested 2,000-row base-constrained CP-SAT feasibility path but actual `frontieror/solvers/hoffman1993/solve.py` never invoked it. GitHub source commit `97f25860` embedded its existing model into actual solver and triggers a max-12s side-constrained feasibility rescue when initial greedy incumbent is absent. Full MILP optimization remains afterward; `verify()` independently checks exact cover/base windows. Regression commit `0e4d4bc5` checks recovery when greedy and MILP intentionally unavailable and rejection of impossible base constraints. Check the latest branch GitHub Actions run and logs before saying tests passed. Official crew problem 0.2463, private large_instance_5 code 1 from official V5; do not claim same unknown private instance fixed without evaluation. The 1.5 score is target only.
