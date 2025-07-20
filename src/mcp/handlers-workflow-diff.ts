/**
 * MCP Handler for Partial Workflow Updates
 * Handles diff-based workflow modifications
 */

import { z } from 'zod';
import { McpToolResponse } from '../types/n8n-api';
import { WorkflowDiffRequest, WorkflowDiffOperation } from '../types/workflow-diff';
import { WorkflowDiffEngine } from '../services/workflow-diff-engine';
import { getN8nApiClient } from './handlers-n8n-manager';
import { N8nApiError, getUserFriendlyErrorMessage } from '../utils/n8n-errors';
import { logger } from '../utils/logger';

// Operation-specific Zod schemas with proper validation
const addNodeSchema = z.object({
  type: z.literal('addNode'),
  description: z.string().optional(),
  node: z.object({
    name: z.string().min(1, 'Node name is required'),
    type: z.string().min(1, 'Node type is required (e.g., n8n-nodes-base.slack)'),
    position: z.tuple([z.number(), z.number()], {
      required_error: 'Node position [x, y] is required',
      invalid_type_error: 'Position must be an array of two numbers'
    }),
    parameters: z.record(z.any()).optional(),
  }, {
    required_error: 'node object is required for addNode operation',
    invalid_type_error: 'node must be an object'
  })
});

const removeNodeSchema = z.object({
  type: z.literal('removeNode'),
  description: z.string().optional(),
  nodeId: z.string().min(1, 'nodeId cannot be empty').optional(),
  nodeName: z.string().min(1, 'nodeName cannot be empty').optional()
}).refine(
  (data) => data.nodeId || data.nodeName,
  { message: 'Either nodeId or nodeName is required for removeNode operation' }
);

const updateNodeSchema = z.object({
  type: z.literal('updateNode'),
  description: z.string().optional(),
  nodeId: z.string().min(1, 'nodeId cannot be empty').optional(),
  nodeName: z.string().min(1, 'nodeName cannot be empty').optional(),
  changes: z.record(z.any()).refine(
    (changes) => Object.keys(changes).length > 0,
    { message: 'changes object must contain at least one property to update' }
  )
}).refine(
  (data) => data.nodeId || data.nodeName,
  { message: 'Either nodeId or nodeName is required for updateNode operation' }
);

const moveNodeSchema = z.object({
  type: z.literal('moveNode'),
  description: z.string().optional(),
  nodeId: z.string().min(1, 'nodeId cannot be empty').optional(),
  nodeName: z.string().min(1, 'nodeName cannot be empty').optional(),
  position: z.tuple([z.number(), z.number()], {
    required_error: 'position [x, y] is required for moveNode operation'
  })
}).refine(
  (data) => data.nodeId || data.nodeName,
  { message: 'Either nodeId or nodeName is required for moveNode operation' }
);

const addConnectionSchema = z.object({
  type: z.literal('addConnection'),
  description: z.string().optional(),
  source: z.string().min(1, 'source node name is required for addConnection operation'),
  target: z.string().min(1, 'target node name is required for addConnection operation'),
  sourceOutput: z.string().optional(),
  targetInput: z.string().optional(),
  sourceOutputIndex: z.number().optional(),
  targetInputIndex: z.number().optional()
});

const removeConnectionSchema = z.object({
  type: z.literal('removeConnection'),
  description: z.string().optional(),
  source: z.string().min(1, 'source node name is required for removeConnection operation'),
  target: z.string().min(1, 'target node name is required for removeConnection operation'),
  sourceOutput: z.string().optional(),
  targetInput: z.string().optional()
});

const enableNodeSchema = z.object({
  type: z.literal('enableNode'),
  description: z.string().optional(),
  nodeId: z.string().min(1, 'nodeId cannot be empty').optional(),
  nodeName: z.string().min(1, 'nodeName cannot be empty').optional()
}).refine(
  (data) => data.nodeId || data.nodeName,
  { message: 'Either nodeId or nodeName is required for enableNode operation' }
);

const disableNodeSchema = z.object({
  type: z.literal('disableNode'),
  description: z.string().optional(),
  nodeId: z.string().min(1, 'nodeId cannot be empty').optional(),
  nodeName: z.string().min(1, 'nodeName cannot be empty').optional()
}).refine(
  (data) => data.nodeId || data.nodeName,
  { message: 'Either nodeId or nodeName is required for disableNode operation' }
);

const updateSettingsSchema = z.object({
  type: z.literal('updateSettings'),
  description: z.string().optional(),
  settings: z.record(z.any()).refine(
    (settings) => Object.keys(settings).length > 0,
    { message: 'settings object must contain at least one property' }
  )
});

const updateNameSchema = z.object({
  type: z.literal('updateName'),
  description: z.string().optional(),
  name: z.string().min(1, 'name is required for updateName operation')
});

const addTagSchema = z.object({
  type: z.literal('addTag'),
  description: z.string().optional(),
  tag: z.string().min(1, 'tag is required for addTag operation')
});

const removeTagSchema = z.object({
  type: z.literal('removeTag'),
  description: z.string().optional(),
  tag: z.string().min(1, 'tag is required for removeTag operation')
});

// Union for all operation types
const operationSchema = z.union([
  addNodeSchema,
  removeNodeSchema,
  updateNodeSchema,
  moveNodeSchema,
  enableNodeSchema,
  disableNodeSchema,
  addConnectionSchema,
  removeConnectionSchema,
  updateSettingsSchema,
  updateNameSchema,
  addTagSchema,
  removeTagSchema
]);

