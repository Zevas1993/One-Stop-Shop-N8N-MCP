# DOCKER DEPLOYMENT CHECKLIST

**Date Created:** October 30, 2025
**Status:** ✅ READY FOR PHASE 5.6 IMPLEMENTATION
**Purpose:** Guide for deploying Grok-enhanced n8n MCP Server in Docker

---

## PRE-DEPLOYMENT REQUIREMENTS

### System Requirements

#### Hardware - CPU Options
```
Minimum (4GB RAM):
  ✓ 4GB RAM available
  ✓ 10GB free disk space (models)
  ✓ Dual-core CPU @ 2GHz+
  ✓ Performance: ~1 query/second

Recommended (8GB RAM):
  ✓ 8GB RAM available
  ✓ 20GB free disk space
  ✓ Quad-core CPU @ 2.5GHz+
  ✓ Performance: ~5 queries/second

Optimal (16GB+ RAM):
  ✓ 16GB+ RAM available
  ✓ 30GB free disk space
  ✓ 6+ core CPU @ 2.5GHz+
  ✓ Performance: ~10+ queries/second
```

#### Hardware - GPU Options
```
NVIDIA GPU (Optional but beneficial):
  ✓ NVIDIA graphics card (GTX 1060+, RTX series)
  ✓ CUDA Compute Capability 3.5+
  ✓ 6GB+ VRAM (for larger models)
  ✓ Performance gain: 5-10x faster inference

CPU-Only (Always works):
  ✓ Fallback path always available
  ✓ No GPU installation needed
  ✓ Slower but stable
  ✓ Good for development/testing
```

#### Software Requirements
```
Docker Desktop:
  ✓ Version: 4.10+ (all platforms)
  ✓ Download: https://www.docker.com/products/docker-desktop/
  ✓ Disk: 50GB available (Docker daemon storage)

Operating Systems:
  ✓ Windows 10/11 (WSL2 enabled)
  ✓ macOS 11+ (Intel or Apple Silicon)
  ✓ Linux (Ubuntu 20.04+, Fedora 35+, etc.)

Browser (for UI):
  ✓ Any modern browser (Chrome, Firefox, Safari, Edge)
  ✓ Cookies enabled
  ✓ JavaScript enabled
```

### Pre-Deployment Checklist

```
Hardware Preparation:
  [ ] Verify 10GB free disk space
  [ ] Note RAM amount (4/8/16/32GB+)
  [ ] Confirm GPU presence (if applicable)
  [ ] Test CPU/GPU is functional

Software Preparation:
  [ ] Docker Desktop installed & running
  [ ] WSL2 enabled (Windows only)
  [ ] Docker running status: docker ps (should succeed)
  [ ] Git installed (to clone repository)

Network Preparation:
  [ ] Internet connection available (model download)
  [ ] Port 8000 available (API)
  [ ] Port 3000 available (UI)
  [ ] Port 5678 available (n8n, optional)
  [ ] Can reach Hugging Face (model downloads)

Credentials Prepared:
  [ ] n8n API URL noted (if using existing instance)
  [ ] n8n API key generated (if using existing instance)
  [ ] Auth token generated for MCP server
```

---

## DOCKER BUILD & DEPLOYMENT

### Step 1: Clone Repository (5 minutes)
```bash
# Clone the repository
git clone https://github.com/Zevas1993/One-Stop-Shop-N8N-MCP.git
cd One-Stop-Shop-N8N-MCP

# Verify directory structure
ls -la
# Should show: Dockerfile, docker-compose.yml, .dockerignore, etc.
```

**Verification Checklist:**
```
[ ] Repository cloned successfully
[ ] Dockerfile present
[ ] docker-compose.yml present
[ ] .dockerignore present
[ ] python/ directory exists
[ ] src/ directory exists
```

### Step 2: Create Configuration Files (2 minutes)
```bash
# Copy environment template
cp .env.example .env

# Edit configuration (add your settings)
# On Windows (PowerShell):
notepad .env

# On Mac/Linux:
nano .env
# Or: vim .env
```

