#!/usr/bin/env node

/**
 * MCP Server entry point (stdio mode)
 *
 * Sets MCP_MODE and suppresses console output BEFORE any imports
 * to prevent JSON-RPC stream corruption in Claude Desktop.
 *
 * Preferred entry point: dist/mcp/stdio-wrapper.js (same behavior, static imports)
 * This file exists for backwards compatibility.
 */

// CRITICAL: Set environment BEFORE any imports to prevent initialization logs
process.env.MCP_MODE = "stdio";
process.env.DISABLE_CONSOLE_OUTPUT = "true";
if (!process.env.LOG_LEVEL) {
  process.env.LOG_LEVEL = "error";
}

import dotenv from "dotenv";
import path from "path";
// Three-tier config: caller env (highest) > data/.env (browser setup) > repo .env (dev fallback)
try {
  dotenv.config({ path: path.join(process.cwd(), "data", ".env") });
} catch (e) { /* data/.env may not exist */ }
try {
  dotenv.config();
} catch (e) { /* .env may not exist */ }

// Suppress all console output to prevent JSON-RPC interference
// Save originals for fatal error reporting only
const _stderr = process.stderr.write.bind(process.stderr);
const originalConsoleError = console.error;
console.log = () => {};
console.error = () => {};
console.warn = () => {};
console.info = () => {};
console.debug = () => {};
console.trace = () => {};
console.dir = () => {};
console.time = () => {};
console.timeEnd = () => {};
console.timeLog = () => {};
console.group = () => {};
console.groupEnd = () => {};
console.table = () => {};
console.clear = () => {};
console.count = () => {};
console.countReset = () => {};

// Import server AFTER suppressing output (static import for reliable module resolution)
import { createUnifiedMCPServer } from "./server-modern";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Error handlers use stderr directly to avoid JSON-RPC corruption
process.on("uncaughtException", (error) => {
  originalConsoleError("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  originalConsoleError("Unhandled Rejection:", reason);
  process.exit(1);
});

async function main() {
  try {
    const server = await createUnifiedMCPServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    originalConsoleError("Failed to start MCP server:", error);

    if (
      error instanceof Error &&
      error.message.includes("nodes.db not found")
    ) {
      originalConsoleError("\nTo fix: cd to n8n-mcp directory, run: npm run build && npm run rebuild");
    } else if (
      error instanceof Error &&
      error.message.includes("NODE_MODULE_VERSION")
    ) {
      originalConsoleError("\nTo fix: cd to n8n-mcp directory, run: npm rebuild better-sqlite3");
    }
    process.exit(1);
  }
}

main();
