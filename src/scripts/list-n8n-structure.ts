import axios from "axios";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const N8N_API_URL = process.env.N8N_API_URL || "http://localhost:5678/api/v1";
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_API_KEY) {
  console.error("Error: N8N_API_KEY is not set in .env");
  process.exit(1);
}

const client = axios.create({
  baseURL: N8N_API_URL,
  headers: {
    "X-N8N-API-KEY": N8N_API_KEY,
    "Content-Type": "application/json",
  },
});

async function inspectN8n() {
  try {
    console.log("🔍 Inspecting n8n instance...");

    // 1. List Workflows
    console.log("\n📂 Workflows:");
    const workflows = await client.get("/workflows");
    console.log("Type of workflows.data:", typeof workflows.data);
    console.log("Is Array:", Array.isArray(workflows.data));
    if (typeof workflows.data === "string") {
      console.log("First 100 chars:", workflows.data.substring(0, 100));
    }

    let workflowList = workflows.data;
    if (workflows.data.data) {
      workflowList = workflows.data.data;
    }

    if (!Array.isArray(workflowList)) {
      console.log("Workflow list is not an array");
      return;
    }

    workflowList.forEach((w: any) => {
      console.log(`- [${w.id}] ${w.name} (Active: ${w.active})`);
      if (w.tags && w.tags.length > 0) {
        console.log(`  Tags: ${JSON.stringify(w.tags)}`);
      }
    });

    // 2. List Tags
    console.log("\n🏷️ Tags:");
    try {
      const tags = await client.get("/tags");
      tags.data.data.forEach((t: any) => {
        console.log(`- [${t.id}] ${t.name}`);
      });
    } catch (e) {
      console.log("  (Tags endpoint not available or empty)");
    }

    // 3. Try to find "Projects" (if available in this version)
    // Note: n8n API might not expose projects directly in v1, but let's check.
  } catch (error: any) {
    console.error("❌ Error inspecting n8n:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
  }
}

inspectN8n();
