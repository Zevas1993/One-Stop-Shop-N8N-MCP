const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');

async function debugSearch() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/consolidated-server.js'],
    env: { ...process.env }
  });

  const client = new Client({ name: 'debug-search', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  console.log('🔍 Calling node_discovery with action=search...\n');

  const result = await client.callTool({
    name: 'node_discovery',
    arguments: {
      action: 'search',
      query: 'agent',
      limit: 30
    }
  });

  console.log('=== RAW RESPONSE ===');
  console.log(JSON.stringify(result, null, 2));
  console.log('\n=== PARSED TEXT ===');
  const data = JSON.parse(result.content[0].text);
  console.log(JSON.stringify(data, null, 2));

  // Write to file for detailed inspection
  fs.writeFileSync('debug-response.json', JSON.stringify({ raw: result, parsed: data }, null, 2));
  console.log('\n✅ Full response written to debug-response.json');

  await client.close();
}

debugSearch().catch(console.error);
