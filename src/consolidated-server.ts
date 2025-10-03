#!/usr/bin/env node

/**
 * Consolidated MCP Server Startup Script
 * 
 * Launches the streamlined 8-tool MCP server to eliminate AI agent choice paralysis.
 * This replaces the complex 60+ tool server with a unified, action-based interface.
 */

import { SimpleConsolidatedMCPServer } from './mcp/server-simple-consolidated.js';

async function main() {
  try {
    // Removed console output to prevent JSON-RPC parsing errors in Claude Desktop
    const server = new SimpleConsolidatedMCPServer();
    await server.run();
  } catch (error) {
    console.error('❌ Failed to start consolidated server:', error);
    process.exit(1);
  }
}

// Check if this file is being run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}