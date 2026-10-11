# Crew Scheduling — residual reclassification and reverse-bound stress

Date: October 10, 2026 CDT (October 11 UTC). Branch: `frontieror-crew-reverse-window-20261010`.

## Source identity and official baseline

- Prior checked Crew source SHA256: `0cc8e9e3c94e19f5f6801380eebaf24b5a450adccb017aa44a86cf3a2b56a467`.
- Revised Crew source SHA256: `cc4a4b70b8f7bb5e5990c2cf3b084af167e1cb0484fbc4b3520fa9d523966d6b`.
- Best organizer-confirmed overall submission: **0.7909**; later Game-Changer result: **0.7691**. Neither is the score of this unsubmitted revision.
- Python 3.12 full-gate CI: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38101345768 .
- Source-pinned organizer-format ZIP on this branch: `frontieror/downloads/FrontierOR-Main.zip`, CI SHA256 `02338ed9d995b039caab508c20bd3a09a9a771d53736522a7dda8021e1bb888d`, 58,400 bytes, six isolated problem folders, 12 files, no research labels within the archive.
- Locally reconstructed archive contains all the same original source bytes and local helpers; its compressed ZIP-byte SHA differs because compression metadata/runtime differs. Source hashes are the authority for code equivalence.

## Changed mathematical/computational architecture

1. Exact deduplication and singleton propagation calculate the physically *remaining* Crew model. The method controller routes on residual row count, surviving rotation count, active incidence nonzeros, and side-matrix size, not the original pre-reduction 15k-row dimension.
2. Reverse side-window intervals: for each uncovered flight, take the min/max of every compatible rotation's side coefficient divided by that rotation's covered flight count. Summing over uncovered rows bounds the achievable future side effect. Include optional empty-coverage rotations as independent signed contributions. Forward partial-base totals plus this reverse interval allow mathematically safe infeasible-branch rejection. Use only when q <= 8 and finite memory caps pass.
3. SciPy/HiGHS exact reduced MILP can return a **zero-gap objective certificate** to the parent as a source-checked status. Only proven-optimal feasible incumbents terminate the method portfolio early; an ordinary feasible incumbent does not claim optimum. Original sparse MILP and native HiGHS stream remain fallbacks.
4. Exact cover invalidation: a rotation with repeated flight IDs cannot dominate a legitimate rotation that covers those flights only once.
5. The reverse-envelope mechanism accepts an explicit on/off toggle for positive one-variable MPC 31/32 comparison. The original full-model checker remains final authority.

## Matched controls, not leaderboard predictions

| Identical constructed workload | Earlier solver | Revised solver | Original-model objective |
| --- | ---: | ---: | ---: |
| Tight base quota, 300 flight rows | 2.840 s / 6 native method calls | 0.233 s / 1 native call | 600 both |
| 15,000 rows / 15,000 columns / 100 base constraints, 2 CPUs, 4 GiB address cap | 1.863 s | 1.397 s | 119318 both |
| Harder 3,000 rows / 10,000 columns / 8 base constraints, 2 CPUs, 4 GiB address cap | 15.323 s | 15.421 s | 16717 both |

- Tight one-sided quota: previous forward-only sparse heuristic found no feasible cover within 0.75 s; reverse-envelope found verified cost 600 in roughly 0.014 s. A separate target with quota 75 yielded cost 450.
- CI Python 3.12: **84/84** tests passed, the six-problem objective benchmark passed, **12/12** standard constrained Docker smoke/stress cases passed, and an additional 15,000-row / 100-base Crew Docker test passed in **1.253 s** (different constructed fixture; objective 119876).
- These cases demonstrate real structural and time improvements where applicable, plus an explicit *non-improvement* on a harder coupled model. The contest private score remains unknown.

## MPC method coordinates

- MBSS-B41 (31/32 controlled substitution); MBSS-B43 (graph bottleneck and bypass).
- REDUCTION_METHODS:8 (graph/network); TRANSFORMATIONS:9 (project/reduce); CEGAR candidate hook.
- MPC atomic comparison fingerprint: `c1ab501d14a9b0059afc296b6d48a8dc78665a5ab4787233ba944eb70567f588`.
- No canonical MPC registries, earlier versions, submissions or framework were removed or replaced.

## Next high-value frontier

The **hard, weakly reducible 3k×10k×8 model** did not improve. Target a component-aware base-constrained integer core or Lagrangian primal repair there, with full original-model verification and bounded deadlines. Do not spend the next pass repeating easy forced-row tests.

**Known public-test bridge mismatch:** The existing `frontieror/official_test_onecommand.sh` still targets older source and omits the six local helper files. The attempted GitHub update did not complete, so do not use that bridge as evidence that this candidate passed the organizer's public API. Use the standard, complete ZIP and authenticate organizer results separately.
