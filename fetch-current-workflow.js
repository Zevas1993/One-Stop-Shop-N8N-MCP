const http = require('http');
const fs = require('fs');

const n8nUrl = process.env.N8N_API_URL || 'http://localhost:5678';
const apiKey = process.env.N8N_API_KEY;
const workflowId = '2dTTm6g4qFmcTob1';

function makeRequest(method, path) {
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
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    console.log('Fetching workflow from n8n...');
    const result = await makeRequest('GET', `/api/v1/workflows/${workflowId}`);

    if (result.status !== 200) {
      console.error('Failed to fetch:', result.status);
      return;
    }

    // Get the workflow (handle both wrapped and unwrapped)
    const workflow = result.data.data || result.data;

    // Save the complete workflow
    fs.writeFileSync('current-workflow-state.json', JSON.stringify(workflow, null, 2));
    console.log('✅ Saved to current-workflow-state.json');

    // Quick analysis
    console.log(`\nWorkflow: ${workflow.name}`);
    console.log(`Nodes: ${workflow.nodes ? workflow.nodes.length : 0}`);
    console.log(`Connection objects: ${workflow.connections ? Object.keys(workflow.connections).length : 0}`);

    // Check for forbidden fields
    const forbidden = ['id', 'createdAt', 'updatedAt', 'versionId', 'active', 'tags', 'isArchived', 'triggerCount', 'shared', 'meta'];
    const found = forbidden.filter(f => f in workflow);
    if (found.length > 0) {
      console.log(`\n⚠️  Forbidden fields present: ${found.join(', ')}`);
    }

    // Check first node in detail
    if (workflow.nodes && workflow.nodes.length > 0) {
      const firstNode = workflow.nodes[0];
      console.log(`\nFirst node: ${firstNode.name}`);
      console.log(`  type: ${firstNode.type}`);
      console.log(`  typeVersion: ${firstNode.typeVersion}`);
      console.log(`  hasParameters: ${!!firstNode.parameters}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
