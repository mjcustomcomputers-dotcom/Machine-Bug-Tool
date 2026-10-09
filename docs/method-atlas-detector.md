# MPC Method Atlas + Atomic Method Detector (development V1)

## Scope and source integrity

A **local, additive SQLite / D1-compatible research database** for methods, classifiers, sources, typed dimensions, and proposed method-to-method checks. It is not a replacement for the running private MPC service, its MAXVAR/NESTMAX/BL/MBSS/EXT ID namespaces, or the live Drive/Dash controller. Existing 24 bounded evaluators and 10 original method hooks are separately preserved; these are not duplicated as implementations.

- Candidate catalog: **86 MHA methods** and **86 MHC candidate classifier questions**, 20 source locator records, 12 initial families plus topological signals and gaming-control systems. Full primary-source text has **not** been validated for every transfer; source locator/abstract and method application are separate states.
- Proposed cross-method edges: **48**, typed as `COMPLEMENT`, `CHALLENGE`, or `CROSS_CHECK`. They do not imply independent evidence, executed models, established scientific validity or bounty security impact.
- Original 74-method JSON base remains unchanged. The 12-method sourced `expansion-2026-v2.json` and separate `method-relations.json` are additive inputs.
- The only persistent data is a derived local SQLite cache under ignored `.sites-runtime/`; no hosted database or production deployment is modified.
- `schema.sql` is compatible with SQLite and Cloudflare D1 SQL features, but D1 deployment, migrations, authenticating callers and performance remain separately unverified.

## Material detector architecture

```text
SOURCE-BOUND NATIVE ATOMS (max 32)
        |
        v
MPC COORDINATE -> typed dimension hint
         OR declared typed dimension
        |
        v
DIMENSION BITSET SIGNATURE (BigInt; max 128 known dimensions)
        |
        v
INDEXED SQLite dimension triggers / bounded candidate ranking
        |
        v
ELIGIBLE METHODS + DEFERRED METHODS + 48 PROPOSED METHOD LINKS
        |
        v
INVARIANT/FALSIFIER CONTRACT -> separately supplied model
        |
        v
APPROVED CONTROLLED EXECUTION -> AUTHENTICATED EVIDENCE REVIEW
```

The bitset is a deterministic compact representation of **dimension presence**, not an image sensor, physical magnet, optical/quantum computation, proof of causality, or a substitute for native source identities. It cannot infer hidden semantic dimensions from prose. It avoids an LLM call on every method lookup and executes in a single local Node process. Actual speed must be measured on the selected Cloud host; no blanket latency guarantee is claimed.

### Typed atom signature

A detector atom contains: `id`, `subject_id`, `dimension` **or** one exact existing MPC `coordinate`, `epistemic_state`, `source_refs`, and `depends_on`. Optional: `jacket_axis`, `observed_at` with explicit ISO timezone offset and `clock_domain`. This compact discovery record does **not** replace the canonical 25-coordinate / 14-jacket-axis full evidence packet: use `review_atomic_variants` for full native atom schemas and supplied-model execution when supported.

`coordinate` is only a typed routing hint (e.g., `MONEY/INCENTIVE -> MONEY`, `FINALITY/CAUSATION -> FINALITY`, `TIME -> TIME`). It does not assert that unrelated kinds of source evidence have become identical. The optional `jacket_axis` is preserved in the read-only receipt, not used to invent a method trigger.

### Seven bounded stages

1. QUICK_SOLID_STATE — verify atom type, source ID presence and signature; **structural check performed**.
2. INDUCTION — request owner-stated invariants and observed transitions; **not executed by this detector**.
3. REDUCTION — reduce declared coordinates to typed dimensions and bounded method candidate set; **performed**.
4. TRAVERSAL — traverse explicit dependencies, independently check cycles via Kahn and DFS; **structural check performed**, not an evidentiary proof.
5. TRANSFORMATION — specify reversible, one-variable supplied-model transformations; **not executed by this detector**.
6. SYNCHRONICITY — check comparable timestamp precedence and flag incompatible clock domains; **structural check performed**, unresolved cross-clock ordering remains open.
7. VERIFICATION — use complementary or adversarial methods with actual data and falsifier; **not executed by this detector**.

Unknown/unbound atoms, missing dependencies, cycles or same-clock precedence conflicts stop candidate selection. No missing source is fabricated. A candidate may remain searchable while **not eligible for promotion**. Method-vs-method check suggestions are not independent evidence and must not be described as verified consensus.

