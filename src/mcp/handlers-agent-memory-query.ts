/**
 * Agent Memory Query Handler
 * Exposes agent insights and SharedMemory state via MCP tools
 * Provides transparency into agent decisions and GraphRAG knowledge
 */

import { getHandlerSharedMemory } from './handler-shared-memory';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Query schema
const queryAgentMemorySchema = z.object({
  pattern: z.string().optional(),
  agentId: z.string().optional(),
  keywordType: z.enum(['validation', 'pattern', 'workflow', 'insight', 'error', 'all']).optional(),
  limit: z.number().optional().default(50),
  maxAgeHours: z.number().optional().default(24)
});

const getGraphInsightsSchema = z.object({
  detailed: z.boolean().optional().default(false)
});

const getValidationHistorySchema = z.object({
  limit: z.number().optional().default(20),
  successOnly: z.boolean().optional().default(false)
});

const getPatternRecommendationsSchema = z.object({
  goal: z.string().optional(),
  limit: z.number().optional().default(10)
});

/**
 * Query agent memory for insights
 */
export async function handleQueryAgentMemory(args: unknown): Promise<any> {
  try {
    const input = queryAgentMemorySchema.parse(args);
    const memory = await getHandlerSharedMemory();

    logger.info('[AgentMemoryQuery] Querying agent memory', {
      pattern: input.pattern,
      agentId: input.agentId,
      keywordType: input.keywordType
    });

    // Build search pattern
    let searchPattern = input.pattern || '%';

    if (input.keywordType && input.keywordType !== 'all') {
      searchPattern = `${input.keywordType}:%`;
    }

    // Query memory
    const results = await memory.query({
      pattern: searchPattern,
      agentId: input.agentId,
      maxAge: input.maxAgeHours * 60 * 60 * 1000,
      limit: input.limit
    });

    return {
      success: true,
      data: {
        pattern: searchPattern,
        agentId: input.agentId || 'any',
        resultCount: results.length,
        maxAgeHours: input.maxAgeHours,
        results: results.map((entry: any) => ({
          key: entry.key,
          agentId: entry.agentId,
          timestamp: new Date(entry.timestamp).toISOString(),
          value: entry.value
        }))
      },
      message: `Found ${results.length} matching entries in agent memory`
    };
  } catch (error) {
    logger.error('[AgentMemoryQuery] Failed to query agent memory', error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Failed to query agent memory'
    };
  }
}

/**
 * Retrieve graph insights from GraphRAG pipeline
 */
export async function handleGetGraphInsights(args: unknown): Promise<any> {
  try {
    const input = getGraphInsightsSchema.parse(args);
    const memory = await getHandlerSharedMemory();

    logger.info('[AgentMemoryQuery] Retrieving graph insights');

    const insights = await memory.get('graph-insights');

    if (!insights) {
      return {
        success: true,
        data: null,
        message: 'No graph insights available. Run agent pipeline first to generate insights.'
      };
    }

    if (!input.detailed) {
      // Return summary
      return {
        success: true,
        data: {
          summary: {
            relationshipCount: insights.relationships?.length || 0,
            patternCount: insights.patterns?.length || 0,
            validationRuleCount: insights.validations?.length || 0,
            recommendationCount: insights.recommendations?.length || 0
          },
          message: 'Graph insights available. Set detailed=true for full data'
        }
      };
    }

    // Return detailed insights
    return {
      success: true,
      data: {
        relationships: insights.relationships || [],
        patterns: insights.patterns || [],
        validations: insights.validations || [],
        recommendations: insights.recommendations || [],
        metadata: {
          generatedAt: insights.generatedAt || Date.now(),
          version: insights.version || '1.0'
        }
      },
      message: `Detailed graph insights retrieved: ${Object.keys(insights).length} categories`
    };
  } catch (error) {
    logger.error('[AgentMemoryQuery] Failed to get graph insights', error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Failed to retrieve graph insights'
    };
  }
}

