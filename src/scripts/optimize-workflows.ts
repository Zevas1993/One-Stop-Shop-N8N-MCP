import { N8nApiClient } from "../services/n8n-api-client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const N8N_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_KEY = process.env.N8N_API_KEY || "";

const client = new N8nApiClient({ baseUrl: N8N_URL, apiKey: N8N_KEY });

const IDS = {
  FRAUD: "dhxaW4ZafE1okjAW",
  BILLING: "r40EF82iuKMAdxBv",
  PRIORITY: "OlhZpICPxUsgNWMA",
  MAIN: "A9h8Zsm6kYpsmilu",
};

// --- Helper: Create Sticky Note ---
function createStickyNote(
  text: string,
  color: number,
  position: [number, number],
  width: number = 240,
  height: number = 80
) {
  return {
    parameters: { content: text, width, height, color },
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position,
    id: `note_${Math.random().toString(36).substr(2, 9)}`,
    name: `Note: ${text}`,
  };
}

// Colors: 1=Blue, 2=Purple, 3=Orange, 4=Green, 5=Red, 6=Grey, 7=Teal
const COLOR = { INPUT: 1, AI: 2, TOOLS: 3, OUTPUT: 4 };

async function optimizeFraudAgent() {
  console.log("Optimizing Fraud Agent...");
  const wf = await client.getWorkflow(IDS.FRAUD);

  // 1. Update System Prompt (Standardized JSON)
  const agentNode = wf.nodes.find((n) => n.type.includes("agent"));
  if (agentNode) {
    agentNode.parameters.options = {
      systemMessage: `You are a Fraud Detection Specialist. Analyze the email for fraud/phishing.
Input: Sender, Body.
Output: Return a STRICT JSON object:
{
  "status": "success",
  "data": {
    "is_fraud": boolean,
    "reason": "explanation",
    "confidence": number (0-1)
  },
  "message": "Short summary"
}`,
    };
    agentNode.position = [460, 0]; // Align
  }

  // 2. Align other nodes
  const trigger = wf.nodes.find((n) => n.type.includes("Trigger"));
  if (trigger) trigger.position = [0, 0];

  const model = wf.nodes.find((n) => n.type.includes("lmChat"));
  if (model) model.position = [460, 240];

  const output = wf.nodes.find((n) => n.type.includes("set"));
  if (output) {
    output.position = [820, 0];
    // Ensure output parses the JSON string if needed, or passes object
    output.parameters.assignments = {
      assignments: [
        {
          id: "resp",
          name: "result",
          value: "={{ $json.output }}",
          type: "object",
        },
      ],
    };
  }

  // 3. Add Sticky Notes
  const notes = [
    createStickyNote("Input Trigger", COLOR.INPUT, [0, -100]),
    createStickyNote("Fraud Analysis AI", COLOR.AI, [460, -100]),
    createStickyNote("Standardized Output", COLOR.OUTPUT, [820, -100]),
  ];

  // Remove old notes if any
  wf.nodes = wf.nodes.filter((n) => n.type !== "n8n-nodes-base.stickyNote");
  wf.nodes.push(...notes);

  await updateWorkflow(IDS.FRAUD, wf);
}

async function optimizeBillingAgent() {
  console.log("Optimizing Billing Agent...");
  const wf = await client.getWorkflow(IDS.BILLING);

  // 1. Update System Prompt & RAG Settings
  const agentNode = wf.nodes.find((n) => n.type.includes("agent"));
  if (agentNode) {
    agentNode.parameters.options = {
      systemMessage: `You are a Billing Specialist. Use the Knowledge Base.
Output: Return a STRICT JSON object:
{
  "status": "success",
  "data": {
    "answer": "The answer to the query",
    "sources": ["list", "of", "sources"]
  },
  "message": "Billing query answered"
}`,
    };
    agentNode.position = [460, 0];
  }

  // Optimize Vector Store (TopK)
  const vectorStore = wf.nodes.find((n) =>
    n.type.includes("vectorStorePostgres")
  );
  if (vectorStore) {
    // Note: TopK is usually set on the Retrieval Tool or the Vector Store node depending on config
    // For 'vectorStorePostgres', it's often in options or used by the tool.
    // Let's check the tool node.
  }
  const toolNode = wf.nodes.find((n) => n.type.includes("toolVectorStore"));
  if (toolNode) {
    // toolVectorStore usually has 'topK' parameter
    toolNode.parameters.topK = 5;
    toolNode.position = [700, 240];
  }

  // 2. Align Nodes
  const trigger = wf.nodes.find((n) => n.type.includes("Trigger"));
  if (trigger) trigger.position = [0, 0];

  const model = wf.nodes.find((n) => n.type.includes("lmChat"));
  if (model) model.position = [420, 240];

  const memory = wf.nodes.find((n) => n.type.includes("memory"));
  if (memory) memory.position = [560, 240];

  const output = wf.nodes.find((n) => n.type.includes("set"));
  if (output) output.position = [900, 0];

  // 3. Add Sticky Notes
  const notes = [
    createStickyNote("Input Trigger", COLOR.INPUT, [0, -100]),
    createStickyNote("Billing AI Agent", COLOR.AI, [460, -100]),
    createStickyNote("RAG Tools", COLOR.TOOLS, [700, 140]),
    createStickyNote("Standardized Output", COLOR.OUTPUT, [900, -100]),
  ];

  wf.nodes = wf.nodes.filter((n) => n.type !== "n8n-nodes-base.stickyNote");
  wf.nodes.push(...notes);

  await updateWorkflow(IDS.BILLING, wf);
}

