# MPC Workspace — usable inputs, attached folders and conversational work

The visible product name for this build is **MPC Workspace**. Keep the existing internal repository, model, plugin, controller and classifier identities. A project can be research, legal work, software, OSINT, a client review or a bug bounty; those are task profiles, not interchangeable evidence classifications.

## Start a conversation and keep the work

At idle, show a real model-connected chat composer and “What would you like to work on?” beside recent projects and Add folder. With an active project, show its unfinished task and a Resume action. Never force the user to re-enter a known objective or run an engineering scan to resume ordinary work.

The assistant should understand requests such as:

- “Compare this with the Drive snapshot we used for Project A.”
- “Search the folders attached to this project for that request ID.”
- “What changed since the previous snapshot?”
- “Show the evidence and next step for each project.”
- “Use the monitoring output I pasted and explain what it establishes.”
- “Prepare a PowerShell script I can run, then I’ll paste the result back.”

These route to explicit operations and visible source/context choices. A conversational reply must come from the selected available model; do not ship canned chat responses or a text box that merely runs keyword matching. If inference is unavailable, identify that provider's setup action while retaining useful local analysis and search.

## Copy, paste, drag and attach

Use standard Ctrl+C/Ctrl+V/Ctrl+A and native file selection. Provide visible Paste, Attach files, Add folder and Copy result controls. Read clipboard content only after the user's action; do not monitor clipboard contents in the background.

| Input | Required behavior |
| --- | --- |
| Plain text, code, logs and JSON | Preserve original text/line breaks; preview size and detected format; retain malformed input as evidence while reporting parse errors. |
| Rich text | Offer plain-text analysis while retaining selected original formatting as a separate representation when needed. |
| Copied files or drag/drop | Treat as selected files; show names, sizes, type and destination project before acquisition. Never execute a pasted file. |
| Screenshots/images | Attach original bytes; OCR or visual-model extraction is a derived representation with its model/version and uncertainty. |
| CSV/TSV | Preserve quoting, encodings and headers; a rendered spreadsheet is a view of the imported data. |
| PDF/DOCX and other documents | Use an available parser; retain original bytes and page/paragraph locators. An unsupported/encrypted/corrupt document gets its own visible state. |
| Folders | Attach a root and index selected contents; no forced relocation or whole-folder duplication. |

Reuse the existing PR15 bounded JSON parser and complexity rules at shared ingestion boundaries. Bound streaming reads before allocation. Expose truncation/chunk coverage; do not silently treat the V17 six-by-2,400-character model excerpt budget as full-document coverage. Source citations bind the exact representation, version and offset unit. Byte offsets, UTF-16 indexes and Unicode code-point offsets must not be interchanged.

## Attached folders

The UI label is **Attached folders**. SQL is the internal index and task store; a folder is a source root with its own files and permissions.

The flow is: Add folder → native folder chooser → project → include subfolders/type exclusions → index in place. Show indexed/pending/changed/unavailable/excluded counts, last refresh and a stop button. The default attaches the source without moving it. An explicit Snapshot option records a versioned inventory and, only when selected, source copies.

Support local folders, removable drives, selected network shares and local Drive/Dropbox/OneDrive sync folders. Keep source kind and location visible. A synced file is a locally acquired representation; the native cloud object/version becomes verified only through a supported owner connector and matching receipt. The folder name does not authenticate a cloud source.

Index incrementally with bounded work queues. Use filesystem metadata as a change hint, then acquire relevant bytes when a source is used or changed. Respect selected exclusions, archive/decompression limits and per-file error states. Avoid traversing junctions/symlinks outside the selected root without a separate explicit attachment. Detect cycles, keep Windows path/case semantics separate from exact native source IDs, and preserve relative locators.

File watchers are optional and report changes. They do not execute a newly arrived script, import a new credential or automatically send private data to a model. The user can choose Refresh now or a project-specific watching preference.

