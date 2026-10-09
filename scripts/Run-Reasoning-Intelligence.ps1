[CmdletBinding()]
param(
    [long]$Seed,
    [ValidateRange(1, 64)][int]$Rounds = 24,
    [string]$OutputRoot
)

# One bounded local pass. This launcher uses an installed Node application;
# it does not install dependencies, change execution policy, or request admin.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSBoundParameters.ContainsKey('Seed') -and ($Seed -lt 1 -or $Seed -gt 4294967295)) {
    throw 'Seed must be an integer from 1 through 4294967295.'
}
$ReasoningRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ReasoningRunner = Join-Path $ReasoningRoot 'scripts/run-reasoning-selfplay.mjs'

function Test-ReasoningDistribution {
    param([Parameter(Mandatory = $true)][string]$Root)

    $manifestPath = Join-Path $Root 'MANIFEST.json'
    if (-not (Test-Path -LiteralPath $manifestPath)) { return $null }
    $manifestItem = Get-Item -LiteralPath $manifestPath -Force
    if ($manifestItem.PSIsContainer -or ($manifestItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $manifestItem.Length -gt 16777216) {
        throw 'MANIFEST.json must be a regular file no larger than 16 MiB.'
    }
    $rootPath = [IO.Path]::GetFullPath($Root).TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar))
    $rootPrefix = $rootPath + [IO.Path]::DirectorySeparatorChar
    if (((Get-Item -LiteralPath $rootPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'The distribution root must be a regular directory.'
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -eq $manifest -or $manifest -is [Array] -or $null -eq $manifest.PSObject.Properties['files']) {
        throw 'MANIFEST.json must contain a files array.'
    }
    $files = $manifest.files
    if ($files -isnot [Array] -or $files.Count -lt 1 -or $files.Count -gt 10000) {
        throw 'The distribution files array must contain between 1 and 10000 entries.'
    }
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $seenExact = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach ($entry in $files) {
        if ($null -eq $entry -or $null -eq $entry.PSObject.Properties['path'] -or $null -eq $entry.PSObject.Properties['sha256'] -or
            $entry.path -isnot [string] -or $entry.sha256 -isnot [string]) {
            throw 'Each distribution file entry must contain string path and sha256 fields.'
        }
        $relativePath = $entry.path
        $segments = $relativePath.Split('/')
        if ([string]::IsNullOrWhiteSpace($relativePath) -or [IO.Path]::IsPathRooted($relativePath) -or
            $relativePath -match '[\x00-\x1f<>:"|?*\\]' -or $segments -contains '' -or $segments -contains '.' -or $segments -contains '..' -or
            @($segments | Where-Object { $_ -match '[ .]$' }).Count -gt 0) {
            throw "Unsafe distribution path: $relativePath"
        }
        if (-not $seen.Add($relativePath)) { throw "Duplicate distribution path: $relativePath" }
        [void]$seenExact.Add($relativePath)
        if ($entry.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw "Invalid SHA-256 declaration: $relativePath" }
        $fullPath = [IO.Path]::GetFullPath((Join-Path $rootPath $relativePath.Replace('/', [IO.Path]::DirectorySeparatorChar)))
        if (-not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Distribution path escapes root: $relativePath" }
        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { throw "Missing distribution file: $relativePath" }
        $item = Get-Item -LiteralPath $fullPath -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Distribution file is a reparse point: $relativePath" }
        $parent = Split-Path -Parent $fullPath
        while ($parent.Length -ge $rootPath.Length -and -not $parent.Equals($rootPath, [StringComparison]::OrdinalIgnoreCase)) {
            $parentItem = Get-Item -LiteralPath $parent -Force
            if (-not $parentItem.PSIsContainer -or ($parentItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Distribution parent is not a regular directory: $relativePath"
            }
            $parent = Split-Path -Parent $parent
        }
        $actualHash = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash
        if (-not $actualHash.Equals($entry.sha256, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Distribution SHA-256 mismatch: $relativePath"
        }
    }
    # Keep this list aligned with reasoningRuntimeFiles in the Node launcher.
    # A manifest listing unrelated files must not leave executed runtime bytes
    # outside its declared coverage.
    $requiredRuntimePaths = @(
        'scripts/Run-Reasoning-Intelligence.ps1',
        'scripts/run-reasoning-selfplay.mjs',
        'lib/reasoning-selfplay.mjs',
        'lib/finite-information-reasoning.mjs',
        'lib/finite-stochastic-observation.mjs',
        'lib/finite-imperfect-information-regret.mjs',
        'lib/finite-budget-sensitive-search.mjs',
        'lib/finite-adaptive-two-stage-choice.mjs',
        'lib/exact-native-numerical-review.mjs',
        'lib/finite-abstraction-refinement.mjs',
        'lib/noahs-ark-reasoning.mjs',
        'lib/methods.mjs',
        'lib/schema.mjs',
        'lib/universal.mjs',
        'lib/atomic-models.mjs',
        'lib/atomic-source-pointers.json',
        'lib/forensic-models.mjs',
        'lib/forensic-source-pointers.json',
        'lib/deferred-models.mjs',
        'lib/method-overlay.json',
        'method-atlas/candidates.json',
        'method-atlas/expansion-2026-v2.json',
        'method-atlas/expansion-evidence-intent-v3.json',
        'method-atlas/expansion-computation-schools-v4.json',
        'method-atlas/expansion-nasa-chip-cloud-v5.json',
        'method-atlas/expansion-abnormal-meta-v6.json',
        'method-atlas/expansion-optical-v8.json',
        'method-atlas/method-relations.json'
    )
    foreach ($requiredPath in $requiredRuntimePaths) {
        if (-not $seenExact.Contains($requiredPath)) { throw "Executed runtime file is absent from MANIFEST.json: $requiredPath" }
    }
    return [pscustomobject]@{ Status = 'DISTRIBUTION_CONTENT_HASHES_VERIFIED'; FileCount = $files.Count }
}

function Find-ReasoningNode {
    $candidates = New-Object 'System.Collections.Generic.List[string]'
    foreach ($name in @('node', 'node.exe')) {
        foreach ($command in @(Get-Command $name -CommandType Application -All -ErrorAction SilentlyContinue)) {
            if ($null -ne $command -and -not [string]::IsNullOrWhiteSpace($command.Source)) { $candidates.Add($command.Source) }
        }
    }
    foreach ($directory in @([Environment]::GetEnvironmentVariable('ProgramFiles'), [Environment]::GetEnvironmentVariable('ProgramFiles(x86)'))) {
        if (-not [string]::IsNullOrWhiteSpace($directory)) { $candidates.Add((Join-Path $directory 'nodejs/node.exe')) }
    }
    $localPrograms = [Environment]::GetEnvironmentVariable('LOCALAPPDATA')
    if (-not [string]::IsNullOrWhiteSpace($localPrograms)) { $candidates.Add((Join-Path $localPrograms 'Programs/nodejs/node.exe')) }
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($candidate in $candidates) {
        if (-not $seen.Add($candidate) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        try {
            $versionOutput = & $candidate --version 2>&1
            if ($LASTEXITCODE -ne 0) { continue }
            $versionText = ($versionOutput | Out-String).Trim()
            if ($versionText -notmatch '^v([0-9]+)\.([0-9]+)\.([0-9]+)$') { continue }
            $major = [long]$Matches[1]
            $minor = [long]$Matches[2]
            if ($major -gt 22 -or ($major -eq 22 -and $minor -ge 13)) {
                return [pscustomobject]@{ Path = $candidate; Version = $versionText }
            }
        } catch {
            continue
        }
    }
    throw 'No installed Node.js application meeting >=22.13.0 was found. This launcher does not install Node.js.'
}

$verifiedDistribution = Test-ReasoningDistribution -Root $ReasoningRoot
if ($null -ne $verifiedDistribution) {
    Write-Host "Verified $($verifiedDistribution.FileCount) distribution file hashes."
} else {
    Write-Host 'Source checkout has no distribution MANIFEST.json; the runner will record its runtime file fingerprint.'
}
if (-not (Test-Path -LiteralPath $ReasoningRunner -PathType Leaf)) { throw 'scripts/run-reasoning-selfplay.mjs is missing.' }
$nodeApplication = Find-ReasoningNode
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $ReasoningRoot 'Runs'
} elseif (-not [IO.Path]::IsPathRooted($OutputRoot)) {
    $OutputRoot = Join-Path $ReasoningRoot $OutputRoot
}
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
$runnerArguments = @($ReasoningRunner, '--output-root', $OutputRoot, '--rounds', $Rounds.ToString([Globalization.CultureInfo]::InvariantCulture))
if ($PSBoundParameters.ContainsKey('Seed')) {
    $runnerArguments += @('--seed', $Seed.ToString([Globalization.CultureInfo]::InvariantCulture))
}
Write-Host "Running one reasoning pass with Node $($nodeApplication.Version). Results: $OutputRoot"
& $nodeApplication.Path @runnerArguments
exit $LASTEXITCODE
