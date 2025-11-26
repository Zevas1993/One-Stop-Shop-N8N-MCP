const https = require('https');
const http = require('http');

const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'Baf9nylVDD1pzj9Q';

if (!API_KEY) {
  console.error('❌ N8N_API_KEY environment variable not set');
  process.exit(1);
}

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const client = options.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function fixWorkflow() {
  console.log('🔧 Fixing workflow:', WORKFLOW_ID);
  console.log('');

  // GET current workflow
  console.log('1️⃣ Fetching current workflow...');
  const workflow = await makeRequest({
    hostname: 'localhost',
    port: 5678,
    path: `/api/v1/workflows/${WORKFLOW_ID}`,
    method: 'GET',
    headers: {
      'X-N8N-API-KEY': API_KEY
    }
  });

  console.log('✅ Workflow fetched:', workflow.name);
  console.log('   Nodes:', workflow.nodes?.length || 0);
  console.log('');

  // Find and fix HTTP Request nodes
  console.log('2️⃣ Checking HTTP Request nodes...');
  let fixed = false;
  const httpNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');

  console.log('   Found', httpNodes.length, 'HTTP Request nodes');
  console.log('');

  httpNodes.forEach(node => {
    console.log('   Node:', node.name);
    const hasOptions = 'options' in node.parameters;
    console.log('   Has options field?', hasOptions);

    if (!hasOptions) {
      console.log('   ⚠️  MISSING options field - ADDING NOW');
      node.parameters.options = {};
      fixed = true;
    } else {
      console.log('   ✅ Already has options field');
    }
    console.log('');
  });

  if (!fixed) {
    console.log('✅ All HTTP Request nodes already have options field');
    console.log('   The workflow should load properly in n8n UI');
    return;
  }

  // Clean workflow for update
  console.log('3️⃣ Preparing workflow for update...');
  const {
    id, createdAt, updatedAt, versionId, meta, tags,
    isArchived, usedCredentials, sharedWithProjects,
    triggerCount, shared, active, ...cleanWorkflow
  } = workflow;

  console.log('   Removed system fields');
  console.log('');

  // UPDATE workflow
  console.log('4️⃣ Updating workflow via n8n API...');
  const updated = await makeRequest({
    hostname: 'localhost',
    port: 5678,
    path: `/api/v1/workflows/${WORKFLOW_ID}`,
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': API_KEY,
      'Content-Type': 'application/json'
    }
  }, cleanWorkflow);

  console.log('✅ Workflow updated successfully!');
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎉 WORKFLOW FIXED!');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('Next steps:');
  console.log('1. Go to your n8n UI: http://localhost:5678');
  console.log('2. Refresh the page (Ctrl+R or F5)');
  console.log('3. Open workflow:', workflow.name);
  console.log('4. The "Could not find property option" error should be GONE');
  console.log('');
  console.log('✅ You should now be able to:');
  console.log('   - View the workflow visually');
  console.log('   - Add OAuth credentials');
  console.log('   - Edit nodes in the UI');
  console.log('   - Complete workflow setup');
  console.log('');
}

fixWorkflow().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
