# CODEX FINAL HANDOFF — MPC Dual Solid-State Atomic Variation Router V8

**Primary purpose:** One last tightly bounded upgrade for the existing MPC / Daybreak Blue / Codex bug bounty research environment. Fast typed method accounting, reusing previous answers, and direction/boundary variations; **no new framework, no tool duplication, no live target traffic**.

## Exact state / git order

Repository: `mjcustomcomputers-dotcom/Machine-Bug-Tool`
Feature branch: `feature/atomic-dual-variation-v8`
Base branch: `feature/method-atlas-nasa-chip-overwatch-v5` / draft PR #5
Ancestors: PR #4 (V3/V4 evidence + reverse goal), PR #3 (Method Atlas). PR #1 (method selection) and PR #2 (Daybreak field mission) are independent drafts and must be reconciled deliberately, not stacked blindly.

Read `AGENTS.md`, `DAYBREAK-START.txt`, `docs/method-atlas-detector.md`, `docs/method-atlas-reclassification-v7.md`, this file, and original native MPC contracts. No repeat of the earlier Cloud install if the environment is already restored.

## V8 actual changes

- **8 additional research-only optical/visible-light/laser communication hooks**, stable `MHA-0232..0239` with paired `MHC-0232..0239`; source records from IEEE 802.15.7 and NASA LCRD. Includes PHY/media reliability, failover, integrity vs signal, and clock synchronization. This is a **conceptual verification transfer**: the Node/SQLite method router does not contain a photonic chip, optical data communications hardware, or a physical light-speed engine.
- Complete Method Atlas now has **239 candidate methods, 239 paired candidate classifier questions, 65 source locator records, 212 proposed method-to-method edges**. These are not the 24 independent *implemented* MPC evaluators or proof of target findings.
- Type-derived multi-axis classification: 239 Method Atlas IDs and **2,597 proposed indexed taxonomy tags**; no renumbering of existing MAXVAR/NESTMAX/BL/MBSS/EXT or MHA/MHC IDs.
- `lib/atomic-variation-router.mjs` considers **every MHA method for every supplied atom and variant in all four slots: FORWARD/BACKWARD × INTERNAL_MODEL/EXTERNAL_SOURCE**. A single-atom baseline is 239×2×2=956 consideration slots; does **not** execute 956 methods. External means a separate source/evidence boundary, not automatically scanning external target hosts.
- Typed dimensions and declared source digest/IDs drive routing; a prior matching consideration is marked `CACHED_NO_MATERIAL_DELTA` and no new ledger write occurs.
- If native evidence digest changes, revisit; an explicit source-supported cross-reference can reopen only its named method. Rephrasing the same request cannot bypass the cache. Synthetic variation labels are **planning declarations** unless separately evaluated with `review_atomic_variants` under its actual bounded schema.
- Append-only derived `atlas_variation_ledger` table stores exact atom/variant/method/direction/boundary identity, evidence/variant digests, source signature, dimension signature and original decision. Distinct digest/source contexts have distinct composite primary keys; returning to a baseline after a cross-reference must reuse its original row without rerunning a previous question. Existing `MPC_METHOD_ATLAS_DB` is local *derived* cache only—do not place secrets/private customer artifacts there or mistake this for durable canonical Drive/Dash persistence.
- The CLI has an additive `variation` subcommand and writes no unrelated DB tables. The 239 method inventory is read once, and only compact summaries/examples are returned; the complete decision matrix remains in SQLite.
- Existing native implemented evaluators, 10 earlier original research hooks, 15 framework operators, 12 reductions, 17 transformations and 15 mirrors retain their own canonical namespaces; audit their distinct applicability separately. Do not sum overlapping families as independently verified, executable methods.

## IMPORTANT 32/356 ambiguity
User referenced `32/356 dimensions`. Verified historic MPC source has **32 BL branches, 384 BL child classifiers, and 25 canonical object coordinates**, with other namespace inventories and 52 typed Atlas trigger dimensions before V8. These figures are distinct and **not interchangeable**. Retain the literal user count as `UNRESOLVED_DIMENSION_COUNT_32_356`; compare exact native source before deciding whether it refers to separate variable/index dimensions. Do not quietly replace 384, invent a 356-item register, or rename 25 coordinates.

## Correct local validation in prepared Daybreak Blue Codex Cloud

Safely check out `feature/atomic-dual-variation-v8`; do not overwrite local work, fake protected MPC authentication or bypass the actual selected model's limits. Use **a newly named ignored** local database because seeded method definitions/taxonomy changed.

