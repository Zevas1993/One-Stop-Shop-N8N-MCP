const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

async function main() {
  const client = new Client({
    name: "direct-test-client",
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

  // Step 1: List workflows
  console.log("STEP 1: List all workflows");
  console.log("=".repeat(60));
  const listResult = await client.callTool({
    name: "workflow_manager",
    arguments: { action: "list" }
  });

  const listData = JSON.parse(listResult.content[0].text);
  console.log("Workflows found:", listData.data?.length || 0);

  if (listData.data && listData.data.length > 0) {
    listData.data.slice(0, 5).forEach((w, i) => {
      console.log(`  ${i + 1}. ${w.name} (${w.id}) - Active: ${w.active}`);
    });
  }

  // Find Outlook workflow
  const outlookWorkflow = listData.data?.find(w =>
    w.name.toLowerCase().includes('outlook') ||
    w.name.toLowerCase().includes('email')
  );

  if (!outlookWorkflow) {
    console.log("\n❌ No Outlook workflow found");
    await transport.close();
    return;
  }

  console.log(`\n✅ Found: "${outlookWorkflow.name}" (${outlookWorkflow.id})\n`);

  // Step 2: Get full workflow
  console.log("STEP 2: Get full workflow details");
  console.log("=".repeat(60));
  const getResult = await client.callTool({
    name: "workflow_manager",
    arguments: {
      action: "get",
      id: outlookWorkflow.id
    }
  });

  const workflowData = JSON.parse(getResult.content[0].text);
  const workflow = workflowData.data;

  console.log(`Nodes: ${workflow.nodes?.length || 0}`);
  console.log(`Active: ${workflow.active}`);

  // Find Business Inquiry node
  const businessNode = workflow.nodes?.find(n =>
    n.name.includes('Business')
  );

  if (!businessNode) {
    console.log("❌ No Business Inquiry node found");
    await transport.close();
    return;
  }

  console.log(`\nBusiness node: "${businessNode.name}"`);

  const hasConnection = workflow.connections?.[businessNode.name]?.main;
  console.log(`Has output connection: ${hasConnection ? 'YES ✅' : 'NO ❌ (BROKEN)'}\n`);

  if (hasConnection) {
    console.log("✅ Workflow is already fixed!");
    await transport.close();
    return;
  }

  // Step 3: Fix using workflow_diff
  console.log("STEP 3: Fix using workflow_diff");
  console.log("=".repeat(60));
  console.log(`Adding connection: "${businessNode.name}" → "Update Email Categories"\n`);

  const fixResult = await client.callTool({
    name: "workflow_diff",
    arguments: {
      id: outlookWorkflow.id,
      operations: [{
        type: "addConnection",
        description: "Connect Business Inquiry to Update Email Categories",
        source: businessNode.name,
        target: "Update Email Categories",
        sourceOutput: "main",
        targetInput: "main"
      }]
    }
  });

  const fixData = JSON.parse(fixResult.content[0].text);

  if (fixData.success) {
    console.log("✅ SUCCESS! Workflow fixed");
    console.log(`Message: ${fixData.message || 'Connection added'}`);
    console.log("\n🎉 The Business Inquiry Agent is now connected!");
  } else {
    console.log("❌ Fix failed:", fixData.error);
    if (fixData.details) {
      console.log("Details:", JSON.stringify(fixData.details, null, 2));
    }
  }

  await transport.close();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
