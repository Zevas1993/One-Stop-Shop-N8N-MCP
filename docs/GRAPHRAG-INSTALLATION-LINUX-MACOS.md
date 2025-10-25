# GraphRAG Installation Guide - Linux & macOS

**Version:** 3.0.0-beta
**Last Updated:** 2025-01-19
**Platforms:** Linux (Ubuntu/Debian/Fedora), macOS 11+

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [System Requirements](#system-requirements)
3. [Installation Methods](#installation-methods)
4. [Configuration](#configuration)
5. [Troubleshooting](#troubleshooting)
6. [Verification](#verification)

---

## Quick Start

### Linux (Ubuntu/Debian)

```bash
# 1. Download or clone repository
git clone https://github.com/n8n-io/n8n-mcp.git
cd n8n-mcp

# 2. Run installer
chmod +x scripts/install-linux.sh
./scripts/install-linux.sh

# 3. Verify installation
npm run metrics:snapshot

# 4. Add to Claude Desktop (see Configuration section)
```

### macOS

```bash
# 1. Install via Homebrew (if formula available)
brew install n8n-mcp

# 2. Or clone and install manually
git clone https://github.com/n8n-io/n8n-mcp.git
cd n8n-mcp
./scripts/install-macos.sh

# 3. Verify installation
npm run metrics:snapshot

# 4. Add to Claude Desktop (see Configuration section)
```

---

## System Requirements

### Linux

**Supported Distributions:**
- Ubuntu 20.04 LTS or newer
- Debian 11 or newer
- Fedora 35 or newer
- Any other Linux with glibc 2.29+

**Minimum:**
- RAM: 4GB (8GB recommended)
- Disk: 10GB free
- Python 3.8+
- Node.js 18+
- gcc/clang (for compilation)

**Install Prerequisites:**

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  python3 \
  python3-pip \
  python3-dev \
  nodejs \
  npm \
  git

# Fedora
sudo dnf install -y \
  gcc \
  g++ \
  make \
  python3 \
  python3-devel \
  nodejs \
  npm \
  git

# Arch
sudo pacman -S \
  base-devel \
  python \
  nodejs \
  npm \
  git
```

### macOS

**Minimum:**
- macOS 11 (Big Sur) or newer
- RAM: 8GB (16GB recommended)
- Disk: 10GB free
- Intel or Apple Silicon (M1/M2/M3)

**Install Prerequisites:**

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install python@3.11 node git

# Verify versions
python3 --version   # Should be 3.11+
node --version      # Should be 18+
npm --version       # Should be 9+
```

---

## Installation Methods

### Method 1: Automated Installer Script

**Easiest for most users (5-10 minutes)**

#### Linux (Ubuntu/Debian)

```bash
# Download installer
curl -O https://raw.githubusercontent.com/n8n-io/n8n-mcp/main/scripts/install-linux.sh
chmod +x install-linux.sh

# Run installer
./install-linux.sh

# Follow prompts:
# - Choose installation directory (default: ~/.local/n8n-mcp)
# - Discover n8n instance (auto or manual)
# - Build initial graph (yes/no)
# - Register with Claude Desktop (yes/no)

# Test installation
npm run metrics:snapshot
```

#### Linux (Fedora/RHEL)

```bash
# Download Fedora-specific installer
curl -O https://raw.githubusercontent.com/n8n-io/n8n-mcp/main/scripts/install-fedora.sh
chmod +x install-fedora.sh

# Run installer
./install-fedora.sh
```

#### macOS

```bash
# Download macOS installer
curl -O https://raw.githubusercontent.com/n8n-io/n8n-mcp/main/scripts/install-macos.sh
chmod +x install-macos.sh

# Run installer
./install-macos.sh

# Follow prompts
```

### Method 2: Manual Installation from Source

**For developers or custom configurations**

```bash
# 1. Clone repository
git clone https://github.com/n8n-io/n8n-mcp.git
cd n8n-mcp

# 2. Install Node.js dependencies
npm install

# 3. Build TypeScript
npm run build

# 4. Install Python dependencies
pip3 install -r python/requirements-graphrag.txt

# 5. Create data directories
mkdir -p ~/.cache/n8n-mcp/graph
mkdir -p ~/.config/n8n-mcp/logs

# 6. Discover n8n instance
python3 scripts/n8n_discovery.py
# Follow prompts and save configuration

# 7. Build initial graph (2-5 minutes)
python3 scripts/initial_graph_builder.py

# 8. Setup auto-updater (cron job)
python3 scripts/setup_auto_update_cron.py
# This adds cron job: every 6 hours
```

#### Verify Installation

```bash
# Check if all components are in place
ls -la ~/.cache/n8n-mcp/graph/
ls -la ~/.config/n8n-mcp/

# Check cron job (Linux only)
crontab -l | grep n8n-mcp

# Test metrics collection
npm run metrics:snapshot
```

### Method 3: Homebrew (macOS Only)

**For macOS users**

```bash
# Tap the repository (if not already added)
brew tap n8n-io/n8n-mcp

# Install
brew install n8n-mcp

# This installs to: /usr/local/Cellar/n8n-mcp/

# Setup configuration
~/.local/share/n8n-mcp/setup.sh

# Verify
npm run metrics:snapshot
```

### Method 4: Package Manager (Linux)

**Ubuntu/Debian .deb package**

```bash
# Download package
wget https://releases.github.com/n8n-mcp/n8n-mcp-3.0.0-beta-amd64.deb

# Install
sudo dpkg -i n8n-mcp-3.0.0-beta-amd64.deb

# Or with automatic dependency installation
sudo apt-get install ./n8n-mcp-3.0.0-beta-amd64.deb
```

**Fedora/RHEL .rpm package**

```bash
# Download package
wget https://releases.github.com/n8n-mcp/n8n-mcp-3.0.0-beta-x86_64.rpm

# Install
sudo rpm -ivh n8n-mcp-3.0.0-beta-x86_64.rpm
```

---

## Configuration

### Environment Variables

Create `~/.config/n8n-mcp/.env`:

```bash
# ========================
# REQUIRED
# ========================
NODE_ENV=production                           # production or development
MCP_MODE=stdio                                # stdio (local) or http (remote)

# ========================
# GRAPHRAG CONFIGURATION
# ========================
GRAPH_DIR=~/.cache/n8n-mcp/graph             # Must be writable directory
GRAPH_PYTHON=python3                         # Path to Python executable
GRAPH_BACKEND=python/backend/graph/lightrag_service.py
BRIDGE_CACHE_MAX=100                         # Max cached queries
METRICS_GRAPHRAG=false                       # Enable metrics logging
DEBUG_MCP=false                              # Enable debug output

# ========================
# N8N INTEGRATION (optional)
# ========================
N8N_API_URL=http://localhost:5678
N8N_API_KEY=n8n_api_xxx...

# ========================
# HTTP MODE (optional)
# ========================
PORT=3000
AUTH_TOKEN=your-secure-token
```

### Quick Configuration

```bash
# Create config directory
mkdir -p ~/.config/n8n-mcp
mkdir -p ~/.cache/n8n-mcp/graph

# Create .env file
cat > ~/.config/n8n-mcp/.env << 'EOF'
NODE_ENV=production
MCP_MODE=stdio
GRAPH_DIR=~/.cache/n8n-mcp/graph
EOF

# Make directories readable/writable
chmod 755 ~/.config/n8n-mcp
chmod 755 ~/.cache/n8n-mcp/graph
```

### Add to Claude Desktop

#### macOS

Edit `~/Library/Application\ Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "n8n-graphrag": {
      "command": "/usr/local/bin/node",
      "args": [
        "~/.local/share/n8n-mcp/dist/mcp/index.js"
      ],
      "env": {
        "MCP_MODE": "stdio",
        "GRAPH_DIR": "~/.cache/n8n-mcp/graph",
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Linux

Edit `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "n8n-graphrag": {
      "command": "/usr/bin/node",
      "args": [
        "~/.local/share/n8n-mcp/dist/mcp/index.js"
      ],
      "env": {
        "MCP_MODE": "stdio",
        "GRAPH_DIR": "~/.cache/n8n-mcp/graph",
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Restart Claude Desktop

```bash
# macOS
killall Claude

# Linux
pkill Claude
# or
killall claude-desktop
```

---

## Verification

### Installation Checklist

```bash
# 1. Check graph was built
[ -f ~/.cache/n8n-mcp/graph/catalog.json ] && echo "✓ Catalog exists" || echo "✗ Catalog missing"

# 2. Check configuration
[ -f ~/.config/n8n-mcp/.env ] && echo "✓ Config exists" || echo "✗ Config missing"

# 3. Check auto-updater
crontab -l | grep n8n-mcp > /dev/null && echo "✓ Cron job exists" || echo "✗ Cron job missing"

# 4. Check MCP server binary
[ -f ~/.local/share/n8n-mcp/dist/mcp/index.js ] && echo "✓ MCP server exists" || echo "✗ MCP server missing"
```

### Test Commands

```bash
# Run metrics snapshot
npm run metrics:snapshot

# Start server manually
npm run start

# Run tests
npm test

# Check graph status
du -sh ~/.cache/n8n-mcp/graph/

# View auto-update logs (Linux)
grep n8n-mcp /var/log/syslog | tail -20

# View auto-update logs (macOS)
log stream --predicate 'process == "n8n-mcp"' --level debug
```

---

## Troubleshooting

### Common Issues

#### 1. "command not found: node"

**Symptom:** node or npm not found in PATH

**Solution:**
```bash
# Verify Node is installed
which node npm

# If not installed:
# macOS:
brew install node

# Ubuntu/Debian:
sudo apt-get install nodejs npm

# Add to PATH (if needed)
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

#### 2. "Python requirements installation failed"

**Symptom:** `pip install` fails with missing dependencies

**Solution:**
```bash
# Install build tools
# Ubuntu/Debian:
sudo apt-get install python3-dev build-essential

# macOS:
xcode-select --install

# Upgrade pip
pip3 install --upgrade pip setuptools wheel

# Try again
pip3 install -r python/requirements-graphrag.txt
```

#### 3. "Cannot build graph" Error

**Symptom:** Graph builder fails to connect to n8n

**Solution:**
```bash
# Check if n8n is running
curl http://localhost:5678

# If not running, start n8n or provide custom URL
python3 scripts/n8n_discovery.py

# Manual rebuild with custom URL
python3 scripts/initial_graph_builder.py \
  --n8n-url http://your-n8n-url:5678 \
  --api-key "n8n_api_xxx..."
```

#### 4. "Permission denied" on directories

**Symptom:** Cannot read/write to graph or config directories

**Solution:**
```bash
# Fix directory permissions
chmod -R 755 ~/.cache/n8n-mcp/
chmod -R 755 ~/.config/n8n-mcp/

# Or as root (if absolutely necessary)
sudo chown -R $USER:$USER ~/.cache/n8n-mcp/
sudo chown -R $USER:$USER ~/.config/n8n-mcp/
```

#### 5. "Cron job not running" (Linux)

**Symptom:** Auto-updater not running on schedule

**Solution:**
```bash
# Check cron is running
sudo systemctl status cron

# Check cron log
sudo journalctl -u cron -n 20

# Verify cron job exists
crontab -l

# Manually recreate cron job
python3 scripts/setup_auto_update_cron.py

# Test cron execution
at now + 1 minute < <(python3 scripts/auto_updater.py)
```

#### 6. "Claude Desktop not connecting"

**Symptom:** MCP server shows as unresponsive in Claude Desktop

**Solution:**
```bash
# Verify server binary exists
[ -f ~/.local/share/n8n-mcp/dist/mcp/index.js ] && echo "Found"

# Test server manually
node ~/.local/share/n8n-mcp/dist/mcp/index.js

# Check file permissions
ls -la ~/.local/share/n8n-mcp/dist/mcp/index.js

# Restart Claude Desktop
killall Claude
# Reopen Claude Desktop
```

#### 7. "Module not found" Error

**Symptom:** "Cannot find module '@modelcontextprotocol/sdk'"

**Solution:**
```bash
# Rebuild dependencies
cd ~/.local/share/n8n-mcp/
npm install --production

# Or from source
cd ~/path/to/n8n-mcp
npm install
npm run build
```

---

## Advanced Configuration

### Custom Installation Directory

```bash
# Install to custom location
INSTALL_DIR=/opt/n8n-mcp ./scripts/install-linux.sh

# Add to PATH
export PATH="$INSTALL_DIR/bin:$PATH"
```

### Enable Verbose Logging

```bash
# Edit ~/.config/n8n-mcp/.env
DEBUG_MCP=true
METRICS_GRAPHRAG=true

# View logs in real-time
tail -f ~/.cache/n8n-mcp/logs/bridge.log
```

### Custom n8n Instance

```bash
# Set environment variable
export N8N_API_URL="https://your-cloud-n8n.com"
export N8N_API_KEY="n8n_api_xxx..."

# Or edit ~/.config/n8n-mcp/.env
N8N_API_URL=https://your-cloud-n8n.com
N8N_API_KEY=n8n_api_xxx...

# Rebuild graph
python3 scripts/initial_graph_builder.py
```

### Alternative Graph Storage

```bash
# Create custom location
mkdir -p /data/n8n-graph-cache

# Configure
export GRAPH_DIR="/data/n8n-graph-cache"

# Or edit ~/.config/n8n-mcp/.env
GRAPH_DIR=/data/n8n-graph-cache

# Initialize
python3 scripts/initial_graph_builder.py
```

---

## Uninstallation

### Automated Script

```bash
# Run uninstaller
chmod +x scripts/uninstall-linux.sh
./scripts/uninstall-linux.sh
```

### Manual Uninstallation

```bash
# 1. Remove cron job (Linux)
crontab -e
# Remove lines containing n8n-mcp

# 2. Remove installation directory
rm -rf ~/.local/share/n8n-mcp

# 3. Remove data/config
rm -rf ~/.cache/n8n-mcp
rm -rf ~/.config/n8n-mcp

# 4. Remove Claude Desktop config entry
# Edit ~/.config/Claude/claude_desktop_config.json or ~/Library/Application\ Support/Claude/claude_desktop_config.json
# Remove the "n8n-graphrag" entry

# 5. Homebrew only (macOS)
brew uninstall n8n-mcp
```

---

## Getting Help

### Resources

- **Windows Guide:** [GRAPHRAG-INSTALLATION-WINDOWS.md](./GRAPHRAG-INSTALLATION-WINDOWS.md)
- **Setup Guide:** [GRAPHRAG-SETUP-GUIDE.md](./GRAPHRAG-SETUP-GUIDE.md)
- **Troubleshooting:** [GRAPHRAG-TROUBLESHOOTING.md](./GRAPHRAG-TROUBLESHOOTING.md)
- **Issues:** https://github.com/n8n-io/n8n-mcp/issues

### Common Commands

```bash
# Start server
npm run start

# Build database
npm run rebuild

# Run metrics test
npm run metrics:snapshot

# Run all tests
npm test

# View graph statistics
du -sh ~/.cache/n8n-mcp/graph/
```

---

**Last Updated:** 2025-01-19
**Version:** 3.0.0-beta
**Status:** Ready for Linux/macOS Installation
