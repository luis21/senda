[CmdletBinding()]
param(
    [string]$CheckoutRoot,
    [Nullable[double]]$InstalledMemoryGB,
    [switch]$AsJson
)
$ErrorActionPreference = 'Stop'
Import-Module "$PSScriptRoot/Senda.Environment.psm1" -Force
if (-not $CheckoutRoot) { $CheckoutRoot = Join-Path (Split-Path $PSScriptRoot -Parent) '.chromium' }
$CheckoutRoot = [IO.Path]::GetFullPath($CheckoutRoot)
$drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($CheckoutRoot))
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vsPath = $null
if (Test-Path -LiteralPath $vswhere) {
    $vsPath = @(& $vswhere -all -prerelease -products '*' -version '[18.0,19.0)' -property installationPath) | Select-Object -First 1
}
$toolset = $null
if ($vsPath) {
    $toolset = Get-ChildItem -LiteralPath (Join-Path $vsPath 'VC/Tools/MSVC') -Directory -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
}
$files = @()
if ($toolset) {
    $files = @('bin/Hostx64/x64/cl.exe','atlmfc/include/atlbase.h','atlmfc/include/afx.h','atlmfc/lib/x64/atls.lib') | ForEach-Object { Test-Path -LiteralPath (Join-Path $toolset.FullName $_) }
    $mfcStandard = Test-Path -LiteralPath (Join-Path $toolset.FullName 'atlmfc/lib/x64/mfc140u.lib')
    $mfcSpectre = Test-Path -LiteralPath (Join-Path $toolset.FullName 'atlmfc/lib/spectre/x64/mfc140u.lib')
    $files += ($mfcStandard -or $mfcSpectre)
}
$sdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10'
$sdkReady = (Test-Path -LiteralPath "$sdk/Include/10.0.28000.0/um/Windows.h") -and (Test-Path -LiteralPath "$sdk/Lib/10.0.28000.0/um/x64/kernel32.lib")
$debugger = Join-Path $sdk 'Debuggers/x64/cdb.exe'
$debuggerReady = (Test-Path -LiteralPath $debugger) -and ([version](Get-Item -LiteralPath $debugger).VersionInfo.ProductVersion.Split(' ')[0] -ge [version]'10.0.26100.3323')
$gitReady = [bool](Get-Command git.exe -ErrorAction SilentlyContinue)
$toolsReady = $gitReady -and $sdkReady -and $debuggerReady -and ($files.Count -eq 5) -and ($files -notcontains $false)
$memorySource = 'unknown'
if ($null -ne $InstalledMemoryGB) { $memorySource = 'user-supplied' }
else {
    try { $InstalledMemoryGB = [math]::Round((Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).TotalPhysicalMemory/1GB,1); $memorySource='system' } catch { }
}
$result = Test-SendaRequirements -CheckoutRoot $CheckoutRoot -FreeDiskGB ([math]::Round($drive.AvailableFreeSpace/1GB,1)) -MemoryGB $InstalledMemoryGB -ToolsAvailable $toolsReady
$extra = @(
    [pscustomobject]@{name='filesystem';status=$(if ($drive.DriveFormat -eq 'NTFS') {'pass'} else {'fail'});detail=$drive.DriveFormat}
    [pscustomobject]@{name='platform';status=$(if ([Environment]::Is64BitOperatingSystem -and [Environment]::OSVersion.Version.Build -ge 22000) {'pass'} else {'fail'});detail=[Environment]::OSVersion.Version.ToString()}
)
$result.checks = @($result.checks) + $extra
$result.ready = @($result.checks | Where-Object status -ne 'pass').Count -eq 0
$result | Add-Member NoteProperty visualStudio $vsPath
$result | Add-Member NoteProperty memorySource $memorySource
$warnings = @()
if ($toolset -and -not $mfcStandard -and $mfcSpectre) { $warnings += 'MFC solo en spectre/x64: verificar vinculacion antes de afirmar compilacion correcta.' }
$result | Add-Member NoteProperty warnings $warnings
if ($AsJson) { $result | ConvertTo-Json -Depth 5 } else { $result.checks | Format-Table -AutoSize; $warnings | Write-Warning }
if (-not $result.ready) { exit 1 }
