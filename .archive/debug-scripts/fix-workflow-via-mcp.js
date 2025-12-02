const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const fs = require('fs');

const LOG = 'fix-workflow-log.txt';
function log(msg) {
  console.log(msg);
  fs.appendFileSync(LOG, msg + '\n');
}

async function main() {
  fs.writeFileSync(LOG, '=== FIX WORKFLOW VIA MCP ===\n\n');

  log("Connecting to MCP server...");
  const client = new Client({ name: "fix-agent", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/mcp/index.js"],
    env: {
      N8N_API_URL: "http://localhost:5678",
      N8N_API_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q"
    }
  });

  await client.connect(transport);
  log("✅ Connected\n");

  // List workflows to find the broken one
  log("Listing workflows...");
  const listResult = await client.callTool({
    name: "workflow_manager",
    arguments: { action: "list" }
  });

  const listData = JSON.parse(listResult.content[0].text);
  const workflows = listData.data.workflows;

  log(`Found ${workflows.length} workflows\n`);

  // Find "Ultimate AI Outlook Assistant - Proper Nodes"
  const target = workflows.find(w => w.name.includes("Ultimate AI Outlook Assistant - Proper Nodes"));

  if (!target) {
    log("❌ Could not find target workflow");
    log("Available workflows:");
    workflows.slice(0, 5).forEach(w => log(`  - ${w.name}`));
    await transport.close();
    return;
  }

  log(`Found: "${target.name}" (${target.id})\n`);

  // Get full workflow
  log("Getting full workflow details...");
  const getResult = await client.callTool({
    name: "workflow_manager",
    arguments: { action: "get", id: target.id }
  });

  const getData = JSON.parse(getResult.content[0].text);
  const workflow = getData.data;

  log(`Retrieved workflow with ${workflow.nodes.length} nodes\n`);

  // Check for AI nodes with missing config references
  log("Analyzing nodes for broken references...");

  const brokenNodes = [];
  const aiNodes = workflow.nodes.filter(n =>
    n.type.includes('agent') || n.type.includes('Agent') ||
    n.type.includes('langchain') || n.type.includes('openAi')
  );

  log(`\nFound ${aiNodes.length} AI-related nodes:`);
  aiNodes.forEach(n => {
    log(`  - ${n.name} (${n.type})`);
  });

  // The issue is AI nodes need connections to their model/memory configs
  // These should be in the connections but might be missing
  log("\nChecking AI node connections...");

  aiNodes.forEach(node => {
    const hasModelConnection = workflow.connections[node.name]?.ai_model;
    const hasMemoryConnection = workflow.connections[node.name]?.ai_memory;

    if (!hasModelConnection && !hasMemoryConnection) {
      log(`  ❌ ${node.name} - Missing AI config connections`);
      brokenNodes.push(node);
    } else {
      log(`  ✅ ${node.name} - Has connections`);
    }
  });

  if (brokenNodes.length === 0) {
    log("\n✅ No broken AI node connections found!");
    log("The issue might be with the nodes themselves...");

    // Check if nodes exist but have invalid types
    log("\nChecking node types...");
    const invalidNodes = workflow.nodes.filter(n => {
      // n8n-nodes-base.aiAgent doesn't exist - should be @n8n/n8n-nodes-langchain.agent
      return n.type === 'n8n-nodes-base.aiAgent';
    });

    if (invalidNodes.length > 0) {
      log(`\n⚠️  Found ${invalidNodes.length} nodes with INVALID type 'n8n-nodes-base.aiAgent'`);
      log("This type doesn't exist! Should be '@n8n/n8n-nodes-langchain.agent'");

      invalidNodes.forEach(n => {
        log(`  - ${n.name}`);
      });

      log("\n🔧 FIXING: Updating node types via workflow_diff...");

      const operations = invalidNodes.map(node => ({
        type: "updateNode",
        nodeId: node.name,
        updates: {
          type: "@n8n/n8n-nodes-langchain.agent"
        }
      }));

      log(`Creating ${operations.length} updateNode operations...`);

      const fixResult = await client.callTool({
        name: "workflow_diff",
        arguments: {
          id: target.id,
          operations: operations
        }
      });

      const fixData = JSON.parse(fixResult.content[0].text);

      if (fixData.success) {
        log("\n✅ SUCCESS! Workflow fixed");
        log(`Message: ${fixData.message}`);
        log("\n🎉 Go refresh the n8n UI - the workflow should now load!");
      } else {
        log(`\n❌ Fix failed: ${fixData.error}`);
        log(`Details: ${JSON.stringify(fixData.details, null, 2)}`);
      }
    } else {
      log("\n✅ All node types are valid");
    }
  }

  await transport.close();
  log("\n=== COMPLETE ===");
}

main().catch(err => {
  console.error("Error:", err);
  fs.appendFileSync(LOG, `\nERROR: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
