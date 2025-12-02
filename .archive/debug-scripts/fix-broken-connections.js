const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

async function main() {
  console.log("🔧 FIXING BROKEN WORKFLOW CONNECTIONS VIA MCP\n");

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
  console.log("✅ Connected to MCP server\n");

  const WORKFLOW_ID = "Baf9nylVDD1pzj9Q";

  // Get the workflow
  console.log("📥 Getting workflow...");
  const getResult = await client.callTool({
    name: "workflow_manager",
    arguments: { action: "get", id: WORKFLOW_ID }
  });

  const workflow = JSON.parse(getResult.content[0].text).data;
  console.log(`Got workflow with ${workflow.nodes.length} nodes\n`);

  // Map broken connection IDs to actual node names
  const nameMapping = {
    "webhook_trigger": "🌐 API Webhook",
    "manual_trigger": "▶️ Manual Test",
    "smart_router": "🧠 Smart Request Router",
    "request_dispatcher": "🚦 Request Dispatcher",
    "email_fetcher": "📧 Microsoft Graph Email Fetcher",
    "email_processor": "🔍 Email Intelligence Processor",
    "ai_handler": "🤖 AI Chat Handler",
    "response_formatter": "📊 Final Response Formatter"
  };

  console.log("🔍 Current broken connections use wrong IDs:");
  Object.keys(workflow.connections || {}).forEach(key => {
    console.log(`  ${key} (should be: ${nameMapping[key] || 'UNKNOWN'})`);
  });

  // Build correct connections using actual node names
  console.log("\n🔧 Building correct connections...");

  const correctConnections = {
    "🌐 API Webhook": {
      "main": [[{ "node": "🧠 Smart Request Router", "type": "main", "index": 0 }]]
    },
    "▶️ Manual Test": {
      "main": [[{ "node": "🧠 Smart Request Router", "type": "main", "index": 0 }]]
    },
    "🧠 Smart Request Router": {
      "main": [[{ "node": "🚦 Request Dispatcher", "type": "main", "index": 0 }]]
    },
    "🚦 Request Dispatcher": {
      "main": [
        [{ "node": "📧 Microsoft Graph Email Fetcher", "type": "main", "index": 0 }],
        [{ "node": "🤖 AI Chat Handler", "type": "main", "index": 0 }]
      ]
    },
    "📧 Microsoft Graph Email Fetcher": {
      "main": [[{ "node": "🔍 Email Intelligence Processor", "type": "main", "index": 0 }]]
    },
    "🔍 Email Intelligence Processor": {
      "main": [[{ "node": "📊 Final Response Formatter", "type": "main", "index": 0 }]]
    },
    "🤖 AI Chat Handler": {
      "main": [[{ "node": "📊 Final Response Formatter", "type": "main", "index": 0 }]]
    }
  };

  console.log("✅ Correct connections built\n");

  // Update the workflow with correct connections
  console.log("📤 Updating workflow via MCP...");

  workflow.connections = correctConnections;

  const updateResult = await client.callTool({
    name: "workflow_manager",
    arguments: {
      action: "update",
      id: WORKFLOW_ID,
      changes: { connections: correctConnections }
    }
  });

  const updateData = JSON.parse(updateResult.content[0].text);

  if (updateData.success) {
    console.log("\n✅ SUCCESS! Workflow connections fixed via MCP");
    console.log("\n🎉 Go refresh the n8n UI - the workflow should now load properly!");
    console.log("   All nodes should be connected correctly.");
  } else {
    console.log("\n❌ Update failed:", updateData.error);
    if (updateData.details) {
      console.log("Details:", JSON.stringify(updateData.details, null, 2));
    }
  }

  await transport.close();
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
