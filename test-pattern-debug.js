#!/usr/bin/env node

/**
 * Debug Pattern Discovery
 * Test specific goals to understand why patterns aren't being found
 */

const { spawn } = require('child_process');
const readline = require('readline');

let requestId = 0;
const responses = new Map();

// Start the MCP server
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

    // MCP response format
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
    }
  } catch (e) {
    // Skip non-JSON
  }
});

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

    setTimeout(() => {
      clearInterval(checkResponse);
      resolve({ success: false, error: 'TIMEOUT' });
    }, 30000);
  });
}

setTimeout(async () => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Pattern Discovery Debug Test                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const testCases = [
    'Send Slack notifications',
    'Send Slack notification',
    'slack',
    'Slack message',
    'Send message to Slack when webhook receives data',
    'Email workflow',
    'Send email',
    'database operations',
    'API integration',
    'unknown goal that doesnt match any pattern',
  ];

  for (const goal of testCases) {
    console.log(`\n📝 Testing goal: "${goal}"`);
    console.log('─'.repeat(60));

    const result = await sendRequest('execute_pattern_discovery', { goal });

    if (result.success && result.data) {
      const data = result.data;
      if (data.pattern) {
        console.log(`✅ PATTERN FOUND: ${data.pattern.patternName}`);
        console.log(`   Confidence: ${data.pattern.confidence}`);
        console.log(`   Matched Keywords: ${data.pattern.matchedKeywords?.join(', ') || 'none'}`);
        console.log(`   Suggested Nodes: ${data.pattern.suggestedNodes?.join(', ') || 'none'}`);
      } else {
        console.log(`❌ No pattern found`);
        if (data.errors?.length > 0) {
          console.log(`   Errors: ${data.errors.join('; ')}`);
        }
      }
    } else {
      console.log(`❌ Request failed: ${result.error || 'unknown error'}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('Test Complete');
  process.exit(0);
}, 5000);

setTimeout(() => {
  console.error('\nTests timed out');
  server.kill();
  process.exit(1);
}, 300000);
