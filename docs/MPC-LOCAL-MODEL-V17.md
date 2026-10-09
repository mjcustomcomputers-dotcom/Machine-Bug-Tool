# MPC V17 — private local reasoning model adapter

This is an **additive local language-model interface** for the existing MPC V16 evidence-first controller and V15 self-play/evaluator engine. It does not replace them, rewrite source registries, retrain a model, connect to the native hosted plugin, or issue traffic to bounty targets. All earlier pass histories and typed identities remain unchanged.

## Windows setup (PowerShell)

1. Install an official Windows [Ollama](https://ollama.com/download/windows) release; verify `ollama --version`. This is done by the machine's owner, **not** by the ChatGPT connector.
2. In the existing Machine-Bug-Tool checkout, install or use Node.js >= 22.13.0. The new adapter adds **no npm or pnpm dependencies**.
3. Obtain the downloadable local weights and create our named local *configuration*:

```powershell
ollama pull qwen3:4b-instruct
cd C:\path\to\Machine-Bug-Tool
ollama create mpc-daybreak-local -f .\models\MPC-Daybreak-Local.Modelfile
ollama list
```

The Qwen3 4B instruct weights are downloaded once; the `mpc-daybreak-local` name is a customized configuration of those weights, **not** trained MPC weights. Ollama can run this model on CPU, though performance depends on installed RAM/GPU. This adapter refuses the `:cloud` suffix and calls only `http://127.0.0.1:11434/api/chat`; do not expose an Ollama port on your LAN. No ChatGPT key or hosted MPC credentials are needed.

## First useful pass — acquire evidence, not another architecture scan

```powershell
# Uses the existing native evidence workflow; no model call is made while a required record is missing.
.\scripts\Run-MPC-Local-Model.ps1 -PlanOnly
# After a source's exact version and content have been added to workflow.records:
.\scripts\Run-MPC-Local-Model.ps1 -Model mpc-daybreak-local -InputFile .\my-source-case.json
```

Receipts are written as new JSON files under `Runs/`. The default supplied `data/evidence-workflow-example.json` deliberately contains a source pointer but no fetched content, so its first run **stops at an actionable ACQUIRE_RECORD step** without wasting a language-model call. The host/operator reads the source through an authorized connector and places its actual text under `workflow.records`, with `source_ref` and `version` matching `sources[]`. Then the existing controller progresses to ANALYSIS; the local model supplies provisional sourced observations, never a replacement stage or next action. A complete verification target is still required before the existing controller chooses VERIFICATION.

You can also run the Node CLI directly:

```powershell
node scripts/run-mpc-local-model.mjs --input data/evidence-workflow-example.json --output Runs\plan-example.json --mode plan
```

The output path **must be new**. It will not overwrite a research controller or a previous receipt.

## Trust and continuity

- The V16 deterministic router selects `work_stage`, method readiness and `next_action`. The local model cannot override them.
- During EVIDENCE_ACQUISITION, the adapter makes no model request. It returns the native source/version/owner/target-fact action, ready for the authorized acquisition mechanism.
- When content has already been acquired, the adapter sends at most six bounded excerpts to the **local-only** model. Quotes are admitted only if present verbatim in the matching current-version excerpt; meanings remain unverified model interpretations.
- Malformed output, unknown IDs, invented quotes, early verification, missing local model and local HTTP errors are separately recorded. There is no fallback to a cloud endpoint.
- No new native evaluator IDs, Method Atlas IDs, source pointer identities, classification rules, credentials, storage schema or hosted MCP surface are introduced.
- The Modelfile is a prompt/configuration wrapper. For actual fine-tuning, first collect consented, sanitized task→evidence→action examples; label them independently, retain source splits, run held-out task tests, then train model adaptations in a *separate* pipeline. **None of that training is claimed complete here.**

## Validation

`node --test tests/mpc-local-model.test.mjs` exercises acquisition without inference, plan-only mode, localhost request format, valid quotation, invented/stale records, stage preservation, no provider fallback and model-error isolation. Run the existing repository `node --test` and `npm run build` in its prepared pinned environment before merging or deployment. A successful adapter test is not evidence that the model is installed or that native Windows inference occurred.

## Lineage and review

Feature review base: `feature/mpc-local-live-intelligence-v16` (source-bound at branch creation). No merges, Site publication, native controller mutation or target action. Keep prior V15 and V16 validation artifacts as independent historical receipts. This add-on can be removed without changing the underlying MPC computation system.
