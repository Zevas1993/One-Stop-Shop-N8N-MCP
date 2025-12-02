const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');

async function main() {
  console.log('🔍 CHECKING WORKFLOW STATUS VIA MCP\n');

  const client = new Client({ name: 'checker', version: '1.0.0' });
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
  if (!getData.success) {
    console.log('❌ Failed to get workflow:', getData.error);
    await transport.close();
    return;
  }

  const workflow = getData.data;

  console.log('📊 WORKFLOW STATUS:\n');
  console.log(`Name: ${workflow.name}`);
  console.log(`Nodes: ${workflow.nodes.length}`);
  console.log(`Active: ${workflow.active}`);
  console.log();

  // Check connections
  console.log('🔗 CONNECTIONS:');
  const connKeys = Object.keys(workflow.connections || {});
  console.log(`Total connection sources: ${connKeys.length}`);

  for (const sourceNode of connKeys) {
    const nodeExists = workflow.nodes.find(n => n.name === sourceNode);
    if (!nodeExists) {
      console.log(`❌ Source node "${sourceNode}" doesn't exist in nodes array!`);
    } else {
      const outputs = workflow.connections[sourceNode];
      for (const [outputType, outputArray] of Object.entries(outputs)) {
        for (let i = 0; i < outputArray.length; i++) {
          const connections = outputArray[i];
          for (const conn of connections) {
            const targetExists = workflow.nodes.find(n => n.name === conn.node);
            if (!targetExists) {
              console.log(`❌ "${sourceNode}" -> "${conn.node}" - TARGET DOESN'T EXIST!`);
            } else {
              console.log(`✅ "${sourceNode}" -> "${conn.node}"`);
            }
          }
        }
      }
    }
  }
  console.log();

  // Check each node for issues
  console.log('🔍 NODE ANALYSIS:');
  for (const node of workflow.nodes) {
    const issues = [];

    if (!node.name) issues.push('Missing name');
    if (!node.type) issues.push('Missing type');
    if (node.typeVersion === undefined) issues.push('Missing typeVersion');
    if (!node.position || node.position.length !== 2) issues.push('Invalid position');

    // Check if node type exists
    if (node.type && node.type.includes('.')) {
      // Valid node type format
    } else {
      issues.push('Invalid type format');
    }

    if (issues.length > 0) {
      console.log(`❌ ${node.name}: ${issues.join(', ')}`);
    } else {
      console.log(`✅ ${node.name} (${node.type})`);
    }
  }

  // Save current state
  fs.writeFileSync('current-workflow-state.json', JSON.stringify(workflow, null, 2));
  console.log('\n✅ Saved current state to current-workflow-state.json');

  await transport.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
