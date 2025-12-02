const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const fs = require('fs');

const LOG = 'mcp-fix-log.txt';
function log(msg) {
  console.log(msg);
  fs.appendFileSync(LOG, msg + '\n');
}

async function main() {
  fs.writeFileSync(LOG, '=== FIX WORKFLOW VIA MCP SERVER ===\n\n');

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
  log("✅ Connected to MCP server\n");

  log("⏳ Waiting 10 seconds for MCP server initialization...");
  await new Promise(r => setTimeout(r, 10000));

  const WORKFLOW_ID = "Baf9nylVDD1pzj9Q";

  // Batch 1: First 5 connection fixes
  log("\n📤 BATCH 1: Sending first 5 connection operations via MCP...");

  const batch1 = [
    {
      type: "addConnection",
      description: "Connect webhook to router",
      source: "🌐 API Webhook",
      target: "🧠 Smart Request Router",
      sourceOutput: "main",
      targetInput: "main"
    },
    {
      type: "addConnection",
      description: "Connect manual trigger to router",
      source: "▶️ Manual Test",
      target: "🧠 Smart Request Router",
      sourceOutput: "main",
      targetInput: "main"
    },
    {
      type: "addConnection",
      description: "Connect router to dispatcher",
      source: "🧠 Smart Request Router",
      target: "🚦 Request Dispatcher",
      sourceOutput: "main",
      targetInput: "main"
    },
    {
      type: "addConnection",
      description: "Connect dispatcher to email fetcher (branch 1)",
      source: "🚦 Request Dispatcher",
      target: "📧 Microsoft Graph Email Fetcher",
      sourceOutput: "main",
      targetInput: "main",
      outputIndex: 0
    },
    {
      type: "addConnection",
      description: "Connect dispatcher to AI handler (branch 2)",
      source: "🚦 Request Dispatcher",
      target: "🤖 AI Chat Handler",
      sourceOutput: "main",
      targetInput: "main",
      outputIndex: 1
    }
  ];

  log(`Operations: ${batch1.length}`);
  log(JSON.stringify(batch1, null, 2));

  const result1 = await client.callTool({
    name: "workflow_diff",
    arguments: {
      id: WORKFLOW_ID,
      operations: batch1
    }
  });

  log("\nMCP Response:");
  log(JSON.stringify(result1, null, 2));

  const data1 = JSON.parse(result1.content[0].text);

  if (!data1.success) {
    log(`\n❌ BATCH 1 FAILED: ${data1.error}`);
    log(`Details: ${JSON.stringify(data1.details, null, 2)}`);
    await transport.close();
    return;
  }

  log(`\n✅ BATCH 1 SUCCESS: ${data1.message}`);

  // Batch 2: Remaining connections
  log("\n\n📤 BATCH 2: Sending remaining connection operations via MCP...");

  const batch2 = [
    {
      type: "addConnection",
      description: "Connect email fetcher to processor",
      source: "📧 Microsoft Graph Email Fetcher",
      target: "🔍 Email Intelligence Processor",
      sourceOutput: "main",
      targetInput: "main"
    },
    {
      type: "addConnection",
      description: "Connect processor to formatter",
      source: "🔍 Email Intelligence Processor",
      target: "📊 Final Response Formatter",
      sourceOutput: "main",
      targetInput: "main"
    },
    {
      type: "addConnection",
      description: "Connect AI handler to formatter",
      source: "🤖 AI Chat Handler",
      target: "📊 Final Response Formatter",
      sourceOutput: "main",
      targetInput: "main"
    }
  ];

  log(`Operations: ${batch2.length}`);
  log(JSON.stringify(batch2, null, 2));

  const result2 = await client.callTool({
    name: "workflow_diff",
    arguments: {
      id: WORKFLOW_ID,
      operations: batch2
    }
  });

  log("\nMCP Response:");
  log(JSON.stringify(result2, null, 2));

  const data2 = JSON.parse(result2.content[0].text);

  if (!data2.success) {
    log(`\n❌ BATCH 2 FAILED: ${data2.error}`);
    log(`Details: ${JSON.stringify(data2.details, null, 2)}`);
  } else {
    log(`\n✅ BATCH 2 SUCCESS: ${data2.message}`);
    log("\n🎉 WORKFLOW FULLY FIXED VIA MCP SERVER!");
    log("   Refresh your n8n UI - the workflow should now load properly!");
  }

  await transport.close();
  log("\n=== COMPLETE ===");
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  fs.appendFileSync(LOG, `\n❌ ERROR: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
