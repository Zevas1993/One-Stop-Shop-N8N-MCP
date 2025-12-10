# Claude Desktop Setup Guide

This guide explains how to configure Claude Desktop to use the n8n MCP server in **stdio mode** (required for Claude Desktop).

## 🎯 Two Stdio Mode Options

Claude Desktop requires **stdio mode** for MCP servers. You can choose between two implementations:

### Option 1: Consolidated Server (RECOMMENDED) ⭐
- **8 unified tools** - Eliminates choice paralysis
- **Action-based interface** - `node_discovery`, `workflow_manager`, etc.
- **Validation-first workflow** - Prevents broken workflows
- **Better performance** - Streamlined architecture

### Option 2: Legacy Server (Full Feature Set)
- **60+ individual tools** - Complete original tool set
- **Direct access** - Every function is a separate tool
- **Maximum flexibility** - No abstraction layers

---

## 🚀 Quick Setup

### Step 1: Build the Server

```bash
cd "C:\Users\Chris Boyd\Documents\MCP-Servers\One-Stop-Shop-N8N-MCP"
npm install
npm run build
npm run rebuild:local
```

### Step 2: Get Your n8n API Key

1. Open n8n: http://localhost:5678
2. Go to **Settings** → **API**
3. Click **Create API Key**
4. Copy the key

### Step 3: Configure Claude Desktop

Choose ONE of the configurations below:

---

## 📋 Configuration Option 1: Consolidated Server (RECOMMENDED)

**File:** `claude-desktop-config-consolidated.json`

