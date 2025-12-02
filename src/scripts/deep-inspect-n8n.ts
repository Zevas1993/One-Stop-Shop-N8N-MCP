import axios from "axios";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const N8N_API_URL = process.env.N8N_API_URL || "http://localhost:5678/api/v1";
const N8N_API_KEY = process.env.N8N_API_KEY;

const client = axios.create({
  baseURL: N8N_API_URL,
  headers: { "X-N8N-API-KEY": N8N_API_KEY },
  validateStatus: () => true,
});

async function deepInspect() {
  console.log(`🔍 Deep Inspecting n8n at ${N8N_API_URL}`);

  // 1. Check Auth & Response Type
  console.log("\n1. Checking Auth (/users/me)...");
  const authResp = await client.get("/users/me");
  const contentType = authResp.headers["content-type"];
  console.log(`   Status: ${authResp.status}`);
  console.log(`   Content-Type: ${contentType}`);

  if (contentType && contentType.includes("text/html")) {
    console.error(
      "❌ API returned HTML (Login Page). API Key is invalid or not being accepted."
    );
    console.log(
      "   Body Preview:",
      JSON.stringify(authResp.data).substring(0, 100)
    );
    return; // Stop here if auth fails
  }

  console.log("✅ Auth seems valid (JSON response).");

  // 2. Search for "A9h8Zsm6kYpsmilu"
  const target = "A9h8Zsm6kYpsmilu";
  console.log(`\n2. Searching for "${target}"...`);

  // Check Tags
  try {
    const tagsResp = await client.get("/tags");
    const tags = tagsResp.data.data || tagsResp.data;
    if (Array.isArray(tags)) {
      const match = tags.find((t: any) => t.name === target);
      if (match) {
        console.log(`✅ Found TAG: ${match.name} (ID: ${match.id})`);
      } else {
        console.log(`   Not found in ${tags.length} tags.`);
      }
    }
  } catch (e: any) {
    console.log(`   Error checking tags: ${e.message}`);
  }

  // Check Projects (if available)
  try {
    const projResp = await client.get("/projects"); // Guessing endpoint
    if (projResp.status === 200) {
      const projects = projResp.data.data || projResp.data;
      console.log(`   Found ${projects.length} projects.`);
      // console.log(JSON.stringify(projects, null, 2));
    } else {
      console.log(`   /projects endpoint returned ${projResp.status}`);
    }
  } catch (e: any) {
    console.log(`   Error checking projects: ${e.message}`);
  }

  // Check Workflows (maybe it's a workflow name?)
  try {
    const wfResp = await client.get("/workflows");
    const wfs = wfResp.data.data || wfResp.data;
    if (Array.isArray(wfs)) {
      const match = wfs.find((w: any) => w.name === target);
      if (match) {
        console.log(`✅ Found WORKFLOW: ${match.name} (ID: ${match.id})`);
      } else {
        console.log(`   Not found in ${wfs.length} workflows.`);
      }
    }
  } catch (e: any) {
    console.log(`   Error checking workflows: ${e.message}`);
  }
}

deepInspect();
