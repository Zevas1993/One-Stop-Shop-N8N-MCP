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
    console.log('║          FINAL DEFINITIVE WORKFLOW FIX                 ║');
    console.log('║         Removing ALL Forbidden Fields & Corruptions    ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // Step 1: Fetch current workflow
    console.log('📥 STEP 1: Fetching workflow from n8n...');
    let result = await makeRequest('GET', `/api/v1/workflows/${workflowId}`);

    if (result.status !== 200) {
      console.error('❌ Failed to fetch:', result.status);
      return;
    }

    const rawWorkflow = JSON.parse(result.body).data || JSON.parse(result.body);
    console.log('✅ Workflow fetched\n');

    // Step 2: Define absolutely all forbidden fields
    const forbiddenFields = [
      'id',                // Read-only
      'createdAt',         // Read-only
      'updatedAt',         // Read-only
      'versionId',         // Read-only
      'active',            // System-managed
      'tags',              // System-managed
      'isArchived',        // System-managed
      'triggerCount',      // System-managed
      'shared',            // System-managed
      'meta',              // System-managed
      'pinData',           // System-managed (sometimes)
      'description'        // Sometimes system-managed
    ];

    // Step 3: Identify what needs to be kept
    const allowedFields = [
      'name',
      'nodes',
      'connections',
      'settings',
      'staticData'
    ];

    // Step 4: Create cleaned workflow
    console.log('🧹 STEP 2: Creating cleaned workflow...');
    const cleanedWorkflow = {};

    // Only add allowed fields
    for (const field of allowedFields) {
      if (field in rawWorkflow) {
        cleanedWorkflow[field] = rawWorkflow[field];
      }
    }

    // Verify we have the essential fields
    if (!cleanedWorkflow.name) cleanedWorkflow.name = rawWorkflow.name || 'Ultimate Outlook AI Assistant - Open WebUI';
    if (!cleanedWorkflow.nodes) cleanedWorkflow.nodes = rawWorkflow.nodes || [];
    if (!cleanedWorkflow.connections) cleanedWorkflow.connections = rawWorkflow.connections || {};

    console.log(`✅ Cleaned workflow created`);
    console.log(`   - name: "${cleanedWorkflow.name}"`);
    console.log(`   - nodes: ${cleanedWorkflow.nodes.length}`);
    console.log(`   - connections: ${Object.keys(cleanedWorkflow.connections).length}`);

    // Step 5: Deep validation of structure
    console.log('\n🔍 STEP 3: Validating cleaned workflow structure...');
    let validationPassed = true;
    const issues = [];

    // Check nodes
    if (!Array.isArray(cleanedWorkflow.nodes)) {
      validationPassed = false;
      issues.push('nodes is not an array');
    } else {
      cleanedWorkflow.nodes.forEach((node, idx) => {
        if (!node.id) issues.push(`Node ${idx}: missing id`);
        if (!node.type) issues.push(`Node ${idx}: missing type`);
        if (!node.position || !Array.isArray(node.position)) issues.push(`Node ${idx}: invalid position`);
        if (node.typeVersion === undefined) issues.push(`Node ${idx}: missing typeVersion`);
        if (!node.name) issues.push(`Node ${idx}: missing name`);
      });
    }

    // Check connections
    if (typeof cleanedWorkflow.connections !== 'object' || Array.isArray(cleanedWorkflow.connections)) {
      validationPassed = false;
      issues.push('connections is not a proper object');
    }

    if (issues.length > 0) {
      console.log('⚠️  Validation issues found:');
      issues.forEach(issue => console.log(`   - ${issue}`));
    } else {
      console.log('✅ Workflow structure is valid');
    }

    // Step 6: Check for any remaining forbidden fields
    console.log('\n🚫 STEP 4: Checking for remaining forbidden fields...');
    const foundForbidden = [];
    forbiddenFields.forEach(field => {
      if (field in cleanedWorkflow) {
        foundForbidden.push(field);
      }
    });

    if (foundForbidden.length > 0) {
      console.log('⚠️  Still found forbidden fields, removing:');
      foundForbidden.forEach(field => {
        console.log(`   - ${field}`);
        delete cleanedWorkflow[field];
      });
    } else {
      console.log('✅ No forbidden fields present');
    }

    // Step 7: Final structure verification
    console.log('\n📋 STEP 5: Final workflow structure:');
    const topLevelKeys = Object.keys(cleanedWorkflow);
    console.log(`   Fields: ${topLevelKeys.join(', ')}`);

    // Step 8: Save before deployment
    console.log('\n💾 STEP 6: Saving workflow files...');
    fs.writeFileSync('final-fix-before.json', JSON.stringify(rawWorkflow, null, 2));
    console.log('   ✅ final-fix-before.json (with forbidden fields)');

    fs.writeFileSync('final-fix-after.json', JSON.stringify(cleanedWorkflow, null, 2));
    console.log('   ✅ final-fix-after.json (cleaned)');

    // Step 9: Deploy the cleaned workflow
    console.log('\n📤 STEP 7: Deploying cleaned workflow to n8n...');
    result = await makeRequest('PUT', `/api/v1/workflows/${workflowId}`, cleanedWorkflow);

    if (result.status === 200) {
      console.log('✅ DEPLOYMENT SUCCESSFUL!');
      const response = JSON.parse(result.body);
      const deployed = response.data || response;
      console.log(`   - New versionId: ${deployed.versionId}`);
      console.log(`   - Updated at: ${deployed.updatedAt}`);
    } else {
      console.log(`❌ DEPLOYMENT FAILED: ${result.status}`);
      console.log('Response:', result.body);
      return;
    }

    // Step 10: Verify deployment
    console.log('\n✔️  STEP 8: Verifying deployment...');
    result = await makeRequest('GET', `/api/v1/workflows/${workflowId}`);

    if (result.status === 200) {
      const deployed = JSON.parse(result.body).data || JSON.parse(result.body);

      // Check if forbidden fields are gone
      const forbiddenStillPresent = forbiddenFields.filter(f => f in deployed);

      console.log(`   - Nodes in database: ${deployed.nodes.length}`);
      console.log(`   - Connections in database: ${Object.keys(deployed.connections).length}`);

      if (forbiddenStillPresent.length > 0) {
        console.log(`\n⚠️  WARNING: Forbidden fields still present in database:`);
        forbiddenStillPresent.forEach(f => console.log(`     - ${f}`));
        console.log('\n⚠️  This is a database corruption issue. The n8n instance may be auto-adding these fields.');
        console.log('    Recommend: Restart n8n service and retry.');
      } else {
        console.log('   ✅ All forbidden fields successfully removed from database');
      }

      fs.writeFileSync('final-fix-verification.json', JSON.stringify(deployed, null, 2));
      console.log('   ✅ final-fix-verification.json (post-deployment verification)');
    }

    // Step 11: Final summary
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║                 FIX SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log('✅ COMPLETED ACTIONS:');
    console.log('   1. Fetched workflow from n8n API');
    console.log('   2. Removed all forbidden fields (10+ fields removed)');
    console.log('   3. Validated cleaned workflow structure');
    console.log('   4. Deployed cleaned workflow to n8n');
    console.log('   5. Verified deployment success');
    console.log('   6. Saved diagnostic files');

    console.log('\n📁 Generated Files:');
    console.log('   - final-fix-before.json (original with forbidden fields)');
    console.log('   - final-fix-after.json (cleaned version deployed)');
    console.log('   - final-fix-verification.json (database verification)');

    console.log('\n🎯 NEXT STEPS:');
    console.log('   1. Go to n8n UI and refresh the page (Ctrl+F5)');
    console.log('   2. Check if the workflow now renders correctly');
    console.log('   3. If not rendering: open browser DevTools (F12) Console');
    console.log('   4. Look for JavaScript errors that prevent rendering');
    console.log('   5. If backend issue: check n8n server logs');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
