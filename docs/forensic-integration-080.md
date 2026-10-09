# Forensic business-logic integration — 0.8.0

## What is implemented

Use the existing `get_method_catalog({method: ...})` to retrieve the exact, strict input schema. Supply that model to `evaluate_method({method: ..., input: ...})`. This release retains 16 top-level MCP tools and exposes 20 evaluator methods. No new connector installation is required.

All calculations use records supplied in that call. Inputs are fingerprinted, including their source references. Source references are pointers, not proof that the source was read or authenticated. Use `validate_evidence_packet` separately for source version/subject/span structure. Results remain ineligible for automatic canonical or court promotion.

| Method | Exact computation | Bound | Interpretation |
|---|---|---|---|
| ledger | Opening balances plus double-entry transfers, compared to observed closing balances, per unit | 32 accounts; 128 transfers | Closed supplied account set; include external boundary accounts explicitly. Different currencies cannot transfer directly. No implicit exchange rate or rounding. Negative expected balances and residuals are observations, not established loss. |
| relational | Uniqueness, foreign-key membership, same-row field equality | 64 rows × 16 fields; 16 rules | Returns supplied record witnesses. Missing fields remain unresolved. Foreign keys range across the supplied rows only. No hypothetical record generation or Alloy solver. |
| partial_order | Check a complete observed order against declared precedence edges; reject cyclic specifications | 64 events; 128 edges | Unconstrained pairs do not prove concurrency. This is conformance, not Petri-net reachability or linearizability search. |
| metamorphic | Exactly one control changes; all other controls match; compare observation fields | 16 controls and 16 observations per side | Reports missing observations, equality and differences. Field comparison is not a time-ordered first divergence or causal conclusion. |
| temporal | Same-subject prior event, strictly earlier timestamp, within caller-specified age/window | 64 events; 16 rules | Missing earlier evidence is not proof of violation; left censoring is explicit. Equal timestamps do not satisfy strict precedence. No eventuality proof. |
| identity_graph | Compare declared same-identity links and parent edges; detect parent cycles | 64 nodes; 128 edges | Native ID, namespace, owner, version, label stay separate. Matching labels/icons do not merge objects. Parent edges remain declared. |
| authority_graph | Exact actor/subject/action match against supplied rules | 64 rules; 64 records | Missing match stays unknown unless caller asserts a complete rule set. Rule match does not establish actual authority, execution, ownership or finality. |
| claw_accumulator | Explicit accrual/reset and separately recorded awards | 64 events | Threshold is caller supplied; reaching it does not establish entitlement or hidden machine policy. |
| coin_pusher_deferred | Opening pending + deposits − releases − removals | 64 events | Current deposit does not own a later release; release is not payment. |
| casino_meter_finality | Meter/finalized/paid amounts and pairwise residuals | 64 records | Equal amounts are not equal states. Positive final/paid amounts require the corresponding reference fields. |

Existing Nash, Harsanyi-related expected utility, Selten-related backward induction, conservation, pairwise identity, sequential trace, Boolean fault tree, FMEA, ACH and coverage computations remain available with their existing limitations.

## Source and notebook pointers actually followed

The notebook-facing map is a native Drive document, not a NotebookLM session. No NotebookLM connector was available or executed. The actual source IDs and read revision IDs are included in `lib/forensic-source-pointers.json` and returned by `get_method_catalog`.

- Notebook source map: `1I4Vk0aEhedinCx7vTh2WdCBYkNWebcsH2nS83Vu73Z8`. Paragraph indexes 782–1021 describe source ownership → atomic split → MAXVAR → NESTMAX → graph → controlled comparison → falsifier → proof obligation. Indexes 1982–2228 prohibit turning conceptual methods into computed proof or legal authority.
- Main compiler: `1cgNpU0dpMR8O_3Pv9fUW7BMam4o5PApG_bGG6T1fm-8`. Relational operator begins at index 4898; state-machine operator at 6969. Used as architecture guidance, not legal authority or a claim that those full formal systems are implemented.
- Candidate method extension: `12fE21L5kIAI6W2nJwxrxw-74jrgbQor1MRRiyaSGjz0`. Candidate concurrency at 3520, finality at 4142, causal order at 6682, liveness at 7990 and workflow soundness at 9304. These are candidates; existing MBSS branch IDs must not be overwritten or equated with candidate branch numbers.
- Jacket worker: `1Y9E9Ie7sjkDhSeUAgZcYVM7KtuP8R0wRIQnIY5Tj7B4`. The existing 14-axis `compare_operative_states` stays separate from generic `metamorphic`. Neither reinterprets canonical MAXVAR 31/32 definitions.
- Exact 64/512 registry: `1xKXfOGpWCpoL7AVc7ueYH-FIktGp8VZfn-l6rqrXNqU`. Existing `get_research_registry` and `cross_reference_methods` remain the paged route into detailed definitions and declared parent mappings.

The source map also points to canonical MAXVAR, NESTMAX, the mini-classifier expansion and Jackson Story Through Law. Existing pinned registry handling is preserved. Method names do not imply that a classifier parent mapping has been semantically proven.

## Forensic use sequence

1. Preserve exact native object IDs, source versions, timestamps, units and record references. Keep wrapper IDs and labels in separate fields.
2. Choose one bounded evaluator and retrieve its schema. The catalog lists the precise implemented computation, not an endorsement of all similarly named formal methods.
3. Populate from supplied evidence. Missing facts remain absent or unknown; do not invent transactions, ownership, prior events or authority.
4. Report: observed records; computation and input fingerprint; mismatch witnesses; unknown/missing evidence; competing benign explanation; proof status. Do not call a mismatch a vulnerability, loss or legal violation without the additional evidence.
5. Save results and their source bindings through `prepare_research_backup` and the connected Drive workflow. That tool prepares a backup; it does not itself persist it.

## Limits and anti-timeout behavior

The existing server caps requests at 2,000,000 bytes, responses at 1,000,000 bytes, nesting at 32, in-flight requests at 8 per isolate, and tool calls at 60 per user/minute/isolate. Stalled request bodies have a 5-second deadline. This is not a global CPU execution timeout or a guarantee against upstream outages. Rate limits are not distributed across isolates. No automatic retry loops.

The new algorithms use explicit small arrays, bounded loops and at most 64-node graph traversals. No unbounded state-space enumeration is introduced. Use one method call at a time; preserve a backup checkpoint before changing batches. Over-limit input is rejected rather than silently truncated. The current catalog exposes only the selected schema to keep normal calls compact.

100 MB is the user's archive ceiling, not a verified general MCP protocol maximum. Padding a package up to it would provide no forensic benefit. Source packages remain far below it; request/response bounds are independent.

## Proposals that are not implemented by this release

Full SAT/Alloy bounded model search, Petri-net reachability, global temporal-logic/liveness proofs, queue TTL/hysteresis policy, t-way test generation, fault-tree minimal cut sets, ACH diagnosticity, multi-trace comparison, and evidence-weighted frontier ranking remain unimplemented. Existing broad sweep applicability is not reduced automatically to 3–6 evidence-supported findings. The release adds precise record computations without presenting those larger proposals as finished.

No autonomous target interaction, exploit trace generation, connector dispatch, background notebook execution, authenticated proof gate, or hosted durable replay ledger is added.
