# FrontierOR official-score recovery — controlled source delta

Date: 2026-10-10. Branch: `frontieror-score-recovery-20261010`. Baseline: `frontieror-darp-testing-20261010` at `6d68940e7d5c1c90bd30a8f6f995e1a536d0ee86`.

## Authenticated outcomes versus inference

The user-supplied FrontierOR dashboard shows submission `7d4bed51` completed
with score **0.5390** (2026-10-10, 19:42 UTC). This is an observed aggregate
from the user's screenshot, not a native authenticated API result.
Per-problem and per-instance adjudications remain unknown. No resubmission
has been made by this source change.

## Contract mismatch identified

The published schema in https://frontieror-challenge.com/docs/problems defines
`barnhart2000.objective_value` as the **total cost of rejected commodities**.
At the baseline version, `_route_objective` wrongly added actual real-arc
transport costs for routed commodities. Worse, path ranking and CP-SAT
improvement weights used those costs, so the solver could reject commodities
that should have been accepted according to the published objective.

Previous local flow fixture `frontieror/tests/test_multicommodity.py`
set every network arc `cost=0`. The mistake was therefore systematically
invisible in 28 tests. A zero-cost suite passing is evidence of compatibility
on those fixtures only, not proof of published-objective conformance.

## Atomic correction

* Output objective = sum of `artificial_arc_cost * demand` for exactly the
  commodities flagged as `rejected`.
* CP-SAT maximizes rejection penalty avoided by admitted commodities. Real
  arc costs are excluded from the objective coefficients.
* Greedy uses residual-capacity stress and path length to select admissible
  paths, not real-arc cost.
* Outer path-generation loop observes deadline reserve.
* Independent property tests change real-arc cost by orders of magnitude and
  require the score to remain unchanged for fully routable instances. A
  partially constrained case verifies the accepted-set preference and penalty.

## Method lineage and remaining falsifiers

Source -> literal contract -> objective atom -> search incentives -> output
-> independent property oracle -> CPU/memory validation -> organizer public
checker -> private score. Comparator is the immutable first submission.

Selection uses structure-specific `metamorphic` and `finite_invariant`
methods, plus inverse/counterexample review. Do not treat an activated
classifier as execution or a local test as official adjudication.

Unknowns: individual reasons for 0.5390; further schema mismatches in the
other five solvers; official public instance success; leaderboard improvement.
No source access to private instances is needed or authorized.

## Gate to replacement

The `FrontierOR score recovery validation` workflow tests both published
Python versions and builds a six-entry ZIP artifact from **this branch**.
It also runs a Docker probe with 2 CPUs, 4 GiB RAM, no network and read-only
source on synthetic inputs. It will not submit to FrontierOR.

Following green CI, use this branch's
`frontieror/official_test_onecommand.sh` from an initialized organizer
Codespace. Inspect the organizer's per-instance feedback by clicking
submission `7d4bed51`. Only an explicitly initiated new official
submission can demonstrate a new competition score.
