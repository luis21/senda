[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Installer,
    [switch]$Fixture,
    [switch]$PersonalDev
)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$Installer = [IO.Path]::GetFullPath($Installer)
$testRoot = Join-Path $project ".profiles/installer-validation-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
$destination = Join-Path $testRoot 'Senda'
New-Item -ItemType Directory -Force $testRoot | Out-Null
$identity = if ($PersonalDev) { 'Senda.PersonalDev' } else { 'Senda.InstallerValidation' }
$registry = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$identity"
if (Test-Path -LiteralPath $registry) { throw 'Existe otra prueba de instalador. Revisarla antes de reutilizar su registro.' }
$personalShortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Senda (pruebas para este equipo).lnk'
if ($PersonalDev -and (Test-Path -LiteralPath $personalShortcut)) { throw 'Ya existe un acceso directo personal. No se modificara.' }
function Run-Setup([string]$File, [string[]]$Arguments, [int]$Expected = 0) {
    $process = Start-Process -FilePath $File -ArgumentList $Arguments -WindowStyle Hidden -PassThru
    $exitDeadline = [DateTime]::UtcNow.AddMinutes(5)
    while (!$process.WaitForExit(1000)) {
        if ([DateTime]::UtcNow -ge $exitDeadline) { throw "Tiempo agotado en $File (PID $($process.Id)); revisar ese proceso de prueba." }
    }
    $process.Refresh()
    if ($process.ExitCode -ne $Expected) { throw "Salida $($process.ExitCode) en $File; se esperaba $Expected." }
}
Run-Setup $Installer @('/S', "/D=$destination")
if (!(Test-Path -LiteralPath "$destination/.senda-install.ini")) { throw 'Instalacion sin marca de propiedad.' }
if (!(Test-Path -LiteralPath $registry)) { throw 'Registro de desinstalacion de prueba ausente.' }
$lpacRules = @((Get-Acl -LiteralPath "$destination/chrome.exe").GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) |
    Where-Object { $_.IdentityReference.Value -eq 'S-1-15-2-2' -and $_.AccessControlType -eq 'Allow' })
