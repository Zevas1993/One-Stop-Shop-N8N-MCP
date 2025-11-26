/**
 * External Agent: Find and Fix Broken Workflows
 *
 * This agent interacts with the MCP server as an external agent would:
 * 1. Discovers available tools
 * 2. Lists all workflows in the system
 * 3. Identifies broken workflows (missing connections, invalid nodes)
 * 4. Fixes broken workflows using the MCP server tools
 * 5. Validates the fixes
 */

import { spawn, spawnSync } from 'child_process';
import * as readline from 'readline';

interface MCPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: any;
}

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

class ExternalWorkflowAgent {
  private mcpProcess: any;
  private requestId = 0;
  private pendingRequests = new Map<number, (response: MCPResponse) => void>();
  private isReady = false;

  constructor() {
    // Start MCP server in stdio mode
    this.mcpProcess = spawn('node', ['dist/mcp/index.js'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.setupStdioHandlers();
  }

  private setupStdioHandlers() {
    const rl = readline.createInterface({
      input: this.mcpProcess.stdout,
      crlfDelay: Infinity,
    });

    rl.on('line', (line: string) => {
      try {
        const response: MCPResponse = JSON.parse(line);
        const resolver = this.pendingRequests.get(response.id);
        if (resolver) {
          resolver(response);
          this.pendingRequests.delete(response.id);
        }
      } catch (error) {
        console.log('MCP: ' + line);
      }
    });

    // Mark as ready after a brief delay
    setTimeout(() => {
      this.isReady = true;
      console.log('✅ MCP Server ready for agent commands\n');
    }, 1000);
  }

  private send(request: MCPRequest): Promise<MCPResponse> {
    return new Promise((resolve) => {
      this.pendingRequests.set(request.id, resolve);
      this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async healthCheck(): Promise<any> {
    const id = ++this.requestId;
    console.log('🏥 Agent: Checking n8n system health...');

    const response = await this.send({
      jsonrpc: '2.0',
      id,
      method: 'n8n_system',
      params: {
        operation: 'health',
        verbose: false,
      },
    });

    if (response.error) {
      console.log(`❌ Health check failed: ${response.error.message}`);
      return null;
    }

    console.log(`✅ n8n is healthy`);
    return response.result;
  }

  async listWorkflows(): Promise<any> {
    const id = ++this.requestId;
    console.log('📋 Agent: Listing all workflows...');

    const response = await this.send({
      jsonrpc: '2.0',
      id,
      method: 'workflow_manager',
      params: {
        action: 'list',
      },
    });

    if (response.error) {
      console.log(`❌ Error: ${response.error.message}`);
      return null;
    }

    const workflows = response.result?.data?.workflows || [];
    console.log(`✓ Found ${workflows.length} workflows`);
    return workflows;
  }

  async validateWorkflow(workflowId: string, workflow: any): Promise<any> {
    const id = ++this.requestId;
    console.log(`🔍 Agent: Validating workflow ${workflowId}...`);

    const response = await this.send({
      jsonrpc: '2.0',
      id,
      method: 'workflow_manager',
      params: {
        action: 'validate',
        id: workflowId,
        workflow,
        mode: 'full',
      },
    });

    if (response.error) {
      console.log(`⚠️  Validation error: ${response.error.message}`);
      return null;
    }

    return response.result;
  }

  async getWorkflowDetails(workflowId: string): Promise<any> {
    const id = ++this.requestId;
    console.log(`📚 Agent: Getting workflow ${workflowId} details...`);

    const response = await this.send({
      jsonrpc: '2.0',
      id,
      method: 'workflow_manager',
      params: {
        action: 'get',
        id: workflowId,
      },
    });

    if (response.error) {
      console.log(`⚠️  Could not get workflow: ${response.error.message}`);
      return null;
    }

    return response.result?.data;
  }

  async updateWorkflow(workflowId: string, updates: any): Promise<any> {
    const id = ++this.requestId;
    console.log(`🔧 Agent: Updating workflow ${workflowId}...`);

    const response = await this.send({
      jsonrpc: '2.0',
      id,
      method: 'workflow_manager',
      params: {
        action: 'update',
        id: workflowId,
        ...updates,
      },
    });

    if (response.error) {
      console.log(`❌ Update failed: ${response.error.message}`);
      return null;
    }

    console.log(`✓ Workflow updated successfully`);
    return response.result;
  }

  async findBrokenWorkflows(workflows: any[]): Promise<any[]> {
    const brokenWorkflows = [];

    console.log('\n🔎 Agent: Analyzing workflows for issues...\n');

    for (const workflow of workflows) {
      console.log(`Checking ${workflow.name} (ID: ${workflow.id})...`);

      const details = await this.getWorkflowDetails(workflow.id);
      if (!details) continue;

      const issues: string[] = [];

      // Check for broken structures
      if (!details.nodes || details.nodes.length === 0) {
        issues.push('No nodes in workflow');
      }

      if (!details.connections) {
        issues.push('Missing connections object');
      }

      // Check for single node workflows with no connections
      if (details.nodes && details.nodes.length === 1 &&
          (!details.connections || Object.keys(details.connections).length === 0)) {
        issues.push('Single node with no connections');
      }

      // Check for orphaned nodes (referenced in connections but don't exist)
      if (details.connections) {
        const nodeNames = new Set(details.nodes?.map((n: any) => n.name) || []);
        for (const connKey of Object.keys(details.connections)) {
          if (!nodeNames.has(connKey)) {
            issues.push(`Connection references non-existent node: ${connKey}`);
          }
        }
      }

      // Check for nodes without required typeVersion
      if (details.nodes) {
        for (const node of details.nodes) {
          if (node.typeVersion === undefined && node.type !== 'n8n-nodes-base.start') {
            issues.push(`Node ${node.name} missing typeVersion`);
          }
        }
      }

      if (issues.length > 0) {
        console.log(`  ⚠️  Issues found:`);
        issues.forEach(issue => console.log(`    - ${issue}`));
        brokenWorkflows.push({
          id: workflow.id,
          name: workflow.name,
          issues,
          workflow: details,
        });
      } else {
        console.log(`  ✅ No issues detected`);
      }
    }

    return brokenWorkflows;
  }

  async fixWorkflow(brokenWorkflow: any): Promise<boolean> {
    console.log(`\n🔧 Agent: Fixing workflow "${brokenWorkflow.name}"...`);
    const workflow = brokenWorkflow.workflow;

    // Fix: Ensure all nodes have typeVersion
    if (workflow.nodes) {
      for (const node of workflow.nodes) {
        if (node.typeVersion === undefined) {
          // Get recommended version from database
          const id = ++this.requestId;
          const infoResponse = await this.send({
            jsonrpc: '2.0',
            id,
            method: 'node_discovery',
            params: {
              action: 'get_info',
              nodeType: node.type,
            },
          });

          if (infoResponse.result?.data?.currentVersion) {
            node.typeVersion = infoResponse.result.data.currentVersion;
            console.log(`  ✓ Set ${node.name} typeVersion to ${node.typeVersion}`);
          }
        }
      }
    }

    // Fix: Add missing connections for single-node workflows
    if (workflow.nodes && workflow.nodes.length === 1) {
      const nodeName = workflow.nodes[0].name;
      if (!workflow.connections[nodeName]) {
        workflow.connections[nodeName] = {
          main: [],
        };
        console.log(`  ✓ Added connections structure for ${nodeName}`);
      }
    }

    // Fix: Remove orphaned connection references
    if (workflow.connections) {
      const nodeNames = new Set(workflow.nodes?.map((n: any) => n.name) || []);
      for (const connKey of Object.keys(workflow.connections)) {
        if (!nodeNames.has(connKey)) {
          delete workflow.connections[connKey];
          console.log(`  ✓ Removed orphaned connection reference: ${connKey}`);
        }
      }
    }

    // Update the workflow
    const success = await this.updateWorkflow(brokenWorkflow.id, { workflow });
    return !!success;
  }

  async runFullAgent(): Promise<void> {
    console.log('═'.repeat(70));
    console.log('EXTERNAL AGENT: Find and Fix Broken Workflows');
    console.log('═'.repeat(70));
    console.log();

    // Wait for server to be ready
    while (!this.isReady) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    try {
      // 1. Health check
      console.log('📌 STEP 1: Check n8n System Health\n');
      const health = await this.healthCheck();
      if (!health) {
        console.log('❌ n8n is not available. Aborting.');
        process.exit(1);
      }

      // 2. List all workflows
      console.log('\n📌 STEP 2: Discover Workflows\n');
      const workflows = await this.listWorkflows();
      if (!workflows || workflows.length === 0) {
        console.log('ℹ️  No workflows found in the system.');
        process.exit(0);
      }

      // 3. Find broken workflows
      console.log('\n📌 STEP 3: Identify Broken Workflows\n');
      const brokenWorkflows = await this.findBrokenWorkflows(workflows);

      if (brokenWorkflows.length === 0) {
        console.log('\n✅ All workflows are healthy - no repairs needed!');
        process.exit(0);
      }

      console.log(`\n⚠️  Found ${brokenWorkflows.length} workflow(s) with issues\n`);

      // 4. Fix broken workflows
      console.log('\n📌 STEP 4: Fix Broken Workflows\n');
      const fixedWorkflows = [];
      for (const broken of brokenWorkflows) {
        const fixed = await this.fixWorkflow(broken);
        if (fixed) {
          fixedWorkflows.push(broken.name);
        }
      }

      // 5. Validation
      console.log('\n📌 STEP 5: Validate Fixes\n');
      console.log('✓ Validating repaired workflows...');
      for (const broken of brokenWorkflows) {
        const details = await this.getWorkflowDetails(broken.id);
        if (details) {
          const validation = await this.validateWorkflow(broken.id, details);
          if (validation?.valid) {
            console.log(`  ✅ ${broken.name} - Valid`);
          } else {
            console.log(`  ⚠️  ${broken.name} - Still has issues`);
          }
        }
      }

      // Summary
      console.log('\n' + '═'.repeat(70));
      console.log('AGENT WORKFLOW FIX COMPLETE');
      console.log('═'.repeat(70));
      console.log();

      if (fixedWorkflows.length > 0) {
        console.log('✅ Fixed Workflows:');
        fixedWorkflows.forEach(name => console.log(`  - ${name}`));
      }

      console.log(`\n📊 Summary:`);
      console.log(`  Total workflows: ${workflows.length}`);
      console.log(`  Broken workflows: ${brokenWorkflows.length}`);
      console.log(`  Fixed workflows: ${fixedWorkflows.length}`);
      console.log();

    } catch (error) {
      console.error('Error during agent execution:', error);
    }

    process.exit(0);
  }
}

// Run the agent
const agent = new ExternalWorkflowAgent();
agent.runFullAgent().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
