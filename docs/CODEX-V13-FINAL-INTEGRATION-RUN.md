# Final Codex run — MPC V13 local receiving and Cloud acceptance

Continue `mjcustomcomputers-dotcom/Machine-Bug-Tool` on
`feature/noahs-ark-reasoning-osi-v13`, retaining its stacked review and current
prepared Cloud environment. This is one final bounded integration acceptance
pass. The research/catalog expansion phase ends here.

Read `AGENTS.md`, this document, [the current resume guide](CODEX-V13-CURRENT-RESUME.md),
[the local PowerShell guide](LOCAL-POWERSHELL-V13.md), and
`connector-bridge/codex-resume-v13.json` at the actual latest development branch
head. Read the new
`docs/validation/MPC-V13-LOCAL-INTEGRATION-VALIDATION.json` and retain its exact
native Git identity before execution. It records source validation already
performed by the preparing host. Its `remaining_gates.windows_native_run` and
`remaining_gates.actual_codex_cloud_run` are distinct destination observations.

## Completion notice

This run is complete. Read the new
[Codex final acceptance](validation/v13-codex-final-acceptance-20261009/MPC-V13-CODEX-FINAL-ACCEPTANCE.json)
and [PASS](validation/v13-codex-final-acceptance-20261009/MPC-V13-CODEX-FINAL-ACCEPTANCE-PASS.md)
at the actual latest development head. A bounded relative-destination repair
was tested at exact source `e0e7a7ad0f06d45470b4a396a72aef0434f7caed`, tree
`ba0223afe9265bcfe3f692f94dc108b1128c1c78`; the historical controller remains
bound to `S`. Do not repeat the real receive, notebook, hosted work or
benchmarks. Native Windows remains `NOT_RUN`; the local guide now includes an
optional, separately scoped receipt for an existing Sysinternals installation.
The saved controller is `COMPLETE` with action `null`, so stop unless a new
explicit dependency or source request arrives.

## Objective and stop boundary

Prove that a local Git/Node/PowerShell user can receive the existing completed
controller without corrupting source bytes, overwriting work, replaying models,
or depending on Cloud-only filesystem paths. Validate the actual new
file-input/path-boundary/receiver/notebook support in the prepared Cloud host,
measure bounded same-host latency, repair only reproduced regressions, then
write one source-grounded PASS and exact-resume record.

Do not reinstall dependencies, repeat onboarding, reset a worktree, initialize
another canonical controller, expand the 239-candidate catalog, resume target
research, contact bounty assets, deploy the private Site, merge branches,
change credentials, overwrite native Drive/Dash records, or submit reports.
Preserve the saved `install_script`, `start_skill`, lockfile/dependency policy,
Wrangler override, existing model selection, all original native namespaces,
and completed model receipts.

A small amount of independent read-only review may run in parallel: at most
two audits, one for receiving/Windows portability and one for native/source
preservation. Keep mutations, controller receiving, tests that share paths,
and benchmarks sequential. Do not create repeated agents or model evaluations
just to increase work volume.

## 1. Resolve reporting, integration, and historical execution sources

| Role | Resolve from actual source | Rule |
|---|---|---|
| Reporting `R` | Current fetched `feature/noahs-ark-reasoning-osi-v13` head | Read latest documents and receipts here |
| Integration `I` | New local-integration validation's `tested_commit` and `tested_tree` at `R` | Run the new receiver and regression acceptance from this exact source |
| Historical controller `S` | Historical V13 validation's `tested_commit`, resume manifest's `tested_execution_commit`, and saved state's `config.source_revision.commit` | Require all three to agree; the receiver creates this exact checkout |

The historical `S` is currently
`4ffde83e587db829b9cd2124c0a8587e868402d6`. Its old validation remains unchanged.
The new integration receipt identifies `I`; never relabel the old completed
controller as having run at `I` or the current reporting head.

Inspect local status and preserve all local changes before fetching the named
development ref through the existing configured GitHub connection. Do not
silently replace another feature branch. Verify that `I` resolves to the
recorded `tested_tree` and that the integration record's `validation.status`
is `PASS`. Inspect its actual test/host results and open gates, rather than
assuming a filename proves success.

