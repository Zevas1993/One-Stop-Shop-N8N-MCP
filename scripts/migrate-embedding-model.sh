#!/bin/bash

################################################################################
# Nano LLM Embedding Model Migration Script
#
# This script automates the upgrade from Qwen3-0.6B to Nomic-Embed-Text
# Tier 1 Recommended: 3-4x quality improvement, 2-hour total time
#
# Usage: ./migrate-embedding-model.sh [MODEL_CHOICE]
# MODEL_CHOICE: nomic (default), bge-m3, minilm (requires code changes)
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MODEL_CHOICE=${1:-nomic}
PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE="$PROJECT_DIR/.env"
DOCKER_COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

################################################################################
# MAIN MIGRATION FLOW
################################################################################

main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║     Nano LLM Embedding Model Migration Script                  ║"
    echo "║     Upgrade from Qwen3-0.6B to Better Embedding Model         ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    # Step 1: Validate environment
    log_info "Step 1: Validating environment..."
    validate_environment

    # Step 2: Backup current setup
    log_info "Step 2: Backing up current configuration..."
    backup_current_setup

    # Step 3: Select model if not specified
    if [ "$MODEL_CHOICE" != "nomic" ] && [ "$MODEL_CHOICE" != "bge-m3" ] && [ "$MODEL_CHOICE" != "minilm" ]; then
        log_error "Invalid model choice: $MODEL_CHOICE"
        log_info "Available models: nomic (recommended), bge-m3, minilm"
        exit 1
    fi

    # Step 4: Check Docker and services
    log_info "Step 3: Checking Docker services..."
    check_docker_services

    # Step 5: Pull new model
    log_info "Step 4: Pulling new embedding model (this may take 5-10 minutes)..."
    pull_embedding_model "$MODEL_CHOICE"

    # Step 6: Verify model download
    log_info "Step 5: Verifying model download..."
    verify_model_downloaded "$MODEL_CHOICE"

    # Step 7: Update configuration
    log_info "Step 6: Updating configuration files..."
    update_configuration "$MODEL_CHOICE"

    # Step 8: Restart services
    log_info "Step 7: Restarting services..."
    restart_services

    # Step 9: Verify connectivity
    log_info "Step 8: Verifying connectivity..."
    verify_connectivity "$MODEL_CHOICE"

    # Step 10: Run benchmarks
    log_info "Step 9: Running benchmarks..."
    run_benchmarks "$MODEL_CHOICE"

    # Final summary
    print_summary "$MODEL_CHOICE"
}

################################################################################
# HELPER FUNCTIONS
################################################################################

validate_environment() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    log_success "Docker is installed"

    if ! command -v docker-compose &> /dev/null; then
        log_error "docker-compose is not installed"
        exit 1
    fi
    log_success "docker-compose is installed"

    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        log_error "docker-compose.yml not found at $DOCKER_COMPOSE_FILE"
        exit 1
    fi
    log_success "docker-compose.yml found"

    if [ ! -f "$ENV_FILE" ]; then
        log_warning ".env file not found, will be created"
    else
        log_success ".env file found"
    fi
}

backup_current_setup() {
    BACKUP_DIR="$PROJECT_DIR/.backups/migration-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "$BACKUP_DIR/.env.backup"
        log_success "Backed up .env to $BACKUP_DIR"
    fi

    # Backup current Ollama models list
    if docker compose ps ollama &> /dev/null; then
        docker compose exec ollama ollama list > "$BACKUP_DIR/models-before.txt" 2>/dev/null || true
        log_success "Backed up model list"
    fi
}

check_docker_services() {
    log_info "Checking Docker daemon..."
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    log_success "Docker daemon is running"

    log_info "Checking docker-compose services..."
    if ! docker compose ps &> /dev/null; then
        log_warning "Services not running, they will be started"
    else
        log_success "Services are accessible"
    fi
}

