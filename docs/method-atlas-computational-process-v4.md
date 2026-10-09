# Method Atlas V4: MIT, Harvard and specialist computational/process methods

This file is **a continuation overlay** on the Method Atlas V1 and Evidence/Intent V3 branch. Do not overwrite, renumber, or change the existing MPC 24 implemented bounded evaluators, 10 method hooks, 17 transforms, MAXVAR/NESTMAX/BL/MBSS/EXT semantics, canonical Drive/Dash controllers, original PASS checkpoints, or private Sites production binding.

## V4 delta: 25 research methods, 25 candidate classifier questions, 14 sourced institutional references

V4 `method-atlas/expansion-computation-schools-v4.json` assigns stable `MHA-0119` through `MHA-0143` and matching `MHC-0119` through `MHC-0143`. Each candidate stores a source locator, applicable typed dimensions, required model input, material mechanism, adverse falsifier and research-only implementation state.

The expanded **stacked branch** totals 143 Method Atlas candidate methods, 143 candidate classifier questions, 44 source records and 104 proposed method-to-method comparison edges. These do not count native MPC's existing implemented evaluators and do not imply institution endorsement. `DIRECTLY_RETRIEVED` means the source's official publication/catalog description was retrieved, not that the corresponding computational algorithm or inferred transfer was fully peer-reviewed or implemented.

### Distinct groups (no blind method fan-out)

| Source lineage | Distinguishing methods | Typed dimensions |
|---|---|---|
| MIT CSAIL / program sketching / Alloy | Partial program hole constraints, small-scope relational countermodels, synthesis grammar pruning, symmetry guard, generator-versus-validator separation | SYNTHESIS, RELATION, CONSISTENCY, VERIFICATION |
| Harvard SEAS / computational economics | Dynamic best-response incentive checks, time-report manipulation alternatives, money-balanced allocation | INCENTIVE, GOAL, TIME, MONEY |
| Harvard Privacy Tools / computer systems | Sequential privacy composition budgets, privacy odometer versus enforcement filter, proof artifact to deployed-build binding, feasible symbolic execution coverage | PRIVACY, RESOURCE, VERIFICATION |
| RWTH Aachen process mining | Event-to-model alignment, Petri token replay, alignment cost sensitivity, case-ID drift | PROCESS, STATE, IDENTITY |
| CMU SEI threat modeling | Choose modeling lens from asset boundary, risk-stage evidence map, actor/asset/action rule matrix | PROCESS, AUTHORITY, VERIFICATION |
| Berkeley EECS formal synthesis | Syntax-guided guard synthesis; counterexample selection as information gain | SYNTHESIS, INVARIANT, UNCERTAINTY |
| Caltech control/optimization | Receding-horizon policy challenge, observer-versus-state comparison, asynchronous convergence | CONTROL, GOAL, STATE, TIME |
| Stanford causal-inference training | Graphical d-separation confounder/falsifier review | CAUSAL, GRAPH |

Some underlying scientific concepts overlap previously recovered MPC families. V4 adds **task-specific checking hypotheses and metadata**, not claimed independently invented theories, direct solver implementations or canonical replacements. Avoid double counting near-duplicates: use exact mechanism, input and falsifier before adding future row.

### Technical progress and limits

- The Method Atlas loader composes separate source files, commits no atlas rows to native Site or Drive, and pins the aggregate derived database seed hash.
- The atomic detector maps the exact existing MPC `PROCESS` coordinate to the typed `PROCESS` dimension, instead of swallowing process methods under `STATE`.
- `method-atlas/method-relations.json` contains 25 additional V4 adversarial/complement/cross-check proposals. **They are not independent empirical evidence.**
- `tests/method-atlas.test.mjs` now covers typed PROCESS/SYNTHESIS/PRIVACY routing; `tests/atomic-method-detector.test.mjs` checks canonical coordinate trigger. Full integrated real SQLite/Node test execution is pending Codex.
- The separate evidence/intent review still must never label a human liar, assert crime, or infer legal intent from demeanor or unverified logs.
- All target interactions, if any, require the individual bounty program's explicit scope and rate/automation permissions. Repository method inventory does not grant authority.

### Codex execution

Select Daybreak Blue if available on the actual Codex product surface. Use the **stacked V3/V4 feature branch**, not main or the earlier Cloud restoration checkout. Read `docs/method-atlas-detector.md`, `docs/method-atlas-evidence-intent-v3.md`, this file, and `AGENTS.md`; then:

```sh
git fetch origin feature/method-atlas-evidence-intent-reverse-v3
git switch feature/method-atlas-evidence-intent-reverse-v3
# Create a new ignored local derived-cache path rather than touching the older seed.
MPC_METHOD_ATLAS_DB=.sites-runtime/atlas-v4.sqlite node scripts/method-atlas-cli.mjs init
MPC_METHOD_ATLAS_DB=.sites-runtime/atlas-v4.sqlite node scripts/method-atlas-cli.mjs detect '{"atoms":[{"id":"step","subject_id":"fixture:process-1","coordinate":"PROCESS","source_refs":["fixture:event-log"],"epistemic_state":"SYNTHETIC","depends_on":[]}],"domain_profile":"BUSINESS","max_candidates":12}'
node --test tests/method-atlas.test.mjs tests/atomic-method-detector.test.mjs tests/evidence-intent-review.test.mjs
node --test
npm run build
MPC_METHOD_ATLAS_DB=.sites-runtime/atlas-v4-benchmark.sqlite node scripts/benchmark-atomic-method-detector.mjs
```

Record exact tested source commit, Node/pnpm versions, command exit codes, tests passed/failed, benchmark p50/p95, any dependency or source gaps, and the smallest next repair. Do not silently expand the installed MCP plugin scope, merge competing branches, or deploy the private Site. Review PR #3 as the underlying V1 parent, PR #1's selection changes and PR #2's field mission instructions separately; integrate deliberately with conflict regression checks.
