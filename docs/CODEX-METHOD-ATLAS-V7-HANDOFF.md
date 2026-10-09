# CODEX HANDOFF — Method Atlas V5–V7 / NASA, Chip, Cloud, Abnormal Hooks and Reclassification

**Current instruction owner:** this document and the existing branch-specific `AGENTS.md`, subordinated to the user's current canonical MPC and bounty program rules. Do not replace the original framework. This is a stacked **development branch**, not deployed production or an authenticated target scanner.

## Exact source frontier
- Repository: `mjcustomcomputers-dotcom/Machine-Bug-Tool`
- Branch: `feature/method-atlas-nasa-chip-overwatch-v5`
- Parent HEAD: `c6a5c5e34e6d204caf342453871e58850dfbf8cc` (PR #4). PR #4 itself rests on Method Atlas PR #3. Earlier separate PR #1 and #2 remain independent.
- Read `AGENTS.md`, `DAYBREAK-START.txt`, `docs/method-atlas-detector.md`, `docs/method-atlas-evidence-intent-v3.md`, `docs/method-atlas-computational-process-v4.md`, and `docs/method-atlas-reclassification-v7.md` as applicable.
- **No automatic Cloud/source/hosted-MPC synchronization:** native Sites app binding, current controller and Drive/Dash provenance are separate. Existing restored Cloud receipt proves only earlier setup.

## This stack's additive work
- `method-atlas/expansion-nasa-chip-cloud-v5.json`: 64 new source-linked method and classifier candidates (MHA/MHC 0144–0207), 15 additional source records. NASA fault management, chip/firmware/root-of-trust, lock/unlock lifecycle, passive cloud overwatch, admin security, connector federation, method diagnostics and authorized bounty observations.
- `method-atlas/expansion-abnormal-meta-v6.json`: 24 further source-linked research candidates (MHA/MHC 0208–0231), 4 source records. Abnormality checks, oracle disagreement, metamorphic falsification and recursive method triggers.
- **Whole Atlas**: 231 candidate research methods + 231 candidate classifier questions, 63 source locator records, 204 proposed method-to-method edges (no execution/independent-evidence assertion).
- `lib/method-hook-cascade.mjs`: bounded method-to-method graph traversal, at most depth 3 / 24 visited nodes / 48 edges, cycle and budget stop conditions. No recursive LLM requests or target actions.
- `lib/method-diagnostic.mjs`: checks method input requirements, source refs, negative-control results, oracle consistency and material input delta. Blocks overstated execution/readiness; does not authenticate evidence.
- `method-atlas/reclassification-policy-v7.json` + `lib/method-reclassification.mjs` + additive SQLite `atlas_method_taxonomy`: reclassify **all 231 existing IDs** into **2,511 typed classification rows across 9 axes**. 39 exact declared method families, 52 typed dimensions and 11 stable-ID overrides, with PROPOSED metadata status. No free-text classification on the fast query path.
- `lib/method-atlas-router.mjs` and atom detector accept optional, strictly enumerated `purpose` and return selected taxonomy metadata. Unmatched methods are deferred with `PURPOSE_CLASS_MISMATCH`.
- Regression files: `tests/method-hook-cascade.test.mjs`, `tests/method-diagnostic.test.mjs`, `tests/method-reclassification.test.mjs`, plus updated previous method-atlas/detector tests.
- **Existing native 24 bounded evaluators, 10 hooks, 17 transforms, MAXVAR/NESTMAX/BL/MBSS/EXT registries, methods/coefficients, canonical pointers and checkpoint format remain unchanged.** These 231 Atlas candidates are not newly implemented executable solvers.

## Actual verification scope now
- GitHub readback of the code, catalog and handoff is possible. Source-level JavaScript smoke used a **deterministic in-memory SQL adapter**, not the actual persistent Node/SQLite runtime. Counts, unique IDs and link target integrity have been verified at source level.
- **NOT VERIFIED YET:** Node `node:sqlite` schema run, integrated test suite, production build, live private MPC deployment, actual latency p50/p95, native target observation or payout.
- Classification/source-owner status is metadata; source link != authenticated native record. Cross-method agreement != independent evidence. A "deception" label != proof of lying or criminal intent.

## Codex operation: **run in prepared Cloud with user-selected Daybreak Blue if actually available**

Read `docs/method-atlas-reclassification-v7.md`, then safely check out the exact branch. Do not discard modifications or re-run the entire environment installer unnecessarily. Use a new ignored local derived-cache filename because the seed now includes taxonomy tags:

```sh
git fetch origin feature/method-atlas-nasa-chip-overwatch-v5
git switch feature/method-atlas-nasa-chip-overwatch-v5
git rev-parse HEAD
export MPC_METHOD_ATLAS_DB=.sites-runtime/method-atlas-v7.sqlite
node scripts/method-atlas-cli.mjs init
node scripts/method-atlas-cli.mjs classify '{"method_ids":["MHA-0224","MHA-0192"],"limit":24}'
node scripts/method-atlas-cli.mjs classify '{"axis":"PURPOSE","class_key":"CHECK_LOCK_STATE","limit":12}'
node scripts/method-atlas-cli.mjs query '{"dimensions":["GRAPH","DIAGNOSTIC"],"source_refs":["fixture:receipt"],"subject_ids":["fixture:object"],"purpose":"ROUTE","max_candidates":12}'
node --test tests/method-reclassification.test.mjs tests/method-atlas.test.mjs tests/atomic-method-detector.test.mjs tests/method-hook-cascade.test.mjs tests/method-diagnostic.test.mjs tests/evidence-intent-review.test.mjs tests/reverse-goal-traversal.test.mjs
node --test
npm run build
node scripts/benchmark-atomic-method-detector.mjs
```

### Required high-value checks
1. Exact inventories and source IDs: 231 methods + 231 paired questions + 63 source records + 204 links, 2,511 rows + nine taxonomy axes. All type-safe, stable IDs; no duplicates, missing sources, unclassified families/dimensions.
2. `classify` emits `PROPOSED` tags and exact source/status evidence, never promotes interpretation or makes private native writes.
3. Purpose-filtered query retains complete deferred accounting, blocks unknown purpose and source-unbound queries and returns the right method-diagnostic or NASA/chip/cloud/connector groups when exact dimensions demand them.
4. Method hook cascade obeys depth, node, edge, cyclic/repeated method boundaries. Diagnose false evidence; never recursively execute a solver or query live targets.
5. Method diagnostic rejects absent required inputs, source, failed negative controls, unexecuted candidates, wrong oracle claims and no-material-input-delta loops.
6. Verify source-level state shape, SQLite indexes, SQL safety, import idempotence, checksum mismatch fail-closed, and authentication/access controls unchanged.
7. Record exact `git rev-parse HEAD`, Node/pnpm versions, commands/test counts/exit status, verified performance measurement, adverse/negative cases and one next bounded action.

If tests fail, fix only the affected paths on the development branch and rerun; do not silently weaken validation. Do not merge stacked PRs, alter production Sites, delete prior workbooks, overwrite Drive/Dash canonical data, send target traffic or submit bounty reports without the required separate approval.

## Next method-on-method work after validation
Use native evidence to determine which methods are actually applicable; add tested predicate guards for required input shapes, method diagnostic execution states and method-to-method **independence audits**. Add hooks in versioned extension files and use stable next IDs only after checking actual catalog coverage. Prioritize falsifiers/invariants and finish when evidence delta is zero. No claim of optical/magnetic/quantum physical acceleration from a software bitset.

`CHECKPOINT_ID: MPC-ATLAS-V7-RECLASSIFICATION`
`FRONTIER: feature/method-atlas-nasa-chip-overwatch-v5 / exact tested HEAD to be established in Codex`
`CHANGED: 88 V5/V6 candidate methods + 100 relations, 2 analytic modules, 231 method reclassification, indexed purpose routing, docs/tests`
`OPEN: actual Node SQLite tests, full suite, build, benchmark, source-level bug fixes, eventual PR merge/hosted release`
`NEXT_ACTION: execute above tests in the prepared Cloud task, repair only verified defects, preserve exact checkpoint`
