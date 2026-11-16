Set-StrictMode -Version Latest

function Test-SendaRequirements {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$CheckoutRoot,
        [Parameter(Mandatory)][double]$FreeDiskGB,
        [Nullable[double]]$MemoryGB,
        [Parameter(Mandatory)][bool]$ToolsAvailable
    )
    $checks = @(
        [pscustomobject]@{ name='path'; status=$(if ([IO.Path]::IsPathRooted($CheckoutRoot) -and $CheckoutRoot -notmatch '\s') {'pass'} else {'fail'}); detail=$CheckoutRoot }
        [pscustomobject]@{ name='disk'; status=$(if ($FreeDiskGB -ge 100) {'pass'} else {'fail'}); detail="$FreeDiskGB GB; minimo 100 GB" }
        [pscustomobject]@{ name='memory'; status=$(if ($null -eq $MemoryGB) {'unknown'} elseif ($MemoryGB -ge 8) {'pass'} else {'fail'}); detail=$(if ($null -eq $MemoryGB) {'RAM no verificada'} else {"$MemoryGB GB; minimo 8 GB"}) }
        [pscustomobject]@{ name='tools'; status=$(if ($ToolsAvailable) {'pass'} else {'fail'}); detail='Git, Visual Studio C++/ATL/MFC x64 y SDK' }
    )
    [pscustomobject]@{ ready=(@($checks | Where-Object status -ne 'pass').Count -eq 0); checks=$checks }
}
Export-ModuleMember -Function Test-SendaRequirements
