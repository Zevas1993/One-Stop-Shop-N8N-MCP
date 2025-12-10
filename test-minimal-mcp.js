/**
 * Minimal MCP Stdio Test - bypasses all n8n initialization
 * Tests pure MCP SDK stdio transport functionality
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

async function main() {
  // Create minimal MCP server
  const server = new Server(
    { name: "n8n-copilot-mcp", version: "3.0.0" },
    { capabilities: { tools: {} } }
  );

  // Simple tools/list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "n8n_status",
        description: "Get server status",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));

  // Simple tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          message: "Minimal MCP test working!",
        }),
      },
    ],
  }));

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep server running (stdio will handle shutdown)
  console.error("[MCP] Minimal server started - ready for stdio");
}

main().catch((err) => {
  console.error("[MCP] Fatal:", err.message);
  process.exit(1);
});
