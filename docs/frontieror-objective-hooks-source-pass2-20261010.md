# Verified source inspection — objective hooks PASS 2 (2026-10-10)

## Proven code observations
- **SPP** `frontieror/solvers/hoffman1993/solve.py` SHA `a9ac149138becb28c015f4c8978694a021e1fea8`: `cp_sat` exits immediately whenever `p[5]` (base side constraints) is nonempty; otherwise sets `add_exactly_one` per coverage row; objective uses `int(round(costs[j]))`; `sparse_milp` uses original floating costs and full base constraints; `solve` raises at line 214 when no independently verified candidate. This is a potential structural explanation for private instance exit, not proof that private instance has base side constraints. Fractional-rounding sensitivity is **conditional**: comment says official cost vector is integral. First inspect input specification and test adversarial fixture; do not assert objective bug unless nonintegral costs are allowed.
- **ODIMCF** `frontieror/solvers/barnhart2000/solve.py` SHA `4524ddfb22ed11b98c7620d4d6d77a13ae8122de`: line 165 caps candidate paths at ten per commodity; CP-SAT optimizes only enumerated paths (lines 116–156). This is a strict restricted-master candidate set, so a globally better path not enumerated cannot be selected. Next hook: price residual capacity, generate alternative feasible path candidates, augment path pool under a bounded cap, and re-solve. Any claimed objective improvement requires same-instance true objective recomputation and independent capacity check. Zero objective with nonnegative arc and rejection costs is a rigorous global lower bound; preserve line 170–175 early exit.
- **OP** `frontieror/solvers/fischetti1998/solve.py` SHA `6e6e329ff8388f5df78c315528f185e361c67fbb`: CP-SAT has deliberate <=55-city threshold; portfolio uses fixed budget fractions (12%, 37%, 35%, 47%, 81% phases), then one `local_neighborhood`. Next hook: compare dynamic allocation based on node count, budget tightness, prize distribution, time-to-first feasible and objective improvement. For large size use bounded destroy/repair and route insertion; validate unique cities, tour budget, depot return, objective.

## Falsification matrix: evidence before promotion
SPP-A: real-base-bounds constructed fixture with a planted exact cover, compare greedy+MILP versus a full-feasibility model with side constraints; verify every coverage row and base bound. SPP-B: fractional-cost fixture distinguishes true and rounded rankings, but first establish whether fractional costs are permitted by published spec. SPP-C: two independent feasible covers, assess exact original objective and cutoff sensitivity.
ODIMCF-A: graph where the cheapest globally feasible allocation requires a path missing from top-10 set, compare augmented pool to baseline. ODIMCF-B: saturating shared bottleneck requiring resource-aware path choices. ODIMCF-C: certified zero objective should skip search.
OP-A: >55 city prize clusters and tight travel budget to test adaptive destroy/repair. OP-B: <=55 paired portfolio vs CP-SAT controlled run, hold input fixed and measure real objective, time, memory. OP-C: concentrated versus uniform prize distributions with fixed seed.
Use independent oracle for all; do not infer official score from local fixtures.

## Model-routing hooks
Existing MPC planner's target_score defaults to 1.5, separately preserving reference_gap versus 1.0. Add method routing only for triggered structures:
- side_constrained_exact_cover -> FEASIBILITY_FIRST_FULL_BASE -> VERIFIED_INCUMBENT -> FLOAT_OBJECTIVE_OPT;
- path_pool_restricted -> RESIDUAL_DUAL_PRICE -> COLUMN_AUGMENT -> VERIFIED_GLOBAL_COST;
- prize_budget_route -> BUDGET_PRIZE_PROFILE -> ADAPTIVE_PORTFOLIO -> BOUNDED_DESTROY_REPAIR.
State: SOURCE_INSPECTED; TARGET_TESTS_NOT_YET_EXECUTED; OFFICIAL_SCORE_UNCHANGED.
