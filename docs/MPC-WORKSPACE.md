# MPC Workspace

MPC Workspace is the Windows command center for the existing Machine-Bug-Tool
Node/MPC core. It adds one project-oriented GUI and a separate local store; it
does not replace the Research Workbench, the MPC Security Assistant, the
completed V13 controller, the Method Atlas registries, or the native Sites
project.

## Display and local AI update — October 9, 2026

This additive update starts from `16ee44a080c4979c14016901ed8783d2d2686504`
on PR #18. The older package hashes in the historical checkpoint below identify
that earlier build. The GitHub Actions artifact for the new commit carries its
own source commit, checksum, full test result and build receipt.

### A workspace that fits the window

The workspace opens at 100% with compact spacing and the assistant closed.
**Show chat** opens one assistant containing both the conversation and the
question/evidence inputs. **Hide chat** gives the workspace its full area back;
it keeps the same conversation, draft, selection and attachment nodes.

Choose **Side panel**, **Floating box**, or **Bottom panel** in the assistant.
The side panel uses a separate grid column when the window is at least 1100
CSS pixels wide and 550 high. A narrower window uses a floating box. Bottom
placement is specific to Work and hides when navigating elsewhere; an explicitly
opened side/floating assistant remains available alongside the other pages.
The assistant is part of the same app window, not another operating-system
window or a second conversation session.

Drag the panel divider to resize it, or focus the divider and use the arrow
keys. In floating mode, drag **Move**, or focus it and use the arrow keys; the
bottom-right corner resizes the box. **Fit** restores its initial size and
position. The layout bounds the assistant to the visible window.

The top bar has **− / percentage / +** controls. **Settings → Display and
accessibility** offers compact/comfortable spacing and 50%, 60%, 75%, 85%, 90%,
100%, 110%, 125%, 150% and 200% zoom. The Windows build applies zoom through
Electron to the whole interface. The optional **Shift + mouse wheel** setting
changes zoom; when it is off, normal wheel behavior is preserved. The native
**View → Zoom Out / Zoom In / Reset Zoom** menu remains available. Ordinary
use is designed around automatic reflow at 100%; manual zoom is optional.

Normal chat shows one message box, **Send**, and **+ Add**. Enter sends;
Shift + Enter adds a line. **Stop** appears during a run. **Advanced** holds
the optional evidence-text field and explicit mode selection; **Auto** remains
the default. Reasoning stays enabled in ordinary chat.

The **+ Add** menu offers files, whole folders, **Paste message**, and **Paste
evidence**. Pasted evidence opens Advanced and its separate evidence field. Attaching files or a whole folder does not make hiding or moving the
assistant discard them. Closing the application still follows the existing
project retention rules; this change does not promise to retain unacquired
attachments across restarts.

### Copy and save large outputs

**Output** in the top bar opens a large plain-text view without expanding the
assistant or changing the current project. Choose **Latest answer** or **Full
visible chat log**, then **Select all**, **Copy text**, or **Save .txt**. Code,
line breaks and Unicode remain plain text. Refresh is explicit so an arriving
answer does not overwrite a selection while you copy. The log represents the
conversation currently available in the window; missing metadata-only history
is not reconstructed.

### Set up local Ollama from this desktop

1. Select **Local AI setup** beside the model picker. If needed, copy the
   official Windows installer link, open it in your browser, and install Ollama:
   `https://ollama.com/download/windows`.
2. Select **Start Ollama**. The status now distinguishes the Workspace service
   from the Ollama service at `http://127.0.0.1:11434`.
3. Select **Download model** for `qwen3:4b-instruct`. This explicit action
   downloads the model weights; progress and **Stop setup** are available.
4. Select **Create MPC model** to apply the existing bundled instructions as
   `mpc-daybreak-local`. This configures the model; it does not train new weights.
5. Select **Use local model**, then ask a question. Installed-model metadata is
   separate from a successfully completed inference response.

The local group appears before cloud profiles in the picker. Refreshing model
availability preserves the selected project, conversation and draft. The
default `:latest` suffix is recognized without merging different explicit tags.
Requested identity, observed model name and digest remain distinct.

Setup only uses the fixed local Ollama endpoint and the existing starter/MPC
model names. The same-origin API keeps Host, Origin and CSRF validation. Download
and creation can be cancelled by exact request ID or stream disconnection.
Starting an already installed daemon does not install software automatically.

