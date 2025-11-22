import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.N8N_API_KEY;
const username = process.env.N8N_USERNAME;
const password = process.env.N8N_PASSWORD;
const baseUrl = process.env.N8N_API_URL || "http://localhost:5678";

console.log(`Testing n8n Auth Combinations...`);

async function testCombo() {
  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  try {
    console.log("\nAttempt 6: Basic Auth + X-N8N-API-KEY");
    const response = await axios.get(`${baseUrl}/api/v1/users`, {
      headers: {
        Authorization: `Basic ${auth}`,
        "X-N8N-API-KEY": apiKey,
      },
    });
    console.log("✅ Success! Status:", response.status);
  } catch (error: any) {
    console.log(
      "❌ Failed:",
      error.response?.status,
      error.response?.statusText
    );
  }
}

testCombo();
