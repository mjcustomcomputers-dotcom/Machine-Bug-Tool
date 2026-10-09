# MPC V13 — operative controllers in regular chat

For Codex continuation, start with [the current resume guide](CODEX-V13-CURRENT-RESUME.md)
and [resume manifest](../connector-bridge/codex-resume-v13.json). Read this guide
and the latest receipts at the current reporting branch head; execute the saved
controller code at its recorded tested source commit. The two revisions have
different roles and must be recorded separately.

The existing MPC connection can be used from an ordinary ChatGPT conversation.
This addition makes the V13 workflow **advance through explicit actions and
receipts**: native source checks, method selection, a supported native model,
its negative control, the proposed challenger, and a saved checkpoint with
native readback. ChatGPT is the host that invokes the existing connected tools.

Start with `connector-bridge/operative-controllers-v13.json`. The final source
validation receipt is `docs/validation/MPC-V13-VALIDATION.json`; the development
checkpoint is `docs/validation/MPC-V13-OPERATIVE-CHECKPOINT.json`. Resolve these
at the current development branch through GitHub. Their actual written state
and the tested commit must be read from native Git objects; this guide alone
does not establish that a later receipt exists or that a branch was deployed.

The new files are `lib/noahs-ark-controller.mjs`, the separate
`scripts/noahs-ark-controller-cli.mjs`, and its dedicated tests and synthetic
fixture. They leave the existing MPC server, original Atlas CLI, native
registries, canonical Drive controllers, and previous checkpoints in place.

## Paste this in regular chat

```text
BOOT MPC OPERATIVE CONTROLLERS V13.

Use my existing MPC Machine Legal, MPC BugTools and GitHub connections.
Repository: mjcustomcomputers-dotcom/Machine-Bug-Tool
Development branch: feature/noahs-ark-reasoning-osi-v13

Read AGENTS.md and connector-bridge/operative-controllers-v13.json at the
current branch head. Read docs/validation/MPC-V13-VALIDATION.json and
docs/validation/MPC-V13-OPERATIVE-CHECKPOINT.json when present. Resolve the
exact tested code commit separately from later receipt-only commits.
Read docs/CHATGPT-MPC-OPERATIVE-CONTROLLERS-V13.md at the current reporting
branch head. Execute the controller code at the recorded tested source.

If the manifest names latest_controller_state, fetch that exact saved state
through GitHub and verify its native file/version and returned content.
Use the state and validation receipt to resolve tested source commit S,
check out that source safely, and restore the saved JSON unchanged under
.sites-runtime/. Refresh the current session's actual native-source and
MPC capability receipts in a config derived from the saved state, then run
reconcile against that existing state. Preserve its completed-action
history. Use init only when creating a new controller.

Run that source's operative controller in this chat's available execution
environment. Use real registered tool schemas and current-session native
source receipts. Reuse the supported MPC connection; verify runtime_status,
get_universal_contract and a protected finite evaluator call when this
session has not already done so. Obtain the selected native input schema
with get_method_catalog.

Hydrate the controller from actual GitHub/native-source responses and the
current project checkpoint. Preserve exact source owners, native ID types,
versions and source text. For the bridge demonstration use the versioned
synthetic fixture and keep SYNTHETIC_ONLY throughout. Do not invent an
authentication value, source version, capability, readback or completed call.

Ask the controller for its next action. Perform that supported action and
feed the actual tool response back. Reuse an exact prior native calculation
when the controller identifies it, keeping the original call/session and
an explicit reuse reference. Continue primary, negative-control and
challenger obligations until they complete or a named input gate blocks.

Keep MHA research candidates separate from native METHOD evaluators.
Use only explicitly bound, limited adaptations with complete supplied
inputs, strict schemas and falsifiers. Report actual results and limits.

Save this development checkpoint on the same GitHub feature branch and
read its exact commit/content back. Preserve canonical Drive controllers.
Report completed obligations, distinct native calculations, reused results,
source/tested commit, checkpoint/readback identity and exact next action.
Do not merge, deploy, contact bounty targets or submit reports.
```

