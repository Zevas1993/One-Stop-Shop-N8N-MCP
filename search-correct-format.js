const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function searchForAgentNodes() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/consolidated-server.js'],
    env: { ...process.env }
  });

  const client = new Client({ name: 'search-agents', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  console.log('🔍 Searching for AI Agent nodes...\n');

  // Search for agent
  const result1 = await client.callTool({
    name: 'node_discovery',
    arguments: {
      action: 'search',
      query: 'agent',
      limit: 20
    }
  });

  console.log('📦 Agent nodes found:');
  const data1 = JSON.parse(result1.content[0].text);
  if (data1.success && data1.data.nodes) {
    data1.data.nodes.forEach(node => {
      console.log(`  - ${node.name} (${node.nodeType})`);
    });
  } else {
    console.log('  Error:', data1.error || 'No results');
  }
  console.log('');

  // Get info about the AI Agent node with CORRECT format
  console.log('📋 Getting info about AI Agent node (correct format)...\n');
  const result2 = await client.callTool({
    name: 'node_discovery',
    arguments: {
      action: 'get_info',
      nodeType: 'nodes-langchain.agent'  // CORRECT FORMAT!
    }
  });

  const data2 = JSON.parse(result2.content[0].text);
  if (data2.success) {
    console.log('✅ Node:', data2.data.name);
    console.log('Type:', data2.data.nodeType);
    console.log('Description:', data2.data.description);
    console.log('Properties:', data2.data.properties?.length || 0);
  } else {
    console.log('❌ Error:', data2.error);
  }

  await client.close();
}

searchForAgentNodes().catch(console.error);
