# MPC Method Self Scan — Windows Offline Bundle

The bundle is a static, local Method Atlas product. It includes the complete
pair scan, formula-safe CSV projections, a queryable derived SQLite database,
source capsules, checksums, a self-contained browser GUI, and a PowerShell interface. The built-in scan and
refresh paths contain no network or connector calls. The export capability
schema has no credential or raw-response fields; supplied values must still be
sanitized before export. Optional external
Sysinternals diagnostics retain their own separate receipt and network boundary.

For the targeted-query screen, double-click either file; neither route invokes
PowerShell, needs Node.js, starts a server, or makes a network request:

```text
MPC-Method-Self-Scan.cmd
MPC-Method-Lab.html
```

The GUI searches method IDs, names, mechanisms, required evidence, source
metadata and taxonomy; filters by family and dimension; and performs exact
two-method comparisons across every one of the 28,680 registered matrix rows.
It can copy or export a selected method/pair as JSON. Static overlap remains a
review signal—not proof of independence, equivalence or corroboration.

From PowerShell, verify and inspect the extracted bundle or open the GUI:

```powershell
.\Run-Method-Self-Scan.ps1 -VerifyOnly
.\Run-Method-Self-Scan.ps1
.\Run-Method-Self-Scan.ps1 -MethodId MHA-0195
.\Run-Method-Self-Scan.ps1 -MethodId MHA-0119 -RelatedMethodId MHA-0138
.\Run-Method-Self-Scan.ps1 -OpenGui
```

To install a copy under the current user's Desktop and create a Desktop
launcher, run:

```powershell
powershell.exe -NoProfile -File .\Install-Method-Self-Scan.ps1
```

The installer refuses to overwrite an existing directory or launcher. It
creates both an optional PowerShell command-line launcher and a double-clickable
`.cmd` GUI launcher on the Desktop, while copying only manifest-listed bundle
files. The `.cmd` opens the HTML app in the default browser and therefore is not
subject to PowerShell execution policy.

The prebuilt JSON, CSV, Markdown, and SQLite files need no runtime. Refreshing
the static scan requires a Node release with flag-free `node:sqlite` (22.13+,
23.4+, or 24+) because it uses the built-in read-only SQLite API:

```powershell
.\Run-Method-Self-Scan.ps1 -Refresh
```

The equivalent direct Node command, useful when local policy blocks unsigned
PowerShell scripts, is:

```powershell
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffffZ')
node .\scripts\portable-method-self-scan.mjs `
  --database .\method-atlas.sqlite `
  --capsules .\implemented-capsules.json `
  --manifest .\manifest.json `
  --output-dir ".\runs\$stamp" `
  --prior-scan .\scan.json
```

Every refresh creates a new directory under `runs`, verifies that directory,
and uses it for the command's status/query/report output. It never overwrites
the prebuilt scan or database. A matching fingerprint returns
`STOP_NO_MATERIAL_INFORMATION_GAIN`.

If the signed Microsoft x64 Sysinternals tools are already installed, an
optional Windows-only receipt can inventory `sigcheck64.exe`, `junction64.exe`, and `handle64.exe`,
then record their bounded diagnostics against PowerShell, the database, and
the bundle directory:

```powershell
.\Run-Method-Self-Scan.ps1 -SysinternalsRoot 'C:\Tools\Sysinternals'
```

This option requires valid Microsoft Authenticode signatures. It does not
download Sysinternals, auto-accept its license, or change the scan status.
Sigcheck certificate-revocation lookup is disabled for this offline mode; any
other external-tool network activity remains unmeasured. Tool output and exit
codes go to a separate new receipt under `runs`. Review Microsoft's license
before the first local execution. ARM64 tools are a remaining platform-specific
extension; this bundle expects the x64 filenames above.

`scan.json` is the lossless result. CSV files are spreadsheet-safe convenience
views. `method-atlas.sqlite` contains the admitted Atlas plus queryable
`offline_scan_*` metadata, method, implemented-capsule, and pair tables. It is
a derived cache and must not be treated as a canonical research record,
authenticated source, or method execution receipt.

Verify the separately published ZIP SHA-256 before extraction. These scripts
are not Authenticode-signed. Local execution policy remains controlling; this
package does not change it. If policy blocks `.ps1` files, use the documented
Node command from a verified extracted bundle or have an administrator apply
the organization's normal signing/unblocking process.
