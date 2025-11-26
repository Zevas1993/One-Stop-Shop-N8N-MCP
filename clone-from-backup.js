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
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║      CLONING FROM BACKUP TO NEW WORKFLOW              ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // Read the backup
    console.log('📂 Reading backup file...');
    const backupJson = fs.readFileSync('workflow-backup-before-deletion.json', 'utf8');
    const backupWorkflow = JSON.parse(backupJson);
    console.log('✅ Backup loaded\n');

    // Clean it
    console.log('🧹 Cleaning workflow for new creation...');
    const forbiddenFields = [
      'id', 'createdAt', 'updatedAt', 'versionId', 'active',
      'tags', 'isArchived', 'triggerCount', 'shared', 'meta', 'pinData',
      'description', 'owner', 'views'
    ];

    const newWorkflow = {
      name: backupWorkflow.name + ' (RESTORED)',
      nodes: JSON.parse(JSON.stringify(backupWorkflow.nodes)),
      connections: JSON.parse(JSON.stringify(backupWorkflow.connections)),
      settings: backupWorkflow.settings || {},
      staticData: backupWorkflow.staticData || {}
    };

    forbiddenFields.forEach(field => {
      delete newWorkflow[field];
    });

    console.log('✅ Cleaned\n');

    // Create new workflow
    console.log('📤 Creating new workflow from backup...');
    const result = await makeRequest('POST', '/api/v1/workflows', newWorkflow);

    if (result.status === 200 || result.status === 201) {
      const response = JSON.parse(result.body);
      const created = response.data || response;

      console.log('✅ NEW WORKFLOW CREATED!\n');
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📋 Restored Workflow Details:`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`ID: ${created.id}`);
      console.log(`Name: ${created.name}`);
      console.log(`Nodes: ${created.nodes.length}`);
      console.log(`Connections: ${Object.keys(created.connections).length}`);
      console.log(`Version: ${created.versionId}`);
      console.log(`Created: ${created.createdAt}\n`);

      console.log('🎯 TRY THIS IN n8n UI:');
      console.log(`http://localhost:5678/workflow/${created.id}\n`);

      // Save the info
      fs.writeFileSync('restored-workflow-info.json', JSON.stringify({
        newId: created.id,
        name: created.name,
        nodeCount: created.nodes.length,
        connectionCount: Object.keys(created.connections).length,
        createdAt: new Date().toISOString()
      }, null, 2));

      console.log('✅ Saved to restored-workflow-info.json');

    } else {
      console.log(`❌ Creation failed: ${result.status}`);
      console.log(result.body.substring(0, 500));
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
