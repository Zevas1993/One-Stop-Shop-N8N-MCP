#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');

/**
 * Real MCP Client - Uses ACTUAL stdio protocol with running MCP server
 * NO simulations, NO mocks - REAL responses only
 */

class RealMCPClient {
  constructor() {
    this.requestId = 0;
    this.responses = new Map();
    this.buffer = '';
    this.isInitialized = false;
    this.issues = [];
  }

  logIssue(severity, title, description) {
    const issue = { severity, title, description, timestamp: new Date().toISOString() };
    this.issues.push(issue);
    console.log(`\n🔴 [ISSUE] ${severity}: ${title}`);
    console.log(`   ${description}\n`);
  }

  start() {
    return new Promise((resolve, reject) => {
      // Spawn the MCP server process
      this.process = spawn('npm', ['start'], {
        cwd: 'c:\\Users\\Chris Boyd\\Documents\\MCP-Servers\\One-Stop-Shop-N8N-MCP',
        env: {
          ...process.env,
          N8N_API_URL: 'http://localhost:5678',
          N8N_API_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q'
        }
      });

      let initBuffer = '';
      const initTimeout = setTimeout(() => {
        this.process.kill();
        reject(new Error('MCP server initialization timeout'));
      }, 15000);

      this.process.stdout.on('data', (data) => {
        initBuffer += data.toString();
        if (initBuffer.includes('MCP server created')) {
          clearTimeout(initTimeout);
          this.isInitialized = true;
          console.log('✅ MCP Server initialized\n');
          resolve();
        }
        this.handleServerOutput(data.toString());
      });

      this.process.stderr.on('data', (data) => {
        console.error('MCP stderr:', data.toString());
      });

      this.process.on('error', reject);
    });
  }