$readExecute = [Security.AccessControl.FileSystemRights]::ReadAndExecute
if (!($lpacRules | Where-Object { $_.IsInherited -and ($_.FileSystemRights -band $readExecute) -eq $readExecute -and
    ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Write) -eq 0 })) {
    throw 'La instalacion no asigno lectura/ejecucion LPAC sin escritura al ejecutable.'
}
Write-Output 'PASS: permiso LPAC de lectura/ejecucion heredado por el ejecutable, sin escritura.'
$manifest = Get-Content -LiteralPath "$destination/package-manifest.json" -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
    $file = [IO.Path]::GetFullPath((Join-Path $destination $entry.relative))
    if (!$file.StartsWith($destination + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Manifiesto fuera del destino.' }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Hash incorrecto: $($entry.relative)" }
}
Write-Output "PASS: $($manifest.files.Count) archivos instalados y hashes correctos."
Run-Setup $Installer @('/S', "/D=$destination") 4
Write-Output 'PASS: reinstalacion sobre carpeta ocupada rechazada.'
# Move the uninstaller to a foreign empty folder: identity must fail before deleting.
$foreign = Join-Path $testRoot 'foreign'
New-Item -ItemType Directory -Force $foreign | Out-Null
Copy-Item -LiteralPath "$destination/Uninstall.exe" -Destination "$foreign/Uninstall.exe"
Run-Setup "$foreign/Uninstall.exe" @('/S', "_?=$foreign") 3
Write-Output 'PASS: desinstalador trasladado rechazado.'
$junctionTarget = Join-Path $testRoot 'junction-target'
$junction = Join-Path $testRoot 'junction'
New-Item -ItemType Directory -Force $junctionTarget | Out-Null
New-Item -ItemType Junction -Path $junction -Target $junctionTarget | Out-Null
$junctionDestination = Join-Path $junction 'Senda'
Run-Setup $Installer @('/S', "/D=$junctionDestination") 3
if (Get-ChildItem -LiteralPath $junctionTarget -Force) { throw 'El instalador escribio a traves de la union.' }
Write-Output 'PASS: instalacion a traves de una union rechazada.'
# Check the same guard on uninstall after a managed subdirectory is replaced.
$managedDirectory = Join-Path $destination 'locales'
if (Test-Path -LiteralPath $managedDirectory) {
    $savedDirectory = Join-Path $testRoot 'saved-locales'
    if (!$savedDirectory.StartsWith($testRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
        !$managedDirectory.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta de prueba no valida.' }
    Move-Item -LiteralPath $managedDirectory -Destination $savedDirectory
    New-Item -ItemType Junction -Path $managedDirectory -Target $junctionTarget | Out-Null
    try {
        Run-Setup "$destination/Uninstall.exe" @('/S', "_?=$destination") 3
        if (!(Test-Path -LiteralPath "$destination/chrome.exe")) { throw 'Se borraron archivos antes de comprobar uniones.' }
    } finally {
        # Delete only the verified reparse entry; never recurse into its target.
        $junctionItem = Get-Item -LiteralPath $managedDirectory -Force
        if ($junctionItem.LinkType -ne 'Junction' -or $junctionItem.Target -ne $junctionTarget) { throw 'La union de prueba cambio.' }
        [IO.Directory]::Delete($managedDirectory, $false)
        Move-Item -LiteralPath $savedDirectory -Destination $managedDirectory
    }
    Write-Output 'PASS: desinstalacion a traves de una union rechazada sin borrar.'
}
Set-Content -LiteralPath "$destination/keep-me.txt" -Value 'unowned sentinel'
New-Item -ItemType Directory -Force "$destination/User Data/Default" | Out-Null
Set-Content -LiteralPath "$destination/User Data/Default/Preferences" -Value 'profile sentinel'
$locked = [IO.File]::Open("$destination/chrome.dll", 'Open', 'Read', 'None')
try { Run-Setup "$destination/Uninstall.exe" @('/S', "_?=$destination") 5 }
finally { $locked.Dispose() }
if (!(Test-Path -LiteralPath "$destination/chrome.exe")) { throw 'Se borraron archivos antes de comprobar bloqueos.' }
Write-Output 'PASS: desinstalacion con archivo abierto rechazada sin borrar.'
if (!$Fixture) {
    & node "$project/tests/network-protection-browser.mjs" "$testRoot/browser-profile" --cosmetic "--browser-exe=$destination/Senda.exe"
    if ($LASTEXITCODE -ne 0) { throw 'El navegador instalado no supero la prueba de proteccion.' }
    Write-Output 'PASS: ejecutable instalado, red y proteccion cosmetica.'
}
Run-Setup "$destination/Uninstall.exe" @('/S')
# Standard NSIS uninstall copies itself to TEMP so its original can be deleted.
$uninstallDeadline = [DateTime]::UtcNow.AddSeconds(45)
while (Test-Path -LiteralPath $registry) {
    if ([DateTime]::UtcNow -ge $uninstallDeadline) { throw 'La desinstalacion normal no termino.' }
    Start-Sleep -Milliseconds 250
}
foreach ($entry in $manifest.files) {
    if (Test-Path -LiteralPath (Join-Path $destination $entry.relative)) { throw "Archivo propio no eliminado: $($entry.relative)" }
}
if (!(Test-Path -LiteralPath "$destination/keep-me.txt") -or !(Test-Path -LiteralPath "$destination/User Data/Default/Preferences")) {
    throw 'La desinstalacion no conservo datos ajenos.'
}
if (!$Fixture -and !(Test-Path -LiteralPath "$testRoot/browser-profile/Local State")) { throw 'No se conservo el perfil del navegador probado.' }
if (Test-Path -LiteralPath $registry) { throw 'Registro propio no eliminado.' }
if (Test-Path -LiteralPath "$destination/Uninstall.exe") { throw 'Desinstalador original no eliminado.' }
if ($PersonalDev -and (Test-Path -LiteralPath $personalShortcut)) { throw 'Acceso directo de prueba no eliminado.' }
Write-Output 'PASS: desinstalacion conserva perfil y archivo ajeno; elimina solo el paquete y su registro.'
Write-Output "Evidencia conservada en $testRoot"
