# Method-on-Method Offline Self Scan

This source-only hook pass implements the recorded Method Atlas independence
frontier without changing the completed V13 controller, canonical registries,
connectors, Sites bindings, credentials, or deployment.

The scan keeps the 24 implemented bounded evaluators separate from the 239
Method Atlas research candidates. It audits the implemented capsule contracts,
checks every MHA/MHC identity pairing, and emits all 239 diagonal identity
controls plus all 28,441 unordered cross-method comparisons. Directional
`CHALLENGE`, `CROSS_CHECK`, and `COMPLEMENT` declarations remain directional;
the scan never invents a reverse relation.

Run the compact source command when a full JSON response on stdout is useful:

```sh
MPC_METHOD_ATLAS_DB=.sites-runtime/method-self-scan.sqlite \
  node scripts/method-atlas-cli.mjs self-scan '{}'
```

Create a new portable bundle for an offline or Windows machine:

```sh
node scripts/export-method-self-scan.mjs \
  --output-dir .sites-runtime/method-self-scan/my-new-bundle
```

The exporter rejects an existing output directory. It creates:

- lossless `scan.json` and compact `summary.json`;
- formula-safe method, pair, relation, source, and implemented-method CSVs;
- `REPORT.md`, `receipt.json`, and a SHA-256 `manifest.json`;
- a derived `method-atlas.sqlite` database with queryable `offline_scan_*`
  metadata, implemented-capsule, method, and pair tables, opened read-only by
  the portable runner;
- repository-pinned portable JavaScript modules and implemented capsules;
- a self-contained, no-network HTML query GUI with exact method and pair lookup;
- a direct `.cmd` browser launcher plus PowerShell verification, query, refresh,
  and Desktop installation scripts;
- an optional, separately scoped receipt for an existing Microsoft
  Sysinternals installation.

The PowerShell Desktop installer refuses overwrite. Double-clicking
`MPC-Method-Self-Scan.cmd` opens the targeted-query GUI without invoking
PowerShell, so Windows script-signing policy does not affect the normal product
path. The prebuilt product needs no runtime. A refresh needs flag-free
`node:sqlite` (22.13+, 23.4+, or 24+) and always writes a new result
directory. Repeating an unchanged scan with the prior fingerprint returns
`STOP_NO_MATERIAL_INFORMATION_GAIN`.

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

The scan exposes exact static overlap vectors. Same source ID, exact locator,
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
