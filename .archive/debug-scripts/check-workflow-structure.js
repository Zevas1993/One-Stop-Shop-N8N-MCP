const http = require('http');

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
    console.log('Fetching workflow...');
    const result = await makeRequest('GET', `/api/v1/workflows/${workflowId}`);

    if (result.status !== 200) {
      console.error('❌ Failed to fetch workflow:', result.status);
      console.error(result.data);
      return;
    }

    const workflow = result.data.data;

    console.log('\n=== WORKFLOW STRUCTURE ANALYSIS ===\n');

    // Check basic structure
    console.log('Top-level properties:', Object.keys(workflow).sort());

    // Check nodes
    const nodeCount = workflow.nodes ? workflow.nodes.length : 0;
    console.log(`\nTotal nodes: ${nodeCount}`);
    if (workflow.nodes && workflow.nodes.length > 0) {
      console.log('First node structure:');
      console.log(JSON.stringify(workflow.nodes[0], null, 2));
    }

    // Check connections
    const connCount = workflow.connections ? Object.keys(workflow.connections).length : 0;
    console.log(`\nTotal connection objects: ${connCount}`);
    if (workflow.connections) {
      const connKeys = Object.keys(workflow.connections);
      if (connKeys.length > 0) {
        console.log(`Sample connection (${connKeys[0]}):`);
        console.log(JSON.stringify(workflow.connections[connKeys[0]], null, 2));
      }
    }

    // Check for issues
    console.log('\n=== POTENTIAL ISSUES ===\n');

    if (!workflow.nodes) {
      console.log('❌ Missing "nodes" property');
    } else if (!Array.isArray(workflow.nodes)) {
      console.log('❌ "nodes" is not an array:', typeof workflow.nodes);
    }

    if (!workflow.connections) {
      console.log('❌ Missing "connections" property');
    } else if (typeof workflow.connections !== 'object' || Array.isArray(workflow.connections)) {
      console.log('❌ "connections" is not an object:', typeof workflow.connections);
    }

    // Check node properties
    if (workflow.nodes) {
      workflow.nodes.forEach((node, idx) => {
        if (!node.id) console.log(`⚠️  Node ${idx} missing "id"`);
        if (!node.type) console.log(`⚠️  Node ${idx} (${node.name}) missing "type"`);
        if (!node.position) console.log(`⚠️  Node ${idx} (${node.name}) missing "position"`);
        if (node.position && !Array.isArray(node.position)) {
          console.log(`⚠️  Node ${idx} (${node.name}) position is not array:`, typeof node.position);
        }
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
