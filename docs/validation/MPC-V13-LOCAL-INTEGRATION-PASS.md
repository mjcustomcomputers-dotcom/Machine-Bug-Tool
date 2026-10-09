# MPC V13 — final local receiving integration PASS

The final bounded engineering pass is complete on the preparing ChatGPT Linux
host. **405/405 Node tests passed, with zero failures or skips; the build passed.**
The receiver restored and inspected the existing controller without changing its
state, history or completed calculations. Research stops at this checkpoint.

| Source role | Exact identity |
|---|---|
| Tested integration source, I | `a18a040f164e8ad4c47474f77bb10dc5289adac6` |
| Tested tree | `14365cf138ecc5aed01197bebb8e67fb670b5c1c` |
| Source parent | `96aff8d09257a73e36066a64a5c883d4c9f38db8` |
| Historical controller executable, S | `4ffde83e587db829b9cd2124c0a8587e868402d6` |
| Development branch | `feature/noahs-ark-reasoning-osi-v13` |

The containing reporting commit, R, adds these results and current instructions.
It does not change the commit that was actually tested. The historical controller
remains bound to S. Do not edit its source identity to make it run at I or R.
No new PASS number or native research-controller revision is invented.

## What changed and why

The new [local receiver](../../scripts/receive-mpc-v13.mjs) provides one repeatable
route from existing Git objects to an isolated historical controller. It verifies
the repository/branch namespace, exact source commit/tree and saved-state blob,
SHA-256 and integrity hash. It creates a previously unused sibling worktree,
restores exact bytes through Node buffers, then runs only `verify`, `status` and
`next`. Invocation-specific LF checkout settings prevent Git CRLF conversion from
invalidating source fingerprints; no global Git settings are changed. The
[PowerShell wrapper](../../scripts/Receive-MpcV13.ps1) passes native arguments and
propagates the child exit code.

The receiver rejects occupied or nested destinations and linked destination
ancestors. It preserves a dirty source checkout. A success receipt is staged,
flushed and published without replacing an existing file; receipt persistence
failure is reported as a failed receive, rather than a saved PASS. Publication
uses a filesystem hard link, which must be supported by the receiving filesystem.
The original controller and completed state are never rewritten by this flow.

The shared [path boundary helper](../../lib/local-path-boundary.mjs) fixes the
Windows case where `path.relative` returns an absolute path for another drive or
UNC share. The previous parent-traversal check did not exclude that result.
Regressions cover drive, UNC, sibling-prefix and root boundaries. The new
controller code includes this helper in its source fingerprint; this does not
rebind the older S controller.

The [Method Atlas CLI](../../scripts/method-atlas-cli.mjs) now accepts
`--input-file PATH` for all eleven commands that take JSON. Existing inline JSON
continues to work. File transport checks require a regular, bounded UTF-8 JSON
object and reject links, UTF-16, invalid UTF-8, NUL content and nonobject JSON.
Argument and transport validation happens before creating or opening a physical
SQLite cache. This repairs the demonstrated malformed-JSON cache side effect.
Method-specific input and domain validation remain separate; the transport gate
does not claim to authenticate a source or prove every method input valid.

The [portable notebook runner](../../scripts/run-v13-notebook.py) executes the
unchanged notebook's five Python cells in a shared namespace, records actual
Git/Node/Python identities and subprocess results, and saves outputs into a fresh
directory. It uses Python's standard library and does not install Jupyter. Its
receipt explicitly says `SHARED_PYTHON_NAMESPACE_NOT_JUPYTER_KERNEL`.

## Exact-source validation

All final acceptance commands ran from a clean isolated I checkout. The source
was clean before and after. Existing dependencies were reused only after matching
the package manifest, lockfile and workspace policy bytes. Node was 24.19.0,
pnpm 11.25.0 and Python 3.12.14. The checkout used its own writable Wrangler
configuration directory. No environment installation or reset occurred.

| Check | Actual result |
|---|---|
| Full `node --test` | **405 passed; 0 failed, skipped, cancelled or todo** |
| New regression coverage | 61 tests included in the 405 total: 7 path, 40 JSON file, 9 receiver, 5 notebook runner |
| `npm run build` | Exit 0 |
| Receiver inspect and actual receive | Both exit 0; exact saved state restored |
| Historical `verify`, `status`, `next` | Pass; `COMPLETE`, next action `null` |
| Existing controller state/history | Unchanged; revision 1, event sequence 6, four completed obligations, six retained receipts |
| New hosted model calls/controller events | 0 / 0 |
| Original notebook | 5/5 cells; three original synthetic scenarios; seven layers and 239 considerations per scenario |
| SQLite semantic audit | Seven tables, 4,274 rows, zero mismatches |
| Original native source preservation | 182/182 original files retain exact blobs, modes and byte lengths |

The build emitted the existing proxy-environment notice and framework static
route-classification message. It completed successfully. Those host/framework
messages did not justify changing credentials, build policy or native source.

