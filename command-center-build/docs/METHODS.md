# Methods applied to the methods

## Objective

Make MPC resolve the next meaningful uncertainty with less duplicated work, clearer source lineage and more reproducible results. More named methods do not by themselves establish greater reasoning ability. A useful addition has a source, typed input, applicable dimension, executable operator, falsifier and a measured outcome.

The accompanying `research/methods.json` contains eleven proposals and fourteen primary-source records. Twelve source records were retrieved as full text or author presentations, with the reviewed sections identified in each record. MacKay's record is abstract-only; the original 2007 provenance paper was identified but its PDF did not open, so the author's 2017 presentation supports the operational detail. Those retrieval limitations remain attached to the proposals.

## Implementation priorities

| Proposed improvement | Existing MPC connection | New work needed | Useful experiment |
| --- | --- | --- | --- |
| SQL provenance expressions | Typed source identity, `identity_graph`, `relational`, dependency planning | Versioned lineage expressions and incremental invalidation; ordinary FKs alone are not a provenance-semiring engine | Add two aliases for one source, change its version, and require only dependent conclusions to become stale. |
| Metamorphic router testing | Existing `metamorphic` controlled comparison | Automated fixtures with justified input/output relations | Cosmetic label changes preserve identity; actor/version changes alter the appropriate classification. |
| STPA control/feedback analysis | Existing `state_trace`, work-phase controller | Explicit controller, action, feedback, context and loss model | Delayed/duplicate results must not create false completion or endless retries. |
| Counterexample-guided refinement | Existing `finite_invariant` and counterexample review | Concrete/abstract relation and bounded refinement procedure | Remove a spurious abstract path while retaining a real seeded violation. |
| Livingstone-style diagnosis | `abductive_cover`, fault structures and current connection observations | Component-mode model and conflict-directed diagnostic adapter | Distinguish stale cache, absent credential, disconnected host and unsupported schema; retain ambiguous alternatives. |
| Useful next-evidence selection | Existing Harsanyi and V15 finite cost/observation experiments | A task-specific acquisition adapter using supplied models or an explicitly heuristic ranker | Compare decision error and duplicate reads under the same acquisition budget. |
| Controlled scheduling | `partial_order`, temporal and finite-invariant checks | Owned instrumented harness; replay and correctly justified reduction | Detect/replay duplicate-job and cancellation/commit races and compare with exhaustive small schedules. |
| Contextual method selection | Existing deterministic method router as baseline | Outcome/propensity logs, held-out evaluation and policy versioning | Unsupported evaluation fails visibly; selected operators must actually be runnable. |
| Calibrated triage | Existing separate evidence/finality states | Defined score target, independent labels and held-out calibration | Evaluate Brier/log-loss and uncertainty by project/time; do not label an LLM-written number calibrated. |
| Owner and information-flow labels | Typed ownership/authority and current adapter boundaries | Propagation through prompts, summaries, indexes, reports and logs | Synthetic secret canaries stay within selected destinations; document instructions never become commands. |
| Reverse provenance / missing-answer explanation | Relation/entailment checks and dependency graph | Bounded supported query fragment with explicit negative and unknown facts | Missing access changes a conclusion to unknown, not to proven absence. |

These are mappings for implementation; shared names do not establish equivalence. No proposal renumbers MAXVAR, BL, MBSS, NESTMAX, EXT or the 239-candidate Atlas. The currently observed hosted runtime remains 24 finite evaluators.

## Method selection before learning

First preserve the user's project/program priority. Within that tier, exclude methods with the wrong schema, missing input, unavailable evaluator or unsatisfied dependency. Among eligible methods, choose one whose result can distinguish the active alternatives. Prefer a low-cost discriminating source read or finite calculation over another unchanged inventory pass.

If valid probabilities, observations and losses have been supplied, a bounded expected-value calculation can help. Otherwise display the basis as a heuristic: prerequisites covered, alternatives separated, source freshness and estimated cost. Do not derive payout probability from a published reward ceiling or treat novelty as a reward.

After execution, record whether the gap was independently resolved, remained unknown, or produced a useful counterexample. Preserve the exact method version, input, source versions, result and elapsed/cost observations. That record later supports selection learning; it is not automatically a training example of truth.

## Learn from approaches that did not work

Maintain a failure/negative-result ledger with method, exact context, assumptions, expected discriminator, actual result, smallest counterexample, failure category, and retry condition. Useful categories include unsupported input, model incompleteness, ambiguous observation, wrong applicability, implementation defect, source drift, provider failure, and no useful information gained.

A failed approach can reveal a missing classifier distinction or a cheaper next observation. Preserve that evidence. Do not call it permanently disproven outside its tested conditions, erase it to improve a pass rate, or retry it without explaining what changed.

The user asked for overlooked professor/book/research ideas. This pack uses documented research and translates it into scoped operations. It makes no unsupported claim that an idea was abandoned, never built or unique. Livingstone and CHESS were implemented systems; the proposed MPC integrations are the new engineering work.

## Experiments and promotion

Compare improvements with the current deterministic router and the same finite fixture set. Include positive controls, benign controls, adversarial mutations and unseen project/source/time splits where applicable. Report measured changes in:

- Correctly resolved gaps at a fixed budget.
- False promotion and unknown-to-false conversion.
- Duplicate acquisition and duplicate-job rates.
- Native identity/alias errors and stale-result reuse.
- Replay success and minimal counterexample retention.
- Time, tokens, memory and native tool calls when observed.
- Performance by task type and source coverage.

Only promote a method/policy after its implementation, scope, source and comparison evidence justify the change. Candidate registration, finite synthetic validation, local integration, model inference, Windows acceptance and real program findings are separate milestones.

## Hosted MPC checks performed in this pack

The current hosted `state_trace` evaluator was executed on a synthetic configure/read/fail/recover sequence and on a deliberately false connected-state sequence. The positive trace matched; the adverse trace identified the configuration-to-connected mismatch. The `relational` evaluator was then executed on explicit versus silently substituted provider records and identified the mismatch.

That is **two native evaluator IDs and three supplied-model calls**, not execution of the eleven research proposals or verification of Windows/cloud accounts. The complete inputs and receipts are retained in `evidence/hosted-mpc-receipts.json`.