Use an existing exact clean `I` checkout or create an unused detached worktree.
Retain the original prepared checkout. Reuse its prepared dependencies only
when `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` agree. Keep
runtime state local and preserve old caches. The read-only receiver itself
needs only Git and manifest-compatible Node; no package installation is needed.

Record actual Node/pnpm versions, OS/architecture, reporting and executable
HEADs, tree identities, and worktree status. Preserve Daybreak Blue where it is
selected. Report an observed selector or a user-supplied UI event according to
its evidence type; neither task text nor a script attests the model used for a
particular command.

## 2. One real receiving acceptance

Read `scripts/receive-mpc-v13.mjs` and `scripts/Receive-MpcV13.ps1` at `I`.
Choose a new unused sibling path whose parent exists. Invoke the receiver
from `I`, supplying the exact reporting commit already present in the source
repository:

```sh
node scripts/receive-mpc-v13.mjs inspect --repository /absolute/source/repository --reporting-commit FULL_R
node scripts/receive-mpc-v13.mjs receive --repository /absolute/source/repository --reporting-commit FULL_R --destination /absolute/unused/sibling
```

Replace these path/SHA placeholders with the actual resolved values; record
the exact arguments and native exit statuses. The receiver handles exact Git
blob reads, byte copying, a detached `S` worktree with LF checkout options, and
the three historical controller commands. Do not manually pipe the saved
state through a shell text encoding or run an extra `init`/`prepare-fixture`.

Require the final receipt's `LOCAL_CONTROLLER_RECEIVE_PASS` and exact readback.
Verify:

- Saved state blob, byte count, file SHA-256 and internal integrity match the
  manifest read at `R`.
- The receiver executed the historical CLI at exact `S`; `verify`, `status`,
  and `next` each returned zero.
- The copied state remains `COMPLETE`, revision/event sequence 1/6, four
  completed model obligations, six retained action receipts, and action `null`.
- State bytes/history are unchanged by the three read-only commands, with
  zero new model calls or controller events.
- Original checkout/source state was preserved. Report any concurrent local
  change separately instead of discarding it or attributing it to the receiver.
- The final receipt file exists, parses, and equals the returned content.
  Receipt publication requires the destination filesystem's hard-link support;
  a failed persistence step is not a saved PASS.

Do not repeat this successful real receive merely to test another command
spelling. Regression tests use their own isolated fixtures. An existing
destination or failed worktree remains available for inspection; do not
remove/reset it as an automatic retry strategy.

## 3. Regression and source acceptance

Run the focused integration tests once at the actual integration checkout:

```sh
node --test tests/receive-mpc-v13.test.mjs tests/local-path-boundary.test.mjs tests/method-atlas-file-input.test.mjs tests/noahs-ark-controller.test.mjs tests/v13-notebook-runner.test.mjs
```

These must retain meaningful failure coverage: source/manifest disagreement,
tampered bytes, nonzero controller exit, exact receipt publication, occupied
paths, symlink/junction/cross-volume boundaries, local work preservation,
PowerShell-style quoting, UTF-8/BOM handling, UTF-16/malformed/oversized input,
and unchanged source on rejected actions. Inspect actual tests; do not claim
an unsupported operating-system case was exercised merely because a test name
mentions Windows.

The full suite below already includes the existing planner/cache tests. Run
this narrower group only to diagnose a reproduced planner/cache failure or
validate a repair that changes those paths; it is not an additional mandatory
acceptance run:

```sh
node --test tests/atomic-variation-router.test.mjs tests/atomic-variation-persistence.test.mjs tests/method-atlas.test.mjs tests/atlas-seed-parity.test.mjs tests/atlas-seed-parity-cli.test.mjs tests/noahs-ark-reasoning.test.mjs tests/noahs-ark-reasoning-cli.test.mjs tests/method-relations-integrity.test.mjs
```

Then run one full suite and one build in the prepared environment:

