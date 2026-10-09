# MPC Workspace: host connectors and transfer integration

Contract: `MPC_WORKSPACE_HOST_ADAPTER_1.0`  
Status: implementation instructions based on acquired native source; this document does not assert that the new host adapters or Windows connections have been installed.  
Reviewed: October 9, 2026.

## 1. Extend the existing pieces

Use the current Machine-Bug-Tool checkout and reconcile these component commits before integration. Preserve the native router, source identities, classifiers, method IDs and historical receipts. The product name is MPC Workspace; existing internal names retain their identities.

| Native component | Acquired implementation and exact source |
| --- | --- |
| Pure connector source bridge | [`lib/chatgpt-connector-bridge.mjs`](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/blob/0f8bc5eec399f729d03e262ee9a90b18c1a825f4/lib/chatgpt-connector-bridge.mjs), blob `83621e063668538dfc7592efef311ff6a06d4832`, PR #17 base component. Exports `reconcileConnectorRecords(input)` and `planConnectorDispatch({capabilities,operation,surface,object_id})`. These functions normalize supplied records and plan actions; they do not invoke connectors. |
| Native read frontier | [`lib/connector-native-frontier.mjs`](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/blob/0f8bc5eec399f729d03e262ee9a90b18c1a825f4/lib/connector-native-frontier.mjs), blob `ead29b05d4170ff563b3ca7ad96923841e05dccc`. Exports `planNativeSourceFrontier({reconciliation,capabilities,already_read_keys,max_actions})`. At most three actions are selected; actual host calls remain outside it. |
| Existing Sites connector API | [`lib/connector-contract.mts`](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/blob/0f8bc5eec399f729d03e262ee9a90b18c1a825f4/lib/connector-contract.mts), blob `f146418508b4c272a4495ec5498b6f0554b1f966`. `createConnectors(binding)` provides `getContext()` and `invoke(connectorId,actionName,args)` while preserving native outcomes. |
| Request-scoped Sites binding | [`build/sites-worker.ts`](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/blob/0f8bc5eec399f729d03e262ee9a90b18c1a825f4/build/sites-worker.ts), blob `f5589039057a3f3f221b4a5418d6a4e595e63224`; [`lib/connector-context.ts`](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/blob/0f8bc5eec399f729d03e262ee9a90b18c1a825f4/lib/connector-context.ts). The trusted runtime supplies `ctx.props.CONNECTORS`; `runWithConnectorBinding` scopes it to the request. `connectorsForRequest()` retrieves that scope. |
| Work triage | [`lib/universal-router.mjs`](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/blob/0f8bc5eec399f729d03e262ee9a90b18c1a825f4/lib/universal-router.mjs) and [`lib/evidence-workflow.mjs`](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/blob/0f8bc5eec399f729d03e262ee9a90b18c1a825f4/lib/evidence-workflow.mjs). Call `routeProblem(input)` with the native schema. Required content is bound by exact `sources[].id` and `version` to `workflow.records[]`. |
| Local MPC engine | [`lib/security-assistant.mjs`](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/blob/297f586a3828c6d50b783fe1fdce766bce5344cd/lib/security-assistant.mjs), PR #15. `createSecurityAssistant({workspaceRoot})` returns `{toolList,callTool,instructions,serverInfo,sourceIdentity}`. The assistant has seven operations plus the existing native tool entries. |
| Local MCP transport | [`lib/local-mcp-stdio.mjs`](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/blob/297f586a3828c6d50b783fe1fdce766bce5344cd/lib/local-mcp-stdio.mjs) and [`scripts/start-mpc-security-assistant.mjs`](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/blob/297f586a3828c6d50b783fe1fdce766bce5344cd/scripts/start-mpc-security-assistant.mjs). `serveMcpStdio({engine})` exposes that engine to a local MCP client. |

