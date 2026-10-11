# FrontierOR Crew — MPC atomic compression and adversarial fault-line checkpoint

**Completed source date:** 2026-10-10 CDT / 2026-10-11 UTC.
**Parent source commit:** `7c898ab71e75467aca2fb3fce9d36143ab126880` (prior exact-components release).
**Branch:** `frontieror-mpc-atomic-side-compression-20261010`.
**Final tested change commit:** `27170da70800e6db6a8412c716940523adf23db1`.
**Full native GitHub Actions verification:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38103242361 — SUCCESS.
**GitHub Actions artifact:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38103242361/artifacts/11688433207.

## Implemented mathematical transformation

`compact_side_atoms(p, reduction, exclude=())` merges side-constraint rows only when their **active-column coefficient vectors are exactly equal or sign inverses** after exact forced-column reductions. It converts inverse bounds into the chosen representative's orientation, intersects all residual intervals (largest lower/smallest upper), and preserves every original column ID. No approximately equal or merely proportional floating point rows are merged.

Both SciPy MILP and native HiGHS consume these reduced rows after established side-envelope redundancy elimination. Existing `verify(p, answer)` checks the complete untouched original model and exact objective.

An initial q<4 shortcut was **falsified** by tests on 2–3 duplicate rows. This was repaired to q<2. A second-order uniqueness prefilter checks a necessary sign-invariant abs-coefficient sum before constructing full signatures. Hash/checksum collisions trigger exact signatures, never merging on the checksum alone. All-unique rows safely retain the original constraint set.

## Adversarial simulations and what they proved

- 200 randomized signed-cost small exact-cover models, including optional empty rotations, duplicate and inverse constraint rows, and varied bounds, checked against full brute-force optimum.
- 60 seeded metamorphic column-permutation / simultaneous side-sign inversion models, checked against same brute-force optimum.
- Directed fault cases: contradictory inverse bounds (must remain infeasible), a strict duplicate requiring bound intersection, near-equal coefficients that must NOT coalesce, late inverse duplicate that defeats unsafe early-exit detectors.
- The first CI run correctly caught the q<4 dispatch defect (2 failing tests), and the corrected full-run fault suite passed **6/6 test methods**, exercising 260 randomized/metamorphic seeds plus directed fixtures. The six total regression suites passed **98/98 tests**.
- Other five solver sources and their shared runtime helpers were not modified.

## Native objective and runtime evidence

Final Python 3.12 controlled ABBA synthetic MILP measurements (same instance within each scenario, warmed libraries, two runs per treatment):

| Scenario | Original side rows | Effective side atoms | Original MILP median | Compressed median | Relative ratio | Full-model objective |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cloned + sign-inverted | 100 | 1 | 0.03135 s | 0.02343 s | **1.338x** | 1630.0 (both proven) |
| All unique | 100 | 100 | 0.06185 s | 0.06345 s | **0.975x** | 1318.0 (both proven) |

The repeated-row case used **25.3% less solve time**; the unique-row case still incurred **2.6% greater solve time**. Tiny runtimes and one fixture per condition do not establish statistical confidence or private-score improvement. The MPC counterexample refinement retained the unique-row overhead as a **candidate guard**, not a promoted system rule.

Full six-solver regression tests **98/98 passed**, synthetic six-problem objective comparisons passed, offline read-only Docker with **2 vCPU / 4096 MiB / 22 s probe budget: 12/12 cases passed**, official folder structure and byte hashes checked. Crew Docker smoke 0.204s and stress 0.225s on final run; benchmark figures are controlled solve-phase, not total full-run improvements.

## Archive identity and next gate

**Candidate:** `frontieror/downloads/FrontierOR-Main.zip`
**Archive size:** 61,959 bytes
**Archive SHA-256:** `22a77b95ec9c06dfc8621ce612e83a0477b4f71f3b1859caf6ce647987b46542`
**Crew solve.py SHA-256:** `a4be7871b5cb484cfc5337ebe54510367bf044d3a9354439046c389fd8899be9`
**Artifact includes:** submission ZIP, manifest, all-six objective benchmark, atomic ABBA benchmark, constrained Docker report.

**State:** VERIFIED HOSTED SYNTHETIC AND RESOURCE PASS / ORGANIZER PRIVATE SCORE NOT OBSERVED. Previous best completed organizer score reported by owner remains **0.7909**, not improved by an authenticated new scored submission. Candidate is isolated; no FrontierOR upload or canonical branch promotion was performed.

**Next hook:** further reduce unique-constraint fingerprint overhead only if matched ABBA and objective tests improve, and explore exact side-constraint dominance/implication beyond equal/inverse signatures with proofs preserving float semantics. Measure mixed populations and evaluate official score only after the owner's authorized submission. Do not add caches blindly, change other solver sources, rename archive, or conflate CI success with leaderboard gain.
