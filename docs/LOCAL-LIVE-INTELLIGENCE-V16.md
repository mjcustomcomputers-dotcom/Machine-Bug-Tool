# MPC V16 — Evidence acquisition, working phases, and local/live intelligence

The operational sequence is **acquire the record, extract the facts, analyze the question, and verify a specific claim when its material is ready**. The main response leads with the acquired fact and the action that advances the work.

## What changed

The local router now returns `work_stage`, `fact_summary`, and `next_action` before its detailed classification receipt. Its next action identifies the source, owner, native locator, version, target fact, and completion condition. A source pointer produces an acquisition step. Matching source content supports analysis. A defined claim with support and contrary-evidence criteria supports verification.

The existing private **MPC Machine Legal** operating plugin was updated to **0.4.8**. Its core, boot, source-router, and checkpoint instructions use these phases and recognize completed acquisition and fact extraction as progress. The saved plugin release and exact readback are recorded in the V16 validation evidence. Its existing 14 skills and 58 packaged file paths are retained.

The server implementation is on the dedicated V16 development branch. The comparison observed published Site version 15, source `765923c9839f32502e5c0f1f1b919b827596012e`, runtime `0.10.0-http.1`, and evaluator catalog `1.2.0`. Publication version 15 and the local V15 reasoning lab are separate version labels.

## Working phases

| Available material and task | Working phase | Next useful action |
| --- | --- | --- |
| A source ID or locator, with content still to acquire | EVIDENCE_ACQUISITION | Read the exact record and requested version; extract the fact that resolves the question. |
| An older source version | EVIDENCE_ACQUISITION | Obtain the declared current version and retain the older record as prior material. |
| Matching source content | ANALYSIS | Explain the record, formulate a comparison, or run a supplied bounded model. |
| A specific claim, its sources, and support/contrary criteria | VERIFICATION | Check that claim against the acquired records and record the outcome. |
| Explicit acquisition with a prepared model | EVIDENCE_ACQUISITION | Keep the model ready while the required record is acquired. |
| Explicit legacy atomic model execution | ANALYSIS | Execute the supplied model and interpret its results. |

The host obtains records through its supported native source connectors. The local router turns the received source state into the next working action. Each completed read retains its text, source version, and retrieval receipt.

### Native-source progression executed in this scan

The demonstration began with the saved MPC core instruction's GitHub source pointer at commit `77561659fad5f68858b3c2da142301c50b9f3646`. The local workflow selected EVIDENCE_ACQUISITION. A native GitHub read returned that source text; supplying the exact source/version/content advanced the workflow to ANALYSIS. Four phase definitions were extracted from the read text. Adding one definite claim and its support/contrary criteria advanced to VERIFICATION. The validation evidence retains every transition and the actual native source read.

## Run the local workflow

Use an installed Node.js meeting the product's `>=22.13.0` requirement:

```sh
node scripts/run-evidence-workflow.mjs --input data/evidence-workflow-example.json --output workflow-result.json
```

The command writes a complete receipt and prints the working phase, available facts, and next action. Use a new output path for each receipt. The example identifies one synthetic source whose contents are to be acquired. For an actual job, supply the real source metadata and analytical question.

The optional `workflow` field on the existing router is:

```json
{
  "requested_phase": "AUTO",
  "records": [
    {
      "source_ref": "RECORD-ID",
      "version": "exact-declared-version",
      "content": "Actual returned source text"
    }
  ],
  "verification_target": {
    "claim": "A specific proposition to check",
    "source_refs": ["RECORD-ID"],
    "expected_support": "The source fact that would support it",
    "expected_counterevidence": "The source fact that would defeat it"
  }
}
```

`requested_phase` accepts AUTO, EVIDENCE_ACQUISITION, ANALYSIS, and VERIFICATION. Records bind to an existing `sources[].id` and exact source version. Acquisition steps can start from a known locator or a focused source-discovery target. The optional verification target is supplied when the task has reached that check.

## Local versus live: executed comparison

