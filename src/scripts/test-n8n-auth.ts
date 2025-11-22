import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.N8N_API_KEY;
const baseUrl = process.env.N8N_API_URL || "http://localhost:5678";

console.log(`Testing n8n API connection...`);
console.log(`URL: ${baseUrl}`);
console.log(`Key Length: ${apiKey?.length}`);
console.log(`Key Start: ${apiKey?.substring(0, 10)}...`);

async function testAuth() {
  try {
    // List workflows to verify creation
    console.log("\nAttempt 1: List Workflows");
    const response = await axios.get(`${baseUrl}/api/v1/workflows`, {
      headers: {
        "X-N8N-API-KEY": apiKey,
      },
      params: { limit: 10 },
    });
    console.log("✅ Success! Status:", response.status);
    console.log("Workflows found:", response.data.data.length);
    response.data.data.forEach((w: any) =>
      console.log(`- ${w.name} (ID: ${w.id})`)
    );
  } catch (error: any) {
    console.log(
      "❌ Failed:",
      error.response?.status,
      error.response?.statusText
    );
    console.log("Data:", JSON.stringify(error.response?.data, null, 2));
  }

  try {
    // Check if env var matches file
    const fs = require("fs");
    const envFile = fs.readFileSync(".env", "utf8");
    const fileKey = envFile.match(/N8N_API_KEY=(.*)/)?.[1];
    console.log("\nKey Verification:");
    console.log(
      "Env Var Key:",
      apiKey?.substring(0, 10) + "..." + apiKey?.substring(apiKey.length - 5)
    );
    console.log(
      "File Key:   ",
      fileKey?.substring(0, 10) + "..." + fileKey?.substring(fileKey.length - 5)
    );
    console.log("Match:", apiKey === fileKey);
  } catch (e) {
    console.log("Error reading .env file:", e);
  }
}

testAuth();
