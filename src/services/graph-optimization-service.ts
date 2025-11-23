import { logger } from "../utils/logger";
import { GraphRAGLearningService } from "./graphrag-learning-service";
import { GraphRAGBridge } from "../ai/graphrag-bridge";

export class GraphOptimizationService {
  private learningService: GraphRAGLearningService;
  private graphBridge: GraphRAGBridge;
  private optimizationInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Configuration
  private readonly INTERVAL_MS = 60 * 60 * 1000; // Run every hour
  private readonly BATCH_SIZE = 5; // Optimize 5 nodes per run

  constructor() {
    this.learningService = new GraphRAGLearningService();
    this.graphBridge = GraphRAGBridge.get();
  }

  /**
   * Start the background optimization loop
   */
  startOptimizationLoop(): void {
    if (this.optimizationInterval) return;

    logger.info("Starting Graph Optimization Service...");

    // Run immediately on startup (with a small delay to let other services init)
    setTimeout(() => this.runOptimizationCycle(), 60000);

    // Schedule periodic runs
    this.optimizationInterval = setInterval(() => {
      this.runOptimizationCycle();
    }, this.INTERVAL_MS);
  }

  /**
   * Stop the background loop
   */
  stop(): void {
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
      this.optimizationInterval = null;
    }
  }

  /**
   * Execute a single optimization cycle
   */
  private async runOptimizationCycle(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      logger.info("Running scheduled graph optimization cycle...");

      // 1. Select nodes for review
      // In a real system, we'd query for nodes with low confidence or high usage
      // For now, we'll pick a random sample or use a placeholder strategy
      const nodesToReview = await this.selectNodesForReview();

      if (nodesToReview.length === 0) {
        logger.debug("No nodes selected for optimization");
        return;
      }

      logger.info(
        `Selected ${nodesToReview.length} nodes for optimization review`
      );

      // 2. Analyze and optimize each node
      for (const node of nodesToReview) {
        await this.optimizeNode(node);
      }
    } catch (error) {
      logger.error("Graph optimization cycle failed", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Select nodes that need optimization
   */
  private async selectNodesForReview(): Promise<any[]> {
    // Active Agentic Behavior:
    // Query the graph for nodes that haven't been optimized recently.
    // For demonstration, we'll pick a random sample of nodes from the bridge.

    try {
      // Get a few nodes from the graph bridge to "review"
      // Since we don't have a direct list method, we query for common nodes
      const result = await this.graphBridge.queryGraph({
        text: "microsoft",
        top_k: 10,
      });

      if (result && result.nodes && result.nodes.length > 0) {
        // Pick 1 random node to optimize per cycle
        const randomNode =
          result.nodes[Math.floor(Math.random() * result.nodes.length)];
        return [randomNode];
      }
    } catch (error) {
      logger.warn("Failed to select nodes for optimization review", error);
    }

    return [];
  }

  /**
   * Optimize a single node using the learning service
   */
  private async optimizeNode(node: any): Promise<void> {
    try {
      // Synthesize feedback object to trigger the learning pipeline
      // We treat the "optimization review" as a form of feedback
      const feedback = {
        executionId: `opt-${Date.now()}`,
        workflowId: `node-review-${node.id}`,
        userId: "system-optimizer",
        timestamp: new Date().toISOString(),
        workflow: {
          nodes: [node], // Analyze this specific node context
          connections: {},
        },
        feedback: {
          success: true,
          executionTime: 0,
          nodeCount: 1,
          semanticIntent: "optimization-review",
        },
      };

      // Use the learning service to analyze the node
      const decision = await this.learningService.processWorkflowFeedback(
        feedback
      );

      // Apply any recommended updates
      if (decision.updateOperations.length > 0) {
        logger.info(
          `Applying ${decision.updateOperations.length} optimizations for node ${node.id}`
        );

        // Transform operations to graph updates
        const diff = {
          added: [],
          modified: decision.updateOperations.map((op) => ({
            ...op,
            metadata: { source: "graph-optimizer" },
          })),
          removed: [],
        };

        await this.graphBridge.applyUpdate(diff);
      }
    } catch (error) {
      logger.error(`Failed to optimize node ${node.id}`, error);
    }
  }
}
