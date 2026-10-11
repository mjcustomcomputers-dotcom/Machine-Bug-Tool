# Frozen solver source snapshot — cycle-inversion breakthrough

**Snapshot source commit (immutable identifier):** `05df8ff9c10b898d7c1832217f504e9c53c91089`
**Source:** `frontieror/solvers/hoffman1993/solve.py`
**Source Git blob:** `9b1f5d887913790903eba8a10dd12ebd348af383`
**Focused original-instance tests:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38105262275 — SUCCESS at exact source commit, 12 focused test methods.
**Full analysis:** `frontieror/CREW_INVERSE_CYCLE_ATLAS_FAULT_AND_GAIN_20261010.md` on parent research branch.
**Scope:** frozen reproduction pointer, no new solver ZIP, no organizer submission, no official hidden-instance score.

## Algorithmic method DNA: CHANGE THE PROBLEM ITSELF

When a residual exact-cover instance has exactly two distinct pair rotations incident to every uncovered row, its incidence multigraph decomposes into disjoint cycles. Each even cycle has exactly two alternating exact-cover choices. If every global side-constraint activity is identical under those two choices for each cycle and optional empty columns have zero side effects, choose the cheaper local alternative for each component and combine with all forced rotations and negative-cost optional zero-cover rotations. The union is a globally optimal exact cover for this subclass, verified independently on the original unmodified model.

**Transformation:** `SET_PARTITIONING_MILP -> INDEPENDENT_TWO_CHOICE_CYCLE_FACTORS`. Use a structure certificate, exact integer side-vector invariance, original-ID reconstruction, objective certificate and a fail-closed fallback. Refuse cycle transformation on odd/irregular degree, unequal side effects, unsafe numeric magnitude, violations of original side bounds, or deadline exhaustion. This is a **generalizable method proposal**, not a reclassification of all Crew instances, and the MPC hosted Method Ark registry has not been mutated.

## Reproducible result and limits

Final source-matched micro ABBA on constructed 2,000-row/120-side-row example:
- literal reduced SciPy MILP median 0.2812595 s;
- cycle inversion median 0.0159065 s;
- **17.682x**, both exact objective 1,539, full original feasibility checked.
- prior source-matched scale run 38105234909 0.337414 vs 0.0181885 (18.551x). Report both; differing CI runner variance.
- corrupted control 0.2758645 s vs 0.2773885 s (0.995x), objective identical.
- all 12 focused test methods passed, 320 randomized/permutation test cases with exhaustive objective checks plus directed odd-cycle, parallel-choice, side mismatch/cancellation, near-integer, extra-edge and signed-empty-column cases.
- synthetic micro time is **not** a claim about hidden contest objectives or 60s execution. Other five problem solvers remain as in the prior parent.

Snapshot persistence: branch `frontieror-snapshot-inverse-cycle-20261010` is meant as a frozen evidence anchor; use the exact **source commit SHA**, not an eventually moving branch HEAD, as the authority. Do not delete/overwrite prior branches, verified ZIPs, checkpoints or MPC framework.
