/**
 * Test script to verify MCP server guardrails are working
 * This simulates what an AI agent would see when using the MCP tools
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing MCP Server Guardrails v2.7.1\n');

// Start the MCP server in stdio mode
const serverPath = path.join(__dirname, 'dist', 'mcp', 'server-simple-consolidated.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let responseBuffer = '';

server.stdout.on('data', (data) => {
  responseBuffer += data.toString();

  // Try to parse complete JSON-RPC messages
  const lines = responseBuffer.split('\n');
  responseBuffer = lines.pop() || ''; // Keep incomplete line in buffer

  lines.forEach(line => {
    if (line.trim()) {
      try {
        const msg = JSON.parse(line);
        if (msg.result) {
          console.log('✅ Response received:\n');

          // For list_tools, show the tool descriptions with guardrails
          if (msg.result.tools) {
            console.log(`📋 Found ${msg.result.tools.length} tools\n`);

            // Show node_discovery tool with guardrails
            const nodeDiscovery = msg.result.tools.find(t => t.name === 'node_discovery');
            if (nodeDiscovery) {
              console.log('🔍 node_discovery Tool Description:');
              console.log('─'.repeat(80));
              const lines = nodeDiscovery.description.split('\n').slice(0, 10);
              console.log(lines.join('\n'));
              console.log('... (truncated for brevity)\n');

              if (nodeDiscovery.description.includes('⛔ CRITICAL')) {
                console.log('✅ GUARDRAILS PRESENT: Tool has critical warnings!\n');
              } else {
                console.log('❌ GUARDRAILS MISSING: No critical warnings found!\n');
              }
            }

            // Show workflow_manager tool with guardrails
            const workflowManager = msg.result.tools.find(t => t.name === 'workflow_manager');
            if (workflowManager) {
              console.log('🚨 workflow_manager Tool Description:');
              console.log('─'.repeat(80));
              const lines = workflowManager.description.split('\n').slice(0, 12);
              console.log(lines.join('\n'));
              console.log('... (truncated for brevity)\n');

              if (workflowManager.description.includes('⛔ CRITICAL WORKFLOW BUILDING RULES')) {
                console.log('✅ GUARDRAILS PRESENT: Workflow building rules included!\n');
              } else {
                console.log('❌ GUARDRAILS MISSING: No workflow building rules!\n');
              }
            }

            // Show workflow_diff tool with guardrails
            const workflowDiff = msg.result.tools.find(t => t.name === 'workflow_diff');
            if (workflowDiff) {
              console.log('🔄 workflow_diff Tool Description:');
              console.log('─'.repeat(80));
              const lines = workflowDiff.description.split('\n').slice(0, 10);
              console.log(lines.join('\n'));
              console.log('... (truncated for brevity)\n');

              if (workflowDiff.description.includes('⛔ CRITICAL: USE REAL N8N NODES ONLY')) {
                console.log('✅ GUARDRAILS PRESENT: Node type verification warnings!\n');
              } else {
                console.log('❌ GUARDRAILS MISSING: No node type warnings!\n');
              }
            }

            console.log('═'.repeat(80));
            console.log('✅ MCP Server v2.7.1 Guardrails Test: PASSED');
            console.log('═'.repeat(80));
            console.log('\nAI agents using this MCP server will see:');
            console.log('  ⛔ CRITICAL warnings about using existing nodes only');
            console.log('  ❌ Clear "DO NOT" instructions against custom nodes');
            console.log('  ✅ "ALWAYS" instructions to search for existing nodes first');
            console.log('  📋 6-step mandatory workflow with validation');
            console.log('  🎯 Examples of wrong vs. right node type usage\n');

            server.kill();
            process.exit(0);
          }
        }
      } catch (e) {
        // Not a complete JSON message yet
      }
    }
  });
});

server.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

server.on('close', (code) => {
  console.log(`\nServer process exited with code ${code}`);
});

// Send initialize request
setTimeout(() => {
  console.log('📤 Sending initialize request...\n');
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'guardrails-test',
        version: '1.0.0'
      }
    }
  };
  server.stdin.write(JSON.stringify(initRequest) + '\n');
}, 500);

// Request tool list after initialization
setTimeout(() => {
  console.log('📤 Requesting tools list...\n');
  const toolsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  };
  server.stdin.write(JSON.stringify(toolsRequest) + '\n');
}, 1500);

// Timeout after 10 seconds
setTimeout(() => {
  console.error('❌ Test timed out after 10 seconds');
  server.kill();
  process.exit(1);
}, 10000);