This host does not need a separate Codex task when its existing execution
environment and connectors are available. In a chat without source execution,
report `CONTROLLER_EXECUTOR_UNAVAILABLE`; the existing hosted MPC methods can
still be used independently. A prompt does not install or deploy the V13 code.

## Which controller owns each responsibility

| Controller responsibility | Operative condition |
| --- | --- |
| Native source/controller admission | Exact namespace, native ID **and ID type**, owner, version, content hash and same-session supplied native-read receipt |
| V13 method selection | The actual committed catalog and relationships enter `planNoahsArkReasoning`; all current candidates receive a decision |
| Native adaptation | An explicit MHA candidate, existing native method, adapter version, limits, exact input schema and full model bindings |
| Negative control | A separate source-bound native input and a result predicate; the finite-invariant control must actually return `COUNTEREXAMPLE_FOUND` |
| Challenger | The named proposed relationship selects a separate bounded obligation; its readiness and inputs are checked again |
| Result admission | Actual bounded-result envelope, method/version, request/model hash, expected body fields and nonpromotion boundaries |
| Checkpoint completion | Authorized native write, exact target identity, returned version, and matching native text readback |

The V13 planner itself still creates a review plan. Its `AVAILABLE` declarations
are not executable proof. The controller independently checks all model input
leaves against explicit source/version/JSON-pointer bindings before issuing an
evaluation request. A whole-model binding is permitted when the source contains
that exact complete model. Partial bindings cannot leave undeclared input values.

The fixture routes two research lenses (`MHA-0053` and its proposed complement
`MHA-0035`) through explicitly limited finite labelled-graph adaptations. It
does not turn those MHA mechanisms into native solvers. Both use the existing
`finite_invariant` evaluator. There are four controller obligations and three
distinct model payloads because the exact negative-control calculation can be
reused. Reuse is recorded; it is not independent evidence or a new execution.

## State progression

| Status | Host action |
| --- | --- |
| `BLOCKED` | Resolve the exact listed source, capability, schema, binding or negative-control problem and reconcile the config |
| `AWAITING_HOST_EVALUATION` | Use the returned `evaluate_method` arguments, or bind the indicated exact prior receipt with an explicit reuse reference |
| `AWAITING_CHECKPOINT_WRITE_CAPABILITY` | Preserve completed calculations; obtain the actual supported native write capability and already-authorized destination |
| `AWAITING_NATIVE_CHECKPOINT_WRITE` | Write the returned exact text through the supported GitHub connector on the development branch |
| `AWAITING_NATIVE_CHECKPOINT_READBACK` | Read the returned commit and exact file; supply the actual text and native identity/version |
| `COMPLETE` | The bounded model run and development checkpoint have matching receipts; source authenticity and a target finding remain unestablished |

The controller refuses a checkpoint destination equal to either the native
controller or any input source identity. Native Drive controllers remain
authoritative for their projects. The GitHub checkpoint is a development
artifact and does not advance a canonical legal or bounty finding.

## Concrete CLI sequence

The chat host resolves the tested code commit from the current validation
receipt, then executes that exact checkout. For example, tested code commit
`S` may be followed by reporting commits `C` and `D`. Read the latest receipt
at `D`, execute source `S`, and record checkpoint readback at its actual commit.
Do not substitute the reporting branch head for the code commit that was tested.

For an existing controller, first fetch the file named by the manifest's
`latest_controller_state` through GitHub. Verify its exact native version and
returned content, resolve source commit `S` from the saved config and validation
receipt, and restore that JSON unchanged under `.sites-runtime/` in the `S`
checkout. The refresh/reconcile sequence below preserves its completed-action
history. Do not run `init` for a controller that already has saved state.

For a **new controller or separate synthetic demonstration only**, the following
local sequence is executable in the checked-out source. The first command
creates a new synthetic configuration with the **actual current Git HEAD**,
so the fixture's historical `e9b0...` locator is never silently used as the
current execution commit. Choose a fresh filename when one already exists;
the command does not overwrite prior configuration.

