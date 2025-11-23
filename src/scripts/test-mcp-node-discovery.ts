import { spawn } from "child_process";
import * as readline from "readline";
import * as path from "path";

async function testNodeDiscovery() {
  console.log("🚀 Starting MCP Node Discovery Test...");

  // Use ts-node to run from src to pick up changes
  const serverPath = path.join(process.cwd(), "src/mcp/index.ts");
  const server = spawn("node", ["-r", "ts-node/register", serverPath], {
    env: { ...process.env, MCP_MODE: "stdio" },
    stdio: ["pipe", "pipe", "inherit"],
  });

  const rl = readline.createInterface({
    input: server.stdout,
    output: process.stdout,
    terminal: false,
  });

  let isStarted = false;

  // Helper to send JSON-RPC request
  const sendRequest = (method: string, params: any, id: number) => {
    const request = { jsonrpc: "2.0", method, params, id };
    server.stdin.write(JSON.stringify(request) + "\n");
  };

  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line);

      // Handle initialization
      if (!isStarted && msg.result && msg.result.capabilities) {
        isStarted = true;
        console.log("✅ Server Initialized");

        // Send node_discovery request
        console.log("🔍 Searching for 'openai' nodes...");
        sendRequest(
          "tools/call",
          {
            name: "node_discovery",
            arguments: {
              action: "search",
              query: "openai",
            },
          },
          2
        );
      }

      // Handle tool response
      if (msg.id === 2) {
        if (msg.error) {
          console.error("❌ Error:", msg.error);
        } else {
          console.log("✅ Received Response:");
          const content = JSON.parse(msg.result.content[0].text);
          console.log(JSON.stringify(content, null, 2));

          if (content.length > 0) {
            console.log(
              `\n✅ SUCCESS: Found ${content.length} nodes matching 'outlook'.`
            );
          } else {
            console.log("\n⚠️  WARNING: No nodes found.");
          }
        }
        process.exit(0);
      }
    } catch (e) {
      // Ignore non-JSON lines
    }
  });

  // Start initialization
  sendRequest(
    "initialize",
    {
      protocolVersion: "2024-11-05",
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
    1
  );
}

testNodeDiscovery().catch(console.error);
