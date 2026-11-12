@echo off
title Nova Assistant - Work & Chat
echo ========================================================
echo   Starting Nova Assistant (Chat + Work Tools)
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Checking Ollama Engine...
curl -s http://127.0.0.1:11434 >nul 2>&1
if %errorlevel% neq 0 (
    echo Starting Ollama background service...
    start "" "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
    ping 127.0.0.1 -n 3 >nul
) else (
    echo Ollama is active.
)

echo.
echo [2/3] Checking Dependencies...
if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

echo.
echo [3/3] Opening Nova in Browser...
start "" http://localhost:5100
node server.js

pause
