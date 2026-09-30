@echo off
title SpidPost
cd /d "%~dp0"

echo.
echo ============================================
echo   SPIDPOST - Arranque
echo ============================================
echo.

if not exist "package.json" ( echo [ERRO] Executa dentro da pasta do projeto. & pause & exit /b 1 )
if not exist ".env"        ( echo [ERRO] Ficheiro .env nao encontrado.    & pause & exit /b 1 )
where node >nul 2>nul
if errorlevel 1 ( echo [ERRO] Node.js nao encontrado. & pause & exit /b 1 )

REM --- PROTECAO: verificar se ja ha servidor a correr ---
echo [1/3] A verificar se ja existe servidor...
curl.exe -s -o NUL -w "%%{http_code}" http://localhost:3000/api/health > "%TEMP%\sp_health.txt" 2>nul
set /p CODE=<"%TEMP%\sp_health.txt"

if "%CODE%"=="200" (
    echo.
    echo ============================================
    echo   ATENCAO: JA EXISTE UM SPIDPOST A CORRER
    echo ============================================
    echo.
    echo   Nao vou arrancar outro. Se quiseres reiniciar:
    echo     1. Fecha a janela "SpidPost Server" antiga
    echo     2. Volta a clicar neste START.bat
    echo.
    echo   OU se nao sabes onde esta a janela antiga:
    echo     Abre PowerShell e corre:
    echo       Get-Process node ^| Stop-Process -Force
    echo.
    pause
    exit /b 0
)

echo [OK] Nenhum servidor a correr
echo.

REM --- [2/3] Tailscale Funnel ---
echo [2/3] A ativar Tailscale Funnel...
tailscale funnel --bg 3000 >nul 2>nul
timeout /t 2 >nul

REM --- [3/3] Servidor + Browser ---
echo [3/3] A arrancar servidor SpidPost...
start "SpidPost Server" cmd /k "cd /d %CD% && npm run server"
timeout /t 5 >nul
timeout /t 3 >nul
start https://samuel.tailebbd35.ts.net

echo.
echo ============================================
echo   SPIDPOST ARRANCADO
echo ============================================
echo   Painel: https://samuel.tailebbd35.ts.net
echo   Login:  samuel / spidpost2026
echo.
echo   No painel, clica em INICIAR SISTEMA.
echo ============================================
timeout /t 5 >nul
exit /b 0
