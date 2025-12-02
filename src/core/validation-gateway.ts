/**
 * Validation Gateway
 *
 * Multi-layer validation that BLOCKS broken workflows from reaching n8n.
 * Every workflow must pass ALL checks before being allowed through.
 *
 * Validation Layers:
 * 1. Schema Validation (Zod) - Structure correct?
 * 2. Node Existence Check - Do these nodes exist in n8n?
 * 3. Connection Integrity - Are connections valid?
 * 4. Credential Check - Are required credentials available?
 * 5. LLM Semantic Check - Does this make sense?
 * 6. n8n Dry Run - Actually test in n8n (create → validate → delete)
 */

import { z } from "zod";
import { logger } from "../utils/logger";
import { getNodeCatalog, NodeCatalog } from "./node-catalog";
import { NodeFilter } from "./node-filter";
import { EventEmitter } from "events";

// ============================================================================
// VALIDATION SCHEMAS (ZOD)
// ============================================================================

const NodePositionSchema = z
  .object({
    x: z.number().optional().default(0),
    y: z.number().optional().default(0),
  })
  .passthrough();

const NodeSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1, "Node name is required"),
    type: z.string().min(1, "Node type is required"),
    typeVersion: z.number().optional(),
    position: z
      .tuple([z.number(), z.number()])
      .or(NodePositionSchema)
      .optional(),
    parameters: z.record(z.any()).optional().default({}),
    credentials: z.record(z.any()).optional(),
    disabled: z.boolean().optional(),
    notes: z.string().optional(),
    notesInFlow: z.boolean().optional(),
    retryOnFail: z.boolean().optional(),
    maxTries: z.number().optional(),
    waitBetweenTries: z.number().optional(),
    continueOnFail: z.boolean().optional(),
    alwaysOutputData: z.boolean().optional(),
    executeOnce: z.boolean().optional(),
  })
  .passthrough();

const ConnectionSchema = z
  .object({
    node: z.string(),
    type: z.string().optional().default("main"),
    index: z.number().optional().default(0),
  })
  .passthrough();

const ConnectionsSchema = z
  .record(
    z
      .object({
        main: z.array(z.array(ConnectionSchema)).optional(),
        ai_tool: z.array(z.array(ConnectionSchema)).optional(),
        ai_agent: z.array(z.array(ConnectionSchema)).optional(),
        ai_memory: z.array(z.array(ConnectionSchema)).optional(),
        ai_outputParser: z.array(z.array(ConnectionSchema)).optional(),
        ai_languageModel: z.array(z.array(ConnectionSchema)).optional(),
        ai_document: z.array(z.array(ConnectionSchema)).optional(),
        ai_embedding: z.array(z.array(ConnectionSchema)).optional(),
        ai_retriever: z.array(z.array(ConnectionSchema)).optional(),
        ai_textSplitter: z.array(z.array(ConnectionSchema)).optional(),
        ai_vectorStore: z.array(z.array(ConnectionSchema)).optional(),
      })
      .passthrough()
  )
  .optional()
  .default({});

const WorkflowSettingsSchema = z
  .object({
    executionOrder: z.enum(["v0", "v1"]).optional(),
    saveExecutionProgress: z.boolean().optional(),
    saveManualExecutions: z.boolean().optional(),
    saveDataErrorExecution: z.enum(["all", "none"]).optional(),
    saveDataSuccessExecution: z.enum(["all", "none"]).optional(),
    executionTimeout: z.number().optional(),
    timezone: z.string().optional(),
    callerPolicy: z.string().optional(),
  })
  .passthrough()
  .optional();

export const WorkflowSchema = z
  .object({
    name: z.string().min(1, "Workflow name is required"),
    nodes: z.array(NodeSchema).min(1, "Workflow must have at least one node"),
    connections: ConnectionsSchema,
    settings: WorkflowSettingsSchema,
    staticData: z.any().optional(),
    pinData: z.record(z.any()).optional(),
    tags: z.array(z.any()).optional(),
    meta: z.any().optional(),
  })
  .passthrough();

export type WorkflowInput = z.infer<typeof WorkflowSchema>;

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

export interface ValidationError {
  layer:
    | "nodeRestrictions"
    | "schema"
    | "nodeExistence"
    | "connections"
    | "credentials"
    | "semantic"
    | "dryRun";
  code: string;
  message: string;
  path?: string;
  suggestion?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  passedLayers: string[];
  failedLayer?: string;
  dryRunId?: string; // ID of workflow created during dry-run (if applicable)
  validationTime: number; // Total validation time in ms
}

