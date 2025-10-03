import { logger } from '../utils/logger';
import { ResponseContext, ResponseSize } from './adaptive-response-builder';

/**
 * User intent categories for context-aware responses
 */
export enum UserIntent {
  /** Browsing/exploring workflows */
  EXPLORE = 'explore',
  /** Searching for specific item */
  SEARCH = 'search',
  /** Creating new workflow */
  CREATE = 'create',
  /** Debugging existing workflow */
  DEBUG = 'debug',
  /** Monitoring execution status */
  MONITOR = 'monitor',
  /** Learning about nodes */
  LEARN = 'learn',
  /** Quick reference lookup */
  REFERENCE = 'reference',
}

/**
 * Conversation state tracking
 */
interface ConversationState {
  /** Last tool called */
  lastTool?: string;
  /** Timestamp of last call */
  lastCallTime?: Date;
  /** Number of calls in current session */
  callCount: number;
  /** Detected user intent */
  detectedIntent?: UserIntent;
  /** Active workflow context */
  activeWorkflow?: string;
  /** Recent errors encountered */
  recentErrors: string[];
}

/**
 * Context Intelligence Engine for v3.0.0
 *
 * Analyzes conversation patterns to provide intelligent, context-aware responses.
 *
 * Features:
 * - Intent detection from tool usage patterns
 * - Automatic response sizing based on context
 * - Error recovery suggestions
 * - Workflow context tracking
 */
export class ContextIntelligenceEngine {
  private state: ConversationState = {
    callCount: 0,
    recentErrors: [],
  };

  constructor() {
    logger.info('[v3.0.0] Context Intelligence Engine initialized');
  }

  /**
   * Analyze tool call to determine user intent and optimal response
   */
  analyzeToolCall(
    toolName: string,
    params: Record<string, any>
  ): ResponseContext {
    this.updateState(toolName);

    const intent = this.detectIntent(toolName, params);
    const itemCount = this.estimateItemCount(toolName, params);
    const explicitFull = this.detectExplicitFullRequest(params);

    const context: ResponseContext = {
      tool: toolName,
      intent,
      itemCount,
      explicitFull,
    };

    logger.debug(`[v3.0.0] Context analysis:`, {
      tool: toolName,
      intent,
      itemCount,
      explicitFull,
    });

    return context;
  }

  /**
   * Detect user intent from tool name and parameters
   */
  private detectIntent(
    toolName: string,
    params: Record<string, any>
  ): UserIntent {
    // List operations → exploring
    if (toolName.includes('list') && !params.filter) {
      return UserIntent.EXPLORE;
    }

    // Search operations → searching
    if (toolName.includes('search') || params.query || params.search) {
      return UserIntent.SEARCH;
    }

    // Create operations → creating
    if (toolName.includes('create') || toolName.includes('new')) {
      return UserIntent.CREATE;
    }

    // Execution/validation operations → debugging
    if (
      toolName.includes('validate') ||
      toolName.includes('execution') ||
      toolName.includes('debug')
    ) {
      return UserIntent.DEBUG;
    }

    // Monitor operations → monitoring
    if (
      toolName.includes('monitor') ||
      toolName.includes('running') ||
      toolName.includes('status')
    ) {
      return UserIntent.MONITOR;
    }

    // Node info operations → learning
    if (
      toolName.includes('node_info') ||
      toolName.includes('get_node') ||
      toolName.includes('documentation')
    ) {
      // Full info request → reference
      if (params.full || params.includeAll) {
        return UserIntent.REFERENCE;
      }
      return UserIntent.LEARN;
    }

    // Default based on conversation history
    if (this.state.lastTool?.includes('create')) {
      return UserIntent.CREATE;
    }

    if (this.state.recentErrors.length > 0) {
      return UserIntent.DEBUG;
    }

    return UserIntent.EXPLORE;
  }

  /**
   * Estimate number of items that will be returned
   */
  private estimateItemCount(
    toolName: string,
    params: Record<string, any>
  ): number | undefined {
    // Explicit limit parameter
    if (params.limit) {
      return params.limit;
    }

    // List all operations → many items
    if (toolName.includes('list_all')) {
      return 100;
    }

    // List operations without filter → moderate items
    if (toolName.includes('list') && !params.filter) {
      return 20;
    }

    // Search operations → variable
    if (toolName.includes('search')) {
      return 10;
    }

    // Get single item
    if (toolName.includes('get_') && params.id) {
      return 1;
    }

    return undefined;
  }

