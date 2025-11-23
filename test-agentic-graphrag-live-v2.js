#!/usr/bin/env node

/**
 * Live MCP Server Test for Agentic GraphRAG - v2
 * Properly handles MCP response format
 */

const { spawn } = require("child_process");
const readline = require("readline");

let requestId = 0;
const responses = new Map();

// Start the MCP server
const server = spawn("node", ["dist/mcp/index.js"], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "pipe"],
});

// Create readline interface for server output
const rl = readline.createInterface({
  input: server.stdout,
  terminal: false,
});

// Listen for server output
rl.on("line", (line) => {
  try {
    const message = JSON.parse(line);

    // MCP response format: { jsonrpc, id, result: { content: [...] } }
    if (message.result && message.id) {
      const content = message.result.content?.[0]?.text;
      if (content) {
        try {
          responses.set(message.id, {
            success: true,
            data: JSON.parse(content),
            raw: message.result,
          });
        } catch (e) {
          responses.set(message.id, {
            success: false,
            data: content,
            raw: message.result,
          });
        }
      } else {
        responses.set(message.id, {
          success: false,
          data: message.result,
          raw: message.result,
        });
      }
    } else if (message.error && message.id) {
      responses.set(message.id, {
        success: false,
        error: message.error,
        raw: message,
      });
    }
  } catch (e) {
    // Non-JSON output
    if (line && !line.includes("[DEBUG]")) {
      console.log("[SERVER LOG]", line);
    }
  }
});

server.stderr.on("data", (data) => {
  const text = data.toString();
  if (text && !text.includes("DEBUG")) {
    console.error("[STDERR]", text);
  }
});

// Helper to send MCP request
function sendRequest(method, params = {}) {
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
    const checkResponse = setInterval(() => {
      if (responses.has(id)) {
        clearInterval(checkResponse);
        const response = responses.get(id);
        responses.delete(id);
        resolve(response);
      }
    }, 100);

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkResponse);
      resolve({
        success: false,
        error: "TIMEOUT",
        data: null,
      });
    }, 30000);
  });
}

// Format test output
function printTest(name, success, result) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log("─".repeat(60));

  if (!success) {
    console.log("❌ FAILED");
    if (result.error) {
      console.log("Error:", result.error);
    }
    if (result.data) {
      console.log(
        "Response:",
        JSON.stringify(result.data, null, 2).substring(0, 500)
      );
    }
  } else {
    console.log("✅ SUCCESS");
    const data = result.data;
    if (data && typeof data === "object") {
      Object.entries(data).forEach(([key, value]) => {
        if (key !== "errors" && key !== "guidance") {
          const displayValue =
            typeof value === "object" && value !== null
              ? `[object] (${Object.keys(value).length} keys)`
              : String(value).substring(0, 100);
          console.log(`  • ${key}: ${displayValue}`);
        }
      });

      if (data.errors?.length > 0) {
        console.log("\n❌ ERRORS:");
        data.errors.forEach((e) => console.log(`    - ${e}`));
      }
      if (data.guidance) {
        console.log("\n💡 GUIDANCE:");
        console.log(`    ${data.guidance}`);
      }
    }
  }
}

// Wait for server to be ready
setTimeout(async () => {
  console.log(
    "\n╔════════════════════════════════════════════════════════════╗"
  );
  console.log("║  Testing Agentic GraphRAG via Live MCP Server             ║");
  console.log("║  (v2 - Proper MCP Response Parsing)                      ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  try {
    // Test 1
    const status = await sendRequest("get_agent_status", {
      includeHistory: false,
    });
    printTest("get_agent_status", status.success, status);

    // Test 2
    const pattern = await sendRequest("execute_pattern_discovery", {
      goal: "Send Slack notifications when data changes",
    });
    printTest("execute_pattern_discovery", pattern.success, pattern);

    // Test 3
    const workflow = await sendRequest("execute_workflow_generation", {
      goal: "Fetch data from API and store in database",
    });
    printTest("execute_workflow_generation", workflow.success, workflow);

    // Test 4
    const pipeline = await sendRequest("execute_agent_pipeline", {
      goal: "Monitor email and categorize by priority",
      enableGraphRAG: true,
      shareInsights: true,
    });
    printTest("execute_agent_pipeline", pipeline.success, pipeline);

    if (pipeline.success && pipeline.data && pipeline.data.graphInsights) {
      console.log("\n--- GRAPH INSIGHTS (Standard Goal) ---");
      console.log(JSON.stringify(pipeline.data.graphInsights, null, 2));
      console.log("--------------------------------------\n");
    }

    // Test 5 (Custom Goal)
    const customGoal = await sendRequest("execute_agent_pipeline", {
      goal: "Monitor Outlook emails, use RAG to answer questions, and reply via Teams",
      enableGraphRAG: true,
      shareInsights: true,
    });
    printTest(
      "execute_agent_pipeline (Custom Goal)",
      customGoal.success,
      customGoal
    );

    if (customGoal.success && customGoal.data && customGoal.data.workflow) {
      console.log("\n--- CUSTOM WORKFLOW SUGGESTION ---");
      console.log(JSON.stringify(customGoal.data.workflow, null, 2));
      console.log("----------------------------------\n");
    }

    // Summary
    console.log(
      "\n╔════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║                        SUMMARY                            ║"
    );
    console.log(
      "╚════════════════════════════════════════════════════════════╝"
    );

    const tests = [
      { name: "get_agent_status", result: status },
      { name: "execute_pattern_discovery", result: pattern },
      { name: "execute_workflow_generation", result: workflow },
      { name: "execute_agent_pipeline", result: pipeline },
      { name: "execute_agent_pipeline (Custom Goal)", result: customGoal },
    ];

    const passed = tests.filter((t) => t.result.success).length;
    const total = tests.length;

    console.log(`\nTests Passed: ${passed}/${total}`);
    tests.forEach((t) => {
      const icon = t.result.success ? "✅" : "❌";
      console.log(`${icon} ${t.name}`);
    });

    if (passed === 0) {
      console.log("\n⚠️  ALL TESTS FAILED");
      console.log("The agentic GraphRAG system is NOT working via MCP.");
      console.log("\nNext steps:");
      console.log("1. Check server logs for errors");
      console.log("2. Verify orchestrator initialization");
      console.log("3. Check if handlers are being called");
    } else if (passed === total) {
      console.log("\n✅ ALL TESTS PASSED");
      console.log("The agentic GraphRAG system is fully functional!");
    } else {
      console.log(`\n⚠️  ${total - passed} test(s) failed`);
    }

    process.exit(passed === total ? 0 : 1);
  } catch (error) {
    console.error("\nTest error:", error);
    process.exit(1);
  }
}, 3000);

// Handle server errors
server.on("error", (error) => {
  console.error("Server error:", error);
  process.exit(1);
});

// Timeout
setTimeout(() => {
  console.error("\nTests timed out");
  server.kill();
  process.exit(1);
}, 180000);
