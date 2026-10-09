# Receive the existing MPC V13 state on a local computer

This workflow receives the existing completed V13 development controller. Git
provides exact source objects; Node copies the saved state bytes into a new
isolated checkout and runs `verify`, `status`, and `next`. It needs Git and a
manifest-compatible Node installation. It does not need `node_modules`, pnpm,
Python, a new Cloud environment, or a new controller.

The receiver does not fetch, configure authentication, call hosted MPC, or
provide Drive/Dash/Dropbox access. The local Git connection must already be
able to read this repository. Local calculation and each hosted connection
remain separate capabilities.

## Three source identities

| Name | Source | Meaning |
|---|---|---|
| `R` | Actual fetched development branch head | Current reporting documents and saved-state references |
| `I` | `tested_commit` in `docs/validation/MPC-V13-LOCAL-INTEGRATION-VALIDATION.json` at `R` | Tested receiver, file-input, path-boundary, and notebook-runner source |
| `S` | Historical validation and saved controller, both read at `R` | Existing controller's executable source, currently `4ffde83e587db829b9cd2124c0a8587e868402d6` |

Use the new integration validation record's `validation.status`, `tested_tree`,
and `remaining_gates.windows_native_run` / `actual_codex_cloud_run` to distinguish
completed source validation from host-specific work that remains. A Linux test
or a caller-supplied PowerShell label is not a Windows execution receipt.

The receiver runs from `I`, reads the metadata at `R`, and creates its new
controller checkout at `S`. It does not change the historical
`docs/validation/MPC-V13-VALIDATION.json`, saved controller, or original
checkpoint. Do not change their source commit to `I` to make an old state pass
the current-source guard.

## 1. Choose the local repository

Use PowerShell 5.1 or later. These examples use the existing GitHub repository
and create unused sibling worktrees. Each native Git/Node result is checked
explicitly; `$ErrorActionPreference` alone does not establish native command
success.

If the repository is already on this computer, set its exact root and continue
to section 2:

```powershell
$MpcRepository = 'C:\your-existing-path\Machine-Bug-Tool'
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $MpcRepository -PathType Container)) {
    throw 'Set MpcRepository to the existing repository root.'
}
```

For a first local clone, use a new directory. This is a full-history clone;
do not add `--depth`, since the saved controller needs the older `S` object.
The line-ending options apply only to this command and preserve exact source
bytes without changing global Git settings.

```powershell
$ErrorActionPreference = 'Stop'
$MpcParent = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'MPC'
$MpcRepository = Join-Path $MpcParent 'Machine-Bug-Tool'
if (Test-Path -LiteralPath $MpcRepository) {
    throw 'That destination already exists. Use the existing-repository instructions.'
}
if (-not (Test-Path -LiteralPath $MpcParent)) {
    New-Item -ItemType Directory -Path $MpcParent | Out-Null
}
& git -c core.autocrlf=false -c core.eol=lf clone --branch feature/noahs-ark-reasoning-osi-v13 'https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool.git' $MpcRepository
if ($LASTEXITCODE -ne 0) { throw 'Git clone failed; retain its actual error.' }
```

The receiver does not repair a denied Git connection or a missing Node
installation. Preserve the actual error as that local prerequisite; do not
copy credentials into the repository.

## 2. Read current reporting metadata and create the integration worktree

The commands below fetch without checking out or replacing the existing
working tree. Local changes stay where they are. Small navigation JSON is read
as text here; the receiver itself handles all saved-state byte copying.

```powershell
$null = Get-Command git -CommandType Application -ErrorAction Stop
$null = Get-Command node -CommandType Application -ErrorAction Stop

function Invoke-MpcGit {
    param([Parameter(Mandatory = $true)][string[]] $Arguments)
    $result = & git -C $MpcRepository @Arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) { throw ('Git failed with exit code ' + $exitCode) }
    return $result
}

$MpcOriginalHead = (Invoke-MpcGit -Arguments @('rev-parse', 'HEAD')).Trim()
$MpcOriginalStatus = Invoke-MpcGit -Arguments @('status', '--porcelain=v1', '--untracked-files=all')
Invoke-MpcGit -Arguments @('fetch', '--no-tags', 'origin', 'refs/heads/feature/noahs-ark-reasoning-osi-v13:refs/remotes/origin/feature/noahs-ark-reasoning-osi-v13')
$R = (Invoke-MpcGit -Arguments @('rev-parse', 'refs/remotes/origin/feature/noahs-ark-reasoning-osi-v13')).Trim()

$MpcValidationText = Invoke-MpcGit -Arguments @('show', ($R + ':docs/validation/MPC-V13-LOCAL-INTEGRATION-VALIDATION.json'))
$MpcValidation = ($MpcValidationText -join "`n") | ConvertFrom-Json
$I = [string] $MpcValidation.tested_commit
if ($I -notmatch '^[a-f0-9]{40}$' -or $MpcValidation.tested_tree -notmatch '^[a-f0-9]{40}$') {
    throw 'Integration validation must identify an exact commit and tree.'
}
if ($MpcValidation.validation.status -ne 'PASS') {
    throw 'The recorded integration validation is not PASS; inspect its unresolved results.'
}
$MpcActualIntegrationTree = (Invoke-MpcGit -Arguments @('rev-parse', ($I + '^{tree}'))).Trim()
if ($MpcActualIntegrationTree -ne $MpcValidation.tested_tree) {
    throw 'Integration commit/tree disagreement.'
}
$MpcValidation.remaining_gates | Format-List

