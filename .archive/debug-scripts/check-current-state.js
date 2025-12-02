const http = require('http');
const fs = require('fs');

const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q';
const WORKFLOW_ID = 'Baf9nylVDD1pzj9Q';

async function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5678,
      path: `/api/v1${path}`,
      headers: { 'X-N8N-API-KEY': N8N_API_KEY }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function checkState() {
  console.log('\n📋 CHECKING CURRENT WORKFLOW STATE\n');

  const workflow = await makeRequest(`/workflows/${WORKFLOW_ID}`);

  console.log(`Workflow: "${workflow.name}"`);
  console.log(`Version: ${workflow.versionId}`);
  console.log(`Updated: ${workflow.updatedAt}\n`);

  console.log('NODE CHECK:\n');

  workflow.nodes.forEach((node, i) => {
    console.log(`${i + 1}. ${node.name} (${node.type})`);
    console.log(`   typeVersion: ${node.typeVersion}`);
    console.log(`   credentials: ${node.credentials !== undefined ? JSON.stringify(node.credentials) : 'undefined'}`);
    console.log(`   parameters: ${Object.keys(node.parameters || {}).join(', ') || 'EMPTY'}`);

    // Check for problematic parameter structures
    if (node.type === 'n8n-nodes-base.switch' && node.parameters.rules) {
      console.log(`   ⚠️  Switch node - has rules with ${node.parameters.rules.values?.length || 0} conditions`);
    }

    if (node.type === 'n8n-nodes-base.httpRequest') {
      console.log(`   ℹ️  HTTP Request - parameters: ${JSON.stringify(node.parameters)}`);
    }

    console.log('');
  });

  // Save current state
  fs.writeFileSync('current-workflow-state.json', JSON.stringify(workflow, null, 2));
  console.log('📁 Saved current state to current-workflow-state.json\n');
}

checkState().catch(console.error);
