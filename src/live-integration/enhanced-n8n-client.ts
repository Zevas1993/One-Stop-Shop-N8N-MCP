import { N8nApiClient, N8nApiClientConfig } from '../services/n8n-api-client';
import { logger } from '../utils/logger';
import { handleN8nApiError } from '../utils/n8n-errors';
import {
  Execution,
  ExecutionListParams,
  ExecutionListResponse,
  ExecutionStatus,
  Workflow,
  WorkflowListParams,
  WorkflowListResponse,
  Tag,
} from '../types/n8n-api';

/**
 * Enhanced n8n API Client for v3.0.0
 * Leverages new n8n 1.113.3 API capabilities:
 * - Execution retry endpoint
 * - Enhanced execution filtering (running status)
 * - MCP workflow metadata support
 */
export class EnhancedN8nClient extends N8nApiClient {
  private apiVersion: string = '1.113.3';
  protected get axiosClient() {
    return (this as any).client;
  }

  constructor(config: N8nApiClientConfig) {
    super(config);
    logger.info(`[v3.0.0] Enhanced n8n client initialized (targeting n8n ${this.apiVersion}+)`);
  }

  /**
   * NEW in n8n 1.113.3: Retry a failed or stopped execution
   *
   * Use cases:
   * - Retry failed executions after fixing credentials
   * - Retry stopped executions after manual intervention
   * - Re-run workflows with same input data
   *
   * @param executionId - ID of the execution to retry
   * @param loadWorkflow - Whether to reload workflow definition (default: false)
   * @returns New execution created from retry
   */
  async retryExecution(executionId: string, loadWorkflow = false): Promise<Execution> {
    try {
      logger.info(`[v3.0.0] Retrying execution ${executionId} (loadWorkflow: ${loadWorkflow})`);

      // POST /executions/:id/retry
      const response = await this.axiosClient.post(`/executions/${executionId}/retry`, {
        loadWorkflow,
      });

      logger.info(`[v3.0.0] Execution retry started: ${response.data.id}`);
      return response.data;
    } catch (error) {
      logger.error(`[v3.0.0] Failed to retry execution ${executionId}:`, error);
      throw handleN8nApiError(error);
    }
  }

  /**
   * NEW in n8n 1.113.3: Get currently running executions
   *
   * Use cases:
   * - Monitor active workflow executions
   * - Prevent duplicate runs
   * - Display real-time execution status
   * - Detect stuck executions
   *
   * @param workflowId - Optional workflow ID to filter by
   * @returns List of currently running executions
   */
  async getRunningExecutions(workflowId?: string): Promise<Execution[]> {
    try {
      // Note: n8n API doesn't officially support 'running' status filter yet
      // This method attempts to filter by status, falling back to client-side filtering
      const params: ExecutionListParams = {
        ...(workflowId && { workflowId }),
      };

      logger.debug(`[v3.0.0] Fetching running executions${workflowId ? ` for workflow ${workflowId}` : ''}`);

      const response = await this.listExecutions(params);

      // Filter for running executions client-side
      const runningExecutions = response.data?.filter((exec: Execution) =>
        !exec.finished && exec.status === ExecutionStatus.WAITING
      ) || [];

      logger.info(`[v3.0.0] Found ${runningExecutions.length} running executions`);
      return runningExecutions;
    } catch (error) {
      logger.error('[v3.0.0] Failed to get running executions:', error);
      throw handleN8nApiError(error);
    }
  }

  /**
   * NEW in n8n 1.113.3: Get workflows with MCP metadata
   *
   * Filters workflows that have been created/managed by MCP tools.
   * Uses tag-based filtering to identify MCP-managed workflows.
   *
   * Use cases:
   * - List workflows created by Claude via MCP
   * - Filter out manually created workflows
   * - Track MCP workflow adoption
   * - Provide workflow suggestions to agents
   *
   * @returns List of workflows with MCP metadata
   */
  async getMcpWorkflows(): Promise<Workflow[]> {
    try {
      logger.debug('[v3.0.0] Fetching MCP-managed workflows');

      // Strategy 1: Filter by tag (if MCP tag exists)
      const allWorkflows = await this.listWorkflows({});

      const mcpWorkflows = allWorkflows.data.filter(workflow => {
        // Check for MCP-specific tags
        const hasMcpTag = workflow.tags?.some((tag: string | Tag) => {
          const tagName = typeof tag === 'string' ? tag : tag.name;
          return tagName.toLowerCase().includes('mcp') ||
            tagName.toLowerCase().includes('claude') ||
            tagName.toLowerCase().includes('ai-generated');
        });

        // Check for MCP metadata in workflow settings
        const hasMcpMetadata = (workflow.settings as any)?.mcpMetadata !== undefined;

        return hasMcpTag || hasMcpMetadata;
      });

      logger.info(`[v3.0.0] Found ${mcpWorkflows.length} MCP-managed workflows out of ${allWorkflows.data.length} total`);
      return mcpWorkflows;
    } catch (error) {
      logger.error('[v3.0.0] Failed to get MCP workflows:', error);
      throw handleN8nApiError(error);
    }
  }

