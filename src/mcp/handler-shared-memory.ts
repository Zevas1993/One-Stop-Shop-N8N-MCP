/**
 * Handler Shared Memory Access Layer
 * Enables MCP handlers to read/write to SharedMemory, creating bidirectional
 * communication between agent pipeline and handler pipeline
 */

import { SharedMemory } from '../ai/shared-memory';
import { logger } from '../utils/logger';

/**
 * Singleton instance of SharedMemory for handlers
 * Ensures consistent state across all handler invocations
 */
let sharedMemoryInstance: SharedMemory | null = null;

/**
 * Initialize SharedMemory singleton for handlers
 * Should be called once during MCP server initialization
 */
export async function initializeHandlerSharedMemory(dbPath?: string): Promise<SharedMemory> {
  if (!sharedMemoryInstance) {
    sharedMemoryInstance = new SharedMemory(dbPath);
    await sharedMemoryInstance.initialize();
    logger.info('[HandlerSharedMemory] Initialized successfully');
  }
  return sharedMemoryInstance;
}

/**
 * Get the SharedMemory instance for handlers
 * Lazy initializes if not already initialized
 */
export async function getHandlerSharedMemory(): Promise<SharedMemory> {
  if (!sharedMemoryInstance) {
    return await initializeHandlerSharedMemory();
  }
  return sharedMemoryInstance;
}

/**
 * Handler Memory Access Interface
 * Provides convenient methods for handlers to work with SharedMemory
 */
export class HandlerMemory {
  private static readonly HANDLER_AGENT_ID = 'mcp-handler';

  /**
   * Store workflow execution result for agent feedback
   */
  static async recordWorkflowCreation(
    workflowId: string,
    workflowName: string,
    success: boolean,
    error?: string,
    executionTime?: number
  ): Promise<void> {
    const memory = await getHandlerSharedMemory();

    await memory.set(
      `workflow-execution:${workflowId}`,
      {
        workflowId,
        workflowName,
        success,
        error: error || null,
        executionTime: executionTime || 0,
        timestamp: Date.now(),
        source: 'mcp-handler'
      },
      this.HANDLER_AGENT_ID,
      24 * 60 * 60 * 1000 // 24 hour TTL
    );

    logger.debug(`[HandlerMemory] Recorded workflow execution: ${workflowId} - ${success ? 'SUCCESS' : 'FAILED'}`);
  }

  /**
   * Retrieve previously generated workflow from agent pipeline
   */
  static async getAgentGeneratedWorkflow(agentId?: string): Promise<any | null> {
    const memory = await getHandlerSharedMemory();

    try {
      const result = await memory.get(`generated-workflow`);
      if (result && result.workflow) {
        logger.debug('[HandlerMemory] Retrieved agent-generated workflow from SharedMemory');
        return result.workflow;
      }
      return null;
    } catch (error) {
      logger.warn('[HandlerMemory] Failed to retrieve agent-generated workflow', error as Error);
      return null;
    }
  }

  /**
   * Retrieve validation results from agent pipeline
   */
  static async getAgentValidationResults(): Promise<any | null> {
    const memory = await getHandlerSharedMemory();

    try {
      const result = await memory.get('validation-results');
      if (result) {
        logger.debug('[HandlerMemory] Retrieved agent validation results from SharedMemory');
        return result;
      }
      return null;
    } catch (error) {
      logger.warn('[HandlerMemory] Failed to retrieve validation results', error as Error);
      return null;
    }
  }

  /**
   * Retrieve graph insights from GraphRAG pipeline
   */
  static async getGraphInsights(): Promise<any | null> {
    const memory = await getHandlerSharedMemory();

    try {
      const result = await memory.get('graph-insights');
      if (result) {
        logger.debug('[HandlerMemory] Retrieved graph insights from SharedMemory');
        return result;
      }
      return null;
    } catch (error) {
      logger.warn('[HandlerMemory] Failed to retrieve graph insights', error as Error);
      return null;
    }
  }

  /**
   * Retrieve pattern matches from agent pipeline
   */
  static async getPatternMatches(goal: string): Promise<any[] | null> {
    const memory = await getHandlerSharedMemory();

    try {
      const result = await memory.get(`pattern-matches:${goal}`);
      if (result && Array.isArray(result.patterns)) {
        logger.debug(`[HandlerMemory] Retrieved pattern matches for goal: ${goal}`);
        return result.patterns;
      }
      return null;
    } catch (error) {
      logger.warn('[HandlerMemory] Failed to retrieve pattern matches', error as Error);
      return null;
    }
  }

  /**
   * Retrieve validation cache to avoid duplicate work
   */
  static async getValidationCache(workflowKey: string): Promise<any | null> {
    const memory = await getHandlerSharedMemory();

    try {
      const result = await memory.get(`validation-cache:${workflowKey}`);
      if (result) {
        logger.debug(`[HandlerMemory] Retrieved cached validation for: ${workflowKey}`);
        return result;
      }
      return null;
    } catch (error) {
      logger.warn('[HandlerMemory] Failed to retrieve validation cache', error as Error);
      return null;
    }
  }

