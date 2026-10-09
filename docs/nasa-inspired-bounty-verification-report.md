# NASA-inspired V&V matrix and private bug bounty report template

**Use:** Copy into a *private* program-controlled report workspace, not a public GitHub issue. This borrows NASA engineering principles of requirements traceability, test/analysis/inspection/demonstration, independent validation, version control and retained objective evidence. It is not NASA-certified or endorsed. Preserve the user's existing MPC PASS format; the present template is a report rendering, not a new canonical case registry.

## Private technical verification cover

- Report ID / PASS / program: [exact identifiers]
- Status: [HYPOTHESIS | SOURCE_CANDIDATE | SYNTHETIC_MODEL | CONTROLLED_OBSERVATION | REPRODUCED_WITHIN_SCOPE | TECHNICALLY_VERIFIED | SUBMITTED | ACCEPTED | REJECTED | REWARDED]
- Date/time + zone of each observed event: [UTC timestamps plus target-local context]
- Program-native source / rules revision: [exact locator, revision date, owner and content hash]
- Testing authority: [program allowance, eligible asset, own account, permitted action, prohibited action, requests/time-window]
- Model and execution environment: [the *actually observed* Codex/Daybreak selection, command version/commit, network constraints; UNVERIFIED if unavailable]
- Native controller / evidence store: [private Drive/Dash references; no secrets pasted into this report]
- Classification IDs: [literal typed MAXVAR/NESTMAX/BL/MBSS/EXT IDs; keep independent namespaces]
- Conflicts/limitations/review status: [what remains uncertain; human approval events]

## 1. Executive outcome (one paragraph, impact first)

[State an observed and permitted condition, affected product/tenant/role, clear security impact, exact evidence anchor, and material limitations. If not proven, say HYPOTHESIS/UNVERIFIED and do not call it a vulnerability.]

## 2. System boundary and authorization

| Rule ID | Native rule/version | Owner/platform | Asset/action constraint | Evidence source | Validity/exception |
| --- | --- | --- | --- | --- | --- |
| AUTH-01 | [rule] | [owner] | [host, account, action] | [native URL/snapshot hash] | [valid, expired, unclear] |

List excluded assets, automation restrictions, permitted rate or maximum request count, source handling/retention, account ownership and time window. State whether each action actually occurred and who approved it. No inferred permission from model selection or physical security key.

## 3. Mission assurance — requirements to evidence trace

| Requirement / invariant ID | Exact owner and version | Failure hypothesis | Method / classifier ID | Verification mode | Test or source ID | Expected state | Observed state | Result | Adverse / falsifier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INV-01 | [native rule] | [bounded claim] | [typed IDs] | INSPECTION / ANALYSIS / SIMULATION / DEMONSTRATION / CONTROLLED TEST | [T-01 / E-01] | [source-backed] | [actual, unknown, or synthetic] | PASS / FAIL / UNKNOWN / NOT-RUN | [benign hypothesis] |

**Traceability rule:** Every claimed failed invariant must point to its owning rule, exact measured event/trace, expected value, observed value, and independently reviewable evidence. The existence of a model counterexample is not target confirmation. A source reference without authentication does not prove fact.

## 4. System state and interface model

Record actor and capacity, native subject/object ID with type, authority/finalizer, precondition, input, transition, output, timestamp/order, channel, recipient, value/money unit, version/configuration, dependency edges and finality. Keep literal owner distinct from broker/operator/brand/merchant. Draw a state diagram only when the exact states and edges are source owned.

## 5. Test protocol and execution log

| Test ID | Evidence / rule prerequisite | Approved action or offline synthetic model | Environment/account | Exact execution/log pointer | Time | Expected | Actual | Stop / limit adherence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-01 | [AUTH-01 + INV-01] | [passive/synthetic/live-authorized] | [own account / sandbox] | [private URI + content digest] | [ISO 8601] | [...] | [...] | [proved / unclear] |

For live tests, keep a minimal, non-destructive reproduction over owned accounts and permitted data. Redact tokens, customer identifiers and personal information. Hash originals in the restricted evidence store; report sanitized excerpts only where necessary. Preserve negative controls, exact request count and any retry policy. Record 4xx/5xx responses as raw events, not security impact by themselves.

