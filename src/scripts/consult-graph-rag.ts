import { spawn } from "child_process";
import * as readline from "readline";
import * as path from "path";

// Configuration
const GOAL =
  "Monitor Outlook emails, use RAG to answer questions, and reply via Teams";
const SERVER_PATH = path.join(process.cwd(), "dist/mcp/index.js");

let requestId = 0;
const responses = new Map();

// Start the MCP server
console.log(`[Client] Starting MCP server at ${SERVER_PATH}...`);
const server = spawn("node", [SERVER_PATH], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "pipe"],
});

// Handle server output
const rl = readline.createInterface({
  input: server.stdout,
  terminal: false,
});

rl.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    if (message.result && message.id) {
      const content = message.result.content?.[0]?.text;
      if (content) {
        try {
          responses.set(message.id, {
            success: true,
            data: JSON.parse(content),
          });
        } catch (e) {
          responses.set(message.id, { success: true, data: content });
        }
      }
    } else if (message.error && message.id) {
      responses.set(message.id, { success: false, error: message.error });
    }
  } catch (e) {
    // Ignore non-JSON lines (logs)
  }
});

server.stderr.on("data", (data) => {
  // console.error(`[Server Error] ${data}`); // Uncomment to see server logs
});

// Helper to send request
function sendRequest(method: string, params: any = {}) {
  const id = ++requestId;
  const request = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: method,
      arguments: params,
    },
    id,
  };
  server.stdin.write(JSON.stringify(request) + "\n");
  return new Promise((resolve) => {
    const check = setInterval(() => {
      if (responses.has(id)) {
        clearInterval(check);
        resolve(responses.get(id));
      }
    }, 100);
  });
}

async function runConsultation() {
  console.log(`[Client] Consulting Agentic Graph RAG for goal: "${GOAL}"...`);

  // 1. Ensure Orchestrator is Ready
  await sendRequest("get_agent_status");

  // 2. Execute Pipeline
  const result: any = await sendRequest("execute_agent_pipeline", {
    goal: GOAL,
    enableGraphRAG: true,
    shareInsights: true,
  });

  if (result.success) {
    console.log("\n✅ RAG Consultation Successful!\n");
    console.log("--- Pattern Found ---");
    console.log(JSON.stringify(result.data.pattern, null, 2));

    console.log("\n--- Graph Insights ---");
    console.log(JSON.stringify(result.data.graphInsights, null, 2));

    console.log("\n--- Suggested Workflow ---");
    console.log(JSON.stringify(result.data.workflow, null, 2));
  } else {
    console.error("❌ Consultation Failed:", result.error);
  }

  server.kill();
  process.exit(0);
}

runConsultation();
