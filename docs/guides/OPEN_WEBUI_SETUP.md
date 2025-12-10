# Open WebUI Integration Guide

Your n8n MCP Orchestrator now includes containerized Open WebUI for a professional, feature-rich web interface.

## What is Open WebUI?

Open WebUI is a self-hosted, lightweight, feature-rich web interface that runs completely offline and supports any LLM (local or remote). It provides:

- 🎨 Beautiful, modern chat interface
- 🔒 Private & secure (runs locally)
- 📁 Document management & RAG
- 🧠 Support for multiple LLM models
- 🐳 Full Docker containerization
- ⚙️ Model management & configuration
- 📊 Conversation history & organization
- 🔌 API integration capabilities

## Quick Start with Docker Compose

### Prerequisites

```bash
# Ensure Docker is installed
docker --version
docker-compose --version
```

### 1. Set Environment Variables

```bash
# Generate a secure token
export AUTH_TOKEN=$(openssl rand -base64 32)

# Optional: set other variables
export EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
export GENERATION_MODEL=Qwen/Qwen3-4B-Instruct
```

### 2. Start the Stack

```bash
# Start both Open WebUI and n8n MCP Backend
docker-compose -f docker-compose.open-webui.yml up -d

# Monitor the startup
docker-compose -f docker-compose.open-webui.yml logs -f
```

### 3. Access Open WebUI

Open your browser to:

```
http://localhost:3000
```

The interface will be ready once you see "✅ All services healthy"

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Open WebUI (Port 3000)                   │
│          Beautiful chat interface with all features           │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      │ HTTP/WebSocket
                      ▼
┌──────────────────────────────────────────────────────────────┐
│           n8n MCP Backend (Port 3001, internal)              │
│                  Nano LLM Learning System                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  - GraphRAG Learning Service                           │  │
│  │  - Embedding Model (Neural Graph Semanticist)          │  │
│  │  - Generation Model (Graph Update Strategist)          │  │
│  │  - Pattern History & Evidence Tracking                 │  │
│  │  - Real-time Learning Progress                         │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Docker Compose Services

### open-webui
- **Port**: 3000 (web UI)
- **Image**: ghcr.io/open-webui/open-webui:latest
- **Features**:
  - Modern chat interface
  - Model management
  - Document upload & RAG
  - Conversation history
  - User management

### n8n-mcp-backend
- **Port**: 3001 (API, internal only)
- **Image**: Custom build from your Dockerfile
- **Features**:
  - Nano LLM orchestration
  - GraphRAG learning system
  - Workflow generation
  - Pattern discovery

### ollama (Optional)
- **Port**: 11434 (LLM inference)
- **Image**: ollama/ollama:latest
- **Status**: Disabled by default (use `--profile with-ollama` to enable)

## Configuration

### Environment Variables

Create a `.env` file in your project root:

```bash
# Required
AUTH_TOKEN=your-generated-secure-token-here

# Optional - Nano LLM Configuration
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
GENERATION_MODEL=Qwen/Qwen3-4B-Instruct

# Optional - Server Configuration
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:3000

# Optional - Open WebUI Configuration
WEBUI_SECRET_KEY=your-secret-key-for-webui
DEFAULT_MODELS=llama2
```

### Using Ollama for Local LLMs

To enable local LLM inference with Ollama:

```bash
# Start with Ollama profile
docker-compose -f docker-compose.open-webui.yml --profile with-ollama up -d

# Pull a model (in the container)
docker exec n8n-mcp-ollama ollama pull llama2

# Configure in Open WebUI:
# Settings → Models → Add Ollama
# URL: http://ollama:11434
```

## Common Commands

### View Logs

```bash
# All services
docker-compose -f docker-compose.open-webui.yml logs -f

# Specific service
docker-compose -f docker-compose.open-webui.yml logs -f open-webui
docker-compose -f docker-compose.open-webui.yml logs -f n8n-mcp-backend

# Tail last 100 lines
docker-compose -f docker-compose.open-webui.yml logs -f --tail=100
```

### Stop Services

```bash
# Stop all
docker-compose -f docker-compose.open-webui.yml down

# Stop with volume removal
docker-compose -f docker-compose.open-webui.yml down -v
```

### Restart Services

```bash
# Restart all
docker-compose -f docker-compose.open-webui.yml restart

# Restart specific service
docker-compose -f docker-compose.open-webui.yml restart open-webui
```

### Check Status

```bash
# View running containers
docker-compose -f docker-compose.open-webui.yml ps

# Check health
docker-compose -f docker-compose.open-webui.yml ps | grep -E "healthy|unhealthy"
```

## Using Open WebUI

### First Login

1. Open http://localhost:3000
2. Create admin account (first time only)
3. Set password
4. Login

