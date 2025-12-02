import { z } from "zod";
import { WorkflowNode, WorkflowConnection, Workflow } from "../types/n8n-api";
import { APISchemaLoader } from "../ai/knowledge/api-schema-loader";
import { logger } from "../utils/logger";
import {
  NodeParameterValidator,
  ParameterValidationResult,
} from "./node-parameter-validator";
import { NodeRepository } from "../database/node-repository";

// Zod schemas for n8n API validation

export const workflowNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  typeVersion: z.number(),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.unknown()),
  // ❌ REMOVED credentials field - n8n UI breaks when this exists!
  // The API docs claim it's required, but working workflows have NO credentials field
  disabled: z.boolean().optional(),
  notes: z.string().optional(),
  notesInFlow: z.boolean().optional(),
  continueOnFail: z.boolean().optional(),
  retryOnFail: z.boolean().optional(),
  maxTries: z.number().optional(),
  waitBetweenTries: z.number().optional(),
  alwaysOutputData: z.boolean().optional(),
  executeOnce: z.boolean().optional(),
});

export const workflowConnectionSchema = z.record(
  z.record(
    z.string(), // Allow any connection type (main, ai_tool, ai_memory, etc.)
    z.array(
      z.array(
        z.object({
          node: z.string(),
          type: z.string(),
          index: z.number(),
        })
      )
    )
  )
);

export const workflowSettingsSchema = z.object({
  executionOrder: z.enum(["v0", "v1"]).default("v1"),
  timezone: z.string().optional(),
  saveDataErrorExecution: z.enum(["all", "none"]).default("all"),
  saveDataSuccessExecution: z.enum(["all", "none"]).default("all"),
  saveManualExecutions: z.boolean().default(true),
  saveExecutionProgress: z.boolean().default(true),
  executionTimeout: z.number().optional(),
  errorWorkflow: z.string().optional(),
});

// Default settings for workflow creation
export const defaultWorkflowSettings = {
  executionOrder: "v1" as const,
  saveDataErrorExecution: "all" as const,
  saveDataSuccessExecution: "all" as const,
  saveManualExecutions: true,
  saveExecutionProgress: true,
};

// Validation functions
export function validateWorkflowNode(node: unknown): WorkflowNode {
  return workflowNodeSchema.parse(node);
}

export function validateWorkflowConnections(
  connections: unknown
): WorkflowConnection {
  return workflowConnectionSchema.parse(connections);
}

export function validateWorkflowSettings(
  settings: unknown
): z.infer<typeof workflowSettingsSchema> {
  return workflowSettingsSchema.parse(settings);
}

// Clean workflow data for API operations
export function cleanWorkflowForCreate(
  workflow: Partial<Workflow>
): Partial<Workflow> {
  const {
    // Remove read-only fields
    id,
    createdAt,
    updatedAt,
    versionId,
    meta,
    // Remove fields that cause API errors during creation
    active,
    tags,
    // Keep everything else
    ...cleanedWorkflow
  } = workflow;

  // CRITICAL FIX: Clean nodes to match n8n UI requirements
  if (cleanedWorkflow.nodes) {
    cleanedWorkflow.nodes = cleanedWorkflow.nodes.map((node: any) => {
      const fixedNode: any = { ...node };

      // ❌ CRITICAL: REMOVE credentials field - n8n UI breaks when this exists!
      // The API docs are WRONG - working workflows have NO credentials field
      if (fixedNode.credentials !== undefined) {
        delete fixedNode.credentials;
      }

      // ✅ NEVER include webhookId (n8n server generates this)
      if (fixedNode.webhookId) {
        delete fixedNode.webhookId;
      }

      // ✅ Enforce correct typeVersions for nodes that commonly break
      if (node.type === "n8n-nodes-base.httpRequest") {
        // HTTP Request MUST be v4.2 (not v5!) with minimal parameters
        fixedNode.typeVersion = 4.2;
        fixedNode.parameters = { options: {} };
      }

      if (node.type === "n8n-nodes-base.switch") {
        // Switch MUST be v3.2 (not v1!) with correct parameter structure
        if (fixedNode.typeVersion < 3) {
          fixedNode.typeVersion = 3.2;
          // Convert old v1 parameter structure to v3.2 if needed
          if (fixedNode.parameters?.rules?.values) {
            fixedNode.parameters = {
              rules: {
                values: fixedNode.parameters.rules.values.map(
                  (rule: any, idx: number) => ({
                    conditions: {
                      options: {
                        caseSensitive: true,
                        leftValue: "",
                        typeValidation: "strict",
                        version: 2,
                      },
                      conditions:
                        rule.conditions?.string?.map(
                          (cond: any, condIdx: number) => ({
                            leftValue: cond.value1 || "",
                            rightValue: cond.value2 || "",
                            operator: {
                              type: "string",
                              operation: cond.operation || "equals",
                            },
                            id: `cond_${idx}_${condIdx}`,
                          })
                        ) || [],
                      combinator: "and",
                    },
                  })
                ),
              },
              options: {},
            };
          }
        }
      }

      return fixedNode;
    });
  }

  // Ensure settings are present with defaults
  if (!cleanedWorkflow.settings) {
    cleanedWorkflow.settings = defaultWorkflowSettings;
  }

  return cleanedWorkflow;
}