Detaching a folder removes its attachment/search reach according to retention policy; it never deletes the original files. An unplugged drive becomes Unavailable and retains its history. Missing access is not deletion. Reattaching the same source preserves identity where supported.

## Snapshot comparison

Resolve the old snapshot by exact native object ID/version, not just its name or a previous chat summary. Acquire the selected new material, preserve both source representations, and compare the intended scope. Show:

- Added, removed, content-changed, version-only changed and unchanged objects.
- Unavailable, unread or outside-inventory objects as unresolved.
- Renamed locators separately from native identity changes.
- Exact supporting excerpts/diffs for the changes used in analysis.
- Hypothesis/impact interpretation separately from the observed delta.

The included pure `snapshot-compare.mjs` supplies a tested manifest-comparison foundation. It does not fetch Drive or read Windows folders. The host must acquire those sources, construct an honest complete/partial manifest and wire the result into the UI. A partial index cannot establish that an omitted file was removed. Alias paths do not create additional evidence.

Keep the snapshot's **source** separate from the **subject collection** it inventories. Each manifest has its own exact `source_id`, while `comparison_scope` identifies the project collection being compared. A Drive artifact and a local artifact can supply inventories of the same collection; their source IDs and version namespaces remain separate. A same-named file does not establish cross-provider correspondence. When different native IDs represent intentionally paired content, the host must record that explicit correspondence and its basis while retaining both native identities. Projection aliases alone do not supply a native read. `version_only` is a subset of changed records, so the UI must not add it again to the change total.

## Script workshop: draft → manual run → ingest

From chat, let the user request an explained PowerShell, Python or supported shell script for the selected task. Provide a script editor with Copy, Save, Explain, prerequisites and expected outputs. Keep the generated state **DRAFT**, then **EXPORTED_FOR_MANUAL_RUN**. Actual execution is recorded only when the user runs it and supplies output or a separately authorized local execution operation completes.

Each draft includes its goal, exact selected host/project/target parameters, what it reads/changes, required tools, timeout/rate limits when applicable, output path/schema and artifact hash. Avoid embedding credentials. Derive scripts from the applicable current project rules and observed tool versions; do not infer a target or permission from a model access program. Use a read-only/dry-run option where the intended tool supports one, without claiming that this makes every operation harmless.

When output is pasted or selected, retain original bytes, observed run time/host if supplied, exit status if supplied, source script hash and limitations. User-supplied output can support analysis but is not automatically authenticated local execution. The model extracts useful facts and compares expected versus observed behavior; successful script generation alone never closes the task.

## Per-project progress and triage

Each project view shows its objective, attached roots, selected cloud sources, current task, acquired evidence, open questions, method runs, draft findings, reports and precise next action. Display actual completed work counts. Use neutral stages and retain separate domain profile, evidence state, severity, confidence, procedural finality and submission status.

The program/value preference is a task priority. A high reward ceiling is not a probability, verified impact or reason to skip source acquisition. An OSINT lead remains a lead until the required supporting record is acquired. A failed, unhelpful or negative-result method run remains visible and can teach the selector which work to avoid repeating.

## Extra acceptance scenarios

1. Paste a multiline Windows log, JSON with duplicate decoded keys, a filename containing spaces, Unicode text, and a screenshot. Original input survives navigation; invalid/unavailable parsing remains explicit.
2. Attach a folder with nested files, an unreadable item, a junction cycle and an excluded file. Indexing stays responsive and bounded; original files are unchanged.
3. Unplug/restore a source root. The UI reports availability without deleting its historic evidence or claiming removed files.
4. Compare a complete old Drive snapshot with a partial local inventory. Missing coverage stays unknown; native IDs and aliases remain distinct.
5. Ask the reasoner for a manual script, copy it, provide synthetic output, and produce a report. The receipts keep drafted, exported and reported-run states separate.
6. Switch between two projects while a job runs. Files, searches, receipts, script parameters and outputs remain bound to the correct project.
