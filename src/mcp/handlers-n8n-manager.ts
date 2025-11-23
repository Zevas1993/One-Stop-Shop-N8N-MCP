import { N8nApiClient } from "../services/n8n-api-client";
import { getN8nApiConfig } from "../config/n8n-api";
import {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
  ExecutionStatus,
  WebhookRequest,
  McpToolResponse,
} from "../types/n8n-api";
import {
  validateWorkflowStructure,
  validateWorkflowSize,
  hasWebhookTrigger,
  getWebhookUrl,
} from "../services/n8n-validation";
import {
  N8nApiError,
  N8nNotFoundError,
  getUserFriendlyErrorMessage,
  createErrorResponse,
} from "../utils/n8n-errors";
import { logger } from "../utils/logger";
import { z } from "zod";
import { WorkflowValidator } from "../services/workflow-validator";
import { EnhancedConfigValidator } from "../services/enhanced-config-validator";
import { NodeRepository } from "../database/node-repository";
import { validationCache } from "../utils/validation-cache";

// Singleton n8n API client instance
let apiClient: N8nApiClient | null = null;
let lastConfigUrl: string | null = null;

// Get or create API client (with lazy config loading)
export function getN8nApiClient(): N8nApiClient | null {
  const config = getN8nApiConfig();

  if (!config) {
    if (apiClient) {
      logger.info("n8n API configuration removed, clearing client");
      apiClient = null;
      lastConfigUrl = null;
    }
    return null;
  }

  // Check if config has changed
  if (!apiClient || lastConfigUrl !== config.baseUrl) {
    logger.info("n8n API client initialized", { url: config.baseUrl });
    apiClient = new N8nApiClient(config);
    lastConfigUrl = config.baseUrl;
  }

  return apiClient;
}

// Helper to ensure API is configured
function ensureApiConfigured(): N8nApiClient {
  const client = getN8nApiClient();
  if (!client) {
    throw new Error(
      "n8n API not configured. Please set N8N_API_URL and N8N_API_KEY environment variables."
    );
  }
  return client;
}

// Zod schemas for input validation
const createWorkflowSchema = z.object({
  name: z.string(),
  nodes: z.array(z.any()),
  connections: z.record(z.any()),
  settings: z
    .object({
      executionOrder: z.enum(["v0", "v1"]).optional(),
      timezone: z.string().optional(),
      saveDataErrorExecution: z.enum(["all", "none"]).optional(),
      saveDataSuccessExecution: z.enum(["all", "none"]).optional(),
      saveManualExecutions: z.boolean().optional(),
      saveExecutionProgress: z.boolean().optional(),
      executionTimeout: z.number().optional(),
      errorWorkflow: z.string().optional(),
    })
    .optional(),
});

const updateWorkflowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  connections: z.record(z.any()).optional(),
  settings: z.any().optional(),
});

const listWorkflowsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
  active: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  excludePinnedData: z.boolean().optional(),
});

const validateWorkflowSchema = z.object({
  id: z.string(),
  options: z
    .object({
      validateNodes: z.boolean().optional(),
      validateConnections: z.boolean().optional(),
      validateExpressions: z.boolean().optional(),
      profile: z
        .enum(["minimal", "runtime", "ai-friendly", "strict"])
        .optional(),
    })
    .optional(),
});

const triggerWebhookSchema = z.object({
  webhookUrl: z.string().url(),
  httpMethod: z.enum(["GET", "POST", "PUT", "DELETE"]).optional(),
  data: z.record(z.unknown()).optional(),
  headers: z.record(z.string()).optional(),
  waitForResponse: z.boolean().optional(),
});

const listExecutionsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
  workflowId: z.string().optional(),
  projectId: z.string().optional(),
  status: z.enum(["success", "error", "waiting"]).optional(),
  includeData: z.boolean().optional(),
});

// Workflow Management Handlers

