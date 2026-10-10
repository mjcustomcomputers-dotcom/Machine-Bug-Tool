# FrontierOR Crew PASS: sparse MRV source repair with MPC CEGAR

**Control:** `frontieror-crew-reduced-cp-20261010` source parent `1cb47c4761906fe2a1ee48215ae62868a8bf2a77`.
**Known source defect:** `forced_greedy` returns immediately for coverage rows >180 or columns >6500. Large private Crew V5 exited unsuccessfully and the best current successor still has no official result.

**New delta:** `large_sparse_cover` attempts a bounded sparse exact-cover search on the pre-reduced row/column representation (up to 12,000 coverage rows, 50,000 rotations, 400,000 nonzeros). It selects a rare uncovered row, tests dynamically eligible rotations using integer masks, and uses a parent-pointer chain to avoid repeated full schedule copies. Three deterministic candidate orderings, an 8,000-node/mode cap and a 1.5-second external time slice protect the native solver budget. Supports signed crew base contributions without unsound sign-based pruning. It promotes a completed answer only after original-ID reconstruction and `verify(p,selected)` passes literal floating base bounds.

**Reuse:** One optional reduction result is shared with compact side-constraint CP-SAT and HiGHS MILP rather than repeatedly rebuilding it. Cheap large-instance incumbent can seed CP-SAT optimization; otherwise existing solvers remain unchanged.

**Known limits / falsifiers:** A heuristic branching cap is incomplete. Empty-cover columns required to satisfy base lower bounds and difficult coupled cases can still need CP-SAT/MILP. No synthetic instance proves hidden Crew feasibility or a score increase. The source change is separately test-gated; it does not replace the previously verified six-solver ZIP.

**MPC:** `refine_counterexample` scoped a supported large-greedy-disable guard, two unresolved proof targets and an exact source fingerprint `66804902a9b740b2dc563820737fd65ffe9425499958a875e43efc17e81411be`. No canonical classifier registry mutation.

**Next action:** One consolidated source-hash-bound Crew regression (existing tests plus three large sparse cases and four compact CP cases), followed by an all-six CLI + Docker gate only when the branch is a genuine replacement candidate. Check actual objective/cost and memory; hidden official score remains unknown.

## Queue-driven forced-rotation propagation: major complexity correction

The legacy `reduce_forced_rotations` sorted and rescanned *every uncovered coverage row* each time a singleton rotation was selected. In the worst case of many forced columns it repeated scans O(m²) before the native solver. This pass replaces that with a deque of newly singleton rows, bytearray activity flags and incrementally maintained coverage counts. Every removed column visits only its incident rows; expected preprocessing work is O(m+n+nnz) in the parsed sparse representation (plus finite set construction for each removed column). All reductions retain literal original-column IDs, optional empty base-effect columns, and all original floating side constraints. Any unavailable row terminates reduction without a false feasibility claim. Three new regression cases cover 1600 forced singleton rows, conflicting forced choices and empty base-effect columns.

**Verification remains pending.** No new official private score, benchmark percentage or ZIP is claimed. Publish only after the queued large-search repair and the reduction rewrite pass one consolidated independent regression/resource gate.

## HOSTED ACCEPTANCE READBACK — 2026-10-10

- Source-pinned GitHub Actions run: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38094456493
- Execution: Python 3.12, SciPy 1.18.1, OR-Tools 9.15.6755; **26/26 Crew regression tests PASSED** in 0.930 seconds, including 1600-row forced-queue propagation, 240-row sparse feasible cover, 210-row signed-base and CP/MILP-disabled recovery, and prior compact CP base-offset/precision tests.
- Exact checked solver SHA-256: `1035da2f8045c333697459759ea2fa6a3ba7368f666528333fc7407438e1cc5a`.
- Exact checked test SHA-256: `c5512b10c3cf79f4fe67e633133329eb309b09732b2163f8c53c74d71ae015fa`.
- MPC delta_plan marks Crew source/proof completed and identifies six-solver CLI, 2-CPU/4-GB sandbox, ZIP readback and organizer public/private grading as further dependent gates. No official score inferred.

### Next bounded hook

Benchmark the queue-only preprocessing against the older repeated-row-scan version at representative sparse sizes, then consolidate source-pinned Crew changes with the other five verified solver files for one final six-solver Docker/CLI/ZIP gate. **Do not submit** without the owner's explicit instruction. The last verified ZIP on `frontieror-mpc-virtual-cache-integration-20261010` stays unchanged until all successor gates pass.
