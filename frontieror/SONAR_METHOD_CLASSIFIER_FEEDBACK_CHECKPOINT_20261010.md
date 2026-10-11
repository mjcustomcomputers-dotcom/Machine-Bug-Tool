# JOHNNY 5 — sonar-inspired method/classifier inversion (Crew)

**Native branch:** `frontieror-sonar-feedback-dynamic-parity-20261010`
**Source base:** `42e7508317e85f4f2f437102acfd33ef72fbaac6` (verified previous rank/density source)
**Final measured code commit:** `2472065f73072c9028180cd33011abcde9a85ce0`
**Crew solver Git blob:** `9d7c0c1de7ddf59122dc3b8e386b1961e214235c`
**Focused sonar tests blob:** `f8cf3d974c1430be906a552134b684dc62d433e3`
**Frozen exact cycle source:** `05df8ff9c10b898d7c1832217f504e9c53c91089` remains unchanged.
**No ZIP, no organizer submission, no canonical MPC registry changes.**

## Source cross-reference and scientific limit

Inspected `feature/mpc-space-animal-method-atlas-v27`, its `docs/MPC-SPACE-OF-METHODS-V27.md` and `research/space-of-methods-v27.json`. The V27 `RH-V27-07` dolphin whistle-identity research and related `RH-V27-12` playback response control are research contracts, not sonarlike CP-SAT routing implementations. The idea **PULSE -> ECHO -> CLASSIFY -> ROUTE -> INDEPENDENT VERIFICATION** is a new computational analogy applied to Crew, *not* an observed dolphin algorithm or copied bioacoustic source code.

**Method/classifier inversion:** `parity_rank_density_profile` is both a method (computes exact safe GF2 basis, density and side-target deviation pressure) and a classifier (selects supplemental XOR propagation). `coupled_cycle_choice_milp` is both a method and a possible source of CP-SAT telemetry (`num_branches`, `num_conflicts`, status); `sonar_echo_classify` converts these short-run observations into a proposed choice. The original `verify` and independently implemented original-cover checker own feasibility and objective validation.

## Five executed stages and authoritative receipts

1. Native V27/Atlas read and exact repo source read, preserving all prior methods.
2. **Two active probes** under one deadline: one plain CP-SAT + one XOR CP-SAT, then route from their branch/conflict echoes. Corrected the test harness after it mistakenly fed 8-flight fixtures to a router requiring 24+ residual flights. GitHub Actions https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38108076616 — 4/4 focused test methods PASS, but repeated tiny CP probes often yielded almost identical statistics, reduced future solver budget and failed to recover seed7 even when plain CP could succeed.
3. **Structural sonar echo:** cheap source-bound normalized side-equation activity deviation from an unbiased binary assignment, with exact GF2 rank/density, and active CP probing only if uncertain. GitHub Actions https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38108285750 — 5/5 focused test methods PASS. Same-source seed7 (240 rows, 20 sides) produced verified objective498 in 7.90852 s while old static XOR returned no incumbent in 7.92243 s in that execution. Seed31 objective619 and solver time1.66366 s; seed43 objective542 and time0.19487 s. No result on 480-row seed17 at 10s. **Caution:** these are singular time-limited runs.
4. **Out-of-development uncertain-source tests:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38108415776 — active probe sequence was **slower**, seed3 0.52740s vs fixed plain0.03756s / auto0.03683s, and seed18 0.65778s vs auto0.25554s / plain0.27220s. A method-as-classifier must *not* automatically spend time acquiring information when that information does not pay for itself.
5. **Fused method/classifier in one CP build** `cp_parity="echo"`, using rank/density plus pressure (if original safe rank/density condition and standardized pressure below 0.86, add XOR, otherwise leave literal CP side rows alone). This avoids two extra solver restarts and preserves all original constraint checks. https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38108541734 — 6/6 focused test methods PASS, including source-mutant rejection and original independent verifier, plus six synthetic A/B cases.

## Final one-search measured results (run 38108541734)

Original Crew rows | Side rows | Seed | Plain CP | Old rank/density auto | Inline sonar
--- | --- | --- | --- | --- | ---
240 | 20 | 7 | 7.92291 s, no incumbent | 7.92228 s, no incumbent | 7.92178 s, no incumbent
240 | 20 | 31 | 5.03211 s, valid obj619 | 1.66624 s, valid obj619 | **1.66957 s**, valid obj619
240 | 20 | 43 | 0.18945 s, valid obj542 | 0.22253 s, valid obj542 | 0.20071 s, valid obj542
240 | 20 | 3 | 0.05110 s, valid obj574 | 0.04893 s, valid obj574 | 0.04719 s, valid obj574
240 | 20 | 18 | 0.32345 s, valid obj651 | 0.32711 s, valid obj651 | 0.33062 s, valid obj651
480 | 25 | 17 | 4.92238 s, no incumbent | 4.92145 s, no incumbent | 4.92147 s, no incumbent

**Important:** The prior 240-row seed7 success at 7.90852s did not reproduce reliably under a strict 8s wall-clock budget; subsequent plain and fused runs both returned no feasible result. Do NOT claim deterministic zero-score recovery from this method. Different executions and runner loads prevent confident millisecond comparisons. The previous exact cycle large-case improvement (17.682–18.551x) is separate and must not be multiplied into these numbers.

## Disposition / next decisive hook

The new `sonar_feedback_cycle_rescue` (two CP probes) and `cp_parity="echo"` (one model) are **isolated research candidates**. The latter is a useful reduction in method orchestration overhead compared with active probing and retained full original oracle correctness, but it has not established consistent overall hidden-instance score or universally faster execution. Do not integrate the experimental adaptive process into main `solve()`.

The next experimental model should **compare tail distributions of time to first verified incumbent** over dozens of seeds, with repeated runs, order balancing, and strict wall-clock limits; on 480 rows, investigate feasibility methods with a genuinely new search neighborhood rather than additional parity heuristics.

Generalizable method proposal: `FEEDBACK_GATED_METHOD_AS_CLASSIFIER` — compute a cheap structural response, estimate its information value relative to the cost of measurement, only launch expensive dynamic probes if uncertainty and expected benefit justify them, and test the *measurement procedure* against an independent original-model oracle. This is an additive research label, not canonical MPC classifier mutation.
