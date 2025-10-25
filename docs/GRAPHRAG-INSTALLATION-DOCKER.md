# GraphRAG Docker Installation Guide

**Version:** 3.0.0-beta
**Last Updated:** 2025-01-19
**Platform:** Docker (all platforms: Windows, Linux, macOS)

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [System Requirements](#system-requirements)
3. [Installation Methods](#installation-methods)
4. [Configuration](#configuration)
5. [Usage](#usage)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

**30 seconds to GraphRAG in Docker:**

```bash
# 1. Install Docker (if needed)
# https://www.docker.com/products/docker-desktop

# 2. Pull the image
docker pull ghcr.io/czlonkowski/n8n-mcp:latest

# 3. Create auth token
export AUTH_TOKEN=$(openssl rand -base64 32)

# 4. Run container
docker run -d \
  --name n8n-mcp \
  -e AUTH_TOKEN=$AUTH_TOKEN \
  -p 3000:3000 \
  ghcr.io/czlonkowski/n8n-mcp:latest

# 5. Test connection
curl -H "Authorization: Bearer $AUTH_TOKEN" http://localhost:3000/health

# 6. Configure Claude Desktop (see below)
```

---

## System Requirements

### Docker Installation

**Minimum:**
- Docker Engine 20.10+
- Docker Compose 1.29+ (optional, for docker-compose.yml)
- 4GB available RAM
- 5GB disk space (for image + data)

**Install Docker:**

```bash
# macOS/Windows
# Download Docker Desktop from https://www.docker.com/products/docker-desktop

# Linux (Ubuntu)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Linux (Fedora)
sudo dnf install docker

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker
```

### Resource Requirements

```
┌─────────────────┬──────────┬──────────┬──────────┐
│ Environment     │ CPU      │ RAM      │ Disk     │
├─────────────────┼──────────┼──────────┼──────────┤
│ Minimal         │ 1 core   │ 512MB    │ 3GB      │
│ Standard        │ 2 cores  │ 2GB      │ 10GB     │
│ Recommended     │ 4 cores  │ 4GB      │ 20GB     │
│ High Performance│ 8+ cores │ 8GB+     │ 50GB+    │
└─────────────────┴──────────┴──────────┴──────────┘
```

**Configure in Docker Desktop:**
- Settings → Resources → CPUs: 2-4 (recommended 4)
- Settings → Resources → Memory: 2-4 GB (recommended 4)
- Settings → Resources → Disk: 20GB (recommended 30GB)

---

## Installation Methods

### Method 1: Docker Run (Simplest)

**For single-container deployment**

```bash
# 1. Generate secure token
export AUTH_TOKEN=$(openssl rand -base64 32)
echo "Your token: $AUTH_TOKEN"  # Save this!

# 2. Run container
docker run -d \
  --name n8n-mcp \
  --restart unless-stopped \
  -e AUTH_TOKEN=$AUTH_TOKEN \
  -e NODE_ENV=production \
  -e MCP_MODE=http \
  -p 3000:3000 \
  -v n8n-mcp-data:/app/data \
  ghcr.io/czlonkowski/n8n-mcp:latest

# 3. Verify running
docker logs n8n-mcp
docker ps | grep n8n-mcp

# 4. Test health
curl -H "Authorization: Bearer $AUTH_TOKEN" http://localhost:3000/health

# 5. Check container stats
docker stats n8n-mcp
```

**Stop and remove:**
```bash
docker stop n8n-mcp
docker rm n8n-mcp
docker volume rm n8n-mcp-data
```

### Method 2: Docker Compose (Recommended)

**For more control and easier management**

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  n8n-mcp:
    image: ghcr.io/czlonkowski/n8n-mcp:latest
    container_name: n8n-mcp
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      MCP_MODE: http
      PORT: 3000
      AUTH_TOKEN: ${AUTH_TOKEN}
      GRAPH_DIR: /app/data/graph
      METRICS_GRAPHRAG: "false"
      DEBUG_MCP: "false"
    volumes:
      - n8n-mcp-data:/app/data
      - n8n-mcp-logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "-H", "Authorization: Bearer ${AUTH_TOKEN}", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - n8n-network

  # Optional: n8n instance linked to MCP
  n8n:
    image: n8nio/n8n:latest
    container_name: n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      N8N_PORT: 5678
      N8N_SECURE_COOKIE: "false"
    volumes:
      - n8n-data:/home/node/.n8n
    networks:
      - n8n-network
    depends_on:
      - n8n-mcp

volumes:
  n8n-mcp-data:
  n8n-mcp-logs:
  n8n-data:

networks:
  n8n-network:
    driver: bridge
```

**Start with Docker Compose:**

```bash
# 1. Create .env file with token
echo "AUTH_TOKEN=$(openssl rand -base64 32)" > .env

# 2. Start services
docker-compose up -d

# 3. View logs
docker-compose logs -f n8n-mcp

# 4. Stop services
docker-compose down

# 5. Stop and remove data
docker-compose down -v
```

### Method 3: From Source (Development)

**For customization and development**

```bash
# 1. Clone repository
git clone https://github.com/n8n-io/n8n-mcp.git
cd n8n-mcp

# 2. Build Docker image
docker build -t n8n-mcp:dev .

# 3. Run with volume mounts for development
docker run -it \
  --name n8n-mcp-dev \
  -e AUTH_TOKEN=dev-token \
  -e NODE_ENV=development \
  -e DEBUG_MCP=true \
  -p 3000:3000 \
  -v $(pwd):/app \
  n8n-mcp:dev

# 4. Install dependencies and rebuild in container
# Inside container:
npm install
npm run build
npm run start

# 5. View logs
docker logs -f n8n-mcp-dev
```

### Method 4: Kubernetes (Advanced)

**For production clusters**

Create `n8n-mcp-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: n8n-mcp
  namespace: n8n
spec:
  replicas: 2
  selector:
    matchLabels:
      app: n8n-mcp
  template:
    metadata:
      labels:
        app: n8n-mcp
    spec:
      containers:
      - name: n8n-mcp
        image: ghcr.io/czlonkowski/n8n-mcp:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: MCP_MODE
          value: "http"
        - name: PORT
          value: "3000"
        - name: AUTH_TOKEN
          valueFrom:
            secretKeyRef:
              name: n8n-mcp-secret
              key: auth-token
        volumeMounts:
        - name: data
          mountPath: /app/data
        - name: logs
          mountPath: /app/logs
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
            httpHeaders:
            - name: Authorization
              value: "Bearer $(AUTH_TOKEN)"
          initialDelaySeconds: 30
          periodSeconds: 10
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: n8n-mcp-pvc
      - name: logs
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: n8n-mcp
  namespace: n8n
spec:
  type: LoadBalancer
  ports:
  - port: 3000
    targetPort: 3000
  selector:
    app: n8n-mcp
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: n8n-mcp-pvc
  namespace: n8n
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

**Deploy to Kubernetes:**

```bash
# Create namespace
kubectl create namespace n8n

# Create secret
kubectl create secret generic n8n-mcp-secret \
  --from-literal=auth-token=$(openssl rand -base64 32) \
  -n n8n

# Deploy
kubectl apply -f n8n-mcp-deployment.yaml

# Check status
kubectl get pods -n n8n
kubectl logs -f deployment/n8n-mcp -n n8n
```

---

## Configuration

### Environment Variables

```bash
# Required
AUTH_TOKEN=your-secure-token        # Generate: openssl rand -base64 32
NODE_ENV=production                 # production or development
MCP_MODE=http                       # Should be 'http' for Docker
PORT=3000                           # Container port

# Optional
GRAPH_DIR=/app/data/graph          # Cache directory
METRICS_GRAPHRAG=false             # Enable metrics
DEBUG_MCP=false                    # Debug logging
BRIDGE_CACHE_MAX=100               # Cache size
MEM_GUARD_THRESHOLD_MB=512         # Memory threshold

# n8n Integration (optional)
N8N_API_URL=http://host.docker.internal:5678  # For Docker on Windows/Mac
N8N_API_KEY=n8n_api_xxx...        # Optional API key
```

### Using .env File

Create `.env` file:

```bash
AUTH_TOKEN=abc123def456ghi789...
NODE_ENV=production
MCP_MODE=http
PORT=3000
GRAPH_DIR=/app/data/graph
METRICS_GRAPHRAG=false
DEBUG_MCP=false
```

Use with Docker:

```bash
# Load from .env
docker run --env-file .env \
  -p 3000:3000 \
  ghcr.io/czlonkowski/n8n-mcp:latest

# Or with docker-compose
docker-compose up -d
# Automatically uses .env file
```

### Linking to Local n8n

**Option A: Using host.docker.internal (Windows/macOS)**

```bash
docker run -d \
  --name n8n-mcp \
  -e N8N_API_URL=http://host.docker.internal:5678 \
  -p 3000:3000 \
  ghcr.io/czlonkowski/n8n-mcp:latest
```

**Option B: Using Docker Compose (all platforms)**

```yaml
version: '3.8'
services:
  n8n-mcp:
    image: ghcr.io/czlonkowski/n8n-mcp:latest
    environment:
      N8N_API_URL: http://n8n:5678  # Service name resolves automatically
    depends_on:
      - n8n

  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
```

**Option C: Using network bridge (Linux)**

```bash
# Create network
docker network create n8n-net

# Start n8n
docker run --network n8n-net --name n8n n8nio/n8n

# Start MCP server
docker run --network n8n-net \
  -e N8N_API_URL=http://n8n:5678 \
  ghcr.io/czlonkowski/n8n-mcp:latest
```

---

## Usage

### Test Connectivity

```bash
# Get your auth token
echo $AUTH_TOKEN

# Test health endpoint
curl -H "Authorization: Bearer $AUTH_TOKEN" \
  http://localhost:3000/health

# Should return: {"ok":true,"uptime":...}

# Test a tool
curl -X POST \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"list_nodes","params":{},"id":1}' \
  http://localhost:3000/mcp
```

### View Logs

```bash
# Real-time logs
docker logs -f n8n-mcp

# Last 100 lines
docker logs -n 100 n8n-mcp

# With timestamps
docker logs --timestamps n8n-mcp

# Specific error level
docker logs n8n-mcp 2>&1 | grep -i error

# With docker-compose
docker-compose logs -f n8n-mcp
```

### Monitor Performance

```bash
# CPU and memory usage
docker stats n8n-mcp

# Process list inside container
docker top n8n-mcp

# Inspect container details
docker inspect n8n-mcp

# Network connections
docker exec n8n-mcp netstat -tulpn
```

### Execute Commands in Container

```bash
# Interactive bash session
docker exec -it n8n-mcp bash

# Run command
docker exec n8n-mcp npm run metrics:snapshot

# Check graph status
docker exec n8n-mcp ls -lh /app/data/graph/

# View environment
docker exec n8n-mcp env | grep GRAPH
```

---

## Integration with Claude Desktop

### Using HTTP Remote Adapter

Edit Claude Desktop config:

**macOS:**
`~/Library/Application\ Support/Claude/claude_desktop_config.json`

**Linux:**
`~/.config/Claude/claude_desktop_config.json`

**Windows:**
`%APPDATA%\Claude\claude_desktop_config.json`

Add configuration:

```json
{
  "mcpServers": {
    "n8n-graphrag": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/mcp-remote@latest",
        "connect",
        "http://localhost:3000/mcp"
      ],
      "env": {
        "MCP_AUTH_TOKEN": "your-auth-token"
      }
    }
  }
}
```

Replace `your-auth-token` with actual token.

---

## Troubleshooting

### Container won't start

**Check logs:**
```bash
docker logs n8n-mcp 2>&1 | head -50
```

**Common causes:**
```bash
# Port already in use
docker ps | grep 3000
docker kill <container-id>
docker run -p 3001:3000 ...  # Use different port

# Bad environment variable
docker run -e INVALID_VAR=1 ...
# Remove unknown variables

# Corrupted image
docker pull ghcr.io/czlonkowski/n8n-mcp:latest
docker rmi n8n-mcp:old
```

### Connection refused

```bash
# Check if container is running
docker ps | grep n8n-mcp

# Check port mapping
docker port n8n-mcp
# Should show: 3000/tcp -> 0.0.0.0:3000

# Test from inside container
docker exec n8n-mcp curl -s http://localhost:3000/health

# Check firewall
# Windows: Windows Defender Firewall → Allow app → Add Docker
# Linux: sudo ufw allow 3000
# macOS: System Preferences → Security & Privacy
```

### Auth token issues

```bash
# Test with correct header
curl -H "Authorization: Bearer $(cat .env | grep AUTH_TOKEN | cut -d= -f2)" \
  http://localhost:3000/health

# Token might have quotes
echo $AUTH_TOKEN  # Check for extra quotes

# Regenerate if lost
docker rm n8n-mcp
export AUTH_TOKEN=$(openssl rand -base64 32)
docker run -e AUTH_TOKEN=$AUTH_TOKEN ...
```

### Memory issues

```bash
# Check memory usage
docker stats n8n-mcp

# Increase memory limit
docker run -m 4g n8n-mcp:latest

# Or in docker-compose.yml
services:
  n8n-mcp:
    ...
    deploy:
      resources:
        limits:
          memory: 4G
```

### Graph not building

```bash
# Check if n8n is accessible
docker exec n8n-mcp curl http://host.docker.internal:5678

# Or with docker-compose
docker-compose exec n8n-mcp curl http://n8n:5678

# Check logs for errors
docker logs n8n-mcp | grep -i error
```

### Cleanup and Reset

```bash
# Stop all containers
docker-compose down

# Remove volume (deletes data!)
docker-compose down -v

# Remove image
docker rmi ghcr.io/czlonkowski/n8n-mcp:latest

# Prune unused resources
docker system prune -a
docker volume prune
```

---

## Deployment Best Practices

### Security

```yaml
# Use secrets, not env vars
environment:
  AUTH_TOKEN_FILE: /run/secrets/auth_token

secrets:
  auth_token:
    external: true

# Non-root user
USER: node

# Read-only filesystems where possible
read_only: true
tmpfs:
  - /tmp
  - /app/logs
```

### Health Checks

```bash
# Built-in health check
docker run \
  --health-cmd="curl -f -H 'Authorization: Bearer \$AUTH_TOKEN' http://localhost:3000/health" \
  --health-interval=30s \
  --health-timeout=10s \
  --health-retries=3 \
  ghcr.io/czlonkowski/n8n-mcp:latest
```

### Logging

```bash
# Use centralized logging
docker run \
  --log-driver=json-file \
  --log-opt=max-size=10m \
  --log-opt=max-file=3 \
  ghcr.io/czlonkowski/n8n-mcp:latest

# Or send to syslog
docker run \
  --log-driver=syslog \
  --log-opt tag="n8n-mcp" \
  ghcr.io/czlonkowski/n8n-mcp:latest
```

### Backup and Restore

```bash
# Backup volume
docker run --rm \
  -v n8n-mcp-data:/data \
  -v $(pwd):/backup \
  busybox tar czf /backup/n8n-mcp-backup.tar.gz -C /data .

# Restore volume
docker run --rm \
  -v n8n-mcp-data:/data \
  -v $(pwd):/backup \
  busybox tar xzf /backup/n8n-mcp-backup.tar.gz -C /data
```

---

**Last Updated:** 2025-01-19
**Version:** 3.0.0-beta
**Status:** Complete Docker Installation Guide
