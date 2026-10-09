# Local Codex companion contract

Use this only when the local `mpc-security-assistant` MCP server is actually connected. The companion is Node source in Machine-Bug-Tool, not a foundation model or a replacement hosted service.

With Node 22.13 or newer installed, `node scripts/start-mpc-security-assistant.mjs --workspace <absolute-evidence-directory>` starts its STDIO server. `--check` loads and checks the runtime but does not prove a Codex connection. `scripts/Connect-MpcSecurityAssistant.ps1` registers it with existing Codex; optional `-Workspace` and `-ServerName` arguments select evidence root and registration name. It preserves an existing server with the same name. Use the repository guide for setup.

Start with `assistant_status` and `get_universal_contract`. The initial inventory is 27 tools: 20 native entries plus seven assistant operations. Follow the actual returned schemas.

| Tool | Input and outcome |
| --- | --- |
| `assistant_status` | Empty object; actual source fingerprint, workspace, counts, model observation, session limits. |
| `assistant_acquire` | `relative_path`, `engagement_id`, `owner`, `source_identity`, `subject_identity`, `declared_version`, `source_kind`. Reads one bounded UTF-8 file inside the workspace; returns `ACQ:` receipt. |
| `assistant_analyze` | `acquisition_id`, `tool_name`, optional `arguments_pointer`. Selects arguments only from acquired JSON and executes a native analysis. Empty pointer selects the document; `/native_args` selects that member. Returns `ANA:` only on complete execution. |
| `assistant_decide` | `analysis_id`, `disposition`, `rationale`, `falsifier`, `limitations` (nonempty list), `next_action`; optional `supersedes_decision_id`. Records an immutable `DEC:` review receipt. |
| `assistant_invalidate` | `acquisition_id`, `reason`. Retains history, invalidates acquisition and derived receipts; repetition is idempotent. Reacquisition creates a new identity. |
| `assistant_self_test` | Optional integer `seed` and `rounds` (1–8); bounded synthetic checks and six stage permutations. Diagnostic response is **not** a stored `analysis_id`. |
| `assistant_read_receipt` | `receipt_id`; reads session history and rechecks file and engine bytes. |

Each identity is `{namespace, native_id_type, native_id}`. Type is `string` or `integer`, matching the value. Source kind is `LOCAL_SOURCE`, `EXPORTED_SOURCE`, or `SYNTHETIC_FIXTURE`. Remote owner/version remain caller declarations until verified independently.

Allowed analyses: `evaluate_method`, `validate_evidence_packet`, `review_atomic_variants`, `route_problem`, `analyze_business_logic`, `business_logic_sweep`, `compare_operative_states`, `refine_counterexample`, `delta_plan`. Direct native calls have untracked envelopes and cannot supply an `analysis_id`. A plan nested in a successful route remains incomplete.

Dispositions are `READY_FOR_REVIEW`, `NEEDS_EVIDENCE`, `REJECTED`. Exact current decision replay reuses its receipt. A changed decision requires `supersedes_decision_id` equal to the current decision receipt; history remains. It does not adopt a target finding or authorize external action.

Files are bounded to 512,000 bytes; sessions to 32 acquisitions, 64 analyses, and 64 decisions. Invalid JSON, duplicate keys, invalid typed IDs, traversal, symlinks, stale evidence, changed source, and skipped analysis fail without creating a completed analysis receipt. Save raw sources and returned receipts through authorized host tools.

The process has no target network or arbitrary shell tool and adds no API key or inference. State is in memory; restart requires reacquisition and replay. Runtime byte changes require restart so a cached engine cannot be labeled as new code. This boundary does not defend against an administrator controlling the machine.
