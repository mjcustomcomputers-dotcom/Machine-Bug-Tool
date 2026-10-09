# Method Atlas V7 — Reclassification of existing 231 methods

**Scope:** An **additive multi-axis classification index** over the V1–V6 Method Atlas already present on this stacked development branch. No native MAXVAR/NESTMAX/BL/MBSS/EXT IDs, MHA/MHC IDs, method source records, research claims, method definitions, original 24 runnable MPC evaluators, or 10 original hosted method hooks are renumbered or replaced.

## Problem solved

Original Method Atlas entries are historically grouped by domain or institution (NASA, MIT, Harvard, gaming, cloud), but **institution/domain is not a method function**. A user may want a `FALSIFY`, `ROUTE`, `OBSERVE`, `RECONCILE`, `DIAGNOSE_METHOD` or `CHECK_LOCK_STATE` operation regardless of origin. V7 indexes each original method along independent axes so an existing typed atom can retrieve functionally relevant methods. These tags are **explicit rule-based suggestions**, not authenticated semantics or a scientific performance score.

## Complete typed classification

- Existing 231 candidate methods / 231 paired candidate classifier questions retained.
- Compiled **2,511 classification rows** across 9 axes (39 exact family declarations, 52 declared dimensions, 11 stable-ID exceptions).
- Classifications have `review_state = PROPOSED`; unknown family, missing source entry, unknown dimension, duplicate method ID or invalid input are errors, not guessed defaults.
- Every row has a `classification_basis`: `FAMILY_DECLARED`, `DIMENSION_TYPED`, `METHOD_ID_OVERRIDE`, `NATIVE_METHOD_METADATA`, or `SOURCE_LOCATOR_METADATA`. No free-text NLP is required for method classification or lookup.

| Axis | Example | What it means / does NOT mean |
|---|---|---|
| DISCIPLINE | META_METHODS, SAFETY_ASSURANCE, ACCESS_CONTROL | Origin/engineering field, not correctness |
| PURPOSE | ROUTE, FALSIFY, VERIFY_AUTHORITY, DIAGNOSE_METHOD | Candidate task function, not automatic execution |
| MODEL_KIND | METHOD_GRAPH, LEDGER_OR_TRACE, EVENT_LOG | Expected data shape, not an authenticated source |
| DIRECTION | FORWARD, REVERSE, BIDIRECTIONAL, COMPARATIVE, COUNTERFACTUAL | Declared method review direction, not logical inversion proof |
| EVIDENCE | METHOD_RECEIPT, LEDGER, POLICY_AND_ACTOR | Needed input category, not evidence already obtained |
| WORKFLOW_STAGE | PASSIVE_RECON, ADVERSARIAL_REVIEW, METHOD_ROUTING | Where to use the method, not completed work |
| IMPLEMENTATION | RESEARCH_HOOK | State inherited from underlying catalog; none of these 231 are claimed as verified executable evaluators |
| SOURCE_REVIEW | DIRECTLY_RETRIEVED, LOCATOR_ONLY | Whether source landing/description was read; not full-text method validation |
| QUANTUM_REQUIREMENT | CLASSICAL_QUANTUM_INSPIRED, QUANTUM_HARDWARE_OR_SIMULATOR | Prerequisite distinction, not speedup |

This classification belongs to `method-atlas/reclassification-policy-v7.json` and `lib/method-reclassification.mjs`. The SQLite `atlas_method_taxonomy` table is additive, indexed on `(axis,class_key,method_id)` and `(method_id,axis)`. The importer compiles and stores the taxonomy and includes it in the local seed fingerprint. Old derived SQLite caches with the wrong fingerprint fail closed; use a **new ignored local cache**, not a canonical overwrite.

## Router delta

`routeMethodAtlas` and the bounded atom detector accept optional `purpose`. For example, if a native evidence packet already indicates GRAPH + DIAGNOSTIC:

```json
{
  "dimensions": ["GRAPH", "DIAGNOSTIC"],
  "source_refs": ["fixture:method-receipt"],
  "subject_ids": ["fixture:object"],
  "domain_profile": "BUSINESS",
  "purpose": "ROUTE",
  "max_candidates": 12
}
```

The router intersects the existing typed dimensions with taxonomy PURPOSE. A candidate outside that purpose is deferred with `PURPOSE_CLASS_MISMATCH`, rather than silently lost. Selected candidates include `method_taxonomy` evidence/workflow tags with `taxonomy_review_state=PROPOSED_NOT_SOURCE_AUTHENTICATED`. Missing source or subject bindings still block selection.

Independent `classify` queries support up to 12 exact method IDs or a typed axis and class key; result count is bounded, and SQL uses prepared parameters. Examples below.

## Fast local Codex commands (use the actual V7 feature branch)

```sh
git fetch origin feature/method-atlas-nasa-chip-overwatch-v5
git switch feature/method-atlas-nasa-chip-overwatch-v5
git rev-parse HEAD

# Fresh derived local cache, never the prior v1-v6 cache or private native evidence.
export MPC_METHOD_ATLAS_DB=.sites-runtime/method-atlas-v7.sqlite
node scripts/method-atlas-cli.mjs init
node scripts/method-atlas-cli.mjs classify '{"method_ids":["MHA-0224","MHA-0192"],"limit":24}'
node scripts/method-atlas-cli.mjs classify '{"axis":"PURPOSE","class_key":"CHECK_LOCK_STATE","limit":12}'
node scripts/method-atlas-cli.mjs query '{"dimensions":["GRAPH","DIAGNOSTIC"],"subject_ids":["fixture:object"],"source_refs":["fixture:method-receipt"],"purpose":"ROUTE","max_candidates":12}'

node --test tests/method-reclassification.test.mjs tests/method-atlas.test.mjs tests/atomic-method-detector.test.mjs tests/method-hook-cascade.test.mjs tests/method-diagnostic.test.mjs tests/evidence-intent-review.test.mjs tests/reverse-goal-traversal.test.mjs
node --test
npm run build
node scripts/benchmark-atomic-method-detector.mjs
```

Record actual Cloud checkout hash, Node/pnpm, test totals, command statuses, returned tag counts, latency p50/p95 and adversarial failures. The originating GitHub session used an in-memory database adapter for source-level JS smoke tests; **Node/SQLite suite, full build and Cloud benchmarks have not yet been executed on this feature branch.**

## Method-on-method governance

1. Reclassify once at load time, save it as a compact indexed database; do not repeatedly process method prose through an LLM.
2. Route by exact typed dimension + optional purpose; retain unmatched candidates as deferred, never fabricate applicability.
3. Gate with actual method schema, required source binding and current implementation state before any model execution.
4. Ask the proposed challenge/cross-check graph for specific second methods only when evidence or an invariant is unresolved. Those secondary methods may share a source or assumption and are **not independent proof**.
5. Use bounded hook-cascade budgets and the method diagnostic's stop rules to prevent repeated no-information-gain work.
6. Do not interpret taxonomy, case pattern, criminal behavior label, risk, physical hardware analogy, user authentication or a research paper as authorization to contact a live bounty target or as proof of real-world cause/intent.
7. Native project pointer and PASS output still outrank this development index. Promotion/deployment needs separate verified changes and authorization.

**Exact continuation:** compare V7 source/SQLite implementation and tests at this branch HEAD, resolve only actual failures, then reconcile parent PR #4 and PR #3 plus earlier PR #1/#2 before merging or deploying. The real hosted MPC service is unchanged.
