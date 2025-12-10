import { logger } from './logger';

// Custom error classes for n8n API operations

/**
 * Issue #3: Error Messages with Recovery Guidance
 *
 * Enhanced error system that provides actionable recovery steps for external agents.
 * Agents can read the recovery guidance to self-correct without retry loops.
 */

export class N8nApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string,
    public details?: unknown,
    public recoverySteps?: string[],
    public isRetryable?: boolean
  ) {
    super(message);
    this.name = 'N8nApiError';
  }
}

export class N8nAuthenticationError extends N8nApiError {
  constructor(message = 'Authentication failed') {
    super(
      message,
      401,
      'AUTHENTICATION_ERROR',
      undefined,
      [
        '1. Verify the N8N_API_KEY environment variable is set correctly',
        '2. Ensure the API key has not expired or been revoked in the n8n instance',
        '3. Check that the API key has required permissions for the operation',
        '4. Confirm the N8N_API_URL matches your n8n instance URL',
        '5. Generate a new API key in n8n settings if the current one is invalid'
      ],
      false // Not retryable - permanent auth error
    );
    this.name = 'N8nAuthenticationError';
  }
}

export class N8nNotFoundError extends N8nApiError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
    super(
      message,
      404,
      'NOT_FOUND',
      undefined,
      [
        `1. Verify the ${resource} ID/name exists in your n8n instance`,
        `2. Check that the ${resource} was not deleted`,
        '3. Ensure the API key has permission to access this resource',
        `4. Use list_workflows or similar tools to find valid ${resource} IDs`
      ],
      false // Not retryable - resource really doesn't exist
    );
    this.name = 'N8nNotFoundError';
  }
}

export class N8nValidationError extends N8nApiError {
  constructor(message: string, details?: unknown) {
    super(
      message,
      400,
      'VALIDATION_ERROR',
      details,
      [
        '1. Review the error details for specific validation failures',
        '2. Check that all required fields are provided',
        '3. Verify field values match expected types and formats',
        '4. Validate workflow structure (nodes, connections, properties)',
        '5. Use validate_workflow tool to check workflow before applying changes'
      ],
      false // Not retryable - data is invalid
    );
    this.name = 'N8nValidationError';
  }
}

export class N8nRateLimitError extends N8nApiError {
  constructor(retryAfter?: number) {
    const message = retryAfter
      ? `Rate limit exceeded. Retry after ${retryAfter} seconds`
      : 'Rate limit exceeded';
    super(
      message,
      429,
      'RATE_LIMIT_ERROR',
      { retryAfter },
      [
        retryAfter
          ? `1. Wait ${retryAfter} seconds before retrying (as indicated by server)`
          : '1. Wait before retrying - rate limit has been hit',
        '2. Reduce the frequency of API calls if making multiple requests',
        '3. Batch operations to reduce total number of API calls',
        '4. If configured, the MCP server will automatically retry with backoff',
        '5. Consider implementing request queuing on the agent side'
      ],
      true // Retryable - rate limit is temporary
    );
    this.name = 'N8nRateLimitError';
  }
}

export class N8nServerError extends N8nApiError {
  constructor(message = 'Internal server error', statusCode = 500) {
    super(
      message,
      statusCode,
      'SERVER_ERROR',
      undefined,
      [
        '1. Check n8n server status - may be temporarily unavailable',
        '2. Review n8n server logs for error details',
        '3. Verify n8n instance has sufficient resources (CPU, memory, disk)',
        '4. If configured, the MCP server will automatically retry with exponential backoff',
        '5. If error persists, contact n8n support or check their status page',
        `6. The server returned HTTP ${statusCode} - this may indicate maintenance or resource constraints`
      ],
      true // Retryable - server may recover
    );
    this.name = 'N8nServerError';
  }
}

export class N8nSessionAuthError extends N8nApiError {
  constructor(message = 'Session authentication failed') {
    super(
      message,
      401,
      'SESSION_AUTH_ERROR',
      undefined,
      [
        '1. Verify N8N_USERNAME and N8N_PASSWORD environment variables are correct',
        '2. Ensure the n8n user account exists and is active',
        '3. MFA-enabled accounts are not currently supported',
        '4. Check if n8n instance is accessible at N8N_API_URL',
        '5. Session auth will fallback to API key + workflow extraction',
        '6. Session auth is optional - the server can function without it'
      ],
      true // Retryable - session may be refreshable
    );
    this.name = 'N8nSessionAuthError';
  }
}