## 6. Competing explanations and counterexamples

- H1 (claimed defect): [what it predicts and evidence links]
- H0 strongest benign explanation: [design, asynchronous reconciliation, region/tier, permissions, stale UI, refund timing etc.]
- Critical disconfirming observation: [what would defeat H1]
- Control variable changed: [one variable only; case configuration + exact state]
- Negative/failed test log and impact on confidence: [preserve]
- Remaining unknowns and next evidence custodian: [precise]
- Source/model/target provenance separation: [OBSERVED, INFERRED, SYNTHETIC, UNKNOWN]

## 7. Failure effect, business/security impact and finality

Trace exact failure cause -> violated control or invariant -> reachable privilege/resource/financial effect -> who could exploit under approved conditions -> reversibility/compensating control -> quantified effect **if measured**. Separate potential worst case, demonstrated case, program severity determination, triager acceptance and actual reward. Avoid claiming a maximum payout or severity as fact when unsupported.

Optional cross-checks: authority graph, temporal partial order, idempotency/replay, tenant/object identity, conservation of balance, FTA minimal cut sets, FMEA failure propagation, ACH adversarial alternatives, NASA-style interface and timing V&V.

## 8. Reproduction and remediation

Short reproducible preconditions and steps only within authorized restrictions; actual observations; expected output; how the owner can verify a fix; synthetic regression test if reproducible locally; notes on environment versions and other impacted components **only if evidenced**. Do not include sensitive exploit payloads or private credentials in the report.

## 9. Independence, peer review and completion gate

| Gate | Required observation | Status | Evidence |
| --- | --- | --- | --- |
| Exact authority | Program owner/rules, applicable asset/action, current limits | [UNKNOWN/PASS/FAIL] | [AUTH...] |
| Native identity | Correct source, version, actor/object, account | [...] | [...] |
| Reproducibility | Authorized minimal test or objective native record | [...] | [...] |
| Falsification | Strongest alternative and negative control considered | [...] | [...] |
| Security impact | Observed and not merely UI/model inconsistency | [...] | [...] |
| Evidence integrity | Source/hash/retention/redaction chain accounted | [...] | [...] |
| Classification | Correct typed IDs, bounded methods, no fabricated execution | [...] | [...] |
| Submission permission | Current program channel and explicit transmission authorization | [...] | [...] |

**Readiness interpretation:** This is an evidence quality gate only. FAIL/UNKNOWN must remain visible. Passing a structural checklist does not authenticate the underlying data, grant testing permission, establish vulnerability truth, ensure triager acceptance or guarantee payout.

## 10. Bounty submission copy (separate, concise)

**Title:** [Product / authorized surface — observed security consequence]

**Summary:** [one paragraph, measurable observed impact and evidence]

**Affected asset:** [exact program-native scope]

**Prerequisites:** [test account + configuration + authorization conditions]

**Steps to reproduce:** [minimal numbered authorized instructions, no actual sensitive tokens]

**Expected versus actual:** [invariant, before/after and native evidence refs]

**Security impact:** [verified effect only; limits and strongest benign alternative]

**Attachments:** [redacted screenshots, request/response snippets, trace IDs, private hashes]

**Suggested fix / regression test:** [specific, actionable, proportionate]

**Contact and disclosure:** [authorized reporting channel, confidentiality terms]

## Source discipline

- NASA Systems Engineering Handbook, Appendix D requirements verification matrix and F functional/timing/state analysis: https://www.nasa.gov/reference/system-engineering-handbook-appendix/
- NASA SWE-071 traceability, requirements-to-test and configuration management: https://swehb.nasa.gov/spaces/SWEHBVD/pages/102695453/SWE-071%2B-%2BUpdate%2BTest%2BPlans%2Band%2BProcedures
- Daybreak cyber boundary: https://learn.chatgpt.com/docs/cyber-safety

**MPC rule:** maintain full native IDs, source ownership, adversarial falsifiers and existing PASS/checkpoint format. This is a consumer-facing report template only. Never promote synthetic model output into a verified target finding.
