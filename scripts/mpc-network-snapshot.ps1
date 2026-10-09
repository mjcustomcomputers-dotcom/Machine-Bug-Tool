# Windows NetTCPIP read-only metadata snapshot. No target traffic, DNS, packet capture, elevation or mutation.
$ErrorActionPreference = 'Stop'
$limit = 256
$names = @{}
try {
  foreach ($p in @(Get-Process -ErrorAction SilentlyContinue)) {
    $names[[string]$p.Id] = [string]$p.ProcessName
  }
} catch {}
function NetworkRow($item, [string]$protocol) {
  $pidValue = [int]$item.OwningProcess
  $procName = $null
  if ($names.ContainsKey([string]$pidValue)) { $procName = $names[[string]$pidValue] }
  return [pscustomobject]@{
    protocol = $protocol
    local_address = [string]$item.LocalAddress
    local_port = [int]$item.LocalPort
    remote_address = $(if ($protocol -eq 'TCP') { [string]$item.RemoteAddress } else { '' })
    remote_port = $(if ($protocol -eq 'TCP') { [int]$item.RemotePort } else { 0 })
    state = $(if ($protocol -eq 'TCP') { [string]$item.State } else { 'Bound' })
    pid = $pidValue
    process_name = $procName
  }
}
$tcpStatus = 'AVAILABLE'
$udpStatus = 'AVAILABLE'
$tcpRaw = @()
$udpRaw = @()
$tcpRows = @()
$udpRows = @()
try {
  $tcpRaw = @(Get-NetTCPConnection -ErrorAction Stop | Select-Object -First ($limit + 1))
  $tcpRows = @($tcpRaw | Select-Object -First $limit | ForEach-Object { NetworkRow $_ 'TCP' })
} catch { $tcpStatus = 'UNAVAILABLE'; $tcpRows = @() }
try {
  $udpRaw = @(Get-NetUDPEndpoint -ErrorAction Stop | Select-Object -First ($limit + 1))
  $udpRows = @($udpRaw | Select-Object -First $limit | ForEach-Object { NetworkRow $_ 'UDP' })
} catch { $udpStatus = 'UNAVAILABLE'; $udpRows = @() }
[ordered]@{
  kind = 'MPC_WINDOWS_NETWORK_NATIVE_1'
  tcp_status = $tcpStatus
  udp_status = $udpStatus
  tcp_truncated = [bool]($tcpRaw.Count -gt $limit)
  udp_truncated = [bool]($udpRaw.Count -gt $limit)
  tcp = $tcpRows
  udp = $udpRows
} | ConvertTo-Json -Compress -Depth 5