export async function handleCreateWorkflow(
  args: unknown,
  repository: NodeRepository
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = createWorkflowSchema.parse(args);

    // Check workflow size to prevent API failures
    const sizeValidation = validateWorkflowSize(input, 1); // 1MB limit
    if (!sizeValidation.valid) {
      return createErrorResponse(sizeValidation.error || "Workflow too large", "WORKFLOW_SIZE_ERROR", {
        sizeKB: sizeValidation.sizeKB
      });
    }

    // ENFORCE VALIDATION REQUIREMENT - Check validation cache first
    const { validationCache } = await import("../utils/validation-cache");
    const validationStatus = validationCache.isValidatedAndValid(input);

    // If not in cache, run full validation immediately
    if (!validationStatus.validated) {
      logger.info(
        "[handleCreateWorkflow] Workflow not in validation cache, running immediate validation"
      );

      const validator = new WorkflowValidator(
        repository,
        EnhancedConfigValidator
      );
      // We need to cast input to WorkflowJson-like structure.
      // The schema uses z.any() for nodes/connections but validator expects typed objects.
      // At runtime, input.nodes and input.connections are the objects we need.
      const validationResult = await validator.validateWorkflow(input as any, {
        validateNodes: true,
        validateConnections: true,
        profile: "runtime",
      });

      if (!validationResult.valid) {
        // Record the invalid validation result in cache for next time
        validationCache.recordValidation(input, {
          valid: false,
          errors: validationResult.errors,
          warnings: validationResult.warnings || []
        });

        return {
          success: false,
          error:
            "🚨 VALIDATION FAILED: Workflow rejected by strict validation enforcement.",
          details: {
            errors: validationResult.errors,
            message:
              "The Agentic GraphRAG system rejected this workflow because it contains errors that would prevent it from running in n8n.",
            workflow: "1️⃣ Fix errors listed above → 2️⃣ Retry creation",
            validationStats: validationResult.statistics,
          },
        };
      }

      logger.info("[handleCreateWorkflow] Immediate validation passed");

      // Record the valid validation result in cache for next time
      validationCache.recordValidation(input, {
        valid: true,
        errors: [],
        warnings: validationResult.warnings || []
      });
    } else if (!validationStatus.valid) {
      // It was in cache but marked invalid
      return {
        success: false,
        error:
          "🚨 VALIDATION FAILED: Workflow has known validation errors and cannot be created!",
        details: {
          errors: validationStatus.errors,
          message: "Fix all validation errors before creating workflow",
          workflow:
            "1️⃣ validate_workflow → 2️⃣ Fix errors → 3️⃣ n8n_create_workflow",
        },
      };
    }

    // Additional basic validation (keep existing for safety)
    const errors = validateWorkflowStructure(input);
    if (errors.length > 0) {
      return createErrorResponse("Workflow validation failed", "WORKFLOW_STRUCTURE_ERROR", { errors });
    }

    // Create workflow
    const workflow = await client.createWorkflow(input);

    return {
      success: true,
      data: workflow,
      message: `Workflow "${workflow.name}" created successfully with ID: ${workflow.id}`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid input", "VALIDATION_ERROR", { errors: error.errors });
    }

    if (error instanceof N8nApiError) {
      return createErrorResponse(
        getUserFriendlyErrorMessage(error),
        error.code,
        error.details as Record<string, unknown> | undefined
      );
    }

    return createErrorResponse(
      error instanceof Error ? error.message : "Unknown error occurred",
      "UNKNOWN_ERROR"
    );
  }
}

