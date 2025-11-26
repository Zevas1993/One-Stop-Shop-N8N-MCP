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
    console.log('║        CREATING FRESH WORKFLOW FROM SCRATCH            ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // Read the original backup to get exact structure
    const backupJson = fs.readFileSync('workflow-backup-before-deletion.json', 'utf8');
    const originalWorkflow = JSON.parse(backupJson);

    console.log('📋 Building fresh workflow with exact same structure...\n');

    // Create the workflow with EXACT same structure
    const freshWorkflow = {
      name: 'Ultimate Outlook AI Assistant - Open WebUI (FRESH BUILD)',
      nodes: originalWorkflow.nodes.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type,
        position: node.position,
        parameters: JSON.parse(JSON.stringify(node.parameters || {})),
        typeVersion: node.typeVersion
      })),
      connections: JSON.parse(JSON.stringify(originalWorkflow.connections || {})),
      settings: originalWorkflow.settings ? JSON.parse(JSON.stringify(originalWorkflow.settings)) : {},
      staticData: originalWorkflow.staticData ? JSON.parse(JSON.stringify(originalWorkflow.staticData)) : {}
    };

    console.log(`Nodes: ${freshWorkflow.nodes.length}`);
    console.log(`Connections: ${Object.keys(freshWorkflow.connections).length}`);
    console.log(`Settings: ${JSON.stringify(freshWorkflow.settings)}`);
    console.log(`\n📤 Creating workflow via POST...\n`);

    const result = await makeRequest('POST', '/api/v1/workflows', freshWorkflow);

    if (result.status === 200 || result.status === 201) {
      const response = JSON.parse(result.body);
      const created = response.data || response;

      console.log('✅ FRESH WORKFLOW CREATED!\n');
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`ID: ${created.id}`);
      console.log(`Name: ${created.name}`);
      console.log(`Nodes: ${created.nodes.length}`);
      console.log(`Connections: ${Object.keys(created.connections).length}`);
      console.log(`Version: ${created.versionId}`);
      console.log(`Created: ${created.createdAt}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      console.log('🔗 OPEN IN n8n UI:');
      console.log(`http://localhost:5678/workflow/${created.id}\n`);

      fs.writeFileSync('fresh-workflow-info.json', JSON.stringify({
        id: created.id,
        name: created.name,
        nodeCount: created.nodes.length,
        connectionCount: Object.keys(created.connections).length,
        versionId: created.versionId,
        createdAt: created.createdAt,
        createdBy: 'fresh-build-script'
      }, null, 2));

      console.log('ℹ️  Info saved to fresh-workflow-info.json\n');
      console.log('If this workflow RENDERS, your original one was corrupt.');
      console.log('If this ALSO FAILS, n8n service needs restart.');

    } else {
      console.log(`❌ Creation failed: ${result.status}`);
      console.log(result.body.substring(0, 500));
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
