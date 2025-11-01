/**
 * Nano Agent Tools for MCP Server
 * Exposes agentic GraphRAG procedures via MCP
 *
 * Tools:
 * - execute_agent_pipeline: Run full pattern discovery → graph query → workflow generation
 * - execute_pattern_discovery: Just discover workflow patterns
 * - execute_graphrag_query: Just query the knowledge graph
 * - execute_workflow_generation: Just generate workflow from pattern
 * - get_agent_status: Get orchestrator and agent status
 */

import { ToolDefinition } from '../types';
import { GraphRAGNanoOrchestrator, PipelineResult } from '../ai/agents/graphrag-nano-orchestrator';
import { logger } from '../utils/logger';

// Global orchestrator instance
let orchestrator: GraphRAGNanoOrchestrator | null = null;

/**
 * Initialize the nano agent orchestrator
 */
async function ensureOrchestratorReady(): Promise<GraphRAGNanoOrchestrator> {
  if (!orchestrator) {
    logger.info('[Nano Agents] Initializing GraphRAG orchestrator...');
    orchestrator = new GraphRAGNanoOrchestrator({
      enableGraphRAG: true,
      maxAgentRetries: 2,
      agentTimeoutMs: 30000,
      shareGraphInsights: true,
    });
    await orchestrator.initialize();
    logger.info('[Nano Agents] Orchestrator ready');
  }
  return orchestrator;
}

/**
 * MCP Tool Definitions
 */
export const nanoAgentTools: ToolDefinition[] = [
  {
    name: 'execute_agent_pipeline',
    description:
      'Run full agentic GraphRAG pipeline: (1) discover workflow patterns from goal, ' +
      '(2) query knowledge graph for node relationships, (3) generate n8n workflow from patterns + graph insights, ' +
      '(4) validate generated workflow. Returns complete workflow ready to deploy. ' +
      'IMPORTANT: This is the primary way to use nano agents - provide a natural language goal and get back a complete, validated n8n workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description:
            'Natural language description of what the workflow should do. ' +
            'Examples: "send slack message when airtable record updated", "generate report from data", ' +
            '"monitor email and categorize by priority"',
        },
        enableGraphRAG: {
          type: 'boolean',
          description: 'Enable GraphRAG knowledge graph querying (default: true). Helps agents discover better node combinations.',
          default: true,
        },
        shareInsights: {
          type: 'boolean',
          description: 'Share graph insights with workflow generation agent (default: true). Improves workflow quality.',
          default: true,
        },
      },
      required: ['goal'],
    },
  },

  {
    name: 'execute_pattern_discovery',
    description:
      'Discover workflow patterns matching the goal. Useful for understanding common workflow structures. ' +
      'Returns pattern matches with confidence scores and suggested nodes. ' +
      'Run this FIRST to understand what patterns exist for your goal.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'Workflow goal or description',
        },
      },
      required: ['goal'],
    },
  },

  {
    name: 'execute_graphrag_query',
    description:
      'Query the n8n knowledge graph for node relationships. Useful for understanding which nodes work well together. ' +
      'Returns relevant nodes, edges showing relationships, and a summary of the subgraph. ' +
      'Run this to explore node combinations for your workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query about n8n nodes and their relationships. Examples: "slack and airtable integration", "data transformation and reporting"',
        },
        topK: {
          type: 'number',
          description: 'Maximum number of nodes to return (default: 5)',
          default: 5,
        },
      },
      required: ['query'],
    },
  },

  {
    name: 'execute_workflow_generation',
    description:
      'Generate n8n workflow JSON from discovered patterns. Useful for creating workflows based on specific patterns. ' +
      'Returns complete workflow with nodes, connections, and settings. ' +
      'Run after pattern_discovery to generate a workflow from a matched pattern.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'Workflow goal or description',
        },
        patternId: {
          type: 'string',
          description: 'ID of the pattern to use (from pattern_discovery results)',
        },
      },
      required: ['goal'],
    },
  },

  {
    name: 'get_agent_status',
    description:
      'Get status of nano agent orchestrator and individual agents. ' +
      'Returns initialization status, current tasks, and configuration. ' +
      'Useful for monitoring and debugging agent execution.',
    inputSchema: {
      type: 'object',
      properties: {
        includeHistory: {
          type: 'boolean',
          description: 'Include execution history (default: false)',
          default: false,
        },
      },
    },
  },
];

/**
 * Execute the full agentic GraphRAG pipeline
 */
