# DAYBREAK MPC — V16 Defensive Forecast / Threat-Path Detector — Codex handoff

**Mode:** ADDITIVE OFFLINE DEVELOPMENT ONLY. This is a real source-bound implementation handoff, **not** a bug bounty target PASS, attacker attribution, verified exploit, report, registry expansion, deploy or merge.

## Native source / no-redo
- Repository: `mjcustomcomputers-dotcom/Machine-Bug-Tool`.
- New dedicated review branch: `feature/daybreak-defensive-forecast-v16-20261009`.
- Exact pinned predecessor: `automation/mpc-reasoning-adaptive-two-stage-v15` commit `cb15df82c76063262caae3ab6e3e557cd00cf4b7`.
- PR #14 `feature/mpc-reasoning-selfplay-v15` remains independently unmerged. Preserve separate PR #13 and the finished historical V13 controller; read their current AGENTS.md and applicable V13 resume documents at the actual checked-out commit.
- Before acting in a **new Codex task**, verify the actual branch/head, current source-writing lease, action fingerprint, and whether this exact bundle was already imported. A saved chat pointer is not source verification. Do not import twice or overwrite files from another task.

## Acquired implementation (source bundle)
- **Google Drive native file ID:** `19c06QCPsE05aR_kSEhjUwhle-t2bMKi1`.
- **Drive:** https://drive.google.com/file/d/19c06QCPsE05aR_kSEhjUwhle-t2bMKi1/view
- **File:** `DAYBREAK-DEFENSIVE-FORECAST-V16-SOURCE.zip`, 16,035 bytes.
- **SHA-256:** `2bb678a6f7327b4d639371ba4759f1206fb18c107264946f704b40c559f024eb`.
- This is a separately created portable patch distribution, not a runtime experiment archive and not source evidence of bounty target activity. The native Drive file was created and metadata read back in the originating chat.
- If the Codex environment cannot access the linked Drive source through its own authorized connector, use the user-supplied conversation ZIP attachment. **Do not pretend a URL/pointer supplied the bytes, invent a clone, or bypass the file permission.** This document is enough to implement the same bounded family from specification when exact bytes remain unavailable.

## Implemented source files in ZIP
- `lib/defensive-threat-forecast.mjs`: offline bounded deterministic defensive threat forecasting with exact declared source refs/revisions/hash fields, fail-closed typed requirements, source dependence checks, falsifiers, scope/novelty gates, missing-predicate prioritization, SHA-256 input fingerprint and no automatic evidence promotion.
- `scripts/run-defensive-threat-forecast.mjs`: local-only CLI `--input sanitized-local.json`; reads a regular bounded JSON file <=1MiB and prints JSON; NO network, scanning, connector dispatch, state writes or credentials.
- `tests/defensive-threat-forecast.test.mjs`: nine focused tests, including explicit negative controls, public prior issue classification, MITM-scope exclusion, identity-source dependence, reordered-source fingerprint equivalence, contradictory prerequisite and input validation.
- `examples/local-synthetic-input.json`: fake/local-only fixture, no program targets, tokens, credentials, private data or discoveries.
- `docs/CODEX-DEFENSIVE-THREAT-FORECAST-V16-HANDOFF.md`: expanded technical contract, existing method references and usage.
- `docs/LOCAL-VALIDATION-RECEIPT.json`: honest local receipt with per-file byte SHA-256; local Node v22.16.0 focused 9/9, failed 0. Full suite, build, destination Codex, Windows and hosted integration were **not** executed.
- `docs/local-synthetic-output.json`: bounded reference output, not target evidence.

