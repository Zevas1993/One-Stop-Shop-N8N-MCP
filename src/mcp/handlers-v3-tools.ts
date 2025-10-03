/**
 * Phase 2 Tool Handlers for v3.0.0
 *
 * New MCP tools leveraging:
 * - Enhanced n8n Client (1.113.3 APIs)
 * - Adaptive Response Builder (smart sizing)
 * - Context Intelligence Engine (intent detection)
 */

import { z } from 'zod';
import { EnhancedN8nClient } from '../live-integration/enhanced-n8n-client';
import { adaptiveResponseBuilder, ResponseSize } from '../intelligent/adaptive-response-builder';
import { contextIntelligence } from '../intelligent/context-intelligence-engine';
import { getN8nApiConfig } from '../config/n8n-api';
import { logger } from '../utils/logger';
import { McpToolResponse } from '../types/n8n-api';

// Singleton enhanced client instance
let enhancedClient: EnhancedN8nClient | null = null;

// Get or create enhanced client
function getEnhancedClient(): EnhancedN8nClient {
  const config = getN8nApiConfig();

  if (!config) {
    throw new Error('n8n API not configured. Please set N8N_API_URL and N8N_API_KEY environment variables.');
  }

  if (!enhancedClient) {
    logger.info('[v3.0.0] Enhanced n8n client initialized');
    enhancedClient = new EnhancedN8nClient(config);
  }

  return enhancedClient;
}

// Input validation schemas
const retryExecutionSchema = z.object({
  executionId: z.string().describe('ID of the execution to retry'),
  loadWorkflow: z.boolean().optional().default(false).describe('Whether to reload workflow definition'),
});

const monitorRunningExecutionsSchema = z.object({
  workflowId: z.string().optional().describe('Optional workflow ID to filter by'),
  includeStats: z.boolean().optional().default(false).describe('Include execution statistics'),
});

const listMcpWorkflowsSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20).describe('Maximum workflows to return'),
  includeStats: z.boolean().optional().default(false).describe('Include execution statistics for each workflow'),
});

/**
 * n8n_retry_execution - Retry a failed or stopped execution
 *
 * Use cases:
 * - Retry failed executions after fixing credentials
 * - Retry stopped executions after manual intervention
 * - Re-run workflows with same input data
 *
 * NEW in n8n 1.113.3: Execution retry endpoint
 */
export async function handleRetryExecution(args: unknown): Promise<McpToolResponse> {
  try {
    const { executionId, loadWorkflow } = retryExecutionSchema.parse(args);

    // Analyze context for adaptive response
    const context = contextIntelligence.analyzeToolCall('n8n_retry_execution', { executionId });

    const client = getEnhancedClient();

    // Get execution info first to provide better feedback
    const execInfo = await client.getExecutionWithRetryInfo(executionId);

    if (!execInfo.canRetry) {
      return {
        success: false,
        error: `Execution ${executionId} cannot be retried (status: ${execInfo.execution.status})`,
        suggestion: 'Only failed or stopped executions can be retried',
      };
    }

    // Provide context-aware suggestion before retry
    logger.info(`[v3.0.0] Retrying execution ${executionId}`, {
      reason: execInfo.retryReason,
      recommendation: execInfo.retryRecommendation,
    });

    // Retry the execution
    const newExecution = await client.retryExecution(executionId, loadWorkflow);

    // Build adaptive response
    const responseSize = adaptiveResponseBuilder.determineResponseSize(context);
    const adaptiveExecution = adaptiveResponseBuilder.buildExecutionResponse(newExecution, responseSize);

    return {
      success: true,
      data: {
        originalExecutionId: executionId,
        newExecution: adaptiveExecution,
        retryInfo: {
          reason: execInfo.retryReason,
          recommendation: execInfo.retryRecommendation,
        },
        hint: responseSize === ResponseSize.MINIMAL
          ? 'Use n8n_get_execution with includeData=true for full execution details'
          : undefined,
      },
    };
  } catch (error) {
    contextIntelligence.recordError(error instanceof Error ? error.message : 'Unknown error');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      suggestions: contextIntelligence.getErrorRecoverySuggestions(),
    };
  }
}

/**
 * n8n_monitor_running_executions - Monitor currently running executions
 *
 * Use cases:
 * - Monitor active workflow executions
 * - Prevent duplicate runs
 * - Display real-time execution status
 * - Detect stuck executions
 *
 * NEW in n8n 1.113.3: Enhanced execution filtering
 */
export async function handleMonitorRunningExecutions(args: unknown): Promise<McpToolResponse> {
  try {
    const { workflowId, includeStats } = monitorRunningExecutionsSchema.parse(args);

    // Analyze context for adaptive response
    const context = contextIntelligence.analyzeToolCall('n8n_monitor_running_executions', { workflowId });

    const client = getEnhancedClient();

    // Get running executions
    const runningExecutions = await client.getRunningExecutions(workflowId);

    // Build adaptive response
    const responseSize = adaptiveResponseBuilder.determineResponseSize({
      ...context,
      itemCount: runningExecutions.length,
    });

    const adaptiveExecutions = runningExecutions.map(exec =>
      adaptiveResponseBuilder.buildExecutionResponse(exec, responseSize)
    );

    // Optionally include statistics
    let stats;
    if (includeStats && workflowId) {
      stats = await client.getWorkflowExecutionStats(workflowId, 100);
    }

    return {
      success: true,
      data: {
        count: runningExecutions.length,
        executions: adaptiveExecutions,
        workflowId,
        stats,
        monitoring: {
          tip: runningExecutions.length === 0
            ? 'No executions currently running'
            : `${runningExecutions.length} execution(s) in progress`,
          recommendedAction: runningExecutions.length > 5
            ? 'Consider checking for stuck executions or high load'
            : undefined,
        },
        hint: responseSize === ResponseSize.MINIMAL
          ? 'Use n8n_get_execution for detailed information on specific executions'
          : undefined,
      },
    };
  } catch (error) {
    contextIntelligence.recordError(error instanceof Error ? error.message : 'Unknown error');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      suggestions: contextIntelligence.getErrorRecoverySuggestions(),
    };
  }
}