  /**
   * Detect if user explicitly requested full details
   */
  private detectExplicitFullRequest(params: Record<string, any>): boolean {
    return !!(
      params.full ||
      params.includeAll ||
      params.includeData ||
      params.verbose ||
      params.detailed
    );
  }

  /**
   * Update conversation state
   */
  private updateState(toolName: string): void {
    this.state.lastTool = toolName;
    this.state.lastCallTime = new Date();
    this.state.callCount++;

    // Track workflow context
    if (toolName.includes('workflow')) {
      // Extract workflow ID from recent calls
      // This would be populated from actual params in real implementation
    }

    logger.debug(`[v3.0.0] State updated: ${this.state.callCount} calls, last: ${toolName}`);
  }

  /**
   * Record an error for context-aware recovery
   */
  recordError(error: string): void {
    this.state.recentErrors.push(error);

    // Keep only last 5 errors
    if (this.state.recentErrors.length > 5) {
      this.state.recentErrors.shift();
    }

    logger.debug(`[v3.0.0] Error recorded: ${error}`);
  }

  /**
   * Get error recovery suggestions based on recent errors
   */
  getErrorRecoverySuggestions(): string[] {
    const suggestions: string[] = [];

    for (const error of this.state.recentErrors) {
      if (error.includes('credential')) {
        suggestions.push('Check workflow credentials are configured correctly');
      }
      if (error.includes('connection')) {
        suggestions.push('Verify workflow node connections are valid');
      }
      if (error.includes('required')) {
        suggestions.push('Ensure all required node parameters are set');
      }
      if (error.includes('timeout')) {
        suggestions.push('Consider increasing timeout or simplifying workflow');
      }
      if (error.includes('not found')) {
        suggestions.push('Verify the workflow/execution ID exists');
      }
    }

    return [...new Set(suggestions)]; // Remove duplicates
  }

  /**
   * Get contextual help message based on current state
   */
  getContextualHelp(): string | undefined {
    const { lastTool, detectedIntent, callCount } = this.state;

    // First-time user
    if (callCount === 1) {
      return 'Tip: Use list_nodes to explore available nodes, or list_workflows to see existing workflows';
    }

    // User creating workflows
    if (detectedIntent === UserIntent.CREATE) {
      return 'Tip: Validate workflows with validate_workflow before creating them to catch issues early';
    }

    // User debugging
    if (detectedIntent === UserIntent.DEBUG && this.state.recentErrors.length > 0) {
      const suggestions = this.getErrorRecoverySuggestions();
      if (suggestions.length > 0) {
        return `Recovery suggestions: ${suggestions.join('; ')}`;
      }
    }

    // User exploring nodes
    if (lastTool?.includes('node_info')) {
      return 'Tip: Use get_node_essentials for cleaner responses with just the important properties';
    }

    return undefined;
  }

  /**
   * Determine if response should include execution suggestions
   */
  shouldIncludeExecutionSuggestions(): boolean {
    return (
      this.state.detectedIntent === UserIntent.CREATE ||
      this.state.lastTool?.includes('create_workflow') === true
    );
  }

  /**
   * Determine if response should include debugging tips
   */
  shouldIncludeDebuggingTips(): boolean {
    return (
      this.state.detectedIntent === UserIntent.DEBUG ||
      this.state.recentErrors.length > 0
    );
  }

  /**
   * Get recommended next tools based on context
   */
  getRecommendedNextTools(): string[] {
    const { lastTool, detectedIntent } = this.state;

    if (lastTool === 'list_workflows') {
      return ['get_workflow', 'n8n_list_executions'];
    }

    if (lastTool === 'create_workflow') {
      return ['validate_workflow', 'n8n_trigger_webhook_workflow'];
    }

    if (lastTool === 'list_executions') {
      return ['get_execution', 'n8n_retry_execution'];
    }

    if (lastTool?.includes('node_info')) {
      return ['get_node_essentials', 'validate_node_operation'];
    }

    if (detectedIntent === UserIntent.DEBUG) {
      return ['validate_workflow', 'get_execution', 'n8n_retry_execution'];
    }

    if (detectedIntent === UserIntent.MONITOR) {
      return ['n8n_monitor_running_executions', 'n8n_list_executions'];
    }

    return [];
  }

  /**
   * Reset conversation state (for new session)
   */
  reset(): void {
    this.state = {
      callCount: 0,
      recentErrors: [],
    };
    logger.info('[v3.0.0] Context state reset');
  }

  /**
   * Get current state for debugging
   */
  getState(): ConversationState {
    return { ...this.state };
  }
}

/**
 * Singleton instance for global access
 */
export const contextIntelligence = new ContextIntelligenceEngine();
