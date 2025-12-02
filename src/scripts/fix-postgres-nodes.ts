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

async function fixPostgresNodes() {
  console.log("Fixing Postgres Nodes...");

  for (const [name, id] of Object.entries(IDS)) {
    console.log(`Processing ${name} (${id})...`);
    try {
      const wf = await client.getWorkflow(id);

      // Find the broken Postgres node
      const pgNode = wf.nodes.find((n) => n.name === "Postgres Vector Store");
      if (pgNode) {
        console.log(`Found broken node in ${name}. Updating type...`);
        // Try the legacy type name
        pgNode.type = "n8n-nodes-langchain.vectorStorePostgres";
        // Ensure credentials are correct (using the one from A9)
        pgNode.credentials = {
          postgres: {
            id: "D4g8S7jK9L2mN1bV",
            name: "Postgres account",
          },
        } as any;
      } else {
        console.warn(`Postgres Vector Store node not found in ${name}`);
      }

      // Also check for "Embeddings OpenAI" which might also be broken if langchain is missing
      const embedNode = wf.nodes.find((n) => n.name === "Embeddings OpenAI");
      if (embedNode) {
        // Ensure type is correct (it was @n8n/..., trying legacy just in case)
        // embedNode.type = 'n8n-nodes-langchain.embeddingsOpenAi';
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
    }
  }
}

fixPostgresNodes();
