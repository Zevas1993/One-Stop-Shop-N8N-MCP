import { spawn } from "child_process";
import path from "path";
import dotenv from "dotenv";

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Configuration
const SERVER_PATH = path.resolve(__dirname, "../mcp/index.ts");
const N8N_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_KEY = process.env.N8N_API_KEY;

// Helper to create JSON-RPC request
function createRequest(id: number, method: string, params?: any) {
  return (
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }) + "\n"
  );
}

async function runFeedbackLoopTest() {
  console.log(`🚀 Starting Agent Feedback Loop Test...`);

  // Start MCP Server with verbose logging enabled
  const serverProcess = spawn(
    "npx",
    ["ts-node", "--transpile-only", `"${SERVER_PATH}"`],
    {
      env: {
        ...process.env,
        MCP_MODE: "stdio",
        N8N_API_URL: N8N_URL,
        N8N_API_KEY: N8N_KEY,
        NODE_ENV: "development",
        DEBUG_MCP: "true",
      },
      stdio: ["pipe", "pipe", "pipe"], // Capture stderr
      shell: true,
    }
  );

  const stdin = serverProcess.stdin;
  const stdout = serverProcess.stdout;
  const stderr = serverProcess.stderr;

  if (!stdin || !stdout || !stderr) {
    throw new Error("Failed to access server streams");
  }

  // Capture logs
  stderr.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      console.log(`[SERVER LOG] ${line}`);
    }
  });

  // Listen for responses
  stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        if (response.id === 1) {
          console.log("✅ Server Initialized");

          // Create a "Bad" Workflow to trigger suggestions
          // 1. Uses Code node for HTTP request (should use HTTP Request node)
          // 2. No error handling
          const workflow = {
            name: "Suboptimal Workflow",
            nodes: [
              {
                parameters: {},
                id: "manual-trigger",
                name: "When clicking 'Execute Workflow'",
                type: "n8n-nodes-base.manualTrigger",
                typeVersion: 1,
                position: [0, 0],
              },
              {
                parameters: {
                  jsCode:
                    "const axios = require('axios');\nreturn axios.get('https://example.com');",
                },
                id: "code-node",
                name: "Custom HTTP Request",
                type: "n8n-nodes-base.code",
                typeVersion: 1,
                position: [200, 0],
              },
            ],
            connections: {
              "When clicking 'Execute Workflow'": {
                main: [
                  [
                    {
                      node: "Custom HTTP Request",
                      type: "main",
                      index: 0,
                    },
                  ],
                ],
              },
            },
            settings: {
              executionOrder: "v1",
            },
          };

          console.log(
            "📤 Sending create_workflow request with suboptimal workflow..."
          );
          stdin.write(
            createRequest(2, "tools/call", {
              name: "workflow_manager",
              arguments: {
                action: "create",
                workflow,
              },
            })
          );
        } else if (response.id === 2) {
          console.log("📥 Received response:");
          // Pretty print the response to show suggestions
          console.log(JSON.stringify(response, null, 2));

          serverProcess.kill();
          process.exit(0);
        }
      } catch (e) {
        // Ignore
      }
    }
  });

  // Initialize
  stdin.write(
    createRequest(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "feedback-test", version: "1.0.0" },
    })
  );
}

runFeedbackLoopTest().catch(console.error);
