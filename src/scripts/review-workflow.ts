import { spawn } from "child_process";
import path from "path";
import dotenv from "dotenv";

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Configuration
const SERVER_PATH = path.resolve(__dirname, "../mcp/index.ts");
const N8N_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = "A9h8Zsm6kYpsmilu";

// Helper to create JSON-RPC request
function createRequest(id: number, method: string, params?: any) {
  return (
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }) + "\n"
  );
}

async function runReview() {
  console.log(`🚀 Starting Workflow Review for ID: ${WORKFLOW_ID}...`);

  // Start MCP Server with verbose logging enabled
  const serverProcess = spawn(
    "npx",
    ["ts-node", "--transpile-only", `"${SERVER_PATH}"`],
    {
      env: {
        ...process.env,
        MCP_MODE: "stdio",
        N8N_API_URL: N8N_URL,
        N8N_API_KEY: N8N_KEY,
        NODE_ENV: "development",
        DEBUG_MCP: "true",
      },
      stdio: ["pipe", "pipe", "pipe"], // Capture stderr
      shell: true,
    }
  );

  const stdin = serverProcess.stdin;
  const stdout = serverProcess.stdout;
  const stderr = serverProcess.stderr;

  if (!stdin || !stdout || !stderr) {
    throw new Error("Failed to access server streams");
  }

  // Capture logs
  stderr.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      console.log(`[SERVER LOG] ${line}`);
    }
  });

  // Listen for responses
  stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        if (response.id === 1) {
          console.log("✅ Server Initialized");

          console.log(`📤 Fetching workflow ${WORKFLOW_ID}...`);
          stdin.write(
            createRequest(2, "tools/call", {
              name: "workflow_manager",
              arguments: {
                action: "get",
                id: WORKFLOW_ID,
              },
            })
          );
        } else if (response.id === 2) {
          console.log("📥 Received fetch response");
          const result = response.result;
          if (result && result.content) {
            const content = JSON.parse(result.content[0].text);
            if (content.success && content.data) {
              console.log("✅ Workflow fetched successfully");
              let workflow = content.data;

              // Clean workflow for validation (remove read-only fields)
              const {
                id,
                active,
                createdAt,
                updatedAt,
                versionId,
                versionCounter,
                triggerCount,
                isArchived,
                description,
                shared,
                ...cleanWorkflow
              } = workflow;
              workflow = cleanWorkflow;

              console.log(`📤 Sending validate request...`);
              stdin.write(
                createRequest(3, "tools/call", {
                  name: "workflow_manager",
                  arguments: {
                    action: "validate",
                    workflow,
                    mode: "full",
                  },
                })
              );
            } else {
              console.error("❌ Failed to fetch workflow:", content.error);
              serverProcess.kill();
              process.exit(1);
            }
          }
        } else if (response.id === 3) {
          console.log("📥 Received review response:");
          console.log(JSON.stringify(response, null, 2));

          if (response.result && response.result.content) {
            const content = JSON.parse(response.result.content[0].text);
            console.log("\n--- REVIEW SUMMARY ---");
            console.log(`Valid: ${content.valid}`);
            if (content.statistics) {
              console.log("Statistics:", content.statistics);
            }
            if (content.errors && content.errors.length > 0) {
              console.log("\n❌ Errors:");
              content.errors.forEach((e: any) =>
                console.log(`- ${JSON.stringify(e)}`)
              );
            }
            if (content.warnings && content.warnings.length > 0) {
              console.log("\n⚠️ Warnings:");
              content.warnings.forEach((w: any) =>
                console.log(`- ${w.message}`)
              );
            }
            if (content.suggestions && content.suggestions.length > 0) {
              console.log("\n💡 Suggestions:");
              content.suggestions.forEach((s: any) =>
                console.log(`- ${s.message || s}`)
              );
            }
          }

          serverProcess.kill();
          process.exit(0);
        }
      } catch (e) {
        // Ignore
      }
    }
  });

  // Initialize
  stdin.write(
    createRequest(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "review-script", version: "1.0.0" },
    })
  );
}

runReview().catch(console.error);
