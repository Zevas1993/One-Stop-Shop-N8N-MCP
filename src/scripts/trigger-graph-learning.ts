import {
  GraphRAGLearningService,
  WorkflowFeedback,
} from "../services/graphrag-learning-service";
import { logger } from "../utils/logger";

async function triggerLearning() {
  console.log("🚀 Triggering GraphRAG Learning Agent...");

  // Initialize the learning service
  const learningService = new GraphRAGLearningService();

  // Mock Feedback from a "successful" run of the RAG workflow
  const feedback: WorkflowFeedback = {
    executionId: `exec-${Date.now()}`,
    workflowId: "A9h8Zsm6kYpsmilu", // The ID of the workflow we just fixed
    userId: "user-123",
    timestamp: new Date().toISOString(),
    workflow: {
      nodes: [
        {
          type: "n8n-nodes-base.microsoftOutlookTrigger",
          name: "Outlook Email Trigger",
        },
        { type: "@n8n/n8n-nodes-langchain.agent", name: "Fraud Classifier" },
        { type: "n8n-nodes-base.microsoftTeams", name: "Send Teams Response" },
      ],
      connections: {
        "Outlook Email Trigger": { main: [[{ node: "Fraud Classifier" }]] },
        "Fraud Classifier": { main: [[{ node: "Send Teams Response" }]] },
      },
    },
    feedback: {
      success: true,
      executionTime: 1500,
      nodeCount: 3,
      userSatisfaction: 5, // High satisfaction to encourage promotion
      semanticIntent: "fraud-detection-alert",
    },
  };

  console.log(
    "📊 Sending Feedback to Learning Agent:",
    JSON.stringify(feedback.feedback, null, 2)
  );

  try {
    // Trigger the learning pipeline
    const decision = await learningService.processWorkflowFeedback(feedback);

    console.log("\n🤖 Agent Decision Reached:");
    console.log("---------------------------------------------------");
    console.log(
      `Type: ${decision.strategicAnalysis.decisionType.toUpperCase()}`
    );
    console.log(
      `Confidence: ${(
        decision.strategicAnalysis.overallConfidence * 100
      ).toFixed(1)}%`
    );
    console.log(
      `Reasoning: ${
        decision.strategicReasoning.promotionCriteria.semanticallySound
          ? "Semantically Sound"
          : "Issues Detected"
      }`
    );
    console.log("---------------------------------------------------");

    if (decision.updateOperations.length > 0) {
      console.log(
        `✅ Generated ${decision.updateOperations.length} Graph Update Operations:`
      );
      decision.updateOperations.forEach((op) => {
        console.log(`   - [${op.operationType}] ${op.reasoning}`);
      });
    } else {
      console.log("ℹ️  No graph updates recommended at this time.");
      console.log(`   Reason: ${decision.expectedImpact.description}`);
    }

    console.log("\n✨ The Agent is ACTIVE and analyzing workflow performance!");
  } catch (error) {
    console.error("❌ Learning Agent Error:", error);
  }
}

triggerLearning().catch(console.error);
