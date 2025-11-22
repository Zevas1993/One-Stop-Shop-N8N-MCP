#!/usr/bin/env node
/**
 * Test MCP tools directly
 */
import { createUnifiedMCPServer } from "../mcp/server-modern";
import { Logger } from "../utils/logger";

const logger = new Logger({ prefix: "[TestMCPTools]" });

async function testTool(server: any, toolName: string, args: any) {
  try {
    console.log(`\n🔧 Testing: ${toolName}`);
    console.log("Args:", JSON.stringify(args, null, 2));
    console.log("-".repeat(60));

    // Use the executeTool method on UnifiedMCPServer
    const result = await server.executeTool(toolName, args);
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`❌ Error: ${error}`);
    // Re-throw if it's not an expected error (like service down)
    // But for this script we just want to log it
  }
}

async function main() {
  console.log("🤖 Testing MCP Tools\n");

  // Create server instance and wait for initialization
  const server = await createUnifiedMCPServer();

  // Give it time to initialize
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log("\n=== Testing node_discovery (search) ===");
  await testTool(server, "node_discovery", {
    action: "search",
    query: "slack",
  });

  console.log("\n=== Testing node_discovery (get_info) ===");
  await testTool(server, "node_discovery", {
    action: "get_info",
    nodeType: "nodes-base.httpRequest",
  });

  console.log("\n=== Testing node_discovery (list AI) ===");
  await testTool(server, "node_discovery", {
    action: "list",
    category: "AI",
  });

  console.log("\n=== Testing execute_graphrag_query ===");
  try {
    await testTool(server, "execute_graphrag_query", {
      query: "n8n nodes for email",
      topK: 3,
    });
  } catch (error) {
    console.log(
      "GraphRAG query failed (expected if Python service is not running):",
      error
    );
  }

  console.log("\n✅ All tests completed!");
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}
