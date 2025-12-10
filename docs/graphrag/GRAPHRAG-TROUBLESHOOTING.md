# GraphRAG Troubleshooting Guide

**Version:** 3.0.0-beta
**Last Updated:** 2025-01-19

---

## Table of Contents

1. [Quick Diagnosis](#quick-diagnosis)
2. [Installation Issues](#installation-issues)
3. [Runtime Issues](#runtime-issues)
4. [Graph Building Issues](#graph-building-issues)
5. [Performance Issues](#performance-issues)
6. [Claude Desktop Integration](#claude-desktop-integration)
7. [Logs and Debugging](#logs-and-debugging)

---

## Quick Diagnosis

### Check System Status

```bash
# Windows
powershell
Get-Service | findstr MCP
wmic os get totalvisiblememorybig
dir %APPDATA%\n8n-mcp

# Linux/macOS
ps aux | grep node
ps aux | grep python
free -h  # Linux
memory_pressure  # macOS
ls -la ~/.cache/n8n-mcp/
```

### Verify Installation

```bash
# Check files exist
[ -f ~/.local/share/n8n-mcp/dist/mcp/index.js ] && echo "✓ MCP server" || echo "✗ Missing"
[ -f ~/.cache/n8n-mcp/graph/catalog.json ] && echo "✓ Catalog" || echo "✗ Missing"
[ -f ~/.config/n8n-mcp/.env ] && echo "✓ Config" || echo "✗ Missing"

# Check permissions
ls -la ~/.local/share/n8n-mcp/dist/mcp/index.js
# Should be: -rwxr-xr-x (executable)

# Check Python
python3 --version
python3 -c "import lightrag; print('✓ lightrag installed')"

# Check Node.js
node --version
npm list @modelcontextprotocol/sdk 2>/dev/null | grep @modelcontextprotocol
```

---

## Installation Issues

### Issue: "Command not found: npm" or "node: command not found"

**Symptoms:**
- Installation script fails
- Cannot run any npm commands
- "npm: No such file or directory"

**Root Causes:**
- Node.js not installed
- Node.js not in PATH
- Wrong Node.js version installed

**Solutions:**

```bash
# 1. Check if Node is installed
which node npm
node --version  # Should be 18+
npm --version   # Should be 9+

# 2. If not installed:
# macOS
brew install node

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install nodejs npm

# Windows
# Download from https://nodejs.org/
# Run installer and add to PATH

# 3. If installed but not in PATH:
# Linux/macOS
echo $PATH
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Windows
# Environment Variables → System Variables → Path → Add: C:\Program Files\nodejs
```

### Issue: "Python 3.8+ required" Error

**Symptoms:**
- "Python version is 2.7.x, requires 3.8+"
- "ModuleNotFoundError: No module named 'lightrag'"
- "from lightrag import LightRAG" fails

**Root Causes:**
- Python 2 being used instead of Python 3
- Python 3 but version < 3.8
- pip not installing to correct Python

**Solutions:**

```bash
# 1. Check Python version
python3 --version  # NOT just 'python'
which python3

# 2. If Python 2 installed:
# macOS
brew install python@3.11

# Ubuntu/Debian
sudo apt-get install python3.11

# Windows
# Download from python.org
# Mark "Add to PATH" during installation

# 3. Reinstall dependencies
pip3 install --upgrade --force-reinstall -r python/requirements-graphrag.txt

# 4. Verify installation
python3 -c "from lightrag import LightRAG; print('✓ LightRAG installed')"
```

### Issue: "Permission denied" During Installation

**Symptoms:**
- "EACCES: permission denied"
- "You do not have permission"
- "Access is denied"

**Root Causes:**
- Not running installer as admin (Windows)
- Directory permissions (Linux/macOS)
- User doesn't own directory

**Solutions:**

```bash
# Windows
# Right-click installer → Run as Administrator

# Linux/macOS
# Grant permissions to user
sudo chown -R $USER:$USER ~/.local
sudo chown -R $USER:$USER ~/.cache
sudo chown -R $USER:$USER ~/.config

# Or use sudo for installation
sudo ./scripts/install-linux.sh

# Then fix permissions
sudo chown -R $USER:$USER ~/.local/share/n8n-mcp
```

### Issue: "Disk space full" Error

**Symptoms:**
- "No space left on device"
- "ENOSPC: no space available"
- Installation stops halfway

**Root Causes:**
- Insufficient disk space for models (~2.6GB)
- Graph files taking up space
- Temporary installation files

**Solutions:**

```bash
# Check disk space
df -h  # Linux/macOS
dir C:\  # Windows

# Free up space
# Delete old graph backups
rm -rf ~/.cache/n8n-mcp/backups/*

# Delete npm cache
npm cache clean --force

# Remove test files
rm -rf tests/fixtures/*

# Minimal installation (without models)
./scripts/install-linux.sh --no-models

# Extend disk space or use different location
mkdir -p /mnt/large-disk/n8n-mcp
INSTALL_DIR=/mnt/large-disk/n8n-mcp ./scripts/install-linux.sh
```

---

## Runtime Issues

### Issue: MCP Server Crashes on Startup

**Symptoms:**
- Server starts then immediately exits
- "Error: listen EADDRINUSE"
- "Cannot find module"

**Root Causes:**
- Port already in use
- Missing node_modules
- Corrupted build

**Solutions:**

```bash
# 1. Check if port is in use
# Linux/macOS
netstat -tulpn | grep 3000

# Windows
netstat -ano | findstr :3000

# If in use, kill process:
# Linux/macOS
kill -9 <PID>

# Windows
taskkill /PID <PID> /F

# 2. Rebuild node_modules
rm -rf node_modules package-lock.json
npm install

# 3. Rebuild TypeScript
npm run build

# 4. Check for errors in logs
tail -f ~/.cache/n8n-mcp/logs/error.log

# 5. Start with verbose logging
DEBUG_MCP=true npm run start
```

### Issue: "Python subprocess crashed" Error

**Symptoms:**
- Bridge fails to start Python backend
- "Graph backend exited with code -1"
- "Cannot spawn python process"

**Root Causes:**
- Python installation broken
- Missing Python dependencies
- Python path misconfigured

**Solutions:**

```bash
# 1. Test Python directly
python3 python/backend/graph/lightrag_service.py

# 2. Install missing dependencies
pip3 install -r python/requirements-graphrag.txt

# 3. Check Python executable path
echo $GRAPH_PYTHON  # Or N8N_GRAPH_PYTHON

# 4. Verify Python can import lightrag
python3 -c "from lightrag import LightRAG; print('OK')"

# 5. Check Python version
python3 --version

# 6. Try upgrading libraries
pip3 install --upgrade torch transformers sentence-transformers
```

### Issue: "Memory limit exceeded" Error

**Symptoms:**
- "JavaScript heap out of memory"
- Process killed due to memory
- Slow performance then crash

**Root Causes:**
- Cache too large
- Memory leak
- Graph too large for available RAM

**Solutions:**

```bash
# 1. Reduce cache size
export BRIDGE_CACHE_MAX=20

# 2. Lower memory threshold
export MEM_GUARD_THRESHOLD_MB=256

# 3. Clear cache
rm -rf ~/.cache/n8n-mcp/bridge-cache/*

# 4. Check memory usage
# Linux
ps aux | grep node | awk '{print $6}'

# macOS
ps aux | grep node

# 5. Increase Node.js heap
node --max-old-space-size=4096 dist/mcp/index.js

# 6. Restart service
killall node
npm run start
```

---

## Graph Building Issues

### Issue: "Cannot connect to n8n" Error

**Symptoms:**
- "Failed to fetch nodes from n8n"
- "ECONNREFUSED: Connection refused"
- "n8n instance not found"

**Root Causes:**
- n8n not running
- Wrong n8n URL
- Network connectivity issue
- Firewall blocking

**Solutions:**

```bash
# 1. Verify n8n is running
curl http://localhost:5678

# 2. If not running, start n8n
npm start  # If installed locally
# Or open n8n Cloud dashboard

# 3. Check n8n URL
echo $N8N_API_URL

# 4. Try different ports
for port in 5678 5679 5680 5681 5682; do
  curl -s http://localhost:$port >/dev/null && echo "n8n on $port"
done

# 5. Test with explicit URL
N8N_API_URL=http://192.168.1.100:5678 python3 scripts/initial_graph_builder.py

# 6. Check firewall
# Windows: Check Windows Defender Firewall
# Linux: sudo ufw status
# macOS: System Preferences → Security & Privacy → Firewall

# 7. Test from different machine
curl http://<n8n-ip>:5678 -v
```

### Issue: "Graph build takes too long" (>10 minutes)

**Symptoms:**
- Graph building stuck for 10+ minutes
- Progress not visible
- Process seems hung

**Root Causes:**
- Large number of nodes (500+)
- Slow n8n API
- Memory pressure slowing disk I/O
- Network latency

**Solutions:**

```bash
# 1. Check progress (look for events.jsonl updates)
ls -la ~/.cache/n8n-mcp/graph/events.jsonl
# If timestamp isn't changing, process is hung

# 2. Build with subset (for testing)
python3 scripts/initial_graph_builder.py --limit 100

# 3. Build with specific node types
python3 scripts/initial_graph_builder.py --node-types "slack,http"

# 4. Monitor memory/CPU
# Linux
watch -n1 'ps aux | grep lightrag'

# macOS
top -p $(pgrep python3) -s 1

# 5. Increase timeout
export N8N_API_TIMEOUT=120000

# 6. Run in verbose mode
python3 scripts/initial_graph_builder.py --verbose

# 7. If really stuck, press Ctrl+C and:
# - Check logs for errors
# - Free up memory/disk
# - Try again with --force flag
python3 scripts/initial_graph_builder.py --force
```

### Issue: "Catalog.json is corrupted or too small"

**Symptoms:**
- Catalog file very small (< 1MB)
- Graph queries return "entity not found"
- "entities: 0, relationships: 0"

**Root Causes:**
- Graph build didn't complete
- Old catalog not deleted before rebuild
- Disk full during build

**Solutions:**

```bash
# 1. Check catalog size
ls -lh ~/.cache/n8n-mcp/graph/catalog.json
# Should be 5-10MB

# 2. Delete corrupt catalog
rm ~/.cache/n8n-mcp/graph/catalog.json

# 3. Delete old backup
rm -rf ~/.cache/n8n-mcp/backups/

# 4. Free disk space
df -h
# Ensure >2GB free

# 5. Rebuild graph
python3 scripts/initial_graph_builder.py --force

# 6. Verify rebuild
wc -l ~/.cache/n8n-mcp/graph/catalog.json
# Should have 500+ lines
```

---

## Performance Issues

### Issue: Graph queries very slow (>100ms)

**Symptoms:**
- P50 latency > 100ms
- Claude Desktop is sluggish
- Each query takes 1+ seconds

**Root Causes:**
- Large graph consuming memory
- Slow disk I/O
- CPU throttling
- Python subprocess overhead

**Solutions:**

```bash
# 1. Check metrics
npm run metrics:snapshot

# 2. Check system resources
# Linux
free -h
top -n 1

# macOS
memory_pressure
Activity Monitor

# Windows
tasklist
wmic OS get TotalVisibleMemorySize

# 3. Reduce cache size for faster lookups
export BRIDGE_CACHE_MAX=50

# 4. Enable query caching
export METRICS_GRAPHRAG=true
# Wait for warm-up (20+ queries)

# 5. Check disk speed
# Linux
dd if=/dev/zero of=test.img bs=1G count=1
# Note time taken

# 6. Disable debug logging
export DEBUG_MCP=false

# 7. Rebuild graph on faster disk
# Copy data directory to SSD if possible
```

### Issue: Claude Desktop freezes while querying

**Symptoms:**
- Claude stops responding during queries
- Long delays between questions
- "MCP server not responding"

**Root Causes:**
- Blocking I/O in bridge
- Graph queries taking too long
- Memory pressure
- Broken subprocess communication

**Solutions:**

```bash
# 1. Check bridge is responsive
npm run graphrag:health

# 2. Check logs for errors
tail -f ~/.cache/n8n-mcp/logs/bridge.log

# 3. Restart bridge
killall -9 node
npm run start

# 4. Check query latency
npm run metrics:snapshot
# If P95 > 1000ms, investigate

# 5. Rebuild graph to reduce size
python3 scripts/initial_graph_builder.py --limit 100

# 6. Increase timeout in Claude
# Edit ~/.config/Claude/claude_desktop_config.json
# Add: "timeout": 30000

# 7. Check system resources while querying
watch -n 0.1 'ps aux | grep node'
```

---

## Claude Desktop Integration

### Issue: "n8n-graphrag server not showing up"

**Symptoms:**
- Claude Desktop Settings → Servers shows no servers
- Or server listed but grayed out
- "Server not responding"

**Root Causes:**
- Configuration not found
- MCP server not built
- Claude Desktop not restarted
- Configuration syntax error

**Solutions:**

```bash
# 1. Check config file exists
# macOS
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Linux
cat ~/.config/Claude/claude_desktop_config.json

# Windows
type "%APPDATA%\Claude\claude_desktop_config.json"

# 2. Verify configuration syntax (should be valid JSON)
python3 -m json.tool ~/Library/Application\ Support/Claude/claude_desktop_config.json

# 3. Verify MCP server binary exists
[ -f ~/.local/share/n8n-mcp/dist/mcp/index.js ] && echo "Found"

# 4. Check MCP server is executable
ls -la ~/.local/share/n8n-mcp/dist/mcp/index.js
# Should have 'x' permission

# 5. Test MCP server manually
node ~/.local/share/n8n-mcp/dist/mcp/index.js

# 6. Rebuild MCP server
npm run build

# 7. Restart Claude Desktop
# Completely quit Claude (not just close window)
# Reopen Claude
```

### Issue: "Server starting, but no tools available"

**Symptoms:**
- Server shows as connected
- No MCP tools visible in Claude
- "No tools found"

**Root Causes:**
- Tools not registered
- GraphRAG tools not compiled
- Database not initialized

**Solutions:**

```bash
# 1. Check tools are registered
npm run test:mcp-tools

# 2. Rebuild everything
npm run build
npm run rebuild

# 3. Check tool count
npm run graphrag:show-tools | wc -l
# Should show 62+ tools

# 4. Test tool individually
# In Claude, try: "search_nodes" command

# 5. Check database is populated
# Windows
dir %APPDATA%\n8n-mcp\graph\catalog.json

# Linux/macOS
ls -lh ~/.cache/n8n-mcp/graph/catalog.json
# Should be >1MB

# 6. Verify graph initialization
npm run graphrag:status

# 7. Reinitialize graph
rm -rf ~/.cache/n8n-mcp/graph/*
python3 scripts/initial_graph_builder.py
```

---

## Logs and Debugging

### Enable Debug Logging

```bash
# Set debug environment variables
export DEBUG_MCP=true
export METRICS_GRAPHRAG=true
export DEBUG=n8n-mcp:*

# Start server with debug output
npm run start 2>&1 | tee debug.log

# Or start with Node debug
node --inspect dist/mcp/index.js
# Connect Chrome DevTools to inspect://
```

### View Logs

```bash
# Linux/macOS
tail -f ~/.cache/n8n-mcp/logs/bridge.log
tail -f ~/.cache/n8n-mcp/logs/error.log

# Windows
type %APPDATA%\n8n-mcp\logs\error.log
type %APPDATA%\n8n-mcp\logs\bridge.log

# Real-time monitoring
# Linux/macOS
watch -n1 "tail -20 ~/.cache/n8n-mcp/logs/bridge.log"

# Windows PowerShell
Get-Content -Tail 20 -Wait $env:APPDATA\n8n-mcp\logs\bridge.log
```

### Debug Subprocess Communication

```bash
# Test Python backend directly
python3 python/backend/graph/lightrag_service.py << 'EOF'
{"jsonrpc": "2.0", "method": "query_graph", "params": {"text": "slack"}, "id": 1}
EOF

# Should return JSON response with "jsonrpc", "result", "id"

# Test with verbose output
PYTHONUNBUFFERED=1 python3 -u python/backend/graph/lightrag_service.py
```

### Memory Profiling

```bash
# JavaScript heap snapshot
node --expose-gc dist/mcp/index.js
# Then in terminal: global.gc()

# Python memory usage
python3 -m memory_profiler scripts/initial_graph_builder.py

# Monitor while running
# Linux
while true; do
  ps aux | grep "node\|python" | grep -v grep
  sleep 1
done
```

---

## Recovery Procedures

### Emergency: Reset Everything

```bash
# 1. Stop all services
killall -9 node python3 2>/dev/null

# 2. Remove all cached data
rm -rf ~/.cache/n8n-mcp/
rm -rf ~/.config/n8n-mcp/
rm -rf ~/.local/share/n8n-mcp/

# 3. Reinstall
npm install
npm run build
./scripts/install-linux.sh

# 4. Rebuild graph
python3 scripts/initial_graph_builder.py
```

### Restore from Backup

```bash
# If you have a backup
npm run graphrag:restore --dir /path/to/backup

# Or manually
cp -r /backup/graph/* ~/.cache/n8n-mcp/graph/
```

### Factory Reset (keep configuration)

```bash
# Remove only graph data, keep config
rm -rf ~/.cache/n8n-mcp/graph/*

# Rebuild graph from n8n
python3 scripts/initial_graph_builder.py
```

---

## When to Report an Issue

**Report a bug if:**
1. Problem persists after troubleshooting steps
2. Error message is not in this guide
3. Same issue happens consistently
4. Multiple components failing simultaneously

**Provide when reporting:**
- Operating system and version
- Node.js and Python versions
- Full error message and logs
- Steps to reproduce
- Output of `npm run graphrag:show-config`

**Report here:**
- GitHub Issues: https://github.com/n8n-io/n8n-mcp/issues
- Include: Environment, error logs, reproduction steps

---

**Last Updated:** 2025-01-19
**Version:** 3.0.0-beta
**Status:** Comprehensive Troubleshooting Reference
