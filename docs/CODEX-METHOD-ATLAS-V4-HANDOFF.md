# CODEX HANDOFF — MPC Method Atlas V3+V4 (2026-10-08)

**Audience:** the user's Pro GPT code supervisor and Codex Cloud task running with the user-selected Daybreak Blue offering, where actually available.

## Control / no-regression
This is a **stacked development branch** on the open Method Atlas PR #3 (`feature/method-atlas-sqlite-router-v1`, parent source snapshot `bbb93481b037aafb0f9f0a5b8b528cb9791cd1f0`). Do not begin again from the historical `9770416` Cloud setup or assume `main` contains this work. The separate earlier drafts PR #1 (method selection) and PR #2 (Daybreak authorized bounty field mission) must be intentionally reconciled. Do not overwrite the existing MPC Methods/Research OS, classified IDs, controller, private Sites deployment, or deployment credentials.

### New stacked branch
`feature/method-atlas-evidence-intent-reverse-v3`

Read in exact order:
1. `AGENTS.md`, `DAYBREAK-START.txt`
2. `docs/method-atlas-detector.md`
3. `docs/method-atlas-evidence-intent-v3.md`
4. `docs/method-atlas-computational-process-v4.md`
5. this handoff and corresponding JSON schemas/fixtures/tests

### What is real
- Additive locally indexed SQLite/D1-compatible Method Atlas: 143 MHA candidate methods, 143 paired MHC classifier questions, 44 source locators, 104 proposed method comparison edges.
- Initial V1 source base, V2 topological/gaming expansion, V3 deception/cyber-pattern/intent-neutral expansion, V4 MIT/Harvard/specialist computation and process expansion. Stable IDs, versioned overlays, no canonical MAXVAR/NESTMAX/BL/MBSS/EXT mutations.
- `lib/atomic-method-detector.mjs`: typed atom/coordinate -> compact digital dimension signature -> bounded indexed SQLite candidate query -> method cross-check proposals. Existing `PROCESS` coordinate now maps to `PROCESS` dimension. Kahn/DFS graph checking and timestamp-domain diagnostics; no target traffic.
- `lib/evidence-intent-review.mjs`: supplied-claim support/contradiction/unknown preserving, plus/minus/benign goal hypotheses, synthetic claim variations. **Not a lie detector or criminal attribution system**.
- `lib/reverse-goal-traversal.mjs`: **explicit optional supplied-model execution**, bounded graph reachability from start to multiple declared goal states, one-edge removal counterfactual, report source-unbound edges. Not proof of real-world capability, act, intent or guilt. When supplied through `goal_graph`, `explicit_supplied_goal_graph_computed=true`; do not misrepresent it as target testing.
- `method-atlas/method-relations.json` proposes complementary / challenging secondary methods; no empirical corroboration until independently sourced/executed.
- No source-based method means it is automatically applicable. No private external credentials, platform auth, native evidence, production secrets or live target data are committed.

### One-time environment
Use the already prepared Cloud environment (Node 24.19.0, pinned pnpm 11.25.0) and avoid redundant install if dependencies restored. The current branch has a changed atlas seed: **use a new ignored local derived-cache filename**, never delete or migrate canonical research evidence.

### Exact commands
```sh
git fetch origin feature/method-atlas-evidence-intent-reverse-v3
git switch feature/method-atlas-evidence-intent-reverse-v3
git rev-parse HEAD
MPC_METHOD_ATLAS_DB=.sites-runtime/atlas-v4.sqlite node scripts/method-atlas-cli.mjs init
MPC_METHOD_ATLAS_DB=.sites-runtime/atlas-v4.sqlite node scripts/method-atlas-cli.mjs detect '{"atoms":[{"id":"process","subject_id":"fixture:business-1","coordinate":"PROCESS","source_refs":["fixture:event-log"],"epistemic_state":"SYNTHETIC","depends_on":[]}],"domain_profile":"BUSINESS","max_candidates":12}'
node --test tests/method-atlas.test.mjs tests/atomic-method-detector.test.mjs tests/evidence-intent-review.test.mjs tests/reverse-goal-traversal.test.mjs
node --test
npm run build
MPC_METHOD_ATLAS_DB=.sites-runtime/atlas-v4-bench.sqlite node scripts/benchmark-atomic-method-detector.mjs
```
If branch switch would overwrite local changes, preserve them in a separate checkout/worktree; do not force-reset. If dependencies are broken, repair only the narrow defect while preserving lockfile/package pins and original 182 source blob identities.

### Required adversarial tests beyond built-in suite
- Verify exact 143/143/44/104 inventory and stable prior IDs with no source owner collision.
- Confirm matching `MHA` and `MHC` pair IDs, source pointers and 104 graph edge targets.
- Input-order invariant and typed `PROCESS`, `SYNTHESIS`, `PRIVACY` selection; unknown dimensions, missing/foreign subjects, unsupported attestations and unreferenced sources must not become verified claims.
- Claim simultaneous support+contradiction remains CONFLICTING, not true/false or lied; no conclusion based on anxiety, personality, language style, facial cues or telemetry alone.
- Goal plus/minus/benign alternatives; when one transition is removed, only supported synthetic path reachability changes; observe no real-world effect or intent inference.
- Two graph cycle algorithms agree under bounded fixtures, incompatible clock domains remain distinguished, no giant fanout or unauthorized networking.
- Verify template/metadata read-only to original registries and no production deployment; no claim that school/paper names are active solvers.
- Compare synthetic benchmark p50/p95 with a controlled baseline only if measured on the same host/load/batch; otherwise label latency not established.

### Repair rules
If failures occur, fix **only affected source/regression tests on the feature branch**, inspect actual diffs, reread changed blobs and rerun the relevant plus full tests. Do not quietly merge branches, bypass validation, loosen authorization or copy secrets. Record exact tested HEAD, number of tests, failures, build exit code, benchmark details, file SHA identities and required human decision. Do not claim 166 existing passing tests prove this new change.

### Next real intelligence improvement after validation
Typed per-method admissibility preconditions and method-results ledger: detector should distinguish a *potentially applicable* research candidate from a verified executable checker and support read-only source-backed claim/challenge receipts. Only then consider measured caching/index optimizations and expanded source-reviewed uncommon methods. Use current native program rules for all bounty activity. No auto target tests or submission.

### Completion record
`CHECKPOINT_ID: METHOD-ATLAS-V4-STACKED`
`TASK: Validate source-bound method detector, intent-neutral review, computational/process family and finite reverse-goal model`
`FRONTIER: feature/method-atlas-evidence-intent-reverse-v3; parent PR #3`
`KNOWN: source-backed candidate registry saved; isolated JavaScript structural checks passed`
`OPEN: actual Node/SQLite test suite, build, performance benchmark, hosted Sites integration, automatic Drive/Dash sync, genuine target proof`
`DO_NOT_REPEAT: original Cloud setup / older 166 tests / V1 86-method discovery / provenance collection already pinned`
`NEXT_ACTION: validate this exact feature branch in Codex Cloud and fix any new-branch failures`

**This handoff is the durable coordination interface between ChatGPT, the user's Pro GPT and Codex. No assistant can directly see or participate in another GPT task unless its actual connected tools expose that task.**
