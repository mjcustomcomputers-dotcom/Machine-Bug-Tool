# Johnny 5 | Methods on Methods | Concurrent Goals and Future-Aware Dispatch
Date: 2026-10-10 CDT (2026-10-11 UTC)
Original solver source: frontieror/solvers/hoffman1993/solve.py
Research source branch: frontieror-crew-dual-proof-exit-20261010
Resource verification branch: frontieror-crew-dual-resource-gate-20261010

## Exact technical objective
Every costly method should produce multiple *usable* outputs when possible:
1. A directly original-verified feasible candidate or optimality certificate.
2. A side-channel classifier observation: winner, elapsed time, core confidence, failure/unknown, and benefit of continued search.
3. A bounded downstream decision: stop (proven optimum), continue quality, release a false hypothesis, or fall back.
Do not conflate method labels with implementation. Compound modes are additive and opt-in. Original solver architecture, checkpoint identities and submission ZIPs are frozen.

## Instrumented algorithm portfolio
- Child A: cycle exact reduction + LP observational pulse + core sentinel + CP-SAT search.
- Child B: native sparse MILP, capable of valid feasible schedule plus solver-owned optimality certificate.
- Parent: one shared deadline and source-independent full model verifier; retains first verified witness, terminates other child, and never promotes UNKNOWN/timeout to original infeasibility.
- If native MILP is proven optimal, parent may end full solve() immediately. Otherwise original solve() can continue improving the candidate.
- Structural gate caps active columns, side matrix, nonzeros and two-process race budget. Not a general-purpose switch for arbitrary Crew subclasses.
- Test negative conflict instances, worker interruption/failure, native resource budgets, cold/warm order, and correctness adversaries before promotion.
- Observe hidden final competition score only through authorized organizer evaluation. No inferred private-instance score.

## Native measurements
Complete initial dual CI: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38110994754
Verified four generated 240-row cases seed7 objective498, seed31 objective619, seed43 objective542, seed59 objective578. Per-method winning engines MILP / cycle / MILP / cycle. Tests 3/3.
Proof-aware CI: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38111193250 complete SUCCESS, 3/3 tests:
seed7 dual prior 21.00142s vs proof-aware 10.62776s, objective498 with 'proven' native certificate.
seed31 proof-aware 20.98891s valid objective619, cycle winner without certificate.
seed43 dual prior 3.0655s vs proof-aware 2.27535s, objective542, native certificate.
seed59 proof-aware 20.9862s valid objective578, cycle winner without certificate.
The prior default controller solved seed7 only among these four in previous measured tests. Same-run direct default comparisons are only seed7 and seed31 in proof-aware CI. Synthetic results do not translate to official score.

## MPC provenance and scientific method
MPC method ark consulted for FRAMEWORK_OPERATORS: synthesis / search-space pruning, proof / refinement, state-machine / invariants, adversarial worst-case perturbation; METHOD_HOOKS: CEGAR and oracle delta-debugging. Those native entries are conceptual/research references, not executable solver capabilities.
Outside theoretical analogue: Xu, Hutter, Hoos, Leyton-Brown, SATzilla JAIR 2008; portfolio per-instance algorithm selection, feature/runtimes and competition-score objectives.
Resource owner: FrontierOR official Main track docs https://frontieror-challenge.com/docs (sandbox 2vCPU, 4GB RAM, no network) and https://frontieror-challenge.com/docs/main/scoring (60s, source-verified objective ratios, zero for timeouts/invalid). Source-backed compliance remains separate from a CI fixture outcome.

## Forward study
Current resource gate run https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38111233313 . Do not infer outcome until CI completes.
Next high-impact experiment after resource gate: independent unseen held-out seeds with permutation/sign inversion and an ABBA cold/warm balance. Only then allow an opt-in submission candidate to be compared against all six official solver families under the exact packaging/rules.
Do not repeat blind 14-probe core release, serial unconditional LP guesses, or speculation about hidden private scores.