Fresh GitHub readback during this review found [PR #17](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/pull/17) open at `0f8bc5eec399f729d03e262ee9a90b18c1a825f4`, [PR #15](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/pull/15) open at `297f586a3828c6d50b783fe1fdce766bce5344cd`, and the build-pack [PR #18](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/pull/18) open at `e89a059761ae6cea8e08e61a1cfb0bc30b093a86`. These are separate branches; the pack does not establish that their implementations are already integrated into one build.

## 2. One application interface, explicit host adapters

Implement a narrow host service with this versioned application contract. These are application interfaces, not new native MPC evaluator IDs.

```ts
type HostSurface = 'HOSTED_SITES' | 'WINDOWS_LOCAL' | 'CODEX_LOCAL';
type Context = {
  surface: HostSurface;
  host_instance_id: string;
  workspace_project_id: string;
  connection_id: string;
  account_id: string | null; // null when absent or not supplied by the owner
  connection_revision: string;
};
type Invocation = {
  contract: 'MPC_WORKSPACE_HOST_ADAPTER_1.0';
  request_id: string;
  job_id: string;
  expected_context: Context;
  operation_class: 'READ' | 'LOCAL_ANALYSIS' | 'WRITE';
  tool: { connector_id: string | null; action_name: string };
  arguments: Record<string, unknown>;
  idempotency_key?: string; // use only where the destination supports it
};
```

Expose `discover(connectionId)` and `invoke(invocation, abortSignal)` through validated host IPC. Discovery returns actual tool names, schemas, their owner and observation time. It describes policy and available metadata; successful discovery alone does not prove a protected read. Keep exact native payload/status and a separate application receipt with the request ID, job ID, actual host context, start/end time, completion state, provider request ID when supplied, result hash, and any returned object/version. Preserve native status fields without substituting a generic green success indicator.

### Hosted Sites adapter

Use `connectorsForRequest().getContext()` and `.invoke(connectorId, actionName, args)` inside the Site server request. Validate arguments against the actual returned tool schema. Obtain the binding from the trusted runtime; never accept a binding, visitor identity header or credential from the browser. Do not cache a request-scoped binding across visitors or requests.

The existing [`scripts/connector-preview/host-binding.mjs`](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/blob/0f8bc5eec399f729d03e262ee9a90b18c1a825f4/scripts/connector-preview/host-binding.mjs) is a bounded, agent-session preview mechanism. It is not a portable Windows login or an enduring deployment credential. The current hosted `lib/mcp.mjs` dispatches native MPC tools and explicitly describes no connected-source dispatch. Adding application routes around the existing host binding is the missing integration; do not relabel the pure bridge as having done those calls.

### Windows adapter

Use a separately configured supported provider/OAuth connection, a configured remote MCP client, or selected local files. A connection working in ChatGPT cannot be assumed to share Windows credentials. Keep credential references opaque in SQL and resolve secrets only in the host's credential store.

For local MPC inside the desktop host, reuse `createSecurityAssistant({workspaceRoot})` and its validated `callTool` interface, or use the existing STDIO server through an MCP client. Pick one execution path per job; do not invoke both and create duplicate analyses. The GUI does not receive a generic shell capability.

For the existing Codex installation, [`scripts/Connect-MpcSecurityAssistant.ps1`](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/blob/297f586a3828c6d50b783fe1fdce766bce5344cd/scripts/Connect-MpcSecurityAssistant.ps1) already registers the Node STDIO server and preserves an existing same-name registration. Its `--check` stage proves local startup only; actual MCP tool use supplies connection evidence. Normal packaged GUI use should not require this script.

## 3. First connected project journey

1. Open a project, attach a local folder or paste material, and make ordinary local conversation usable immediately. Ask for project evidence only when the requested answer needs it.
2. If the task names a GitHub file or Drive snapshot, select the actual connection and exact object. Reuse cached schema/capability metadata within its validity. Resolve new schema only when needed; do not dump or reread the complete catalog before each task.
3. Perform the native read through the active host adapter. Keep provider owner, exact native object ID and its type, version/commit, content and raw receipt. A Dash hit remains a projection until the native Drive/Dropbox read is acquired.
4. Pass source-map records to `reconcileConnectorRecords`. If unresolved native reads remain, use `planNativeSourceFrontier` to choose a bounded next read. Execute the useful selected operation once, then update from its actual receipt. Do not repeat unchanged reads merely because a planner describes verification.
5. Bind acquired content to the existing route packet: `sources[]` uses the native router's fields; `workflow.records[]` carries `{source_ref,version,content}` with exact reference/version matches. Keep the richer typed native identity and its mapping in the host store. The V9 bridge accepts string IDs; unsupported native types require an explicit host mapping, not lossy number/string conversion.
6. Call `routeProblem(input)` and retain its full result. Its `fact_summary` reports availability; host extraction answers substantive questions. `runMpcWork` returns only a compact summary and a `receipt_path`; if using that CLI, read the saved full receipt before source-bound model analysis.
7. When a native `ready_call` applies, validate and execute it through the actual local engine. Alternatively use `assistant_acquire` followed by `assistant_analyze` for an AAD-tracked calculation. Render actual results and source links in the conversation. If the source already directly answers the question, save that completed answer without forcing another solver or verification loop.
8. Save the report, sources used and progress to the separate command-center store. Reopening restores the project and pending useful action. Later report uploads use their own destination receipt.

GitHub is the code/method-definition source. It is not the default destination for private evidence. Historical snapshot comparison uses the supplied snapshot comparator and explicit comparison scope; two intentionally different versions should not be passed to the current-state source reconciler and treated as an accidental identity conflict.

The host identity registry must retain owner/account scope and namespace as well as provider, native ID and native ID type. The old bridge's `native_key` combines source family and ID only; partition its input by the appropriate owner/collection context and preserve the richer identity alongside it. Do not use a legacy `native_key` as the sole global database key. Preserve integer IDs beyond JavaScript's safe range losslessly in the host record; do not coerce them into a native adapter field that cannot represent them.

## 4. Copy/paste between this chat and local Workspace

Provide **Paste**, **Import file**, **Export task**, **Copy result**, and **Save report**. Accept ordinary text immediately. An optional structured transfer format improves continuity without making JSON a prerequisite for chat.

The proposed transfer envelope is `MPC_WORKSPACE_TRANSFER_1.0`. Include a transfer ID, exporting application/version, export time, selected project mapping, objective, original text or files, exact source-manifest records, pending task, and optional native receipts. Hash each included file's actual bytes at export and import; preserve original text/line breaks. A hash checks transferred-byte correspondence, not who authored a remote record or whether a remote version is current.

Import behavior:

- Plain chat text is an imported note/task, with its observed import origin. Do not promote its descriptions of prior work into native source state.
- A pasted native object locator becomes an acquisition target. Fetch only the source needed for the selected task, through an available native owner.
- Supplied source bytes become an acquired local/exported artifact. Retain declared remote origin separately. A real native receipt may supply provenance about the earlier read, but a new local import does not itself perform a fresh remote read.
- Map the exporting project to a user-selected local project. Never overwrite an existing source or project simply because display names match.
- Treat embedded scripts as draft attachments. **Copy/Save for manual run** exports the draft; later pasted output is a separate observation. Importing a task does not execute the embedded script.
- Show duplicate transfer IDs and byte hashes and offer reuse of the imported artifact. Preserve different versions. Keep source identity separate from the subject/collection being compared.

Ordinary pasted prose stays usable for conversation. `assistant_analyze` requires executable arguments from acquired bounded JSON; when preparing a method input from prose, store a separate derived JSON packet with links to the original sources and extraction assumptions. Use its actual bytes and JSON pointer for the calculation. Do not pretend raw prose already satisfied the native evaluator schema.

## 5. Receipt restoration and reacquisition

The PR #15 assistant stores acquisitions, analyses and decisions in process memory. Its limits are 512,000 bytes per acquired UTF-8 source, 32 acquisitions and 64 analyses. Receipt reads recheck current local bytes and engine fingerprint. Runtime byte changes require a restart.

`assistant_acquire` requires `relative_path`, `engagement_id`, `owner`, `source_identity`, `subject_identity`, `declared_version`, and `source_kind`. Each identity is `{namespace,native_id_type,native_id}`; the type must match the actual value. The source kind is `LOCAL_SOURCE`, `EXPORTED_SOURCE` or `SYNTHETIC_FIXTURE`.

`assistant_analyze` accepts `{acquisition_id,tool_name,arguments_pointer?}`. It selects arguments exclusively from acquired JSON, then calls the registered native tool. `assistant_decide` accepts an actual analysis ID and records a review disposition; it does not adopt a finding or authorize an external action. A changed decision must name the current `supersedes_decision_id`.

Persist returned receipts as immutable historical data in SQL. After a process restart, restore the timeline but mark the old process handles inactive. Reacquire the unchanged retained bytes to obtain a current handle when another operation needs one; link it to the historical artifact and receipt. Record a new analysis only if it actually runs. This local reacquisition is distinct from a fresh GitHub/Drive fetch, which is necessary only when the task requires current remote state or a source dependency changed. Imported JSON containing an old `ACQ:` or `ANA:` string cannot recreate the corresponding engine Map entry.

## 6. Status and progress semantics

| Observation | Application meaning |
| --- | --- |
| Endpoint/configuration saved | Configured; no successful operation observed yet. |
| Tool schema returned | Discovery completed for that context; protected-read access remains unobserved. |
| Successful protected native read | That read succeeded for the recorded host/account/connection and object. |
| `binding_unavailable` or `request_context_expired` | Obtain a current supported host context; preserve the user's input and completed work. |
| `reauthentication_required` | Show the provider's supported account reconnect action. |
| `tool_not_found`, `tool_not_allowed`, or `connector_access_disabled` | Preserve the specific unavailable operation; unrelated local work stays usable. |
| `rate_limited` | Respect actual returned timing and the job budget; retain progress. |
| Timeout/transport failure after a write | Delivery may be unknown. Use native lookup/readback before any retry. |
| Local model unavailable | Retain draft, evidence and reports; show the actual Ollama startup/model error. |

A successful prior operation is observational status, not a prerequisite for making the first user-requested operation. Never require a successful inference before allowing first inference. Cancellation stops or suppresses work according to the actual adapter; a timeout alone is not evidence that the provider stopped.

## 7. Meaningful acceptance

Automated tests must exercise the host boundary with recorded fixtures or controlled adapters and clearly label those inputs. Real account acceptance is separate.

| Test | Required outcome |
| --- | --- |
| No cloud connections, empty project | Ordinary local chat, paste/import and saved local work are available. |
| Native GitHub read through the chosen host | Exact requested path/commit content and actual native result are retained; the bridge reports no invented fetch of its own. |
| Native Drive read plus Dash projection | One native source contributes evidence; the projection remains an alias. Missing native read remains unresolved. |
| Same display ID, different native type or owner | Records remain distinct; unsupported legacy-bridge mapping is explicit. |
| Hosted receipt reused on Windows or another account | It remains historical evidence; it cannot prove the new context connected. |
| First normal operation without prior success | It is allowed by configured capability and authorization and can supply the first actual receipt. |
| Expired context or provider failure | Original status and completed progress survive; unrelated work is not reset. |
| Copy/export/import round trip | Bytes/hash, source mapping and task continuity survive; content alone cannot invoke a tool. |
| Tampered transfer or duplicate ambiguous JSON | Hash mismatch or invalid input is reported without replacing the stored original. |
| Local AAD process restart | Historical receipts reopen; live operations require new valid handles, linked to history. |
| Changed source/engine after acquisition | Existing native stale-source guards fire; no completed new analysis is invented. |
| Repeated unchanged source-dependent question | Cached acquired content is reused when still appropriate; no unnecessary native-read loop. |
| Queued or uncertain report write | It stays queued/unknown until an exact provider result or native readback establishes delivery. |

Receiving Codex task: implement the two host adapter paths and transfer UI around these existing interfaces. Complete one actual local import → selected reasoning model → applicable MPC calculation → saved report journey before expanding the service catalog. Then exercise one configured GitHub read and one configured Drive comparison if those accounts are available. Report the exact operations, observed contexts and pending account setup without claiming unavailable actions succeeded.
