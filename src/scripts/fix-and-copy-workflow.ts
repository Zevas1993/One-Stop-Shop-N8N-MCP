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

async function runFixAndCopy() {
  console.log(
    `🚀 Starting Workflow Fix & Copy for ID: ${WORKFLOW_ID} (AI Connections)...`
  );

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
      stdio: ["pipe", "pipe", "pipe"],
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
    // console.log(`[SERVER LOG] ${data}`);
  });

  let originalWorkflow: any = null;
  let newWorkflow: any = null;

  // Listen for responses
  stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);

        // 1. Initialize
        if (response.id === 1) {
          console.log("✅ Server Initialized");
          console.log(`📤 Fetching original workflow...`);
          stdin.write(
            createRequest(2, "tools/call", {
              name: "workflow_manager",
              arguments: { action: "get", id: WORKFLOW_ID },
            })
          );
        }

        // 2. Handle Fetch & Apply Fixes
        else if (response.id === 2) {
          const result = response.result;
          if (result && result.content) {
            const content = JSON.parse(result.content[0].text);
            if (content.success && content.data) {
              console.log("✅ Workflow fetched");
              originalWorkflow = content.data;

              // --- APPLY FIXES ---
              console.log("🛠️ Applying fixes...");

              newWorkflow = { ...originalWorkflow };
              newWorkflow.name = `Copy of ${originalWorkflow.name} (AI Fixed)`;

              // Cleanup metadata
              delete newWorkflow.id;
              delete newWorkflow.active;
              delete newWorkflow.createdAt;
              delete newWorkflow.updatedAt;
              delete newWorkflow.versionId;
              delete newWorkflow.versionCounter;
              delete newWorkflow.triggerCount;
              delete newWorkflow.isArchived;
              delete newWorkflow.description;
              delete newWorkflow.shared;

              // 1. Remove Outliers
              const removedNodeNames = ["HTTP Request", "Switch"];
              newWorkflow.nodes = newWorkflow.nodes.filter((node: any) => {
                return !removedNodeNames.includes(node.name);
              });

              // Clean connections for removed nodes
              removedNodeNames.forEach((name) => {
                if (newWorkflow.connections[name])
                  delete newWorkflow.connections[name];
              });
              Object.keys(newWorkflow.connections).forEach((source) => {
                const outputs = newWorkflow.connections[source];
                [
                  "main",
                  "error",
                  "ai_tool",
                  "ai_languageModel",
                  "ai_memory",
                ].forEach((type) => {
                  if (outputs[type]) {
                    outputs[type] = outputs[type].map((outputGroup: any[]) => {
                      return outputGroup.filter(
                        (conn: any) => !removedNodeNames.includes(conn.node)
                      );
                    });
                  }
                });
              });

              // 2. Fix Nodes (Parameters & Versions)
              newWorkflow.nodes = newWorkflow.nodes.map((node: any) => {
                if (
                  node.type === "@n8n/n8n-nodes-langchain.openAiChatModel" &&
                  node.typeVersion === 1
                ) {
                  node.typeVersion = 1.3;
                }
                if (node.parameters) {
                  if (
                    node.type.includes("outlook") &&
                    node.parameters.pollTimes
                  )
                    delete node.parameters.pollTimes;
                  if (
                    node.type.includes("microsoftTeams") &&
                    node.parameters.teamId
                  )
                    delete node.parameters.teamId;
                  if (
                    node.type.includes("microsoftTeams") &&
                    node.parameters.channelId
                  )
                    delete node.parameters.channelId;
                }
                return node;
              });

              // 3. CONNECT AI CLUSTER NODES
              // Define the connections we want to enforce
              const aiConnections = [
                // Chat Model -> Specialized Agents
                {
                  source: "OpenAI Chat Model",
                  target: "Fraud Classifier",
                  type: "ai_languageModel",
                },
                {
                  source: "OpenAI Chat Model",
                  target: "Billing RAG Agent",
                  type: "ai_languageModel",
                },
                {
                  source: "OpenAI Chat Model",
                  target: "High Priority RAG Agent",
                  type: "ai_languageModel",
                },

                // Chat Model -> Central Agent (Assuming it needs one too, user image 2 showed error)
                {
                  source: "OpenAI Chat Model",
                  target: "AI Agent (Central)",
                  type: "ai_languageModel",
                },

                // Memory -> Specialized Agents
                {
                  source: "Window Buffer Memory",
                  target: "Fraud Classifier",
                  type: "ai_memory",
                },
                {
                  source: "Window Buffer Memory",
                  target: "Billing RAG Agent",
                  type: "ai_memory",
                },
                {
                  source: "Window Buffer Memory",
                  target: "High Priority RAG Agent",
                  type: "ai_memory",
                },

                // Memory -> Central Agent
                {
                  source: "Window Buffer Memory",
                  target: "AI Agent (Central)",
                  type: "ai_memory",
                },

                // Tools -> Central Agent
                {
                  source: "Send Email",
                  target: "AI Agent (Central)",
                  type: "ai_tool",
                },
                {
                  source: "Send Teams Response",
                  target: "AI Agent (Central)",
                  type: "ai_tool",
                },
              ];

              // Apply connections
              aiConnections.forEach(({ source, target, type }) => {
                // Ensure source and target exist
                const sourceNode = newWorkflow.nodes.find(
                  (n: any) => n.name === source
                );
                const targetNode = newWorkflow.nodes.find(
                  (n: any) => n.name === target
                );

                // Debug: Print existing connections for Central Agent
                if (newWorkflow.connections["AI Agent (Central)"]) {
                  console.log(
                    "   [DEBUG] Existing Central Agent Connections:",
                    JSON.stringify(
                      newWorkflow.connections["AI Agent (Central)"],
                      null,
                      2
                    )
                  );
                }

                // Remove existing Main connections from Agent to Tools/Memory to avoid cycles
                const inputNodes = [
                  "Postgres Memory",
                  "Search Emails",
                  "Get Calendar Events",
                  "Create Calendar Event",
                  "Create Draft",
                  "Send Email",
                  "Send Teams Response",
                  "Window Buffer Memory",
                  "OpenAI Chat Model",
                ];

                if (newWorkflow.connections["AI Agent (Central)"]) {
                  // Remove Main outputs to input nodes
                  if (newWorkflow.connections["AI Agent (Central)"].main) {
                    newWorkflow.connections["AI Agent (Central)"].main =
                      newWorkflow.connections["AI Agent (Central)"].main.map(
                        (group: any[]) => {
                          return group.filter(
                            (conn: any) => !inputNodes.includes(conn.node)
                          );
                        }
                      );
                  }
                  // Remove other outputs if any (unlikely for Agent)
                }

                // Also check if Input Nodes have Main outputs TO the Agent (unlikely but possible)
                inputNodes.forEach((nodeName) => {
                  if (
                    newWorkflow.connections[nodeName] &&
                    newWorkflow.connections[nodeName].main
                  ) {
                    newWorkflow.connections[nodeName].main =
                      newWorkflow.connections[nodeName].main.map(
                        (group: any[]) => {
                          return group.filter(
                            (conn: any) => conn.node !== "AI Agent (Central)"
                          );
                        }
                      );
                  }
                });

                // Debug: Print ALL connections
                console.log(
                  "   [DEBUG] FINAL CONNECTIONS:",
                  JSON.stringify(newWorkflow.connections, null, 2)
                );

                // Determine output group: 'main' for standard nodes, 'type' for AI nodes
                let outputGroup = type;
                if (
                  sourceNode &&
                  !sourceNode.type.startsWith("@n8n/n8n-nodes-langchain")
                ) {
                  outputGroup = "main";
                }
                // Special case: Postgres is standard but used as tool
                if (source === "Postgres Memory") outputGroup = "main";

                if (sourceNode && targetNode) {
                  if (!newWorkflow.connections[source]) {
                    newWorkflow.connections[source] = {};
                  }
                  if (!newWorkflow.connections[source][outputGroup]) {
                    newWorkflow.connections[source][outputGroup] = [];
                  }

                  // Check if connection already exists
                  const exists = newWorkflow.connections[source][
                    outputGroup
                  ].some((group: any[]) =>
                    group.some(
                      (conn: any) => conn.node === target && conn.type === type
                    )
                  );

                  if (!exists) {
                    if (
                      newWorkflow.connections[source][outputGroup].length === 0
                    ) {
                      newWorkflow.connections[source][outputGroup].push([]);
                    }

                    newWorkflow.connections[source][outputGroup][0].push({
                      node: target,
                      type: type, // The input name on the target node (ai_tool, ai_memory, etc.)
                      index: 0,
                    });
                    console.log(
                      `   - Connected '${source}' to '${target}' (Output: ${outputGroup} -> Input: ${type})`
                    );
                  }
                } else {
                  console.log(
                    `   ⚠️ Could not connect '${source}' to '${target}': Node not found`
                  );
                }
              });

              // 4. Validate New Workflow
              console.log(`🔍 Validating refined workflow...`);
              stdin.write(
                createRequest(3, "tools/call", {
                  name: "workflow_manager",
                  arguments: {
                    action: "validate",
                    workflow: newWorkflow,
                    mode: "full",
                  },
                })
              );
            } else {
              console.error("❌ Failed to fetch workflow");
              process.exit(1);
            }
          }
        }

        // 3. Handle Validation Response
        else if (response.id === 3) {
          console.log("📥 Received validation response");
          const result = response.result;
          if (result && result.content) {
            const content = JSON.parse(result.content[0].text);
            console.log("Validation Result:", JSON.stringify(content, null, 2));

            if (content.valid === false) {
              console.error("❌ Validation failed.");
              console.log(
                "⚠️ Proceeding to creation anyway to test connections..."
              );
            } else {
              console.log("✅ Validation passed.");
            }

            // 4. Create New Workflow
            console.log(`📤 Creating new workflow: "${newWorkflow.name}"...`);
            stdin.write(
              createRequest(4, "tools/call", {
                name: "workflow_manager",
                arguments: {
                  action: "create",
                  workflow: newWorkflow,
                },
              })
            );
          }
        }

        // 4. Handle Creation Response
        else if (response.id === 4) {
          console.log("📥 Received creation response");
          const result = response.result;
          if (result && result.content) {
            const content = JSON.parse(result.content[0].text);
            if (content.success) {
              console.log(`✅ SUCCESS! Created new workflow.`);
              console.log(`   ID: ${content.data.id}`);
              console.log(`   Name: ${content.data.name}`);
            } else {
              console.error("❌ Failed to create workflow:", content.message);
              if (content.error) console.error(content.error);
            }
          }
          serverProcess.kill();
          process.exit(0);
        }
      } catch (e) {
        // Ignore JSON parse errors from partial chunks
      }
    }
  });

  // Initialize
  stdin.write(
    createRequest(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "fix-script", version: "1.0.0" },
    })
  );
}

runFixAndCopy().catch(console.error);
