# FrontierOR Main — published rule-by-rule contract audit

**Audit performed and CI refreshed:** 2026-10-10. **Testing-stage only.**\n**Latest host run:** [38079464204](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38079464204), source commit `5a5422da70773edc846e6b769493a517c51fe90c`, **SUCCESS, 28/28 tests**.\n**Latest ZIP SHA-256:** `f8c93753298cd9c572ba50283139bb0c4d1d2d88b0ebf655cd422c10510ab6a9` (GitHub run artifact ID `11679916300`).
Sources: Organizer's own
[Overview](https://frontieror-challenge.com/docs),
[Problems](https://frontieror-challenge.com/docs/problems),
[Main flow](https://frontieror-challenge.com/docs/main/submission-flow),
[Main format](https://frontieror-challenge.com/docs/main/submission-format),
[Example](https://frontieror-challenge.com/docs/main/example-code),
[Scoring](https://frontieror-challenge.com/docs/main/scoring),
[API](https://frontieror-challenge.com/docs/main/api),
[FAQ](https://frontieror-challenge.com/faq),
[Terms](https://frontieror-challenge.com/terms) (updated 2026-09-16),
and the six published problem pages.

**State vocabulary:** `PASS_LOCAL` means a checked rule or test. `PASS_HOSTED` means a GitHub Actions run with the identified source. `UNKNOWN_OFFICIAL` means only the organizer's authenticated test / private checker can decide. **Passing a hosted test does not mean the contest accepted a solution.**

## Participant and authorization rules

| Organizer rule | Current status | Evidence / limitation |
| --- | --- | --- |
| Each participant uses one registered account and one current team | `USER_ACCOUNT_UNVERIFIED` | The user reports a newly created Main team. Our hosted connector cannot access FrontierOR identity. Authenticated bridge checks `GET /me`. |
| Main track, active stage, submissions remaining | `UNKNOWN_OFFICIAL` | Bridge checks Main. Authorized organizer's CLI checks current stage and submission quota at submission time. |
| Max 4 submissions/day UTC, valid upload consumes a slot | `OBSERVED_RULE` | No contest upload was performed by this repository workflow. |
| No collusion, multiple teams for extra quota or cross-track private-instance sharing | `INSTRUCTION_ENFORCED` | This GitHub workflow only uses synthetic fixtures. |
| Do not attack/probe portal; do not reconstruct/distribute confidential private instances | `INSTRUCTION_ENFORCED` | No penetration testing or private-instance acquisition is included. Public instances only via organizer's documented token API. |
| Submitted solver code cannot escape sandbox, network or read unauthorized instances | `PASS_STATIC` | Source scan: six solver files import standard math/CLI libraries and public sandbox packages; no network/API clients used at inference. Cannot prove all future dependencies behave safely. |
| Main optimization dependencies open-source | `PASS_PUBLISHED_DEPENDENCIES` | Python 3.14, OR-Tools 9.15.6755, SciPy 1.18.1; both included by organizer and open source. No extra dependency manifest requested. |
| Rights in submitted code and organizer evaluation license | `REVIEWED` | Six purpose-built solver files; source and the separate MPC runtime are not bundled together. |

## Archive and sandbox requirements

| Main rule | Status | Evidence or stop condition |
| --- | --- | --- |
| One ZIP/TAR/TAR.GZ <= 4 MB | `PASS_HOSTED` | `frontieror/build_submission.py` generates a small ZIP and checks size. |
| Current stage slug folder / `solve.py` for every problem | `PASS_HOSTED` | Six exact Testing-stage slugs: barnhart2000, bodur2017, cordeau2006, fischetti1998, hoffman1993, nagy2015. |
| No symlinks, hardlinks, absolute paths, unsafe `..`, backslashes, >10,000 entries or 256MB inflated | `PASS_HOSTED_BY_CONSTRUCTION` | Archive contains exactly six filenames `<slug>/solve.py`, all stored as text by Python ZipFile; its contents and hashes are read back in CI. |
| Python entrypoint receives `--problem --instance --output --time-limit` | `PASS_HOSTED_CLI` | Every solver has a CLI main. New `tests/test_official_cli.py` actually executes all six entrypoints. |
| Output is JSON at requested `--output` and <= 16 MB | `PASS_HOSTED_CLI` | Each main writes JSON, new CLI tests check shape and size. Whether larger organizer fixtures exceed the size limit is unknown. |
| Proper `objective_value` and all schema fields | `PASS_SYNTHETIC` / `UNKNOWN_OFFICIAL` | Independent fixtures verify published fields. Organizer's exact `solution_json_schema` is available ONLY through authenticated API/downloaded stage files. |
| Exact capacities, scheduling, precedence, path-flow, routing and scenarios checked | `PASS_SYNTHETIC` / `UNKNOWN_OFFICIAL` | Mathematical validations in test modules. The formal checker is private. |
| 2 CPU, 4 GB, no network, read-only solver folder | `PARTIAL` | Github uses Python 3.14 matching organizer libraries, but resource/container enforcement is not identical. `official_test_onecommand.sh` prefers the organizer Docker sandbox when the daemon is available. |
| Solver must exit before 60 seconds | `PASS_SYNTHETIC` / `UNKNOWN_OFFICIAL` | Timed synthetic test runs succeed; worst-case organizer instance times are unknown. A written solution does NOT save a still-running process. |
| Failed public-instance check zeroes all private instances for that problem | `OBSERVED_RULE` | Avoid submission until `uv run frontieror test --docker` runs on authenticated public data; even that checks format/runtime, not organizer feasibility. |
| Private-instance score computed by organizer | `UNKNOWN_OFFICIAL` | No official private score has yet been returned. |
| Round/stage progression | `STAGE_SCOPED` | Testing six-problem code must be adapted for Stage 1's new 50 published problems starting November 1, 2026. |

## Exact problem fields reviewed

- `barnhart2000`: `objective_value`, `commodities` with `commodity_id`, `rejected`, and `path_arcs` (`from`, `to`, `arc_id`); reject-all fallback; verify physical arc capacity and whole commodity path.
- `bodur2017`: `objective_value`, `open_facilities`, `x`, `y`; all-open valid shipments, total capacity across every scenario, per-scenario full demand, weighted recourse objective.
- `cordeau2006`: `objective_value`, `routes`, `service_times`, `ride_times`; paired pickups/dropoffs same vehicle, precedence, exact unrounded Euclidean distance, windows, ride/route durations.
- `fischetti1998`: `objective_value`, `visited_nodes`, `edges`, `tour`; three or more distinct cities including depot, one single cycle, symmetric integer arc travel and prize.
- `hoffman1993`: `objective_value`, `selected_rotations`, `variable_values`; exactly one cover per row, base bounds when present, correct objective.
- `nagy2015`: `objective_value`, `routes`, `routes_detailed`; each expanded delivery/pickup node once, independent full-load trace and integer distance. **Potential hidden contract:** the published annotated schema only describes the nested stop dict without enumerating its required field names; compare `solution_json_schema` on the organizer's authenticated public problem data. Our synthetic checker checks the fields currently written, not private semantic acceptance.

## Explicit outstanding gates (do not promote away)

1. CI CLI subprocess test complete: `test_official_cli.OrganizerCommandContractTests.test_six_real_cli_entrypoints` PASSED on run `38079464204` (28/28 total).
2. Authenticated organizer `GET /me` verifies new Main team and active Testing stage.
3. Authenticated problem `solution_json_schema` and organizer actual public-instance files; `uv run frontieror test --docker` when available. These are accessible in the user's existing Codespaces only.
4. Actual official scoring upload, which consumes a team submission credit, and private feasibility receipt. The organizer's hidden checker is unavailable to GitHub Actions.
5. **Official score estimate cannot be calculated from synthetic route improvement percentages**, because each hidden instance reference objective is unknown.

Submission is a consequential, rate-limited action. The one-command bridge deliberately never submits.

## Submission ZIP identity

The last verified all-six ZIP artifact was generated from branch commit `5a5422da70773edc846e6b769493a517c51fe90c` and attached to [GitHub run 38079464204](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38079464204). The current head may differ from that archive when audit improvements are committed. Always use the latest successful CI ZIP with a manifest hash and the corresponding authenticated public test result; never assume an older archive represents new code.

**Disposition:** STRUCTURAL HOSTED PASS; ORGANIZER ACCEPTANCE NOT VERIFIED.
