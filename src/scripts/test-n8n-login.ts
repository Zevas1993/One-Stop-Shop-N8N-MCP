import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const username = process.env.N8N_USERNAME;
const password = process.env.N8N_PASSWORD;
const baseUrl = process.env.N8N_API_URL || "http://localhost:5678";

console.log(`Testing n8n Login...`);
console.log(`URL: ${baseUrl}`);
console.log(`User: ${username}`);

async function testLogin() {
  try {
    console.log("\nAttempt 5: Login via /rest/login");
    const response = await axios.post(`${baseUrl}/rest/login`, {
      email: username,
      emailOrLdapLoginId: username,
      password: password,
    });

    console.log("✅ Success! Status:", response.status);
    const cookies = response.headers["set-cookie"];
    if (cookies) {
      console.log("Cookies received:", cookies.length);
      const authCookie = cookies.find((c) => c.startsWith("n8n-auth"));
      console.log("Auth Cookie found:", !!authCookie);
      if (authCookie) {
        console.log("Cookie Value:", authCookie.split(";")[0]);
      }
    } else {
      console.log("❌ No cookies received");
    }
  } catch (error: any) {
    console.log(
      "❌ Failed:",
      error.response?.status,
      error.response?.statusText
    );
    if (error.response?.data) {
      console.log("Error Data:", JSON.stringify(error.response.data));
    }
  }
}

testLogin();