### Minimal commands for the prepared Codex Cloud environment

**First switch to the exact feature-branch head**; never count tests from older Cloud checkout `9770416` or mainline `ebe131b` as validating this change.

```sh
git fetch origin feature/method-atlas-sqlite-router-v1
git switch feature/method-atlas-sqlite-router-v1
node scripts/method-atlas-cli.mjs init
node scripts/method-atlas-cli.mjs detect '{"atoms":[{"id":"meter","subject_id":"synthetic:transaction-1","coordinate":"MONEY/INCENTIVE","source_refs":["synthetic:ledger"],"epistemic_state":"SYNTHETIC","depends_on":[]},{"id":"closed","subject_id":"synthetic:transaction-1","coordinate":"FINALITY/CAUSATION","source_refs":["synthetic:ledger"],"epistemic_state":"SYNTHETIC","depends_on":["meter"]}],"domain_profile":"BUSINESS","max_candidates":8}'
node --test tests/method-atlas.test.mjs tests/atomic-method-detector.test.mjs
node --test
npm run build
node scripts/benchmark-atomic-method-detector.mjs
```

`MPC_METHOD_ATLAS_DB=/workspace/..../atlas.sqlite` may select a local writable derived-cache path. The seed hash is pinned: if the catalog differs from an existing SQLite cache, the loader fails with `ATLAS_SEED_DRIFT_REBUILD_PRIVATE_CACHE_REQUIRED`; if old rows lack a seed pin it fails with `UNPINNED_LEGACY_ATLAS_REBUILD_PRIVATE_CACHE_REQUIRED`. Use a **new local cache path** and rerun `init` rather than modifying canonical records or deleting preserved evidence.

Run all commands inside the prepared environment under Node 24.19.0 and pnpm 11.25.0. The SQLite importer uses the Node builtin `node:sqlite` and does not require a new package/lockfile. The benchmark prints local synthetic p50/p95; it is not a production proof, SLA, cross-hardware speed comparison or live target test.

## Hooks and multidisciplinary method transfer

A method row has its own MHA ID, source, mechanism, required input, falsifier, implementation state and dimension triggers. Its MHC question is a **candidate classifier**, never an inserted MAXVAR or BL definition. `atlas_crosswalk` holds only `PROPOSED_STRUCTURAL_LINK` references to existing BL branches. Revalidate the real MAXVAR/BL owner and native definition before promotion.

Examples:
- physics/topology: renormalization, Hodge cycles, graph Laplacian, persistent topology, transport drift;
- quantum: physical quantum tomography and CHSH versus classical quantum-inspired QUBO/tensor reasoning; no implied quantum speedup;
- information/causation: entropy sources, transfer entropy, conditional independence, conformal calibration, Bayesian diagnosis;
- casino/poker: jackpot pools, cashless meters, voucher idempotency, interrupted wagers, bonuses, poker information sets, counterfactual regret and commitments.

The router uses source-bound **dimensions**, not a blanket requirement that every method run. Gaming candidates are capped to two in a generic business query unless the explicitly relevant `GAME` dimension or `GAMING` profile is supplied. Physics and quantum hooks remain conditional; physics metaphors do not establish direct applicability.

## Review, testing and deployment

- Native GitHub: this *feature branch only*, no automatic sync to private Sites main.
- Tests: SQL schema/inventory + atom routing + seven-stage state + cross-method links + source/evidence failure gates. Dedicated Node/SQLite and full 166+ tests must run in the Cloud environment at the branch head, followed by build.
- Source review: confirm original source pin, no unrelated file/lock changes, correct meta-schema/version and no untrusted sources promoted.
- Real target operations require current bounty program authorization, host/account allowlists, rate enforcement, confidentiality and independent consent for consequential operations. Neither local detector nor MPC dispatch performs target traffic.

## Handoff / next hook cycle

Recover last canonical program PASS, read this file, perform source/candidate applicability review before adding a new method, deduplicate by mechanism and required inputs, then add **new stable MHA/MHC IDs** only to versioned overlay JSON. A new source requires native citation, a distinct hypothesis and falsifier, and implementation status. Add at least one adversarial cross-method link and regression test. After a verified bounded pass, report changed methods, exact file SHA/commit, known false matches, held-out negative examples and next bounded work. **Never silently renumber methods or inflate the old 24 executable evaluators.**
