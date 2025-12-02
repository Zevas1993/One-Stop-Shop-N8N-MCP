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
      headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function fix() {
  console.log('\n🔧 UPGRADING SWITCH NODE TO v3.2 (WORKING VERSION)\n');
  
  const workflow = await makeRequest(`/workflows/${WORKFLOW_ID}`);
  
  workflow.nodes = workflow.nodes.map(node => {
    if (node.type === 'n8n-nodes-base.switch') {
      console.log(`Found Switch: ${node.name}`);
      console.log(`  Old typeVersion: ${node.typeVersion}`);
      console.log(`  Old structure: v1 format with conditions.string`);
      
      // Convert v1 rules to v3.2 format
      const newNode = {
        ...node,
        typeVersion: 3.2,
        parameters: {
          rules: {
            values: [
              {
                conditions: {
                  options: {
                    caseSensitive: true,
                    leftValue: "",
                    typeValidation: "strict",
                    version: 2
                  },
                  conditions: [
                    {
                      leftValue: "={{ $json.requestType }}",
                      rightValue: "chat",
                      operator: {
                        type: "string",
                        operation: "equals"
                      },
                      id: "cond1"
                    }
                  ],
                  combinator: "and"
                }
              },
              {
                conditions: {
                  options: {
                    caseSensitive: true,
                    leftValue: "",
                    typeValidation: "strict",
                    version: 2
                  },
                  conditions: [
                    {
                      leftValue: "={{ $json.requestType }}",
                      rightValue: "auto_process",
                      operator: {
                        type: "string",
                        operation: "equals"
                      },
                      id: "cond2"
                    }
                  ],
                  combinator: "and"
                }
              }
            ]
          },
          options: {}
        }
      };
      
      console.log(`  New typeVersion: 3.2`);
      console.log(`  New structure: v3.2 format with conditions array + options\n`);
      
      return newNode;
    }
    return node;
  });

  // Clean workflow
  delete workflow.id; delete workflow.createdAt; delete workflow.updatedAt;
  delete workflow.versionId; delete workflow.meta; delete workflow.tags;
  delete workflow.isArchived; delete workflow.usedCredentials;
  delete workflow.sharedWithProjects; delete workflow.triggerCount;
  delete workflow.shared; delete workflow.active;
  if (workflow.pinData === null) delete workflow.pinData;

  console.log('📤 Updating workflow...\n');
  const result = await makeRequest(`/workflows/${WORKFLOW_ID}`, 'PUT', workflow);

  if (result.id) {
    console.log('✅ SUCCESS! Switch node upgraded to v3.2');
    console.log(`   New versionId: ${result.versionId}`);
    console.log(`   Updated at: ${result.updatedAt}\n`);
    console.log('🎯 Hard refresh n8n UI (Ctrl+Shift+R) and test!\n');
  } else {
    console.log('❌ Failed:', JSON.stringify(result, null, 2));
  }
}

fix().catch(console.error);