The received state remains exactly **591,514 bytes**, Git blob
`fa80abb6b7336457cdf28e31890280a14e6c5deb`, file SHA-256
`d8ccd726902541cec0e468a0c3354781b7dadeecec1cc66754c20a13ba3d4508`, and controller
integrity `a00a3e031ba1156471b33f00a5cb95e499a596caf1eee780c9c10f447f2362ae`.
Receipt content parity does not authenticate target facts or establish a new
session's protected connector access.

## Coverage and measured latency

The Atlas retains **239 methods, 239 paired classifiers, 65 source records,
212 method relationships and 2,597 taxonomy rows**. The previous 64 used source
IDs and unresolved `V6_METAMORPHIC` locator remain unchanged. Native evaluator,
hook, reduction, operator, transformation and mirror inventories remain separate.
No method or dimension was added, renamed or renumbered.

Both benchmarks ran sequentially with ten warmups and **500 measured runs**:

| Synthetic workload on this ChatGPT Linux host | p50 | p95 |
|---|---:|---:|
| Three-atom detector query; in-memory SQLite | **0.8653 ms** | **1.9395 ms** |
| Reopened persistent 956-slot cached consideration | **36.9901 ms** | **47.1446 ms** |

The variation benchmark wrote 956 initial rows, reopened and verified the
database, wrote zero rows during cached repeats, and retained all 956 rows.
Initialization was 62.9596 ms; first consideration was 36.9782 ms, each a single
observation. Cached percentiles include the validated persistence path and exclude
process startup and initial Atlas seeding. These are synthetic planning/cache
measurements, not native model latency, a speedup comparison, actual Codex Cloud
latency, a service guarantee or evidence of target impact.

## Exact changed source files

| File | Change |
|---|---|
| `lib/local-path-boundary.mjs` | New shared containment check |
| `scripts/Receive-MpcV13.ps1` | New PowerShell entry point |
| `scripts/receive-mpc-v13.mjs` | New exact-state receiver and receipts |
| `scripts/method-atlas-cli.mjs` | File input and transport validation before cache access |
| `scripts/noahs-ark-controller-cli.mjs` | Shared path check and fingerprint dependency |
| `scripts/run-v13-notebook.py` | New portable notebook execution entry point |
| `tests/local-path-boundary.test.mjs` | New path regressions |
| `tests/method-atlas-file-input.test.mjs` | New file/encoding/cache regressions |
| `tests/receive-mpc-v13.test.mjs` | New receiving and receipt-failure regressions |
| `tests/v13-notebook-runner.test.mjs` | New notebook runner regressions |
| `tests/noahs-ark-controller.test.mjs` | Windows-compatible linked-directory fixture; assertions retained |

The reporting update adds the two receiving/final-run guides, this PASS, the
machine-readable validation, evidence archive and index. It updates navigation
in `AGENTS.md`, `DAYBREAK-START.txt`, the current resume guide and the separate
Codex resume manifest. It preserves the bound operative manifest, original
notebook, historical validation/state/checkpoint and concurrent session receipt.

## Remaining gates and stopping point

**Native Windows execution is not yet measured.** This host has neither Windows
nor PowerShell. Windows path semantics and portable fixtures were tested on Linux;
that is useful regression coverage, not a Windows runtime receipt. Follow
[the local PowerShell guide](../LOCAL-POWERSHELL-V13.md) on the actual Windows
machine. The receiver needs existing Git and manifest-compatible Node; receiving
the historical controller alone needs no dependency reinstall or pnpm command.
The optional notebook run additionally needs Python 3.10 or newer.

**Actual Codex Cloud acceptance remains separate.** Use
[the final integration run](../CODEX-V13-FINAL-INTEGRATION-RUN.md) once in the
already prepared environment. Record its actual R/I/S identities, test counts,
build, synthetic p50/p95, available tools and observed model selection. If it
cannot access Windows, record that gate `NOT_RUN` and finish independent Cloud
checks. Preserve prior MPC/Drive/Dash/Dropbox and user-reported Daybreak receipts;
do not repeat completed models just to check connectivity.

The `356` dimension provenance, NESTMAX 174/160 discrepancy, unused source locator
and workbook's four historical authored rows versus three notebook inputs retain
their prior unresolved meaning. They are outside this final engineering pass.
No merge, deployment, credential change, live target contact, report submission,
canonical controller overwrite or security finding occurred.

**Exact next action:** run the final prepared-Codex acceptance, save its separate
destination receipt/checkpoint, and receive locally using the PowerShell guide.
Stop after those integration results. Do not expand the catalog or restart
research as part of this task.

## Complete evidence

The [validation JSON](MPC-V13-LOCAL-INTEGRATION-VALIDATION.json) reports exact
commands, source identities, counts, scope and gates. The
[evidence index](local-v13-evidence-index.json) provides SHA-256 and sizes for the
29 unchanged members of the [evidence archive](MPC-V13-LOCAL-INTEGRATION-EVIDENCE.zip):
full test/build logs, receiver results, Atlas audit, both benchmarks, original
executed notebook outputs, acceptance driver and native-file preservation record.
Archive SHA-256:
`6f9bf28018dde123196447474260194044c467958eacf030757be4a6d11d157d`.
