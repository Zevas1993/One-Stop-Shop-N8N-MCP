#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');

console.log('🚀 Starting MCP Server and connecting via stdio...\n');

// Start MCP server
const server = spawn('npm', ['start'], {
  cwd: 'c:\\Users\\Chris Boyd\\Documents\\MCP-Servers\\One-Stop-Shop-N8N-MCP',
  env: {
    ...process.env,
    N8N_API_URL: 'http://localhost:5678',
    N8N_API_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q'
  }
});

let requestId = 0;
let serverReady = false;
const pendingRequests = new Map();

// Track initialization
let initBuffer = '';
const initTimeout = setTimeout(() => {
  console.error('❌ Server initialization timeout');
  server.kill();
  process.exit(1);
}, 20000);

// Handle server output
server.stdout.on('data', (data) => {
  const text = data.toString();
  initBuffer += text;

  // Check if server is ready
  if (!serverReady && (initBuffer.includes('MCP server created') || initBuffer.includes('listening'))) {
    serverReady = true;
    clearTimeout(initTimeout);
    console.log('✅ MCP Server initialized and ready\n');
    performInteractiveSession();
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
          console.log(`❌ Tool error for '${toolName}': ${json.error.message}\n`);
          reject(new Error(json.error.message));
        } else {
          console.log(`✅ Tool response received for '${toolName}'\n`);
          resolve(json.result);
        }
      }
    } catch (e) {
      // Not JSON, probably log output
    }
  });
});

server.stderr.on('data', (data) => {
  console.error('Server stderr:', data.toString());
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
  process.exit(1);
});

// Send request to MCP server
function sendRequest(toolName, args) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: toolName, arguments: args }
    };

    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Timeout calling ${toolName}`));
    }, 15000);

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

    console.log(`📤 Calling tool: ${toolName}`);
    console.log(`   Args: ${JSON.stringify(args, null, 2)}\n`);
    server.stdin.write(JSON.stringify(request) + '\n');
  });
}

// Interactive workflow building session
async function performInteractiveSession() {
  const issues = [];

  try {
    console.log('\n═══════════════════════════════════════════════════════════\n');
    console.log('🎯 INTERACTIVE WORKFLOW BUILDING SESSION\n');
    console.log('Building: AI Email Manager for Outlook + Teams\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Step 1: Search for Teams nodes
    console.log('━━━ STEP 1: Search for Teams nodes ━━━\n');
    try {
      const teamsResult = await sendRequest('search_nodes', { keyword: 'teams' });
      console.log(`Result keys: ${Object.keys(teamsResult).join(', ')}\n`);
    } catch (e) {
      console.log(`⚠️  Issue: ${e.message}\n`);
      issues.push({ tool: 'search_nodes', error: e.message });
    }

    // Step 2: Get Teams node info
    console.log('━━━ STEP 2: Get Teams node info ━━━\n');
    try {
      const teamsInfo = await sendRequest('get_node_info', { node_type: 'n8n-nodes-base.microsoftTeams' });
      console.log(`Result keys: ${Object.keys(teamsInfo).join(', ')}\n`);
      if (teamsInfo.properties && Array.isArray(teamsInfo.properties)) {
        console.log(`   Properties found: ${teamsInfo.properties.length}\n`);
        if (teamsInfo.properties.length === 0) {
          issues.push({ tool: 'get_node_info', issue: 'Empty properties array for Teams node' });
        }
      }
    } catch (e) {
      console.log(`⚠️  Issue: ${e.message}\n`);
      issues.push({ tool: 'get_node_info', error: e.message });
    }

    // Step 3: Search for Outlook nodes
    console.log('━━━ STEP 3: Search for Outlook nodes ━━━\n');
    try {
      const outlookResult = await sendRequest('search_nodes', { keyword: 'outlook' });
      console.log(`Result keys: ${Object.keys(outlookResult).join(', ')}\n`);
    } catch (e) {
      console.log(`⚠️  Issue: ${e.message}\n`);
      issues.push({ tool: 'search_nodes', error: e.message });
    }

    // Step 4: Search for OpenAI nodes
    console.log('━━━ STEP 4: Search for OpenAI nodes ━━━\n');
    try {
      const openaiResult = await sendRequest('search_nodes', { keyword: 'openai' });
      console.log(`Result keys: ${Object.keys(openaiResult).join(', ')}\n`);
    } catch (e) {
      console.log(`⚠️  Issue: ${e.message}\n`);
      issues.push({ tool: 'search_nodes', error: e.message });
    }

    // Step 5: List AI tools available
    console.log('━━━ STEP 5: List available AI tools ━━━\n');
    try {
      const aiTools = await sendRequest('list_ai_tools', {});
      console.log(`Result keys: ${Object.keys(aiTools).join(', ')}\n`);
    } catch (e) {
      console.log(`⚠️  Issue: ${e.message}\n`);
      issues.push({ tool: 'list_ai_tools', error: e.message });
    }

  } catch (error) {
    console.error('Fatal error:', error);
  }

  // Report issues
  console.log('\n═══════════════════════════════════════════════════════════\n');
  console.log('📋 ISSUES DISCOVERED\n');
  if (issues.length === 0) {
    console.log('✅ No issues found!\n');
  } else {
    issues.forEach((issue, i) => {
      console.log(`${i + 1}. Tool: ${issue.tool}`);
      if (issue.error) {
        console.log(`   Error: ${issue.error}`);
      }
      if (issue.issue) {
        console.log(`   Issue: ${issue.issue}`);
      }
      console.log();
    });
  }

  console.log('═══════════════════════════════════════════════════════════\n');

  // Cleanup
  setTimeout(() => {
    server.kill();
    process.exit(0);
  }, 2000);
}
