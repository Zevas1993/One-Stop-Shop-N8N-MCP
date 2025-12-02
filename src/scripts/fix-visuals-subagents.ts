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
};

// Colors: 1=Blue, 2=Purple, 3=Orange, 4=Green, 5=Red, 6=Grey, 7=Teal
const COLOR = { INPUT: 3, AI: 2, TOOLS: 5, OUTPUT: 4 };

async function fixFraudAgent() {
  console.log("Fixing Fraud Agent Visuals...");
  const wf = await client.getWorkflow(IDS.FRAUD);

  // Layout: Linear flow
  moveNode(wf, "When Executed by Another Workflow", [50, 200]);
  moveNode(wf, "Fraud Classifier Agent", [500, 200]);
  moveNode(wf, "OpenAI Chat Model", [500, 450]);
  moveNode(wf, "Set Output", [950, 200]);

  // Sticky Notes
  wf.nodes = wf.nodes.filter((n) => n.type !== "n8n-nodes-base.stickyNote");
  wf.nodes.push(
    createStickyNote("Input", COLOR.INPUT, [0, 50], 300, 400),
    createStickyNote("Fraud Analysis AI", COLOR.AI, [450, 50], 350, 600),
    createStickyNote("Output", COLOR.OUTPUT, [900, 50], 300, 400)
  );

  await updateWorkflow(IDS.FRAUD, wf);
}

async function fixBillingAgent() {
  console.log("Fixing Billing Agent Visuals...");
  const wf = await client.getWorkflow(IDS.BILLING);

  // Layout: AI with Tools below
  moveNode(wf, "When Executed by Another Workflow", [50, 200]);

  // AI Section
  moveNode(wf, "Billing RAG Agent", [500, 200]);
  moveNode(wf, "OpenAI Chat Model", [350, 450]);
  moveNode(wf, "Billing Memory", [500, 450]); // Memory below agent

  // Tools Section (RAG)
  moveNode(wf, "Billing Knowledge Base", [650, 450]); // Tool connected to Agent
  moveNode(wf, "Postgres Vector Store", [650, 650]); // Vector Store below Tool
  moveNode(wf, "Embeddings OpenAI", [650, 850]); // Embeddings below Vector Store

  moveNode(wf, "Set Output", [1000, 200]);

  // Sticky Notes
  wf.nodes = wf.nodes.filter((n) => n.type !== "n8n-nodes-base.stickyNote");
  wf.nodes.push(
    createStickyNote("Input", COLOR.INPUT, [0, 50], 300, 400),
    createStickyNote("Billing AI Logic", COLOR.AI, [320, 50], 400, 550),
    createStickyNote("RAG Knowledge Base", COLOR.TOOLS, [620, 380], 300, 600),
    createStickyNote("Output", COLOR.OUTPUT, [950, 50], 300, 400)
  );

  await updateWorkflow(IDS.BILLING, wf);
}

async function fixPriorityAgent() {
  console.log("Fixing Priority Agent Visuals...");
  const wf = await client.getWorkflow(IDS.PRIORITY);

  // Layout: Similar to Billing
  moveNode(wf, "When Executed by Another Workflow", [50, 200]);

  // AI Section
  moveNode(wf, "High Priority RAG Agent", [500, 200]);
  moveNode(wf, "OpenAI Chat Model", [350, 450]);
  moveNode(wf, "Priority Memory", [500, 450]);

  // Tools Section (RAG)
  moveNode(wf, "Priority Knowledge Base", [650, 450]);
  moveNode(wf, "Postgres Vector Store", [650, 650]);
  moveNode(wf, "Embeddings OpenAI", [650, 850]);

  moveNode(wf, "Set Output", [1000, 200]);

  // Sticky Notes
  wf.nodes = wf.nodes.filter((n) => n.type !== "n8n-nodes-base.stickyNote");
  wf.nodes.push(
    createStickyNote("Input", COLOR.INPUT, [0, 50], 300, 400),
    createStickyNote("VIP Support AI", COLOR.AI, [320, 50], 400, 550),
    createStickyNote("RAG Knowledge Base", COLOR.TOOLS, [620, 380], 300, 600),
    createStickyNote("Output", COLOR.OUTPUT, [950, 50], 300, 400)
  );

  await updateWorkflow(IDS.PRIORITY, wf);
}

// --- Helpers ---

function moveNode(wf: any, name: string, pos: [number, number]) {
  const node = wf.nodes.find((n: any) => n.name === name);
  if (node) {
    node.position = pos;
  } else {
    console.warn(`⚠️ Node not found: ${name}`);
  }
}

function createStickyNote(
  text: string,
  color: number,
  position: [number, number],
  width: number,
  height: number
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

async function updateWorkflow(id: string, workflow: any) {
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
  }
}

async function run() {
  await fixFraudAgent();
  await fixBillingAgent();
  await fixPriorityAgent();
}

run();
