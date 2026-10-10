# Command-center architecture

## Decision

Extend the existing Node MPC core and Workbench presentation into one desktop application. Package an Electron shell for Windows, keeping the renderer reusable in a loopback browser and the orchestration modules portable. The renderer handles input and presentation. A typed host bridge owns model requests, SQL, filesystem access, jobs and provider connections.

This is an engineering choice based on the acquired JavaScript implementation. It avoids forcing a second language into the existing backend. The cost is the footprint and maintenance of a desktop shell; a later smaller shell remains possible because computation and storage stay behind stable interfaces.

## Responsibilities

| Component | Owns | Main contract |
| --- | --- | --- |
| Desktop renderer | Composer, evidence view, search, reports, connection wizard | Typed requests and streamed status events; no credentials. |
| Local orchestration | Work phase, task state, full native receipts, cancellation | Existing `routeProblem` and full V16 workflow result. |
| Model adapters | Local Ollama, optional OpenAI API, optional eligible sign-in client | Explicit selection, source-bound input, observed provider/model and errors. |
| MPC evaluator adapter | Existing local or hosted finite evaluators | Current schema, exact supplied arguments, bounded receipt. |
| Connector adapters | Native owner reads/writes and OAuth/tool discovery | Provider/surface/host/account/operation-specific observations and immutable receipts. |
| SQL store | Projects, source versions, atom dependencies, jobs, outbox, search | New database, parameterized operations, project-qualified references. |
| Update manager | App build, source/method package revisions, migrations | Component versions, compatibility check, atomic activation and rollback. |

## Suggested application operations

These are proposed internal API names, not claims about tools presently exposed by ChatGPT or MPC.

| Operation | Input | Result |
| --- | --- | --- |
| `work.start` | Project, task, selected inputs, profile revision, provider selection | Job ID and stream. |
| `work.cancel` | Project and active job ID | Cancellation receipt; separately reports any already observed external effect. |
| `work.resume` | Project, job/checkpoint reference | Full native source-bound resume or a precise changed dependency. |
| `sources.import` | Selected files/text and retention choice | Native or local source/version records with typed identities. |
| `search.query` | Query, project, local/selected-provider scopes and filters | Results with source identities, versions and explicit coverage. |
| `methods.explain` | Exact method ID and typed task context | Applicability, input requirements, implementation status and sources. |
| `methods.run` | Existing method ID and valid supplied model | Existing native evaluator receipt. |
| `connections.configure` | Connection profile and credential reference | Configured state, never inferred authenticated state. |
| `connections.test` | Provider, surface, host, account and exact permitted operation | Observation bound to that context and operation; optional setup aid. |
| `reports.create` | Task, source/result references, template | Draft artifact plus local receipt. |
| `outbox.dispatch` | Exact item and already authorized destination/action | Native response, failed/unknown delivery, and optional readback. |
| `assistant.exportTask` | Explicitly selected task fields | Portable instructions plus versioned source pointers; selected source bytes only when requested. |

## Data flow

1. The user selects a project, inputs and an assistant/provider profile.
2. The host determines the current phase through the existing router.
3. An identified missing source is acquired by its connector owner. The host binds actual content/version to the packet and resumes.
4. Applicable finite methods and a selected language model receive their own correctly typed inputs. They return separate receipts.
5. The task view shows established facts, model interpretation, missing material and the practical next action.
6. Selected persistence stores the full native receipt, event and source linkage. Presentation summaries remain derived views.
7. Export uses the exact selected destination. Queued, accepted, read-back and failed are distinct states.

## Important existing integration constraints

The Workbench GUI/store/server exist at `ad364e6...` outside the V17 reasoner tree. Transplant their compatible changes into the current task; do not replace V16/V17 with the older branch.

`runMpcWork()` returns a compact summary while saving the complete router result. The reasoner uses `routed.workflow.source_records`; passing only the summary discards necessary evidence binding. Keep the full result throughout orchestration.

The legacy database admits exactly its known schema and bundle identity. `sql/001-command-center.sql` is for a **separate new database**. Importing legacy data requires an explicit versioned copy operation. Its old `NOT_SENT` queue rows remain unsent history.

Local assistant acquisition/analysis handles live in memory. Durable receipts must retain their original session and source identities. A restart does not revive an old in-memory handle; restore from its source-bound record according to the existing assistant contract.

## Progress without repeated checks

Persist the last completed operation, pending dependency, source version, evaluator hash and exact next action. Reuse an unchanged successful acquisition. Revalidate affected descendants after an observed source/method change, an operation failure or a relevant freshness rule. Never repeat a full static inventory just because the user opens another view or sends another message.

Use bounded event streams, cancellation tokens and per-operation timeouts. Separate model streaming completion from the visible end of a network connection. Deduplicate jobs with a project-scoped idempotency key. Where a provider has no remote idempotency guarantee, preserve uncertain delivery and query the native source before retrying.

## Privacy and connection usability

Profiles choose local-only, selected-cloud or connected-source work explicitly. A missing local model must not upload the input elsewhere. A remote document cannot change this choice. Store credentials in the host credential manager; keep references in SQL and configuration. Do not read or export broad environment-variable values for diagnostics.

Workspace project, API organization/project, account, host and product surface are different identity fields. Preserve all of them. Connection readiness describes observed capability; it is not an execution-authorization decision. The first already-authorized operation must be able to produce the first receipt. A stale indicator should refresh from useful work, not force a preliminary checking loop.

A read-capable connection does not imply write capability. A ChatGPT connection does not imply a Windows connection. Keep historical success, current error and operation availability visible so the user can diagnose the actual failed step without starting over.

## Update strategy

Separate application version, method-catalog version, model digest, source-cache version and database schema. GitHub updates code and approved method definitions. Data-only method additions can become searchable candidates after schema/digest validation; executable extensions require the normal code review and test path. Do not execute scripts embedded in method descriptions.

On activation, retain a rollback build and use a supported SQLite backup. Never copy only a live WAL database's main file. Preserve settings and private project data outside the application install directory. Let the GUI display available revisions and update outcomes. Keep native Sites deployment separate from a GitHub commit or desktop update.
