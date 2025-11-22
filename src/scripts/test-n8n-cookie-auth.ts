import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.N8N_API_KEY;
const baseUrl = process.env.N8N_API_URL || "http://localhost:5678";

console.log(`Testing n8n Auth with Cookie...`);
console.log(`URL: ${baseUrl}`);

async function testCookieAuth() {
  try {
    // Try using the key as a cookie against the internal API (used by frontend)
    // Internal API usually runs on /rest/ or /api/v1 with cookie
    console.log("\nAttempt 3: Cookie Auth (n8n-auth)");

    const response = await axios.get(`${baseUrl}/rest/users`, {
      headers: {
        Cookie: `n8n-auth=${apiKey}`,
      },
    });
    console.log("✅ Success! Status:", response.status);
    console.log("User email:", response.data.data?.[0]?.email);
    console.log("This confirms the token is a SESSION COOKIE, not an API KEY.");
  } catch (error: any) {
    console.log(
      "❌ Failed:",
      error.response?.status,
      error.response?.statusText
    );
    if (error.response?.status === 404) {
      console.log("Endpoint not found (might be wrong path for internal API)");
    }
  }
}

testCookieAuth();
