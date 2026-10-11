# Johnny 5 — Forward-aware staged portfolio | frozen seven-case experimental frontier
Date: 2026-10-10 CDT / 2026-10-11 UTC.
Owner/source: mjcustomcomputers-dotcom/Machine-Bug-Tool, frontieror/solvers/hoffman1993/solve.py.
Parent verified staged gate: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38111452015 .
Precommitted unseen holdout gate: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38111625623 COMPLETE SUCCESS.
Docker: --cpus=2 --memory=4g --memory-swap=4g --network=none; pinned numpy 2.5.3, scipy 1.18.1, ortools 9.15.6755.
Only research opt-in changes. Historical official reported score 0.7909 remains UNCHANGED/UNVERIFIED. Frozen original default and prior submission ZIP are untouched; no new ZIP or organizer submission.

## Hard calibration generated 240-row 20-side instances
Staged objectives all source-original verified: seed7 498; seed31 619; seed43 542; seed59 578. First-witness stage times respectively 8.51627,5.61795,0.85544,1.1971 seconds. Default matched same-run seed7 objective498 valid, seed31 no incumbent. Earlier same-resource default tests had missed seed43 and seed59; no same-run baseline for these two in staged CI.
Four original-truth/adverse correctness tests all passed.

## Precommitted unseen seed ABBA holdout, full 25-second controller end-to-end
- seed71: plain objective592 valid 4.56261s; staged objective592 valid 5.33413s; cycle witness0.86863s.
- seed83: staged objective564 valid 3.477s; plain objective564 valid 2.78993s; cycle witness0.69384s.
- seed97: plain objective551 valid 2.04227s; staged objective551 valid 2.73654s; cycle witness0.69333s.
All accepted by independent original-model checker. Stage 3/3 feasibility, but slower on all three easy controls. This is a measured overhead; no demonstrated easy-case score gain.

## Adversarial conclusion and method-on-method next hook
(1) Unrestricted two heavy engines in parallel violated the 2-CPU resource opportunity and lost seed31, despite 4/4 on unconstrained CI.
(2) Bounded staged CPU ownership restored all four hard calibration cases under 2 CPUs; holdout preserved all three easy-case solutions.
(3) The next classifier must identify easy baseline cases BEFORE spending ~0.7s on the cycle method, without rejecting the hard cases (seed31,43,59). Structural features alone may not separate same-shape seeds; test cheap LP residuals, side-row pressure, dual-bound gap, objective coefficient moments and exact invariance receipts. Classifier computation cost must be included in end-to-end timing.
(4) Keep first valid original-checked answer; if native optimality certificate, stop; otherwise use remaining budget for objective quality. Avoid overfitting seven known seeds; demand independent holdout and 2-vCPU/4GiB proof before promotion.
(5) The 480-row seed17 with 25 global sides remains unresolved; target it next with source-preserving decomposition/repair rather than new name-only classifiers.

NEXT_ACTION: bounded cheap-easy classifier study and 480-row first-witness repair on opt-in branch, then 60-second all-six-problem compatibility/performance gate. No official score prediction without private evaluation.
