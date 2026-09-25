# hide-windows.ps1
# Minimiza as janelas dos processos SpidPost.

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
"@

$procList = Get-Process | Where-Object { $_.MainWindowTitle -match 'SpidPost' }

foreach ($p in $procList) {
    [Win32]::ShowWindow($p.MainWindowHandle, 6) | Out-Null  # SW_MINIMIZE
}

Write-Host "Minimizadas $($procList.Count) janelas."