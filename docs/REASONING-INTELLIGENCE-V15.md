# V15 — Local Reasoning Intelligence Lab

The local lab executes finite models through MPC's existing methods, checks their answers against explicit mathematical relationships, and keeps a reproducible cursor for the next bounded pass. It adds information reasoning, bounded stochastic observation value, concrete counterexample refinement, and seeded scenario variation to the existing product.

**Baseline source:** `e3a8f15806388d9c0d3705970ec7fd18c44d3439`. The V15 additions extend that baseline. The baseline commit does not identify the new files: each execution receipt records the exact runtime and catalog file hashes, available Git identity, and working-tree state.

The native inventory remains **24 evaluators**. A fresh pass through the present curriculum exercises **11 retained native methods**: `harsanyi`, `finite_invariant`, `fault_tree`, `minimal_cut_sets`, `ledger`, `conservation`, `nash`, `selten`, `partial_order`, `state_trace`, and `temporal`. Local adapters and Method Atlas candidates retain separate identities. Continued passes can execute fewer distinct methods when previously successful parameterizations are skipped; the run's counters record actual calls.

## Run one pass locally

Extract the complete distribution, or use a complete source checkout, preserving the `scripts`, `lib`, and `method-atlas` directories. Use an already installed **Node.js >=22.13.0**. These launchers perform no package installation, elevation, execution-policy change, network request, or connector dispatch.

From the product directory in PowerShell:

```powershell
.\scripts\Run-Reasoning-Intelligence.ps1
```

To supply a reproducible seed and a bounded exploration budget:

```powershell
.\scripts\Run-Reasoning-Intelligence.ps1 -Seed 20261009 -Rounds 24
```

The CMD helper invokes the same PowerShell file:

```bat
scripts\run-reasoning-intelligence.cmd -Rounds 24
```

`Seed` accepts integers from 1 through 4294967295. `Rounds` accepts 1 through 64 and defaults to 24; it controls parameterized exploration within the implemented families, while fixed regression controls also run. Omit `Seed` during normal continuation so the saved cursor can choose advancement or replay. `-OutputRoot` selects a separate history; its default is `Runs` under the product directory, and relative values resolve against that directory.

The wrapper checks every listed file hash when the distribution includes `MANIFEST.json`, and requires its file list to cover the executed runtime. Missing, changed, duplicate, escaping, or reparse-point entries stop that launch. The manifest can use `{ "files": [{ "path": "relative/file", "sha256": "..." }] }`. Hash agreement establishes content parity with the supplied manifest; it does not authenticate who produced it. A source checkout without this distribution manifest can run and receives the Node runner's separate runtime fingerprint.

The platform-independent entry point is:

```sh
node scripts/run-reasoning-selfplay.mjs --output-root Runs --rounds 24
```

Run the same command again for continuation. The launcher starts one bounded pass; scheduling is a separate operation. Existing system policy governs whether PowerShell scripts may execute. The Node command is also available without changing that policy.

## What executes

| Experiment | Check performed |
|---|---|
| Planner challenges | Source removal blocks planning; missing or unknown preferred challenger inputs permit a ready linked alternative; input order preserves the answer. |
| Actor information and decision value | Identical visible histories require the same legal actions and policy. Compare admissible expected utility with an omniscient upper bound, then price supplied observation partitions. |
| Stochastic observation value | Expand supplied finite signal likelihoods into joint hidden-state/signal states, execute posterior choices through the retained Harsanyi evaluator, compare against a closed-form fair-bit oracle, and reject costs above a supplied utility-unit budget. |
| Abstraction refinement | Build an over-approximation, replay its failure path in the concrete graph, and split a group responsible for an unrealizable path or label. |
| Fault structure | Compare direct Boolean evaluation, the native fault tree, and native minimal cut sets while preserving shared leaf identity. |
| Accounting | Reconcile each account with conservation, split and reorder equivalent transfers, and check that a changed amount with stale balances produces residuals. |
| Game-theory arithmetic | Compare analytic finite 2×2 equilibrium values with `nash` and `harsanyi`; compare a small perfect-information tree with `selten`, preserving its tie rule. |
| Event order | Compare all supplied read/evaluate/save orderings with partial-order, trace, and prior-event methods. |

