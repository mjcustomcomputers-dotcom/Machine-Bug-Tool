# Codex — current MPC V13 source and connection handoff

Continue `mjcustomcomputers-dotcom/Machine-Bug-Tool` on
`feature/noahs-ark-reasoning-osi-v13`. This is a source and connection update to
the existing prepared environment. The V13 validation and synthetic operative
controller pass are complete. Preserve that state and resume only a real new
dependency or an explicitly requested source change.

Read this guide and [codex-resume-v13.json](../connector-bridge/codex-resume-v13.json)
at the actual latest development branch head. They supersede the old
pending-validation directions for this continuation. Original handoffs and
native PASS records retain their historical meaning.

## 1. Resolve the three source identities

| Role | Verified reference before this handoff update |
|---|---|
| Reporting branch head containing completed receipts | `54e8d055aa6d71e1c91f33a7af9f282333890358` |
| Tested executable source, `S` | `4ffde83e587db829b9cd2124c0a8587e868402d6` |
| Native development checkpoint with exact readback | `047b2adcd2172374d25878998eebb3b089b6488d` |
| Review | PR #11, stacked on PR #10 |

Resolve the current reporting head, `R`, through the existing GitHub connection.
Read current `AGENTS.md`, this guide, the resume manifest, and these records at
`R`:

- [Validation](validation/MPC-V13-VALIDATION.json).
- [Completed state](validation/MPC-V13-OPERATIVE-STATE.json).
- [Checkpoint payload](validation/MPC-V13-OPERATIVE-CHECKPOINT.json).
- [Current operative instructions](CHATGPT-MPC-OPERATIVE-CONTROLLERS-V13.md).
- [Versioned source locators](../connector-bridge/source-pointers.v9.json).

Derive `S` from both the validation's `tested_commit` and saved state's
`config.source_revision.commit`; require agreement. Execute the controller in
an exact `S` checkout. Read documentation and receipts at `R`, including later
documentation corrections. Do not move the user's working checkout backwards
or relabel reporting commits as tested executable code.

The CLI checks actual Git HEAD. Running the saved `4ffde83e...` state from the
reporting head produces `CHECKOUT_COMMIT_MISMATCH_REBIND_CONFIG` even when code
files are identical. Create a separate worktree at `S`; do not hand-edit the
saved source identity to suppress this guard.

## 2. Preserve the prepared environment

Keep Node 24.19.0, pinned pnpm 11.25.0, `pnpm-lock.yaml`, the dependency policy,
saved `install_script`, and saved `start_skill`. The reported Cloud checkout
uses `XDG_CONFIG_HOME=/workspace/Machine-Bug-Tool/.sites-runtime/config`.
Keep that saved override; a separate execution worktree uses its own
`.sites-runtime/config` directory. Do not reinstall or republish the environment
for a documentation/source refresh alone.

Inspect local Git status before fetching. Preserve local changes, old cache
files, controller history, the original private Sites binding and the existing
project. If Git fetch is supported by the destination's configured repository
connection, fetch the named branch without changing the working tree:

```sh
git status --short
git fetch --no-tags origin refs/heads/feature/noahs-ark-reasoning-osi-v13:refs/remotes/origin/feature/noahs-ark-reasoning-osi-v13
git rev-parse refs/remotes/origin/feature/noahs-ark-reasoning-osi-v13
```

If only the native GitHub connector is available, use its actual file/Git-object
reads and retain exact commit, blob and mode identities. Do not add credentials
to Git URLs or invent a private API route. A missing source object or denied
fetch is a named source-access dependency, not a reason to use the older Cloud
snapshot as current source.

## 3. Restore and inspect the existing controller

After resolving `R` and `S`, use a new execution directory. This example uses
the currently validated `S`; confirm it still agrees with the current records
before running it:

```sh
git worktree add --detach ../Machine-Bug-Tool-v13-tested-4ffde83e 4ffde83e587db829b9cd2124c0a8587e868402d6
```

If that directory exists, inspect it and either reuse an exact clean `S`
checkout or choose another unused path. Never reset, remove, or overwrite an
occupied worktree. Reuse prepared dependencies when the package manifest,
lockfile and workspace dependency policy match; keep runtime files local.

Fetch `docs/validation/MPC-V13-OPERATIVE-STATE.json` at exact `R` through GitHub
and retain its returned native version/blob. Restore its exact bytes under the
`S` checkout as `.sites-runtime/controllers/v13-resumed.state.json`, using
exclusive creation or an unused filename. If an existing state is present,
preserve and inspect it rather than replacing it. Verify copied bytes against
the retrieved content. This is the existing controller, so do not run `init`
or `prepare-fixture`.

From the exact `S` checkout:

```sh
node --version
pnpm --version
node scripts/noahs-ark-controller-cli.mjs verify .sites-runtime/controllers/v13-resumed.state.json
node scripts/noahs-ark-controller-cli.mjs status .sites-runtime/controllers/v13-resumed.state.json
node scripts/noahs-ark-controller-cli.mjs next .sites-runtime/controllers/v13-resumed.state.json
```

The preserved state has integrity
`a00a3e031ba1156471b33f00a5cb95e499a596caf1eee780c9c10f447f2362ae`, revision 1,
event sequence 6, four completed model obligations and six retained receipts.
Expected `next` is `COMPLETE`, `action: null`, with no blockers. These read-only
commands must leave state bytes and history unchanged. They verify local saved
state, not the current destination's hosted authentication.

## 4. Check the actual destination connections

Use the existing supported plugins and registered schemas. Keep source code,
MPC calculation, native source access, Cloud publication and Daybreak selection
as separate statuses. [The current connection receipt](validation/MPC-V13-CODEX-CONNECTION-STATUS.json)
records observations from the updating ChatGPT session; it does not transfer
access into a new Codex task.

