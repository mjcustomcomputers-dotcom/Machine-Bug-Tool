[CmdletBinding()]
param(
    [switch]$Refresh,
    [switch]$VerifyOnly,
    [switch]$OpenReport,
    [switch]$OpenGui,
    [ValidatePattern('^MHA-[0-9]{4}$')][string]$MethodId,
    [ValidatePattern('^MHA-[0-9]{4}$')][string]$RelatedMethodId,
    [string]$OutputDirectory,
    [string]$SysinternalsRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$BundleRoot = $PSScriptRoot
if ($VerifyOnly -and ($Refresh -or $OpenReport -or $OpenGui -or $MethodId -or $RelatedMethodId -or $OutputDirectory -or $SysinternalsRoot)) { throw '-VerifyOnly cannot be combined with execution or query parameters.' }
if ($RelatedMethodId -and -not $MethodId) { throw '-RelatedMethodId requires -MethodId.' }
if ($OutputDirectory -and -not $Refresh) { throw '-OutputDirectory requires -Refresh.' }

function Test-OfflineBundle {
    param([Parameter(Mandatory = $true)][string]$Root, [switch]$RequireBaseProduct)
    $rootPath = [IO.Path]::GetFullPath($Root).TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar))
    $rootPrefix = $rootPath + [IO.Path]::DirectorySeparatorChar
    if (((Get-Item -LiteralPath $rootPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Bundle root cannot be a reparse point.' }
    $manifestPath = Join-Path $rootPath 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw 'manifest.json is missing.'
    }
    if (((Get-Item -LiteralPath $manifestPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'manifest.json cannot be a reparse point.' }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.format_version -ne 'MPC_METHOD_SELF_SCAN_OFFLINE_MANIFEST_1.0') {
        throw 'Unsupported offline manifest.'
    }
    if ($null -eq $manifest.artifacts -or [int]$manifest.artifact_count -ne @($manifest.artifacts).Count) { throw 'Manifest artifact count mismatch.' }
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($artifact in $manifest.artifacts) {
        $relative = [string]$artifact.path
        $segments = $relative.Split('/')
        if ([string]::IsNullOrWhiteSpace($relative) -or [IO.Path]::IsPathRooted($relative) -or $relative.Contains('\') -or $relative.Contains(':') -or
            $segments -contains '..' -or $segments -contains '.' -or $segments -contains '') { throw "Unsafe manifest path: $relative" }
        if (-not $seen.Add($relative)) { throw "Duplicate manifest path: $relative" }
        if ([string]$artifact.sha256 -notmatch '^[a-f0-9]{64}$' -or [long]$artifact.bytes -lt 0) { throw "Invalid manifest metadata: $relative" }
        $path = [IO.Path]::GetFullPath((Join-Path $rootPath $relative.Replace('/', [IO.Path]::DirectorySeparatorChar)))
        if (-not $path.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Manifest path escapes bundle: $relative" }
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Missing artifact: $($artifact.path)"
        }
        $parent = Split-Path -Parent $path
        while ($parent.Length -ge $rootPath.Length -and $parent -ne $rootPath) {
            if (((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse point in artifact path: $relative" }
            $parent = Split-Path -Parent $parent
        }
        $item = Get-Item -LiteralPath $path -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Reparse points are not accepted: $($artifact.path)"
        }
        if ($item.Length -ne [long]$artifact.bytes) {
            throw "Byte count mismatch: $($artifact.path)"
        }
        $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne ([string]$artifact.sha256).ToLowerInvariant()) {
            throw "SHA-256 mismatch: $($artifact.path)"
        }
    }
    if ($RequireBaseProduct) {
        foreach ($required in @('scan.json','summary.json','REPORT.md','MPC-Method-Lab.html','MPC-Method-Self-Scan.cmd','method-atlas.sqlite','implemented-capsules.json','Run-Method-Self-Scan.ps1','Install-Method-Self-Scan.ps1','scripts/portable-method-self-scan.mjs','lib/method-self-scan.mjs','lib/method-self-scan-offline.mjs','lib/method-self-scan-ui.mjs')) {
            if (-not $seen.Contains($required)) { throw "Required bundle artifact is absent from manifest: $required" }
        }
    }
    return $manifest
}

$verifiedManifest = Test-OfflineBundle -Root $BundleRoot -RequireBaseProduct
$ActiveRoot = $BundleRoot
$summaryPath = Join-Path $BundleRoot 'summary.json'
$summary = Get-Content -LiteralPath $summaryPath -Raw -Encoding UTF8 | ConvertFrom-Json

if ($VerifyOnly) {
    [pscustomobject]@{
        Status = 'BUNDLE_VERIFIED'
        ArtifactCount = $verifiedManifest.artifact_count
        ScanSHA256 = $summary.fingerprints.scan_sha256
        Database = Join-Path $BundleRoot 'method-atlas.sqlite'
    }
    return
}

if (-not [string]::IsNullOrWhiteSpace($SysinternalsRoot)) {
    if ($env:OS -ne 'Windows_NT') { throw 'The optional Sysinternals receipt requires native Windows.' }
    $sigcheck = Join-Path $SysinternalsRoot 'sigcheck64.exe'
    $junction = Join-Path $SysinternalsRoot 'junction64.exe'
    $handle = Join-Path $SysinternalsRoot 'handle64.exe'
    $tools = @($sigcheck, $junction, $handle)
    foreach ($tool in $tools) {
        if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) { throw "Existing Sysinternals tool not found: $tool" }
        $item = Get-Item -LiteralPath $tool -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Sysinternals tool path is a reparse point: $tool" }
        $signature = Get-AuthenticodeSignature -LiteralPath $tool
        if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate -or $signature.SignerCertificate.Subject -notmatch '(?:^|,\s*)O=Microsoft Corporation(?:,|$)') {
            throw "Sysinternals tool does not have a valid Microsoft Authenticode signature: $tool"
        }
    }
    function Invoke-OfflineDiagnostic {
        param([Parameter(Mandatory = $true)][string]$Executable, [Parameter(Mandatory = $true)][string[]]$Arguments)
        $text = & $Executable @Arguments 2>&1 | Out-String
        [ordered]@{ executable = $Executable; arguments = $Arguments; exit_status = $LASTEXITCODE; output = $text }
    }
    $database = Join-Path $BundleRoot 'method-atlas.sqlite'
    $powershellExecutable = (Get-Process -Id $PID).Path
    $sysReceipt = [ordered]@{
        kind = 'MPC_METHOD_SELF_SCAN_OPTIONAL_SYSINTERNALS_RECEIPT'
        version = 1
        recorded_at_utc = [DateTime]::UtcNow.ToString('o')
        windows_native = $true
        scan_status = [string]$summary.status
        scan_sha256 = [string]$summary.fingerprints.scan_sha256
        tools = @($tools | ForEach-Object {
            $item = Get-Item -LiteralPath $_ -Force
            $signature = Get-AuthenticodeSignature -LiteralPath $item.FullName
            [ordered]@{ path = $item.FullName; version = $item.VersionInfo.FileVersion; sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); signer_subject = $signature.SignerCertificate.Subject; signer_thumbprint = $signature.SignerCertificate.Thumbprint }
        })
        sigcheck_powershell = Invoke-OfflineDiagnostic -Executable $sigcheck -Arguments @('-nobanner', '-r', '-h', $powershellExecutable)
        sigcheck_database = Invoke-OfflineDiagnostic -Executable $sigcheck -Arguments @('-nobanner', '-r', '-h', $database)
        junction_bundle = Invoke-OfflineDiagnostic -Executable $junction -Arguments @('-nobanner', $BundleRoot)
        handle_database = Invoke-OfflineDiagnostic -Executable $handle -Arguments @('-nobanner', $database)
        changes_scan_result = $false
        source_authentication = $false
        target_actions_performed = $false
        canonical_promotion = $false
        external_tool_network_activity = 'NOT_MEASURED_SIGCHECK_REVOCATION_CHECK_DISABLED'
    }
    $stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffffZ')
    $sysDirectory = Join-Path (Join-Path $BundleRoot 'runs') "sysinternals-$stamp"
    New-Item -ItemType Directory -Path $sysDirectory -ErrorAction Stop | Out-Null
    $sysPath = Join-Path $sysDirectory 'sysinternals-receipt.json'
    $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes((($sysReceipt | ConvertTo-Json -Depth 12) + "`n"))
    $stream = [IO.File]::Open($sysPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    Write-Output "Sysinternals receipt: $sysPath"
}

if ($Refresh) {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $node) {
        throw 'A Node release with flag-free node:sqlite is required only to refresh the scan (22.13+, 23.4+, or 24+). The prebuilt report remains usable without Node.js.'
    }
    $nodeParts = (& $node.Source --version).TrimStart('v').Split('.')
    $major = [int]$nodeParts[0]
    $minor = [int]$nodeParts[1]
    if (($major -lt 22) -or (($major -eq 22) -and ($minor -lt 13)) -or (($major -eq 23) -and ($minor -lt 4))) { throw 'A Node release with flag-free node:sqlite is required (22.13+, 23.4+, or 24+).' }
    $null = & $node.Source --input-type=module --eval "await import('node:sqlite')" 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'This Node.js build does not expose node:sqlite without an experimental flag; use 22.13+, 23.4+, or 24+.' }
    if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
        $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffffffZ')
        $OutputDirectory = Join-Path (Join-Path $BundleRoot 'runs') $stamp
    }
    $runner = Join-Path $BundleRoot 'scripts/portable-method-self-scan.mjs'
    $arguments = @(
        $runner,
        '--database', (Join-Path $BundleRoot 'method-atlas.sqlite'),
        '--capsules', (Join-Path $BundleRoot 'implemented-capsules.json'),
        '--manifest', (Join-Path $BundleRoot 'manifest.json'),
        '--output-dir', $OutputDirectory,
        '--prior-scan', (Join-Path $BundleRoot 'scan.json')
    )
    & $node.Source @arguments
    if ($LASTEXITCODE -ne 0) { throw "Offline scan failed with exit code $LASTEXITCODE." }
    $ActiveRoot = [IO.Path]::GetFullPath($OutputDirectory)
    $null = Test-OfflineBundle -Root $ActiveRoot
    $summaryPath = Join-Path $ActiveRoot 'summary.json'
    $summary = Get-Content -LiteralPath $summaryPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

