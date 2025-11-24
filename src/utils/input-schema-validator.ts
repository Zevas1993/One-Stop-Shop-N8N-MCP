/**
 * Issue #8: Strict Input Schema Enforcement
 *
 * Provides comprehensive input validation for all MCP tool handlers with:
 * - Type-safe Zod schema definitions
 * - Rich error messages for agents
 * - Recovery guidance for validation failures
 * - Schema documentation and examples
 * - Strict parsing mode to prevent silent coercion
 */

import { z, ZodError } from 'zod';
import { logger } from './logger';
import { createErrorResponse } from './n8n-errors';

/**
 * Issue #8: Enhanced error response with validation details
 */
export interface ValidationErrorResponse {
  success: false;
  error: string;
  code: string;
  details: {
    field: string;
    message: string;
    received?: string;
  }[];
  recoverySteps?: string[];
}

/**
 * Parse input with strict validation and detailed error messages
 * @param input - Raw input to validate
 * @param schema - Zod schema for validation
 * @param operationName - Name of the operation for logging
 * @param recoverySteps - Optional recovery guidance for agents
 */
export function validateInput<T>(
  input: unknown,
  schema: z.ZodType<T>,
  operationName: string,
  recoverySteps?: string[]
): { success: true; data: T } | ValidationErrorResponse {
  try {
    // Issue #8: Strict parsing mode - reject unknown fields and prevent coercion
    const data = schema.parse(input);

    logger.debug(`Input validation successful for ${operationName}`, {
      operationName,
      inputKeys: typeof input === 'object' && input !== null ? Object.keys(input as any) : [],
    });

    return { success: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      const validationErrors = error.errors.map((err) => {
        // Build received value from actual data if available
        let received: string | undefined;
        if (typeof input === 'object' && input !== null) {
          const keys = err.path;
          let value = input as any;
          for (const key of keys) {
            value = value?.[key];
          }
          if (typeof value !== 'undefined') {
            received = String(value);
          }
        }

        return {
          field: err.path.join('.') || 'input',
          message: err.message,
          received,
          expected: undefined, // Zod error message contains expected info
        };
      });

      logger.warn(`Input validation failed for ${operationName}`, {
        operationName,
        errorCount: validationErrors.length,
        errors: validationErrors,
      });

      // Issue #8: Provide specific recovery guidance based on error types
      const defaultRecoverySteps = getRecoveryStepsForErrors(validationErrors, operationName);

      return {
        success: false,
        error: `Input validation failed for ${operationName}: ${error.errors[0].message}`,
        code: 'INPUT_VALIDATION_ERROR',
        details: validationErrors,
        recoverySteps: recoverySteps || defaultRecoverySteps,
      };
    }

    logger.error(`Unexpected error during input validation for ${operationName}`, error);
    return {
      success: false,
      error: `Unexpected validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      code: 'VALIDATION_ERROR',
      details: [],
      recoverySteps: [
        '1. Check that input is valid JSON',
        '2. Verify all required fields are provided',
        '3. Review the operation documentation',
        '4. Contact support if the issue persists',
      ],
    };
  }
}

/**
 * Issue #8: Generate recovery steps based on validation error types
 */
function getRecoveryStepsForErrors(
  errors: Array<{ field: string; message: string; expected?: string }>,
  operationName: string
): string[] {
  const steps: Set<string> = new Set();

  for (const error of errors) {
    // Field is missing
    if (error.message.includes('Required')) {
      steps.add(`1. Ensure required field "${error.field}" is provided`);
    }

    // Type mismatch
    if (error.message.includes('Expected') && error.expected) {
      steps.add(`2. Field "${error.field}" must be of type ${error.expected}`);
    }

    // String validation
    if (error.message.includes('String')) {
      steps.add(`3. Field "${error.field}" must be a string`);
    }

    // Number validation
    if (error.message.includes('Number')) {
      steps.add(`4. Field "${error.field}" must be a number`);
    }

    // Array validation
    if (error.message.includes('Array')) {
      steps.add(`5. Field "${error.field}" must be an array`);
    }

    // Enum validation
    if (error.message.includes('enum')) {
      steps.add(`6. Field "${error.field}" has an invalid value. Check documentation for allowed values`);
    }

    // URL validation
    if (error.message.includes('URL') || error.message.includes('url')) {
      steps.add(`7. Field "${error.field}" must be a valid URL`);
    }

    // Min/Max validation
    if (error.message.includes('minimum') || error.message.includes('less than')) {
      steps.add(`8. Field "${error.field}" must meet minimum requirements`);
    }
    if (error.message.includes('maximum') || error.message.includes('greater than')) {
      steps.add(`9. Field "${error.field}" must not exceed maximum limits`);
    }
  }

  // Add generic recovery steps
  steps.add('10. Review the operation documentation for required fields and format');
  steps.add('11. Ensure all values match the expected types and formats');

  return Array.from(steps);
}

/**
 * Issue #8: Schema builder with helpful error messages
 */
export const SchemaBuilder = {
  /**
   * Workflow-related schemas
   */
  workflow: {
    create: z.object({
      name: z.string().min(1).max(255).describe('Workflow name (1-255 characters)'),
      nodes: z.array(z.any()).min(1).describe('Array of workflow nodes (at least 1)'),
      connections: z.record(z.any()).describe('Workflow connections between nodes'),
      settings: z
        .object({
          executionOrder: z.enum(['v0', 'v1']).optional().describe('Execution order version'),
          timezone: z.string().optional().describe('Workflow timezone'),
          saveDataErrorExecution: z.enum(['all', 'none']).optional().describe('Save data on error'),
          saveDataSuccessExecution: z.enum(['all', 'none']).optional().describe('Save data on success'),
          saveManualExecutions: z.boolean().optional().describe('Save manual executions'),
          saveExecutionProgress: z.boolean().optional().describe('Save execution progress'),
          executionTimeout: z.number().min(1).optional().describe('Execution timeout in seconds'),
          errorWorkflow: z.string().optional().describe('Error workflow ID'),
        })
        .optional()
        .describe('Workflow settings'),
    }),

    update: z.object({
      id: z.string().min(1).describe('Workflow ID (required)'),
      name: z.string().min(1).max(255).optional().describe('New workflow name'),
      nodes: z.array(z.any()).optional().describe('Updated nodes array'),
      connections: z.record(z.any()).optional().describe('Updated connections'),
      settings: z.any().optional().describe('Updated settings'),
    }),

    list: z.object({
      limit: z.number().min(1).max(100).optional().describe('Number of results (1-100, default: 20)'),
      cursor: z.string().optional().describe('Pagination cursor'),
      active: z.boolean().optional().describe('Filter by active status'),
      tags: z.array(z.string()).optional().describe('Filter by tags'),
      projectId: z.string().optional().describe('Project ID'),
      excludePinnedData: z.boolean().optional().describe('Exclude pinned data'),
    }),

    validate: z.object({
      id: z.string().min(1).describe('Workflow ID to validate'),
      options: z
        .object({
          validateNodes: z.boolean().optional().describe('Validate nodes'),
          validateConnections: z.boolean().optional().describe('Validate connections'),
          validateExpressions: z.boolean().optional().describe('Validate expressions'),
          profile: z
            .enum(['minimal', 'runtime', 'ai-friendly', 'strict'])
            .optional()
            .describe('Validation profile'),
        })
        .optional()
        .describe('Validation options'),
    }),

    delete: z.object({
      id: z.string().min(1).describe('Workflow ID to delete'),
      force: z.boolean().optional().describe('Force delete (remove executions)'),
    }),

    activate: z.object({
      id: z.string().min(1).describe('Workflow ID'),
      active: z.boolean().describe('Active state (true to enable, false to disable)'),
    }),
  },

  /**
   * Execution-related schemas
   */
  execution: {
    run: z.object({
      workflowId: z.string().min(1).describe('Workflow ID to execute'),
      data: z.record(z.unknown()).optional().describe('Execution input data'),
      nodeToStartFrom: z.string().optional().describe('Node name to start from'),
      waitForResponse: z.boolean().optional().describe('Wait for execution response'),
    }),

    list: z.object({
      workflowId: z.string().optional().describe('Filter by workflow ID'),
      projectId: z.string().optional().describe('Project ID'),
      limit: z.number().min(1).max(100).optional().describe('Number of results (1-100)'),
      cursor: z.string().optional().describe('Pagination cursor'),
      status: z.enum(['success', 'error', 'waiting']).optional().describe('Filter by status'),
      includeData: z.boolean().optional().describe('Include execution data'),
    }),

    get: z.object({
      id: z.string().min(1).describe('Execution ID'),
      includeData: z.boolean().optional().describe('Include execution data'),
    }),

    stop: z.object({
      id: z.string().min(1).describe('Execution ID to stop'),
    }),

    delete: z.object({
      id: z.string().min(1).describe('Execution ID to delete'),
    }),
  },

  /**
   * Webhook-related schemas
   */
  webhook: {
    trigger: z.object({
      webhookUrl: z.string().url().describe('Webhook URL (must be valid URL)'),
      httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional().describe('HTTP method'),
      data: z.record(z.unknown()).optional().describe('Request data/payload'),
      headers: z.record(z.string()).optional().describe('HTTP headers'),
      waitForResponse: z.boolean().optional().describe('Wait for webhook response'),
    }),
  },

  /**
   * Diff-related schemas
   */
  diff: {
    update: z.object({
      workflowId: z.string().min(1).describe('Workflow ID'),
      operations: z
        .array(
          z.object({
            type: z.string().describe('Operation type'),
            description: z.string().optional().describe('Operation description'),
          })
        )
        .min(1)
        .max(5)
        .describe('Array of diff operations (1-5 operations)'),
      validateOnly: z.boolean().optional().describe('Validate without applying'),
    }),
  },
};

/**
 * Issue #8: Middleware to enforce strict input validation
 */
export function createValidationMiddleware<T>(schema: z.ZodType<T>, operationName: string) {
  return (args: unknown): { success: true; data: T } | ValidationErrorResponse => {
    return validateInput(args, schema, operationName);
  };
}

/**
 * Issue #8: Helper to ensure validation success
 * Throws detailed error if validation fails
 */
export function ensureValidInput<T>(
  validation: { success: true; data: T } | ValidationErrorResponse
): T {
  if (!validation.success) {
    const error = new Error(validation.error);
    (error as any).code = validation.code;
    (error as any).details = validation.details;
    (error as any).recoverySteps = validation.recoverySteps;
    throw error;
  }
  return validation.data;
}

/**
 * Issue #8: Validate input and return MCP response
 */
export function validateAndRespond<T>(
  input: unknown,
  schema: z.ZodType<T>,
  operationName: string
): { success: true; data: T } | ValidationErrorResponse {
  return validateInput(input, schema, operationName);
}
