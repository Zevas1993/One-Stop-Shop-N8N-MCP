import { N8nApiClient } from "../services/n8n-api-client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const N8N_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_KEY = process.env.N8N_API_KEY || "";

const client = new N8nApiClient({ baseUrl: N8N_URL, apiKey: N8N_KEY });

const MAIN_WORKFLOW_ID = "A9h8Zsm6kYpsmilu";

// Colors: 1=Blue, 2=Purple, 3=Orange, 4=Green, 5=Red, 6=Grey, 7=Teal
const COLOR = { INPUT: 3, ORCHESTRATOR: 2, SUBAGENTS: 5, OUTPUT: 4 }; // Matching the image colors roughly

async function fixVisuals() {
  console.log("Fetching Main Workflow...");
  const wf = await client.getWorkflow(MAIN_WORKFLOW_ID);

  // --- 1. Define Regions ---
  // Inputs: x=0, y=0, w=400, h=600
  // Orchestrator: x=500, y=0, w=400, h=600
  // Sub-Agents: x=1000, y=0, w=400, h=600
  // Outputs: x=1500, y=0, w=500, h=800 (Wider for 2 columns)

  // --- 2. Move Nodes ---

  // INPUTS
  moveNode(wf, "Outlook Email Trigger", [50, 100]);
  moveNode(wf, "Teams Message Trigger", [50, 350]);
  moveNode(wf, "Process Email for RAG", [250, 100]);
  moveNode(wf, "Process Teams Input", [250, 350]);

  // ORCHESTRATOR
  moveNode(wf, "OpenAI Chat Model", [650, 50]);
  moveNode(wf, "AI Agent (Central)", [650, 250]);
  moveNode(wf, "Window Buffer Memory", [650, 450]);

  // SUB-AGENTS
  moveNode(wf, "Fraud Tool", [1150, 100]);
  moveNode(wf, "Billing Tool", [1150, 300]);
  moveNode(wf, "Priority Tool", [1150, 500]);

  // OUTPUTS (The ones that were scattered)
  // Column 1
  moveNode(wf, "Send Teams Response", [1600, 100]);
  moveNode(wf, "Search Emails", [1600, 250]);
  moveNode(wf, "Get Calendar Events", [1600, 400]);
  // Column 2
  moveNode(wf, "Create Calendar Event", [1850, 250]);
  moveNode(wf, "Create Draft", [1850, 400]);
  moveNode(wf, "Send Email", [1850, 550]);

  // --- 3. Re-create Sticky Notes ---
  // Remove old notes
  wf.nodes = wf.nodes.filter((n) => n.type !== "n8n-nodes-base.stickyNote");

  const notes = [
    createStickyNote("Inputs (Email/Teams)", COLOR.INPUT, [0, -50], 450, 700),
    createStickyNote(
      "Central Orchestrator",
      COLOR.ORCHESTRATOR,
      [500, -50],
      450,
      700
    ),
    createStickyNote(
      "Specialized Sub-Agents",
      COLOR.SUBAGENTS,
      [1000, -50],
      450,
      700
    ),
    createStickyNote("Outputs (Actions)", COLOR.OUTPUT, [1500, -50], 600, 800),
  ];
  wf.nodes.push(...notes);

  // --- 4. Update Workflow ---
  console.log("Updating Layout...");

  // Clean payload
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData,
    meta: wf.meta,
  };

  try {
    await client.updateWorkflow(MAIN_WORKFLOW_ID, payload);
    console.log("✅ Successfully Fixed Visual Layout!");
  } catch (e: any) {
    console.error("❌ Error:", e.message);
    if (e.response) console.error(e.response.data);
  }
}

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

fixVisuals();
