import { logger } from '../utils/logger';

/**
 * Response size categories for adaptive responses
 */
export enum ResponseSize {
  /** Minimal - Only IDs and names (1-2KB) */
  MINIMAL = 'minimal',
  /** Compact - Key fields only (5-7KB) */
  COMPACT = 'compact',
  /** Standard - Common use case fields (15-20KB) */
  STANDARD = 'standard',
  /** Full - Complete data (50-100KB+) */
  FULL = 'full',
}

/**
 * Context hints for intelligent response sizing
 */
export interface ResponseContext {
  /** Tool that requested the data */
  tool: string;
  /** User's intent (list, search, debug, etc.) */
  intent?: string;
  /** Number of items being returned */
  itemCount?: number;
  /** Whether user explicitly requested full details */
  explicitFull?: boolean;
  /** Estimated token count of full response */
  estimatedTokens?: number;
}

/**
 * Adaptive Response Builder for v3.0.0
 *
 * Problem: AI agents get overwhelmed by 100KB+ responses
 * Solution: Progressive disclosure - return only what's needed
 *
 * Example:
 * - list_workflows → MINIMAL (just IDs/names)
 * - get_workflow → COMPACT (structure without full node details)
 * - debug_workflow → FULL (everything)
 */
export class AdaptiveResponseBuilder {
  private readonly MAX_TOKENS_COMPACT = 2000; // ~7KB
  private readonly MAX_TOKENS_STANDARD = 5000; // ~18KB
  private readonly BYTES_PER_TOKEN = 3.5; // Average for JSON

  constructor() {
    logger.info('[v3.0.0] Adaptive Response Builder initialized');
  }

  /**
   * Determine optimal response size based on context
   *
   * Decision tree:
   * 1. Explicit full request? → FULL
   * 2. Many items (>10)? → MINIMAL
   * 3. List/search operation? → COMPACT
   * 4. Debug/troubleshoot? → FULL
   * 5. Default → STANDARD
   */
  determineResponseSize(context: ResponseContext): ResponseSize {
    const { tool, intent, itemCount, explicitFull, estimatedTokens } = context;

    // Explicit request for full details
    if (explicitFull) {
      logger.debug(`[v3.0.0] Using FULL response (explicit request)`);
      return ResponseSize.FULL;
    }

    // Large lists need minimal details
    if (itemCount && itemCount > 10) {
      logger.debug(`[v3.0.0] Using MINIMAL response (${itemCount} items)`);
      return ResponseSize.MINIMAL;
    }

    // List operations → compact
    if (intent === 'list' || tool.includes('list')) {
      logger.debug(`[v3.0.0] Using COMPACT response (list operation)`);
      return ResponseSize.COMPACT;
    }

    // Search operations → compact (many results expected)
    if (intent === 'search' || tool.includes('search')) {
      logger.debug(`[v3.0.0] Using COMPACT response (search operation)`);
      return ResponseSize.COMPACT;
    }

    // Debug/troubleshoot → full details needed
    if (intent === 'debug' || intent === 'troubleshoot') {
      logger.debug(`[v3.0.0] Using FULL response (debug/troubleshoot)`);
      return ResponseSize.FULL;
    }

    // Estimated response too large → compact
    if (estimatedTokens && estimatedTokens > this.MAX_TOKENS_STANDARD) {
      logger.debug(`[v3.0.0] Using COMPACT response (estimated ${estimatedTokens} tokens)`);
      return ResponseSize.COMPACT;
    }

    // Default: standard response
    logger.debug(`[v3.0.0] Using STANDARD response (default)`);
    return ResponseSize.STANDARD;
  }

  /**
   * Build workflow response with adaptive sizing
   *
   * MINIMAL: id, name, active, tags
   * COMPACT: + connections count, nodes count, updatedAt
   * STANDARD: + node names/types, connection structure
   * FULL: complete workflow JSON
   */
  buildWorkflowResponse(workflow: any, size: ResponseSize): any {
    switch (size) {
      case ResponseSize.MINIMAL:
        return {
          id: workflow.id,
          name: workflow.name,
          active: workflow.active,
          tags: workflow.tags?.map((t: any) => t.name) || [],
          _hint: 'Use get_workflow with full=true for complete details',
        };

      case ResponseSize.COMPACT:
        return {
          id: workflow.id,
          name: workflow.name,
          active: workflow.active,
          tags: workflow.tags?.map((t: any) => t.name) || [],
          nodesCount: workflow.nodes?.length || 0,
          connectionsCount: this.countConnections(workflow.connections),
          updatedAt: workflow.updatedAt,
          createdAt: workflow.createdAt,
          _hint: 'Use get_workflow with full=true for node details and connections',
        };

      case ResponseSize.STANDARD:
        return {
          id: workflow.id,
          name: workflow.name,
          active: workflow.active,
          tags: workflow.tags || [],
          nodes: workflow.nodes?.map((n: any) => ({
            name: n.name,
            type: n.type,
            position: n.position,
            disabled: n.disabled,
          })) || [],
          connections: this.summarizeConnections(workflow.connections),
          settings: workflow.settings,
          updatedAt: workflow.updatedAt,
          createdAt: workflow.createdAt,
          _hint: 'Use get_workflow with full=true for complete node parameters',
        };

      case ResponseSize.FULL:
      default:
        return workflow;
    }
  }