export interface GatewayConfig {
  enableDryRun?: boolean; // Test in n8n (default: true)
  enableSemanticCheck?: boolean; // LLM validation (default: true if LLM available)
  strictMode?: boolean; // Fail on warnings too (default: false)
  timeout?: number; // Max validation time in ms (default: 60000)
}

// ============================================================================
// VALIDATION GATEWAY CLASS
// ============================================================================

export class ValidationGateway extends EventEmitter {
  private nodeCatalog: NodeCatalog;
  private n8nUrl: string;
  private apiKey: string;
  private config: Required<GatewayConfig>;
  private llmBrain: any; // Will be set by setLLMBrain()

  constructor(
    nodeCatalog: NodeCatalog,
    n8nUrl: string,
    apiKey: string,
    config: GatewayConfig = {}
  ) {
    super();
    this.nodeCatalog = nodeCatalog;
    this.n8nUrl = n8nUrl;
    this.apiKey = apiKey;
    this.config = {
      enableDryRun: config.enableDryRun ?? true,
      enableSemanticCheck: config.enableSemanticCheck ?? false, // Off by default until LLM is set
      strictMode: config.strictMode ?? false,
      timeout: config.timeout ?? 60000,
    };
  }

  /**
   * Set the LLM brain for semantic validation
   */
  setLLMBrain(llmBrain: any): void {
    this.llmBrain = llmBrain;
    this.config.enableSemanticCheck = true;
    logger.info(
      "[ValidationGateway] LLM brain attached, semantic validation enabled"
    );
  }

  // ==========================================================================
  // MAIN VALIDATION METHOD
  // ==========================================================================

  /**
   * Validate a workflow through all layers
   * Returns ValidationResult with pass/fail status
   *
   * IMPORTANT: This method BLOCKS broken workflows. If valid === false,
   * the workflow should NOT be sent to n8n.
   */
  async validate(workflow: unknown): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const passedLayers: string[] = [];
    let failedLayer: string | undefined;
    let dryRunId: string | undefined;

    logger.info("[ValidationGateway] Starting validation pipeline...");