if ($MethodId) {
    $scan = Get-Content -LiteralPath (Join-Path $ActiveRoot 'scan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($RelatedMethodId) {
        $left, $right = @($MethodId, $RelatedMethodId) | Sort-Object
        $key = "$left|$right"
        $row = $scan.pair_scan.rows | Where-Object { $_.pair_key -eq $key } | Select-Object -First 1
        if ($null -eq $row) { throw "Unknown method pair: $key" }
        $row
    } else {
        $row = $scan.methods | Where-Object { $_.method_id -eq $MethodId } | Select-Object -First 1
        if ($null -eq $row) { throw "Unknown method: $MethodId" }
        $row
    }
} else {
    [pscustomobject]@{
        Status = $summary.status
        ResearchMethods = $summary.inventory.research_methods
        CrossMethodPairs = $summary.inventory.unordered_cross_method_pairs
        MatrixRows = $summary.inventory.total_matrix_rows
        ScanSHA256 = $summary.fingerprints.scan_sha256
        Database = Join-Path $BundleRoot 'method-atlas.sqlite'
        Report = Join-Path $ActiveRoot 'REPORT.md'
        CoreScanNetworkCalls = 0
        MethodExecutionPerformed = $false
        CanonicalPromotion = $false
        SysinternalsStatus = $(if ([string]::IsNullOrWhiteSpace($SysinternalsRoot)) { 'NOT_RUN_OPTIONAL' } else { 'SEPARATE_RECEIPT_WRITTEN' })
    }
}

if ($OpenReport) { Start-Process -FilePath (Join-Path $ActiveRoot 'REPORT.md') }
if ($OpenGui) { Start-Process -FilePath (Join-Path $ActiveRoot 'MPC-Method-Lab.html') }
