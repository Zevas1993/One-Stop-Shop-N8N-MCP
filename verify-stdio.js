/**
 * Claude Desktop Stdio Mode Verification Script
 *
 * This script simulates how Claude Desktop communicates with MCP servers:
 * 1. Spawns the server process
 * 2. Sends JSON-RPC requests via stdin
 * 3. Reads responses from stdout
 * 4. Validates the MCP protocol handshake
 */

const { spawn } = require("child_process");
const path = require("path");
const readline = require("readline");

// Load environment variables
require("dotenv").config();

const TIMEOUT_MS = 30000;
// Full server path
const SERVER_PATH = path.join(__dirname, "dist", "main.js");

// Colors for output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function log(msg) {
  console.log(msg);
}
function logSuccess(msg) {
  log(`${colors.green}✓${colors.reset} ${msg}`);
}
function logError(msg) {
  log(`${colors.red}✗${colors.reset} ${msg}`);
}
function logInfo(msg) {
  log(`${colors.dim}  ${msg}${colors.reset}`);
}
function logStep(step, msg) {
  log(`${colors.cyan}[${step}]${colors.reset} ${msg}`);
}

async function verifyStdioMode() {
  log("");
  log(
    `${colors.cyan}╔════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  log(
    `${colors.cyan}║${colors.reset}        Claude Desktop Stdio Mode Verification              ${colors.cyan}║${colors.reset}`
  );
  log(
    `${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}`
  );
  log("");

  logStep("1", "Spawning MCP server process...");

  const serverProcess = spawn("node", [SERVER_PATH], {
    env: {
      ...process.env,
      MCP_MODE: "stdio",
      N8N_AUTO_SYNC: "false",
      N8N_API_KEY:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q",
      N8N_API_URL: "http://localhost:5678",
    },
    stdio: ["pipe", "pipe", "pipe"],
    cwd: __dirname,
  });

  let stdoutBuffer = "";
  let stderrBuffer = "";
  const responses = [];

  // Collect stdout (JSON-RPC responses) and print for debugging
  serverProcess.stdout.on("data", (data) => {
    const text = data.toString();
    stdoutBuffer += text;
    // Print stdout in real-time for debugging
    process.stderr.write(
      `${colors.cyan}[stdout] ${text.substring(0, 200)}${colors.reset}\n`
    );
    // Try to parse complete JSON-RPC messages
    const lines = stdoutBuffer.split("\n");
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        try {
          const parsed = JSON.parse(line);
          responses.push(parsed);
        } catch (e) {
          // Not JSON, might be log output
        }
      }
    }
    stdoutBuffer = lines[lines.length - 1];
  });

  // Collect stderr (logs) and print in real-time
  serverProcess.stderr.on("data", (data) => {
    const text = data.toString();
    stderrBuffer += text;
    // Print stderr in real-time for debugging
    process.stderr.write(
      `${colors.dim}[server] ${text.trim()}${colors.reset}\n`
    );
  });

  // Handle early exit
  let exited = false;
  serverProcess.on("exit", (code) => {
    exited = true;
    if (code !== 0 && code !== null) {
      logError(`Server exited with code ${code}`);
    }
  });

  // Wait for server to initialize (longer wait)
  logInfo("Waiting for server initialization (5s)...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  if (exited) {
    logError("Server exited before initialization completed.");
    log("");
    log(`${colors.yellow}Server stderr output:${colors.reset}`);
    log(stderrBuffer);
    process.exit(1);
  }

  logSuccess("Server process started");

  // Send initialize request
  logStep("2", "Sending initialize request...");
  const initRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "claude-desktop-test",
        version: "1.0.0",
      },
    },
  };

  serverProcess.stdin.write(JSON.stringify(initRequest) + "\n");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Check for initialize response
  const initResponse = responses.find((r) => r.id === 1);
  if (initResponse && initResponse.result) {
    logSuccess("Received initialize response");
    logInfo(
      `Server: ${initResponse.result.serverInfo?.name || "unknown"} v${
        initResponse.result.serverInfo?.version || "?"
      }`
    );
    logInfo(`Protocol: ${initResponse.result.protocolVersion || "unknown"}`);
    logInfo(
      `Capabilities: ${
        Object.keys(initResponse.result.capabilities || {}).join(", ") || "none"
      }`
    );
  } else if (initResponse && initResponse.error) {
    logError(`Initialize failed: ${initResponse.error.message}`);
  } else {
    logError("No initialize response received");
    logInfo("Check server logs for errors");
  }

  // Send initialized notification
  logStep("3", "Sending initialized notification...");
  const initializedNotification = {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  };
  serverProcess.stdin.write(JSON.stringify(initializedNotification) + "\n");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  logSuccess("Initialized notification sent");

  // Send tools/list request
  logStep("4", "Requesting available tools...");
  const toolsRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  };
  serverProcess.stdin.write(JSON.stringify(toolsRequest) + "\n");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const toolsResponse = responses.find((r) => r.id === 2);
  if (toolsResponse && toolsResponse.result) {
    const tools = toolsResponse.result.tools || [];
    logSuccess(`Received ${tools.length} tools`);
    if (tools.length > 0) {
      logInfo(
        `Sample tools: ${tools
          .slice(0, 5)
          .map((t) => t.name)
          .join(", ")}${tools.length > 5 ? "..." : ""}`
      );
    }
  } else if (toolsResponse && toolsResponse.error) {
    logError(`Tools list failed: ${toolsResponse.error.message}`);
  } else {
    logError("No tools/list response received");
  }

  // Cleanup
  logStep("5", "Shutting down server...");
  serverProcess.stdin.end();
  serverProcess.kill("SIGTERM");

  await new Promise((resolve) => {
    serverProcess.on("close", resolve);
    setTimeout(resolve, 3000);
  });

  logSuccess("Server process terminated");

  // Summary
  log("");
  log(
    `${colors.cyan}────────────────────────────────────────────────────────────${colors.reset}`
  );
  log("");

  const success = initResponse?.result && toolsResponse?.result;
  if (success) {
    logSuccess(`${colors.green}Stdio mode verification PASSED!${colors.reset}`);
    logInfo("The MCP server is compatible with Claude Desktop.");
  } else {
    logError(`${colors.red}Stdio mode verification FAILED${colors.reset}`);
    logInfo("Check the server logs above for errors.");
  }

  log("");

  // Show any stderr output (server logs)
  if (stderrBuffer.trim()) {
    log(`${colors.dim}Server logs:${colors.reset}`);
    log(stderrBuffer.split("\n").slice(-10).join("\n"));
  }

  process.exit(success ? 0 : 1);
}

// Run verification
verifyStdioMode().catch((err) => {
  logError(`Verification error: ${err.message}`);
  process.exit(1);
});
