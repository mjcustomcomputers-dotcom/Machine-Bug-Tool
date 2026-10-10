# FrontierOR NASA-style resource hazard pass — 2026-10-10

**Immutable first official submission:** `7d4bed51` remains with organizer. These are **follow-on candidate code changes**, not retroactive changes to the uploaded archive.

## Rules and evidence

Official docs: https://frontieror-challenge.com/docs/main/submission-format and https://frontieror-challenge.com/docs/main/scoring

The Main sandbox runs each solver under 2 vCPU, 4096 MB RAM/no swap, no network, read-only source, 64MB temp, unprivileged uid 1000, and 60 s maximum. A solver still running after its time limit scores zero even if it wrote output; an invalid public instance zeros that problem's private scores.

Baseline exact hosted resource run: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38081667441. **24/24 synthetic Docker tests passed** (12 tests x Python 3.12 and 3.14) with the limits enforced at runtime. Includes 6 smoke and 6 larger stress cases per image. It is a faithful constraint approximation, **not** the organizer's exact published image or hidden checker.

MPC `evaluate_method(fmea)` result was calculated over eight illustrative 1-10 severity/occurrence/detection ratings. Reported highest priority: public-instance infeasibility (RPN 560); objective/schema mismatch (480); timeout (420); >4GB RSS (350); CPU thread amplification (324); Python-version mismatch (270). RPNs are screening values only, not event probabilities or audited occurrence rates. Model fingerprint: `4a5605e04a984b84895cbdac18534e9a0c5ea6d4d6a348189791f6bcf0d9b1e5`.

MPC `evaluate_method(fault_tree)` on unknown memory/time/feasibility states correctly returned **UNKNOWN** instead of certifying an unseen organizer result.

## Risk -> control -> falsifier -> fallback

| Hazard | Prevention/control | Falsifier | Fallback |
|---|---|---|---|
| Public feasibility failure | Independent checker per mathematical domain | Organizer says infeasible | Keep last certified feasible candidate |
| Objective mismatch | Compute from explicit solution decisions | Checker reports nonmatching objective | Reject candidate; recompute |
| CPU amplification | BLAS 1 thread, OMP 2; two CP-SAT workers | Worker count overshoots or slow test | Pure Python / greedy backup |
| Cumulative time kill | Wall-clock deadlines with exit reserve | Process fails at 60 s | Stop search before deadline; return checked incumbent |
| 4GB OOM | 30k path-frontier limit, 60k route-merge heap; solver input matrix bounds | Docker OOM exit 137 | Verified conservative assignment |
| No network / readonly | Docker --network none --read-only, output-only mount | Unexpected write/socket fails | Self-contained one-file solver |
| Python-version mismatch | Python 3.12 AND 3.14 container probes | One image fails | Use organizer-supported passing image |
| Data/output too large | 16MB JSON gate; 4MB ZIP builder | Oversized JSON in fixture | Structural compression needs schema confirmation |

## Actual adaptive computation

- `barnhart2000`: if a verified feasible solution reaches objective zero and all physical/rejection costs are nonnegative, zero is a *proven global lower bound*. Skip CP-SAT and terminate early without sacrificing objective. On all other cases CP-SAT remains available.
- `fischetti1998`: when all nonnegative city prizes have been collected, the sum of prizes is a *proven upper bound*. Skip expensive DP/beam/circuit construction.
- `nagy2015`: cap priority-heap growth; incumbent remains feasible on large n.
- `hoffman1993`, `bodur2017`: restrict numerical-library threads before lazy import to limit core oversubscription in published two-vCPU sandbox.

**Promotion gate:** New methods must pass existing independent regressions, negative controls and both resource-constrained Python images. Their score impact on the organizer's private instances remains unknown until a completed official submission.
