#!/usr/bin/env node

const net = require('net');
const { spawn } = require('child_process');

console.log('🧪 Testing MCP Server Tools\n');

const server = spawn('npm', ['start'], {
  cwd: 'c:\\Users\\Chris Boyd\\Documents\\MCP-Servers\\One-Stop-Shop-N8N-MCP',
  env: {
    ...process.env,
    N8N_API_URL: 'http://localhost:5678',
    N8N_API_KEY: 'test-key'
  }
});

let requestId = 0;
let initialized = false;
const results = [];

// Handle server output
server.stdout.on('data', (data) => {
  const text = data.toString();

  if (!initialized && text.includes('[v3.0.0]')) {
    initialized = true;
    console.log('✅ Server initialized\n');
    console.log('Testing tools...\n');
    runTests();
  }

  // Handle JSON-RPC responses
  const lines = text.split('\n');
  lines.forEach(line => {
    if (!line.trim()) return;
    try {
      const json = JSON.parse(line);
      if (json.id && results[json.id - 1]) {
        if (json.error) {
          results[json.id - 1].status = '❌ ERROR';
          results[json.id - 1].message = json.error.message;
        } else {
          results[json.id - 1].status = '✅ SUCCESS';
          results[json.id - 1].message = 'Tool executed';
        }
      }
    } catch (e) {
      // Not JSON
    }
  });
});

server.stderr.on('data', (data) => {
  // Ignore stderr
});

// Send tool request
function sendTool(toolName, args = {}) {
  return new Promise((resolve) => {
    const id = ++requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: toolName, arguments: args }
    };

    results[id - 1] = { tool: toolName, status: '⏳ PENDING', message: '' };

    setTimeout(() => {
      if (results[id - 1].status === '⏳ PENDING') {
        results[id - 1].status = '⏱️  TIMEOUT';
      }
      resolve();
    }, 3000);

    server.stdin.write(JSON.stringify(request) + '\n');
  });
}

async function runTests() {
  const toolsToTest = [
    { name: 'list_nodes', args: { limit: 1 } },
    { name: 'search_nodes', args: { query: 'slack', limit: 1 } },
    { name: 'get_node_info', args: { nodeType: 'n8n-nodes-base.slack' } },
    { name: 'list_ai_tools', args: {} },
    { name: 'validate_workflow', args: { workflow: { nodes: [], connections: {} } } }
  ];

  // Send all requests
  for (const tool of toolsToTest) {
    await sendTool(tool.name, tool.args);
    await new Promise(r => setTimeout(r, 100));
  }

  // Wait for responses
  await new Promise(r => setTimeout(r, 4000));

  // Print results
  console.log('📊 Test Results:\n');
  let passed = 0, failed = 0;

  for (const result of results) {
    const icon = result.status.includes('SUCCESS') ? '✅' :
                 result.status.includes('ERROR') ? '❌' :
                 result.status.includes('TIMEOUT') ? '⏱️' : '⏳';
    console.log(`${icon} ${result.tool.padEnd(25)} ${result.status}`);
    if (result.status.includes('SUCCESS')) passed++;
    else failed++;
  }

  console.log(`\n${passed}/${toolsToTest.length} tools working`);

  if (failed === 0) {
    console.log('\n✅ No issues detected!');
  } else {
    console.log(`\n⚠️  ${failed} tools failed`);
  }

  server.kill();
  process.exit(failed === 0 ? 0 : 1);
}

setTimeout(() => {
  console.error('Server timeout');
  server.kill();
  process.exit(1);
}, 25000);
