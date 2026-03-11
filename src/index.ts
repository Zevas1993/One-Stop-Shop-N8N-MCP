/**
 * n8n-MCP - Model Context Protocol Server for n8n
 * Copyright (c) 2024 AiAdvisors Romuald Czlonkowski
 * Licensed under the MIT License
 *
 * Library exports for HTTP/API integration.
 * The canonical stdio MCP entrypoint is dist/mcp/stdio-wrapper.js.
 * These exports are for embedding the MCP server in HTTP services.
 */

// Engine exports for HTTP/API service integration
export { N8NMCPEngine, EngineHealth, EngineOptions } from "./mcp-engine";
export { SingleSessionHTTPServer } from "./http-server-single-session";
export { ConsoleManager } from "./utils/console-manager";
export { createUnifiedMCPServer, UnifiedMCPServer } from "./mcp/server-modern";

// Default export for convenience
import N8NMCPEngine from "./mcp-engine";
export default N8NMCPEngine;
