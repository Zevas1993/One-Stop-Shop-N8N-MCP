import { N8nApiClient } from "../services/n8n-api-client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const N8N_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_KEY = process.env.N8N_API_KEY || "";

const client = new N8nApiClient({ baseUrl: N8N_URL, apiKey: N8N_KEY });

const IDS = {
  BILLING: "r40EF82iuKMAdxBv",
  PRIORITY: "OlhZpICPxUsgNWMA",
};

async function switchToInMemory() {
  console.log("Switching to In-Memory Vector Store...");

  for (const [name, id] of Object.entries(IDS)) {
    console.log(`Processing ${name} (${id})...`);
    try {
      const wf = await client.getWorkflow(id);

      // Find the broken Postgres node
      const pgNodeIndex = wf.nodes.findIndex(
        (n) => n.name === "Postgres Vector Store"
      );
      if (pgNodeIndex !== -1) {
        console.log(
          `Found Postgres node in ${name}. Replacing with In-Memory...`
        );

        const oldNode = wf.nodes[pgNodeIndex];

        // Create new In-Memory node
        const newNode = {
          parameters: {},
          type: "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
          typeVersion: 1,
          position: oldNode.position,
          id: oldNode.id, // Keep ID to preserve connections if possible
          name: "In-Memory Vector Store",
        };

        // Replace node
        wf.nodes[pgNodeIndex] = newNode;

        // Update connections
        // We need to update any connection pointing TO "Postgres Vector Store" to point to "In-Memory Vector Store"
        // And any connection FROM "Postgres Vector Store" (e.g. to Embeddings)

        // Actually, if we keep the ID, connections *might* persist if they reference ID?
        // No, n8n connections reference "node" name.

        // Update connections object
        const newConnections: any = {};

        Object.keys(wf.connections).forEach((sourceName) => {
          if (sourceName === "Postgres Vector Store") {
            // This is the source (e.g. connecting to Embeddings? No, Embeddings connects TO Vector Store usually?
            // Wait, in n8n LangChain:
            // Vector Store has input "ai_embedding" from Embeddings Node.
            // Vector Store has NO output usually (it's a leaf/tool helper).
            // BUT it is an input to the "Tool Vector Store" node.

            // So:
            // Tool Vector Store -> (ai_vectorStore) -> Postgres Vector Store
            // Embeddings -> (ai_embedding) -> Postgres Vector Store

            // We need to rename the key "Postgres Vector Store" to "In-Memory Vector Store" IF it has outputs (unlikely).
            // We need to update targets in other keys.

            newConnections["In-Memory Vector Store"] =
              wf.connections[sourceName];
          } else {
            // Check outputs of this source
            const outputs = wf.connections[sourceName];
            const newOutputs: any = {};

            Object.keys(outputs).forEach((type) => {
              newOutputs[type] = outputs[type].map((conn: any[]) => {
                return conn.map((c: any) => {
                  if (c.node === "Postgres Vector Store") {
                    return { ...c, node: "In-Memory Vector Store" };
                  }
                  return c;
                });
              });
            });

            newConnections[sourceName] = newOutputs;
          }
        });

        wf.connections = newConnections;
      } else {
        console.warn(`Postgres Vector Store node not found in ${name}`);
      }

      // Clean payload
      const payload = {
        name: wf.name,
        nodes: wf.nodes,
        connections: wf.connections,
        settings: wf.settings,
        staticData: wf.staticData,
        meta: wf.meta,
      };

      await client.updateWorkflow(id, payload);
      console.log(`✅ Updated ${name}`);
    } catch (e: any) {
      console.error(`❌ Failed to update ${name}:`, e.message);
      if (e.response) console.error(e.response.data);
    }
  }
}

switchToInMemory();
