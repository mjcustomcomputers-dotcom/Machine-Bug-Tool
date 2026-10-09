#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('inspect', 'receive')]
    [string] $Action,

    [Parameter(Mandatory = $true)]
    [string] $Repository,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-f0-9]{40}$')]
    [string] $ReportingCommit,

    [string] $Destination
)

$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -CommandType Application -ErrorAction Stop
$null = Get-Command git -CommandType Application -ErrorAction Stop
$receiverPath = Join-Path -Path $PSScriptRoot -ChildPath 'receive-mpc-v13.mjs'
$callerLabel = 'PowerShell ' + $PSVersionTable.PSVersion.ToString()
$receiverArguments = @($receiverPath, $Action, '--repository', $Repository,
    '--reporting-commit', $ReportingCommit, '--caller-shell', $callerLabel)

if ($Action -eq 'receive') {
    if ([string]::IsNullOrWhiteSpace($Destination)) {
        throw 'Receive requires an unused -Destination path.'
    }
    $receiverArguments += @('--destination', $Destination)
} elseif (-not [string]::IsNullOrWhiteSpace($Destination)) {
    throw 'Inspect does not take -Destination.'
}

# Node owns byte-preserving reads/writes and JSON output. Do not redirect Git
# source through Out-File or a PowerShell text conversion to restore state.
$nativePreference = Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
if ($null -ne $nativePreference) {
    $priorNativePreference = $nativePreference.Value
    $PSNativeCommandUseErrorActionPreference = $false
}
try {
    & $nodeCommand.Source @receiverArguments
    $receiverExitCode = $LASTEXITCODE
} finally {
    if ($null -ne $nativePreference) {
        $PSNativeCommandUseErrorActionPreference = $priorNativePreference
    }
}
exit $receiverExitCode
