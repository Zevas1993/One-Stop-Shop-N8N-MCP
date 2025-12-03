@echo off
title n8n MCP Server (HTTP Mode)
cd /d "%~dp0"
node start.js --http
pause
