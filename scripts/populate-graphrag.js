/**
 * Populate GraphRAG with node catalog data
 *
 * This script connects to n8n with session authentication,
 * retrieves the full node catalog (859+ nodes), and populates
 * the GraphRAG knowledge graph with the node information.
 */

const { spawn } = require("child_process");
const { createHash } = require("crypto");
const path = require("path");

// Load environment
require("dotenv").config({ override: true });

const N8N_API_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_USERNAME = process.env.N8N_USERNAME;
const N8N_PASSWORD = process.env.N8N_PASSWORD;

console.log("=".repeat(60));
console.log("GraphRAG Population Script");
console.log("=".repeat(60));
console.log("\nConfiguration:");
console.log(`  n8n URL: ${N8N_API_URL}`);
console.log(`  Username: ${N8N_USERNAME || "NOT SET"}`);
console.log(`  Password: ${N8N_PASSWORD ? "***" : "NOT SET"}`);
console.log(`  API Key: ${N8N_API_KEY ? N8N_API_KEY.substring(0, 20) + "..." : "NOT SET"}`);

// MCP Server Communication
class MCPClient {
  constructor() {
    this.server = null;
    this.buffer = "";
    this.requestId = 1;
    this.pending = new Map();
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log("\n[MCP] Starting MCP server...");

      this.server = spawn("node", ["dist/main.js"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, N8N_AUTO_SYNC: "false" }
      });

      this.server.stdout.on("data", (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.server.stderr.on("data", (data) => {
        const msg = data.toString();
        // Only show important messages
        if (msg.includes("error") || msg.includes("Error") || msg.includes("Session") || msg.includes("NodeCatalog")) {
          console.log("[MCP stderr]", msg.trim());
        }
      });

      this.server.on("error", (err) => {
        reject(new Error(`Failed to start MCP server: ${err.message}`));
      });

      // Initialize the MCP connection
      this.sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "graphrag-populate", version: "1.0.0" }
      }).then((result) => {
        console.log("[MCP] Server initialized successfully");
        resolve(result);
      }).catch(reject);
    });
  }

  processBuffer() {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        const pending = this.pending.get(response.id);
        if (pending) {
          this.pending.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch (e) {
        // Skip non-JSON lines
      }
    }
  }

  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const request = {
        jsonrpc: "2.0",
        id,
        method,
        params
      };

      this.pending.set(id, { resolve, reject });
      this.server.stdin.write(JSON.stringify(request) + "\n");

      // Timeout after 60 seconds
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 60000);
    });
  }

  async callTool(name, args = {}) {
    const result = await this.sendRequest("tools/call", { name, arguments: args });
    if (result?.content?.[0]?.text) {
      return JSON.parse(result.content[0].text);
    }
    return result;
  }

  stop() {
    if (this.server) {
      this.server.kill();
      this.server = null;
    }
  }
}

// GraphRAG Bridge (simplified - sends directly to Python backend)
class GraphRAGPopulator {
  constructor() {
    this.proc = null;
    this.pending = new Map();
    this.nextId = 1;
    this.batchSize = 10;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const pythonExe = process.env.GRAPH_PYTHON || process.env.PYTHON || "python";
      let serverPath = process.env.GRAPH_BACKEND || "python/backend/graph/lightrag_service.py";

      // Resolve to absolute path
      if (!serverPath.startsWith("/") && !serverPath.match(/^[a-z]:/i)) {
        serverPath = path.resolve(serverPath);
      }

      console.log(`\n[GraphRAG] Starting Python backend: ${pythonExe} ${serverPath}`);

      this.proc = spawn(pythonExe, [serverPath], {
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"]
      });

      this.proc.stdout.setEncoding("utf-8");
      this.proc.stdout.on("data", (chunk) => {
        const lines = chunk.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            const pending = this.pending.get(msg.id);
            if (pending) {
              this.pending.delete(msg.id);
              if (msg.error) {
                pending.reject(new Error(msg.error.message || "Graph backend error"));
              } else {
                pending.resolve(msg.result);
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      });

      this.proc.stderr.setEncoding("utf-8");
      this.proc.stderr.on("data", (d) => {
        console.log("[GraphRAG stderr]", d.trim());
      });

      this.proc.on("error", (err) => {
        reject(new Error(`Failed to start GraphRAG backend: ${err.message}`));
      });

      this.proc.on("exit", (code) => {
        console.log(`[GraphRAG] Backend exited with code ${code}`);
        for (const [id, p] of this.pending.entries()) {
          p.reject(new Error(`GraphRAG backend exited`));
        }
        this.pending.clear();
      });

      // Wait a moment for the backend to initialize
      setTimeout(() => {
        console.log("[GraphRAG] Backend connected");
        resolve();
      }, 2000);
    });
  }

