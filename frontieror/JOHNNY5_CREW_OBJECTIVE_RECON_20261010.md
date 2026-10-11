# FrontierOR Main — Crew objective recon and isolated candidate

**Date:** 2026-10-10 America/Chicago / 2026-10-11 UTC.
**Parent source commit:** `6be4c58e410b95751c450d7f18f9c58a57bda1a4`.
**Candidate branch:** `frontieror-johnny5-fractional-rescue-20261010`.
**Published candidate commit:** `b7c1c43753cba8c7e3a50244cd2e7b2678ec1305`.
**Complete CI run:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38100994103 — SUCCESS.
**Submission ZIP:** `frontieror/downloads/FrontierOR-Main.zip` (12 files, 57,077 bytes).
**ZIP SHA256:** `0f2c213e6573d287e39aa1f03180479479f84dd087e9fc97f95b9f7131f97054`.
**Crew solve.py SHA256:** `6985539b0bbb241bef58a11e9388d7a93bb0ae1df178216739591b29fa223995`.
**Actions artifact:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38100994103/artifacts/11687467844, with competition ZIP, manifest, objective benchmark and offline Docker result.

## Implemented source changes

1. `cp_sat_side`: replace approximate round-to-nearest side-constraint integer scaling with outward integer relaxation using Decimal and literal original-model verification; preserves feasible covers even when tiny coefficient errors accumulate in both signs. Tests added and passed.
2. `_objective_neighborhood`: stop skipping the complete optimization neighborhood at 7,000 encountered columns. Include all incumbent freed columns, cost-rank up to six eligible alternatives per freed row, and solve a bounded reversible MILP. Regression constructed with 7,005 dominated high-cost pair alternatives: original feasible cost 40, improved verified cost 6, **85% lower objective** on that synthetic fixture only.
3. `_highs_stream_incumbents`: replace lifetime 12-improvement send cap with elapsed-time throttling. Later improvements remain observable if the process is terminated at a hard deadline, retaining original-model verification in parent.

The source already supported graph matching with virtual penalties for missing singleton rotations; this is **preexisting**, not a newly delivered change. No changes to the six-problem external schema or original objective validator.

## Evidence and limits

- Focused Crew and callback checks: PASS.
- Complete six-solver unittest suite: PASS.
- All six synthetic benchmark objective comparisons: PASS.
- Offline Docker probe, Python 3.12, 2 vCPU, 4096 MB, no network, read-only solver, 12 smoke/stress cases: **12/12 PASS**.
- Competition-format ZIP integrity, 12 members and source-hash readback: PASS.
- **Official Main private-instance score for this candidate: NOT OBSERVED.** Last owner-supplied best completed official submission: **0.7909**. Do not infer leaderboard gain, private Crew feasibility, or first place from synthetic or resource tests.
- No official FrontierOR submission was performed by this pass. Existing officially scored work and the prior objective-core branch remain unchanged.

## Exact continuation

Submit only the candidate ZIP from the isolated branch to Main Testing when explicitly chosen by the owner. Compare the resulting organizer Crew private scores and fifth-instance result with the 0.7909 best, then promote improvements only by official score. If its hidden result regresses, preserve this candidate and restore the last best scoring source.

Citations: official scoring https://frontieror-challenge.com/docs/main/scoring ; exact submission format https://frontieror-challenge.com/docs/main/submission-format ; GitHub native source/CI pointers above.
