# MPC Machine Legal BugTools — Daybreak development

## Current V15 scope — executed intelligence improvement

On 2026-10-09 the user reopened intelligence and reasoning improvement for the
product and local MPC: run its own methods against itself, vary information and
move order as in poker, and keep trying useful new experiments. This section
controls the new V15 development lab; the final V13 receiving phase below and
its completed historical controller remain separate and preserved.

Read `docs/REASONING-INTELLIGENCE-V15.md` and the V15 validation receipt at the
verified current review-branch revision. Run
`node scripts/run-reasoning-selfplay.mjs --rounds 24` for one bounded local
pass. Its new `.sites-runtime/reasoning-intelligence` cursor binds exact runtime
and catalog bytes, replays prior counterexamples or changed code, advances the
seed after passing, and preserves earlier runs. Recover that source-bound
cursor from a persisted receipt when continuing in another environment; a chat
summary is only a pointer. Do not rerun completed V13 controller calculations.

Prioritize concrete reasoning defects and new discriminating experiments over
repeating unchanged static catalog scans. Retain regression anchors; vary
actor-visible information, action costs, source alignment, move order,
abstraction partitions and cross-method relations. Distinguish fresh parameter
cases from new experiment families. New families require bounded inputs,
independent expectations, negative controls, versioned source and executed
verification. Preserve original evaluator/classifier IDs and method contracts.
Continue safe additive work on a dedicated review branch without routine
clarification. Merge, deployment, target actions and canonical controller
changes retain their existing separate authorization requirements.

The additive stochastic-observation family uses finite caller-supplied signal
likelihoods, a no-information control, an explicit utility-unit cost budget,
joint-state expansion, and the existing Harsanyi evaluator. It adds no native
evaluator or Atlas ID. Keep its expansion at 16 states or fewer; do not infer
likelihoods, learn a policy, claim calibration, perform sequential search/CFR,
or treat a synthetic result as target evidence.

The additive imperfect-information regret family accepts one finite 2–8 action
simultaneous-move game with bounded integer payoffs and strategy weights. It
enumerates every pure unilateral response with exact integer arithmetic and
cross-checks the supplied game through the retained Nash and Harsanyi
evaluators. Uniform matching pennies is its equilibrium-consistent negative
control. It adds no evaluator or Atlas ID and does not perform CFR, solve a
game tree, infer beliefs, learn opponent play, or claim general poker solving.

## Final engineering scope — local receiving and Codex acceptance

The user has ended research for this phase. The current authorized action is one
final integration acceptance, documented in
`docs/CODEX-V13-FINAL-INTEGRATION-RUN.md`, followed by local receiving through
`docs/LOCAL-POWERSHELL-V13.md`. Read
`docs/validation/MPC-V13-LOCAL-INTEGRATION-VALIDATION.json` and the current resume
manifest. The preparing host passed 405/405 tests and build at exact integration
commit I; actual Cloud and native Windows runs retain separate gates.

Keep reporting R, tested integration I and historical controller executable S
separate. Execute new code/tests at I; only the receiver's isolated historical
controller runs at S. Never rebind or initialize the completed state. Preserve
all 182 original files and the prepared environment. No older research/setup
section below authorizes reopening research, adding methods, repeating completed
models, deploying, changing credentials or testing targets during this final
pass. Stop after the destination acceptance and exact checkpoint.

## Current Codex resume entry point

For the current V13 continuation, read `docs/CODEX-V13-CURRENT-RESUME.md` and
`connector-bridge/codex-resume-v13.json` at the latest development branch head
before following an older setup or validation handoff. The V13 validation and
operative development controller are complete. Read current instructions and
receipts at the reporting head, but execute the saved controller at the exact
tested source commit recorded in its state. Preserve completed calculations,
the existing prepared environment and all native controllers. Check each
destination's actual connector capabilities separately; historical connection
receipts do not establish a new task's access.

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


## Additive Method Atlas / atom detector (Codex development branch)

