# show-windows.ps1
# Traz as janelas dos processos SpidPost para primeiro plano.

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@

$procList = Get-Process | Where-Object { $_.MainWindowTitle -match 'SpidPost' }

if ($procList.Count -eq 0) {
    Write-Host "Nenhuma janela SpidPost encontrada."
    exit 0
}

foreach ($p in $procList) {
    [Win32]::ShowWindow($p.MainWindowHandle, 9) | Out-Null  # SW_RESTORE
    [Win32]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
}

Write-Host "Mostradas $($procList.Count) janelas."