export async function handleGetWorkflow(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id } = z.object({ id: z.string() }).parse(args);

    const workflow = await client.getWorkflow(id);

    return {
      success: true,
      data: workflow,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleGetWorkflowDetails(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id } = z.object({ id: z.string() }).parse(args);

    const workflow = await client.getWorkflow(id);

    // Get recent executions for this workflow
    const executions = await client.listExecutions({
      workflowId: id,
      limit: 10,
    });

    // Calculate execution statistics
    const stats = {
      totalExecutions: executions.data.length,
      successCount: executions.data.filter(
        (e) => e.status === ExecutionStatus.SUCCESS
      ).length,
      errorCount: executions.data.filter(
        (e) => e.status === ExecutionStatus.ERROR
      ).length,
      lastExecutionTime: executions.data[0]?.startedAt || null,
    };

    return {
      success: true,
      data: {
        workflow,
        executionStats: stats,
        hasWebhookTrigger: hasWebhookTrigger(workflow),
        webhookPath: getWebhookUrl(workflow),
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleGetWorkflowStructure(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id } = z.object({ id: z.string() }).parse(args);

    const workflow = await client.getWorkflow(id);

    // Simplify nodes to just essential structure
    const simplifiedNodes = workflow.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      position: node.position,
      disabled: node.disabled || false,
    }));

    return {
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
        active: workflow.active,
        nodes: simplifiedNodes,
        connections: workflow.connections,
        nodeCount: workflow.nodes.length,
        connectionCount: Object.keys(workflow.connections).length,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleGetWorkflowMinimal(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id } = z.object({ id: z.string() }).parse(args);

    const workflow = await client.getWorkflow(id);

    return {
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
        active: workflow.active,
        tags: workflow.tags || [],
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleUpdateWorkflow(
  args: unknown,
  repository: NodeRepository
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = updateWorkflowSchema.parse(args);
    const { id, ...updateData } = input;

    // If nodes/connections are being updated, validate the structure
    if (updateData.nodes || updateData.connections) {
      // Fetch current workflow if only partial update
      let fullWorkflow = updateData as Partial<Workflow>;
      let workflowToValidate = updateData;

      if (!updateData.nodes || !updateData.connections) {
        const current = await client.getWorkflow(id);
        fullWorkflow = {
          ...current,
          ...updateData,
        };
        workflowToValidate = fullWorkflow;
      }

      // Check workflow size to prevent API failures
      const sizeValidation = validateWorkflowSize(fullWorkflow, 1); // 1MB limit
      if (!sizeValidation.valid) {
        return createErrorResponse(sizeValidation.error || "Workflow too large", "WORKFLOW_SIZE_ERROR", {
          sizeKB: sizeValidation.sizeKB
        });
      }

      // ENFORCE VALIDATION
      logger.info("[handleUpdateWorkflow] Running strict validation on update");
      const validator = new WorkflowValidator(
        repository,
        EnhancedConfigValidator
      );
      const validationResult = await validator.validateWorkflow(
        workflowToValidate as any,
        {
          validateNodes: true,
          validateConnections: true,
          profile: "runtime",
        }
      );

      if (!validationResult.valid) {
        // Record the invalid validation result in cache
        validationCache.recordValidation(workflowToValidate, {
          valid: false,
          errors: validationResult.errors,
          warnings: validationResult.warnings || []
        });

        return {
          success: false,
          error:
            "🚨 VALIDATION FAILED: Update rejected by strict validation enforcement.",
          details: {
            errors: validationResult.errors,
            message:
              "The Agentic GraphRAG system rejected this update because it would result in a broken workflow.",
            validationStats: validationResult.statistics,
          },
        };
      }

      // Record the valid validation result in cache
      validationCache.recordValidation(workflowToValidate, {
        valid: true,
        errors: [],
        warnings: validationResult.warnings || []
      });

      const errors = validateWorkflowStructure(fullWorkflow);
      if (errors.length > 0) {
        return createErrorResponse("Workflow validation failed", "WORKFLOW_STRUCTURE_ERROR", { errors });
      }
    }

    // Update workflow
    const workflow = await client.updateWorkflow(id, updateData);

    return {
      success: true,
      data: workflow,
      message: `Workflow "${workflow.name}" updated successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid input", "VALIDATION_ERROR", { errors: error.errors });
    }

    if (error instanceof N8nApiError) {
      return createErrorResponse(
        getUserFriendlyErrorMessage(error),
        error.code,
        error.details as Record<string, unknown> | undefined
      );
    }

    return createErrorResponse(
      error instanceof Error ? error.message : "Unknown error occurred",
      "UNKNOWN_ERROR"
    );
  }
}

export async function handleDeleteWorkflow(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id } = z.object({ id: z.string() }).parse(args);

    await client.deleteWorkflow(id);

    return {
      success: true,
      message: `Workflow ${id} deleted successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleListWorkflows(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = listWorkflowsSchema.parse(args || {});

    const response = await client.listWorkflows({
      limit: input.limit || 100,
      cursor: input.cursor,
      active: input.active,
      tags: input.tags,
      projectId: input.projectId,
      excludePinnedData: input.excludePinnedData ?? true,
    });

    return {
      success: true,
      data: {
        workflows: response.data,
        nextCursor: response.nextCursor,
        total: response.data.length,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleActivateWorkflow(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id, active } = z
      .object({
        id: z.string(),
        active: z.boolean(),
      })
      .parse(args);

    const workflow = await client.activateWorkflow(id, active);

    return {
      success: true,
      data: workflow,
      message: `Workflow ${id} ${
        active ? "activated" : "deactivated"
      } successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleRunWorkflow(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id, data } = z
      .object({
        id: z.string(),
        data: z.record(z.unknown()).optional(),
      })
      .parse(args);

    const execution = await client.runWorkflow(id, data);

    return {
      success: true,
      data: execution,
      message: `Workflow ${id} executed successfully. Execution ID: ${execution.id}`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleValidateWorkflow(
  args: unknown,
  repository: NodeRepository
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = validateWorkflowSchema.parse(args);

    // First, fetch the workflow from n8n
    const workflowResponse = await handleGetWorkflow({ id: input.id });

    if (!workflowResponse.success) {
      return workflowResponse; // Return the error from fetching
    }

    const workflow = workflowResponse.data as Workflow;

    // Create validator instance using the provided repository
    const validator = new WorkflowValidator(
      repository,
      EnhancedConfigValidator
    );

    // Run validation
    const validationResult = await validator.validateWorkflow(
      workflow,
      input.options
    );

    // Format the response (same format as the regular validate_workflow tool)
    const response: any = {
      valid: validationResult.valid,
      workflowId: workflow.id,
      workflowName: workflow.name,
      summary: {
        totalNodes: validationResult.statistics.totalNodes,
        enabledNodes: validationResult.statistics.enabledNodes,
        triggerNodes: validationResult.statistics.triggerNodes,
        validConnections: validationResult.statistics.validConnections,
        invalidConnections: validationResult.statistics.invalidConnections,
        expressionsValidated: validationResult.statistics.expressionsValidated,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length,
      },
    };

    if (validationResult.errors.length > 0) {
      response.errors = validationResult.errors.map((e) => ({
        node: e.nodeName || "workflow",
        message: e.message,
        details: e.details,
      }));
    }

    if (validationResult.warnings.length > 0) {
      response.warnings = validationResult.warnings.map((w) => ({
        node: w.nodeName || "workflow",
        message: w.message,
        details: w.details,
      }));
    }

    if (validationResult.suggestions.length > 0) {
      response.suggestions = validationResult.suggestions;
    }

    return {
      success: true,
      data: response,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Execution Management Handlers

export async function handleTriggerWebhookWorkflow(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = triggerWebhookSchema.parse(args);

    const webhookRequest: WebhookRequest = {
      webhookUrl: input.webhookUrl,
      httpMethod: input.httpMethod || "POST",
      data: input.data,
      headers: input.headers,
      waitForResponse: input.waitForResponse ?? true,
    };

    const response = await client.triggerWebhook(webhookRequest);

    return {
      success: true,
      data: response,
      message: "Webhook triggered successfully",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid input", "VALIDATION_ERROR", { errors: error.errors });
    }

    if (error instanceof N8nApiError) {
      return createErrorResponse(
        getUserFriendlyErrorMessage(error),
        error.code,
        error.details as Record<string, unknown> | undefined
      );
    }

    return createErrorResponse(
      error instanceof Error ? error.message : "Unknown error occurred",
      "UNKNOWN_ERROR"
    );
  }
}

export async function handleGetExecution(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id, includeData } = z
      .object({
        id: z.string(),
        includeData: z.boolean().optional(),
      })
      .parse(args);

    const execution = await client.getExecution(id, includeData || false);

    return {
      success: true,
      data: execution,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleListExecutions(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = listExecutionsSchema.parse(args || {});

    const response = await client.listExecutions({
      limit: input.limit || 100,
      cursor: input.cursor,
      workflowId: input.workflowId,
      projectId: input.projectId,
      status: input.status as ExecutionStatus | undefined,
      includeData: input.includeData || false,
    });

    return {
      success: true,
      data: {
        executions: response.data,
        nextCursor: response.nextCursor,
        total: response.data.length,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleDeleteExecution(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id } = z.object({ id: z.string() }).parse(args);

    await client.deleteExecution(id);

    return {
      success: true,
      message: `Execution ${id} deleted successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleStopExecution(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id } = z.object({ id: z.string() }).parse(args);

    const execution = await client.stopExecution(id);

    return {
      success: true,
      data: execution,
      message: `Execution ${id} stopped successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// System Tools Handlers

export async function handleHealthCheck(): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const health = await client.healthCheck();

    return {
      success: true,
      data: {
        status: health.status,
        instanceId: health.instanceId,
        n8nVersion: health.n8nVersion,
        features: health.features,
        apiUrl: getN8nApiConfig()?.baseUrl,
      },
    };
  } catch (error) {
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
        details: {
          apiUrl: getN8nApiConfig()?.baseUrl,
          hint: "Check if n8n is running and API is enabled",
        },
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleListAvailableTools(): Promise<McpToolResponse> {
  const tools = [
    {
      category: "Workflow Management",
      tools: [
        { name: "n8n_create_workflow", description: "Create new workflows" },
        { name: "n8n_get_workflow", description: "Get workflow by ID" },
        {
          name: "n8n_get_workflow_details",
          description: "Get detailed workflow info with stats",
        },
        {
          name: "n8n_get_workflow_structure",
          description: "Get simplified workflow structure",
        },
        {
          name: "n8n_get_workflow_minimal",
          description: "Get minimal workflow info",
        },
        {
          name: "n8n_update_workflow",
          description: "Update existing workflows",
        },
        { name: "n8n_delete_workflow", description: "Delete workflows" },
        {
          name: "n8n_list_workflows",
          description: "List workflows with filters",
        },
        {
          name: "n8n_activate_workflow",
          description: "Enable/disable workflows",
        },
        {
          name: "n8n_validate_workflow",
          description: "Validate workflow from n8n instance",
        },
      ],
    },
    {
      category: "Execution Management",
      tools: [
        {
          name: "n8n_run_workflow",
          description: "Execute workflows directly via API",
        },
        {
          name: "n8n_trigger_webhook_workflow",
          description: "Trigger workflows via webhook",
        },
        { name: "n8n_get_execution", description: "Get execution details" },
        {
          name: "n8n_list_executions",
          description: "List executions with filters",
        },
        {
          name: "n8n_delete_execution",
          description: "Delete execution records",
        },
        { name: "n8n_stop_execution", description: "Stop running executions" },
      ],
    },
    {
      category: "System",
      tools: [
        { name: "n8n_health_check", description: "Check API connectivity" },
        {
          name: "n8n_list_available_tools",
          description: "List all available tools",
        },
      ],
    },
  ];

  const config = getN8nApiConfig();
  const apiConfigured = config !== null;

  return {
    success: true,
    data: {
      tools,
      apiConfigured,
      configuration: config
        ? {
            apiUrl: config.baseUrl,
            timeout: config.timeout,
            maxRetries: config.maxRetries,
          }
        : null,
      capabilities: [
        "✅ Activate/deactivate workflows via n8n_activate_workflow",
        "✅ Execute workflows directly via n8n_run_workflow (no webhook needed)",
        "✅ Stop running executions via n8n_stop_execution",
        "✅ Full tag management (create, read, update, delete)",
        "✅ Full credential management (create, read, update, delete)",
        "✅ Complete workflow lifecycle: create → validate → deploy → execute → monitor",
      ],
      limitations: [
        "Workflow deployment requires proper validation before activation",
        "Execution data may have size limits depending on n8n instance configuration",
        "Some credential types may have restricted API access (check n8n security settings)",
      ],
    },
  };
}

// Handler: n8n_diagnostic
export async function handleDiagnostic(request: any): Promise<McpToolResponse> {
  const verbose = request.params?.arguments?.verbose || false;

  // Check environment variables
  const envVars = {
    N8N_API_URL: process.env.N8N_API_URL || null,
    N8N_API_KEY: process.env.N8N_API_KEY ? "***configured***" : null,
    NODE_ENV: process.env.NODE_ENV || "production",
    MCP_MODE: process.env.MCP_MODE || "stdio",
  };

  // Check API configuration
  const apiConfig = getN8nApiConfig();
  const apiConfigured = apiConfig !== null;
  const apiClient = getN8nApiClient();

  // Test API connectivity if configured
  let apiStatus = {
    configured: apiConfigured,
    connected: false,
    error: null as string | null,
    version: null as string | null,
  };

  if (apiClient) {
    try {
      const health = await apiClient.healthCheck();
      apiStatus.connected = true;
      apiStatus.version = health.n8nVersion || "unknown";
    } catch (error) {
      apiStatus.error =
        error instanceof Error ? error.message : "Unknown error";
    }
  }

  // Check which tools are available
  const documentationTools = 22; // Base documentation tools
  const managementTools = apiConfigured ? 19 : 0; // Updated: added 3 new tools (activate, run, stop)
  const totalTools = documentationTools + managementTools;

  // Build diagnostic report
  const diagnostic: any = {
    timestamp: new Date().toISOString(),
    environment: envVars,
    apiConfiguration: {
      configured: apiConfigured,
      status: apiStatus,
      config: apiConfig
        ? {
            baseUrl: apiConfig.baseUrl,
            timeout: apiConfig.timeout,
            maxRetries: apiConfig.maxRetries,
          }
        : null,
    },
    toolsAvailability: {
      documentationTools: {
        count: documentationTools,
        enabled: true,
        description: "Always available - node info, search, validation, etc.",
      },
      managementTools: {
        count: managementTools,
        enabled: apiConfigured,
        description: apiConfigured
          ? "Management tools are ENABLED - create, update, execute workflows"
          : "Management tools are DISABLED - configure N8N_API_URL and N8N_API_KEY to enable",
      },
      totalAvailable: totalTools,
    },
    troubleshooting: {
      steps: apiConfigured
        ? [
            "API is configured and should work",
            "If tools are not showing in Claude Desktop:",
            "1. Restart Claude Desktop completely",
            "2. Check if using latest Docker image",
            "3. Verify environment variables are passed correctly",
            "4. Try running n8n_health_check to test connectivity",
          ]
        : [
            "To enable management tools:",
            "1. Set N8N_API_URL environment variable (e.g., https://your-n8n-instance.com)",
            "2. Set N8N_API_KEY environment variable (get from n8n API settings)",
            "3. Restart the MCP server",
            "4. Management tools will automatically appear",
          ],
      documentation:
        "For detailed setup instructions, see: https://github.com/czlonkowski/n8n-mcp#n8n-management-tools-new-v260---requires-api-configuration",
    },
  };

  // Add verbose debug info if requested
  if (verbose) {
    diagnostic["debug"] = {
      processEnv: Object.keys(process.env).filter(
        (key) => key.startsWith("N8N_") || key.startsWith("MCP_")
      ),
      nodeVersion: process.version,
    };
  }

  return {
    success: true,
    data: diagnostic,
  };
}

// Credential Management Handlers

const credentialSchema = z.object({
  name: z.string(),
  type: z.string(),
  data: z.record(z.any()),
});

const updateCredentialSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  data: z.record(z.any()).optional(),
});

export async function handleListCredentials(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = z
      .object({
        limit: z.number().optional(),
        cursor: z.string().optional(),
      })
      .parse(args || {});

    const response = await client.listCredentials(input);

    return {
      success: true,
      data: response,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleGetCredential(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id } = z.object({ id: z.string() }).parse(args);

    const credential = await client.getCredential(id);

    return {
      success: true,
      data: credential,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleCreateCredential(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = credentialSchema.parse(args);

    const credential = await client.createCredential(input);

    return {
      success: true,
      data: credential,
      message: `Credential "${credential.name}" created successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleUpdateCredential(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = updateCredentialSchema.parse(args);
    const { id, ...updateData } = input;

    const credential = await client.updateCredential(id, updateData);

    return {
      success: true,
      data: credential,
      message: `Credential "${credential.name}" updated successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function handleDeleteCredential(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id } = z.object({ id: z.string() }).parse(args);

    await client.deleteCredential(id);

    return {
      success: true,
      message: `Credential ${id} deleted successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input",
        details: { errors: error.errors },
      };
    }
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Workflow Recovery Handler

/**
 * Clean a broken workflow by removing system-managed fields that prevent updates.
 * This is critical for fixing workflows that are corrupted with read-only fields.
 */
export async function handleCleanWorkflow(
  args: unknown,
  repository: NodeRepository
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id } = z.object({ id: z.string() }).parse(args);

    logger.info(`[handleCleanWorkflow] Attempting to clean workflow: ${id}`);

    // Fetch the broken workflow
    const workflow = await client.getWorkflow(id);

    // List of system-managed fields that n8n doesn't allow in API updates
    const systemManagedFields = [
      'id',
      'createdAt',
      'updatedAt',
      'versionId',
      'active',
      'tags',
      'triggerCount',
      'shared',
      'isArchived',
    ];

    // Create a cleaned copy with only allowed fields
    const cleanedWorkflow: Record<string, unknown> = {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
    };

    // Optional fields that are allowed
    if (workflow.settings) {
      cleanedWorkflow.settings = workflow.settings;
    }
    if ((workflow as any).staticData) {
      cleanedWorkflow.staticData = (workflow as any).staticData;
    }
    if ((workflow as any).pinData) {
      cleanedWorkflow.pinData = (workflow as any).pinData;
    }
    if ((workflow as any).meta) {
      cleanedWorkflow.meta = (workflow as any).meta;
    }

    logger.info(
      `[handleCleanWorkflow] Removed ${systemManagedFields.length} system-managed fields`
    );

    // Validate the cleaned workflow
    const validator = new WorkflowValidator(repository, EnhancedConfigValidator);
    const validationResult = await validator.validateWorkflow(cleanedWorkflow as any, {
      validateNodes: true,
      validateConnections: true,
      profile: 'strict',
    });

    if (!validationResult.valid) {
      logger.warn(
        `[handleCleanWorkflow] Cleaned workflow still has validation errors: ${validationResult.errors.length}`
      );

      return {
        success: false,
        error:
          '⚠️ Workflow cleaned but has structural errors that need manual fixing',
        details: {
          cleaned: true,
          systemFieldsRemoved: systemManagedFields,
          errors: validationResult.errors,
          message:
            'The system-managed fields have been identified and removed. However, the workflow has additional structural issues that must be fixed manually.',
          suggestions: validationResult.suggestions,
          validationStats: validationResult.statistics,
        },
      };
    }

    logger.info(
      `[handleCleanWorkflow] Validation passed after cleaning. Safe to update.`
    );

    return {
      success: true,
      data: {
        cleaned: true,
        workflowId: workflow.id,
        workflowName: workflow.name,
        systemFieldsRemoved: systemManagedFields,
        cleanedWorkflow: cleanedWorkflow,
        validationResult: {
          valid: validationResult.valid,
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          statistics: validationResult.statistics,
        },
      },
      message:
        '✅ Workflow cleaned successfully! System-managed fields removed. The workflow is now safe to update via n8n_update_workflow.',
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
