# MPC Workspace performance: measure the slow stage

Use a small, reproducible local task to determine where screen capture, OCR, or reasoning waits. Sysinternals provides useful process, file-I/O, and memory evidence. It does not change the classifier framework or turn an unmeasured guess into a demonstrated speedup.

## Start with the app's own evidence

Keep the build/source commit, Windows version, monitor dimensions and scale, selected capture region, capture interval, OCR language, local model, and model context size with the test. Record the app's available capture counters, skipped/duplicate frames, cache usage, OCR elapsed time, and process memory/CPU observations. Host-process CPU or RSS alone does not describe Electron renderer/GPU children, a separate OCR helper, or Ollama; inspect those processes separately when needed.

Use a harmless local text document. Run three finite 30-second conditions: an unchanged screen, a slowly changing text area, and the same area with a local model request. Stop capture between conditions and record times before changing any setting. Compare the identical task after changing only one option. These durations are a suggested test design, not product benchmark results.

## Pick the diagnostic that answers the current question

| Question | Tool and observations | What the evidence can guide |
| --- | --- | --- |
| Which process or thread is consuming CPU or growing? | Process Explorer process tree, CPU, Private Bytes, Working Set, handles, and the selected process's threads | Separate OCR/helper work from renderer, GPU process, and local model load; investigate growth across repeated start/stop cycles |
| Is each frame repeatedly opening a model or writing temporary files? | Process Monitor, filtered to the exact app/helper processes and relevant paths, with timestamps, operation and duration columns | Identify unnecessary file churn, repeated model initialization, sharing errors, or an I/O wait |
| Is memory pressure causing the system to reclaim working data? | RAMMap Use Counts, Processes, File Summary, and two snapshots around the same test | Separate process working sets, file cache/standby memory, and other physical memory consumers |
| Does capture or UI presentation stall while CPU/file I/O look normal? | Optional Windows Performance Recorder trace, analyzed in Windows Performance Analyzer | Inspect CPU scheduling, disk activity, hard faults, and available GPU/presentation events around the recorded stall |

Microsoft describes [Process Explorer](https://learn.microsoft.com/en-us/sysinternals/downloads/process-explorer) as a process, handle and loaded-module inspection tool; [Process Monitor](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon) captures file-system, registry and process/thread activity with filters and stack context. [RAMMap](https://learn.microsoft.com/en-us/sysinternals/downloads/rammap) provides physical-memory views and snapshots. [WPR and WPA](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/) record and analyze ETW performance traces.

## A practical Process Explorer pass

1. Obtain the tool from Microsoft's linked download page and confirm that its current version supports your Windows release. The current Process Explorer and Process Monitor pages checked on 2026-10-09 list Windows 11 or later for clients; the workspace's own Windows requirements do not override each diagnostic tool's requirements. On another Windows release, use a supported Microsoft diagnostic such as the built-in Task Manager/Resource Monitor or a compatible WPR installation.
2. Find the running `MPC-Workspace.exe` process tree. Identify its renderer/GPU children by observed command line; find the actual OCR helper and Ollama process names from the current run.
3. Watch CPU, Private Bytes, Working Set and handle counts at idle, during the selected capture window, after OCR, and after Stop. Use **Properties → Threads** only on the process exhibiting the stall or unexpected CPU load.
4. Record the observed high-cost process and timestamp. A growing working set alone is not proof of a leak. Repeated growth that fails to settle after the same bounded workload is a reason to inspect retained buffers, child processes and handles.

Do not change process priority, affinity, or kill processes while collecting the baseline; those changes would alter the comparison. Process Explorer can expose loaded files and DLLs for a selected process, helping distinguish repeated engine initialization from a persistent worker. The tool-specific help covers its current counters and controls.

## A finite Process Monitor pass

Pause capture before configuring filters. Include the exact workspace process IDs and observed OCR helper IDs. Include relevant temporary/workspace/model paths if the question concerns those paths. Inspect your installed version's **Drop Filtered Events** option when you want unrelated events discarded instead of only hidden; ordinary display filters are non-destructive.

Clear the existing trace, start one 15–30 second recording, reproduce the issue once, and stop capture. Inspect repeated `CreateFile`, `ReadFile`, `WriteFile`, process start, and error events around the app's timestamp. Use a backing file only when needed for a larger trace. Stop after obtaining a discriminating observation; do not leave broad monitoring running for a normal workday.

Trace files can contain local paths, account names, command lines and application activity. Keep a private local trace, then select the few needed observations for a report. Any requested elevated diagnostics should use the utility's normal Windows consent flow. The workspace does not bypass that flow, install a driver, or start system monitoring automatically.

## RAMMap and cache decisions

Save a snapshot before the test and another after it. Use **Use Counts** and **File Summary** to inspect where physical memory went, then compare process memory from the same timestamps. A large standby cache can be useful; it is not automatically wasted memory. Avoid emptying standby lists or trimming all process working sets as a default optimization, because doing so destroys the warm-cache state being measured.

If observed pressure coincides with delays, reduce one measured consumer: capture dimensions/region, pending frames, retained OCR text, model size, or model context. Rerun the same task. If OCR time dominates without memory pressure, a RAM cache change may not address the actual slow stage.

## WPR/WPA for a remaining scheduling or GPU question

Use the installed WPR user interface to select a profile appropriate to the specific stall, record a short reproduction, and save an ETL file locally. Open it in WPA and align its timeline with the app's recorded times. Available profiles/providers depend on Windows and the installed toolkit; inspect those instead of assuming a named GPU profile exists. Optional symbols improve stack interpretation but can require separate Microsoft downloads.

Keep this step for a specific unresolved performance question. A CPU-heavy OCR pass, repeated disk initialization, and GPU presentation wait suggest different changes. The trace establishes where time was spent; it does not by itself establish that a proposed optimization works.

## Feed the evidence back into MPC

Create a small performance record with:

- Exact source commit and local environment.
- Workload, elapsed test window, and the single setting changed.
- Observed native process/event identifiers and timestamps.
- Capture/OCR/model stage measurements, where actually available.
- Candidate cause and a competing explanation.
- One change, its predicted measurable effect, and the result of the same comparison.

This is the existing **ACQUIRED → ANALYZED → DECIDED** workflow applied to performance. For example, repeated helper startup plus model-file reads is evidence to consider a persistent local OCR worker; an unchanged-screen duplicate count plus low OCR activity demonstrates skipped work in that exact test. Neither is a universal speed claim.

The workflow keeps Defender, UAC and other security controls enabled. It does not add exclusions, install unsigned utilities, download optimizers, clear caches indiscriminately, or run a permanent background monitor. The implementation and any resulting speed claim should be grounded in the measured local bottleneck.
