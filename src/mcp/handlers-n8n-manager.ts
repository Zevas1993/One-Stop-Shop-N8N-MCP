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
  cleanWorkflowForCreate,
  cleanWorkflowForUpdate,
  validateNodeParameters,
} from "../services/n8n-validation";
import {
  N8nApiError,
  N8nNotFoundError,
  getUserFriendlyErrorMessage,
  createErrorResponse,
} from "../utils/n8n-errors";
import { logger } from "../utils/logger";
import { z } from "zod";
import { NodeRepository } from "../database/node-repository";
import { validationCache } from "../utils/validation-cache";
import {
  getAgentGeneratedWorkflow,
  recordWorkflowCreation,
  recordExecutionError,
} from "../mcp/handler-shared-memory";
import { validateWorkflowUnified } from "../mcp/unified-validation";
import { getN8nLiveValidator } from "../services/n8n-live-validator";
import { WorkflowSemanticValidator } from "../services/workflow-semantic-validator";

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

/**
 * Check if credentials referenced by workflow nodes actually exist on the n8n instance.
 * Returns an array of warning strings (empty if all credentials found or check fails silently).
 */
async function checkCredentialExistence(
  client: N8nApiClient,
  nodes: any[]
): Promise<string[]> {
  const warnings: string[] = [];
  try {
    // Collect all credential type references from nodes
    const referencedCreds: Record<string, string[]> = {}; // credType -> nodeNames[]
    for (const node of nodes) {
      if (node.credentials && typeof node.credentials === "object") {
        for (const credType of Object.keys(node.credentials)) {
          if (!referencedCreds[credType]) {
            referencedCreds[credType] = [];
          }
          referencedCreds[credType].push(node.name || node.type);
        }
      }
    }

    const credTypes = Object.keys(referencedCreds);
    if (credTypes.length === 0) return warnings;

    // Fetch available credentials from n8n instance
    const available = await client.listCredentials();
    const availableList = Array.isArray(available) ? available : (available as any)?.data || [];
    const availableTypes: Record<string, boolean> = {};
    for (const c of availableList) {
      if ((c as any).type) availableTypes[(c as any).type] = true;
    }

    // Check each referenced credential type
    for (const credType of credTypes) {
      if (!availableTypes[credType]) {
        warnings.push(
          `- Credential type "${credType}" (used by: ${referencedCreds[credType].join(", ")}) not found on n8n instance. Nodes will fail at runtime until this credential is configured.`
        );
      }
    }
  } catch (err) {
    // Silently ignore — credential check is non-blocking
    logger.debug("[checkCredentialExistence] Failed to check credentials", err);
  }
  return warnings;
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
  useAgentGeneratedWorkflow: z.boolean().optional().default(false),
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
  const startTime = Date.now();

  try {
    const client = ensureApiConfigured();
    const input = createWorkflowSchema.parse(args);

    // Only use agent-generated workflow from SharedMemory when explicitly requested
    let workflowInput = input;
    if ((input as any).useAgentGeneratedWorkflow) {
      const agentWorkflow = await getAgentGeneratedWorkflow();
      if (agentWorkflow) {
        logger.info(
          "[handleCreateWorkflow] Using agent-generated workflow from SharedMemory (explicitly requested)"
        );
        workflowInput = agentWorkflow;
      }
    }

    // Check workflow size to prevent API failures
    const sizeValidation = validateWorkflowSize(workflowInput, 1); // 1MB limit
    if (!sizeValidation.valid) {
      await recordExecutionError(
        `workflow_creation:${input.name}`,
        sizeValidation.error || "Workflow too large",
        "validation",
        { sizeKB: sizeValidation.sizeKB }
      );
      return createErrorResponse(
        sizeValidation.error || "Workflow too large",
        "WORKFLOW_SIZE_ERROR",
        {
          sizeKB: sizeValidation.sizeKB,
        }
      );
    }

    // CRITICAL: Validate node parameters against MCP database BEFORE sending to n8n
    // This prevents workflows that pass API validation but fail to load in n8n UI
    logger.info('[handleCreateWorkflow] Validating node parameters against MCP database');
    const paramValidation = await validateNodeParameters(workflowInput, repository);

    if (!paramValidation.valid) {
      logger.error('[handleCreateWorkflow] Node parameter validation failed', {
        errors: paramValidation.errors
      });

      await recordExecutionError(
        `workflow_creation:${(workflowInput as any).name || "unknown"}`,
        `Parameter validation failed with ${paramValidation.errors.length} errors`,
        'validation',
        {
          errors: paramValidation.errors
        }
      );

      return {
        success: false,
        error: '🚨 PARAMETER VALIDATION FAILED: Workflow has missing/invalid node parameters',
        details: {
          errors: paramValidation.errors.map(e => ({
            node: e.nodeName,
            type: e.nodeType,
            parameter: e.parameter,
            error: e.error,
            suggestion: e.suggestion
          })),
          message: 'Fix all parameter errors before creating workflow. These parameters are required for n8n UI to load the workflow.',
          preventedBrokenWorkflow: true,
          workflow: '1️⃣ Fix missing parameters → 2️⃣ Retry n8n_create_workflow'
        }
      };
    }

    logger.info('[handleCreateWorkflow] Node parameter validation passed');

    // SEMANTIC VALIDATION: Enforce "Built-in Nodes First" policy
    // Guide agents to use n8n's 525+ built-in nodes instead of over-relying on Code nodes
    logger.info('[handleCreateWorkflow] Running semantic validation (built-in nodes first policy)');
    const semanticValidator = new WorkflowSemanticValidator(repository);
    const semanticResult = await semanticValidator.validateWorkflow(workflowInput as any);

    // Log semantic analysis
    if (process.env.DEBUG_MCP === 'true' || semanticResult.score < 60) {
      logger.info(semanticValidator.getSummary(semanticResult));
    }

    // If semantic score is too low, provide strong guidance (but don't block)
    if (semanticResult.score < 60) {
      logger.warn(`[handleCreateWorkflow] ⚠️  Semantic validation score low: ${semanticResult.score}/100`);
      logger.warn('[handleCreateWorkflow] Workflow over-relies on Code nodes instead of built-in nodes');

      // Add semantic warnings to workflow metadata for agent feedback
      if (semanticResult.warnings.length > 0 || semanticResult.suggestions.length > 0) {
        logger.warn('[handleCreateWorkflow] Semantic Issues:');
        semanticResult.warnings.forEach(w => logger.warn(`   ${w.message}`));
        semanticResult.suggestions.slice(0, 3).forEach(s => logger.warn(`   💡 ${s.message}`));
      }
    } else {
      logger.info(`[handleCreateWorkflow] ✅ Semantic validation passed (score: ${semanticResult.score}/100)`);
    }

    // ENFORCE VALIDATION REQUIREMENT - Check validation cache first
    // Issue #4: Validation-Execution Gap - Check if workflow has been validated
    const validationStatus = validationCache.isValidatedAndValid(workflowInput);

    // If not in cache, run full validation immediately
    if (!validationStatus.validated) {
      logger.info(
        "[handleCreateWorkflow] Workflow not in validation cache, running validation via unified system"
      );

      // PHASE 3 INTEGRATION: Use unified validation system (single point of truth)
      // Issue #4: Validate nodes, connections, and expressions BEFORE sending to API
      const validationResult = await validateWorkflowUnified(
        workflowInput as any,
        repository,
        {
          validateNodes: true,
          validateConnections: true,
          validateExpressions: true, // Issue #4: Also validate DSL expressions
          profile: "runtime",
        }
      );

      if (!validationResult.valid) {
        // Record the invalid validation result in cache for next time
        validationCache.recordValidation(workflowInput, {
          valid: false,
          errors: validationResult.errors,
          warnings: validationResult.warnings || [],
        });

        // PHASE 2 INTEGRATION: Record error for agent feedback
        await recordExecutionError(
          `workflow_creation:${(workflowInput as any).name || "unknown"}`,
          `Validation failed with ${validationResult.errors.length} errors`,
          "validation",
          {
            errors: validationResult.errors,
            warnings: validationResult.warnings,
          }
        );

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
      validationCache.recordValidation(workflowInput, {
        valid: true,
        errors: [],
        warnings: validationResult.warnings || [],
      });
    } else if (!validationStatus.valid) {
      // Issue #4: Validation was cached as invalid - prevent creation
      // It was in cache but marked invalid
      await recordExecutionError(
        `workflow_creation:${(workflowInput as any).name || "unknown"}`,
        "Workflow has cached validation errors",
        "validation",
        { cachedErrors: validationStatus.errors }
      );

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

    // LIVE VALIDATION: Validate against the actual n8n instance before creation
    const liveValidator = getN8nLiveValidator();
    if (liveValidator) {
      logger.info(
        "[handleCreateWorkflow] Running live n8n validation before creation"
      );
      const liveValidationResult = await liveValidator.validateWorkflow(
        workflowInput
      );

      if (!liveValidationResult.valid) {
        // RECORD TO GRAPHRAG: Store validation failures for agents to learn from
        await recordExecutionError(
          `workflow_creation:${(workflowInput as any).name || "unknown"}`,
          `Live n8n validation failed with ${liveValidationResult.errors.length} errors`,
          "validation",
          {
            workflowName: (workflowInput as any).name,
            workflowNodes: (workflowInput as any).nodes?.length || 0,
            validationErrors: liveValidationResult.errors,
            source: "n8n-instance-live-validation",
          }
        );

        return {
          success: false,
          error:
            "🚨 LIVE VALIDATION FAILED: Workflow would not work in n8n. Errors from n8n instance:",
          details: {
            errors: liveValidationResult.errors,
            message: "Fix all errors listed above and retry",
            source: "n8n-instance",
          },
        };
      }

      logger.info("[handleCreateWorkflow] Live validation passed");
    }

    // Additional basic validation (keep existing for safety)
    const errors = validateWorkflowStructure(workflowInput);
    if (errors.length > 0) {
      await recordExecutionError(
        `workflow_creation:${(workflowInput as any).name || "unknown"}`,
        "Workflow structure validation failed",
        "validation",
        { structureErrors: errors }
      );
      return createErrorResponse(
        "Workflow validation failed",
        "WORKFLOW_STRUCTURE_ERROR",
        { errors }
      );
    }

    // Credential existence check (non-blocking — warns but doesn't prevent creation)
    const credentialWarnings = await checkCredentialExistence(client, (workflowInput as any).nodes || []);

    // Issue #4: Validation-Execution Gap - Validation has been completed above
    // All nodes, connections, and expressions have been validated against live n8n
    // This API call proceeds with confidence that the workflow is valid
    const workflow = await client.createWorkflow(workflowInput);

    // PHASE 2 INTEGRATION: Record successful workflow creation for agent feedback
    if (workflow.id) {
      await recordWorkflowCreation(
        workflow.id,
        workflow.name || "Unknown",
        true, // success
        undefined, // no error
        Date.now() - startTime
      );
    }

    const credWarningMsg = credentialWarnings.length > 0
      ? `\n\n⚠️ Credential warnings:\n${credentialWarnings.join("\n")}`
      : "";

    return {
      success: true,
      data: workflow,
      message: `Workflow "${workflow.name}" created successfully with ID: ${workflow.id}${credWarningMsg}`,
    };
  } catch (error) {
    // PHASE 2 INTEGRATION: Record error for agent feedback
    if (error instanceof z.ZodError) {
      await recordExecutionError(
        `workflow_creation:unknown`,
        "Input validation failed (Zod schema error)",
        "validation",
        { errors: error.errors }
      );
      return createErrorResponse("Invalid input", "VALIDATION_ERROR", {
        errors: error.errors,
      });
    }

    if (error instanceof N8nApiError) {
      await recordExecutionError(
        `workflow_creation:${(args as any)?.name || "unknown"}`,
        error.message,
        "api",
        { code: error.code, details: error.details }
      );
      return createErrorResponse(
        getUserFriendlyErrorMessage(error),
        error.code,
        error.details as Record<string, unknown> | undefined
      );
    }

    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    await recordExecutionError(
      `workflow_creation:${(args as any)?.name || "unknown"}`,
      errorMsg,
      "unknown",
      { stack: error instanceof Error ? error.stack : undefined }
    );

    return createErrorResponse(errorMsg, "UNKNOWN_ERROR");
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
    const { id, ...flatFields } = input;

    // Normalize: accept both flat fields and 'changes' wrapper (backward compat)
    // server-modern.ts passes { id, ...changes } so flat fields work too
    const updateData: Record<string, any> = {};
    if (flatFields.name !== undefined) updateData.name = flatFields.name;
    if (flatFields.nodes !== undefined) updateData.nodes = flatFields.nodes;
    if (flatFields.connections !== undefined) updateData.connections = flatFields.connections;
    if (flatFields.settings !== undefined) updateData.settings = flatFields.settings;

    // ALWAYS fetch the current workflow — guarantees all 4 required fields are present
    // This fixes: name-only updates, settings-only updates, and partial updates
    logger.info(`[handleUpdateWorkflow] Fetching current workflow ${id}`);
    const current = await client.getWorkflow(id);

    // Merge changes onto current workflow (changes take priority)
    const merged: any = {
      name: updateData.name ?? current.name,
      nodes: updateData.nodes ?? current.nodes,
      connections: updateData.connections ?? current.connections,
      settings: updateData.settings ?? (current as any).settings ?? {},
    };

    // CLEAN FIRST — strip all forbidden fields via allowlist before any validation
    // This prevents false rejections from validators seeing read-only fields
    let cleanedWorkflow = cleanWorkflowForUpdate(merged as any);

    // Check workflow size to prevent API failures
    const sizeValidation = validateWorkflowSize(cleanedWorkflow, 1); // 1MB limit
    if (!sizeValidation.valid) {
      return createErrorResponse(
        sizeValidation.error || "Workflow too large",
        "WORKFLOW_SIZE_ERROR",
        { sizeKB: sizeValidation.sizeKB }
      );
    }

    // Validate node parameters against MCP database
    if (cleanedWorkflow.nodes) {
      logger.info('[handleUpdateWorkflow] Validating node parameters against MCP database');
      const paramValidation = await validateNodeParameters(cleanedWorkflow, repository);

      if (!paramValidation.valid) {
        logger.error('[handleUpdateWorkflow] Node parameter validation failed', {
          errors: paramValidation.errors
        });

        await recordExecutionError(
          `workflow_update:${id}`,
          `Parameter validation failed with ${paramValidation.errors.length} errors`,
          'validation',
          { errors: paramValidation.errors }
        );

        return {
          success: false,
          error: 'PARAMETER VALIDATION FAILED: Workflow has missing/invalid node parameters',
          details: {
            errors: paramValidation.errors.map(e => ({
              node: e.nodeName,
              type: e.nodeType,
              parameter: e.parameter,
              error: e.error,
              suggestion: e.suggestion
            })),
            message: 'Fix all parameter errors before updating workflow.',
            preventedBrokenWorkflow: true,
          }
        };
      }

      logger.info('[handleUpdateWorkflow] Node parameter validation passed');

      // SEMANTIC VALIDATION: Enforce "Built-in Nodes First" policy
      logger.info('[handleUpdateWorkflow] Running semantic validation');
      const semanticValidator = new WorkflowSemanticValidator(repository);
      const semanticResult = await semanticValidator.validateWorkflow(cleanedWorkflow as any);

      if (process.env.DEBUG_MCP === 'true' || semanticResult.score < 60) {
        logger.info(semanticValidator.getSummary(semanticResult));
      }

      if (semanticResult.score < 60) {
        logger.warn(`[handleUpdateWorkflow] Semantic validation score low: ${semanticResult.score}/100`);
        if (semanticResult.warnings.length > 0 || semanticResult.suggestions.length > 0) {
          semanticResult.warnings.forEach(w => logger.warn(`   ${w.message}`));
          semanticResult.suggestions.slice(0, 3).forEach(s => logger.warn(`   ${s.message}`));
        }
      } else {
        logger.info(`[handleUpdateWorkflow] Semantic validation passed (score: ${semanticResult.score}/100)`);
      }

      // STRUCTURE VALIDATION: Validate node types and connections locally (no API calls).
      // NOTE: We use validateWorkflowStructure, NOT validateWorkflow, because the latter
      // creates a throwaway POST /workflows on n8n which is wrong for updates and creates ghost workflows.
      const liveValidator = getN8nLiveValidator();
      if (liveValidator) {
        logger.info("[handleUpdateWorkflow] Running structure validation");
        const liveValidationResult = await liveValidator.validateWorkflowStructure(cleanedWorkflow as any);

        if (!liveValidationResult.valid) {
          const namingGuidance: string[] = [];
          for (const error of liveValidationResult.errors) {
            if (error.includes('Connection from unknown source node')) {
              const match = error.match(/Connection from unknown source node: "([^"]+)"/);
              if (match) {
                const wrongId = match[1];
                namingGuidance.push(
                  `CRITICAL NODE NAMING ERROR: You referenced node "${wrongId}" in connections, but this node doesn't exist in the workflow.`
                );
                namingGuidance.push(
                  `RULE: In n8n workflows, connections must use the EXACT node NAME, NOT internal IDs.`
                );
              }
            }
          }

          await recordExecutionError(
            `workflow_update:${id}`,
            `Live n8n validation failed with ${liveValidationResult.errors.length} errors`,
            "validation",
            {
              workflowId: id,
              workflowNodes: cleanedWorkflow?.nodes?.length || 0,
              validationErrors: liveValidationResult.errors,
              namingGuidance: namingGuidance.length > 0 ? namingGuidance : undefined,
              source: "n8n-instance-live-validation",
            }
          );

          return {
            success: false,
            error: "LIVE VALIDATION FAILED: Update would create a broken workflow.",
            details: {
              errors: liveValidationResult.errors,
              namingGuidance: namingGuidance.length > 0 ? namingGuidance : undefined,
              message: "Fix all errors listed above and retry",
              source: "n8n-instance",
            },
          };
        }

        logger.info("[handleUpdateWorkflow] Live validation passed");
      }

      // Structure validation
      const errors = validateWorkflowStructure(cleanedWorkflow);
      if (errors.length > 0) {
        return createErrorResponse(
          "Workflow validation failed",
          "WORKFLOW_STRUCTURE_ERROR",
          { errors }
        );
      }
    }

    // Credential existence check (non-blocking — warns but doesn't prevent update)
    const nodesForCredCheck = cleanedWorkflow?.nodes || [];
    const credentialWarnings = await checkCredentialExistence(client, nodesForCredCheck);

    logger.info(`[handleUpdateWorkflow] Sending fields to n8n: ${Object.keys(cleanedWorkflow).join(', ')}`);

    const workflow = await client.updateWorkflow(id, cleanedWorkflow);

    const credWarningMsg = credentialWarnings.length > 0
      ? `\n\nCredential warnings:\n${credentialWarnings.join("\n")}`
      : "";

    return {
      success: true,
      data: workflow,
      message: `Workflow "${workflow.name}" updated successfully${credWarningMsg}`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid input", "VALIDATION_ERROR", {
        errors: error.errors,
      });
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

// Utility: parse a dot-notation path into segments, supporting array indices like "items[0].name"
function parsePath(path: string): (string | number)[] {
  const segments: (string | number)[] = [];
  for (const part of path.split('.')) {
    const match = part.match(/^([^[]*)\[(\d+)\]$/);
    if (match) {
      if (match[1]) segments.push(match[1]);
      segments.push(parseInt(match[2], 10));
    } else {
      segments.push(part);
    }
  }
  return segments;
}

// Utility: set a nested value using dot-notation path with array index support
function setNestedValue(obj: any, path: string, value: any): void {
  const segments = parsePath(path);
  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const nextKey = segments[i + 1];
    if (current[key] === undefined || current[key] === null) {
      current[key] = typeof nextKey === 'number' ? [] : {};
    }
    current = current[key];
  }
  current[segments[segments.length - 1]] = value;
}

const patchWorkflowSchema = z.object({
  id: z.string(),
  nodeName: z.string(),
  parameterPath: z.string(),
  value: z.any(),
});

export async function handlePatchWorkflow(
  args: unknown
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id, nodeName, parameterPath, value } = patchWorkflowSchema.parse(args);

    // Fetch the current workflow
    const wf = await client.getWorkflow(id);
    const node = (wf as any).nodes?.find((n: any) => n.name === nodeName);
    if (!node) {
      return createErrorResponse(
        `Node "${nodeName}" not found in workflow. Available nodes: ${(wf as any).nodes?.map((n: any) => n.name).join(', ') || 'none'}`,
        "NODE_NOT_FOUND"
      );
    }

    // Set the nested value on the node
    setNestedValue(node, parameterPath, value);

    // Build explicit 4-field payload (same pattern as handleUpdateWorkflow)
    // Do NOT pass raw GET response — it contains pinData: {} and other fields
    // that leak through cleanWorkflowForUpdate and cause additionalProperties rejection
    const payload = {
      name: (wf as any).name,
      nodes: (wf as any).nodes,
      connections: (wf as any).connections,
      settings: (wf as any).settings ?? {},
    };
    const cleaned = cleanWorkflowForUpdate(payload as any);
    const workflow = await client.updateWorkflow(id, cleaned);

    return {
      success: true,
      data: { nodeName, parameterPath, value },
      message: `Set ${nodeName}.${parameterPath} = ${JSON.stringify(value)} in workflow "${workflow.name}"`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid input", "VALIDATION_ERROR", {
        errors: error.errors,
      });
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

    // VALIDATE AGAINST LIVE N8N INSTANCE
    // Get the live validator to validate against the actual n8n instance
    const liveValidator = getN8nLiveValidator();

    // Use live validation against n8n instance
    logger.info(
      "[handleValidateWorkflow] Validating workflow against live n8n instance"
    );
    const liveValidationResult = await liveValidator.validateWorkflow(workflow);

    // If live validation failed, return the actual n8n errors
    if (!liveValidationResult.valid) {
      // RECORD TO GRAPHRAG: Store validation failures for agents to learn from
      await recordExecutionError(
        `workflow_validation:${workflow.id}`,
        `n8n validation failed with ${liveValidationResult.errors.length} errors`,
        "validation",
        {
          workflowId: workflow.id,
          workflowName: workflow.name,
          validationErrors: liveValidationResult.errors,
          source: "n8n-instance-live-validation",
        }
      );

      return {
        success: true,
        data: {
          valid: false,
          workflowId: workflow.id,
          workflowName: workflow.name,
          errors: liveValidationResult.errors.map((err) => ({
            message: err,
            source: "n8n-instance",
          })),
          warnings: liveValidationResult.warnings || [],
          note: "Validation result from live n8n instance - this is what n8n itself reported",
        },
      };
    }

    // Live validation passed
    return {
      success: true,
      data: {
        valid: true,
        workflowId: workflow.id,
        workflowName: workflow.name,
        message:
          "Workflow validation passed against live n8n instance",
        source: "n8n-instance",
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
      return createErrorResponse("Invalid input", "VALIDATION_ERROR", {
        errors: error.errors,
      });
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

// ============================================================
// TAG MANAGEMENT HANDLERS
// ============================================================

export async function handleListTags(args: unknown): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = z.object({
      limit: z.number().optional(),
      cursor: z.string().optional(),
    }).parse(args || {});

    const response = await client.listTags(input);
    return {
      success: true,
      data: response,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input', details: { errors: error.errors } };
    }
    if (error instanceof N8nApiError) {
      return { success: false, error: getUserFriendlyErrorMessage(error), code: error.code };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function handleCreateTag(args: unknown): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { name } = z.object({ name: z.string() }).parse(args);
    const tag = await client.createTag({ name });
    return { success: true, data: tag, message: `Tag "${tag.name}" created successfully` };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input', details: { errors: error.errors } };
    }
    if (error instanceof N8nApiError) {
      return { success: false, error: getUserFriendlyErrorMessage(error), code: error.code };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function handleUpdateTag(args: unknown): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id, name } = z.object({ id: z.string(), name: z.string() }).parse(args);
    const tag = await client.updateTag(id, { name });
    return { success: true, data: tag, message: `Tag updated successfully` };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input', details: { errors: error.errors } };
    }
    if (error instanceof N8nApiError) {
      return { success: false, error: getUserFriendlyErrorMessage(error), code: error.code };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function handleDeleteTag(args: unknown): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id } = z.object({ id: z.string() }).parse(args);
    await client.deleteTag(id);
    return { success: true, message: `Tag ${id} deleted successfully` };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input', details: { errors: error.errors } };
    }
    if (error instanceof N8nApiError) {
      return { success: false, error: getUserFriendlyErrorMessage(error), code: error.code };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

// ============================================================
// VARIABLE MANAGEMENT HANDLERS
// ============================================================

export async function handleGetVariables(args: unknown): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const variables = await client.getVariables();
    return {
      success: true,
      data: {
        variables,
        total: variables.length,
        note: 'These are instance-level variables accessible in all workflows via $vars.variableName',
      },
    };
  } catch (error) {
    if (error instanceof N8nApiError) {
      return { success: false, error: getUserFriendlyErrorMessage(error), code: error.code };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function handleCreateVariable(args: unknown): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = z.object({
      key: z.string(),
      value: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'secret']).optional(),
    }).parse(args);

    const variable = await client.createVariable(input as any);
    return {
      success: true,
      data: variable,
      message: `Variable "${input.key}" created. Access in workflows via $vars.${input.key}`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input', details: { errors: error.errors } };
    }
    if (error instanceof N8nApiError) {
      return { success: false, error: getUserFriendlyErrorMessage(error), code: error.code };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function handleUpdateVariable(args: unknown): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = z.object({
      id: z.string(),
      key: z.string().optional(),
      value: z.string(),
    }).parse(args);
    const { id, ...updateData } = input;
    const variable = await client.updateVariable(id, updateData as any);
    return { success: true, data: variable, message: `Variable updated successfully` };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input', details: { errors: error.errors } };
    }
    if (error instanceof N8nApiError) {
      return { success: false, error: getUserFriendlyErrorMessage(error), code: error.code };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function handleDeleteVariable(args: unknown): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { id } = z.object({ id: z.string() }).parse(args);
    await client.deleteVariable(id);
    return { success: true, message: `Variable ${id} deleted successfully` };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input', details: { errors: error.errors } };
    }
    if (error instanceof N8nApiError) {
      return { success: false, error: getUserFriendlyErrorMessage(error), code: error.code };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

// ============================================================
// SOURCE CONTROL HANDLERS (Enterprise)
// ============================================================

export async function handleGetSourceControlStatus(args: unknown): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const status = await client.getSourceControlStatus();
    return { success: true, data: status };
  } catch (error) {
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
        details: { note: 'Source control requires n8n Enterprise with Git integration configured' },
      };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function handlePullSourceControl(args: unknown): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const { force } = z.object({ force: z.boolean().optional() }).parse(args || {});
    const result = await client.pullSourceControl(force || false);
    return { success: true, data: result, message: 'Source control pull completed' };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input', details: { errors: error.errors } };
    }
    if (error instanceof N8nApiError) {
      return { success: false, error: getUserFriendlyErrorMessage(error), code: error.code };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export async function handlePushSourceControl(args: unknown): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = z.object({
      message: z.string(),
      fileNames: z.array(z.string()).optional(),
    }).parse(args);
    const result = await client.pushSourceControl(input.message, input.fileNames);
    return { success: true, data: result, message: 'Source control push completed' };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input', details: { errors: error.errors } };
    }
    if (error instanceof N8nApiError) {
      return { success: false, error: getUserFriendlyErrorMessage(error), code: error.code };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

// ============================================================
// WORKFLOW DUPLICATE HANDLER
// ============================================================

export async function handleDuplicateWorkflow(args: unknown): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = z.object({
      id: z.string(),
      newName: z.string().optional(),
    }).parse(args);

    // Fetch the original workflow
    const original = await client.getWorkflow(input.id);

    // Use allowlist-based cleaner to strip all system/read-only fields
    // The denylist approach misses fields like activeVersionId, versionCounter, etc.
    const cleaned = cleanWorkflowForCreate(original as any) as any;
    cleaned.name = input.newName || `${original.name} (Copy)`;

    // Create the duplicate (inactive by default)
    const duplicate = await client.createWorkflow(cleaned as any);

    return {
      success: true,
      data: {
        original: { id: original.id, name: original.name },
        duplicate: { id: duplicate.id, name: duplicate.name },
      },
      message: `Workflow duplicated successfully. New workflow: "${duplicate.name}" (ID: ${duplicate.id})`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input', details: { errors: error.errors } };
    }
    if (error instanceof N8nApiError) {
      return { success: false, error: getUserFriendlyErrorMessage(error), code: error.code };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

// ============================================================
// LIVE NODE DISCOVERY HANDLER
// ============================================================

/**
 * Discover what nodes are actually installed in the connected n8n instance.
 * Uses a 3-step strategy:
 * 1. Try n8n's internal /rest/node-types endpoint (most authoritative)
 * 2. Fall back to local SQLite database (built from n8n-nodes-base npm package)
 * 3. Scan existing workflows to find community nodes not in the built-in catalog
 */
export async function handleListInstalledNodes(
  args: unknown,
  repository: any
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured();
    const input = z.object({
      includeDetails: z.boolean().optional(),
      detectCommunity: z.boolean().optional(),
    }).parse(args || {});

    const result: any = {
      strategy_used: [] as string[],
      n8n_version: null as string | null,
      builtin_nodes: [] as any[],
      community_nodes: [] as string[],
      total_builtin: 0,
      total_community: 0,
    };

    // Step 0: Get n8n version from health check
    try {
      const health = await client.healthCheck();
      result.n8n_version = (health as any).n8nVersion || null;
    } catch {
      result.n8n_version = null;
    }

    // Step 1: Try live /rest/node-types endpoint
    const liveNodes = await client.getInstalledNodeTypes(input.includeDetails || false);
    if (liveNodes && liveNodes.length > 0) {
      result.strategy_used.push('live_api (/rest/node-types)');
      result.builtin_nodes = liveNodes.map((n: any) => ({
        type: n.name || n.type || n,
        displayName: n.displayName || n.name || n,
        category: n.group?.[0] || 'unknown',
        isAI: (n.group || []).includes('transform') || (n.codex?.categories || []).includes('AI'),
        isTrigger: (n.group || []).includes('trigger'),
      }));
      result.total_builtin = result.builtin_nodes.length;
    } else {
      // Step 2: Fall back to local SQLite database
      result.strategy_used.push('local_database (SQLite)');
      try {
        const dbNodes = repository.searchNodes('');
        result.builtin_nodes = (dbNodes || []).map((n: any) => ({
          type: n.nodeType || n.type,
          displayName: n.displayName || n.name,
          category: n.category || 'unknown',
          isAI: (n.category || '').toLowerCase().includes('ai') ||
                (n.nodeType || '').includes('langchain'),
          isTrigger: (n.nodeType || '').toLowerCase().includes('trigger'),
        }));
        result.total_builtin = result.builtin_nodes.length;
        result.db_version = await repository.getDbVersion?.() || 'unknown';
        result.db_note = result.n8n_version && result.db_version !== result.n8n_version
          ? `⚠️ DB built for n8n ${result.db_version}, connected instance is ${result.n8n_version}. Run node_discovery resync to update.`
          : '✅ Database appears current';
      } catch (dbError) {
        result.strategy_used.push('database_error');
        result.db_error = dbError instanceof Error ? dbError.message : String(dbError);
      }
    }

    // Step 3: Community node detection via workflow scan (optional, default off for speed)
    if (input.detectCommunity !== false) {
      try {
        const builtinTypes = new Set(result.builtin_nodes.map((n: any) => n.type));
        const workflows = await client.listWorkflows({ limit: 100 });
        const communityTypes = new Set<string>();

        for (const wf of workflows.data || []) {
          const full = await client.getWorkflow(wf.id!);
          for (const node of full.nodes || []) {
            if (node.type && !builtinTypes.has(node.type) &&
                !node.type.startsWith('n8n-nodes-base.') &&
                !node.type.startsWith('@n8n/') &&
                node.type !== 'n8n-nodes-langchain') {
              communityTypes.add(node.type);
            }
          }
        }

        result.community_nodes = Array.from(communityTypes);
        result.total_community = result.community_nodes.length;
        if (result.community_nodes.length > 0) {
          result.strategy_used.push('workflow_scan (community nodes detected)');
        }
      } catch (scanError) {
        result.community_scan_error = scanError instanceof Error ? scanError.message : String(scanError);
      }
    }

    return {
      success: true,
      data: result,
      message: `Found ${result.total_builtin} built-in nodes and ${result.total_community} community nodes in n8n ${result.n8n_version || 'unknown version'}`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input', details: { errors: error.errors } };
    }
    if (error instanceof N8nApiError) {
      return { success: false, error: getUserFriendlyErrorMessage(error), code: error.code };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

// ============================================================
// WORKFLOW RECOVERY HANDLER
// ============================================================

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
      "id",
      "createdAt",
      "updatedAt",
      "versionId",
      "active",
      "tags",
      "triggerCount",
      "shared",
      "isArchived",
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

    // Validate the cleaned workflow using unified system
    // PHASE 3 INTEGRATION: Use unified validation system (single point of truth)
    const validationResult = await validateWorkflowUnified(
      cleanedWorkflow as any,
      repository,
      {
        validateNodes: true,
        validateConnections: true,
        profile: "strict",
      }
    );

    if (!validationResult.valid) {
      logger.warn(
        `[handleCleanWorkflow] Cleaned workflow still has validation errors: ${validationResult.errors.length}`
      );

      return {
        success: false,
        error:
          "⚠️ Workflow cleaned but has structural errors that need manual fixing",
        details: {
          cleaned: true,
          systemFieldsRemoved: systemManagedFields,
          errors: validationResult.errors,
          message:
            "The system-managed fields have been identified and removed. However, the workflow has additional structural issues that must be fixed manually.",
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
        "✅ Workflow cleaned successfully! System-managed fields removed. The workflow is now safe to update via n8n_update_workflow.",
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
