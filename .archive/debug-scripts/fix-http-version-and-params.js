const http = require('http');

const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q';
const WORKFLOW_ID = 'Baf9nylVDD1pzj9Q';

async function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5678,
      path: `/api/v1${path}`,
      method,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json'
      }
    }, (res) => {
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
  console.log('\n🔧 FIXING HTTP REQUEST NODES - VERSION & PARAMETERS\n');
  console.log('='.repeat(70));

  // Fetch workflow
  const workflow = await makeRequest(`/workflows/${WORKFLOW_ID}`);

  console.log(`\n✅ Fetched: "${workflow.name}"`);
  console.log(`   Nodes: ${workflow.nodes.length}\n`);

  let fixCount = 0;

  // Fix HTTP Request nodes
  workflow.nodes = workflow.nodes.map(node => {
    if (node.type === 'n8n-nodes-base.httpRequest') {
      console.log(`\n🔧 Fixing HTTP Request node: ${node.name}`);
      console.log(`   Current typeVersion: ${node.typeVersion}`);
      console.log(`   Current parameters: ${Object.keys(node.parameters).join(', ')}`);

      // Match the working workflow structure EXACTLY
      const fixed = {
        ...node,
        typeVersion: 4.2,  // ✅ Downgrade to working version
        parameters: {
          options: {}       // ✅ Strip ALL parameters except options
        }
      };

      console.log(`   New typeVersion: ${fixed.typeVersion}`);
      console.log(`   New parameters: ${Object.keys(fixed.parameters).join(', ')}`);

      fixCount++;
      return fixed;
    }
    return node;
  });

  if (fixCount === 0) {
    console.log('\n✅ No HTTP Request nodes found!\n');
    return;
  }

  console.log(`\n\n📊 Fixed ${fixCount} HTTP Request nodes`);
  console.log('   - Downgraded typeVersion: 5 → 4.2');
  console.log('   - Stripped parameters to match working workflow\n');

  // Remove read-only fields
  console.log('🧹 Removing read-only fields...');
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

  // Update via API
  console.log('\n📤 Updating workflow via API...\n');
  const result = await makeRequest(`/workflows/${WORKFLOW_ID}`, 'PUT', workflow);

  if (result.id) {
    console.log('✅ SUCCESS! Workflow updated!');
    console.log(`   New versionId: ${result.versionId}`);
    console.log(`   Updated at: ${result.updatedAt}\n`);
    console.log('🎯 Next step: Hard refresh n8n UI (Ctrl+Shift+R) and check if workflow loads!\n');
  } else {
    console.log('❌ Update failed:');
    console.log(JSON.stringify(result, null, 2));
  }
}

fixWorkflow().catch(console.error);
