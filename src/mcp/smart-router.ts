/**
 * Smart Execution Router (Phase 4)
 *
 * Intelligently routes workflow requests between agent pipeline and handler pipeline
 * based on input type, success history, and execution context.
 *
 * Decision Logic:
 * 1. Goal input → Use agent pipeline (generates workflow)
 * 2. Workflow JSON → Use handler pipeline (deploys directly)
 * 3. Both applicable → Use execution history to choose optimal path
 * 4. Previous failure → Try alternative path (fallback)
 *
 * Implements adaptive routing for improved success rates.
 */

import { logger } from "../utils/logger";
import { getHandlerSharedMemory } from "./handler-shared-memory";

export interface RoutingDecision {
  selectedPath: "agent" | "handler";
  reason: string;
  confidence: number;
  successRate: number;
  alternativePath?: "agent" | "handler";
  fallbackReason?: string;
}

export interface ExecutionMetrics {
  path: "agent" | "handler";
  goal?: string;
  workflowId?: string;
  success: boolean;
  executionTime: number;
  errorType?: string;
  timestamp: number;
}

export class SmartExecutionRouter {
  private metricsPrefix = "execution-metrics";
  private minHistorySize = 5; // Minimum metrics to make decisions

  /**
   * Route a request to the optimal execution path
   */
  async routeRequest(input: {
    goal?: string;
    workflow?: any;
    context?: string;
    forceAgent?: boolean;
    forceHandler?: boolean;
  }): Promise<RoutingDecision> {
    const startTime = Date.now();

    // Check forced routing
    if (input.forceAgent) {
      return {
        selectedPath: "agent",
        reason: "Forced routing to agent pipeline",
        confidence: 1.0,
        successRate: 1.0,
      };
    }

    if (input.forceHandler) {
      return {
        selectedPath: "handler",
        reason: "Forced routing to handler pipeline",
        confidence: 1.0,
        successRate: 1.0,
      };
    }

    // Determine input type
    const inputType = this.classifyInput(input);

    // Get execution history for decision making
    const history = await this.getExecutionHistory();

    // Make routing decision
    const decision = await this.makeRoutingDecision(inputType, history, input);

    const routingTime = Date.now() - startTime;
    logger.info(`[SmartRouter] Routing decision made in ${routingTime}ms`, {
      inputType,
      selectedPath: decision.selectedPath,
      confidence: decision.confidence,
      successRate: decision.successRate,
    });

    return decision;
  }

  /**
   * Classify input type
   */
  private classifyInput(input: {
    goal?: string;
    workflow?: any;
  }): "goal" | "workflow" | "both" | "unknown" {
    const hasGoal = input.goal && typeof input.goal === "string" && input.goal.length > 0;
    const hasWorkflow = input.workflow && typeof input.workflow === "object";

    if (hasGoal && hasWorkflow) {
      return "both";
    } else if (hasGoal) {
      return "goal";
    } else if (hasWorkflow) {
      return "workflow";
    } else {
      return "unknown";
    }
  }

  /**
   * Make routing decision based on input type and history
   */
  private async makeRoutingDecision(
    inputType: string,
    history: ExecutionMetrics[],
    input: any
  ): Promise<RoutingDecision> {
    // Pure goal input → always use agent
    if (inputType === "goal") {
      return {
        selectedPath: "agent",
        reason: "Goal input requires agent pipeline for workflow generation",
        confidence: 1.0,
        successRate: 1.0,
      };
    }

    // Pure workflow input → always use handler
    if (inputType === "workflow") {
      return {
        selectedPath: "handler",
        reason: "Workflow JSON input routed to handler for direct deployment",
        confidence: 1.0,
        successRate: 1.0,
      };
    }

    // Both goal and workflow → use history
    if (inputType === "both") {
      return await this.routeBasedOnHistory(history, input);
    }

    // Unknown input → default to agent
    return {
      selectedPath: "agent",
      reason: "Unknown input type - defaulting to agent pipeline",
      confidence: 0.5,
      successRate: 0.5,
    };
  }

  /**
   * Route based on execution history
   */
  private async routeBasedOnHistory(
    history: ExecutionMetrics[],
    input: any
  ): Promise<RoutingDecision> {
    if (history.length < this.minHistorySize) {
      // Insufficient history - try agent first (it generates better workflows)
      return {
        selectedPath: "agent",
        reason: "Insufficient execution history - defaulting to agent pipeline",
        confidence: 0.6,
        successRate: 0.5,
      };
    }

    // Calculate success rates by path
    const agentMetrics = history.filter((m) => m.path === "agent");
    const handlerMetrics = history.filter((m) => m.path === "handler");

    const agentSuccessRate =
      agentMetrics.length > 0 ? this.calculateSuccessRate(agentMetrics) : 0.5;
    const handlerSuccessRate =
      handlerMetrics.length > 0 ? this.calculateSuccessRate(handlerMetrics) : 0.5;

    // Choose path with higher success rate
    const selectedPath = agentSuccessRate >= handlerSuccessRate ? "agent" : "handler";
    const successRate = Math.max(agentSuccessRate, handlerSuccessRate);
    const alternativePath = selectedPath === "agent" ? "handler" : "agent";

    return {
      selectedPath,
      reason: `Selected based on execution history (${selectedPath}: ${(successRate * 100).toFixed(1)}% success)`,
      confidence: Math.min(Math.abs(agentSuccessRate - handlerSuccessRate) + 0.5, 1.0),
      successRate,
      alternativePath,
      fallbackReason: `Fallback to ${alternativePath} if ${selectedPath} fails`,
    };
  }

