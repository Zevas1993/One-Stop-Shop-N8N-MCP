const https = require('https');
const http = require('http');

const N8N_API_URL = 'http://localhost:5678/api/v1';
const N8N_API_KEY = process.env.N8N_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q';
const WORKFLOW_ID = 'Baf9nylVDD1pzj9Q';

async function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5678,
      path: `/api/v1${path}`,  // Add /api/v1 prefix
      method,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function fixWorkflow() {
  console.log(`\n🔧 Fixing workflow ${WORKFLOW_ID}...`);
  console.log('='

.repeat(60));

  // Step 1: Fetch current workflow
  console.log('\n📥 Fetching workflow...');
  const workflow = await makeRequest(`/workflows/${WORKFLOW_ID}`);

  // Debug: Check what we got
  if (!workflow || !workflow.nodes) {
    console.log('\n❌ Failed to fetch workflow or invalid response:');
    console.log(JSON.stringify(workflow, null, 2));
    return;
  }

  console.log(`✅ Fetched: "${workflow.name}"`);
  console.log(`   Nodes: ${workflow.nodes.length}`);

  // Step 2: Check current state
  console.log('\n🔍 Checking node credentials...');
  const nodesWithoutCredentials = workflow.nodes.filter(n => !n.credentials);
  const nodesWithEmptyCredentials = workflow.nodes.filter(n =>
    n.credentials && Object.keys(n.credentials).length === 0
  );

  console.log(`   Nodes WITHOUT credentials field: ${nodesWithoutCredentials.length}`);
  console.log(`   Nodes WITH empty credentials {}: ${nodesWithEmptyCredentials.length}`);

  if (nodesWithoutCredentials.length === 0) {
    console.log('\n✅ All nodes already have credentials field!');
    console.log('   The issue might be something else...');
    return;
  }

  // Step 3: ADD credentials: {} to ALL nodes that don't have it
  console.log('\n🔨 Adding credentials: {} to nodes...');
  workflow.nodes = workflow.nodes.map(node => {
    if (!node.credentials) {
      console.log(`   ✅ Adding to: ${node.name}`);
      return {
        ...node,
        credentials: {}
      };
    }
    return node;
  });

  // Step 4: Remove read-only fields
  console.log('\n🧹 Removing read-only fields...');
  delete workflow.id;
  delete workflow.createdAt;
  delete workflow.updatedAt;
  delete workflow.versionId;
  delete workflow.meta;
  delete workflow.tags;
  delete workflow.isArchived;
  delete workflow.usedCredentials;
  delete workflow.sharedWithProjects;
  delete workflow.triggerCount;
  delete workflow.shared;
  delete workflow.active;
  if (workflow.pinData === null) delete workflow.pinData;

  // Step 5: Update via API
  console.log('\n📤 Updating workflow via API...');
  try {
    const result = await makeRequest(`/workflows/${WORKFLOW_ID}`, 'PUT', workflow);

    if (result.id) {
      console.log('\n✅ SUCCESS! Workflow updated!');
      console.log(`   New versionId: ${result.versionId}`);
      console.log(`   Updated at: ${result.updatedAt}`);
      console.log('\n🎯 Next step: Hard refresh n8n UI (Ctrl+Shift+R) and check if workflow loads!');
    } else {
      console.log('\n❌ Update failed:');
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('\n❌ Error updating workflow:');
    console.log(error.message);
  }
}

// Run the fix
fixWorkflow().catch(console.error);