| Surface | Check in the destination | If unavailable |
|---|---|---|
| GitHub | Read the exact branch, validation and saved state; record native versions | Preserve local work and name the source-access boundary |
| Source execution | Actual Git HEAD, Node/pnpm and the read-only controller commands above | Record `CONTROLLER_EXECUTOR_UNAVAILABLE` |
| Hosted MPC | `runtime_status`, protected `get_universal_contract`, and `get_method_catalog` for the selected native method | Record tool exposure separately from authentication; continue independent source work |
| Protected evaluator | Retain an actual same-session bounded evaluator receipt; if none exists, read its current schema and perform one explicit synthetic connection check | Do not claim a model ran or copy another session's authentication |
| Google Drive | Read the exact native object required for the next action; preserve native ID, owner, version and content | Retain the unresolved source gate; a Dash projection cannot replace this read |
| Dash | Check available sources and use bounded discovery when needed | Keep discovery optional to source-only work |
| Native Dropbox | Read a known native file ID when actually required | An empty search does not prove a backup exists |
| Daybreak Blue | Record the actual offering/selection if the interface exposes it | Keep selection `NOT_VERIFIED`; do not infer entitlement from a prompt |

For this saved controller the native evaluator is `finite_invariant`, catalog
1.2.0. Its four obligations used three distinct hosted calculations, including
one explicitly reused negative control. Preserve the original call/session
receipts. A fresh connection check is separate from those completed model
obligations and must not reset or repeat the V13 demonstration.

Current hosted MPC has 24 evaluators, 10 original research hooks and 17
transformations. The 239 MHA/MHC entries remain additive research candidates.
The hosted service reports no connector dispatch or hosted persistence; the
host invokes native tools and stores authorized checkpoints. Do not recreate
the plugin, alter credentials, manufacture identity headers, or assume a bare
Site URL authenticates a Codex client.

## 5. Continue only changed dependencies

For a connection-only update, leave the completed controller untouched and
write a separate capability observation with the current session and actual
results. For deliberately resumed work, construct a fresh config from the
saved config and actual native-source/capability receipts using the
[existing receipt contract](CHATGPT-MPC-OPERATIVE-CONTROLLERS-V13.md).
The host performs that construction; there is no `refresh` or `hydrate` CLI
subcommand.

Keep the source commit at the actual executable checkout and preserve original
receipt references. Reconcile against the existing state:

```sh
node scripts/noahs-ark-controller-cli.mjs reconcile .sites-runtime/controllers/v13-current.config.json .sites-runtime/controllers/v13-resumed.state.json
node scripts/noahs-ark-controller-cli.mjs next .sites-runtime/controllers/v13-resumed.state.json
```

Reconciliation can create a new revision and checkpoint obligation even when
all model results are reusable. Use it when advancing actual work, not merely
to make a completed connection check appear to be a new PASS. Perform only the
returned supported action, record its real receipt, follow explicit result
reuse, and verify exact native readback for authorized checkpoint writes.

Before a new checkpoint write, read the current development branch head and
refresh `checkpoint_target.version` from that exact observation. Use the
supported GitHub previous-version/`expected_sha` check with `force: false`.
If the branch changes concurrently, preserve the state and reconcile the new
native version. Do not overwrite it or reuse a historical expected version.

Changes to the original bound `operative-controllers-v13.json` manifest,
native source versions, method definitions, adapters or model inputs can change
dependencies. The separate Codex resume manifest is navigation, not a
replacement native research controller. Resolve current Social Deal or KOMOJU
controllers from their native source before any later project work.

New methods can be added through GitHub and ordinary ChatGPT using the existing
operative guide. Keep versioned source records, paired classifiers, required
inputs and falsifiers. A new research definition needs an explicitly supported
native evaluator adaptation before execution. This handoff does not add methods.

## 6. Preserve the completed validation and report the new observation

The recorded executable source passed 344/344 Node tests, build, 12 V13 tests,
25 controller tests, and 62 overlapping targeted tests. Five notebook Python
cells executed and repeated with actual Node CLI subprocesses. This was a
shared Python runner, not a Jupyter-kernel execution. All 182 original native
files and the private Sites binding were preserved. The full evidence remains
in [the completed PASS](validation/MPC-V13-VALIDATION-PASS.md).

Do not repeat those suites for a documentation-only update. Run the relevant
regressions and full tests/build when a demonstrated source change or an actual
destination failure requires them; record that new execution's exact commit.
The workbook's four authored scenarios and old execution label remain distinct
from the notebook's three executed fixtures. The `356` dimension provenance,
NESTMAX 174/160 descriptor discrepancy and unused `V6_METAMORPHIC` source remain
open. Preserve their namespaces and unresolved status.

Report actual reporting and execution commits, copied-state identity, read-only
restore result, each destination connector's exposure/authentication, current
model selection if observed, files changed and exact next action. Preserve the
original PASS structure. No automatic merge, Sites deployment, target traffic,
credential change, canonical Drive overwrite or bounty submission is authorized
by this handoff. Synthetic results remain synthetic.

## Product behavior checked for this handoff

Official [Cloud environment guidance](https://learn.chatgpt.com/docs/environments/cloud-environments)
distinguishes repository refresh from environment republishing and says existing
tasks retain their saved state. Use the existing published environment. A real
environment configuration change needs its own supported edit/republish and
fresh-task verification; this GitHub documentation update does not perform it.

Official [MCP guidance](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
distinguishes hosted plugin tools from MCP configuration shared by local Codex
clients on the same host. Observe the actual tools in each destination. Network
allowance and a saved server URL alone do not establish protected access.