When the user requests fast method detection, recovery of uncommon physics/quantum/casino/poker hooks, or cross-method checks, read `docs/method-atlas-detector.md` before work. The feature branch contains `method-atlas/schema.sql`, versioned source-linked MHA/MHC candidate catalogs, `lib/method-atlas-router.mjs`, `lib/atomic-method-detector.mjs`, and an offline SQLite CLI/benchmark. It is not the canonical MPC Method Ark or a deployed tool.

Use exact typed MPC atom coordinates and source IDs; do not promote coordinate hints or proposed method cross-links into native classifier equivalence. Keep the original 24 evaluators, 10 hooks, 17 transforms, MAXVAR/NESTMAX/BL/MBSS/EXT registries and all original checkpoint formats unchanged. Run the feature branch's Node/SQLite tests, full suite, build and synthetic benchmark at the actual checked-out commit before claiming performance or release readiness. Do not confuse a queued model, method listing, or Kahn/DFS structural agreement with independent security evidence or authorized target validation.


## Method Atlas V3/V4 stacked intelligence continuation

For requests about lie/deception claims, cybercrime-pattern recognition, intent plus/minus, reverse-goal trajectories, MIT/Harvard/specialist computational methods, process mining or new method hooks: **read `docs/CODEX-METHOD-ATLAS-V4-HANDOFF.md` first**, then the versioned V3/V4 documents it points to. The stacked branch `feature/method-atlas-evidence-intent-reverse-v3` is based on the V1 Method Atlas PR #3. It is not merged or deployed automatically. This addition preserves, and never supersedes, existing canonical research/registry/version instructions.

Evidence contradiction != deception; an observed technical pattern != a human crime; availability/capability != actual execution; a feasible synthetic reverse-goal path != intent or causation. Never infer guilt or dishonesty from demeanor, anxiety, speech or text style. Use typed source-owned records, competing benign explanations and explicit falsifiers. `goal_graph` is opt-in bounded local computation only; it must not silently become a target action.

When validating source work in Codex Cloud, confirm current branch HEAD, native Node/SQLite tests, full tests, build and the synthetic benchmark. Keep the existing security-key login and Daybreak Blue model selection as user-controlled product operations; neither is a target-scope authorization or source authenticity stamp.


## V5–V7 Method Atlas classified continuation (stacked, development only)

For requests to reclassify, detect, chain, or diagnose methods, first read `docs/CODEX-METHOD-ATLAS-V7-HANDOFF.md` and `docs/method-atlas-reclassification-v7.md`, then the inherited core Method Atlas instructions. This branch preserves the original MPC canonical MAXVAR/NESTMAX/BL/MBSS/EXT source and deployed Site. The 231 Method Atlas MHA research candidates are **not** 231 newly executable solvers. Typed classification has 9 axes and 2,511 PROPOSED rows in an additive SQLite table; neither tag agreement nor multiple methods authenticates target evidence.

The local CLI now supports `classify`, `cascade`, and `diagnose` alongside existing `query` and `detect`. Purpose-aware routing only selects and classifies; any computation is separate and source bound. Cascade recursion, method diagnostic results, and source/timestamp discrepancy controls are not permission to interact with bounty targets. Use a newly named ignored SQLite cache after changing this atlas seed. Run dedicated Node/SQLite regression tests, full tests and build on this exact feature branch before merging or reporting performance.

Do not overwrite native controller records or merge PR #3/#4/#5 branches automatically. Keep older handoffs as provenance; newer named V7 handoff controls this development branch only.


## Final V8 dual-variation development handoff

When Pro GPT or Codex continues dual solid-state variations, all-method-per-atom consideration, backward/forward evidence walks, optional optical/light-communication hooks, or source-specific question deduplication, read `docs/CODEX-DUAL-VARIATION-V8-HANDOFF.md` **on this exact feature branch**. Earlier AGENTS sections remain controlling for the canonical native MPC and its separate Site deployment. V8 has a SQLite derived review ledger and is not hosted persistence or an authenticated bug bounty scanner.

