import { UnifiedMCPServer } from "../mcp/server-modern";
import * as fs from "fs";
import { MCPToolService } from "../services/mcp-tool-service";
import { NodeParser } from "../services/node-parser";
import { Logger } from "../utils/logger";
import {
  WorkflowSimplifierService,
  SimplifiedWorkflow,
} from "../services/workflow-simplifier";
import dotenv from "dotenv";
import { getN8nApiClient } from "../mcp/handlers-n8n-manager";

// Load environment variables
dotenv.config();

async function buildScreenshotWorkflow() {
  const logger = new Logger();
  logger.info("🤖 Agent: Analyzing screenshot layout...");
  logger.info(
    "🤖 Agent: Constructing 'Teams-Outlook RAG Assistant' workflow..."
  );

  try {
    // Initialize Server - NOT NEEDED for this script as we use components directly
    // const server = new UnifiedMCPServer();
    // await (server as any).initialize();

    // Instantiate NodeParser locally
    const nodeParser = new NodeParser();
    try {
      await nodeParser.initialize();
    } catch (e) {
      logger.warn(
        "NodeParser initialization failed (cache might be missing), proceeding with fallback type resolution."
      );
    }

    // Access the simplifier service directly or via tool service
    // We'll simulate the tool input processing
    const simplifier = new WorkflowSimplifierService(nodeParser);

    // Define the workflow based on the screenshot
    // Coordinates are approximated to match the visual layout
    const workflowDSL: SimplifiedWorkflow = {
      name: "Teams-Outlook RAG Assistant (Agent Generated)",
      nodes: [
        // --- Top Flow: Email Processing ---
        {
          name: "Outlook Email Trigger",
          type: "microsoftOutlookTrigger",
          position: [0, 0],
          parameters: { pollInterval: 60 },
        },
        {
          name: "Process Email for RAG",
          type: "code",
          position: [250, 0],
          parameters: {
            jsCode: "// Extract email body and metadata\nreturn items;",
          },
        },
        {
          name: "Fraud Classifier",
          type: "@n8n/n8n-nodes-langchain.agent",
          position: [500, -150],
          parameters: { mode: "text" },
        },
        {
          name: "Billing RAG Agent",
          type: "@n8n/n8n-nodes-langchain.agent",
          position: [500, 0],
          parameters: { mode: "chat" },
        },
        {
          name: "High Priority RAG Agent",
          type: "@n8n/n8n-nodes-langchain.agent",
          position: [500, 150],
          parameters: { mode: "chat" },
        },

        // --- Bottom Flow: Teams Interaction ---
        {
          name: "Teams Message Trigger",
          type: "microsoftTeamsTrigger",
          position: [0, 400],
          parameters: {},
        },
        {
          name: "Process Teams Input",
          type: "code",
          position: [250, 400],
          parameters: {
            jsCode: "// Format teams message for AI\nreturn items;",
          },
        },
        {
          name: "AI Agent (Central)",
          type: "@n8n/n8n-nodes-langchain.agent",
          position: [500, 400],
          parameters: {
            options: {
              systemMessage: "You are a helpful Outlook & Teams assistant.",
            },
          },
        },
        {
          name: "Send Teams Response",
          type: "microsoftTeams",
          position: [800, 400],
          parameters: { operation: "sendMessage" },
        },

        // --- Tools for Central AI Agent ---
        {
          name: "Postgres Memory",
          type: "n8n-nodes-base.postgres",
          position: [400, 600],
          parameters: { operation: "executeQuery" },
        },
        {
          name: "Search Emails",
          type: "n8n-nodes-base.microsoftOutlook",
          position: [500, 600],
          parameters: { resource: "message", operation: "getAll" },
        },
        {
          name: "Get Calendar Events",
          type: "n8n-nodes-base.microsoftOutlook",
          position: [650, 600],
          parameters: { resource: "event", operation: "getAll" },
        },
        {
          name: "Create Calendar Event",
          type: "n8n-nodes-base.microsoftOutlook",
          position: [800, 600],
          parameters: { resource: "event", operation: "create" },
        },
        {
          name: "Create Draft",
          type: "n8n-nodes-base.microsoftOutlook",
          position: [950, 600],
          parameters: { resource: "message", operation: "create" },
        },
        {
          name: "Send Email",
          type: "n8n-nodes-base.microsoftOutlook",
          position: [1100, 600],
          parameters: { resource: "message", operation: "send" },
        },
        {
          name: "OpenAI Chat Model",
          type: "@n8n/n8n-nodes-langchain.openAiChatModel",
          position: [200, 400],
          parameters: { model: "gpt-4o" },
        },
        {
          name: "Window Buffer Memory",
          type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
          position: [200, 550],
          parameters: {},
        },
      ],
      connections: [
        // Top Flow
        { from: "Outlook Email Trigger", to: "Process Email for RAG" },
        { from: "Process Email for RAG", to: "Fraud Classifier" },
        { from: "Process Email for RAG", to: "Billing RAG Agent" },
        { from: "Process Email for RAG", to: "High Priority RAG Agent" },

        // Bottom Flow
        { from: "Teams Message Trigger", to: "Process Teams Input" },
        { from: "Process Teams Input", to: "AI Agent (Central)" },
        { from: "AI Agent (Central)", to: "Send Teams Response" },

        // AI Agent Tools (Native Outlook Nodes)
        { from: "AI Agent (Central)", to: "Postgres Memory" },
        { from: "AI Agent (Central)", to: "Search Emails" },
        { from: "AI Agent (Central)", to: "Get Calendar Events" },
        { from: "AI Agent (Central)", to: "Create Calendar Event" },
        { from: "AI Agent (Central)", to: "Create Draft" },
        { from: "AI Agent (Central)", to: "Send Email" },

        // AI Models & Memory
        { from: "OpenAI Chat Model", to: "Fraud Classifier" },
        { from: "OpenAI Chat Model", to: "Billing RAG Agent" },
        { from: "OpenAI Chat Model", to: "High Priority RAG Agent" },
        { from: "OpenAI Chat Model", to: "AI Agent (Central)" },

        { from: "Window Buffer Memory", to: "Fraud Classifier" },
        { from: "Window Buffer Memory", to: "Billing RAG Agent" },
        { from: "Window Buffer Memory", to: "High Priority RAG Agent" },
        { from: "Window Buffer Memory", to: "AI Agent (Central)" },
      ],
    };

    // Expand DSL to n8n JSON
    logger.info("🤖 Agent: Expanding DSL to n8n JSON...");
    const fullWorkflow = await simplifier.expandWorkflow(workflowDSL);

    // Save to file as backup/artifact
    fs.writeFileSync("workflow.json", JSON.stringify(fullWorkflow, null, 2));
    logger.info("✅ Workflow JSON saved to 'workflow.json'");

    // Create Workflow in n8n
    logger.info("🤖 Agent: Sending workflow to n8n instance...");

    const client = getN8nApiClient();
    if (!client) {
      throw new Error("n8n API client not initialized. Check .env file.");
    }

    const apiKey = process.env.N8N_API_KEY || "";
    logger.info(
      `Using API Key: ${apiKey.substring(0, 5)}... (Length: ${apiKey.length})`
    );

    try {
      const result = await client.createWorkflow(fullWorkflow);
      logger.info(`✅ Workflow Created Successfully!`);
      logger.info(`   Name: ${result.name}`);
      logger.info(`   ID: ${result.id}`);
      logger.info(`   Active: ${result.active}`);
      logger.info(`   Nodes: ${result.nodes.length}`);
    } catch (apiError: any) {
      logger.error(
        "❌ Failed to create workflow in n8n API:",
        apiError.message
      );
      if (apiError.statusCode === 401) {
        logger.warn(
          "⚠️  Authentication failed (401). Please check N8N_API_KEY in .env"
        );
        logger.info("ℹ️  You can manually import 'workflow.json' into n8n.");
      }
    }

    process.exit(0);
  } catch (error) {
    logger.error("❌ Agent failed to build workflow:", error);
  }
}

buildScreenshotWorkflow();
