# MPC V12 — Method-on-Method Data Integrity and Completeness Hook Pass

**Scope:** One additive, fail-closed correctness pass based on existing MPC method families. Parent `feature/sqlite-mirror-dimension-audit-v11` (PR #9), exact development snapshot `861f48a967722cbdb095941e157e70cd21574740`. This does not modify the canonical MAXVAR, NESTMAX, BL, MBSS, EXT, 25 native coordinates or the published private MPC Sites service.

## Research hook / existence review

| Required analytical mechanism | Existing code? | Concrete evidence | V12 outcome |
| --- | --- | --- | --- |
| Finite schema and model input validation | YES | `lib/schema.mjs`, model catalog, bounded evaluator contracts | REUSE |
| Native method/registry checksum | YES, scoped | `lib/solid-state.mjs` pinned pack fingerprint | PRESERVE |
| SQLite file structure / FK check | YES | `inspectAtlasSQLite` `quick_check` and `foreign_key_check` | PRESERVE (not semantic parity) |
| Derived Method Atlas seed fingerprint | YES, metadata only | `scripts/method-atlas-cli.mjs` stored `seed_fingerprint` | REUSE AS SOURCE-VERSION GUARD |
| **Every seeded row semantically matches versioned input** | **NO** | All seed tables are populated with `INSERT OR IGNORE`; counts alone were previously checked | **ADD full seven-table row parity** |
| **Broad candidate discovery never silently truncates** | **NO** | `routeMethodAtlas` used SQL `LIMIT 256`, even as Method Atlas expanded toward that count | **ADD explicit 512-cap overflow failure, retrieve up to 513** |
| Protected true native storage and source authentication | NO, separate workstream | Code development DB is an ignored local derived cache | DO NOT CLAIM OR AUTO-SYNC |

### Falsified assumption #1: Stored seed hash and row count prove actual rows are correct

SQLite `INSERT OR IGNORE` preserves existing conflicting primary-key rows rather than replacing them. An in-place method-name, classifier-question, trigger-weight, source-title, crosswalk, relation, or taxonomy mutation can retain the row count and stored seed hash. The old importer may then report normal inventory even though its candidate routing uses corrupted metadata.

`lib/atlas-seed-parity.mjs` builds the expected seven source-owned tables from the exact bundled JSON and original `parentByDimension` semantics, then reads the actual rows using **fixed literal column names**. Canonical sorted row tuples are SHA-256 fingerprinted with `node:crypto` and compared, table by table. A mismatch produces `BLOCKED_ATLAS_SEMANTIC_DRIFT` with precise table names; the importer rejects pre-existing poisoned cache **before its seed writes**, and checks again after a new seed. It never mutates the original source or automatically overwrites the suspect cache.

`node scripts/method-atlas-cli.mjs audit-seed` opens an **existing** cache as a read-only SQLite database and produces the full seven-table parity receipt. It does not run the normal initializer, fix an altered row, create a new cache, or authenticate the scientific provenance of the bundled method metadata.

### Falsified assumption #2: All method candidates are considered when query returns <=256 matches

The source Atlas has 239 candidates already. A future expanded catalog could have 257+ matching methods and silently drop candidates from the discovery query while the result still reports `total_trigger_matches` as if it represented full coverage.

V12 raises the bounded fetch to `LIMIT 513` and **throws if 513 are returned**. Under the 512 candidate budget it accounts for all retrieved rows, including explicit deferrals. This avoids silent partial coverage; it does not make all 512 candidates executable methods.

### Adversarial and control tests

- `tests/atlas-seed-parity.test.mjs`: seven source tables and their row values, stealth edits with unchanged cardinality and seed hash, the original `quick_check` still OK, fail-closed imported cache, and legitimate variation ledger inserts not triggering false seed drift.
- `tests/atlas-seed-parity-cli.test.mjs`: actual Node SQLite CLI subprocess with temporary derived cache, mutate seeded method name and run the **read-only** `audit-seed`, ensure original altered row survives for diagnosis and `status` refuses to treat cache as valid.
- `tests/method-router-discovery-cap.test.mjs`: synthetic 300 candidate matches reported with deferred accounting; 513 matches fail closed; source/subject unbound results still cannot be activated.
- These tests do **not** prove native target or source-authenticated bounty findings.

### Codex Cloud exact validation

In the prepared Daybreak Blue Codex Cloud environment (if available and user-selected):

```sh
git fetch origin feature/atlas-seed-semantic-integrity-v12
git switch feature/atlas-seed-semantic-integrity-v12
git rev-parse HEAD
export MPC_METHOD_ATLAS_DB=.sites-runtime/method-atlas-v12.sqlite
node scripts/method-atlas-cli.mjs init
node scripts/method-atlas-cli.mjs audit-seed
node --test tests/atlas-seed-parity.test.mjs tests/atlas-seed-parity-cli.test.mjs tests/method-router-discovery-cap.test.mjs
node --test
npm run build
```

If any error appears, first classify schema/input mismatch, code defect, SQLite runtime, transport/connection or source parity; repair only the affected feature-branch file, rerun affected/full tests, record exact tested commit, test totals and negative witnesses. **Do not delete a suspected corrupted derived cache** to hide the failure, and do not migrate or alter any canonical private Drive/Dash/MPC production records. Use a separate fresh ignored local path only after preserving the drift receipt when rebuilding derived cache.

### Further useful methods without new database inflation

- Cross-method *assumption lineage graph*: methods that cite the same oracle/evidence are not independent corroboration. Existing proposed cross-method links and method-diagnostic hooks cover part of this, but authenticated execution/result bindings remain missing.
- Metamorphic robustness fixtures on method-detection: swap source version/owner, remove evidence, perturb one dimension, reverse graph edge, and require conservative changes in the method candidate frontier. Existing atomic transform declarations provide the grammar; local end-to-end fixtures are still an OPEN next item.
- Cost-calibrated query planning: keep `EXPLAIN QUERY PLAN`, `PRAGMA optimize` proposals and new indexes **separate from performance claims** until measured on one unchanged host/fixture. More indexes can increase write cost.
- ChatGPT connector completeness: keep native Google Drive pointer/dash projection distinction, explicit source auth and approved write/readback. No automatic Code/Drive/Sites synchronization is implied by this PR.

Sources for the underlying SQLite semantics:
- SQLite ON CONFLICT IGNORE: https://www.sqlite.org/lang_conflict.html
- SQLite `PRAGMA quick_check`, `integrity_check`, `foreign_key_check`: https://www.sqlite.org/pragma.html

### Compact exact-resume receipt
`CHECKPOINT_ID: MPC_V12_SEMANTIC_ATLAS_PARITY`
`FRONTIER: feature/atlas-seed-semantic-integrity-v12`
`COMPLETED: source-level semantic parity patch, 7-table input/reference mapping, read-only drift report, explicit discovery overflow gate, adversarial tests`
`OPEN: actual Node/SQLite tests, full existing suite, build, same-host performance impact, later hosted deployment decision`
`NEXT_ACTION: run the exact V12 Cloud commands, fix only verified failures and readback the final commit`
`DO_NOT_REPEAT: original 239 candidate method discovery, earlier V8–V11 source passes, baseline Cloud environment install`
