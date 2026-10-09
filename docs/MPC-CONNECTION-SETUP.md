# MPC Workspace connections

This build includes host adapters for selected GitHub, Google Drive, Dropbox, and Gmail reads, plus the bundled local MPC contract. Choose a provider, save its connection, select one object, and run **Read selected resource**. The resulting receipt identifies the observed account, object, native version, content scope, and read time. The connection remains configured until an actual operation succeeds.

These adapters are implemented in `lib/mpc-workspace-host-adapters.mjs`. The desktop host supplies provider-scoped credentials; the local workspace service binds the saved connection to the operation. Existing MPC evaluators, registries, source pointers, and checkpoint formats stay in their original modules.

## Exact addresses and protocols

| Provider | Endpoint field | Protocol used by this build | Select for the first useful read |
| --- | --- | --- | --- |
| Local Ollama | `http://127.0.0.1:11434` | Local loopback HTTP | Use **Local AI setup** to start/select a model and send a normal chat |
| Local MPC | `local-mpc://bundled` | In-process JavaScript call to the bundled original engine | Read the runtime and universal contract; no credential is needed |
| GitHub | `https://api.github.com` | Provider REST API over HTTPS | Repository `mjcustomcomputers-dotcom/Machine-Bug-Tool`, ref `HEAD` or a chosen commit, file `README.md` |
| Google Drive | `https://www.googleapis.com/drive/v3` | Provider REST API over HTTPS | One native Drive file ID |
| Dropbox | `https://api.dropboxapi.com/2` | Provider REST API over HTTPS; downloads use the fixed `https://content.dropboxapi.com/2/files/download` endpoint internally | `/folder/file.txt` or the native `id:...` |
| Gmail | `https://gmail.googleapis.com/gmail/v1` | Provider REST API over HTTPS | One Gmail **API message ID** |
| Existing hosted MPC | `https://mpc-machine-legal-tools.mjcustomcomputers.chatgpt.site/mcp` | Existing registered MCP connection in its supported host | Use the already installed MPC BugTools plugin in ChatGPT; protected standalone desktop authentication is still a separate integration |

In the saved workspace schema, the built-in REST and in-process adapters use the existing `PLUGIN` transport class. Their user-facing labels describe the actual REST HTTPS or in-process protocol. `streamable_http` is for MCP servers and is not the protocol of these provider REST adapters. A repository web URL belongs in the resource selection or source receipt; it is not the API endpoint.

The hosted MPC address comes from this repository's `DAYBREAK-START.txt` and `connector-bridge/source-pointers.v9.json`. Those are identity pointers, with their original provenance, rather than a claim that a new Windows installation is authenticated. Reuse the registered plugin for protected hosted calls. Never copy platform identity headers or ChatGPT browser credentials into a desktop adapter.

## Credential setup

Enter an access token only in the desktop's dedicated provider credential control. The host creates a reference such as `os-secret://mpc/<generated-id>`; the connection record stores that reference. The token is resolved in the host for the matching provider and is excluded from operation receipts. Use the desktop's available encrypted or session-only storage choice. An expired token needs replacement because this build does not register OAuth applications or implement token refresh.

Credentials already held by connected ChatGPT apps are not automatically available to the Windows application. Offline local MPC and a running local Ollama model do not require a remote provider credential.

For an existing connection, choose **Edit / replace token** to enter a replacement token while keeping the same connection record and its prior receipts. This is also the recovery path after restarting the app when the previous token was session-only. Leave the existing reference in place when changing only the display name or other supported configuration. The provider is fixed while editing an existing connection.

Under **Connections → Stored access tokens**, refresh to list this app's credential references and whether each is session-only or encrypted. Use **Forget selected token** to remove the local credential. Connections using that reference then need a replacement before their next protected read. Forgetting a locally stored token does not revoke the token at its provider. A failed configuration save removes a newly created orphan credential instead of leaving it behind.

| Provider | Credential to supply through the dedicated control | Permission needed by this implementation |
| --- | --- | --- |
| GitHub private repository | Your GitHub fine-grained personal access token, limited to selected repositories | Repository **Contents: read**; GitHub's normal identity/metadata access must also be available |
| GitHub public repository | Optional | Public reads can run without a token and are labeled `PUBLIC_ANONYMOUS` |
| Google Drive | A current OAuth access token from your authorized Google application | `https://www.googleapis.com/auth/drive.readonly` for chosen existing files; `drive.file` can work for files already explicitly granted to that application. `drive.metadata.readonly` supports metadata-only reads |
| Gmail | A current OAuth access token from your authorized Google application | `https://www.googleapis.com/auth/gmail.readonly` for message content, or `gmail.metadata` when selecting metadata only |
| Dropbox | A current access token for your own authorized Dropbox app/account | `account_info.read`, `files.metadata.read`, and `files.content.read` for the full selected-file read |
| Local MPC and local Ollama | None | Access to your own local installation |

