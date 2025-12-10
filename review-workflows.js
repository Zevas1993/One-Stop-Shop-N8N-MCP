/**
 * MCP Client - Simulates Claude Desktop interacting with the MCP server
 * Lists and reviews workflows on the live n8n instance
 */

const { spawn } = require("child_process");
const path = require("path");
const readline = require("readline");

// Load environment variables
require("dotenv").config();

const SERVER_PATH = path.join(__dirname, "dist", "main.js");

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

let requestId = 1;
const pendingRequests = new Map();
let stdoutBuffer = "";

async function main() {
  console.log(
    `${colors.cyan}${colors.bold}╔════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bold}║         MCP Client - Reviewing n8n Workflows               ║${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bold}╚════════════════════════════════════════════════════════════╝${colors.reset}`
  );
  console.log("");

  // Read .env file directly for explicit environment setup
  const fs = require("fs");
  const envPath = path.join(__dirname, ".env");
  const envContent = fs.readFileSync(envPath, "utf-8");
  const envVars = {};
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      envVars[match[1].trim()] = match[2].trim();
    }
  }

  // Start the MCP server
  console.log(`${colors.dim}Starting MCP server...${colors.reset}`);
  console.log(`${colors.dim}n8n URL: ${envVars.N8N_API_URL}${colors.reset}`);

  const serverProcess = spawn("node", [SERVER_PATH], {
    env: {
      ...process.env,
      ...envVars,
      N8N_AUTO_SYNC: "false",
      MCP_MODE: "stdio",
    },
    stdio: ["pipe", "pipe", "pipe"],
    cwd: __dirname,
  });

  // Handle stdout (JSON-RPC responses)
  serverProcess.stdout.on("data", (data) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split("\n");
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        try {
          const response = JSON.parse(line);
          if (response.id && pendingRequests.has(response.id)) {
            const { resolve } = pendingRequests.get(response.id);
            pendingRequests.delete(response.id);
            resolve(response);
          }
        } catch (e) {
          // Not JSON
        }
      }
    }
    stdoutBuffer = lines[lines.length - 1];
  });

  // Log stderr (server logs)
  serverProcess.stderr.on("data", (data) => {
    const text = data.toString().trim();
    if (
      text &&
      !text.includes("╔") &&
      !text.includes("╚") &&
      !text.includes("║")
    ) {
      console.log(`${colors.dim}[server] ${text}${colors.reset}`);
    }
  });

  // Helper to send request and wait for response
  async function sendRequest(method, params = {}) {
    const id = requestId++;
    const request = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, 30000);

      pendingRequests.set(id, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject,
      });

      serverProcess.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  // Wait for server to initialize
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log(`${colors.green}✓ Server started${colors.reset}\n`);

  try {
    // 1. Initialize
    console.log(
      `${colors.cyan}[1] Initializing MCP connection...${colors.reset}`
    );
    const initResponse = await sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mcp-client-review", version: "1.0.0" },
    });
    console.log(
      `${colors.green}✓ Connected to ${initResponse.result?.serverInfo?.name} v${initResponse.result?.serverInfo?.version}${colors.reset}\n`
    );

    // Send initialized notification
    serverProcess.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
        "\n"
    );

    // 2. Get status
    console.log(
      `${colors.cyan}[2] Checking n8n connection status...${colors.reset}`
    );
    const statusResponse = await sendRequest("tools/call", {
      name: "n8n_status",
      arguments: {},
    });
    const status = JSON.parse(
      statusResponse.result?.content?.[0]?.text || "{}"
    );
    console.log(
      `   n8n Connected: ${
        status.n8nConnected ? colors.green + "✓ Yes" : colors.red + "✗ No"
      }${colors.reset}`
    );
    console.log(`   Node Count: ${status.nodeCount || 0}`);
    console.log(`   LLM Available: ${status.llmAvailable ? "Yes" : "No"}\n`);

    // 3. List workflows
    console.log(
      `${colors.cyan}[3] Listing workflows from n8n...${colors.reset}`
    );
    const workflowsResponse = await sendRequest("tools/call", {
      name: "n8n_list_workflows",
      arguments: { limit: 50 },
    });

    const workflowsResult = JSON.parse(
      workflowsResponse.result?.content?.[0]?.text || "{}"
    );

    if (!workflowsResult.success) {
      console.log(
        `${colors.red}✗ Failed to list workflows: ${
          workflowsResult.error || "Unknown error"
        }${colors.reset}`
      );
    } else {
      const workflows = workflowsResult.workflows || [];
      console.log(
        `${colors.green}✓ Found ${workflows.length} workflows${colors.reset}\n`
      );

      if (workflows.length === 0) {
        console.log(
          `${colors.yellow}No workflows found. Your n8n instance appears to be empty.${colors.reset}`
        );
      } else {
        // Display workflow summary
        console.log(
          `${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`
        );
        console.log(
          `${colors.bold}                      WORKFLOW SUMMARY                          ${colors.reset}`
        );
        console.log(
          `${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}\n`
        );

        for (const wf of workflows) {
          const statusIcon = wf.active
            ? `${colors.green}●${colors.reset}`
            : `${colors.dim}○${colors.reset}`;
          console.log(`${statusIcon} ${colors.bold}${wf.name}${colors.reset}`);
          console.log(`  ID: ${wf.id}`);
          console.log(
            `  Status: ${
              wf.active ? colors.green + "Active" : colors.yellow + "Inactive"
            }${colors.reset}`
          );
          if (wf.updatedAt) {
            console.log(
              `  Updated: ${new Date(wf.updatedAt).toLocaleString()}`
            );
          }
          console.log("");
        }

        // 4. Get details for first few workflows
        const maxDetails = Math.min(3, workflows.length);
        console.log(
          `${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`
        );
        console.log(
          `${colors.bold}              WORKFLOW DETAILS (Top ${maxDetails})                  ${colors.reset}`
        );
        console.log(
          `${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}\n`
        );

        for (let i = 0; i < maxDetails; i++) {
          const wf = workflows[i];
          console.log(
            `${colors.cyan}[${i + 4}] Getting details for: ${wf.name}${
              colors.reset
            }`
          );

          try {
            const detailResponse = await sendRequest("tools/call", {
              name: "n8n_get_workflow",
              arguments: { id: wf.id },
            });

            const detailResult = JSON.parse(
              detailResponse.result?.content?.[0]?.text || "{}"
            );

            if (detailResult.success && detailResult.workflow) {
              const workflow = detailResult.workflow;
              const nodes = workflow.nodes || [];

              console.log(
                `\n${colors.bold}   📋 ${workflow.name}${colors.reset}`
              );
              console.log(`   ${"─".repeat(50)}`);
              console.log(`   Nodes: ${nodes.length}`);

              // Group nodes by type
              const nodeTypes = {};
              for (const node of nodes) {
                const type = node.type?.split(".").pop() || "unknown";
                nodeTypes[type] = (nodeTypes[type] || 0) + 1;
              }

              console.log(`   Node types:`);
              for (const [type, count] of Object.entries(nodeTypes)) {
                console.log(`     • ${type}: ${count}`);
              }

              // Show trigger node if present
              const triggerNode = nodes.find(
                (n) =>
                  n.type?.includes("Trigger") ||
                  n.type?.includes("webhook") ||
                  n.type?.includes("Schedule")
              );
              if (triggerNode) {
                console.log(
                  `   Trigger: ${
                    triggerNode.type?.split(".").pop() || triggerNode.name
                  }`
                );
              }

              console.log("");
            } else {
              console.log(
                `   ${colors.yellow}Could not retrieve details${colors.reset}\n`
              );
            }
          } catch (err) {
            console.log(
              `   ${colors.red}Error: ${err.message}${colors.reset}\n`
            );
          }
        }
      }
    }

    console.log(
      `\n${colors.green}${colors.bold}✓ Review complete!${colors.reset}`
    );
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  } finally {
    // Cleanup
    serverProcess.stdin.end();
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

main().catch(console.error);
