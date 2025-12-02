import { spawn } from "child_process";
import path from "path";
import * as readline from "readline";

// Path to the source server
const SERVER_PATH = path.resolve(__dirname, "../../src/mcp/index.ts");

// ... (rest of imports)

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

import http from "http";

// ... (previous imports)

// Mock n8n Server
function startMockN8nServer(port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Set CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS"
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-N8N-API-KEY"
      );

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = req.url || "";
      console.log(`[Mock n8n] ${req.method} ${url}`);

      if (req.method === "GET" && url.endsWith("/health")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (req.method === "POST" && url.endsWith("/workflows")) {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          // Simulate validation/creation success
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              id: "mock-workflow-id-" + Date.now(),
              name: "Mock Workflow",
              active: false,
              nodes: [],
              connections: {},
            })
          );
        });
        return;
      }

      if (req.method === "DELETE" && url.includes("/workflows/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(port, "127.0.0.1", () => {
      console.log(`[Mock n8n] Server running on port ${port}`);
      resolve(server);
    });
  });
}

async function runSimulation() {
  console.log(`🚀 Starting Complex Workflow Agent Simulation...`);

  // Start Mock n8n Server
  const MOCK_PORT = 5679;
  const mockServer = await startMockN8nServer(MOCK_PORT);

  console.log(`   Server Path: ${SERVER_PATH}`);

  // Use ts-node to run the server directly from source with transpile-only to skip type checks
  // Quote the path to handle spaces in directory names
  const serverProcess = spawn(
    "npx",
    ["ts-node", "--transpile-only", `"${SERVER_PATH}"`],
    {
      env: {
        ...process.env,
        MCP_MODE: "stdio",
        N8N_API_URL: `http://127.0.0.1:${MOCK_PORT}`,
        N8N_API_KEY: "mock-api-key",
      },
      stdio: ["pipe", "pipe", "inherit"],
      shell: true, // Required for npx on Windows
    }
  );

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
      } else if (msg.method?.startsWith("notifications/")) {
        console.log(`[MCP Notification] ${msg.method}`);
      }
    } catch (e) {
      // Ignore non-JSON lines
    }
  });

  const send = async (method: string, params?: any) => {
    const req = createRequest(method, params);
    // console.log(`\n[Agent] ➡️  Sending ${method}...`);

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
    await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: "complex-workflow-agent", version: "1.0.0" },
    });
    console.log("✅ Server Initialized");
    sendNotification("notifications/initialized");

    // 2. Discovery Phase
    console.log("\n--- Step 2: Agent Discovery Phase ---");
    console.log(
      "Agent: 'I need to build an Employee Onboarding workflow. Let me find the right nodes.'"
    );

    const searches = ["webhook", "if", "set", "slack", "gmail"];
    const foundNodes: Record<string, string> = {};

    for (const query of searches) {
      console.log(`Agent: Searching for '${query}'...`);
      const res = await send("tools/call", {
        name: "node_discovery",
        arguments: { action: "search", query, limit: 1 },
      });

      if (!res.error) {
        const content = JSON.parse(res.result.content[0].text);
        if (content.results && content.results.length > 0) {
          const node = content.results[0];
          foundNodes[query] = node.nodeType;
          console.log(`   ✅ Found: ${node.displayName} (${node.nodeType})`);
        }
      }
    }

    // 3. Workflow Construction
    console.log("\n--- Step 3: Constructing Complex Workflow ---");
    console.log(
      "Agent: 'Building workflow structure: Webhook -> Set Data -> IF (Dept) -> Slack -> Email'"
    );

    // Constructing a robust workflow using the discovered nodes
    const workflow = {
      name: "Agent Generated: Employee Onboarding",
      settings: {},
      nodes: [
        {
          parameters: {
            path: "onboarding",
            options: {},
          },
          id: "webhook-trigger",
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 2,
          position: [0, 0],
          webhookId: "onboarding-webhook",
        },
        {
          parameters: {
            values: {
              string: [
                { name: "employeeName", value: "={{ $json.body.name }}" },
                { name: "department", value: "={{ $json.body.department }}" },
                { name: "email", value: "={{ $json.body.email }}" },
              ],
            },
          },
          id: "set-data",
          name: "Set Employee Data",
          type: "n8n-nodes-base.set",
          typeVersion: 3.4,
          position: [200, 0],
        },
        {
          parameters: {
            conditions: {
              string: [
                {
                  value1: "={{ $json.department }}",
                  value2: "Engineering",
                },
              ],
            },
          },
          id: "check-department",
          name: "Is Engineering?",
          type: "n8n-nodes-base.if",
          typeVersion: 2.2,
          position: [400, 0],
        },
        {
          parameters: {
            channel: "engineering-onboarding",
            text: "={{ 'New Engineer Joined: ' + $json.employeeName }}",
            otherOptions: {},
          },
          id: "slack-eng",
          name: "Slack (Eng)",
          type: "n8n-nodes-base.slack",
          typeVersion: 2.3,
          position: [650, -100],
        },
        {
          parameters: {
            channel: "general-onboarding",
            text: "={{ 'New Employee Joined: ' + $json.employeeName }}",
            otherOptions: {},
          },
          id: "slack-general",
          name: "Slack (General)",
          type: "n8n-nodes-base.slack",
          typeVersion: 2.3,
          position: [650, 100],
        },
        {
          parameters: {
            sendTo: "={{ $json.email }}",
            subject: "Welcome to the team!",
            message: "Welcome aboard! We are excited to have you.",
            options: {},
          },
          id: "send-email",
          name: "Send Welcome Email",
          type: "n8n-nodes-base.emailSend", // Using generic email for demo
          typeVersion: 2.1,
          position: [900, 0],
        },
      ],
      connections: {
        Webhook: {
          main: [
            [
              {
                node: "Set Employee Data",
                type: "main",
                index: 0,
              },
            ],
          ],
        },
        "Set Employee Data": {
          main: [
            [
              {
                node: "Is Engineering?",
                type: "main",
                index: 0,
              },
            ],
          ],
        },
        "Is Engineering?": {
          main: [
            [
              {
                node: "Slack (Eng)",
                type: "main",
                index: 0,
              },
            ],
            [
              {
                node: "Slack (General)",
                type: "main",
                index: 0,
              },
            ],
          ],
        },
        "Slack (Eng)": {
          main: [
            [
              {
                node: "Send Welcome Email",
                type: "main",
                index: 0,
              },
            ],
          ],
        },
        "Slack (General)": {
          main: [
            [
              {
                node: "Send Welcome Email",
                type: "main",
                index: 0,
              },
            ],
          ],
        },
      },
    };

    // 4. Validation
    console.log("\n--- Step 4: Validating Workflow ---");
    console.log("Agent: 'Verifying workflow integrity before upload...'");

    const validateRes = await send("tools/call", {
      name: "workflow_manager",
      arguments: {
        action: "validate",
        workflow: workflow,
        mode: "full",
      },
    });

    console.log("RAW VALIDATE RES:", JSON.stringify(validateRes, null, 2));

    if (validateRes.error) {
      console.error("❌ Validation Error:", validateRes.error);
    } else {
      const validation = JSON.parse(validateRes.result.content[0].text);
      console.log(
        `✅ Validation Result: ${validation.valid ? "PASSED" : "FAILED"}`
      );
      if (!validation.valid) {
        console.log("   Issues:", validation.issues);
      }
    }

    // 5. Upload to n8n
    console.log("\n--- Step 5: Uploading to n8n ---");
    console.log("Agent: 'Uploading workflow to n8n instance...'");

    const createRes = await send("tools/call", {
      name: "workflow_manager",
      arguments: {
        action: "create",
        workflow: workflow,
      },
    });

    console.log("RAW CREATE RES:", JSON.stringify(createRes, null, 2));

    if (createRes.error) {
      console.error("❌ Upload Failed:", createRes.error);
    } else {
      const result = JSON.parse(createRes.result.content[0].text);
      if (result.success === false) {
        console.error("❌ Workflow Creation Failed:", result.error);
        if (result.details)
          console.error("   Details:", JSON.stringify(result.details, null, 2));
      } else {
        console.log("✅ Workflow Created Successfully!");
        console.log(`   ID: ${result.data?.id}`);
        console.log(`   Name: ${result.data?.name}`);
        console.log(`   Active: ${result.data?.active}`);
        console.log(
          `   Nodes: ${result.data?.nodes ? result.data.nodes.length : "N/A"}`
        );
      }
    }
  } catch (error) {
    console.error("💥 Simulation failed:", error);
  } finally {
    console.log("\n🛑 Ending Simulation...");
    serverProcess.kill();
    mockServer.close();
    process.exit(0);
  }
}

runSimulation();
