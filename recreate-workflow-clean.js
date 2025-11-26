const http = require('http');
const fs = require('fs');

const n8nUrl = process.env.N8N_API_URL || 'http://localhost:5678';
const apiKey = process.env.N8N_API_KEY;
const workflowId = '2dTTm6g4qFmcTob1';

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
    console.log('║   LAST RESORT: DELETE AND RECREATE WORKFLOW CLEAN      ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // Step 1: Fetch current workflow
    console.log('📥 STEP 1: Fetching current workflow...');
    let result = await makeRequest('GET', `/api/v1/workflows/${workflowId}`);
    const workflow = JSON.parse(result.body).data || JSON.parse(result.body);
    console.log('✅ Fetched\n');

    // Step 2: Save backup
    console.log('💾 STEP 2: Saving backup...');
    fs.writeFileSync('workflow-backup-before-deletion.json', JSON.stringify(workflow, null, 2));
    console.log('✅ Backup saved\n');

    // Step 3: Delete the workflow
    console.log('🗑️  STEP 3: Deleting workflow from n8n...');
    result = await makeRequest('DELETE', `/api/v1/workflows/${workflowId}`);
    console.log(`Response status: ${result.status}`);
    if (result.status >= 200 && result.status < 300) {
      console.log('✅ Workflow deleted\n');
    } else {
      console.log('⚠️  Delete may have failed, continuing anyway...\n');
    }

    // Step 4: Clean the workflow
    console.log('🧹 STEP 4: Cleaning workflow for fresh creation...');
    const cleanedWorkflow = {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings || {},
      staticData: workflow.staticData || {}
    };

    // Remove ALL potential problematic fields
    const forbiddenFields = [
      'id', 'createdAt', 'updatedAt', 'versionId', 'active',
      'tags', 'isArchived', 'triggerCount', 'shared', 'meta', 'pinData',
      'description', 'owner', 'views'
    ];
    forbiddenFields.forEach(field => {
      delete cleanedWorkflow[field];
    });

    console.log('✅ Workflow cleaned\n');

    // Step 5: Recreate the workflow with POST
    console.log('📤 STEP 5: Recreating workflow with fresh POST...');
    result = await makeRequest('POST', '/api/v1/workflows', cleanedWorkflow);

    if (result.status === 200 || result.status === 201) {
      const response = JSON.parse(result.body);
      const created = response.data || response;
      console.log('✅ WORKFLOW RECREATED!');
      console.log(`   New ID: ${created.id}`);
      console.log(`   New versionId: ${created.versionId}`);
      console.log(`   Created at: ${created.createdAt}\n`);

      // Save the recreated workflow
      fs.writeFileSync('workflow-after-recreation.json', JSON.stringify(created, null, 2));

      // Step 6: Verify by fetching
      console.log('✔️  STEP 6: Verifying recreation...');
      result = await makeRequest('GET', `/api/v1/workflows/${created.id}`);

      if (result.status === 200) {
        const verified = JSON.parse(result.body).data || JSON.parse(result.body);
        console.log('✅ Verification successful!');
        console.log(`   Nodes: ${verified.nodes.length}`);
        console.log(`   Connections: ${Object.keys(verified.connections).length}`);

        fs.writeFileSync('workflow-verification.json', JSON.stringify(verified, null, 2));
      } else {
        console.log('❌ Verification failed');
      }
    } else {
      console.log(`❌ Recreation failed with status ${result.status}`);
      console.log('Response:', result.body);
      return;
    }

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║               ✅ RECREATION COMPLETE                   ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log('NEXT STEPS:');
    console.log('1. Go to n8n UI and refresh (Ctrl+F5)');
    console.log('2. The workflow should now render correctly');
    console.log('3. If it worked: The rendering issue was database corruption');
    console.log('4. If not: The issue is in the n8n frontend or environment');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