The runner generates **new parameterizations of fixed, versioned experiment families**. It retains deliberate regression replays, separates them from exploratory cases, and suppresses exact successful duplicates under the same engine identity. New method families require reviewed code. This implementation performs no CFR, general poker solving, automatic method invention, model-weight training, or claim of measured general intelligence.

The earlier offline method self-scan examines catalog metadata, relationships, coverage, and declared readiness. Its listings remain useful navigation and integrity checks. This V15 lab executes synthetic model comparisons and records their outcomes. A catalog relationship, two agreeing evaluators, or a passed synthetic comparison does not authenticate outside evidence.

## Information reasoning and the numerical repair

In the fair hidden-bit control, an actor that cannot see the bit has optimal expected utility **0.5**. The simulator's omniscient bound is **1**. A policy that secretly depends on that hidden bit is rejected. A legitimate reveal costing 0.1 has net modeled value **0.4**; repeating information already present adds zero. These values concern explicitly supplied toy payoffs and probabilities.

The information adapter uses **exact rational arithmetic on the supplied binary64 values** for weighted utilities, differences, and decision comparisons. This avoids manufacturing information gain through cancellation or label-dependent arithmetic order. Output includes exact fractions and projection error, with numeric displays rounded to nearest binary64 using ties to even. Very small values can display as zero while their exact fractions remain available.

This arithmetic interprets the numbers actually received. It does not reconstruct the user's intended decimal values or infer measurement precision. Accepted probability totals are normalized by their exact supplied total within the documented tolerance, with accounting in the receipt. Zero-probability groups contribute zero and have no posterior; their policy consistency is still checked. Native Harsanyi receipts are retained as actual local cross-checks, with numerical residuals disclosed. Other native methods keep their existing numerical contracts.

Observation partitions refine existing knowledge by intersection. Unavailable, late, other-actor, or conflicting-source observations remain blocked. Declared source identity/version agreement is checked separately from whether the observation improves a decision.

## Bounded stochastic observation value

`lib/finite-stochastic-observation.mjs` evaluates a finite caller-supplied noisy signal without adding a native evaluator or classifier ID. For each affordable observation it forms the joint hidden-state/signal distribution, converts the observed signal into a deterministic partition over those joint states, and delegates the posterior action choices to the existing exact-refinement information adapter and retained `harsanyi` evaluator.

The contract admits at most 8 observations, 8 outcomes per observation, and 16 expanded joint states. Each state-specific likelihood row must be complete, bounded in `[0,1]`, and sum to one within `1e-12`. A supplied observation whose cost exceeds the supplied utility-unit budget is blocked before evaluator calls. Likelihoods, costs, access, and budget are never inferred.

The curriculum's independent oracle uses a fair hidden bit with reward `r` and a binary symmetric signal of accuracy `q` in `[0.5,1]`: prior value is `r/2`, posterior value is `r*q`, gross information value is `r*(q-0.5)`, and net value subtracts the supplied cost. Accuracy `0.5` is the mandatory no-information negative control. This is a bounded single-decision experiment, not sequential search, calibration, CFR, a general poker solver, or evidence that a real source is accurate.

## Counterexamples and finite evidence boundaries

For concrete edges `S → A` and `B → F`, with unreachable `B`, merging `A/B` as `Q` creates the abstract path `S → Q → F`. Concrete replay exposes the impossible step and splits `Q`. Adding the concrete edge `A → F` instead produces the exact witness `S → A → F`.

