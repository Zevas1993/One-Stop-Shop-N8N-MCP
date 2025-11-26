/**
 * EXTERNAL AGENT: Actually Fix the Broken Outlook Workflow NOW
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

class FixOutlookAgent {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async initialize(): Promise<void> {
    console.log("\n🤖 EXTERNAL AGENT: FIX OUTLOOK WORKFLOW VIA MCP\n");

    this.client = new Client({
      name: "fix-outlook-agent",
      version: "1.0.0",
    });

    this.transport = new StdioClientTransport({
      command: "node",
      args: ["dist/mcp/index.js"],
    });

    await this.client.connect(this.transport);
    console.log("✅ Connected to MCP server via stdio\n");
  }

  private async callTool(name: string, args: any): Promise<any> {
    if (!this.client) throw new Error("Client not initialized");
    try {
      const result = await this.client.callTool({ name, arguments: args });
      if (!result || !result.content) return null;
      const content = result.content[0];
      if (content.type === "text") {
        try {
          return JSON.parse(content.text);
        } catch (e) {
          return { text: content.text };
        }
      }
      return null;
    } catch (error) {
      console.error(`❌ ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  async run(): Promise<void> {
    try {
      await this.initialize();

      // Step 1: List all workflows to find the Outlook one
      console.log("📋 Step 1: Listing all workflows...\n");
      const listResult = await this.callTool("n8n_system", {
        action: "list_workflows",
      });

      if (!listResult?.success && !listResult?.data) {
        console.log("❌ Could not list workflows. Response:", JSON.stringify(listResult).substring(0, 200));
        return;
      }

      const workflows = listResult.data || listResult.workflows || [];
      console.log(`Found ${workflows.length} workflows\n`);

      // Find Outlook workflow
      const outlookWorkflow = workflows.find((w: any) =>
        w.name?.toLowerCase().includes("outlook") ||
        w.name?.toLowerCase().includes("email")
      );

      if (!outlookWorkflow) {
        console.log("❌ No Outlook workflow found");
        console.log("Available workflows:");
        workflows.slice(0, 5).forEach((w: any) => {
          console.log(`   - ${w.name} (${w.id})`);
        });
        return;
      }

      console.log(`✅ Found Outlook workflow: "${outlookWorkflow.name}"`);
      console.log(`   ID: ${outlookWorkflow.id}\n`);

      // Step 2: Get full workflow
      console.log("📥 Step 2: Getting full workflow details...\n");
      const getResult = await this.callTool("n8n_system", {
        action: "get_workflow",
        workflowId: outlookWorkflow.id,
      });

      if (!getResult?.success && !getResult?.data) {
        console.log("❌ Could not get workflow");
        return;
      }

      const workflow = getResult.data || getResult.workflow;
      console.log(`✅ Workflow retrieved`);
      console.log(`   Nodes: ${workflow.nodes?.length || 0}`);
      console.log(`   Active: ${workflow.active}\n`);

      // Find Business Inquiry node
      const businessNode = workflow.nodes?.find((n: any) =>
        n.name.includes("Business Inquiry") || n.name.includes("Business")
      );

      if (!businessNode) {
        console.log("❌ Could not find Business Inquiry node");
        console.log("Available nodes:");
        workflow.nodes?.slice(0, 5).forEach((n: any) => {
          console.log(`   - ${n.name} (${n.type})`);
        });
        return;
      }

      console.log(`✅ Found Business Inquiry node: "${businessNode.name}"\n`);

      // Check if it has connections
      const hasConnection =
        workflow.connections &&
        workflow.connections[businessNode.name] &&
        workflow.connections[businessNode.name].main;

      console.log(`🔍 Current state:`);
      console.log(`   Business node has output: ${hasConnection ? "YES" : "NO (BROKEN)"}\n`);

      if (hasConnection) {
        console.log("✅ Workflow is already fixed!");
        return;
      }

      // Step 3: Fix using diff operation
      console.log("🔧 Step 3: Applying fix via workflow_diff...\n");

      const fixResult = await this.callTool("workflow_diff", {
        workflowId: outlookWorkflow.id,
        operations: [
          {
            type: "addConnection",
            description: "Connect Business Inquiry Agent to Update Email Categories",
            source: businessNode.name,
            target: "Update Email Categories",
            sourceOutput: "main",
            targetInput: "main",
          },
        ],
      });

      console.log("📊 Fix result:");
      if (fixResult?.success) {
        console.log(`   ✅ SUCCESS! Workflow fixed`);
        console.log(`   ${fixResult.message || ""}\n`);
        console.log("🎉 The Business Inquiry Agent is now connected!");
        console.log("   Business emails will now flow to Update Email Categories");
      } else {
        console.log(`   ❌ Fix failed: ${fixResult?.error || "Unknown error"}`);
        if (fixResult?.details) {
          console.log(`   Details: ${JSON.stringify(fixResult.details).substring(0, 300)}`);
        }
      }
    } catch (error) {
      console.error("❌ Error:", error instanceof Error ? error.message : error);
    } finally {
      if (this.transport) {
        await this.transport.close();
      }
    }
  }
}

new FixOutlookAgent().run();
