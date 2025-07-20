#!/usr/bin/env node
/**
 * Claude Desktop Bridge for n8n MCP Server - CONSOLIDATED VERSION
 * Runs the n8n MCP server in consolidated mode (8 tools) for Claude Desktop integration
 * Eliminates AI agent choice paralysis by providing streamlined tool interface
 * Excludes visual verification tools (browser automation) which require Docker environment
 */

const { spawn } = require('child_process');
const path = require('path');

// Force consolidated mode and remove conflicting environment variables
const env = { ...process.env };
env.MCP_MODE = 'consolidated';
env.NODE_ENV = 'production';
env.DISABLE_VISUAL_VERIFICATION = 'true'; // Disable browser automation tools
env.LOG_LEVEL = 'error'; // Minimize logging to prevent stdout corruption
env.DEBUG_MCP = 'false'; // Disable debug output
env.DEBUG = 'false'; // Disable general debug output
delete env.PORT;
delete env.AUTH_TOKEN;
delete env.USE_FIXED_HTTP;
delete env.N8N_USERNAME; // Remove browser auth since no visual verification
delete env.N8N_PASSWORD;

// Ensure database path is set
if (!env.NODE_DB_PATH) {
  env.NODE_DB_PATH = path.join(__dirname, 'data', 'nodes.db');
}

// Path to the built MCP server
const serverPath = path.join(__dirname, 'dist', 'mcp', 'index.js');

// Spawn the server process
const server = spawn('node', [serverPath], {
  env: env,
  stdio: ['inherit', 'inherit', 'inherit'],
  cwd: __dirname
});

// Forward exit codes
server.on('exit', (code) => {
  process.exit(code || 0);
});

// Handle errors
server.on('error', (error) => {
  console.error('Failed to start n8n MCP server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));