The graph adapter requires explicit state, initial-state, and transition completeness declarations. Missing initial states, incomplete declarations, exhausted budgets, and unresolved reachable invariant labels cannot become a verified result. An unsafe abstract group is conservative: it may represent an unreachable unsafe member, so the concrete terminal label is also checked before reporting a real model counterexample.

`FINITE_SUPPLIED_MODEL_VERIFIED` describes the caller-declared finite graph and labels. It does not establish actual-system completeness, source authenticity, an unbounded theorem, a target vulnerability, authority, or permission for external actions.

## Saved continuation and receipts

Each pass creates a new run directory under the selected output root:

| File | Purpose |
|---|---|
| `REPORT.html` | Readable local report with experiment families and links to receipts. |
| `scan.json` | Scenario inputs, expected relationships, observed answers, embedded evaluator receipts, failures, and case fingerprints. |
| `summary.json` | Actual per-run counts, statuses, and the next action. |
| `receipt.json` | Runtime/catalog hashes, host runtime, available Git identity, and execution timestamps. |
| `cursor.json` | This run's continuation record. |
| `manifest.json` | Hashes of the saved run files. |

The output root's `latest.json` is this new lab's mutable pointer. Before advancing it, the runner verifies the previous cursor digest, the previous scan's bytes and associated fields, and the newly saved files. Its exclusive `runner.lock` prevents two cooperating writers from advancing the same output history simultaneously. A busy lock stops the second writer; the launcher does not remove another run's lock. Preserve an interrupted run and its lock for diagnosis before recovery.

With unchanged source and a passing prior run, the default next pass advances the deterministic seed. A changed runtime/catalog fingerprint or prior counterexample defaults to replaying the previous seed. Changed source clears old duplicate-suppression eligibility. An explicit seed overrides the automatic choice and is recorded.

This cursor belongs to the new local lab. Historical MPC controllers, native PASS records, prior evidence, registries, and hosted deployment remain separate. Run artifacts bind a result to local bytes; they do not prove that a separate Windows machine, Codex environment, or hosted service executed them.

## Validation and research references

The completed integration receipt is
`docs/validation/MPC-REASONING-V15-VALIDATION.json`. Its source hashes and raw
evidence archive describe this verification, including the two executed local
passes. `docs/validation/MPC-REASONING-V15-RUNS.zip` preserves their exact
`Runs/latest.json`, run directories, and saved scans for source-bound resume.
Restore those files into a separate new output directory and run the same
verified engine with `--output-root` pointing there. The runner verifies their
digests and source relationship before choosing the next seed. Do not merge
them into a different existing lab history.

To create a new portable distribution from source:

```sh
node scripts/export-reasoning-intelligence.mjs --output-dir /path/to/new-bundle --rounds 24
```

The exporter copies the exact runtime, runs the copied source, writes a manifest
and report, and rejects an existing destination. Its distribution manifest
excludes `Runs/latest.json`, whose own digest and saved-scan relationship govern
later changes; older run snapshots remain immutable.

Use the current run receipts and validation report for measured totals. This guide intentionally fixes no final scenario, test, performance, or defect count. Native Windows/PowerShell execution requires its own destination receipt; Linux Node verification does not establish it.

The implementation transfers bounded concepts from these primary sources:

- [CFR paper: information-set constraints](https://proceedings.neurips.cc/paper/2007/file/08d98638c6fcd194a4b1e6992063e944-Paper.pdf). The present adapter uses the visibility constraint and does not implement CFR.
- [Counterexample-guided abstraction refinement](https://www.cs.cmu.edu/~emc/papers/Papers%20In%20Refereed%20Journals/Counterexample-guided%20abstraction%20refinement.pdf).
- [Metamorphic testing](https://arxiv.org/pdf/2002.12543).
- [Algorithm selection by rational metareasoning](https://papers.neurips.cc/paper/5552-algorithm-selection-by-rational-metareasoning-as-a-model-of-human-strategy-selection.pdf).

Sources explain the method lineage. The checked-in code and execution receipts establish which bounded operations this product performed.