Keep the original 24 native evaluators and older hooked framework registries independent from the 239 MHA research candidates; `956 per atom` counts four **consideration** slots, not 956 actual tests. Reopen unchanged evidence only for genuinely new declared cross-reference source material, retaining prior source/subject/variation identities. Never promote optical analogies, method agreement, BitSet signatures, tool-call authentication, inferred intent or model results into a source-authenticated finding. The user's `32/356` dimension descriptor is pending native provenance reconciliation and must not overwrite the preserved BL32/384 or 25-coordinate definitions.


## V9 ChatGPT native connector bridge (additive, development)

When asked to bridge connected ChatGPT apps and MPC methods, read `docs/CHATGPT-CONNECTOR-BRIDGE-V9.md` and `connector-bridge/source-pointers.v9.json` first. Resolve live controller state from native Drive or equivalent current source; do not treat a Dash index of a Google Drive object as an independent witness or canonical promotion. The in-chat host orchestrates actual plugin calls. The private MPC BugTools service currently reports no hosted persistence or connector dispatch; Cloud tool exposure remains independently checked.

`lib/chatgpt-connector-bridge.mjs` is a pure capability/identity mapping module, not network dispatch. GitHub development commits do not deploy Sites; a bridge locator does not establish target permission, new authentication, written checkpoints, or Source-of-Truth change. Keep canonical MAXVAR/NESTMAX/BL/MBSS/EXT, original PASSES and source IDs intact. Read back writes when expressly approved and report the exact persisted native ID.


## V10 Native source-identity falsifier and minimal read planner

Read `docs/CHATGPT-CONNECTOR-BRIDGE-V10-NATIVE-GATES.md` after the earlier V9 connector bridge docs. A Dash projection (or other search index alias) is **never** a native Drive or Dropbox read receipt. The new bridge fails closed when the controlling native pointer has only a projection and rejects records that falsely declare themselves direct native sources for unrelated IDs. Prefer at most three source-bound native reads per pass, and use current session capability checks; no automatic connector dispatch or target activity. Retain all original MPC/Machine Legal methods, BL/MAXVAR/MBSS registries, typed source IDs and PASS structure. Test on the V10 branch before merging into PR #7; do not deploy private Sites or overwrite the canonical Drive/Dash controller.


## V11 SQLite strategy, native mirrors and dimension-source boundary

For SQLite tricks, mirrors, reverse method dependencies, or the user's `32/356` dimension phrase, read `docs/SQLITE-MIRROR-DIMENSIONS-V11.md`. This is an additive **development-only** quality-control layer. The native pinned registry remains BL 32 branches/384 child checks, 25 object coordinates, 14 jacket axes and 15 native MIRROR declarations; 356 has not been verified as a canonical independent dimension count and must not be invented, renumbered or substituted. All previous source, classifier, GPT/Codex and PASS contracts persist.

The V11 CLI adds `sql-audit`, `reverse-links`, `mirrors`, and `dimension-audit`. SQL strategies return read-only execution-plan/integrity diagnostics and bounded inverse relationships; mirrors return source-bound **review candidates**, not independent truth. Verify performance only from actual same-host tests at exact branch commits. Never automatically install FTS5, enable SQLite optimizer writes on native private storage, run target traffic or deploy private MPC Sites due to a speculative performance suggestion.


## V12 derived Atlas semantic integrity and complete query disclosure

For method-on-method audits, SQLite cache content integrity, and candidate discovery completeness read `docs/METHOD-ON-METHOD-SEMANTIC-INTEGRITY-V12.md` on this development branch. The derived SQLite Atlas's `INSERT OR IGNORE` metadata and matching table counts are insufficient to prove actual row values match the current versioned method/source/trigger/classifier/crosswalk/relation/taxonomy inputs. `verifyCurrentAtlas` now produces seven-table semantic fingerprints, and `audit-seed` reads corrupted caches without altering them. A matching local SHA-256 proves only parity with bundled repository data, **not** authenticity of scientific publications or bounty target records.

