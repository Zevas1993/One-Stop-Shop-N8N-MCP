const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

async function main() {
  console.log("\n=== CONNECTING TO MCP SERVER VIA STDIO ===\n");

  const client = new Client({
    name: "workflow-fixer",
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
  console.log("✅ Connected to MCP server\n");

  // List workflows to see what we're working with
  console.log("Step 1: Listing workflows from n8n...\n");
  const listResult = await client.callTool({
    name: "workflow_manager",
    arguments: { action: "list" }
  });

  const listData = JSON.parse(listResult.content[0].text);

  if (!listData.success || !listData.data) {
    console.log("❌ Failed to list workflows:", listData.error);
    await transport.close();
    return;
  }

  console.log(`Found ${listData.data.length} workflows:\n`);
  listData.data.slice(0, 10).forEach((w, i) => {
    console.log(`  ${i + 1}. ${w.name}`);
    console.log(`     ID: ${w.id}`);
    console.log(`     Active: ${w.active}\n`);
  });

  // Find the "Ultimate AI Outlook Assistant - Proper Nodes" workflow
  const targetWorkflow = listData.data.find(w =>
    w.name.includes("Ultimate AI Outlook Assistant - Proper Nodes")
  );

  if (!targetWorkflow) {
    console.log("❌ Could not find 'Ultimate AI Outlook Assistant - Proper Nodes' workflow");
    await transport.close();
    return;
  }

  console.log(`\n✅ Found target workflow: "${targetWorkflow.name}"`);
  console.log(`   ID: ${targetWorkflow.id}\n`);

  // Get full workflow details
  console.log("Step 2: Getting full workflow details...\n");
  const getResult = await client.callTool({
    name: "workflow_manager",
    arguments: {
      action: "get",
      id: targetWorkflow.id
    }
  });

  const getData = JSON.parse(getResult.content[0].text);

  if (!getData.success || !getData.data) {
    console.log("❌ Failed to get workflow:", getData.error);
    await transport.close();
    return;
  }

  const workflow = getData.data;
  console.log(`✅ Retrieved workflow with ${workflow.nodes.length} nodes\n`);

  // Analyze the workflow structure
  console.log("Step 3: Analyzing workflow for broken connections...\n");

  console.log("Nodes in workflow:");
  workflow.nodes.forEach((node, i) => {
    console.log(`  ${i + 1}. ${node.name} (${node.type})`);
  });

  console.log("\nConnections:");
  const connectionKeys = Object.keys(workflow.connections || {});
  if (connectionKeys.length === 0) {
    console.log("  ❌ NO CONNECTIONS - Workflow is completely broken!\n");
  } else {
    connectionKeys.forEach(source => {
      const outputs = workflow.connections[source];
      if (outputs.main) {
        outputs.main.forEach((outputGroup, i) => {
          outputGroup.forEach(conn => {
            console.log(`  ${source} → ${conn.node}`);
          });
        });
      }
    });
  }

  // Find nodes that should have outputs but don't
  console.log("\nStep 4: Identifying broken nodes...\n");
  const brokenNodes = [];

  workflow.nodes.forEach(node => {
    // Skip trigger and output nodes
    if (node.type.includes('Trigger') || node.type.includes('trigger')) return;
    if (node.name.toLowerCase().includes('send') || node.name.toLowerCase().includes('response')) return;

    const hasOutput = workflow.connections[node.name]?.main;
    if (!hasOutput) {
      brokenNodes.push(node);
      console.log(`  ❌ ${node.name} has NO output connection`);
    }
  });

  if (brokenNodes.length === 0) {
    console.log("  ✅ No broken nodes found - workflow appears correct!\n");
    await transport.close();
    return;
  }

  console.log(`\n⚠️  Found ${brokenNodes.length} broken node(s)\n`);

  // For now, just report what we found
  console.log("Step 5: Workflow analysis complete\n");
  console.log("=" . repeat(60));
  console.log("BROKEN WORKFLOW REPORT");
  console.log("=".repeat(60));
  console.log(`Workflow: ${workflow.name}`);
  console.log(`ID: ${targetWorkflow.id}`);
  console.log(`Total Nodes: ${workflow.nodes.length}`);
  console.log(`Broken Nodes: ${brokenNodes.length}`);
  console.log("\nNodes needing connections:");
  brokenNodes.forEach(node => {
    console.log(`  - ${node.name} (${node.type})`);
  });
  console.log("=".repeat(60));

  await transport.close();
  console.log("\n✅ MCP connection closed\n");
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
