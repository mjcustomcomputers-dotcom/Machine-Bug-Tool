# MPC Workspace — working local Ollama chat

This update adds a runnable local chat view to the existing MPC build. It includes the actual Ollama HTTP adapter, browser interface, SQLite conversation service, model setup controls, and a retained Windows launcher. It is an additive part of MPC Workspace. The full Workbench, host connectors, folder index, and packaged desktop shell have separate integration acceptance in the accompanying Codex contract.

## Open it on Windows

1. Extract the complete updated ZIP into a new folder. Keep its `lib`, `scripts`, and `desktop` directories together.
2. Double-click **OPEN-MPC-LOCAL-CHAT.cmd**. It starts the local service and opens your browser. Keep the launcher window open while you work. If Node is missing, the launcher gives the official [Node.js download](https://nodejs.org/en/download); the code requires Node 22.13 or newer and needs no `npm install`.
3. In **Set up local Ollama**, use the official [Ollama Windows download](https://ollama.com/download/windows) if needed, then **Start Ollama → Download starter model → Create MPC model**. Each download/create action is explicit and shows streamed progress.
4. Select an installed model and type a question. A new project does not need evidence attachments before you can talk to it.

The starter is [`qwen3:4b-instruct`](https://ollama.com/library/qwen3:4b-instruct). `mpc-daybreak-local` is the existing MPC name for a local model configuration based on that starter. Creating it sets instructions and model parameters; it does not train new weights or establish access to the cloud Daybreak program. Other observed installed local models can be selected. The machine's hardware determines which models run comfortably.

On macOS/Linux, run `node scripts/start-mpc-local-chat.mjs` from the extracted folder. The `.sh` launcher is also supplied; invoke it with `sh OPEN-MPC-LOCAL-CHAT.sh` if the archive did not preserve an executable bit.

## Talk and transfer work

- **Paste text** or Ctrl+V brings a question, notes, or output from ChatGPT/Codex into the composer. **Copy message** copies the current draft; **Copy answer** copies a reply back into another app.
- **Attach text files** accepts supported text/code files through a chooser, paste, or drop. Filenames remain visible and each file can be removed. This view supports eight files, 32,000 UTF-8 bytes each, 64,000 combined, and a 64,000-byte message. Oversized input is reported without silent shortening.
- **Export JSON** includes the project profile, conversation, message states and attached text for a portable copy. **Export text** gives a readable transcript and attachment names. These are user-requested downloads.
- **Assistant instructions** lets you customize behavior per project. Changes affect subsequent replies.
- **Stop reply** cancels the request. A failed, stopped, incomplete, or disconnected reply preserves its draft and any received partial answer. A completed reply clears the draft.
- **Save chats on this computer** is an explicit project choice. When off, chat and drafts are retained only in the running host's memory. When on, sent messages, their attached text and the text draft survive a restart. Unsent selected files are held in the current browser session; attach them again after closing it. Project names, instructions and model preferences are configuration and are saved separately from chat retention.

This view offers a bounded set of complete prior exchanges to the selected model and identifies omitted/interrupted exchanges. Its byte budget is not an exact tokenizer measurement; the model's configured context window can fit less. Use targeted source excerpts for a question that needs close comparison. The full attached-folder search and source-bound MPC analysis path is specified in the integration contract.

## Local service behavior

The UI service binds only to a generated `127.0.0.1` port. The model adapter calls only `http://127.0.0.1:11434`; it does not silently change to a cloud model. **Start Ollama** starts only the installed executable with loopback binding and cloud disabled for that newly started process. It leaves an already running daemon in place. Known cloud/remote models are excluded from this chat selector.

The default Windows database is `%LOCALAPPDATA%\MPCWorkspace\mpc-local-chat.sqlite`. macOS uses `~/Library/Application Support/MPCWorkspace`; Linux uses `$XDG_DATA_HOME/MPCWorkspace` or `~/.local/share/MPCWorkspace`. This chat database has its own identity and is separate from the legacy Workbench database and the proposed command-center schema. A second launcher invocation reopens the verified existing host instead of creating a second writer.

Close the service with Ctrl+C in its launcher. Ordinary shutdown removes only its own instance marker. A recognized stale marker can be recovered on the next launch. An unrecognized marker or another live process is left intact and produces an actionable error.

Advanced launch:

```text
node scripts/start-mpc-local-chat.mjs --no-open --port 0 --data-dir PATH
```

## Exact implementation

| Component | File |
| --- | --- |
| Ollama status, model discovery, capability-aware thinking, chat/pull/create streams | `lib/ollama-local-chat.mjs` |
| Native bounded JSON parsing | `lib/bounded-json.mjs`, copied unchanged from the recorded PR #15 source |
| Project configuration, retention and immutable chat messages | `lib/local-chat-store.mjs` |
| Local HTTP host, context selection, cancellation and persistence | `lib/local-chat-server.mjs` |
| Chat, clipboard, files, setup and exports | `desktop/local-chat/` |
| Process lifecycle and single-instance launcher | `scripts/start-mpc-local-chat.mjs` |
| Remaining hosted/Windows/native-MCP calls and transfer integration | `docs/HOST-CONNECTOR-INTEGRATION.md` |

The original evidence-bound V17 `runMpcLocalModel` is a separate native adapter. This update adds normal multi-turn conversation without replacing that evidence-control path. The full integration must render actual MPC tool receipts when it performs MPC computations; a local model answer alone is not an evaluator receipt.

## Validation scope

Run the added source tests with:

```text
node --test tests/ollama-local-chat.test.mjs tests/local-chat-store.test.mjs tests/local-chat-server.test.mjs tests/local-chat-launcher.test.mjs
```

The tests use temporary SQLite databases, real loopback HTTP servers with controlled Ollama responses, and actual Node launcher child processes. They do not download weights or prove inference quality. Read `docs/validation/MPC-LOCAL-CHAT-VALIDATION.json` for the final run. Native Windows execution, a rendered-browser visual review, real Ollama inference on the receiving computer, and the full assembled repository build remain separate observations.

Official API references: [Windows](https://docs.ollama.com/windows), [chat](https://docs.ollama.com/api/chat), [model listing](https://docs.ollama.com/api/tags), [model creation](https://docs.ollama.com/api/create), [local/cloud configuration](https://docs.ollama.com/faq).
