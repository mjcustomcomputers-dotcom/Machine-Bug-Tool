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
- On managed Sites Linux, use the Sites dependency helper. On a separate
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

Reuse the existing installed MPC plugin. Read the current tool schema before
calling it. Verify `runtime_status`, `get_universal_contract`, and a protected
synthetic evaluator call. A bare URL, initialize response, or tool list does
not establish authentication. Never imitate production identity headers or
copy credentials into this repository.

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
