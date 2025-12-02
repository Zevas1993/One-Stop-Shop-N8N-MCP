/**
 * Test script to analyze and fix the Outlook AI Assistant workflow
 * Workflow ID: 2dTTm6g4qFmcTob1
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const { N8nManagerService } = require('./dist/services/n8n-manager-service');
const { WorkflowValidator } = require('./dist/services/workflow-validator');

async function analyzeWorkflow() {
  console.log('=== Workflow Analysis and Fix ===\n');

  const workflowId = '2dTTm6g4qFmcTob1';

  try {
    // Initialize services
    const n8nService = new N8nManagerService(
      process.env.N8N_API_URL,
      process.env.N8N_API_KEY
    );

    console.log('1. Fetching workflow from n8n instance...');
    const workflow = await n8nService.getWorkflow(workflowId);
    console.log(`   ✓ Workflow: "${workflow.name}"`);
    console.log(`   ✓ Nodes: ${workflow.nodes.length}`);
    console.log(`   ✓ Active: ${workflow.active}\n`);

    // Display node summary
    console.log('2. Node Summary:');
    workflow.nodes.forEach(node => {
      console.log(`   - ${node.name} (${node.type})`);
    });
    console.log('');

    // Check for connection structure
    console.log('3. Connection Analysis:');
    const connections = workflow.connections || {};
    const connectionCount = Object.keys(connections).length;
    console.log(`   ✓ Connection objects: ${connectionCount}`);

    // Check each node's connections
    let totalConnections = 0;
    for (const [nodeName, outputs] of Object.entries(connections)) {
      if (outputs.main && Array.isArray(outputs.main)) {
        outputs.main.forEach((connArray, index) => {
          if (Array.isArray(connArray)) {
            totalConnections += connArray.length;
            console.log(`   - ${nodeName} [output ${index}]: ${connArray.length} connection(s)`);
          }
        });
      }
    }
    console.log(`   ✓ Total connections: ${totalConnections}\n`);

    // Validate workflow structure
    console.log('4. Running Workflow Validation...');
    const validator = new WorkflowValidator();
    const validationResult = await validator.validateWorkflow(workflow, {
      checkNodeTypes: true,
      checkConnections: true,
      checkExpressions: true,
      profile: 'strict'
    });

    console.log(`   Valid: ${validationResult.valid}`);

    if (!validationResult.valid) {
      console.log('\n   Validation Errors:');
      validationResult.errors.forEach((error, i) => {
        console.log(`   ${i + 1}. ${error.type}: ${error.message}`);
        if (error.field) console.log(`      Field: ${error.field}`);
        if (error.node) console.log(`      Node: ${error.node}`);
      });
    }

    if (validationResult.warnings && validationResult.warnings.length > 0) {
      console.log('\n   Validation Warnings:');
      validationResult.warnings.forEach((warning, i) => {
        console.log(`   ${i + 1}. ${warning.type}: ${warning.message}`);
        if (warning.node) console.log(`      Node: ${warning.node}`);
      });
    }

    // Check for common rendering issues
    console.log('\n5. Checking for Common Rendering Issues:');

    // Check for nodes without positions
    const nodesWithoutPosition = workflow.nodes.filter(node =>
      !node.position || typeof node.position[0] !== 'number' || typeof node.position[1] !== 'number'
    );
    console.log(`   - Nodes without valid position: ${nodesWithoutPosition.length}`);
    if (nodesWithoutPosition.length > 0) {
      nodesWithoutPosition.forEach(node => {
        console.log(`     * ${node.name}: ${JSON.stringify(node.position)}`);
      });
    }

    // Check for missing typeVersion
    const nodesWithoutTypeVersion = workflow.nodes.filter(node => !node.typeVersion);
    console.log(`   - Nodes without typeVersion: ${nodesWithoutTypeVersion.length}`);
    if (nodesWithoutTypeVersion.length > 0) {
      nodesWithoutTypeVersion.forEach(node => {
        console.log(`     * ${node.name} (${node.type})`);
      });
    }

    // Check for invalid connection references
    console.log(`   - Checking connection references...`);
    const nodeNames = new Set(workflow.nodes.map(n => n.name));
    let invalidConnections = [];

    for (const [sourceName, outputs] of Object.entries(connections)) {
      if (!nodeNames.has(sourceName)) {
        invalidConnections.push(`Source node "${sourceName}" doesn't exist`);
      }
      if (outputs.main) {
        outputs.main.forEach((connArray, outputIndex) => {
          if (Array.isArray(connArray)) {
            connArray.forEach((conn, connIndex) => {
              if (!nodeNames.has(conn.node)) {
                invalidConnections.push(`${sourceName} -> "${conn.node}" (target doesn't exist)`);
              }
            });
          }
        });
      }
    }

    if (invalidConnections.length > 0) {
      console.log(`   ✗ Invalid connections found: ${invalidConnections.length}`);
      invalidConnections.forEach(msg => console.log(`     * ${msg}`));
    } else {
      console.log(`   ✓ All connection references are valid`);
    }

    // Check for empty connections object on multi-node workflows
    if (workflow.nodes.length > 1 && totalConnections === 0) {
      console.log(`   ✗ CRITICAL: Multi-node workflow with no connections!`);
      console.log(`     This will cause nodes to appear disconnected (question marks)`);
    }

    // Display workflow JSON structure
    console.log('\n6. Workflow Structure Overview:');
    console.log(`   - Has settings: ${!!workflow.settings}`);
    console.log(`   - Has staticData: ${!!workflow.staticData}`);
    console.log(`   - Has tags: ${!!workflow.tags}`);
    console.log(`   - Pinned data nodes: ${workflow.nodes.filter(n => n.pinnedData).length}`);

    // Save workflow to file for inspection
    const fs = require('fs');
    const outputPath = path.join(__dirname, 'workflow-analysis.json');
    fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));
    console.log(`\n7. Full workflow saved to: ${outputPath}`);

    console.log('\n=== Analysis Complete ===');

  } catch (error) {
    console.error('\n✗ Error during analysis:', error.message);
    if (error.response) {
      console.error('   API Response:', error.response.status, error.response.statusText);
      console.error('   Details:', error.response.data);
    }
    console.error('\n   Stack:', error.stack);
  }
}

// Run the analysis
analyzeWorkflow().catch(console.error);
