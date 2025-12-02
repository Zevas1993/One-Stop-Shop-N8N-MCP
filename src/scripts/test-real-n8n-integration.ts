import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Configuration
const SERVER_PATH = path.resolve(__dirname, "../mcp/index.ts");
const N8N_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_KEY = process.env.N8N_API_KEY;

if (!N8N_KEY) {
  console.error("Error: N8N_API_KEY not found in environment");
  process.exit(1);
}

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

async function runRealIntegrationTest() {
  console.log(`🚀 Starting Real n8n Integration Test...`);
  console.log(`   Target: ${N8N_URL}`);

  // Start MCP Server
  const serverProcess = spawn(
    "npx",
    ["ts-node", "--transpile-only", `"${SERVER_PATH}"`],
    {
      env: {
        ...process.env,
        MCP_MODE: "stdio",
        // Ensure we use the REAL n8n instance
        N8N_API_URL: N8N_URL,
        N8N_API_KEY: N8N_KEY,
        NODE_ENV: "development", // Enable console logging
        DEBUG_MCP: "true", // Enable verbose semantic logs
      },
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    }
  );

  const stdin = serverProcess.stdin;
  const stdout = serverProcess.stdout;

  if (!stdin || !stdout) {
    throw new Error("Failed to access server stdin/stdout");
  }

  // Listen for responses
  stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        if (response.id === 1) {
          console.log("✅ Server Initialized");
          // Step 2: Create Workflow
          const workflow = {
            name: "MCP Integration Test Workflow",
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
                  content: "Hello from MCP Integration Test!",
                  color: 1,
                  height: 100,
                  width: 200,
                },
                id: "markdown-node",
                name: "Markdown Note",
                type: "n8n-nodes-base.stickyNote",
                typeVersion: 1,
                position: [200, 0],
              },
              {
                parameters: {},
                id: "noop-node",
                name: "Cache Buster",
                type: "n8n-nodes-base.noOp",
                typeVersion: 1,
                position: [400, 0],
              },
            ],
            connections: {
              "When clicking 'Execute Workflow'": {
                main: [
                  [
                    {
                      node: "Markdown Note",
                      type: "main",
                      index: 0,
                    },
                  ],
                ],
              },
              "Markdown Note": {
                main: [
                  [
                    {
                      node: "Cache Buster",
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

          console.log("📤 Sending create_workflow request...");
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
          console.log("📥 Received create_workflow response:");
          console.log(JSON.stringify(response, null, 2));

          if (response.result && response.result.content) {
            const content = JSON.parse(response.result.content[0].text);
            if (content.success) {
              console.log(
                `✅ Workflow created successfully! ID: ${content.data.id}`
              );
              console.log(
                `👉 Check your n8n dashboard at ${N8N_URL}/workflow/${content.data.id}`
              );
            } else {
              console.error("❌ Workflow creation failed:", content.error);
              if (content.details) {
                console.error(
                  "Details:",
                  JSON.stringify(content.details, null, 2)
                );
              }
            }
          }

          // Cleanup
          serverProcess.kill();
          process.exit(0);
        }
      } catch (e) {
        // Log non-JSON lines (server logs) to show agent feedback
        console.log(`[SERVER LOG] ${line}`);
      }
    }
  });

  const stderr = serverProcess.stderr;
  if (stderr) {
    stderr.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        console.log(`[SERVER LOG (STDERR)] ${line}`);
      }
    });
  }

  // Step 1: Initialize
  console.log("📤 Sending initialize request...");
  stdin.write(
    createRequest(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "integration-test", version: "1.0.0" },
    })
  );
}

runRealIntegrationTest().catch(console.error);