### What to enter in Add connection

| Field | Local Ollama value |
| --- | --- |
| Display name | `Local Ollama` |
| Provider | `OLLAMA` |
| Transport | `Local loopback HTTP` |
| Endpoint or command | `http://127.0.0.1:11434` |
| Credential-store reference | Leave blank |

For local chat, use the dedicated **Local AI setup** action. The generic form
only stores a connection configuration. Provider-specific defaults and help
now explain the field meanings.

The stock Windows app does not yet mount GitHub, Drive, Gmail, Dropbox, remote
MCP or OpenAI API host connection adapters. Those require an installed adapter
and its actual endpoint/command/locator. Entering a repository URL, inventing an
`os-secret://` reference, or pasting an API token into the reference field does
not create that integration. Existing ChatGPT connector sign-ins are separate
from this desktop. Connection tests use a typed `READ_SELECTED_RESOURCE`
operation, rather than incorrectly submitting the catalog's prose description.

### Validation scope

Focused automated checks cover retained UI state, responsive-mode decisions,
50–200% zoom bounds, the guarded native zoom bridge, provider guidance, typed
connection-test requests, split/truncated setup streams, loopback route guards,
model-tag matching, cancellation and the shared daemon-start adapter. Full
source tests/build and Windows packaging run on the exact new commit in GitHub
Actions. Visual geometry, native display scaling, and real local model inference
still require the updated application to run on the receiving Windows computer;
controlled loopback tests do not establish those observations.

## Build checkpoint

| Item | Exact state at this documentation checkpoint |
| --- | --- |
| Review branch | `feature/mpc-workspace-build-20261009` |
| Draft pull request | `#18` |
| Reconciled component checkpoint | `695c7de478566d251aabfd2e8aa9e470309c1f4f` |
| Saved PR update reconciled | `771c4db9b306a6f536d5c72d3a4eeaf80074655f` |
| Reconciliation merge | `77e95fa411194ec3d624c1cb58163a470941b73e` |
| Component lineage | `docs/validation/MPC-WORKSPACE-COMPONENT-MANIFEST.json` |
| Executable/package source commit | `1cb5aa5b2247856ee243ea3ac0e9dbae403676b2` (tree `00f9d0646e5b20206050bb802f6a243f0914d7b4`) |
| Final test/build receipt | `docs/validation/MPC-WORKSPACE-FINAL-ACCEPTANCE.json`; complete external receipt SHA-256 `9bdd7c7e5588bd0f225ce47fc0507d9b280da420a6e62d48c5a3345f94cb2d71` |
| Windows portable archive and checksum | `MPC-Workspace-0.1.0-windows-x64-portable.zip`, 157,787,480 bytes, SHA-256 `271cc97640f25a03f9c5fda83b902ec2d901c2a929c469a6e1d60bd5da810b4d`, Windows 10 x64 or later |
| Windows launcher contract | `MPC-Workspace.exe` is primary; `MPC-Workspace.cmd` starts it, retains a nonzero exit, prints `%APPDATA%\MPC Workspace\logs`, and pauses on failure |
| Native Windows execution | **Pending on a Windows host** |

The pending native-host row is deliberate. The Linux build, source tests and
generated archive establish source and package identity, not Windows execution
or protected-service access. Likewise, a configured provider name is not a
protected-operation receipt.

## The first complete journey

1. Open the retained MPC Workspace window. A startup or provider failure stays
   visible; it must not close the window.
2. Choose an existing project or create one. The project owns its objective,
   selected task, draft, attachments, jobs, evidence, reports and next action.
3. Select **Show chat**. Paste text, drop or choose files, or use **Add folder** to index a whole
   folder in place. Review the detected representation, retention choice and
   errors before running work.
4. Choose a provider/model that the current host actually observed as
   available. Local routing, finite evaluators and retained local search remain
   usable when no reasoning model or cloud account is available.
5. Ask one focused question and select **Send**. The host retains the complete
   `routeProblem(input)` result, not only the compact console summary. It
   acquires a missing selected record through its owner, runs applicable
   implemented methods, and passes the complete source-bound receipt to the
   selected model only when that step is ready.
6. Follow the actual action label and counts for **ACQUIRED**, **ANALYZED** and
   **DECIDED** work. A model observation never overwrites the router's source
   records, work stage, ready call, result completeness or next action.
