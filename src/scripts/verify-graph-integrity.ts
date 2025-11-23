import { spawn } from "child_process";
import * as readline from "readline";
import * as path from "path";

async function verifyGraphIntegrity() {
  console.log("🚀 Starting Graph RAG Integrity Verification...");

  // Spawn MCP Server
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
  let discoveryRequestId = 2;

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

        // List ALL nodes to verify integrity
        console.log("🔍 Scanning entire Graph RAG Catalog...");
        sendRequest(
          "tools/call",
          {
            name: "node_discovery",
            arguments: {
              action: "list",
              category: "all",
              limit: 1000,
            },
          },
          discoveryRequestId
        );
      }

      // Handle Discovery Response
      if (msg.id === discoveryRequestId) {
        if (msg.error) {
          console.error("❌ Discovery Error:", msg.error);
          process.exit(1);
        }

        const content = JSON.parse(msg.result.content[0].text);
        const nodes = content.nodes || [];

        console.log(`\n📊 Graph RAG Integrity Report`);
        console.log(`---------------------------------------------------`);
        console.log(`Total Nodes Indexed: ${nodes.length}`);

        let validCount = 0;
        let warningCount = 0;
        let errorCount = 0;
        const issues: string[] = [];

        nodes.forEach((node: any) => {
          let isValid = true;
          const nodeIssues: string[] = [];

          // Check required metadata
          if (!node.name && !node.displayName) {
            nodeIssues.push("Missing Name/DisplayName");
            isValid = false;
          }
          if (!node.nodeType) {
            nodeIssues.push("Missing NodeType");
            isValid = false;
          }
          if (
            !node.description ||
            node.description === "No description available"
          ) {
            // Warning only, not critical error
            warningCount++;
          }

          if (isValid) {
            validCount++;
          } else {
            errorCount++;
            issues.push(
              `[${node.nodeType || "UNKNOWN"}] ${nodeIssues.join(", ")}`
            );
          }
        });

        console.log(`✅ Valid Nodes: ${validCount}`);
        console.log(`⚠️  Warnings (e.g. missing desc): ${warningCount}`);
        console.log(`❌ Critical Errors: ${errorCount}`);

        if (issues.length > 0) {
          console.log("\n🛑 Integrity Issues Found:");
          issues.forEach((issue) => console.log(`   - ${issue}`));
        } else {
          console.log(
            "\n✅ Graph RAG Integrity Verified: All nodes have valid metadata."
          );
        }

        // Verify specific AI nodes exist
        console.log("\n🔍 Debugging AI Node Detection:");
        const aiNodes = nodes.filter(
          (n: any) =>
            n.category === "AI" ||
            n.nodeType.toLowerCase().includes("chat") ||
            n.nodeType.toLowerCase().includes("langchain") ||
            n.nodeType.toLowerCase().includes("openai")
        );
        console.log(`   - Total nodes scanned: ${nodes.length}`);
        console.log(`   - AI/LangChain Nodes Detected: ${aiNodes.length}`);

        // Print first 5 AI nodes found for debugging
        if (aiNodes.length > 0) {
          console.log("   - Sample AI Nodes:");
          aiNodes
            .slice(0, 5)
            .forEach((n: any) =>
              console.log(`     * ${n.nodeType} (${n.category})`)
            );
        }

        const requiredModels = [
          { type: "lmChatOpenAi", name: "OpenAI Chat Model" },
          { type: "lmChatAnthropic", name: "Anthropic Chat Model" },
          { type: "lmChatGoogleGemini", name: "Google Gemini Chat Model" },
          { type: "lmChatAzureOpenAi", name: "Azure OpenAI Chat Model" },
        ];

        requiredModels.forEach((req) => {
          const found = aiNodes.find((n: any) => n.nodeType.includes(req.type));
          if (found) {
            console.log(`   - ✅ ${req.name} found: ${found.nodeType}`);
          } else {
            console.log(`   - ❌ ${req.name} NOT found in catalog!`);
          }
        });

        console.log("---------------------------------------------------");
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
      clientInfo: { name: "integrity-checker", version: "1.0.0" },
    },
    1
  );
}

verifyGraphIntegrity().catch(console.error);
