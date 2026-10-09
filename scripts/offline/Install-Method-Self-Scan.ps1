[CmdletBinding()]
param(
    [string]$Destination,
    [switch]$NoDesktopLauncher
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar))
$desktop = $null
if ([string]::IsNullOrWhiteSpace($Destination) -or -not $NoDesktopLauncher) {
    $desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
    if ([string]::IsNullOrWhiteSpace($desktop)) { throw 'The current user Desktop directory could not be resolved.' }
}
if ([string]::IsNullOrWhiteSpace($Destination)) { $Destination = Join-Path $desktop 'MPC-Method-Self-Scan' }
$Destination = [IO.Path]::GetFullPath($Destination).TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar))
$sourcePrefix = $source + [IO.Path]::DirectorySeparatorChar
if ($Destination.Equals($source, [StringComparison]::OrdinalIgnoreCase) -or $Destination.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Destination must be outside the source bundle.'
}
if (Test-Path -LiteralPath $Destination) { throw "Destination already exists; refusing to overwrite: $Destination" }

$psLauncher = $null
$cmdLauncher = $null
if (-not $NoDesktopLauncher) {
    $psLauncher = Join-Path $desktop 'MPC-Method-Self-Scan.ps1'
    $cmdLauncher = Join-Path $desktop 'MPC-Method-Self-Scan.cmd'
    foreach ($launcher in @($psLauncher, $cmdLauncher)) {
        if (Test-Path -LiteralPath $launcher) { throw "Desktop launcher already exists; refusing to overwrite: $launcher" }
    }
}

& (Join-Path $source 'Run-Method-Self-Scan.ps1') -VerifyOnly | Out-Host
$manifestPath = Join-Path $source 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Path $Destination -ErrorAction Stop | Out-Null
foreach ($artifact in $manifest.artifacts) {
    $relative = ([string]$artifact.path).Replace('/', [IO.Path]::DirectorySeparatorChar)
    $from = Join-Path $source $relative
    $to = Join-Path $Destination $relative
    $parent = Split-Path -Parent $to
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -LiteralPath $from -Destination $to
}
Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $Destination 'manifest.json')

if (-not $NoDesktopLauncher) {
    $target = (Join-Path $Destination 'Run-Method-Self-Scan.ps1').Replace("'", "''")
    Set-Content -LiteralPath $psLauncher -Value "& '$target' @args`r`n" -Encoding UTF8 -NoNewline
    $guiTarget = (Join-Path $Destination 'MPC-Method-Lab.html').Replace('%', '%%')
    $cmdText = "@echo off`r`nsetlocal EnableExtensions DisableDelayedExpansion`r`nset `"MPC_APP=$guiTarget`"`r`nif not exist `"%MPC_APP%`" (`r`n echo ERROR: MPC-Method-Lab.html is missing.`r`n echo Press any key to close this window . . .`r`n pause ^>nul`r`n exit /b 1`r`n)`r`nstart `"`" `"%MPC_APP%`"`r`nif errorlevel 1 (`r`n echo ERROR: The default browser could not open MPC Method Lab.`r`n echo Press any key to close this window . . .`r`n pause ^>nul`r`n exit /b 1`r`n)`r`nendlocal`r`n"
    Set-Content -LiteralPath $cmdLauncher -Value $cmdText -Encoding ASCII -NoNewline
}

& (Join-Path $Destination 'Run-Method-Self-Scan.ps1') -VerifyOnly
