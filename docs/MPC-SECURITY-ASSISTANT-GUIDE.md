# MPC Security Assistant

Operator guide for the additive V17 development branch. Documentation checked October 9, 2026.

## What we are building

**Our product is the security workflow, methods, evidence handling, and operator experience built around the existing Machine-Bug-Tool.** Codex or ChatGPT supplies the conversational model. The local assistant connects that model to acquired evidence and real MPC operations through **ACQUIRED → ANALYZED → DECIDED**.

Keep the existing architecture: 24 implemented evaluators, 239 Method Atlas candidates, original classifier IDs, and the completed V13 controller. The bridge exposes **27 tools: 20 native entries and seven assistant operations**. Candidate coverage, tool availability, and executed calculations have separate counts. These distinctions come from [the native atomic execution contract](atomic-execution.md) and [the V15 reasoning guide](REASONING-INTELLIGENCE-V15.md).

This package extends the source based on commit `77561659fad5f68858b3c2da142301c50b9f3646`; that base does not identify the newly built assistant. Use the current branch and validation receipt for its exact tested bytes. GitHub changes do not automatically update the live MPC plugin or an already installed Windows copy.

## Start on Windows with existing Codex

Use the complete source checkout or complete assistant distribution and an installed Node.js version meeting `package.json` (`>=22.13.0`). Keep the existing Codex sign-in. This assistant adds no paid inference API, API key, or model training.

The earlier published executable has not been identified in this pass. Use this package's actual entry point; do not guess switches for a different executable.

From the product directory in PowerShell, register the local server:

```powershell
.\scripts\Connect-MpcSecurityAssistant.ps1
codex mcp list
codex
```

The connection script defaults to the repository workspace and `mpc-security-assistant` server name. Optional `-Workspace PATH` selects an existing evidence directory; `-ServerName NAME` selects another registration name. It checks Node and startup, preserves an existing named registration, and reads back the server list. In Codex, ask:

> Use MPC Security Assistant. Call assistant_status, read get_universal_contract, then run assistant_self_test. Report the actual result through ACQUIRED → ANALYZED → DECIDED. Continue with the evidence file I name next.

The server command itself is `node scripts/start-mpc-security-assistant.mjs --workspace PATH`. Codex launches it as a process and exchanges MCP messages through STDIO; running it alone is not an interactive chat window.