/**
 * n8n_list_mcp_workflows - List workflows created/managed by MCP
 *
 * Use cases:
 * - List workflows created by Claude via MCP
 * - Filter out manually created workflows
 * - Track MCP workflow adoption
 * - Provide workflow suggestions to agents
 *
 * NEW in n8n 1.113.3: MCP workflow metadata support
 */
export async function handleListMcpWorkflows(args: unknown): Promise<McpToolResponse> {
  try {
    const { limit, includeStats } = listMcpWorkflowsSchema.parse(args);

    // Analyze context for adaptive response
    const context = contextIntelligence.analyzeToolCall('n8n_list_mcp_workflows', { limit });

    const client = getEnhancedClient();

    // Get MCP workflows
    const mcpWorkflows = await client.getMcpWorkflows();

    // Apply limit
    const limitedWorkflows = mcpWorkflows.slice(0, limit);

    // Build adaptive response
    const responseSize = adaptiveResponseBuilder.determineResponseSize({
      ...context,
      itemCount: limitedWorkflows.length,
    });

    const adaptiveWorkflows = limitedWorkflows.map(workflow =>
      adaptiveResponseBuilder.buildWorkflowResponse(workflow, responseSize)
    );

    // Optionally include execution statistics
    const workflowsWithStats = includeStats
      ? await Promise.all(
          adaptiveWorkflows.map(async (workflow: any) => {
            if (workflow.id) {
              const stats = await client.getWorkflowExecutionStats(workflow.id, 50);
              return { ...workflow, executionStats: stats };
            }
            return workflow;
          })
        )
      : adaptiveWorkflows;

    return {
      success: true,
      data: {
        count: limitedWorkflows.length,
        total: mcpWorkflows.length,
        workflows: workflowsWithStats,
        identification: {
          method: 'Tag-based filtering',
          tags: ['mcp', 'claude', 'ai-generated'],
          tip: 'Workflows are identified by MCP-specific tags or metadata',
        },
        hint: responseSize === ResponseSize.MINIMAL
          ? 'Use n8n_get_workflow for full workflow details'
          : undefined,
        recommendedNextSteps: contextIntelligence.getRecommendedNextTools(),
      },
    };
  } catch (error) {
    contextIntelligence.recordError(error instanceof Error ? error.message : 'Unknown error');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      suggestions: contextIntelligence.getErrorRecoverySuggestions(),
    };
  }
}

/**
 * Export tool schemas for MCP registration
 */
export const v3ToolSchemas = {
  n8n_retry_execution: {
    name: 'n8n_retry_execution',
    description: `🔄 Retry a failed or stopped n8n workflow execution (NEW in v3.0.0)

Use this when:
- An execution failed due to temporary issues (credentials, network, etc.)
- You've fixed the underlying problem and want to retry
- You want to re-run a workflow with the same input data

The tool provides intelligent retry suggestions based on the execution status and error details.`,
    inputSchema: {
      type: 'object',
      properties: {
        executionId: {
          type: 'string',
          description: 'ID of the execution to retry',
        },
        loadWorkflow: {
          type: 'boolean',
          description: 'Whether to reload the workflow definition (useful if workflow was updated)',
          default: false,
        },
      },
      required: ['executionId'],
    },
  },

  n8n_monitor_running_executions: {
    name: 'n8n_monitor_running_executions',
    description: `📊 Monitor currently running workflow executions (NEW in v3.0.0)

Use this to:
- Check which workflows are currently executing
- Prevent duplicate workflow runs
- Detect stuck or long-running executions
- Monitor real-time execution status

Returns a compact list by default. Use includeStats for detailed metrics.`,
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Optional: Filter by specific workflow ID',
        },
        includeStats: {
          type: 'boolean',
          description: 'Include execution statistics (success rate, etc.)',
          default: false,
        },
      },
      required: [],
    },
  },

  n8n_list_mcp_workflows: {
    name: 'n8n_list_mcp_workflows',
    description: `🤖 List workflows created/managed by Claude via MCP (NEW in v3.0.0)

This tool filters workflows to show only those created by AI agents through MCP.
Workflows are identified by:
- MCP-specific tags (mcp, claude, ai-generated)
- MCP metadata in workflow settings

Perfect for:
- Reviewing AI-created workflows
- Finding workflows you previously built
- Tracking MCP adoption in the workspace`,
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum workflows to return (1-100)',
          default: 20,
          minimum: 1,
          maximum: 100,
        },
        includeStats: {
          type: 'boolean',
          description: 'Include execution statistics for each workflow',
          default: false,
        },
      },
      required: [],
    },
  },
};
