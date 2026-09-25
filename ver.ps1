<#
.SYNOPSIS
    Mostra um ficheiro do projeto para o assistente ver.
.EXAMPLE
    .\ver.ps1 src/services/ffmpeg.ts
    .\ver.ps1 src/services/ffmpeg.ts 200 400
    .\ver.ps1 src/services/ffmpeg.ts -Busca "mostrarCta"
#>
param(
    [Parameter(Mandatory=$true)][string]$Path,
    [int]$Inicio = 1,
    [int]$Fim = 0,
    [string]$Busca = ""
)

if (-not (Test-Path $Path)) {
    Write-Host "Ficheiro nao encontrado: $Path" -ForegroundColor Red
    exit 1
}

$linhas = Get-Content $Path
$total = $linhas.Count

Write-Host ""
Write-Host "=== $Path ($total linhas) ===" -ForegroundColor Cyan
Write-Host ""

if ($Busca -ne "") {
    for ($i = 0; $i -lt $total; $i++) {
        if ($linhas[$i] -match $Busca) {
            $ctx = [Math]::Max(0, $i - 2)
            $ctxFim = [Math]::Min($total - 1, $i + 2)
            for ($j = $ctx; $j -le $ctxFim; $j++) {
                $num = ($j + 1).ToString().PadLeft(4)
                Write-Host "$num | $($linhas[$j])"
            }
            Write-Host "     |"
        }
    }
} else {
    if ($Fim -eq 0 -or $Fim -gt $total) { $Fim = $total }
    for ($i = $Inicio - 1; $i -lt $Fim; $i++) {
        $num = ($i + 1).ToString().PadLeft(4)
        Write-Host "$num | $($linhas[$i])"
    }
}

Write-Host ""
Write-Host "=== FIM ===" -ForegroundColor Cyan
