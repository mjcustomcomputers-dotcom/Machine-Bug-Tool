# Johnny 5 | CPU-aware multi-method forward schedule | Source-matched validation
Date: 2026-10-10 CDT / 2026-10-11 UTC.
Source branch: frontieror-crew-staged-2cpu-20261010, workflow commit 6a50f705bcc7c012d0de5328f6cd1f7b29851dbb.
Original source: frontieror/solvers/hoffman1993/solve.py
Native original verifier remains authoritative; original default solve() remains unchanged (opt-in only).
No competition ZIP, no official submission, and no updated official score.

## Four-step experiment and adversarial routing
Prior legacy 14 unsat-core release: correctness passed, two 240-row feasibility regressions and 480 still missed.
Bounded sentinel: retrieved both 240 rows in internal model; never rescued 480.
Serial 5.8s recovery: three 240-row seeds recovered but seed7 missed under full controller.
Unrestricted two-method parallel race: four seeds valid on GitHub runner; 2 CPU 4 GiB offline sandbox only three/four valid (seed31 missed), establishing CPU contention.
Resource-aware staged schedule: cycle CP then, if needed, protected native sparse MILP. A valid child returns original rotation IDs and parent verifies full model; first phase simultaneously classifies feasibility and allocates recovery effort. A timed-out phase never proves infeasibility. Only active in explicitly experimental_portfolio_schedule="staged", experimental_dual_portfolio=True.

## Native benchmark receipt
CI: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38111452015 COMPLETED SUCCESS, 4/4 original-truth unit tests.
Docker runtime restricted to --cpus=2, --memory=4g, --memory-swap=4g, --pids-limit=128, --network=none; libraries pinned.
Four generated 240-row 20-side cases, 25s full controller allowance:
- seed7: staged valid objective498, first-stage witness 8.51627s, full end-to-end 21.08202s; default valid objective498, end-to-end10.39457s. Staged slower here but preserved validity.
- seed31: staged valid objective619, first witness5.61795s, full21.09001s; default NO WITNESS in20.6884s.
- seed43: staged valid objective542, first witness0.85544s, full3.17285s; default historical test NO WITNESS, not rerun in this CI.
- seed59: staged valid objective578, first witness1.1971s, full21.08977s; default historical test NO WITNESS, not rerun in this CI.
All valid cases independently original checked; stage did not produce native optimality certificate; objective may still be improvable.
Competition-like resource gate passed for this generated family. Still no demonstration on hidden private instances or all six problem families; not submission-ready.

## Exact next action
Precommit unseen holdout seeds on same generator with varied objective/side constraints; compare independent default and staged within same Docker envelope, varying order to reduce cache/warm bias. Then run the full six-problem organizer-format compatibility suite and 60-second cap before constructing a new ZIP. The historical 0.7909 score is NOT changed.