$MpcParent = Split-Path -Parent $MpcRepository
$MpcSuffix = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$MpcIntegration = Join-Path $MpcParent ('Machine-Bug-Tool-integration-' + $I.Substring(0, 8) + '-' + $MpcSuffix)
if (Test-Path -LiteralPath $MpcIntegration) { throw 'Choose an unused integration worktree path.' }
Invoke-MpcGit -Arguments @('-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'worktree', 'add', '--detach', $MpcIntegration, $I)

& node --version
if ($LASTEXITCODE -ne 0) { throw 'Node version check failed.' }
Write-Output ('Reporting R: ' + $R)
Write-Output ('Integration I: ' + $I)
Write-Output ('Original checkout retained at: ' + $MpcOriginalHead)
```

Keep an occupied worktree, including a partial failed receive, available for
inspection. Select a new unused name for a deliberate new attempt; do not reset
or remove an existing directory to satisfy these examples.

## 3. Inspect, then receive once

The direct Node route works in PowerShell without changing script execution
policy. Arguments remain an array of native arguments; input strings are not
evaluated as commands.

```powershell
$MpcReceiver = Join-Path $MpcIntegration 'scripts\receive-mpc-v13.mjs'
& node $MpcReceiver inspect --repository $MpcRepository --reporting-commit $R
if ($LASTEXITCODE -ne 0) { throw 'Source inspection failed; no receive was performed.' }

$MpcReceived = Join-Path $MpcParent ('Machine-Bug-Tool-v13-received-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
if (Test-Path -LiteralPath $MpcReceived) { throw 'Receive requires an unused sibling directory.' }
& node $MpcReceiver receive --repository $MpcRepository --reporting-commit $R --destination $MpcReceived
if ($LASTEXITCODE -ne 0) { throw 'Receive failed; retain its receipt and existing files.' }

$MpcReceiptPath = Join-Path $MpcReceived '.sites-runtime\receive-v13\receipt.json'
$MpcReceipt = Get-Content -LiteralPath $MpcReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
$MpcReceipt | Select-Object status, reporting_commit, historical_controller_executable_commit, restored_state_path, next_controller_action
$MpcReceipt.host | Format-List
```

Expected successful status is `LOCAL_CONTROLLER_RECEIVE_PASS`. The recorded
child commands must show `verify`, `status`, and `next` with exit status zero;
the preserved state remains `COMPLETE`, with four completed model obligations,
six receipts, no next action, and no new model calls or controller events.

The state is copied byte-for-byte by Node from the Git blob. Do not restore it
through `Out-File`, a text editor, or `ConvertTo-Json`. Reading the final receipt
as JSON for display does not modify the saved state.

Receipt publication uses an exclusive hard link to publish an already flushed,
verified file. The destination filesystem must support that operation. If it
does not, the receiver reports the persistence failure and retains the local
worktree/state for inspection; it must not be reported as a saved PASS.

### Optional PowerShell wrapper

Use this route **instead of** the direct Node invocation when local policy
already permits the checked-out script. Do not run both routes into the same
destination.

```powershell
$MpcWrapper = Join-Path $MpcIntegration 'scripts\Receive-MpcV13.ps1'
& $MpcWrapper -Action inspect -Repository $MpcRepository -ReportingCommit $R
if ($LASTEXITCODE -ne 0) { throw 'Wrapper inspection failed.' }
$MpcWrapperDestination = Join-Path $MpcParent ('Machine-Bug-Tool-v13-wrapper-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
if (Test-Path -LiteralPath $MpcWrapperDestination) { throw 'Choose an unused wrapper destination.' }
& $MpcWrapper -Action receive -Repository $MpcRepository -ReportingCommit $R -Destination $MpcWrapperDestination
if ($LASTEXITCODE -ne 0) { throw 'Wrapper receive failed.' }
```

If policy blocks `.ps1` execution, use the direct Node route. No
`Set-ExecutionPolicy`, policy bypass, credential update, or browser is needed.
The wrapper reports its PowerShell version as a `CALLER_SUPPLIED_LABEL`.
`host.windows_execution` records whether Node actually ran on Windows; the
label itself does not independently attest a particular shell.

## 4. Supply Atlas JSON from PowerShell files

Use the integration checkout for the new Atlas file-input interface. The
receiver's historical `S` checkout remains the execution home of the old saved
controller; it is not where new integration features are installed.

Every JSON-taking Atlas command accepts `--input-file PATH` in place of inline
JSON: `query`, `detect`, `cascade`, `diagnose`, `classify`, `variation`,
`sql-audit`, `reverse-links`, `mirrors`, `dimension-audit`, and `reason`.
Inputs must be regular UTF-8 JSON files, with an optional UTF-8 BOM, at most
4 MiB. UTF-16, malformed JSON, non-object JSON, changed files, and extra
arguments are rejected. File/JSON preflight occurs before opening the Atlas
database; a later method-specific schema failure is a separate validation step.

This creates a new synthetic input and new derived cache without changing any
saved controller or old cache. Use it only when the local planning demo is
wanted; it is not required to receive the completed state.

```powershell
$MpcRunName = 'local-plan-' + [Guid]::NewGuid().ToString('N')
$MpcRuntime = Join-Path $MpcIntegration '.sites-runtime'
if (-not (Test-Path -LiteralPath $MpcRuntime)) {
    New-Item -ItemType Directory -Path $MpcRuntime | Out-Null
}
$MpcInput = Join-Path $MpcRuntime ($MpcRunName + '.json')
$MpcQuery = @{
    atom = @{
        subject_id = 'fixture:transaction'; atom_id = 'fixture:ledger'
        dimensions = @('MONEY', 'FINALITY')
        source_refs = @('fixture:owned-ledger'); external_source_refs = @()
    }
    method_receipts = @(@{
        method_id = 'MHA-0053'; input_state = 'AVAILABLE'
        negative_control_state = 'AVAILABLE'; falsifier_state = 'AVAILABLE'
        estimated_cost_units = 2
    })
    max_selected = 4; max_pairs = 4
}
$MpcUtf8 = New-Object System.Text.UTF8Encoding($false)
$MpcInputBytes = $MpcUtf8.GetBytes(($MpcQuery | ConvertTo-Json -Depth 12))
$MpcInputStream = [IO.File]::Open($MpcInput, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try { $MpcInputStream.Write($MpcInputBytes, 0, $MpcInputBytes.Length) }
finally { $MpcInputStream.Dispose() }

$MpcPreviousAtlasDb = $env:MPC_METHOD_ATLAS_DB
try {
    $env:MPC_METHOD_ATLAS_DB = Join-Path $MpcRuntime ($MpcRunName + '.sqlite')
    & node (Join-Path $MpcIntegration 'scripts\method-atlas-cli.mjs') reason --input-file $MpcInput
    if ($LASTEXITCODE -ne 0) { throw 'Atlas planning failed; retain the input and cache.' }
} finally {
    if ($null -eq $MpcPreviousAtlasDb) { Remove-Item Env:\MPC_METHOD_ATLAS_DB -ErrorAction SilentlyContinue }
    else { $env:MPC_METHOD_ATLAS_DB = $MpcPreviousAtlasDb }
}
```

The result is a source-bound synthetic reasoning plan. The 239 MHA candidates
remain distinct from the 24 implemented native MPC evaluators. No hosted model,
target test, source authentication, security finding, or payout is established
by this command.

## 5. Optional offline notebook

With Python 3.10+ already available, the portable runner requires no Jupyter
installation. It reserves a new output directory by default:

```powershell
& python (Join-Path $MpcIntegration 'scripts\run-v13-notebook.py')
if ($LASTEXITCODE -ne 0) { throw 'Notebook execution failed; inspect its partial receipt.' }
```

Use the installed `python3` or `py -3` command instead if that is how this local
Python installation is exposed. A chosen output directory must not already
exist:

```powershell
$MpcNotebookRuntime = Join-Path $MpcIntegration '.sites-runtime'
$MpcNotebookOutput = Join-Path $MpcNotebookRuntime ('notebook-' + [Guid]::NewGuid().ToString('N'))
& python (Join-Path $MpcIntegration 'scripts\run-v13-notebook.py') --output-dir $MpcNotebookOutput
if ($LASTEXITCODE -ne 0) { throw 'Notebook execution failed; retain its outputs.' }
```

Run one of these commands, not both merely to verify setup. The receipt labels
execution `SHARED_PYTHON_NAMESPACE_NOT_JUPYTER_KERNEL`, records all five cells,
and preserves the original three synthetic scenarios and source-derived cache.
It does not change the Drive workbook's four historical authored rows.

## Finish and retain the receipt

The successful receive ends at `COMPLETE` with `next_controller_action: null`.
Keep the received state and receipt at their reported local paths. The
receiver's connector/model fields remain `NOT_CHECKED_BY_LOCAL_RECEIVER`.

Further Cloud acceptance is described in
[the final integration run](CODEX-V13-FINAL-INTEGRATION-RUN.md). A destination
task must create a separate receipt with its actual host and command results;
it must preserve the existing integration validation record. This handoff ends
research at the current boundary and does not start a new hunt.
