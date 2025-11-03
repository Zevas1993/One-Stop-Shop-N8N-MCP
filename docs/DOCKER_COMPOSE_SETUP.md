# Docker Compose Setup Guide

Complete guide to deploying the n8n MCP Server alongside n8n using Docker Compose.

## Overview

This setup provides four integrated services working together:

1. **n8n** (http://localhost:5678) - Workflow automation platform
2. **MCP Server** - n8n node documentation + GraphRAG learning system (stdio mode)
3. **Ollama** (localhost:11434) - Nano LLM inference server with Qwen3 models
4. **Open WebUI** (http://localhost:3000) - Natural language orchestration interface

The MCP server automatically detects n8n version changes and rebuilds its database when needed. Ollama provides Nano LLM-powered semantic search and workflow optimization suggestions using lightweight Qwen3 embedding and generation models.

## Quick Start

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd One-Stop-Shop-N8N-MCP
```

### 2. Create Environment File

```bash
# Generate secure random tokens
AUTH_TOKEN=$(openssl rand -base64 32)
N8N_API_KEY=$(openssl rand -base64 32)
WEBUI_SECRET_KEY=$(openssl rand -base64 32)

# Create .env file
cat > .env << ENVEOF
AUTH_TOKEN=$AUTH_TOKEN
N8N_API_KEY=$N8N_API_KEY
WEBUI_SECRET_KEY=$WEBUI_SECRET_KEY
ENVEOF
```

### 3. Start the Stack

```bash
# Build the MCP image (first time only)
docker compose build

# Start all services
docker compose up -d

# Check status
docker compose ps
```

### 4. Access Services

- **n8n**: http://localhost:5678
- **Open WebUI**: http://localhost:3000
- **MCP**: Available via stdio (Claude Desktop)
- **Ollama**: localhost:11434 (for direct API access if needed)

### 5. Nano LLM System Requirements & Configuration

The Docker Compose stack includes Ollama for lightweight Nano LLM-powered AI features:

**Models Required:**
The system uses two Qwen3 models for optimal performance:
- **Embedding Model**: `Qwen/Qwen3-Embedding-0.6B` - Enables semantic understanding of queries
- **Generation Model**: `Qwen/Qwen3-4B-Instruct` - Powers AI-driven workflow optimization suggestions

**Hardware Requirements:**
- **Minimum**: 16GB RAM (will use CPU inference if GPU unavailable)
- **Recommended**: NVIDIA GPU with 8GB+ VRAM (RTX 3060 or better) or Apple Silicon
- **Disk Space**: ~4GB for Qwen3 models cached in `ollama-data` volume
- **Windows 11 with Docker Desktop**: CPU inference works, GPU unavailable in Hyper-V

**First Run Setup:**
```bash
# Start the stack
docker compose up -d

# Monitor Ollama initialization
docker compose logs -f ollama

# Pull the required models into Ollama (one-time setup)
docker compose exec ollama ollama pull qwen3-embedding:0.6b
docker compose exec ollama ollama pull qwen3:4b-instruct-q4_K_M

# Verify models are available
docker compose exec ollama ollama list
```

**Disabling Nano LLM (Pattern-based mode):**
If you don't want to run Ollama (to save resources):
```bash
# Edit docker-compose.yml and comment out the ollama service
# MCP will automatically fall back to pattern-based classification
# This reduces system resource usage but loses semantic learning capabilities
```

**Ollama Performance Notes:**
- **Embedding inference**: ~200-500ms on CPU, <100ms on GPU
- **Generation inference**: 2-5 seconds on CPU, <1 second on GPU
- **Model memory**: Embedding model ~2GB, Generation model ~4GB (RAM or VRAM)
- For Windows Docker Desktop with limited resources, consider using smaller models or disabling entirely

### 6. (Optional) Enable Workflow Management Features

MCP includes 11 powerful workflow management tools (create, update, execute workflows). To enable them:

**Step 1: Get your n8n API Key**
1. Open n8n at http://localhost:5678
2. Click **Settings** (bottom left)
3. Go to **API** tab
4. Click **Create an API key**
5. Copy the generated key

**Step 2: Update .env file**

```bash
# Edit your .env file and add:
N8N_API_KEY=your-api-key-here
N8N_API_URL=http://n8n:5678/api
```

**Step 3: Restart MCP**

```bash
docker compose restart mcp
```

Now you can use all 11 workflow management tools!

### Workflow Management Tools

Once configured, you can use these powerful tools:

**Workflow Management:**
- `n8n_create_workflow` - Create new workflows programmatically
- `n8n_get_workflow` - Retrieve workflow details by ID
- `n8n_get_workflow_structure` - Get simplified workflow structure
- `n8n_update_full_workflow` - Update entire workflows
- `n8n_update_partial_workflow` - Update specific workflow sections with diff operations
- `n8n_delete_workflow` - Delete workflows permanently
- `n8n_list_workflows` - Browse all workflows with filtering

**Execution Management:**
- `n8n_run_workflow` - Execute workflows directly (no webhook needed)
- `n8n_trigger_webhook_workflow` - Execute via webhook URL
- `n8n_list_executions` - Monitor execution history
- `n8n_stop_execution` - Stop running executions

**Validation:**
- `n8n_validate_workflow` - Validate workflow from n8n instance by ID

### Quick Example

Once API key is configured:

```bash
# Create a new workflow via Claude Desktop
# "Create a webhook workflow that logs incoming data"

# Update an existing workflow
# "Add an HTTP Request node to workflow 123 that posts data to https://example.com"

# Execute a workflow
# "Run workflow named 'Slack Monitor' now"

# List all executions
# "Show me all executions from the past 24 hours"
```

## How It Works

### Automatic Version Detection

When the MCP container starts:

1. **Wait for n8n** - MCP waits up to 60 seconds for n8n to initialize
2. **Read version** - Reads n8n version from `/shared/n8n-modules/n8n/package.json`
3. **Compare versions** - Checks if version differs from last rebuild (`/app/data/.n8n-versions`)
4. **Auto-rebuild** - If version changed, automatically rebuilds `nodes.db` by scanning n8n packages
5. **Store version** - Records new version for next startup

### Volume Sharing Strategy

The `docker-compose.yml` uses four volumes:

| Volume | Purpose | Shared |
|--------|---------|--------|
| `n8n-data` | n8n workflows, credentials, executions | n8n only |
| `mcp-data` | MCP database (nodes.db) and GraphRAG data | MCP only |
| `n8n-modules` | n8n's node_modules for runtime detection | n8n ↔ MCP (read-only) |
| `open-webui-data` | User conversations and settings | Open WebUI only |

## Environment Variables

### Required
- `AUTH_TOKEN` - Random token for MCP authentication (generate: `openssl rand -base64 32`)

### Optional
- `N8N_API_KEY` - API key for workflow management features
- `WEBUI_SECRET_KEY` - Secret key for Open WebUI sessions

### n8n Configuration

In the `docker-compose.yml`, you can customize n8n:

```yaml
environment:
  - N8N_HOST=n8n          # Container hostname
  - N8N_PORT=5678         # Port number
  - N8N_PROTOCOL=http     # Protocol
  # - N8N_DEFAULT_USER_PASSWORD=your-password  # Admin password
  # - N8N_DIAGNOSTICS_ENABLED=false  # Disable telemetry
```

## Common Tasks

### View MCP Logs

Watch the MCP container output to see version detection in action:

```bash
docker compose logs -f mcp
```

You'll see output like:
```
🚀 n8n MCP Server - Starting with Auto-Rebuild
🔍 Detecting n8n version from shared volume...
⏳ Waiting for n8n container to initialize...
✅ Found n8n version: 1.97.1
✅ Version match! Using cached nodes.db
🧠 Nano LLM Learning System
📚 GraphRAG Backend
⚙️  MCP Server Mode: stdio
Starting MCP server...
```

### Update n8n

To update n8n while keeping MCP:

```bash
# Pull latest n8n image
docker compose pull n8n

# Restart services
docker compose up -d

# MCP will automatically detect the new version and rebuild
docker compose logs -f mcp
```

### Update MCP

To update the MCP server:

```bash
# Rebuild the MCP image
docker compose build --no-cache mcp

# Restart MCP service
docker compose up -d mcp

# If n8n version didn't change, nodes.db will be reused
docker compose logs -f mcp
```

### Stop Services

```bash
# Stop all services (preserves data)
docker compose down

# Stop and remove all data (WARNING: deletes everything)
docker compose down -v
```

### Access n8n Database

n8n stores data in the `n8n-data` volume. To backup:

```bash
docker run --rm \
  -v n8n-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/n8n-backup.tar.gz -C / data
```

### Access MCP Database

MCP stores its nodes.db in the `mcp-data` volume:

```bash
docker run --rm \
  -v mcp-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/mcp-backup.tar.gz -C / data
```

## Troubleshooting

### MCP Container Won't Start

**Check logs:**
```bash
docker compose logs mcp
```

**Common issues:**
- n8n hasn't started yet (wait 30-60 seconds)
- Shared volume not mounted correctly
- Permission issues with data directory

**Solution:** Restart services
```bash
docker compose restart
```

### Version Detection Not Working

Check if the shared volume is properly mounted:

```bash
# Verify n8n-modules volume
docker inspect $(docker compose ps -q n8n) | grep -A 5 "n8n-modules"

# Check if package.json is accessible
docker compose exec mcp ls -la /shared/n8n-modules/n8n/
```

### Out of Disk Space

If you're running low on disk:

```bash
# See volume sizes
docker system df

# Remove unused volumes
docker volume prune

# But keep your data volumes!
```

### Port Already in Use

If ports 5678 or 3000 are already in use:

Edit `docker-compose.yml`:
```yaml
services:
  n8n:
    ports:
      - "5678:5678"  # Change first number: 5679:5678
  open-webui:
    ports:
      - "3000:8080"  # Change first number: 3001:8080
```

Then restart:
```bash
docker compose up -d
```

## Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                     Docker Network (nano-network)              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────────────────┐  ┌────────────────────┐               │
│  │  n8n Container     │  │  MCP Container     │               │
│  │  (Workflow UI)     │  │  (Node Docs +      │               │
│  │  Port: 5678        │  │   GraphRAG)        │               │
│  └────────────────────┘  │  Stdio Mode        │               │
│         │                └────────────────────┘               │
│         │                         │                           │
│         │      n8n-modules        │                           │
│         │      (shared vol)       │                           │
│         └─────────────────────────┘                           │
│              │              │                                 │
│         n8n-data       mcp-data                               │
│         (volume)        (volume)                              │
│              │              │                                 │
│        (workflows)    (nodes.db +                             │
│         (creds)     GraphRAG data)                            │
│                                                               │
│  ┌────────────────────────────────────────┐                 │
│  │  Ollama Container (Nano LLMs)          │                 │
│  │  Port: 11434                           │                 │
│  │  Models:                               │                 │
│  │  - Qwen3-Embedding-0.6B               │                 │
│  │  - Qwen3-4B-Instruct                  │                 │
│  └────────────────────────────────────────┘                 │
│         │                                                    │
│    ollama-data                                              │
│      (volume)                                               │
│         │                                                    │
│   (model cache)                                             │
│                                                              │
│  ┌────────────────────────────────────────┐                 │
│  │  Open WebUI Container                  │                 │
│  │  (Natural Language Interface)           │                 │
│  │  Port: 3000                            │                 │
│  └────────────────────────────────────────┘                 │
│         │                                                    │
│    open-webui-data                                          │
│      (volume)                                               │
│         │                                                    │
│    (conversations)                                          │
│                                                              │
└────────────────────────────────────────────────────────────────┘

Version Detection Flow:
─────────────────────
MCP Startup
    ↓
Wait for n8n (max 60s)
    ↓
Read /shared/n8n-modules/n8n/package.json → Current Version
    ↓
Read /app/data/.n8n-versions → Stored Version
    ↓
Versions Match?  ──NO──→  Run: npm run rebuild
    ↓                           ↓
   YES                    Scan n8n packages
    ↓                           ↓
Use cached              Build new nodes.db
nodes.db                         ↓
    ↓                    Save new version
    ↓ ← ──────────────────────┘
Start MCP Server
```

## Security Considerations

### Network Security
- Services communicate via internal Docker bridge network
- Only ports 5678 and 3000 exposed to host
- MCP runs in stdio mode (not exposed on network)

### Data Security
- Store `.env` file securely (not in git)
- Use strong random tokens for `AUTH_TOKEN`
- Consider using Docker secrets for production

### Access Control
- Change default n8n admin password
- Limit n8n to localhost if not exposing
- Use firewall to restrict access to ports 5678 and 3000

### Backup Strategy
- Regularly backup `n8n-data` and `mcp-data` volumes
- Test restore procedures
- Keep backups off-machine for safety

## Production Deployment

For production use:

1. **Use managed services**: Consider n8n Cloud instead of self-hosting
2. **Add reverse proxy**: Use nginx/Traefik with SSL
3. **Database backup**: Implement automated daily backups
4. **Monitoring**: Add health checks and alerts
5. **Updates**: Plan update schedule with downtime window
6. **Secrets management**: Use Docker Secrets or external secret store

## Getting Help

- **n8n Documentation**: https://docs.n8n.io/
- **MCP Documentation**: See [../README.md](../README.md)
- **Issue Reports**: Create an issue on GitHub
- **n8n Community**: https://community.n8n.io/

## See Also

- [../README.md](../README.md) - Main project documentation
- [../DOCKER_README.md](../DOCKER_README.md) - Docker image details
- [docker-compose.yml](../docker-compose.yml) - Full compose configuration
