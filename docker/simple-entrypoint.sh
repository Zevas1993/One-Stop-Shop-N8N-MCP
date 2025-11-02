#!/bin/bash

# n8n MCP Server with Nano LLM Learning System (Stdio Mode for Claude Desktop)
echo "🚀 Starting n8n MCP Server with Nano LLM Integration..."
echo "📚 GraphRAG-driven learning system"
echo "🧠 Nano LLM orchestration enabled"
echo "⚙️ Mode: stdio (for Claude Desktop MCP integration)"

# Default to stdio mode for Claude Desktop compatibility
export MCP_MODE=${MCP_MODE:-stdio}

# Start the MCP server in stdio mode with GraphRAG learning system
# The Nano LLMs (Embedding Model and Generation Model) are integrated
# directly into the MCP server and orchestrate GraphRAG updates
echo "Starting MCP server with Nano LLM learning pipeline..."
exec node /app/dist/mcp/index.js