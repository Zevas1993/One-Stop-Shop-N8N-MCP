import { spawn } from "child_process";
import * as readline from "readline";
import * as path from "path";

async function verifyWorkflowViaMCP() {
  console.log("🚀 Starting Workflow Verification via MCP...");

  // Spawn MCP Server
  const serverPath = path.join(process.cwd(), "src/mcp/index.ts");
  const server = spawn("node", ["-r", "ts-node/register", serverPath], {
    env: { ...process.env, MCP_MODE: "stdio" },
    stdio: ["pipe", "pipe", "inherit"],
  });

  const rl = readline.createInterface({
    input: server.stdout,
    output: process.stdout,
    terminal: false,
  });

  let isStarted = false;
  let searchRequestId = 2;
  let validateRequestId = 3;

  // Helper to send JSON-RPC request
  const sendRequest = (method: string, params: any, id: number) => {
    const request = { jsonrpc: "2.0", method, params, id };
    server.stdin.write(JSON.stringify(request) + "\n");
  };

  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line);

      // Handle initialization
      if (!isStarted && msg.result && msg.result.capabilities) {
        isStarted = true;
        console.log("✅ Server Initialized");

        // Search for the target workflow
        console.log(
          "🔍 Searching for 'Teams-Outlook RAG Assistant - Natural Language Ready'..."
        );
        sendRequest(
          "tools/call",
          {
            name: "workflow_manager",
            arguments: {
              action: "search",
              query: "Teams-Outlook RAG Assistant - Natural Language Ready",
            },
          },
          searchRequestId
        );
      }

      // Handle Search Response
      if (msg.id === searchRequestId) {
        if (msg.error) {
          console.error("❌ Search Error:", msg.error);
          process.exit(1);
        }

        const content = JSON.parse(msg.result.content[0].text);
        const workflows = content.data?.workflows || [];

        if (workflows.length === 0) {
          console.error("❌ Workflow not found! Cannot verify.");
          process.exit(1);
        }

        const targetId = workflows[0].id;
        console.log(
          `✅ Found target workflow: ${workflows[0].name} (ID: ${targetId})`
        );

        // Send Validate Request
        // We need to fetch the full workflow first to validate it locally,
        // OR we can ask the server to validate it by ID if supported.
        // server-modern.ts validateWorkflowUnified supports mode="remote" with workflowId

        console.log("🛠️  Sending validation request (remote mode)...");
        sendRequest(
          "tools/call",
          {
            name: "workflow_manager",
            arguments: {
              action: "validate",
              id: targetId,
              mode: "remote", // This tells it to fetch from n8n and validate
            },
          },
          validateRequestId
        );
      }

      // Handle Validate Response
      if (msg.id === validateRequestId) {
        if (msg.error) {
          console.error("❌ Validation Error:", msg.error);
        } else {
          const content = JSON.parse(msg.result.content[0].text);
          console.log(
            "\n✅ Workflow Validation Results (from MCP + Graph RAG):"
          );
          console.log(JSON.stringify(content, null, 2));

          if (content.valid) {
            console.log(
              "\n🎉 SUCCESS: Workflow is valid according to Agentic Graph RAG data!"
            );
          } else {
            console.log("\n⚠️  WARNING: Workflow has validation issues.");
          }
        }
        process.exit(0);
      }
    } catch (e) {
      // Ignore non-JSON lines
    }
  });

  // Start initialization
  sendRequest(
    "initialize",
    {
      protocolVersion: "2024-11-05",
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: "verifier-client", version: "1.0.0" },
    },
    1
  );
}

verifyWorkflowViaMCP().catch(console.error);
