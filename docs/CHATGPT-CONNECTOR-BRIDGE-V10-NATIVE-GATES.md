# MPC Connector Bridge V10 — native authority, falsification and minimal source recovery

**A bounded bug-fix pass, not another MPC Method Atlas.** Parent: PR #7, branch `feature/chatgpt-connector-source-bridge-v9`, commit `9fb84e208817953cf792c54ff47aa9123fa06267`. Preserve canonical MAXVAR / NESTMAX / BL / MBSS / EXT, all native Drive controller pointers, separate GitHub / Sites and all existing PASS/checkpoint formats.

## What the adversarial check actually found

Two supplied-record falsifiers reproduced against the original V9 JavaScript:
1. A `current_pointer` found **only as a Dash-indexed projection of Drive** produced overall `READ_ONLY_SOURCE_MAP` even though the group was `PROJECTION_ONLY_UNVERIFIED`. V10 returns `BLOCKED_POINTER_NOT_NATIVE` until an actual native source record is read.
2. A record labeled `surface=GOOGLE_DRIVE` whose own `native_id` was different from `projection_of.native_id` could be counted as `NATIVE_SOURCE_PRESENT` for the wrong item. V10 rejects direct-record projection claims, provider/projection mismatches, malformed projection shapes and cross-surface records missing an explicit projection binding.

A third safety boundary: `TARGET_TEST` is now categorically `OUTSIDE_CONNECTOR_BRIDGE_SCOPE`. A caller-supplied capabilities list cannot authorize live target actions.

These are defects in the **synthetic/source-mapping code**, not claims about weaknesses in Google Drive, Dropbox Dash or external sites.

## New source recovery planner

`lib/connector-native-frontier.mjs` exposes `planNativeSourceFrontier` for a caller-supplied reconciliation receipt. It orders actionable native checks by: **current controller first**, then conflicting native revisions, projection-only native gaps, possible indexed version divergence, then ordinary source verification. At most three suggested reads per bounded pass.

The plan never calls tools. It requires the exact current-session native connector capability to suggest a host read; otherwise it returns `NATIVE_READ_CONNECTOR_UNAVAILABLE`. It does not silently substitute Dash for Drive. Unsupported MPC specialized services are flagged outside the generic file-reading ladder, not represented as Drive files.

`already_read_keys` avoids duplicate source requests only within a supplied session and when a direct native source is already present without a potential indexed version mismatch. That is an efficiency hint, **not** a freshness certificate, authenticated read receipt or guarantee that the source cannot change.

### Contradiction gates and record states

- `PROJECTION_ONLY_UNVERIFIED` / `BLOCKED_POINTER_NOT_NATIVE`: cannot advance from an index alone.
- `CONFLICTING_NATIVE_VERSIONS`: fail closed until current native owner/version is resolved; no source pointer overwritten.
- `projection_version_difference_requires_review`: version label differs between index and native record; flags review, but may be different clock/version semantics and is not independently proof of stale data.
- `NATIVE_SOURCE_PRESENT` / `READ_ONLY_SOURCE_MAP`: native locator exists in supplied records, **not cryptographic source authentication**. The actual ChatGPT host must read exact native document metadata and content before consequential decisions.
- `TARGET_TEST`: not an operation of this source bridge and never conferred by external app capability declaration.

### Exact source pointers carried forward unchanged

- Google Drive MBSS compiler: `1jdk4SspRWpCcIszslg0-9Y6STzrF_7veJ-LAh8igKTg`.
- MBSS sheet: `1xKXfOGpWCpoL7AVc7ueYH-FIktGp8VZfn-l6rqrXNqU`.
- Social Deal native source register: `1-PkmF-4QLr5rZ4XTTxOjiBJlxZGkYFbvQypl69N6mhA`.
- Social Deal hook log: `1Yl3D6FdLkJvJpR_SD1a-lssSgYgPRFHE1N8Ra7eO5jk`.
- KOMOJU Checkpoint 001: `1nLyRGtDf7DWMS3QGB28AvD9AFuG6n9JyhJ1Dy5-2n3s`.
- GitHub: this private development branch (NOT automatically deployed). Separate Dropbox native backup locator remains OPEN.
- The V9 source-pointer manifest `connector-bridge/source-pointers.v9.json` is retained as a historical *locator* receipt, not a canonical state declaration.

## Correct ChatGPT workflow after this is validated

1. In a conversation with the user's existing MPC, Google Drive, Dropbox Dash, Dropbox, GitHub and optionally Airtable connections, inspect only the currently available exposed tool schemas. Connection status is session-specific.
2. Resolve current live controller from actual native Drive/current structured control; **Dash is for search and cross-source discovery only** when indexed results originate in Drive.
3. Build typed native source records and run `reconcileConnectorRecords`. Block any index-only controlling pointer or conflicting native source state.
4. Use `planNativeSourceFrontier` with current session capabilities to choose up to three **suggested native reads**. The ChatGPT host must execute reads separately using actual connector calls, then compare native ID/version and record a read-back receipt; no automatic dispatch is claimed.
5. Recover the exact project PASS and source-owned atom/classifier frontier, run only applicable available MPC tools, preserve falsifiers and the canonical project state.
6. Write checkpoints only through separately authorized native storage tools and read back the committed ID/version. GitHub remains code/version control; never put confidential bounty materials or tokens in the repository.
7. Do not assume Codex Cloud can use the same authenticated tools or that a GitHub merge deploys the private Sites plugin.

## Pro GPT / Codex testing handoff

On `feature/connector-native-authority-falsifier-v10` at its exact current HEAD:

```sh
git fetch origin feature/connector-native-authority-falsifier-v10
git switch feature/connector-native-authority-falsifier-v10
git rev-parse HEAD
node --test tests/chatgpt-connector-bridge.test.mjs tests/connector-native-frontier.test.mjs
node --test
npm run build
```

Run regressions for direct/projection ID and owner mismatches, index-only active controller, stale projection review, unavailable Drive connection, no-repeat session reads and `TARGET_TEST` fail-closed. Inspect original MPC native 24-evaluator and all registries for non-regression. Record exact commit, test count, failures and build outcome. Repair only actual defects on this development branch. No merge, live Sites deployment, connector writes or bounty-target traffic during this review.

### MPC falsification map

- **Identity graph / wrong object**: Direct native object != index projection UUID.
- **Evidence status / provenance**: Indexed result != authenticated source.
- **State-transition guard**: A controlling pointer must pass native authority before adjudication.
- **Adversarial counterexample**: Construct a forged alias and index-only input, then assert blocked.
- **Information-cost reduction**: Source read limited to the highest-priority 1–3 native objects, cache within the same session without claiming persistent freshness.
- **Failure-analysis stop condition**: Missing capability or conflict returns an explicit blocker, not a fallback claim.

`CHECKPOINT_ID: MPC_CONNECTOR_BRIDGE_NATIVE_AUTHORITY_V10`
`FRONTIER: feature/connector-native-authority-falsifier-v10`
`COMPLETED: isolated source-level counterexample reproduction, patched native/projection authority, bounded native-source planner and regression tests`
`OPEN: full Cloud Node suite, build, real connected-source readback gating, hosted publication`
`NEXT_ACTION: Codex run targeted/full tests and build, report defects and exact checked-out commit`
