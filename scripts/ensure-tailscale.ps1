<#
.SYNOPSIS
    Garante que o Tailscale esta a correr e o Funnel esta ativo.

.DESCRIPTION
    Verifica e corrige automaticamente:
      1. Servico Tailscale (arranca se estiver parado)
      2. Ligacao a tailnet (faz "up" se necessario)
      3. Funnel publico na porta 3000 (ativa se estiver OFF)

    Se nao for admin, pede elevacao via UAC e re-executa-se.
    Log escrito em scripts\logs\tailscale.log

.NOTES
    Exit codes:
      0 = tudo OK
      1 = falha critica (servico nao instalado)
      2 = falha recuperavel (funnel pode nao estar ativo)
#>

$ErrorActionPreference = 'Continue'
$scriptDir = Split-Path -Parent $PSCommandPath
$logDir    = Join-Path $scriptDir 'logs'
$logFile   = Join-Path $logDir 'tailscale.log'

# ─── Garantir pasta de logs ───
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-Log {
    param([string]$Msg, [string]$Nivel = 'INFO')
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $linha = "[$ts] [$Nivel] $Msg"
    Add-Content -Path $logFile -Value $linha -Encoding UTF8

    $cor = switch ($Nivel) {
        'INFO'  { 'Cyan' }
        'OK'    { 'Green' }
        'AVISO' { 'Yellow' }
        'ERRO'  { 'Red' }
        default { 'White' }
    }
    Write-Host $linha -ForegroundColor $cor
}

function Test-Admin {
    ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Log "=== Inicio ensure-tailscale ==="

# ─────────────────────────────────────────────────────────────────
# PASSO 0: Elevacao automatica
# ─────────────────────────────────────────────────────────────────
if (-not (Test-Admin)) {
    Write-Log "Sem privilegios de admin. A pedir elevacao (UAC)..." 'AVISO'
    $cmd = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    try {
        $p = Start-Process powershell -Verb RunAs -ArgumentList $cmd -Wait -PassThru
        exit $p.ExitCode
    } catch {
        Write-Log "Elevacao cancelada pelo utilizador." 'ERRO'
        exit 2
    }
}
Write-Log "Privilegios de admin: OK" 'OK'

# ─────────────────────────────────────────────────────────────────
# PASSO 1: Verificar/arrancar servico Tailscale
# ─────────────────────────────────────────────────────────────────
Write-Log "A verificar servico Tailscale..."

$svc = Get-Service -Name Tailscale -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Log "Servico 'Tailscale' nao esta instalado." 'ERRO'
    Write-Log "Instala o Tailscale: https://tailscale.com/download/windows" 'ERRO'
    exit 1
}

if ($svc.Status -ne 'Running') {
    Write-Log "Servico parado (Status: $($svc.Status)). A arrancar..." 'AVISO'
    try {
        Start-Service -Name Tailscale -ErrorAction Stop
        Start-Sleep -Seconds 5
    } catch {
        Write-Log "Falha ao arrancar servico: $($_.Exception.Message)" 'ERRO'
        exit 1
    }
}

# Confirmar que arrancou
$svc = Get-Service -Name Tailscale
if ($svc.Status -ne 'Running') {
    Write-Log "Servico continua parado apos tentativa de arranque." 'ERRO'
    exit 1
}
Write-Log "Servico Tailscale: Running" 'OK'

# ─────────────────────────────────────────────────────────────────
# PASSO 2: Verificar ligacao a tailnet
# ─────────────────────────────────────────────────────────────────
Write-Log "A verificar ligacao a tailnet..."

$maxTentativas = 3
$ligado = $false
for ($i = 1; $i -le $maxTentativas; $i++) {
    $status = & tailscale status 2>&1
    if ($LASTEXITCODE -eq 0 -and $status -notmatch 'failed to connect|Logged out') {
        $ligado = $true
        break
    }
    Write-Log "Tentativa $i/$maxTentativas falhou. A tentar 'tailscale up'..." 'AVISO'
    & tailscale up 2>&1 | Out-Null
    Start-Sleep -Seconds 3
}

if (-not $ligado) {
    Write-Log "Nao foi possivel ligar a tailnet apos $maxTentativas tentativas." 'ERRO'
    exit 2
}
Write-Log "Ligacao a tailnet: OK" 'OK'

# ─────────────────────────────────────────────────────────────────
# PASSO 3: Verificar/ativar Funnel
# ─────────────────────────────────────────────────────────────────
Write-Log "A verificar Funnel..."

$funnel = & tailscale funnel status 2>&1
$funnelAtivo = ($funnel -match 'Funnel on')

if (-not $funnelAtivo) {
    Write-Log "Funnel OFF. A ativar na porta 3000..." 'AVISO'
    & tailscale funnel --bg 3000 2>&1 | Out-Null
    Start-Sleep -Seconds 3

    $funnel = & tailscale funnel status 2>&1
    $funnelAtivo = ($funnel -match 'Funnel on')
}

if ($funnelAtivo) {
    Write-Log "Funnel: ON" 'OK'
    Write-Log "URL publica: https://samuel.tailebbd35.ts.net" 'OK'
    Write-Log "=== Fim ensure-tailscale (sucesso) ==="
    exit 0
} else {
    Write-Log "Funnel nao ficou ativo. Estado atual:" 'ERRO'
    Write-Log $funnel 'ERRO'
    Write-Log "=== Fim ensure-tailscale (falha recuperavel) ==="
    exit 2
}
