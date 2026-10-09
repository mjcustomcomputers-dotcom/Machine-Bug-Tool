# Evidence-gated method frontier — development implementation

## Objective

UMTB-4 already maps typed questions to a bounded set of executable-method candidates. Previously `selected_methods` took the first four candidates in caller order, including structurally blocked candidates, and did not explain which methods were deferred. This additive development change substitutes deterministic, source-state-aware *selection*, not automatic execution or proof.

## Contract

`lib/method-selection.mjs` exports `selectMethodFrontier(methods, branch_receipts, limit=4)`. The router validates questions, source references, schemas and structural application before calling it. The frontier:

1. Admits only candidate methods with at least one `REQUIRED` or `ACTIVE` caller-declared question. `WATCH` and `BLOCKED` candidates remain visible but cannot occupy a selected slot.
2. Chooses coverage of uncovered required questions first; then uncovered active questions. Within equivalent coverage, schema-valid supplied models break ties, then a stable method ID. This is a bounded greedy heuristic, *not* an optimization proof.
3. Avoids redundant method selection when all eligible questions for a remaining candidate are already covered.
4. Preserves `method_candidates` in their original enumeration. Adds `deferred_methods` with reasons, a `method_frontier` receipt with selected/unresolved question IDs, and per-candidate structural/selection metadata.
5. Keeps the four-method ceiling; never changes a canonical MAXVAR, NESTMAX, BL, MBSS or EXT definition.

## Failure and epistemic boundaries

A caller-supplied native locator/source reference does **not** authenticate evidence. Structural eligibility is not a factual finding. A schema-valid model is not evidence of target exploitation, permission to send traffic, or proof that the underlying model is true. Selection executes no evaluator, performs no target test, does not authorize external action, and does not promote any canonical finding. Unsupported/inapplicable questions do not count as resolved findings.

Selection reasons:
- `DECLARED_QUESTION_COVERAGE`: selected under the bounded policy.
- `DEFERRED_BY_BOUNDED_LIMIT`: structurally eligible but beyond the four-slot selection budget.
- `COVERED_BY_SELECTED_METHOD`: structurally eligible but no newly uncovered eligible question.
- `APPLICABILITY_UNKNOWN`: watch state; remain a candidate but request evidence.
- `STRUCTURE_OR_SOURCE_BLOCKED`: no structurally eligible question; remedy source/structure gap.

## Verification and promotion gate

Local pure-module tests: `node --test tests/method-selection.test.mjs`. Existing integration tests are extended in `tests/router.test.mjs`.

Before merging or production deployment, run in the prepared Cloud checkout **at the proposed branch head**:

```sh
node --test
npm run build
```

Check compatibility for `route_problem` and the existing `business_logic_sweep` UMTB4 compatibility path, and confirm the full 32-branch/384-classifier routing partitions and auth regression tests. Record exact commit, command exit status and test totals. No tests in an older Cloud checkout count as validating the new branch. Review changes, reconcile with native Sites history, and separately authorize any deployment.
