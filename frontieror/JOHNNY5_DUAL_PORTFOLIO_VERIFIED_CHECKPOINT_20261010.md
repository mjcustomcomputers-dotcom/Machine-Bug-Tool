# Johnny 5 — multi-objective forward planner: verified dual-engine result
Source frontier: frontieror-crew-dual-portfolio-20261010; exact workflow head c995309da7b798dd33dbd73f389482052d9b6d34.
CI https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38110994754 COMPLETE SUCCESS, 3/3 focused tests.
Frozen default and submitted solver unchanged. Dual method gated behind experimental_dual_portfolio=True. No new ZIP or organizer submission.

## Measured end-to-end generated Crew results, 25-second allowance
- 240 rows, 20 side rows seed7: default original-verified objective498 in 10.48123s. Dual original-verified objective498 in 21.00142s; MILP won with a native optimality receipt at 9.33947s. Dual did not lose validity.
- Seed31: dual original-verified 619 in 21.01599s, cycle_pulse won at 8.09654s; default no incumbent within 20.68852s.
- Seed43: dual original-verified 542 in 3.0655s, MILP with proof won at 0.82198s; default not compared in this run (previous reserve-test default missed).
- Seed59: dual original-verified 578 in 21.01211s, cycle_pulse won at 1.38107s; default not compared in this run (previous reserve-test default missed).
Result: 4/4 valid in measured dual branch. Across two recent controller tests the baseline had 1/4 valid; matched same-run baseline only seeds7 and31. This is not an official score.

## MPC method study cross-references
Method-as-classifier: every solver gives candidate plus source-verified evidence of which approach worked. Parallel race uses two complementary methods, parent independent verifier and bounded clock. Failure of either process never becomes a false infeasibility proof.
MPC FRAMEWORK_OPERATORS B (synthesis/pruning), C (proof obligation/refinement), D (state/invariants), E (adversarial perturbation). These are conceptual architecture declarations, not executed MPC solver methods.
MPC METHOD_HOOKS CEGAR and oracle delta debugging are research hooks, not hosted executable solvers.
Relevant external formal methodology: SATzilla per-instance portfolios, Xu/Hutter/Hoos/Leyton-Brown JAIR 2008 DOI 10.1613/JAIR.2490.
Challenge rules: 2vCPU 4GB no network; time 60s per instance; incomplete, invalid or timed-out scores zero; feasible objective ratio scores. https://frontieror-challenge.com/docs/main/scoring .

## Promotion gate and next action
STATUS: EXPERIMENTAL_PROMISING, NOT SUBMISSION_READY.
NEXT: optimize proof-complete early exit when native MILP worker returns verified 'proven', while preserving original verifier and case objective. Independently test 2vCPU/4GB total envelope with resource-constrained sandbox. Add randomized held-out seeds and repeat ABBA before updating default dispatch; score requires private organizer run.
DO NOT REPEAT: legacy 14 unsat-core serial loop or 5.8s serial rescue; both falsified by seed7 regression.
