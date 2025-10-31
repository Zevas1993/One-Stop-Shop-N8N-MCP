#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('🚀 Testing MCP Server Tool Registration\n');

const server = spawn('npm', ['start'], {
  cwd: 'c:\\Users\\Chris Boyd\\Documents\\MCP-Servers\\One-Stop-Shop-N8N-MCP',
  env: {
    ...process.env,
    N8N_API_URL: 'http://localhost:5678',
    N8N_API_KEY: 'test-key'
  }
});

let requestId = 0;
let serverReady = false;
const pendingRequests = new Map();

// Handle server output
server.stdout.on('data', (data) => {
  const text = data.toString();

  // Check if server is ready
  if (!serverReady && text.includes('[v3.0.0]')) {
    serverReady = true;
    console.log('✅ Server initialized\n');
    testTools();
    return;
  }

  // Handle JSON-RPC responses
  const lines = text.split('\n');
  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    try {
      const json = JSON.parse(line);
      if (json.id !== undefined && pendingRequests.has(json.id)) {
        const { resolve, reject, toolName } = pendingRequests.get(json.id);
        pendingRequests.delete(json.id);

        if (json.error) {
          console.log(`❌ ${toolName}: ${json.error.message}`);
          reject(new Error(json.error.message));
        } else {
          console.log(`✅ ${toolName}: Available`);
          resolve(json.result);
        }
      }
    } catch (e) {
      // Not JSON, probably log output
    }
  });
});

server.stderr.on('data', (data) => {
  // Ignore stderr noise
});

// Send request to MCP server
function sendRequest(toolName) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: toolName, arguments: { limit: 1 } }
    };

    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      console.log(`⏱️  ${toolName}: TIMEOUT`);
      reject(new Error(`Timeout calling ${toolName}`));
    }, 5000);

    pendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
      toolName
    });

    server.stdin.write(JSON.stringify(request) + '\n');
  });
}

// Test key tools
async function testTools() {
  console.log('Testing tool availability:\n');

  const toolsToTest = [
    'list_nodes',
    'search_nodes',
    'get_node_info',
    'get_node_essentials',
    'validate_workflow',
    'list_ai_tools'
  ];

  let passed = 0;
  let failed = 0;

  for (const toolName of toolsToTest) {
    try {
      await sendRequest(toolName);
      passed++;
    } catch (e) {
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed}/${toolsToTest.length} tools available`);

  if (failed === 0) {
    console.log('🎉 All tools are registered and available!');
    console.log('\n✅ Issue #2 appears to be RESOLVED');
  } else {
    console.log(`\n⚠️  ${failed} tools still unavailable - Issue #2 may need investigation`);
  }

  setTimeout(() => {
    server.kill();
    process.exit(failed === 0 ? 0 : 1);
  }, 1000);
}

setTimeout(() => {
  console.error('Server initialization timeout');
  server.kill();
  process.exit(1);
}, 30000);