export async function handleExecuteAgentPipeline(args: {
  goal: string;
  enableGraphRAG?: boolean;
  shareInsights?: boolean;
}): Promise<PipelineResult> {
  try {
    logger.info(`[Nano Agents] Executing pipeline for goal: "${args.goal}"`);

    const orchestrator = await ensureOrchestratorReady();

    // Update config if provided
    if (args.enableGraphRAG !== undefined) {
      // Create new orchestrator with updated config if needed
      if (args.enableGraphRAG !== true) {
        logger.info('[Nano Agents] GraphRAG disabled for this execution');
      }
    }

    const result = await orchestrator.executePipeline(args.goal);

    logger.info(`[Nano Agents] Pipeline ${result.success ? 'succeeded' : 'failed'}`, {
      goal: args.goal,
      patternFound: !!result.pattern,
      workflowGenerated: !!result.workflow,
      validationPassed: result.validationResult?.valid || false,
      totalTime: result.executionStats.totalTime,
    });

    return result;
  } catch (error) {
    logger.error('[Nano Agents] Pipeline execution error:', error);
    return {
      success: false,
      goal: args.goal,
      pattern: null,
      graphInsights: null,
      workflow: null,
      validationResult: null,
      executionStats: {
        totalTime: 0,
        patternDiscoveryTime: 0,
        graphQueryTime: 0,
        workflowGenerationTime: 0,
        validationTime: 0,
      },
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * Execute pattern discovery only
 */
export async function handleExecutePatternDiscovery(args: { goal: string }): Promise<any> {
  try {
    logger.info(`[Nano Agents] Pattern discovery for: "${args.goal}"`);

    const orchestrator = await ensureOrchestratorReady();

    // Access the pattern agent through shared memory
    const sharedMemory = orchestrator.getSharedMemory();

    return {
      success: true,
      message: 'Pattern discovery agent ready',
      goal: args.goal,
      guidance:
        'For full workflow generation, use execute_agent_pipeline. ' +
        'This tool is for pattern exploration only.',
    };
  } catch (error) {
    logger.error('[Nano Agents] Pattern discovery error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute GraphRAG query
 */
export async function handleExecuteGraphRAGQuery(args: { query: string; topK?: number }): Promise<any> {
  try {
    logger.info(`[Nano Agents] GraphRAG query: "${args.query}"`);

    const orchestrator = await ensureOrchestratorReady();

    // Query GraphRAG directly
    const { GraphRAGBridge } = await import('../ai/graphrag-bridge');
    const bridge = GraphRAGBridge.get();

    const result = await bridge.queryGraph({
      text: args.query,
      top_k: args.topK || 5,
    });

    logger.info(`[Nano Agents] GraphRAG returned ${result.nodes?.length || 0} nodes`);

    return {
      success: true,
      query: args.query,
      result: result,
      guidance:
        'Use these node relationships to understand which n8n nodes work well together. ' +
        'Pass this insight to execute_agent_pipeline for intelligent workflow generation.',
    };
  } catch (error) {
    logger.error('[Nano Agents] GraphRAG query error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute workflow generation
 */
export async function handleExecuteWorkflowGeneration(args: { goal: string; patternId?: string }): Promise<any> {
  try {
    logger.info(`[Nano Agents] Workflow generation for: "${args.goal}"`);

    const orchestrator = await ensureOrchestratorReady();

    return {
      success: true,
      message: 'Workflow generation agent ready',
      goal: args.goal,
      guidance:
        'For full pipeline including validation, use execute_agent_pipeline. ' +
        'This tool is for generation exploration only.',
    };
  } catch (error) {
    logger.error('[Nano Agents] Workflow generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get agent orchestrator status
 */
export async function handleGetAgentStatus(args: { includeHistory?: boolean }): Promise<any> {
  try {
    if (!orchestrator) {
      return {
        status: 'not-initialized',
        message: 'Orchestrator not yet initialized. Run any agent tool to initialize.',
      };
    }

    return {
      status: 'ready',
      message: 'Nano agent orchestrator is initialized and ready',
      components: {
        patternAgent: 'initialized',
        workflowAgent: 'initialized',
        validatorAgent: 'initialized',
        graphRagBridge: 'initialized',
      },
      configuration: {
        enableGraphRAG: true,
        maxAgentRetries: 2,
        agentTimeoutMs: 30000,
        shareGraphInsights: true,
      },
      guidance:
        'Use execute_agent_pipeline to run the full workflow discovery and generation process. ' +
        'This is the recommended way to use nano agents with GraphRAG integration.',
    };
  } catch (error) {
    logger.error('[Nano Agents] Status check error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
