#!/bin/bash
# n8n MCP Server Installer for Linux
# Version: 3.0.0-beta
# Supported: Ubuntu 20.04+, Debian 11+, Fedora 35+, Arch
# Usage: chmod +x install-linux.sh && ./install-linux.sh [OPTIONS]

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default settings
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/share/n8n-mcp}"
GRAPH_DIR="${GRAPH_DIR:-$HOME/.cache/n8n-mcp/graph}"
CONFIG_DIR="${CONFIG_DIR:-$HOME/.config/n8n-mcp}"
BUILD_GRAPH="${BUILD_GRAPH:-true}"
SETUP_CRON="${SETUP_CRON:-true}"
INSTALL_MODELS="${INSTALL_MODELS:-false}"
DISTRO=""

# Logging
LOG_FILE="${HOME}/.cache/n8n-mcp/logs/install.log"

log() {
    local level="$1"
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

log_step() {
    echo -e "${BLUE}==>${NC} $1"
    log "INFO" "$1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
    log "SUCCESS" "$1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    log "ERROR" "$1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    log "WARN" "$1"
}

# Detect Linux distribution
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$(echo "$ID" | tr '[:upper:]' '[:lower:]')
        DISTRO_VERSION="$VERSION_ID"
    elif command -v lsb_release &>/dev/null; then
        DISTRO=$(lsb_release -si | tr '[:upper:]' '[:lower:]')
        DISTRO_VERSION=$(lsb_release -sr)
    elif [ -f /etc/debian_version ]; then
        DISTRO="debian"
        DISTRO_VERSION=$(cat /etc/debian_version)
    elif [ -f /etc/redhat-release ]; then
        DISTRO="fedora"
        DISTRO_VERSION=$(rpm -q --queryformat '%{VERSION}' centos-release || rpm -q --queryformat '%{VERSION}' fedora-release)
    else
        log_error "Cannot detect Linux distribution"
        exit 1
    fi

    log "Detected distribution: $DISTRO $DISTRO_VERSION"
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."

    local missing=0

    # Check Node.js
    if ! command -v node &>/dev/null; then
        log_error "Node.js not found. Please install Node.js 18+ first"
        missing=1
    else
        local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_version" -lt 18 ]; then
            log_error "Node.js 18+ required, found version $(node -v)"
            missing=1
        else
            log_success "Node.js $(node -v) found"
        fi
    fi

    # Check Python
    if ! command -v python3 &>/dev/null; then
        log_error "Python 3 not found. Please install Python 3.8+ first"
        missing=1
    else
        local python_version=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
        log_success "Python $python_version found"
    fi

    # Check git
    if ! command -v git &>/dev/null; then
        log_warn "git not found. Some features may not work"
    else
        log_success "git found"
    fi

    if [ $missing -eq 1 ]; then
        log_error "Missing required dependencies"
        exit 1
    fi
}

# Install system packages (Ubuntu/Debian)
install_ubuntu_deps() {
    log_step "Installing Ubuntu/Debian dependencies..."

    sudo apt-get update
    sudo apt-get install -y \
        build-essential \
        python3-dev \
        python3-pip \
        python3-venv \
        git

    log_success "System packages installed"
}

# Install system packages (Fedora/RHEL)
install_fedora_deps() {
    log_step "Installing Fedora/RHEL dependencies..."

    sudo dnf groupinstall -y "Development Tools"
    sudo dnf install -y \
        python3-devel \
        python3-pip \
        git

    log_success "System packages installed"
}

# Install system packages (Arch)
install_arch_deps() {
    log_step "Installing Arch dependencies..."

    sudo pacman -S --noconfirm \
        base-devel \
        python \
        python-pip \
        git

    log_success "System packages installed"
}

# Create directories
create_directories() {
    log_step "Creating directories..."

    mkdir -p "$INSTALL_DIR"
    mkdir -p "$GRAPH_DIR"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"

    log_success "Directories created"
}

# Setup Python virtual environment
setup_python_venv() {
    log_step "Setting up Python virtual environment..."

    python3 -m venv "$INSTALL_DIR/venv"
    source "$INSTALL_DIR/venv/bin/activate"

    pip install --upgrade pip setuptools wheel

    log_success "Python virtual environment created"
}

# Install Node dependencies
install_node_deps() {
    log_step "Installing Node.js dependencies..."

    if [ ! -f "package.json" ]; then
        log_error "package.json not found. Run from repository root"
        exit 1
    fi

    npm install

    log_success "Node.js dependencies installed"
}

# Install Python dependencies
install_python_deps() {
    log_step "Installing Python dependencies..."

    source "$INSTALL_DIR/venv/bin/activate"
    pip install -r python/requirements-graphrag.txt

    log_success "Python dependencies installed"
}

# Build TypeScript
build_typescript() {
    log_step "Building TypeScript..."

    npm run build

    log_success "TypeScript build completed"
}

