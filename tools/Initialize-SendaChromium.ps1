[CmdletBinding()]
param(
    [string]$CheckoutRoot,
    [string]$ManifestPath,
    [Nullable[double]]$InstalledMemoryGB,
    [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (-not $CheckoutRoot) { $CheckoutRoot = Join-Path $projectRoot '.chromium' }
if (-not $ManifestPath) { $ManifestPath = Join-Path $projectRoot 'config/chromium.json' }
$CheckoutRoot = [IO.Path]::GetFullPath($CheckoutRoot)
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($manifest.revision -notmatch '^[a-f0-9]{40}$') { throw 'revision debe ser un commit exacto de 40 caracteres.' }
if ($manifest.repository -ne 'https://chromium.googlesource.com/chromium/src.git') { throw 'Repositorio no oficial.' }
$marker = Join-Path $CheckoutRoot '.senda-revision'
if (Test-Path -LiteralPath $CheckoutRoot) {
    if (-not (Test-Path -LiteralPath $marker)) { throw 'Configuracion ajena: no se modificara el directorio existente.' }
    if ((Get-Content -LiteralPath $marker -Raw).Trim() -ne $manifest.revision) { throw 'revision del checkout distinta al manifiesto.' }
}
$json = & "$PSScriptRoot/Test-SendaEnvironment.ps1" -CheckoutRoot $CheckoutRoot -InstalledMemoryGB $InstalledMemoryGB -AsJson
$diagnosis = ($json -join "`n") | ConvertFrom-Json
if (-not $diagnosis.ready) { throw ('Requisitos incumplidos: ' + (($diagnosis.checks | Where-Object status -ne 'pass' | ForEach-Object { $_.name + ': ' + $_.detail }) -join '; ')) }
$depot = Join-Path $projectRoot '.tools/depot_tools'
if (-not (Test-Path -LiteralPath "$depot/gclient.bat")) { throw 'Falta depot_tools inicializado.' }
$env:PATH = "$depot;$env:ProgramFiles\Git\cmd;$env:PATH"
$env:DEPOT_TOOLS_WIN_TOOLCHAIN = '0'
$env:DEPOT_TOOLS_UPDATE = '0'
$env:vs2026_install = $diagnosis.visualStudio
$env:GYP_MSVS_VERSION = '2026'
if (-not (Test-Path -LiteralPath $CheckoutRoot)) {
    New-Item -ItemType Directory -Path $CheckoutRoot | Out-Null
    [IO.File]::WriteAllText($marker, $manifest.revision)
}
$gclientConfig = "solutions = [{ 'name': 'src', 'url': 'https://chromium.googlesource.com/chromium/src.git', 'managed': False, 'custom_deps': {}, 'custom_vars': {} }]`n"
$gclientPath = Join-Path $CheckoutRoot '.gclient'
if ((Test-Path -LiteralPath $gclientPath) -and (Get-Content -LiteralPath $gclientPath -Raw) -ne $gclientConfig) { throw 'Configuracion .gclient ajena: no se sobrescribira.' }
[IO.File]::WriteAllText($gclientPath, $gclientConfig)
if ($PrepareOnly) { Write-Output "Preparado: $CheckoutRoot; revision $($manifest.revision)"; return }
function Invoke-SendaGit {
    param([string[]]$GitArguments)
    & git.exe @GitArguments
    if ($LASTEXITCODE -ne 0) { throw "Git fallo: $($GitArguments -join ' ')" }
}
$src = Join-Path $CheckoutRoot 'src'
if (-not (Test-Path -LiteralPath "$src/.git")) {
    if (Test-Path -LiteralPath $src) { throw 'Directorio src ajeno o incompleto sin repositorio Git.' }
    Invoke-SendaGit -GitArguments @('init', $src)
    Invoke-SendaGit -GitArguments @('-C', $src, 'remote', 'add', 'origin', $manifest.repository)
    Invoke-SendaGit -GitArguments @('-C', $src, 'config', 'core.autocrlf', 'false')
    Invoke-SendaGit -GitArguments @('-C', $src, 'config', 'core.longpaths', 'true')
}
$head = & git.exe -C $src rev-parse --verify --quiet HEAD
if ($LASTEXITCODE -eq 0) {
    if ($head -ne $manifest.revision) { throw 'revision existente distinta: no se cambiara automaticamente.' }
    $changes = & git.exe -C $src status --porcelain --untracked-files=no
    if ($LASTEXITCODE -ne 0 -or $changes) { throw 'El checkout tiene cambios locales o no se pudo inspeccionar.' }
} else {
    Invoke-SendaGit -GitArguments @('-C', $src, 'fetch', '--depth', '1', 'origin', $manifest.revision)
    Invoke-SendaGit -GitArguments @('-C', $src, 'checkout', '--detach', 'FETCH_HEAD')
}
Push-Location $CheckoutRoot
try {
    & cmd.exe /d /c "`"$depot\gclient.bat`" sync --no-history --nohooks --jobs 4 --revision src@$($manifest.revision)"
    if ($LASTEXITCODE -ne 0) { throw 'gclient sync fallo. El checkout queda disponible para reanudar.' }
} finally { Pop-Location }
$actual = & git.exe -C $src rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $actual -ne $manifest.revision) { throw 'La revision final no coincide.' }
Write-Output 'Codigo y dependencias descargados. Hooks y compilacion siguen pendientes.'
