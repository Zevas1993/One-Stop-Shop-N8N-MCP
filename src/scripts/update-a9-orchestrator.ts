import { N8nApiClient } from "../services/n8n-api-client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const N8N_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_KEY = process.env.N8N_API_KEY || "";

const client = new N8nApiClient({ baseUrl: N8N_URL, apiKey: N8N_KEY });

const MAIN_WORKFLOW_ID = "A9h8Zsm6kYpsmilu";
const FRAUD_ID = "dhxaW4ZafE1okjAW";
const BILLING_ID = "r40EF82iuKMAdxBv";
const PRIORITY_ID = "OlhZpICPxUsgNWMA";

async function refactorOrchestrator() {
  try {
    console.log("Fetching Main Workflow...");
    const workflow = await client.getWorkflow(MAIN_WORKFLOW_ID);

    // 1. Remove Old Nodes
    // We need to identify the nodes belonging to the old clusters.
    // Based on previous inspection, they are:
    // - "Fraud Classifier" (Agent) + its memory/model
    // - "Billing RAG Agent" + its memory/model/tools
    // - "High Priority RAG Agent" + its memory/model/tools

    const nodesToRemove = [
      // Fraud
      "Fraud Classifier",
      "Fraud Classifier Memory",
      // Billing
      "Billing RAG Agent",
      "Billing RAG Agent Memory",
      "Billing RAG Agent Postgres",
      // Priority
      "High Priority RAG Agent",
      "High Priority RAG Agent Memory",
      "High Priority RAG Agent Postgres",
    ];

    console.log(`Removing ${nodesToRemove.length} old nodes...`);
    workflow.nodes = workflow.nodes.filter(
      (n) => !nodesToRemove.includes(n.name)
    );

    // 2. Add Tool Workflow Nodes
    const toolNodes = [
      {
        parameters: { workflowId: FRAUD_ID },
        type: "@n8n/n8n-nodes-langchain.toolWorkflow",
        typeVersion: 1.1,
        position: [1100, 400] as [number, number],
        id: "tool_fraud",
        name: "Fraud Tool",
      },
      {
        parameters: { workflowId: BILLING_ID },
        type: "@n8n/n8n-nodes-langchain.toolWorkflow",
        typeVersion: 1.1,
        position: [1100, 600] as [number, number],
        id: "tool_billing",
        name: "Billing Tool",
      },
      {
        parameters: { workflowId: PRIORITY_ID },
        type: "@n8n/n8n-nodes-langchain.toolWorkflow",
        typeVersion: 1.1,
        position: [1100, 800] as [number, number],
        id: "tool_priority",
        name: "Priority Tool",
      },
    ];

    // Cast to any to bypass strict tuple check for now, or ensure WorkflowNode type is matched
    workflow.nodes.push(...(toolNodes as any[]));

    // 3. Connect Tools to Central Agent
    // The Central Agent is "AI Agent (Central)" (ID: 5cd15849-02c3-4414-a844-21e79b198800)
    // We need to add connections to its `ai_tool` input.

    if (!workflow.connections["AI Agent (Central)"]) {
      workflow.connections["AI Agent (Central)"] = {};
    }

    // Ensure ai_tool array exists
    // Note: In n8n JSON, connections are FROM source TO target.
    // So we need to find where "Tool Workflow" nodes connect TO the Agent.
    // Actually, for Tools, the connection is FROM the Tool Node TO the Agent Node's `ai_tool` input.

    // Let's rebuild the connections for these tools
    toolNodes.forEach((tool, index) => {
      if (!workflow.connections[tool.name]) {
        workflow.connections[tool.name] = {};
      }
      workflow.connections[tool.name].ai_tool = [
        [
          {
            node: "AI Agent (Central)",
            type: "ai_tool",
            index: 0,
          },
        ],
      ];
    });

    // 4. Clean up connections from removed nodes
    Object.keys(workflow.connections).forEach((source) => {
      if (nodesToRemove.includes(source)) {
        delete workflow.connections[source];
      } else {
        // Check outputs
        const conn = workflow.connections[source];
        Object.keys(conn).forEach((type) => {
          conn[type].forEach((output: any[], i: number) => {
            // Filter out connections to removed nodes
            conn[type][i] = output.filter(
              (target: any) => !nodesToRemove.includes(target.node)
            );
          });
        });
      }
    });

    console.log("Updating Workflow...");

    // Clean workflow object for update
    const updatePayload: any = {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings,
      staticData: workflow.staticData,
      meta: workflow.meta,
    };

    await client.updateWorkflow(MAIN_WORKFLOW_ID, updatePayload);
    console.log("✅ Successfully Refactored A9 to Fractal Architecture!");
  } catch (e: any) {
    console.error("❌ Error:", e.message);
    if (e.response) console.error(e.response.data);
  }
}

refactorOrchestrator();
