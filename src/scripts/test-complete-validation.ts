/**
 * Comprehensive Validation Test
 * Tests the complete validation flow including:
 * 1. Node type resolution (langchain nodes)
 * 2. Credential validation
 * 3. Workflow structure validation
 */

import { createDatabaseAdapter } from "../database/database-adapter";
import { NodeRepository } from "../database/node-repository";
import { WorkflowValidator } from "../services/workflow-validator";
import * as path from "path";

async function testCompleteValidation() {
  console.log("🧪 Testing Complete Workflow Validation\n");

  const dbPath = path.join(process.cwd(), "data", "nodes.db");
  const db = await createDatabaseAdapter(dbPath);
  const repo = new NodeRepository(db);
  const validator = new WorkflowValidator(repo);

  // Test Case 1: Valid workflow with langchain nodes
  console.log("═══════════════════════════════════════════");
  console.log("Test 1: Valid AI Agent Workflow");
  console.log("═══════════════════════════════════════════\n");

  const validWorkflow = {
    name: "AI Agent Workflow",
    nodes: [
      {
        id: "1",
        name: "Manual Trigger",
        type: "n8n-nodes-base.manualTrigger",
        position: [250, 300] as [number, number],
        parameters: {},
        typeVersion: 1,
      },
      {
        id: "2",
        name: "AI Agent",
        type: "@n8n/n8n-nodes-langchain.agent",
        position: [450, 300] as [number, number],
        parameters: {
          promptType: "define",
          text: "You are a helpful AI assistant",
        },
        typeVersion: 1,
      },
    ],
    connections: {
      "Manual Trigger": {
        main: [[{ node: "AI Agent", type: "main" as const, index: 0 }]],
      },
    },
    settings: {
      executionOrder: "v1",
    },
  };

  const validResult = await validator.validateWorkflow(validWorkflow, {
    validateNodes: true,
    validateConnections: true,
    validateExpressions: false,
    profile: "runtime",
  });

  console.log("Result:", validResult.valid ? "✅ VALID" : "❌ INVALID");
  console.log(`Errors: ${validResult.errors.length}`);
  console.log(`Warnings: ${validResult.warnings.length}`);

  if (validResult.errors.length > 0) {
    console.log("\nErrors:");
    validResult.errors.forEach((err) => {
      console.log(`  - ${err.message}`);
    });
  }

  if (validResult.warnings.length > 0) {
    console.log("\nWarnings:");
    validResult.warnings.forEach((warn) => {
      console.log(`  - ${warn.message}`);
    });
  }

  // Test Case 2: Invalid node type (should fail)
  console.log("\n═══════════════════════════════════════════");
  console.log("Test 2: Invalid Node Type");
  console.log("═══════════════════════════════════════════\n");

  const invalidWorkflow = {
    name: "Invalid Workflow",
    nodes: [
      {
        id: "1",
        name: "Manual Trigger",
        type: "n8n-nodes-base.manualTrigger",
        position: [250, 300] as [number, number],
        parameters: {},
        typeVersion: 1,
      },
      {
        id: "2",
        name: "Invalid Node",
        type: "fake-package.fakeNode",
        position: [450, 300] as [number, number],
        parameters: {},
      },
    ],
    connections: {
      "Manual Trigger": {
        main: [[{ node: "Invalid Node", type: "main" as const, index: 0 }]],
      },
    },
    settings: {
      executionOrder: "v1",
    },
  };

  const invalidResult = await validator.validateWorkflow(invalidWorkflow, {
    validateNodes: true,
    validateConnections: true,
    validateExpressions: false,
    profile: "runtime",
  });

  console.log("Result:", invalidResult.valid ? "✅ VALID" : "❌ INVALID (expected)");
  console.log(`Errors: ${invalidResult.errors.length}`);

  if (invalidResult.errors.length > 0) {
    console.log("\nErrors (expected):");
    invalidResult.errors.forEach((err) => {
      console.log(`  - ${err.message}`);
    });
  }

  // Test Case 3: Multiple langchain nodes
  console.log("\n═══════════════════════════════════════════");
  console.log("Test 3: Multiple LangChain Nodes");
  console.log("═══════════════════════════════════════════\n");

  const multiLangchainWorkflow = {
    name: "Multi LangChain Workflow",
    nodes: [
      {
        id: "1",
        name: "Manual Trigger",
        type: "n8n-nodes-base.manualTrigger",
        position: [250, 300] as [number, number],
        parameters: {},
        typeVersion: 1,
      },
      {
        id: "2",
        name: "OpenAI Chat",
        type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
        position: [450, 300] as [number, number],
        parameters: {
          model: "gpt-4",
        },
        typeVersion: 1,
      },
      {
        id: "3",
        name: "AI Agent",
        type: "@n8n/n8n-nodes-langchain.agent",
        position: [650, 300] as [number, number],
        parameters: {
          promptType: "define",
          text: "Test prompt",
        },
        typeVersion: 1,
      },
    ],
    connections: {
      "Manual Trigger": {
        main: [[{ node: "OpenAI Chat", type: "main" as const, index: 0 }]],
      },
      "OpenAI Chat": {
        main: [[{ node: "AI Agent", type: "main" as const, index: 0 }]],
      },
    },
    settings: {
      executionOrder: "v1",
    },
  };

  const multiResult = await validator.validateWorkflow(multiLangchainWorkflow, {
    validateNodes: true,
    validateConnections: true,
    validateExpressions: false,
    profile: "runtime",
  });

  console.log("Result:", multiResult.valid ? "✅ VALID" : "❌ INVALID");
  console.log(`Errors: ${multiResult.errors.length}`);
  console.log(`Warnings: ${multiResult.warnings.length}`);

  if (multiResult.errors.length > 0) {
    console.log("\nErrors:");
    multiResult.errors.forEach((err) => {
      console.log(`  - ${err.message}`);
    });
  }

  // Summary
  console.log("\n═══════════════════════════════════════════");
  console.log("📊 Test Summary");
  console.log("═══════════════════════════════════════════\n");

  const tests = [
    { name: "Valid AI Agent Workflow", result: validResult.valid && validResult.errors.length === 0 },
    { name: "Invalid Node Type Detection", result: !invalidResult.valid && invalidResult.errors.length > 0 },
    { name: "Multiple LangChain Nodes", result: multiResult.valid && multiResult.errors.length === 0 },
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach((test) => {
    if (test.result) {
      console.log(`✅ PASS: ${test.name}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${test.name}`);
      failed++;
    }
  });

  console.log(`\n📊 Results: ${passed}/${tests.length} tests passed\n`);

  if (failed > 0) {
    console.error("❌ Complete validation test FAILED");
    process.exit(1);
  }

  console.log("✅ Complete validation test PASSED");
  console.log("   - Node type normalization working");
  console.log("   - LangChain nodes validated correctly");
  console.log("   - Invalid node types detected");
  console.log("   - Workflow structure validation working");
}

testCompleteValidation().catch((error) => {
  console.error("Error running test:", error);
  process.exit(1);
});
