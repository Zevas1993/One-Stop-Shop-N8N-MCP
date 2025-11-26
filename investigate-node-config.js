const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');

async function main() {
  console.log('🔍 INVESTIGATING NODE CONFIGURATIONS VIA MCP\n');

  const client = new Client({ name: 'investigator', version: '1.0.0' });
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

  // Get the workflow
  console.log('📥 Getting workflow details...\n');
  const getResult = await client.callTool({
    name: 'workflow_manager',
    arguments: { action: 'get', id: WORKFLOW_ID }
  });

  const getData = JSON.parse(getResult.content[0].text);
  if (!getData.success) {
    console.log('❌ Failed:', getData.error);
    await transport.close();
    return;
  }

  const workflow = getData.data;

  console.log(`Found ${workflow.nodes.length} nodes:\n`);

  // Analyze each node
  for (const node of workflow.nodes) {
    console.log(`Node: ${node.name}`);
    console.log(`  Type: ${node.type}`);
    console.log(`  TypeVersion: ${node.typeVersion}`);
    console.log(`  Parameters keys: ${Object.keys(node.parameters || {}).join(', ')}`);

    // Check for problematic parameters
    if (node.parameters) {
      for (const [key, value] of Object.entries(node.parameters)) {
        if (value === undefined || value === null) {
          console.log(`  ⚠️  WARNING: Parameter "${key}" is ${value}`);
        }
        if (typeof value === 'object' && !Array.isArray(value)) {
          console.log(`  ℹ️  Parameter "${key}" is an object with keys: ${Object.keys(value).join(', ')}`);
        }
      }
    }
    console.log();
  }

  // Save full workflow for inspection
  fs.writeFileSync('workflow-full-details.json', JSON.stringify(workflow, null, 2));
  console.log('✅ Saved full workflow to workflow-full-details.json');

  await transport.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
