# MPC Noah’s Ark V13 — final Codex engineering acceptance PASS

Status: **PASS**. The bounded engineering acceptance is complete. Research,
catalog expansion, deployment, target work and controller execution stop here.

## Exact source roles

| Role | Commit | Tree | Result |
|---|---|---|---|
| Reporting input `R` | `18cfa9ac07640dc3d7305087b4eef13892a0e037` | `7196205131ce41ecd22fe5de16435af984629548` | Remote branch matched the expected head at fetch |
| Recorded integration `I` | `a18a040f164e8ad4c47474f77bb10dc5289adac6` | `14365cf138ecc5aed01197bebb8e67fb670b5c1c` | Receiver, focused acceptance, Atlas, notebook and benchmarks ran here |
| Repaired tested source | `e0e7a7ad0f06d45470b4a396a72aef0434f7caed` | `ba0223afe9265bcfe3f692f94dc108b1128c1c78` | Clean exact source passed the affected tests, full suite and build |
| Historical controller `S` | `4ffde83e587db829b9cd2124c0a8587e868402d6` | `70df12ffe9b45a697e3d7b441fb2120b53d5812c` | Existing saved controller only |

Read reporting documents at the actual latest development branch head. The
exact source commit for any future receiver/source continuation is
`e0e7a7ad0f06d45470b4a396a72aef0434f7caed`. Execute the historical saved
controller only at `S`.

## Bounded repair and validation

The receiver resolved `options.destination` before checking `isAbsolute`, so a
relative caller input could not reach the absolute-path guard. A safe failing
regression used a relative path below a missing parent: before the fix it
returned `RECEIVER_DESTINATION_PARENT_REQUIRED`; it now returns
`RECEIVER_ABSOLUTE_DESTINATION_REQUIRED` without creating a worktree.

The functional repair changes exactly:

- `scripts/receive-mpc-v13.mjs`
- `tests/receive-mpc-v13.test.mjs`

The focused group at `I` passed 86/86. The initial full suite passed 405/405.
At the repaired source, the affected receiver file passed 10/10, the final full
suite passed 406/406, and `npm run build` exited zero. There were no failures,
cancellations, skips or todos. The build retained the existing proxy warning
and unknown static-route classification note.

## Receiver and preserved controller

The one real receive returned `LOCAL_CONTROLLER_RECEIVE_PASS` and its saved
receipt read back exactly. It restored the original 591,514 state bytes at
historical `S`; blob `fa80abb6b7336457cdf28e31890280a14e6c5deb`, file SHA-256
`d8ccd726902541cec0e468a0c3354781b7dadeecec1cc66754c20a13ba3d4508`,
and controller integrity
`a00a3e031ba1156471b33f00a5cb95e499a596caf1eee780c9c10f447f2362ae`
all matched. `verify`, `status` and `next` exited zero. State remained
`COMPLETE`, revision 1, event sequence 6, with four completed model obligations,
six retained receipts, action `null`, zero new model calls and zero new
controller events. State bytes/history and the prepared checkout’s HEAD/status
were unchanged. The successful real receive was not repeated after the
relative-input repair.

## Atlas, notebook and host measurements

The fresh Atlas cache passed `init`, `status`, `audit-seed`, `sql-audit` and
`dimension-audit`: 239 MHA methods, 239 paired MHC classifiers, 65 sources
(64 referenced), 478 triggers, 444 crosswalk rows, 212 relationships and 2,597
taxonomy rows. Seven-table parity covered 4,274 rows with zero mismatches;
SQLite quick-check returned `ok` and foreign-key violations were zero. The
956-slot persistence semantics, exact reuse, reopen, rewind, subject/source-role
boundaries and four-slot selective reopen remain covered. Considerations are
not executed evaluators.

The original notebook ran once in
`SHARED_PYTHON_NAMESPACE_NOT_JUPYTER_KERNEL`: five of five code cells passed,
source bytes were unchanged, and actual Node subprocess receipts were saved.
All three scenarios accounted for 239 candidates and seven layers:

- Synthetic ledger finality: `EVIDENCE_REVIEW_PLAN_ONLY`
- Cloud configuration — unknown inputs: `BLOCKED_NO_READY_METHOD`
- Casino meter — source unavailable: `BLOCKED_NATIVE_SOURCE`

On Linux 6.18.44 x86_64 with Node v24.19.0, the 500-run detector measured
p50 0.5823 ms, p95 0.9332 ms and max 2.663 ms. The sequential 500-run reopened
cache measured p50 27.05 ms, p95 33.3731 ms and max 45.5615 ms; initialization
was 52.9242 ms, first consideration was 25.0002 ms, cached writes were zero and
956 rows remained. These are offline synthetic planning/cache timings, not
target impact, hosted MPC latency, Daybreak proof, an SLA or hardware speedup.

## Preservation and destination capabilities

All 182 Daybreak original entries matched their committed blob IDs, Git modes
and working bytes. The private Sites binding, dependency files, historical
controller/state/checkpoint/validation, prior receipts, namespaces and source
ownership records remain unchanged. No deployment, merge, credential change,
canonical research write, target contact or report submission occurred.

Git fetch and exact Git-object reads succeeded. The expected-head feature-branch
write and native readback are the publication gate for the containing commit.
No GitHub API, MPC, Drive, Dash or Dropbox tool was exposed in this task, so no
current protected call ran; this is not an authentication failure. Prior
successful receipts retain their original session scope. The model selector
was not exposed, so the current selection is `NOT_OBSERVED`; the separately
attributed prior UI event “Model changed from GPT-6.1 Sol to Daybreak Blue” is
preserved.

`windows_native_run` is `NOT_RUN`. The first local receiving action, after the
documented fetch and exact-source checks, is:

```powershell
& node $MpcReceiver inspect --repository $MpcRepository --reporting-commit 18cfa9ac07640dc3d7305087b4eef13892a0e037
if ($LASTEXITCODE -ne 0) { throw 'Source inspection failed; no receive was performed.' }
```

The local Windows guide now also records an optional Sysinternals evidence
step using an existing `sigcheck64.exe`, `junction64.exe` and `handle64.exe`
installation. It records native executable provenance, reparse-point output and
open-handle output separately from receiver success. Sysinternals is unavailable
on this Linux host, so no Windows or Sysinternals receipt is claimed and no
suite download or installation occurred.

Native Windows/NTFS cross-drive, UNC/SMB, junction and hard-link publication
remain external gates. The reported 356-dimension owner, NESTMAX descriptor
discrepancy and unused `V6_METAMORPHIC` source remain unresolved. The repository
still pins `pnpm@11.25.0`; this task’s fallback `pnpm` reports 11.19.0, and no
reinstall was performed.

## Evidence and stop checkpoint

The [machine receipt](MPC-V13-CODEX-FINAL-ACCEPTANCE.json),
[host receipt](HOST-RECEIPT.json), [command manifest](COMMAND-MANIFEST.json),
[evidence index](EVIDENCE-INDEX.json), and
[raw evidence archive](RAW-EVIDENCE.zip) are new and preserve all prior records.
The archive is 558,427 bytes with SHA-256
`8eeac25e8a196e9838164ca15ce099309613633b5e5bd1a9ca197effa8dc7007`;
its integrity test passed.

The saved controller has no next action. Stop after native Git readback of this
checkpoint and wait for a new explicit dependency or source request.
