# Universal evidence contract 1.0.0

Use Node 22+ or a Web Crypto-compatible server runtime. Import `validateUniversal` and `digest` from `lib/universal.mjs`. Supply `{packet, expected_packet_fingerprint: null}` for initial inspection, or a previously retained packet fingerprint to detect a changed packet. An expected fingerprint supplied by the same caller is not an independent attestation.

Obtain the JSON Schema from `evidence-packet-v1.schema.json` or the MCP tool `get_universal_contract`. Fill source text hashes with `digest(source.text)` and span source fingerprints with `digest(source)`. The complete source includes locator and declared owner/subjects. Offsets count Unicode code points, not UTF-16 units or UTF-8 bytes. Use `[...text]` for JavaScript slicing. See `universal-boot-v1.json` for actual versus planned adapter status.

`STRUCTURAL_REFERENCE_CHECK_PASS` only establishes the implemented reference checks. It does not prove that a quote supports a claim, that the source belongs to its declared subject, that an owner/actor is authentic, that a domain profile was executed, or that an action is authorized. No remote writes occur. `ADOPTED` is blocked. Preserve the separate Python proof-gate pipeline.

The kernel's sorted-key JSON serialization is explicitly versioned and is not represented as an implementation of RFC 8785. Preserve exact source strings; do not silently normalize them. Array order is significant.

Run `node --test tests/mcp.test.mjs tests/universal.test.mjs`. Fixtures are synthetic and do not contain the user's legal records. Deterministic regression success is not a model-quality evaluation.
