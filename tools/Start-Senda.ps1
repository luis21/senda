[CmdletBinding()]
param([string]$CheckoutRoot, [string]$UserDataDir)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (-not $CheckoutRoot) { $CheckoutRoot = Join-Path $projectRoot '.chromium' }
$profiles = [IO.Path]::GetFullPath((Join-Path $projectRoot '.profiles'))
if (-not $UserDataDir) { $UserDataDir = Join-Path $profiles 'senda-dev' }
$UserDataDir = [IO.Path]::GetFullPath($UserDataDir)
if (-not $UserDataDir.StartsWith($profiles + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'El perfil debe estar dentro de .profiles de Senda; no se usara un perfil de Chrome.' }
$output = Join-Path $CheckoutRoot 'src/out/SendaDev'
$stamp = Join-Path $output '.senda-build.json'
if (-not (Test-Path -LiteralPath $stamp)) { throw 'Falta compilacion verificada.' }
$build = Get-Content -LiteralPath $stamp -Raw | ConvertFrom-Json
$manifest = Get-Content -LiteralPath "$projectRoot/config/chromium.json" -Raw | ConvertFrom-Json
if ($build.status -ne 'success' -or $build.revision -ne $manifest.revision -or -not (Test-Path -LiteralPath "$output/chrome.exe")) { throw 'La compilacion esta incompleta o desactualizada.' }
if (-not (Test-Path -LiteralPath "$CheckoutRoot/.senda-revision") -or (Get-Content -LiteralPath "$CheckoutRoot/.senda-revision" -Raw).Trim() -ne $manifest.revision) { throw 'La compilacion no corresponde al checkout preparado.' }
$head = & git.exe -C "$CheckoutRoot/src" rev-parse --verify --quiet HEAD
if ($LASTEXITCODE -ne 0 -or $head -ne $manifest.revision) { throw 'La compilacion no corresponde a la revision Git actual.' }
$exe = [IO.Path]::GetFullPath((Join-Path $output 'chrome.exe'))
Start-Process -FilePath $exe -ArgumentList @("--user-data-dir=`"$UserDataDir`"", '--no-first-run', '--no-default-browser-check') -WindowStyle Normal
