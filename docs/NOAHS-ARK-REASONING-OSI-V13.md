# MPC V13 — Noah's Ark Seven-Layer Reasoning and Workbook/Notebook Handoff

**Scope:** Add a bounded reasoning layer to the existing MPC Method Atlas, with one separate Drive workbook and one offline GitHub notebook. Preserve existing Machine Legal / BugTools architecture, user-owned native controller, MAXVAR/NESTMAX/BL/MBSS/EXT names and IDs, exactly separate 24 implemented MPC evaluators, 10 original method hooks, 239 additive MHA/MHC candidate entries, and all existing source/checkpoint rules. **Do not automatically deploy, merge, or test bounty targets.**

## 1. Grounded delta and discovered source defect

Parent checkpoint: PR #10 (`feature/atlas-seed-semantic-integrity-v12`) commit `be26479d0fd89e32fdaba71c0262a1bdcd12ece6`.

The initial method-on-method pass found eight optical `method-atlas/method-relations.json` links with malformed, nonpadded source/target IDs (e.g., `MHA-232` rather than `MHA-0232`). Before patching, `planNoahsArkReasoning` correctly rejected the catalog as `INVALID_METHOD_RELATION`. The eight source/target pairs were repaired to canonical four-digit `MHA-####` IDs with **no renumbering of existing method definitions**. The new `tests/method-relations-integrity.test.mjs` checks every one of 212 proposed links resolves to a defined MHA method ID and no duplicate edge exists.

Also discovered: 65 source metadata records and 64 distinct primary-source IDs referenced by the 239 methods. `V6_METAMORPHIC` is retained but currently has no primary-method reference. It is an **OPEN_SOURCE_USAGE** item, not a reason to manufacture a new method attribution.

## 2. OSI-inspired separation — seven analytical layers

This is an **analogy to layered responsibility**, not the ISO network OSI specification and not an optical, quantum, or photonic processing hardware claim.

1. `SOURCE_AND_AUTHORITY`: Exact source owner, native ID, version, testing permission. Fail closed on missing source.
2. `TYPED_ATOM_AND_STATE`: Source-owned subject/atom, native coordinates, typed dimensions, evidence states.
3. `STRUCTURE_AND_INTERFACES`: Dependencies, actor/capacity, interfaces, time, forward/backward and inside/outside evidence boundaries. Existing native 15 mirrors remain separate.
4. `METHOD_APPLICABILITY`: Check every registered MHA candidate by typed dimensions and caller-supplied *structured* readiness. Absence/unknown of required input stays blocked or review-required.
5. `BOUNDED_REASONING_PLAN`: Pick a small set based on uncovered dimension coverage, readiness of negative controls/falsifiers and declared computation cost. Lexicographic rule is deterministic, not a probability of bug finding or globally proved optimum.
6. `CHALLENGE_AND_FALSIFICATION`: Prefer a named CHALLENGE/CROSS_CHECK/COMPLEMENT edge; record whether challenger inputs are ready. No repeated citation counted as independent evidence.
7. `OUTCOME_AND_CHECKPOINT`: Only native, actually observed results with exact owner/version/readback may advance the PASS. The V13 router itself does **not** execute any method or submit a report.

The `lib/noahs-ark-reasoning.mjs` module produces **239 method decisions** on the present catalog, even when only one method is selected. The output includes reason codes, selected/paired methods, deferred methods, layered checks, source epistemic boundaries and an explicit outcome vector: coverage, structurally applicable count, ready count, controls ready, falsifiers ready, cost units, unresolved dimensions and exact next evidence action. Caller-supplied flags are not authenticated by the router.

## 3. Drive workbook — actually created and read-back verified

Native Google Sheet:
`1hsuWvDGTMJE7_UFJaqlw8hzofDRl-9h2ZtphMDFh9Bw`
<https://docs.google.com/spreadsheets/d/1hsuWvDGTMJE7_UFJaqlw8hzofDRl-9h2ZtphMDFh9Bw/edit>

Tabs:
- `Ark Registry`: 239 exact source-owned MHA IDs, names, families, typed dimensions, source ID/URL, source-review state and original falsifier.
- `OSI Reasoning`: Seven responsibilities, required inputs, stop rules and current execution status.
- `Outcome Scenarios`: Four explicit **synthetic/unverified** scenario comparisons; no live target or reward assumptions.
- `Source Pointers`: Current development and native source locators, explicitly noncanonical.
- `Ark Dashboard`: Formula-driven 239 total candidate count, 239 research-only, 0 executable Atlas rows (separate original 24 finite native solvers), 64 referenced source IDs, 7 reasoning layers and 0 verified bounty findings; one unused `V6_METAMORPHIC` source locator remains flagged.

This Sheet is **not** a replacement for the controlling MBSS/compiler registers or a durable proof that the GitHub branch was deployed. Do not overwrite existing `MPC-Repair-and-Submission.xlsx` or original Drive source sheets.

