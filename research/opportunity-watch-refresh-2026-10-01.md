# OpenAI Opportunity Watch: reusable implementation delta

Refreshed October 1, 2026 America/Chicago (October 2 UTC). Input read in full: OpenAI_Programs_Machine_Legal_Index_2026-10-01.md, Library libfile_8f3a77e51fe48191b4fa49d9b4ad88e2. This supplements that planning index; it does not overwrite it or change any funding/application state.

## Findings used

The watch prioritizes an independently checkable evidence-integrity demonstration, continuity across updates, and understandable boundaries. The computational core should be independent of the UI, model provider, transport, and source connector. Keep declared evidence, derived results, inference, and adoption distinct. Preserve existing MAXVAR/NESTMAX and the Python proof-gate implementation.

Targeted official rechecks:
- https://openai.com/form/cybersecurity-grant-program/ — continues to request focused AI/security proposals, failure evidence, methodology, and a public-benefit distribution plan. An available application does not establish eligibility or a grant. No submission performed.
- https://openai.com/form/codex-open-source-fund/ — describes ongoing review and up to $25,000 API credits for open-source projects. A private prototype has not thereby established the required open-source status. No publication or licensing decision made.
- https://developers.openai.com/api/docs/guides/evals — rechecked notice: read-only October 31, 2026; scheduled shutdown November 30, 2026. Use portable fixtures and a local runner rather than a dependency on that hosted platform.
- https://developers.openai.com/api/docs/guides/structured-outputs — typed output structures guide interchange design. This implementation uses standard JSON schemas and local validation; no model/API call was made and schema correctness is not factual correctness.

The other program listings remain at the original index's snapshot; they were not reverified in this technical delta. Existing grant provisioning remains unresolved in that index; neither private grant correspondence nor billing was refreshed here.

## Implemented

lib/universal.mjs is a domain-neutral structural kernel, with no SDK, network, database, or provider dependency. lib/schema.mjs performs strict nested shape validation. contracts/evidence-packet-v1.schema.json exports the same packet schema. Sources bind namespace, ID, version, owner, subjects, native locator, representation, text, and extracted-text hash. Spans pin that entire envelope, with explicit Unicode code-point offsets. Claims have declared actor/capacity, source references, parents, method, limitations, and OBSERVED/DERIVED/INFERRED/ADOPTED state.

validate_evidence_packet and get_universal_contract expose this kernel through the existing Site's MCP endpoint. ADOPTED is always blocked pending a separate trusted proof/approval gate. Domain labels are declared routing metadata, not executed legal/scientific profiles. Existing four tools remain available. The input/output vocabulary does not replace the Python proof packet.

## Validation and boundaries

49 local tests pass: previous 28 plus 21 universal checks. Tests include valid synthetic legal/research/device/program packets, source locator/owner/version/text changes, subject mismatch, namespace mismatch, offsets including emoji, unresolved references, duplicate identities, cycles, packet-pin changes, and blocked adoption. These are deterministic regression tests, not a measured model benchmark, grant acceptance, native evidence authentication, or legal certification. They do not demonstrate semantic resistance to prompt injection.

No connected-source adapter or account credentials are included. Future Gmail/Drive/Airtable adapters must produce this packet without treating a provider label as truth and must retain their own authenticated retrieval receipts. Future model adapters may submit structured claims but cannot grant themselves adoption. Future domain profiles supply reviewed obligations; the existing MAXVAR/NESTMAX registry remains unchanged.

Next integration: verify native authenticated MCP calls when the host exposes the connected tools; port the remaining existing runtime operations; integrate durable, independently resolved review receipts before any adoption gate. Measure useful supported answers, wrong attribution, abstention errors, latency, and cost with held-out families before claiming research gains.