async function optimizePriorityAgent() {
  console.log("Optimizing Priority Agent...");
  const wf = await client.getWorkflow(IDS.PRIORITY);

  // 1. Update System Prompt
  const agentNode = wf.nodes.find((n) => n.type.includes("agent"));
  if (agentNode) {
    agentNode.parameters.options = {
      systemMessage: `You are a High Priority Support Specialist.
Output: Return a STRICT JSON object:
{
  "status": "success",
  "data": {
    "response": "The response",
    "escalate": boolean (true if urgent/unknown)
  },
  "message": "Priority request handled"
}`,
    };
    agentNode.position = [460, 0];
  }

  // Optimize Tool
  const toolNode = wf.nodes.find((n) => n.type.includes("toolVectorStore"));
  if (toolNode) {
    toolNode.parameters.topK = 5;
    toolNode.position = [700, 240];
  }

  // 2. Align Nodes
  const trigger = wf.nodes.find((n) => n.type.includes("Trigger"));
  if (trigger) trigger.position = [0, 0];

  const model = wf.nodes.find((n) => n.type.includes("lmChat"));
  if (model) model.position = [420, 240];

  const memory = wf.nodes.find((n) => n.type.includes("memory"));
  if (memory) memory.position = [560, 240];

  const output = wf.nodes.find((n) => n.type.includes("set"));
  if (output) output.position = [900, 0];

  // 3. Add Sticky Notes
  const notes = [
    createStickyNote("Input Trigger", COLOR.INPUT, [0, -100]),
    createStickyNote("VIP Support AI", COLOR.AI, [460, -100]),
    createStickyNote("RAG Tools", COLOR.TOOLS, [700, 140]),
    createStickyNote("Standardized Output", COLOR.OUTPUT, [900, -100]),
  ];

  wf.nodes = wf.nodes.filter((n) => n.type !== "n8n-nodes-base.stickyNote");
  wf.nodes.push(...notes);

  await updateWorkflow(IDS.PRIORITY, wf);
}

async function optimizeOrchestrator() {
  console.log("Optimizing Orchestrator...");
  const wf = await client.getWorkflow(IDS.MAIN);

  // 1. Update Central Agent Prompt
  const agentNode = wf.nodes.find((n) => n.name === "AI Agent (Central)");
  if (agentNode) {
    agentNode.parameters.text = `You are the Central Orchestrator.
Your goal is to route requests to the correct specialized agent.
The agents return structured JSON. Always parse their response and present a clean summary to the user.
If an agent returns "escalate": true, mark the message as URGENT.`;
    agentNode.position = [800, 300];
  }

  // 2. Align Tool Nodes
  const fraudTool = wf.nodes.find((n) => n.name === "Fraud Tool");
  if (fraudTool) fraudTool.position = [1100, 200];

  const billingTool = wf.nodes.find((n) => n.name === "Billing Tool");
  if (billingTool) billingTool.position = [1100, 400];

  const priorityTool = wf.nodes.find((n) => n.name === "Priority Tool");
  if (priorityTool) priorityTool.position = [1100, 600];

  // 3. Add Sticky Notes
  const notes = [
    createStickyNote("Inputs (Email/Teams)", COLOR.INPUT, [100, 100], 300, 400),
    createStickyNote("Central Orchestrator", COLOR.AI, [750, 100], 300, 400),
    createStickyNote(
      "Specialized Sub-Agents",
      COLOR.TOOLS,
      [1080, 100],
      300,
      600
    ),
    createStickyNote(
      "Outputs (Email/Teams)",
      COLOR.OUTPUT,
      [1400, 100],
      300,
      400
    ),
  ];

  // Remove old notes
  wf.nodes = wf.nodes.filter((n) => n.type !== "n8n-nodes-base.stickyNote");
  wf.nodes.push(...notes);

  await updateWorkflow(IDS.MAIN, wf);
}

async function updateWorkflow(id: string, workflow: any) {
  // Clean payload
  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings,
    staticData: workflow.staticData,
    meta: workflow.meta,
  };
  try {
    await client.updateWorkflow(id, payload);
    console.log(`✅ Updated ${workflow.name}`);
  } catch (e: any) {
    console.error(`❌ Failed to update ${workflow.name}:`, e.message);
    if (e.response) console.error(e.response.data);
  }
}

async function run() {
  await optimizeFraudAgent();
  await optimizeBillingAgent();
  await optimizePriorityAgent();
  await optimizeOrchestrator();
}

run();
