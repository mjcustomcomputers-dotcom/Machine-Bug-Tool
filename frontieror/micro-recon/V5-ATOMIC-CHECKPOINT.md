# FrontierOR — atomic transport micro-recon checkpoint (2026-10-10)

## Scope and identity
Official original Main Testing submission \`7d4bed51\` achieved \`0.5390\`.
Per-problem actual: cordeau2006 0.9862, fischetti1998 0.7254,
barnhart2000 1.0000, hoffman1993 0.1325 (one 60s timeout),
bodur2017 0.0000 (public output too large), nagy2015 0.3896
(one private Constraint 15 phase violation).
The three original feasible source copies remain the protected comparison.

V4 user-generated six-solver ZIP SHA256:
\`84ed3aa4179de2a6211b9d0721f9afd0f70c73df402579d6c40f5bc19f9513c6\`.
V4 \`bodur2017/solve.py\` SHA256:
\`3fe9be8bfbe60404c5eec905faaf15b0ae653a0d9379bd366ed0248506267898\`.

V5 micro candidate \`bodur2017/solve.py\` SHA256:
\`2c74452c63a5acba874d9a38cb0b517ef543a63b2e610a09c1ff0798663b1f14\`.
Hash-gated deterministic transformation:
\`frontieror/micro-recon/apply_v5_delta.py\`.
Applying it to the exact V4 source produced the exact V5 bytes and passed a byte comparison.

## Two atomic defects and source-bound repairs

1. **Unused first-stage decisions**: V4 left positive-cost facilities open even
   when their shipment was exactly zero in every scenario, and rebuilt the
   entire dense 3D tensor repeatedly to attempt four closures.
   V5 scans the existing tensor for actually used facilities and sets each
   zero-used, positive-fixed-cost facility to closed. The entire witness is
   preserved. Recomputed objective savings equal the sum of removed fixed
   costs. Independent checker covers capacities and scenario demands.
   V5 only performs expensive large-neighborhood recomputation where the
   exact contraction has already eliminated fewer than 10 facilities.

2. **Process-order dependency**: in medium cases V4 invoked SciPy HiGHS LP
   before forking a child MILP optimizer. On 12×20×20 seed22 the MILP-first
   independent run completed in 0.912s with objective 41.552545; after LP,
   the same isolated MILP ran for 2.759s and returned no candidate.
   Reordering MILP before LP restored the candidate. Native solver time-box
   reduced from 17s to 5s; an independently feasible incumbent is retained.

## Executed V4 / V5 comparisons (identical synthetic input)

| Shape (f,c,s), seed | V4 wall (s) | V5 wall (s) | V4 objective | V5 objective | Speedup | Objective improvement |
|---|---:|---:|---:|---:|---:|---:|
| 12×20×20, 22 | 17.974 | 1.969 | 50.842150 | 41.552545 | 9.13× | 18.27% |
| 12×20×20, 42 | 13.495 | 1.925 | 50.927817 | 42.146899 | 7.01× | 17.24% |
| 18×35×30, 105 | 13.469 | 3.053 | 85.682493 | 61.774731 | 4.41× | 27.90% |
| 50×100×700, 105 | 6.639 | 2.264 | 253.510063 | 197.510063 | 2.93× | 22.09% |
| 80×160×250, 106 | 5.829 | 1.933 | 419.970847 | 292.970847 | 3.02× | 30.24% |

The independent checker reconstructed objective from output shipments plus
opening costs, and verified demand/capacity per scenario.

Additional executed falsifiers:
* 180 seeded atomic variants; 180/180 invariants passed in 0.092s;
  including 14 zero-demand and 26 negative fixed-cost cases.
* 43,200,000 potential shipment variables, 120 facilities, 300 customers,
  1200 scenarios; two-core CPU affinity; 4GiB address-space cap; 55s
  solver budget; 17.22s wall; 10,779,084-byte JSON; 417,701 nonzero
  shipment entries; independent witness verified.
* Portable transformation verified by SHA256 and exact byte readback.

## Actual MPC method mapping

Trigger 1: idle-decision reduction (exact invariant, NULL/NO-EDGE, finite
sensitivity). Trigger 2: LP/MILP execution-order swap and time bound
(BL22.06, BL24.06, BL24.05). Method DNA cross-ref reports canonical
MAXVAR parent IDs 4,63,102,179,180,189,190,192,197,198,199,204,207,208
as structural review relatives. Common parents are indexing connections.
MPC \`metamorphic\` execution over actual supplied pair of run receipts:
model fingerprint \`e14e6b2d52918944cd4a3604b5673a91073f4017dc925df3342c2aa27d31be2a\`.
Execution used one declared changed control; actual performance and
feasibility came from independent Python tests, not the router itself.

## Next checkpoints

A. Integrate exact V5 source into the isolated competition branch after
   Python 3.12 test of the hash-bound source and original six-way oracle.
B. Challenge more shapes near the 16 MiB output boundary and 60s cutoff.
C. Recheck all original successful problem source digests before the release.
D. Run official public instances through the organizer's authenticated CLI.
E. Release one six-folder ZIP only after passing gates and human review.

State: \`ATOMIC_LOCAL_TESTS_PASS\`, \`OFFICIAL_V5_SCORE_PENDING\`.
No official submission credit consumed; no final ZIP released.


## Cross-problem crew feasibility regression (V4 retained)

The independent set-partitioning verifier checked nine planted, conflict-heavy
exact-cover instances with 300, 600, and 1000 rows; distractor counts were
500, 900, and 1300, respectively, across seeds 11,29,43. Fast one-step
greedy missed each feasible cover, while the bounded MRV exact-cover fallback
found and verified all nine within 0.898s maximum for that fallback.

Two separate base-bound constraint adversaries forced the planted pair cover:
200 rows/400 distractors completed in 1.48s and 500 rows/600 distractors
completed in 1.73s under an 18-second CLI budget. Both passed independent
exact-cover and real-valued base-bound verification. The V4 crew source is
retained pending organizer public-instance tests.

These measurements improve local failure-mode coverage for the original
private 60-second timeout. The unknown organizer large_instance_5 structure
is a distinct remaining test target.
