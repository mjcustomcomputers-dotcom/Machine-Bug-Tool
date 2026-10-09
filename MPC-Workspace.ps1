[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$portable = Join-Path $root 'MPC-Workspace.exe'
$sourceElectron = Join-Path $root 'node_modules\.bin\electron.cmd'
$exitCode = 1

try {
    if (Test-Path -LiteralPath $portable -PathType Leaf) {
        & $portable
        $exitCode = $LASTEXITCODE
    }
    elseif (Test-Path -LiteralPath $sourceElectron -PathType Leaf) {
        & $sourceElectron $root
        $exitCode = $LASTEXITCODE
    }
    else {
        throw 'Neither the portable MPC-Workspace.exe nor the prepared Electron dependency was found.'
    }
}
catch {
    [Console]::Error.WriteLine("MPC Workspace could not start: {0}" -f $_.Exception.Message)
    $exitCode = 1
}

if ($exitCode -ne 0) {
    [Console]::Error.WriteLine("MPC Workspace exited with code {0}." -f $exitCode)
    [Console]::Error.WriteLine('Logs are normally retained under %APPDATA%\MPC Workspace\logs.')
    [void](Read-Host 'Press Enter to close')
}

exit $exitCode