```sh
node scripts/noahs-ark-controller-cli.mjs prepare-fixture .sites-runtime/controllers/v13-demo.config.json
node scripts/noahs-ark-controller-cli.mjs init .sites-runtime/controllers/v13-demo.config.json .sites-runtime/controllers/v13-demo.state.json
node scripts/noahs-ark-controller-cli.mjs next .sites-runtime/controllers/v13-demo.state.json
```

The bundled configuration contains explicitly labelled fixture capability/read
receipts for offline tests. It proves no hosted connection. For a real hosted
round trip, **ChatGPT obtains the current tool responses and native GitHub
reads, then hydrates the configuration from those responses before `init`**.
The user does not need to invent or type source versions, authentication fields
or schemas. The versioned development controller manifest supplies the intended source
locators; the native connector response supplies their actual versions/content.

The `next` result contains one request. For `MPC_EVALUATE`, the host calls the
registered `evaluate_method` tool with precisely `action.arguments`. After
saving the real response in the receipt envelope described below:

```sh
node scripts/noahs-ark-controller-cli.mjs receipt .sites-runtime/controllers/v13-action-receipt.json .sites-runtime/controllers/v13-demo.state.json
node scripts/noahs-ark-controller-cli.mjs next .sites-runtime/controllers/v13-demo.state.json
```

Repeat only for the next returned action. A native checkpoint request is a
typed host instruction, not an invented endpoint. The host uses the actual
GitHub create/update and fetch schemas, the specified development branch,
current native file metadata, and the returned exact text. A checksum-only
assertion cannot substitute for the native text readback.

For a restored controller, verify the saved state in its tested source checkout.
Then derive `v13-current.config.json` from that state using the current session's
actual native-source and MPC capability receipts. Reconcile the existing state;
its prior receipts remain historical evidence and unchanged native calculations
remain reusable. The host performs the same refresh when source, method or model
state changes. The filenames below assume the host restored the saved JSON to
`v13-demo.state.json`; they do not direct creation of a new controller.

```sh
node scripts/noahs-ark-controller-cli.mjs verify .sites-runtime/controllers/v13-demo.state.json
node scripts/noahs-ark-controller-cli.mjs reconcile .sites-runtime/controllers/v13-current.config.json .sites-runtime/controllers/v13-demo.state.json
node scripts/noahs-ark-controller-cli.mjs next .sites-runtime/controllers/v13-demo.state.json
```

The local `verify` checks the saved state's parity and semantics. Refresh the
current-session receipts before advancing it; restored historical capability
receipts alone do not verify a new chat's live connection.

The CLI checks the config's source commit against actual `git rev-parse HEAD`.
It records dirty working-tree status and hashes the controller, planner,
native model/schema modules and current catalog files. `next`, `status` and
receipt admission reject changed source until explicit reconciliation. It
never resets or switches the checkout itself.

## Receipt contract for the chat host

Use `controllerHash` from `lib/noahs-ark-controller.mjs` for these fingerprints.
It uses the same sorted-key serialization as the existing native model digest.
String hashes use exact UTF-8 bytes; JSON arrays retain their order. CLI
`hash-json FILE` and `hash-text FILE` expose the same two operations.

An evaluation receipt contains:

```text
kind                 = returned action.kind
action_id            = returned action.action_id
tool                 = returned action.tool
call_ref             = the actual host tool-call/log reference
session_id           = the current recorded host session
request_sha256       = returned action.request_sha256
response             = the actual native structured tool result
response_sha256      = controllerHash(response)
```

If `receipt_reuse_candidate` identifies an exact earlier native calculation,
retain its actual response and original call reference, add
`reused_from_action_id` and `originating_session_id`, and bind it to the new
obligation's action ID. The model request, native schema/version and response
must match. The controller records that reuse instead of counting a second
native calculation or independent source. Current-session capability and
native-source checks still apply when historical calculations are reused.

