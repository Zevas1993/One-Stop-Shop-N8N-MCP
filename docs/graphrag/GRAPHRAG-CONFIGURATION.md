# GraphRAG Configuration Guide

**Version:** 3.0.0-beta
**Last Updated:** 2025-01-19

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Environment Variables](#environment-variables)
3. [Configuration File Locations](#configuration-file-locations)
4. [n8n Integration](#n8n-integration)
5. [Performance Tuning](#performance-tuning)
6. [Security Configuration](#security-configuration)
7. [Advanced Options](#advanced-options)

---

## Quick Reference

### Environment Variables Cheat Sheet

```bash
# Core configuration
NODE_ENV=production                          # production or development
MCP_MODE=stdio                               # stdio or http

# GraphRAG
GRAPH_DIR=~/.cache/n8n-mcp/graph            # Cache directory
GRAPH_PYTHON=python3                        # Python executable path
METRICS_GRAPHRAG=false                      # Enable metrics logging

# n8n Integration
N8N_API_URL=http://localhost:5678           # n8n instance URL
N8N_API_KEY=n8n_api_xxx...                  # API authentication token

# HTTP Mode (if MCP_MODE=http)
PORT=3000                                    # Listen port
AUTH_TOKEN=your-secure-token               # Bearer token for authentication

# Performance
BRIDGE_CACHE_MAX=100                        # Max cached queries
MEM_GUARD_THRESHOLD_MB=512                  # Memory cleanup threshold
MCP_HTTP_MAX_BODY_KB=512                    # Max request body size
```

---

## Environment Variables

### Core Configuration

#### NODE_ENV

**Type:** `production` | `development`
**Default:** `production`
**Purpose:** Determines logging verbosity and error handling

```bash
# Production (recommended)
NODE_ENV=production      # Minimal logs, optimized

# Development
NODE_ENV=development     # Verbose logs, error details
```

**When to change:**
- Use `development` when debugging issues
- Use `production` for deployment and Claude Desktop

#### MCP_MODE

**Type:** `stdio` | `http`
**Default:** `stdio`
**Purpose:** Communication mode with Claude Desktop

```bash
# Local mode (recommended for most users)
MCP_MODE=stdio           # Communicates via stdio, no network exposure

# Remote mode (for network deployment)
MCP_MODE=http            # Starts HTTP server, must use AUTH_TOKEN
```

**When to change:**
- Use `stdio` for Claude Desktop on same machine
- Use `http` for remote deployment or Docker

---

### GraphRAG Configuration

#### GRAPH_DIR

**Type:** Directory path (must exist and be writable)
**Default:**
- Windows: `%APPDATA%\n8n-mcp\graph`
- Linux/macOS: `~/.cache/n8n-mcp/graph`

**Purpose:** Location of knowledge graph cache files

```bash
# Default (recommended)
GRAPH_DIR=~/.cache/n8n-mcp/graph

# Custom location (create directory first!)
GRAPH_DIR=/data/my-graphs/n8n-cache
mkdir -p /data/my-graphs/n8n-cache

# Windows
GRAPH_DIR=C:\Users\<You>\AppData\Roaming\n8n-mcp\graph
```

**Important Notes:**
- Must have read/write permissions
- Should be on fast disk (SSD recommended)
- Requires ~500MB space for catalog, more for full graph

#### GRAPH_PYTHON

**Type:** Path to Python executable or command name
**Default:** `python3` (Linux/macOS) or `python` (Windows)
**Purpose:** Specifies Python interpreter for graph service

```bash
# Use system Python (default, simplest)
GRAPH_PYTHON=python3

# Specific Python version
GRAPH_PYTHON=/usr/bin/python3.11

# Virtual environment
GRAPH_PYTHON=/path/to/venv/bin/python

# Windows with bundled Python
GRAPH_PYTHON=C:\Program Files\n8n-mcp\python\python.exe
```

**When to change:**
- If system Python is not Python 3.8+
- If using virtual environment
- If Python not in PATH

#### GRAPH_BACKEND

**Type:** Path to Python backend service
**Default:** `python/backend/graph/lightrag_service.py`
**Purpose:** Locates the LightRAG backend service

```bash
# Default (relative to repo root)
GRAPH_BACKEND=python/backend/graph/lightrag_service.py

# Absolute path (if not in repo)
GRAPH_BACKEND=/opt/n8n-mcp/python/backend/graph/lightrag_service.py
```

**Important:**
- Auto-converted to absolute path if relative
- Bridge uses this to launch Python subprocess

#### BRIDGE_CACHE_MAX

**Type:** Integer (1-1000)
**Default:** `100`
**Purpose:** Maximum number of cached graph queries

```bash
# Conservative (less memory)
BRIDGE_CACHE_MAX=50

# Balanced (default, good for most)
BRIDGE_CACHE_MAX=100

# Aggressive (high memory, many queries)
BRIDGE_CACHE_MAX=500
```

**Performance Impact:**
- 100 cached queries ≈ 5-10MB memory
- 500 cached queries ≈ 20-50MB memory
- Higher = better cache hit rate, more memory

#### METRICS_GRAPHRAG

**Type:** `true` | `false`
**Default:** `false`
**Purpose:** Enable detailed metrics logging

```bash
# Disabled (default, no overhead)
METRICS_GRAPHRAG=false

# Enabled (verbose logging)
METRICS_GRAPHRAG=true
```

**When enabled, logs:**
- Per-query latency (milliseconds)
- Cache hit/miss events
- P50/P95 percentiles every 20 queries
- Sample counts

**Example output:**
```
[graphrag-bridge] query_graph latency=1ms (cache miss) text="slack notification"
[graphrag-bridge] summary p50=1ms p95=2ms samples=20 cacheHitRate=15%
```

#### DEBUG_MCP

**Type:** `true` | `false`
**Default:** `false`
**Purpose:** Enable debug-level logging for MCP server

```bash
# Disabled (default)
DEBUG_MCP=false

# Enabled (verbose MCP logs)
DEBUG_MCP=true
```

**When enabled, logs:**
- Tool invocation details
- Input/output parameters
- Error stack traces
- Performance metrics

---

### n8n Integration

#### N8N_API_URL

**Type:** URL string
**Default:** None (auto-discovery attempts localhost:5678)
**Purpose:** URL of n8n instance for auto-updates

```bash
# Local n8n (self-hosted)
N8N_API_URL=http://localhost:5678

# n8n Cloud
N8N_API_URL=https://my-instance.n8n.cloud

# Docker n8n
N8N_API_URL=http://n8n-container:5678

# With custom port
N8N_API_URL=http://192.168.1.100:3456
```

**Required for:**
- Auto-discovering n8n nodes
- Building initial knowledge graph
- Incremental updates

#### N8N_API_KEY

**Type:** API token string
**Default:** None (optional for public n8n instances)
**Purpose:** Authentication for n8n API access

```bash
# Get from n8n:
# 1. Go to n8n UI
# 2. Settings → API
# 3. Copy API Key

N8N_API_KEY=n8n_api_c9b9c4b1a1c23dbc70e6e5dcd39dfc3c46d0e50f95c0c4df36b98db7c4b21f76
```

**Required for:**
- Accessing credentials from n8n
- Building complete graph with all metadata

#### N8N_API_TIMEOUT

**Type:** Integer (milliseconds)
**Default:** `30000`
**Purpose:** Timeout for n8n API calls

```bash
# Fast network, quick timeout
N8N_API_TIMEOUT=5000

# Default (30 seconds)
N8N_API_TIMEOUT=30000

# Slow/unreliable network
N8N_API_TIMEOUT=60000
```

---

### HTTP Mode Configuration (if MCP_MODE=http)

#### PORT

**Type:** Integer (1-65535)
**Default:** `3000`
**Purpose:** Port for HTTP server to listen on

```bash
# Default
PORT=3000

# Custom port (if 3000 is busy)
PORT=3001

# Standard HTTP
PORT=80      # Requires root/admin

# Standard HTTPS
PORT=443     # Requires root/admin + SSL cert
```

#### AUTH_TOKEN

**Type:** Random string (base64-encoded)
**Default:** None (required if MCP_MODE=http)
**Purpose:** Bearer token for HTTP authentication

```bash
# Generate secure token:
# OpenSSL
openssl rand -base64 32

# Linux/macOS
export AUTH_TOKEN=$(openssl rand -base64 32)

# Windows PowerShell
$AUTH_TOKEN = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Random -SetSeed ((Get-Date).Ticks) | % {[Byte]$_}).ToString()))

# Use in .env
AUTH_TOKEN=abcd1234efgh5678ijkl9012mnop3456
```

**All HTTP requests must include:**
```
Authorization: Bearer abcd1234efgh5678ijkl9012mnop3456
```

---

### Performance Configuration

#### MEM_GUARD_THRESHOLD_MB

**Type:** Integer (128-2048)
**Default:** `512`
**Purpose:** Memory threshold for automatic cleanup

```bash
# Conservative (cleanup at 256MB)
MEM_GUARD_THRESHOLD_MB=256

# Default (cleanup at 512MB)
MEM_GUARD_THRESHOLD_MB=512

# Relaxed (cleanup at 1GB)
MEM_GUARD_THRESHOLD_MB=1024

# Disabled (if ≤0)
MEM_GUARD_THRESHOLD_MB=-1
```

**When memory exceeds threshold:**
- Clears MCP node list cache
- Clears GraphRAG bridge cache
- Forces garbage collection

#### MCP_HTTP_MAX_BODY_KB

**Type:** Integer (1-10240)
**Default:** `512`
**Purpose:** Maximum HTTP request body size

```bash
# Conservative (512KB)
MCP_HTTP_MAX_BODY_KB=512

# Standard (2MB)
MCP_HTTP_MAX_BODY_KB=2048

# Large payloads (10MB)
MCP_HTTP_MAX_BODY_KB=10240
```

**Note:** Only applies to HTTP mode (MCP_MODE=http)

---

## Configuration File Locations

### Windows

```powershell
# Environment variables
# System:   HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Session Manager\Environment
# User:     HKEY_CURRENT_USER\Environment

# .env file
%APPDATA%\n8n-mcp\config\.env

# Data directory
%APPDATA%\n8n-mcp\graph\

# Logs directory
%APPDATA%\n8n-mcp\logs\
```

**Set environment variables in PowerShell:**
```powershell
[System.Environment]::SetEnvironmentVariable("VAR_NAME", "value", "User")
```

### Linux/macOS

```bash
# .env file
~/.config/n8n-mcp/.env

# Or (if using installer)
/etc/n8n-mcp/config.env

# Data directory
~/.cache/n8n-mcp/graph/

# Logs directory
~/.cache/n8n-mcp/logs/
```

**Set environment variables in shell:**
```bash
# Temporarily
export VAR_NAME=value

# Permanently (add to ~/.bashrc or ~/.zshrc)
echo 'export VAR_NAME=value' >> ~/.bashrc
source ~/.bashrc
```

---

## n8n Integration

### Auto-Discovery

The GraphRAG bridge attempts to discover n8n automatically:

```
1. Check N8N_API_URL env variable
2. Check ~/.n8n/config file
3. Port scan localhost:5678-5682
4. Check environment variables (N8N_BASE, N8N_HOST)
5. Prompt for manual entry if all fail
```

### Manual Configuration

```bash
# Set n8n URL
export N8N_API_URL=http://your-n8n-instance:5678

# Get API key from n8n UI
# Settings → API → Create API Key

export N8N_API_KEY=n8n_api_xxx...

# Rebuild graph to pick up new URL
python3 scripts/initial_graph_builder.py
```

### Verify Connection

```bash
# Test n8n connectivity
curl http://localhost:5678/api/v1/health -H "X-N8N-API-KEY: your-api-key"

# Should return 200 OK with health info
```

---

## Performance Tuning

### For Low-Memory Environments (4GB RAM)

```bash
# Reduce cache
BRIDGE_CACHE_MAX=20

# Increase memory cleanup threshold
MEM_GUARD_THRESHOLD_MB=256

# Disable metrics
METRICS_GRAPHRAG=false

# Use smaller n8n instance if possible
```

### For High-Performance Environments (16GB+ RAM)

```bash
# Increase cache
BRIDGE_CACHE_MAX=500

# Higher memory threshold
MEM_GUARD_THRESHOLD_MB=2048

# Enable metrics for monitoring
METRICS_GRAPHRAG=true
```

### For Network Environments

```bash
# If n8n is over network
N8N_API_TIMEOUT=60000

# Increase cache to reduce n8n queries
BRIDGE_CACHE_MAX=200
```

---

## Security Configuration

### HTTP Mode Security

**Never use HTTP in production without HTTPS!**

```bash
# Generate strong token
openssl rand -base64 32

# Store securely
AUTH_TOKEN=<output-of-above>

# Use HTTPS in production
# Set PORT=443 and provide SSL certificates
```

### File Permissions

```bash
# Linux/macOS - protect config files
chmod 600 ~/.config/n8n-mcp/.env

# Windows - use NTFS permissions
icacls %APPDATA%\n8n-mcp\config\.env /grant:r "%USERNAME%":F /inheritance:r
```

### Environment Variable Security

```bash
# Never commit .env files to git
echo ".env" >> .gitignore

# Never log AUTH_TOKEN
DEBUG_MCP=false  # Prevents logging sensitive values

# Rotate tokens periodically
# Delete old N8N_API_KEY and create new one in n8n UI
```

---

## Advanced Options

### Custom Graph Building

```bash
# Build graph with subset of nodes (for testing)
python3 scripts/initial_graph_builder.py --limit 100

# Build with specific node types only
python3 scripts/initial_graph_builder.py --node-types "slack,http,webhook"

# Force full rebuild (ignore cache)
python3 scripts/initial_graph_builder.py --force

# Verbose output
python3 scripts/initial_graph_builder.py --verbose
```

### Incremental Updates

```bash
# Check for updates immediately
python3 scripts/auto_updater.py

# View what would be updated
python3 scripts/auto_updater.py --dry-run

# Force update even if hash matches
python3 scripts/auto_updater.py --force
```

### Export/Import Configuration

```bash
# Export current configuration
npm run graphrag:export-config

# Import configuration
npm run graphrag:import-config --file config-backup.json

# Backup graph
npm run graphrag:backup --dir /backup/location

# Restore graph
npm run graphrag:restore --dir /backup/location
```

---

## Configuration Examples

### Example 1: Local Development

```bash
NODE_ENV=development
MCP_MODE=stdio
GRAPH_DIR=./data/graph
METRICS_GRAPHRAG=true
DEBUG_MCP=true
```

### Example 2: Production Deployment

```bash
NODE_ENV=production
MCP_MODE=stdio
GRAPH_DIR=/data/n8n-mcp/graph
METRICS_GRAPHRAG=false
DEBUG_MCP=false
N8N_API_URL=http://n8n-internal:5678
N8N_API_KEY=n8n_api_xxx...
BRIDGE_CACHE_MAX=200
```

### Example 3: Remote HTTP Server

```bash
NODE_ENV=production
MCP_MODE=http
PORT=3000
AUTH_TOKEN=<secure-random-token>
GRAPH_DIR=/var/lib/n8n-mcp/graph
MCP_HTTP_MAX_BODY_KB=2048
```

### Example 4: Docker Container

```bash
NODE_ENV=production
MCP_MODE=http
PORT=3000
AUTH_TOKEN=${AUTH_TOKEN}
GRAPH_DIR=/app/data/graph
N8N_API_URL=http://host.docker.internal:5678
```

---

## Troubleshooting Configuration

### "Variable not being read"

```bash
# Verify variable is set
echo $GRAPH_DIR

# Make sure .env file is in correct location
cat ~/.config/n8n-mcp/.env

# Reload environment
source ~/.bashrc  # Linux/macOS
# or restart terminal/IDE for Windows
```

### "Path not found" errors

```bash
# Verify paths exist
[ -d "$GRAPH_DIR" ] && echo "Directory exists" || echo "Directory missing"

# Create if missing
mkdir -p "$GRAPH_DIR"

# Check permissions
ls -ld "$GRAPH_DIR"
# Should show: dr-xr-xr-x (or with write permission for user)
```

### "Connection refused"

```bash
# Check n8n is running
curl http://localhost:5678

# Verify N8N_API_URL is correct
echo $N8N_API_URL

# Test with explicit URL
N8N_API_URL=http://your-ip:5678 python3 scripts/initial_graph_builder.py
```

---

## Configuration Validation

```bash
# Check configuration is valid
npm run graphrag:validate-config

# List all active configuration
npm run graphrag:show-config

# Test n8n connectivity
npm run graphrag:test-n8n

# Validate graph integrity
npm run graphrag:validate-graph
```

---

**Last Updated:** 2025-01-19
**Version:** 3.0.0-beta
**Status:** Complete Configuration Reference
