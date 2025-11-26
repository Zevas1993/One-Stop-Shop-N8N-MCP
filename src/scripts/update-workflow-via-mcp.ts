import { spawn } from "child_process";
import * as readline from "readline";
import * as path from "path";
import { WorkflowSimplifierService } from "../services/workflow-simplifier";
import { NodeParser } from "../services/node-parser";
import { logger } from "../utils/logger";

// Verified DSL from build-screenshot-workflow.ts
const workflowDSL = {
  name: "Teams-Outlook RAG Assistant - Natural Language Ready", // Target Name
  nodes: [
    {
      name: "Outlook Email Trigger",
      type: "n8n-nodes-base.microsoftOutlookTrigger",
      position: [100, 200],
      parameters: { pollInterval: 60 },
    },
    {
      name: "Process Email for RAG",
      type: "n8n-nodes-base.code",
      position: [300, 200],
      parameters: { jsCode: "// Extract email body for RAG processing" },
    },
    {
      name: "Fraud Classifier",
      type: "@n8n/n8n-nodes-langchain.agent",
      position: [500, 100],
      parameters: { agent: "fraudClassifier" },
    },
    {
      name: "Billing RAG Agent",
      type: "@n8n/n8n-nodes-langchain.agent",
      position: [500, 250],
      parameters: { agent: "billingRag" },
    },
    {
      name: "High Priority RAG Agent",
      type: "@n8n/n8n-nodes-langchain.agent",
      position: [500, 400],
      parameters: { agent: "priorityRag" },
    },
    {
      name: "Teams Message Trigger",
      type: "n8n-nodes-base.microsoftTeamsTrigger",
      position: [100, 800],
      parameters: {},
    },
    {
      name: "Process Teams Input",
      type: "n8n-nodes-base.code",
      position: [300, 800],
      parameters: { jsCode: "// Prepare Teams message for agent" },
    },
    {
      name: "AI Agent (Central)",
      type: "@n8n/n8n-nodes-langchain.agent",
      position: [600, 800],
      parameters: { mode: "centralOrchestrator" },
    },
    {
      name: "Send Teams Response",
      type: "n8n-nodes-base.microsoftTeams",
      position: [900, 800],
      parameters: { operation: "sendMessage" },
    },
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

async function updateWorkflowViaMCP() {
  console.log("🚀 Starting Workflow Update via MCP...");

  // 1. Read payload.json
  const fs = require("fs");
  const payloadPath = path.join(process.cwd(), "payload.json");
  if (!fs.existsSync(payloadPath)) {
    console.error("❌ payload.json not found!");
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  console.log("✅ Loaded payload.json");

  // 2. Spawn MCP Server
  const serverPath = path.join(process.cwd(), "src/mcp/index.ts");
  const server = spawn("node", ["-r", "ts-node/register", serverPath], {
    env: { ...process.env, MCP_MODE: "stdio" },
    stdio: ["pipe", "pipe", "inherit"],
  });

  const rl = readline.createInterface({
    input: server.stdout,
    output: process.stdout,
    terminal: false,
  });

  let isStarted = false;
  let updateRequestId = 2;

  // Helper to send JSON-RPC request
  const sendRequest = (method: string, params: any, id: number) => {
    const request = { jsonrpc: "2.0", method, params, id };
    server.stdin.write(JSON.stringify(request) + "\n");
  };

  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line);

      // Handle initialization
      if (!isStarted && msg.result && msg.result.capabilities) {
        isStarted = true;
        console.log("✅ Server Initialized");

        // Send Update Request
        console.log("🛠️  Sending update request...");
        sendRequest(
          "tools/call",
          {
            name: "workflow_manager",
            arguments: {
              action: "update",
              id: "A9h8Zsm6kYpsmilu",
              changes: payload,
            },
          },
          updateRequestId
        );
      }

      // Handle Update Response
      if (msg.id === updateRequestId) {
        if (msg.error) {
          console.error("❌ Update Error:", JSON.stringify(msg.error, null, 2));
        } else {
          const content = JSON.parse(msg.result.content[0].text);
          console.log("✅ Workflow Updated Successfully!");
          console.log(JSON.stringify(content, null, 2));
        }
        process.exit(0);
      }
    } catch (e) {
      // Ignore non-JSON lines
    }
  });

  // Start initialization
  sendRequest(
    "initialize",
    {
      protocolVersion: "2024-11-05",
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: "updater-client", version: "1.0.0" },
    },
    1
  );
}

updateWorkflowViaMCP().catch(console.error);
