import axios from "axios";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const N8N_API_URL = process.env.N8N_API_URL || "http://localhost:5678/api/v1";
const N8N_API_KEY = process.env.N8N_API_KEY;

console.log(
  `🔍 Diagnosing Auth for Key ending in ...${N8N_API_KEY?.slice(-4)}`
);

async function testMethod(name: string, config: any) {
  try {
    console.log(`\nTesting ${name}...`);
    const resp = await axios.get(`${N8N_API_URL}/users/me`, {
      ...config,
      validateStatus: () => true,
    });

    const contentType = resp.headers["content-type"];
    console.log(`   Status: ${resp.status}`);
    console.log(`   Type: ${contentType}`);

    if (resp.status === 200 && contentType?.includes("application/json")) {
      console.log("   ✅ SUCCESS! This method works.");
      console.log("   User:", resp.data.email || resp.data.id);
      return true;
    } else {
      console.log("   ❌ Failed (HTML or Error).");
    }
  } catch (e: any) {
    console.log(`   ❌ Error: ${e.message}`);
  }
  return false;
}

async function run() {
  // 1. Standard Header
  await testMethod("X-N8N-API-KEY Header", {
    headers: { "X-N8N-API-KEY": N8N_API_KEY },
  });

  // 2. Bearer Token (Since it looks like a JWT)
  await testMethod("Authorization: Bearer Header", {
    headers: { Authorization: `Bearer ${N8N_API_KEY}` },
  });

  // 3. Query Param
  await testMethod("apikey Query Param", {
    params: { apikey: N8N_API_KEY },
  });
}

run();
