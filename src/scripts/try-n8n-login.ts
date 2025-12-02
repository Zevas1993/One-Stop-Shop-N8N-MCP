import axios from "axios";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const N8N_BASE_URL = "http://localhost:5678";
const USERNAME = process.env.N8N_USERNAME;
const PASSWORD = process.env.N8N_PASSWORD;

console.log(`Attempting login to ${N8N_BASE_URL} as ${USERNAME}...`);

async function tryLogin() {
  try {
    const response = await axios.post(
      `${N8N_BASE_URL}/login`,
      {
        email: USERNAME,
        password: PASSWORD,
      },
      {
        maxRedirects: 0,
        validateStatus: () => true,
      }
    );

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.status === 200 || response.status === 302) {
      console.log("✅ Login Successful!");
      const cookies = response.headers["set-cookie"];
      if (cookies) {
        console.log("🍪 Received Cookies:", cookies);
        // Now try to use the cookie to list workflows
        await listWorkflowsWithCookie(cookies);
      } else {
        console.log("⚠️ No cookies received.");
      }
    } else {
      console.log("❌ Login Failed.");
      console.log("Response:", JSON.stringify(response.data).substring(0, 200));
    }
  } catch (error: any) {
    console.error("Error during login:", error.message);
  }
}

async function listWorkflowsWithCookie(cookies: string[]) {
  console.log("\nTesting API access with Cookie...");
  try {
    const client = axios.create({
      baseURL: `${N8N_BASE_URL}/api/v1`,
      headers: {
        Cookie: cookies.join("; "),
      },
    });

    const resp = await client.get("/workflows?limit=1");
    console.log(`API Status: ${resp.status}`);
    if (resp.status === 200) {
      console.log("✅ API Access Confirmed via Cookie!");
      console.log("Workflows found:", resp.data.data.length);
    } else {
      console.log("❌ API Access Failed with Cookie.");
    }
  } catch (e: any) {
    console.log(`API Error: ${e.message}`);
  }
}

tryLogin();