## 4. Notebook — real offline analyzer, not a ChatGPT connector

GitHub source: `notebooks/MPC-Noahs-Ark-Reasoning-V13.ipynb`. Uses Python 3 standard library to read local committed JSON source and invoke the actual Node `scripts/method-atlas-cli.mjs reason` command. Creates a local ignored synthetic comparison CSV, never requests target URLs, stores credentials, executes exploits, imports hosted private connector responses, or asserts security outcomes. Running it in Codex requires the checked-out repository/Node environment.

Versioned pointer: `connector-bridge/reasoning-artifacts-v13.json`. GitHub refs and Drive IDs are native locators; neither is a cross-app automatic synchronization process.

## 5. What the synthetic scan established

On a synthetic money/finality object with exact *fixture* native source refs, three caller-declared method-readiness controls were supplied:
- All **239** research candidate methods were **considered**.
- **23** had a typed dimension overlap with the atom.
- **2** matched and had caller-declared ready input schemas.
- **One** method (`MHA-0053`, progressive-jackpot contribution/reset) covered both dimensions under the bounded lexicographic rule.
- `MHA-0035` was proposed as a **complement**, not independent corroboration and not an executed method.
- The source-level run returned `EVIDENCE_REVIEW_PLAN_ONLY`, no target testing, no independent evidence, no verified bug or payout.

For cloud configuration or an unknown native source, the alternative fixture emits appropriately blocked input/source states. These are **synthetic demonstration results** used to detect selection failure modes, not security findings.

## 6. Codex Daybreak / Pro GPT handoff

Branch: `feature/noahs-ark-reasoning-osi-v13`. Read `AGENTS.md`, this file, and `connector-bridge/reasoning-artifacts-v13.json` first. Keep the Node 24 / pnpm 11.25.0 Cloud environment and existing source identity. The existing hosted MPC Sites service is separate.

```sh
git fetch origin feature/noahs-ark-reasoning-osi-v13
git switch feature/noahs-ark-reasoning-osi-v13
git rev-parse HEAD
export MPC_METHOD_ATLAS_DB=.sites-runtime/noahs-ark-v13.sqlite
node scripts/method-atlas-cli.mjs init
node scripts/method-atlas-cli.mjs reason '{"atom":{"subject_id":"fixture:transaction","atom_id":"fixture:ledger","dimensions":["MONEY","FINALITY"],"source_refs":["fixture:owned-ledger"],"external_source_refs":[]},"method_receipts":[{"method_id":"MHA-0053","input_state":"AVAILABLE","negative_control_state":"AVAILABLE","falsifier_state":"AVAILABLE","estimated_cost_units":2}],"max_selected":4,"max_pairs":4}'
node --test tests/noahs-ark-reasoning.test.mjs tests/method-relations-integrity.test.mjs
node --test
npm run build
python3 -m json.tool notebooks/MPC-Noahs-Ark-Reasoning-V13.ipynb >/dev/null
```

Optionally open the notebook with Jupyter installed and run all cells inside the checked-out repository; compare the outcome CSV to the workbook's explicit synthetic scenario statuses.

### Adversarial gates to enforce

- All 212 relation IDs fully resolve and are zero-padded; exact 239/65/212 inventory; no added fake method or reclassified original native evaluator.
- No unknown/missing source promotes a method; no made-up user account/target permission or production task.
- Same typed evidence + input-readiness set yields the same deterministic selected and challenger IDs independent of input order.
- Method links not mistaken for independently authenticated corroboration.
- Negative-control/falsifier unavailability blocks or reduces readiness; no inference of truth or payout.
- Existing V8 per-atom forward/backward × internal/external source consideration and cache remain intact; V13 planning must not replace it.
- No automatic Google Drive sync beyond the explicitly saved workbook, no Notebook external networking, and no GitHub↔Sites production claims.

**Actual full Node tests, notebook execution, and build are pending on this branch.** Prior Cloud receipts do not validate these changes. Repair discovered issues on this development branch only, record test outcomes, exact commit, human approvals and the next bounded action.

## Exact PASS continuation
`CHECKPOINT_ID: MPC_NOAHS_ARK_V13`
`FRONTIER: feature/noahs-ark-reasoning-osi-v13`
`COMPLETED: seven-layer reasoning, deterministic full 239 candidate accounting, exact method relations ID repair, Drive workbook 5 tabs readback, notebook saved in GitHub`
`OPEN: Node tests/build, notebook run, per-method proof input schema binding, native method evaluator integration, 356-dimension claim original owner and physical-source verification`
`NEXT_ACTION: Codex test this branch and repair only observed defects; do not automatically merge/deploy`
`DO_NOT_REPEAT: old Cloud installer, 239-method discovery, old connector pointer searches, existing native MAXVAR/BL compiler ingestion`
