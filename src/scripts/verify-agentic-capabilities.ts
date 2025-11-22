import { spawn } from "child_process";
import * as path from "path";
import * as readline from "readline";

const SERVER_PATH = path.join(__dirname, "../../dist/mcp/index.js");

import * as fs from "fs";

console.log("Current working directory:", process.cwd());
try {
  fs.writeFileSync("test_write.txt", "Hello world");
  console.log("Successfully wrote test_write.txt");
} catch (e) {
  console.error("Failed to write test_write.txt:", e);
}

async function runVerification() {
  console.log("🚀 Starting Agentic Capabilities Verification...");
  console.log(`   Server Path: ${SERVER_PATH}\n`);

  const serverProcess = spawn("node", [SERVER_PATH], {
    env: {
      ...process.env,
      MCP_MODE: "stdio",
      DEBUG_MCP: "true",
      LOG_LEVEL: "DEBUG",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  serverProcess.stderr.on("data", (data) => {
    console.log(`[Server Log] ${data.toString()}`);
  });

  const rl = readline.createInterface({
    input: serverProcess.stdout,
    output: process.stdout,
    terminal: false,
  });

  let messageId = 1;
  const pendingRequests = new Map();

  function send(message: any, isNotification = false) {
    const msg = { jsonrpc: "2.0", ...message };
    if (!isNotification) {
      msg.id = messageId++;
    }
    pendingRequests.set(msg.id, msg);
    const json = JSON.stringify(msg);
    console.log(`[Agent] ➡️  Sending ${message.method} (ID: ${msg.id})...`);
    serverProcess.stdin.write(json + "\n");
    return msg.id;
  }

  function createMessage(method: string, params: any) {
    return { method, params };
  }

  // Step 1: Initialize
  send(
    createMessage("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: "AgenticVerifier", version: "1.0.0" },
    })
  );

  let step = 1;

  rl.on("line", (line) => {
    try {
      const response = JSON.parse(line);
      console.log(`[Server] ⬅️  Response (ID: ${response.id}) received.`);

      if (response.id === 1) {
        console.log("✅ Initialization successful.");
        send(createMessage("notifications/initialized", {}), true);

        // Step 2: Populate Graph (ensure data exists)
        console.log(
          "\n🔍 Step 2: Populating Graph (this may take a moment)..."
        );
        send(
          createMessage("tools/call", {
            name: "populate_graph",
            arguments: { force: false },
          })
        );
        step = 2;
      } else if (step === 2 && response.id) {
        console.log("✅ Graph Population completed.");
        console.log(JSON.stringify(response, null, 2));

        // Step 3: Test GraphRAG Query
        console.log("\n🧠 Step 3: Testing GraphRAG Query...");
        console.log("   Query: 'What nodes are good for email automation?'");
        send(
          createMessage("tools/call", {
            name: "execute_graphrag_query",
            arguments: { query: "What nodes are good for email automation?" },
          })
        );
        step = 3;
      } else if (step === 3 && response.id) {
        console.log("✅ GraphRAG Query Response:");
        console.log(JSON.stringify(response, null, 2));

        // Step 4: Test Agent Pipeline
        console.log("\n🤖 Step 4: Testing Agent Pipeline...");
        console.log(
          "   Goal: 'Create a workflow that receives a webhook and sends an email to Slack'"
        );
        send(
          createMessage("tools/call", {
            name: "execute_agent_pipeline",
            arguments: {
              goal: "Create a workflow that receives a webhook and sends an email to Slack",
            },
          })
        );
        step = 4;
      } else if (step === 4 && response.id) {
        console.log("✅ Agent Pipeline Response:");
        console.log(JSON.stringify(response, null, 2));

        console.log("\n🏁 Verification Complete. Exiting...");
        process.exit(0);
      }
    } catch (e) {
      console.error("❌ Error parsing response:", e);
    }
  });
}

runVerification().catch(console.error);