Native-write receipts add `status: NATIVE_WRITE_SUPPLIED`, the target's exact
`native` identity and returned version, `expected_previous_version`, and
`content_sha256`. Native-readback receipts use
`status: NATIVE_READBACK_SUPPLIED`, the same written identity/version, and the
actual exact `content` text. Both retain the actual native tool response and
its hash. The host must populate these fields from actual connector results,
not an assistant statement that a write succeeded.

These envelopes are **host-supplied records**. The controller checks their
consistency, semantics and content parity. It does not cryptographically
authenticate ChatGPT's transport or the historical/scientific truth of the
source. A valid receipt hash does not grant proof, external testing authority,
legal finality or a verified vulnerability.

## Persistence, replay and changes

State JSON lives under the existing ignored `.sites-runtime/` directory. Each
accepted event writes an immutable revision/event snapshot, then atomically
replaces the current state and reads it back. State paths and history reject
symlink traversal. Writes use a per-state lock and compare the previous
integrity value to reject a concurrent update. No credentials are stored.

Admission rebuilds the executable plan from the retained bounded catalog and
source-bound config. It also checks each historical request/receipt and its
result predicate. Rehashing an injected arbitrary task, empty result, invented
completion counter or changed task list does not make it valid. Current source
checks in the CLI prevent a saved catalog snapshot from silently standing in
for changed GitHub source.

An identical completed action and receipt are a no-op. A changed adapter,
candidate definition, native schema, source version, model value or declared
relation changes the relevant dependency identity. Previous receipts remain
in history; only current obligations without a matching completed action are
pending. Adding an unselected catalog row changes catalog accounting without
rerunning unchanged native calculations.

The bounded limits are 512 catalog candidates, 32 queued model obligations,
512 retained action records, 128 config revisions, and two million serialized
bytes. Hitting a limit fails explicitly and preserves the earlier state.

## Adding methods through GitHub and ordinary chat

For a later addition, this is the short request to use in ordinary chat:

```text
ADD A METHOD THROUGH GITHUB TO MY EXISTING MPC ATLAS.
Read the current operative controller manifest and reviewed development
branch. Add the requested method as a versioned research candidate with its
source, paired classifier, required inputs, falsifier and explicitly proposed
method relationships. Validate the existing schema/taxonomy, ID uniqueness
and every relation endpoint. Preserve old IDs, source pointers and completed
results. Record any supported native adapter and its exact required inputs;
a definition alone is not an executable solver. Test the changed source and
reconcile only affected controller dependencies. No merge or deployment.
```

This V13 validation/controller pass retains **239 candidates**. The prompt
above is the workflow for a separately requested later addition.

Ask ChatGPT to edit the versioned Method Atlas definition/source/relation files
on this development branch using the GitHub connector. Keep exact typed IDs,
source pointers, required inputs, falsifiers and proposed relationship status.
Run the actual source validation, then reconcile the operative controller at
the new tested code commit. No separate Codex session is required in a host
with the existing execution capability.

A new catalog row becomes a considered research candidate. Native execution
additionally requires a supported existing native method, strict current
schema, explicit adaptation limits, source-bound inputs and executable control.
Introducing a new native solver requires its separate implementation, tests,
registration and separately authorized deployment. A GitHub source change
does not update the private hosted MPC automatically.

## Verification commands and scope

```sh
node --test tests/noahs-ark-controller.test.mjs
node --test
npm run build
```

The dedicated tests cover catalog accounting, binding/readiness failures,
schema and result gates, source/version conflicts, preserved IDs, negative
control failure, explicit result reuse, changed dependency invalidation,
rehashed state tampering, native destination protection, readback completion,
atomic local persistence, symlink rejection and source-commit mismatch.
Use the final validation receipt for the actual tested commit, command exits
and counts. Local fixture tests and hosted round-trip receipts are reported
separately; neither is target reconnaissance or an authenticated finding.
