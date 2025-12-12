@echo off
REM n8n MCP Server - Quick Start Script for Windows
REM This script starts the MCP server in Docker and opens the setup wizard

echo.
echo ========================================
echo   n8n MCP Server - Docker Desktop
echo ========================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running!
    echo Please start Docker Desktop and try again.
    echo.
    pause
    exit /b 1
)

echo [1/3] Pulling latest image...
docker compose -f docker-compose.desktop.yml pull

echo.
echo [2/3] Starting n8n MCP Server...
docker compose -f docker-compose.desktop.yml up -d

echo.
echo [3/3] Waiting for server to start...
timeout /t 5 /nobreak >nul

REM Check if container is running
docker ps | findstr "n8n-mcp-server" >nul
if errorlevel 1 (
    echo [ERROR] Container failed to start. Check logs with:
    echo   docker compose -f docker-compose.desktop.yml logs
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Server is running!
echo ========================================
echo.
echo   Web UI: http://localhost:3000
echo.
echo   Complete the setup wizard to connect to n8n.
echo.
echo   Useful commands:
echo     View logs:  docker compose -f docker-compose.desktop.yml logs -f
echo     Stop:       docker compose -f docker-compose.desktop.yml down
echo     Restart:    docker compose -f docker-compose.desktop.yml restart
echo.

REM Open browser
start http://localhost:3000

echo Press any key to exit...
pause >nul
