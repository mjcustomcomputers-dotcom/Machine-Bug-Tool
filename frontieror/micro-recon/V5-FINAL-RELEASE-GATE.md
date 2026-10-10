# FrontierOR Main — V5 release gate receipt — 2026-10-10

## Immutable competition baseline
First official submission `7d4bed51`, scored `0.5390`. Exact original ZIP SHA-256 `f8c93753298cd9c572ba50283139bb0c4d1d2d88b0ebf655cd422c10510ab6a9`.

Per-problem official: cordeau2006 0.9862; fischetti1998 0.7254; barnhart2000 1.0000; hoffman1993 0.1325 (private large_instance_5 timeout); bodur2017 0.0000 (public large_instance_1 oversized output); nagy2015 0.3896 (private Constraint 15 violations).

## Final candidate identity
`FrontierOR-Main-Solid-State-V5-Upload-This.zip`
- Size: 33,026 bytes
- SHA-256: `98ee81b8193c304e5dde236b105f802e17f3b7e41b9dad042fcdb902c28b462c`
- Archive: six `<slug>/solve.py` paths only.
- Exact official-original solver bytes carried forward: `barnhart2000`, `cordeau2006`, `fischetti1998`.
- Patched `bodur2017`: source SHA-256 `2c74452c63a5acba874d9a38cb0b517ef543a63b2e610a09c1ff0798663b1f14`.
- Patched `hoffman1993`: source SHA-256 `e2acaaf29c52514f86ce19d26906ddaeb2076d7c73a1f046a5aec7e50f7f2fc7`.
- Patched `nagy2015`: source SHA-256 `c505d99b46f6c4079a0da4ec4fcb114eb3fcb2d5cb53c708351e2bd8b132f387`.

## Methods persisted
V5 zero-flow contraction: scan every scenario; mark used facilities; close positive-opening-cost facilities whose shipments are all zero; preserve shipment tensor and demand/capacity; recompute objective. This was tested across 180 atomic fixtures with 180 passes.

MILP order variation: isolated MILP first, then LP recourse. Hard timeout enforced by parent process. For crew no-incumbent case, extend isolated MILP search cap from 26 to 42 seconds inside the 51-second large-instance budget; reserve remaining time for response serialization and clean exit.

VRP phase invariant: all deliveries must precede any pickups within each route; reject backhaul→linehaul transitions, even when vehicle load stays feasible.

## V5 independent release evidence
Verified rebuilt ZIP after extraction by running all six entrypoints with `--problem --instance --output --time-limit`; six valid outputs.

Extra local adversarial checks: 21 phase/permutation cases, 15 more up-to-240-customer cases, 3 facility cost perturbations, sparse zero-demand, conflict-heavy crew exact cover up to 900 rows, no-singleton crew, and a blocked native child terminated in 0.759 s.

2-CPU affinity + 4-GiB address-space cap + 60-s timeout, synthetic stress:
| Case | Wall (seconds) | Output (bytes) | Result |
|---|---:|---:|---|
| Facility 80x160x250 | 2.045 | 1,226,028 | independently verified |
| Facility 120x300x1200 | 17.092 | 10,779,911 | independently verified |
| VRP 500 customers | 14.467 | 112,731 | independently verified |
| Crew 2,000 rows planted | 3.787 | 30,646 | independently verified |
| Crew 3,000 rows pairs | 1.012 | 55,960 | independently verified |

The final six files parse under Python 3.12 grammar and run with local Python 3.13.5. The organizer selected environment is default Python 3.12, with its preinstalled SciPy and OR-Tools packages. The source must still pass the organizer's actual public-instance checker before official confidence is established.

The website's rule: one ZIP <=4 MB; all six problem-named folders; Python 3.12 default; no additional packages required; hard 60 seconds, 2 vCPU, 4 GB RAM, 16 MB JSON output. Network is absent in sandbox.

## State
`LOCAL_CANDIDATE_VERIFIED`.
Official V5 score `UNKNOWN`.
Submission credit used by this development operation `0`.
Canonical MPC main and original FrontierOR submission preserved.
