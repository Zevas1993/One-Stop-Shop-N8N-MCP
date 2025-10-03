# Getting Started with n8n MCP Server

**3-minute setup. One command. Zero configuration headaches.**

---

## 🚀 Quick Setup

```bash
git clone https://github.com/Zevas1993/One-Stop-Shop-N8N-MCP.git
cd One-Stop-Shop-N8N-MCP
npm run setup
```

That's it! The interactive setup will:
- ✅ Install dependencies
- ✅ Build the server
- ✅ Create the node database
- ✅ Configure Claude Desktop automatically
- ✅ Test your connection

**Takes ~3 minutes. No manual config editing required.**

---

## 📋 Prerequisites

Before running setup:

1. **Node.js 18+**
   ```bash
   node --version  # Should be v18.0.0 or higher
   ```

2. **n8n running** (optional, but recommended)
   - Download: https://n8n.io/
   - Quick start: `npx n8n`
   - Runs on: http://localhost:5678

3. **Claude Desktop** (for local use)
   - Download: https://claude.ai/download

---

## 🎯 Deployment Options

### Option 1: Claude Desktop (Local) - RECOMMENDED

**Best for:** Daily use, development, testing

```bash
npm run setup
# Choose: "Claude Desktop (local stdio mode)"
# Answer 3 questions
# Restart Claude Desktop
# Done!
```

**Features:**
- ✅ 8 unified tools
- ✅ Validation enforcement
- ✅ Workflow guardrails
- ✅ Zero latency
- ✅ Works offline

### Option 2: Remote Server (HTTP)

**Best for:** Team access, remote deployments, API integrations

```bash
npm run setup
# Choose: "Remote server (HTTP mode)"
# Server starts on http://localhost:3000
```

**Features:**
- ✅ REST API access
- ✅ Bearer token authentication
- ✅ Health monitoring
- ✅ Multiple clients
- ✅ Remote access

### Option 3: Docker

**Best for:** Production deployments, containerized environments

```bash
npm run setup
# Choose: "Docker container"
docker-compose up -d
```

**Features:**
- ✅ Isolated environment
- ✅ Easy scaling
- ✅ Consistent deployment
- ✅ Pre-built database included

---

## ✅ Verify Installation

### Claude Desktop
1. Restart Claude Desktop
2. Start a new conversation
3. Ask: **"What n8n tools do you have?"**
4. You should see 8 tools:
   - node_discovery
   - node_validation
   - workflow_manager
   - workflow_execution
   - workflow_diff
   - templates_and_guides
   - n8n_system
   - visual_verification

### HTTP Server
```bash
# Test health endpoint
curl http://localhost:3000/health

# Test authentication
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Docker
```bash
docker-compose logs -f
# Should see: "Server running on 0.0.0.0:3000"

curl http://localhost:3000/health
```

---

## 🔧 Configuration

After setup, you can customize settings in `.env`:

```bash
# Server mode
MCP_MODE=stdio          # or "http" for remote access

# n8n Connection (optional)
N8N_API_URL=http://localhost:5678
N8N_API_KEY=your-api-key-here

# HTTP mode settings (only if MCP_MODE=http)
PORT=3000
AUTH_TOKEN=your-secure-token
```

---

## 💡 Common Tasks

### Get n8n API Key
1. Open n8n: http://localhost:5678
2. Go to **Settings** → **API**
3. Click **Create API Key**
4. Copy and paste into `.env`

### Switch Modes
```bash
# Change MCP_MODE in .env
MCP_MODE=http