**Configuration File (.env):**
```bash
# Server Configuration
NODE_ENV=production
LOG_LEVEL=info
AUTH_TOKEN=your-secure-token-here

# n8n Configuration (optional)
N8N_WEBHOOK_URL=http://localhost:5678

# Port Configuration
API_PORT=8000
UI_PORT=3000
N8N_PORT=5678

# Resource Configuration
MEMORY_LIMIT=4g
CPU_LIMIT=4

# Model Configuration (leave empty for auto-detection)
# EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
# LLM_MODEL=Qwen/Qwen2-7B-Instruct
```

**Verification Checklist:**
```
[ ] .env file created
[ ] AUTH_TOKEN set (strong token: 32+ chars)
[ ] N8N_WEBHOOK_URL configured (if using n8n)
[ ] Ports configured correctly
[ ] MEMORY_LIMIT matches hardware (4g, 8g, 16g, etc.)
```

### Step 3: Build Docker Image (10-15 minutes)
```bash
# Build the Docker image
docker compose build

# Or verbose output:
docker compose build --progress=plain
```

**During Build Process:**
```
Step 1: Building UI (React)
  - npm install
  - npm run build
  - Duration: 3-5 minutes

Step 2: Building Python layer
  - pip install requirements.txt
  - Download models (if included)
  - Duration: 3-5 minutes

Step 3: Building Node.js layer
  - npm install
  - Duration: 2-3 minutes

Step 4: Creating final image
  - Combining layers
  - Duration: 1-2 minutes

Total: 10-15 minutes
Image Size: ~1.2-1.5GB
```

**Build Troubleshooting:**
```
Problem: "Cannot download models - no internet"
Solution: Build on machine with internet, then transfer

Problem: "Docker run out of disk space"
Solution: docker system prune -a && docker volume prune

Problem: "Build takes 30+ minutes"
Solution: Check system performance, close other apps

Problem: "Permission denied /var/run/docker.sock"
Solution: sudo usermod -aG docker $USER (Linux)

Verification Checklist:
[ ] Build completed successfully
[ ] No errors in build output
[ ] Image created: docker images | grep n8n-mcp
```

### Step 4: Start Docker Container (2-5 minutes)
```bash
# Start the container
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f

# Or detailed status
docker compose logs --tail=50
```

**Startup Sequence (watch logs):**
```
✓ supervisord starting
✓ api process started (uvicorn)
✓ ui process started (npm)
✓ tools process started (node)
✓ python process started (lightrag_service.py)

Expected log messages:
  "INFO: Uvicorn running on http://0.0.0.0:8000"
  "UI listening on port 3000"
  "Node.js tools server ready"
  "Python service initialized"

Duration: 1-2 minutes (first run)
Duration: <30 seconds (subsequent restarts)
```

**Common Startup Issues:**
```
Issue: "Port 8000 already in use"
Solution: docker compose down && lsof -i :8000 (find what's using it)

Issue: "Out of memory during startup"
Solution: Increase Docker memory limit (Settings → Resources)

Issue: "Models downloading forever"
Solution: Check internet, try --timeout 300 with docker

Issue: "Python process crashes on startup"
Solution: Check logs: docker compose logs python

Verification Checklist:
[ ] Container started successfully
[ ] All 4 processes running (api, ui, tools, python)
[ ] No error messages in logs
[ ] Health check passing
```

### Step 5: Verify Deployment (5 minutes)

#### Health Check
```bash
# Check overall health
curl http://localhost:8000/health

# Expected response:
{
  "status": "healthy",
  "components": {
    "api": { "status": "ok" },
    "ui": { "status": "ok" },
    "tools": { "status": "ok" },
    "python": { "status": "ok" },
    "models": { "loaded": true }
  }
}
```

#### API Test
```bash
# Test API endpoint
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'

# Expected: JSON response with greeting
```

#### UI Access
```
Open browser: http://localhost:3000

Expected:
  - n8n MCP UI loads
  - Chat interface visible
  - File upload button available
  - No 404 or connection errors
```

**Verification Checklist:**
```
[ ] http://localhost:8000/health returns healthy
[ ] API endpoint responds to requests
[ ] UI loads in browser at localhost:3000
[ ] Chat interface functional
[ ] File upload visible
[ ] No console errors
```

---

## POST-DEPLOYMENT CONFIGURATION

### Configure n8n Integration (Optional)
```bash
# If you have an n8n instance running:
# 1. Get n8n API URL (usually http://localhost:5678)
# 2. Create API token in n8n:
#    Settings → API → Create token
# 3. Update docker-compose environment:

export N8N_API_URL=http://localhost:5678
export N8N_API_KEY=your-api-key-here

# Restart container with new settings
docker compose restart api
```

