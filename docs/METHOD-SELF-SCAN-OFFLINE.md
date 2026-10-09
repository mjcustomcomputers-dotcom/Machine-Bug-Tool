# MPC Research Workbench and the internal Atlas static audit

This bounded source change keeps the existing Method Atlas audit engine while
presenting it through MPC Research Workbench. The product does not literally
"scan itself." Internally, it validates the 24 implemented evaluator capsule
contracts and compares registered metadata for 239 Method Atlas research
candidates. It does not execute those research candidates.

The change leaves the completed V13 controller, canonical registries,
connectors, native Sites bindings, credentials, and deployment untouched.

The audit emits all 239 diagonal identity controls and all 28,441 unordered
cross-method comparisons. Directional `CHALLENGE`, `CROSS_CHECK`, and
`COMPLEMENT` declarations remain directional; no reverse relation is invented.

Run the compact internal source command when a full JSON response on stdout is
useful:

```sh
MPC_METHOD_ATLAS_DB=.sites-runtime/method-self-scan.sqlite \
  node scripts/method-atlas-cli.mjs self-scan '{}'
```

Create a new portable Workbench bundle:

```sh
node scripts/export-method-self-scan.mjs \
  --output-dir .sites-runtime/method-self-scan/my-new-workbench
```

The exporter rejects an existing output directory. It creates:

- lossless `scan.json` and compact `summary.json`;
- formula-safe method, pair, relation, source, and implemented-method CSVs;
- `REPORT.md`, `receipt.json`, and a SHA-256 `manifest.json`;
- the derived, read-only `method-atlas.sqlite` Atlas projection;
- repository-pinned portable source modules and implemented capsules;
- `MPC-Research-Workbench.html`, with text/TXT/JSON/CSV input, deterministic
  research-hook discovery, source exploration, exact comparisons, connection
  truth, and unsent output requests;
- `OPEN-MPC-RESEARCH-WORKBENCH.cmd`, a direct browser launcher unaffected by
  PowerShell execution policy;
- `START-MPC-RESEARCH-WORKBENCH-WITH-SQL.cmd`, an optional foreground Node
  loopback host using a separate writable local workspace database;
- renamed PowerShell verification, query, refresh, and Desktop installation
  interfaces; and
- an optional, separately scoped receipt for an existing signed Microsoft
  Sysinternals installation.

The static HTML path performs no network calls in file mode and needs no
runtime. The local host binds only to `127.0.0.1`, stores raw input only when
explicitly requested, rejects secret material, and records connector requests
as not sent. It has no provider dispatcher or OAuth implementation. GitHub,
Gmail, Drive, Dropbox, MPC, custom GPT, and local-model actions need a separate
approved adapter plus a current protected-call receipt before the interface may
claim a connection or write.

Repeating the audit uses the bundle's read-only Atlas database, preserves the
sanitized capabilities snapshot, creates a new result directory, and returns
`STOP_NO_MATERIAL_INFORMATION_GAIN` when the fingerprint is unchanged.

## Current source expectations

| Item | Expected |
| --- | ---: |
| Implemented bounded evaluators | 24 |
| Research methods / classifiers | 239 / 239 |
| Source locators | 65 |
| Directed relation declarations | 212 |
| Unordered relation pairs | 211 |
| Diagonal controls | 239 |
| Cross-method pairs | 28,441 |
| Total emitted matrix rows | 28,680 |
| Relation-isolated methods | 15 |
| Undirected components | 33 |
| Nontrivial directed cycles | 2 |

The audit exposes exact static overlap vectors. Same source ID, exact locator,
family, dimension, taxonomy, or declared relation is a review signal. None of
those fields proves equivalence or independent corroboration. Distinct source
IDs also cannot prove independence: `NASA_SE` and `V5_NASA_SE` resolve to the
same exact registered locator.

Runtime oracle lineage, executed results, negative controls, repeatability,
disagreement isolation, and source authentication remain
`NOT_EVALUATED_REQUIRES_SUPPLIED_RECEIPTS`. Every output keeps
`method_execution_performed`, `source_authentication`,
`independent_evidence_proven`, `equivalence_proven`, and
`canonical_promotion` false.