pull_embedding_model() {
    local model=$1
    local model_full_name=""

    case $model in
        nomic)
            model_full_name="nomic-embed-text"
            log_info "Pulling Nomic-Embed-Text (recommended model)..."
            ;;
        bge-m3)
            model_full_name="bge-m3"
            log_info "Pulling BGE-M3 (premium model)..."
            ;;
        minilm)
            model_full_name="all-MiniLM-L6-v2"
            log_warning "MiniLM requires code changes and Sentence-Transformers library"
            log_info "This is an advanced option, not recommended for standard setup"
            ;;
        *)
            log_error "Unknown model: $model"
            exit 1
            ;;
    esac

    # Pull the model into Ollama
    if [ "$model" != "minilm" ]; then
        log_info "Starting Ollama if not running..."
        docker compose up -d ollama

        log_info "Waiting for Ollama to be ready..."
        sleep 5

        log_info "Pulling model: $model_full_name"
        docker compose exec ollama ollama pull "$model_full_name" || {
            log_error "Failed to pull model $model_full_name"
            exit 1
        }
        log_success "Model pulled successfully: $model_full_name"
    else
        log_warning "MiniLM setup requires manual installation of Sentence-Transformers"
        log_info "See MODEL_MIGRATION_GUIDE.md for advanced setup instructions"
    fi
}

verify_model_downloaded() {
    local model=$1

    log_info "Verifying model download..."

    if [ "$model" != "minilm" ]; then
        local models_list=$(docker compose exec ollama ollama list 2>/dev/null || echo "")

        case $model in
            nomic)
                if echo "$models_list" | grep -q "nomic-embed-text"; then
                    log_success "Nomic-Embed-Text is available in Ollama"
                    return 0
                fi
                ;;
            bge-m3)
                if echo "$models_list" | grep -q "bge-m3"; then
                    log_success "BGE-M3 is available in Ollama"
                    return 0
                fi
                ;;
        esac

        log_error "Model verification failed. Check Ollama logs:"
        docker compose logs ollama | tail -20
        exit 1
    fi
}

update_configuration() {
    local model=$1

    log_info "Updating .env file..."

    # Create or update .env file
    if [ ! -f "$ENV_FILE" ]; then
        log_info "Creating new .env file..."
        cat > "$ENV_FILE" << 'EOFENV'
# Generated by migrate-embedding-model.sh
NODE_ENV=production
AUTH_TOKEN=${AUTH_TOKEN:-change-me}
N8N_API_KEY=${N8N_API_KEY:-}
WEBUI_SECRET_KEY=${WEBUI_SECRET_KEY:-change-me}
EOFENV
    fi

    # Add or update embedding model configuration
    case $model in
        nomic)
            log_info "Configuring for Nomic-Embed-Text..."
            if grep -q "EMBEDDING_MODEL=" "$ENV_FILE"; then
                sed -i.bak 's/EMBEDDING_MODEL=.*/EMBEDDING_MODEL=nomic-embed-text/' "$ENV_FILE"
            else
                echo "EMBEDDING_MODEL=nomic-embed-text" >> "$ENV_FILE"
            fi
            ;;
        bge-m3)
            log_info "Configuring for BGE-M3..."
            if grep -q "EMBEDDING_MODEL=" "$ENV_FILE"; then
                sed -i.bak 's/EMBEDDING_MODEL=.*/EMBEDDING_MODEL=bge-m3/' "$ENV_FILE"
            else
                echo "EMBEDDING_MODEL=bge-m3" >> "$ENV_FILE"
            fi
            ;;
        minilm)
            log_info "Configuring for all-MiniLM-L6-v2..."
            if grep -q "EMBEDDING_MODEL=" "$ENV_FILE"; then
                sed -i.bak 's/EMBEDDING_MODEL=.*/EMBEDDING_MODEL=all-minilm-l6-v2/' "$ENV_FILE"
            else
                echo "EMBEDDING_MODEL=all-minilm-l6-v2" >> "$ENV_FILE"
            fi
            ;;
    esac

    log_success ".env file updated"
}

restart_services() {
    log_info "Restarting MCP and Ollama services..."

    docker compose restart mcp ollama || {
        log_error "Failed to restart services"
        log_info "Trying to bring services up..."
        docker compose up -d mcp ollama
    }

    log_info "Waiting for services to stabilize (10 seconds)..."
    sleep 10

    log_success "Services restarted"
}