### Configure Authentication
```bash
# Set strong AUTH_TOKEN
export AUTH_TOKEN=$(openssl rand -base64 32)

# Update .env file
echo "AUTH_TOKEN=$AUTH_TOKEN" >> .env

# Restart with new token
docker compose restart
```

### Performance Tuning
```bash
# Check current resource usage
docker stats

# Adjust if needed (docker-compose.yml):
deploy:
  resources:
    limits:
      cpus: '4'           # 4 CPU cores max
      memory: 8G          # 8GB memory max
    reservations:
      cpus: '2'           # Reserve minimum
      memory: 4G

# Restart after changes
docker compose restart
```

---

## VALIDATION & TESTING

### Pre-Production Validation

#### Test 1: Basic Functionality (5 minutes)
```bash
# Test search functionality
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Find HTTP Request node"}'

# Expected: Returns workflow JSON with HTTP Request node
```

#### Test 2: Document Upload (5 minutes)
```bash
# Upload and parse a test document
curl -X POST http://localhost:8000/upload-doc \
  -F "file=@test-invoice.pdf"

# Expected: Document parsed, text extracted
```

#### Test 3: Performance (10 minutes)
```bash
# Run 100 sequential queries
for i in {1..100}; do
  time curl -s http://localhost:8000/chat \
    -H "Content-Type: application/json" \
    -d '{"message": "test"}' > /dev/null
done

# Expected P50 latency: <100ms
# Expected P99 latency: <500ms
```

#### Test 4: Error Handling (5 minutes)
```bash
# Test error recovery by killing Python process
docker compose kill python

# Check that fallback works
curl http://localhost:8000/chat

# Should return degraded but working response
# Expected: Keyword search (no embeddings)

# Verify auto-restart
sleep 5
docker compose ps

# Expected: Python process restarted
```

### Production Validation Checklist
```
Functionality:
  [ ] Chat interface works
  [ ] File upload works
  [ ] Workflow generation works
  [ ] Query latency <500ms

Error Handling:
  [ ] Python crash triggers fallback
  [ ] Graceful degradation works
  [ ] Auto-recovery functions
  [ ] Error messages clear

Performance:
  [ ] P50 latency <100ms
  [ ] P99 latency <500ms
  [ ] Memory stable under load
  [ ] CPU usage reasonable

Security:
  [ ] AUTH_TOKEN required
  [ ] Credentials not in logs
  [ ] File uploads temporary
  [ ] No cross-user data leaks

Monitoring:
  [ ] Health endpoint working
  [ ] Metrics available
  [ ] Logs being collected
  [ ] Errors being logged
```

---

## TROUBLESHOOTING

### Startup Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Container won't start | Image build failed | `docker compose build --no-cache` |
| Port already in use | Another service on port | `lsof -i :8000` then kill process |
| Out of memory | Insufficient Docker memory | Increase Docker memory limit |
| Models won't download | Network issue | Check internet, try manual download |
| Python crashes | Incompatible Python version | Check Python version match |

### Runtime Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Slow responses (>5s) | Model loading or inference slow | Check GPU enabled, monitor resources |
| "Embedding service down" | Python subprocess crashed | Check logs: `docker compose logs python` |
| UI won't load | Node.js server issue | Check logs: `docker compose logs ui` |
| "Out of memory" | Cache too large | Reduce CACHE_SIZE in config |
| High CPU usage | Model inference | Normal, check if query load too high |

### Performance Issues

| Problem | Solution |
|---------|----------|
| First query takes 30s | Normal (model loading), cached after |
| Subsequent queries slow | Check cache hit rate in metrics |
| Out of memory after hours | Check for memory leaks, restart container |
| High latency spike | May be model loading, check logs |

### Docker Issues

```bash
# View full logs
docker compose logs --tail=200

# Restart specific service
docker compose restart python

# Reset everything
docker compose down -v
docker system prune -a
docker compose up -d

# Check resource usage
docker stats

# Inspect container
docker compose ps
docker compose inspect mcp

# Get into container (for debugging)
docker compose exec mcp bash
```

---

## MONITORING & MAINTENANCE

