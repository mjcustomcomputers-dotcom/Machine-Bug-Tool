# Private research storage — runtime 0.9.1-http.1

This maintenance release preserves UMTB-4.0 routing, the 20 bounded evaluators, the canonical registry definitions and pins, and the existing Site/plugin identities. It adds `RESEARCH-STORAGE-2.0` to the universal contract. It does not add a database, a new authentication flow, encryption, target actions, or automatic publication of files.

## Account access

The existing owner-only Sites access policy remains the production boundary. The application now requires both trusted platform user ID and email headers for every data-bearing tool call, including `get_registry` and `get_universal_contract`. `runtime_status`, MCP initialization, discovery, and ping retain their metadata role.

Discovery schemas and tool descriptions remain available at the app layer; the private Sites boundary protects production discovery and the existing manual pages. This patch does not promise complete method-metadata concealment. Headers identify an authenticated user; they do not attest which MFA or hardware key the user used. Sites OAuth is unchanged. A service-only request without authenticated-user context can obtain status metadata but cannot call the newly identity-gated registry/contract tools.

## Two private record contracts

`prepare_research_backup` retains the existing required record fields and `LEGACY_V1` default. Existing valid legacy calls keep the original manifest format, ordering, fingerprints and CSV fields. Legacy classifier/method strings remain unverified and are explicitly labeled `LEGACY_REFERENCES_UNVERIFIED`. The complete result is `PRIVATE_NOT_DASH_EXPORTABLE` by default.

Use `record_contract: "TYPED_V2"` for new work. Every record must then include:

```json
{
  "typed": {
    "identity": {
      "namespace": "SOURCE_NATIVE_OBJECT_NAMESPACE",
      "native_id_type": "string",
      "native_id": "02"
    },
    "ordinal": 10,
    "classifier_refs": [
      {"namespace": "MAXVAR", "native_id_type": "integer", "native_id": 31},
      {"namespace": "BL", "native_id_type": "string", "native_id": "BL01.01"},
      {"namespace": "NESTMAX", "native_id_type": "string", "native_id": "A.01"},
      {"namespace": "MBSS", "native_id_type": "string", "native_id": "MBSS-B01-L01"},
      {"namespace": "EXT", "native_id_type": "string", "native_id": "EXT:MB49.01"}
    ],
    "method_refs": [
      {"namespace": "METHOD", "native_id_type": "string", "native_id": "conservation"}
    ]
  }
}
```

The example illustrates types, not classifier applicability. Actual evidence and the existing UMTB-4 router determine which references belong in a record. Empty reference arrays are valid.

In typed mode, the legacy `classifier_ids` and `method_ids` arrays must be empty. All registered references reside in `typed`, so two inconsistent reference authorities cannot coexist. Unknown namespaces, unknown IDs, wrong declared/native types, duplicate references, and unsupported method IDs are rejected against the actual bundled registries. MAXVAR uses integer IDs; NESTMAX, BL, MBSS, EXT and METHOD use their exact existing string IDs. No prefixes are added or removed and no IDs are numerically coerced.

The legacy record `id` remains an opaque string. Native identity is a separate namespace/type/value tuple. `"02"`, `"2"`, and integer `2` remain distinct. Numeric native IDs must be safe integers; negative zero is rejected because JSON serialization would erase that distinction. Use a string for a native identifier larger than the safe-integer range, with `native_id_type: "string"`.

`ordinal` is a separate nonnegative safe integer. It must be unique within the current record batch and supplies numerical presentation order. IDs are never parsed to derive it. Parent links still refer to exact record `id` strings; missing parents and cycles remain rejected. Source versions, notes, and explicit type/order changes affect the record and manifest fingerprints.

The `RESEARCH-BACKUP-2.0` private manifest records registry fingerprint/version bindings. These bindings are private data and are excluded from the Dash projection. `observed_at` remains the caller's literal text; this patch does not claim timestamp-semantic validation.

## Explicit Dash projection

Private records and methods are readable content. Moving them into a private Drive file does not by itself exclude them from a Dash connector authenticated as the same owner. The full manifest, private spreadsheet, notebook, source records and resolver therefore belong in an owner-controlled location whose indexing exposure has been checked.

To prepare a minimal reference index, select:

```json
{
  "export_profile": "PRIVATE_WITH_DASH_REFERENCES",
  "resolver_action": "CREATE"
}
```