The route discovers at most 512 candidate matches; exceeding that budget is a hard error, never silent truncation. Preserve original 239 Atlas candidate and separate 24 implemented hosted evaluator inventory. Do not promote method matches to executed models or change native MAXVAR/NESTMAX/BL/MBSS/EXT IDs. Run dedicated V12 and complete Node/SQLite tests/build on the branch before merging and do not delete or overwrite a suspect cache to suppress a failure.


## V13 Noah's Ark OSI-inspired reasoning with Drive workbook and notebook

Read `docs/NOAHS-ARK-REASONING-OSI-V13.md` and `connector-bridge/reasoning-artifacts-v13.json` when the task asks to reason over all methods, compare outcomes, use a Drive workbook or run the notebook. Reuse original Method Atlas and the current native 24 evaluator/MPC Research OS inventories separately; do not rename or double-count methods, or replace original BL32/384 and 25-coordinate registers. The seven reasoning layers are an OSI-inspired **analytical responsibility separation**, not network protocol implementation or physical optical processing.

`lib/noahs-ark-reasoning.mjs` + local CLI `reason` consider all 239 source-linked MHA research candidates for one typed atom but select only a bounded, explicitly ready and falsifiable plan. Negative controls and comparator links are caller-supplied **unverified research inputs**; neither selection nor multiple agreeing methods authenticates a bounty finding. The new noncanonical Drive workbook and offline Jupyter notebook are development evidence/planning artifacts. They do not synchronize automatically with hosted Sites or change canonical Drive PASS control. The eight malformed optical cross-reference IDs have been repaired on this branch; the full 212-link ID validation is mandatory before merge.

Run dedicated `tests/noahs-ark-reasoning.test.mjs` and `tests/method-relations-integrity.test.mjs`, full Node suite and build, and optionally the notebook in the prepared Codex Cloud environment. Preserve exact current Git HEAD, readback receipts, unresolved source and method inputs. No automatic target traffic, deployment, merged PR or production use.

## V13 operative controllers in regular ChatGPT

When the user asks for operative controllers, regular-chat execution, or the
GitHub-to-MPC bridge, read `docs/CHATGPT-MPC-OPERATIVE-CONTROLLERS-V13.md` and
`connector-bridge/operative-controllers-v13.json`. Use the existing supported
GitHub, native source, and MPC plugins in the current chat. Preserve their
current registered schemas and the user's original canonical controllers.

`lib/noahs-ark-controller.mjs` and `scripts/noahs-ark-controller-cli.mjs` provide
versioned operative state: typed source/readiness gates, explicit bounded
adaptation to a native MPC evaluator, executable negative controls, challenger
results, selective resume, and native checkpoint write/readback. The chat host
performs the actual connector calls and supplies their exact receipts. The
controller does not add network dispatch to the hosted Site. Receipt hashes
prove content parity only; a complete development controller does not prove a
security finding or replace the canonical Drive PASS controller.

Resolve the current Git code revision and latest validation receipt before
execution. Do not assume a chat has Node/source execution because a previous
chat did. If source execution is unavailable, retain that boundary and continue
only the supported native MPC operations. Never claim the V13 planner or
controller ran solely from reading its instructions. New GitHub MHA definitions
remain planning candidates until a supported native evaluator schema and exact
source-bound model are supplied; preserve existing method IDs and prior work.

The V13 validation restores the previously tested V8 repairs from
`b5e6e6ae4100d73add56176645e9b58e4a4e7e49`, preserving V11 indexes and V12
seven-table parity diagnostics. Normal cache admission fails closed on schema,
seed or row drift; `audit-seed` remains read-only. Preserve old cache files.
The notebook selects a source-derived cache path and records its actual host,
code revision, worktree state and three executed synthetic scenarios separately
from the workbook's four historical authored planning rows.
