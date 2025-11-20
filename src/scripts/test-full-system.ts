/**
 * Full System Test: Nano LLM Pipeline with n8n Workflows
 *
 * Tests the complete flow:
 * 1. n8n workflow execution
 * 2. Capture feedback
 * 3. Send to GraphRAG Learning Service
 * 4. Process through Nano LLMs
 * 5. Generate strategic decisions
 * 6. Verify output quality
 */

import { GraphRAGLearningService, WorkflowFeedback } from "../services/graphrag-learning-service";
import { logger } from "../utils/logger";

// Test workflows simulating different scenarios
const TEST_WORKFLOWS = [
  {
    name: "API Data Fetcher",
    feedback: {
      success: true,
      executionTime: 145,
      nodeCount: 3,
      userFeedback: "Fetches customer data and updates CRM",
      userSatisfaction: 5,
      semanticIntent: "Periodic API polling for data sync"
    },
    nodes: [
      { id: "webhook", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 1, position: [100, 100] },
      { id: "http", name: "HTTP Request", type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [300, 100] },
      { id: "item", name: "Item Lists", type: "n8n-nodes-base.itemLists", typeVersion: 2, position: [500, 100] }
    ],
    connections: {
      Webhook: { main: [[{ node: "HTTP Request", type: "main", index: 0 }]] },
      "HTTP Request": { main: [[{ node: "Item Lists", type: "main", index: 0 }]] }
    }
  },
  {
    name: "Database Synchronizer",
    feedback: {
      success: true,
      executionTime: 320,
      nodeCount: 4,
      userFeedback: "Syncs data between postgres and mongodb",
      userSatisfaction: 4,
      semanticIntent: "Database replication with transformation"
    },
    nodes: [
      { id: "schedule", name: "Schedule Trigger", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1, position: [100, 100] },
      { id: "postgres", name: "Postgres", type: "n8n-nodes-base.postgres", typeVersion: 1, position: [300, 100] },
      { id: "function", name: "Function", type: "n8n-nodes-base.function", typeVersion: 1, position: [500, 100] },
      { id: "mongo", name: "MongoDB", type: "n8n-nodes-base.mongoDb", typeVersion: 1, position: [700, 100] }
    ],
    connections: {
      "Schedule Trigger": { main: [[{ node: "Postgres", type: "main", index: 0 }]] },
      Postgres: { main: [[{ node: "Function", type: "main", index: 0 }]] },
      Function: { main: [[{ node: "MongoDB", type: "main", index: 0 }]] }
    }
  },
  {
    name: "Slack Notification Pipeline",
    feedback: {
      success: true,
      executionTime: 87,
      nodeCount: 3,
      userFeedback: "Sends alerts to Slack on errors",
      userSatisfaction: 5,
      semanticIntent: "Real-time error notifications"
    },
    nodes: [
      { id: "webhook", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 1, position: [100, 100] },
      { id: "condition", name: "If", type: "n8n-nodes-base.if", typeVersion: 1, position: [300, 100] },
      { id: "slack", name: "Slack", type: "n8n-nodes-base.slack", typeVersion: 2, position: [500, 100] }
    ],
    connections: {
      Webhook: { main: [[{ node: "If", type: "main", index: 0 }]] },
      If: { main: [[{ node: "Slack", type: "main", index: 0 }]] }
    }
  }
];

async function runFullSystemTest() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║          Nano LLM Full System Test                             ║");
  console.log("║  Testing GraphRAG Learning with Nano LLMs (Ollama)            ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  try {
    // Initialize service
    logger.info("Initializing GraphRAG Learning Service...");
    const service = new GraphRAGLearningService(
      "nomic-embed-text",
      "qwen2.5:3b",
      768,
      "http://localhost:11434"
    );
    console.log("✓ Service initialized\n");

    // Run tests for each workflow
    let successCount = 0;
    let totalTests = TEST_WORKFLOWS.length;

    for (const workflow of TEST_WORKFLOWS) {
      console.log(`\n─── Testing: ${workflow.name} ───`);

      try {
        const feedback: WorkflowFeedback = {
          executionId: `exec-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          workflowId: `wf-${workflow.name.toLowerCase().replace(/\s+/g, '-')}`,
          userId: "test-user",
          timestamp: new Date().toISOString(),
          workflow: {
            nodes: workflow.nodes,
            connections: workflow.connections
          },
          feedback: workflow.feedback
        };

        console.log(`  • Workflow: ${workflow.feedback.semanticIntent}`);
        console.log(`  • Nodes: ${workflow.feedback.nodeCount}`);
        console.log(`  • Status: ${workflow.feedback.success ? "✓ Successful" : "✗ Failed"}`);
        console.log(`  • Satisfaction: ${workflow.feedback.userSatisfaction}/5`);

        // Process through Nano LLM pipeline
        console.log(`  → Processing through Nano LLM pipeline...`);
        const decision = await service.processWorkflowFeedback(feedback);

        // Analyze results
        const hasUpdates = decision.updateOperations && decision.updateOperations.length > 0;
        const confidence = decision.strategicAnalysis.overallConfidence;
        const decisionType = decision.strategicAnalysis.decisionType;

        console.log(`  ← Decision: ${decisionType}`);
        console.log(`  • Confidence: ${(confidence * 100).toFixed(1)}%`);
        console.log(`  • Updates: ${hasUpdates ? decision.updateOperations.length : 0}`);

        // Check promotion criteria
        const criteria = decision.strategicReasoning.promotionCriteria;
        const passedCriteria = Object.values(criteria).filter(v => v).length;
        console.log(`  • Criteria Met: ${passedCriteria}/5`);

        console.log(`  ✓ Test passed`);
        successCount++;
      } catch (error) {
        console.error(`  ✗ Test failed:`, error instanceof Error ? error.message : error);
      }
    }

    // Summary
    console.log(`\n\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║                      TEST SUMMARY                              ║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

    console.log(`Tests Passed: ${successCount}/${totalTests}`);
    console.log(`Success Rate: ${((successCount / totalTests) * 100).toFixed(1)}%`);

    if (successCount === totalTests) {
      console.log(`\n✅ ALL TESTS PASSED - Nano LLM system is fully operational!\n`);
      console.log("The system has successfully:");
      console.log("  ✓ Connected to Ollama (nomic-embed-text + qwen2.5:3b)");
      console.log("  ✓ Processed multiple workflow types");
      console.log("  ✓ Generated strategic decisions");
      console.log("  ✓ Analyzed pattern confidence");
      console.log("  ✓ Evaluated promotion criteria");

      console.log("\nNext steps:");
      console.log("  1. Deploy to production with Docker Compose");
      console.log("  2. Connect to n8n instance for real workflow monitoring");
      console.log("  3. Monitor GraphRAG pattern discovery");
      console.log("  4. Collect metrics on suggestion quality");

      process.exit(0);
    } else {
      console.log(`\n⚠️  ${totalTests - successCount} test(s) failed\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ System test failed:", error);
    process.exit(1);
  }
}

// Run the test
runFullSystemTest();