### Adding Models

**Option 1: Remote Models (OpenAI, Anthropic, etc.)**
- Settings → Models → Connect to API
- Enter API key and model name
- Example: `gpt-4`, `claude-3-opus`, etc.

**Option 2: Local Models (Ollama)**
- Start Ollama service: `--profile with-ollama`
- Pull models: `docker exec n8n-mcp-ollama ollama pull llama2`
- Settings → Models → Add Ollama
- Enter: `http://ollama:11434`

### Integrating with n8n MCP Backend

Your backend is available at `http://n8n-mcp-backend:3001` from Open WebUI.

**Custom Tools Integration:**
- Settings → Admin Settings → Tools
- Add custom endpoint: `http://n8n-mcp-backend:3001/api/orchestrate`
- Configure authentication with your AUTH_TOKEN

### Using for Workflow Generation

1. Start a new conversation
2. Describe your workflow in natural language:
   ```
   "I need a workflow that fetches data from an API
    and sends it to Slack when triggered"
   ```
3. The system will:
   - Generate workflow nodes and connections
   - Display GraphRAG pattern matches
   - Show learning progress
   - Submit feedback automatically

### Monitoring Learning Progress

Access learning metrics:
- Direct: `http://localhost:3001/api/learning/progress`
- Via Open WebUI: Custom tools dashboard

## Persistence

### Data Volumes

Data is persisted in Docker volumes:

```bash
# Open WebUI data
docker volume ls | grep open-webui-data

# Ollama models (if enabled)
docker volume ls | grep ollama-data
```

### Backing Up

```bash
# Backup Open WebUI data
docker run --rm -v open-webui-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/open-webui-backup.tar.gz -C /data .

# Restore Open WebUI data
docker run --rm -v open-webui-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/open-webui-backup.tar.gz -C /data
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port in docker-compose
export WEB_PORT=3001  # Maps to internal port 8080
```

### Services Not Starting

```bash
# Check logs
docker-compose -f docker-compose.open-webui.yml logs -f

# Common issues:
# - PORT already in use
# - Docker daemon not running
# - Insufficient disk space
```

### Open WebUI Not Responding

```bash
# Restart the service
docker-compose -f docker-compose.open-webui.yml restart open-webui

# Check health
docker-compose -f docker-compose.open-webui.yml ps
```

### Backend API Not Accessible from Open WebUI

```bash
# Check network connectivity
docker-compose -f docker-compose.open-webui.yml exec open-webui \
  curl -v http://n8n-mcp-backend:3001/health

# Check firewall/networking
docker network inspect n8n-mcp-network
```

## Performance Optimization

### Memory Management

```bash
# Monitor resource usage
docker stats

# Limit memory per service (add to docker-compose):
services:
  open-webui:
    deploy:
      resources:
        limits:
          memory: 4G
```

### Database Optimization

The backend uses SQLite with optimized indexes:
- Ensure sufficient disk space
- Use SSD for better performance
- Monitor database size: `du -sh nodes.db`

## Security Considerations

### Important

⚠️ **Production Use**: For production deployment:

1. **Change Secret Keys**:
   ```bash
   export WEBUI_SECRET_KEY=$(openssl rand -base64 32)
   export AUTH_TOKEN=$(openssl rand -base64 32)
   ```

2. **Use HTTPS**:
   - Configure reverse proxy (nginx)
   - Use Let's Encrypt SSL certificates
   - Example: See production-docker-compose.yml

3. **Disable Public Access**:
   - Don't expose port 3000 publicly
   - Use VPN or private network
   - Implement rate limiting

4. **Enable Authentication**:
   - Set strong admin password
   - Enable 2FA if available
   - Use API keys instead of passwords

## Next Steps

1. ✅ Start the stack: `docker-compose -f docker-compose.open-webui.yml up -d`
2. ✅ Access Open WebUI: `http://localhost:3000`
3. ✅ Configure models in settings
4. ✅ Describe workflows in natural language
5. ✅ Monitor learning progress in dashboard
6. ✅ Watch Nano LLMs improve recommendations

## Documentation

- **System Architecture**: See NANO_LLM_LEARNING_SYSTEM.md
- **API Reference**: See SYSTEM_STATUS.md
- **Project Overview**: See CLAUDE.md
- **Open WebUI Docs**: https://docs.openwebui.com
- **Docker Docs**: https://docs.docker.com

## Support

For issues:
1. Check logs: `docker-compose -f docker-compose.open-webui.yml logs -f`
2. Verify containers: `docker-compose -f docker-compose.open-webui.yml ps`
3. Check health endpoints: `curl http://localhost:3000` and `curl http://localhost:3001/health`

---

Your Nano LLM-driven orchestrator is now ready with Open WebUI! 🚀
