# MPC Work Triage

MPC Work uses the current task and available records to choose its next action.
The ChatGPT host acquires the source, extracts the relevant facts, and advances
the question through the existing MPC methods. The local entry point runs the
existing V16 evidence workflow and saves its complete receipt.

## In ChatGPT

Use the existing MPC Machine Legal plugin and describe the work normally:

> MPC work: continue the current task. Acquire the next needed record, extract
> the facts, apply the methods that can advance the question, and continue from
> the result. Report what was acquired, what it establishes, and the next action.

The `machine-legal-work-triage` skill connects the existing phase rules to actual
host actions. It reuses source reads from the current task and resumes the saved
frontier. It continues authorized work after saving each bounded pass.

| Material available | Action |
| --- | --- |
| Known record ID, content still needed | Read that native record and extract the target facts. |
| Specific fact gap, record still to locate | Search its source, follow the native pointer, and read the content. |
| Acquired current-version content | Answer the question and formulate a useful comparison when needed. |
| Ready source-bound model | Call its existing native evaluator and interpret the returned result. |
| A definite claim with support and contrary criteria | Check that claim against the acquired sources. |
| A completed task | Report the result and save the precise continuation state. |

The router's `fact_summary` reports record availability. The host extracts the
substantive facts from the source text and cites them in its answer. A returned
`ready_call` remains pending until its tool call has actually completed.

## On the local Windows machine

Extract the complete package. Open PowerShell in that folder and pass the work
packet prepared by ChatGPT or your existing local host:

```powershell
.\MPC-Work.cmd "C:\Work\current-task.json"
```

The PowerShell entry point supports named output settings:

```powershell
.\MPC-Work.ps1 -InputPath "C:\Work\current-task.json" -OutputRoot "C:\Work\Receipts"
```

The cross-platform command is:

```sh
node scripts/run-mpc-work.mjs --input current-task.json --json
```

Use an installed Node.js 22.13 or newer. The launcher accepts paths with spaces,
uses the existing evidence-workflow CLI, and saves each result to a new file.
Its default output folder is `.sites-runtime/work` under the current directory;
the printed `Receipt` path identifies the saved result. An explicit existing
output path is preserved and produces an error.

The JSON packet keeps the existing V16 schema. Each `workflow.records` entry
contains `source_ref`, exact `version`, and actual acquired `content`. Its
`source_ref` must match a `sources[].id`. The existing
`data/evidence-workflow-example.json` illustrates that schema with a clearly
marked synthetic source. Actual operational inputs use your own source reads.

The Windows launchers use Node already installed on the machine. They execute
the evidence workflow. The earlier reasoning-lab commands remain available in
their existing locations for explicit engineering work.

## Local and live connection

The current hosted `route_problem` schema accepts the established typed sources,
structures, questions and models. At the observation retained with this change,
its callable schema has no `workflow` property. The host therefore retains the
acquisition receipt itself, uses the local V16 workflow when available, and sends
the live tool only fields in its current schema. A future exposed `workflow`
field can use the same source/version/content records directly.

The existing live `evaluate_method` tool remains the method execution bridge.
Read its actual input schema for the selected method, use acquired source facts
and explicit assumptions, and record its returned receipt. The chat host owns
source connector calls. The runtime's reported tool capability and a returned
model result retain their own identities.

## Source and validation

This addition starts from native V16 source
`e6f5ed4269743b423e64b06a7ccb9ad7a3f62dfa`, tree
`8c085e043c7e5f2e3fee9db9c3a1562dc96446df`. It preserves the V16 workflow,
all original methods and registries, the completed V13 controller, and the V15
reasoning history. The original local/live report and its raw receipts remain
under `docs/LOCAL-LIVE-INTELLIGENCE-V16-REPORT.html` and `docs/validation/`.

The triage receipt records the newly executed launcher checks, a real
native-source acquisition/analysis, package and plugin validation, and the saved
source and plugin release. Historical V16 tests and the 48-case local/live scan
retain their original source and timestamps. A Windows receiver run is a
separate host observation from the executed Linux Node launcher.
