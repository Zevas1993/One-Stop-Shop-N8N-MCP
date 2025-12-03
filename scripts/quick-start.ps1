# n8n MCP Server - Quick Start (No Build)
# Run with: .\scripts\quick-start.ps1

Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           n8n MCP Server - Quick Start (ts-node)             ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Set environment variables
$env:N8N_AUTO_SYNC = "false"
$env:ALLOW_COMMUNITY_NODES = "false"

Write-Host "Starting MCP server directly with ts-node..." -ForegroundColor Yellow
Write-Host "  - N8N_AUTO_SYNC: false (prevents rebuild loop)" -ForegroundColor Gray
Write-Host "  - ALLOW_COMMUNITY_NODES: false (built-in only)" -ForegroundColor Gray
Write-Host ""

npx ts-node --transpile-only src/main.ts
