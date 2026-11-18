param([int]$BrowserProcessId, [string]$Profile, [switch]$InterruptFirstWorker)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Profile = [IO.Path]::GetFullPath($Profile)
if ((Split-Path $Profile -Parent) -ne (Join-Path $project '.profiles') -or
    (Split-Path $Profile -Leaf) -notlike 'compatibility-filter-updates-*') {
    throw 'Use an owned filter-update test profile.'
}
$stop = Join-Path $Profile 'stop-worker-measurement'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SendaWorkerSecurity {
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int id);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr data, int size, out int needed);
    [DllImport("advapi32.dll")] static extern bool IsTokenRestricted(IntPtr token);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);
    public static int[] Inspect(int id) {
        IntPtr process = OpenProcess(0x1000, false, id), token = IntPtr.Zero, data = IntPtr.Zero;
        try {
            if (process == IntPtr.Zero || !OpenProcessToken(process, 8, out token)) return new int[0];
            int needed;
            GetTokenInformation(token, 25, IntPtr.Zero, 0, out needed);
            if (needed <= 0) return new int[0];
            data = Marshal.AllocHGlobal(needed);
            if (!GetTokenInformation(token, 25, data, needed, out needed)) return new int[0];
            IntPtr sid = Marshal.ReadIntPtr(data);
            uint count = Marshal.ReadByte(GetSidSubAuthorityCount(sid));
            if (count == 0) return new int[0];
            int integrity = Marshal.ReadInt32(GetSidSubAuthority(sid, count - 1));
            Marshal.FreeHGlobal(data); data = Marshal.AllocHGlobal(4);
            if (!GetTokenInformation(token, 29, data, 4, out needed)) return new int[0];
            return new int[] { IsTokenRestricted(token) ? 1 : 0, integrity, Marshal.ReadInt32(data) };
        } finally {
            if (data != IntPtr.Zero) Marshal.FreeHGlobal(data);
            if (token != IntPtr.Zero) CloseHandle(token);
            if (process != IntPtr.Zero) CloseHandle(process);
        }
    }
}
'@
$workers = @{}
$interrupted = $false
$deadline = [DateTime]::UtcNow.AddMinutes(5)
while (!(Test-Path -LiteralPath $stop) -and [DateTime]::UtcNow -lt $deadline) {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$BrowserProcessId" |
        Where-Object { $_.CommandLine -like '*--utility-sub-type=senda.mojom.FilterCompiler*' })
    foreach ($child in $children) {
        $key = [string]$child.ProcessId
        if (!$workers.ContainsKey($key)) {
            $workers[$key] = @{
                id = $child.ProcessId; command = $child.CommandLine
                firstSeen = [DateTime]::UtcNow.ToString('o'); peakWorkingSet = 0L; peakPrivateBytes = 0L
            }
        }
        $process = Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
        if ($process) {
            $workers[$key].lastSeen = [DateTime]::UtcNow.ToString('o')
            $workers[$key].peakWorkingSet = [Math]::Max($workers[$key].peakWorkingSet, $process.PeakWorkingSet64)
            $workers[$key].peakPrivateBytes = [Math]::Max($workers[$key].peakPrivateBytes, $process.PrivateMemorySize64)
            if (!$workers[$key].ContainsKey('integrityRid')) {
                $security = [SendaWorkerSecurity]::Inspect($child.ProcessId)
                if ($security.Length -eq 3) {
                    $workers[$key].tokenRestricted = $security[0] -ne 0
                    $workers[$key].integrityRid = $security[1]
                    $workers[$key].appContainer = $security[2] -ne 0
                }
            }
            if ($InterruptFirstWorker -and !$interrupted -and !$process.HasExited) {
                # Pin this verified child through its process handle before
                # terminating it; never act on an unverified executable name.
                $null = $process.Handle
                $process.Kill()
                $interrupted = $true
                @{id=$child.ProcessId;timeUtc=[DateTime]::UtcNow.ToString('o')} |
                    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Profile 'worker-interrupted.json') -Encoding UTF8
            }
        }
    }
    Start-Sleep -Milliseconds 500
}
$remaining = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$BrowserProcessId" |
    Where-Object { $_.CommandLine -like '*--utility-sub-type=senda.mojom.FilterCompiler*' })
@{workers = @($workers.Values); workersRemaining = $remaining.Count; sampledEveryMilliseconds = 500} |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Profile 'worker-measurement.json') -Encoding UTF8
