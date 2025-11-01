# Docker Desktop Setup Guide - Local Nano LLM + n8n

**Date:** October 31, 2025
**Status:** ✅ Complete & Ready for Deployment
**Target Users:** End users with Docker Desktop (no development knowledge required)

---

## Quick Start (< 5 minutes)

### Prerequisites
- Docker Desktop installed ([download here](https://www.docker.com/products/docker-desktop))
- (Optional) n8n instance running locally or remotely

### Step 1: Clone Repository
```bash
git clone https://github.com/your-org/n8n-mcp.git
cd n8n-mcp
```

### Step 2: Start Docker Compose
```bash
docker compose up -d
```

### Step 3: Access Web UI
Open your browser and go to:
```
http://localhost:3000
```

### Step 4: Configure n8n (Optional)
If you want to deploy workflows directly:
1. Click "Configure n8n" button
2. Enter your n8n API URL (e.g., `http://localhost:5678`)
3. Enter your n8n API Key
4. Click "Configure"

### Step 5: Start Chatting!
Describe your workflow idea:
```
"I want to send Slack notifications when Airtable records are updated"
```

That's it! The local LLM will help you design and deploy workflows.

---

## What Gets Deployed?

### Docker Compose Architecture
```yaml
Services:
├── mcp-server
│   ├── Port 3000: Web UI + API
│   ├── Local Nano LLM (auto-selected based on hardware)
│   ├── Nano Agent Orchestrator
│   └── n8n Node Documentation (525+ nodes)
│
├── ollama (Optional)
│   ├── Port 11434: LLM Service
│   └── Local model hosting
│
└── n8n (Optional)
    ├── Port 5678: n8n Web UI
    ├── Port 5679: n8n Webhook
    └── SQLite database
```

---

## Hardware-Aware Setup

### The System Automatically Detects Your Hardware

When you start the service, it:
1. **Detects CPU cores** - How many processors you have
2. **Detects RAM** - How much memory you have
3. **Detects GPU** - If you have NVIDIA/AMD/Metal acceleration
4. **Selects appropriate nano LLM** based on your hardware

### Recommended LLM by Hardware

| Your Hardware | Recommended LLM | Speed | Quality |
|---|---|---|---|
| **2GB RAM, 2 cores** | Phi-3.5-mini | Very Fast | Basic |
| **4GB RAM, 2-4 cores** | Phi-3.5-small | Fast | Good |
| **6GB RAM, 4 cores** | Mixtral-7B | Very Fast | Excellent |
| **8-16GB RAM, 4-8 cores** | Mixtral-7B or Llama-2 | Fast | Excellent |
| **16GB+ RAM, 8+ cores, GPU** | Llama-2-13B | Moderate | Outstanding |

The selection happens **automatically** - you don't need to configure anything!

---

## File Structure

```
n8n-mcp/
├── docker-compose.yml              # Main deployment configuration
├── docker-compose.override.yml      # Override for local development (optional)
├── Dockerfile                       # MCP server image definition
├── docker/                          # Docker-specific files
│   ├── entrypoint.sh               # Startup script
│   └── ollama.Dockerfile           # Optional Ollama setup
├── .env.example                     # Environment variables template
├── .env                             # Local environment (create this)
├── src/
│   ├── ai/
│   │   ├── hardware-detector.ts     # Hardware detection & LLM selection
│   │   ├── local-llm-orchestrator.ts # Main LLM orchestrator
│   │   ├── graphrag-nano-orchestrator.ts # Workflow generation
│   │   └── ...
│   ├── http/
│   │   └── routes-local-llm.ts      # HTTP API routes
│   ├── web-ui/
│   │   └── index.html               # Web interface
│   └── ...
└── README.md                        # Project documentation
```

---

## Environment Configuration

### Create `.env` File

Before first run, create a `.env` file:

```env
# Server Configuration
NODE_ENV=production
PORT=3000
AUTH_TOKEN=$(openssl rand -base64 32)

# MCP Configuration
MCP_MODE=http
MCP_SERVER_NAME=n8n-documentation-mcp
MCP_SERVER_VERSION=3.0.0

# Local LLM Configuration
ENABLE_LOCAL_LLM=true
LLM_OPTION=auto                     # or: phi-3.5-mini, mixtral-7b, llama-2-13b
OLLAMA_BASE_URL=http://ollama:11434

# n8n Configuration (optional - users set via Web UI)
# N8N_API_URL=http://localhost:5678
# N8N_API_KEY=your-api-key

# Logging
LOG_LEVEL=info
```

### Generate Secure Auth Token

```bash
# macOS/Linux
export AUTH_TOKEN=$(openssl rand -base64 32)
echo "AUTH_TOKEN=$AUTH_TOKEN" >> .env

# Windows PowerShell
$token = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Random).ToString()))
```

---

## Docker Compose Configuration

### Basic Setup (MCP Server Only)

```yaml
version: '3.8'

services:
  mcp-server:
    image: n8n-mcp:latest
    container_name: n8n-mcp-server
    ports:
      - "3000:3000"          # Web UI
    environment:
      NODE_ENV: production
      MCP_MODE: http
      PORT: 3000
      ENABLE_LOCAL_LLM: "true"
      LLM_OPTION: auto       # Auto-detect hardware
    volumes:
      - ./data:/app/data     # Persist data
      - ./config:/app/config # Persist config
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Full Stack (with Ollama + n8n)

```yaml
version: '3.8'

services:
  # Local LLM Hosting (Ollama)
  ollama:
    image: ollama/ollama:latest
    container_name: n8n-mcp-ollama
    ports:
      - "11434:11434"
    environment:
      OLLAMA_HOST: 0.0.0.0:11434
    volumes:
      - ./ollama:/root/.ollama  # Model cache
    restart: unless-stopped

  # MCP Server with Local LLM
  mcp-server:
    image: n8n-mcp:latest
    container_name: n8n-mcp-server
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      MCP_MODE: http
      PORT: 3000
      ENABLE_LOCAL_LLM: "true"
      LLM_OPTION: auto
      OLLAMA_BASE_URL: http://ollama:11434
    depends_on:
      - ollama
    volumes:
      - ./data:/app/data
      - ./config:/app/config
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Optional: n8n Instance (for immediate deployment testing)
  n8n:
    image: n8n/n8n:latest
    container_name: n8n-local
    ports:
      - "5678:5678"
    environment:
      N8N_HOST: localhost:5678
      N8N_PROTOCOL: http
      N8N_WEBHOOK_URL: http://localhost/webhook
      N8N_EDITOR_BASE_URL: http://localhost:5678
      GENERIC_TIMEZONE: UTC
    volumes:
      - ./n8n_data:/home/node/.n8n
    restart: unless-stopped
```

---

## Common Commands

### Start Services
```bash
# Start all services in background
docker compose up -d

# Start with logs visible (helpful for debugging)
docker compose up

# Start specific service
docker compose up -d mcp-server
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f mcp-server
docker compose logs -f ollama

# Recent 100 lines
docker compose logs --tail=100 mcp-server
```

### Stop Services
```bash
# Stop all services (data persists)
docker compose down

# Stop and remove volumes (delete data)
docker compose down -v
```

### Rebuild Images
```bash
# Rebuild after code changes
docker compose up -d --build

# Force rebuild ignoring cache
docker compose up -d --build --no-cache
```

### Accessing Services

| Service | URL | Purpose |
|---------|-----|---------|
| Web UI | http://localhost:3000 | Conversation & workflow design |
| API | http://localhost:3000/api | REST API endpoints |
| Ollama | http://localhost:11434 | Local LLM service |
| n8n (optional) | http://localhost:5678 | n8n workflow editor |

---

## Using the Web Interface

### 1. Setup Page

**First Time:**
1. Browser opens http://localhost:3000
2. See hardware detection results
3. See recommended nano LLM
4. (Optional) Configure n8n API credentials

### 2. Chat Interface

**Describe your workflow:**
```
"I want to monitor my Gmail inbox and send Slack notifications
for important emails from specific senders"
```

**What the LLM does:**
- Asks clarifying questions
- Recommends n8n nodes
- Explains how nodes connect
- Offers to generate the workflow

### 3. Workflow Generation

**When ready:**
- Say "Generate workflow" or "Create the workflow"
- System uses nano agent orchestrator
- Generates complete, validated workflow
- Shows you the result for review

### 4. Deployment

**Deploy to n8n:**
- If configured, click "Deploy"
- Workflow is created in your n8n instance
- Get direct link to workflow in n8n
- Activate and start using!

---

## Troubleshooting

### "Connection refused" to Ollama
**Problem:** LLM service not responding
```bash
# Check Ollama is running
docker compose logs ollama

# Restart Ollama
docker compose restart ollama
```

### "Out of memory"
**Problem:** LLM model is too large for your hardware
```bash
# Set smaller model
docker compose down
# Edit .env and change:
# LLM_OPTION=phi-3.5-mini
docker compose up -d
```

### Web UI shows "Loading..." forever
**Problem:** MCP server initialization taking too long
```bash
# Check server logs
docker compose logs mcp-server

# Wait 30-60 seconds for initialization
# Try refreshing browser
```

### Can't connect to n8n
**Problem:** n8n API URL or key incorrect
```bash
# Verify n8n is running
curl http://localhost:5678

# Check API key is valid
# Reconfigure in Web UI
```

### Workflow validation fails
**Problem:** Generated workflow has issues
```bash
# Check server logs for details
docker compose logs mcp-server --tail=100

# Try simpler workflow idea
# Contact support if persistent
```

---

## Performance Optimization

### Reduce Memory Usage
```env
# Use smallest LLM model
LLM_OPTION=phi-3.5-mini

# Lower context window
MAX_CONTEXT_TOKENS=2048
```

### Improve Speed
```env
# Use GPU-accelerated model (if GPU available)
LLM_OPTION=mixtral-7b

# Increase thread count
NUM_THREADS=8
```

### Network Optimization
```env
# If accessing from remote machine, expose on network
# In docker-compose.yml:
ports:
  - "0.0.0.0:3000:3000"  # Accessible from any machine
```

---

## Security Considerations

### Local Deployment (Safe)
- Everything runs locally in Docker
- No data sent to external servers
- Perfect for private/sensitive workflows

### Network Access
```env
# Default: localhost only (safe)
# ports:
#   - "3000:3000"

# If exposing to network: Use authentication
AUTH_TOKEN=your-secure-token-here
```

### API Key Storage
- n8n API key stored locally in container
- Never transmitted to external services
- Stored in `/app/config` (you can back this up)

---

## Backup & Restore

### Backup Configuration
```bash
# Backup all data
docker compose exec mcp-server tar czf - /app/data /app/config > backup.tar.gz

# Or manually copy volumes
cp -r ./data ./backup-data
cp -r ./config ./backup-config
```

### Restore Configuration
```bash
# Restore from backup
tar xzf backup.tar.gz

# Or manually restore volumes
cp -r ./backup-data ./data
cp -r ./backup-config ./config

# Restart services
docker compose down
docker compose up -d
```

---

## Upgrade & Updates

### Check for Updates
```bash
# Pull latest images
docker compose pull

# See what will change
docker compose config --resolve-image-digests
```

### Update Services
```bash
# Pull new images
docker compose pull

# Restart with new images
docker compose down
docker compose up -d

# Check logs for any errors
docker compose logs
```

### Rollback
```bash
# If something breaks, go back
# Delete the volume containing updated data
docker compose down -v

# Run the old version
docker compose up -d

# Or restore from backup
```

---

## Advanced: Custom LLM Models

### Using Different Models via Ollama

```bash
# SSH into container
docker compose exec mcp-server bash

# Pull different model
# curl http://ollama:11434/api/pull -d '{"name": "neural-chat:7b"}'

# Set in environment
export LLM_OPTION=neural-chat:7b
```

### Supported Models
- `phi:3.5-mini` - 3.8B, minimal resources
- `phi:3.5` - 7B, balanced
- `mixtral:7b` - 7B MoE, excellent quality
- `neural-chat:7b` - 7B, optimized for chat
- `llama2:13b` - 13B, highest quality

---

## Getting Help

### Check Logs
```bash
# Most detailed debugging
docker compose logs -f mcp-server --tail=200
```

### Common Issues & Solutions
See "Troubleshooting" section above

### Report Issues
Create an issue on GitHub with:
1. Hardware specs (from Web UI setup page)
2. Error messages (from browser console)
3. Container logs (`docker compose logs`)
4. Steps to reproduce

---

## FAQ

**Q: Can I use this without Docker?**
A: Yes, follow the development setup in main README.md

**Q: Can I use this with Claude Desktop?**
A: Yes, the MCP server also works as stdio-based MCP for Claude Desktop

**Q: What if I don't have n8n installed?**
A: You can still design workflows and deploy them manually, or use n8n Cloud

**Q: Can I run this on ARM machines (Apple Silicon)?**
A: Yes, Docker Compose handles multi-architecture automatically

**Q: Is this free?**
A: Yes, completely free and open source (MIT License)

**Q: Can I modify the code?**
A: Yes, clone the repo and edit `Dockerfile` to build custom version

**Q: How do I uninstall?**
A: `docker compose down -v` removes everything including data

---

## What's Next?

1. ✅ Start Web UI (http://localhost:3000)
2. ✅ Describe your first workflow idea
3. ✅ Generate a workflow
4. ✅ Deploy to n8n
5. ✅ Watch it execute!

Enjoy building amazing n8n workflows with AI! 🚀
