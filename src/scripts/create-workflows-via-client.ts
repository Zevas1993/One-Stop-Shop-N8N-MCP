import { N8nApiClient } from "../services/n8n-api-client";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const N8N_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_KEY = process.env.N8N_API_KEY || "";

if (!N8N_KEY) {
  console.error("❌ N8N_API_KEY is missing");
  process.exit(1);
}

const client = new N8nApiClient({
  baseUrl: N8N_URL,
  apiKey: N8N_KEY,
});

async function createWorkflows() {
  try {
    console.log("1. Testing Connection...");
    const health = await client.healthCheck();
    console.log("✅ Health Check:", health);

    // Define the workflows to create
    const workflows = [
      "Fraud_Classifier_Agent.json",
      "Billing_RAG_Agent.json",
      "High_Priority_RAG_Agent.json",
    ];

    for (const wfFile of workflows) {
      console.log(`\nCreating ${wfFile}...`);
      const filePath = path.resolve(__dirname, "../../workflows", wfFile);
      const wfContent = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      // Remove ID to force creation of new workflow
      delete wfContent.id;

      try {
        const created = await client.createWorkflow(wfContent);
        console.log(`✅ Created "${created.name}" (ID: ${created.id})`);
      } catch (e: any) {
        console.error(`❌ Failed to create ${wfFile}:`, e.message);
      }
    }
  } catch (error: any) {
    console.error("❌ Fatal Error:", error.message);
    if (error.response) {
      console.error("Response:", error.response.data);
    }
  }
}

createWorkflows();