```sh
git fetch origin feature/atomic-dual-variation-v8
git switch feature/atomic-dual-variation-v8
git rev-parse HEAD
export MPC_METHOD_ATLAS_DB=.sites-runtime/method-atlas-v8.sqlite
node scripts/method-atlas-cli.mjs init
node scripts/method-atlas-cli.mjs status
node scripts/method-atlas-cli.mjs variation '{"atoms":[{"id":"a1","subject_id":"fixture:case1","dimensions":["TIME","INTERFACE","DIAGNOSTIC"],"source_refs":["fixture:native"],"external_source_refs":["fixture:second-source"],"evidence_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}'
# Repeat exactly, confirm CACHED_NO_MATERIAL_DELTA 956 and new rows = 0
node scripts/method-atlas-cli.mjs variation '{"atoms":[{"id":"a1","subject_id":"fixture:case1","dimensions":["TIME","INTERFACE","DIAGNOSTIC"],"source_refs":["fixture:native"],"external_source_refs":["fixture:second-source"],"evidence_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}'
node --test tests/atomic-variation-router.test.mjs tests/atomic-variation-persistence.test.mjs tests/method-reclassification.test.mjs tests/method-atlas.test.mjs
node --test
npm run build
node scripts/benchmark-atomic-method-detector.mjs
```

### Regression criteria
1. Exactly 239/239/65/212 Atlas inventory; all IDs and method source associations unchanged except V8 additions; taxonomy 2,597 tags; original 24 native executable methods not rebranded.
2. 956 consideration slots per atom baseline (239 methods × 2 directions × 2 source boundaries), all with explicit `DIMENSION_NOT_MATCHED`, `DIRECTION_UNSUPPORTED`, `SOURCE_UNBOUND`, `EXTERNAL_SOURCE_UNBOUND`, `TRIGGERED_INPUT_REVIEW_REQUIRED` or `NO_MATERIAL_VARIATION`.
3. Second exact pass returns **956 cached considerations**, zero rewritten rows. A genuinely different declared evidence digest records a separate historical decision row; adding an explicit new cross-reference source records **only named method × four slots**, while an unchanged cross-reference is cached. Rewind to either previous evidence or baseline source context must be cached without data loss. Actual SQLite persistent counts for one-atom tests: baseline 956, changed source 1,912, new cross-reference 1,916.
4. Multiple bounded synthetic variations and atoms still account for all slots, without pretending a model execution, target interaction, truth/payout, or independent evidence corroboration.
5. Confirm actual SQLite repeated-invocation retention, schema migration behavior, source-digest restrictions, SQL safety, negative controls and cache source-ID identity. Inspect for possible info leaks and performance/memory regressions. Measure p50/p95 on the **actual Cloud host**, not across incomparable machines.
6. The canonical native Method Ark, MAXVAR/NESTMAX/BL/MBSS/EXT controller and Drive/Dash checkpoints remain authoritative. If actual target work is requested, require current platform rules, allowed accounts and explicit in-scope testing actions; default here is strictly offline/source-bound.

## After tests

Correct real failures on this branch only; rerun affected tests, full suite, build and synthetic benchmark. Produce one concise NASA-inspired PASS report with exact checked-out commit, run/tool coverage, method inventory, source-binding limitations, falsifiers, latency statistics and defects. Checkpoint to the current private controller with readback if supported; if unavailable report OPEN and retain this GitHub handoff. Do not merge PRs, deploy Sites or submit a bug bounty report without explicit separate authorization.

**Next boundary:** adopt a source-validated version of the 24 native executable evaluator and original hook-method applicability inventory into its *own separate* coverage layer; do not create fake MHA duplicates or pretend all of the canonical native methods were already proven considered by the 239-candidate Atlas ledger.

`CHECKPOINT_ID: MPC_DUAL_ATOMIC_VARIATION_V8`
`FRONTIER: feature/atomic-dual-variation-v8, exact HEAD read from GitHub`
`COMPLETE: 239-Atlas full four-lane consideration architecture, optical hooks, derived cache, source-level smoke tests`
`OPEN: real Node SQLite tests, full suite/build/benchmark, canonical native-method applicability coverage, Cloud model selection, production integration`
`NEXT_ACTION: Codex validates this exact branch and repairs real failures only`

Never assert that a branch/PASS has merged, the Cloud model was selected, a target was scanned, or a bounty finding was authenticated without the respective receipt.
