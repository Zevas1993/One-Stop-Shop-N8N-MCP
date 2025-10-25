# GraphRAG Installation Guide - Windows

**Version:** 3.0.0-beta
**Last Updated:** 2025-01-19
**Platform:** Windows 10/11 (64-bit)

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [System Requirements](#system-requirements)
3. [Installation Methods](#installation-methods)
4. [Configuration](#configuration)
5. [Troubleshooting](#troubleshooting)
6. [Verification](#verification)

---

## Quick Start

**For most users (5-10 minutes):**

```powershell
# 1. Download installer from releases
# 2. Run n8n-mcp-installer.exe (admin privileges)
# 3. Follow wizard (select n8n instance, install location)
# 4. Wait for graph build (2-5 minutes)
# 5. Add to Claude Desktop configuration
# 6. Done!
```

**If you already have the repo cloned (2 minutes):**

```powershell
cd C:\path\to\n8n-mcp
npm run graphrag:setup
```

---

## System Requirements

### Minimum
- **OS:** Windows 10 (Build 1909+) or Windows 11
- **Architecture:** 64-bit only
- **RAM:** 8GB (16GB recommended)
- **Disk:** 10GB free (20GB with optional ML models)
- **Internet:** Required for initial setup

### Optional but Recommended
- **n8n Instance:** v1.0.0+ (self-hosted or cloud)
- **API Key:** For auto-update support (get from n8n settings)

### Bundled Components
The Windows installer includes:
- Node.js 18.20.0 LTS (portable)
- Python 3.11 (embeddable)
- All npm dependencies (pre-built)
- Pre-compiled better-sqlite3

---

## Installation Methods

### Method 1: Windows Installer (Recommended)

**Easiest for end users**

#### Step 1: Download & Run Installer

```powershell
# Download from: https://github.com/n8n-io/n8n-mcp/releases
# File: n8n-mcp-installer-3.0.0-beta-x64.exe

# Run installer (requires admin)
& "C:\Users\<YourName>\Downloads\n8n-mcp-installer-3.0.0-beta-x64.exe"
```

#### Step 2: Configure During Installation

The installer wizard will ask:

1. **Installation location:**
   - Default: `C:\Program Files\n8n-mcp`
   - Can customize if desired

2. **n8n Instance Discovery:**
   - Auto-discover (checks localhost:5678-5682)
   - Manual entry (paste your n8n URL)
   - Skip for now (configure later)

3. **Portable Python:**
   - Default: Install included Python
   - Allows offline operation

4. **Initialize Graph:**
   - Default: Yes, build graph from n8n
   - Can skip if building manually

#### Step 3: Wait for Installation

```
✓ Installing Node.js runtime (50MB)
✓ Installing Python runtime (100MB)
✓ Installing npm dependencies (200MB)
✓ Building GraphRAG catalog from n8n (2-5 minutes)
✓ Creating configuration file
✓ Registering with Claude Desktop
✓ Installation complete!
```

#### Step 4: Add to Claude Desktop

Edit your Claude Desktop config (usually at `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "n8n-graphrag": {
      "command": "C:\\Program Files\\n8n-mcp\\dist\\mcp\\index.js",
      "args": [],
      "env": {
        "MCP_MODE": "stdio",
        "GRAPH_DIR": "C:\\Users\\<YourName>\\AppData\\Roaming\\n8n-mcp\\graph",
        "NODE_ENV": "production"
      }
    }
  }
}
```

Replace `<YourName>` with your Windows username.

#### Step 5: Restart Claude Desktop

```powershell
# Close Claude Desktop completely
taskkill /F /IM "Claude.exe"

# Reopen Claude Desktop
# Verify in Claude → Settings → Connected Servers
```

---

### Method 2: Manual Installation from Source

**For developers or custom builds**

#### Prerequisites

```powershell
# Install Node.js 18+ (from https://nodejs.org/)
node --version  # Should be v18.0.0 or higher

# Install Python 3.8+ (from https://www.python.org/)
python --version  # Should be 3.8.0 or higher
```

#### Installation Steps

```powershell
# 1. Clone or download repository
cd C:\Users\<YourName>\Documents
git clone https://github.com/n8n-io/n8n-mcp.git
cd n8n-mcp

# 2. Install dependencies
npm install

# 3. Build TypeScript
npm run build

# 4. Install Python dependencies
pip install -r python/requirements-graphrag.txt

# 5. Discover n8n instance
python scripts/n8n_discovery.py
# Follow prompts, save config when done

# 6. Build initial graph from n8n
python scripts/initial_graph_builder.py
# This will create ~2,341 entities from your n8n instance

# 7. Setup auto-updater (Windows Task Scheduler)
python scripts/setup_auto_update_task.py
# Creates scheduled task that runs every 6 hours

# 8. Create .env file
$env_content = @"
NODE_ENV=production
MCP_MODE=stdio
GRAPH_DIR=$env:APPDATA\n8n-mcp\graph
METRICS_GRAPHRAG=false
DEBUG_MCP=false
"@
$env_content | Out-File -Encoding UTF8 .env
```

#### Add to Claude Desktop

Same as Method 1, Step 4.

---

### Method 3: Docker Installation

**For containerized deployment**

```powershell
# 1. Install Docker Desktop for Windows
# Download: https://www.docker.com/products/docker-desktop

# 2. Pull image
docker pull ghcr.io/czlonkowski/n8n-mcp:latest

# 3. Create config volume
docker volume create n8n-mcp-config

# 4. Run container
docker run -d `
  --name n8n-mcp `
  -v n8n-mcp-config:/app/data `
  -e MCP_MODE=http `
  -e AUTH_TOKEN=your-secure-token `
  -p 3000:3000 `
  ghcr.io/czlonkowski/n8n-mcp:latest

# 5. Test connection
curl -H "Authorization: Bearer your-secure-token" `
  http://localhost:3000/health

# 6. For Claude Desktop (HTTP mode), use mcp-remote adapter
```

For Docker setup details, see [DOCKER_README.md](./DOCKER_README.md).

---

## Configuration

### Environment Variables

Create or edit `%APPDATA%\n8n-mcp\config\.env`:

```bash
# ========================
# REQUIRED
# ========================
NODE_ENV=production                    # production or development
MCP_MODE=stdio                         # stdio (local) or http (remote)

# ========================
# GRAPHRAG CONFIGURATION
# ========================
GRAPH_DIR=C:\Users\<You>\AppData\Roaming\n8n-mcp\graph
GRAPH_PYTHON=python                    # Path to Python executable
GRAPH_BACKEND=python/backend/graph/lightrag_service.py
BRIDGE_CACHE_MAX=100                   # Max cached queries
METRICS_GRAPHRAG=false                 # Enable metrics logging
DEBUG_MCP=false                        # Enable debug output

# ========================
# N8N INTEGRATION (optional)
# ========================
N8N_API_URL=http://localhost:5678
N8N_API_KEY=n8n_api_xxx...            # Get from n8n Settings > API

# ========================
# HTTP MODE (optional)
# ========================
PORT=3000
AUTH_TOKEN=your-secure-token           # Generate: openssl rand -base64 32
```

### Quick Config Commands

```powershell
# View current configuration
type %APPDATA%\n8n-mcp\config\.env

# Update graph directory
[System.Environment]::SetEnvironmentVariable(
  "GRAPH_DIR",
  "C:\Users\<You>\AppData\Roaming\n8n-mcp\graph",
  "User"
)

# Enable metrics logging
[System.Environment]::SetEnvironmentVariable(
  "METRICS_GRAPHRAG",
  "true",
  "User"
)
```

### n8n API Key Setup

1. Open your n8n instance (http://localhost:5678)
2. Go to **Settings** → **API**
3. Click **Create API Key**
4. Copy the token
5. Add to `.env` file or Windows environment variables:

```powershell
[System.Environment]::SetEnvironmentVariable(
  "N8N_API_KEY",
  "n8n_api_xxx...",
  "User"
)
```

---

## Verification

### Checklist After Installation

- [ ] Graph files created: `%APPDATA%\n8n-mcp\graph\catalog.json` (large file, ~10MB)
- [ ] Configuration file exists: `%APPDATA%\n8n-mcp\config\.env`
- [ ] Auto-update task created: Run `schtasks /query /tn n8n-mcp-auto-update`
- [ ] MCP server in Claude Desktop settings
- [ ] Claude Desktop shows "n8n-graphrag" in connected servers
- [ ] No errors in Claude Desktop logs

### Test Commands

```powershell
# 1. Check graph was built
if (Test-Path "$env:APPDATA\n8n-mcp\graph\catalog.json") {
    Write-Host "✓ Catalog exists"
    (Get-Item "$env:APPDATA\n8n-mcp\graph\catalog.json").Length / 1MB
} else {
    Write-Host "✗ Catalog missing"
}

# 2. Check auto-updater is scheduled
schtasks /query /tn n8n-mcp-auto-update /v

# 3. Check Python backend can start
python python/backend/graph/lightrag_service.py

# 4. Run metrics snapshot
npm run metrics:snapshot

# 5. Test graph queries
npm run test:graphrag
```

---

## Troubleshooting

### Common Issues

#### 1. "Python not found" Error

**Symptom:** Bridge fails to start, "python: command not found"

**Solutions:**
```powershell
# Option A: Use bundled Python
[System.Environment]::SetEnvironmentVariable(
  "GRAPH_PYTHON",
  "C:\Program Files\n8n-mcp\python\python.exe",
  "User"
)

# Option B: Install Python globally
# Download: https://www.python.org/downloads/
# Add to PATH during installation

# Verify:
python --version
```

#### 2. "Cannot build graph" Error

**Symptom:** Initial graph builder fails to connect to n8n

**Solutions:**
```powershell
# Check n8n is running
curl http://localhost:5678

# If not running, start n8n
# Or provide manual n8n URL:
python scripts/n8n_discovery.py
# Choose manual entry, paste: http://your-n8n-url:5678

# If API key needed:
# Get from n8n Settings → API
# Then try again:
python scripts/initial_graph_builder.py --n8n-url http://localhost:5678 --api-key "n8n_api_xxx..."
```

#### 3. "MCP server not responding" Error

**Symptom:** Claude Desktop says "n8n-graphrag" server is not responding

**Solutions:**
```powershell
# 1. Check server is running
tasklist | findstr node

# 2. Check configuration path exists
dir "$env:APPDATA\n8n-mcp"

# 3. Check MCP path is correct
dir "C:\Program Files\n8n-mcp\dist\mcp\index.js"

# 4. Restart Claude Desktop
taskkill /F /IM "Claude.exe"
# Then reopen Claude Desktop

# 5. Check error logs
type $env:APPDATA\n8n-mcp\logs\error.log
```

#### 4. "Permission Denied" on Installation

**Symptom:** Installer fails with "Access is denied"

**Solutions:**
```powershell
# Right-click installer → Run as Administrator
# OR
Start-Process -FilePath "installer.exe" -Verb RunAs

# Verify admin:
# Run PowerShell as Admin first
[bool](([System.Security.Principal.WindowsIdentity]::GetCurrent()).groups -match "S-1-5-32-544")
# Returns True if admin
```

#### 5. Graph Building Takes Too Long

**Symptom:** Graph build seems stuck or very slow (>10 minutes)

**Solutions:**
```powershell
# Check progress
# Look for events.jsonl to see if updates are happening
ls -Recurse "$env:APPDATA\n8n-mcp\graph" | where Name -eq "events.jsonl" | cat

# If stuck, you can cancel and try with fewer nodes
# For testing with subset:
python scripts/initial_graph_builder.py --limit 100
# This builds graph with only first 100 nodes
```

#### 6. Auto-Updater Not Running

**Symptom:** Graph is not updating, task scheduler task is missing

**Solutions:**
```powershell
# Recreate task
python scripts/setup_auto_update_task.py

# Verify task exists
schtasks /query /tn n8n-mcp-auto-update

# Check task history
schtasks /query /tn n8n-mcp-auto-update /v

# View task logs
Get-EventLog -LogName System -Source "Task Scheduler" -Newest 10

# Manually run updater to test
python scripts/auto_updater.py
```

---

## Advanced Configuration

### Using Custom n8n Instance

```powershell
# Set environment variable
[System.Environment]::SetEnvironmentVariable(
  "N8N_API_URL",
  "https://your-n8n-cloud.com",
  "User"
)

# Rebuild graph
python scripts/initial_graph_builder.py --n8n-url "https://your-n8n-cloud.com"
```

### Enable Debug Logging

```powershell
# Set environment variable
[System.Environment]::SetEnvironmentVariable(
  "DEBUG_MCP",
  "true",
  "User"
)

# View logs (real-time)
Get-Content -Path "$env:APPDATA\n8n-mcp\logs\bridge.log" -Tail 20 -Wait
```

### Custom Graph Directory

```powershell
# Create custom location
mkdir "D:\My Data\n8n-graph-cache"

# Configure
[System.Environment]::SetEnvironmentVariable(
  "GRAPH_DIR",
  "D:\My Data\n8n-graph-cache",
  "User"
)

# Rebuild graph at new location
python scripts/initial_graph_builder.py
```

---

## Uninstallation

### Method 1: Via Installer

```powershell
# Control Panel → Programs → Programs and Features
# Find "n8n MCP Server"
# Click Uninstall
```

### Method 2: Manual

```powershell
# 1. Remove auto-update task
schtasks /delete /tn n8n-mcp-auto-update /f

# 2. Remove installation directory
Remove-Item -Recurse -Force "C:\Program Files\n8n-mcp"

# 3. Remove user config
Remove-Item -Recurse -Force "$env:APPDATA\n8n-mcp"

# 4. Remove Claude Desktop config entry (edit %APPDATA%\Claude\claude_desktop_config.json)
```

### Method 3: Docker

```powershell
# Stop container
docker stop n8n-mcp

# Remove container
docker rm n8n-mcp

# Remove volume
docker volume rm n8n-mcp-config
```

---

## Getting Help

### Resources

- **Documentation:** See [GRAPHRAG-SETUP-GUIDE.md](./GRAPHRAG-SETUP-GUIDE.md)
- **Troubleshooting:** See [GRAPHRAG-TROUBLESHOOTING.md](./GRAPHRAG-TROUBLESHOOTING.md)
- **Configuration:** See [GRAPHRAG-CONFIGURATION.md](./GRAPHRAG-CONFIGURATION.md)
- **Issues:** https://github.com/n8n-io/n8n-mcp/issues

### Common Commands Reference

```powershell
# Start server manually
npm run start

# Build database
npm run rebuild

# Run metrics test
npm run metrics:snapshot

# Run all tests
npm test

# Check graph status
npm run graphrag:status
```

---

**Last Updated:** 2025-01-19
**Version:** 3.0.0-beta
**Status:** Ready for MVP Installation
