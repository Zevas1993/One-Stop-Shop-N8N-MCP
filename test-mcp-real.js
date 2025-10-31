#!/usr/bin/env node

/**
 * Real MCP Server Client
 * Connects to running MCP server via stdio and sends actual JSON-RPC requests
 * NO MOCKING - REAL CALLS ONLY
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

class MCPRealClient {
  constructor() {
    this.process = null;
    this.rl = null;
    this.requestId = 1;
    this.pendingRequests = new Map();
    this.responses = [];
    this.isReady = false;
  }

  /**
   * Start the MCP server and establish communication
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      console.log('\n🚀 Starting MCP server...\n');

      // Start the MCP server process
      this.process = spawn('npm', ['start'], {
        cwd: path.join('c:\\Users\\Chris Boyd\\Documents\\MCP-Servers\\One-Stop-Shop-N8N-MCP'),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      // Set up readline interface to read server output
      this.rl = readline.createInterface({
        input: this.process.stdout,
        output: undefined
      });

      // Listen for server output
      let initCheckComplete = false;
      const initTimeout = setTimeout(() => {
        if (!initCheckComplete) {
          initCheckComplete = true;
          this.isReady = true;
          console.log('✅ MCP server process started\n');
          resolve();
        }
      }, 5000); // Give server 5 seconds to start

      this.rl.on('line', (line) => {
        // Log server output
        if (line.includes('[INFO]') || line.includes('[WARN]') || line.includes('[ERROR]')) {
          console.log(`[SERVER] ${line}`);
        }

        // Check if server is initialized
        if (line.includes('Background initialization complete') && !initCheckComplete) {
          initCheckComplete = true;
          clearTimeout(initTimeout);
          this.isReady = true;
          console.log('✅ MCP server initialized\n');
          resolve();
        }

        // Check for JSON-RPC responses
        try {
          if (line.trim().startsWith('{')) {
            const response = JSON.parse(line);
            if (response.id) {
              this.handleResponse(response);
            }
          }
        } catch (e) {
          // Not JSON, ignore
        }
      });

      this.process.stderr.on('data', (data) => {
        console.error(`[SERVER ERROR] ${data.toString()}`);
      });

      this.process.on('error', (err) => {
        reject(new Error(`Failed to start MCP server: ${err.message}`));
      });

      // Wait for actual timeout if server doesn't signal ready
      setTimeout(() => {
        if (!this.isReady) {
          initCheckComplete = true;
          this.isReady = true;
          console.log('✅ Server startup timeout - proceeding\n');
          resolve();
        }
      }, 8000);
    });
  }

  /**
   * Send a JSON-RPC request to the MCP server
   */
  async sendRequest(method, params = {}) {
    if (!this.isReady) {
      throw new Error('Server not ready');
    }

    const id = this.requestId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      // Set up response handler
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for ${method}`));
      }, 10000); // 10 second timeout

      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      // Send request
      const requestStr = JSON.stringify(request) + '\n';
      console.log(`\n📤 Sending request: ${method}`);
      this.process.stdin.write(requestStr, (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          reject(new Error(`Failed to send request: ${err.message}`));
        }
      });
    });
  }

  /**
   * Handle responses from the server
   */
  handleResponse(response) {
    const { id, result, error } = response;

    const pending = this.pendingRequests.get(id);
    if (pending) {
      this.pendingRequests.delete(id);
      if (error) {
        pending.reject(new Error(error.message || JSON.stringify(error)));
      } else {
        pending.resolve(result);
      }
    }
  }

  /**
   * Call a tool
   */
  async callTool(name, args) {
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args
    });

    if (response && response.content) {
      return response.content;
    }
    return response;
  }

  /**
   * List available tools
   */
  async listTools() {
    const response = await this.sendRequest('tools/list', {});
    return response;
  }

  /**
   * Stop the server
   */
  stop() {
    if (this.rl) this.rl.close();
    if (this.process) this.process.kill();
  }
}

/**
 * Main test execution
 */
async function runRealTests() {
  const client = new MCPRealClient();
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Start the server
    await client.startServer();

    console.log('\n' + '═'.repeat(70));
    console.log('🧪 REAL MCP SERVER TESTS - ACTUAL FUNCTION CALLS');
    console.log('═'.repeat(70));

    // Test 1: List Tools
    console.log('\n\n📋 Test 1: List Available Tools');
    console.log('─'.repeat(70));
    try {
      const tools = await client.listTools();
      if (tools && Array.isArray(tools)) {
        console.log(`✅ PASSED: Got ${tools.length} tools`);
        testsPassed++;
      } else {
        console.log('❌ FAILED: Invalid tools response format');
        testsFailed++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      testsFailed++;
    }

    // Test 2: Get Node Info
    console.log('\n\n📋 Test 2: Get Node Info (HTTP Request)');
    console.log('─'.repeat(70));
    try {
      const result = await client.callTool('get_node_info', {
        node_type: 'n8n-nodes-base.httpRequest'
      });

      if (result && result.length > 0) {
        console.log(`✅ PASSED: Got node information`);
        console.log(`   Response type: ${result[0].type}`);
        if (result[0].text) {
          console.log(`   Content length: ${result[0].text.length} characters`);
        }
        testsPassed++;
      } else {
        console.log('❌ FAILED: No node information returned');
        testsFailed++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      testsFailed++;
    }

    // Test 3: Search Nodes
    console.log('\n\n📋 Test 3: Search Nodes');
    console.log('─'.repeat(70));
    try {
      const result = await client.callTool('search_nodes', {
        query: 'slack'
      });

      if (result && result.length > 0) {
        console.log(`✅ PASSED: Found search results for 'slack'`);
        console.log(`   Results: ${result[0].text.substring(0, 100)}...`);
        testsPassed++;
      } else {
        console.log('❌ FAILED: No search results');
        testsFailed++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      testsFailed++;
    }

    // Test 4: List Nodes
    console.log('\n\n📋 Test 4: List All Nodes');
    console.log('─'.repeat(70));
    try {
      const result = await client.callTool('list_nodes', {});

      if (result && result.length > 0) {
        console.log(`✅ PASSED: Got node list`);
        console.log(`   Response: ${result[0].text.substring(0, 100)}...`);
        testsPassed++;
      } else {
        console.log('❌ FAILED: No nodes listed');
        testsFailed++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      testsFailed++;
    }

    // Test 5: Validate Workflow
    console.log('\n\n📋 Test 5: Validate Workflow');
    console.log('─'.repeat(70));
    try {
      const result = await client.callTool('validate_workflow', {
        workflow: {
          nodes: [
            {
              id: '1',
              type: 'n8n-nodes-base.httpRequest',
              typeVersion: 4.1,
              position: [100, 100],
              parameters: {}
            }
          ],
          connections: {}
        }
      });

      if (result) {
        console.log(`✅ PASSED: Workflow validation executed`);
        console.log(`   Result: ${result[0].text.substring(0, 150)}...`);
        testsPassed++;
      } else {
        console.log('❌ FAILED: No validation result');
        testsFailed++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      testsFailed++;
    }

    // Test 6: Get Node Essentials (AI-optimized)
    console.log('\n\n📋 Test 6: Get Node Essentials (AI-Optimized)');
    console.log('─'.repeat(70));
    try {
      const result = await client.callTool('get_node_essentials', {
        node_type: 'n8n-nodes-base.httpRequest'
      });

      if (result && result.length > 0) {
        console.log(`✅ PASSED: Got essential properties`);
        console.log(`   Response size: ${result[0].text.length} characters`);
        console.log(`   (This should be significantly smaller than get_node_info)`);
        testsPassed++;
      } else {
        console.log('❌ FAILED: No essential properties');
        testsFailed++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      testsFailed++;
    }

    // Summary
    console.log('\n\n' + '═'.repeat(70));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(70));
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📈 Pass Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
    console.log('═'.repeat(70) + '\n');

    process.exit(testsFailed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n💥 Fatal Error:', error.message);
    process.exit(1);
  } finally {
    client.stop();
  }
}

// Run tests
runRealTests();
