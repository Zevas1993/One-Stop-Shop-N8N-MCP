const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function main() {
  console.log('🔧 FIXING SWITCH NODE VIA MCP\n');

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

  // Get current workflow
  const getResult = await client.callTool({
    name: 'workflow_manager',
    arguments: { action: 'get', id: WORKFLOW_ID }
  });

  const getData = JSON.parse(getResult.content[0].text);
  const workflow = getData.data;

  // Find and fix the Switch node
  const switchNode = workflow.nodes.find(n => n.type === 'n8n-nodes-base.switch');
  console.log('Current Switch node parameters:');
  console.log(JSON.stringify(switchNode.parameters, null, 2));
  console.log();

  // Add missing 'operation' field to each condition
  const fixedParameters = {
    rules: {
      values: [
        {
          conditions: {
            string: [
              {
                value1: '={{ $json.requestType }}',
                value2: 'chat',
                operation: 'equals'  // ADD THIS
              }
            ]
          }
        },
        {
          conditions: {
            string: [
              {
                value1: '={{ $json.requestType }}',
                value2: 'auto_process',
                operation: 'equals'  // ADD THIS
              }
            ]
          }
        }
      ]
    }
  };

  console.log('Fixed Switch node parameters:');
  console.log(JSON.stringify(fixedParameters, null, 2));
  console.log();

  // Update just the Switch node
  switchNode.parameters = fixedParameters;

  // Update the workflow
  console.log('📤 Updating workflow via MCP...\n');
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
    console.log('🎉 SWITCH NODE FIXED!');
    console.log('   Refresh n8n UI to see the fix');
  }

  await transport.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
