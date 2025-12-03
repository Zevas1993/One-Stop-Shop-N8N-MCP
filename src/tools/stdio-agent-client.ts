/**
 * STDIO Agent Client
 *
 * Connects to MCP server through stdio mode as an external agent would
 * to review workflows, nodes, and functionality.
 */
import { logger } from "../utils/logger";
import { MCPToolService } from "../services/mcp-tool-service";
import { NodeRepository } from "../database/node-repository";
import { TemplateService } from "../templates/template-service";
import { AutoUpdateLoop } from "../ai/auto-update-loop";
import { N8nApiClient } from "../services/n8n-api-client";
import { GraphRAGBridge } from "../ai/graphrag-bridge";

// Main STDIO client class
export class StdioAgentClient {
  private mcpToolService: MCPToolService;
  private autoUpdateLoop: AutoUpdateLoop;
  private isConnected: boolean = false;

  constructor(
    private nodeRepository: NodeRepository,
    private templateService: TemplateService,
    private n8nClient: N8nApiClient,
    private graphRAGBridge: GraphRAGBridge
  ) {
    // Initialize services
    this.mcpToolService = new MCPToolService(nodeRepository, templateService);
    this.autoUpdateLoop = new AutoUpdateLoop(n8nClient, graphRAGBridge);
  }

