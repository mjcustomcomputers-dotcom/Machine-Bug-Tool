# MPC Research Workbench

MPC Research Workbench is a local-first analysis surface for the existing
Method Atlas and MPC source. It accepts user-supplied text or data, performs
deterministic local discovery and comparison, and makes connection state and
output intent visible without pretending that a browser page is an authenticated
connector.

The Workbench is additive. It does not replace or promote the canonical MPC
registries, completed controllers, native source records, or private Sites
project.

## Operating modes

| Mode | What it does | What it does not do |
| --- | --- | --- |
| Static offline | Opens the self-contained HTML, accepts pasted text and local TXT, JSON, or CSV files, and runs deterministic method/source queries and comparisons in the browser | It does not make network calls, authenticate providers, persist to SQLite, or send queued outputs |
| Local hosted | Runs an optional Node host on loopback and stores run and queue records in a separate local SQLite database | It does not become a remote service, perform browser OAuth, or dispatch to external providers by itself |
| Connected provider | Uses a separately approved host integration and its actual protected-call receipts | It is not enabled by a saved connector name, prior-session receipt, or browser-side token |

Static analysis remains useful without an internet connection. Results are
method matches and review aids, not proof that a method executed, a source was
authenticated, or independent evidence was established. The 239 research
candidates remain separate from the 24 implemented bounded evaluators.

## Inputs and deterministic analysis

The Workbench accepts pasted text and local `.txt`, `.json`, and `.csv` files.
Files are read only after the user selects them. Query parsing, facets, source
lookup, hook discovery, and exact comparison use the bundled, versioned data;
the same input and bundle should produce the same local result.

Malformed structured data is reported rather than silently repaired. Method,
source, relation, and taxonomy overlap are review signals only. They do not
establish equivalence, execution, causation, source authenticity, or permission
to contact a target.

## Local host and database

The optional host binds to `127.0.0.1` and serves only the Workbench's fixed
local interface. Its SQLite database is a new, noncanonical workspace store for
run metadata, input hashes, bounded local results, output requests, and receipt
references. It is not the Method Atlas database, a controller checkpoint, or a
mirror of Drive, Dropbox, GitHub, or Sites.

Raw input, the query, and the full client-supplied result are not retained by
default. They may be stored only when the user explicitly selects that option.
Otherwise, the local record contains bounded profiles and digests needed to
identify the input, query, and supplied result, plus the selected method IDs.
An output request is
created as **queued and not sent**; recording it does not establish that a host
action, connector call, upload, email, or Git operation occurred.

The host has no general-purpose proxy, arbitrary filesystem endpoint, or
automatic external networking. A future provider adapter must use a fixed,
reviewed server-side contract and return an actual protected-call receipt before
the Workbench may describe an action as sent or completed.

## Connections and status

The Connections view keeps these states distinct:

- **Current verified** means this running session completed the provider's
  protected check and retained its receipt.
- **Prior evidence** means a preserved receipt proves a call in another session
  or environment; it does not prove current access.
- **Unavailable** means the needed tool or adapter is not exposed here. It does
  not by itself prove an authentication or service failure.
- **Provider setup required** means the Workbench knows the intended destination
  but no approved host integration is configured.

Gmail, Google Drive, GitHub, Dropbox, Dropbox Dash, MPC, or another named service
must remain in one of those truthful states until its current protected call is
observed. The static page never performs OAuth and never asks for, embeds, or
stores access tokens. Credentials belong in an approved host credential store,
not in HTML, JavaScript, SQLite, exported reports, or Git history.

GitHub is the versioned source-code and review surface. It may hold code,
schemas, tests, and nonconfidential build artifacts. It is not the default
repository for confidential evidence, pasted case material, connector tokens,
or the local run database. A Git commit also does not synchronize or deploy the
native Sites project.

## GPT and other AI providers

A custom GPT or other model provider requires either a separately hosted HTTPS
action with appropriate authentication and scopes, or an approved host-side
provider adapter. It cannot be safely embedded in the portable HTML file. The
adapter must keep credentials server-side, bind each request to an explicit
user action, minimize transmitted data, and return provider identity and receipt
details. Until that path is configured and verified, the Workbench can prepare
and queue a request but must label it unsent.

A local model may use the same reviewed host boundary. Running on the same
computer does not exempt it from explicit input selection, retention controls,
or receipt and result labeling.

## Windows launch paths

- Double-click `OPEN-MPC-RESEARCH-WORKBENCH.cmd` for the static offline mode.
  This path opens the HTML directly and does not depend on PowerShell execution
  policy or a Node installation.
- Double-click `START-MPC-RESEARCH-WORKBENCH-WITH-SQL.cmd` when the optional
  loopback host is included and a compatible Node runtime is installed. The
  console window is the host process; closing it ends local hosted access.

Neither launcher installs software, changes execution policy, deploys Sites, or
configures a cloud connector. Start only one local host for the selected bundle,
and use the address printed by that host rather than exposing it on a LAN.

## Privacy and retention

Treat pasted and imported material as potentially sensitive. Prefer the static
mode for one-time analysis and leave raw-input retention off unless later review
requires it. The local SQLite file, exported reports, and copied bundles are
ordinary files under the Windows user's control: protect, back up, retain, and
delete them according to the source owner's rules. Removing a queue row or local
database cannot retract a message that an independently authorized provider has
already accepted.

Before sharing an export, inspect it for raw input, filenames, paths, source
identifiers, and receipt metadata. Never put secrets or confidential evidence
in Git merely to move it between machines.

## Preserved boundaries

Workbench runs and queue records are local derived artifacts. They do not write
or reconcile the completed V13 controller, change MAXVAR/NESTMAX/BL/MBSS/EXT or
Method Atlas registries, promote research candidates, modify native Drive or
Dropbox records, alter `.openai/hosting.json`, or deploy the private Site. Any
future connected write, canonical promotion, merge, or deployment remains a
separate, explicitly authorized action with native readback.
