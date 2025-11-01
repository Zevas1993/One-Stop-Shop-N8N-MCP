# Quick Start - Local Nano LLM + n8n MCP Server

**Status:** ✅ COMPLETE & READY
**Compilation:** ✅ NO ERRORS

---

## 🚀 Start in 3 Steps

### Step 1: Start Docker
```bash
docker compose up -d
```

### Step 2: Open Browser
```
http://localhost:3000
```

### Step 3: Start Talking
```
"Create a workflow to send Slack alerts when emails arrive"
```

That's it! ✨

---

## 📋 What You Get

### Automatic Hardware Detection
- CPU cores, RAM, GPU detection
- Optimal nano LLM auto-selected
- No configuration needed

### 5 Available LLM Models
| Model | Size | Speed | Quality | Hardware |
|-------|------|-------|---------|----------|
| Phi-3.5-mini | 3.8B | ⚡⚡⚡⚡ | ⭐⭐ | 2GB RAM, 2 cores |
| Phi-3.5-small | 7B | ⚡⚡⚡ | ⭐⭐⭐ | 4GB RAM, 2 cores |
| Neural-Chat-7B | 7B | ⚡⚡⚡ | ⭐⭐⭐ | 4GB RAM, 2 cores |
| Mixtral-7B | 7B | ⚡⚡⚡ | ⭐⭐⭐⭐ | 8GB RAM, 4 cores |
| Llama-2-13B | 13B | ⚡⚡ | ⭐⭐⭐⭐⭐ | 16GB RAM, 8 cores |

### Complete Workflow Generation
- Conversational design
- Multi-node workflows
- Automatic validation
- Ready to deploy

---

## 🎯 Key Features

### 1. Hardware-Aware
System automatically detects your machine specs and picks the best LLM.

### 2. Offline-First
Everything runs locally. No cloud APIs, no external dependencies, no data leaving your machine.

### 3. Conversational
Just describe what you want. The AI understands and generates workflows.

### 4. Validated
Every workflow is automatically validated before deployment.

### 5. Deployable
One-click deploy to your n8n instance (if configured).

---

## 📖 Usage Examples

### Example 1: Email Alert Workflow
```
You: "I want to monitor my Gmail inbox and send me Slack alerts
     for important emails from my boss"

LLM: "Great! I'll create a workflow that:
     - Checks Gmail every 5 minutes
     - Filters for emails from specific sender
     - Sends Slack notification with email details

     Should I generate this?"

You: "Yes, generate it"

LLM: ✅ Workflow generated with 4 nodes!
     - Gmail trigger
     - Filter condition
     - Message format
     - Slack notification

     Ready to deploy?

You: "Deploy" (or save as JSON)
```

### Example 2: Data Sync Workflow
```
You: "Sync records from Airtable to Google Sheets hourly"

LLM: "I can create a workflow that:
     1. Triggers every hour
     2. Fetches Airtable records
     3. Updates Google Sheets

     Details:
     - Which Airtable table?
     - Which Google Sheet?
     - Which fields to sync?"

You: "Customers table to Sheet1, sync Name and Email"

LLM: ✅ Workflow generated!
     Ready to deploy?
```

---

## 🎨 Web Interface Overview

### Setup Page
- Hardware info (CPU, RAM, GPU)
- Recommended LLM
- n8n API configuration (optional)

### Chat Page
- Message history
- Real-time responses
- Workflow generation
- Deployment button

### Workflow Management
- List generated workflows
- View workflow JSON
- Deploy to n8n
- Check status

---

## ⚙️ Configuration

### n8n Integration (Optional)
If you want to deploy workflows directly:

1. Click "Configure n8n" button
2. Enter API URL: `http://localhost:5678`
3. Enter API Key (from n8n settings)
4. Click "Configure"

Then you can deploy workflows with one click!

### Environment Variables
```env
# These are optional - defaults work for most users
NODE_ENV=production
PORT=3000
MCP_MODE=http
ENABLE_LOCAL_LLM=true
LLM_OPTION=auto  # or: phi-3.5-mini, mixtral-7b, etc.
```

---

## 🔧 Common Commands

### View Logs
```bash
docker compose logs -f mcp-server
```

### Stop Services
```bash
docker compose down
```