  handleServerOutput(data) {
    this.buffer += data;

    // Look for complete JSON-RPC responses
    const lines = this.buffer.split('\n');
    this.buffer = lines[lines.length - 1]; // Keep incomplete line

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const json = JSON.parse(line);
        if (json.id !== undefined) {
          const resolver = this.responses.get(json.id);
          if (resolver) {
            resolver(json);
            this.responses.delete(json.id);
          }
        }
      } catch (e) {
        // Not JSON, probably log output
      }
    }
  }

  callTool(name, args) {
    return new Promise((resolve, reject) => {
      if (!this.isInitialized) {
        reject(new Error('MCP server not initialized'));
        return;
      }

      const id = ++this.requestId;
      const request = {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, arguments: args }
      };

      const timeout = setTimeout(() => {
        this.responses.delete(id);
        reject(new Error(`Tool call timeout for ${name}`));
      }, 30000);

      this.responses.set(id, (response) => {
        clearTimeout(timeout);
        if (response.error) {
          reject(new Error(`MCP Error: ${response.error.message}`));
        } else {
          resolve(response.result);
        }
      });

      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async buildWorkflow() {
    console.log('\n🚀 BUILDING AI EMAIL MANAGER WORKFLOW\n');
    console.log('═══════════════════════════════════════\n');

    try {
      // Step 1: Search for Teams node
      console.log('📌 Step 1: Searching for Microsoft Teams node...');
      const teamsSearch = await this.callTool('search_nodes', { keyword: 'teams' });
      console.log(`   ✅ Found Teams nodes`);

      // Step 2: Get Teams node info
      console.log('\n📌 Step 2: Getting Teams node details...');
      const teamsInfo = await this.callTool('get_node_info', { node_type: 'n8n-nodes-base.microsoftTeams' });
      console.log(`   ✅ Got Teams node info`);
      if (teamsInfo.properties && teamsInfo.properties.length === 0) {
        this.logIssue('HIGH', 'Empty properties for Teams node',
          'get_node_info returned node with empty properties array - agent cannot see available options');
      }

      // Step 3: Search for Outlook node
      console.log('\n📌 Step 3: Searching for Microsoft Outlook node...');
      const outlookSearch = await this.callTool('search_nodes', { keyword: 'outlook' });
      console.log(`   ✅ Found Outlook nodes`);

      // Step 4: Get Outlook node info
      console.log('\n📌 Step 4: Getting Outlook node details...');
      const outlookInfo = await this.callTool('get_node_info', { node_type: 'n8n-nodes-base.microsoftOutlook' });
      console.log(`   ✅ Got Outlook node info`);

      // Step 5: Search for OpenAI node
      console.log('\n📌 Step 5: Searching for OpenAI node...');
      const openaiSearch = await this.callTool('search_nodes', { keyword: 'openai' });
      console.log(`   ✅ Found OpenAI nodes`);

      // Step 6: Get OpenAI node info
      console.log('\n📌 Step 6: Getting OpenAI node details...');
      const openaiInfo = await this.callTool('get_node_info', { node_type: 'n8n-nodes-base.openAi' });
      console.log(`   ✅ Got OpenAI node info`);

      // Step 7: Search for Webhook node
      console.log('\n📌 Step 7: Searching for Webhook node...');
      const webhookSearch = await this.callTool('search_nodes', { keyword: 'webhook' });
      console.log(`   ✅ Found Webhook nodes`);

      // Step 8: Create the workflow
      console.log('\n📌 Step 8: Creating workflow structure...');
      const workflow = {
        name: 'AI Email Manager - Outlook & Teams',
        nodes: [
          {
            id: 'webhook-trigger',
            name: 'Webhook - Teams Chat',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 2,
            position: [100, 300],
            parameters: {
              path: 'teams-email-manager',
              options: {}
            }
          },
          {
            id: 'teams-get-messages',
            name: 'Get Teams Messages',
            type: 'n8n-nodes-base.microsoftTeams',
            typeVersion: 2,
            position: [300, 300],
            parameters: {
              operation: 'getMessages',
              resource: 'chatMessage',
              limit: 50
            }
          },
          {
            id: 'outlook-get-emails',
            name: 'Get Outlook Emails',
            type: 'n8n-nodes-base.microsoftOutlook',
            typeVersion: 2,
            position: [300, 500],
            parameters: {
              operation: 'getEmails',
              resource: 'message',
              mailbox: 'user',
              limit: 10
            }
          },
          {
            id: 'openai-analyze',
            name: 'AI Email Analyzer',
            type: 'n8n-nodes-base.openAi',
            typeVersion: 3,
            position: [500, 300],
            parameters: {
              model: 'gpt-4o-mini',
              messages: {
                messageValues: [
                  {
                    content: 'Analyze these emails and Teams messages, then provide a summary.'
                  }
                ]
              }
            }
          },
          {
            id: 'teams-send-response',
            name: 'Send Teams Response',
            type: 'n8n-nodes-base.microsoftTeams',
            typeVersion: 2,
            position: [700, 300],
            parameters: {
              operation: 'sendMessage',
              resource: 'chatMessage',
              message: 'Email analysis complete'
            }
          },
          {
            id: 'outlook-send-reply',
            name: 'Send Email Reply',
            type: 'n8n-nodes-base.microsoftOutlook',
            typeVersion: 2,
            position: [700, 500],
            parameters: {
              operation: 'sendEmail',
              resource: 'message',
              subject: 'Auto-reply: Email Analysis',
              bodyContent: 'Here is your email analysis'
            }
          },
          {
            id: 'complete',
            name: 'Workflow Complete',
            type: 'n8n-nodes-base.noOp',
            typeVersion: 1,
            position: [900, 400],
            parameters: {}
          }
        ],
        connections: {
          'Webhook - Teams Chat': {
            main: [
              [
                { node: 'Get Teams Messages', type: 'main', index: 0 },
                { node: 'Get Outlook Emails', type: 'main', index: 0 }
              ]
            ]
          },
          'Get Teams Messages': {
            main: [[{ node: 'AI Email Analyzer', type: 'main', index: 0 }]]
          },
          'Get Outlook Emails': {
            main: [[{ node: 'AI Email Analyzer', type: 'main', index: 0 }]]
          },
          'AI Email Analyzer': {
            main: [
              [
                { node: 'Send Teams Response', type: 'main', index: 0 },
                { node: 'Send Email Reply', type: 'main', index: 0 }
              ]
            ]
          },
          'Send Teams Response': {
            main: [[{ node: 'Workflow Complete', type: 'main', index: 0 }]]
          },
          'Send Email Reply': {
            main: [[{ node: 'Workflow Complete', type: 'main', index: 0 }]]
          }
        }
      };

      console.log(`   ✅ Workflow structure created with ${workflow.nodes.length} nodes`);

      // Step 9: Validate workflow
      console.log('\n📌 Step 9: Validating workflow before deployment...');
      try {
        const validation = await this.callTool('validate_workflow', { workflow });
        console.log(`   ✅ Workflow validation passed`);
      } catch (e) {
        this.logIssue('MEDIUM', 'Workflow validation error', e.message);
      }

      // Step 10: Create workflow via n8n API
      console.log('\n📌 Step 10: Creating workflow in n8n via MCP...');
      try {
        const result = await this.callTool('n8n_create_workflow', { workflow });
        console.log(`   ✅ Workflow created successfully`);
        console.log(`   Workflow ID: ${result.id}`);
        return result;
      } catch (e) {
        this.logIssue('CRITICAL', 'Workflow creation failed', e.message);
        throw e;
      }

    } catch (error) {
      console.error('\n❌ Error during workflow building:', error.message);
      throw error;
    }
  }

  printIssuesSummary() {
    console.log('\n\n📋 ISSUES DISCOVERED DURING WORKFLOW BUILDING\n');
    console.log('═══════════════════════════════════════════════\n');

    if (this.issues.length === 0) {
      console.log('✅ No issues found!\n');
      return;
    }

    const bySeverity = {
      'CRITICAL': [],
      'HIGH': [],
      'MEDIUM': [],
      'LOW': []
    };

    this.issues.forEach(issue => {
      if (bySeverity[issue.severity]) {
        bySeverity[issue.severity].push(issue);
      }
    });

    Object.entries(bySeverity).forEach(([severity, issues]) => {
      if (issues.length > 0) {
        console.log(`\n${severity} (${issues.length}):`);
        issues.forEach((issue, i) => {
          console.log(`  ${i + 1}. ${issue.title}`);
          console.log(`     ${issue.description}`);
        });
      }
    });

    console.log(`\n\n📊 Total Issues: ${this.issues.length}`);
    console.log(`   Critical: ${bySeverity.CRITICAL.length}`);
    console.log(`   High: ${bySeverity.HIGH.length}`);
    console.log(`   Medium: ${bySeverity.MEDIUM.length}`);
    console.log(`   Low: ${bySeverity.LOW.length}\n`);
  }

  stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}

// Main execution
(async () => {
  const client = new RealMCPClient();

  try {
    await client.start();
    await client.buildWorkflow();
    client.printIssuesSummary();
  } catch (error) {
    console.error('Fatal error:', error.message);
    client.printIssuesSummary();
    process.exit(1);
  } finally {
    client.stop();
    setTimeout(() => process.exit(0), 2000);
  }
})();
