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

  console.log('🔍 Searching for AI Agent and LangChain nodes...\n');

  // Search for agent
  const result1 = await client.callTool({
    name: 'node_discovery',
    arguments: {
      action: 'search',
      query: 'agent',
      limit: 30
    }
  });

  console.log('📦 Agent nodes found:');
  const data1 = JSON.parse(result1.content[0].text);
  if (data1.results && data1.results.length > 0) {
    data1.results.forEach(node => {
      console.log(`  - ${node.name} (${node.nodeType})`);
    });
    console.log(`\nTotal: ${data1.totalCount} nodes`);
  } else {
    console.log('  Error:', data1.error || 'No results');
  }
  console.log('');

  // Get info about the AI Agent node (use correct nodeType format)
  console.log('📋 Getting info about AI Agent node...\n');
  const result2 = await client.callTool({
    name: 'node_discovery',
    arguments: {
      action: 'get_info',
      nodeType: 'nodes-langchain.agent'  // Correct format without package prefix
    }
  });

  const data2 = JSON.parse(result2.content[0].text);
  // The response is the node essentials directly, not wrapped in {success, data}
  if (data2.name) {
    console.log('Node:', data2.name);
    console.log('Type:', data2.nodeType);
    console.log('Description:', data2.description);
    console.log('Properties:', data2.properties?.length || 0);
  } else if (data2.error) {
    console.log('Error:', data2.error);
  } else {
    console.log('Unexpected response format:', data2);
  }

  await client.close();
}

searchForAgentNodes().catch(console.error);