```sh
node --test
npm run build
```

Use the existing saved writable Wrangler configuration for the original Cloud
checkout; an isolated integration checkout uses its own `.sites-runtime/config`.
Record the actual environment value used. The historical 344-test result is
not the expected new count. Report each command's actual pass/fail/skipped/
cancelled/todo totals, and never add overlapping dedicated tests to the full
suite total.

If a confirmed failure requires a source repair, reproduce it with a focused
regression, repair only the affected integration/source behavior on this
development branch, and rerun the affected tests followed by the full suite
and build once. Preserve the original 182 native files and bound historical
records. Record a new tested source commit/tree for the repair; do not claim
the dirty tree was the unchanged `I` commit. Do not manufacture a repair where
the existing result is already correct.

## 4. Atlas, source gates, and persisted variation semantics

Choose a newly named ignored SQLite cache. Preserve old caches, including
failed or legacy ones. Set `MPC_METHOD_ATLAS_DB` only for this acceptance context
and preserve the caller's prior setting. Run:

```sh
node scripts/method-atlas-cli.mjs init
node scripts/method-atlas-cli.mjs status
node scripts/method-atlas-cli.mjs audit-seed
node scripts/method-atlas-cli.mjs sql-audit --input-file .sites-runtime/final-sql-audit.json
node scripts/method-atlas-cli.mjs dimension-audit --input-file .sites-runtime/final-dimension-audit.json
```

Create fresh UTF-8 fixture files exclusively. Use these exact payloads for the
last two commands:

```json
{"dimension":"GRAPH","method_id":"MHA-0224","purpose":"ROUTE","check_integrity":true}
```

```json
{"reported_branch_count":32,"reported_dimension_count":356}
```

Require seven-table semantic parity with zero mismatched tables, SQLite
integrity and foreign-key checks, exact 239 MHA/239 paired MHC/65 source records,
64 referenced primary-source IDs, 212 valid proposed relationships, and 2,597
taxonomy rows. Keep the unused `V6_METAMORPHIC` source unresolved. Index/query
plans are diagnostics, not measured speedups or external source authentication.

Use the existing V8 tests and benchmark receipts to verify 956 consideration
slots for one atom, exact repeat caching with zero new rows, persistent reopen,
historical rewind, exact subject/source-role identity, and selective four-slot
reopening for one named method. Distinguish those counts from executed solvers.
Do not expand or recast the 24 native evaluators, 10 original research hooks,
or 17 transforms to manufacture coverage.

Preserve native BL32/384, 25 object coordinates, 14 jacket axes, MAXVAR, NESTMAX,
MBSS, EXT, and their independent inventories. The user's `356` descriptor and
the recorded NESTMAX descriptor discrepancy remain unresolved source questions,
not code defects to fix by renumbering a registry.

## 5. Run the portable notebook once

Read the checked-out notebook and runner. With Python already present, run:

```sh
python3 scripts/run-v13-notebook.py
```

An explicit `--output-dir` is allowed only for a new unused path. Keep all old
outputs and caches. Require five attempted and passed code cells, zero failed
or unexecuted cells, unchanged source notebook bytes, actual Node subprocess
receipts, stable source-derived cache inputs, and these three original results:

| Fixture | Expected result |
|---|---|
| Synthetic ledger finality | `EVIDENCE_REVIEW_PLAN_ONLY` |
| Cloud configuration — unknown inputs | `BLOCKED_NO_READY_METHOD` |
| Casino meter — source unavailable | `BLOCKED_NATIVE_SOURCE` |

Each fixture accounts for 239 candidate decisions and seven reasoning layers.
The execution mode is `SHARED_PYTHON_NAMESPACE_NOT_JUPYTER_KERNEL`. Do not
describe it as a Jupyter-kernel run or rewrite the native Drive workbook's four
historical planning rows to match it. If Python is unavailable, record this
separate gate as not run and continue independent source acceptance; no
installation is authorized by this task.

## 6. Measure actual Cloud latency

