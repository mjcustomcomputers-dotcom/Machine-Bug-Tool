# FrontierOR Main-track — methods pass checkpoint

**Observed:** 2026-10-10, 19:12 UTC run completed.  
**Code branch:** `frontieror-darp-testing-20261010` (isolated from canonical MPC main).  
**Tested source revision:** `d533b591627ab5539ccbbfaf3fabc8d6ffc67fab`.  
**Status:** `SIX_SOLVERS_HOSTED_SYNTHETIC_PASS — OFFICIAL_SCORE_UNKNOWN`.  
**Verifier:** [Full Python 3.14, SciPy 1.18.1, OR-Tools 9.15.6755 GitHub Actions run](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38078780485), completed SUCCESS.  
**Action artifact:** `FrontierOR-Main-Six-Solvers`, GitHub artifact ID `11679314951`. Includes `FrontierOR-Main.zip` and `manifest.json`, `benchmark.json`, `benchmark.md`.  
**ZIP SHA-256:** `3ea794a078699881931b40aa31707fe19c81f1e72cb225acd5b4a386f9577f5b`.

## Fixed source identity and architecture

All six published Testing-stage slugs have an independently runnable `solve.py` with the organizer's CLI and JSON contract.

- `cordeau2006` — DARP; time windows, ride time, capacity, paired routing; OR-Tools + repaired feasibility-first insertion + verified relocation.
- `fischetti1998` — Orienteering; exact DP / beam / CP-SAT / local-neighborhood portfolio.
- `barnhart2000` — Integer multicommodity flow; graph search, alternative paths, residual capacity, path-set CP-SAT, reject-all safe fallback.
- `hoffman1993` — Crew exact cover with sparse SciPy MILP and CP-SAT; deterministic forced-row fallback.
- `bodur2017` — Stochastic facility location; scenario-wise valid all-open transport, closure search, exact recourse LP and sparse extensive-form MILP.
- `nagy2015` — Delivery/pickup routing; independently feasible single-customer baseline, savings merges, phase 2-opt, cross-phase 2-opt, relocation.

**Methods selection:** Problem structure -> viable solver family -> mathematical feasible candidate -> independent validator -> incumbent replacement if better. Complementary inverse: failed candidate -> minimal violated constraint or cost bottleneck -> route a different applicable method. The MPC Method Ark informed these operators; its hosted router does not execute mathematical solvers.

**MPC actual bounded execution:** `evaluate_method(metamorphic)` compared held-constant VRP synthetic fixture n=15 seed=20, budget=6 with `cross_phase_two_opt` off versus on. Observed objective went 283 -> 260, validity remained true. Model fingerprint `8cd87ddbd7acafb1b5584fbacf715aeafb83e29ad64ce945ee629753779c6d79`. The supplied-record method comparison does not itself prove causation or authenticate source claims; the separate GitHub Actions logs are the native test receipts.

## Head-to-head evidence

CI benchmark on deliberately simple and planted-feasible *synthetic* comparators:

| Slug | Baseline | Candidate | Relative improvement |
| --- | ---: | ---: | ---: |
| cordeau2006 | 540.84949 | 536.04517 | 0.888% |
| fischetti1998 | 380 | 420 | +10.526% prize |
| barnhart2000 | 230 | 0 | 100% rejected-cost reduction |
| hoffman1993 | 20 | 14 | 30% |
| bodur2017 | 107.22925 | 17.22925 | 83.932% |
| nagy2015 | 868 | 260 | 70.046% |

Do NOT interpret these as the official leaderboard, mathematical optimality proofs for hard instances, or evidence of 1.0218+ score.

## Competition rules and readiness

- Source: https://frontieror-challenge.com/docs/main/scoring
- Source: https://frontieror-challenge.com/docs/main/submission-format
- The six problem scores are equally weighted; private instances only count. A public-instance failure zeroes the private instances for that problem. A correct output that runs past its limit also scores zero.
- Main stage best observed leader on 2026-10-10: `1.0218`; threshold for first place is strictly greater than current top completed score. Recheck at time of submission.
- Current official score: `UNKNOWN`; no authenticated public instances or private scores were available to these hosted GitHub Actions.
- Official submission credits consumed by this branch: `0`.
- No Codex calls or expensive model APIs were used in these changes.

## Next executable checkpoint (Codespaces)

From the already initialized official FrontierOR starter Codespace, run ONE command:

```bash
curl -fsSL https://raw.githubusercontent.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/frontieror-darp-testing-20261010/frontieror/official_test_onecommand.sh -o /tmp/frontieror-test.sh && bash /tmp/frontieror-test.sh
```

The audited bridge uses the locally saved FrontierOR token only to verify the team and access organizer-owned test data. It checks that the team is Main, downloads all six solver sources from this dedicated GitHub branch, creates source backups, and runs the organizer's public-instance test command. **It does NOT submit, spend submission credits, alter MPC main, or print a token.**

The organizer's CLI public test only verifies run + format, so the final truth requires an official scored Main submission from that already authenticated Codespace:

```bash
uv run frontieror submit --wait
```

Submission requires the owner to deliberately execute that second command, or the established equivalent authenticated API. After official results, map each failure to a contract atom and compare only applicable methods; preserve the last verified source version, tests, ZIP hash, and scored outcome. Do not claim an official score until a submission receipt returns it.