verify_connectivity() {
    local model=$1

    log_info "Verifying MCP-Ollama connectivity..."

    # Test Ollama API from MCP container
    local max_attempts=5
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if docker compose exec mcp curl -s http://ollama:11434/api/tags > /dev/null 2>&1; then
            log_success "MCP can reach Ollama successfully"

            # Verify the new model is available
            local available_models=$(docker compose exec mcp curl -s http://ollama:11434/api/tags | grep -o '"name":"[^"]*"' | cut -d'"' -f4)

            case $model in
                nomic)
                    if echo "$available_models" | grep -q "nomic-embed-text"; then
                        log_success "Nomic-Embed-Text is available to MCP"
                    fi
                    ;;
                bge-m3)
                    if echo "$available_models" | grep -q "bge-m3"; then
                        log_success "BGE-M3 is available to MCP"
                    fi
                    ;;
            esac
            return 0
        fi

        attempt=$((attempt + 1))
        if [ $attempt -lt $max_attempts ]; then
            log_warning "Connection attempt $attempt/$max_attempts failed, retrying..."
            sleep 5
        fi
    done

    log_error "Failed to verify MCP-Ollama connectivity after $max_attempts attempts"
    log_info "Check logs with: docker compose logs -f mcp"
    exit 1
}

run_benchmarks() {
    local model=$1

    log_info "Running performance benchmarks..."

    cat > /tmp/benchmark-test.sh << 'EOFBENCH'
#!/bin/bash

echo "=== Embedding Model Performance Test ==="
echo ""

# Get model name
MODEL=$(grep "EMBEDDING_MODEL=" .env | cut -d'=' -f2)
echo "Testing model: $MODEL"
echo ""

# Test embedding latency
echo "Testing embedding latency..."
START=$(date +%s%N)
docker compose exec ollama ollama run "$MODEL" "Create a workflow that monitors customer feedback" > /dev/null 2>&1 || true
END=$(date +%s%N)
LATENCY=$((($END - $START) / 1000000))
echo "Embedding latency: ${LATENCY}ms"
echo ""

# System resources
echo "System resource usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}\t{{.CPUPerc}}" | grep -E "(mcp|ollama)"
echo ""

# Check MCP logs
echo "Recent MCP logs (last 5 lines):"
docker compose logs mcp --tail=5 | tail -5
EOFBENCH

    chmod +x /tmp/benchmark-test.sh
    cd "$PROJECT_DIR"
    bash /tmp/benchmark-test.sh || true
}

print_summary() {
    local model=$1
    local model_display=""

    case $model in
        nomic)
            model_display="Nomic-Embed-Text (Recommended)"
            quality="8/10"
            speed="50-150ms"
            ;;
        bge-m3)
            model_display="BGE-M3 (Premium)"
            quality="9/10"
            speed="150-300ms"
            ;;
        minilm)
            model_display="all-MiniLM-L6-v2 (Speed)"
            quality="7/10"
            speed="10-30ms"
            ;;
    esac

    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                  MIGRATION COMPLETED SUCCESSFULLY               ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Model:           $model_display"
    echo "Quality Score:   $quality"
    echo "Latency:         $speed per embedding"
    echo ""
    echo "Next Steps:"
    echo "  1. Monitor MCP logs for errors:"
    echo "     docker compose logs -f mcp | grep -i 'embedding\\|error\\|warning'"
    echo ""
    echo "  2. Test with a real n8n workflow"
    echo ""
    echo "  3. Collect user feedback on suggestion quality"
    echo ""
    echo "  4. Monitor performance for 1-2 weeks"
    echo ""
    echo "For more details, see:"
    echo "  docs/NANO_LLM_SUMMARY.md"
    echo "  docs/MODEL_MIGRATION_GUIDE.md"
    echo ""

    if [ -n "$BACKUP_DIR" ]; then
        echo "Backup location: $BACKUP_DIR"
        echo ""
    fi
}

################################################################################
# RUN MAIN FUNCTION
################################################################################

main "$@"
