const axios = require("axios");
const result = require("dotenv").config();

// Use the parsed value directly to avoid environment override issues
const N8N_PASSWORD = result.parsed?.N8N_PASSWORD || process.env.N8N_PASSWORD;

async function testSessionLogin() {
  console.log("Testing session login to n8n...");
  console.log("URL:", process.env.N8N_API_URL);
  console.log("Username:", process.env.N8N_USERNAME);
  console.log("Password:", N8N_PASSWORD ? "***" : "NOT SET");
  console.log("Password length:", N8N_PASSWORD?.length);

  if (!process.env.N8N_USERNAME || !N8N_PASSWORD) {
    console.log("Session auth credentials not set in .env");
    return;
  }

  try {
    const response = await axios.post(
      process.env.N8N_API_URL + "/rest/login",
      {
        // n8n uses emailOrLdapLoginId instead of email
        emailOrLdapLoginId: process.env.N8N_USERNAME,
        password: N8N_PASSWORD,
      },
      {
        headers: { "Content-Type": "application/json" },
        withCredentials: true,
        validateStatus: () => true,
      }
    );

    console.log("\nResponse Status:", response.status);

    if (response.headers["set-cookie"]) {
      console.log(
        "Set-Cookie headers found:",
        response.headers["set-cookie"].length
      );
      const cookies = response.headers["set-cookie"];
      for (const cookie of cookies) {
        if (cookie.includes("n8n-auth")) {
          console.log("\n✓ Got n8n-auth cookie!");
          const match = cookie.match(/n8n-auth=([^;]+)/);
          if (match) {
            console.log(
              "Cookie value (first 50 chars):",
              match[1].substring(0, 50) + "..."
            );

            // Now test /types/nodes.json with the cookie
            console.log("\nTesting /types/nodes.json with session cookie...");
            const nodesResponse = await axios.get(
              process.env.N8N_API_URL + "/types/nodes.json",
              {
                headers: {
                  Cookie: "n8n-auth=" + match[1],
                },
                validateStatus: () => true,
              }
            );
            console.log("Nodes response status:", nodesResponse.status);
            if (
              nodesResponse.status === 200 &&
              Array.isArray(nodesResponse.data)
            ) {
              console.log(
                "✓ Got",
                nodesResponse.data.length,
                "nodes from /types/nodes.json!"
              );

              // Show some sample nodes
              console.log("\nSample nodes:");
              nodesResponse.data.slice(0, 5).forEach((node) => {
                console.log(
                  "  -",
                  node.name || node.type,
                  ":",
                  node.displayName || "no displayName"
                );
              });
            } else {
              console.log(
                "Response type:",
                typeof nodesResponse.data,
                Array.isArray(nodesResponse.data)
                  ? "array"
                  : typeof nodesResponse.data
              );
              if (nodesResponse.data && nodesResponse.data.message) {
                console.log("Error message:", nodesResponse.data.message);
              }
            }
          }
        }
      }
    } else {
      console.log("No Set-Cookie header");
    }

    if (response.status === 200) {
      console.log("\nLogin response keys:", Object.keys(response.data));
      console.log("User:", response.data.email || response.data.id);
    } else {
      console.log("\nLogin failed:", response.data);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testSessionLogin();
