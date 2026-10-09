# Additive local-only reasoner for the existing MPC checkout. No installs, native writes or target requests.
[CmdletBinding()]
param(
    [string] $InputFile = 'data/evidence-workflow-example.json',
    [string] $OutputFile = '',
    [string] $Model = 'qwen3:4b-instruct',
    [switch] $PlanOnly
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$node = Get-Command 'node' -CommandType Application -ErrorAction Stop
$version = (& $node.Source --version).Trim()
if ($version -notmatch '^v(\d+)\.(\d+)\.') { throw 'Unable to determine Node version.' }
if ([int]$Matches[1] -lt 22 -or ([int]$Matches[1] -eq 22 -and [int]$Matches[2] -lt 13)) {
    throw 'This checkout requires Node >=22.13.0.'
}
if (-not [IO.Path]::IsPathRooted($InputFile)) { $InputFile = Join-Path $root $InputFile }
if ([string]::IsNullOrWhiteSpace($OutputFile)) {
    $OutputFile = Join-Path $root ('Runs/mpc-local-model-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8) + '.json')
} elseif (-not [IO.Path]::IsPathRooted($OutputFile)) { $OutputFile = Join-Path $root $OutputFile }
$args = @((Join-Path $root 'scripts/run-mpc-local-model.mjs'), '--input', $InputFile, '--output', $OutputFile, '--model', $Model, '--mode', $(if($PlanOnly){'plan'}else{'auto'}))
& $node.Source @args
exit $LASTEXITCODE