    try {
      // Layer 0: Node Restriction Policy
      const restrictionResult = this.validateNodeRestrictions(workflow);
      if (!restrictionResult.valid) {
        errors.push(...restrictionResult.errors);
        failedLayer = "nodeRestrictions";
        return this.buildResult(
          false,
          errors,
          warnings,
          passedLayers,
          failedLayer,
          startTime
        );
      }
      passedLayers.push("nodeRestrictions");

      // Layer 1: Schema Validation
      const schemaResult = this.validateSchema(workflow);
      if (!schemaResult.valid) {
        errors.push(...schemaResult.errors);
        failedLayer = "schema";
        return this.buildResult(
          false,
          errors,
          warnings,
          passedLayers,
          failedLayer,
          startTime
        );
      }
      passedLayers.push("schema");
      warnings.push(...schemaResult.warnings);

      const validWorkflow = schemaResult.workflow!;

      // Layer 2: Node Existence Check
      const nodeResult = await this.validateNodeExistence(validWorkflow);
      if (!nodeResult.valid) {
        errors.push(...nodeResult.errors);
        failedLayer = "nodeExistence";
        return this.buildResult(
          false,
          errors,
          warnings,
          passedLayers,
          failedLayer,
          startTime
        );
      }
      passedLayers.push("nodeExistence");
      warnings.push(...nodeResult.warnings);

      // Layer 3: Connection Integrity
      const connectionResult = this.validateConnections(validWorkflow);
      if (!connectionResult.valid) {
        errors.push(...connectionResult.errors);
        failedLayer = "connections";
        return this.buildResult(
          false,
          errors,
          warnings,
          passedLayers,
          failedLayer,
          startTime
        );
      }
      passedLayers.push("connections");
      warnings.push(...connectionResult.warnings);

      // Layer 4: Credential Check
      const credResult = await this.validateCredentials(validWorkflow);
      if (!credResult.valid) {
        errors.push(...credResult.errors);
        failedLayer = "credentials";
        return this.buildResult(
          false,
          errors,
          warnings,
          passedLayers,
          failedLayer,
          startTime
        );
      }
      passedLayers.push("credentials");
      warnings.push(...credResult.warnings);

      // Layer 5: Semantic Check (LLM-powered, if enabled)
      if (this.config.enableSemanticCheck && this.llmBrain) {
        const semanticResult = await this.validateSemantic(validWorkflow);
        if (!semanticResult.valid) {
          errors.push(...semanticResult.errors);
          failedLayer = "semantic";
          return this.buildResult(
            false,
            errors,
            warnings,
            passedLayers,
            failedLayer,
            startTime
          );
        }
        passedLayers.push("semantic");
        warnings.push(...semanticResult.warnings);
      }

      // Layer 6: n8n Dry Run (if enabled)
      if (this.config.enableDryRun) {
        const dryRunResult = await this.validateDryRun(validWorkflow);
        if (!dryRunResult.valid) {
          errors.push(...dryRunResult.errors);
          failedLayer = "dryRun";
          return this.buildResult(
            false,
            errors,
            warnings,
            passedLayers,
            failedLayer,
            startTime,
            dryRunResult.workflowId
          );
        }
        passedLayers.push("dryRun");
        dryRunId = dryRunResult.workflowId;
        warnings.push(...dryRunResult.warnings);
      }

      // All layers passed!
      logger.info(
        `[ValidationGateway] ✅ Workflow passed all ${passedLayers.length} validation layers`
      );
      this.emit("validated", { workflow: validWorkflow, passedLayers });

      return this.buildResult(
        true,
        errors,
        warnings,
        passedLayers,
        undefined,
        startTime,
        dryRunId
      );
    } catch (error: any) {
      logger.error("[ValidationGateway] Validation error:", error);
      errors.push({
        layer: "schema",
        code: "VALIDATION_EXCEPTION",
        message: `Validation failed with exception: ${error.message}`,
      });
      return this.buildResult(
        false,
        errors,
        warnings,
        passedLayers,
        "exception",
        startTime
      );
    }
  }

  /**
   * Convenience method: Validate and return the cleaned workflow or throw
   */
  async validateAndPass(workflow: unknown): Promise<WorkflowInput> {
    const result = await this.validate(workflow);

    if (!result.valid) {
      const errorSummary = result.errors
        .map((e) => `[${e.layer}] ${e.message}`)
        .join("; ");
      throw new Error(`Workflow validation failed: ${errorSummary}`);
    }

    // Return the validated workflow (schema parsing cleans it)
    const parsed = WorkflowSchema.safeParse(workflow);
    if (!parsed.success) {
      throw new Error("Failed to parse validated workflow");
    }

    return parsed.data;
  }

  // ==========================================================================
  // LAYER 0: NODE RESTRICTION POLICY
  // ==========================================================================

  private validateNodeRestrictions(workflow: any): {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    logger.debug("[ValidationGateway] Layer 0: Node restriction policy...");

    const errors: ValidationError[] = [];
    const nodeFilter = NodeFilter.getInstance();

    // Basic structure check before we dive in (full schema check is Layer 1)
    if (!workflow || !Array.isArray(workflow.nodes)) {
      return { valid: true, errors: [], warnings: [] }; // Let Layer 1 handle structure errors
    }

    for (const node of workflow.nodes) {
      if (!node.type) continue;

      if (!nodeFilter.isNodeAllowed(node.type)) {
        const reason = nodeFilter.getRejectionReason(node.type);
        errors.push({
          layer: "nodeRestrictions" as any, // Cast as any if type definition isn't updated yet
          code: "NODE_NOT_ALLOWED",
          message:
            reason || `Node type "${node.type}" is not allowed by policy`,
          path: `nodes.${node.name || "unknown"}`,
          suggestion:
            "Use only official n8n nodes or update policy configuration",
        });
      }
    }

    if (errors.length > 0) {
      logger.debug(
        `[ValidationGateway] Node restriction check failed: ${errors.length} disallowed nodes`
      );
      return { valid: false, errors, warnings: [] };
    }

    logger.debug("[ValidationGateway] Node restriction policy passed");
    return { valid: true, errors: [], warnings: [] };
  }

  // ==========================================================================
  // LAYER 1: SCHEMA VALIDATION
  // ==========================================================================

  private validateSchema(workflow: unknown): {
    valid: boolean;
    workflow?: WorkflowInput;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    logger.debug("[ValidationGateway] Layer 1: Schema validation...");

    const result = WorkflowSchema.safeParse(workflow);

    if (!result.success) {
      const errors: ValidationError[] = result.error.errors.map((e) => ({
        layer: "schema" as const,
        code: "SCHEMA_ERROR",
        message: e.message,
        path: e.path.join("."),
      }));

      logger.debug(
        `[ValidationGateway] Schema validation failed: ${errors.length} errors`
      );
      return { valid: false, errors, warnings: [] };
    }

    const warnings: ValidationWarning[] = [];

    // Check for common issues that are warnings, not errors
    const parsedWorkflow = result.data;

    // Warn if workflow has no trigger node
    const hasTrigger = parsedWorkflow.nodes.some(
      (n) =>
        n.type.toLowerCase().includes("trigger") ||
        n.type.toLowerCase().includes("webhook") ||
        n.type.toLowerCase().includes("schedule") ||
        n.type.toLowerCase().includes("start")
    );
    if (!hasTrigger) {
      warnings.push({
        code: "NO_TRIGGER",
        message:
          "Workflow has no trigger node - it can only be executed manually",
      });
    }

    // Warn if workflow has only one node and it's not self-contained
    if (parsedWorkflow.nodes.length === 1) {
      const node = parsedWorkflow.nodes[0];
      if (!node.type.toLowerCase().includes("webhook")) {
        warnings.push({
          code: "SINGLE_NODE",
          message: "Workflow has only one node - this may be incomplete",
        });
      }
    }

    logger.debug("[ValidationGateway] Schema validation passed");
    return { valid: true, workflow: parsedWorkflow, errors: [], warnings };
  }

  // ==========================================================================
  // LAYER 2: NODE EXISTENCE CHECK
  // ==========================================================================

  private async validateNodeExistence(workflow: WorkflowInput): Promise<{
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  }> {
    logger.debug("[ValidationGateway] Layer 2: Node existence check...");

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Ensure catalog is ready
    if (!this.nodeCatalog.isReady()) {
      warnings.push({
        code: "CATALOG_NOT_READY",
        message: "Node catalog not synced - skipping existence check",
      });
      return { valid: true, errors, warnings };
    }

    for (const node of workflow.nodes) {
      // Skip internal nodes
      if (
        node.type.startsWith("n8n-nodes-base.noOp") ||
        node.type === "n8n-nodes-base.start"
      ) {
        continue;
      }

      if (!this.nodeCatalog.hasNode(node.type)) {
        // Try to find similar nodes for suggestions
        const similar = this.nodeCatalog
          .searchNodes(node.type.split(".").pop() || node.type)
          .slice(0, 3)
          .map((n) => n.name);

        errors.push({
          layer: "nodeExistence",
          code: "NODE_NOT_FOUND",
          message: `Node type "${node.type}" does not exist in this n8n instance`,
          path: `nodes.${node.name}`,
          suggestion:
            similar.length > 0
              ? `Did you mean: ${similar.join(", ")}?`
              : "Check node type spelling or ensure the required package is installed",
        });
      }
    }

    if (errors.length > 0) {
      logger.debug(
        `[ValidationGateway] Node existence check failed: ${errors.length} missing nodes`
      );
      return { valid: false, errors, warnings };
    }

    logger.debug("[ValidationGateway] Node existence check passed");
    return { valid: true, errors: [], warnings };
  }

  // ==========================================================================
  // LAYER 3: CONNECTION INTEGRITY
  // ==========================================================================

  private validateConnections(workflow: WorkflowInput): {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    logger.debug("[ValidationGateway] Layer 3: Connection integrity check...");

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Build a set of valid node names
    const nodeNames = new Set(workflow.nodes.map((n) => n.name));

    // Check all connections reference existing nodes
    for (const [fromNode, outputs] of Object.entries(workflow.connections)) {
      // Check source node exists
      if (!nodeNames.has(fromNode)) {
        errors.push({
          layer: "connections",
          code: "CONNECTION_SOURCE_MISSING",
          message: `Connection source node "${fromNode}" does not exist`,
          path: `connections.${fromNode}`,
        });
        continue;
      }

      // Check all connection types (main, ai_tool, etc.)
      for (const [connType, outputs2] of Object.entries(outputs)) {
        if (!outputs2 || !Array.isArray(outputs2)) continue;

        for (
          let outputIndex = 0;
          outputIndex < outputs2.length;
          outputIndex++
        ) {
          const connections = outputs2[outputIndex];
          if (!Array.isArray(connections)) continue;

          for (const conn of connections) {
            if (!nodeNames.has(conn.node)) {
              errors.push({
                layer: "connections",
                code: "CONNECTION_TARGET_MISSING",
                message: `Connection target node "${conn.node}" does not exist`,
                path: `connections.${fromNode}.${connType}[${outputIndex}]`,
                suggestion: `Available nodes: ${Array.from(nodeNames).join(
                  ", "
                )}`,
              });
            }
          }
        }
      }
    }

    // Warn about orphan nodes (nodes with no connections)
    if (workflow.nodes.length > 1) {
      const connectedNodes = new Set<string>();

      // Collect all nodes that appear in connections
      for (const [fromNode, outputs] of Object.entries(workflow.connections)) {
        connectedNodes.add(fromNode);
        for (const outputs2 of Object.values(outputs)) {
          if (!outputs2 || !Array.isArray(outputs2)) continue;
          for (const conns of outputs2) {
            if (!Array.isArray(conns)) continue;
            for (const conn of conns) {
              connectedNodes.add(conn.node);
            }
          }
        }
      }

      for (const node of workflow.nodes) {
        if (!connectedNodes.has(node.name)) {
          // Check if it's a trigger (triggers don't need incoming connections)
          const isTrigger =
            node.type.toLowerCase().includes("trigger") ||
            node.type.toLowerCase().includes("webhook") ||
            node.type.toLowerCase().includes("schedule");

          if (!isTrigger) {
            warnings.push({
              code: "ORPHAN_NODE",
              message: `Node "${node.name}" has no connections and may not execute`,
              path: `nodes.${node.name}`,
            });
          }
        }
      }
    }

    if (errors.length > 0) {
      logger.debug(
        `[ValidationGateway] Connection check failed: ${errors.length} errors`
      );
      return { valid: false, errors, warnings };
    }

    logger.debug("[ValidationGateway] Connection integrity check passed");
    return { valid: true, errors: [], warnings };
  }

  // ==========================================================================
  // LAYER 4: CREDENTIAL CHECK
  // ==========================================================================

  private async validateCredentials(workflow: WorkflowInput): Promise<{
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  }> {
    logger.debug("[ValidationGateway] Layer 4: Credential check...");

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const node of workflow.nodes) {
      if (!node.credentials) continue;

      // Get node type info to check required credentials
      const nodeInfo = this.nodeCatalog.getNode(node.type);
      if (!nodeInfo?.credentials) continue;

      for (const cred of nodeInfo.credentials) {
        if (cred.required) {
          const credName = cred.name;
          const hasCredential = node.credentials[credName] !== undefined;

          if (!hasCredential) {
            errors.push({
              layer: "credentials",
              code: "CREDENTIAL_MISSING",
              message: `Node "${node.name}" requires credential "${credName}" but none is configured`,
              path: `nodes.${node.name}.credentials.${credName}`,
              suggestion: `Add a "${credName}" credential to this node`,
            });
          } else {
            // Check if credential type exists
            if (!this.nodeCatalog.hasCredentialType(credName)) {
              warnings.push({
                code: "CREDENTIAL_TYPE_UNKNOWN",
                message: `Credential type "${credName}" not found in catalog`,
                path: `nodes.${node.name}.credentials.${credName}`,
              });
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      logger.debug(
        `[ValidationGateway] Credential check failed: ${errors.length} errors`
      );
      return { valid: false, errors, warnings };
    }

    logger.debug("[ValidationGateway] Credential check passed");
    return { valid: true, errors: [], warnings };
  }

  // ==========================================================================
  // LAYER 5: SEMANTIC VALIDATION (LLM-POWERED)
  // ==========================================================================

  private async validateSemantic(workflow: WorkflowInput): Promise<{
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  }> {
    logger.debug("[ValidationGateway] Layer 5: Semantic validation...");

    const warnings: ValidationWarning[] = [];

    if (!this.llmBrain) {
      warnings.push({
        code: "LLM_NOT_AVAILABLE",
        message: "LLM not configured - skipping semantic validation",
      });
      return { valid: true, errors: [], warnings };
    }

    try {
      // Ask the LLM to analyze the workflow for logical issues
      const analysis = await this.llmBrain.analyzeWorkflowLogic(workflow);

      if (analysis.issues && analysis.issues.length > 0) {
        // Convert LLM issues to warnings (not blocking errors)
        for (const issue of analysis.issues) {
          warnings.push({
            code: "SEMANTIC_ISSUE",
            message: issue.message || issue,
            path: issue.path,
          });
        }
      }

      logger.debug("[ValidationGateway] Semantic validation passed");
      return { valid: true, errors: [], warnings };
    } catch (error: any) {
      logger.warn(
        "[ValidationGateway] Semantic validation error:",
        error.message
      );
      warnings.push({
        code: "SEMANTIC_ERROR",
        message: `Semantic validation failed: ${error.message}`,
      });
      return { valid: true, errors: [], warnings }; // Don't block on LLM errors
    }
  }

  // ==========================================================================
  // LAYER 6: DRY RUN (ACTUAL n8n TEST)
  // ==========================================================================

  private async validateDryRun(workflow: WorkflowInput): Promise<{
    valid: boolean;
    workflowId?: string;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  }> {
    logger.debug("[ValidationGateway] Layer 6: n8n dry run...");

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const axios = (await import("axios")).default;

      // Prepare workflow for creation
      const testWorkflow = {
        name: `__validation_test_${Date.now()}`,
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings,
        active: false, // Never activate test workflows
      };

      // Try to create the workflow
      const baseUrl = this.n8nUrl.replace(/\/$/, "");
      const apiUrl = `${baseUrl}/api/v1`;

      const response = await axios.post(`${apiUrl}/workflows`, testWorkflow, {
        headers: {
          "X-N8N-API-KEY": this.apiKey,
          "Content-Type": "application/json",
        },
        timeout: 30000,
        validateStatus: () => true, // Don't throw on error status
      });

      if (response.status >= 400) {
        // Extract n8n error message
        const errorMsg =
          response.data?.message ||
          response.data?.error?.message ||
          JSON.stringify(response.data);

        errors.push({
          layer: "dryRun",
          code: "N8N_REJECTED",
          message: `n8n rejected workflow: ${errorMsg}`,
          suggestion: "Check the error message for specific issues",
        });

        return { valid: false, errors, warnings };
      }

      // Success! Clean up the test workflow
      const workflowId = response.data?.id;

      if (workflowId) {
        try {
          await axios.delete(`${apiUrl}/workflows/${workflowId}`, {
            headers: { "X-N8N-API-KEY": this.apiKey },
            timeout: 10000,
          });
          logger.debug(
            `[ValidationGateway] Cleaned up test workflow ${workflowId}`
          );
        } catch (deleteError) {
          warnings.push({
            code: "CLEANUP_FAILED",
            message: `Failed to delete test workflow ${workflowId} - manual cleanup may be needed`,
          });
        }
      }

      logger.debug("[ValidationGateway] n8n dry run passed");
      return { valid: true, workflowId, errors: [], warnings };
    } catch (error: any) {
      errors.push({
        layer: "dryRun",
        code: "DRY_RUN_ERROR",
        message: `Dry run failed: ${error.message}`,
      });
      return { valid: false, errors, warnings };
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private buildResult(
    valid: boolean,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    passedLayers: string[],
    failedLayer: string | undefined,
    startTime: number,
    dryRunId?: string
  ): ValidationResult {
    const result: ValidationResult = {
      valid,
      errors,
      warnings,
      passedLayers,
      failedLayer,
      dryRunId,
      validationTime: Date.now() - startTime,
    };

    if (!valid) {
      logger.warn(
        `[ValidationGateway] ❌ Validation failed at layer: ${failedLayer}`
      );
      this.emit("validationFailed", result);
    }

    return result;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let gatewayInstance: ValidationGateway | null = null;

export function getValidationGateway(): ValidationGateway {
  if (!gatewayInstance) {
    const catalog = getNodeCatalog();
    const n8nUrl = process.env.N8N_API_URL || "http://localhost:5678";
    const apiKey = process.env.N8N_API_KEY || "";

    gatewayInstance = new ValidationGateway(catalog, n8nUrl, apiKey);
  }
  return gatewayInstance;
}

export function initValidationGateway(
  nodeCatalog: NodeCatalog,
  n8nUrl: string,
  apiKey: string,
  config?: GatewayConfig
): ValidationGateway {
  gatewayInstance = new ValidationGateway(nodeCatalog, n8nUrl, apiKey, config);
  return gatewayInstance;
}
