import axios from "axios";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const N8N_API_URL = process.env.N8N_API_URL || "http://localhost:5678/api/v1";
const N8N_API_KEY = process.env.N8N_API_KEY;

const client = axios.create({
  baseURL: N8N_API_URL,
  headers: { "X-N8N-API-KEY": N8N_API_KEY },
});

async function findFolder() {
  const targetName = "A9h8Zsm6kYpsmilu";
  console.log(`🔍 Searching for folder/tag: "${targetName}"...`);

  try {
    // 1. Check Tags
    const tagsResp = await client.get("/tags");
    console.log("Tags Response Type:", typeof tagsResp.data);
    console.log("Tags Response Keys:", Object.keys(tagsResp.data));

    let tags = [];
    if (Array.isArray(tagsResp.data)) {
      tags = tagsResp.data;
    } else if (tagsResp.data && Array.isArray(tagsResp.data.data)) {
      tags = tagsResp.data.data;
    } else {
      console.log(
        "Unknown tags structure:",
        JSON.stringify(tagsResp.data).substring(0, 200)
      );
      return;
    }

    const tag = tags.find((t: any) => t.name === targetName);

    if (tag) {
      console.log(`✅ Found TAG: ${tag.name} (ID: ${tag.id})`);
      return;
    }

    // 2. Check Projects (if available in this API version)
    // Note: n8n v1 API might not expose projects directly, but let's try common endpoints
    // or check if it's just a naming convention.

    console.log("❌ Could not find a Tag with that name.");
    console.log("Available Tags:", tags.map((t: any) => t.name).join(", "));
  } catch (error: any) {
    console.error("Error searching:", error.message);
  }
}

findFolder();
