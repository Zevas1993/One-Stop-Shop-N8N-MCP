/**
 * Direct n8n Workflow Review
 * Uses native n8n API to list and review workflows
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

// Load .env file
const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
}

const N8N_URL = envVars.N8N_API_URL || "http://localhost:5678";
const API_KEY = envVars.N8N_API_KEY;

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  blue: "\x1b[34m",
};

async function fetchAPI(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${N8N_URL}/api/v1${endpoint}`);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: "GET",
      headers: {
        "X-N8N-API-KEY": API_KEY,
        "Content-Type": "application/json",
      },
    };

    const http = require("http");
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Failed to parse response"));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  console.log("");
  console.log(
    `${colors.cyan}${colors.bold}╔════════════════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bold}║                      n8n WORKFLOW REVIEW                               ║${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bold}╚════════════════════════════════════════════════════════════════════════╝${colors.reset}`
  );
  console.log("");

  console.log(`${colors.dim}Connecting to: ${N8N_URL}${colors.reset}`);
  console.log("");

  try {
    const response = await fetchAPI("/workflows");
    const workflows = response.data || [];

    console.log(
      `${colors.green}${colors.bold}✓ Found ${workflows.length} workflows${colors.reset}\n`
    );

    // Summary table
    console.log(`${colors.bold}${"─".repeat(76)}${colors.reset}`);
    console.log(
      `${colors.bold}  STATUS   │  ID               │  NAME${colors.reset}`
    );
    console.log(`${colors.bold}${"─".repeat(76)}${colors.reset}`);

    for (const wf of workflows) {
      const status = wf.active
        ? `${colors.green}● ACTIVE ${colors.reset}`
        : `${colors.dim}○ INACTIVE${colors.reset}`;
      const id = wf.id.padEnd(18);
      const name = wf.name.substring(0, 45);
      console.log(`  ${status}│  ${id}│  ${name}`);
    }
    console.log(`${colors.bold}${"─".repeat(76)}${colors.reset}\n`);

    // Detailed analysis
    console.log(
      `${colors.cyan}${colors.bold}════════════════════════════════════════════════════════════════════════════${colors.reset}`
    );
    console.log(
      `${colors.cyan}${colors.bold}                           DETAILED ANALYSIS                               ${colors.reset}`
    );
    console.log(
      `${colors.cyan}${colors.bold}════════════════════════════════════════════════════════════════════════════${colors.reset}\n`
    );

    for (const wf of workflows) {
      const nodes = wf.nodes || [];
      const status = wf.active
        ? `${colors.green}ACTIVE${colors.reset}`
        : `${colors.yellow}INACTIVE${colors.reset}`;

      console.log(`${colors.bold}📋 ${wf.name}${colors.reset}`);
      console.log(`${"─".repeat(76)}`);
      console.log(`   ID: ${wf.id}`);
      console.log(`   Status: ${status}`);
      console.log(`   Updated: ${new Date(wf.updatedAt).toLocaleString()}`);
      console.log(`   Nodes: ${nodes.length}`);

      // Group nodes by type category
      const triggers = nodes.filter((n) => n.type?.includes("Trigger"));
      const aiNodes = nodes.filter(
        (n) =>
          n.type?.includes("langchain") ||
          n.type?.includes("openAi") ||
          n.type?.includes("agent")
      );
      const outlookNodes = nodes.filter(
        (n) => n.type?.includes("Outlook") || n.type?.includes("outlook")
      );
      const teamsNodes = nodes.filter((n) => n.type?.includes("Teams"));
      const webhooks = nodes.filter(
        (n) => n.type?.includes("webhook") || n.type?.includes("Webhook")
      );

      console.log("");
      console.log(`   ${colors.cyan}Node Categories:${colors.reset}`);

      if (triggers.length > 0) {
        console.log(
          `     🔔 Triggers: ${triggers
            .map((n) => n.name || n.type.split(".").pop())
            .join(", ")}`
        );
      }
      if (webhooks.length > 0) {
        console.log(
          `     🌐 Webhooks: ${webhooks
            .map((n) => n.name || n.type.split(".").pop())
            .join(", ")}`
        );
      }
      if (aiNodes.length > 0) {
        console.log(
          `     🤖 AI/LLM: ${aiNodes
            .map((n) => n.name || n.type.split(".").pop())
            .join(", ")}`
        );
      }
      if (outlookNodes.length > 0) {
        console.log(
          `     📧 Outlook: ${outlookNodes
            .map((n) => n.name || n.type.split(".").pop())
            .join(", ")}`
        );
      }
      if (teamsNodes.length > 0) {
        console.log(
          `     💬 Teams: ${teamsNodes
            .map((n) => n.name || n.type.split(".").pop())
            .join(", ")}`
        );
      }

      // Show all node types
      const nodeTypes = {};
      for (const node of nodes) {
        const type = node.type?.split(".").pop() || "unknown";
        nodeTypes[type] = (nodeTypes[type] || 0) + 1;
      }

      console.log("");
      console.log(`   ${colors.dim}All Node Types:${colors.reset}`);
      for (const [type, count] of Object.entries(nodeTypes)) {
        console.log(`     ${colors.dim}• ${type}: ${count}${colors.reset}`);
      }

      console.log("\n");
    }

    // Summary statistics
    console.log(
      `${colors.cyan}${colors.bold}════════════════════════════════════════════════════════════════════════════${colors.reset}`
    );
    console.log(
      `${colors.cyan}${colors.bold}                              SUMMARY                                       ${colors.reset}`
    );
    console.log(
      `${colors.cyan}${colors.bold}════════════════════════════════════════════════════════════════════════════${colors.reset}\n`
    );

    const activeCount = workflows.filter((w) => w.active).length;
    const totalNodes = workflows.reduce(
      (sum, w) => sum + (w.nodes?.length || 0),
      0
    );
    const aiWorkflows = workflows.filter((w) =>
      w.nodes?.some(
        (n) => n.type?.includes("langchain") || n.type?.includes("agent")
      )
    ).length;

    console.log(
      `   Total Workflows: ${colors.bold}${workflows.length}${colors.reset}`
    );
    console.log(`   Active: ${colors.green}${activeCount}${colors.reset}`);
    console.log(
      `   Inactive: ${colors.yellow}${workflows.length - activeCount}${
        colors.reset
      }`
    );
    console.log(`   Total Nodes: ${colors.bold}${totalNodes}${colors.reset}`);
    console.log(
      `   AI-Powered Workflows: ${colors.blue}${aiWorkflows}${colors.reset}`
    );
    console.log("");
    console.log(
      `${colors.green}${colors.bold}✓ Review complete!${colors.reset}\n`
    );
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main();
