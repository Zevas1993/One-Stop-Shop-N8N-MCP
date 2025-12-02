const http = require('http');
const fs = require('fs');

const n8nUrl = process.env.N8N_API_URL || 'http://localhost:5678';
const apiKey = process.env.N8N_API_KEY;
const sourceWorkflowId = '2dTTm6g4qFmcTob1';

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
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║      CLONING PROBLEMATIC WORKFLOW TO NEW ID            ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // Fetch the problematic workflow
    console.log(`📥 Fetching original workflow (${sourceWorkflowId})...`);
    let result = await makeRequest('GET', `/api/v1/workflows/${sourceWorkflowId}`);

    if (result.status !== 200) {
      console.error('❌ Failed to fetch source workflow:', result.status);
      return;
    }

    const sourceWorkflow = JSON.parse(result.body).data || JSON.parse(result.body);
    console.log('✅ Fetched\n');

    // Clean it
    console.log('🧹 Cleaning workflow for clone...');
    const forbiddenFields = [
      'id', 'createdAt', 'updatedAt', 'versionId', 'active',
      'tags', 'isArchived', 'triggerCount', 'shared', 'meta', 'pinData',
      'description', 'owner', 'views'
    ];

    const cloneWorkflow = {
      name: sourceWorkflow.name + ' (CLONED)',
      nodes: JSON.parse(JSON.stringify(sourceWorkflow.nodes)),
      connections: JSON.parse(JSON.stringify(sourceWorkflow.connections)),
      settings: sourceWorkflow.settings || {},
      staticData: sourceWorkflow.staticData || {}
    };

    forbiddenFields.forEach(field => {
      delete cloneWorkflow[field];
    });

    console.log('✅ Cleaned\n');

    // Create clone
    console.log('📤 Creating clone via API...');
    result = await makeRequest('POST', '/api/v1/workflows', cloneWorkflow);

    if (result.status === 200 || result.status === 201) {
      const response = JSON.parse(result.body);
      const cloned = response.data || response;

      console.log('✅ CLONE CREATED SUCCESSFULLY!\n');
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📋 Cloned Workflow Details:`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`ID: ${cloned.id}`);
      console.log(`Name: ${cloned.name}`);
      console.log(`Nodes: ${cloned.nodes.length}`);
      console.log(`Connections: ${Object.keys(cloned.connections).length}`);
      console.log(`Version: ${cloned.versionId}`);
      console.log(`Created: ${cloned.createdAt}\n`);

      console.log('🧪 TESTING: Try opening this in n8n UI:');
      console.log(`\nURL: http://localhost:5678/workflow/${cloned.id}\n`);

      console.log('If this clone renders correctly:');
      console.log('  ✅ The original workflow is corrupted in n8n\'s database');
      console.log('  ✅ This clone can be used as a replacement');
      console.log('\nIf this clone ALSO fails:');
      console.log('  ❌ There\'s a systematic issue with 21-node workflows');
      console.log('  ❌ n8n UI needs to be restarted\n');

      // Save the clone info
      fs.writeFileSync('cloned-workflow-info.json', JSON.stringify({
        sourceId: sourceWorkflowId,
        clonedId: cloned.id,
        clonedName: cloned.name,
        nodeCount: cloned.nodes.length,
        connectionCount: Object.keys(cloned.connections).length,
        createdAt: new Date().toISOString()
      }, null, 2));

      console.log('✅ Saved clone info to cloned-workflow-info.json');

    } else {
      console.log(`❌ Clone creation failed: ${result.status}`);
      console.log(result.body);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