# Create .env configuration
create_configuration() {
    log_step "Creating configuration..."

    local env_file="$CONFIG_DIR/.env"

    cat > "$env_file" << EOF
# n8n MCP Server Configuration
# Generated: $(date)

# Core settings
NODE_ENV=production
MCP_MODE=stdio

# GraphRAG settings
GRAPH_DIR=$GRAPH_DIR
GRAPH_PYTHON=python3
GRAPH_BACKEND=python/backend/graph/lightrag_service.py
BRIDGE_CACHE_MAX=100
METRICS_GRAPHRAG=false
DEBUG_MCP=false

# Memory management
MEM_GUARD_THRESHOLD_MB=512

# n8n Integration (optional)
# N8N_API_URL=http://localhost:5678
# N8N_API_KEY=your-api-key
EOF

    chmod 600 "$env_file"
    log_success "Configuration created: $env_file"
}

# Setup cron job for auto-updates
setup_cron_job() {
    if [ "$SETUP_CRON" != "true" ]; then
        log_warn "Skipping cron setup (disabled)"
        return
    fi

    log_step "Setting up auto-update cron job..."

    local cron_script="$INSTALL_DIR/scripts/auto_updater.py"
    local cron_entry="0 */6 * * * $INSTALL_DIR/venv/bin/python3 $cron_script >> $LOG_FILE 2>&1"

    # Remove existing entry if present
    (crontab -l 2>/dev/null | grep -v "n8n-mcp" | crontab -) || true

    # Add new entry
    (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -

    log_success "Cron job setup completed (every 6 hours)"
}

# Build initial graph
build_initial_graph() {
    if [ "$BUILD_GRAPH" != "true" ]; then
        log_warn "Skipping graph build (disabled)"
        return
    fi

    log_step "Building initial GraphRAG knowledge graph..."
    log_warn "This may take 2-5 minutes. Please wait..."

    source "$INSTALL_DIR/venv/bin/activate"

    if [ -f "scripts/n8n_discovery.py" ]; then
        python3 scripts/n8n_discovery.py || log_warn "n8n discovery failed"
    fi

    if [ -f "scripts/initial_graph_builder.py" ]; then
        python3 scripts/initial_graph_builder.py
        log_success "Graph building completed"
    else
        log_error "Graph builder script not found"
    fi
}

# Create symlink for easy access
create_symlink() {
    log_step "Creating convenient symlink..."

    local bin_dir="$HOME/.local/bin"
    mkdir -p "$bin_dir"

    cat > "$bin_dir/n8n-mcp" << 'EOF'
#!/bin/bash
source ~/.local/share/n8n-mcp/venv/bin/activate
exec node ~/.local/share/n8n-mcp/dist/mcp/index.js "$@"
EOF

    chmod +x "$bin_dir/n8n-mcp"

    log_success "Symlink created: ~/.local/bin/n8n-mcp"
}

# Verify installation
verify_installation() {
    log_step "Verifying installation..."

    if [ ! -f "$INSTALL_DIR/dist/mcp/index.js" ]; then
        log_error "MCP server not found"
        exit 1
    fi
    log_success "MCP server verified"

    if [ ! -d "$GRAPH_DIR" ]; then
        log_error "Graph directory not created"
        exit 1
    fi
    log_success "Graph directory verified"

    if [ ! -f "$CONFIG_DIR/.env" ]; then
        log_error "Configuration not created"
        exit 1
    fi
    log_success "Configuration verified"
}

# Print summary
print_summary() {
    echo ""
    echo -e "${GREEN}=== Installation Completed Successfully ===${NC}"
    echo ""
    echo "Installation directory: $INSTALL_DIR"
    echo "Configuration file: $CONFIG_DIR/.env"
    echo "Graph directory: $GRAPH_DIR"
    echo "Log file: $LOG_FILE"
    echo ""
    echo -e "${BLUE}NEXT STEPS:${NC}"
    echo "1. Review documentation: $INSTALL_DIR/docs/"
    echo "2. Configure n8n connection: Edit $CONFIG_DIR/.env"
    echo "3. Register with Claude Desktop: See installation guide"
    echo "4. Start using n8n-mcp with Claude!"
    echo ""
    echo -e "${BLUE}USEFUL COMMANDS:${NC}"
    echo "  Start server: npm run start"
    echo "  Test metrics: npm run metrics:snapshot"
    echo "  View logs: tail -f $LOG_FILE"
    echo "  Update cron: crontab -e"
    echo ""
    echo "Documentation: https://github.com/n8n-io/n8n-mcp"
    echo ""
}

# Main installation flow
main() {
    echo -e "${BLUE}n8n MCP Server Installation - Linux${NC}"
    echo "Version: 3.0.0-beta"
    echo ""

    # Create log file
    mkdir -p "$(dirname "$LOG_FILE")"

    log "=== Installation Started ===" "START"

    # Run installation steps
    detect_distro
    check_prerequisites

    # Install system dependencies if needed
    case "$DISTRO" in
        ubuntu|debian)
            install_ubuntu_deps
            ;;
        fedora|rhel|centos)
            install_fedora_deps
            ;;
        arch|manjaro)
            install_arch_deps
            ;;
        *)
            log_warn "Unknown distribution: $DISTRO (skipping system package installation)"
            ;;
    esac

    create_directories
    setup_python_venv
    install_node_deps
    install_python_deps
    build_typescript
    create_configuration
    setup_cron_job
    build_initial_graph
    create_symlink
    verify_installation

    print_summary

    log "=== Installation Completed ===" "SUCCESS"
}

# Run main
main "$@"
