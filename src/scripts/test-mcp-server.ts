import { spawn } from "child_process";
import path from "path";
import * as readline from "readline";

// Path to the built server
const SERVER_PATH = path.resolve(__dirname, "../../dist/mcp/index.js");

// JSON-RPC 2.0 Message Helper
let msgId = 0;
const createRequest = (method: string, params?: any) => ({
  jsonrpc: "2.0",
  id: msgId++,
  method,
  params,
});

const createNotification = (method: string, params?: any) => ({
  jsonrpc: "2.0",
  method,
  params,
});

async function runTest() {
  console.log(`🚀 Starting MCP Server from: ${SERVER_PATH}`);

  const serverProcess = spawn("node", [SERVER_PATH], {
    env: { ...process.env, MCP_MODE: "consolidated" },
    stdio: ["pipe", "pipe", "inherit"], // Pipe stdin/stdout, inherit stderr for logs
  });

  const rl = readline.createInterface({ input: serverProcess.stdout });

  const pendingRequests = new Map<number, (response: any) => void>();

  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pendingRequests.has(msg.id)) {
        const resolve = pendingRequests.get(msg.id);
        if (resolve) {
          resolve(msg);
          pendingRequests.delete(msg.id);
        }
      } else if (msg.method) {
        console.log(`🔔 Notification/Request from server: ${msg.method}`);
      }
    } catch (e) {
      console.log(`[Raw Output]: ${line}`);
    }
  });

  const send = async (method: string, params?: any) => {
    const req = createRequest(method, params);
    console.log(`\n➡️  Sending ${method}...`);

    const promise = new Promise<any>((resolve) => {
      pendingRequests.set(req.id, resolve);
    });

    serverProcess.stdin.write(JSON.stringify(req) + "\n");
    return promise;
  };

  const sendNotification = (method: string, params?: any) => {
    const notif = createNotification(method, params);
    serverProcess.stdin.write(JSON.stringify(notif) + "\n");
  };

  try {
    // 1. Initialize
    const initRes = await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
      clientInfo: { name: "tester", version: "1.0.0" },
    });
    console.log("✅ Initialized:", JSON.stringify(initRes.result, null, 2));

    sendNotification("notifications/initialized");

    // 2. List Tools
    const toolsRes = await send("tools/list");
    console.log(`✅ Found ${toolsRes.result.tools.length} tools`);
    toolsRes.result.tools.forEach((t: any) =>
      console.log(`   - ${t.name}: ${t.description}`)
    );

    // 3. List Resources
    const resourcesRes = await send("resources/list");
    console.log(`✅ Found ${resourcesRes.result.resources.length} resources`);
    resourcesRes.result.resources.forEach((r: any) =>
      console.log(`   - ${r.name} (${r.uri})`)
    );

    // 4. List Prompts
    const promptsRes = await send("prompts/list");
    console.log(`✅ Found ${promptsRes.result.prompts.length} prompts`);
    promptsRes.result.prompts.forEach((p: any) =>
      console.log(`   - ${p.name}: ${p.description}`)
    );

    // 5. Test Tool: node_discovery (search)
    console.log('\n🧪 Testing Tool: node_discovery (search="slack")');
    const searchRes = await send("tools/call", {
      name: "node_discovery",
      arguments: { action: "search", query: "slack", limit: 2 },
    });

    if (searchRes.error) {
      console.error("❌ Tool Call Failed:", searchRes.error);
    } else {
      const content = JSON.parse(searchRes.result.content[0].text);
      console.log(
        "✅ Search Result:",
        JSON.stringify(content, null, 2).substring(0, 500) + "..."
      );
    }

    // 6. Test Prompt: explain-node
    console.log(
      '\n🧪 Testing Prompt: explain-node (nodeType="n8n-nodes-base.slack")'
    );
    const promptRes = await send("prompts/get", {
      name: "explain-node",
      arguments: { nodeType: "n8n-nodes-base.slack" },
    });

    if (promptRes.error) {
      console.error("❌ Prompt Get Failed:", promptRes.error);
    } else {
      console.log(
        "✅ Prompt Result:",
        promptRes.result.messages[0].content.text.substring(0, 200) + "..."
      );
    }
  } catch (error) {
    console.error("💥 Test failed:", error);
  } finally {
    console.log("\n🛑 Stopping server...");
    serverProcess.kill();
    process.exit(0);
  }
}

runTest();
