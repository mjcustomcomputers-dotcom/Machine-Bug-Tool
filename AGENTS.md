# MPC Machine Legal BugTools — Daybreak development

Read `DAYBREAK-START.txt`, `docs/environment-setup.txt`, and
`docs/atomic-execution.md` before substantive changes. This repository contains
the existing MPC source. Preserve its architecture, project identity,
registries, typed IDs, method contracts, and checkpoint format.

## Source continuity

`docs/daybreak-source-import.json` records the exact upstream snapshot and every
original Git blob/mode. The native Sites repository retains its prior history.
This GitHub development copy does not automatically synchronize with Sites.
Before a later production update, reconcile the latest native branch and the
GitHub changes. Preserve `.openai/hosting.json` and the existing private Site.
Follow the supported Sites workflow for any separately authorized deployment.

## Environment

- Node.js must satisfy the manifest (`>=22.13.0`). Use exactly `pnpm@11.25.0`.
- Preserve `pnpm-lock.yaml` and the dependency policy in `pnpm-workspace.yaml`.
- Do not introduce a second lockfile or run overlapping installers.
- On managed Sites Linux, use the Sites dependency helper. For an unprepared
  portable Linux/macOS checkout, run `bash scripts/setup-daybreak.sh` after
  supplying the manifest's Node and pnpm versions. The script preserves the
  checked-in dependency policy and runs the existing tests and build.
- Keep checkout-specific runtime state ignored and local to the checkout.
- The existing validation commands are `node --test` and `npm run build`.
- Source tests and local builds do not publish a Site or create a reusable
  Codex Cloud environment. Record the actual command, commit, and exit status.
- The user's current setup instruction is to work without browser control.
  Use the connected GitHub/MPC tools for supported work. A new reusable Cloud
  environment remains a separate desktop-app step unless a documented,
  authorized environment-creation tool becomes available.

## Daybreak and the hosted MPC connection

Daybreak entitlement, model choice, repository access, environment publication,
and protected MCP authentication are separate observations. Report only what
the current session can verify. A prompt or repository name cannot enable an
access program. Preserve the user's selected offering and supported surface.

Read `docs/mpc-parent-session-verification.json` for the actual successful
hosted MPC calls from the originating session, including a protected synthetic
Nash evaluation. Retain that receipt as prior verification of that connection.
It does not verify tool exposure or caller authentication in another session.

If the destination does not expose the MPC tools, record the capability as
unavailable there and continue independently authorized source work, including
preparation or otherwise-ready environment publication when still needed. Tool absence alone does not identify an
authentication failure or a broken hosted service. Keep destination MPC access
and Daybreak availability as separate pending observations; neither is a gate
for preparing this source environment.

Before work that requires hosted MPC calls in a destination session, reuse the
existing supported plugin connection, read its actual registered schemas, and
verify `runtime_status`, `get_universal_contract`, and a protected synthetic
evaluator call there. A bare URL, initialize response, or tool list does not
establish authentication. Do not recreate the existing plugin or server to
resolve absent tool exposure. Never imitate production identity headers or
copy credentials into this repository.

## Cloud setup progress

`docs/daybreak-cloud-environment-status.json` records the latest status.
`docs/daybreak-fresh-task-restoration.json` preserves the complete receipt
supplied by the user, recorded at `2026-10-09T02:51:22.635629+00:00`.

The receipt verifies restoration for the clean `work` checkout at
`97704161bfc2c3f0af42ead986dbfb7b405c8c5c`: Node 24.19.0, pnpm 11.25.0,
dependencies and build output already present, no dependency reinstall,
166 passing tests, both expected homepages served, and a successful rebuild.
The restored Worker was checked before rebuilding. These are observations
reported by that Cloud task and supplied by the user; they are not executions
reproduced by the originating session.

Source-environment preparation and the fresh-task restoration check are
complete within that receipt's scope. Continue authorized source work.
Preserve `install_script`, `start_skill`, and the Cloud checkout's reported
Wrangler override:
`XDG_CONFIG_HOME=/workspace/Machine-Bug-Tool/.sites-runtime/config`.
Its path belongs to that checkout; keep runtime state local in other checkouts.
Do not reinstall or repeat the full setup validation solely because another
session lacks MPC tools or a separate publication-status receipt.

The fresh task read the handoff at
`c99f0120e7e8df69ceb1c9e99d5fad105fe92b78` without merging it into the tested
checkout. Its three referenced document blob IDs match repository records.
That identity check does not independently reproduce destination execution.
Read the current `origin/main` handoff safely before source changes, preserving
local work and reporting the actual checkout commit. Later documentation
commits do not retroactively change which commit was tested.

Publication completion was not separately observed in the originating session.
Destination MPC tools were unavailable, no authentication failure was observed,
and Daybreak selection/entitlement remained unverified. Keep those statuses
separate from the resolved source-restoration result. Service states in the
receipt describe that task at recording time, not guaranteed later uptime.

## Continuing the research and repair queue

Use the original repair pack's `CODEX-HANDOFF.txt` and current native project
controller. The package is a checkpoint, not a replacement for later native
progress. Preserve source ownership and exact ID types; keep synthetic model
results distinct from target evidence and verified impact. Select methods by
the active dimensions and falsifier. Unimplemented research hooks remain
specifications. Preserve the user's established PASS output format and the
program's current authorization and testing rules.

For each concrete change, report the source/native record, applicable methods
and classifiers, falsifier, actual change, verification, remaining dependency,
and exact next action. Do not manufacture a pass number or completion score.