### Restart
```bash
docker compose restart
```

### Rebuild (after code changes)
```bash
docker compose up -d --build
```

---

## 💡 Tips & Tricks

### For Better Workflow Generation
1. **Be specific**: "Monitor important emails from john@company.com" works better than "monitor emails"
2. **Explain context**: "Update spreadsheet within 5 minutes of receiving data"
3. **Ask questions**: If LLM asks clarifying questions, answer them!
4. **Review generated workflow**: Check the workflow JSON before deploying

### For Performance
- **High-end hardware?** Use Mixtral-7B or Llama-2-13B for best quality
- **Lower-end hardware?** Phi-3.5-mini is fast and good enough for most tasks
- **Want GPU?** Models run 2-5x faster with GPU acceleration

### For Privacy
All data stays local:
- No cloud API calls
- No data stored in external services
- All processing happens in your Docker container
- Perfect for sensitive workflows

---

## ❓ FAQ

**Q: Do I need n8n installed?**
A: No, but you can deploy to n8n Cloud or local instance if you want.

**Q: What if I don't have enough RAM?**
A: System auto-selects smaller model. Phi-3.5-mini works with 2GB RAM.

**Q: Can I use this on Apple Silicon?**
A: Yes! Docker handles multi-architecture automatically.

**Q: Can I use this without Docker?**
A: Yes, see main README.md for development setup.

**Q: Can I use this with Claude Desktop?**
A: Yes! It works as both stdio MCP and HTTP server.

**Q: Is this free?**
A: Yes, completely open source (MIT license).

**Q: Can I modify the code?**
A: Yes, fork it and make changes. See CLAUDE.md for development setup.

**Q: What if something breaks?**
A: Check logs: `docker compose logs` - they usually tell you what's wrong.

---

## 📚 More Information

For more details, see:
- **DOCKER_DESKTOP_SETUP.md** - Complete deployment guide
- **LOCAL_NANO_LLM_ARCHITECTURE.md** - System design & architecture
- **LOCAL_LLM_IMPLEMENTATION_COMPLETE.md** - Implementation details

---

## 🆘 Troubleshooting

### "Connection refused" Error
```bash
# Wait 30 seconds for startup (first time takes longer)
docker compose logs mcp-server
# Should see "[v3.0.0] MCP Server initialized"
```

### "Out of memory" Error
```bash
# Set smaller LLM model
# Edit .env and add:
# LLM_OPTION=phi-3.5-mini

docker compose restart
```

### Web UI shows "Loading..." Forever
```bash
# Check server is running:
docker compose ps

# Check logs:
docker compose logs mcp-server --tail=50

# Restart if needed:
docker compose restart mcp-server
```

### Can't connect to n8n
```bash
# Verify n8n is running:
curl http://localhost:5678

# Check API key is correct in Web UI
# Test connection with simpler request first
```

---

## 🎓 How It Works (Simple Version)

```
1. You describe workflow idea
   ↓
2. Nano LLM understands your request
   ↓
3. System uses 4 specialized agents:
   - Pattern Agent (finds workflow pattern)
   - GraphRAG Agent (discovers compatible nodes)
   - Workflow Agent (builds workflow)
   - Validator Agent (checks it's correct)
   ↓
4. Generates complete n8n workflow
   ↓
5. You can review and deploy
```

---

## 🚀 Next Steps

1. ✅ Start Docker: `docker compose up -d`
2. ✅ Open Web UI: `http://localhost:3000`
3. ✅ Describe workflow idea
4. ✅ Generate and review
5. ✅ Deploy (if n8n configured)
6. ✅ Watch it execute!

---

## 💬 Examples to Try

```
"Create a webhook that validates JSON and sends to database"

"Monitor a Trello board and post updates to Slack"

"Sync between Google Sheets and Airtable daily"

"Process incoming emails and create tasks"

"Build a form that saves responses to spreadsheet"

"Monitor API endpoint and alert if status changes"
```

---

## ✨ Key Takeaway

**You don't need to understand n8n nodes to build workflows anymore.**

Just talk naturally about what you want to automate. The local nano LLM and nano agents do the heavy lifting. Everything runs offline, locally, securely.

Enjoy! 🎉

---

*For detailed information, see the other documentation files in this directory.*
