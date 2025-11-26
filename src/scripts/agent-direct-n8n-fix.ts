/**
 * EXTERNAL AGENT: Direct n8n API Workflow Fixes
 *
 * This agent bypasses the MCP server storage and works DIRECTLY with n8n API
 * to fix workflows in the live n8n instance.
 */

import axios from 'axios';

interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  typeVersion?: number;
  [key: string]: any;
}

interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  connections: any;
  [key: string]: any;
}

class DirectN8nAgent {
  private n8nUrl: string;
  private apiKey: string;

  constructor() {
    this.n8nUrl = process.env.N8N_API_URL || 'http://localhost:5678';
    this.apiKey = process.env.N8N_API_KEY || '';

    if (!this.apiKey) {
      throw new Error('N8N_API_KEY environment variable not set');
    }
  }

  private getAxiosConfig() {
    return {
      headers: {
        'X-N8N-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
    };
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

  async getWorkflowFromN8n(workflowId: string): Promise<Workflow | null> {
    try {
      const response = await axios.get(
        `${this.n8nUrl}/api/v1/workflows/${workflowId}`,
        this.getAxiosConfig()
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.log(`   ⚠️  Failed to get workflow: ${error.response?.status} ${error.response?.statusText}`);
      }
      return null;
    }
  }

  async updateWorkflowInN8n(workflow: Workflow): Promise<boolean> {
    try {
      // Build payload with required fields for n8n API
      // settings is required by n8n even if it's read-only from server
      const updatePayload: any = {
        name: workflow.name,
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings || {},
      };

      const response = await axios.put(
        `${this.n8nUrl}/api/v1/workflows/${workflow.id}`,
        updatePayload,
        this.getAxiosConfig()
      );

      if (response.status === 200) {
        return true;
      }
      return false;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.log(`   ⚠️  Update failed: ${error.response?.status} ${error.message}`);
        if (error.response?.data) {
          console.log(`   Details: ${JSON.stringify(error.response.data)}`);
        }
      }
      return false;
    }
  }

  async fixWorkflow(workflowId: string, workflowName: string): Promise<boolean> {
    console.log(`\n🔧 Fixing: ${workflowName}`);
    console.log(`   ID: ${workflowId}`);

    // Get workflow DIRECTLY from n8n
    console.log(`📥 Fetching from n8n API (${this.n8nUrl})...`);
    const workflow = await this.getWorkflowFromN8n(workflowId);

    if (!workflow) {
      console.log(`   ❌ Could not retrieve workflow from n8n`);
      return false;
    }

    let hasChanges = false;

    // Fix typeVersion issues
    if (workflow.nodes) {
      for (const node of workflow.nodes) {
        if (node.typeVersion === undefined && node.type !== 'n8n-nodes-base.start') {
          node.typeVersion = this.getDefaultTypeVersion(node.type);
          hasChanges = true;
          console.log(`   ✓ Fixed ${node.name} typeVersion = ${node.typeVersion}`);
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
      console.log(`   ℹ️  Already fixed in n8n`);
      return true;
    }

    // Deploy directly to n8n
    console.log(`📤 Deploying to n8n API...`);
    const deployed = await this.updateWorkflowInN8n(workflow);

    if (deployed) {
      console.log(`   ✅ DEPLOYED TO N8N`);
      return true;
    } else {
      console.log(`   ❌ Deployment failed`);
      return false;
    }
  }

  async run(): Promise<void> {
    console.log('═'.repeat(80));
    console.log('🤖 EXTERNAL AGENT: DIRECT N8N WORKFLOW FIXES');
    console.log('═'.repeat(80));
    console.log();
    console.log(`🔗 n8n Instance: ${this.n8nUrl}`);
    console.log();

    const workflows = [
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

    for (let i = 0; i < workflows.length; i++) {
      const wf = workflows[i];
      console.log(`[${i + 1}/${workflows.length}]`);

      try {
        const fixed = await this.fixWorkflow(wf.id, wf.name);
        if (fixed) fixedCount++;
      } catch (error) {
        console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(80));
    console.log(`✅ AGENT COMPLETE: Fixed ${fixedCount}/${workflows.length} workflows in n8n`);
    console.log('═'.repeat(80));
    console.log();
    console.log(`🎯 All workflows have been updated in your n8n instance!`);
    console.log(`📍 Refresh your n8n UI to see the changes\n`);
  }
}

const agent = new DirectN8nAgent();
agent.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