```json
{
  "mcpServers": {
    "n8n-mcp-consolidated": {
      "command": "node",
      "args": [
        "C:/Users/Chris Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/dist/consolidated-server.js"
      ],
      "env": {
        "N8N_API_URL": "http://localhost:5678",
        "N8N_API_KEY": "your_n8n_api_key_here"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Features:**
- ✅ 8 unified tools
- ✅ Validation enforcement
- ✅ Better AI agent guidance
- ✅ Faster responses
- ✅ Workflow guardrails

**Available Tools:**
1. `node_discovery` - Find and search n8n nodes
2. `node_validation` - Validate node configurations
3. `workflow_manager` - Create/update/validate workflows
4. `workflow_execution` - Execute and monitor workflows
5. `workflow_diff` - Incremental workflow updates
6. `templates_and_guides` - Access workflow templates
7. `n8n_system` - System health and diagnostics
8. `visual_verification` - Visual workflow analysis (optional)

---

## 📋 Configuration Option 2: Legacy Server (Full Access)

**File:** `claude-desktop-config-legacy.json`

```json
{
  "mcpServers": {
    "n8n-mcp-legacy": {
      "command": "node",
      "args": [
        "C:/Users/Chris Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/dist/mcp/index.js"
      ],
      "env": {
        "MCP_MODE": "stdio",
        "N8N_API_URL": "http://localhost:5678",
        "N8N_API_KEY": "your_n8n_api_key_here"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Features:**
- ✅ All 60+ original tools
- ✅ Direct function access
- ✅ Maximum granular control
- ⚠️ More complex for AI agents

---

## 🔧 Installation Steps

### Windows

1. **Locate Claude Desktop config:**
   ```
   %APPDATA%\Claude\claude_desktop_config.json
   ```

2. **Copy your chosen configuration:**
   ```powershell
   # For Consolidated (RECOMMENDED)
   copy claude-desktop-config-consolidated.json "%APPDATA%\Claude\claude_desktop_config.json"

   # OR for Legacy
   copy claude-desktop-config-legacy.json "%APPDATA%\Claude\claude_desktop_config.json"
   ```

3. **Edit the config file:**
   - Replace `your_n8n_api_key_here` with your actual API key
   - Update the path if you installed n8n-mcp elsewhere

4. **Restart Claude Desktop**

### macOS/Linux

1. **Locate Claude Desktop config:**
   ```
   ~/Library/Application Support/Claude/claude_desktop_config.json
   ```

2. **Copy your chosen configuration:**
   ```bash
   # For Consolidated (RECOMMENDED)
   cp claude-desktop-config-consolidated.json ~/Library/Application\ Support/Claude/claude_desktop_config.json

   # OR for Legacy
   cp claude-desktop-config-legacy.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

3. **Edit the config file:**
   - Replace `your_n8n_api_key_here` with your actual API key
   - Update the path if needed

4. **Restart Claude Desktop**

---

## ✅ Verify Installation

1. **Restart Claude Desktop completely**
2. **Start a new conversation**
3. **Type:** "What MCP tools do you have available?"
4. **You should see:**
   - **Consolidated:** 8 tools (node_discovery, workflow_manager, etc.)
   - **Legacy:** 60+ tools (list_nodes, get_node_info, create_workflow, etc.)

---

## 🔍 Troubleshooting

### Claude Desktop doesn't see the MCP server

**Check:**
1. Is the path correct in the config?
   ```bash
   node "C:/Users/Chris Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/dist/consolidated-server.js"
   ```

2. Did you build the project?
   ```bash
   npm run build
   npm run rebuild:local
   ```

3. Does the database exist?
   ```bash
   ls data/nodes.db
   ```

### "Module not found" error

**Solution:** Rebuild the project
```bash
npm install
npm run build
```

### "Cannot find database" error

**Solution:** Build the database
```bash
npm run rebuild:local
```

### Server crashes immediately

**Check logs in:**
- Windows: `%APPDATA%\Claude\logs\mcp*.log`
- macOS: `~/Library/Logs/Claude/mcp*.log`

**Common issues:**
- Missing `nodes.db` - Run `npm run rebuild:local`
- Node.js version mismatch - Ensure Node.js 18+ is installed
- Corrupted node_modules - Run `rm -rf node_modules && npm install`

---

## 🔄 Switching Between Modes

You can switch between Consolidated and Legacy modes anytime:

1. **Copy the new config file to Claude Desktop config location**
2. **Restart Claude Desktop**
3. **The server will use the new mode**

---

## 📊 Comparison Table

| Feature | Consolidated | Legacy |
|---------|-------------|---------|
| Number of Tools | 8 | 60+ |
| Tool Interface | Action-based | Function-based |
| Validation Enforcement | ✅ Yes | ⚠️ Manual |
| AI Agent Guidance | ✅ Built-in | ❌ Limited |
| Performance | ⚡ Fast | 🐢 Slower |
| Choice Paralysis | ✅ Eliminated | ⚠️ Possible |
| Learning Curve | ⭐ Easy | ⭐⭐⭐ Complex |
| Workflow Guardrails | ✅ Yes | ❌ No |
| Best For | General use, AI agents | Power users, debugging |

---

## 💡 Recommendation

**Use the Consolidated Server** unless you have a specific reason to use the legacy mode:

✅ **Use Consolidated if:**
- You want the best AI agent experience
- You want validation enforcement
- You prefer simpler tool interfaces
- You want faster responses

⚠️ **Use Legacy if:**
- You need direct access to specific functions
- You're debugging or developing
- You need maximum granular control
- You're migrating from the old version

---

## 🆘 Getting Help

If you encounter issues:

1. **Check the logs:** See troubleshooting section above
2. **Verify paths:** Ensure all paths are correct and absolute
3. **Test manually:** Run the server directly to see errors:
   ```bash
   # Consolidated
   node dist/consolidated-server.js

   # Legacy
   MCP_MODE=stdio node dist/mcp/index.js
   ```
4. **Rebuild database:** `npm run rebuild:local`
5. **Reinstall dependencies:** `rm -rf node_modules && npm install`

---

## 📝 Example Claude Desktop Config (Full)

Here's a complete example with multiple MCP servers:

```json
{
  "mcpServers": {
    "n8n-mcp-consolidated": {
      "command": "node",
      "args": [
        "C:/Users/Chris Boyd/Documents/MCP-Servers/One-Stop-Shop-N8N-MCP/dist/consolidated-server.js"
      ],
      "env": {
        "N8N_API_URL": "http://localhost:5678",
        "N8N_API_KEY": "n8n_api_xxxxxxxxxxxxx"
      },
      "disabled": false,
      "autoApprove": []
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:/Users/Chris Boyd/Documents"],
      "disabled": false
    }
  }
}
```

This configuration gives Claude Desktop access to both the n8n MCP server and the filesystem MCP server.

---

**Ready to use!** Choose your configuration, update the paths and API key, restart Claude Desktop, and you're all set! 🚀
