#!/usr/bin/env node

/**
 * MCP Client Test - Connects to the running MCP server and calls tools
 */

const { spawn } = require('child_process');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function testMCPServer() {
  console.log('🚀 Starting MCP Client Test\n');

  // Spawn the MCP server process
  const serverProcess = spawn('node', ['dist/consolidated-server.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      N8N_API_URL: 'http://localhost:5678',
      N8N_API_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmIwMjg4NC0zYjAyLTQ1MjEtOTg3NC04Zjc5MzBlYmUwZDIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzU5NDQwMDUwLCJleHAiOjE3OTA5NzYwNTA2ODd9.eBNrVVVKAWefUc1L6ca2dO-LEDfu-HpqovuqHbHHEJjQ'
    }
  });

  // Create transport
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/consolidated-server.js'],
    env: {
      N8N_API_URL: 'http://localhost:5678',
      N8N_API_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmIwMjg4NC0zYjAyLTQ1MjEtOTg3NC04Zjc5MzBlYmUwZDIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzU5NDQwMDUwLCJleHAiOjE3OTA5NzYwNTA2ODd9.eBNrVVKAWefUc1L6ca2dO-LEDfu-HpqovuqHbHHEJjQ'
    }
  });

  // Create client
  const client = new Client({
    name: 'test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  try {
    // Connect to server
    console.log('📡 Connecting to MCP server...');
    await client.connect(transport);
    console.log('✅ Connected to MCP server\n');

    // List available tools
    console.log('🔧 Listing available tools...');
    const tools = await client.listTools();
    console.log(`Found ${tools.tools.length} tools:\n`);
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description.substring(0, 100)}...`);
    });
    console.log('');

    // Test 1: List workflows
    console.log('📋 Test 1: Listing workflows...');
    const listResult = await client.callTool({
      name: 'workflow_manager',
      arguments: {
        action: 'list'
      }
    });
    console.log('Result:', JSON.stringify(listResult, null, 2).substring(0, 800));
    console.log('');

    // Test 2: Get a specific workflow
    console.log('📄 Test 2: Getting workflow details...');
    const getResult = await client.callTool({
      name: 'workflow_manager',
      arguments: {
        action: 'get',
        id: '3tiHPw5yRh1lyanL'
      }
    });
    console.log('Result:', JSON.stringify(getResult, null, 2).substring(0, 800));
    console.log('');

    // Test 3: Update workflow with diff operations
    console.log('✏️  Test 3: Updating workflow with diff operations...');
    const updateResult = await client.callTool({
      name: 'workflow_diff',
      arguments: {
        id: '3tiHPw5yRh1lyanL',
        operations: [
          {
            type: 'addNode',
            node: {
              name: 'Filter Important Emails',
              type: 'n8n-nodes-base.filter',
              typeVersion: 2,
              position: [460, 300],
              parameters: {
                conditions: {
                  string: [{
                    value1: '={{$json.subject}}',
                    operation: 'contains',
                    value2: 'urgent'
                  }]
                }
              }
            }
          },
          {
            type: 'addConnection',
            source: 'Monitor New Emails',
            target: 'Filter Important Emails'
          }
        ]
      }
    });
    console.log('Update Result:', JSON.stringify(updateResult, null, 2));
    console.log('');

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    // Cleanup
    await client.close();
    serverProcess.kill();
    process.exit(0);
  }
}

// Run tests
testMCPServer().catch(console.error);
