#!/bin/bash
# n8n MCP Server - Quick Start Script for macOS/Linux
# This script starts the MCP server in Docker and opens the setup wizard

set -e

echo ""
echo "========================================"
echo "  n8n MCP Server - Docker Desktop"
echo "========================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running!"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

echo "[1/3] Pulling latest image..."
docker compose -f docker-compose.desktop.yml pull

echo ""
echo "[2/3] Starting n8n MCP Server..."
docker compose -f docker-compose.desktop.yml up -d

echo ""
echo "[3/3] Waiting for server to start..."
sleep 5

# Check if container is running
if ! docker ps | grep -q "n8n-mcp-server"; then
    echo "[ERROR] Container failed to start. Check logs with:"
    echo "  docker compose -f docker-compose.desktop.yml logs"
    exit 1
fi

echo ""
echo "========================================"
echo "  Server is running!"
echo "========================================"
echo ""
echo "  Web UI: http://localhost:3000"
echo ""
echo "  Complete the setup wizard to connect to n8n."
echo ""
echo "  Useful commands:"
echo "    View logs:  docker compose -f docker-compose.desktop.yml logs -f"
echo "    Stop:       docker compose -f docker-compose.desktop.yml down"
echo "    Restart:    docker compose -f docker-compose.desktop.yml restart"
echo ""

# Open browser (works on macOS and Linux with xdg-open)
if command -v open > /dev/null 2>&1; then
    open http://localhost:3000
elif command -v xdg-open > /dev/null 2>&1; then
    xdg-open http://localhost:3000
else
    echo "Open http://localhost:3000 in your browser to complete setup."
fi
