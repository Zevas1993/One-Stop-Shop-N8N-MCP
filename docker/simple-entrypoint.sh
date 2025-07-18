#!/bin/bash

# Simple entry point for testing the unified server
echo "Starting unified n8n MCP server..."

# Set default mode to stdio if not specified
export MCP_MODE=${MCP_MODE:-stdio}

# Start the server
if [ "$MCP_MODE" = "stdio" ]; then
    exec node /app/dist/mcp/index.js
else
    exec node /app/dist/mcp/index.js
fi