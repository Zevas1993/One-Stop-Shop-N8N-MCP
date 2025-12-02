import { N8nApiClient } from "../services/n8n-api-client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const N8N_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_KEY = process.env.N8N_API_KEY || "";

const client = new N8nApiClient({ baseUrl: N8N_URL, apiKey: N8N_KEY });

async function listNodeTypes() {
  try {
    // Note: The endpoint might be /node-types or similar.
    // If N8nApiClient doesn't have it, we'll use the underlying axios client.
    // But N8nApiClient doesn't expose the client.
    // We'll try to use a raw axios call here for this specific debug task.

    const axios = require("axios");
    const response = await axios.get(`${N8N_URL}/node-types`, {
      headers: { "X-N8N-API-KEY": N8N_KEY },
    });

    const postgresNodes = response.data.data.filter(
      (n: any) =>
        n.name.toLowerCase().includes("postgres") ||
        n.displayName.toLowerCase().includes("postgres")
    );

    console.log("Found Postgres Nodes:");
    postgresNodes.forEach((n: any) => {
      console.log(`- Name: ${n.name}`);
      console.log(`  DisplayName: ${n.displayName}`);
      console.log(`  Group: ${n.group}`);
      console.log("---");
    });
  } catch (e: any) {
    console.error("Error listing node types:", e.message);
    if (e.response) {
      console.log("Status:", e.response.status);
      console.log("Data:", e.response.data);
    }
  }
}

listNodeTypes();
