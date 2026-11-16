[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$BrowserProcessId)
$ErrorActionPreference='Stop'
$sendaProcesses=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name)
$sendaRoot=$sendaProcesses | Where-Object ProcessId -eq $BrowserProcessId | Select-Object -First 1
if(-not $sendaRoot -or $sendaRoot.Name -notin @('chrome.exe','senda.exe')) { throw 'El PID no corresponde a un navegador de prueba activo.' }
$sendaIds=New-Object 'System.Collections.Generic.HashSet[int]'
[void]$sendaIds.Add($BrowserProcessId)
do {
    $sendaAdded=$false
    foreach($sendaProcess in $sendaProcesses) {
        if($sendaIds.Contains([int]$sendaProcess.ParentProcessId)) {
            if($sendaIds.Add([int]$sendaProcess.ProcessId)) { $sendaAdded=$true }
        }
    }
} while($sendaAdded)
$sendaSamples=@(foreach($sendaProcessId in $sendaIds) {
    $sendaProcess=Get-Process -Id $sendaProcessId -ErrorAction SilentlyContinue
    if($sendaProcess) {
        [pscustomobject]@{pid=$sendaProcessId;privateBytes=$sendaProcess.PrivateMemorySize64;workingSetBytes=$sendaProcess.WorkingSet64;cpuSeconds=$sendaProcess.TotalProcessorTime.TotalSeconds}
    }
})
$sendaSystem=Get-CimInstance Win32_OperatingSystem -Property FreePhysicalMemory,TotalVisibleMemorySize
[pscustomobject]@{
    browserPid=$BrowserProcessId
    capturedUtc=[DateTime]::UtcNow.ToString('o')
    privateBytes=($sendaSamples|Measure-Object privateBytes -Sum).Sum
    workingSetBytes=($sendaSamples|Measure-Object workingSetBytes -Sum).Sum
    cpuSeconds=($sendaSamples|Measure-Object cpuSeconds -Sum).Sum
    systemAvailableBytes=[double]$sendaSystem.FreePhysicalMemory*1024
    systemTotalBytes=[double]$sendaSystem.TotalVisibleMemorySize*1024
    processes=$sendaSamples
    missingProcessCount=$sendaIds.Count-$sendaSamples.Count
} | ConvertTo-Json -Depth 5 -Compress
