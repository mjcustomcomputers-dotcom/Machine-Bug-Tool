# FrontierOR no-package objective recovery pass

Date: 2026-10-10  
Branch: `frontieror-consolidated-leader-20261010`  
Parent: `597d84aced45b79f2593d77d56950d4de60af617`

## ACQUIRED

The frozen evidence set was the prior release ZIP with SHA-256
`829a92e31f9a971ecf2acaf9e152c8d132e34cfc655b7161a1a0bf1d966945a0`,
the source at the parent commit above, the user-provided official result
summary (aggregate 0.7909), and the published execution constraint of Python
3.12 with no extra packages. The official result identified Crew as the main
remaining failure/score gap and showed weaker private scores for Facility and
VRP. No private instance or organizer API was accessed.

The deterministic `BL-SOLID-STATE-384` method pack ran against that frozen
object. It accounted for all 32 branches and all 384 child classifiers with
`solid_state_complete=true`. Input fingerprint:
`7f1e63402d0bf52fc51b01cc349232e4444efd0880388b8cea16a1243f5406bd`.
Pack fingerprint:
`7db8a73e32016a8d3df560f649125221615b42a669231ec066ce74fee9d8a58d`.
Classifier activation was used as a test queue, not as proof of a defect.

## ANALYZED

Three objective transitions survived counterexample testing:

1. **Crew first-feasible promotion.** `large_sparse_cover` returned the first
   verified leaf and discarded its remaining node/time budget. A constructed
   large-model case makes the first leaf cost 100 while another leaf costs 2.
2. **Facility no-package recourse.** When SciPy is absent, greedy transport had
   no residual repair. A three-by-three assignment costs 30 greedily and 16
   after two capacity-preserving exchanges.
3. **VRP capacity barrier.** One-request relocation cannot improve two full
   routes when the necessary move is a paired exchange. The deterministic
   seed-11 fixture falls from 224 to 216 after a request swap.

The falsifiers covered stale/first state, omitted improvement feedback,
deadline boundaries, cross-runtime behavior, partial optional-dependency
failure, duplicate/replayed optimization passes, constraint preservation, and
objective recomputation from emitted variables.

## DECIDED

- Crew now retains the cheapest verified large-search leaf across orderings.
  Nonnegative active costs enable sound incumbent pruning; signed costs retain
  exhaustive bounded behavior without that prune.
- Facility now performs direct residual moves and pairwise transport exchanges
  in pure Python. Every move preserves customer totals and capacity, and the
  whole tensor passes the independent checker before promotion.
- VRP now swaps complete delivery/pickup requests between routes, inserts both
  nodes only in their legal phases, and promotes only a strict improvement that
  passes the full route-set verifier.

## Evidence

- 73 unit/property/integration tests passed.
- Python 3.12 no-extra-packages Docker matrix: 12/12 smoke and stress cases
  passed under 2 CPUs, 4 GiB, no network, read-only solver source, and a 22
  second solver limit.
- VRP stress objective improved from 2520 to 2516 in the same synthetic probe.
- Across 40 deterministic VRP fixtures, request swap improved 13 and regressed
  none (aggregate 13060 to 12998).
- Across 60 adversarial transport assignments, pure-Python exchange improved
  47 and regressed none (aggregate 9652 to 7621; LP reference 6972).

These results establish local feasibility, compatibility, and strict objective
improvements on the stated evidence. Only a new organizer submission can
establish a leaderboard score; no score or 1.5 result is guaranteed here.
