/**
 * EXTERNAL AGENT: Fix Broken Workflows
 *
 * This agent uses the MCP server to fix all identified broken workflows
 * by adding missing typeVersions and fixing structural issues.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

class WorkflowFixerAgent {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async initialize(): Promise<void> {
    this.client = new Client({
      name: 'workflow-fixer-agent',
      version: '1.0.0',
    });

    this.transport = new StdioClientTransport({
      command: 'node',
      args: ['dist/mcp/index.js'],
    });

    await this.client.connect(this.transport);
  }

  private async callTool(name: string, args: any): Promise<any> {
    if (!this.client) throw new Error('Client not initialized');
    try {
      return await this.client.callTool({ name, arguments: args });
    } catch (error) {
      if (error instanceof Error) {
        console.log(`⚠️  Error: ${error.message}`);
      }
      return null;
    }
  }

  private parseToolResult(result: any): any {
    if (!result || !result.content) return null;
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

  private getDefaultTypeVersion(nodeType: string): number {
    const versions: { [key: string]: number } = {
      'n8n-nodes-base.webhook': 1,
      'n8n-nodes-base.httpRequest': 5,
      'n8n-nodes-base.code': 3,
      'n8n-nodes-base.set': 3,
      'n8n-nodes-base.merge': 3,
      'n8n-nodes-base.switch': 1,
      'n8n-nodes-base.start': 1,
      'n8n-nodes-base.if': 1,
    };
    return versions[nodeType] || 1;
  }

  async fixWorkflow(workflowId: string, workflowName: string): Promise<boolean> {
    // Get workflow
    const getResult = await this.callTool('workflow_manager', {
      action: 'get',
      id: workflowId,
    });

    const workflowData = this.parseToolResult(getResult);
    if (!workflowData?.data) {
      console.log(`   ⚠️  Could not retrieve workflow`);
      return false;
    }

    const workflow = workflowData.data;
    let hasChanges = false;

    // Fix typeVersion issues
    if (workflow.nodes) {
      for (const node of workflow.nodes) {
        if (node.typeVersion === undefined && node.type !== 'n8n-nodes-base.start') {
          node.typeVersion = this.getDefaultTypeVersion(node.type);
          hasChanges = true;
          console.log(`   ✓ Set ${node.name} typeVersion = ${node.typeVersion}`);
        }
      }
    }

    // Fix single-node with no connections
    if (workflow.nodes?.length === 1) {
      const nodeName = workflow.nodes[0].name;
      if (!workflow.connections || Object.keys(workflow.connections).length === 0) {
        workflow.connections = workflow.connections || {};
        workflow.connections[nodeName] = { main: [] };
        hasChanges = true;
        console.log(`   ✓ Added connection structure for ${nodeName}`);
      }
    }

    if (!hasChanges) {
      console.log(`   ℹ️  No changes needed`);
      return false;
    }

    // Update workflow
    const updateResult = await this.callTool('workflow_manager', {
      action: 'update',
      id: workflowId,
      workflow,
    });

    if (updateResult) {
      console.log(`   ✅ FIXED`);
      return true;
    } else {
      console.log(`   ❌ Update failed`);
      return false;
    }
  }

  async run(): Promise<void> {
    console.log('═'.repeat(70));
    console.log('🤖 EXTERNAL AGENT: FIX BROKEN WORKFLOWS');
    console.log('═'.repeat(70));
    console.log();

    try {
      console.log('📡 Connecting to MCP Server...');
      await this.initialize();
      console.log('✅ Connected\n');

      // Broken workflows to fix
      const brokenWorkflows = [
        { id: 'Baf9nylVDD1pzj9Q', name: '🎯 Ultimate AI Outlook Assistant - Proper Nodes' },
        { id: 'LpAFvk5XmT91CXEo', name: 'Complex Multi-Node Test' },
        { id: 'O7Q0GyWcHvAHFiGQ', name: 'Enhanced Outlook AI Assistant - Advanced' },
        { id: 'a7aGwsrnXDcjf0jd', name: '🧠 Ultimate AI Outlook Assistant - Enterprise Edition' },
        { id: 'eXaLatLLaJ3FyJej', name: '📨 Gmail AI Assistant - Working Version' },
        { id: 'irKDBNBQMguzNUON', name: 'Test Simple Webhook Workflow' },
        { id: 'jPgnqs7cGTKQT3Fh', name: 'MCP Enhanced Demo - Smart Email Classifier' },
        { id: 'l5grHFX3Ha93k0fZ', name: 'Enhanced Complex Workflow Test' },
        { id: 'nIa5IwRrxKIsOyIw', name: 'MCP Test Workflow' },
        { id: 'tzfdYTiQmCaW8NRr', name: 'Test Workflow' }
      ];

      let fixedCount = 0;

      for (const workflow of brokenWorkflows) {
        console.log(`\n🔧 Fixing: ${workflow.name}`);
        console.log(`   ID: ${workflow.id}`);

        const fixed = await this.fixWorkflow(workflow.id, workflow.name);
        if (fixed) fixedCount++;
      }

      // Summary
      console.log('\n' + '═'.repeat(70));
      console.log(`✅ REPAIR COMPLETE: Fixed ${fixedCount}/${brokenWorkflows.length} workflows`);
      console.log('═'.repeat(70));
      console.log();

    } catch (error) {
      console.error('❌ Agent error:', error instanceof Error ? error.message : error);
    } finally {
      if (this.transport) {
        await this.transport.close();
      }
    }
  }
}

// Run the agent
const agent = new WorkflowFixerAgent();
agent.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
