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
  console.log("🚀 Starting MCP Server Session...");
  console.log(`   Server Path: ${SERVER_PATH}`);

  const serverProcess = spawn("node", [SERVER_PATH], {
    env: {
      ...process.env,
      MCP_MODE: "stdio",
      // Ensure fake API keys are set for simulation if not present
      N8N_API_URL: process.env.N8N_API_URL || "http://localhost:5678",
      N8N_API_KEY: process.env.N8N_API_KEY || "fake-api-key",
    },
    stdio: ["pipe", "pipe", "inherit"], // Pipe stdin/stdout, inherit stderr
  });

  const send = (msg: any) => {
    const json = JSON.stringify(msg);
    console.log(`\n[Agent] ➡️  Sending ${msg.method}...`);
    // console.log(`[Agent] Payload: ${json}`);
    serverProcess.stdin.write(json + "\n");
  };

  // Buffer for incoming data
  let buffer = "";

  serverProcess.stdout.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

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

  // Response Handler
  const handleResponse = (response: any) => {
    if (response.id) {
      console.log(`[Server] ⬅️  Response (ID: ${response.id}) received.`);

      // Handle specific responses based on ID sequence
      if (response.id === 1) {
        console.log("✅ Initialization successful.");
        // Step 2: List Tools
        send(createMessage("tools/list"));
      } else if (response.id === 2) {
        console.log("✅ Tools listed.");
        const tools = response.result.tools;
        const credTool = tools.find(
          (t: any) => t.name === "credentials_manager"
        );
        if (credTool) {
          console.log("   Found 'credentials_manager' tool.");
        } else {
          console.error("   ❌ 'credentials_manager' tool NOT found!");
        }

        // Step 3: List Credentials
        send(
          createMessage("tools/call", {
            name: "credentials_manager",
            arguments: { action: "list" },
          })
        );
      } else if (response.id === 3) {
        console.log("✅ Credentials listed (Mock/Real).");
        // console.log(JSON.stringify(response.result, null, 2));

        // Step 4: Create Simplified Workflow
        console.log("   Creating simplified workflow with credentials...");
        const workflow = {
          name: "Agent Session Workflow",
          nodes: [
            {
              id: "agent",
              type: "n8n-nodes-base.aiAgent",
              parameters: { options: { systemMessage: "Hello" } },
            },
            {
              id: "tool",
              type: "n8n-nodes-base.toolCalculator",
              credentials: { toolApi: { id: "cred-123", name: "My Cred" } },
            },
          ],
          connections: [{ from: "agent", to: "tool" }],
        };

        send(
          createMessage("tools/call", {
            name: "workflow_manager",
            arguments: {
              action: "validate", // Validate first
              workflow,
              format: "simplified",
            },
          })
        );
      } else if (response.id === 4) {
        console.log("✅ Workflow Validated.");
        const result = JSON.parse(response.result.content[0].text);
        console.log(`   Valid: ${result.valid}`);
        if (result.valid === false && result.errors) {
          console.log("   Validation Errors (Expected if DB empty):");
          result.errors.forEach((e: any) => console.log(`   - ${e.message}`));

          // Check if "Duplicate node name" is gone
          const hasDup = result.errors.some((e: any) =>
            e.message.includes("Duplicate node name")
          );
          if (!hasDup) console.log("   ✅ No duplicate node name errors.");
          else console.error("   ❌ Duplicate node name error found!");
        }

        // End Session
        console.log("🛑 Ending Session.");
        serverProcess.kill();
        process.exit(0);
      }
    } else {
      // Notification
      console.log(`[Server] 🔔 Notification: ${response.method}`);
    }
  };

  // Step 1: Initialize
  send(
    createMessage("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "AgentSimulator", version: "1.0.0" },
    })
  );
}

runSession().catch(console.error);
