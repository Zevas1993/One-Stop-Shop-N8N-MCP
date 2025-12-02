#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');

// Start the MCP server
const server = spawn('node', ['dist/mcp/index.js'], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'pipe']
});

let initialized = false;
let requestId = 1;

// Create readline interface for responses
const rl = readline.createInterface({
  input: server.stdout
});

// Handle server output
rl.on('line', (line) => {
  if (line.trim()) {
    try {
      const response = JSON.parse(line);
      console.log('Response:', JSON.stringify(response, null, 2));

      // After initialization, request tools list
      if (!initialized && response.result) {
        initialized = true;
        console.log('\n✅ Server initialized. Requesting tools list...\n');
        setTimeout(() => {
          sendRequest('tools/list', {});
        }, 500);
      }
      // After tools list, check for nano_llm_query
      else if (response.result && response.result.tools) {
        const tools = response.result.tools;
        console.log(`\n📋 Total tools: ${tools.length}`);

        const nanoLlmTools = tools.filter(t => t.name.includes('nano_llm') || t.name.includes('graphrag') || t.name.includes('agent'));
        console.log(`\n🤖 AI/GraphRAG tools found: ${nanoLlmTools.length}`);
        nanoLlmTools.forEach(t => {
          console.log(`  - ${t.name}`);
        });

        // Exit
        console.log('\n✅ Test complete');
        server.kill();
        process.exit(0);
      }
    } catch (e) {
      // Ignore non-JSON output
    }
  }
});

// Handle errors
server.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Send JSON-RPC request
function sendRequest(method, params) {
  const request = {
    jsonrpc: '2.0',
    id: requestId++,
    method,
    params
  };

  console.log(`→ Sending: ${method}`);
  server.stdin.write(JSON.stringify(request) + '\n');
}

// Start by initializing
console.log('🚀 Starting MCP client...\n');
sendRequest('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'Claude Code Test', version: '1.0' }
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('\n❌ Timeout waiting for response');
  server.kill();
  process.exit(1);
}, 10000);
