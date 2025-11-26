#!/usr/bin/env node

/**
 * Test Semantic Validation System
 *
 * This test creates workflows with different Code node patterns to verify
 * the WorkflowSemanticValidator is working correctly and providing proper
 * guidance to AI agents about using built-in nodes.
 */

import { config } from 'dotenv';
import { logger } from '../utils/logger';
import { NodeRepository } from '../database/node-repository';
import { WorkflowSemanticValidator } from '../services/workflow-semantic-validator';
import { createDatabaseAdapter } from '../database/database-adapter';

// Load environment variables
config();

interface TestWorkflow {
  name: string;
  nodes: any[];
  connections: any;
  expectedScore: 'high' | 'medium' | 'low';
  description: string;
}

const testWorkflows: TestWorkflow[] = [
  // Test 1: Good workflow - minimal Code nodes
  {
    name: 'Good Workflow - Built-in Nodes',
    description: 'Proper workflow using built-in nodes (should score HIGH)',
    expectedScore: 'high',
    nodes: [
      {
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {}
      },
      {
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [450, 300],
        parameters: {
          method: 'GET',
          url: 'https://api.example.com/data'
        }
      },
      {
        name: 'Set Fields',
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        position: [650, 300],
        parameters: {
          mode: 'manual',
          duplicateItem: false
        }
      }
    ],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]]
      },
      'HTTP Request': {
        main: [[{ node: 'Set Fields', type: 'main', index: 0 }]]
      }
    }
  },

  // Test 2: Too many Code nodes (should trigger warnings)
  {
    name: 'Bad Workflow - Too Many Code Nodes',
    description: 'Workflow with excessive Code nodes (should score LOW)',
    expectedScore: 'low',
    nodes: [
      {
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {}
      },
      {
        name: 'Code Node 1',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [450, 300],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: 'return items.map(item => ({ json: { step: 1 } }));'
        }
      },
      {
        name: 'Code Node 2',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [650, 300],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: 'return items.map(item => ({ json: { step: 2 } }));'
        }
      },
      {
        name: 'Code Node 3',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [850, 300],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: 'return items.map(item => ({ json: { step: 3 } }));'
        }
      }
    ],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'Code Node 1', type: 'main', index: 0 }]]
      },
      'Code Node 1': {
        main: [[{ node: 'Code Node 2', type: 'main', index: 0 }]]
      },
      'Code Node 2': {
        main: [[{ node: 'Code Node 3', type: 'main', index: 0 }]]
      }
    }
  },

  // Test 3: Code node with HTTP request (should suggest HTTP Request node)
  {
    name: 'Replaceable Code Node - HTTP',
    description: 'Code node doing HTTP request (should suggest n8n-nodes-base.httpRequest)',
    expectedScore: 'medium',
    nodes: [
      {
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {}
      },
      {
        name: 'Custom HTTP Code',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [450, 300],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: `
            const response = await fetch('https://api.github.com/repos/n8n-io/n8n');
            const data = await response.json();
            return [{ json: data }];
          `
        }
      }
    ],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'Custom HTTP Code', type: 'main', index: 0 }]]
      }
    }
  },

  // Test 4: Code node with data transformation (should suggest Set node)
  {
    name: 'Replaceable Code Node - Transform',
    description: 'Code node doing data transformation (should suggest n8n-nodes-base.set)',
    expectedScore: 'medium',
    nodes: [
      {
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {}
      },
      {
        name: 'Transform Data',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [450, 300],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: `
            return items.map(item => ({
              json: {
                fullName: item.json.firstName + ' ' + item.json.lastName,
                email: item.json.email.toLowerCase(),
                ...item.json
              }
            }));
          `
        }
      }
    ],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'Transform Data', type: 'main', index: 0 }]]
      }
    }
  },

  // Test 5: Code node with conditional logic (should suggest IF/Switch)
  {
    name: 'Replaceable Code Node - Conditional',
    description: 'Code node with conditional logic (should suggest n8n-nodes-base.if)',
    expectedScore: 'medium',
    nodes: [
      {
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [250, 300],
        parameters: {}
      },
      {
        name: 'Conditional Logic',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [450, 300],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: `
            return items.filter(item => {
              if (item.json.status === 'active') {
                return item.json.score > 80;
              } else if (item.json.status === 'pending') {
                return item.json.score > 60;
              } else {
                return false;
              }
            });
          `
        }
      }
    ],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'Conditional Logic', type: 'main', index: 0 }]]
      }
    }
  }
];

async function runTest() {
  console.log('🧪 Testing Workflow Semantic Validation System\n');
  console.log('='.repeat(80));

  // Initialize database and validator
  const dbPath = process.env.DB_PATH || './data/nodes.db';
  const db = await createDatabaseAdapter(dbPath);
  const repository = new NodeRepository(db);
  const validator = new WorkflowSemanticValidator(repository);

  let totalTests = 0;
  let passedTests = 0;

  for (const testCase of testWorkflows) {
    totalTests++;
    console.log(`\n📋 Test Case: ${testCase.name}`);
    console.log(`Description: ${testCase.description}`);
    console.log(`Expected Score: ${testCase.expectedScore.toUpperCase()}`);
    console.log('-'.repeat(80));

    try {
      // Run semantic validation
      const result = await validator.validateWorkflow(testCase);

      // Display results
      console.log(validator.getSummary(result));

      // Check if result matches expectations
      let expectedPassed = false;
      if (testCase.expectedScore === 'high' && result.score >= 80) {
        expectedPassed = true;
      } else if (testCase.expectedScore === 'medium' && result.score >= 40 && result.score < 80) {
        expectedPassed = true;
      } else if (testCase.expectedScore === 'low' && result.score < 40) {
        expectedPassed = true;
      }

      if (expectedPassed) {
        console.log(`\n✅ TEST PASSED - Score ${result.score}/100 matches expected range for "${testCase.expectedScore}"`);
        passedTests++;
      } else {
        console.log(`\n❌ TEST FAILED - Score ${result.score}/100 does NOT match expected range for "${testCase.expectedScore}"`);
        console.log(`Expected: ${testCase.expectedScore === 'high' ? '≥80' : testCase.expectedScore === 'medium' ? '40-79' : '<40'}`);
      }

    } catch (error) {
      console.error(`\n❌ TEST ERROR:`, error);
    }

    console.log('='.repeat(80));
  }

  // Summary
  console.log(`\n\n📊 Test Summary:`);
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

  if (passedTests === totalTests) {
    console.log(`\n✅ ALL TESTS PASSED! Semantic validation is working correctly.`);
    process.exit(0);
  } else {
    console.log(`\n⚠️  Some tests failed. Review the semantic validation logic.`);
    process.exit(1);
  }
}

// Run tests
runTest().catch(error => {
  logger.error('Test execution failed:', error);
  process.exit(1);
});
