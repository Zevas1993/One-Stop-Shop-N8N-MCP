#!/usr/bin/env node

/**
 * Test Orchestrator Initialization on Server Startup
 * This test checks if the nano agent orchestrator initializes when the server starts
 * instead of waiting for the first request (lazy initialization)
 */

const { spawn } = require('child_process');
const readline = require('readline');

let requestId = 0;
const responses = new Map();
let serverLogs = [];
let orchestratorInitializedOnStartup = false;

// Start the MCP server
const server = spawn('node', ['dist/mcp/index.js'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
});

// Create readline interface for server output
const rl = readline.createInterface({
  input: server.stdout,
  terminal: false,
});

// Listen for server output
rl.on('line', (line) => {
  try {
    const message = JSON.parse(line);

    // Check for orchestrator initialization log
    if (message.msg && message.msg.includes('Initializing GraphRAG orchestrator')) {
      serverLogs.push(`✅ Found init log: ${message.msg}`);
    }
    if (message.msg && message.msg.includes('Orchestrator ready')) {
      orchestratorInitializedOnStartup = true;
      serverLogs.push(`✅ Orchestrator initialized on startup: ${message.msg}`);
    }
    if (message.msg && message.msg.includes('[Server]') && message.msg.includes('Nano agent orchestrator')) {
      serverLogs.push(`✅ Server startup initialization: ${message.msg}`);
    }

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
    if (line && !line.includes('[DEBUG]')) {
      serverLogs.push(line);
    }
  }
});

server.stderr.on('data', (data) => {
  const text = data.toString();
  if (text && !text.includes('DEBUG')) {
    serverLogs.push(`[STDERR] ${text}`);
  }
});

// Helper to send MCP request
function sendRequest(method, params = {}) {
  const id = ++requestId;
  const request = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: method,
      arguments: params,
    },
    id,
  };

  server.stdin.write(JSON.stringify(request) + '\n');

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
        error: 'TIMEOUT',
        data: null,
      });
    }, 30000);
  });
}

// Wait for server to be ready
setTimeout(async () => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Testing Orchestrator Initialization on Server Startup    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    console.log('\n📋 Server Startup Logs:');
    serverLogs.forEach(log => console.log(`   ${log}`));

    // Test get_agent_status to see if orchestrator initialized on startup
    console.log('\n🔍 Checking agent status immediately after server start...');
    const status = await sendRequest('get_agent_status', { includeHistory: false });

    console.log('\n' + '─'.repeat(60));
    console.log('TEST: Orchestrator Initialization Check');
    console.log('─'.repeat(60));

    if (status.success && status.data) {
      const agentStatus = status.data.status;
      console.log(`Agent Status: ${agentStatus}`);

      if (agentStatus === 'ready') {
        console.log('✅ ORCHESTRATOR INITIALIZED ON STARTUP');
        console.log('   Status shows "ready" - initialization successful!');
      } else if (agentStatus === 'not-initialized') {
        console.log('❌ ORCHESTRATOR NOT INITIALIZED ON STARTUP');
        console.log('   Status shows "not-initialized" - lazy initialization still happening');
      } else {
        console.log(`⚠️  UNKNOWN STATUS: ${agentStatus}`);
      }

      if (status.data.message) {
        console.log(`\nMessage: ${status.data.message}`);
      }

      console.log('\nFull Response:');
      console.log(JSON.stringify(status.data, null, 2));
    } else {
      console.log('❌ FAILED TO GET STATUS');
      console.log('Error:', status.error);
      console.log('Data:', status.data);
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('SUMMARY');
    console.log('═'.repeat(60));

    if (orchestratorInitializedOnStartup) {
      console.log('✅ STARTUP INITIALIZATION DETECTED IN LOGS');
    } else {
      console.log('⚠️  No startup initialization logs found');
    }

    if (status.success && status.data?.status === 'ready') {
      console.log('✅ ORCHESTRATOR READY ON FIRST REQUEST');
      console.log('   = Initialization on startup is working!');
      process.exit(0);
    } else {
      console.log('❌ ORCHESTRATOR NOT READY ON FIRST REQUEST');
      console.log('   = Initialization on startup might not be working');
      process.exit(1);
    }
  } catch (error) {
    console.error('\nTest error:', error);
    process.exit(1);
  }
}, 5000);

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

// Timeout
setTimeout(() => {
  console.error('\nTests timed out');
  server.kill();
  process.exit(1);
}, 180000);
