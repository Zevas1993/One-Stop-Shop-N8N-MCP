#!/usr/bin/env node

/**
 * Live MCP Server Test for Agentic GraphRAG
 * Tests the actual MCP handlers by sending real MCP requests
 */

const { spawn } = require('child_process');
const readline = require('readline');

let requestId = 0;

// Start the MCP server
const server = spawn('node', ['dist/mcp/index.js'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
});

// Create readline interface for server output
const rl = readline.createInterface({
  input: server.stdout,
  output: process.stdout,
  terminal: false,
});

let serverReady = false;
const responses = new Map();

// Listen for server output
rl.on('line', (line) => {
  try {
    const message = JSON.parse(line);

    if (message.result && message.id) {
      // Response to a request
      responses.set(message.id, {
        result: message.result,
        error: message.error,
      });
    } else if (message.jsonrpc === '2.0') {
      // Server startup message
      serverReady = true;
      console.log('✓ Server is ready\n');
    }
  } catch (e) {
    // Not JSON, just log it
    if (line && !line.includes('DEBUG')) {
      console.log('[SERVER]', line);
    }
  }
});

server.stderr.on('data', (data) => {
  console.error('[ERROR]', data.toString());
});

// Helper to send MCP request
function sendRequest(method, params = {}) {
  const id = ++requestId;
  const request = {
    jsonrpc: '2.0',
    method,
    params,
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
      resolve({ error: 'TIMEOUT', result: null });
    }, 30000);
  });
}

// Wait for server to be ready
setTimeout(async () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Testing Agentic GraphRAG via Live MCP Server             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Test 1: get_agent_status
    console.log('TEST 1: get_agent_status');
    console.log('─'.repeat(60));
    const statusResp = await sendRequest('tools/call', {
      name: 'get_agent_status',
      arguments: { includeHistory: false },
    });

    if (statusResp.error) {
      console.error('❌ ERROR:', statusResp.error);
      console.log('Response:', JSON.stringify(statusResp, null, 2));
    } else {
      const result = statusResp.result;
      console.log('✓ Status:', result?.status);
      console.log('✓ Message:', result?.message);
      if (result?.components) {
        console.log('✓ Components:', JSON.stringify(result.components, null, 2));
      }
    }
    console.log();

    // Test 2: execute_pattern_discovery
    console.log('TEST 2: execute_pattern_discovery');
    console.log('─'.repeat(60));
    const patternResp = await sendRequest('tools/call', {
      name: 'execute_pattern_discovery',
      arguments: { goal: 'Send Slack notifications when data changes' },
    });

    if (patternResp.error) {
      console.error('❌ ERROR:', patternResp.error);
      console.log('Response:', JSON.stringify(patternResp, null, 2));
    } else {
      const result = patternResp.result;
      console.log('✓ Success:', result?.success);
      console.log('✓ Goal:', result?.goal);
      console.log('✓ Pattern found:', !!result?.pattern);
      if (result?.pattern) {
        console.log('  - Pattern name:', result.pattern.patternName);
        console.log('  - Confidence:', result.pattern.confidence);
      }
      if (result?.errors?.length > 0) {
        console.log('❌ Errors:', result.errors);
      }
    }
    console.log();

    // Test 3: execute_workflow_generation
    console.log('TEST 3: execute_workflow_generation');
    console.log('─'.repeat(60));
    const workflowResp = await sendRequest('tools/call', {
      name: 'execute_workflow_generation',
      arguments: { goal: 'Fetch data from API and store in database' },
    });

    if (workflowResp.error) {
      console.error('❌ ERROR:', workflowResp.error);
      console.log('Response:', JSON.stringify(workflowResp, null, 2));
    } else {
      const result = workflowResp.result;
      console.log('✓ Success:', result?.success);
      console.log('✓ Goal:', result?.goal);
      console.log('✓ Workflow generated:', !!result?.workflow);
      if (result?.workflow) {
        console.log('  - Nodes:', result.workflow?.nodes?.length || 0);
        console.log('  - Connections:', Object.keys(result.workflow?.connections || {}).length);
      }
      console.log('✓ Validation passed:', result?.validationResult?.valid);
      if (result?.errors?.length > 0) {
        console.log('❌ Errors:', result.errors);
      }
    }
    console.log();

    // Test 4: execute_agent_pipeline (full pipeline)
    console.log('TEST 4: execute_agent_pipeline (Full Pipeline)');
    console.log('─'.repeat(60));
    const pipelineResp = await sendRequest('tools/call', {
      name: 'execute_agent_pipeline',
      arguments: {
        goal: 'Monitor email and categorize by priority',
        enableGraphRAG: true,
        shareInsights: true,
      },
    });

    if (pipelineResp.error) {
      console.error('❌ ERROR:', pipelineResp.error);
      console.log('Response:', JSON.stringify(pipelineResp, null, 2));
    } else {
      const result = pipelineResp.result;
      console.log('✓ Success:', result?.success);
      console.log('✓ Goal:', result?.goal);
      console.log('✓ Pattern found:', !!result?.pattern);
      console.log('✓ Graph insights:', !!result?.graphInsights);
      console.log('✓ Workflow generated:', !!result?.workflow);
      console.log('✓ Validation passed:', result?.validationResult?.valid);
      console.log('✓ Total execution time:', result?.executionStats?.totalTime + 'ms');
      if (result?.errors?.length > 0) {
        console.log('❌ Errors:', result.errors);
      }
    }
    console.log();

    // Summary
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                        SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('All MCP tools tested via live server');
    console.log('Check above for actual results and errors');

    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}, 2000);

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

// Timeout
setTimeout(() => {
  console.error('Tests timed out');
  server.kill();
  process.exit(1);
}, 120000);
