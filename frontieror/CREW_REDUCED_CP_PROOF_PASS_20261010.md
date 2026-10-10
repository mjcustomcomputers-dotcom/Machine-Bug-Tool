# FrontierOR Crew reduced CP-SAT -- structural hook (2026-10-10)

Parent verified runtime commit: `4aa59075681364c270a06a37de24962827808f43`. Isolated development branch: `frontieror-crew-reduced-cp-20261010`.

## New proof-preserving computational route
- Existing V6 exact duplicate elimination and singleton propagation feed a new **physically compacted side-constrained CP-SAT model**.
- Unlike the pre-existing side CP-SAT, variables and exact-cover constraints for permanently eliminated rotations/rows are **not created**.
- Original rotation IDs survive reconstruction; all forced cost and real-valued base contributions are restored to the final solution.
- Fractional base coefficients are converted to outward-rounded integer inequality relaxations (ceil coefficients for lower bounds, floor for upper bounds). Quantization cannot falsely exclude a mathematically feasible assignment. Any relaxed false positive is rejected by the unchanged original-model independent verifier.
- Reductions are **shared** between compact CP and HiGHS MILP inside one solve invocation, avoiding repeated duplicate/singleton preprocessing.
- A size/benefit gate skips compaction if it does not shrink by at least 8% on variables or rows. Original side CP rescue and floating HiGHS MILP are unchanged and remain as fallbacks.
- Extra method overhead is explicitly bounded inside the 60-second timing budget.

## Adversarial falsifiers added
- Dominated duplicate with lower-cost surviving **original** column ID.
- Forced coverage plus nonzero crew-base side constraint offset.
- Empty-cover rotation required for a base lower bound.
- Negative coefficients with more than eight fractional decimal places.
- Existing Crew regression tests and independently calculated objective remain the reference oracle.

## Verification state
PROPOSED IMPLEMENTATION / NOT YET CI-VERIFIED / NOT OFFICIAL SCORING.
This branch is isolated from the preceding passing ZIP. Do not publish as an organizer-ready candidate until the consolidated six-solver gates and authenticated official public-instance check have been completed.

## Exact next pass
Run the single bounded Crew proof gate, inspect counterexample failures, then fold other verified objective deltas before ONE consolidated 51+ test suite and resource/ZIP gate. Hidden private Crew instance size and results remain unavailable.