OpenAI currently supports native Windows/PowerShell Codex and local MCP configuration. WSL is optional. ChatGPT web does not read this local configuration. See [Windows support](https://learn.chatgpt.com/docs/windows/windows-sandbox) and [MCP configuration](https://learn.chatgpt.com/docs/extend/mcp). Use Codex as the MCP client: the old `codex mcp-server` command was [removed](https://learn.chatgpt.com/docs/mcp-server).

## Operate through acquired evidence

| Stage | Operator action | What the completed stage establishes |
|---|---|---|
| **ACQUIRED** | Call `assistant_acquire` with a workspace-relative file and typed source/subject metadata. | A snapshot of observed bytes with a source hash and identity. |
| **ANALYZED** | Call `assistant_analyze` with `acquisition_id`, `tool_name`, and `arguments_pointer`. | An executed operation bound to acquired JSON arguments and its returned result. |
| **DECIDED** | Call `assistant_decide` with `analysis_id`, disposition, rationale, falsifier, limitations, and next action. | A bounded review judgment and its consequence. |

Read schemas from the actual connected server. Handles returned by acquisition and analysis must come from that session. A file hash establishes content parity; it does not authenticate the document's author or prove its assertions. A decision does not grant permission to run a scanner, contact a target, send a report, merge, or deploy.

Acquisition fields are `relative_path`, `engagement_id`, `owner`, `source_identity`, `subject_identity`, `declared_version`, and `source_kind`. Identity objects contain `namespace`, `native_id_type`, and a matching string or integer `native_id`. Use the registered source-kind enum. Dispositions are `READY_FOR_REVIEW`, `NEEDS_EVIDENCE`, and `REJECTED`; decision fields also require `rationale`, `falsifier`, a nonempty `limitations` array, and `next_action`.

For an understandable synthetic check, save this as `evidence/matching-pennies.json` inside the selected workspace:

```json
{
  "source_kind": "SYNTHETIC_FIXTURE",
  "question": "Does the supplied matching-pennies game have a pure equilibrium?",
  "native_args": {
    "method": "nash",
    "input": {
      "row_payoffs": [[1, -1], [-1, 1]],
      "column_payoffs": [[-1, 1], [1, -1]]
    }
  }
}
```

Ask the assistant to acquire that file, analyze `/native_args` with `evaluate_method`, and decide what the returned calculation establishes. The independent mathematical expectation is no pure equilibrium and equal mixed probabilities for each player. A passing result demonstrates this finite calculation and connection; it is not evidence about a bounty target.

An empty `arguments_pointer` selects the whole JSON document. Direct native calls return an envelope with `execution_scope`, `engine_fingerprint`, `workflow_state`, and `result`; they do not create stored AAD analysis. Use `assistant_analyze` for that receipt.

For real engagements, the JSON evidence should retain the native source locator/version, observed records, explicit model assumptions, argument payload, competing explanation, and falsifier. Do not silently convert a narrative into complete model inputs. Missing information should lead to a precise acquisition step.

## Continue after a restart

The new assistant session is in memory. Save evidence files and actual receipts using the host's file tools or authorized native connector. After restarting, reacquire those files and replay the recorded pointers; old session handles are not durable checkpoints.

Read history with `assistant_read_receipt({receipt_id})`. Invalidate an acquisition with `assistant_invalidate({acquisition_id, reason})`; prior receipts remain available as invalidated history. Reacquisition creates a new identity. A revised decision supplies the current `supersedes_decision_id`. Changed runtime bytes require restarting the process.

Keep chat handoffs as navigation pointers. Read native GitHub, Drive, or Dropbox records for controlling facts. Dash may index the same object; it is not another independent witness. Record a saved checkpoint only after the actual write/readback. Preserve the older V13 and V15 histories separately.

## Use it in ChatGPT and keep Daybreak Blue

The existing MPC plugin remains the preferred ChatGPT route. Its deployed tools and local V17 additions have separate availability. A custom GPT is optional where the account provides that builder: use **MPC Security Assistant** as its name, paste `assistant/GPT-INSTRUCTIONS.txt`, add this guide as reference knowledge, and copy the conversation starters from `assistant/PROFILE.json`. Start with private operator review. The profile is a repository configuration aid, not an OpenAI account-import format.

Choose available connected apps or custom actions according to the builder's capabilities. Current documentation says a GPT cannot combine both. OpenAI's Enterprise migration guidance describes moving reusable instructions and knowledge into plugins, which supports retaining our existing plugin investment. See [GPT configuration limits](https://learn.chatgpt.com/docs/enterprise/gpts-and-sharing) and [plugin migration](https://learn.chatgpt.com/docs/migrate-custom-gpts).

Preserve the user's **Daybreak Blue** preference on a surface where it is available. Record the observed model and access separately. This package cannot establish entitlement. The old API alias is deprecated; current API documentation separates the model from `access_programs.cyber`. Those API fields are not Codex configuration instructions. See [Daybreak access](https://learn.chatgpt.com/docs/cyber-safety), [API program selection](https://developers.openai.com/api/docs/guides/daybreak), and [alias status](https://developers.openai.com/api/docs/models/gpt-daybreak-blue-latest).

Codex ChatGPT sign-in uses subscription access; API-key sign-in uses separately billed Platform usage. See [authentication and billing](https://learn.chatgpt.com/docs/auth). A future private Windows-to-cloud bridge could use [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels), which needs separate setup and does not support public plugin distribution. The present assistant creates no tunnel.

## Improve the methods against themselves

Use the actual `assistant_self_test` receipt for implemented assistant checks. It is a standalone synthetic diagnostic, not a stored `analysis_id` for `assistant_decide`. Use the existing V15 runner for its separate bounded reasoning curriculum. Research below supplies test ideas; it does not mean every suggested test is implemented.

- **Inverse operations:** acquire/invalidate/reacquire and approve/revoke/revoke should not duplicate effects or revive authority. NASA documents inverse-operation and cleanup fault models, including repeated message delivery, in [Off Nominal Testing](https://swehb.nasa.gov/spaces/SWEHBVD/pages/140640392/8.1%2B-%2BOff%2BNominal%2BTesting).
- **Interaction coverage:** vary actor, source version, state, and tool outcome using bounded combinations. State the combination strength and uncovered obligations. [NIST combinatorial testing](https://csrc.nist.gov/projects/automated-combinatorial-testing-for-software) supports this efficiency approach; pairwise coverage is not exhaustive proof.
- **Control relationships:** retain the connection between each atom and the component that observes, changes, or relies on it. The [MIT STPA Handbook](https://psas.scripts.mit.edu/home/get_file.php?name=STPA_Handbook.pdf) addresses unsafe interactions among otherwise functioning components.
- **Business invariants:** every entry point must enforce current ownership, valid transitions, and replay behavior. Use [OWASP business-logic guidance](https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html) to define the expected behavior before testing.
- **Hostile retrieved content:** evidence or method files must not grant themselves instruction authority. Test that boundary using the [OWASP prompt-injection guidance](https://genai.owasp.org/llmrisk/llm01-prompt-injection/).

Judge improvement by a discriminating experiment, an independent expectation, a benign control, and retained failures. Keep exact source/model bindings and compare before/after behavior. Method inventory size is not an intelligence score. Cite these publications; do not redistribute their full text as our commercial product.

## First consulting offer

Start with a **Business Logic and AI Workflow Security Review**: one application, an agreed set of important workflows, and a reproducible evidence package. This is a proposed service design, not a market-demand or revenue forecast.

The engagement should define the systems, allowed actions, test window, test accounts, evidence handling, and report recipient. Walk through value movement, ownership, approvals, retries, and agent/tool boundaries. Deliver a workflow model, findings tied to exact source versions, practical impact, strongest benign explanation, proposed remediation, and a retest. Keep each client's records separate.

Price after a short discovery: estimate the hours for source review, modeling, permitted reproduction, reporting, and retest. Quote a fixed scope with named exclusions and a change process. Measure the first pilot's actual effort before setting repeatable packages. Do not invent market rates or promise findings or bounty payouts.

Use bug bounties as a separate research track under each program's current rules. Consulting sells the review and evidence quality. Confirm that the chosen model's approved access covers the work: the Daybreak enterprise guidance limits that access to its approved internal scope and does not automatically authorize extending it to clients or externally offered services.

## Present completion boundary

**Account GPT creation and native Windows execution have not been performed by this guide's preparation.** The profile, instructions, and guide are prepared repository artifacts. Read the current validation receipt for actual local test results. GPT creation, Windows connection, Daybreak selection, hosted plugin deployment, client approval, and target testing retain their own observed statuses.
