#!/bin/bash
set -e

echo "🐳 n8n Node Extraction via Docker"
echo "================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')]${NC} ⚠️  $1"
}

print_error() {
    echo -e "${RED}[$(date +'%H:%M:%S')]${NC} ❌ $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

print_status "Docker is running ✅"

# Clean up any existing containers
print_status "Cleaning up existing containers..."
docker-compose -f docker-compose.extract.yml down -v 2>/dev/null || true

# Build the project first
print_status "Building the project..."
npm run build

# Start the extraction process
print_status "Starting n8n container to extract latest nodes..."
docker-compose -f docker-compose.extract.yml up -d n8n-latest

# Wait for n8n container to be healthy
print_status "Waiting for n8n container to initialize..."
ATTEMPTS=0
MAX_ATTEMPTS=60

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    if docker-compose -f docker-compose.extract.yml ps | grep -q "healthy"; then
        print_status "n8n container is ready ✅"
        break
    fi
    
    ATTEMPTS=$((ATTEMPTS + 1))
    echo -n "."
    sleep 2
done

if [ $ATTEMPTS -eq $MAX_ATTEMPTS ]; then
    print_error "n8n container failed to become healthy"
    docker-compose -f docker-compose.extract.yml logs n8n-latest
    docker-compose -f docker-compose.extract.yml down -v
    exit 1
fi

# Run the extraction
print_status "Running node extraction..."
docker-compose -f docker-compose.extract.yml run --rm node-extractor

# Check the results
print_status "Checking extraction results..."
if [ -f "./data/nodes.db" ]; then
    NODE_COUNT=$(sqlite3 ./data/nodes.db "SELECT COUNT(*) FROM nodes;" 2>/dev/null || echo "0")
    MYSQL_NODE=$(sqlite3 ./data/nodes.db "SELECT name FROM nodes WHERE name='n8n-nodes-base.MySQL' LIMIT 1;" 2>/dev/null || echo "not found")
    MONGODB_NODE=$(sqlite3 ./data/nodes.db "SELECT name FROM nodes WHERE name='n8n-nodes-base.MongoDb' LIMIT 1;" 2>/dev/null || echo "not found")
    
    print_status "Extracted $NODE_COUNT nodes"
    print_status "MySQL node: $MYSQL_NODE"
    print_status "MongoDB node: $MONGODB_NODE"
    
    # Check for critical nodes that were missing before
    CRITICAL_NODES=("MySQL" "MongoDb" "CSV" "Schedule" "HttpRequest" "Slack")
    FOUND_NODES=0
    
    for node in "${CRITICAL_NODES[@]}"; do
        NODE_FOUND=$(sqlite3 ./data/nodes.db "SELECT COUNT(*) FROM nodes WHERE name='n8n-nodes-base.$node';" 2>/dev/null || echo "0")
        if [ "$NODE_FOUND" -gt "0" ]; then
            print_status "✅ Found critical node: $node"
            FOUND_NODES=$((FOUND_NODES + 1))
        else
            print_warning "❌ Missing critical node: $node"
        fi
    done
    
    if [ "$FOUND_NODES" -ge "4" ]; then
        print_status "✅ Successfully extracted nodes from n8n container!"
    else
        print_warning "Only found $FOUND_NODES/${#CRITICAL_NODES[@]} critical nodes"
    fi
else
    print_error "Database file not found after extraction"
fi

# Clean up
print_status "Cleaning up Docker containers..."
docker-compose -f docker-compose.extract.yml down -v

print_status "✨ Extraction complete!"

# Offer to restart the MCP server
echo ""
read -p "Would you like to restart the MCP server with the new nodes? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Restarting MCP server..."
    # Kill any existing server process
    pkill -f "node.*dist/index.js" || true
    
    # Start the server
    npm start &
    print_status "MCP server restarted with fresh node database"
fi