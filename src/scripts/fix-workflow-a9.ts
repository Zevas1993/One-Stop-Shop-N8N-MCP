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

async function fixWorkflow() {
  console.log(`🚀 Starting Workflow Fix for ID: ${WORKFLOW_ID}...`);

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

  serverProcess.stderr.on("data", (data) => {
    // console.error(`[SERVER LOG] ${data}`);
  });

  serverProcess.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        if (response.id === 1) {
          console.log("✅ Server Initialized");
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
              console.log("✅ Workflow fetched successfully");
              let workflow = content.data;

              // 1. Remove nodes
              const nodesToRemove = ["HTTP Request", "Switch"];
              workflow.nodes = workflow.nodes.filter(
                (n: any) => !nodesToRemove.includes(n.name)
              );
              console.log(`🗑️ Removed nodes: ${nodesToRemove.join(", ")}`);

              // 2. Identify Nodes
              const agentNode = workflow.nodes.find(
                (n: any) => n.name === "AI Agent (Central)"
              );
              const chatModel = workflow.nodes.find(
                (n: any) => n.name === "OpenAI Chat Model"
              );
              const memory = workflow.nodes.find(
                (n: any) => n.name === "Window Buffer Memory"
              );

              const tools = [
                "Search Emails",
                "Get Calendar Events",
                "Create Calendar Event",
                "Create Draft",
                "Send Email",
                "Send Teams Response",
                "Fraud Classifier",
                "Billing RAG Agent",
                "High Priority RAG Agent",
              ];

              if (!agentNode) {
                console.error("❌ AI Agent (Central) not found!");
                process.exit(1);
              }

              // 3. Fix Connections
              // Reset connections for the Agent
              if (!workflow.connections) workflow.connections = {};

              // Remove old connections FROM other nodes TO the agent (except main inputs)
              // Actually, we need to set connections FROM the auxiliary nodes TO the agent

              // Helper to add connection
              const addConnection = (
                sourceName: string,
                targetName: string,
                type: string
              ) => {
                if (!workflow.connections[sourceName])
                  workflow.connections[sourceName] = {};
                if (!workflow.connections[sourceName][type])
                  workflow.connections[sourceName][type] = [];

                // Check if connection exists
                const exists = workflow.connections[sourceName][type].some(
                  (group: any[]) =>
                    group.some((c: any) => c.node === targetName)
                );

                if (!exists) {
                  // Create new connection group
                  workflow.connections[sourceName][type].push([
                    { node: targetName, type: type, index: 0 },
                  ]);
                }
              };

              // 1. Clear existing connections for key nodes to prevent cycles and bad wiring
              if (!workflow.connections) workflow.connections = {};

              const nodesToClear = [
                agentNode.name,
                chatModel.name,
                memory.name,
                "Postgres Memory", // Explicitly clear this as we are removing it
                ...tools,
              ];

              nodesToClear.forEach((name) => {
                if (workflow.connections[name]) {
                  console.log(`🧹 Clearing connections for: ${name}`);
                  delete workflow.connections[name];
                }
              });

              // 2. Re-establish connections

              // Connect Chat Model (only ai_languageModel)
              addConnection(chatModel.name, agentNode.name, "ai_languageModel");
              console.log("🔗 Connected Chat Model");

              // Connect Memory (only ai_memory)
              addConnection(memory.name, agentNode.name, "ai_memory");
              console.log("🔗 Connected Memory");

              // Connect Tools (only ai_tool)
              tools.forEach((toolName) => {
                // Skip Send Teams Response as it's an output node now
                if (toolName === "Send Teams Response") return;

                const toolNode = workflow.nodes.find(
                  (n: any) => n.name === toolName
                );
                if (toolNode) {
                  addConnection(toolNode.name, agentNode.name, "ai_tool");
                  console.log(`🔗 Connected Tool: ${toolName}`);
                } else {
                  console.warn(`⚠️ Tool node not found: ${toolName}`);
                }
              });

              // Connect Inputs
              const inputs = ["Process Email for RAG", "Process Teams Input"];
              inputs.forEach((inputName) => {
                const inputNode = workflow.nodes.find(
                  (n: any) => n.name === inputName
                );
                if (inputNode) {
                  addConnection(inputNode.name, agentNode.name, "main");
                  console.log(`🔗 Connected Input: ${inputName}`);
                } else {
                  console.warn(`⚠️ Input node not found: ${inputName}`);
                }
              });

              // Connect Outputs (Main flow)
              const outputs = ["Send Teams Response"];
              outputs.forEach((outputName) => {
                const outputNode = workflow.nodes.find(
                  (n: any) => n.name === outputName
                );
                if (outputNode) {
                  addConnection(agentNode.name, outputNode.name, "main");
                  console.log(`🔗 Connected Output: ${outputName}`);

                  // Configure Send Teams Response parameters
                  if (outputName === "Send Teams Response") {
                    outputNode.parameters = {
                      operation: "sendMessage",
                      chatId:
                        "={{ $('Teams Message Trigger').item.json.chatId }}",
                      content: "={{ $json.output }}",
                    };
                    console.log(`⚙️ Configured parameters for: ${outputName}`);
                  }
                } else {
                  console.warn(`⚠️ Output node not found: ${outputName}`);
                }
              });

              // --- SPECIALIZED AGENTS SETUP ---
              const specializedAgents = [
                "Fraud Classifier",
                "Billing RAG Agent",
                "High Priority RAG Agent",
              ];

              specializedAgents.forEach((agentName) => {
                const subAgentNode = workflow.nodes.find(
                  (n: any) => n.name === agentName
                );
                if (subAgentNode) {
                  // Connect Chat Model (Shared is fine)
                  addConnection(
                    chatModel.name,
                    subAgentNode.name,
                    "ai_languageModel"
                  );
                  console.log(
                    `🔗 Connected Chat Model to Sub-Agent: ${agentName}`
                  );

                  // Create UNIQUE Memory for this agent
                  const newMemoryName = `${agentName} Memory`;
                  // Check if it already exists to avoid duplicates on re-run
                  let newMemoryNode = workflow.nodes.find(
                    (n: any) => n.name === newMemoryName
                  );

                  if (!newMemoryNode) {
                    newMemoryNode = {
                      parameters: {},
                      name: newMemoryName,
                      type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
                      typeVersion: 1.3,
                      position: [
                        subAgentNode.position[0],
                        subAgentNode.position[1] + 200,
                      ],
                      id:
                        Math.random().toString(36).substring(2, 15) +
                        Math.random().toString(36).substring(2, 15), // Simple ID gen
                    };
                    workflow.nodes.push(newMemoryNode);
                    console.log(`✨ Created new memory node: ${newMemoryName}`);
                  }

                  // Connect NEW Memory
                  addConnection(
                    newMemoryNode.name,
                    subAgentNode.name,
                    "ai_memory"
                  );
                  console.log(
                    `🔗 Connected ${newMemoryName} to Sub-Agent: ${agentName}`
                  );

                  // Connect Tools
                  if (agentName.includes("RAG")) {
                    // Create UNIQUE Postgres Memory for this agent
                    const newPostgresName = `${agentName} Postgres`;
                    let newPostgresNode = workflow.nodes.find(
                      (n: any) => n.name === newPostgresName
                    );

                    if (!newPostgresNode) {
                      // Find original to copy settings if needed, or create fresh
                      // For now, create fresh with standard type
                      newPostgresNode = {
                        parameters: {
                          operation: "executeQuery",
                          query:
                            "SELECT * FROM documents WHERE content LIKE $1", // Placeholder query
                        },
                        name: newPostgresName,
                        type: "n8n-nodes-base.postgres",
                        typeVersion: 2.6,
                        position: [
                          subAgentNode.position[0],
                          subAgentNode.position[1] + 400,
                        ],
                        id:
                          Math.random().toString(36).substring(2, 15) +
                          Math.random().toString(36).substring(2, 15),
                      };
                      workflow.nodes.push(newPostgresNode);
                      console.log(
                        `✨ Created new Postgres node: ${newPostgresName}`
                      );
                    }

                    addConnection(
                      newPostgresNode.name,
                      subAgentNode.name,
                      "ai_tool"
                    );
                    console.log(
                      `🔗 Connected ${newPostgresName} to Sub-Agent: ${agentName}`
                    );
                  }
                }
              });

              // --- UPDATE NODE VERSIONS ---
              const versionUpdates: Record<string, number> = {
                "n8n-nodes-base.microsoftOutlookTrigger": 1, // Revert to v1
                "n8n-nodes-base.microsoftTeamsTrigger": 1, // Revert to v1
                "n8n-nodes-base.code": 2,
                "@n8n/n8n-nodes-langchain.lmChatOpenAi": 1.3,
                "@n8n/n8n-nodes-langchain.memoryBufferWindow": 1.3,
                "@n8n/n8n-nodes-langchain.agent": 3, // Update Agents to v3
                "n8n-nodes-base.postgres": 2.6,
                "n8n-nodes-base.microsoftOutlook": 2,
                "n8n-nodes-base.microsoftTeams": 2,
              };

              workflow.nodes.forEach((node: any) => {
                if (versionUpdates[node.type]) {
                  if (node.typeVersion !== versionUpdates[node.type]) {
                    console.log(
                      `🆙 Updating ${node.name} (${node.type}) from v${
                        node.typeVersion
                      } to v${versionUpdates[node.type]}`
                    );
                    node.typeVersion = versionUpdates[node.type];
                  }
                }
              });

              // --- ORGANIZE WORKFLOW LAYOUT ---
              const layout: Record<string, [number, number]> = {
                // Inputs (Left Column)
                "Note: Inputs": [0, 100],
                "Outlook Email Trigger": [0, 250],
                "Teams Message Trigger": [0, 550],
                "Process Email for RAG": [300, 250],
                "Process Teams Input": [300, 550],

                // Shared Resources (Top Center)
                "Note: AI Config": [800, -200],
                "OpenAI Chat Model": [800, -100],

                // Central Agent (Center Column)
                "Note: Central Orchestrator": [800, 200],
                "AI Agent (Central)": [800, 300],
                "Window Buffer Memory": [800, 450], // Underneath Agent
                "Send Teams Response": [1100, 300], // Output to the right

                // Central Tools (Bottom Center - Under Central Agent)
                "Note: Tools": [400, 600],
                "Search Emails": [400, 700],
                "Get Calendar Events": [600, 700],
                "Create Calendar Event": [800, 700],
                "Create Draft": [1000, 700],
                "Send Email": [1200, 700],

                // Specialized Agents (Right Column - Vertical Stacks)
                "Note: Specialized Agents": [1600, -100],

                // Fraud Classifier Stack
                "Fraud Classifier": [1600, 0],
                "Fraud Classifier Memory": [1600, 150], // Underneath

                // Billing RAG Agent Stack
                "Billing RAG Agent": [1600, 400],
                "Billing RAG Agent Memory": [1600, 550], // Underneath
                "Billing RAG Agent Postgres": [1600, 700], // Underneath Memory

                // High Priority RAG Agent Stack
                "High Priority RAG Agent": [1600, 900],
                "High Priority RAG Agent Memory": [1600, 1050], // Underneath
                "High Priority RAG Agent Postgres": [1600, 1200], // Underneath Memory
              };

              workflow.nodes.forEach((node: any) => {
                if (layout[node.name]) {
                  node.position = layout[node.name];
                  console.log(
                    `📍 Repositioned ${node.name} to [${node.position}]`
                  );
                }
              });

              // Remove original shared Postgres Memory if it exists
              const originalPostgresIndex = workflow.nodes.findIndex(
                (n: any) => n.name === "Postgres Memory"
              );
              if (originalPostgresIndex !== -1) {
                workflow.nodes.splice(originalPostgresIndex, 1);
                console.log("🗑️ Removed original shared Postgres Memory node");
              }

              // Clean workflow for update
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

              // 4. Update Workflow
              console.log("📤 Sending update request...");
              serverProcess.stdin.write(
                createRequest(3, "tools/call", {
                  name: "workflow_manager",
                  arguments: {
                    action: "update",
                    id: WORKFLOW_ID,
                    changes: cleanWorkflow,
                  },
                })
              );
            }
          }
        } else if (response.id === 3) {
          console.log("📥 Received update response");
          const result = response.result;
          if (result && result.content) {
            const content = JSON.parse(result.content[0].text);
            if (content.success) {
              console.log("✅ Workflow updated successfully!");
            } else {
              console.error("❌ Failed to update workflow:", content.error);
              if (content.data)
                console.error("Data:", JSON.stringify(content.data, null, 2));
              if (content.details)
                console.error(
                  "Details:",
                  JSON.stringify(content.details, null, 2)
                );
            }
          }
          serverProcess.kill();
          process.exit(0);
        }
      } catch (e) {
        // console.error(e);
      }
    }
  });

  serverProcess.stdin.write(
    createRequest(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "fix-script", version: "1.0.0" },
    })
  );
}

fixWorkflow();