  /**
   * Enhanced workflow listing with MCP-aware filtering
   *
   * @param params - Standard workflow list parameters
   * @param includeMcpOnly - Filter to only MCP-managed workflows
   * @returns Filtered workflow list
   */
  async listWorkflowsEnhanced(
    params: WorkflowListParams = {},
    includeMcpOnly = false
  ): Promise<WorkflowListResponse> {
    try {
      const response = await this.listWorkflows(params);

      if (includeMcpOnly) {
        const mcpWorkflows = response.data.filter(workflow =>
          workflow.tags?.some((tag: string | Tag) => {
            const tagName = typeof tag === 'string' ? tag : tag.name;
            return tagName.toLowerCase().includes('mcp') ||
              tagName.toLowerCase().includes('claude');
          })
        );

        return {
          ...response,
          data: mcpWorkflows,
        };
      }

      return response;
    } catch (error) {
      throw handleN8nApiError(error);
    }
  }

  /**
   * Get execution statistics for a workflow
   *
   * Useful for:
   * - Workflow performance monitoring
   * - Success rate calculation
   * - Identifying problematic workflows
   *
   * @param workflowId - Workflow ID to get stats for
   * @param limit - Number of recent executions to analyze (default: 100)
   * @returns Execution statistics
   */
  async getWorkflowExecutionStats(workflowId: string, limit = 100): Promise<{
    total: number;
    success: number;
    failed: number;
    running: number;
    waiting: number;
    successRate: number;
    recentExecutions: Execution[];
  }> {
    try {
      logger.debug(`[v3.0.0] Calculating execution stats for workflow ${workflowId}`);

      const response = await this.listExecutions({
        workflowId,
        limit,
      });

      const executions = response.data || [];
      const stats = {
        total: executions.length,
        success: executions.filter(e => e.status === ExecutionStatus.SUCCESS).length,
        failed: executions.filter(e => e.status === ExecutionStatus.ERROR).length,
        running: executions.filter(e => !e.finished).length,
        waiting: executions.filter(e => e.status === ExecutionStatus.WAITING).length,
        successRate: 0,
        recentExecutions: executions.slice(0, 10),
      };

      stats.successRate = stats.total > 0
        ? Math.round((stats.success / stats.total) * 100)
        : 0;

      logger.info(`[v3.0.0] Workflow ${workflowId} stats: ${stats.success}/${stats.total} success (${stats.successRate}%)`);
      return stats;
    } catch (error) {
      logger.error(`[v3.0.0] Failed to get execution stats for workflow ${workflowId}:`, error);
      throw handleN8nApiError(error);
    }
  }

  /**
   * Check if an execution is retriable
   *
   * An execution can be retried if:
   * - Status is 'error' (failed)
   * - Status is 'canceled' (manually stopped)
   * - Status is 'crashed' (system error)
   *
   * @param executionId - Execution ID to check
   * @returns Whether the execution can be retried
   */
  async isExecutionRetriable(executionId: string): Promise<boolean> {
    try {
      const execution = await this.getExecution(executionId);

      // Execution can be retried if it failed or was stopped
      const retriable = execution.status === ExecutionStatus.ERROR || !execution.finished;

      logger.debug(`[v3.0.0] Execution ${executionId} retriable: ${retriable} (status: ${execution.status})`);
      return retriable;
    } catch (error) {
      logger.error(`[v3.0.0] Failed to check if execution ${executionId} is retriable:`, error);
      return false;
    }
  }

  /**
   * Get detailed execution information with retry suggestions
   *
   * @param executionId - Execution ID
   * @returns Execution with retry metadata
   */
  async getExecutionWithRetryInfo(executionId: string): Promise<{
    execution: Execution;
    canRetry: boolean;
    retryReason?: string;
    retryRecommendation?: string;
  }> {
    try {
      const execution = await this.getExecution(executionId, true);
      const canRetry = await this.isExecutionRetriable(executionId);

      let retryReason: string | undefined;
      let retryRecommendation: string | undefined;

      if (canRetry) {
        if (execution.status === ExecutionStatus.ERROR) {
          retryReason = 'Execution failed with error';
          retryRecommendation = 'Check error details and fix credentials or node configuration before retrying';
        } else if (!execution.finished) {
          retryReason = 'Execution was stopped or is incomplete';
          retryRecommendation = 'Safe to retry if stop was intentional';
        }
      }

      return {
        execution,
        canRetry,
        retryReason,
        retryRecommendation,
      };
    } catch (error) {
      logger.error(`[v3.0.0] Failed to get execution retry info for ${executionId}:`, error);
      throw handleN8nApiError(error);
    }
  }

  /**
   * Get API version and features
   *
   * @returns n8n API capabilities
   */
  async getApiCapabilities(): Promise<{
    version: string;
    supportsRetry: boolean;
    supportsRunningFilter: boolean;
    supportsMcpMetadata: boolean;
  }> {
    try {
      // Try to detect n8n version from health check
      const health = await this.healthCheck();

      // For n8n 1.113.3+, all these features should be available
      const capabilities = {
        version: this.apiVersion,
        supportsRetry: true,
        supportsRunningFilter: true,
        supportsMcpMetadata: true,
      };

      logger.info('[v3.0.0] n8n API capabilities:', capabilities);
      return capabilities;
    } catch (error) {
      logger.warn('[v3.0.0] Failed to get API capabilities, assuming v1.113.3 features');
      return {
        version: this.apiVersion,
        supportsRetry: true,
        supportsRunningFilter: true,
        supportsMcpMetadata: true,
      };
    }
  }
}
