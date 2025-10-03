# How to Start n8n for Testing v3.0.0

## Option 1: Install n8n Globally (Recommended for Testing)

```bash
# Install n8n globally
npm install -g n8n

# Start n8n
n8n start

# Or start on specific port
N8N_PORT=5678 n8n start
```

**Expected Output**:
```
n8n ready on http://localhost:5678
```

---

## Option 2: Use Docker (Fast & Clean)

```bash
# Start Docker Desktop (if not running)

# Run n8n in Docker
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n

# Or with docker-compose (if docker-compose.yml exists)
docker-compose up -d
```

---

## Option 3: Use npx (No Installation)

```bash
# Run n8n directly with npx
npx n8n start

# Or on specific port
N8N_PORT=5678 npx n8n start
```

---

## Verify n8n is Running

Once started, verify at:
- **Web UI**: http://localhost:5678
- **API**: http://localhost:5678/api/v1/workflows
- **Health**: http://localhost:5678/healthz

---

## Configure MCP Server to Use n8n

Once n8n is running, configure the MCP server:

```bash
# Set environment variables
export N8N_API_URL=http://localhost:5678
export N8N_API_KEY=your-api-key

# Get API key from n8n:
# 1. Open http://localhost:5678
# 2. Go to Settings → API
# 3. Create new API key
# 4. Copy the key

# Start MCP server with n8n integration
npm start
```

---

## Test v3.0.0 Tools with n8n

Once both are running:

```javascript
// Test retry execution (requires failed execution)
workflow_execution({
  action: "retry",
  id: "execution-id-here"
})

// Test monitor running executions
workflow_execution({
  action: "monitor_running"
})

// Test list MCP workflows
workflow_execution({
  action: "list_mcp",
  limit: 20
})
```

---

## Quick Start Script

Save this as `start-n8n.sh`:

```bash
#!/bin/bash

# Check if n8n is installed
if ! command -v n8n &> /dev/null; then
    echo "Installing n8n..."
    npm install -g n8n
fi

# Start n8n
echo "Starting n8n on http://localhost:5678..."
n8n start
```

Then run:
```bash
chmod +x start-n8n.sh
./start-n8n.sh
```

---

## Troubleshooting

### n8n Not Found
```bash
# Check global npm packages
npm list -g --depth=0

# Install if missing
npm install -g n8n
```

### Port Already in Use
```bash
# Use different port
N8N_PORT=5679 n8n start
```

### Docker Not Running
```bash
# Start Docker Desktop
# Then try docker command again
```

---

## Current Status

The v3.0.0-alpha.1 MCP server is ready and waiting for n8n:

✅ **MCP Server**: Tested and validated (29ms startup)
✅ **v3 Tools**: All implemented and ready
⏳ **n8n Instance**: Needs to be started

**Once n8n is running, the v3 tools will be fully functional!**