7. Inspect exact sources, derived facts, method applicability, limitations and
   any Drive/local snapshot delta. Unknown or partial coverage stays visible.
8. Select **Save report**. The local report retains its source references and
   can be reopened. A queued destination remains queued until a native provider
   receipt establishes delivery.
9. Close and reopen MPC Workspace, choose the project, then select **Resume**.
   The saved dependency hash and checkpoint determine the next operation;
   completed unchanged work is not repeated.

**Stop** cancels the active local job. It does not retract a remote effect that
was already observed, and a retry cannot claim that an uncertain remote write
did or did not occur without native lookup.

The left navigation keeps Work, Search, Evidence, Methods, Tasks, Reports,
Connections, Assistant and Settings in one retained shell. The visual system is
forest-at-dusk with restrained cyan/coral accents: the requested
Bob-Ross-meets-raver character without reducing contrast or workspace area.
Segoe UI/system text, visible focus, keyboard navigation, zoom, reduced motion
and quiet mode remain functional requirements. Imported text, HTML/Markdown and
model output are untrusted display data, not renderer code.

## Input, folders and clipboard

Normal `Ctrl+C`, `Ctrl+V` and `Ctrl+A` behavior is available in editable fields.
MPC Workspace reads the clipboard only after an explicit paste action; it does
not monitor it. Text retains line endings and malformed JSON remains an input
with a visible parse error. Images retain original bytes; OCR or visual-model
text is a separate derived representation. Files are data until the user takes
a separate, authorized execution action.

An attached folder is indexed where it already lives. The bounded index records
relative locators, file/folder kind, availability, size and a metadata version
hint. It does not relocate, execute or silently snapshot source files. Symlinks
and junctions are not followed outside the selected root, cycles and unreadable
entries stay explicit, and exclusions are recorded. The first journey acquires
the content of up to 24 sorted regular files (configurable to a hard maximum of
32) while retaining explicit coverage for the rest of the whole-folder index.
Detach changes Workspace
reach or retained index state; it never deletes the original folder.

Raw retention is selected per project:

- **Retain text** stores the selected local representation for replay and
  project search.
- **Metadata only** stores bounded identity, size and digest information. The
  original must be supplied again for replay. Changing a project to this mode
  before it has raw-bearing immutable job/report/script artifacts purges
  retained-document text, the in-memory acquisition cache and the draft body
  while preserving source/digest history. After such immutable artifacts exist,
  the downgrade is rejected with an instruction to create a new metadata-only
  project; prior receipt bytes are never silently rewritten.

Local search is always project-qualified. The store builds an ephemeral FTS5
index over retained project text when the bundled SQLite runtime supports it,
then drops that temporary index; otherwise it uses its bounded parameterized
`LIKE` fallback. Metadata-only material is not silently indexed. Connected
search is an explicit scope, reports which provider answered, and returns
source identity/version and coverage. A Dash projection of a Drive or Dropbox
object is an alias, not a second native source or an authenticated owner read.

## Drive and local snapshot comparison

Each compared manifest has its own typed source identity and a separate
`comparison_scope` for the collection it describes. The comparison reports
added, removed, content-changed, version-only, unchanged and unresolved entries.
A partial inventory cannot establish that an omitted file was removed. A local
sync-folder file remains a local acquisition until a native Drive receipt binds
the corresponding cloud object and version. Same-name paths are not identity
proof; an intentional cross-provider pair needs an explicit correspondence and
basis.

## Local data and preserved identities

The Workspace store and the legacy Workbench use deliberately different
application-data roots.

