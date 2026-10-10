# Platform choices and current documentation

Checked 2026-10-09. These are source-grounded configuration recommendations. Account access and actual Windows model performance have not been tested by this pack.

| Need | Recommended route | Why it fits |
| --- | --- | --- |
| Customizable assistant in this ChatGPT environment | Extend the existing MPC/Security Assistant plugin with reusable instructions and reference files | Matches the user's installed workflow and keeps the native tool identity. |
| Everyday local GUI and private/offline work | Existing Node/Workbench core, Electron desktop shell, separate SQLite store, existing Ollama adapter | Reuses working code; same core can run across platforms. |
| Daybreak Blue from the local application | Explicit OpenAI Responses profile using `gpt-6-sol` and `access_programs.cyber=daybreak_blue` | Documented Blue-compatible request, conditional on the actual API project. |
| Deep reasoning and repeated development | Available GPT-6 Astra / GPT-6.1 Sol in the appropriate surface | Choose by measured task quality/latency/cost. Their reduced-refusal API mode needs separately documented Red entitlement. |
| Local starter model | Keep `qwen3:4b-instruct` and the existing `mpc-daybreak-local` configuration | Authentic Ollama tag; small existing adapter already targets it. |
| Larger local candidate | Evaluate `gpt-oss:20b` only after hardware measurement | A candidate for testing, not a promise of frontier-model equivalence. |
| Use eligible ChatGPT-plan inference locally | Optional registered-client Continue with ChatGPT adapter | Requires supported client/account setup; does not import ChatGPT's hosted connectors. |
| Reach owned private/local MPC from supported OpenAI surfaces | Optional Secure MCP Tunnel | Uses an outbound connection instead of public exposure of the Windows service. |

The deprecated `gpt-daybreak-blue-latest` alias should not be the new build default. A profile name does not establish entitlement; record the model/program actually returned. Missing access and provider errors stay visible. Selecting another provider is a user-controlled task choice, not an automatic retry after a refusal.

Plugin migration is documented, but the reviewed guide is Enterprise-oriented and does not establish a universal retirement date for every account. The build does not depend on an unsupported deadline claim. Assistant instructions, model inference, the local program and its connections remain separate components.

## Primary references

- Daybreak request contract: https://developers.openai.com/api/docs/guides/daybreak
- Alias status: https://developers.openai.com/api/docs/models/gpt-daybreak-blue-latest
- Access/surface scope: https://developers.openai.com/api/docs/guides/safety-checks/cybersecurity
- Model guidance: https://developers.openai.com/api/docs/guides/latest-model
- Plugin migration: https://learn.chatgpt.com/docs/migrate-custom-gpts
- Sign-in routes and eligibility: https://developers.openai.com/siwc/quickstart
- Sign-in preview limitations: https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- Private MCP transport: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- Custom MCP setup: https://developers.openai.com/api/docs/guides/custom-mcp-server
- Rich local client integration: https://learn.chatgpt.com/docs/app-server
- Exact local-model tag: https://ollama.com/library/qwen3:4b-instruct
- Ollama Windows support: https://docs.ollama.com/windows
- Current Ollama API compatibility: https://docs.ollama.com/api/openai-compatibility
- OpenAI local-weight hardware guidance: https://developers.openai.com/cookbook/articles/gpt-oss/run-locally-ollama
- Electron renderer/process boundaries: https://www.electronjs.org/docs/latest/tutorial/security

The older local-weight recipe's protocol-support statement predates current Ollama documentation. Use current Ollama capabilities when implementing the adapter. Do not infer practical memory use from a download size or a model's advertised maximum context.
