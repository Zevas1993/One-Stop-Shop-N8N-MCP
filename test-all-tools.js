/**
 * Comprehensive MCP Tool Verification Script
 * Tests ALL available tools in the n8n MCP server
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// Load .env file
const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
}

const SERVER_PATH = path.join(__dirname, "dist", "main.js");

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  blue: "\x1b[34m",
};

let requestId = 1;
const pendingRequests = new Map();
let stdoutBuffer = "";

async function main() {
  console.log(
    `${colors.cyan}${colors.bold}╔════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bold}║       MCP Comprehensive Tool Verification Suite            ║${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bold}╚════════════════════════════════════════════════════════════╝${colors.reset}`
  );
  console.log("");

  // Start MCP Server
  console.log(`${colors.dim}Starting MCP server...${colors.reset}`);
  const serverProcess = spawn("node", [SERVER_PATH], {
    env: {
      ...process.env,
      ...envVars,
      N8N_AUTO_SYNC: "false",
      MCP_MODE: "stdio",
      LOG_LEVEL: "DEBUG",
    },
    stdio: ["pipe", "pipe", "pipe"],
    cwd: __dirname,
  });

  // Handle stdout (JSON-RPC)
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

  // Handle stderr
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

  // Wait for init (increased for AI system initialization)
  await new Promise((resolve) => setTimeout(resolve, 15000));

  try {
    // 1. Initialize
    console.log(`${colors.bold}1. Initialization${colors.reset}`);
    await sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-suite", version: "1.0.0" },
    });
    serverProcess.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
        "\n"
    );
    console.log(`${colors.green}✓ Connected${colors.reset}\n`);

    // 2. Node Discovery Tools
    console.log(`${colors.bold}2. Testing Node Discovery Tools${colors.reset}`);

    // n8n_search_nodes
    process.stdout.write("  • n8n_search_nodes... ");
    const searchRes = await sendRequest("tools/call", {
      name: "n8n_search_nodes",
      arguments: { query: "http" },
    });
    const searchData = JSON.parse(searchRes.result.content[0].text);
    if (searchData.success && searchData.count > 0)
      console.log(
        `${colors.green}✓ Found ${searchData.count} nodes${colors.reset}`
      );
    else
      console.log(
        `${colors.red}✗ Failed: ${searchData.error || "No nodes found"}${
          colors.reset
        }`
      );

    // n8n_list_ai_nodes
    process.stdout.write("  • n8n_list_ai_nodes... ");
    const aiRes = await sendRequest("tools/call", {
      name: "n8n_list_ai_nodes",
      arguments: {},
    });
    const aiData = JSON.parse(aiRes.result.content[0].text);
    if (aiData.success)
      console.log(
        `${colors.green}✓ Found ${aiData.count} AI nodes${colors.reset}`
      );
    else
      console.log(
        `${colors.red}✗ Failed: ${aiData.error || "No AI nodes found"}${
          colors.reset
        }`
      );

    // n8n_get_node_info
    process.stdout.write("  • n8n_get_node_info... ");
    const infoRes = await sendRequest("tools/call", {
      name: "n8n_get_node_info",
      arguments: { nodeType: "n8n-nodes-base.httpRequest" },
    });
    const infoData = JSON.parse(infoRes.result.content[0].text);
    if (infoData.success)
      console.log(
        `${colors.green}✓ Retrieved info for ${infoData.node.displayName}${colors.reset}`
      );
    else
      console.log(
        `${colors.red}✗ Failed: ${infoData.error || "Node not found"}${
          colors.reset
        }`
      );
    console.log("");

    // 3. Workflow Management Tools
    console.log(
      `${colors.bold}3. Testing Workflow Management Tools${colors.reset}`
    );

    // n8n_list_workflows
    process.stdout.write("  • n8n_list_workflows... ");
    const listRes = await sendRequest("tools/call", {
      name: "n8n_list_workflows",
      arguments: { limit: 5 },
    });
    const listData = JSON.parse(listRes.result.content[0].text);
    if (listData.success)
      console.log(
        `${colors.green}✓ Listed ${listData.count} workflows${colors.reset}`
      );
    else console.log(`${colors.red}✗ Failed: ${listData.error}${colors.reset}`);

    // n8n_create_workflow
    process.stdout.write("  • n8n_create_workflow... ");
    const createRes = await sendRequest("tools/call", {
      name: "n8n_create_workflow",
      arguments: {
        name: "MCP_TEST_WORKFLOW_" + Date.now(),
        nodes: [
          {
            parameters: {},
            name: "Start",
            type: "n8n-nodes-base.manualTrigger",
            typeVersion: 1,
            position: [250, 300],
          },
        ],
        connections: {},
        settings: { executionOrder: "v1" },
      },
    });
    const createData = JSON.parse(createRes.result.content[0].text);
    let testWorkflowId = null;
    if (createData.success) {
      testWorkflowId = createData.workflowId;
      console.log(
        `${colors.green}✓ Created ID: ${testWorkflowId}${colors.reset}`
      );
    } else {
      console.log(`${colors.red}✗ Failed: ${createData.error}${colors.reset}`);
    }

    if (testWorkflowId) {
      // n8n_get_workflow
      process.stdout.write("  • n8n_get_workflow... ");
      const getRes = await sendRequest("tools/call", {
        name: "n8n_get_workflow",
        arguments: { id: testWorkflowId },
      });
      const getData = JSON.parse(getRes.result.content[0].text);
      if (getData.success)
        console.log(`${colors.green}✓ Verified${colors.reset}`);
      else console.log(`${colors.red}✗ Failed${colors.reset}`);

      // n8n_update_workflow
      process.stdout.write("  • n8n_update_workflow... ");
      const updateRes = await sendRequest("tools/call", {
        name: "n8n_update_workflow",
        arguments: {
          id: testWorkflowId,
          workflow: { name: createData.name + "_UPDATED" },
        },
      });
      const updateData = JSON.parse(updateRes.result.content[0].text);
      if (updateData.success)
        console.log(`${colors.green}✓ Updated${colors.reset}`);
      else console.log(`${colors.red}✗ Failed${colors.reset}`);

      // n8n_validate_workflow
      process.stdout.write("  • n8n_validate_workflow... ");
      const validateRes = await sendRequest("tools/call", {
        name: "n8n_validate_workflow",
        arguments: { workflow: getData.workflow },
      });
      const validateData = JSON.parse(validateRes.result.content[0].text);
      if (validateData.valid !== undefined)
        console.log(
          `${colors.green}✓ Valid: ${validateData.valid}${colors.reset}`
        );
      else console.log(`${colors.red}✗ Failed${colors.reset}`);

      // n8n_activate_workflow
      process.stdout.write("  • n8n_activate_workflow... ");
      const activateRes = await sendRequest("tools/call", {
        name: "n8n_activate_workflow",
        arguments: { id: testWorkflowId, active: true },
      });
      const activateData = JSON.parse(activateRes.result.content[0].text);
      if (activateData.success)
        console.log(`${colors.green}✓ Activated${colors.reset}`);
      else console.log(`${colors.red}✗ Failed${colors.reset}`);

      // n8n_execute_workflow
      process.stdout.write("  • n8n_execute_workflow... ");
      const execRes = await sendRequest("tools/call", {
        name: "n8n_execute_workflow",
        arguments: { id: testWorkflowId },
      });
      const execData = JSON.parse(execRes.result.content[0].text);
      if (execData.success)
        console.log(
          `${colors.green}✓ Started Execution: ${execData.executionId}${colors.reset}`
        );
      else
        console.log(`${colors.red}✗ Failed: ${execData.error}${colors.reset}`);

      // n8n_delete_workflow
      process.stdout.write("  • n8n_delete_workflow... ");
      const deleteRes = await sendRequest("tools/call", {
        name: "n8n_delete_workflow",
        arguments: { id: testWorkflowId },
      });
      const deleteData = JSON.parse(deleteRes.result.content[0].text);
      if (deleteData.success)
        console.log(`${colors.green}✓ Deleted${colors.reset}`);
      else console.log(`${colors.red}✗ Failed${colors.reset}`);
    }
    console.log("");

    // 4. Execution Tools
    console.log(`${colors.bold}4. Testing Execution Tools${colors.reset}`);

    // n8n_list_executions
    process.stdout.write("  • n8n_list_executions... ");
    const listExecRes = await sendRequest("tools/call", {
      name: "n8n_list_executions",
      arguments: { limit: 5 },
    });
    const listExecData = JSON.parse(listExecRes.result.content[0].text);
    if (listExecData.success)
      console.log(
        `${colors.green}✓ Found ${listExecData.count} executions${colors.reset}`
      );
    else console.log(`${colors.red}✗ Failed${colors.reset}`);
    console.log("");

    // 5. Major Workflow Verification
    console.log(`${colors.bold}5. Major Workflow Verification${colors.reset}`);
    const majorWorkflowId = "zLRgtz5o1dD6dVur"; // Ultimate Outlook AI Assistant
    console.log(`  Fetching details for: ${majorWorkflowId}`);

    const majorRes = await sendRequest("tools/call", {
      name: "n8n_get_workflow",
      arguments: { id: majorWorkflowId },
    });
    const majorData = JSON.parse(majorRes.result.content[0].text);

    if (majorData.success && majorData.workflow) {
      const wf = majorData.workflow;
      console.log(
        `${colors.green}✓ Successfully retrieved "${wf.name}"${colors.reset}`
      );
      console.log(`  • Nodes: ${wf.nodes.length}`);
      console.log(`  • Active: ${wf.active}`);

      // Check for AI agents
      const aiNodes = wf.nodes.filter(
        (n) => n.type.includes("agent") || n.type.includes("langchain")
      );
      if (aiNodes.length > 0) {
        console.log(`  • AI Agents Found: ${aiNodes.length}`);
        aiNodes.forEach((n) => console.log(`    - ${n.name} (${n.type})`));
        console.log(
          `${colors.green}✓ Built-in Agents Verified (via workflow inspection)${colors.reset}`
        );
      } else {
        console.log(
          `${colors.yellow}⚠ No AI agents found in this workflow${colors.reset}`
        );
      }
    } else {
      console.log(
        `${colors.red}✗ Failed to retrieve major workflow${colors.reset}`
      );
      // Try listing to find another one
      if (listData.success && listData.workflows.length > 0) {
        const fallbackId = listData.workflows[0].id;
        console.log(`  Retrying with available workflow: ${fallbackId}`);
        const fallbackRes = await sendRequest("tools/call", {
          name: "n8n_get_workflow",
          arguments: { id: fallbackId },
        });
        const fallbackData = JSON.parse(fallbackRes.result.content[0].text);
        if (fallbackData.success) {
          console.log(
            `${colors.green}✓ Retrieved "${fallbackData.workflow.name}"${colors.reset}`
          );
        }
      }
    }

    console.log(
      `\n${colors.green}${colors.bold}✓ All Tests Complete${colors.reset}`
    );
  } catch (error) {
    console.error(`${colors.red}Test Failed: ${error.message}${colors.reset}`);
  } finally {
    serverProcess.stdin.end();
    serverProcess.kill();
  }
}

main();