### Health Monitoring
```bash
# Daily health check
curl http://localhost:8000/health

# Expected: All components "ok"
# Check: Response time <1s
```

### Log Monitoring
```bash
# View recent logs
docker compose logs --tail=50

# Watch logs in real-time
docker compose logs -f

# Filter by service
docker compose logs -f python
docker compose logs -f api
```

### Performance Monitoring
```bash
# Get metrics
curl http://localhost:8000/metrics

# Get bridge status
curl http://localhost:8000/bridge-status

# Check resource usage
docker stats mcp

# Expected:
# - Memory: <2GB for 4GB machine
# - CPU: Idle <5%, Active <80%
```

### Backup & Recovery
```bash
# Backup persistent data
docker compose exec mcp tar czf /tmp/backup.tar.gz /app/db /app/user_state

# Download backup
docker compose cp mcp:/tmp/backup.tar.gz ./backup.tar.gz

# Restore from backup
docker compose cp ./backup.tar.gz mcp:/tmp/
docker compose exec mcp tar xzf /tmp/backup.tar.gz
```

### Updates
```bash
# Check for updates
git pull origin main

# Rebuild image
docker compose build

# Restart container
docker compose restart

# Verify update successful
docker compose logs api
```

---

## PRODUCTION DEPLOYMENT CHECKLIST

### Pre-Launch
```
Infrastructure:
  [ ] Hardware meets minimum requirements
  [ ] Docker Desktop installed and running
  [ ] Internet connection stable
  [ ] All required ports (8000, 3000, 5678) available

Configuration:
  [ ] .env file created with all settings
  [ ] AUTH_TOKEN strong (32+ characters)
  [ ] n8n credentials configured (if applicable)
  [ ] Memory limits appropriate for hardware

Build:
  [ ] Docker image built successfully (<15 min)
  [ ] Image size documented (~1.2GB)
  [ ] No build errors in output

Deployment:
  [ ] Container starts successfully
  [ ] All 4 processes running
  [ ] Health check passes
  [ ] UI loads in browser
  [ ] API responds to requests
```

### Launch & Validation
```
Functionality:
  [ ] Chat works end-to-end
  [ ] File upload parses correctly
  [ ] Workflow generation works
  [ ] Error handling graceful

Performance:
  [ ] Latency <500ms (P99)
  [ ] Memory stable
  [ ] CPU reasonable
  [ ] No crashes in first hour

Security:
  [ ] Authentication enforced
  [ ] Logs don't contain secrets
  [ ] File uploads cleaned up
  [ ] No default passwords

Monitoring:
  [ ] Health endpoint working
  [ ] Logs being collected
  [ ] Metrics available
  [ ] Alerting configured (optional)
```

### Post-Launch
```
Operations:
  [ ] Daily health checks established
  [ ] Log monitoring enabled
  [ ] Backup schedule set
  [ ] Update procedure documented

Documentation:
  [ ] Team trained on system
  [ ] Troubleshooting guide shared
  [ ] Monitoring alerts explained
  [ ] Escalation procedures defined

Support:
  [ ] User feedback channels established
  [ ] Issue tracking set up
  [ ] Performance baselines documented
  [ ] Optimization opportunities identified
```

---

## APPENDIX: QUICK START (TL;DR)

```bash
# 1. Clone & enter directory
git clone https://github.com/Zevas1993/One-Stop-Shop-N8N-MCP.git
cd One-Stop-Shop-N8N-MCP

# 2. Create configuration
cp .env.example .env
# Edit .env with your AUTH_TOKEN

# 3. Build & start
docker compose build
docker compose up -d

# 4. Verify
curl http://localhost:8000/health
# Expected: { "status": "healthy" }

# 5. Open in browser
# http://localhost:3000

# Done! You're running n8n MCP with Grok integration
```

---

## SUPPORT & ESCALATION

### Getting Help
```
Issue: Check logs first
  docker compose logs --tail=100

Issue: Specific service down
  docker compose restart [service]

Issue: Data corruption
  docker compose down -v
  # Restore from backup (see above)

Issue: Persistent problem
  Escalate: See TROUBLESHOOTING section
```

---

**Status:** ✅ READY FOR PHASE 5.6 IMPLEMENTATION
**Next Action:** Implement Phase 5.6 (Docker Integration)
