# Local screen observation classification

`lib/mpc-screen-classifier.mjs` connects the existing MPC solid-state pack and
finite evaluators to consented local OCR. It classifies observable words and
changes, records possible interpretations with their evidence, and invalidates
derived state when its input or capture scope changes. It performs no network
request, model call, click, credential entry, command execution, or other action.

## What actually runs

| Component | Executed behavior | Meaning of its output |
| --- | --- | --- |
| Bounded English cue rules | Scan the current OCR text for instruction overrides, credential requests or mentions, payment, destructive operations, local execution, urgency, and authority claims. | A lexical cue occurred. Its quotation, purpose, author, legitimacy, and effect remain unresolved. |
| Native `analyzeBusinessLogic` | Execute the existing pinned `BL-SOLID-STATE-384` pack, accounting for all 32 branches and 384 precompiled checks. Return four priority checks with the native pack, input, and coverage fingerprints. | `SOLID_STATE_SWEEP_CANDIDATE` identifies checks to consider; it does not report 384 verified findings or authenticate the screen. |
| Native `fault_tree` | Evaluate one eight-node OR model over seven cue categories. Observed cues supply `true`; absent cues supply `null`. | Root `true` means at least one configured cue matched. Root `null` means unresolved. Neither result is a harm, safety, deception, or intention probability. |
| Native `delta_plan` | Calculate the changed observation's dependent closure and batches of at most three items. | It orders cue, hypothesis, native-review, priority, and user-review dependencies. It does not prove the truth of those interpretations. |

These calls reuse `lib/solid-state.mjs`, `lib/methods.mjs`, and `lib/tools.mjs`.
The original native IDs, registries, method contracts, and canonical controllers
are unchanged. The additional cue rules are explicitly heuristic screen rules;
they are not added to the native classifier registry.

For unchanged OCR text within the same scope, the native solid-state and fault
tree results are reused and labeled `REUSED_SAME_TEXT_AND_SCOPE`. The native
delta planner still runs and returns `NO_DELTA`. A changed image with unchanged
OCR adds `NON_TEXT_VISUAL_CHANGE_UNCLASSIFIED`: this text classifier cannot
interpret an icon, color, image, or other non-text change.

## Public API

```js
import {createScreenObservationClassifier} from '../lib/mpc-screen-classifier.mjs';

const classifier = createScreenObservationClassifier();
const report = await classifier.analyze(ocrObservation);

if (report.status === 'CLASSIFIED' || report.status === 'REUSED') {
  // Present report.summary, cues, and explicitly hypothetical interpretations.
  // The host must still verify that the capture session/project is current.
}

classifier.reset('USER_STOP');
const metrics = classifier.status();
```

The input is the pipeline's `MPC_SCREEN_OCR_OBSERVATION`, with untrusted OCR,
`source_authentication: false`, disabled OCR networking, a frame SHA-256 and
capture timestamp, generation, and normalized capture context. The factory
accepts an optional `now` function for deterministic lifecycle tests. Receipt
fields used by analysis are copied before any asynchronous native-method call,
so mutation by a caller cannot rebind the text or source after its fingerprint.

An accepted report contains:

- `summary`, `source`, and `change`: exact session/source/project/generation,
  image and text fingerprints, capture time, changed-line counts, and bounded
  changed-text excerpt.
- `cues`: at most eight cue categories, redacted excerpts, and exact start/end
  offsets in the original OCR text, explicitly measured in UTF-16 code units.
- `hypotheses`: at most five possible displayed purposes, each marked
  `HYPOTHESIS`, with its evidence cue, observed excerpt, alternative explanation,
  falsifier, and protective/quoted-context indicator.
- `uncertainties`: OCR confidence/truncation limitations, partial line coverage,
  visual-only changes, or changed OCR interpretations of identical image bytes,
  as applicable. Authorship, motive, and user action remain unknown in every
  report.
- `native`: compact `solid_state`, `fault_tree`, and `delta` execution receipts.
  Inspect `execution` to distinguish a fresh call from an unchanged-text reuse.
- `counters`: observations, reuse, stale/busy/invalidated work, resets, and actual
  native sweep, method, and dependency-call counts.

The lifecycle statuses are:

