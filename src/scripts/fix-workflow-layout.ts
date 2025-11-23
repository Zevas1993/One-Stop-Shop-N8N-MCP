import { spawn } from "child_process";
import * as readline from "readline";
import * as path from "path";

// Define a clean layout with sticky notes
const layoutUpdate = {
  nodes: [
    // --- Triggers (Left) ---
    {
      name: "Outlook Email Trigger",
      type: "n8n-nodes-base.microsoftOutlookTrigger",
      position: [0, 200],
      parameters: { pollInterval: 60 },
    },
    {
      name: "Teams Message Trigger",
      type: "n8n-nodes-base.microsoftTeamsTrigger",
      position: [0, 600],
      parameters: {},
    },

    // --- Pre-Processing (Middle-Left) ---
    {
      name: "Process Email for RAG",
      type: "n8n-nodes-base.code",
      position: [250, 200],
      parameters: { jsCode: "// Extract email body for RAG processing" },
    },
    {
      name: "Process Teams Input",
      type: "n8n-nodes-base.code",
      position: [250, 600],
      parameters: { jsCode: "// Prepare Teams message for agent" },
    },

    // --- AI Models & Memory (Top-Center) ---
    {
      name: "OpenAI Chat Model",
      type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      position: [500, 0],
      parameters: { model: "gpt-4o", options: {} },
    },
    {
      name: "Window Buffer Memory",
      type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
      position: [500, 150],
      parameters: {},
    },

    // --- RAG Agents (Center-Right) ---
    {
      name: "Fraud Classifier",
      type: "@n8n/n8n-nodes-langchain.agent",
      position: [800, 100],
      parameters: {
        text: "You are a fraud detection expert. Analyze the email content for suspicious patterns.",
        options: { systemMessage: "Classify the email as 'Fraud' or 'Safe'." },
      },
    },
    {
      name: "Billing RAG Agent",
      type: "@n8n/n8n-nodes-langchain.agent",
      position: [800, 300],
      parameters: {
        text: "You are a billing support agent. Answer questions about invoices and payments.",
        options: {
          systemMessage: "Use the RAG tools to find billing information.",
        },
      },
    },
    {
      name: "High Priority RAG Agent",
      type: "@n8n/n8n-nodes-langchain.agent",
      position: [800, 500],
      parameters: {
        text: "You are a priority support agent. Handle urgent requests immediately.",
        options: { systemMessage: "Prioritize this request above all others." },
      },
    },

    // --- Central Orchestrator (Center-Bottom) ---
    {
      name: "AI Agent (Central)",
      type: "@n8n/n8n-nodes-langchain.agent",
      position: [500, 800],
      parameters: {
        text: "You are the central orchestrator. Coordinate between specialized agents and tools.",
        options: {
          systemMessage: "Route the request to the appropriate agent or tool.",
        },
      },
    },

    // --- Tools & Actions (Right) ---
    {
      name: "Postgres Memory",
      type: "n8n-nodes-base.postgres",
      position: [900, 700],
      parameters: { operation: "executeQuery" },
    },
    {
      name: "Search Emails",
      type: "n8n-nodes-base.microsoftOutlook",
      position: [900, 850],
      parameters: { resource: "message", operation: "getAll" },
    },
    {
      name: "Get Calendar Events",
      type: "n8n-nodes-base.microsoftOutlook",
      position: [900, 1000],
      parameters: { resource: "event", operation: "getAll" },
    },
    {
      name: "Create Calendar Event",
      type: "n8n-nodes-base.microsoftOutlook",
      position: [1100, 1000],
      parameters: { resource: "event", operation: "create" },
    },
    {
      name: "Create Draft",
      type: "n8n-nodes-base.microsoftOutlook",
      position: [1100, 850],
      parameters: { resource: "message", operation: "create" },
    },
    {
      name: "Send Email",
      type: "n8n-nodes-base.microsoftOutlook",
      position: [1300, 850],
      parameters: { resource: "message", operation: "send" },
    },
    {
      name: "Send Teams Response",
      type: "n8n-nodes-base.microsoftTeams",
      position: [900, 1150],
      parameters: { operation: "sendMessage" },
    },

    // --- Sticky Notes (Organization) ---
    {
      name: "Note: Inputs",
      type: "n8n-nodes-base.stickyNote",
      position: [-50, 150],
      parameters: {
        content: "## Inputs\nEmail and Teams triggers to start the workflow.",
        height: 600,
        width: 200,
        color: 2,
      },
    },
    {
      name: "Note: AI Config",
      type: "n8n-nodes-base.stickyNote",
      position: [450, -50],
      parameters: {
        content: "## AI Config\nModel and Memory shared across agents.",
        height: 300,
        width: 250,
        color: 3,
      },
    },
    {
      name: "Note: Specialized Agents",
      type: "n8n-nodes-base.stickyNote",
      position: [750, 50],
      parameters: {
        content:
          "## Specialized Agents\nDedicated agents for specific tasks (Fraud, Billing, Priority).",
        height: 600,
        width: 250,
        color: 4,
      },
    },
    {
      name: "Note: Central Orchestrator",
      type: "n8n-nodes-base.stickyNote",
      position: [450, 750],
      parameters: {
        content:
          "## Central Orchestrator\nMain agent that coordinates tools and responses.",
        height: 500,
        width: 300,
        color: 5,
      },
    },
    {
      name: "Note: Tools",
      type: "n8n-nodes-base.stickyNote",
      position: [850, 650],
      parameters: {
        content:
          "## Tools\nOutlook, Teams, and Database tools available to the Central Agent.",
        height: 600,
        width: 600,
        color: 6,
      },
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

import { WorkflowSimplifierService } from "../services/workflow-simplifier";
import { NodeParser } from "../services/node-parser";

async function fixWorkflowLayout() {
  console.log("🚀 Starting Workflow Layout Fix...");

  // 1. Expand DSL to full JSON
  const nodeParser = new NodeParser();
  const simplifier = new WorkflowSimplifierService(nodeParser);
  const fullWorkflow = await simplifier.expandWorkflow(layoutUpdate as any);
  console.log("✅ Generated full workflow JSON with correct connections");

  // Spawn MCP Server
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
  let searchRequestId = 2;
  let updateRequestId = 3;

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

        // Search for the target workflow
        console.log(
          "🔍 Searching for 'Teams-Outlook RAG Assistant - Natural Language Ready'..."
        );
        sendRequest(
          "tools/call",
          {
            name: "workflow_manager",
            arguments: {
              action: "search",
              query: "Teams-Outlook RAG Assistant - Natural Language Ready",
            },
          },
          searchRequestId
        );
      }

      // Handle Search Response
      if (msg.id === searchRequestId) {
        if (msg.error) {
          console.error("❌ Search Error:", msg.error);
          process.exit(1);
        }

        const content = JSON.parse(msg.result.content[0].text);
        const workflows = content.data?.workflows || [];

        if (workflows.length === 0) {
          console.error("❌ Workflow not found! Cannot update.");
          process.exit(1);
        }

        const targetId = workflows[0].id;
        console.log(
          `✅ Found target workflow: ${workflows[0].name} (ID: ${targetId})`
        );

        // Send Update Request
        console.log("🛠️  Sending update request with new layout...");
        sendRequest(
          "tools/call",
          {
            name: "workflow_manager",
            arguments: {
              action: "update",
              id: targetId,
              changes: {
                name: "Teams-Outlook RAG Assistant - Natural Language Ready",
                nodes: fullWorkflow.nodes,
                connections: fullWorkflow.connections,
              },
            },
          },
          updateRequestId
        );
      }

      // Handle Update Response
      if (msg.id === updateRequestId) {
        if (msg.error) {
          console.error("❌ Update Error:", msg.error);
        } else {
          const content = JSON.parse(msg.result.content[0].text);
          console.log("✅ Workflow Layout Updated Successfully!");
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
      clientInfo: { name: "layout-fixer-client", version: "1.0.0" },
    },
    1
  );
}

fixWorkflowLayout().catch(console.error);