  /**
   * Build execution response with adaptive sizing
   *
   * MINIMAL: id, status, workflowId, finishedAt
   * COMPACT: + mode, startedAt, error summary
   * STANDARD: + execution data summary
   * FULL: complete execution data
   */
  buildExecutionResponse(execution: any, size: ResponseSize): any {
    switch (size) {
      case ResponseSize.MINIMAL:
        return {
          id: execution.id,
          status: execution.status,
          workflowId: execution.workflowId,
          finishedAt: execution.finishedAt,
          _hint: 'Use get_execution with includeData=true for full details',
        };

      case ResponseSize.COMPACT:
        return {
          id: execution.id,
          status: execution.status,
          workflowId: execution.workflowId,
          workflowName: execution.workflowData?.name,
          mode: execution.mode,
          startedAt: execution.startedAt,
          finishedAt: execution.finishedAt,
          error: execution.data?.resultData?.error
            ? this.summarizeError(execution.data.resultData.error)
            : undefined,
          _hint: 'Use get_execution with includeData=true for execution data',
        };

      case ResponseSize.STANDARD:
        return {
          id: execution.id,
          status: execution.status,
          workflowId: execution.workflowId,
          workflowName: execution.workflowData?.name,
          mode: execution.mode,
          startedAt: execution.startedAt,
          finishedAt: execution.finishedAt,
          executionTime: this.calculateExecutionTime(execution),
          error: execution.data?.resultData?.error,
          summary: this.summarizeExecutionData(execution.data),
          _hint: 'Use get_execution with includeData=true for complete data',
        };

      case ResponseSize.FULL:
      default:
        return execution;
    }
  }

  /**
   * Build node info response with adaptive sizing
   *
   * MINIMAL: name, displayName, version
   * COMPACT: + description, properties count
   * STANDARD: + essential properties (10-20)
   * FULL: all properties (100+)
   */
  buildNodeInfoResponse(nodeInfo: any, size: ResponseSize): any {
    switch (size) {
      case ResponseSize.MINIMAL:
        return {
          name: nodeInfo.name,
          displayName: nodeInfo.displayName,
          version: nodeInfo.version,
          category: nodeInfo.category,
          _hint: 'Use get_node_essentials for common properties or get_node_info for all properties',
        };

      case ResponseSize.COMPACT:
        return {
          name: nodeInfo.name,
          displayName: nodeInfo.displayName,
          version: nodeInfo.version,
          category: nodeInfo.category,
          description: nodeInfo.description,
          propertiesCount: nodeInfo.properties?.length || 0,
          operationsCount: nodeInfo.operations?.length || 0,
          hasAuth: !!nodeInfo.credentials,
          _hint: 'Use get_node_essentials for essential properties with examples',
        };

      case ResponseSize.STANDARD:
        // Delegate to get_node_essentials logic
        return {
          ...nodeInfo,
          properties: nodeInfo.essentialProperties || nodeInfo.properties?.slice(0, 20),
          _hint: 'This is the essential properties view. Use get_node_info for all properties',
        };

      case ResponseSize.FULL:
      default:
        return nodeInfo;
    }
  }

  /**
   * Estimate response size in tokens
   */
  estimateTokens(data: any): number {
    try {
      const json = JSON.stringify(data);
      const bytes = new Blob([json]).size;
      return Math.ceil(bytes / this.BYTES_PER_TOKEN);
    } catch (error) {
      logger.warn('[v3.0.0] Failed to estimate tokens:', error);
      return 0;
    }
  }

  /**
   * Add expansion hint to response
   *
   * Tells the agent how to get more details if needed
   */
  addExpansionHint(response: any, context: ResponseContext): any {
    const { tool } = context;

    const hints: Record<string, string> = {
      list_workflows: 'Use get_workflow(id) for details on a specific workflow',
      list_executions: 'Use get_execution(id, includeData=true) for execution details',
      search_nodes: 'Use get_node_info(name) or get_node_essentials(name) for node details',
      list_nodes: 'Use get_node_essentials(name) for essential properties with examples',
    };

    return {
      ...response,
      _expandWith: hints[tool],
    };
  }

  // Helper methods

  private countConnections(connections: any): number {
    if (!connections) return 0;
    return Object.keys(connections).reduce((total, nodeName) => {
      const nodeConnections = connections[nodeName];
      return total + Object.keys(nodeConnections).reduce((sum, outputType) => {
        return sum + (nodeConnections[outputType]?.length || 0);
      }, 0);
    }, 0);
  }

  private summarizeConnections(connections: any): any {
    if (!connections) return {};

    const summary: Record<string, string[]> = {};
    for (const [source, outputs] of Object.entries(connections)) {
      const targets: string[] = [];
      for (const outputConnections of Object.values(outputs as any)) {
        for (const conn of outputConnections as any[]) {
          targets.push(conn.node);
        }
      }
      summary[source] = [...new Set(targets)]; // Unique targets
    }
    return summary;
  }

  private summarizeError(error: any): any {
    if (typeof error === 'string') {
      return { message: error };
    }
    return {
      message: error.message,
      type: error.name || error.type,
      node: error.node,
    };
  }

  private calculateExecutionTime(execution: any): number | undefined {
    if (!execution.startedAt || !execution.finishedAt) return undefined;
    const start = new Date(execution.startedAt).getTime();
    const end = new Date(execution.finishedAt).getTime();
    return end - start;
  }

  private summarizeExecutionData(data: any): any {
    if (!data?.resultData?.runData) {
      return { message: 'No execution data available' };
    }

    const runData = data.resultData.runData;
    const nodes = Object.keys(runData);

    return {
      nodesExecuted: nodes.length,
      nodes: nodes.map(nodeName => {
        const nodeRuns = runData[nodeName];
        const lastRun = nodeRuns[nodeRuns.length - 1];
        return {
          name: nodeName,
          runs: nodeRuns.length,
          itemsProcessed: lastRun?.data?.main?.[0]?.length || 0,
          error: lastRun?.error,
        };
      }),
    };
  }
}

/**
 * Singleton instance for global access
 */
export const adaptiveResponseBuilder = new AdaptiveResponseBuilder();