/**
 * Get validation history and recent results
 */
export async function handleGetValidationHistory(args: unknown): Promise<any> {
  try {
    const input = getValidationHistorySchema.parse(args);
    const memory = await getHandlerSharedMemory();

    logger.info('[AgentMemoryQuery] Retrieving validation history');

    // Query validation results
    const results = await memory.query({
      pattern: 'validation-results:%',
      maxAge: 7 * 24 * 60 * 60 * 1000, // Last 7 days
      limit: input.limit
    });

    let filtered = results.map((entry: any) => ({
      key: entry.key,
      timestamp: new Date(entry.timestamp).toISOString(),
      valid: entry.value?.valid,
      errorCount: entry.value?.errors?.length || 0,
      warningCount: entry.value?.warnings?.length || 0,
      value: entry.value
    }));

    if (input.successOnly) {
      filtered = filtered.filter((r: any) => r.valid);
    }

    return {
      success: true,
      data: {
        validationCount: filtered.length,
        successRate: filtered.length > 0
          ? ((filtered.filter((r: any) => r.valid).length / filtered.length) * 100).toFixed(2) + '%'
          : 'N/A',
        recentValidations: filtered
      },
      message: `Retrieved ${filtered.length} validation records`
    };
  } catch (error) {
    logger.error('[AgentMemoryQuery] Failed to get validation history', error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Failed to retrieve validation history'
    };
  }
}

/**
 * Get pattern recommendations from agent analysis
 */
export async function handleGetPatternRecommendations(args: unknown): Promise<any> {
  try {
    const input = getPatternRecommendationsSchema.parse(args);
    const memory = await getHandlerSharedMemory();

    logger.info('[AgentMemoryQuery] Retrieving pattern recommendations', {
      goal: input.goal
    });

    let pattern = 'pattern-matches:%';
    if (input.goal) {
      pattern = `pattern-matches:${input.goal}`;
    }

    const results = await memory.query({
      pattern,
      maxAge: 24 * 60 * 60 * 1000, // Last 24 hours
      limit: input.limit
    });

    if (results.length === 0) {
      return {
        success: true,
        data: null,
        message: 'No pattern recommendations found. Run execute_agent_pipeline to generate recommendations.'
      };
    }

    const recommendations = results
      .flatMap((entry: any) => entry.value?.patterns || [])
      .slice(0, input.limit)
      .map((pattern: any) => ({
        patternId: pattern.patternId,
        patternName: pattern.patternName,
        description: pattern.description,
        confidence: pattern.confidence,
        complexity: pattern.complexity,
        suggestedNodes: pattern.suggestedNodes,
        matchedKeywords: pattern.matchedKeywords
      }));

    return {
      success: true,
      data: {
        recommendationCount: recommendations.length,
        recommendations
      },
      message: `Retrieved ${recommendations.length} pattern recommendations`
    };
  } catch (error) {
    logger.error('[AgentMemoryQuery] Failed to get pattern recommendations', error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Failed to retrieve pattern recommendations'
    };
  }
}

/**
 * Get recent workflow creation history from handlers
 */
export async function handleGetWorkflowExecutionHistory(args: unknown): Promise<any> {
  try {
    const input = z.object({
      limit: z.number().optional().default(20),
      successOnly: z.boolean().optional().default(false)
    }).parse(args);

    const memory = await getHandlerSharedMemory();

    logger.info('[AgentMemoryQuery] Retrieving workflow execution history');

    const results = await memory.query({
      pattern: 'workflow-execution:%',
      maxAge: 7 * 24 * 60 * 60 * 1000, // Last 7 days
      limit: input.limit * 2 // Get more and filter
    });

    let executions = results.map((entry: any) => ({
      workflowId: entry.value?.workflowId,
      workflowName: entry.value?.workflowName,
      success: entry.value?.success,
      error: entry.value?.error,
      executionTime: entry.value?.executionTime,
      timestamp: new Date(entry.value?.timestamp).toISOString()
    }));

    if (input.successOnly) {
      executions = executions.filter((e: any) => e.success);
    }

    executions = executions.slice(0, input.limit);

    return {
      success: true,
      data: {
        executionCount: executions.length,
        successCount: executions.filter((e: any) => e.success).length,
        failureCount: executions.filter((e: any) => !e.success).length,
        successRate: executions.length > 0
          ? ((executions.filter((e: any) => e.success).length / executions.length) * 100).toFixed(2) + '%'
          : 'N/A',
        recentExecutions: executions
      },
      message: `Retrieved ${executions.length} workflow execution records`
    };
  } catch (error) {
    logger.error('[AgentMemoryQuery] Failed to get execution history', error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Failed to retrieve execution history'
    };
  }
}

