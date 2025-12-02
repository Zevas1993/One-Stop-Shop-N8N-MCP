/**
 * Direct workflow analysis using N8nApiClient
 */

require('dotenv').config();
const { N8nApiClient } = require('./dist/services/n8n-api-client');
const { WorkflowValidator } = require('./dist/services/workflow-validator');
const fs = require('fs');
const path = require('path');

async function analyzeWorkflow() {
  console.log('=== Outlook AI Assistant Workflow Analysis ===\n');

  const workflowId = '2dTTm6g4qFmcTob1';

  try {
    // Initialize client
    const client = new N8nApiClient({
      baseUrl: process.env.N8N_API_URL,
      apiKey: process.env.N8N_API_KEY
    });

    console.log('1. Fetching workflow from n8n...');
    const response = await client.client.get(`/workflows/${workflowId}`);
    const workflow = response.data.data || response.data;

    console.log(`   ✓ Workflow: "${workflow.name}"`);
    console.log(`   ✓ Nodes: ${workflow.nodes.length}`);
    console.log(`   ✓ Active: ${workflow.active}\n`);

    // Display nodes
    console.log('2. Nodes in workflow:');
    workflow.nodes.forEach(node => {
      const posInfo = node.position ? `[${node.position[0]}, ${node.position[1]}]` : '[NO POSITION]';
      console.log(`   - ${node.name} (${node.type}) ${posInfo}`);
    });
    console.log('');

    // Check connections
    console.log('3. Analyzing connections:');
    const connections = workflow.connections || {};
    console.log(`   Connection object keys: ${Object.keys(connections).length}`);

    let totalConnections = 0;
    for (const [sourceName, outputs] of Object.entries(connections)) {
      if (outputs.main && Array.isArray(outputs.main)) {
        outputs.main.forEach((connArray, index) => {
          if (Array.isArray(connArray)) {
            totalConnections += connArray.length;
            connArray.forEach(conn => {
              console.log(`   ${sourceName} [${index}] → ${conn.node}`);
            });
          }
        });
      }
    }
    console.log(`   Total connections: ${totalConnections}\n`);

    // Run validation
    console.log('4. Running workflow validation:');
    const validator = new WorkflowValidator();
    const result = await validator.validateWorkflow(workflow, {
      checkNodeTypes: true,
      checkConnections: true,
      checkExpressions: false,
      profile: 'production'
    });

    console.log(`   Valid: ${result.valid}`);

    if (!result.valid && result.errors) {
      console.log(`\n   ❌ Errors found (${result.errors.length}):`);
      result.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err.type}: ${err.message}`);
        if (err.node) console.log(`      Node: ${err.node}`);
        if (err.field) console.log(`      Field: ${err.field}`);
      });
    }

    if (result.warnings && result.warnings.length > 0) {
      console.log(`\n   ⚠️  Warnings (${result.warnings.length}):`);
      result.warnings.forEach((warn, i) => {
        console.log(`   ${i + 1}. ${warn.type}: ${warn.message}`);
        if (warn.node) console.log(`      Node: ${warn.node}`);
      });
    }

    // Check for rendering issues
    console.log('\n5. Checking for UI rendering issues:');

    // Missing positions
    const noPosition = workflow.nodes.filter(n =>
      !n.position || !Array.isArray(n.position) || n.position.length !== 2
    );
    if (noPosition.length > 0) {
      console.log(`   ❌ ${noPosition.length} nodes without valid position:`);
      noPosition.forEach(n => console.log(`      - ${n.name}`));
    } else {
      console.log(`   ✓ All nodes have positions`);
    }

    // Missing typeVersion
    const noTypeVersion = workflow.nodes.filter(n => !n.typeVersion);
    if (noTypeVersion.length > 0) {
      console.log(`   ❌ ${noTypeVersion.length} nodes without typeVersion:`);
      noTypeVersion.forEach(n => console.log(`      - ${n.name} (${n.type})`));
    } else {
      console.log(`   ✓ All nodes have typeVersion`);
    }

    // Disconnected nodes check
    if (workflow.nodes.length > 1 && totalConnections === 0) {
      console.log(`   ❌ CRITICAL: Multi-node workflow with NO connections!`);
      console.log(`      This causes nodes to show with question marks in UI`);
    } else if (workflow.nodes.length > 1) {
      console.log(`   ✓ Workflow has connections`);
    }

    // Invalid connection references
    const nodeNames = new Set(workflow.nodes.map(n => n.name));
    let brokenConnections = [];

    for (const [sourceName, outputs] of Object.entries(connections)) {
      if (!nodeNames.has(sourceName)) {
        brokenConnections.push(`Source "${sourceName}" doesn't exist`);
      }
      if (outputs.main) {
        outputs.main.forEach(connArray => {
          if (Array.isArray(connArray)) {
            connArray.forEach(conn => {
              if (!nodeNames.has(conn.node)) {
                brokenConnections.push(`${sourceName} → "${conn.node}" (target missing)`);
              }
            });
          }
        });
      }
    }

    if (brokenConnections.length > 0) {
      console.log(`   ❌ ${brokenConnections.length} broken connection(s):`);
      brokenConnections.forEach(msg => console.log(`      - ${msg}`));
    } else {
      console.log(`   ✓ All connection references are valid`);
    }

    // Save for inspection
    const outputPath = path.join(__dirname, 'outlook-workflow-analysis.json');
    fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));
    console.log(`\n6. Full workflow saved to: ${outputPath}`);

    console.log('\n=== Analysis Complete ===\n');

    // Return summary
    return {
      valid: result.valid,
      errors: result.errors || [],
      warnings: result.warnings || [],
      issues: {
        noPosition: noPosition.length,
        noTypeVersion: noTypeVersion.length,
        noConnections: workflow.nodes.length > 1 && totalConnections === 0,
        brokenConnections: brokenConnections.length
      }
    };

  } catch (error) {
    console.error('\n❌ Error during analysis:');
    console.error('   Message:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    throw error;
  }
}

// Run analysis
analyzeWorkflow()
  .then(summary => {
    console.log('\nSummary:');
    console.log(`  Valid: ${summary.valid}`);
    console.log(`  Errors: ${summary.errors.length}`);
    console.log(`  Warnings: ${summary.warnings.length}`);
    console.log(`  Issues: ${JSON.stringify(summary.issues, null, 2)}`);
  })
  .catch(error => {
    console.error('\nFatal error:', error);
    process.exit(1);
  });
