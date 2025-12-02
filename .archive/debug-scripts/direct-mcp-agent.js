const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const fs = require('fs');

const LOG_FILE = 'mcp-agent-log.txt';

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, logMessage);
}

async function main() {
  // Clear previous log
  fs.writeFileSync(LOG_FILE, '=== MCP AGENT SESSION START ===\n\n');

  log("STEP 1: Connecting to MCP server via stdio...");

  const client = new Client({
    name: "direct-mcp-agent",
    version: "1.0.0",
  });

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/mcp/index.js"],
    env: {
      N8N_API_URL: "http://localhost:5678",
      N8N_API_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q"
    }
  });

  await client.connect(transport);
  log("✅ Connected to MCP server\n");

  // STEP 2: List workflows
  log("STEP 2: Calling workflow_manager with action='list'...");
  log("Request: { name: 'workflow_manager', arguments: { action: 'list' } }");

  const listResult = await client.callTool({
    name: "workflow_manager",
    arguments: { action: "list" }
  });

  log("\nRaw MCP Response:");
  log(JSON.stringify(listResult, null, 2));

  const listText = listResult.content[0].text;
  log("\nResponse Text:");
  log(listText.substring(0, 500) + "...");

  const listData = JSON.parse(listText);
  log("\nParsed Response:");
  log(`  success: ${listData.success}`);
  log(`  data type: ${typeof listData.data}`);
  log(`  data keys: ${listData.data ? Object.keys(listData.data).join(', ') : 'null'}`);

  if (listData.data && listData.data.workflows) {
    log(`  workflows count: ${listData.data.workflows.length}`);
    log("\nFirst 3 workflows:");
    listData.data.workflows.slice(0, 3).forEach((w, i) => {
      log(`    ${i + 1}. ${w.name} (${w.id})`);
    });
  } else {
    log("  ❌ ISSUE: No workflows array in response!");
    log(`  Full data: ${JSON.stringify(listData.data)}`);
  }

  // Find Ultimate AI Outlook Assistant
  const workflows = listData.data?.workflows || [];
  const targetWorkflow = workflows.find(w =>
    w.name && w.name.includes("Ultimate AI Outlook Assistant - Proper Nodes")
  );

  if (!targetWorkflow) {
    log("\n❌ Could not find 'Ultimate AI Outlook Assistant - Proper Nodes'");
    log("Available workflows:");
    workflows.slice(0, 5).forEach(w => log(`  - ${w.name}`));
    await transport.close();
    return;
  }

  log(`\n✅ Found target: "${targetWorkflow.name}" (${targetWorkflow.id})`);

  // STEP 3: Get workflow details
  log("\nSTEP 3: Getting workflow details...");
  log(`Request: { name: 'workflow_manager', arguments: { action: 'get', id: '${targetWorkflow.id}' } }`);

  const getResult = await client.callTool({
    name: "workflow_manager",
    arguments: {
      action: "get",
      id: targetWorkflow.id
    }
  });

  log("\nRaw MCP Response:");
  log(JSON.stringify(getResult, null, 2).substring(0, 1000) + "...");

  const getText = getResult.content[0].text;
  const getData = JSON.parse(getText);

  log("\nParsed Response:");
  log(`  success: ${getData.success}`);

  if (!getData.success) {
    log(`  ❌ ISSUE: Get workflow failed!`);
    log(`  error: ${getData.error}`);
    log(`  Full response: ${JSON.stringify(getData)}`);
    await transport.close();
    return;
  }

  const workflow = getData.data;
  log(`  ✅ Got workflow with ${workflow.nodes.length} nodes`);

  // STEP 4: Analyze connections
  log("\nSTEP 4: Analyzing workflow structure...");
  log(`\nNodes (${workflow.nodes.length}):`);
  workflow.nodes.forEach((n, i) => {
    log(`  ${i + 1}. ${n.name} (${n.type})`);
  });

  log(`\nConnections:`);
  const connKeys = Object.keys(workflow.connections || {});
  if (connKeys.length === 0) {
    log(`  ❌ NO CONNECTIONS FOUND - Workflow is broken!`);
  } else {
    log(`  Found ${connKeys.length} nodes with outputs:`);
    connKeys.forEach(source => {
      const conns = workflow.connections[source];
      if (conns.main && conns.main[0]) {
        conns.main[0].forEach(c => {
          log(`    ${source} → ${c.node}`);
        });
      }
    });
  }

  // Find broken nodes
  log("\nSTEP 5: Identifying broken nodes...");
  const brokenNodes = [];
  workflow.nodes.forEach(node => {
    if (node.type.toLowerCase().includes('trigger')) return;
    if (node.name.toLowerCase().includes('send')) return;
    if (node.name.toLowerCase().includes('response')) return;

    const hasOutput = workflow.connections[node.name]?.main;
    if (!hasOutput) {
      brokenNodes.push(node);
      log(`  ❌ ${node.name} has NO output`);
    }
  });

  if (brokenNodes.length === 0) {
    log("\n✅ No broken nodes - workflow is correct!");
    await transport.close();
    return;
  }

  log(`\n⚠️  Found ${brokenNodes.length} broken node(s)`);

  log("\n=== SESSION COMPLETE ===");
  log(`Check ${LOG_FILE} for full details`);

  await transport.close();
}

main().catch(err => {
  log(`\n❌ FATAL ERROR: ${err.message}`);
  log(err.stack);
  process.exit(1);
});
