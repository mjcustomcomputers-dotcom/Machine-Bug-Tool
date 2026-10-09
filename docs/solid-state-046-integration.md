# Hosted solid-state integration

Hosted runtime: 0.4.6-http.1. Existing legacy prototype behavior remains 0.4.2.
Source overlay: mpc-machine-legal-0.4.6-solid-state.zip, plugin version 0.4.6.
The overlay is additive, not a replacement for the complete skills plugin.

New tools:
- analyze_business_logic: deterministic classification of a supplied workflow; accounts for 32 branches / 384 child checks, returns top 48 candidate checks. Does not verify evidence or execute external requests.
- get_business_logic_registry: catalog of 32 branches; optional branch_id BL01–BL32 returns exactly 12 child definitions.

Both use existing hosted authentication and per-isolate rate budgets. No new persistence or connector dispatch. All six previous tools remain available. Canonical MAXVAR-256 and NESTMAX-174 registry files are unchanged.

Source provenance:
- All ten files listed in the overlay BUILD_INTEGRITY.json matched their SHA-256 values.
- Pack file SHA-256: 08ff14056c3534d57540076535e8bf66acabb2dc09a10475a504fa810c7a27e5
- Pack canonical JSON SHA-256 enforced at runtime: 7db8a73e32016a8d3df560f649125221615b42a669231ec066ce74fee9d8a58d
- Reference Python SHA-256: 44ad99348202e02681e1089b3fb3ace83d2a0e2384c737dd92787c969f81da21

Validation: node --test tests/*.test.mjs — 62 passed, zero failed.
Six full-output parity fixtures were generated from the unmodified reference Python for fictional internal workflows, including monetary, inventory, signal activation, Unicode whitespace, and optional-null cases. Further tests cover all branch lookups, immutable definitions, digest substitution rejection, malformed input rejection, changed-input fingerprints, authenticated JSON-RPC execution and runtime identity. Existing 49 tests remain passing.

Solid-state completeness means every precompiled check is accounted for, not that every check has been investigated or proven. Local proof gates and checkpoints remain local. Native deployment and connected-tool verification are separate from local tests.
