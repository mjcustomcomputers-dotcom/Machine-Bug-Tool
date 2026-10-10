# FrontierOR NASA / MPC Resource Verification Receipt

**Date:** 2026-10-10 UTC. **Stage:** Main Testing. **State:** HOSTED_RESOURCE_PASS / OFFICIAL_SCORING_FEEDBACK_REQUIRED.

## Proven by executed hosted tests

- **Existing submission ZIP v1:** SHA256 `f8c93753298cd9c572ba50283139bb0c4d1d2d88b0ebf655cd422c10510ab6a9`, original Main upload submitted by the owner as ID `7d4bed51`, timestamp 2026-10-10 19:42 UTC. Immutable as of organizer upload.
- **Resource baseline:** GitHub [run 38081667441](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38081667441), 24/24 synthetic Docker cases passed (12 Python 3.12, 12 Python 3.14).
- **Hardening candidate v2:** source commit `6d68940e7d5c1c90bd30a8f6f995e1a536d0ee86` with MPC method-alternative/queue caps/thread control/early-stop guards.
- **CI method and contract checks:** [run 38082067966](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38082067966): **33/33 regression tests passed**, all six synthetic method comparisons, and six-file ZIP readback.
- **V2 resource checks:** [run 38082067786](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38082067786): **24/24 Docker tests passed** on two Python images using 2vCPU/4GiB/no swap/no network/read-only solver/64MiB tmpfs/unprivileged uid1000/process cap256. Docker is a constraint approximation using Debian bookworm and the published package versions, NOT the organizer's private checker.
- **V2 artifact ZIP:** `FrontierOR-Main.zip`, 29,189 bytes, SHA256 `bc73c64ae1c8d63eb30e4945fe29c5306b9ab31c0c67b3247b37199b92eb63d0`. [GitHub v2 standalone six-solver ZIP](https://raw.githubusercontent.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/frontieror-darp-testing-20261010/frontieror/downloads/FrontierOR-Main-Hardened-NextSubmission.zip), published by [run 38082262420](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38082262420).

## Measured computational gain with no loss of objective

### Multicommodity Flow `barnhart2000`

| Python | Original time, same synthetic 100-commodity stress | V2 time | Feasible objective |
| --- | ---: | ---: | ---: |
| 3.12 | 20.142 s | 0.173 s | 0 (certified global minimum with nonnegative arc / rejection costs) |
| 3.14 | 20.134 s | 0.121 s | 0 (same objective) |

Other v2 stress cases passed: DARP 16 users ~12.1 s; Orienteering 44 cities ~17–18 s; Facility Location 18 facilities/25 customers/6 scenarios <2 s; Crew 60 rows <1 s; VRP 180 customers <4 s. All completed within the 22-second test budget (less than the official 60-second limit) under the stated Docker resource caps. These measured times apply only to these synthetic fixtures.

### MPC methods actually executed

- `evaluate_method(fmea)` of eight caller-specified hazards yielded risk-priority list: public feasibility, output/schema objective, timeout, OOM, thread oversubscription, Python-version mismatch. RPN judgments are **not** probabilities.
- `evaluate_method(fault_tree)` correctly returned unknown for the unobserved organizer private-instance check. This is not a safety or score certification.
- Algorithmic methods: objective upper/lower bound certificates, graph-frontier memory cap, 60k-route-heap bound, conservative fallbacks, BLAS 1-thread reduction, OR-Tools CP-SAT 2-worker limit, guarded repair against independently checked incumbents.

## Important unresolved hazards

1. **Official private-instance score by problem is unknown to this connector.** The public leaderboard [now shows a team Dignity at 0.5390 with one submission at 2026-10-10 19:42 UTC](https://frontieror-challenge.com/leaderboard), which matches the user's submission timestamp exactly but team ownership has not been independently authenticated. Record as **probable match, unverified**.
2. The checker's exact semantic contract (particularly nested `nagy2015/routes_detailed`) remains private; 33 local tests + Docker do not establish organizer acceptance for hidden examples.
3. Official public JSON instances are available to the user's authenticated FrontierOR Codespace, not to this GitHub CI. Thus synthetic test distribution may miss narrow scenarios and objective corner cases.
4. DARP and Orienteering still search near the full **22-second synthetic test budget** on some cases. They pass this bound but need objective-versus-time experiments informed by the actual organizer feedback before reducing search arbitrarily.
5. A Docker memory cap proves *these test instances* survived under 4GiB; exact per-process memory peaks were not separately measured, and future larger instances are not proved safe.

## Next method-selection gate

**ACQUIRED:** Organizer per-problem scores/status for submission `7d4bed51`.
**ANALYZED:** Classify failure as public rejection / private infeasibility / time / memory / scoring gap; select only method families relevant to that failure, use counterexample and independent checks.
**DECIDED:** Promote a new six-solver ZIP only if all CI/Docker resource tests pass and the expected problem-average gain outweighs any regression risk. The v1 ZIP and source history remain recoverable.

**No second FrontierOR submission has been sent by these tools.** Do not consume another credit without reviewing official outcome.