  /**
   * Store execution error for agent feedback and learning
   */
  static async recordExecutionError(
    context: string,
    error: string,
    errorType: 'validation' | 'api' | 'network' | 'unknown',
    details?: Record<string, any>
  ): Promise<void> {
    const memory = await getHandlerSharedMemory();

    const errorRecord = {
      context,
      error,
      errorType,
      details: details || {},
      timestamp: Date.now(),
      source: 'mcp-handler'
    };

    // Store in error log for agents to learn from
    const errorKey = `handler-error:${Date.now()}-${Math.random().toString(36).substring(7)}`;

    await memory.set(
      errorKey,
      errorRecord,
      this.HANDLER_AGENT_ID,
      7 * 24 * 60 * 60 * 1000 // 7 day TTL for error history
    );

    // Also store in error summary for quick access
    await memory.set(
      'recent-errors',
      {
        lastError: errorRecord,
        errorCount: (await memory.get('recent-errors'))?.errorCount || 0 + 1,
        lastUpdateTime: Date.now()
      },
      this.HANDLER_AGENT_ID,
      24 * 60 * 60 * 1000 // 24 hour TTL
    );

    logger.info(`[HandlerMemory] Recorded ${errorType} error for agent feedback: ${error}`);
  }

  /**
   * Check if workflow was recently validated by agents
   */
  static async isRecentlyValidatedByAgent(workflowId: string, maxAgeMs: number = 300000): Promise<boolean> {
    const memory = await getHandlerSharedMemory();

    try {
      const result = await memory.get(`validated:${workflowId}`);
      if (result) {
        const age = Date.now() - result.timestamp;
        if (age < maxAgeMs) {
          logger.debug(`[HandlerMemory] Workflow ${workflowId} recently validated by agent`);
          return true;
        }
      }
      return false;
    } catch (error) {
      logger.warn('[HandlerMemory] Failed to check validation status', error as Error);
      return false;
    }
  }

  /**
   * Query agent memory for specific pattern
   */
  static async queryAgentMemory(pattern: string, agentId?: string): Promise<any[]> {
    const memory = await getHandlerSharedMemory();

    try {
      const results = await memory.query({
        pattern: `${pattern}%`,
        agentId: agentId,
        maxAge: 24 * 60 * 60 * 1000 // Last 24 hours
      });

      logger.debug(`[HandlerMemory] Queried agent memory for pattern: ${pattern}, found ${results.length} entries`);
      return results;
    } catch (error) {
      logger.warn('[HandlerMemory] Failed to query agent memory', error as Error);
      return [];
    }
  }

  /**
   * Get full agent execution history
   */
  static async getAgentExecutionHistory(limit: number = 100): Promise<any[]> {
    const memory = await getHandlerSharedMemory();

    try {
      const results = await memory.query({
        pattern: '%',
        maxAge: 7 * 24 * 60 * 60 * 1000, // Last 7 days
        limit
      });

      logger.debug(`[HandlerMemory] Retrieved execution history: ${results.length} entries`);
      return results;
    } catch (error) {
      logger.warn('[HandlerMemory] Failed to retrieve execution history', error as Error);
      return [];
    }
  }

  /**
   * Clear old entries to manage memory
   */
  static async clearExpiredEntries(): Promise<number> {
    const memory = await getHandlerSharedMemory();

    try {
      // This is handled automatically by SharedMemory cleanup
      // But we can trigger it explicitly if needed
      logger.info('[HandlerMemory] Triggered cleanup of expired entries');
      return 0;
    } catch (error) {
      logger.error('[HandlerMemory] Failed to clear expired entries', error as Error);
      return 0;
    }
  }
}

/**
 * Export convenience functions for quick access
 */
export const recordWorkflowCreation = HandlerMemory.recordWorkflowCreation.bind(HandlerMemory);
export const getAgentGeneratedWorkflow = HandlerMemory.getAgentGeneratedWorkflow.bind(HandlerMemory);
export const getAgentValidationResults = HandlerMemory.getAgentValidationResults.bind(HandlerMemory);
export const getGraphInsights = HandlerMemory.getGraphInsights.bind(HandlerMemory);
export const getPatternMatches = HandlerMemory.getPatternMatches.bind(HandlerMemory);
export const getValidationCache = HandlerMemory.getValidationCache.bind(HandlerMemory);
export const recordExecutionError = HandlerMemory.recordExecutionError.bind(HandlerMemory);
export const isRecentlyValidatedByAgent = HandlerMemory.isRecentlyValidatedByAgent.bind(HandlerMemory);
export const queryAgentMemory = HandlerMemory.queryAgentMemory.bind(HandlerMemory);
export const getAgentExecutionHistory = HandlerMemory.getAgentExecutionHistory.bind(HandlerMemory);
