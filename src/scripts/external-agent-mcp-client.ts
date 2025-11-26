/**
 * External Agent: Find and Fix Broken Workflows Using MCP Client
 *
 * This agent uses the proper MCP SDK client to communicate with the MCP server
 * and discovers available tools, then uses them to find and fix broken workflows.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";

class ExternalWorkflowAgent {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async initialize(): Promise<void> {
    console.log('🚀 Starting MCP Server...\n');

    // Spawn the MCP server
    const serverProcess = spawn('node', ['dist/mcp/index.js'], {
      cwd: process.cwd(),
    });

    // Create transport
    this.transport = new StdioClientTransport({
      command: 'node',
      args: ['dist/mcp/index.js'],
    });

    // Create client
    this.client = new Client({
      name: 'workflow-fixer-agent',
      version: '1.0.0',
    });

    console.log('📡 Connecting to MCP Server...');
    await this.client.connect(this.transport);
    console.log('✅ Connected to MCP Server\n');
  }

  async discoverTools(): Promise<any[]> {
    if (!this.client) throw new Error('Client not initialized');

    console.log('🔍 Discovering available tools...\n');
    const tools = await this.client.listTools();
    console.log(`✓ Found ${tools.tools.length} available tools\n`);

    // Show main tools
    const mainTools = tools.tools.filter(t =>
      ['workflow_manager', 'node_discovery', 'n8n_system'].includes(t.name)
    );

    console.log('Main tools available:');
    mainTools.forEach(tool => {
      console.log(`  • ${tool.name}: ${tool.description}`);
    });
    console.log();

    return tools.tools;
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      const result = await this.client.callTool({
        name,
        arguments: args,
      });
      return result;
    } catch (error) {
      if (error instanceof Error) {
        console.log(`⚠️  Tool error: ${error.message}`);
      }
      return null;
    }
  }

  async checkHealth(): Promise<boolean> {
    console.log('📌 STEP 1: Check System Health\n');
    console.log('🏥 Calling: n8n_system (operation: health)');

    const result = await this.callTool('n8n_system', {
      operation: 'health',
    });

    if (!result) {
      console.log('❌ n8n system check failed');
      return false;
    }

    console.log('✅ n8n system is healthy\n');
    return true;
  }

  async listWorkflows(): Promise<any[]> {
    console.log('📌 STEP 2: Discover Workflows\n');
    console.log('📋 Calling: workflow_manager (action: list)');

    const result = await this.callTool('workflow_manager', {
      action: 'list',
    });

    if (!result || !result.content) {
      console.log('ℹ️  No workflows found');
      return [];
    }

    const content = result.content[0];
    let workflows = [];

    if (content.type === 'text') {
      try {
        const parsed = JSON.parse(content.text);
        workflows = parsed.data?.workflows || [];
      } catch (e) {
        console.log('⚠️  Could not parse workflow list');
      }
    }

    console.log(`✓ Found ${workflows.length} workflows\n`);
    return workflows;
  }

  async getWorkflowDetails(workflowId: string): Promise<any> {
    const result = await this.callTool('workflow_manager', {
      action: 'get',
      id: workflowId,
    });

    if (!result || !result.content) {
      return null;
    }

    const content = result.content[0];
    if (content.type === 'text') {
      try {
        const parsed = JSON.parse(content.text);
        return parsed.data;
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  async validateWorkflow(workflowId: string, workflow: any): Promise<any> {
    const result = await this.callTool('workflow_manager', {
      action: 'validate',
      id: workflowId,
      workflow,
      mode: 'full',
    });

    if (!result || !result.content) {
      return null;
    }

    const content = result.content[0];
    if (content.type === 'text') {
      try {
        return JSON.parse(content.text);
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  async analyzeFoErrors(workflows: any[]): Promise<any[]> {
    console.log('📌 STEP 3: Analyze Workflows for Issues\n');

    const brokenWorkflows = [];

    for (const workflow of workflows) {
      console.log(`Checking: ${workflow.name} (ID: ${workflow.id})`);

      const details = await this.getWorkflowDetails(workflow.id);
      if (!details) {
        console.log(`  ⚠️  Could not retrieve details`);
        continue;
      }

      const issues: string[] = [];

      // Check for basic structure issues
      if (!details.nodes || details.nodes.length === 0) {
        issues.push('No nodes defined');
      }

      if (!details.connections) {
        issues.push('Missing connections object');
      }

      // Check for single-node workflows
      if (details.nodes && details.nodes.length === 1) {
        const nodeName = details.nodes[0].name;
        const hasConnections = details.connections && Object.keys(details.connections).length > 0;
        if (!hasConnections) {
          issues.push('Single node with no connections');
        }
      }

      // Check for missing typeVersion
      if (details.nodes) {
        for (const node of details.nodes) {
          if (node.typeVersion === undefined && node.type !== 'n8n-nodes-base.start') {
            issues.push(`Node "${node.name}" missing typeVersion`);
          }
        }
      }

      if (issues.length > 0) {
        console.log(`  ⚠️  Found ${issues.length} issue(s):`);
        issues.forEach(issue => console.log(`    - ${issue}`));
        brokenWorkflows.push({
          id: workflow.id,
          name: workflow.name,
          issues,
          details,
        });
      } else {
        console.log(`  ✅ Looks good`);
      }
    }

    console.log();
    return brokenWorkflows;
  }

  async reportResults(workflows: any[], brokenWorkflows: any[]): Promise<void> {
    console.log('═'.repeat(70));
    console.log('EXTERNAL AGENT VERIFICATION COMPLETE');
    console.log('═'.repeat(70));
    console.log();

    console.log('📊 Summary:');
    console.log(`  Total workflows: ${workflows.length}`);
    console.log(`  Workflows with issues: ${brokenWorkflows.length}`);

    if (brokenWorkflows.length > 0) {
      console.log('\n⚠️  Workflows needing repair:');
      brokenWorkflows.forEach(wf => {
        console.log(`\n  ${wf.name}`);
        wf.issues.forEach((issue: string) => {
          console.log(`    - ${issue}`);
        });
      });
    } else {
      console.log('\n✅ All workflows are healthy!');
    }

    console.log();
  }

  async run(): Promise<void> {
    console.log('═'.repeat(70));
    console.log('EXTERNAL AGENT: Workflow Analysis via MCP Client');
    console.log('═'.repeat(70));
    console.log();

    try {
      // Initialize connection
      await this.initialize();

      // Discover tools
      const tools = await this.discoverTools();

      // Check system health
      const healthy = await this.checkHealth();
      if (!healthy) {
        console.log('❌ System is not healthy. Aborting.');
        process.exit(1);
      }

      // Get workflows
      const workflows = await this.listWorkflows();
      if (workflows.length === 0) {
        console.log('ℹ️  No workflows to analyze.');
        process.exit(0);
      }

      // Analyze for errors
      const brokenWorkflows = await this.analyzeFoErrors(workflows);

      // Report results
      await this.reportResults(workflows, brokenWorkflows);

    } catch (error) {
      console.error('❌ Agent error:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      // Cleanup
      if (this.transport) {
        await this.transport.close();
      }
    }
  }
}

// Run the agent
const agent = new ExternalWorkflowAgent();
agent.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
