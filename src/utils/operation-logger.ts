/**
 * Operation Logger Utility
 * Issue #12: Sufficient Operation Logging
 *
 * Provides operation ID generation and tracking for external agent tracing.
 * Each tool invocation gets a unique operation ID that can be used to trace
 * agent decisions and debug complex workflows.
 */

import { logger } from './logger';

/**
 * Operation metadata tracked during execution
 */
export interface OperationMetadata {
  operationId: string;
  toolName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'started' | 'in_progress' | 'success' | 'error';
  inputSize: number;
  outputSize?: number;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  context?: Record<string, any>;
}

/**
 * Global operation context (stores current operation ID in async context)
 * Used to associate logs with specific operations
 */
const operationStack: OperationMetadata[] = [];

/**
 * Generate a unique operation ID
 * Format: op_<timestamp>_<random>
 *
 * Example: op_1700850215400_a1b2c3d4e5
 */
function generateOperationId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `op_${timestamp}_${random}`;
}

/**
 * Start tracking a new operation
 *
 * Usage:
 * ```typescript
 * const opId = startOperation('n8n_create_workflow', args);
 * try {
 *   const result = await createWorkflow(args);
 *   endOperation(opId, result, 'success');
 *   return result;
 * } catch (error) {
 *   endOperation(opId, null, 'error', error);
 *   throw error;
 * }
 * ```
 */
export function startOperation(
  toolName: string,
  input: any
): string {
  const operationId = generateOperationId();
  const inputSize = JSON.stringify(input).length;

  const metadata: OperationMetadata = {
    operationId,
    toolName,
    startTime: Date.now(),
    status: 'started',
    inputSize,
  };

  operationStack.push(metadata);

  logger.info('Operation started', {
    operationId,
    toolName,
    inputSize,
  });

  return operationId;
}

/**
 * Mark operation as in progress (for long-running operations)
 */
export function updateOperation(
  operationId: string,
  status: 'in_progress',
  context?: Record<string, any>
): void {
  const operation = operationStack.find(op => op.operationId === operationId);
  if (operation) {
    operation.status = status;
    operation.context = context;
    logger.debug('Operation progress update', {
      operationId,
      status,
      context,
    });
  }
}

/**
 * End operation tracking
 *
 * @param operationId - The operation ID from startOperation
 * @param output - The operation output/result
 * @param status - 'success' or 'error'
 * @param error - Error object if status is 'error'
 */
export function endOperation(
  operationId: string,
  output: any = null,
  status: 'success' | 'error' = 'success',
  error?: unknown
): void {
  const operation = operationStack.find(op => op.operationId === operationId);
  if (!operation) {
    logger.warn('End operation called for unknown operationId', { operationId });
    return;
  }

  operation.endTime = Date.now();
  operation.duration = operation.endTime - operation.startTime;
  operation.status = status;

  if (output) {
    operation.outputSize = JSON.stringify(output).length;
  }

  if (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    operation.error = {
      message: errorObj.message,
      code: (error as any)?.code,
      stack: errorObj.stack,
    };
  }

  // Log operation completion
  const logData = {
    operationId: operation.operationId,
    toolName: operation.toolName,
    status,
    duration: `${operation.duration}ms`,
    inputSize: `${operation.inputSize} bytes`,
    outputSize: operation.outputSize ? `${operation.outputSize} bytes` : undefined,
    error: operation.error,
  };

  if (status === 'success') {
    logger.info('Operation completed successfully', logData);
  } else {
    logger.error('Operation failed', logData);
  }

  // Remove from stack when complete
  const index = operationStack.indexOf(operation);
  if (index > -1) {
    operationStack.splice(index, 1);
  }
}

/**
 * Get current operation ID (for nested operations or logging context)
 */
export function getCurrentOperationId(): string | null {
  if (operationStack.length === 0) {
    return null;
  }
  return operationStack[operationStack.length - 1].operationId;
}

/**
 * Get full operation metadata for current operation
 */
export function getCurrentOperation(): OperationMetadata | null {
  if (operationStack.length === 0) {
    return null;
  }
  return operationStack[operationStack.length - 1];
}

/**
 * Add context to current operation
 * Useful for adding debugging information during execution
 *
 * Usage:
 * ```typescript
 * addOperationContext('workflowId', workflow.id);
 * addOperationContext('nodeCount', workflow.nodes.length);
 * ```
 */
export function addOperationContext(
  key: string,
  value: any
): void {
  const operation = getCurrentOperation();
  if (operation) {
    if (!operation.context) {
      operation.context = {};
    }
    operation.context[key] = value;
  }
}

/**
 * Create structured log entry with operation context
 * Automatically includes operation ID in log output
 */
export function logWithOperation(
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  data?: Record<string, any>
): void {
  const operationId = getCurrentOperationId();
  const logData = {
    operationId,
    ...(data || {}),
  };

  switch (level) {
    case 'info':
      logger.info(message, logData);
      break;
    case 'warn':
      logger.warn(message, logData);
      break;
    case 'error':
      logger.error(message, logData);
      break;
    case 'debug':
      logger.debug(message, logData);
      break;
  }
}

/**
 * Get operation summary for agent feedback
 * Shows key metrics about the operation
 */
export function getOperationSummary(operationId: string): OperationMetadata | null {
  // Check current stack first
  let operation = operationStack.find(op => op.operationId === operationId);
  if (operation) {
    return operation;
  }

  // If not found, operation has already completed and been removed
  // This is normal - the operation summary is most useful during execution
  return null;
}

/**
 * Batch log multiple operations
 * Useful for reporting on related operations
 */
export function logOperationBatch(
  operationIds: string[],
  message: string
): void {
  logger.info(message, {
    operationCount: operationIds.length,
    operationIds,
  });
}
