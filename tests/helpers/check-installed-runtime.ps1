param([Parameter(Mandatory)][int]$BrowserProcessId,
      [Parameter(Mandatory)][string]$InstallDirectory)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$InstallDirectory = [IO.Path]::GetFullPath($InstallDirectory)
$owned = Join-Path $project '.profiles'
if (!$InstallDirectory.StartsWith($owned + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Use only the dedicated installed-browser test directory.'
}
$browser = Get-Process -Id $BrowserProcessId
if ([IO.Path]::GetDirectoryName($browser.Path) -ne $InstallDirectory) { throw 'El proceso no pertenece a la instalacion de prueba.' }
$modules = @($browser.Modules | ForEach-Object { $_.FileName })
if ($modules.Count -lt 10) { throw 'No se pudo inspeccionar el proceso instalado.' }
foreach ($module in $modules) {
    if ($module.StartsWith((Join-Path $project '.chromium') + '\', [StringComparison]::OrdinalIgnoreCase) -or
        $module -match '\\Microsoft Visual Studio\\') {
        throw "Dependencia externa al paquete: $module"
    }
    if ([IO.Path]::GetFileName($module) -match '^(msvcp\d+d.*|vcruntime\d+d.*|ucrtbased)\.dll$' -and
        !$module.StartsWith($InstallDirectory + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "CRT Debug cargada fuera del paquete: $module"
    }
}
$modules | ConvertTo-Json | Set-Content -LiteralPath (Join-Path (Split-Path $InstallDirectory -Parent) 'runtime-modules.json') -Encoding UTF8
Write-Output "PASS: $($modules.Count) modulos del navegador instalado; sin dependencias del checkout/Visual Studio y CRT Debug local."