/**
 * Get recent errors for debugging
 */
export async function handleGetRecentErrors(args: unknown): Promise<any> {
  try {
    const input = z.object({
      limit: z.number().optional().default(20),
      errorType: z.enum(['validation', 'api', 'network', 'unknown', 'all']).optional().default('all')
    }).parse(args);

    const memory = await getHandlerSharedMemory();

    logger.info('[AgentMemoryQuery] Retrieving recent errors', {
      errorType: input.errorType
    });

    const pattern = input.errorType === 'all'
      ? 'handler-error:%'
      : `handler-error:%`;

    const results = await memory.query({
      pattern,
      maxAge: 7 * 24 * 60 * 60 * 1000, // Last 7 days
      limit: input.limit
    });

    let errors = results.map((entry: any) => ({
      context: entry.value?.context,
      error: entry.value?.error,
      errorType: entry.value?.errorType,
      details: entry.value?.details,
      timestamp: new Date(entry.value?.timestamp).toISOString()
    }));

    if (input.errorType !== 'all') {
      errors = errors.filter((e: any) => e.errorType === input.errorType);
    }

    errors = errors.slice(0, input.limit);

    return {
      success: true,
      data: {
        errorCount: errors.length,
        errors
      },
      message: `Retrieved ${errors.length} error records`
    };
  } catch (error) {
    logger.error('[AgentMemoryQuery] Failed to get recent errors', error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Failed to retrieve error records'
    };
  }
}

/**
 * Get agent memory statistics
 */
export async function handleGetAgentMemoryStats(args: unknown): Promise<any> {
  try {
    const memory = await getHandlerSharedMemory();

    logger.info('[AgentMemoryQuery] Generating agent memory statistics');

    // Query all entries to get statistics
    const allEntries = await memory.query({
      pattern: '%',
      maxAge: 7 * 24 * 60 * 60 * 1000 // Last 7 days
    });

    const stats = {
      totalEntries: allEntries.length,
      byType: {} as Record<string, number>,
      byAgent: {} as Record<string, number>,
      oldestEntry: null as any,
      newestEntry: null as any
    };

    for (const entry of allEntries) {
      // Count by type
      const keyParts = entry.key.split(':');
      const type = keyParts[0];
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      // Count by agent
      stats.byAgent[entry.agentId] = (stats.byAgent[entry.agentId] || 0) + 1;

      // Track oldest/newest
      if (!stats.oldestEntry || entry.timestamp < stats.oldestEntry.timestamp) {
        stats.oldestEntry = {
          key: entry.key,
          timestamp: new Date(entry.timestamp).toISOString(),
          agent: entry.agentId
        };
      }

      if (!stats.newestEntry || entry.timestamp > stats.newestEntry.timestamp) {
        stats.newestEntry = {
          key: entry.key,
          timestamp: new Date(entry.timestamp).toISOString(),
          agent: entry.agentId
        };
      }
    }

    return {
      success: true,
      data: stats,
      message: 'Agent memory statistics retrieved'
    };
  } catch (error) {
    logger.error('[AgentMemoryQuery] Failed to get memory statistics', error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Failed to generate memory statistics'
    };
  }
}
