# JOHNNY 5 — FrontierOR Main six-solver release receipt

Source/date: 2026-10-10 CDT / 2026-10-11 UTC.
Branch: `frontieror-main-release-candidate-20261010`.
Release commit: `82e2350b50c849e3198a71a551be999abbce7346`.
Compiled output: `frontieror/downloads/FrontierOR-Main-Johnny5-Verified.zip`.
SHA-256: `0845946d74cd022824e89abdceb93f66046055d15f0f85d3fa26cac347975f20`.
Size: 78,370 bytes; twelve exact standalone entries (one solve.py + copied _runtime_core.py for each of six slugs).
Manifest: `frontieror/downloads/FrontierOR-Main-Johnny5-Verified.manifest.json`.
Native CI: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38111999532 — SUCCESS.
Tests: 174/174 independent Python tests passed inside offline Docker restricted to 2 vCPU, 4 GB with pinned Python3.12 published numerical packages; extracted ZIP tested again with six real CLI entrypoints and independent per-family output oracles; separate archive replay passed.
Original default five non-Crew solve.py source SHA-256s remain the same as frozen branch. Crew source `hoffman1993/solve.py` SHA-256: `55195a038d3094bb61044f2379f5cd23f16bb1261e866cb42b93bc0b80f7453f`.

## Logic: simultaneous multi-objective method classification with safe CPU ownership

- Up to four **cheap** indicators are evaluated in the existing source reduction/router: residual graph topology, side-row coupling pressure, nonzero matrix work, and clock budget. This is method-as-classifier, and classifiers as method-selection criteria; it is not four simultaneous heavy MILP processes.
- On the competition's 2-vCPU target, heavy cycle reconstruction and sparse MILP are staged to avoid contention; a valid incumbent is independently verified and preserved; unverified/timeout/UNKNOWN never proves original infeasibility.
- Auto route only for a narrow, independently tested residual degree-two graph subclass (80..320 rows and other structure/work/time bounds). Other problem instances retain original sparse MILP/HiGHS/CP-SAT selection, including the 480-row generated adversarial instance.
- Extended Atlas / MPC method cross references read from Method Ark: FRAMEWORK_OPERATORS 6 causal control, 7 robust feedback, 8 network graph, 9 lower-bound impossibility, 10 information-gain minimization, 11 error-correcting redundancy, 13 uncertainty preservation, 14 compositionality, 15 anti-overfitting. Method-origin labels are conceptual review declarations, not external math engines; executed behavior is in native Python solver code.
- Original results: staged 4/4 hard calibration and 3/3 independent holdout original-witness verification on 2-core sandbox. Broad release suite 174/174 passes. No claim of solved 480 or improved private score.

## Official compliance and remaining boundary

Official documentation: https://frontieror-challenge.com/docs/main/submission-format and https://frontieror-challenge.com/docs/main/scoring.
Main ZIP <=4 MB, 6 slug folders, Python 3.12 CLI and numeric JSON objective; 60s hard exit, 4GiB memory and no network. This CI mimics the published resource and schema constraints, but does not invoke the organizer's authenticated public instance checker or the private score calculation. Historical reported score 0.7909 belongs to an older official submission; not a new result.

Next action: upload exactly the named inner `FrontierOR-Main-Johnny5-Verified.zip` (not the enclosing Actions artifact ZIP) through the Main-track dashboard; review detected six problem slugs and select Python3.12. Do not confuse the GitHub ZIP artifact outer wrapper with the organizer ZIP. Record official per-problem results before claiming score gain or changing the submission baseline.
