/**
 * Test Node Type Normalization Fix
 * Verifies that the NodeRepository can properly resolve node types
 * using various package prefix formats
 */

import { createDatabaseAdapter } from "../database/database-adapter";
import { NodeRepository } from "../database/node-repository";
import * as path from "path";

async function testNodeTypeNormalization() {
  console.log("🧪 Testing Node Type Normalization Fix\n");

  const dbPath = path.join(process.cwd(), "data", "nodes.db");
  const db = await createDatabaseAdapter(dbPath);
  const repo = new NodeRepository(db);

  // Test cases: workflow format → database format
  const testCases = [
    {
      workflowType: "@n8n/n8n-nodes-langchain.agent",
      databaseType: "nodes-langchain.agent",
      description: "LangChain AI Agent (scoped package)",
    },
    {
      workflowType: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      databaseType: "nodes-langchain.lmChatOpenAi",
      description: "OpenAI Chat Model (scoped package)",
    },
    {
      workflowType: "n8n-nodes-base.httpRequest",
      databaseType: "nodes-base.httpRequest",
      description: "HTTP Request (base package)",
    },
    {
      workflowType: "n8n-nodes-base.openAi",
      databaseType: "nodes-base.openAi",
      description: "OpenAI base node",
    },
    {
      workflowType: "@n8n/n8n-nodes-langchain.embeddingsOpenAi",
      databaseType: "nodes-langchain.embeddingsOpenAi",
      description: "OpenAI Embeddings",
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const nodeInfo = repo.getNodeByType(testCase.workflowType);

    if (nodeInfo) {
      console.log(`✅ PASS: ${testCase.description}`);
      console.log(`   Workflow type: ${testCase.workflowType}`);
      console.log(`   Found in DB as: ${nodeInfo.nodeType}`);
      console.log(`   Display name: ${nodeInfo.displayName}\n`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${testCase.description}`);
      console.log(`   Workflow type: ${testCase.workflowType}`);
      console.log(`   Expected DB type: ${testCase.databaseType}`);
      console.log(`   Result: NOT FOUND\n`);
      failed++;
    }
  }

  console.log("═══════════════════════════════════════════");
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════\n");

  if (failed > 0) {
    console.error("❌ Node type normalization test FAILED");
    process.exit(1);
  }

  console.log("✅ Node type normalization test PASSED");
  console.log("   All workflow node types can be resolved to database types");
}

testNodeTypeNormalization().catch((error) => {
  console.error("Error running test:", error);
  process.exit(1);
});
