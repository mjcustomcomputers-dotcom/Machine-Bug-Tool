# FrontierOR — score to 1.0: source-first Atlas router and falsifier audit

**Record date:** 2026-10-10 CDT / 2026-10-11 UTC.
**Source baseline:** frozen tested exact-cycle commit `05df8ff9c10b898d7c1832217f504e9c53c91089`.
**Snapshot branch:** `frontieror-snapshot-inverse-cycle-20261010`; snapshot file `frontieror/SNAPSHOT_CYCLE_INVERSION_PROVEN_20261010.md` (independent of exploratory tests here).
**This exploratory branch:** `frontieror-crew-score-floor-recon-20261010`.
**Published score framework:** https://frontieror-challenge.com/docs/main/scoring
**Submission/runtime framework:** https://frontieror-challenge.com/docs/main/submission-format
**Scope:** objective and feasibility reconnaissance; NO solver source change, ZIP, new organizer submission, or official score claim.

## Verified scoreboard control point

Owner-supplied *last completed* Dignity Main Testing: overall `0.7909`. Reported per-problem mean scores: `barnhart2000` flow=1.0000, `cordeau2006` DARP=0.9862, `fischetti1998` Orienteering=0.7702, `hoffman1993` Crew=0.2463, `bodur2017` stochastic facility=0.8753, `nagy2015` VRPDDP=0.8676. Values are rounded from the owner's previous organizer result and could be stale; they are **not** a fresh organizer readback.

Under official equal weighting, arithmetic mean is 0.790933..., consistent with the owner's 0.7909. Target uplift to 1.0000 is 0.2090667. If other problem scores remain fixed, improving Crew from 0.2463 to 1.0 yields only 0.91655 overall. To reach ~1.0 without a >1 category, also improve Orienteering (+0.03830 overall to its 1.0), VRPDDP (+0.0220667), facility (+0.0207833), DARP (+0.00230); Crew gain to 1.0 is +0.125617. Score per instance can exceed 1.0 (max 2.0). Thus improvement tradeoffs must be verified by the organizer; synthetic objective gains have no direct known translation.

Important official scoring fact: every private instance contributes equally within its problem, all 6 problems weighted equally; **unfinished, invalid, infeasible, or limit-killed cases score zero even if the solver wrote an incumbent but did not exit**. See primary scoring docs.

## NEW target fault-line: residual shape gate versus real feasibility

Source condition in `solve.py`: early `large_sparse_cover` is disabled if `side_work=len(d)*effective_cols>24000`. Early CP/MILP feasibility probes are enabled only when `effective_rows>2500` or `effective_cols>14000/10000`. A 15k-input with residual 460×644 and 100 side rows enters neither early path; it does enter modest-core objective MILP. This is a risk to inspect, not proof that the private fifth instance has this exact shape.

Controlled generated fixture (`frontieror/tests/test_crew_score_floor_probe.py`) with `m=15000,n=15000,q=100,seed=3`, full original feasibility checked. GitHub Actions diagnostic source run https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38105654821 PASS, no packaging:

- Full original shape 15,000 rows × 15,000 cols; exact queue reduction to **460 residual rows / 644 active cols**; residual side-work **64,400** (greater than the MRV dispatch cap 24,000).
- **Forced cheap MRV** 1.97627 s, **no verified incumbent**.
- **Feasibility-only native SciPy MILP** 0.33592 s, original-verified objective **120,530**.
- **Objective-first native SciPy MILP** 0.07113 s, original-verified objective **119,876** (strictly better, faster in the single controlled run).
- Since the cheap MRV failed and the objective MILP already wins, **do not widen the MRV gate or add a cost-blind preflight based on this evidence**. The private zero remains unexplained without organizer-relevant evidence.
- These are single measured executions on a synthetic known-feasible generated fixture, not an A/B distribution, private-instance replay or hidden score estimate. Test log and exact fixture generator/source provide native reproduction.

## Atlas method scrub / reverse cross-reference

Read MPC UMTB4 universal contract and method layers. Source link roles: GitHub source/commit = authoritative implementation; GitHub CI = executed local evidence; MPC Method Ark and classifiers = analytical method descriptions, not a substitute for data or execution. Cross-referenced method `REDUCTION_METHODS:8` graph, `:9` impossibility/evidence lower bound, `:10` information gain/request minimization, `FRAMEWORK_OPERATORS:11` redundancy, `:13` uncertainty preservation, `:14` composition, `:15` anti-overfitting, and Atlas inversion REMOVE/SUBSTITUTE/INVERT/PERTURB/PROJECT/INVARIANT/MIRROR observed-counterfactual.

Cross-reference classifier IDs from the hosted registry: `BL21.04` underlying object/value mismatch (synthetic vs private scoring), `BL21.11` failed intermediate state may finalize (no verified incumbent), `BL24.05` stale/incompatible state (improving synthetic version but using a different official scored ZIP). They are **domain analogies**, not executable optimization methods or proven semantic equivalents. Registry fingerprint `436fe6b88f5b9202e85e52b8d6320f2fec3df88a5baa40d0b1110c2d90abf7f2` at query time. MPC canonical registry not changed.

## Operational answer / readiness gates

- **Ready to retain the new exact cycle mathematical method**: YES. Frozen source and 12 focused methods passed, 17.682x vs legacy MILP on one constructed 2k-row case (18.551x in prior independent source-matched run). Full exact original verification on tested class.
- **Ready to claim official score near 1.0**: NO. No official scored result or coverage evidence for the hidden Crew zero, and even a Crew score of exactly 1 with other categories unchanged would give only ~0.91655 overall.
- **Ready to promote newest source into a Main six-solver archive**: NOT YET, by owner's explicit no-ZIP directive and because only focused source CI was run after adding cycle factorization.
- **Highest expected score-value targets**: (1) reproduce Crew no-feasible/timeout mechanism using organizer-authorized public shape and controlled stress; (2) objective improvements in Orienteering; (3) objective improvements in VRPDDP and facility; (4) make a separately gated six-solver candidate and submit when owner chooses. Preserve existing previous best completed score and known-good archive until organizer proves a higher score.
- Scrub method `CHANGE THE PROBLEM ITSELF`: forward exact-equivalence transformation, inverse counterexample, original-oracle reconstruction, class-specific routing and rollback. This method is proposed/additive in the snapshot, NOT silently installed into hosted MPC canon.

**Next native pass:** design mixed generated Crew instances where reduced objective MILP gives no incumbent within 60 s, and test effective feasibility-rescue alternatives on exactly those, tracking objective and pass/fail; avoid optimization that only speeds already easy instances. Do not confuse code speed with private score.
