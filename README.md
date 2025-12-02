# n8n Co-Pilot MCP Server

> **Stateless • Validated • Live Sync • LLM-Powered**

Transform your n8n workflow development with an intelligent co-pilot that prevents errors before they happen.

## 🚀 What's New in v3.0

| Feature | Description |
|---------|-------------|
| **Live Node Sync** | Node catalog syncs directly from YOUR n8n instance - no pre-built database |
| **Bulletproof Validation** | 6-layer validation blocks broken workflows before they reach n8n |
| **Dual LLM Architecture** | Embedding model + Generation model optimized for your hardware |
| **Stateless Design** | n8n is the source of truth - no workflow storage in MCP |
| **Dual Interface** | MCP for AI agents (Claude) + HTTP for humans (Open WebUI) |

---

## ⚡ Quick Start

### Option 1: NPX (Recommended for Claude Desktop)

```bash
# Install globally
npm install -g n8n-mcp

# Or run directly
npx n8n-mcp
```

Configure in Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "n8n-copilot": {
      "command": "npx",
      "args": ["n8n-mcp"],
      "env": {
        "N8N_API_URL": "http://localhost:5678",
        "N8N_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Option 2: Docker Compose (Full Stack)

```bash
# Clone the repo
git clone https://github.com/Zevas1993/One-Stop-Shop-N8N-MCP.git
cd One-Stop-Shop-N8N-MCP

# Configure
cp .env.example .env
# Edit .env with your N8N_API_KEY

# Start everything (n8n + MCP + Ollama + Open WebUI)
docker compose up -d
```

Access:
- **n8n**: http://localhost:5678
- **Open WebUI**: http://localhost:3000
- **MCP API**: http://localhost:3001

### Option 3: Docker (MCP Only)

```bash
# Build
docker build -t n8n-mcp:latest .

# Run in MCP mode (for Claude Desktop)
docker run -it --rm \
  -e N8N_API_URL=http://host.docker.internal:5678 \
  -e N8N_API_KEY=your-key \
  n8n-mcp:latest

# Run in HTTP mode (for Open WebUI)
docker run -d -p 3001:3001 \
  -e MCP_MODE=http \
  -e N8N_API_URL=http://your-n8n:5678 \
  -e N8N_API_KEY=your-key \
  n8n-mcp:latest
```

---

## 🛡️ Validation Gateway

Every workflow passes through **6 layers of validation** before reaching n8n:

```
Workflow Input
     │
     ▼
┌─────────────────────┐
│ 1. Schema (Zod)     │ ──▶ Structure correct?
├─────────────────────┤
│ 2. Node Existence   │ ──▶ Do nodes exist in n8n?
├─────────────────────┤
│ 3. Connections      │ ──▶ Are connections valid?
├─────────────────────┤
│ 4. Credentials      │ ──▶ Required creds configured?
├─────────────────────┤
│ 5. Semantic (LLM)   │ ──▶ Does this make sense?
├─────────────────────┤
│ 6. Dry Run (n8n)    │ ──▶ Test in n8n itself
└─────────────────────┘
     │
     ▼
  n8n API ✅
```

**Result**: Invalid workflows are rejected with clear error messages and fix suggestions.

---

## 🤖 Dual LLM Architecture

The system uses **two specialized models** optimized for different tasks:

| Model Type | Purpose | Examples |
|------------|---------|----------|
| **Embedding** | Semantic search, similarity | `nomic-embed-text`, `embedding-gemma-300m` |
| **Generation** | Chat, validation, suggestions | `llama3.2:1b/3b`, `gemma:2b`, `nemotron-nano-4b` |

Models are **auto-selected based on your hardware**:

| RAM | CPU Cores | Embedding Model | Generation Model |
|-----|-----------|-----------------|------------------|
| <4GB | Any | embedding-gemma-300m | gemma:2b |
| 4-8GB | 2-4 | embedding-gemma-300m | llama3.2:1b |
| 8-16GB | 4+ | nomic-embed-text | llama3.2:3b |
| 16GB+ | 8+ | nomic-embed-text | nemotron-nano-4b |

---

## 🔧 MCP Tools

### Workflow Management
| Tool | Description |
|------|-------------|
| `n8n_create_workflow` | Create a validated workflow |
| `n8n_update_workflow` | Update with validation |
| `n8n_delete_workflow` | Delete a workflow |
| `n8n_list_workflows` | List all workflows |
| `n8n_activate_workflow` | Activate/deactivate |

### Validation
| Tool | Description |
|------|-------------|
| `n8n_validate_workflow` | Check without creating |

### Execution
| Tool | Description |
|------|-------------|
| `n8n_execute_workflow` | Run a workflow |
| `n8n_get_execution` | Get execution details |
| `n8n_list_executions` | List recent executions |

### Node Discovery
| Tool | Description |
|------|-------------|
| `n8n_search_nodes` | Search available nodes |
| `n8n_get_node_info` | Get node details |
| `n8n_list_trigger_nodes` | List triggers |
| `n8n_list_ai_nodes` | List AI/LangChain nodes |

### System
| Tool | Description |
|------|-------------|
| `n8n_status` | System status |
| `n8n_resync_catalog` | Force node catalog refresh |
| `n8n_list_credentials` | List available credentials |

---

## 🌐 Open WebUI Integration

The MCP server exposes tools that Open WebUI can use:

1. **Get the pipeline code**:
   ```
   curl http://localhost:3001/api/openwebui-pipeline
   ```

2. **Install in Open WebUI**:
   - Go to Admin > Pipelines
   - Create new pipeline
   - Paste the generated code

3. **Start chatting**:
   - "List my workflows"
   - "Create a webhook that sends to Slack"
   - "What nodes can I use for email?"

---

## 📁 Architecture

```
src/
├── core/                    # NEW: Core architecture
│   ├── index.ts             # Core orchestrator
│   ├── node-catalog.ts      # Live sync from n8n
│   ├── validation-gateway.ts # 6-layer validation
│   ├── n8n-connector.ts     # Stateless passthrough
│   └── llm-brain.ts         # Dual LLM integration
├── interfaces/              # NEW: Dual interface
│   ├── mcp-interface.ts     # For AI agents
│   └── openwebui-interface.ts # For humans
├── ai/                      # Existing LLM support
│   └── hardware-detector.ts # Auto-detects optimal models
├── services/                # Existing services
└── main.ts                  # NEW: Unified entry point
```

---

## 🔐 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `N8N_API_URL` | Yes | `http://localhost:5678` | n8n instance URL |
| `N8N_API_KEY` | Yes* | - | n8n API key (*required for most features) |
| `OLLAMA_URL` | No | `http://localhost:11434` | Ollama server URL |
| `MCP_MODE` | No | `stdio` | `stdio` for Claude, `http` for Open WebUI |
| `PORT` | No | `3001` | HTTP server port |
| `AUTH_TOKEN` | No | - | HTTP API authentication |
| `ENABLE_DRY_RUN` | No | `true` | Enable n8n dry-run validation |

---

## 🐛 Troubleshooting

### "Node type not found"
The node doesn't exist in your n8n instance. Use `n8n_search_nodes` to find available nodes.

### "Validation failed at layer: dryRun"
n8n rejected the workflow. Check the error message for details.

### "LLM not available"
Ollama isn't running or reachable. Start Ollama or disable semantic validation.

### "Connection refused to n8n"
Check that n8n is running and `N8N_API_URL` is correct.

---

## 📜 License

MIT

---

## 🙏 Credits

- Original MCP server by [Romuald Czlonkowski](https://www.aiadvisors.pl/en)
- Refactored to v3.0 Co-Pilot architecture
