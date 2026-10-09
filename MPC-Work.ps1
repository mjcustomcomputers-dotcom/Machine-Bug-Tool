[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$InputPath,
    [string]$OutputPath,
    [string]$OutputRoot,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$mpcNode = Get-Command node.exe, node -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($null -eq $mpcNode) { throw 'MPC Work requires an installed Node.js 22.13 or newer.' }
$mpcRunner = Join-Path $PSScriptRoot 'scripts/run-mpc-work.mjs'
$mpcArguments = @($mpcRunner)
if ($InputPath) { $mpcArguments += @('--input', $InputPath) }
if ($OutputPath) { $mpcArguments += @('--output', $OutputPath) }
if ($OutputRoot) { $mpcArguments += @('--output-root', $OutputRoot) }
if ($Json) { $mpcArguments += '--json' }
& $mpcNode.Source @mpcArguments
exit $LASTEXITCODE