# Restart the server
npm run start:http
```

### Rebuild Database
```bash
npm run rebuild:local
```

### Update n8n Packages
```bash
npm run update:n8n:check  # Check for updates
npm run update:n8n        # Apply updates
npm run rebuild:local     # Rebuild database
```

---

## 🆘 Troubleshooting

### "Module not found" error
```bash
npm install
npm run build
```

### "Cannot find database" error
```bash
npm run rebuild:local
```

### Claude Desktop doesn't see the server
1. Check the path in Claude Desktop config is correct
2. Ensure you restarted Claude Desktop completely
3. Verify the server builds successfully:
   ```bash
   node dist/consolidated-server.js
   ```

### n8n workflow tools not working
1. Check n8n is running: http://localhost:5678
2. Verify API key is correct in `.env`
3. Test connection:
   ```bash
   curl -H "X-N8N-API-KEY: YOUR_KEY" http://localhost:5678/api/v1/workflows
   ```

### Database build fails
1. Ensure n8n packages are installed:
   ```bash
   npm install
   ```
2. Try optimized build:
   ```bash
   npm run rebuild:optimized
   ```

### HTTP server won't start
1. Check port 3000 isn't in use:
   ```bash
   # Windows
   netstat -ano | findstr :3000

   # Mac/Linux
   lsof -i :3000
   ```
2. Change port in `.env`:
   ```
   PORT=3001
   ```

---

## 📊 Available Tools

### For Claude Desktop Users

When configured, you'll have access to these 8 unified tools:

1. **node_discovery** - Find and search n8n nodes
   ```
   Actions: search, list, get_info, get_documentation, search_properties
   ```

2. **node_validation** - Validate node configurations
   ```
   Actions: validate_minimal, validate_operation, get_dependencies, get_for_task, list_tasks
   ```

3. **workflow_manager** - Create and manage workflows
   ```
   Actions: validate, create, get, update, list, search
   ```

4. **workflow_execution** - Execute and monitor workflows
   ```
   Actions: trigger, get, list, delete, retry, monitor_running, list_mcp
   ```

5. **workflow_diff** - Incremental workflow updates
   ```
   Operations: addNode, removeNode, updateNode, addConnection, etc.
   ```

6. **templates_and_guides** - Access workflow templates
   ```
   Actions: get_template, search_templates, list_node_templates, get_templates_for_task
   ```

7. **n8n_system** - System health and diagnostics
   ```
   Operations: health, diagnose, list_tools
   ```

8. **visual_verification** - Visual workflow analysis (advanced)

---

## 🎓 Next Steps

Once setup is complete:

1. **Explore available nodes**
   ```
   Ask Claude: "List all available n8n nodes for HTTP requests"
   ```

2. **Create your first workflow**
   ```
   Ask Claude: "Create a simple workflow that makes an HTTP request"
   ```

3. **Validate before deploying**
   ```
   Ask Claude: "Validate this workflow before creating it"
   ```

4. **Execute workflows**
   ```
   Ask Claude: "Execute workflow ID 123 and show me the results"
   ```

5. **Use templates**
   ```
   Ask Claude: "Show me workflow templates for Slack notifications"
   ```

---

## 📚 Additional Resources

- **Full Documentation**: See [README.md](README.md)
- **Security Guide**: See [SECURITY-AUDIT-REPORT.md](SECURITY-AUDIT-REPORT.md)
- **Workflow Examples**: See [docs/workflow-diff-examples.md](docs/workflow-diff-examples.md)
- **Changelog**: See [CLAUDE.md](CLAUDE.md)

---

## 🆘 Still Need Help?

1. **Check logs**:
   - Windows: `%APPDATA%\Claude\logs\mcp*.log`
   - Mac: `~/Library/Logs/Claude/mcp*.log`
   - Linux: `~/.config/Claude/logs/mcp*.log`

2. **Test manually**:
   ```bash
   # Claude Desktop mode
   node dist/consolidated-server.js

   # HTTP mode
   MCP_MODE=http node dist/mcp/index.js
   ```

3. **Reinstall**:
   ```bash
   rm -rf node_modules dist data
   npm install
   npm run setup
   ```

4. **Report issues**: https://github.com/Zevas1993/One-Stop-Shop-N8N-MCP/issues

---

**Happy Automating! 🎉**
