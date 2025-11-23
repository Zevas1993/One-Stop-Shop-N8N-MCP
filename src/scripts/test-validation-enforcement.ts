import { UnifiedMCPServer } from "../mcp/server-modern";
import { logger } from "../utils/logger";

async function main() {
  console.log("🚀 Testing Workflow Validation Enforcement...");

  // Initialize server
  const server = new UnifiedMCPServer();

  // Mock the tool call arguments for a BROKEN workflow
  // 1. Single node workflow (invalid unless webhook)
  // 2. Missing connections
  const brokenWorkflow = {
    name: "Broken Workflow Test",
    nodes: [
      {
        id: "node-1",
        name: "Manual Trigger",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [100, 100],
        parameters: {},
      },
      {
        id: "node-2",
        name: "Set",
        type: "n8n-nodes-base.set",
        typeVersion: 1,
        position: [300, 100],
        parameters: {},
      },
    ],
    connections: {}, // EMPTY connections -> Should fail validation
  };

  console.log("\n🧪 Attempting to create BROKEN workflow (should fail)...");

  try {
    // We need to access the tool handler directly or simulate a tool call
    // Since we can't easily simulate the MCP protocol here without a client,
    // we'll access the handler map if possible, or just use the public method if we exposed it.
    // UnifiedMCPServer doesn't expose handlers publicly.
    // But we can use the 'workflow_manager' tool definition if we can access it.
    // Alternatively, we can just instantiate the handler directly to test logic,
    // BUT we want to test the wiring in server-modern.ts.

    // Let's use the server's tool method to register a test tool that calls the workflow manager? No.
    // We can try to access the private toolHandlers map using 'any' cast.
    const handlers = (server as any).toolHandlers;
    const createHandler = handlers.get("workflow_manager");

    if (!createHandler) {
      throw new Error("Could not find workflow_manager handler");
    }

    const result = await createHandler({
      action: "create",
      workflow: brokenWorkflow,
    });

    // Check result
    if (result.isError) {
      console.log("✅ Validation correctly rejected the workflow!");
      console.log("Error Message:", result.content[0].text);
    } else {
      // Parse the JSON content if it's a success response
      const content = JSON.parse(result.content[0].text);
      if (content.success === false) {
        console.log("✅ Validation correctly rejected the workflow!");
        console.log("Error:", content.error);
        if (content.details) {
          console.log("Details:", JSON.stringify(content.details, null, 2));
        }
      } else {
        console.error(
          "❌ Validation FAILED! Workflow was created successfully but should have been rejected."
        );
        console.log("Response:", content);
        process.exit(1);
      }
    }
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }

  console.log("\n✨ Validation Enforcement Test Passed!");
  process.exit(0);
}

main().catch(console.error);
