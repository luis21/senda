param([int]$BrowserProcessId, [string]$Profile)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Profile = [IO.Path]::GetFullPath($Profile)
if ((Split-Path $Profile -Parent) -ne (Join-Path $project '.profiles') -or
    (Split-Path $Profile -Leaf) -notlike 'compatibility-filter-updates-*') {
    throw 'Use an owned filter-update test profile.'
}
$stop = Join-Path $Profile 'stop-worker-measurement'
$workers = @{}
$deadline = [DateTime]::UtcNow.AddMinutes(5)
while (!(Test-Path -LiteralPath $stop) -and [DateTime]::UtcNow -lt $deadline) {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$BrowserProcessId" |
        Where-Object { $_.CommandLine -like '*--utility-sub-type=senda.mojom.FilterCompiler*' })
    foreach ($child in $children) {
        $key = [string]$child.ProcessId
        if (!$workers.ContainsKey($key)) {
            $workers[$key] = @{
                id = $child.ProcessId; command = $child.CommandLine
                firstSeen = [DateTime]::UtcNow.ToString('o'); peakWorkingSet = 0L; peakPrivateBytes = 0L
            }
        }
        $process = Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
        if ($process) {
            $workers[$key].lastSeen = [DateTime]::UtcNow.ToString('o')
            $workers[$key].peakWorkingSet = [Math]::Max($workers[$key].peakWorkingSet, $process.PeakWorkingSet64)
            $workers[$key].peakPrivateBytes = [Math]::Max($workers[$key].peakPrivateBytes, $process.PrivateMemorySize64)
        }
    }
    Start-Sleep -Milliseconds 500
}
$remaining = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$BrowserProcessId" |
    Where-Object { $_.CommandLine -like '*--utility-sub-type=senda.mojom.FilterCompiler*' })
@{workers = @($workers.Values); workersRemaining = $remaining.Count; sampledEveryMilliseconds = 500} |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Profile 'worker-measurement.json') -Encoding UTF8
