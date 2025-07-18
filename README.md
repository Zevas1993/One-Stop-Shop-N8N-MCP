# n8n-MCP: Complete AI Agent Server for n8n Automation

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.7.0-blue.svg)](https://github.com/your-username/n8n-mcp-server)
[![Docker](https://img.shields.io/badge/docker-ready-green.svg)](https://hub.docker.com/r/your-username/n8n-mcp-server)

A **complete** Model Context Protocol (MCP) server that provides AI assistants with comprehensive access to n8n workflow automation. Features the full workflow lifecycle: discover nodes, create workflows, execute them, and visually verify they work correctly.

## 🎯 Overview

n8n-MCP is the **complete solution** for AI-powered n8n automation. It provides AI agents with everything they need to understand, create, manage, and verify n8n workflows - all from a single, easy-to-deploy server.

### 🚀 Key Features

- **📚 525+ n8n nodes** - Complete coverage from n8n-nodes-base and @n8n/n8n-nodes-langchain
- **🔄 Progressive disclosure** - AI agents get exactly the information they need (1KB to 50KB responses)
- **🔧 Complete workflow lifecycle** - Create, update, execute, and validate workflows via n8n API
- **👁️ Visual verification** - Browser automation with Puppeteer for visual workflow confirmation
- **🤖 AI-optimized tools** - 38+ specialized tools designed for AI agent efficiency
- **🛡️ Bulletproof reliability** - Automatic fallbacks ensure constant availability
- **⚡ Universal compatibility** - Works with any Node.js version (automatic database adapter)
- **🐳 Docker-ready** - Complete solution with bundled browser dependencies

### 🎯 What Makes This Special

This is the **only MCP server** that provides AI agents with:
1. **Complete n8n knowledge** - Every node, property, and operation documented
2. **Workflow creation & management** - Full API integration for workflow operations  
3. **Visual verification** - Browser automation to SEE and verify workflows work
4. **Progressive disclosure** - Choose information granularity to prevent AI overload
5. **Single unified interface** - No need to manage multiple servers
6. **Ready-to-run Docker** - Just pull and run, no complex setup required

## 🚀 Quick Start Guide

### 🐳 Docker Deployment (Recommended - Just Pull & Run!)

**Prerequisites:** Docker installed on your system

#### Step 1: Pull the Pre-Built Image
```bash
# Pull the latest image (includes all browser dependencies)
docker pull your-username/n8n-mcp-server:latest
```

#### Step 2: Create Environment Configuration
```bash
# Create a directory for your deployment
mkdir n8n-mcp-server && cd n8n-mcp-server

# Create environment file
cat > .env << 'EOF'
# Basic Configuration
NODE_ENV=production
PORT=3000
MCP_MODE=stdio
AUTH_TOKEN=your-secure-random-token-here

# Optional: n8n API Integration (for workflow management)
# N8N_API_URL=http://your-n8n-instance:5678
# N8N_API_KEY=your-n8n-api-key

# Logging
LOG_LEVEL=info
EOF
```

#### Step 3: Run the Server
```bash
# Start the server
docker run -d \
  --name n8n-mcp-server \
  --env-file .env \
  -p 3000:3000 \
  your-username/n8n-mcp-server:latest

# Check server status
docker logs n8n-mcp-server

# You should see: "MCP server initialized with 38 tools"
```

#### Step 4: Connect to Claude Desktop
Add to your `~/.claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "docker",
      "args": ["exec", "-i", "n8n-mcp-server", "node", "dist/mcp/index.js"],
      "env": {
        "MCP_MODE": "stdio"
      }
    }
  }
}
```

### 🛠️ Local Development Setup

For developers who want to modify the code:

```bash
# Clone and install
git clone https://github.com/your-username/n8n-mcp-server.git
cd n8n-mcp-server
npm install

# Build the project
npm run build

# Initialize database (downloads n8n node information)
npm run rebuild

# Start server
npm start
```

### 🔧 Docker Compose (Alternative)

If you prefer Docker Compose:

```bash
# Clone repository
git clone https://github.com/your-username/n8n-mcp-server.git
cd n8n-mcp-server

# Copy environment template
cp .env.example .env

# Edit .env with your settings
nano .env

# Start with compose
docker-compose up -d

# Check logs
docker-compose logs -f
```

## 🔧 Configuration Guide

### 📋 Environment Variables

The server uses environment variables for configuration. Here's what each setting does:

#### Basic Configuration
```bash
# Server mode - stdio for Claude Desktop, http for remote access
MCP_MODE=stdio

# Server port (only used in http mode)
PORT=3000

# Authentication token (required for http mode)
AUTH_TOKEN=your-secure-random-token

# Environment setting
NODE_ENV=production

# Logging level (debug, info, warn, error)
LOG_LEVEL=info
```

#### n8n API Integration (Optional but Recommended)
```bash
# Enable workflow management tools by providing n8n API access
N8N_API_URL=http://your-n8n-instance:5678
N8N_API_KEY=your-n8n-api-key

# Optional: For enhanced visual verification
N8N_USERNAME=your-n8n-username
N8N_PASSWORD=your-n8n-password
```

#### How to Get n8n API Key
1. Open your n8n instance
2. Go to **Settings** → **API**
3. Click **Create API Key**
4. Copy the key and add it to your `.env` file

### 🔗 Integration Examples

#### Claude Desktop (Local Docker)
```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "docker",
      "args": ["exec", "-i", "n8n-mcp-server", "node", "dist/mcp/index.js"],
      "env": {
        "MCP_MODE": "stdio"
      }
    }
  }
}
```

#### Remote Access (HTTP Mode)
```json
{
  "mcpServers": {
    "n8n-mcp-remote": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/mcp-remote@latest",
        "connect",
        "http://your-server:3000/mcp"
      ],
      "env": {
        "MCP_AUTH_TOKEN": "your-auth-token"
      }
    }
  }
}
```

#### Alternative: Local Binary
```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "node",
      "args": ["/path/to/n8n-mcp-server/dist/mcp/index.js"],
      "env": {
        "MCP_MODE": "stdio"
      }
    }
  }
}
```

## 🛠️ Available Tools (38+ Total)

The server provides **38+ specialized tools** organized by category:

### 🔍 Progressive Disclosure Tools (AI-Optimized)
- `get_node_summary` - Ultra-light overview (<1KB) - Perfect for discovery
- `get_node_info` - Full node details (essentials ~5KB, complete ~50KB) - Choose your detail level
- `check_compatibility` - Quick node connection validation - Instant yes/no answers
- `validate_before_adding` - Pre-flight workflow validation - Prevent errors before they happen

### 🏗️ Workflow Management Tools (Requires n8n API)
- `n8n_create_workflow` - Create new workflows from JSON
- `n8n_get_workflow` - Get workflow by ID (multiple detail levels)
- `n8n_update_full_workflow` - Complete workflow replacement
- `n8n_update_partial_workflow` - Diff-based workflow updates (NEW v2.7.0!)
- `n8n_delete_workflow` - Remove workflows permanently
- `n8n_list_workflows` - Browse existing workflows with filters
- `n8n_trigger_webhook_workflow` - Execute workflows via webhooks
- `n8n_get_execution` - Get execution details by ID
- `n8n_list_executions` - Browse execution history
- `n8n_system` - Health checks and diagnostics

### 👁️ Visual Verification Tools (Browser Automation)
- `quick_workflow_check` - Fast error detection with screenshots
- `detect_workflow_errors` - Comprehensive visual validation
- `take_workflow_screenshot` - Visual confirmation of workflow state
- `find_workflows_by_name` - Search workflows by name with visual preview
- `get_execution_monitoring_status` - Monitor executions in real-time
- `setup_enhanced_visual_verification` - Initialize browser automation
- `analyze_workflow_comprehensively` - Deep visual analysis
- `auto_fix_visual_issues` - Automated error correction

### 🔧 Node Discovery Tools
- `find_nodes` - Search and filter nodes by category/keywords
- `get_node_config` - Pre-configured node settings for common tasks
- `validate_node` - Node configuration validation (minimal/full modes)
- `get_database_statistics` - Server metrics and performance data

### 📋 Template & Validation Tools
- `find_templates` - Workflow templates from n8n.io (search by node, keyword, or task)
- `get_template` - Get complete workflow JSON by template ID
- `validate_workflow` - Complete workflow validation (multiple modes)
- `get_workflow_guide` - Scenario-based guidance for common patterns

## 🎯 Common Usage Patterns

### 🔍 **Node Discovery & Learning**
```
AI Agent: "I need to create a workflow that processes webhooks"
1. find_nodes(query="webhook") -> Find webhook nodes
2. get_node_summary("n8n-nodes-base.webhook") -> Quick overview (<1KB)
3. get_node_info("n8n-nodes-base.webhook", detail="essentials") -> Configuration details (~5KB)
```

### 🏗️ **Workflow Creation**
```
AI Agent: "Create a webhook-to-slack workflow"
1. n8n_create_workflow(workflow_json) -> Create workflow
2. quick_workflow_check(workflow_id) -> Fast validation
3. take_workflow_screenshot(workflow_id) -> Visual confirmation
```

### 🔧 **Workflow Updates**
```
AI Agent: "Add a HTTP Request node to existing workflow"
1. n8n_update_partial_workflow(id, operations) -> Use diff updates (NEW!)
2. validate_workflow(workflow_json) -> Ensure it's still valid
3. detect_workflow_errors(workflow_id) -> Visual verification
```

### 🐛 **Troubleshooting**
```
AI Agent: "Check if workflow has errors"
1. find_workflows_by_name("my-workflow") -> Find workflow
2. detect_workflow_errors(workflow_id) -> Comprehensive scan
3. validate_workflow(workflow_json) -> Detailed validation
```

### 📋 **Template Usage**
```
AI Agent: "Find templates for Slack automation"
1. find_templates(mode="keywords", query="slack") -> Search templates
2. get_template(templateId) -> Get complete workflow JSON
3. n8n_create_workflow(template_json) -> Create from template
```

### 🔍 **Health Monitoring**
```
AI Agent: "Check server status and performance"
1. n8n_system(operation="health") -> Check n8n connectivity
2. get_database_statistics() -> Server metrics
3. n8n_list_executions(status="error") -> Check for failed executions
```

## 📊 Response Size Guide

Tools are designed with **progressive disclosure** for AI efficiency:

- **<1KB**: Ultra-light summaries (`get_node_summary`) - Perfect for discovery
- **~5KB**: Essential information (`get_node_info` essentials mode) - Common usage
- **~50KB**: Complete details (`get_node_info` complete mode) - Deep configuration
- **<2KB**: Quick validations (`quick_workflow_check`) - Fast feedback

## 🐳 Docker Features

### ✅ Complete Self-Contained Solution
- **All browser dependencies included** - Puppeteer + Chromium bundled
- **No external setup required** - Just pull and run
- **Universal Node.js compatibility** - Works with any Node.js version
- **Auto-fallback database** - Switches between better-sqlite3 and sql.js automatically

### 🚀 Optimized for Production
- **Ultra-lightweight** - Only 280MB runtime image
- **Fast startup** - Pre-built database included
- **Memory efficient** - Intelligent cache management
- **Security focused** - Non-root user execution

### 📋 Docker Commands
```bash
# Pull latest image
docker pull your-username/n8n-mcp-server:latest

# Run with basic config
docker run -d --name n8n-mcp-server --env-file .env your-username/n8n-mcp-server:latest

# Check server health
docker logs n8n-mcp-server

# Stop server
docker stop n8n-mcp-server

# Update to latest
docker pull your-username/n8n-mcp-server:latest && docker restart n8n-mcp-server
```

## 🔒 Security & Credentials

### 🛡️ Credential Protection
- **All credentials in environment variables** - Never hardcoded
- **`.env` file is gitignored** - Prevents accidental commits
- **Template provided** - Copy `.env.example` to `.env` for safety
- **Docker secrets support** - Can use Docker secrets for production

### 🔐 Authentication Methods
- **HTTP mode**: Bearer token authentication (`AUTH_TOKEN`)
- **n8n API**: API key authentication (`N8N_API_KEY`)
- **Visual verification**: Username/password for browser automation
- **Docker**: Environment file or secrets management

### 🚨 Important Security Notes
- **Generate strong tokens**: Use `openssl rand -base64 32` for AUTH_TOKEN
- **Secure n8n access**: Use HTTPS for production n8n instances
- **Network security**: Run in private networks when possible
- **Regular updates**: Keep Docker images updated

## 🛠️ Development Guide

### 🚀 Available Scripts
```bash
# Development
npm run dev          # Development mode with auto-reload
npm run build        # Build TypeScript
npm run test         # Run Jest tests
npm run typecheck    # TypeScript type checking
npm run lint         # Run linting

# Database Management
npm run rebuild      # Rebuild node database from n8n packages
npm run validate     # Validate critical nodes work correctly

# Testing
npm run test:essentials        # Test AI-optimized tools
npm run test:visual-tools      # Test visual verification
npm run test:workflow-diff     # Test partial workflow updates
npm run test:docker           # Test Docker deployment

# Docker Development
docker-compose up -d --build  # Build and start server
./scripts/test-docker.sh      # Test Docker deployment
docker-compose logs -f        # View logs
```

### 🏗️ Architecture Overview
```
src/
├── mcp/
│   ├── server.ts                           # Main MCP server (handles all tools)
│   ├── tools.ts                           # Progressive disclosure tools
│   ├── tools-enhanced-visual-verification.ts # Visual verification tools
│   └── handlers-n8n-manager.ts           # n8n API management
├── services/
│   ├── enhanced-visual-verification.ts    # Browser automation service
│   ├── workflow-validator.ts              # Workflow validation logic
│   ├── property-filter.ts                 # AI-optimized property filtering
│   └── workflow-diff-engine.ts            # Partial workflow updates
├── database/
│   ├── database-adapter.ts                # Universal database compatibility
│   ├── node-repository.ts                 # Node data access layer
│   └── schema.sql                         # Database schema
└── utils/
    ├── query-cache.ts                      # Memory-efficient caching
    └── logger.ts                          # Logging utility
```

### 🔧 Adding New Tools
1. **Define tool schema** in `src/mcp/tools.ts`
2. **Add handler** to `src/mcp/server.ts` switch statement
3. **Implement logic** in appropriate service
4. **Add tests** in `tests/` directory
5. **Update documentation** in README.md

## 📈 Performance Metrics

- **525 nodes** successfully loaded (100% coverage from n8n v1.97.1)
- **520 nodes** with properties (99% coverage)
- **457 nodes** with documentation (87% coverage)
- **263 AI-capable tools** detected and catalogued
- **Auto-fallback** database system ensures 100% uptime
- **<2ms** average response time for cached queries
- **25MB** typical memory usage with intelligent cache management

## 🔄 Recent Updates (v2.7.0)

### ✅ Workflow Diff Engine (NEW!)
- **Partial workflow updates** - Only send the changes, not entire workflow
- **80-90% token savings** for AI agents
- **13 diff operations** - addNode, removeNode, updateNode, connections, etc.
- **Transaction safety** - All operations succeed or all fail
- **Order independence** - Add nodes and connections in any order

### ✅ All Visual Verification Tools Fixed
- **38+ tools working** - Fixed missing tool handler issues
- **Browser automation** with bundled Chromium in Docker
- **Error detection** for "could not find property option"
- **Screenshot capabilities** for visual confirmation
- **Workflow navigation** and interaction automation

### ✅ Enhanced Progressive Disclosure
- **3-tier information system** (<1KB, ~5KB, ~50KB)
- **AI-optimized tool descriptions** with size indicators
- **Choice-driven information access** prevents cognitive overload
- **Complete access when needed** for complex configurations

## 🏆 Why Choose n8n-MCP?

1. **Complete Solution**: Only server providing full n8n workflow lifecycle
2. **AI-Optimized**: Progressive disclosure prevents information overload  
3. **Visual Verification**: Actually SEE your workflows work correctly
4. **Universal Compatibility**: Works with any Node.js version
5. **Production Ready**: Docker deployment with health checks
6. **Actively Maintained**: Regular updates and improvements
7. **Just Works**: Pull Docker image and run - no complex setup

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Attribution

- ✅ Free for any use (personal, commercial, etc.)
- ✅ Modifications and distribution allowed
- ✅ Can be included in commercial products
- ✅ Can be hosted as a service

Attribution is appreciated but not required.

## 🤝 Contributing

Contributions are welcome! This is a specialized MCP server designed for AI agents working with n8n. Please ensure:

1. **AI agent compatibility** - Tools should be designed for AI consumption
2. **Progressive disclosure** - Provide appropriate information granularity
3. **Visual verification** - Include browser automation when needed
4. **Documentation** - Update README and tool descriptions

## 🚀 Getting Started Checklist

Ready to use n8n-MCP? Follow this checklist:

### ✅ Prerequisites
- [ ] Docker installed on your system
- [ ] n8n instance running (for workflow management features)
- [ ] Claude Desktop or MCP client ready

### ✅ Quick Setup
- [ ] Pull Docker image: `docker pull your-username/n8n-mcp-server:latest`
- [ ] Create `.env` file with basic configuration
- [ ] Run container: `docker run -d --name n8n-mcp-server --env-file .env your-username/n8n-mcp-server:latest`
- [ ] Check logs: `docker logs n8n-mcp-server`
- [ ] Look for: "MCP server initialized with 38 tools"

### ✅ Claude Desktop Integration
- [ ] Add server to `~/.claude_desktop_config.json`
- [ ] Restart Claude Desktop
- [ ] Test with: "List available n8n nodes for Slack"

### ✅ Optional: n8n API Setup
- [ ] Get n8n API key from Settings → API
- [ ] Add `N8N_API_URL` and `N8N_API_KEY` to `.env`
- [ ] Restart container to enable workflow management tools

---

**🎯 The Complete n8n AI Agent Solution - Discover, Create, and Verify workflows with a single unified MCP server.**

**Ready to get started? Just `docker pull` and run!** 🚀
