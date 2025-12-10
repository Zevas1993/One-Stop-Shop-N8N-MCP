@echo off
title n8n MCP Server - Diagnostics
color 0E

cd /d "%~dp0"

:: Check if node is available
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo  ERROR: Node.js not found!
    echo  Please install from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Run diagnostics
node start.js --check

echo.
pause