| Status | Host treatment |
| --- | --- |
| `CLASSIFIED` | A fresh report for this accepted observation; display only while its capture scope remains valid. |
| `REUSED` | Same text and scope; inspect `change` and uncertainties before presenting the reused interpretation. |
| `STALE` | Reject as a current classification. It is from a revoked scope or precedes the accepted capture order. |
| `INVALIDATED` | Reject as a current classification. Stop/reset invalidated pending work or cleared retained state. |
| `SKIPPED_BUSY` | No classification was produced for this input. One bounded analysis was already running. |

Only `CLASSIFIED` and `REUSED` have the full source/change/cue/native structure.
Other statuses are compact diagnostic reports. Invalid input, a timestamp more
than 15 seconds old or in the future, or a report exceeding its byte limit throws
a named error. The host may still present the independently acquired OCR text
with an explicit unavailable-classification state.

## Time, dependencies, and Stop

One factory holds one current observation. Its scope fingerprint includes the
session, source, project, generation, language, crop, masks, and preprocessing.
A scope change clears prior cue/hypothesis/line state. A text change recomputes
the dependent report and explicitly invalidates the previous interpretation.
The current full-text hash detects changes beyond the bounded line comparison.

Older captures and conflicting frame hashes at the same accepted timestamp
cannot replace the current report. A reset increments an invalidation epoch,
clears retained state, sets a timestamp cutoff, and revokes the active scope.
Native calls already in progress may finish internally, but their result cannot
be committed after that reset. At most 64 revoked scope hashes are retained.

The host owns permission and session identity. It must check the current capture
session, generation, project, and delivery sequence before and after awaiting
analysis, and call `reset` on Stop, source/project changes, or teardown. This is
required even with the local replay guards: a bounded tombstone set is not a
replacement for the host's active consent state. Delivery should serialize
analysis while retaining at most a latest pending observation, rather than
creating an unbounded queue of classification promises.

## Bounded data and privacy

| Limit | Bound |
| --- | --- |
| Concurrent classification | 1 |
| OCR text input | 200,000 UTF-16 code units |
| Retained observations | 1 current redacted report |
| Retained line fingerprints | First 64 lines; partial coverage is explicit |
| Cue/changed-text excerpt | At most 112 UTF-16 code units |
| Hypotheses / native priority checks | At most 5 / 4 |
| Returned report | At most 24 KiB of UTF-8 JSON |
| Accepted receipt age | At most 15 seconds |
| Revoked scope fingerprints | At most 64 |

Recognized token, bearer, labeled secret, email, and long number patterns are
redacted from excerpts before they enter the retained report or native sweep.
This is best-effort pattern redaction. It is not a guarantee that arbitrary
personal information or an unfamiliar credential format will be recognized.
Use the capture's crop and privacy masks before OCR for material that must not
be acquired. Source IDs and cryptographic hashes are identity/consistency data,
not proof of source authenticity or anonymity.

The classifier has no image buffer or disk cache. It retains the current
redacted report and line hashes, not a timeline of raw OCR text. Reset removes
its references; JavaScript garbage collection does not provide a secure memory
erasure guarantee. Image buffer disposal is the capture/OCR pipeline's separate
responsibility. Browser, GPU, allocator, and operating-system copies are outside
the classifier's control.

Every report states `trust: UNTRUSTED_SCREEN_OCR`,
`source_authentication: false`, and `external_action_authorized: false`.
Accepted reports additionally record `autonomous_actions: 0`. Displayed text
never becomes permission, a verified fact about a person's intent, or an
instruction to the assistant. For example, “never share your password” has a
credential cue and a protective-context marker; neither proves that the user
is disclosing a password or that the page is malicious.

## Verification

Run `node --test tests/mpc-screen-classifier.test.mjs`. The tests execute the
actual native pack, dependency planner, and fault tree. They cover unchanged
text reuse, changed dependencies, cross-project reset, capture ordering,
stop-during-analysis invalidation, mutation across asynchronous boundaries,
protective quotations, uncertainty, bounded redaction/history, and concurrency.
Synthetic local timings characterize this classifier on the measured host;
they are not Windows capture/OCR performance or a guaranteed frame rate.
