# Crew side-activity proof reduction — verified pass

**2026-10-10 CDT / 2026-10-11 UTC.**
**Branch:** `frontieror-crew-side-activity-20261010`.
**Input source:** exact native GitHub parent `2dd26a3ca90a69f015b4078859b70b63d862b5ce` (reverse-window pass), including original-to-residual dispatch and reduced MILP objective certificate.
**Final complete GitHub Actions run:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38101524552 — SUCCESS.
**Source of run artifact:** https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38101524552/artifacts/11688425914

## Native delta

1. `redundant_side_rows`: proof-based envelope for all active rotations and optional empty columns. For any exact cover, a nonempty column's side effect is shared across its covered rows, and row-wise minima/maxima bound all feasible total side activity. Forced-column offsets and optional empty-column min/max are included. Drop a side row only if the entire resulting activity interval lies conservatively within literal lower/upper bounds.
2. Both `sparse_milp` and `_highs_stream_incumbents` project proved-redundant side rows. Uncertain and tight rows remain. Original complete-model `verify` is unchanged. Exact proofs and original column IDs remain intact.
3. Merge forward previous Johnny 5 improvements: outward CP-SAT fractional side scaling; objective-ranked dense neighborhoods preserving existing incumbent; time-throttled witness streaming beyond the 12th improvement. No changes to the other five solver sources or shared runtime.

## Verification receipts

- Python 3.12, organizer-matched packages, **88 unit tests passed**.
- Synthetic six-problem objective benchmark passed.
- Side-row tests proved removal of **100/100 deliberately loose inequalities**; separately retained a deliberately tight side constraint and checked signed/negative-cost empty-rotation cases by the original verifier.
- Same synthetic instance ABBA measured four warmed runs (1200 original rows, 1800 columns, 100 original side rows): literal median **0.05680 s**, projected median **0.03825 s**, speed ratio **1.485×**, unchanged objective **1800.0**. This is a controlled solve-phase computation, NOT a full organizer-runtime measurement, confidence interval or private-score prediction.
- 2 vCPU, 4 GiB, offline, read-only Docker: **12/12 synthetic smoke/stress cases passed**. Crew smoke 0.131 s; Crew stress 0.217 s. Docker tests do not substitute for organizer instances.
- Six official-formatted solution folders, each `solve.py` plus identical runtime helper; ZIP source/hashes readback passed.

**Candidate ZIP:** `frontieror/downloads/FrontierOR-Main.zip` (59,631 bytes); exact ZIP SHA-256:
`cf14be557c84c40bb5e633deb25afe218bded31d2bef2aa89ff3145d5f033daa`.

**Crew solve.py SHA-256:** `b56743376c6a2cf83d52833fb579834c4d36878bd6e4acd310a108e1b5b492fb`.

**Official status:** NOT SUBMITTED / NO NEW ORGANIZER SCORE. Last owner-supplied completed official best remains 0.7909, not exceeded by a verified scored submission in this pass. Best observed leader in user-provided record: 1.0218 (stale if leaderboard has changed).

## Next high-value method pass

Apply an exact reduced component graph for active incidence and nonredundant side rows, solving separate components only if every side inequality's nonzero active support lies entirely within one component. Alternatively use dual-guided temporary cores in the coupled remainder. Benchmark objective per unit of wall time and source-identical A/B, not generic green tests. No promotion over the last official scoring baseline without organizer result. Preserve separate Johnny5, objective-core, and reverse-window branches.
