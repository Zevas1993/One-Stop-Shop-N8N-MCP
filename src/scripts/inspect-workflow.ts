import { spawn } from "child_process";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const SERVER_PATH = path.resolve(__dirname, "../mcp/index.ts");
const N8N_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = "A9h8Zsm6kYpsmilu";

function createRequest(id: number, method: string, params?: any) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
}

async function inspectWorkflow() {
  const serverProcess = spawn(
    "npx",
    ["ts-node", "--transpile-only", `"${SERVER_PATH}"`],
    {
      env: {
        ...process.env,
        MCP_MODE: "stdio",
        N8N_API_URL: N8N_URL,
        N8N_API_KEY: N8N_KEY,
      },
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    }
  );

  serverProcess.stderr.on("data", () => {}); // Ignore logs

  serverProcess.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        if (response.id === 1) {
          serverProcess.stdin.write(
            createRequest(2, "tools/call", {
              name: "workflow_manager",
              arguments: { action: "get", id: WORKFLOW_ID },
            })
          );
        } else if (response.id === 2) {
          const result = response.result;
          if (result && result.content) {
            const content = JSON.parse(result.content[0].text);
            if (content.success && content.data) {
              const nodes = content.data.nodes;
              console.log("--- NODE LIST ---");
              nodes.forEach((n: any) => {
                console.log(`Name: "${n.name}", Type: ${n.type}, ID: ${n.id}`);
              });
              console.log("-----------------");
              console.log("--- NODE DETAILS ---");
              const memoryNode = content.data.nodes.find(
                (n: any) => n.name === "Window Buffer Memory"
              );
              if (memoryNode) {
                console.log(
                  "Window Buffer Memory:",
                  JSON.stringify(memoryNode, null, 2)
                );
              }
              const processTeamsNode = content.data.nodes.find(
                (n: any) => n.name === "Process Teams Input"
              );
              if (processTeamsNode) {
                console.log(
                  "Process Teams Input:",
                  JSON.stringify(processTeamsNode, null, 2)
                );
              }
              const teamsNode = content.data.nodes.find(
                (n: any) => n.name === "Send Teams Response"
              );
              if (teamsNode) {
                console.log(
                  "Send Teams Response:",
                  JSON.stringify(teamsNode, null, 2)
                );
              }
              const fraudAgent = content.data.nodes.find(
                (n: any) => n.name === "Fraud Classifier"
              );
              if (fraudAgent) {
                console.log(
                  "Fraud Classifier Connections:",
                  JSON.stringify(
                    content.data.connections["Fraud Classifier"],
                    null,
                    2
                  )
                );
                // Also check incoming connections (though n8n usually stores them on source, AI Agent connections are inputs to the agent node)
                // Actually, for AI Agents, the Memory/Model/Tools are INPUTS to the Agent node.
                // So we need to check who connects TO "Fraud Classifier".
                console.log("--- Inputs to Fraud Classifier ---");
                Object.keys(content.data.connections).forEach((sourceName) => {
                  const sourceConnections =
                    content.data.connections[sourceName];
                  Object.keys(sourceConnections).forEach((type) => {
                    sourceConnections[type].forEach((output: any) => {
                      output.forEach((target: any) => {
                        if (target.node === "Fraud Classifier") {
                          console.log(`Source: ${sourceName}, Type: ${type}`);
                        }
                      });
                    });
                  });
                });
              }
              const agentNode = content.data.nodes.find(
                (n: any) => n.name === "AI Agent (Central)"
              );
              if (agentNode) {
                console.log(
                  "AI Agent (Central):",
                  JSON.stringify(agentNode, null, 2)
                );
              }
              console.log("-------------------");
            }
          }
          serverProcess.kill();
          process.exit(0);
        }
      } catch (e) {}
    }
  });

  serverProcess.stdin.write(
    createRequest(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "inspect-script", version: "1.0.0" },
    })
  );
}

inspectWorkflow();
