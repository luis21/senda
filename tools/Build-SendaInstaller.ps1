[CmdletBinding()]
param([switch]$TestMode, [switch]$PersonalDev)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$src = Join-Path $project '.chromium/src'
$configuration = if ($PersonalDev) { 'Dev' } else { 'Release' }
$outputName = "Senda$configuration"
$output = Join-Path $src "out/$outputName"
$generated = Join-Path $project ".tools/installer-generated-$configuration"
$compiler = Join-Path $project '.tools/nsis-3.13/nsis-3.13/makensis.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Falta el compilador NSIS 3.13 verificado en .tools.' }
$stamp = Get-Content -LiteralPath "$output/.senda-build.json" -Raw | ConvertFrom-Json
if ($stamp.status -ne 'success' -or (!$PersonalDev -and $stamp.configuration -ne 'Release')) {
    throw 'Release no esta terminada. Completa Build-Senda.ps1 -Configuration Release -Jobs 4.'
}
New-Item -ItemType Directory -Force $generated, "$project/dist" | Out-Null
$env:DEPOT_TOOLS_WIN_TOOLCHAIN = '0'
$env:DEPOT_TOOLS_UPDATE = '0'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$env:vs2026_install = @(& $vswhere -all -prerelease -products '*' -version '[18.0,19.0)' -property installationPath) | Select-Object -First 1
$env:GYP_MSVS_VERSION = '2026'
Push-Location $src
try {
    & ./buildtools/win/gn.exe desc "out/$outputName" //chrome:chrome runtime_deps --format=json |
        Set-Content -LiteralPath "$generated/runtime-deps.json" -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron obtener las dependencias GN.' }
} finally { Pop-Location }
$payloadArgs = @("$project/tools/package_senda.py", '--output', $output, '--runtime-deps', "$generated/runtime-deps.json", '--generated', $generated)
if ($PersonalDev) { $payloadArgs += '--personal-dev' }
& "$project/.tools/depot_tools/python3.bat" @payloadArgs
if ($LASTEXITCODE -ne 0) { throw 'El paquete no supero la validacion de Release.' }
$version = (Get-Content -LiteralPath "$project/config/chromium.json" -Raw | ConvertFrom-Json).version
$suffix = if ($PersonalDev) { '-personal-dev' } else { '' }
if ($TestMode) { $suffix += '-validation' }
$installer = Join-Path $project "dist/SendaSetup-$version-win-x64$suffix.exe"
$nsisArgs = @('/V2', "/DPRODUCT_VERSION=$version", "/DGENERATED=$generated", "/DOUTPUT_FILE=$installer", "/DPROJECT_ROOT=$project")
if ($TestMode) { $nsisArgs += '/DTEST_MODE' }
if ($PersonalDev) { $nsisArgs += '/DPERSONAL_DEV' }
& $compiler @nsisArgs "$project/installer/Senda.nsi"
if ($LASTEXITCODE -ne 0) { throw 'NSIS no pudo crear el instalador.' }
$digest = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$installer.sha256", "$digest  $([IO.Path]::GetFileName($installer))`n")
Copy-Item -LiteralPath "$generated/package-manifest.json" -Destination "$installer.manifest.json"
Get-Item -LiteralPath $installer | Select-Object FullName,Length
Write-Output "SHA256 $digest"
