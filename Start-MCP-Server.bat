@echo off
title n8n MCP Server
cd /d "%~dp0"
node start.js %*
pause
