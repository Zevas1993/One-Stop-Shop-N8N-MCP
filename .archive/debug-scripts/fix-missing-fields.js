const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const crypto = require('crypto');

async function main() {
  console.log('🔧 FIXING MISSING NODE FIELDS VIA MCP\n');

  const client = new Client({ name: 'fixer', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/mcp/index.js'],
    env: {
      N8N_API_URL: 'http://localhost:5678',
      N8N_API_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q'
    }
  });

  await client.connect(transport);
  console.log('✅ Connected to MCP\n');
  await new Promise(r => setTimeout(r, 10000));

  const WORKFLOW_ID = 'Baf9nylVDD1pzj9Q';

  // Get workflow
  const getResult = await client.callTool({
    name: 'workflow_manager',
    arguments: { action: 'get', id: WORKFLOW_ID }
  });

  const getData = JSON.parse(getResult.content[0].text);
  const workflow = getData.data;

  console.log('Fixing nodes...\n');

  // Fix each node
  for (const node of workflow.nodes) {
    console.log(`Fixing: ${node.name}`);

    // Add credentials field if missing
    if (!node.credentials) {
      node.credentials = {};
    }

    // Add webhookId to webhook nodes
    if (node.type === 'n8n-nodes-base.webhook' && !node.webhookId) {
      node.webhookId = crypto.randomUUID();
      console.log(`  Added webhookId: ${node.webhookId}`);
    }
  }

  console.log('\n📤 Updating workflow...\n');

  const updateResult = await client.callTool({
    name: 'workflow_manager',
    arguments: {
      action: 'update',
      id: WORKFLOW_ID,
      changes: {
        name: workflow.name,
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings
      }
    }
  });

  const updateData = JSON.parse(updateResult.content[0].text);
  console.log('Result:', updateData.success ? '✅ SUCCESS!' : '❌ FAILED');

  if (!updateData.success) {
    console.log('Error:', updateData.error);
    if (updateData.details) {
      console.log('Details:', JSON.stringify(updateData.details, null, 2));
    }
  } else {
    console.log('\n🎉 ALL NODE FIELDS FIXED!');
    console.log('   Refresh n8n UI - workflow should now load properly!');
  }

  await transport.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
