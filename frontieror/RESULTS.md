# FrontierOR — Dial-a-Ride benchmark receipt

Date: 2026-10-10  
Scope: testing-stage Main track, problem `cordeau2006` only.  
Evidence: [GitHub Actions hosted Python 3.14 / OR-Tools 9.15 run](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38075850672) — **SUCCESS**.

## Executed

- `test_direct_ortools_path`: PASS. Runs the actual OR-Tools branch on a synthetic fixture and independently recomputes feasibility and objective.
- `test_independent_solver`: PASS for synthetic fixtures from 1 to 12 requests.
- `test_planted_feasible_difficult_cases`: PASS for 12, 16, and 24 requests with time windows generated around independently known feasible routes.
- Pure Python fallback: on 12 seeded planted-feasible cases (8–24 users), **12/12 feasible** following the narrow-window request-order repair (previous version: 11/12). OR-Tools was not installed for this particular local fallback benchmark.

### Hosted hard-fixture results

| Requests | Test time | Solver distance | Known feasible route distance | Improvement against planted feasible route |
| --- | ---: | ---: | ---: | ---: |
| 12 | 0.15 s | 543.709 | 540.849 | -0.53% |
| 16 | 10.66 s | 472.053 | 585.954 | +19.44% |
| 24 | 14.00 s | 533.783 | 816.448 | +34.62% |

**Important:** The planted route is only a feasible reference, not a mathematically proven optimum or the competition's frozen reference value. These percentage differences are not FrontierOR instance scores. Tests are synthetic and do not certify performance on the contest distribution.

## Competition score projection, not an official result

The testing stage currently contains six problems. A missing solver counts as 0. Every problem has equal weight and a maximum problem score of 2. With only `cordeau2006`:

- If the Dial-a-Ride solver fails the organizer's validation: overall score 0.0000.
- If its Dial-a-Ride private-instance average were 0.8: overall 0.1333.
- If its Dial-a-Ride average matched the frozen best-known reference (score 1): overall 0.1667.
- If its Dial-a-Ride average were 1.2: overall 0.2000.
- Absolute six-problem submission ceiling with DARP alone: overall 0.3333.

The publicly observed Main testing leaderboard leader was 1.0218 on 2026-10-10. Winning requires solving other problems too, not just improving one. The later qualification round publishes a different, larger set of problems.

Scoring rules: https://frontieror-challenge.com/docs/main/scoring

## Evidence still needed

1. Authenticated organizer public JSON fixtures from the user's FrontierOR CLI/Codespaces session; unavailable in GitHub Actions because no FrontierOR token was supplied to GitHub.
2. Official public-instance feasibility results (the toolkit `test` command checks format and runtime, not all mathematical constraints).
3. Official private-instance **feasibility and score**, returned only after a Main-track submission.

Do not publish API tokens, raw private instance data, or claim leaderboard success from this synthetic run. The isolated competition branch preserves MPC `main` unchanged.
