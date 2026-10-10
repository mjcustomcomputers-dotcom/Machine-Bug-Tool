# Implemented starter APIs

These modules execute deterministic operations on caller-supplied data. The desktop host still needs to connect them to the existing router, native acquisition, models, storage and UI. Their passing tests cover these contracts; they do not establish a Windows installation or an authenticated model/account.

## Model and connection observations

`lib/control-contracts.mjs` exports:

```js
validateProviderProfile(profile)
selectProviderProfile(profile, binding, userSelectionEvent, previousSelection)
assessProviderSelection(selection, currentHostObservation, runtimeContext, timing)
assessConnectorStatus(record, expectedContext, timing)
```

Provider `binding` and `runtimeContext` carry `host_id`, `account_id`, `workspace_project_id` and `api_project_id`. A local selection still belongs to a workspace project; its API project is `null`. Cloud API work has both identities. `timing` supplies `now_utc` and optional `max_age_ms`. The host records one explicit selection event and reuses that selection until the user changes it.

Connector context is the exact tuple `{provider, surface, host_id, account_id, operation}`. A record has `configuration`, `current` and `last_success`, each nullable. The host binds its own workspace project, connection ID and source/destination scope before dispatch; the observation module does not implement those permissions.

The result's `last_operation_verified` describes the observed operation. It is **not an admission condition for the next request**. `prior_success_required_for_attempt` and `verification_ping_required` are false. A selected authorized first request can produce its own first receipt; a stale card can refresh through useful work. A current failure preserves its exact supplied error and earlier success separately.

The current module compares exact supplied model and program identities. The eventual provider adapter must retain requested alias, resolved model version/digest and the basis for any documented alias mapping separately. A returned resolved version must not be silently rewritten to match the request, and an unresolved identity difference must not trigger a provider switch. The starter does not implement a provider-specific alias resolver.

The seven profiles in `config/provider-profiles.json` are editable configuration, with no selected default. Standard OpenAI profiles explicitly request `cyber: "standard"`. Daybreak eligibility follows the documented model/program combination and actual project. Hosted ChatGPT selection and local/API inference are different surfaces.

## Snapshot comparison

```js
compareSnapshotManifests(leftManifest, rightManifest)
```

Each manifest requires `snapshot_id`, `project_id`, `source_id`, `comparison_scope`, `version`, `content_sha256`, `acquisition_state`, `inventory_complete` and `entries`. `schema_version`, when supplied, is `MPC_WORKSPACE_SNAPSHOT_1`. Null version/hash values explicitly preserve unknown values.

Both `source_id` and `comparison_scope` use `{owner, namespace, native_id_type, native_id}` with exact string values. The first identifies the snapshot's source. The second identifies the subject collection. A Drive snapshot and a local snapshot can have different source identities and still inventory the same explicit collection. Project IDs must match.

Each entry has `source_id`, `path`, `kind` (`FILE` or `FOLDER`), nullable `version`, nullable `content_sha256`, and `acquisition_state`. Supported acquisition states are `PRESENT`, `UNAVAILABLE`, `UNREADABLE`, `NOT_ACQUIRED` and `ERROR`. An optional `alias_of` points directly to another typed native identity. Alias-only content does not become a native acquisition.

The output has mutually exclusive `changes.added`, `removed`, `changed`, `unchanged` and `unknown` buckets, both source bindings, reason codes, coverage, supplied-hash comparisons and computed manifest fingerprints. `version_only` is a subset of `changed`. Removal means absence from a usable complete inventory of the same subject collection. Unavailable sources and partial coverage retain unknowns. Hash equality does not establish factual truth or independent evidence.

The module never pairs different native IDs from matching filenames. Cross-provider correspondence must be explicitly acquired or selected and retained by the host adapter; do not disguise a copied local file as a native cloud read. Malformed manifests throw a visible `TypeError` with `code` and `location`.

## Separate SQL store

Apply `sql/001-command-center.sql` through a storage adapter to a new command-center database. It contains 16 tables and two views for projects, tasks, native source versions, aliases, atoms, dependencies, jobs, events, connections, native receipts, reports, outbox delivery, attached folders and attached files.

The schema preserves exact classifier/phase namespaces, typed ID values, immutable receipt history, project-qualified references, explicit raw-retention references and uncertain remote delivery. A local sync-folder read remains a local acquisition until the corresponding native receipt establishes its mapping. Detaching a folder changes index reach/retention; originals belong to the filesystem adapter and are not deleted by this operation.

The SQL preflight prevents accidental use on the legacy Workbench file. The complete production storage adapter still needs its own schema admission/versioning, transaction/cancellation behavior, supported backup and Windows restart tests. The temporary-database tests do not replace that integration.

## Executed examples

The tests are complete runnable examples of exact accepted inputs, positive controls and adverse cases. Run them from this directory's parent:

```text
node --test tests/*.test.mjs
python3 -B tests/test_command_center_sql.py -v
```

`evidence/build-pack-validation.json` and the retained Node/SQL logs identify the actual pass. Repository-wide tests and `npm run build` follow after Codex integrates the pack with the existing application.
