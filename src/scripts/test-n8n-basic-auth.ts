import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const username = process.env.N8N_USERNAME;
const password = process.env.N8N_PASSWORD;
const baseUrl = process.env.N8N_API_URL || "http://localhost:5678";

console.log(`Testing n8n Basic Auth...`);
console.log(`URL: ${baseUrl}`);
console.log(`User: ${username}`);

async function testBasicAuth() {
  try {
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    console.log("\nAttempt 4: Basic Auth");

    const response = await axios.get(`${baseUrl}/api/v1/users`, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });
    console.log("✅ Success! Status:", response.status);
    console.log("User count:", response.data.data?.length);
  } catch (error: any) {
    console.log(
      "❌ Failed:",
      error.response?.status,
      error.response?.statusText
    );
  }
}

testBasicAuth();
