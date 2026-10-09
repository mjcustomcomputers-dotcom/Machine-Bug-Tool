# MPC V11 — SQLite Method Diagnostics, Native Mirrors and Dimensional Provenance

**Stacked development update**, not a redesign or deployed private MPC tool. Parent: `feature/connector-native-authority-falsifier-v10` / PR #8. This change is method-derived **quality-control** of the existing Method Atlas, not another broad inventory expansion.

## Grounded registry and dimensional facts

The existing native `lib/solid-state-pack.json` contains **32 BL branches and 384 BL child classifiers**. Native `lib/atomic-framework.json` contains **25 object coordinates, 14 jacket axes, and 15 exact MPC mirror definitions**. These are separate independent namespace inventories; none may be multiplied, subtracted or silently reinterpreted into the user's historical `32/356 dimensions` descriptor.

`auditNativeDimensionClaims` retains `32/356` as a **reported source claim** with `accepted_as_canonical=false`, lists exact native counts and blocks registry changes pending the source owner/definition. No invented 356-dimensional replacement pack. Method Atlas has 239 **source-linked candidate methods**, with existing 24 hosted executable finite evaluators in a separate native inventory.

## SQLite (source-backed advanced, bounded)

`lib/sqlite-method-strategy.mjs` adds:
- `EXPLAIN QUERY PLAN` of four **fixed, parameterized queries**: dimension trigger lookup, inverse method graph edges, partial-index actionable variation receipts and taxonomy purpose lookup. Output is a planner diagnostic, never a numerical speedup estimate.
- `PRAGMA quick_check` for structural B-tree sanity and **separate** `PRAGMA foreign_key_check` for source-linked referential integrity. The former cannot substitute for the latter.
- `traceInverseMethodEdges`: reverse walk from a method to proposed dependent methods using bounded SQLite `WITH RECURSIVE`, explicit max depth <=3, result cap <=64, **internal recursive row cap 512** and trail-based cycle prevention. This is a review graph, not method execution or evidence proof.
- Schema changes: inverse-edge index `(related_method_id,relation_type,method_id)`; partial index for actionable method consideration receipts; covering candidate trigger index `(dimension,trigger_strength,method_id)`. Index cost/performance must be benchmarked against parent branch; SQLite may choose another query plan.

**Further opt-in research hooks**, not default deployed features:
- FTS5/trigram for ad hoc lexical method-name discovery only, after verifying SQLite module availability; do not replace exact typed-dimension routing with full-text guessing.
- SQLite JSON1 `json_each` for bounded imported manifests/record inspections, not trusted natural-language or source validation.
- `PRAGMA optimize` on isolated derived database after schema/index changes when measured, not an unreviewed action against canonical storage.
- Materialized/nonmaterialized CTE hints should only be evaluated under actual query plans/fixtures. Avoid forcing a plan based on analogy or assuming it is portable to the hosted D1 runtime.

SQLite documentation: <https://sqlite.org/eqp.html>, <https://sqlite.org/pragma.html>, <https://sqlite.org/lang_with.html>, <https://www.sqlite.org/partialindex.html>, <https://www.sqlite.org/fts5.html>, <https://www.sqlite.org/json1.html>.

## Native mirror execution discipline

`lib/native-mirror-dimension-audit.mjs` reuses the 15 exact native MPC **MIRROR** questions (fact/non-fact, actor/capacity, input/output, private/state, technical/legal, receipt/use, label/finding, sequence/causation, rule/implementation, claim/falsifier, observed/counterfactual, source-present/expected, version/alternate, reversible/final, liability/remedy).

For each bounded source-bound atom (<=8), it accounts for **all 15 mirrors**. A caller may provide *exact* two-sided source references and declare a relation `AGREES | CONFLICTS | UNKNOWN`. A mirror returns `PAIR_NOT_SUPPLIED`, `BLOCKED_ONE_SIDE_UNBOUND`, `OPEN_RELATION_UNKNOWN` or `PROPOSED_CONSISTENCY_REVIEW`. None authenticates the underlying records or proves a legal/security fact, criminal intent, guilt, or bug bounty payout. Exact unchanged source evidence/mirror relation may reuse prior in-session receipts without repeated prompts.

**Lion / Tiger / Bear mnemonic** (not new classifier namespaces):
- **LION — lineage**: validate native owner/ID/clock/version and source non-equivalence.
- **TIGER — adversarial challenge**: mirror/invert claims, compare falsifier and reverse method dependencies.
- **BEAR — bounded evidence accounting**: integrity, causal limits, no-delta checkpoint and reproducibility.

These three labels are optional communication aids only. The actual 15 original MPC mirror IDs and source pointers remain authoritative.

## Codex / Pro GPT one-shot validation

Use the prepared Cloud source checkout but switch to **`feature/sqlite-mirror-dimension-audit-v11`** and read this file, `AGENTS.md`, and earlier V10/V8 handoffs. Avoid reinstall loops, no automatic Sites publication, no credentials and no real target requests.

```sh
git fetch origin feature/sqlite-mirror-dimension-audit-v11
git switch feature/sqlite-mirror-dimension-audit-v11
git rev-parse HEAD
export MPC_METHOD_ATLAS_DB=.sites-runtime/method-atlas-v11.sqlite
node scripts/method-atlas-cli.mjs init
node scripts/method-atlas-cli.mjs sql-audit '{"dimension":"GRAPH","method_id":"MHA-0224","purpose":"ROUTE","check_integrity":true}'
node scripts/method-atlas-cli.mjs reverse-links '{"root_method_id":"MHA-0192","max_depth":3,"max_rows":32}'
node scripts/method-atlas-cli.mjs dimension-audit '{"reported_branch_count":32,"reported_dimension_count":356}'
node scripts/method-atlas-cli.mjs mirrors '{"atoms":[{"atom_id":"fixture-1","native_subject_id":"fixture:object","source_refs":["fixture:native"],"evidence_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}'
node --test tests/sqlite-method-strategy.test.mjs tests/native-mirror-dimension-audit.test.mjs
node --test
npm run build
node scripts/benchmark-atomic-method-detector.mjs
```

Record real test statuses, exact commit, query-plan strings, SQLite version, `quick_check`, `foreign_key_check`, benchmark p50/p95 on the **same host and fixture** as a parent baseline, and any index regression. Do not assert an index is faster merely because it exists. If full regression fails, repair the smallest verified source defect on this branch, rerun and preserve exact PASS. Do not merge stacked drafts, mutate canonical registry or publish private Site automatically.

## Source-state / checkpoint

`CHECKPOINT_ID: MPC_SQLITE_MIRROR_DIMENSION_V11`
`FRONTIER: feature/sqlite-mirror-dimension-audit-v11`
`CHANGED: additive derived-cache indexes, SQL strategy/inverse edges, 15-native-mirror review, 32/356 discrepancy guard, dedicated tests, CLI`
`KNOWN_BOUNDARY: no method execution or external target traffic; mirrors are comparison candidates only`
`OPEN: actual Node/SQLite tests, full build, same-host speed comparison, 356 owner/definition, Sites integration`
`NEXT_ACTION: Codex validate V11 exactly on branch, repair verified regressions, then report PASS`
