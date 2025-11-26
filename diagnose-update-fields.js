const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function main() {
  console.log('🔍 DIAGNOSING UPDATE FIELD ISSUE VIA MCP SERVER\n');

  const client = new Client({ name: 'diagnostic-agent', version: '1.0.0' });
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

  // First, get the current workflow
  console.log('📥 Getting current workflow...\n');
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

  const current = getData.data;
  console.log('📊 Current workflow has these fields:', Object.keys(current).join(', '));
  console.log();

  // Build correct connections
  const correctConnections = {
    '🌐 API Webhook': { 'main': [[{ 'node': '🧠 Smart Request Router', 'type': 'main', 'index': 0 }]] },
    '▶️ Manual Test': { 'main': [[{ 'node': '🧠 Smart Request Router', 'type': 'main', 'index': 0 }]] },
    '🧠 Smart Request Router': { 'main': [[{ 'node': '🚦 Request Dispatcher', 'type': 'main', 'index': 0 }]] },
    '🚦 Request Dispatcher': {
      'main': [
        [{ 'node': '📧 Microsoft Graph Email Fetcher', 'type': 'main', 'index': 0 }],
        [{ 'node': '🤖 AI Chat Handler', 'type': 'main', 'index': 0 }]
      ]
    },
    '📧 Microsoft Graph Email Fetcher': { 'main': [[{ 'node': '🔍 Email Intelligence Processor', 'type': 'main', 'index': 0 }]] },
    '🔍 Email Intelligence Processor': { 'main': [[{ 'node': '📊 Final Response Formatter', 'type': 'main', 'index': 0 }]] },
    '🤖 AI Chat Handler': { 'main': [[{ 'node': '📊 Final Response Formatter', 'type': 'main', 'index': 0 }]] }
  };

  // TEST 1: Absolutely minimal - ONLY name, nodes, connections
  console.log('TEST 1: Absolutely minimal fields (name, nodes, connections)\n');
  const test1 = await client.callTool({
    name: 'workflow_manager',
    arguments: {
      action: 'update',
      id: WORKFLOW_ID,
      changes: {
        name: current.name,
        nodes: current.nodes,
        connections: correctConnections
      }
    }
  });

  const result1 = JSON.parse(test1.content[0].text);
  console.log('Result:', result1.success ? '✅ SUCCESS!' : '❌ FAILED');
  if (!result1.success) {
    console.log('Error:', result1.error);

    // TEST 2: Try with settings added
    console.log('\nTEST 2: With settings field\n');
    const test2 = await client.callTool({
      name: 'workflow_manager',
      arguments: {
        action: 'update',
        id: WORKFLOW_ID,
        changes: {
          name: current.name,
          nodes: current.nodes,
          connections: correctConnections,
          settings: current.settings || {}
        }
      }
    });

    const result2 = JSON.parse(test2.content[0].text);
    console.log('Result:', result2.success ? '✅ SUCCESS!' : '❌ FAILED');
    if (!result2.success) {
      console.log('Error:', result2.error);
      if (result2.details) {
        console.log('Details:', JSON.stringify(result2.details, null, 2));
      }
    } else {
      console.log('🎉 WORKFLOW FIXED! Settings field was needed.');
    }
  } else {
    console.log('🎉 WORKFLOW FIXED! Minimal fields worked!');
  }

  await transport.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
