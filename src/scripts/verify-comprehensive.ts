import { spawn } from "child_process";
import path from "path";

// Configuration
const SERVER_PATH = path.join(__dirname, "../../dist/mcp/index.js");

// Helper to send JSON-RPC messages
let messageId = 0;
function createMessage(method: string, params: any = {}) {
  return {
    jsonrpc: "2.0",
    id: ++messageId,
    method,
    params,
  };
}

async function runSession() {
  console.log("🚀 Starting Comprehensive MCP Server Verification...");
  console.log(`   Server Path: ${SERVER_PATH}`);

  const serverProcess = spawn("node", [SERVER_PATH], {
    env: {
      ...process.env,
      MCP_MODE: "stdio",
      N8N_API_URL: process.env.N8N_API_URL || "http://localhost:5678",
      N8N_API_KEY: process.env.N8N_API_KEY || "fake-api-key",
    },
    stdio: ["pipe", "pipe", "inherit"],
  });

  const send = (msg: any) => {
    const json = JSON.stringify(msg);
    console.log(`\n[Agent] ➡️  Sending ${msg.method} (ID: ${msg.id})...`);
    serverProcess.stdin.write(json + "\n");
  };

  let buffer = "";
  serverProcess.stdout.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        handleResponse(response);
      } catch (e) {
        console.log(`[Server] (Non-JSON): ${line}`);
      }
    }
  });

  let workflow: any;

  const handleResponse = (response: any) => {
    if (response.id) {
      console.log(`[Server] ⬅️  Response (ID: ${response.id}) received.`);

      if (response.error) {
        console.error(`❌ Error in response ${response.id}:`, response.error);
      }

      switch (response.id) {
        case 1: // Initialize
          console.log("✅ Initialization successful.");
          // Step 2: Populate Graph
          console.log("   Step 2: Populating Graph...");
          send(
            createMessage("tools/call", {
              name: "populate_graph",
              arguments: {},
            })
          );
          break;

        case 2: // Populate Graph Result
          console.log("✅ Graph Population called.");
          // Step 3: Search Nodes
          console.log("   Step 3: Searching Nodes for 'slack'...");
          send(
            createMessage("tools/call", {
              name: "node_discovery",
              arguments: { action: "search", query: "slack" },
            })
          );
          break;

        case 3: // Search Nodes Result
          console.log("✅ Search Nodes called.");
          // Step 4: Get Documentation
          console.log(
            "   Step 4: Getting Documentation for 'n8n-nodes-base.slack'..."
          );
          send(
            createMessage("tools/call", {
              name: "node_discovery",
              arguments: {
                action: "get_documentation",
                nodeType: "n8n-nodes-base.slack",
              },
            })
          );
          break;

        case 4: // Get Documentation Result
          console.log("✅ Documentation retrieved.");
          // Step 5: Search Templates
          console.log("   Step 5: Searching Templates for 'notification'...");
          send(
            createMessage("tools/call", {
              name: "templates_and_guides",
              arguments: { action: "search_templates", query: "notification" },
            })
          );
          break;

        case 5: // Search Templates Result
          console.log("✅ Templates searched.");
          // Step 6: List Credentials
          console.log("   Step 6: Listing Credentials...");
          send(
            createMessage("tools/call", {
              name: "credentials_manager",
              arguments: { action: "list" },
            })
          );
          break;

        case 6: // List Credentials Result
          console.log("✅ Credentials listed.");
          // Step 7: Validate Workflow (Simplified DSL)
          console.log("   Step 7: Validating Complex Workflow...");
          workflow = {
            name: "Comprehensive Test Workflow",
            nodes: [
              {
                id: "schedule",
                type: "n8n-nodes-base.scheduleTrigger",
                parameters: { rule: { interval: [{ field: "hours" }] } },
              },
              {
                id: "agent",
                type: "n8n-nodes-base.aiAgent",
                parameters: { options: { systemMessage: "Analyze this." } },
              },
              {
                id: "slack",
                type: "n8n-nodes-base.slack",
                credentials: {
                  slackApi: { id: "cred-slack", name: "My Slack" },
                },
                parameters: { channel: "general", text: "Analysis complete." },
              },
            ],
            connections: [
              { from: "schedule", to: "agent" },
              { from: "agent", to: "slack" },
            ],
          };

          send(
            createMessage("tools/call", {
              name: "workflow_manager",
              arguments: { action: "validate", workflow, format: "simplified" },
            })
          );
          break;

        case 7: // Validate Workflow Result
          console.log("✅ Workflow Validated.");
          const valResult = JSON.parse(response.result.content[0].text);
          console.log(`   Valid: ${valResult.valid}`);
          if (valResult.valid) {
            console.log("   🎉 Workflow is VALID!");
          } else {
            console.log("   ⚠️ Workflow has errors (expected if DB empty):");
            valResult.errors.forEach((e: any) =>
              console.log(`     - ${e.message}`)
            );
          }

          // Step 8: Create Workflow
          console.log("   Step 8: Creating Workflow...");
          // We expect this to fail if validation failed, but we test the call.
          send(
            createMessage("tools/call", {
              name: "workflow_manager",
              arguments: {
                action: "create",
                workflow: valResult.valid ? workflow : workflow,
                format: "simplified",
              },
            })
          );
          break;

        case 8: // Create Workflow Result
          console.log("✅ Create Workflow called.");
          console.log("   Result:", response.result.content[0].text);

          console.log("🏁 Comprehensive Verification Complete.");
          serverProcess.kill();
          process.exit(0);
          break;
      }
    }
  };

  // Initialize
  send(
    createMessage("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "ComprehensiveVerifier", version: "1.0.0" },
    })
  );
}

runSession().catch(console.error);