Run the two existing scripts sequentially after tests/build have finished,
using 500 measured iterations each and their existing ten warmups:

```sh
MPC_ATLAS_BENCH_RUNS=500 node scripts/benchmark-atomic-method-detector.mjs
MPC_VARIATION_BENCH_RUNS=500 node scripts/benchmark-atomic-variation-router.mjs
```

| Measurement | Report exactly |
|---|---|
| Three-atom in-memory detector | `ms.p50`, `ms.p95`, `ms.max`, run count and warmups |
| File-backed reopened 956-slot cache | `cached_ms.p50`, `cached_ms.p95`, `cached_ms.max`, zero cached rows written and 956 retained rows |
| Initialization and first write | Separate single-sample durations, never presented as percentiles |

Retain complete raw stdout/stderr and native exit status. Include exact source
commit/tree, dirty status, UTC timing, Node version, OS/architecture and actual
Cloud task context in a separate host receipt. Preserve the benchmark scripts'
raw disclaimer that they do not attest Cloud or Daybreak selection. The host
receipt describes what this task actually observed; it must not rewrite raw
benchmark output into an authentication or model-selection receipt.

The previous ChatGPT-host figures are historical observations, not Cloud
thresholds or an SLA. If a performance repair is warranted, compare before and
after on this same host with the same inputs and parameters. Do not run
benchmarks concurrently or repeat them simply to consume credits.

## 7. Windows and connection gates

If an actual Windows execution host is available through a supported existing
path, follow `LOCAL-POWERSHELL-V13.md` there and retain a separate native receipt.
Test the direct Node route and the wrapper only as needed to establish their
distinct behavior, using separate unused destinations. Existing policy must
already permit `.ps1`; the direct Node route is the fallback without changing
execution policy.

Without Windows, report `windows_native_run: NOT_RUN` with the actual Linux or
other-host result alongside it. Linux `pwsh`, static `.ps1` review, and
cross-platform path tests do not establish an actual Windows/NTFS receive.

The local receiver intentionally does not check hosted connections. Record
this Codex task's actual GitHub source access and tool exposure once using
available supported metadata. Retain prior MPC, Drive, Dash, Dropbox and model
selection receipts with their original session scope. Tool absence is not an
authentication failure. Do not repeat completed hosted model obligations to
probe connectivity, add a private endpoint, recreate a plugin, or change
credentials. There is no target-research action in this final integration task.

## 8. Final PASS, preservation, and exact stop

Check every entry in `docs/daybreak-source-import.json`: all 182 original
native blob IDs, Git modes and working file bytes must remain unchanged.
Verify the original Sites binding, dependency policy, saved controller,
checkpoint, historical validation, and prior receipts separately. Preserve
their native source ownership and original PASS format.

Write a new destination receipt and PASS under a fresh development evidence
path. Do not overwrite
`docs/validation/MPC-V13-LOCAL-INTEGRATION-VALIDATION.json` or the historical V13
validation. Include:

1. Actual reporting `R`, integration `I`, any repaired/tested source, and
   historical controller `S`, each with its role and tree/worktree state.
2. Exact changed files, demonstrated defect and falsifier if any, and original
   native/source preservation results.
3. Actual focused and full test totals, failures/skips, build exit status,
   notebook cell results, and receiver native receipt identity.
4. Atlas/source/relationship counts, seven-table parity, 956-slot cache
   semantics, and unchanged completed controller state.
5. Measured p50/p95 and raw evidence, clearly scoped to the actual host.
6. Windows, Cloud, GitHub, hosted tool exposure/authentication, and actual
   model-selection observations as separate statuses.
7. Unresolved dependencies and the first concrete local Windows receiving
   command, with the exact fetched reporting commit and source instructions.

**Stop after this acceptance PASS and exact-resume checkpoint.** A complete
synthetic controller still has `next: COMPLETE`, `action: null`. Leave Windows
or missing-runtime gates honestly pending if that host is unavailable. Do not
start a new research pass, catalog expansion, deployment, or generic upgrade
loop after the requested final evidence has been saved and read back.
