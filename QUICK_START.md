# n8n MCP Server - Quick Start Guide

## 🚀 One-Command Start

**Option 1: NPM (Recommended)**
```bash
npm run go
```

**Option 2: Double-click (Windows)**
Just double-click `Start-MCP-Server.bat`

**Option 3: Direct Node**
```bash
node start.js
```

That's it! The smart launcher handles everything automatically.

---

## What the Launcher Does

1. ✅ Checks Node.js version (requires 18+)
2. ✅ Installs dependencies if missing
3. ✅ Sets sensible environment defaults
4. ✅ Uses pre-built `dist/` if available
5. ✅ Falls back to `ts-node` if no build exists
6. ✅ Provides clear error messages if something's wrong

---

## Start Modes

### MCP Mode (for Claude Desktop)
```bash
npm run go
# or
node start.js
# or double-click Start-MCP-Server.bat
```

### HTTP Mode (for Open WebUI)
```bash
npm run go:http
# or
node start.js --http
# or double-click Start-HTTP-Server.bat
```

---

## Environment Variables

Create a `.env` file or set these in your environment:

```env
# Required for full functionality
N8N_API_URL=http://localhost:5678
N8N_API_KEY=your-api-key-here

# Optional
OLLAMA_URL=http://localhost:11434
AUTH_TOKEN=your-auth-token
PORT=3001
```

The server works without these, but with reduced functionality.

---

## Troubleshooting

### "Node.js 18+ required"
Download the latest Node.js from https://nodejs.org/

### "npm install failed"
Try running manually:
```bash
npm install
```

### Server won't start
Check if n8n is running:
```bash
curl http://localhost:5678/api/v1/workflows
```

### Memory errors during build
The smart launcher avoids this by using `ts-node` when needed. If you must build:
```bash
# Windows PowerShell
$env:NODE_OPTIONS="--max-old-space-size=8192"; npm run build

# Linux/Mac
NODE_OPTIONS="--max-old-space-size=8192" npm run build
```

---

## For Developers

### Force ts-node (skip dist/)
```bash
npm run dev:mcp      # MCP mode
npm run dev:quick    # HTTP mode
```

### Rebuild distribution
```bash
npm run build
```

### Run tests
```bash
npm test
```