## Six defensive detector families
1. `TLS_CERTIFICATE_CHECK_DISABLED`: flag an insecure transport guard, but MITM prerequisite and scope exclusion remain independent.
2. `UNBOUND_BEARER_DESTINATION`: forecast token escape **only if** an untrusted destination actually reaches an authenticated request constructor and origin guard does not stop it.
3. `SENSITIVE_TOKEN_LOGGING`: a logged sample token is not proof an attacker could obtain a live usable token.
4. `DISPLAY_INTERNAL_ID_CONFLATION`: presentation identifier vs internal canonical key; requires source-bound wrong-owner or sensitive state effect, and public duplicate gating.
5. `WEBHOOK_PAYMENT_ID_CONFLATION`: delivery ID != event ID != resource/Payment ID; recheck finalizer state.
6. `IDEMPOTENCY_FINALITY_GAP`: repeated attempt != second posted state effect, requires source-owned finality.

The detector accepts caller-declared source observations and *conditional* preconditions; it NEVER infers a real adversary's thoughts, identity, motive, active campaign, actual probability, verified target weakness, payout or source-independent witness. No bounty score inflation. It returns explicit observed/unknown/refuted stages, highest-value **passive source check** where scope permits, negative control and strongest falsifier. Shared sources do not become independent proof.

## Exact pre-existing Method Atlas bindings (read only)
Existing reviewed MHA candidates at predecessor: `MHA-0037` barrier-versus-hazard coverage, `MHA-0038` noninterference comparison, `MHA-0093` authenticity-vs-consistency, `MHA-0096` transaction/replay, `MHA-0098` audit coverage, `MHA-0100` identity-binding and `MHA-0118` countermeasure coverage. These are **RESEARCH_HOOK** entries, not executed solvers. Preserve all 239 research candidates and original 24 native evaluators; don't mint new MHA/classifier IDs. The new V16 adapter is a separate local instrument.

## Safe Codex acceptance sequence
1. Verify this GitHub review branch and native predecessor first; inspect pending writers before any mutation. Preserve no-redo locks and all original files.
2. Resolve the **exact** ZIP bytes via connected native Drive or provided file. Check SHA-256 equals the pinned digest; otherwise **stop**, don't reconstruct a source-equivalent run.
3. List ZIP entries and reject absolute paths, `..` traversal and unexpected content. Extract into a **fresh temporary workspace**, inspect names and existing repository paths, and copy **new files only**, refusing to overwrite existing paths. Keep V13, V15 old cursor, router, CodeX bridge and runtime state unchanged.
4. Run affected scoped test only: `node --test tests/defensive-threat-forecast.test.mjs`. For the included all-synthetic fixture: `node scripts/run-defensive-threat-forecast.mjs --input examples/local-synthetic-input.json`. Compare output to included fixture and manifest; don't claim real target execution.
5. Inspect existing method Atlas refs and typed router boundaries before any OPTIONAL integration. Do not wire automatic target fetching or source promotion. Only a verified material source change permits broader gates; do not replay the 406/406 / 508/508 suites simply to do activity.
6. Commit only additive, tested files on this branch or a separately named child review branch. Read back SHA, exact changed paths and test receipt. Never merge, deploy, modify production, publish target vulnerability details, or contact bounty targets.
7. Return a delta report: old code behavior, new detector result on negative/positive synthetic controls, exact actual calls/tests, source/hash, known limits, active/no-op gates, and smallest real next use with authorized **previously acquired** native data. Actual bounty recon/cursors remain exclusively with the separate `MPC Bounty Forward Progress` automation.

**Local CLI (Windows PowerShell as well):**
```powershell
node .\scripts\run-defensive-threat-forecast.mjs --input .\examples\local-synthetic-input.json
```
No change to script execution policy, no elevation, no install or auto-update is required.

## Security and provenance firewall
Do not put confidential bounty program material, account credentials, bearer tokens, raw HAR, PII, private findings, unreleased vulnerabilities or sealed evidence in public GitHub code, issues, examples, Dash, or the handoff. Published synthetic fixture is deliberately inert. AI disclosure, program authorization, retention and confidentiality remain program-specific gates. GitHub patch acceptance != target proof; local test != the user's Windows run; proposed method != executable native evaluator; source consistency != independent observation.
