import { NodeFilter } from "../core/node-filter";
import { NodeCatalog } from "../core/node-catalog";
import { WorkflowValidator } from "../services/workflow-validator";
import { NodeRepository } from "../database/node-repository";
import { Logger } from "../utils/logger";

const logger = new Logger({ prefix: "TestNodeRestrictions" });

async function testNodeRestrictions() {
  logger.info("Starting Node Restrictions Test...");

  // 1. Test NodeFilter directly
  const filter = NodeFilter.getInstance();

  const allowedNodes = [
    "n8n-nodes-base.webhook",
    "n8n-nodes-base.httpRequest",
    "@n8n/n8n-nodes-langchain.agent",
    "n8n-nodes-langchain.chain",
  ];

  const disallowedNodes = [
    "n8n-nodes-browserless.browserless",
    "n8n-nodes-chatgpt.chatgpt",
    "nodes-base.webhook", // Invalid prefix
    "webhook", // Missing prefix
  ];

  logger.info("Testing NodeFilter logic...");

  for (const node of allowedNodes) {
    if (!filter.isNodeAllowed(node)) {
      logger.error(`❌ Allowed node rejected: ${node}`);
    } else {
      logger.info(`✅ Allowed node accepted: ${node}`);
    }
  }

  for (const node of disallowedNodes) {
    if (filter.isNodeAllowed(node)) {
      logger.error(`❌ Disallowed node accepted: ${node}`);
    } else {
      logger.info(`✅ Disallowed node rejected: ${node}`);
    }
  }

  // 2. Test WorkflowValidator
  logger.info("Testing WorkflowValidator integration...");

  // Mock repository
  const mockRepo = {
    getNode: (type: string) => {
      if (type.startsWith("n8n-nodes-base"))
        return { type, isVersioned: false };
      return null;
    },
  } as any;

  const validator = new WorkflowValidator(mockRepo);

  const workflow = {
    name: "Test Workflow",
    nodes: [
      {
        id: "1",
        name: "Webhook",
        type: "n8n-nodes-base.webhook",
        position: [0, 0],
        parameters: {},
      },
      {
        id: "2",
        name: "Community Node",
        type: "n8n-nodes-browserless.browserless",
        position: [100, 0],
        parameters: {},
      },
    ],
    connections: {
      Webhook: {
        main: [[{ node: "Community Node", type: "main", index: 0 }]],
      },
    },
    settings: { executionOrder: "v1" },
  };

  const result = await validator.validateWorkflow(workflow as any);

  const communityError = result.errors.find((e) =>
    e.message.includes("is not allowed")
  );

  if (communityError) {
    logger.info("✅ WorkflowValidator correctly rejected community node");
  } else {
    logger.error("❌ WorkflowValidator FAILED to reject community node");
    console.log("Errors found:", result.errors);
  }

  logger.info("Test Complete");
}

testNodeRestrictions().catch(console.error);
