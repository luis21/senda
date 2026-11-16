[CmdletBinding()]
param(
    [string]$CheckoutRoot,
    [ValidateSet('Dev')][string]$Configuration = 'Dev',
    [ValidateRange(1,8)][int]$Jobs = 2
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (-not $CheckoutRoot) { $CheckoutRoot = Join-Path $projectRoot '.chromium' }
$CheckoutRoot = [IO.Path]::GetFullPath($CheckoutRoot)
$previousStamp = Join-Path $CheckoutRoot 'src/out/SendaDev/.senda-build.json'
if ((Test-Path -LiteralPath "$CheckoutRoot/.senda-revision") -and (Test-Path -LiteralPath $previousStamp)) {
    [IO.File]::WriteAllText($previousStamp, '{"status":"incomplete","revision":""}')
}
$manifest = Get-Content -LiteralPath "$projectRoot/config/chromium.json" -Raw | ConvertFrom-Json
if (-not (Test-Path -LiteralPath "$CheckoutRoot/.senda-revision")) { throw 'Falta checkout preparado.' }
if ((Get-Content -LiteralPath "$CheckoutRoot/.senda-revision" -Raw).Trim() -ne $manifest.revision) { throw 'La revision del checkout no coincide.' }
$src = Join-Path $CheckoutRoot 'src'
if (-not (Test-Path -LiteralPath "$src/DEPS")) { throw 'checkout incompleto: falta DEPS.' }
$actual = & git.exe -C $src rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $actual -ne $manifest.revision) { throw 'La revision Git no coincide con el manifiesto.' }
$depot = Join-Path $projectRoot '.tools/depot_tools'
if (-not (Test-Path -LiteralPath "$depot/gclient.bat")) { throw 'Falta depot_tools.' }
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vsPath = @(& $vswhere -all -prerelease -products '*' -version '[18.0,19.0)' -property installationPath) | Select-Object -First 1
if (-not $vsPath) { throw 'Falta Visual Studio 2026.' }
$env:PATH = "$depot;$env:ProgramFiles\Git\cmd;$env:PATH"
$env:DEPOT_TOOLS_WIN_TOOLCHAIN = '0'
$env:DEPOT_TOOLS_UPDATE = '0'
$env:vs2026_install = $vsPath
$env:GYP_MSVS_VERSION = '2026'
& "$depot/python3.bat" "$projectRoot/tools/sync_filter_snapshot.py" --chromium-root $src
if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar la instantanea de filtros.' }
$output = Join-Path $src 'out/SendaDev'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$stamp = Join-Path $output '.senda-build.json'
[IO.File]::WriteAllText($stamp, (@{status='incomplete';revision=$manifest.revision} | ConvertTo-Json))
Push-Location $CheckoutRoot
try {
    & cmd.exe /d /c "`"$depot\gclient.bat`" runhooks"
    if ($LASTEXITCODE -ne 0) { throw 'Fallo al preparar hooks.' }
} finally { Pop-Location }
Copy-Item -LiteralPath "$projectRoot/config/args.dev.gn" -Destination "$output/args.gn"
Push-Location $src
try {
    & cmd.exe /d /c "`"$depot\gn.bat`" gen out\SendaDev --fail-on-unused-args"
    if ($LASTEXITCODE -ne 0) { throw 'Fallo GN: no se compilara ni lanzara un ejecutable anterior.' }
    & cmd.exe /d /c "`"$depot\autoninja.bat`" -C out\SendaDev chrome -j $Jobs"
    if ($LASTEXITCODE -ne 0) { throw 'Fallo de compilacion; lanzamiento bloqueado.' }
    if (-not (Test-Path -LiteralPath "$output/chrome.exe")) { throw 'Compilacion sin chrome.exe.' }
    [IO.File]::WriteAllText($stamp, (@{status='success';revision=$manifest.revision;completedUtc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json))
} finally { Pop-Location }
Write-Output "Compilacion disponible en $output/chrome.exe. Validar las funciones modificadas antes de dar por terminada la entrega."