// Main workflow diff schema
const workflowDiffSchema = z.object({
  id: z.string().min(1, 'Workflow ID is required'),
  operations: z.array(operationSchema)
    .min(1, 'At least one operation is required')
    .max(5, 'Maximum 5 operations allowed per request'),
  validateOnly: z.boolean().optional(),
});

export async function handleUpdatePartialWorkflow(args: unknown): Promise<McpToolResponse> {
  try {
    // Debug logging (only in debug mode)
    if (process.env.DEBUG_MCP === 'true') {
      logger.debug('Workflow diff request received', {
        argsType: typeof args,
        hasWorkflowId: args && typeof args === 'object' && 'workflowId' in args,
        operationCount: args && typeof args === 'object' && 'operations' in args ? 
          (args as any).operations?.length : 0
      });
    }
    
    // Validate input
    const input = workflowDiffSchema.parse(args);
    
    // Get API client
    const client = getN8nApiClient();
    if (!client) {
      return {
        success: false,
        error: 'n8n API not configured. Please set N8N_API_URL and N8N_API_KEY environment variables.'
      };
    }
    
    // Fetch current workflow
    let workflow;
    try {
      workflow = await client.getWorkflow(input.id);
    } catch (error) {
      if (error instanceof N8nApiError) {
        return {
          success: false,
          error: getUserFriendlyErrorMessage(error),
          code: error.code
        };
      }
      throw error;
    }
    
    // Apply diff operations
    const diffEngine = new WorkflowDiffEngine();
    const diffResult = await diffEngine.applyDiff(workflow, input as WorkflowDiffRequest);
    
    if (!diffResult.success) {
      return {
        success: false,
        error: 'Failed to apply diff operations',
        details: {
          errors: diffResult.errors,
          operationsApplied: diffResult.operationsApplied
        }
      };
    }
    
    // If validateOnly, return validation result
    if (input.validateOnly) {
      return {
        success: true,
        message: diffResult.message,
        data: {
          valid: true,
          operationsToApply: input.operations.length
        }
      };
    }
    
    // Update workflow via API
    try {
      const updatedWorkflow = await client.updateWorkflow(input.id, diffResult.workflow!);
      
      return {
        success: true,
        data: updatedWorkflow,
        message: `Workflow "${updatedWorkflow.name}" updated successfully. Applied ${diffResult.operationsApplied} operations.`,
        details: {
          operationsApplied: diffResult.operationsApplied,
          workflowId: updatedWorkflow.id,
          workflowName: updatedWorkflow.name
        }
      };
    } catch (error) {
      if (error instanceof N8nApiError) {
        return {
          success: false,
          error: getUserFriendlyErrorMessage(error),
          code: error.code,
          details: error.details as Record<string, unknown> | undefined
        };
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format helpful error messages for AI agents
      const formattedErrors = error.errors.map(err => {
        const path = err.path.join('.');
        const operationIndex = err.path[1];
        
        // Get operation type if available for context
        let operationType = '';
        if (typeof operationIndex === 'number' && args && typeof args === 'object' && 'operations' in args) {
          const operations = (args as any).operations;
          if (Array.isArray(operations) && operations[operationIndex]?.type) {
            operationType = operations[operationIndex].type;
          }
        }
        
        // Create operation-specific error messages
        let helpfulMessage = err.message;
        
        if (operationType) {
          if (operationType === 'addNode' && path.includes('node')) {
            helpfulMessage = `${operationType} operation: ${err.message}. Required: {"type":"addNode","node":{"name":"NodeName","type":"n8n-nodes-base.X","position":[x,y],"parameters":{}}}`;
          } else if (operationType === 'updateNode' && (path.includes('nodeId') || path.includes('nodeName'))) {
            helpfulMessage = `${operationType} operation: ${err.message}. Required: {"type":"updateNode","nodeName":"NodeName","changes":{"parameters.field":"value"}}`;
          } else if (operationType === 'addConnection' && (path.includes('source') || path.includes('target'))) {
            helpfulMessage = `${operationType} operation: ${err.message}. Required: {"type":"addConnection","source":"SourceNode","target":"TargetNode"}`;
          } else {
            helpfulMessage = `${operationType} operation: ${err.message}`;
          }
        }
        
        return {
          path: path,
          message: helpfulMessage,
          operationType: operationType || 'unknown'
        };
      });
      
      // Group errors by operation type for better readability
      const errorsByOperation = formattedErrors.reduce((acc, err) => {
        const key = err.operationType || 'general';
        if (!acc[key]) acc[key] = [];
        acc[key].push(err.message);
        return acc;
      }, {} as Record<string, string[]>);
      
      return {
        success: false,
        error: 'Invalid workflow diff request - missing or invalid required parameters',
        details: {
          errorsByOperation,
          totalErrors: formattedErrors.length,
          hint: 'Each operation type requires specific parameters. Check the tool description for examples.',
          examples: {
            addNode: '{"type":"addNode","node":{"name":"Send Alert","type":"n8n-nodes-base.slack","position":[400,200],"parameters":{"channel":"#alerts"}}}',
            updateNode: '{"type":"updateNode","nodeName":"Webhook","changes":{"parameters.path":"new-path"}}',
            addConnection: '{"type":"addConnection","source":"Webhook","target":"Send Alert"}'
          }
        }
      };
    }
    
    logger.error('Failed to update partial workflow', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

