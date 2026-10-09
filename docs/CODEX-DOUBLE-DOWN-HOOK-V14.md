# MPC V14 — Double-Down Self-Audit Hook / Codex Continuation

**Project:** existing Machine Legal / BugTools and Method Atlas, not a replacement stack.

**Base verified:** `feature/noahs-ark-reasoning-osi-v13` commit `e9b0f55962a6c07acee4882812bb9dba291539ae`.

**Development branch:** `feature/classifier-morph-router-v14` (additive and separate from V10 `feature/chatgpt-hot-resume-v10`, draft PR #12).

## Purpose

Turn MPC's router decisions into **source-bound classifier objects**, then invert/falsify those *new* objects in a second bounded pass. Feed the resulting actionable questions to Codex for the future full morph/transformation router while keeping the original MPC namespaces, source authority, OSI stages and evidence state unchanged.

The new pure function `doubleDownClassifierAudit` in `lib/classifier-double-down-hook-v14.mjs` accepts V13 `planNoahsArkReasoning` receipts, optional V8 `planAtomicVariations` receipts, exact Git blob identities and a **caller-supplied** native-source revision state. It returns paired `primary_pass` and `secondary_pass` hook records with lineage SHA fingerprints and bounded budget. Original classifier predicates remain unchanged. No connector calls, service deployment or model execution occur in this module.

## Actual framework self-audit (2026-10-09, synthetic source/atom)

Source code was **fetched by native GitHub connector** and evaluated directly from immutable V13/V8 blobs; the following are results of those functions over explicitly synthetic inputs, not production telemetry.

1. **Readiness metamorphic hook — V13 source blob `4408d1d2e11394b42841b6cd2180d09a78e5c52e`.** Synthetic method MHA-0144 `RESEARCH_HOOK`, caller-declared `input_state=AVAILABLE`, but `negative_control_state=MISSING` and `falsifier_state=MISSING` was selected as `STRUCTURAL_METHOD_CANDIDATE`. Morphing only `implementation_state` to `VALIDATED_IMPLEMENTATION` left the selection unchanged. The V13 receipt still correctly said `no_method_executed=true` and `no_source_authentication=true`. The gap: selection and executable-readiness remain separate concepts that downstream clients should not collapse.

2. **Full 239-Atlas self-audit — same V13 module, actual 239 candidates / 212 proposed relation edges.** Synthetic `DIAGNOSTIC,VERIFICATION` atom yielded 49 structurally triggered, 2 caller-declared ready, **1 selected (MHA-0192, RESEARCH_HOOK)**, **1 unready proposed challenger (MHA-0129, CHALLENGE)**, and 0 ready negative controls / falsifiers for the selected method. These are accurate *planner* outputs; no target/network inference.

3. **Cache double hook — V8 source blob `11c6f5fea3c4893b6f43d37af714448be32fac37`.** A one-method test covered four FORWARD/BACKWARD × INTERNAL/EXTERNAL lanes. Initial pass yielded four input-review decisions; exact repetition with prior ledger yielded `CACHED_NO_MATERIAL_DELTA:4`. Native file-revision changes **not supplied to this router** were invisible, because the V8 atom schema has no native-version field; explicitly changing `evidence_digest` or `source_refs` invalidated all four cache decisions. The existing V10 `planVersionCache` provides a different, revision+digest-aware source metadata comparison, but that independent branch is not yet integrated here.

4. **Real hosted MPC supplied-model challenge:** `metamorphic` model fingerprint `f6d30b20b09ab1be3ed7d3aa1bea0a0ac242a44604e6f259f690eb5ad9823983` reported unchanged selection when implementation state alone changed. NASA `fault_tree` fingerprint `3a366a8f011416a7a143c4102c371b27a4ae8ff25381f80100b488ddae398fb4` evaluated a supplied three-condition model for possible stale-cache reuse; `root_value=true` represents the hypothetical modeled conditions, not observed production failure.

## Implemented narrow V14 addition

`lib/classifier-double-down-hook-v14.mjs`:
- Phase 1: classify selection, research implementation, caller-declared input, missing controls/falsifiers, unready cross-method challenger, uncovered dimension, source-owner gap, absent external source and cached-source revision gap.
- Phase 2: produce an explicitly derived inverse question/falsifier and next source/method action for each phase-1 hook.
- Preserve original V13/V8 receipts and native method ID. Derive new `MORPH:<sha256-prefix>` IDs; never renumber canonical MAXVAR/NESTMAX/BL/MBSS/EXT/MHA/MHC.
- Cap hooks, stable-sort by bounded rule priority and target ID, cache identical planning results via SHA-256, retain source lineage and OSI layer.
- Return `methods_executed:0`, `canonical_promotion:false` and `source_authentication:false` explicitly.

`tests/classifier-double-down-hook-v14.test.mjs` verifies paired passes, lineage, fixed-point ordering, bounded output, missing source, source-version invalidation, unready challenger and nonpromotion.

**Local Node 22.16.0 focused tests: 9/9 passed**. GitHub upload read-back SHA equality:
- Module `fec87ae42ab53e9d2974926f2d9a249ed87133bb`.
- Test `c6e1112fc02d7a2c738f1898dd142a56dede3682`.

## Exact Codex action for next session

1. Read `AGENTS.md`, `docs/NOAHS-ARK-REASONING-OSI-V13.md`, `docs/atomic-execution.md`, this handoff, plus V8/V13 routers and V10 PR #12 source-change/caching code. Confirm V14 SHA and dirty-tree state first.
2. Run `node --test tests/classifier-double-down-hook-v14.test.mjs tests/noahs-ark-reasoning.test.mjs tests/atomic-variation-router.test.mjs tests/method-relations-integrity.test.mjs`, followed by `node --test` and `npm run build` on the actual branch. The entire repository suite/build remains **unverified** in this ChatGPT session.
3. Falsify the V14 module itself: challenge `VERIFIED_MATCH` as a caller-asserted flag, forged source refs, malformed selected-method records, duplicate/misordered relation evidence and stable hash collisions/lineage confusion. Tighten schemas only where evidence justifies.
4. Integrate V10's verified native source revision+digest into V8 cache decisions without merging the divergent branches indiscriminately. Require the source owner's actual revision readback before admitting `VERIFIED_MATCH`.
5. Implement a true classifier morph algebra by adapting the existing 17 finite MPC transforms, respecting V8's six variation kinds; use V13's OSI layers and all 239 candidates as structural considerations, with the original 24 finite evaluators distinguished from research hooks.
6. Build a second method-on-method falsifier pass using `MHA-0192..0199` diagnostics and NASA methods `MHA-0144..0151` when typed dimensions match. Replay the same full 239-method self-audit and compare exactly.
7. Add an integration test with the full catalog and a bounded local SQLite fixture. Report exact executed evaluator count (distinct from 239 considered), source-version cache invalidations, deterministic output, speed and test results.
8. Keep this development branch isolated. No deployment, merge, native research controller mutation or bounty target traffic without separately authorized action.

## Checkpoint

`CHECKPOINT_ID: MPC_V14_DOUBLE_DOWN_HOOK_SOURCE_ONLY`

`FRONTIER: feature/classifier-morph-router-v14`

`COMPLETED: direct V13/V8 self-audit, actual 239/212 self-input pass, two hosted MPC supplied-model challenges, additive two-pass hook module, nine local tests, exact Git blob readback`

`OPEN: full Node suite/build, real host source-version binding, richer classifier transforms, full method-on-method runtime integration`

`NEXT_ACTION: Codex validate tests/build, strengthen caller-assertion boundary, bridge V10 source-version cache into V8, then implement bounded morph operator adapters`

`DO_NOT_REPEAT: re-ingest 239 Method Atlas research methods, rebuild original classifier registries, reinterpret DASH as a second source, rerun Cloud installer without an environment change.`
