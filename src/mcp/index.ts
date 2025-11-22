#!/usr/bin/env node

import dotenv from "dotenv";
// Always try to load .env file - this provides defaults for local development
try {
  const result = dotenv.config();
  if (result.parsed) {
    Object.assign(process.env, result.parsed);
  }
} catch (e) {
  // Ignore errors if .env doesn't exist
}

import { logger } from "../utils/logger";

// Add error details to stderr for Claude Desktop debugging
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  logger.error("Unhandled Rejection:", reason);
  process.exit(1);
});

async function main() {
  console.error(`[DEBUG] Starting Unified MCP Server.`);

  try {
    const { createUnifiedMCPServer } = await import("./server-modern");
    const server = await createUnifiedMCPServer();
    await server.run();
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    logger.error("Failed to start MCP server", error);

    if (
      error instanceof Error &&
      error.message.includes("nodes.db not found")
    ) {
      console.error("\nTo fix this issue:");
      console.error("1. cd to the n8n-mcp directory");
      console.error("2. Run: npm run build");
      console.error("3. Run: npm run rebuild");
    } else if (
      error instanceof Error &&
      error.message.includes("NODE_MODULE_VERSION")
    ) {
      console.error("\nTo fix this Node.js version mismatch:");
      console.error("1. cd to the n8n-mcp directory");
      console.error("2. Run: npm rebuild better-sqlite3");
      console.error(
        "3. If that doesn't work, try: rm -rf node_modules && npm install"
      );
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