  /**
   * Calculate success rate from metrics
   */
  private calculateSuccessRate(metrics: ExecutionMetrics[]): number {
    if (metrics.length === 0) return 0.5;
    const successes = metrics.filter((m) => m.success).length;
    return successes / metrics.length;
  }

  /**
   * Record execution metrics for routing decisions
   */
  async recordExecutionMetric(metric: ExecutionMetrics): Promise<void> {
    try {
      const memory = await getHandlerSharedMemory();
      const key = `${this.metricsPrefix}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;

      await memory.set(key, metric, "smart-router", 30 * 24 * 60 * 60 * 1000); // 30 days retention

      logger.debug(`[SmartRouter] Recorded execution metric`, {
        path: metric.path,
        success: metric.success,
        executionTime: metric.executionTime,
      });
    } catch (error) {
      logger.warn("[SmartRouter] Failed to record execution metric", error as Error);
    }
  }

  /**
   * Get execution history for analysis
   */
  private async getExecutionHistory(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<ExecutionMetrics[]> {
    try {
      const memory = await getHandlerSharedMemory();
      const results = await memory.query({
        pattern: `${this.metricsPrefix}:%`,
        maxAge,
      });

      return results
        .filter((r: any) => r.value && typeof r.value.path === "string")
        .map((r: any) => r.value) as ExecutionMetrics[];
    } catch (error) {
      logger.warn("[SmartRouter] Failed to get execution history", error as Error);
      return [];
    }
  }

  /**
   * Get routing statistics
   */
  async getRoutingStatistics(): Promise<{
    totalExecutions: number;
    agentSuccessRate: number;
    handlerSuccessRate: number;
    agentAvgTime: number;
    handlerAvgTime: number;
    currentPreference: "agent" | "handler" | "equal";
  }> {
    try {
      const history = await this.getExecutionHistory();

      if (history.length === 0) {
        return {
          totalExecutions: 0,
          agentSuccessRate: 0,
          handlerSuccessRate: 0,
          agentAvgTime: 0,
          handlerAvgTime: 0,
          currentPreference: "equal",
        };
      }

      const agentMetrics = history.filter((m) => m.path === "agent");
      const handlerMetrics = history.filter((m) => m.path === "handler");

      const agentSuccessRate = this.calculateSuccessRate(agentMetrics);
      const handlerSuccessRate = this.calculateSuccessRate(handlerMetrics);

      const agentAvgTime =
        agentMetrics.length > 0
          ? agentMetrics.reduce((sum, m) => sum + m.executionTime, 0) / agentMetrics.length
          : 0;

      const handlerAvgTime =
        handlerMetrics.length > 0
          ? handlerMetrics.reduce((sum, m) => sum + m.executionTime, 0) / handlerMetrics.length
          : 0;

      const currentPreference =
        agentSuccessRate > handlerSuccessRate ? "agent" : handlerSuccessRate > agentSuccessRate ? "handler" : "equal";

      return {
        totalExecutions: history.length,
        agentSuccessRate,
        handlerSuccessRate,
        agentAvgTime,
        handlerAvgTime,
        currentPreference,
      };
    } catch (error) {
      logger.warn("[SmartRouter] Failed to get routing statistics", error as Error);
      return {
        totalExecutions: 0,
        agentSuccessRate: 0,
        handlerSuccessRate: 0,
        agentAvgTime: 0,
        handlerAvgTime: 0,
        currentPreference: "equal",
      };
    }
  }

  /**
   * Clear execution history (for testing/reset)
   */
  async clearHistory(): Promise<void> {
    try {
      const memory = await getHandlerSharedMemory();
      logger.info("[SmartRouter] Clearing execution history");

      const results = await memory.query({
        pattern: `${this.metricsPrefix}:%`,
      });

      for (const result of results) {
        await memory.delete(result.key, "smart-router");
      }

      logger.info("[SmartRouter] Execution history cleared");
    } catch (error) {
      logger.warn("[SmartRouter] Failed to clear history", error as Error);
    }
  }
}

/**
 * Singleton instance of SmartExecutionRouter
 */
let smartRouter: SmartExecutionRouter | null = null;

/**
 * Get or create the smart router
 */
export function getSmartRouter(): SmartExecutionRouter {
  if (!smartRouter) {
    smartRouter = new SmartExecutionRouter();
    logger.info("[SmartRouter] Initialized smart execution router");
  }
  return smartRouter;
}
