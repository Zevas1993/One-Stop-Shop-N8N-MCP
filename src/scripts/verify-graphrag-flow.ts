import {
  GraphRAGLearningService,
  WorkflowFeedback,
} from "../services/graphrag-learning-service";
import { logger } from "../utils/logger";

async function main() {
  try {
    logger.info("Starting GraphRAG Flow Verification...");

    // Initialize service (assumes Ollama is running at http://localhost:11434)
    const service = new GraphRAGLearningService();

    // Sample feedback data
    const feedback: WorkflowFeedback = {
      executionId: "verify-exec-" + Date.now(),
      workflowId: "verify-wf-" + Date.now(),
      userId: "verify-user",
      timestamp: new Date().toISOString(),
      workflow: {
        nodes: [
          {
            id: "node-1",
            name: "Webhook",
            type: "n8n-nodes-base.webhook",
            typeVersion: 1,
            position: [100, 100],
          },
          {
            id: "node-2",
            name: "HTTP Request",
            type: "n8n-nodes-base.httpRequest",
            typeVersion: 1,
            position: [300, 100],
          },
        ],
        connections: {
          Webhook: {
            main: [
              [
                {
                  node: "HTTP Request",
                  type: "main",
                  index: 0,
                },
              ],
            ],
          },
        },
      },
      feedback: {
        success: true,
        executionTime: 150,
        nodeCount: 2,
        userFeedback: "Works great!",
        userSatisfaction: 5,
        semanticIntent: "Fetch data from API on webhook trigger",
      },
    };

    logger.info("Processing workflow feedback...");
    const decision = await service.processWorkflowFeedback(feedback);

    logger.info("Verification Successful!");
    logger.info("Decision:", JSON.stringify(decision, null, 2));
  } catch (error) {
    logger.error("Verification Failed:", error);
    process.exit(1);
  }
}

main();
