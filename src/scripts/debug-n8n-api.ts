import axios from "axios";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const N8N_API_URL = process.env.N8N_API_URL || "http://localhost:5678/api/v1";
const N8N_API_KEY = process.env.N8N_API_KEY;

console.log(`Testing Connection to: ${N8N_API_URL}`);
console.log(`API Key Present: ${!!N8N_API_KEY}`);

const client = axios.create({
  baseURL: N8N_API_URL,
  headers: {
    "X-N8N-API-KEY": N8N_API_KEY,
    "Content-Type": "application/json",
  },
  validateStatus: () => true, // Don't throw on error
});

async function testConnection() {
  try {
    // 1. Test Health/User endpoint
    console.log("\n1. Testing /users/me (Auth Check)...");
    const userResp = await client.get("/users/me");
    console.log(`Status: ${userResp.status} ${userResp.statusText}`);
    console.log("Headers:", JSON.stringify(userResp.headers, null, 2));
    if (userResp.status === 200) {
      console.log("User Data:", JSON.stringify(userResp.data, null, 2));
    } else {
      console.log(
        "Response Data (First 200 chars):",
        JSON.stringify(userResp.data).substring(0, 200)
      );
    }

    // 2. Test Workflows endpoint
    console.log("\n2. Testing /workflows...");
    const wfResp = await client.get("/workflows?limit=1");
    console.log(`Status: ${wfResp.status} ${wfResp.statusText}`);
    if (wfResp.status === 200) {
      console.log("Success! API is accessible.");
    } else {
      console.log("Failed to access workflows.");
    }
  } catch (error: any) {
    console.error("❌ Fatal Error:", error.message);
  }
}

testConnection();
