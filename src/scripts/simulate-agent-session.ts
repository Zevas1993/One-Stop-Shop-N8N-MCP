import { spawn } from "child_process";
import path from "path";
import * as readline from "readline";

// Path to the built server
const SERVER_PATH = path.resolve(__dirname, "../../dist/mcp/index.js");

// JSON-RPC 2.0 Message Helper
let msgId = 0;
const createRequest = (method: string, params?: any) => ({
  jsonrpc: "2.0",
  id: msgId++,
  method,
  params,
});

const createNotification = (method: string, params?: any) => ({
  jsonrpc: "2.0",
  method,
  params,
});

async function runSimulation() {
  console.log(`🚀 Starting MCP Server Simulation...`);
  console.log(`   Server Path: ${SERVER_PATH}`);

  const serverProcess = spawn("node", [SERVER_PATH, "--rebuild"], {
    env: { ...process.env, MCP_MODE: "consolidated" },
    stdio: ["pipe", "pipe", "inherit"], // Inherit stderr to see server logs
  });

  const rl = readline.createInterface({ input: serverProcess.stdout });
  const pendingRequests = new Map<number, (response: any) => void>();

  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pendingRequests.has(msg.id)) {
        const resolve = pendingRequests.get(msg.id);
        if (resolve) {
          resolve(msg);
          pendingRequests.delete(msg.id);
        }
      }
    } catch (e) {
      // Ignore non-JSON lines
    }
  });

  const send = async (method: string, params?: any) => {
    const req = createRequest(method, params);
    console.log(`\n[Agent] ➡️  Sending ${method}...`);

    const promise = new Promise<any>((resolve) => {
      pendingRequests.set(req.id, resolve);
    });

    serverProcess.stdin.write(JSON.stringify(req) + "\n");
    return promise;
  };

  const sendNotification = (method: string, params?: any) => {
    const notif = createNotification(method, params);
    serverProcess.stdin.write(JSON.stringify(notif) + "\n");
  };

  try {
    // 1. Initialize
    console.log("\n--- Step 1: Initialization ---");
    const initRes = await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: "simulation-agent", version: "1.0.0" },
    });
    console.log("✅ Server Initialized");
    sendNotification("notifications/initialized");

    // 2. Populate Graph (Simulating "I want to learn about n8n nodes")
    console.log("\n--- Step 2: Populating Knowledge Graph ---");
    console.log("Agent: 'I need to ensure I have the latest n8n node data.'");
    const popRes = await send("tools/call", {
      name: "populate_graph",
      arguments: { force: true }, // Force update
    });

    if (popRes.error) {
      console.error("❌ Population Failed:", popRes.error);
    } else {
      const content = JSON.parse(popRes.result.content[0].text);
      console.log("✅ Population Result:", JSON.stringify(content, null, 2));
    }

    // 3. Query Graph (Simulating "How do I use the Schedule trigger?")
    console.log("\n--- Step 3: Querying Knowledge Graph ---");
    console.log("Agent: 'How does the Schedule trigger work?'");
    const queryRes = await send("tools/call", {
      name: "query_graph",
      arguments: {
        query:
          "How does the Schedule trigger work and what are its properties?",
        top_k: 1,
      },
    });

    if (queryRes.error) {
      console.error("❌ Query Failed:", queryRes.error);
    } else {
      console.log(
        "DEBUG: Full Query Response:",
        JSON.stringify(queryRes, null, 2)
      );
      const content = JSON.parse(queryRes.result.content[0].text);
      if (content.answer) {
        console.log(
          "✅ Query Answer:",
          content.answer.substring(0, 200) + "..."
        );
      } else {
        console.log(
          "⚠️ Query returned no answer:",
          content.summary || "No summary"
        );
      }
    }

    // 4. Create Workflow (Simulating "Create a workflow with AI Agent and Calculator")
    console.log("\n--- Step 4: Creating Workflow (Simplified DSL) ---");
    console.log(
      "Agent: 'I'll create an AI Agent workflow using the new simplified format.'"
    );

    const workflow = {
      name: "Simplified AI Workflow",
      nodes: [
        {
          id: "agent",
          type: "n8n-nodes-base.aiAgent", // Using full type for clarity, but simplifier supports fuzzy
          parameters: {
            options: {
              systemMessage: "You are a helpful assistant.",
            },
          },
        },
        {
          id: "tool",
          type: "n8n-nodes-base.toolCalculator",
          parameters: {},
          credentials: {
            toolApi: {
              id: "cred-123",
              name: "My Cred",
            },
          },
        },
      ],
      connections: [
        {
          from: "agent",
          to: "tool",
        },
      ],
    };

    // 4a. List Credentials (to verify tool exists)
    console.log("Agent: 'Checking available credentials...'");
    await send("tools/call", {
      name: "credentials_manager",
      arguments: {
        action: "list",
      },
    });

    // 4b. Validate Workflow First (using simplified format)
    console.log("Agent: 'Validating simplified workflow...'");
    const validateRes = await send("tools/call", {
      name: "workflow_manager",
      arguments: {
        action: "validate",
        workflow: workflow,
        format: "simplified", // Explicitly tell server it's simplified
      },
    });

    if (validateRes.error) {
      console.error("❌ Validation Failed:", validateRes.error);
    } else {
      console.log(
        "✅ Validation Result:",
        JSON.parse(validateRes.result.content[0].text)
      );
    }

    // 4b. Create Workflow
    console.log("Agent: 'Creating workflow now...'");
    const createRes = await send("tools/call", {
      name: "workflow_manager",
      arguments: {
        action: "create",
        workflow: workflow,
      },
    });

    if (createRes.error) {
      console.error("❌ Workflow Creation Failed:", createRes.error);
    } else {
      const content = JSON.parse(createRes.result.content[0].text);
      console.log("✅ Workflow Created:", JSON.stringify(content, null, 2));
    }
  } catch (error) {
    console.error("💥 Simulation failed:", error);
  } finally {
    console.log("\n🛑 Ending Simulation...");
    serverProcess.kill();
    process.exit(0);
  }
}

runSimulation();
