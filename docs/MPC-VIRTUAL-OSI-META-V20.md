# MPC V20 — Virtual OSI, Methods-on-Methods and rapid metadata routing

**Source:** `feature/mpc-osi-methods-on-methods-20261009` (review branch stacked on screen/network build PR #19). This is additive. Existing Method Atlas candidate IDs, native 24 evaluator IDs, BL32/384, fault_tree, delta_plan, source pointers and historical checkpoints remain unchanged.

## What executes

A new `lib/mpc-meta-logic.mjs` symbolically transforms only **explicit source-bound tri-valued predicates**. States are `SUPPORTED`, `CONTRADICTED`, and `UNKNOWN`. Independent nine-cell AND/OR tables, all 27 three-term combinations, involution and De Morgan controls are tested. `NOT UNKNOWN = UNKNOWN`: an absent observation does **not** authorize a negative conclusion. A reverse dependency is a new review hypothesis, *not* the converse of a proven cause.

The finite graph generates at most nine method-operation **candidates** per two-atom observation: NEGATE, DOUBLE_NEGATE, COMPOSE_AND, COMPOSE_OR, DE_MORGAN, INVERT_DEPENDENCY, CHALLENGE. Every node has a stable content-bound ID, operation, depth, logical state, falsifier and explicit `NOT_EXECUTED`/no-canonical-promotion flags. A separately implemented `lib/mpc-meta-audit.mjs` replays the generated nodes against independent fixed three-valued lookup tables, verifies candidate IDs and rejects tampered or claimed-executed nodes. `method_audit` in each virtual observation reports only finite algebraic consistency, **not** successful source verification. These are not additional native evaluators or newly registered Method Atlas methods. Root terms from existing BL384 and native fault/delta receipts remain authoritative.

The new `lib/mpc-natural-negation.mjs` scans a bounded first 16,384 UTF-16 characters of OCR for grammatical NOT, *do not*, *without*, *no evidence of*, double negation and inability. It records only operators, offsets and scope labels; **not** user text or authentication claims. A partial sample is explicitly flagged. It does not substitute simple lexical heuristics for a language model or assert what a negated statement means.

## Two seven-layer virtual observation stacks

This is an **MPC virtual dependency/interpretation stack**, not a replacement for physical optics, semiconductor hardware, or the ISO network OSI standard.

| Virtual screen layer | Purpose |
|---|---|
| PIXELS | Observed native frame identity, not independently authenticated |
| CROP_AND_MASK | Trusted capture session supplied region and pre-OCR privacy masks |
| OCR_DECODE | Native decoder confidence and truncation, not calibrated correctness |
| LEXICAL_CUES | Existing source-bound English cue matches and bounded NOT syntax |
| INTERPRETATION | Unverified author, intent and context |
| DEPENDENCY_DELTA | Existing source text change/invalidation and method reuse |
| HUMAN_REVIEW | Explicit review not presumed completed |

| Virtual network layer | Purpose |
|---|---|
| OS_ENDPOINT_TABLE | The local OS returned a socket listing, not packets |
| SNAPSHOT_SCOPE | Non-atomic table/row-limit coverage |
| TRANSPORT_METADATA | Only observed local/remote TCP/UDP endpoint state |
| PROCESS_MAPPING | PID/name mapping is not signed process attribution |
| STATE_DELTA | Two selected snapshots, not an event history |
| INTERPRETATION | No harm or traffic intent inferred |
| HUMAN_REVIEW | Manual review, not automatic network action |

The actual `createScreenObservationClassifier.analyze` now includes `virtual_osi` in its bounded native report, without changing existing cue/fault/delta algorithms or result authority. The Windows network snapshot result includes its separate `virtual_osi` alongside `snapshot` and `diff`. UI panels show the proposed local route and method candidates. `crossExamineVirtualObservations(screen,network)` can draft a source-bound cross-check **only** for matching project scopes; its output explicitly states that no shared actor/event or independent corroboration has been proved. Separate capture and network permissions remain intact.

## Faster reasoning without fictional accelerators

The original masked-pixel change gate, latest-one-frame OCR queue and 2 MiB/15s OCR text cache are retained, unmodified. A **separate** strictly bounded metadata-plan cache uses source/project/session/method-version fingerprints, LRU, TTL, memory byte cap, and explicit revocation. It stores only tri-valued candidate plans, not pixels or recognized text. Source changes, scope changes, time reversal, user Stop and native project resets prevent stale reuse. The screen model limits this cache to 8 entries/96 KiB/15 s; the network model to 4 entries/64 KiB/10 s.

The virtual router selects a *suggested human action* in causal order: low-confidence or truncated OCR → smaller native crop/contrast comparison; ambiguous double NOT or absence claim → original-context review; configured lexical cue → source-bound cue review; unchanged OCR text → preserve existing classification; large pixel area → offer a targeted crop. These are recommendations, not autonomous capture or API calls. A cropped 4K image can reduce pixel work but should be benchmarked; it cannot reconstruct missing text or promise linear speedup.

`scripts/benchmark-mpc-osi.mjs` measures metadata-only synthetic fresh/warm planning on the CI host. It **does not** benchmark Windows PowerShell, real OCR, packet capture, GPU, AI tokens or actual end-to-end speed. Keep 4096×2160 Windows observations and per-stage timing separate. User's initial live receipt showed roughly 4609 ms OCR and 2.9 ms classifier: optimization should first compare native region selection and recognition timing, not blindly clear Windows memory caches.

## Regression and next passes

Run `node --test tests/mpc-meta-osi.test.mjs tests/mpc-natural-negation.test.mjs tests/mpc-screen-classifier.test.mjs tests/mpc-network-host.test.mjs`, `node scripts/benchmark-mpc-osi.mjs`, then `node --test` and `pnpm run build`, plus the native Electron OCR/privacy/Stop/network fallback smoke and packaged Windows ZIP hash/offline OCR test. Source and test receipts must identify the exact commit.

Future scoped adapters can add an operator-selected Android/ADB device observation, ETW/WPR traces, and process-to-port cross-correlation, **but these are not claimed built here**. HTTP request bodies, VPN tunneling, hardware-visible-light channels, Sysinternals process-driver integration and autonomous attack traffic also remain separate. Native evidence is not the same thing as an interpreted conclusion; no meta transform may silently elevate it.
