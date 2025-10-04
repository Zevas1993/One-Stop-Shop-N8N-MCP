const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function verifyWorkflow() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/consolidated-server.js'],
    env: {
      ...process.env,
      N8N_API_URL: 'http://localhost:5678',
      N8N_API_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmIwMjg4NC0zYjAyLTQ1MjEtOTg3NC04Zjc5MzBlYmUwZDIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzU5NDQwMDUwLCJleHAiOjE3OTA5NzYwNTA2ODd9.eBNrVVKAWefUc1L6ca2dO-LEDfu-HpqovuqHbHHEJjQ'
    }
  });

  const client = new Client({ name: 'verify-workflow', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  const result = await client.callTool({
    name: 'workflow_manager',
    arguments: {
      action: 'get',
      id: '3tiHPw5yRh1lyanL'
    }
  });

  const data = JSON.parse(result.content[0].text);
  if (data.success) {
    const workflow = data.data;
    console.log('🎯 Workflow: ' + workflow.name);
    console.log('');
    console.log('📦 Nodes (' + workflow.nodes.length + '):');
    workflow.nodes.forEach((node, i) => {
      console.log(`  ${i+1}. ${node.name} (${node.type})`);
    });
    console.log('');
    console.log('🔗 Connections:');
    Object.keys(workflow.connections).forEach(source => {
      const connections = workflow.connections[source].main[0] || [];
      connections.forEach(conn => {
        console.log(`  ${source} → ${conn.node}`);
      });
    });
  }

  await client.close();
}

verifyWorkflow().catch(console.error);
