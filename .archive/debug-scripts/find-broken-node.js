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

async function testNodeInIsolation(node) {
  // Create a minimal workflow with just this node and a trigger
  const testWorkflow = {
    name: `Test: ${node.name}`,
    nodes: [
      {
        id: 'trigger',
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        position: [100, 100],
        parameters: {},
        typeVersion: 1
      },
      {
        id: 'test-node',
        name: node.name,
        type: node.type,
        position: [300, 100],
        parameters: node.parameters || {},
        typeVersion: node.typeVersion || 1
      }
    ],
    connections: {
      'Manual Trigger': {
        main: [
          [
            {
              node: node.name,
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

  const result = await makeRequest('POST', '/api/v1/workflows', testWorkflow);

  if (result.status === 200 || result.status === 201) {
    const created = JSON.parse(result.body).data || JSON.parse(result.body);
    // Clean up
    await makeRequest('DELETE', `/api/v1/workflows/${created.id}`);
    return { status: 'OK', error: null };
  } else {
    return { status: 'FAILED', error: result.body };
  }
}

async function main() {
  try {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║       FINDING WHICH NODE IS BROKEN                     ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    const backupJson = fs.readFileSync('workflow-backup-before-deletion.json', 'utf8');
    const workflow = JSON.parse(backupJson);

    console.log(`Testing ${workflow.nodes.length} nodes individually...\n`);

    const results = [];

    for (const node of workflow.nodes) {
      process.stdout.write(`Testing: ${node.name} (${node.type})... `);

      const testResult = await testNodeInIsolation(node);

      if (testResult.status === 'OK') {
        console.log('✅');
        results.push({
          name: node.name,
          type: node.type,
          status: 'OK'
        });
      } else {
        console.log('❌');
        results.push({
          name: node.name,
          type: node.type,
          status: 'FAILED',
          error: testResult.error.substring(0, 200)
        });
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('RESULTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    const broken = results.filter(r => r.status === 'FAILED');
    const working = results.filter(r => r.status === 'OK');

    console.log(`✅ Working: ${working.length}`);
    working.forEach(r => console.log(`   ${r.name}`));

    if (broken.length > 0) {
      console.log(`\n❌ BROKEN: ${broken.length}`);
      broken.forEach(r => {
        console.log(`   ${r.name} (${r.type})`);
        if (r.error) {
          console.log(`      Error: ${r.error}`);
        }
      });

      console.log('\n🎯 CULPRIT FOUND!');
      console.log(`The following node(s) have configuration issues:`);
      broken.forEach(r => {
        console.log(`\n   Node: ${r.name}`);
        console.log(`   Type: ${r.type}`);
        console.log(`   Issue: Property definition missing or malformed`);
      });
    } else {
      console.log('\n✅ ALL NODES ARE WORKING!');
      console.log('The issue might be in the connections or overall structure.');
    }

    fs.writeFileSync('node-test-results.json', JSON.stringify(results, null, 2));
    console.log('\n✅ Results saved to node-test-results.json');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