The native comparison corpus contains **48 cases across all 24 evaluator IDs**. Forty-one inputs produced result receipts and seven produced the expected semantic rejections. Every corresponding local/live native outcome matched. Independent expectations identified **45 ordinary matching cases and 3 shared numerical counterexample cases**.

The three counterexample cases represent two related numerical issues: Nash conditioning with a Harsanyi cross-check that rounds away the strict preference, and conservation's zero-tolerance false pass. Identical native results remain useful evidence of cross-version behavior; the independent arithmetic determines whether their numerical answer satisfies the supplied model.

### Exact numerical review

`lib/exact-native-numerical-review.mjs` accepts an existing native Nash or conservation receipt with its method and input. It preserves that receipt and returns a separate `exact_result` and `comparison`.

- The affected Nash game returns native column probability **0.4**; exact indifference gives **1/3**. A strategically equivalent common-column payoff shift produces native **1/3**. The exact review preserves the correct probability under both representations.
- Conservation accepts `1 + 2^-54 - 1 = 0` at zero tolerance after floating accumulation. Exact arithmetic retains the residual **-2^-54**, and the local review gives the correct tolerance decision.
- Ordinary matching pennies, exact balances, and ordinary rounding of **1/3** are controls. The review separates ordinary binary64 projection from larger numerical disagreement.

The recurring reasoning curriculum now varies dyadic scale, small inflow size, and tolerance while retaining those controls. Its summary records known native numerical disagreements separately from unexpected experiment failures. The original native evaluator contracts and IDs remain available as the comparison baseline.

### Run the recorded comparison

```sh
node scripts/run-local-live-intelligence.mjs --live-receipts Evidence/live-native-observations.json --output comparison-result.json
```

The command executes the local 48-case corpus and compares it with the captured live receipts. It validates input hashes, schema hashes, case IDs, native model fingerprints, and exact errors before reporting the comparison. Each recorded observation retains its collection time. Obtain a new observation set through the connected MPC service when a fresh hosted comparison is needed.

The classifications are SAME_RESULT, SHARED_ORACLE_COUNTEREXAMPLE, VERSION_DIVERGENCE, and MISSING_LIVE_OBSERVATION. Each case retains its actual result and its independent expectation. The complete scan evidence includes both native inputs and outputs.

## Router and execution improvements

The four-method shortlist now orders candidates by the strongest question state, then model readiness, then stable method ID. All 120 permutations of the original five-question fixture retain the required identity comparison. Required obligations remain ahead of optional work.

The sweep wrapper now summarizes actual nested atomic execution, including count, completion, and pending offsets. The scan observed the prior live wrapper reporting `NOT_EXECUTED_BY_SWEEP` alongside two actual nested evaluations. The repaired local summary follows those execution receipts.

During acquisition, an explicitly requested atomic execution is retained as prepared work and evaluated in PLAN mode until the required source content arrives. The phase receipt preserves both requested and effective modes and the ready model IDs.

## Source continuity and next experiments

V16 begins from native development commit `cb15df82c76063262caae3ab6e3e557cd00cf4b7`, exact tree `a746767c86c9f26f5f3413f296e99feba48dc395`. It includes the four preceding automation additions: stochastic observation value, imperfect-information regret, budget-sensitive search, and adaptive two-stage computation choice. Their prior receipts and continuation archives remain in the source tree.

The current lab restores the adaptive continuation from seed 20261011. A changed runtime triggers a source-bound replay, after which the next seed advances normally. Existing V13 controllers, the earlier delivered V15 package, and original registry identities retain their own saved state.

The next useful extension is bounded robust observation choice under interval likelihoods: choose the next fact-gathering action by its worst-case decision value, with an endpoint oracle and zero-width control. Another operational test is a source-version change during acquisition: preserve the completed read, obtain the changed version, and recompute only dependent analysis.

See the V16 validation receipt for the exact tested commit, full test/build result, raw live observations, plugin release, portable runtime identity, and source readback.
