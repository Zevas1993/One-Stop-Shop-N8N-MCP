const http = require('http');
const fs = require('fs');

const n8nUrl = process.env.N8N_API_URL || 'http://localhost:5678';
const apiKey = process.env.N8N_API_KEY;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(n8nUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path,
      method,
      headers: {
        'X-N8N-API-KEY': apiKey,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  try {
    console.log('Creating minimal test workflow with AI nodes...\n');

    // Create a very simple workflow with just 2 nodes
    const minimalWorkflow = {
      name: 'MINIMAL TEST - AI Agent Only',
      nodes: [
        {
          id: 'manual-trigger',
          name: 'Manual Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          position: [100, 100],
          parameters: {},
          typeVersion: 1
        },
        {
          id: 'agent-node',
          name: 'Simple Agent',
          type: '@n8n/n8n-nodes-langchain.agent',
          position: [300, 100],
          parameters: {
            text: 'Test message',
            promptType: 'define',
            options: {
              systemMessage: 'You are a test agent.'
            }
          },
          typeVersion: 1.7
        }
      ],
      connections: {
        'Manual Trigger': {
          main: [
            [
              {
                node: 'Simple Agent',
                type: 'main',
                index: 0
              }
            ]
          ]
        }
      },
      settings: {},
      staticData: {}
    };

    console.log('Creating workflow...');
    let result = await makeRequest('POST', '/api/v1/workflows', minimalWorkflow);

    if (result.status === 200 || result.status === 201) {
      const response = JSON.parse(result.body);
      const created = response.data || response;
      console.log(`✅ Created: ${created.id}`);
      console.log(`   Name: ${created.name}`);
      console.log(`   Nodes: ${created.nodes.length}`);

      // Try to fetch it back
      console.log('\nFetching workflow back...');
      result = await makeRequest('GET', `/api/v1/workflows/${created.id}`);

      if (result.status === 200) {
        const fetched = JSON.parse(result.body).data || JSON.parse(result.body);
        console.log(`✅ Fetched successfully`);
        console.log(`   Nodes: ${fetched.nodes.length}`);
        console.log(`   Connections: ${Object.keys(fetched.connections).length}`);

        console.log('\nTest workflow created! Try opening it in n8n UI:');
        console.log(`   ID: ${created.id}`);
        console.log('');
        console.log('If this minimal workflow renders, the issue is with your full workflow.');
        console.log('If this also fails, the problem is with the n8n UI itself.');
      }
    } else {
      console.log(`❌ Failed to create: ${result.status}`);
      console.log(result.body);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
