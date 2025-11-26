const http = require('http');

const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q';
const WORKFLOW_ID = 'Baf9nylVDD1pzj9Q';

async function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5678,
      path: `/api/v1${path}`,
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

async function diagnoseWorkflow() {
  console.log('\n🔍 DIAGNOSING PARAMETER ISSUES...\n');
  console.log('='.repeat(60));

  const workflow = await makeRequest(`/workflows/${WORKFLOW_ID}`);

  if (!workflow || !workflow.nodes) {
    console.log('❌ Failed to fetch workflow');
    return;
  }

  console.log(`\n✅ Workflow: "${workflow.name}"`);
  console.log(`   Nodes: ${workflow.nodes.length}\n`);

  let hasIssues = false;

  // Check each node's parameters
  for (const node of workflow.nodes) {
    console.log(`\n📦 Node: ${node.name}`);
    console.log(`   Type: ${node.type}`);
    console.log(`   TypeVersion: ${node.typeVersion}`);

    // Check parameters
    if (!node.parameters || Object.keys(node.parameters).length === 0) {
      console.log('   ⚠️  WARNING: Node has EMPTY parameters!');
      hasIssues = true;
    } else {
      console.log(`   Parameters: ${Object.keys(node.parameters).join(', ')}`);

      // Check for suspicious parameter structures
      for (const [key, value] of Object.entries(node.parameters)) {
        if (value && typeof value === 'object') {
          if (Array.isArray(value) && value.length === 0) {
            console.log(`   ⚠️  Empty array parameter: ${key}`);
          } else if (!Array.isArray(value) && Object.keys(value).length === 0) {
            console.log(`   ⚠️  Empty object parameter: ${key}`);
          }
        }
      }
    }

    // Check credentials
    if (!node.credentials) {
      console.log('   ❌ MISSING credentials field!');
      hasIssues = true;
    } else {
      console.log(`   ✅ Has credentials: ${Object.keys(node.credentials).length} entries`);
    }
  }

  if (!hasIssues) {
    console.log('\n✅ No obvious parameter issues found!');
    console.log('\n💡 The issue might be in the parameter VALUES themselves.');
    console.log('   Saving full workflow to "workflow-params-debug.json" for inspection...\n');

    const fs = require('fs');
    fs.writeFileSync('workflow-params-debug.json', JSON.stringify(workflow, null, 2));
    console.log('✅ Saved to workflow-params-debug.json');
  } else {
    console.log('\n❌ Found parameter issues! See warnings above.');
  }
}

diagnoseWorkflow().catch(console.error);
