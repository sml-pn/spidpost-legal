@echo off
title SpidPost
cd /d "%~dp0"

echo.
echo ============================================
echo   SPIDPOST - Arranque
echo ============================================
echo.

:: Verificacoes
if not exist "package.json" (
    echo [ERRO] Executa dentro da pasta do projeto.
    pause
    exit /b 1
)
if not exist ".env" (
    echo [ERRO] Ficheiro .env nao encontrado.
    pause
    exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado.
    pause
    exit /b 1
)

echo [OK] Pre-requisitos verificados
echo.

:: Tailscale Funnel (em background)
echo [1/3] A ativar Tailscale Funnel...
tailscale funnel --bg 3000 >nul 2>nul
timeout /t 2 >nul

:: Servidor Fastify (inclui o scheduler quando clicares em INICIAR no painel)
echo [2/3] A arrancar servidor SpidPost...
start "SpidPost Server" cmd /k "cd /d %CD% && npm run server"
timeout /t 5 >nul

:: Browser
echo [3/3] A abrir o painel...
timeout /t 3 >nul
start https://samuel.tailebbd35.ts.net

echo.
echo ============================================
echo   SPIDPOST ARRANCADO
echo ============================================
echo.
echo   Painel: https://samuel.tailebbd35.ts.net
echo   Login:  samuel / spidpost2026
echo.
echo   IMPORTANTE:
echo   No painel, clica em INICIAR SISTEMA
echo   para comecar a produzir e publicar.
echo.
echo ============================================
timeout /t 5 >nul
exit /b 0