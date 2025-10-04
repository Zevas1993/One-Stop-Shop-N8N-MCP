const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');

async function testGetWorkflow() {
  // Load environment variables from .env
  require('dotenv').config();

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/consolidated-server.js'],
    env: process.env  // Use all environment variables including N8N_API_URL and N8N_API_KEY
  });

  const client = new Client({ name: 'test-get', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  console.log('Testing workflow_manager get action...\n');

  const result = await client.callTool({
    name: 'workflow_manager',
    arguments: {
      action: 'get',
      id: '3tiHPw5yRh1lyanL'
    }
  });

  console.log('RAW RESPONSE:');
  console.log(JSON.stringify(result, null, 2));

  const data = JSON.parse(result.content[0].text);
  console.log('\nPARSED DATA:');
  console.log(JSON.stringify(data, null, 2));

  fs.writeFileSync('workflow-get-response.json', JSON.stringify(data, null, 2));
  console.log('\n✅ Response saved to workflow-get-response.json');

  await client.close();
}

testGetWorkflow().catch(console.error);