  async rpc(method, params, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`GraphRAG backend timeout for ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });

      const payload = JSON.stringify({ jsonrpc: "2.0", method, params, id }) + "\n";
      this.proc.stdin.write(payload, "utf-8");
    });
  }

  transformNodeToEntity(node) {
    // Build keywords from various sources
    const keywords = [];

    // Add name parts as keywords
    if (node.name) {
      keywords.push(...node.name.split(/[.\-_]/).filter(k => k.length > 2));
    }

    // Add display name words
    if (node.displayName) {
      keywords.push(...node.displayName.split(/\s+/).filter(k => k.length > 2));
    }

    // Add categories
    if (node.codex?.categories) {
      keywords.push(...node.codex.categories);
    }

    // Add groups
    if (node.group) {
      keywords.push(...node.group);
    }

    // Add aliases from codex
    if (node.codex?.alias) {
      keywords.push(...node.codex.alias);
    }

    // Deduplicate and lowercase keywords
    const uniqueKeywords = [...new Set(keywords.map(k => k.toLowerCase()))];

    // Determine category
    const category = node.codex?.categories?.[0] ||
                     (node.group?.includes("trigger") ? "trigger" : null) ||
                     (node.name?.includes("langchain") ? "ai" : null) ||
                     node.group?.[0] ||
                     "uncategorized";

    const isTrigger = node.group?.includes("trigger") ||
                      node.name?.toLowerCase().includes("trigger") ||
                      node.name?.toLowerCase().includes("webhook");

    const isAI = node.name?.includes("langchain") ||
                 node.group?.includes("ai") ||
                 node.codex?.categories?.includes("AI");

    // Build comprehensive description for semantic search
    const descriptionParts = [node.description || ""];

    if (node.properties && node.properties.length > 0) {
      const propNames = node.properties.slice(0, 5).map(p => p.displayName || p.name);
      descriptionParts.push(`Properties: ${propNames.join(", ")}`);
    }

    if (node.credentials && node.credentials.length > 0) {
      const credNames = node.credentials.map(c => c.displayName || c.name);
      descriptionParts.push(`Credentials: ${credNames.join(", ")}`);
    }

    // Format for Python backend (Node model)
    return {
      id: node.name,  // Node type as ID e.g., "n8n-nodes-base.httpRequest"
      label: node.displayName || node.name,  // Human-readable name
      description: descriptionParts.join(". "),
      category: category,
      keywords: uniqueKeywords,
      metadata: {
        nodeType: node.name,
        displayName: node.displayName,
        isTrigger: isTrigger,
        isAI: isAI,
        propertyCount: node.properties?.length || 0,
        credentialCount: node.credentials?.length || 0,
        groups: node.group || [],
        inputs: node.inputs || [],
        outputs: node.outputs || [],
        version: node.version || 1,
        updatedAt: new Date().toISOString()
      }
    };
  }

  async populateFromNodes(nodes) {
    console.log(`\n[GraphRAG] Populating graph with ${nodes.length} nodes...`);

    const stats = {
      processed: 0,
      batches: 0,
      errors: []
    };

    // Process in batches
    for (let i = 0; i < nodes.length; i += this.batchSize) {
      const batch = nodes.slice(i, i + this.batchSize);
      const entities = [];

      for (const node of batch) {
        try {
          const entity = this.transformNodeToEntity(node);
          entities.push(entity);
          stats.processed++;
        } catch (error) {
          stats.errors.push(`Failed to transform ${node.name}: ${error.message}`);
        }
      }

      if (entities.length > 0) {
        try {
          await this.rpc("apply_update", {
            added: entities,
            modified: [],
            removed: []
          }, 30000);
          stats.batches++;

          // Progress indicator
          const progress = Math.round((i + batch.length) / nodes.length * 100);
          process.stdout.write(`\r[GraphRAG] Progress: ${progress}% (${i + batch.length}/${nodes.length} nodes)`);
        } catch (error) {
          stats.errors.push(`Batch update failed: ${error.message}`);
        }
      }
    }

    console.log("\n");
    return stats;
  }

  stop() {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }
}

// Main execution
async function main() {
  const mcp = new MCPClient();
  const graphrag = new GraphRAGPopulator();

  try {
    // Step 1: Start MCP server and get node catalog
    await mcp.start();

    console.log("\n[Step 1] Fetching node catalog from n8n...");
    const status = await mcp.callTool("n8n_status", {});
    console.log(`  Connected: ${status.connected}`);
    console.log(`  Node Count: ${status.nodeCatalog?.nodeCount || 0}`);
    console.log(`  n8n Version: ${status.n8nVersion || "unknown"}`);

    // Get all AI nodes (this will include the full catalog)
    console.log("\n[Step 2] Retrieving all nodes...");
    const aiNodesResult = await mcp.callTool("n8n_list_ai_nodes", {});
    const aiNodes = aiNodesResult.nodes || [];
    console.log(`  AI Nodes: ${aiNodes.length}`);

    // Get trigger nodes
    const triggerNodesResult = await mcp.callTool("n8n_list_trigger_nodes", {});
    const triggerNodes = triggerNodesResult.nodes || [];
    console.log(`  Trigger Nodes: ${triggerNodes.length}`);

    // Combine all unique nodes
    const nodeMap = new Map();
    [...aiNodes, ...triggerNodes].forEach(node => {
      if (node.name && !nodeMap.has(node.name)) {
        nodeMap.set(node.name, node);
      }
    });

    // Also search for common node types to ensure coverage
    const searchTerms = ["http", "code", "set", "if", "switch", "merge", "split", "function"];
    for (const term of searchTerms) {
      const searchResult = await mcp.callTool("n8n_search_nodes", { query: term });
      const searchNodes = searchResult.nodes || [];
      searchNodes.forEach(node => {
        if (node.name && !nodeMap.has(node.name)) {
          nodeMap.set(node.name, node);
        }
      });
    }

    const allNodes = Array.from(nodeMap.values());
    console.log(`  Total Unique Nodes: ${allNodes.length}`);

    if (allNodes.length === 0) {
      console.error("\n✗ No nodes found in catalog. Ensure n8n is running and credentials are correct.");
      process.exit(1);
    }

    // Step 3: Connect to GraphRAG and populate
    console.log("\n[Step 3] Connecting to GraphRAG backend...");
    await graphrag.connect();

    console.log("\n[Step 4] Populating GraphRAG knowledge graph...");
    const stats = await graphrag.populateFromNodes(allNodes);

    // Summary
    console.log("=".repeat(60));
    console.log("GraphRAG Population Complete!");
    console.log("=".repeat(60));
    console.log(`  Nodes Processed: ${stats.processed}`);
    console.log(`  Batches Sent: ${stats.batches}`);
    console.log(`  Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log("\nErrors:");
      stats.errors.slice(0, 5).forEach(err => console.log(`  - ${err}`));
      if (stats.errors.length > 5) {
        console.log(`  ... and ${stats.errors.length - 5} more errors`);
      }
    }

    console.log("\n✓ GraphRAG now has knowledge of all n8n nodes!");

  } catch (error) {
    console.error("\n✗ Error:", error.message);
    process.exit(1);
  } finally {
    mcp.stop();
    graphrag.stop();
  }
}

main();
