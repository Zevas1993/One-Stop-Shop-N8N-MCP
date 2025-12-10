@echo off
title n8n MCP Server (HTTP Mode)
color 0B

echo.
echo  ╔════════════════════════════════════════════════════════════╗
echo  ║              n8n Co-Pilot MCP Server                       ║
echo  ║                     HTTP Mode                              ║
echo  ╚════════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: Check if node is available
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  ERROR: Node.js not found!
    echo  Please install from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Run the smart launcher in HTTP mode
node start.js --http

:: Keep window open if there was an error
if %ERRORLEVEL% neq 0 (
    echo.
    echo  Server exited with error code %ERRORLEVEL%
    pause
)
