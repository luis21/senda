$ErrorActionPreference = 'Stop'
Import-Module "$PSScriptRoot/../tools/Senda.Environment.psm1" -Force
Describe 'Requisitos de compilación' {
    It 'rechaza disco insuficiente' {
        (Test-SendaRequirements -CheckoutRoot 'C:\src\senda' -FreeDiskGB 53.6 -MemoryGB 16 -ToolsAvailable $true).ready | Should Be $false
    }
    It 'acepta el límite de disco de 100 GB' {
        (Test-SendaRequirements -CheckoutRoot 'C:\src\senda' -FreeDiskGB 100 -MemoryGB 16 -ToolsAvailable $true).ready | Should Be $true
    }
    It 'rechaza una ruta con espacios' {
        (Test-SendaRequirements -CheckoutRoot 'C:\mi proyecto' -FreeDiskGB 150 -MemoryGB 16 -ToolsAvailable $true).ready | Should Be $false
    }
    It 'no da por aprobada RAM desconocida' {
        (Test-SendaRequirements -CheckoutRoot 'C:\src\senda' -FreeDiskGB 150 -ToolsAvailable $true).ready | Should Be $false
    }
    It 'rechaza menos de ocho GB de RAM' {
        (Test-SendaRequirements -CheckoutRoot 'C:\src\senda' -FreeDiskGB 150 -MemoryGB 7 -ToolsAvailable $true).ready | Should Be $false
    }
    It 'identifica herramientas ausentes' {
        $result = Test-SendaRequirements -CheckoutRoot 'C:\src\senda' -FreeDiskGB 150 -MemoryGB 16 -ToolsAvailable $false
        $result.ready | Should Be $false
        ($result.checks | Where-Object name -eq 'tools').status | Should Be 'fail'
    }
}
Describe 'Diagnostico ejecutable' {
    It 'puede ejecutarse sin indicar checkout y produce JSON' {
        $json = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/../tools/Test-SendaEnvironment.ps1" -InstalledMemoryGB 16 -AsJson
        $result = ($json -join "`n") | ConvertFrom-Json
        $result.memorySource | Should Be 'user-supplied'
        ($result.checks | Where-Object name -eq 'path').detail | Should Match '\.chromium$'
    }
}
