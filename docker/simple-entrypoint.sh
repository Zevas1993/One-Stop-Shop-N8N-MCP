#!/bin/bash

# Consolidated n8n MCP Server - 8 Essential Tools
echo "🚀 Starting n8n Consolidated MCP Server (8 tools)..."
echo "📋 Eliminates AI agent choice paralysis"
echo "⚡ Enforces validation-first workflow"

# Set default mode to consolidated if not specified
export MCP_MODE=${MCP_MODE:-consolidated}

# Start the appropriate server
if [ "$MCP_MODE" = "consolidated" ]; then
    echo "🎯 Using consolidated server (8 tools)"
    exec node /app/dist/consolidated-server.js
elif [ "$MCP_MODE" = "stdio" ]; then
    echo "⚠️  Using legacy server (60+ tools)"
    exec node /app/dist/mcp/index.js
else
    echo "🎯 Using consolidated server (8 tools) - default"
    exec node /app/dist/consolidated-server.js
fi