# 0.5.0-http.1 integration receipt

Integration source: user-supplied INTEGRATION.md, compared to deployed 0.4.6-http.1.

Implemented:
- business_logic_sweep exposes the existing pinned 32/384 analysis plus domain-neutral legal/evidence correspondence and qualitative review lenses.
- analyze_business_logic remains compatible. Nine tools total, rather than the handoff's older eight-tool assumption, to retain that deployed name.
- get_business_logic_registry accepts 1–24 unique exact IDs; prior catalog/branch inputs remain valid. Mixed selectors and unknown IDs fail explicitly.
- get_universal_contract includes the same evidence-review correspondence and bounded continuation instructions.
- Compact runtime status; source fingerprints and Unicode indexing cached within each evidence validation request.
- 5-second request-body deadline, 8 in-flight requests per isolate, explicit busy response with Retry-After, 1 MB response cap with a smaller-batch error. Existing 2 MB request, depth 32, per-user/per-isolate 60 calls/minute limits preserved. No automatic retries.

Method scope: original STPA/Alloy/NASA/Sterman/CIA labels remain pinned in the source pack. Added lenses are qualitative questions about information, stages, units, hidden state, deferred causation, record divergence, state ownership and falsification. They are not implementations of Nash/Harsanyi/Selten solvers, executable game models, autonomous bounty testing or proof gates. The attachment contains integration instructions, not the separate Python overlay source.

Legal and business review: freeze one object/workflow, retain input fingerprint, retrieve exact child definitions and canonical MAXVAR in bounded batches, bind factual claims to the universal packet's source/version/subject/span references, validate structure, then separately review applicability and truth. No automatic legal promotion, external traffic, persistence, or submission.

Verification: complete 66-test suite passed. A subsequent 5-test focused suite includes the four prior reliability tests plus oversized-response rejection (67 unique passing tests overall). Covered stalled-body deadlines, busy rejection and recovery, exact lookup bounds, sweep output parity, compact status, unchanged legacy fixtures, authentication, pack digest, and evidence-reference regressions.

Limits: concurrency and rate accounting are per isolate, not globally distributed. The deadline covers body arrival, not a platform-wide execution deadline. Platform/connector outages and ChatGPT client retries remain outside server control. A completed result must be saved by the caller; this stateless server is not a durable job queue.
