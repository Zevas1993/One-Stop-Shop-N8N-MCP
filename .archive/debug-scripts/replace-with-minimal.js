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

async function replaceWithMinimal() {
  console.log('\n🔧 REPLACING WITH MINIMAL WORKING WORKFLOW\n');
  console.log('='.repeat(70));
  console.log('\n💡 Strategy: Use structure from working workflow\n');

  // Create a minimal workflow that EXACTLY matches the working workflow structure
  const minimalWorkflow = {
    name: "🎯 Ultimate AI Outlook Assistant - Proper Nodes",
    nodes: [
      {
        id: "manual_trigger",
        name: "When clicking 'Test workflow'",
        type: "n8n-nodes-base.manualTrigger",
        position: [250, 300],
        parameters: {},
        typeVersion: 1
      },
      {
        id: "code_node",
        name: "Code",
        type: "n8n-nodes-base.code",
        position: [450, 300],
        parameters: {
          jsCode: "return [{json: {message: 'Hello from fixed workflow!'}}];"
        },
        typeVersion: 2
      }
    ],
    connections: {
      "When clicking 'Test workflow'": {
        main: [[{ node: "Code", type: "main", index: 0 }]]
      }
    },
    settings: {
      executionOrder: "v1",
      saveDataErrorExecution: "all",
      saveDataSuccessExecution: "all",
      saveManualExecutions: true,
      saveExecutionProgress: true
    }
  };

  console.log('📝 Minimal workflow structure:');
  console.log(`   Nodes: ${minimalWorkflow.nodes.length}`);
  console.log(`   - ${minimalWorkflow.nodes[0].name} (${minimalWorkflow.nodes[0].type})`);
  console.log(`   - ${minimalWorkflow.nodes[1].name} (${minimalWorkflow.nodes[1].type})`);
  console.log(`   Connections: ${Object.keys(minimalWorkflow.connections).length}`);

  console.log('\n📤 Updating workflow...\n');
  const result = await makeRequest(`/workflows/${WORKFLOW_ID}`, 'PUT', minimalWorkflow);

  if (result.id) {
    console.log('✅ SUCCESS! Minimal workflow created!');
    console.log(`   New versionId: ${result.versionId}`);
    console.log(`   Updated at: ${result.updatedAt}\n`);
    console.log('🎯 Next step: Hard refresh n8n UI (Ctrl+Shift+R)');
    console.log('   If this loads, we know the issue is in the original workflow structure\n');
  } else {
    console.log('❌ Update failed:');
    console.log(JSON.stringify(result, null, 2));
  }
}

replaceWithMinimal().catch(console.error);