// Error handling utility
export function handleN8nApiError(error: unknown): N8nApiError {
  if (error instanceof N8nApiError) {
    return error;
  }

  if (error instanceof Error) {
    // Check if it's an Axios error
    const axiosError = error as any;
    if (axiosError.response) {
      const { status, data } = axiosError.response;
      const message = data?.message || axiosError.message;

      switch (status) {
        case 401:
          return new N8nAuthenticationError(message);
        case 404:
          return new N8nNotFoundError('Resource', message);
        case 400:
          return new N8nValidationError(message, data);
        case 429:
          const retryAfter = axiosError.response.headers['retry-after'];
          return new N8nRateLimitError(retryAfter ? parseInt(retryAfter) : undefined);
        default:
          if (status >= 500) {
            return new N8nServerError(message, status);
          }
          return new N8nApiError(message, status, 'API_ERROR', data);
      }
    } else if (axiosError.request) {
      // Request was made but no response received
      return new N8nApiError('No response from n8n server', undefined, 'NO_RESPONSE');
    } else {
      // Something happened in setting up the request
      return new N8nApiError(axiosError.message, undefined, 'REQUEST_ERROR');
    }
  }

  // Unknown error type
  return new N8nApiError('Unknown error occurred', undefined, 'UNKNOWN_ERROR', error);
}

// Utility to extract user-friendly error messages with recovery guidance
export function getUserFriendlyErrorMessage(error: N8nApiError): string {
  return error.message || 'An unexpected error occurred';
}

// Get recovery steps for an error (Issue #3: Recovery Guidance)
export function getRecoverySteps(error: N8nApiError): string[] {
  if (error.recoverySteps && error.recoverySteps.length > 0) {
    return error.recoverySteps;
  }

  // Fallback recovery steps for errors without explicit steps
  const defaultSteps: Record<string, string[]> = {
    'NO_RESPONSE': [
      '1. Verify the N8N_API_URL environment variable is set correctly',
      '2. Check that n8n is running and accessible at the configured URL',
      '3. Verify network connectivity to the n8n server',
      '4. Check firewall rules and security group settings if applicable',
      '5. Review n8n server logs for startup errors or crashes',
      '6. If using Docker, verify the container is running: docker ps | grep n8n'
    ],
    'REQUEST_ERROR': [
      '1. Check that all required parameters are provided',
      '2. Verify parameter formats match the API specification',
      '3. Review the request configuration in MCP server logs',
      '4. Try a simpler request first to isolate the issue',
      '5. Increase logging level to see detailed request/response data'
    ],
    'UNKNOWN_ERROR': [
      '1. Check MCP server logs for detailed error information',
      '2. Verify all environment variables are configured correctly',
      '3. Ensure n8n instance is running and responding to requests',
      '4. Check network connectivity and firewall settings',
      '5. Contact support with the error code and full error message'
    ]
  };

  return defaultSteps[error.code || ''] || defaultSteps['UNKNOWN_ERROR'];
}

// Check if an error is retryable (agents can use this to decide whether to retry)
export function isErrorRetryable(error: N8nApiError): boolean {
  if (error.isRetryable !== undefined) {
    return error.isRetryable;
  }

  // Default retry logic based on status code
  if (error.statusCode) {
    // Server errors (5xx) and rate limits (429) are retryable
    return error.statusCode === 429 || error.statusCode >= 500;
  }

  // Network-level errors are retryable
  if (error.code) {
    const retryableNetworkErrors = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'NO_RESPONSE'];
    return retryableNetworkErrors.includes(error.code);
  }

  return false;
}

// Log error with appropriate level
export function logN8nError(error: N8nApiError, context?: string): void {
  const errorInfo = {
    name: error.name,
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    details: error.details,
    context,
  };

  if (error.statusCode && error.statusCode >= 500) {
    logger.error('n8n API server error', errorInfo);
  } else if (error.statusCode && error.statusCode >= 400) {
    logger.warn('n8n API client error', errorInfo);
  } else {
    logger.error('n8n API error', errorInfo);
  }
}

/**
 * Standardized error response formatter for MCP tools
 * Ensures consistent error response structure across all handlers
 * Issue #3: Now includes recovery guidance and retry information
 */
export interface StandardErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
  recoverySteps?: string[]; // Issue #3: Add recovery guidance
  isRetryable?: boolean; // Issue #3: Indicate if error is retryable
}

export function createErrorResponse(
  message: string,
  code?: string,
  details?: Record<string, unknown>,
  recoverySteps?: string[],
  isRetryable?: boolean
): StandardErrorResponse {
  return {
    success: false,
    error: message,
    ...(code && { code }),
    ...(details && { details }),
    ...(recoverySteps && recoverySteps.length > 0 && { recoverySteps }),
    ...(isRetryable !== undefined && { isRetryable }),
  };
}

/**
 * Create error response from N8nApiError with full recovery guidance
 * Issue #3: Provides agents with recovery steps to self-correct
 */
export function createErrorResponseFromN8nError(error: N8nApiError): StandardErrorResponse {
  const recoverySteps = getRecoverySteps(error);
  const isRetryable = isErrorRetryable(error);

  return createErrorResponse(
    error.message,
    error.code,
    error.details as Record<string, unknown> | undefined,
    recoverySteps,
    isRetryable
  );
}