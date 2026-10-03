@echo off
title SpidPost - Atualizacao Diaria
cd /d "%~dp0"

echo.
echo ============================================
echo   SPIDPOST - Atualizacao Diaria
echo ============================================
echo.
echo   1. refresh  (tokens ML)
echo   2. harvest  (favoritos ML)
echo   3. render   (videos + ImageKit)
echo   4. sync     (push para GitHub)
echo.
echo   Tempo estimado: 15-30 min.
echo   Podes deixar a correr e ir fazer outra coisa.
echo ============================================
echo.

if not exist "package.json" ( echo [ERRO] Executa dentro da pasta do projeto. & pause & exit /b 1 )
if not exist ".env"        ( echo [ERRO] Ficheiro .env nao encontrado.    & pause & exit /b 1 )
where node >nul 2>nul
if errorlevel 1 ( echo [ERRO] Node.js nao encontrado. & pause & exit /b 1 )

echo A arrancar... (Ctrl+C para cancelar)
echo.
npm run daily

echo.
echo ============================================
echo   CONCLUIDO
echo ============================================
echo   O GitHub Actions vai publicar nos slots
echo   08:00-22:00 automaticamente.
echo   Podes desligar o PC.
echo ============================================
timeout /t 15
exit /b 0