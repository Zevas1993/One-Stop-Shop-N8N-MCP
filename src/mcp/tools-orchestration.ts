/**
 * MCP Tools for GraphRAG Orchestration
 * Exposes multi-agent orchestration capabilities through MCP interface
 */

import { ToolDefinition } from "../types";
import { GraphRAGNanoOrchestrator } from "../ai/agents/graphrag-nano-orchestrator";

// Global orchestrator instance (lazy-loaded)
let orchestrator: GraphRAGNanoOrchestrator | null = null;

/**
 * Get or create the orchestrator instance
 */
async function getOrchestrator(): Promise<GraphRAGNanoOrchestrator> {
  if (!orchestrator) {
    orchestrator = new GraphRAGNanoOrchestrator({
      enableGraphRAG: true,
    });
    await orchestrator.initialize();
  }
  return orchestrator;
}

export const orchestrationTools: ToolDefinition[] = [
  {
    name: "orchestrate_workflow",
    description:
      "Uses AI agents to discover workflow patterns, generate n8n workflow JSON, and validate the structure. Executes the complete multi-agent pipeline: Pattern Discovery → Workflow Generation → Validation.",
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description:
            'Natural language description of the workflow to create (e.g., "Send Slack notifications when data arrives")',
        },
        context: {
          type: "object",
          description:
            "Optional context information (e.g., platform, user role, environment)",
          properties: {
            platform: {
              type: "string",
              description: 'Target platform (e.g., "n8n", "zapier", "make")',
            },
            userRole: {
              type: "string",
              description:
                'User role or skill level (e.g., "admin", "developer", "business-user")',
            },
            environment: {
              type: "string",
              description:
                'Environment context (e.g., "production", "staging", "local")',
            },
          },
        },
        allowRetry: {
          type: "boolean",
          description: "Allow retry if validation fails (default: true)",
          default: true,
        },
        maxRetries: {
          type: "number",
          description: "Maximum number of retries (default: 1)",
          default: 1,
        },
      },
      required: ["goal"],
    },
  },
  {
    name: "validate_workflow_structure",
    description:
      "Validates a workflow JSON structure for correctness and completeness. Checks node types, connections, required fields, and generates detailed error/warning reports.",
    inputSchema: {
      type: "object",
      properties: {
        workflow: {
          type: "object",
          description: "The n8n workflow JSON to validate",
          properties: {
            name: {
              type: "string",
              description: "Workflow name",
            },
            nodes: {
              type: "array",
              description: "Array of workflow nodes",
            },
            connections: {
              type: "object",
              description: "Node connections (source → targets)",
            },
          },
          required: ["name", "nodes", "connections"],
        },
      },
      required: ["workflow"],
    },
  },
  {
    name: "get_orchestration_status",
    description:
      "Get the current status of the orchestrator, including initialization state and shared memory statistics.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "clear_orchestration_state",
    description:
      "Clear all cached state from the orchestrator (patterns, workflows, validation results). Useful before running new orchestrations.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

/**
 * Handle orchestrate_workflow tool
 */
export async function handleOrchestrate(args: {
  goal: string;
  context?: Record<string, any>;
  allowRetry?: boolean;
  maxRetries?: number;
}): Promise<any> {
  try {
    const orchestrator = await getOrchestrator();

    const result = await orchestrator.executePipeline(args.goal, args.context);

    return {
      success: result.success,
      goal: result.goal,
      workflow: result.workflow || null,
      validationResult: result.validationResult || null,
      stages: {
        pattern: result.pattern,
        graph: result.graphInsights,
        generation: result.workflow ? { success: true } : { success: false },
        validation: result.validationResult,
      },
      executionTime: result.executionStats.totalTime,
      errors: result.errors || [],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Handle validate_workflow_structure tool
 */
export async function handleValidateWorkflow(args: {
  workflow: any;
}): Promise<any> {
  try {
    // This would integrate with the validator agent directly
    // For now, returning a basic validation
    const workflow = args.workflow;

    const errors: any[] = [];
    const warnings: any[] = [];

    // Basic structure validation
    if (!workflow.name) {
      errors.push({
        type: "MISSING_NAME",
        message: "Workflow must have a name",
        severity: "critical",
      });
    }

    if (!Array.isArray(workflow.nodes)) {
      errors.push({
        type: "MISSING_NODES",
        message: "Workflow must have a nodes array",
        severity: "critical",
      });
    } else if (workflow.nodes.length === 0) {
      errors.push({
        type: "EMPTY_NODES",
        message: "Workflow must have at least one node",
        severity: "critical",
      });
    }

    if (!workflow.connections || typeof workflow.connections !== "object") {
      errors.push({
        type: "MISSING_CONNECTIONS",
        message: "Workflow must have connections object",
        severity: "critical",
      });
    }

    // Node validation
    if (Array.isArray(workflow.nodes)) {
      const nodeNames = new Set<string>();

      for (const node of workflow.nodes) {
        if (!node.name) {
          errors.push({
            type: "NODE_MISSING_NAME",
            message: "Node must have a name",
            severity: "high",
          });
        } else {
          nodeNames.add(node.name);
        }

        if (!node.type) {
          errors.push({
            type: "NODE_MISSING_TYPE",
            message: `Node "${node.name}" must have a type`,
            severity: "high",
          });
        } else if (!node.type.startsWith("n8n-")) {
          warnings.push({
            type: "UNUSUAL_NODE_TYPE",
            message: `Node type "${node.type}" doesn't follow n8n naming convention`,
            suggestion: 'Should start with "n8n-nodes-base." or similar',
          });
        }

        if (!Array.isArray(node.position) || node.position.length !== 2) {
          warnings.push({
            type: "INVALID_POSITION",
            message: `Node "${node.name}" has invalid position`,
          });
        }
      }

      // Connection validation
      if (workflow.connections && typeof workflow.connections === "object") {
        for (const [source, conn] of Object.entries(workflow.connections)) {
          if (!nodeNames.has(source)) {
            errors.push({
              type: "INVALID_CONNECTION_SOURCE",
              message: `Connection references unknown node: ${source}`,
              severity: "high",
            });
          }

          const connData = conn as any;
          if (connData.main && Array.isArray(connData.main)) {
            for (const path of connData.main) {
              if (Array.isArray(path)) {
                for (const target of path) {
                  if (!nodeNames.has(target.node)) {
                    errors.push({
                      type: "INVALID_CONNECTION_TARGET",
                      message: `Connection from "${source}" references unknown node: ${target.node}`,
                      severity: "high",
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    const hasCriticalErrors = errors.some((e) => e.severity === "critical");

    return {
      valid: !hasCriticalErrors,
      errors,
      warnings,
      summary: {
        nodeCount: Array.isArray(workflow.nodes) ? workflow.nodes.length : 0,
        connectionCount: workflow.connections
          ? Object.keys(workflow.connections).length
          : 0,
        errorCount: errors.length,
        warningCount: warnings.length,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error during validation",
    };
  }
}

/**
 * Handle get_orchestration_status tool
 */
export async function handleGetStatus(): Promise<any> {
  try {
    const orchestrator = await getOrchestrator();
    const memory = orchestrator.getSharedMemory();
    const stats = await memory.getStats();

    return {
      initialized: true,
      agentsReady: true,
      sharedMemory: stats,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unknown error getting status",
    };
  }
}

/**
 * Handle clear_orchestration_state tool
 */
export async function handleClearState(): Promise<any> {
  try {
    if (orchestrator) {
      await orchestrator.cleanup();
      orchestrator = null;
    }

    // Re-initialize immediately to be ready
    await getOrchestrator();

    return {
      success: true,
      message: "Orchestration state cleared successfully",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown error clearing state",
    };
  }
}

/**
 * Shutdown orchestrator (called on app shutdown)
 */
export async function shutdownOrchestrator(): Promise<void> {
  if (orchestrator) {
    try {
      await orchestrator.cleanup();
      orchestrator = null;
    } catch (error) {
      console.error("Error shutting down orchestrator:", error);
    }
  }
}
