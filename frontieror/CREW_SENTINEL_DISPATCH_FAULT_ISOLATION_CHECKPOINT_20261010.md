# Johnny 5 — bounded sentinel and full-dispatch fault-isolation checkpoint
Date: 2026-10-10 CDT / 2026-10-11 UTC.
Source owner: mjcustomcomputers-dotcom/Machine-Bug-Tool; crew source frontieror/solvers/hoffman1993/solve.py.

## Frozen boundaries
- Published solver/default solve() route unchanged: both research switches opt in.
- Original verifier and output contract remain authoritative.
- Frozen 17–18x cycle work and existing ZIP/submissions untouched.
- Historical reported official score 0.7909; no new official score verified.
- No ZIP / no submission / no public-score projection.

## Method-as-classifier checkpoint: isolated sentinel
Parent source branch frontieror-crew-unsat-core-sonar-20261010, SHA d5394b96be0d42937487f0f6b874d35a983ab32c.
Research branch frontieror-crew-pulse-sentinel-20261010, final source/test SHA e03e6d8489cd92445e0ecfe8a70abde2f08c539a.
Complete CI: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38110319153 success; 3/3 tests passed.
Generated exact-cover cases at equal per-solve budgets:
- 240 rows, 20 side, seed7, 10s: plain 8.44441s valid objective498; sentinel 7.95363s valid objective498.
- 240 rows, 20 side, seed31, 10s: plain 4.99184s valid objective619; sentinel 5.06794s valid objective619.
- 480 rows, 25 side, seed17, 30s: neither route returned a valid incumbent.
- Broad-core 480 light observation: 59/97 fixed hypotheses conflicting, core fraction 0.60825, 0.045687s probe; sentinel ended search hypothesis and returned to plain.
- Earlier legacy core mode had lost both 240-row incumbents; sentinel restored them in this run. This is not established cross-seed speed or a 480 rescue.

## Full solve-path integration falsifier
Research branch frontieror-crew-sentinel-dispatch-20261010; source and workflow SHA ba41335d22f2d7bcd20e346215907830358d7517.
Full CI: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38110557765 SUCCESS, 2/2 exact end-to-end tests passed; benchmark measured rather than promoted.
Generated 25s full solve() source-matched A/B:
- 240 rows seed7: default 10.48827s verified objective498; opt-in 21.48436s NO SOLUTION (cycle 7.35516s no witness). A regression.
- 240 rows seed31: opt-in 21.48569s valid objective619 (cycle witness in 5.07443s); default 21.48411s NO SOLUTION. A rescue.
- 480 rows seed17: opt-in structural veto, no cycle invocation, no incumbent at 30s budget.
Interpretation: original controller scheduling is a separate bottleneck. A working internal method may hurt end-to-end because it steals search budget from native MILP/HiGHS. CI success means the code/test ran, not that performance improved.

## Status and next bounded action
WORK_PHASE: ARCHITECTURE + VERIFICATION.
COMPLETED: assumption fault isolation; light broad-core veto; native end-to-end A/B and real default-dispatch gap identified.
OPEN: 480-row first feasible remains unsolved; cross-seed cold/warm/ABBA reproducibility; official score no verified change.
BLOCKED_FROM_PROMOTION: opt-in full controller due seed7 regression.
NEXT_ACTION: isolated time-allocation experiment: reduce upper bound for early cycle phase from 9.5 to about 5.8s, reserve native fallback >=10s, compare default vs opt-in on seed7, seed31 and independent holdouts. Do not enable by default or package until adverse gate passes.
DO_NOT_REPEAT: prior LP hard-fixing, unrestricted 14-core repairs, and measured sentinel/full-dispatch first A/B.