The default `export_profile` is `PRIVATE`; it returns no Dash artifact. Unknown profiles fail closed. Dash preparation requires an explicit resolver action, so initial allocation and reuse are distinguishable.

Only these returned fields are Dash artifacts:

- `dash_projection` — JSON containing exactly `format_version`, `project_handle`, `checkpoint_handle`, and `records`, where each row contains only `record_handle`.
- `dash_csv` — the same allowlisted fields as CSV.

Handles are CSPRNG-generated UUIDv4 values. They are not hashes of native IDs. The projection contains no original record IDs, titles, classifier or method names/IDs, URLs, source hashes, text, notes, values, numeric ordinals or parent graph. Projection rows are ordered by their opaque handles, not by the private record ordinal.

The output also includes `private_resolver` and `private_resolver_fingerprint`. Keep both private with the manifest; they must not be nested into or uploaded beside the Dash payload in an indexed container. The complete tool result remains private even when it contains a Dash projection. Do not upload the complete response.

This is a reduced reference projection, not encryption. Record counts, repeated handle equality and the export structure remain visible. Existing indexed plaintext is unchanged. The runtime does not guarantee confidentiality, alter connector permissions, or prove that another AI cannot infer anything from remaining metadata.

## Stable resumption and forward continuation

The private resolver has one project handle, stable record-handle/typed-identity bindings, and separate checkpoint handles with exact record membership. Its checksum binds the entire private crosswalk. No resolver is held on the server.

`CREATE` is explicit initial setup. It rejects a supplied resolver or prior checksum. Save the returned resolver and checksum after preparation. Repeating `CREATE` creates new aliases, so this action is not an idempotent retry; the MCP tool annotation reflects that.

`REUSE` requires both the saved `dash_resolver` and `expected_resolver_fingerprint`. It verifies the checksum, project and record-contract scope, unique role-separated UUIDv4 handles, record identities, checkpoint membership, and complete referential integrity. The requested checkpoint must already exist and have exactly the supplied record set. Reordering input records preserves aliases. Source content/version revisions may change the private manifest hash while preserving the same native identity's handle.

`ADVANCE` also requires the saved resolver and checksum. It requires a new checkpoint ID, preserves the project handle and every existing record handle, creates only the new checkpoint/new record handles, and retains earlier checkpoint memberships. An existing record ID cannot silently acquire another native identity. The current checkpoint can contain a subset of earlier records plus newly introduced records. Prior records remain in the private resolver.

The resolver is bounded to 512 records and 128 checkpoints; each call accepts 1–64 records. Capacity exhaustion returns an explicit error. There is no automatic compaction, alias reassignment or resolver replacement.

The caller must obtain the expected checksum from its previously saved receipt, rather than recomputing it from an untrusted changed mapping. A matching caller-supplied checksum proves internal consistency, not the history's authenticity. Without a persistent trusted server state, this module cannot independently establish which prior crosswalk is canonical. The workflow preserves the saved resolver and its receipt for that reason.

## Spreadsheets and notebooks

The private JSON manifest is the lossless record. The CSV escapes spreadsheet formulas; importers can still auto-type values. Import native ID and JSON columns as literal text/RAW, and use the separate ordinal as numeric data. Typed private rows expose `native_namespace`, `native_id_type`, `native_id_json`, `ordinal`, `classifier_refs_json`, and `method_refs_json` alongside existing fields. JSON encoding distinguishes string IDs from numbers.

Private notebooks should load the same manifest, verify its fingerprint and registry/version bindings, preserve exact native identity types, and resume with the saved resolver. New notebook and spreadsheet workflows should use `TYPED_V2`. Do not treat legacy compatibility mode as verified typed storage.

Preparation continues to return `BACKUP_PREPARED_NOT_SAVED`, `persisted:false`, and `submission_ready:false`. Connected storage must save the selected artifacts and verify their returned content independently. No current program authorization, source truth, vulnerability finality, legal conclusion, or report submission is inferred by storage validation.

## Verification

The regression suite preserves the existing method/registry parity checks. New tests exercise private legacy compatibility, exact type and ordinal behavior, unknown and cross-namespace references, projection leak sentinels and key allowlists, explicit export actions, resolver checksum/scope/membership/UUID failures, forward continuation, identity-rebinding rejection, manifest changes with stable aliases, and authenticated registry/contract calls.
