# Solid-state optimization micro-router — MPC-SS-OPT-1.0

**Branch:** feature/solid-state-optimization-micro-router-20261010.
**Source release state:** additive GitHub implementation and test suite. The hosted
MPC Sites tool requires a separate supported deploy/reconciliation.

## Purpose
Turn competition benchmarks, finite scientific optimization, scheduling, data
processing, security-safe test fixtures, and production performance regressions
into the same reproducible *method on method* cycle.

    NATIVE SOURCE ID + VERSION
      → exact failure atoms → dimension-triggered classifier/method selection
      → minimal adversarial fixture → forward + inverse comparison
      → exact reduction or bounded search → independent oracle
      → time/memory/output Pareto gate → source-pinned candidate
      → authenticated external result → next versioned micro-pass

Methods are routed according to actual **failure dimensions** and available
proof obligations, with early cheap elimination of dominated alternatives.

## Executable components (source)
- \`lib/optimization-micro-router.mjs\`: strict input schema,
  \`planOptimizationMicroPass\`, and \`exactIdleReduction\`.
- \`lib/tools.mjs\`: additive read-only tool \`plan_optimization_pass\`.
- \`tests/optimization-micro-router.test.mjs\`: official result mapping,
  exact idle reduction, admissibility/falsifiers, version and Pareto gates.
- \`.github/workflows/optimization-micro-router.yml\`: Node 24 test receipt.

## Atomic indices and activated method families
The failure classifier is a **typed result-code router**, not a full-text
classifier. A new failure code must be explicitly mapped and tested.
Classifier IDs are declared *candidates* for analysis; frozen MAXVAR/MBSS
registries and their original meanings remain unchanged.

| Observed issue | Relevant BL candidate IDs | Micro operators | Independent oracle |
|---|---|---|---|
| public output too large | BL24.01 / BL24.05 | sparse witness, omit zeros, serialize/reconstruct | official JSON format and full mathematical witness |
| hard runtime timeout | BL24.07 / BL24.06 | reserve, isolated native process, feasibility first | external wall clock + feasible incumbent |
| phase-order infeasible | BL22.06 / BL24.05 | finite phase automaton, reverse edge, move rejection | no backhaul→linehaul |
| ordinary infeasibility | BL22.05 / BL24.05 | minimal violated constraint, alternative feasible method | independent exact constraint check |
| objective mismatch | BL24.05 / BL22.06 | coefficient perturbation, dual objective oracle | recompute published objective from output |
| feasible but weak | BL22.06 / BL24.05 | Pareto portfolio, invariant reduction, perturb and repair | same-input quality and speed comparison |

These mappings are a candidate cross-domain adaptation grounded in the native
MPC classifier definitions; sharing a parent does not establish semantic
equivalence.

## Exact reusable reduction: idle first-stage decisions
If the declared objective is \`opening costs + shipping cost\`, a facility with
zero shipment in **every scenario** and strictly positive opening cost can be
closed without modifying shipments. Demand and capacity remain unchanged
within that model. Sum of removed opening costs is the exact objective saving.
Retain negative-cost opened facilities. Scan the scenario/facility projection
once; do not copy the 3D shipment tensor per proposed closure.

The output explicitly requires the target's independent full checker before
use. Extra opening constraints can prevent this reduction in other models:
those must be expressed in a separate model and validated before promotion.

## Resource-aware method portfolio
- Public-instance failure: P0, restore the public gate first.
- Private failure or deadline: P1, preserve feasible incumbent and exit reserve.
- Feasible score below reference: P2, constrained quality optimization.
- Reference/above: P3, protect the proven baseline from unnecessary changes.
- Each candidate must have identical input fingerprint, independent feasibility,
  non-regressing objective (or feasible recovery from an invalid baseline),
  measured improvement, bounded deadline, bounded output bytes, and source ID.
- Compare MIN and MAX objectives with correct direction.
- A target's official result is an additional gate; locally passed model tests
  are local measurements.

## Reference case
FrontierOR original \`7d4bed51\`: 0.5390 overall.
Its six results (in problem order) were 0.9862 / 0.7254 / 1.0000 /
0.1325 / 0.0000 / 0.3896. The actual failure categories were public file
too large (facility), private 60-second timeout (crew), and private phase
violation (delivery/pickup). The micro-router fixtures preserve those precise
distinctions, including skipped instances downstream of public failure.

FrontierOR's V5 branch
\`frontieror-atomic-micro-recon-20261010\` contains the exact source-hash-bound
reduction and solver-specific benchmark receipts:
\`frontieror/micro-recon/V5-ATOMIC-CHECKPOINT.md\`.
The standalone router is domain-neutral. No JavaScript tool replaces the
original submitted Python solver or executes the organizer's private checker.

## Update process
1. Append new *source-version-pinned observed* failure records.
2. Minimize one failing fixture, perturb one control at a time, and run its inverse.
3. Promote an invariant-preserving source delta only when the isolated oracle
   and full nonregression matrix both pass.
4. Keep the old version, hashes, benchmark seed, resource limits and competing
   result alongside the new candidate.
5. Update the router's typed failure table/test only when the new failure
   dimension requires a distinct method family.
6. Reconcile to native source before production deployment. Hosted plugin
   behavior stays unchanged until separately deployed.

## Important boundaries
This tool performs deterministic supplied-record planning and tiny in-memory
reductions. It does not initiate network calls, run the competition, write to
production stores, authenticate results, certify private score or submit ZIPs.
The research hooks in the MPC Method Ark remain research hooks until
independently implemented and tested.
