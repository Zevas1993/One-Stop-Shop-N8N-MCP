/**
 * Fix workflow by cleaning and re-saving
 */

require('dotenv').config();
const { N8nApiClient } = require('./dist/services/n8n-api-client');
const fs = require('fs');
const path = require('path');

/**
 * Clean workflow for update - remove read-only fields
 */
function cleanWorkflowForUpdate(workflow) {
  const cleaned = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings || {},
    staticData: workflow.staticData || null,
  };

  // Add optional fields if they exist
  if (workflow.pinData) cleaned.pinData = workflow.pinData;
  if (workflow.meta) cleaned.meta = workflow.meta;

  return cleaned;
}

async function fixWorkflow() {
  console.log('=== Fixing Outlook AI Assistant Workflow ===\n');

  const workflowId = '2dTTm6g4qFmcTob1';

  try {
    // Initialize client
    const client = new N8nApiClient({
      baseUrl: process.env.N8N_API_URL,
      apiKey: process.env.N8N_API_KEY
    });

    console.log('1. Fetching current workflow...');
    const response = await client.client.get(`/workflows/${workflowId}`);
    const workflow = response.data.data || response.data;

    console.log(`   ✓ Workflow: "${workflow.name}"`);
    console.log(`   ✓ Nodes: ${workflow.nodes.length}`);
    console.log(`   ✓ Connections: ${Object.keys(workflow.connections || {}).length}\n`);

    // Check if workflow is already rendering
    console.log('2. Analyzing current state:');

    // Check for common issues
    const issues = [];

    // Check for nodes without positions
    const noPosition = workflow.nodes.filter(n =>
      !n.position || !Array.isArray(n.position) || n.position.length !== 2
    );
    if (noPosition.length > 0) {
      issues.push(`${noPosition.length} nodes without valid position`);
    }

    // Check for nodes without typeVersion
    const noTypeVersion = workflow.nodes.filter(n => !n.typeVersion);
    if (noTypeVersion.length > 0) {
      issues.push(`${noTypeVersion.length} nodes without typeVersion`);
    }

    // Check connection count
    let connCount = 0;
    const connections = workflow.connections || {};
    for (const [source, outputs] of Object.entries(connections)) {
      if (outputs.main && Array.isArray(outputs.main)) {
        outputs.main.forEach(connArray => {
          if (Array.isArray(connArray)) {
            connCount += connArray.length;
          }
        });
      }
    }

    if (workflow.nodes.length > 1 && connCount === 0) {
      issues.push('Multi-node workflow with no connections');
    }

    if (issues.length === 0) {
      console.log('   ✓ No structural issues found');
      console.log('   ℹ️  Workflow appears structurally sound\n');

      console.log('3. Checking if workflow needs cleaning...');
      // Check for read-only fields
      const readOnlyFields = ['id', 'createdAt', 'updatedAt', 'active', 'isArchived',
                               'versionId', 'triggerCount', 'shared', 'tags'];
      const hasReadOnly = readOnlyFields.some(field => workflow.hasOwnProperty(field));

      if (hasReadOnly) {
        console.log('   ⚠️  Found read-only fields - will clean and re-save\n');

        // Clean the workflow
        const cleaned = cleanWorkflowForUpdate(workflow);

        console.log('4. Updating workflow with cleaned data...');
        console.log(`   Cleaned workflow size: ${JSON.stringify(cleaned).length} bytes`);

        // Save cleaned version
        const updateResponse = await client.client.put(`/workflows/${workflowId}`, cleaned);
        const updated = updateResponse.data.data || updateResponse.data;

        console.log('   ✓ Workflow updated successfully');
        console.log(`   ✓ New version ID: ${updated.versionId || 'N/A'}\n`);

        console.log('5. Verifying update...');
        const verifyResponse = await client.client.get(`/workflows/${workflowId}`);
        const verified = verifyResponse.data.data || verifyResponse.data;

        console.log(`   ✓ Nodes: ${verified.nodes.length}`);
        console.log(`   ✓ Connections: ${Object.keys(verified.connections || {}).length}`);
        console.log(`   ✓ All nodes have positions: ${verified.nodes.every(n => n.position)}`);

        console.log('\n✅ Workflow has been cleaned and updated!');
        console.log('   Please check the n8n UI - the workflow should now render correctly.\n');

      } else {
        console.log('   ✓ No read-only fields found\n');
        console.log('ℹ️  Workflow is already clean - no update needed.');
        console.log('   If the workflow still doesn\'t render, the issue may be in the n8n frontend.\n');
      }

    } else {
      console.log(`   ❌ Found ${issues.length} issue(s):`);
      issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
      console.log('\n   These issues may prevent the workflow from rendering properly.');
      console.log('   Consider fixing these issues before re-saving.\n');
    }

    // Save analysis
    const outputPath = path.join(__dirname, 'outlook-workflow-fixed.json');
    fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));
    console.log(`📄 Current workflow saved to: ${outputPath}\n`);

  } catch (error) {
    console.error('\n❌ Error during fix:');
    console.error('   Message:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// Run fix
fixWorkflow()
  .then(() => {
    console.log('=== Fix Complete ===');
  })
  .catch(error => {
    console.error('\nFatal error:', error);
    process.exit(1);
  });
