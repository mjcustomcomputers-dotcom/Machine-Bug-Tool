# MPC Workspace — integration build pack

Updated for Nate on 2026-10-09. This pack gives the existing Machine-Bug-Tool development task a source-grounded implementation contract, tested foundations, and the new runnable local Ollama chat code at repository root. The full assembled desktop application and Windows installer remain receiving-build acceptance.

## Start here

Paste `FINAL-CODEX-PROMPT.txt` into the existing Codex task. It adds exact host-connector, transfer and numerical-review integration work to the complete `CODEX-BUILD.txt` contract. Codex should continue the working checkout, preserve in-flight changes, and integrate the exact source components identified in `evidence/native-source-manifest.json`. To use the new local chat directly, follow `LOCAL-CHAT-README.md` at repository root and open `OPEN-MPC-LOCAL-CHAT.cmd` from the extracted updated build. Keep the existing installed Windows folder intact during review.

The product is **one Windows command center** with a cross-platform core: chat and pasted-data analysis; project and evidence search; the existing MPC methods; a local SQL workspace; reports and triage; visible model selection; and real connection management for local and remote tools. The existing ChatGPT MPC plugin is another interface to the same versioned instructions and methods.

## What this pack contains

| Path | Purpose |
| --- | --- |
| `FINAL-CODEX-PROMPT.txt` | Complete updated receiving prompt, including the working Ollama code and exact next integration jobs. |
| `CODEX-BUILD.txt` | Complete implementation order, integration constraints, user experience and acceptance criteria. |
| `assistant/INSTRUCTIONS.txt` | Portable assistant behavior, adapted from the existing V17 instructions. |
| `assistant/PROFILE.json` | Editable command-center profile; a configuration specification, not an installed account GPT. |
| `config/provider-profiles.json` | Explicit local and hosted model configuration contracts. |
| `config/connections.json` | Connection wizard and per-host state definitions. |
| `config/design-tokens.json` | Forest-at-dusk and neon visual theme with readable controls. |
| `lib/control-contracts.mjs` | Pure model-selection and connection-state starter functions. |
| `lib/snapshot-compare.mjs` | Exact source-manifest comparison with partial/unavailable coverage preserved. |
| `sql/001-command-center.sql` | Separate command-center database schema. Never apply it to the legacy Workbench database. |
| `tests/` | Focused synthetic contract and temporary-database tests. |
| `docs/USABILITY-AND-INGEST.md` | Clipboard, attached folders, snapshot comparisons, conversation and manual scripts. |
| `docs/ARCHITECTURE.md` | Local desktop, sidecar, model, app, SQL, search and update decisions. |
| `docs/STARTER-API.md` | Exact implemented APIs, identity fields, and host integration boundaries. |
| `docs/PLATFORMS.md` | Current platform choices and primary documentation. |
| `docs/METHODS.md` | Method priorities and experiments that can demonstrate an improvement. |
| `docs/CAPABILITY-REVIEW.md` | Current source audit, supported differentiators, counterexamples and precise remaining quality gates. |
| `research/methods.json` | Eleven research proposals, fourteen primary-source records, schemas and falsifiers. |
| `evidence/` | Exact source lineage, hosted MPC input/output, and build-pack validation. |

## Actual source composition

These were separate draft PRs when acquired. A newer branch must be compared before implementation; this list does not claim they have been merged.

| Component | PR | Acquired commit |
| --- | --- | --- |
| Operative work triage | 17 | `0f8bc5eec399f729d03e262ee9a90b18c1a825f4` |
| Local Ollama reasoner | 16 | `4ca57ff6c589176576270db5f2d2aa8259bdbda6` |
| Security Assistant | 15 | `297f586a3828c6d50b783fe1fdce766bce5344cd` |
| Research Workbench v2 GUI/SQL | 11 | `ad364e6ba531382343b8edeb22e3843eaa7d70a9` |

The shared V16 source is `e6f5ed4269743b423e64b06a7ccb9ad7a3f62dfa`. The Workbench has unique GUI/store changes outside the later V17 reasoner tree. The existing Workbench validates its complete SQLite schema and HTML bundle identity: adding new tables to that file breaks its admission checks. This pack therefore specifies a separate database and an explicit future import path.

## Run the included checks

From this pack directory, using an existing Node and Python installation:

```text
node --test tests/*.test.mjs
python3 tests/test_command_center_sql.py
```

On Windows, `py -3 tests\test_command_center_sql.py` is an alternative when the Python launcher is installed. The tests create synthetic inputs, snapshot manifests and temporary databases; they do not call a model or a connected service. The existing repository requires its own full `node --test` and `npm run build` gates after integration, using its pinned environment.

## Build status

Read `evidence/build-pack-validation.json` for the original foundation checks and repository-root `docs/validation/MPC-LOCAL-CHAT-VALIDATION.json` for the new local chat integration checks. Preserve the scopes and historical counts separately. Source tests do not establish Windows execution, installed model weights, Daybreak entitlement, OAuth connections, a published plugin update, or deployment. Those acceptance steps have specific expected outputs in `CODEX-BUILD.txt` and `FINAL-CODEX-PROMPT.txt`.
