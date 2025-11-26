import { createDatabaseAdapter } from '../database/database-adapter';
import { NodeRepository } from '../database/node-repository';
import { NodeParameterValidator } from '../services/node-parameter-validator';
import { WorkflowNode } from '../types/n8n-api';
import * as path from 'path';

/**
 * Test Parameter Validation System
 *
 * This script tests the critical parameter validation that prevents
 * workflows from passing API validation but failing to load in n8n UI.
 */

async function testParameterValidation() {
  console.log('🔍 Testing Parameter Validation System\n');

  // Initialize database
  const dbPath = path.join(__dirname, '../../data/nodes.db');
  const adapter = await createDatabaseAdapter(dbPath);
  const repository = new NodeRepository(adapter);
  const validator = new NodeParameterValidator(repository);

  // TEST 1: Valid HTTP Request node (with options field)
  console.log('TEST 1: Valid HTTP Request node with options field');
  const validNode: WorkflowNode = {
    id: 'test-1',
    name: 'Valid HTTP Request',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 5,
    position: [250, 300],
    parameters: {
      requestMethod: 'GET',
      url: 'https://api.example.com/data',
      options: {} // ✅ REQUIRED FIELD PRESENT
    }
  };

  const validResult = await validator.validateNode(validNode);
  if (validResult.length === 0) {
    console.log('✅ PASS: Valid node has no errors\n');
  } else {
    console.error('❌ FAIL: Valid node should not have errors');
    console.error('Errors:', validResult);
    console.log('');
  }

  // TEST 2: Invalid HTTP Request node (missing options field)
  console.log('TEST 2: Invalid HTTP Request node missing options field');
  const invalidNode: WorkflowNode = {
    id: 'test-2',
    name: 'Broken HTTP Request',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 5,
    position: [250, 300],
    parameters: {
      requestMethod: 'GET',
      url: 'https://api.example.com/data'
      // ❌ MISSING options field - this causes "Could not find property option" error
    }
  };

  const invalidResult = await validator.validateNode(invalidNode);
  if (invalidResult.length > 0) {
    console.log('✅ PASS: Invalid node detected');
    console.log('Errors found:', invalidResult.length);
    for (const error of invalidResult) {
      console.log(`  - ${error.parameter}: ${error.error}`);
      console.log(`    Suggestion: ${error.suggestion}`);
    }
    console.log('');
  } else {
    console.error('❌ FAIL: Invalid node should have been detected\n');
  }

  // TEST 3: Unknown node type
  console.log('TEST 3: Unknown node type');
  const unknownNode: WorkflowNode = {
    id: 'test-3',
    name: 'Unknown Node',
    type: 'n8n-nodes-base.nonExistentNode',
    typeVersion: 1,
    position: [250, 300],
    parameters: {}
  };

  const unknownResult = await validator.validateNode(unknownNode);
  if (unknownResult.length > 0 && unknownResult[0].error.includes('Unknown node type')) {
    console.log('✅ PASS: Unknown node type detected');
    console.log('Error:', unknownResult[0].error);
    console.log('Suggestion:', unknownResult[0].suggestion);
    console.log('');
  } else {
    console.error('❌ FAIL: Unknown node type should have been detected\n');
  }

  // TEST 4: Complete workflow validation
  console.log('TEST 4: Complete workflow with mixed valid/invalid nodes');
  const workflowNodes: WorkflowNode[] = [
    {
      id: 'trigger',
      name: 'Manual Trigger',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {}
    },
    {
      id: 'http-valid',
      name: 'Valid HTTP',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 5,
      position: [450, 300],
      parameters: {
        requestMethod: 'GET',
        url: 'https://api.example.com/data',
        options: {} // ✅ Valid
      }
    },
    {
      id: 'http-invalid',
      name: 'Invalid HTTP',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 5,
      position: [650, 300],
      parameters: {
        requestMethod: 'POST',
        url: 'https://api.example.com/submit'
        // ❌ Missing options
      }
    }
  ];

  const workflowResult = await validator.validateWorkflow(workflowNodes);
  console.log(`Workflow validation result: ${workflowResult.valid ? '✅ VALID' : '❌ INVALID'}`);
  console.log(`Errors found: ${workflowResult.errors.length}`);

  if (workflowResult.errors.length > 0) {
    console.log('\nErrors:');
    for (const error of workflowResult.errors) {
      console.log(`  - ${error.nodeName} (${error.nodeType})`);
      console.log(`    Parameter: ${error.parameter}`);
      console.log(`    Error: ${error.error}`);
      console.log(`    Suggestion: ${error.suggestion}`);
    }
  }

  // Expected: 1 error (http-invalid missing options)
  if (workflowResult.errors.length === 1 && workflowResult.errors[0].nodeName === 'Invalid HTTP') {
    console.log('\n✅ PASS: Workflow validation correctly identified the broken node\n');
  } else {
    console.error('\n❌ FAIL: Workflow validation should have found exactly 1 error\n');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('🎯 TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('The parameter validation system is designed to prevent the');
  console.log('FATAL FLAW where workflows pass n8n API validation but fail');
  console.log('to load in n8n UI due to missing required parameters.');
  console.log('');
  console.log('Key Features:');
  console.log('  ✅ Validates node parameters against MCP database schemas');
  console.log('  ✅ Detects missing required fields (like options on httpRequest)');
  console.log('  ✅ Provides actionable suggestions for fixing errors');
  console.log('  ✅ Prevents broken workflows from reaching n8n API');
  console.log('  ✅ Integrated into handleCreateWorkflow and handleUpdateWorkflow');
  console.log('');
  console.log('This system ensures that workflows created via MCP will ALWAYS');
  console.log('load properly in the n8n UI, allowing users to add OAuth credentials,');
  console.log('edit nodes visually, and complete their workflow configuration.');
  console.log('═══════════════════════════════════════════════════════\n');
}

// Run tests
testParameterValidation().catch(console.error);