| Data | Identity and location | Boundary |
| --- | --- | --- |
| MPC Workspace database | `%APPDATA%\MPC Workspace\workspace-data\mpc-command-center.sqlite` on the standard Windows package; an explicitly supplied host path remains possible | Separate Workspace schema version 2, admitted from migrations `001-command-center.sql` and `002-workspace-journey.sql`. The host passes this exact database path; it does not append a second `data` directory. Never point it at another database. |
| MPC Workspace service data | `%APPDATA%\MPC Workspace\workspace-data` | Project artifacts/receipts belong under this host-owned root. Data stays outside the application install directory so a versioned app replacement does not erase it. |
| MPC Workspace logs | `%APPDATA%\MPC Workspace\logs` on standard Windows | Electron-owned retained startup/service diagnostics; logs are not an evidence or credential store. |
| Legacy Research Workbench database | Windows default: `%LOCALAPPDATA%\MPC Research Workbench\<bundle-sha-prefix>\research-workbench.sqlite`; non-Windows bundle default: `.wrangler/research-workbench/research-workbench.sqlite`; or its explicit `--database` path | Identity-locked Workbench schema and bundle, `user_version=1`. It is not migrated in place or extended with command-center tables. |
| Completed V13 controller | Historical executable source `4ffde83e587db829b9cd2124c0a8587e868402d6`; restored state remains in the receiver's isolated historical checkout | Status `COMPLETE`, six preserved receipts, `next_action: null`. MPC Workspace does not initialize, replay or overwrite it. |
| Native Sites project | `.openai/hosting.json`, project `appgprj_6abf0bb684648191a38324d33d1aa8cc`, capability `mcp` | Source work, a Git commit and a local install do not deploy or alter this private Site. |
| Workbench source checkpoint | Source `ad364e6ba531382343b8edeb22e3843eaa7d70a9`; patch-equivalent integration tip `bdac472965cd3b877f4127040bae2df2dc456eea` | Preserved as a separate legacy product/data identity even though compatible source was transplanted. |

Back up the Workspace database through its supported SQLite backup operation.
Do not copy only the main database file while write-ahead logging is active.
Credentials never belong in these databases, artifacts, logs or exports; only
opaque references to Windows Credential Manager/DPAPI or another supported host
store may be retained. The bundled Node runtime owns SQLite in the main/service
process, never the renderer; it disables loadable extensions, requires foreign
keys, disables trusted schema, admits exact migration/schema hashes and uses
WAL with `synchronous=FULL` after admission.

## Models and connections

The model picker distinguishes requested and observed identity. For every model
run the durable receipt records the requested provider/model/program, observed
provider/model/program when returned, host/account/project context, outcome,
structured error, timing and token/cost data when supplied. The local
`mpc-daybreak-local` configured name remains distinct from its underlying
`qwen3:4b-instruct` tag and digest. No provider refusal silently changes model,
provider or privacy mode.

Daybreak Blue is an account/API-project entitlement, not a theme, repository
property or local model. A newly configured Blue API profile requests
`gpt-6-sol` with `access_programs.cyber=daybreak_blue`; a standard profile
explicitly requests `standard`. The actual response or structured error is the
only current operation evidence. ChatGPT sign-in, an API key, the hosted MPC
plugin and a local Ollama server are separate surfaces.

Connection cards keep these states separate:

| Observation | What it establishes |
| --- | --- |
| Configured | The profile has an endpoint/command and opaque credential reference; it does not establish authentication. |
| Successful protected operation | That exact operation succeeded for the recorded provider, surface, host, account and time. It does not imply write or another account. |
| Prior success | Preserved historical evidence, not proof of current Windows access. |
| Failed / expired / wrong host / wrong account | The structured current problem and its setup action; earlier success is not erased. |
| Unavailable | The adapter/tool is not exposed in this runtime. It does not by itself prove bad credentials or provider outage. |

Enable/disable changes only the current local configuration state. If an exact
configuration is already bound to an immutable provider receipt, Workspace
creates a new enabled/disabled configuration version and preserves the original
row and receipt unchanged.

The first already-authorized useful operation may create the first receipt; the
application does not require a redundant connectivity ping. GitHub is for code
and approved method definitions, not the default confidential evidence store.
Drive, Dropbox, Dash and Gmail require their own native adapters and receipts.
Gmail send, external report submission and target interaction require the
user's specific instruction.

## Script workshop

The script path is **draft → manual run → returned-output ingestion**:

1. Request PowerShell, Python or shell output for the selected project/task.
2. Review the purpose, exact host/project parameters, reads and changes,
   prerequisites, timeout/rate limits, expected output schema and script hash.
3. Copy or save it. The state changes from `DRAFT` to
   `EXPORTED_FOR_MANUAL_RUN`; no execution is claimed.
4. Run it manually on the intended host after review.
5. Paste or attach the returned output and, when known, host, run time and exit
   status. Workspace retains original output bytes and the source script hash.

User-supplied output is labeled `USER_SUPPLIED_UNVERIFIED`. Only a separately
authorized local executor receipt may label execution as locally observed.
Scripts never embed credentials, and the application does not expose a generic
renderer-to-shell bridge.

## Receive and launch the Windows portable build

