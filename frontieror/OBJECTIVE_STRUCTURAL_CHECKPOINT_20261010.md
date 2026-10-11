# FrontierOR Main — objective-first structural optimization checkpoint

Date: 2026-10-10 CDT / 2026-10-11 UTC
Branch: `frontieror-objective-core-20261010`
Verified run: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38100033768
Source head for published archive: `228c94a47f63e81230c6ddc7c08b7f402999033d`
Artifact: `frontieror/downloads/FrontierOR-Main.zip`
ZIP size 56,636 bytes; ZIP SHA256 `dfa16d4badfbca0eca1143f5c90199a66a16a99786c315bfb1ce484a5bfdc3b5`
Status: `HOSTED_OBJECTIVE_AND_RESOURCE_PASS / OFFICIAL_SCORE_UNKNOWN`

## Controlling official results
Dignity Testing best 0.7909; Game Changer submission 0.7691; known leader 1.0218 at the time of research. Crew private 1 fell 0.4925 -> 0.2650 in Game Changer; Crew private 5 still zero from 60-s overrun. Previous full six-problem score and native records outrank synthetic improvements.

## Verified source delta and reason
1. **Crew weighted matching reclassification**: if every rotation covers <=2 rows and there are no base side constraints, exact cover is a max-weight savings matching with virtual penalties for missing singletons. Decompose the graph into connected components and reconstruct *original* rotation IDs; an original verifier must pass. Any non-applicable/too-large graph returns unknown and the original MILP remains active.
2. **Crew dual-priced temporary integer core**: price already enumerated columns using LP marginals, retain incumbent and multiple alternatives per row. Temporary search reduction is not a certificate of original infeasibility; all improvements are verified on the unmodified complete problem.
3. **Crew streaming HiGHS and warm start**: native callback emits improvements before termination; checked integer incumbent is supplied through HiGHS setSolution when applicable, while SciPy/CP-SAT alternatives survive. A native-library import collision was found in the shared test runner (undefined `Highs::releaseMemory`); verified objective test now uses a fresh sterile Python interpreter matching organizer per-solver process isolation. The previous in-process load failure is not silently treated as an algorithm pass.
4. **Orienteering**: constant-time remove/reinsert route deltas, prize exchanges over all outsider cities, short-block Or-opt that preserves collected prize and reduces route travel, retains original portfolio if no strict gain.
5. **Facility, Flow, DARP, VRP** retain their previously reviewed score-first/feasibility-verified implementations. Runtime helpers remain byte-identical within all six problem folders.

## Actual measured controlled results
- Pair-only Crew 60 small randomized cases with missing singletons and signed costs: independently brute-forced optimum equals graph reduction cost.
- Crew 280-row, pair-only with missing singletons: 2.047s -> 0.181s for same independent optimal cost 840 (11.3x).
- Crew 480-row pair construction: 1.797s -> 0.142s for same optimal cost 1200 (12.7x).
- Crew 3000-row decomposable construction: verified optimal-cost cover 6000 in 0.206s with local NetworkX.
- Orienteering 95-city seed 521: collected prize 1290 -> 1300 with same travel budget.
- LP-priced core tested against full MILP on a 180-row case; did not accelerate the easy instance, so dispatched only for n>=6000.
- Final GitHub Python3.12 run `38100033768`: **78/78 tests passed**, six-problem synthetic objective benchmark passed, 12/12 offline 2-CPU 4-GiB Docker cases passed, standard 12-entry ZIP passed byte/hashes/size checks, and direct ZIP published.
- Matching verified on covered graph subclass only, not private challenge distributions. No official submission was sent, no private score claimed.

## MPC method provenance
- 239 unique Method Atlas research candidates and 212 declared method relationships examined earlier. Invoked hosted atomic 31/32 controlled `SUBSTITUTE` variants for SPP -> graph matching, full MILP -> dual-priced reversible core, and no warm start -> checked native MIP start. MPC record fingerprint `893e47586095ebfcdaf39ccf6e1e47982b17b971c043d6accbd250ccbdb05e3b`. MBSS B41 and B43 branch definitions informed falsifiers; registry itself unchanged and declared methods are not runnable solvers.
- Primary references: https://frontieror-challenge.com/docs/main/submission-format ; https://frontieror-challenge.com/docs/main/scoring ; https://pubsonline.informs.org/doi/10.1287/mnsc.39.6.657 ; https://ergo-code.github.io/HiGHS/stable/interfaces/python/ .
- Important ABI source: https://github.com/scipy/scipy/issues/22257 and https://github.com/google/or-tools/issues/5246. Avoid combined in-process loading of conflicting native C++ HiGHS binaries.

## Next scored optimization frontier
Acquire next authorized official organizer result for the exact `dfa16d...` archive, and compare per-private-instance actual objectives. Strongest next mathematical avenue: **side-constrained pair matching via Lagrangian multipliers and component-level Pareto frontiers** when the hidden Crew structure has coupled global base bounds; else dual-guided neighborhood/rate allocation. Stop escalating unproven caches and general-purpose reliability tests. Only organizer evaluation establishes leaderboard gains.

DO NOT rename archive with research labels. Official submission ZIP remains `FrontierOR-Main.zip` with exactly 12 code/helper files. Preserve previous Game-Changer source, best submitted score and MPC underlying architecture unchanged.
