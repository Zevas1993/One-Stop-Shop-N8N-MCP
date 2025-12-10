const { spawn } = require("child_process");

const server = spawn("node", ["dist/main.js"], {
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
let requestId = 1;
let results = [];

function sendRequest(method, params = {}) {
  const id = requestId++;
  const request = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };
  server.stdin.write(JSON.stringify(request) + "\n");
  return id;
}

server.stdout.on("data", (data) => {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop();

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const response = JSON.parse(line);
      if (response.id === 1 && response.result) {
        console.log("✓ Server initialized\n");

        // Test all node discovery tools
        sendRequest("tools/call", {
          name: "n8n_search_nodes",
          arguments: { query: "code" },
        });
      } else if (response.id === 2 && response.result) {
        const data = JSON.parse(response.result.content[0].text);
        console.log('1. n8n_search_nodes (query: "code"):');
        console.log(`   Found ${data.nodes?.length || 0} nodes`);
        if (data.nodes && data.nodes.length > 0) {
          data.nodes.slice(0, 3).forEach((n) => {
            console.log(`   - ${n.name}: ${n.displayName || "no description"}`);
          });
        }
        console.log("");

        sendRequest("tools/call", {
          name: "n8n_list_ai_nodes",
          arguments: {},
        });
      } else if (response.id === 3 && response.result) {
        const data = JSON.parse(response.result.content[0].text);
        console.log("2. n8n_list_ai_nodes:");
        console.log(`   Found ${data.nodes?.length || 0} AI nodes`);
        if (data.nodes && data.nodes.length > 0) {
          data.nodes.slice(0, 5).forEach((n) => {
            console.log(`   - ${n.name}: ${n.displayName || ""}`);
          });
        }
        console.log("");

        sendRequest("tools/call", {
          name: "n8n_get_node_info",
          arguments: { nodeType: "n8n-nodes-base.code" },
        });
      } else if (response.id === 4 && response.result) {
        const data = JSON.parse(response.result.content[0].text);
        console.log("3. n8n_get_node_info (n8n-nodes-base.code):");
        if (data.success && data.node) {
          console.log(`   Name: ${data.node.name}`);
          console.log(`   Display: ${data.node.displayName}`);
          console.log(`   Version: ${data.node.version}`);
          console.log(`   Description: ${data.node.description?.substring(0, 60)}...`);
        } else {
          console.log(`   Error: ${data.error || "unknown"}`);
        }
        console.log("");

        sendRequest("tools/call", {
          name: "n8n_list_trigger_nodes",
          arguments: {},
        });
      } else if (response.id === 5 && response.result) {
        const data = JSON.parse(response.result.content[0].text);
        console.log("4. n8n_list_trigger_nodes:");
        console.log(`   Found ${data.nodes?.length || 0} trigger nodes`);
        if (data.nodes && data.nodes.length > 0) {
          data.nodes.slice(0, 5).forEach((n) => {
            console.log(`   - ${n.name}`);
          });
        }
        console.log("");

        sendRequest("tools/call", {
          name: "n8n_status",
          arguments: {},
        });
      } else if (response.id === 6 && response.result) {
        const data = JSON.parse(response.result.content[0].text);
        console.log("5. n8n_status:");
        console.log(`   Connected: ${data.connected}`);
        console.log(`   Node Catalog: ${data.nodeCatalog?.nodeCount || 0} nodes`);
        console.log(`   Credentials: ${data.credentials?.count || 0}`);
        console.log("");
        console.log("✓ All node discovery tests complete!");

        setTimeout(() => {
          server.kill();
          process.exit(0);
        }, 100);
      }
    } catch (e) {
      // Skip non-JSON lines
    }
  }
});

server.stderr.on("data", (data) => {
  // Only show errors, not info logs
  const msg = data.toString();
  if (msg.includes("error") || msg.includes("Error")) {
    console.error("[stderr]", msg);
  }
});

// Initialize
sendRequest("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "test", version: "1.0.0" },
});

setTimeout(() => {
  console.log("\nTimeout reached - server may be slow");
  server.kill();
  process.exit(1);
}, 30000);
