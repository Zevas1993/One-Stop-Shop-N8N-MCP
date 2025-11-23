/**
 * Router Integration Module
 *
 * Provides convenient functions for handlers to:
 * 1. Get routing decisions before execution
 * 2. Record execution metrics after completion
 * 3. Query routing statistics
 *
 * Used by handlers-n8n-manager.ts and agent pipelines for adaptive routing.
 */

import { logger } from "../utils/logger";
import { getSmartRouter, RoutingDecision, ExecutionMetrics } from "./smart-router";

/**
 * Get routing recommendation before executing a request
 */
export async function getRoutingRecommendation(input: {
  goal?: string;
  workflow?: any;
  context?: string;
  forceAgent?: boolean;
  forceHandler?: boolean;
}): Promise<RoutingDecision> {
  try {
    const router = getSmartRouter();
    return await router.routeRequest(input);
  } catch (error) {
    logger.warn("[RouterIntegration] Failed to get routing recommendation", error as Error);
    // Fallback: if goal provided, use agent; otherwise use handler
    return {
      selectedPath: input.goal ? "agent" : "handler",
      reason: "Router error - fallback routing",
      confidence: 0.5,
      successRate: 0.5,
    };
  }
}

/**
 * Record execution result for future routing decisions
 */
export async function recordExecution(
  path: "agent" | "handler",
  success: boolean,
  executionTime: number,
  options?: {
    goal?: string;
    workflowId?: string;
    errorType?: string;
  }
): Promise<void> {
  try {
    const router = getSmartRouter();
    const metric: ExecutionMetrics = {
      path,
      goal: options?.goal,
      workflowId: options?.workflowId,
      success,
      executionTime,
      errorType: options?.errorType,
      timestamp: Date.now(),
    };

    await router.recordExecutionMetric(metric);

    logger.debug(`[RouterIntegration] Recorded execution metric`, {
      path,
      success,
      executionTime,
    });
  } catch (error) {
    logger.warn("[RouterIntegration] Failed to record execution", error as Error);
  }
}

/**
 * Get current routing statistics
 */
export async function getRoutingStats(): Promise<{
  totalExecutions: number;
  agentSuccessRate: number;
  handlerSuccessRate: number;
  agentAvgTime: number;
  handlerAvgTime: number;
  currentPreference: "agent" | "handler" | "equal";
}> {
  try {
    const router = getSmartRouter();
    return await router.getRoutingStatistics();
  } catch (error) {
    logger.warn("[RouterIntegration] Failed to get routing stats", error as Error);
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
export async function clearRoutingHistory(): Promise<void> {
  try {
    const router = getSmartRouter();
    await router.clearHistory();
    logger.info("[RouterIntegration] Cleared routing history");
  } catch (error) {
    logger.warn("[RouterIntegration] Failed to clear history", error as Error);
  }
}

/**
 * Convenient wrapper for handler recording execution with auto-timing
 */
export async function withRouterTracking<T>(
  path: "agent" | "handler",
  fn: () => Promise<T>,
  options?: {
    goal?: string;
    workflowId?: string;
  }
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await fn();
    const executionTime = Date.now() - startTime;

    await recordExecution(path, true, executionTime, {
      goal: options?.goal,
      workflowId: options?.workflowId,
    });

    return result;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorType = (error as any)?.code || "unknown";

    await recordExecution(path, false, executionTime, {
      goal: options?.goal,
      workflowId: options?.workflowId,
      errorType,
    });

    throw error;
  }
}
