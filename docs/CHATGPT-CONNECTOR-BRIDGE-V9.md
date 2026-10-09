# MPC ChatGPT Connector Bridge V9 — exact-resume operating runbook

**This is an additive conversation/connector orchestration surface, not another MPC registry, a merged production release, or an autonomous connector dispatcher.**

## Observed connectors in the originating ChatGPT session (2026-10-08)

| Surface | Observed result | Native ownership | Write / dispatch limitation |
| --- | --- | --- | --- |
| MPC BugTools | HOSTED_MCP_READY, runtime 0.10.0-http.1, 20 tools | Existing private hosted MPC | `connector_dispatch=false`, `persistence_hosted=false` |
| MPC Machine Legal | Installed skill available | Existing canonical Research OS / Drive control | Separate native source verification |
| Google Drive | Live MPC/MBSS/Social Deal/KOMOJU search successful | Google Drive exact native object ID/version | Connected writes require explicit action and readback |
| Dropbox Dash | Search returned Google Drive-backed MPC documents | Native Google Drive object where the underlying source is Drive | READ ONLY; Dash UUID is an index, not a second independent source |
| Dropbox | MPC keyword search returned zero results | Dropbox (when actual Dropbox native file retrieved) | Native pointer unresolved; do not fabricate a folder or assume none exists |
| GitHub | Private Machine-Bug-Tool PR #6 accessible | Native Git objects/commit IDs | Development branch only; does not deploy private Sites |
| Codex Cloud | Earlier reported/restoration receipt | Separate destination filesystem | Cloud has not independently exposed hosted MPC tools or these current source integrations |

## Exact source pointers, NOT a declaration of current canonical superiority

Machine Legal MBSS compiler: Google Drive `1jdk4SspRWpCcIszslg0-9Y6STzrF_7veJ-LAh8igKTg`.
MBSS registry: Google Sheet `1xKXfOGpWCpoL7AVc7ueYH-FIktGp8VZfn-l6rqrXNqU`.
Social Deal Source Register: `1-PkmF-4QLr5rZ4XTTxOjiBJlxZGkYFbvQypl69N6mhA`; Hook Log `1Yl3D6FdLkJvJpR_SD1a-lssSgYgPRFHE1N8Ra7eO5jk`. Cached Hook Log `1__-0ZARv-R4FNs5n2pjOhprMrbNuDjX5Bd9UZzI_plY` is not automatically authoritative over native register.
KOMOJU Checkpoint 001: `1nLyRGtDf7DWMS3QGB28AvD9AFuG6n9JyhJ1Dy5-2n3s`; status remains source-owned and program-rule gated.
GitHub Source: `mjcustomcomputers-dotcom/Machine-Bug-Tool`, V8 branch `feature/atomic-dual-variation-v8`, original receipt/head `47b251c4aede803f8de4e3a7185ee63f2969d9fd`; V9 development branch is new and must remain isolated.
Full ID/status manifest: `connector-bridge/source-pointers.v9.json`.

## Intended ChatGPT operation

1. The user opens an ordinary conversation and enables the available Google Drive, Dropbox Dash, Dropbox, GitHub, MPC Machine Legal and MPC BugTools connections. Do not assume app entitlements, Cloud tool exposure or a model picker choice transfers automatically.
2. At **session boot**, verify only actual exposed registered tools and read the current controlling Drive/Machine Legal checkpoint by native ID. Read recent cache only as a pointer/projection and resolve conflicting controller versions as BLOCKED or READ-ONLY. Do not repeat a catalog-wide search if a valid checkpoint gives exact IDs.
3. Source ladder: authoritative structured controller (when available) -> current native Google Drive and platform records -> verified signed/complete source files -> exact latest checkpoint -> Dash search projection -> chat memory as provisional locator.
4. A search through Dash that returns `connector_type=googledrive` is a **projection of Google Drive**, not another source. Resolve to the native Drive ID and compare actual version/digest. Do not infer a duplicate or corroboration from name equality. Dropbox files retain their native file IDs/path namespaces and revisions.
5. ChatGPT orchestrates actual host calls. Hosted MPC is a **supplied-record finite method/registry tool**, not a connector gateway. Use `runtime_status`, `get_universal_contract` once where needed and registered individual schemas. No invented POST request or fake authentication header. Use the actual Google Drive, Dropbox, Dash and GitHub connector schemas separately.
6. Put source-bound atoms through existing canonical classification, then the V8 development Atlas only if it is actually executed/validated in a supported environment. Forward/backward, internal/external source review remain **consideration only** unless a method genuinely executes. Keep tests and native program rules separate.
7. For persistence: prepare a hash-bound private packet with MPC `prepare_research_backup` when its schema matches; actual write needs an authorized storage connector, exact native object ID/version, verified readback and retention rules. Dash is not a writable archive. Dropbox alone can store a native file only through an actually exposed supported write action. Do not cross-post private target evidence to GitHub.
8. GitHub is the source-code/contract surface; use branch/commit pin, PR review, tests and Sites reconciliation. Do not silently merge the stacked PRs or deploy the private service.
9. At close, persist only compact `CHECKPOINT_ID, TASK, FRONTIER, PINNED_SOURCES, COMPLETED_THIS_PASS, OPEN, BLOCKED, CHANGED_STATE, NEXT_ACTION, DO_NOT_REPEAT`. Every checkpoint must specify where it was written and the exact readback; if the write did not occur, say so.

## Portable V9 code contract

`lib/chatgpt-connector-bridge.mjs` provides pure `reconcileConnectorRecords` and `planConnectorDispatch` functions. They **never call external services**. `reconcileConnectorRecords` accepts caller-supplied native identities/projections and classifies projection-only, conflicting versions and direct source presence; `planConnectorDispatch` requires current per-session declared capability and marks consequential writes/target tests as needing separate human/native authorization and receipts.

This is a **capability/source map**, not hosted connector wiring. Hosting an autonomous connector broker would require a supported API/authentication design and rigorous per-user scopes, which is **not** implemented here. The current conversation's host connectors already provide read/search and some explicit actions; use those instead.

## Codex validation

Read `AGENTS.md` and this file on the V9 development branch. Run `node --test tests/chatgpt-connector-bridge.test.mjs`, `node --test`, `npm run build` in prepared Node 24 / pnpm 11.25.0 environment. Prove native Drive + Dash indexed duplicate dedup, wrong native ID separation, source version conflict blocked, insufficient capability blocked, and original source/registry non-regression. Do not claim this validated hosted MPC integration.

Keep this V9 contract as the chat-facing handoff, and continue bug bounty tasks only under each platform's explicit rules. The model selection/security hardware key protects account access but confers no target authorization.