The release receipt above provides the archive name, SHA-256, source commit and
minimum supported Windows version. This makes the archive receivable and
verifiable. It remains an unsigned portable build whose native Windows journey
must be observed on the receiving Windows host.

On the Windows computer, receiving is intentionally manual and does not require
a PowerShell policy change:

1. Download the final portable ZIP named in the receipt into **Downloads**.
2. Compare its SHA-256 with the receipt (Windows file Properties or
   `Get-FileHash -Algorithm SHA256` entered interactively).
3. In File Explorer, choose **Extract All** into a new versioned folder such as
   `C:\Users\<Windows-user>\Desktop\MPC Workspace\<release-version>`. Keep the
   previous version as rollback; do not extract over it.
4. Double-click `MPC-Workspace.exe`. If it exits before a usable window stays
   open, double-click `MPC-Workspace.cmd`; that diagnostic launcher starts the
   same executable, retains a nonzero exit, prints the normal log location
   `%APPDATA%\MPC Workspace\logs`, and pauses instead of opening and
   disappearing. `MPC-Workspace.ps1` is optional. Do not change
   `Set-ExecutionPolicy` to launch this product.
5. Confirm the window reports the expected app/source version and local service
   health before opening private project data. Existing data remains in the
   separately reported application-data directory.

If Windows marks a downloaded ZIP as blocked, unblock that exact downloaded
archive in its Properties before extraction. Do not disable SmartScreen or
change a machine-wide policy. If startup fails, preserve the window/log output,
use **Copy error** or the retained diagnostic output, and report the exact app
version, launcher and error.

The pinned portable toolchain is Electron `44.5.1` with bundled Node `24.21.0`
and `@electron/packager` `20.3.0`, targeting Windows 10 x64 or later. The
packaged Settings view reads the exact source commit from the generated package
manifest; it does not infer that identity from an app label. From the prepared
source checkout, `npm run desktop:dev` starts the development shell and
`npm run desktop:package:windows` creates a new versioned output beneath
`.sites-runtime/mpc-workspace-windows/`. An explicit unused output directory is
accepted through `npm run desktop:package:windows -- --output-dir <path>`.
Building on Linux can establish archive structure and hashes; it cannot
establish native Windows launch, clipboard/file dialogs, actual local-model
performance, update behavior or code signing. This release path is an unsigned
portable build, not an installer.

## Acceptance evidence ladder

Higher levels do not rewrite or imply the lower receipts. The final delivery
must cite the evidence at each reached level and mark every unreached level
pending.

| Level | Required evidence | Checkpoint status |
| --- | --- | --- |
| 0 — source lineage | Exact component source commits, integration commits, patch equivalence/conflict resolution, preserved controller/registry/Sites identities | **Recorded** through executable source `1cb5aa5...`; component, controller, registry and Sites identities preserved |
| 1 — deterministic contracts | Focused control/comparison/SQL/ingest/store/orchestration tests with exact commands and counts | **Passed**: final focused integrity suite 45/45; full receipt records the larger gate |
| 2 — cross-platform vertical slice | Actual create/open project, retained input, local routing/finite analysis, search, report save/reopen and checkpoint resume against the new database | **Passed for the local source/MPC/report/restart path**; actual Ollama answer pending local provider setup |
| 3 — repository gates | Full `node --test` and `npm run build` at the same final source commit | **Passed** at `1cb5aa5...`: 893/893 tests; production build passed; lint 0 errors with 15 pre-existing warnings |
| 4 — packaged artifact | Reproducible Windows installer or portable archive, checksum, packaged runtime, retained diagnostic launcher and rollback/data-preservation behavior | **Passed for archive structure and identity**: portable ZIP produced, checksummed and `unzip -t` verified; native launch remains Level 5 |
| 5 — native Windows journey | A retained real window plus clipboard, folder, keyboard/zoom/reduced-motion, cancellation/restart, local model and install/update checks on Windows | **Pending Windows execution** |
| 6 — protected destinations | Actual GitHub read, local MPC computation and only the configured cloud/model/OAuth/read/write operations, each with native protected-operation receipts | **Local MPC calculation passed**; GitHub, Drive, Daybreak/API and task-runtime MPC connector receipts remain unavailable/pending and are reported separately |

Synthetic data can pass Levels 1–3 without establishing Levels 5–6. A generated
ZIP can satisfy part of Level 4 but does not establish that it launched on
Windows. A provider card, old receipt or saved URL never substitutes for Level
6.
