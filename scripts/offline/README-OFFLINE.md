# MPC Research Workbench — Windows Bundle

MPC Research Workbench is a local-first input and research-hook analysis
surface. It includes the versioned Method Atlas, deterministic comparison
data, formula-safe CSV exports, a derived read-only Atlas SQLite database,
checksums, and two deliberately separate launch modes.

## Fast path: offline browser mode

Double-click either file at the extracted bundle root:

```text
OPEN-MPC-RESEARCH-WORKBENCH.cmd
MPC-Research-Workbench.html
```

This path does not invoke PowerShell, require Node.js, start a server, or make
a network request. The `.cmd` file simply opens the HTML file in the default
browser, so PowerShell execution policy does not apply. The browser app has a
persistent input area and search field, accepts pasted text and local TXT,
JSON, or CSV files, discovers source-bound research hooks, explores sources,
and compares exact registered method metadata.

The GUI's GitHub, Gmail, Drive, Dropbox, MPC, and model cards are a connection
truth board. A card is not proof of authentication. Offline mode never asks
for credentials and every output request remains queued and not sent.

## Optional local SQLite mode

With Node.js 22.13+ installed, double-click:

```text
START-MPC-RESEARCH-WORKBENCH-WITH-SQL.cmd
```

This starts a foreground server bound only to `127.0.0.1`, opens the same GUI,
and creates a separate writable workspace database under the current Windows
user's Local AppData directory. Closing its console ends the server. The host
can record run metadata and explicit unsent output requests; it contains no
provider dispatcher, OAuth flow, arbitrary proxy, or automatic cloud write.

Raw input, the query, and full client-result content are not stored by default;
the host keeps bounded profiles and digests instead. Explicit retention enables
all three together. Secrets and credential-shaped fields are rejected. The
writable workspace database is not `method-atlas.sqlite`, does
not alter a canonical controller or registry, and must not be committed to
Git. Real connected actions require a separately approved provider adapter and
an actual protected-call receipt. A custom GPT likewise requires a hosted
HTTPS action or reviewed host-side adapter; no API key belongs in this bundle.

## Verify, inspect, and refresh

The prebuilt HTML, JSON, CSV, Markdown, and SQLite files need no runtime. The
included PowerShell interface is optional:

```powershell
.\Run-MPC-Research-Workbench.ps1 -VerifyOnly
.\Run-MPC-Research-Workbench.ps1
.\Run-MPC-Research-Workbench.ps1 -MethodId MHA-0195
.\Run-MPC-Research-Workbench.ps1 -MethodId MHA-0119 -RelatedMethodId MHA-0138
.\Run-MPC-Research-Workbench.ps1 -OpenGui
```

To copy the verified bundle to the current user's actual Desktop directory and
create a direct browser launcher, run:

```powershell
powershell.exe -NoProfile -File .\Install-MPC-Research-Workbench.ps1
```

The installer resolves redirected or OneDrive Desktops and refuses to
overwrite an existing destination or launcher. It does not create an unsigned
Desktop `.ps1`, hard-code a Windows user name, or change execution policy. If
local policy blocks the installer, extract the bundle where desired and use
the root `.cmd` or HTML file directly.

Refreshing the internal static Atlas audit requires a Node release with
flag-free `node:sqlite` (22.13+, 23.4+, or 24+):

```powershell
.\Run-MPC-Research-Workbench.ps1 -Refresh
```

The equivalent direct Node command is:

```powershell
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffffZ')
node .\scripts\portable-method-self-scan.mjs `
  --database .\method-atlas.sqlite `
  --capsules .\implemented-capsules.json `
  --manifest .\manifest.json `
  --output-dir ".\runs\$stamp" `
  --prior-scan .\scan.json
```

Every refresh creates a new result directory and never overwrites the prebuilt
scan or database. An unchanged source fingerprint returns
`STOP_NO_MATERIAL_INFORMATION_GAIN`.

## Optional Sysinternals receipt

If the signed Microsoft x64 Sysinternals tools are already installed, the
PowerShell interface can write a separate diagnostic receipt for
`sigcheck64.exe`, `junction64.exe`, and `handle64.exe`:

```powershell
.\Run-MPC-Research-Workbench.ps1 -SysinternalsRoot 'C:\Tools\Sysinternals'
```

The command validates Microsoft Authenticode signatures. It does not download
tools, accept licenses, alter the analysis result, authenticate sources, or
contact a target. Review Microsoft's license before first use. ARM64 filenames
remain a platform-specific extension.

`scan.json` is the lossless static-audit result. `method-atlas.sqlite` is a
derived cache of checked-in Atlas data and must not be treated as an
authenticated source, canonical research record, or method-execution receipt.
Static overlaps and rankings are review signals, not proof of equivalence,
independence, corroboration, or professional completeness.

Verify the separately published ZIP SHA-256 before extraction. The PowerShell
files are not Authenticode-signed; organizational policy remains controlling.
