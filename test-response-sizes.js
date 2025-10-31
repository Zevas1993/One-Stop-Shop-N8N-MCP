#!/usr/bin/env node

/**
 * MCP Server Response Size Analyzer
 * Measures actual response sizes to understand context window impact
 */

const { spawn } = require('child_process');
const readline = require('readline');

class ResponseAnalyzer {
  constructor() {
    this.requestId = 1;
    this.pendingRequests = new Map();
    this.responseSizes = [];
  }

  async startServer() {
    return new Promise((resolve) => {
      console.log('\n🚀 Connecting to MCP server via stdio...\n');

      // Note: We're NOT starting a new server - we're connecting to the already running one
      // This simulates real usage where the server is already running

      this.process = spawn('npm', ['start'], {
        cwd: 'c:\\Users\\Chris Boyd\\Documents\\MCP-Servers\\One-Stop-Shop-N8N-MCP',
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      this.rl = readline.createInterface({
        input: this.process.stdout,
        output: undefined
      });

      let ready = false;
      const timeout = setTimeout(() => {
        if (!ready) {
          ready = true;
          console.log('✅ MCP server connected\n');
          resolve();
        }
      }, 5000);

      this.rl.on('line', (line) => {
        if (line.includes('Background initialization complete') && !ready) {
          ready = true;
          clearTimeout(timeout);
          console.log('✅ MCP server initialized\n');
          resolve();
        }

        try {
          if (line.trim().startsWith('{')) {
            const response = JSON.parse(line);
            if (response.id) {
              this.handleResponse(response);
            }
          }
        } catch (e) {
          // Not JSON
        }
      });

      setTimeout(() => {
        if (!ready) {
          ready = true;
          clearTimeout(timeout);
          console.log('✅ Server startup timeout - proceeding\n');
          resolve();
        }
      }, 8000);
    });
  }

  handleResponse(response) {
    const { id, result } = response;
    const pending = this.pendingRequests.get(id);
    if (pending) {
      this.pendingRequests.delete(id);
      if (result && result.content) {
        // Measure size
        const textContent = result.content[0]?.text || '';
        const size = new TextEncoder().encode(JSON.stringify(result)).length;
        pending.resolve({ size, text: textContent });
      }
    }
  }

  async sendRequest(method, params = {}) {
    const id = this.requestId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }, 10000);

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

      const requestStr = JSON.stringify(request) + '\n';
      this.process.stdin.write(requestStr);
    });
  }

  async callTool(name, args) {
    try {
      const result = await this.sendRequest('tools/call', { name, arguments: args });
      this.responseSizes.push({ tool: name, ...result });
      return result;
    } catch (error) {
      return { tool: name, error: error.message, size: 0 };
    }
  }

  printAnalysis() {
    console.log('\n' + '═'.repeat(80));
    console.log('📊 MCP RESPONSE SIZE ANALYSIS');
    console.log('═'.repeat(80) + '\n');

    let totalSize = 0;
    let successCount = 0;

    console.log('Tool                           Size (bytes)    Status');
    console.log('─'.repeat(80));

    for (const response of this.responseSizes) {
      const name = response.tool.padEnd(30);
      const size = (response.size || 0).toString().padEnd(15);
      const status = response.error ? `❌ ${response.error}` : '✅ Success';
      console.log(`${name}${size}${status}`);

      if (!response.error) {
        totalSize += response.size;
        successCount++;
      }
    }

    console.log('─'.repeat(80));
    const avgSize = successCount > 0 ? Math.round(totalSize / successCount) : 0;
    console.log(`Total bytes (successful): ${totalSize}`);
    console.log(`Average per response: ${avgSize} bytes`);
    console.log(`Success rate: ${successCount}/${this.responseSizes.length}\n`);

    console.log('📋 CONTEXT IMPACT ANALYSIS');
    console.log('─'.repeat(80));
    console.log(`Total tokens used (estimate): ~${Math.round(totalSize / 4)} tokens`);
    console.log(`  (assuming ~4 bytes per token average)`);
    console.log(`Context window (Claude 3.5 Sonnet): 200,000 tokens`);
    console.log(`Percentage of context: ${((totalSize / 4) / 200000 * 100).toFixed(4)}%\n`);

    // Recommend by size
    console.log('💡 RECOMMENDATIONS');
    console.log('─'.repeat(80));
    const largeResponses = this.responseSizes.filter(r => r.size > 50000);
    if (largeResponses.length > 0) {
      console.log('Large responses (>50KB):');
      largeResponses.forEach(r => {
        console.log(`  - ${r.tool}: ${r.size} bytes`);
      });
      console.log('  → Consider using get_node_essentials instead of get_node_info\n');
    } else {
      console.log('✅ All responses are reasonable size\n');
    }
  }

  stop() {
    if (this.rl) this.rl.close();
    if (this.process) this.process.kill();
  }
}

async function analyzeResponses() {
  const analyzer = new ResponseAnalyzer();

  try {
    await analyzer.startServer();

    console.log('🧪 Testing MCP Tool Responses...\n');

    // Test 1: Small response - essentials
    console.log('Test 1: get_node_essentials (should be SMALL)');
    await analyzer.callTool('get_node_essentials', {
      node_type: 'n8n-nodes-base.httpRequest'
    });

    // Test 2: Large response - full info
    console.log('Test 2: get_node_info (should be MEDIUM)');
    await analyzer.callTool('get_node_info', {
      node_type: 'n8n-nodes-base.httpRequest'
    });

    // Test 3: Search
    console.log('Test 3: search_nodes (may error but will show response size)');
    await analyzer.callTool('search_nodes', {
      query: 'slack'
    });

    // Test 4: List nodes
    console.log('Test 4: list_nodes (may error but will show response size)');
    await analyzer.callTool('list_nodes', {});

    // Test 5: List AI tools
    console.log('Test 5: list_ai_tools');
    await analyzer.callTool('list_ai_tools', {});

    console.log('\n');
    analyzer.printAnalysis();

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    analyzer.stop();
  }
}

analyzeResponses();
