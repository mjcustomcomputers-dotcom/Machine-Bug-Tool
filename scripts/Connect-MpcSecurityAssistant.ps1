[CmdletBinding()]
param(
    [string]$Workspace,
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')][string]$ServerName = 'mpc-security-assistant'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$AssistantRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($Workspace)) { $Workspace = $AssistantRoot }
$AssistantWorkspace = (Resolve-Path -LiteralPath $Workspace -ErrorAction Stop).ProviderPath
if (-not (Test-Path -LiteralPath $AssistantWorkspace -PathType Container)) { throw 'Workspace must be an existing directory.' }
$AssistantEntry = Join-Path $AssistantRoot 'scripts/start-mpc-security-assistant.mjs'
if (-not (Test-Path -LiteralPath $AssistantEntry -PathType Leaf)) { throw 'The assistant server entry point is missing.' }

$AssistantNode = @(Get-Command node -CommandType Application -All -ErrorAction SilentlyContinue | Where-Object { $_.Source -match '(?i)(node|node\.exe)$' } | Select-Object -First 1)
if ($AssistantNode.Count -eq 0) { throw 'Node.js >=22.13.0 must already be installed. No dependency installation is needed for this assistant.' }
$AssistantNodePath = $AssistantNode[0].Source
$AssistantVersion = (& $AssistantNodePath --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $AssistantVersion -notmatch '^v(\d+)\.(\d+)\.(\d+)$') { throw 'Could not read the installed Node.js version.' }
if ([int]$Matches[1] -lt 22 -or ([int]$Matches[1] -eq 22 -and [int]$Matches[2] -lt 13)) { throw 'Node.js >=22.13.0 is required.' }

# Execute the real local entry point first. This does not claim Codex startup,
# hosted MPC login, Daybreak selection, or native target access.
$AssistantCheck = & $AssistantNodePath $AssistantEntry --workspace $AssistantWorkspace --check
if ($LASTEXITCODE -ne 0) { throw 'The local assistant startup check failed. Preserve the error and repair before registration.' }
$AssistantCheck | Write-Output

$AssistantCodexCandidates = @(Get-Command codex -All -ErrorAction SilentlyContinue | Where-Object { $_.CommandType -eq 'Application' -or $_.CommandType -eq 'ExternalScript' })
if ($AssistantCodexCandidates.Count -eq 0) { throw 'Codex was not found. Open the existing Codex installation and add this Node STDIO command in MCP settings; see docs/MPC-SECURITY-ASSISTANT-GUIDE.md.' }
$AssistantCodex = $AssistantCodexCandidates | Sort-Object @{Expression={if ($_.Source -match '(?i)\.exe$') { 0 } elseif ($_.Source -match '(?i)\.ps1$') { 1 } else { 2 }}} | Select-Object -First 1
$AssistantCodexPath = $AssistantCodex.Source

# Native exe and PowerShell argument arrays preserve each path as one argument.
# A cmd shim crosses an additional shell parser; reject metacharacter paths.
if ($AssistantCodexPath -match '(?i)\.(cmd|bat)$') {
    foreach ($AssistantPathValue in @($AssistantCodexPath,$AssistantNodePath,$AssistantEntry,$AssistantWorkspace)) {
        if ($AssistantPathValue -match '[&|<>^%!"\r\n]') { throw 'This Codex cmd shim cannot safely register these paths. Use the Codex MCP settings UI with the exact Node command instead.' }
    }
}

$AssistantMcpHelp = (& $AssistantCodexPath mcp --help 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $AssistantMcpHelp -notmatch '\badd\b' -or $AssistantMcpHelp -notmatch '\blist\b') { throw 'The installed Codex version did not advertise the required mcp add/list commands.' }
$AssistantBefore = (& $AssistantCodexPath mcp list 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect existing MCP registrations; no changes made.' }
if ($AssistantBefore -match ('(?m)(^|\s)' + [regex]::Escape($ServerName) + '(\s|$)')) {
    Write-Output "MCP server '$ServerName' already exists. Open /mcp and inspect its command; this script preserved that registration."
    return
}

$AssistantArgs = @('mcp','add',$ServerName,'--',$AssistantNodePath,$AssistantEntry,'--workspace',$AssistantWorkspace)
& $AssistantCodexPath @AssistantArgs
if ($LASTEXITCODE -ne 0) { throw 'Codex MCP registration failed.' }
$AssistantAfter = (& $AssistantCodexPath mcp list 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $AssistantAfter -notmatch ('(?m)(^|\s)' + [regex]::Escape($ServerName) + '(\s|$)')) { throw 'Registration returned success, but MCP list readback did not confirm the server name.' }
Write-Output "Registered '$ServerName' for workspace '$AssistantWorkspace'."
Write-Output 'Restart or refresh Codex, open /mcp, and ask MPC Security Assistant to run assistant_status and the synthetic self-test.'
Write-Output 'Select Daybreak Blue in the approved host surface where available. This script does not change model, account, policy, or credentials.'
