$ErrorActionPreference = 'Stop'
Describe 'Preparacion del checkout' {
    It 'no descarga nada si no se cumple la RAM minima' {
        $root = Join-Path $TestDrive 'checkout'
        Mock git.exe { throw 'Git no debe invocarse' }
        Mock cmd.exe { throw 'gclient no debe invocarse' }
        { & "$PSScriptRoot/../tools/Initialize-SendaChromium.ps1" -CheckoutRoot $root -InstalledMemoryGB 1 } | Should Throw 'Requisitos'
        Assert-MockCalled git.exe -Times 0 -Exactly
        Assert-MockCalled cmd.exe -Times 0 -Exactly
        Test-Path -LiteralPath $root | Should Be $false
    }
    It 'rechaza una revision no fijada a un commit' {
        $manifest = Join-Path $TestDrive 'invalid.json'
        '{"repository":"https://chromium.googlesource.com/chromium/src.git","revision":"main"}' | Set-Content -LiteralPath $manifest
        { & "$PSScriptRoot/../tools/Initialize-SendaChromium.ps1" -ManifestPath $manifest -CheckoutRoot (Join-Path $TestDrive 'other') -InstalledMemoryGB 16 -PrepareOnly } | Should Throw 'revision'
        Test-Path -LiteralPath (Join-Path $TestDrive 'other') | Should Be $false
    }
    It 'no sobrescribe una configuracion ajena' {
        $root = Join-Path $TestDrive 'foreign'
        New-Item -ItemType Directory -Path $root | Out-Null
        Set-Content -LiteralPath "$root/.gclient" -Value 'foreign'
        { & "$PSScriptRoot/../tools/Initialize-SendaChromium.ps1" -CheckoutRoot $root -InstalledMemoryGB 16 -PrepareOnly } | Should Throw 'ajena'
        (Get-Content -LiteralPath "$root/.gclient") | Should Be 'foreign'
    }
}