GitHub documents the repository content endpoint and its read permission in [Get repository content](https://docs.github.com/en/rest/repos/contents). Google describes [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) and [Gmail message authorization](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get). Dropbox documents the separate [account](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/users/get-current-account), [metadata](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/get-metadata), and [content](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/download) operations.

Google access tokens are short-lived and their scopes and consent belong to the issuing application. A file ID by itself does not grant `drive.file` access. For repeatable consumer sign-in, a future desktop OAuth integration needs its own registered client, explicit consent, and secure refresh handling. This build deliberately exposes the working manually supplied access-token route with its actual lifetime rather than displaying an unfinished sign-in button.

## What each read returns

### GitHub

Select a repository, a branch/tag/commit, and one file. The adapter resolves the chosen ref to a complete commit SHA and fetches the file using that SHA. It checks the returned file path, type, size, and Git blob hash before returning text. The receipt keeps both the requested ref and resolved commit, so a later moving branch cannot silently rewrite the earlier observation.

Adapter fallback selection when fields are omitted (the desktop read dialog can prefill the current build's branch and guide):

```json
{
  "repository": "mjcustomcomputers-dotcom/Machine-Bug-Tool",
  "ref": "HEAD",
  "path": "README.md",
  "include_content": true
}
```

Use the commit from the specific build receipt when checking that build. `HEAD` observes the repository's current default branch. It does not choose the latest unmerged PR automatically.

### Google Drive

Use the native ID from a Drive or Docs link, such as the portion between `/d/` and the next slash. Select content or metadata. The adapter reads metadata before and after a content request and refuses a changed native version. It checks native checksums for stored text files when supplied.

```json
{"file_id":"YOUR_NATIVE_FILE_ID","include_content":true}
```

Google Docs and Slides export as text. Google Sheets exports CSV for the **first sheet only**, and that limitation is recorded in `content_scope`. Stored text files use the media endpoint. PDF, Office binaries, drawings, and unsupported native types return explicit metadata status; use the existing downloaded-file import for their content. These export choices follow Google's [export format table](https://developers.google.com/workspace/drive/api/guides/ref-export-formats) and [files.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get) contract.

Drive shortcuts are not automatically followed to a different object. Select the destination's actual native ID when that is the intended source. A Dash search result pointing to a Drive file resolves to that same native Drive object; it does not become a second independent record.

### Dropbox

Select `/folder/file.txt` or `id:...`. The adapter obtains the native file ID and revision, then downloads that exact `rev:` and checks the returned ID, revision, size, and Dropbox content hash. The receipt keeps a separate SHA-256 for the acquired bytes because Dropbox's block-based content hash has a different definition. See [file identities and revisions](https://docs.dropboxapi.com/dropbox-api/docs/file-access) and the [Dropbox content hash algorithm](https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/content-hash).

```json
{"path":"/MPC/selected-record.txt","include_content":true}
```

This adapter uses the token's normal user namespace. It does not select a team administrator, silently switch team members, search all folders, or export cloud-only Dropbox documents. Use a selected native file in the authorized user's accessible namespace.

### Gmail

Supply the native Gmail API message ID, available in API or connector output. The RFC `Message-ID` email header, Gmail thread ID, and browser address fragment may be different identifiers. The adapter reads one message with `users/me/messages/{id}`, keeping the API message ID and history version.

```json
{"message_id":"YOUR_GMAIL_API_MESSAGE_ID","include_content":true}
```

Inline plain-text body parts are preferred. HTML-only bodies are returned as inert text, with that scope explicitly labeled. Attachments are excluded and never fetched automatically. There are no send, label, trash, draft, or mailbox-wide search operations in this adapter. The API identifier and `me` semantics are documented in [users.messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get).

### Local MPC

Choose the bundled local endpoint and read the contract. This calls the original `runtime_status` and `get_universal_contract` implementations in process. The original result is preserved, including legacy runtime labels, while the wrapper clearly identifies `BUNDLED_LOCAL_MPC` and `IN_PROCESS_LOCAL`. It proves that this packaged engine responded. Hosted account authentication, live source acquisition, and model inference are distinct observations.

## Privacy, bounded work, and errors

Each read is selected by the user. The adapter does not accept arbitrary URLs, custom request headers, shell commands, remote instructions, upload bodies, or source-derived tool calls. Redirects are refused and API destinations are fixed. No screenshot or OCR data is uploaded by these connectors.

The content limit is **96,000 bytes** per selected read; streamed API responses are capped at **1,000,000 bytes**. Each HTTPS request has a 15-second timeout, and no automatic retries are made. Provider identity is cached in process for at most 60 seconds with a bounded 32-entry map keyed by provider and credential fingerprint. Source content is reacquired on each requested read. A cache hit is not a source freshness claim.

The connection operation records status/context and a receipt hash locally. Its returned raw text is session data; it is not automatically written into project evidence, scripts, or logs. An explicit acquisition uses the project's existing retention rules. A SHA-256 checks content parity and is not a legal authenticity finding.

| Observed result | Next step |
| --- | --- |
| `CREDENTIAL_REQUIRED` or `CREDENTIAL_UNAVAILABLE` | Add or replace the selected provider credential in the desktop control |
| HTTP 401 | Replace an expired/invalid token |
| HTTP 403 | Check the chosen account, object permission, and read scopes |
| HTTP 404 | Check the native ID/path and whether that account can see it |
| HTTP 409 | Re-read a changed Drive object, or inspect the Dropbox revision/namespace named by the error |
| HTTP 429 | Wait before a manual retry |
| `CONTENT_LIMIT` or `RESPONSE_LIMIT` | Use the existing downloaded-file import for the larger object |
| `ACCOUNT_CHANGED`, version mismatch, or digest mismatch | Keep the prior receipt; retry the intended object with the current account/version |

An actual failed account lookup is recorded as a failed operation, and a result with a mismatched host/account context cannot be labeled verified merely because it contains a receipt ID.

## Remaining connections

Dropbox Dash, arbitrary remote MCP endpoints, hosted MPC standalone sign-in, and OpenAI model API inference are separate adapters. Their configured addresses do not create a working authenticated channel. Use the existing connected ChatGPT apps for their supported operations. Local OCR, local MPC evaluation, and local model reasoning can operate without OpenAI API credits once their local dependencies are installed.

## Screen observations and local reasoning

**Use in chat** places the selected observation into evidence and keeps its project, screen source, capture time, frame digest, and source text together. **Send** makes the normal Auto path choose evidence analysis. Plain chat without attached evidence remains ordinary conversation. Neither action lets displayed instructions, a classifier hypothesis, or model output authorize a native operation.

Screen OCR and the finite screen classifier run locally without a language model. For a deeper answer inside the desktop, select an installed Ollama model. The evidence adapter checks the selected model's metadata with the same strict client used by local chat before sending source text to inference; known remote/cloud aliases are rejected even when their entry point is loopback. Responses must identify the selected model, and returned tool calls are rejected. A model answer remains an interpretation, with source quotations checked against the exact included source ranges.

The evidence prompt asks for a direct answer and a useful next step. A follow-up question is optional and reserved for an essential missing fact. The model uses its own default thinking setting; the application no longer forces thinking off. Where the host explicitly requests a setting, it must match the values advertised by that model. Models without advertised thinking controls still work with their default behavior. Ollama documents these distinctions in [Thinking](https://docs.ollama.com/capabilities/thinking) and the [chat API](https://docs.ollama.com/api/chat). The desktop's legacy assistant revision/effort form is explicitly disabled as unavailable; it does not override these working model-default controls.

Model context is bounded. The evidence adapter uses an 8,192-token context by default, capped by a smaller model-advertised maximum, and reserves output and template capacity. Because it does not have the model's tokenizer, it measures the actual serialized prompt in UTF-8 bytes using a conservative budget; it does not report a guessed token count as measured. Up to six source representations share that budget. A compact identity prefix and ranges matched to the user's question can bring relevant content beyond the old 2,400-character cutoff into the answer. Every included range, omitted source, and partial source is reported in `source_coverage`. Complete original screen text and its detailed local receipt remain available for copying; an excerpted model answer is not a claim that the model read the entire screen packet. The native request also asks Ollama to reject context overflow rather than silently dropping prompt material; [Ollama's request definition](https://github.com/ollama/ollama/blob/main/api/types.go) describes these controls.

For GPT reasoning without a separate API call, use **Copy for ChatGPT / Codex** and paste the screen packet into your existing authorized conversation. That is an explicit copy-and-paste handoff. It does not turn a ChatGPT subscription or grant application into desktop OpenAI API credits, and it does not transmit screenshots or source text automatically. No grant update or email is sent by these adapters.

## Validation scope

`tests/mpc-workspace-host-adapters.test.mjs` exercises bounded mock HTTPS responses and the actual bundled local MPC contract. Tests cover changed source versions, wrong native IDs and digests, account replacement, response limits, credential/error redaction, inert source content, and service receipt binding. Successful test fixtures establish implementation behavior; the first real read on the user's Windows computer establishes that account's current provider access.
