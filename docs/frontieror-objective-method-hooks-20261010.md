# FrontierOR objective-method hooks — source-bound pass 2026-10-10

## Control target and evidence separation
- Official observed V5: total 0.7909; per problem [DARP .9862, OP .7702, ODIMCF 1.0000, SPP .2463, SCFLP .8753, VRPDDP .8676].
- Desired planning target 1.5000 is not a predicted score. Competition reference 1.0000 remains a distinct metric. Per-problem averages cannot establish instance-level 1.5 feasibility.
- Candidate results must keep instance fingerprint, objective direction, exact independent feasibility and cost checker, time/memory/JSON gates, source SHA, and official result when available.
- Existing router now supports optional target_score 0..2, default 1.5, while preserving reference_gap to 1.0.

## Objective-method hooks by native solver and exact trigger
1. **SPP / hoffman1993** (V6 code SHA a9ac149138becb28c015f4c8978694a021e1fea8): `forced_greedy`, `cp_sat`, `sparse_milp`. First restore the private large_instance_5 feasible exact cover; then seek strictly lower total selected-column costs. CP-SAT currently casts costs with `int(round(costs[j]))`; inspect for loss of fractional objective fidelity before objective-driven use. Safe method hook: scale rational prices conservatively (when input precision permits) or run the exact floating MILP objective; independently calculate original float objective for every candidate, never treat a rounded CP objective as authoritative. Test a fixture with equal rounded costs but different true costs, and a planted difficult cover with side constraints.
2. **OP / fischetti1998** (SHA 6e6e329ff8388f5df78c315528f185e361c67fbb): `multistart`, `exact_dp`, `beam_construct`, `local_neighborhood`, `cp_sat_circuit`. Maximize collected prize under travel budget; add target-driven route insertion and regret/ruin-recreate neighborhoods chosen by marginal prize gain per added tour cost, constrained by `p.cost(route)<=p.limit`. Check prize recomputation, route uniqueness and return-to-depot; compare same instance.
3. **ODIMCF / barnhart2000** (SHA 4524ddfb22ed11b98c7620d4d6d77a13ae8122de): `route_paths`, `greedy`, `optimize`. Minimize total cost including rejection/artificial-arc penalty. Extend path generation only when a cheaper residual-capacity feasible path or alternative allocation can reduce verified original objective. Hook inverse-capacity price perturbation and reoptimize a subset of commodities; preserve arc residuals and identical commodity identity. Guard artificial-arc fallback: absence of a real path must never create a fabricated cheap flow.
4. **SCFLP / bodur2017**: use the hash-bound exact positive-cost idle facility elimination from V5 as a first operator; follow with scenario-weighted opening swaps and recourse reassignment only when all demand/capacity constraints remain satisfied and the verified expected cost decreases. Synthetic benchmark improvements are not private-score predictions.
5. **VRPDDP / nagy2015**: preserve backhaul-to-linehaul phase prohibition; target objective improvement via feasible phase-aware relocation, pair swaps, and destroy/repair on high-cost route segments. Verify every route's stage, load, and complete customer service; avoid globally unconstrained 2-opt.
6. **DARP / cordeau2006**: objective reduction from route elimination, paired pickup/drop-off relocation, regret insertion and cross-vehicle exchange, subject to paired precedence, ride-time, capacity and time-window constraints. Use strict feasible incumbent protection and original distance objective.

## Objective hook cross-method sequencing
A. Fault atom -> published objective coefficients -> route correct solver method -> feasible incumbent -> exact objective oracle.
B. Identify contribution hotspots: selected columns (SPP), low prize/cost insertion edges (OP), rejection penalties (ODIMCF), positive idle opening cost (SCFLP), high route detours (VRPDDP/DARP).
C. One changed coordinate per micro-pass; run forward candidate and inverse/ablation against same input. Keep best independently feasible objective.
D. Pursue bounds: LP relaxation for MIN lower bounds and MAX upper bounds; if a valid bound excludes 1.5 vs known instance reference, quarantine target for that instance. Organizer private reference objectives remain unknown unless explicitly supplied.
E. Resource and release gate: 60-second external limit requires clean exit and validated output before cutoff; 4 GiB and 16 MiB output limit; do not promote planner-only results as official score.

## Verified phase and next action
This file records source inspection and specific computational hypotheses. No objective improvement is claimed here. Run V6 crew exact-cover adversarial fixtures after the CP-SAT objective-precision falsifier, then measure objective/time/feasibility against identical source-pinned inputs. Use the isolated FrontierOR branch for solver modifications; preserve MPC canonical main and draft PR until independently reviewed.
