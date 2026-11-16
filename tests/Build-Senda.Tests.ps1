$ErrorActionPreference = 'Stop'
Describe 'Compilacion' {
    It 'rechaza un checkout ausente' {
        { & "$PSScriptRoot/../tools/Build-Senda.ps1" -CheckoutRoot (Join-Path $TestDrive 'missing') } | Should Throw 'checkout'
    }
    It 'rechaza un checkout con revision distinta' {
        $root = Join-Path $TestDrive 'wrong'
        New-Item -ItemType Directory -Path $root | Out-Null
        Set-Content -LiteralPath "$root/.senda-revision" -Value ('0' * 40)
        { & "$PSScriptRoot/../tools/Build-Senda.ps1" -CheckoutRoot $root } | Should Throw 'revision'
    }
    It 'invalida un sello anterior aunque falle antes de GN' {
        $root = Join-Path $TestDrive 'stale'
        New-Item -ItemType Directory -Path "$root/src/out/SendaDev" -Force | Out-Null
        Set-Content -LiteralPath "$root/.senda-revision" -Value ('0' * 40)
        Set-Content -LiteralPath "$root/src/out/SendaDev/.senda-build.json" -Value '{"status":"success"}'
        { & "$PSScriptRoot/../tools/Build-Senda.ps1" -CheckoutRoot $root } | Should Throw 'revision'
        (Get-Content -LiteralPath "$root/src/out/SendaDev/.senda-build.json" -Raw | ConvertFrom-Json).status | Should Be 'incomplete'
    }
}
Describe 'Lanzamiento con perfil exclusivo' {
    It 'rechaza el perfil de Chrome antes de lanzar un proceso' {
        { & "$PSScriptRoot/../tools/Start-Senda.ps1" -UserDataDir "$env:LOCALAPPDATA/Google/Chrome/User Data" } | Should Throw 'perfil'
    }
    It 'no abre un ejecutable sin compilacion verificada' {
        { & "$PSScriptRoot/../tools/Start-Senda.ps1" -CheckoutRoot (Join-Path $TestDrive 'missing') } | Should Throw 'compilacion'
    }
}