export function cleanWorkflowForUpdate(workflow: Workflow): Partial<Workflow> {
  const {
    // Remove read-only/system-managed fields
    id,
    createdAt,
    updatedAt,
    versionId,
    meta,
    tags,
    // Remove additional fields that n8n API doesn't accept
    isArchived,
    usedCredentials,
    sharedWithProjects,
    triggerCount,
    shared,
    active, // Active is managed via separate activation endpoint, not update endpoint
    // NOTE: Allow these fields for updates
    // - staticData: User-settable node state
    // - pinData: User-settable pinned execution data
    // Keep everything else
    ...cleanedWorkflow
  } = workflow as any;

  // CRITICAL FIX: Clean nodes to match n8n UI requirements
  if (cleanedWorkflow.nodes) {
    cleanedWorkflow.nodes = cleanedWorkflow.nodes.map((node: any) => {
      const fixedNode: any = { ...node };

      // ❌ CRITICAL: REMOVE credentials field - n8n UI breaks when this exists!
      // The API docs are WRONG - working workflows have NO credentials field
      if (fixedNode.credentials !== undefined) {
        delete fixedNode.credentials;
      }

      // ✅ NEVER include webhookId (n8n server generates this)
      if (fixedNode.webhookId) {
        delete fixedNode.webhookId;
      }

      // ✅ Enforce correct typeVersions for nodes that commonly break
      if (node.type === "n8n-nodes-base.httpRequest") {
        // HTTP Request MUST be v4.2 (not v5!) with minimal parameters
        fixedNode.typeVersion = 4.2;
        fixedNode.parameters = { options: {} };
      }

      if (node.type === "n8n-nodes-base.switch") {
        // Switch MUST be v3.2 (not v1!) with correct parameter structure
        if (fixedNode.typeVersion < 3) {
          fixedNode.typeVersion = 3.2;
          // Convert old v1 parameter structure to v3.2 if needed
          if (fixedNode.parameters?.rules?.values) {
            fixedNode.parameters = {
              rules: {
                values: fixedNode.parameters.rules.values.map(
                  (rule: any, idx: number) => ({
                    conditions: {
                      options: {
                        caseSensitive: true,
                        leftValue: "",
                        typeValidation: "strict",
                        version: 2,
                      },
                      conditions:
                        rule.conditions?.string?.map(
                          (cond: any, condIdx: number) => ({
                            leftValue: cond.value1 || "",
                            rightValue: cond.value2 || "",
                            operator: {
                              type: "string",
                              operation: cond.operation || "equals",
                            },
                            id: `cond_${idx}_${condIdx}`,
                          })
                        ) || [],
                      combinator: "and",
                    },
                  })
                ),
              },
              options: {},
            };
          }
        }
      }

      return fixedNode;
    });
  }

  // Ensure settings are present
  if (!cleanedWorkflow.settings) {
    cleanedWorkflow.settings = defaultWorkflowSettings;
  }

  return cleanedWorkflow;
}

