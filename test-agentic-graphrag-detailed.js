#!/usr/bin/env node

/**
 * Detailed MCP Test - Get full responses to understand what's working/broken
 */

const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');

let requestId = 0;
const responses = new Map();

const server = spawn('node', ['dist/mcp/index.js'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
});

const rl = readline.createInterface({
  input: server.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  try {
    const message = JSON.parse(line);

    if (message.result && message.id) {
      const content = message.result.content?.[0]?.text;
      if (content) {
        try {
          responses.set(message.id, {
            success: true,
            data: JSON.parse(content),
          });
        } catch (e) {
          responses.set(message.id, {
            success: false,
            data: content,
          });
        }
      }
    } else if (message.error && message.id) {
      responses.set(message.id, {
        success: false,
        error: message.error,
      });
    }
  } catch (e) {}
});

function sendRequest(method, params = {}) {
  const id = ++requestId;
  const request = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: method, arguments: params },
    id,
  };

  server.stdin.write(JSON.stringify(request) + '\n');

  return new Promise((resolve) => {
    const check = setInterval(() => {
      if (responses.has(id)) {
        clearInterval(check);
        resolve(responses.get(id));
        responses.delete(id);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(check);
      resolve({ success: false, error: 'TIMEOUT' });
    }, 30000);
  });
}

setTimeout(async () => {
  console.log('Detailed Agentic GraphRAG Analysis\n');

  try {
    // Get full pipeline response
    const response = await sendRequest('execute_agent_pipeline', {
      goal: 'Send message to Slack when webhook receives data',
      enableGraphRAG: true,
      shareInsights: true,
    });

    console.log('FULL RESPONSE:');
    console.log(JSON.stringify(response.data, null, 2));

    // Save to file
    fs.writeFileSync(
      'test-results.json',
      JSON.stringify(response.data, null, 2)
    );
    console.log('\n✓ Full response saved to test-results.json');

    // Analyze what's present and what's missing
    const data = response.data;
    console.log('\nANALYSIS:');
    console.log('─'.repeat(60));

    console.log('✓ Handler responded:', data.success);
    console.log('✓ Workflow generated:', !!data.workflow);
    console.log('? Pattern found:', data.pattern ? 'YES' : 'NO (❌ ISSUE)');
    console.log('? Graph insights:', data.graphInsights ? 'YES' : 'NO (❌ ISSUE)');
    console.log('✓ Validation passed:', data.validationResult?.valid);

    if (data.workflow) {
      console.log('\nWorkflow Structure:');
      console.log('  - Nodes:', data.workflow.nodes?.length || 0);
      console.log('  - Connections:', Object.keys(data.workflow.connections || {}).length);
      console.log('  - Settings:', !!data.workflow.settings);

      if (data.workflow.nodes?.length > 0) {
        console.log('\nWorkflow Nodes:');
        data.workflow.nodes.slice(0, 5).forEach((node, i) => {
          console.log(`  ${i + 1}. ${node.name} (${node.type})`);
        });
        if (data.workflow.nodes.length > 5) {
          console.log(`  ... and ${data.workflow.nodes.length - 5} more`);
        }
      }
    }

    if (data.errors?.length > 0) {
      console.log('\nErrors:');
      data.errors.forEach(e => console.log(`  - ${e}`));
    }

    console.log('\nCONCLUSION:');
    console.log('─'.repeat(60));
    if (data.pattern === null && data.graphInsights === null) {
      console.log('❌ CRITICAL: Both pattern discovery AND graph querying are failing');
      console.log('   - Pattern discovery is returning null');
      console.log('   - Graph insights are null');
      console.log('\nPossible causes:');
      console.log('  1. PatternAgent is not finding patterns');
      console.log('  2. GraphRAGBridge is not connected to Python backend');
      console.log('  3. Knowledge graph is not populated');
    } else if (data.pattern === null) {
      console.log('❌ Pattern discovery is failing');
      console.log('✓ But workflow generation works (fallback mode?)');
    } else {
      console.log('✅ System appears to be working');
    }

    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}, 2000);

setTimeout(() => {
  console.error('Timeout');
  server.kill();
  process.exit(1);
}, 60000);