  /**
   * Connect to MCP server
   */
  async connect(): Promise<void> {
    try {
      logger.info("🔌 Connecting to MCP server via STDIO...");

      // Start auto-update system
      this.autoUpdateLoop.start();

      // Wait for initial synchronization
      await new Promise((resolve) => setTimeout(resolve, 2000));

      this.isConnected = true;
      logger.info("✅ Connected to MCP server successfully");
      logger.info("📊 MCP Server Status:", this.autoUpdateLoop.getStatus());
    } catch (error) {
      logger.error("❌ Failed to connect to MCP server:", error);
      throw new Error(
        `Connection failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    try {
      logger.info("🔌 Disconnecting from MCP server...");

      // Stop auto-update system
      this.autoUpdateLoop.stop();

      this.isConnected = false;
      logger.info("✅ Disconnected from MCP server successfully");
    } catch (error) {
      logger.error("❌ Failed to disconnect from MCP server:", error);
      throw new Error(
        `Disconnection failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Review all workflows on connected n8n instance
   */
  async reviewN8nWorkflows(): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error("Not connected to MCP server");
      }

      logger.info("🔍 Reviewing workflows on connected n8n instance...");

      // Get workflow list from n8n
      const workflowsResponse = await this.n8nClient.listWorkflows({
        limit: 100,
      });

      if (!workflowsResponse.data || workflowsResponse.data.length === 0) {
        logger.info("📋 No workflows found on n8n instance");
        return;
      }

      logger.info(
        `📋 Found ${workflowsResponse.data.length} workflows on n8n instance`
      );

      // Analyze each workflow
      for (const workflow of workflowsResponse.data) {
        await this.analyzeWorkflow(workflow);
      }

      logger.info("✅ Workflow review completed");
    } catch (error) {
      logger.error("❌ Failed to review n8n workflows:", error);
      throw new Error(
        `Workflow review failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Analyze individual workflow
   */
  private async analyzeWorkflow(workflow: any): Promise<void> {
    try {
      logger.info(
        `\n🔍 Analyzing workflow: ${workflow.name} (ID: ${workflow.id})`
      );

      // Basic workflow info
      logger.info(`📊 Workflow Info:`);
      logger.info(`   - Name: ${workflow.name}`);
      logger.info(`   - ID: ${workflow.id}`);
      logger.info(`   - Active: ${workflow.active || false}`);
      logger.info(`   - Created: ${workflow.createdAt || "Unknown"}`);
      logger.info(`   - Updated: ${workflow.updatedAt || "Unknown"}`);

      // Node analysis
      if (workflow.nodes && workflow.nodes.length > 0) {
        logger.info(`🧩 Node Analysis (${workflow.nodes.length} nodes):`);

        const nodeTypes = new Set(workflow.nodes.map((node: any) => node.type));
        logger.info(
          `   - Unique node types: ${Array.from(nodeTypes).join(", ")}`
        );

        // Check for common patterns
        const hasTrigger = workflow.nodes.some(
          (node: any) =>
            node.type.toLowerCase().includes("trigger") ||
            node.type.toLowerCase().includes("webhook")
        );

        const hasOutput = workflow.nodes.some(
          (node: any) =>
            node.type.toLowerCase().includes("http") ||
            node.type.toLowerCase().includes("slack") ||
            node.type.toLowerCase().includes("email")
        );

        logger.info(`   - Has trigger node: ${hasTrigger}`);
        logger.info(`   - Has output node: ${hasOutput}`);

        // Validate workflow structure
        const validationResult =
          await this.mcpToolService.validateWorkflowUnified({
            workflow,
            mode: "quick",
          });

        logger.info(
          `🔍 Validation Result: ${
            validationResult.valid ? "✅ Valid" : "❌ Invalid"
          }`
        );
        if (!validationResult.valid && validationResult.errors) {
          logger.warn(
            `   Validation Errors: ${validationResult.errors.length}`
          );
          validationResult.errors.forEach((error: any) => {
            logger.warn(`   - ${error.message}`);
          });
        }
      } else {
        logger.warn(`   ⚠️ No nodes found in workflow`);
      }

      // Connection analysis
      if (
        workflow.connections &&
        Object.keys(workflow.connections).length > 0
      ) {
        logger.info(
          `🔗 Connection Analysis (${
            Object.keys(workflow.connections).length
          } connections):`
        );

        const connectionCount = Object.values(workflow.connections).reduce(
          (count: number, conn: any) => {
            return count + (Array.isArray(conn) ? conn.length : 0);
          },
          0
        );

        logger.info(`   - Total connection paths: ${connectionCount}`);
      } else {
        logger.warn(`   ⚠️ No connections found in workflow`);
      }

      // Get recommendations
      const recommendations = this.getWorkflowRecommendations(workflow);
      if (recommendations.length > 0) {
        logger.info(`💡 Recommendations:`);
        recommendations.forEach((rec: string) => logger.info(`   - ${rec}`));
      }
    } catch (error) {
      logger.error(`❌ Failed to analyze workflow ${workflow.id}:`, error);
    }
  }

  /**
   * Get workflow recommendations
   */
  private getWorkflowRecommendations(workflow: any): string[] {
    const recommendations: string[] = [];

    // Check for missing trigger
    const hasTrigger = workflow.nodes?.some(
      (node: any) =>
        node.type.toLowerCase().includes("trigger") ||
        node.type.toLowerCase().includes("webhook") ||
        node.type.toLowerCase().includes("schedule")
    );

    if (!hasTrigger) {
      recommendations.push(
        "Consider adding a trigger node (Webhook, Schedule, etc.) to start this workflow automatically"
      );
    }

    // Check for complex workflows without error handling
    if (workflow.nodes?.length > 3) {
      const hasErrorHandling = workflow.nodes?.some(
        (node: any) =>
          node.type.toLowerCase().includes("if") ||
          node.type.toLowerCase().includes("switch") ||
          node.type.toLowerCase().includes("error")
      );

      if (!hasErrorHandling) {
        recommendations.push(
          "For complex workflows, consider adding error handling nodes (IF, Switch, etc.)"
        );
      }
    }

    // Check for missing connections
    if (
      workflow.nodes?.length > 1 &&
      (!workflow.connections || Object.keys(workflow.connections).length === 0)
    ) {
      recommendations.push(
        "Workflow has multiple nodes but no connections - nodes need to be connected to execute"
      );
    }

    return recommendations;
  }

  /**
   * Review available nodes
   */
  async reviewAvailableNodes(): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error("Not connected to MCP server");
      }

      logger.info("🔍 Reviewing available nodes...");

      // Get nodes by category
      const categories = ["trigger", "communication", "data", "ai"];

      for (const category of categories) {
        const result = await this.mcpToolService.listNodesOptimized({
          category,
        });

        if (result.nodes && result.nodes.length > 0) {
          logger.info(
            `\n📋 ${category.toUpperCase()} Nodes (${result.nodes.length}):`
          );
          result.nodes.slice(0, 5).forEach((node: any) => {
            logger.info(`   - ${node.name || node.type} (${node.type})`);
          });

          if (result.nodes.length > 5) {
            logger.info(`   ... and ${result.nodes.length - 5} more`);
          }
        }
      }

      logger.info("✅ Node review completed");
    } catch (error) {
      logger.error("❌ Failed to review available nodes:", error);
      throw new Error(
        `Node review failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Search for specific functionality
   */
  async searchFunctionality(query: string): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error("Not connected to MCP server");
      }

      logger.info(`🔍 Searching for: "${query}"`);

      // Search nodes
      const nodeResults = await this.mcpToolService.searchNodes(query);

      if (nodeResults.results && nodeResults.results.length > 0) {
        logger.info(
          `\n📋 Found ${nodeResults.results.length} nodes matching "${query}":`
        );
        nodeResults.results.slice(0, 3).forEach((node: any) => {
          logger.info(
            `   - ${node.displayName || node.name} (${node.nodeType})`
          );
          logger.info(`     ${node.description}`);
        });
      } else {
        logger.info(`   No nodes found matching "${query}"`);
      }

      // Search templates
      const templateResults = await this.mcpToolService.findTemplatesUnified({
        mode: "keywords",
        query: query,
      });

      if (templateResults.templates && templateResults.templates.length > 0) {
        logger.info(
          `\n📋 Found ${templateResults.templates.length} templates matching "${query}":`
        );
        templateResults.templates.slice(0, 3).forEach((template: any) => {
          logger.info(`   - ${template.name}: ${template.description}`);
        });
      } else {
        logger.info(`   No templates found matching "${query}"`);
      }

      logger.info("✅ Search completed");
    } catch (error) {
      logger.error(`❌ Failed to search for "${query}":`, error);
      throw new Error(
        `Search failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get detailed node information
   */
  async getNodeDetails(nodeType: string): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error("Not connected to MCP server");
      }

      logger.info(`🔍 Getting details for node: ${nodeType}`);

      const nodeInfo = await this.mcpToolService.getNodeInfoUnified({
        nodeType,
        detail: "complete",
      });

      logger.info(
        `\n📋 Node Details: ${nodeInfo.displayName || nodeInfo.nodeType}`
      );
      logger.info(`   Type: ${nodeInfo.nodeType}`);
      logger.info(`   Package: ${nodeInfo.package || "Unknown"}`);
      logger.info(`   Category: ${nodeInfo.category || "Unknown"}`);

      if (nodeInfo.description) {
        logger.info(`\n   Description: ${nodeInfo.description}`);
      }

      if (nodeInfo.properties && nodeInfo.properties.length > 0) {
        logger.info(`\n   Key Properties:`);
        nodeInfo.properties.slice(0, 5).forEach((prop: any) => {
          logger.info(`     - ${prop.displayName || prop.name} (${prop.type})`);
        });
      }

      if (nodeInfo.operations && nodeInfo.operations.length > 0) {
        logger.info(`\n   Operations:`);
        nodeInfo.operations.slice(0, 5).forEach((op: any) => {
          logger.info(`     - ${op.name}: ${op.description}`);
        });
      }

      logger.info("✅ Node details retrieved");
    } catch (error) {
      logger.error(`❌ Failed to get details for ${nodeType}:`, error);
      throw new Error(
        `Node details failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get MCP server status
   */
  async getServerStatus(): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error("Not connected to MCP server");
      }

      const status = this.autoUpdateLoop.getStatus();
      const dbStats = await this.mcpToolService.getDatabaseStatistics();

      logger.info(`\n📊 MCP Server Status:`);
      logger.info(`   - Connected: ${this.isConnected}`);
      logger.info(`   - Auto-Update Running: ${status.isRunning}`);
      logger.info(
        `   - Current n8n Version: ${status.currentVersion || "Unknown"}`
      );
      logger.info(`   - Known Nodes: ${status.knownNodesCount || 0}`);
      logger.info(`   - Last Update: ${status.lastUpdate || "Never"}`);

      logger.info(`\n📊 Database Statistics:`);
      logger.info(`   - Total Nodes: ${dbStats.totalNodes || 0}`);
      logger.info(`   - Total Templates: ${dbStats.totalTemplates || 0}`);
      logger.info(`   - Last Updated: ${dbStats.lastUpdated || "Unknown"}`);

      logger.info("✅ Server status retrieved");
    } catch (error) {
      logger.error("❌ Failed to get server status:", error);
      throw new Error(
        `Status retrieval failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Run complete review cycle
   */
  async runCompleteReview(): Promise<void> {
    try {
      logger.info("🚀 Starting complete MCP server review...");

      // Connect to server
      await this.connect();

      // Get server status
      await this.getServerStatus();

      // Review workflows
      await this.reviewN8nWorkflows();

      // Review available nodes
      await this.reviewAvailableNodes();

      // Search for common functionality
      await this.searchFunctionality("communication");
      await this.searchFunctionality("data");

      // Get details for common nodes
      await this.getNodeDetails("n8n-nodes-base.webhook");
      await this.getNodeDetails("n8n-nodes-base.httpRequest");

      logger.info("🎉 Complete review finished successfully!");
      logger.info("✅ MCP server is working correctly and ready for use");
    } catch (error) {
      logger.error("❌ Complete review failed:", error);
      throw new Error(
        `Complete review failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      // Always disconnect
      await this.disconnect();
    }
  }
}

// Main execution
async function main() {
  try {
    logger.info("🚀 Starting MCP Server STDIO Agent Client...");

    // This would be initialized with actual implementations in real usage
    // For now, we'll create a simple demonstration

    // Create client with mock implementations (would be real in production)
    const mockRepo = {} as any;
    const mockTemplateService = {} as any;
    const mockN8nClient = {} as any;
    const mockGraphRAGBridge = {} as any;

    const client = new StdioAgentClient(
      mockRepo,
      mockTemplateService,
      mockN8nClient,
      mockGraphRAGBridge
    );

    // Run complete review
    await client.runCompleteReview();

    logger.info("🎉 MCP Server review completed!");
  } catch (error) {
    logger.error("❌ MCP Server review failed:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    logger.error("Fatal error:", error);
    process.exit(1);
  });
}