// Validate workflow structure
export function validateWorkflowStructure(
  workflow: Partial<Workflow>
): string[] {
  const errors: string[] = [];

  // Check required fields
  if (!workflow.name) {
    errors.push("Workflow name is required");
  }

  if (!workflow.nodes || workflow.nodes.length === 0) {
    errors.push("Workflow must have at least one node");
  }

  if (!workflow.connections) {
    errors.push("Workflow connections are required");
  }

  // Check for minimum viable workflow
  if (workflow.nodes && workflow.nodes.length === 1) {
    const singleNode = workflow.nodes[0];
    const isWebhookOnly =
      singleNode.type === "n8n-nodes-base.webhook" ||
      singleNode.type === "n8n-nodes-base.webhookTrigger";

    if (!isWebhookOnly) {
      errors.push(
        "Single-node workflows are only valid for webhooks. Add at least one more node and connect them. Example: Manual Trigger → Set node"
      );
    }
  }

  // Check for empty connections in multi-node workflows
  if (workflow.nodes && workflow.nodes.length > 1 && workflow.connections) {
    const connectionCount = Object.keys(workflow.connections).length;

    if (connectionCount === 0) {
      errors.push(
        'Multi-node workflow has empty connections. Connect nodes like this: connections: { "Node1 Name": { "main": [[{ "node": "Node2 Name", "type": "main", "index": 0 }]] } }'
      );
    }
  }

  // Validate nodes
  if (workflow.nodes) {
    workflow.nodes.forEach((node, index) => {
      try {
        validateWorkflowNode(node);

        // Additional check for common node type mistakes
        if (node.type.startsWith("nodes-base.")) {
          errors.push(
            `Invalid node type "${
              node.type
            }" at index ${index}. Use "n8n-nodes-base.${node.type.substring(
              11
            )}" instead.`
          );
        } else if (!node.type.includes(".")) {
          errors.push(
            `Invalid node type "${node.type}" at index ${index}. Node types must include package prefix (e.g., "n8n-nodes-base.webhook").`
          );
        }
      } catch (error) {
        errors.push(
          `Invalid node at index ${index}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    });
  }

  // Validate connections
  if (workflow.connections) {
    try {
      validateWorkflowConnections(workflow.connections);
    } catch (error) {
      errors.push(
        `Invalid connections: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Validate that all connection references exist and use node NAMES (not IDs)
  if (workflow.nodes && workflow.connections) {
    const nodeNames = new Set(workflow.nodes.map((node) => node.name));
    const nodeIds = new Set(workflow.nodes.map((node) => node.id));
    const nodeIdToName = new Map(
      workflow.nodes.map((node) => [node.id, node.name])
    );

    Object.entries(workflow.connections).forEach(([sourceName, connection]) => {
      // Check if source exists by name (correct)
      if (!nodeNames.has(sourceName)) {
        // Check if they're using an ID instead of name
        if (nodeIds.has(sourceName)) {
          const correctName = nodeIdToName.get(sourceName);
          errors.push(
            `Connection uses node ID '${sourceName}' but must use node name '${correctName}'. Change connections.${sourceName} to connections['${correctName}']`
          );
        } else {
          errors.push(`Connection references non-existent node: ${sourceName}`);
        }
      }

      // Iterate over all connection types (main, ai_tool, ai_memory, etc.)
      Object.values(connection).forEach((outputs: any) => {
        if (!Array.isArray(outputs)) return;

        outputs.forEach((outputList: any, outputIndex: number) => {
          if (!Array.isArray(outputList)) return;

          outputList.forEach((target: any, targetIndex: number) => {
            // Check if target exists by name (correct)
            if (!nodeNames.has(target.node)) {
              // Check if they're using an ID instead of name
              if (nodeIds.has(target.node)) {
                const correctName = nodeIdToName.get(target.node);
                errors.push(
                  `Connection target uses node ID '${target.node}' but must use node name '${correctName}' (from ${sourceName})`
                );
              } else {
                errors.push(
                  `Connection references non-existent target node: ${target.node} (from ${sourceName})`
                );
              }
            }
          });
        });
      });
    });
  }

  return errors;
}

// Check if workflow has webhook trigger
export function hasWebhookTrigger(workflow: Workflow): boolean {
  return workflow.nodes.some(
    (node) =>
      node.type === "n8n-nodes-base.webhook" ||
      node.type === "n8n-nodes-base.webhookTrigger"
  );
}

// Get webhook URL from workflow
export function getWebhookUrl(workflow: Workflow): string | null {
  const webhookNode = workflow.nodes.find(
    (node) =>
      node.type === "n8n-nodes-base.webhook" ||
      node.type === "n8n-nodes-base.webhookTrigger"
  );

  if (!webhookNode || !webhookNode.parameters) {
    return null;
  }

  // Check for path parameter
  const path = webhookNode.parameters.path as string | undefined;
  if (!path) {
    return null;
  }

  // Note: We can't construct the full URL without knowing the n8n instance URL
  // The caller will need to prepend the base URL
  return path;
}

// Helper function to generate proper workflow structure examples
export function getWorkflowStructureExample(): string {
  return `
Minimal Workflow Example:
{
  "name": "My Workflow",
  "nodes": [
    {
      "id": "manual-trigger-1",
      "name": "Manual Trigger",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [250, 300],
      "parameters": {}
    },
    {
      "id": "set-1",
      "name": "Set Data",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [450, 300],
      "parameters": {
        "mode": "manual",
        "assignments": {
          "assignments": [{
            "id": "1",
            "name": "message",
            "value": "Hello World",
            "type": "string"
          }]
        }
      }
    }
  ],
  "connections": {
    "Manual Trigger": {
      "main": [[{
        "node": "Set Data",
        "type": "main",
        "index": 0
      }]]
    }
  }
}

IMPORTANT: In connections, use the node NAME (e.g., "Manual Trigger"), NOT the node ID or type!`;
}

// Helper function to fix common workflow issues
export function getWorkflowFixSuggestions(errors: string[]): string[] {
  const suggestions: string[] = [];

  if (errors.some((e) => e.includes("empty connections"))) {
    suggestions.push(
      "Add connections between your nodes. Each node (except endpoints) should connect to another node."
    );
    suggestions.push(
      'Connection format: connections: { "Source Node Name": { "main": [[{ "node": "Target Node Name", "type": "main", "index": 0 }]] } }'
    );
  }

  if (errors.some((e) => e.includes("Single-node workflows"))) {
    suggestions.push(
      "Add at least one more node to process data. Common patterns: Trigger → Process → Output"
    );
    suggestions.push(
      "Examples: Manual Trigger → Set, Webhook → HTTP Request, Schedule Trigger → Database Query"
    );
  }

  if (
    errors.some(
      (e) => e.includes("node ID") && e.includes("instead of node name")
    )
  ) {
    suggestions.push(
      "Replace node IDs with node names in connections. The name is what appears in the node header."
    );
    suggestions.push(
      'Wrong: connections: { "set-1": {...} }, Right: connections: { "Set Data": {...} }'
    );
  }

  return suggestions;
}

/**
 * Validate workflow request size to prevent API failures
 * n8n has practical limits on request size (typically 1-2 MB depending on instance configuration)
 * This ensures workflows don't exceed reasonable limits
 */
export function validateWorkflowSize(
  workflow: Partial<Workflow>,
  maxSizeMB: number = 1
): { valid: boolean; error?: string; sizeKB?: number } {
  try {
    const json = JSON.stringify(workflow);
    const sizeKB = Buffer.byteLength(json, "utf8") / 1024;
    const sizeMB = sizeKB / 1024;

    if (sizeMB > maxSizeMB) {
      return {
        valid: false,
        error: `Workflow exceeds size limit. Current: ${sizeMB.toFixed(
          2
        )}MB, Max: ${maxSizeMB}MB. Reduce node count or parameter complexity.`,
        sizeKB,
      };
    }

    return { valid: true, sizeKB };
  } catch (error) {
    // If JSON serialization fails, the workflow has circular references or other issues
    return {
      valid: false,
      error: "Workflow contains invalid data that cannot be serialized",
    };
  }
}

/**
 * Enhanced workflow cleaning with API schema compliance
 * Removes system-managed fields AND fixes common API issues
 */
export function cleanAndFixWorkflowForCreate(workflow: any): {
  cleaned: Partial<Workflow>;
  fixed: string[];
} {
  const fixes: string[] = [];
  let cleaned = cleanWorkflowForCreate(workflow);

  // Fix nodes with API schema validation
  if (cleaned.nodes && Array.isArray(cleaned.nodes)) {
    cleaned.nodes = cleaned.nodes.map((node: any) => {
      const fixedNode = { ...node };

      // ❌ REMOVED: credentials check - cleanWorkflowForCreate already removes this field
      // The n8n UI BREAKS when credentials field exists!

      // Add missing typeVersion
      if (!fixedNode.typeVersion && fixedNode.typeVersion !== 0) {
        fixedNode.typeVersion = 1;
        fixes.push(`✅ Added typeVersion: 1 to node '${node.name}'`);
      }

      // Fix node type format - add package prefix if missing
      if (fixedNode.type && !fixedNode.type.includes(".")) {
        fixedNode.type = `n8n-nodes-base.${fixedNode.type}`;
        fixes.push(
          `✅ Fixed node type for '${node.name}': added package prefix`
        );
      }
      // Fix incomplete prefix
      else if (fixedNode.type && fixedNode.type.startsWith("nodes-base.")) {
        fixedNode.type = `n8n-${fixedNode.type}`;
        fixes.push(
          `✅ Fixed node type for '${node.name}': corrected incomplete prefix`
        );
      }

      // Ensure parameters object exists
      if (!fixedNode.parameters || typeof fixedNode.parameters !== "object") {
        fixedNode.parameters = {};
        fixes.push(`✅ Added missing parameters object to node '${node.name}'`);
      }

      return fixedNode;
    });
  }

  return { cleaned, fixed: fixes };
}

/**
 * Enhanced workflow update cleaning with API schema compliance
 */
export function cleanAndFixWorkflowForUpdate(workflow: any): {
  cleaned: Partial<Workflow>;
  fixed: string[];
} {
  const fixes: string[] = [];
  let cleaned = cleanWorkflowForUpdate(workflow as any);

  // Fix nodes with API schema validation
  if (cleaned.nodes && Array.isArray(cleaned.nodes)) {
    cleaned.nodes = cleaned.nodes.map((node: any) => {
      const fixedNode = { ...node };

      // ❌ REMOVED: credentials check - cleanWorkflowForUpdate already removes this field
      // The n8n UI BREAKS when credentials field exists!

      // Add missing typeVersion
      if (!fixedNode.typeVersion && fixedNode.typeVersion !== 0) {
        fixedNode.typeVersion = 1;
        fixes.push(`✅ Added typeVersion: 1 to node '${node.name}'`);
      }

      // Fix node type format - add package prefix if missing
      if (fixedNode.type && !fixedNode.type.includes(".")) {
        fixedNode.type = `n8n-nodes-base.${fixedNode.type}`;
        fixes.push(
          `✅ Fixed node type for '${node.name}': added package prefix`
        );
      }
      // Fix incomplete prefix
      else if (fixedNode.type && fixedNode.type.startsWith("nodes-base.")) {
        fixedNode.type = `n8n-${fixedNode.type}`;
        fixes.push(
          `✅ Fixed node type for '${node.name}': corrected incomplete prefix`
        );
      }

      // Ensure parameters object exists
      if (!fixedNode.parameters || typeof fixedNode.parameters !== "object") {
        fixedNode.parameters = {};
        fixes.push(`✅ Added missing parameters object to node '${node.name}'`);
      }

      return fixedNode;
    });
  }

  return { cleaned, fixed: fixes };
}

/**
 * CRITICAL: Validate node parameters against MCP database schemas
 *
 * This function prevents the fatal flaw where workflows pass API validation
 * but fail to load in n8n UI due to missing required parameters.
 *
 * MUST be called BEFORE sending workflows to n8n API.
 */
export async function validateNodeParameters(
  workflow: Partial<Workflow>,
  repository: NodeRepository
): Promise<ParameterValidationResult> {
  const validator = new NodeParameterValidator(repository);

  if (!workflow.nodes || workflow.nodes.length === 0) {
    return {
      valid: false,
      errors: [
        {
          nodeName: "workflow",
          nodeType: "workflow",
          parameter: "nodes",
          error: "Workflow has no nodes",
          suggestion: "Add at least one node to the workflow",
        },
      ],
    };
  }

  logger.info("[validateNodeParameters] Validating workflow node parameters", {
    nodeCount: workflow.nodes.length,
  });

  const result = await validator.validateWorkflow(workflow.nodes);

  if (!result.valid) {
    logger.error("[validateNodeParameters] Parameter validation failed", {
      errorCount: result.errors.length,
      errors: result.errors,
    });
  } else {
    logger.info("[validateNodeParameters] All node parameters valid");
  }

  return result;
}
