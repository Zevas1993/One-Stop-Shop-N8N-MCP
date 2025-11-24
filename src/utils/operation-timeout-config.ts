/**
 * Issue #5: Per-Operation Timeout Configuration
 *
 * Manages configurable timeouts for different MCP tool operations.
 * Allows agents to specify operation-specific timeouts that override global defaults,
 * preventing slow operations from timing out prematurely while maintaining responsiveness.
 *
 * Key Features:
 * - Per-operation timeout overrides (ms)
 * - Sensible defaults for common operations
 * - Timeout profiles for different use cases
 * - Dynamic timeout adjustment based on operation complexity
 * - Agent-friendly timeout configuration options
 */

import { logger } from './logger';

/**
 * Timeout configuration per operation type
 * Values in milliseconds
 */
export interface OperationTimeoutConfig {
  [operationName: string]: number;
}

/**
 * Predefined timeout profiles for different use cases
 */
export const TIMEOUT_PROFILES = {
  // Quick operations - should complete in seconds
  quick: {
    'n8n_get_workflow': 10000,           // 10s - simple get
    'n8n_get_workflow_minimal': 8000,    // 8s - very lightweight
    'n8n_health_check': 5000,            // 5s - just ping
    'n8n_list_workflows': 15000,         // 15s - list with pagination
    'list_nodes': 10000,                 // 10s - list from local DB
    'get_node_info': 8000,               // 8s - local DB lookup
    'search_nodes': 12000,               // 12s - local DB search
  },

  // Standard operations - moderate complexity
  standard: {
    'n8n_create_workflow': 30000,        // 30s - create with validation
    'n8n_update_full_workflow': 35000,   // 35s - full workflow update
    'n8n_update_partial_workflow': 30000, // 30s - diff-based update
    'n8n_delete_workflow': 15000,        // 15s - delete workflow
    'n8n_activate_workflow': 20000,      // 20s - activate/deactivate
    'n8n_validate_workflow': 25000,      // 25s - validate from n8n
    'validate_workflow': 20000,          // 20s - local validation
    'validate_node_operation': 15000,    // 15s - validate node config
    'n8n_list_executions': 20000,        // 20s - list executions
    'n8n_get_execution': 15000,          // 15s - get single execution
  },

  // Slow operations - may take longer
  slow: {
    'n8n_run_workflow': 120000,          // 2 minutes - workflow execution
    'n8n_trigger_webhook_workflow': 60000, // 1 minute - trigger and wait
    'n8n_delete_execution': 20000,       // 20s - delete execution
    'n8n_stop_execution': 15000,         // 15s - stop running execution
    'fetch_templates': 45000,            // 45s - template fetching
    'search_templates': 25000,           // 25s - template search
    'validate_workflow_expressions': 25000, // 25s - expression validation
  },

  // Global default - used if no specific timeout is defined
  default: 30000, // 30 seconds
};

/**
 * Current timeout configuration - can be overridden per operation
 */
class OperationTimeoutManager {
  private configOverrides: OperationTimeoutConfig = {};
  private currentProfile: keyof typeof TIMEOUT_PROFILES = 'standard';
  private operationStartTimes = new Map<string, number>();

  /**
   * Initialize with a specific profile
   */
  setProfile(profile: keyof typeof TIMEOUT_PROFILES): void {
    if (!TIMEOUT_PROFILES[profile]) {
      logger.warn(`Unknown timeout profile: ${profile}, keeping current profile`);
      return;
    }
    this.currentProfile = profile;
    this.configOverrides = {}; // Clear overrides when changing profile
    logger.info(`Timeout profile changed to: ${profile}`, {
      profile,
      operationsCount: Object.keys(TIMEOUT_PROFILES[profile]).length,
    });
  }

  /**
   * Get current timeout profile name
   */
  getProfile(): string {
    return this.currentProfile;
  }

  /**
   * Override timeout for a specific operation
   * @param operationName - Name of the MCP operation
   * @param timeoutMs - Timeout in milliseconds
   */
  setOperationTimeout(operationName: string, timeoutMs: number): void {
    if (timeoutMs < 1000) {
      logger.warn(`Very short timeout requested for ${operationName}: ${timeoutMs}ms (minimum 1000ms recommended)`, {
        operationName,
        timeoutMs,
      });
    }
    if (timeoutMs > 600000) {
      logger.warn(`Very long timeout requested for ${operationName}: ${timeoutMs}ms (maximum 600000ms recommended)`, {
        operationName,
        timeoutMs,
      });
    }
    this.configOverrides[operationName] = timeoutMs;
    logger.debug(`Operation timeout configured`, {
      operationName,
      timeoutMs,
      source: 'override',
    });
  }

  /**
   * Get timeout for a specific operation
   * Checks: overrides → profile → default
   */
  getOperationTimeout(operationName: string): number {
    // Check override first
    if (this.configOverrides[operationName] !== undefined) {
      return this.configOverrides[operationName];
    }

    // Check current profile
    const profileConfig = TIMEOUT_PROFILES[this.currentProfile] as any;
    if (profileConfig[operationName] !== undefined) {
      return profileConfig[operationName];
    }

    // Return default
    return TIMEOUT_PROFILES.default;
  }

  /**
   * Get all timeouts for current configuration
   */
  getAllTimeouts(): OperationTimeoutConfig {
    const profileConfig = TIMEOUT_PROFILES[this.currentProfile] as any;
    return {
      ...profileConfig,
      ...this.configOverrides,
    };
  }

  /**
   * Clear all overrides (reset to profile defaults)
   */
  clearOverrides(): void {
    this.configOverrides = {};
    logger.info('All operation timeout overrides cleared', {
      profile: this.currentProfile,
    });
  }

  /**
   * Start tracking operation timing
   */
  startOperation(operationId: string): void {
    this.operationStartTimes.set(operationId, Date.now());
  }

  /**
   * End operation and return elapsed time
   */
  endOperation(operationId: string): number {
    const startTime = this.operationStartTimes.get(operationId);
    if (!startTime) {
      return 0;
    }
    const elapsed = Date.now() - startTime;
    this.operationStartTimes.delete(operationId);
    return elapsed;
  }

  /**
   * Check if operation is approaching timeout
   * @param operationId - Operation ID to check
   * @param operationName - Operation name for timeout lookup
   * @param warningThreshold - Percentage of timeout to trigger warning (0-1, default 0.8 = 80%)
   */
  isApproachingTimeout(
    operationId: string,
    operationName: string,
    warningThreshold: number = 0.8
  ): boolean {
    const startTime = this.operationStartTimes.get(operationId);
    if (!startTime) {
      return false;
    }
    const elapsed = Date.now() - startTime;
    const timeout = this.getOperationTimeout(operationName);
    return elapsed > timeout * warningThreshold;
  }

  /**
   * Get remaining time for operation
   */
  getRemainingTime(operationId: string, operationName: string): number {
    const startTime = this.operationStartTimes.get(operationId);
    if (!startTime) {
      return 0;
    }
    const elapsed = Date.now() - startTime;
    const timeout = this.getOperationTimeout(operationName);
    return Math.max(0, timeout - elapsed);
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.configOverrides = {};
    this.currentProfile = 'standard';
    this.operationStartTimes.clear();
    logger.info('Timeout configuration reset to defaults');
  }

  /**
   * Get timeout statistics for debugging
   */
  getStatistics(): {
    profile: string;
    overridesCount: number;
    activeOperations: number;
  } {
    return {
      profile: this.currentProfile,
      overridesCount: Object.keys(this.configOverrides).length,
      activeOperations: this.operationStartTimes.size,
    };
  }
}

// Singleton instance
const manager = new OperationTimeoutManager();

/**
 * Export manager instance and functions
 */
export {
  manager as timeoutManager,
  OperationTimeoutManager,
};

/**
 * Helper function to set timeout profile
 * Useful for agents to switch between quick/standard/slow profiles
 */
export function setTimeoutProfile(profile: keyof typeof TIMEOUT_PROFILES): void {
  manager.setProfile(profile);
}

/**
 * Helper function to set operation-specific timeout
 * Useful for agents to customize timeouts for specific operations
 */
export function setOperationTimeout(operationName: string, timeoutMs: number): void {
  manager.setOperationTimeout(operationName, timeoutMs);
}

/**
 * Helper function to get timeout for operation
 */
export function getOperationTimeout(operationName: string): number {
  return manager.getOperationTimeout(operationName);
}

/**
 * Create a timeout promise that rejects after specified milliseconds
 * Useful for wrapping async operations with timeout enforcement
 */
export function createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timeout exceeded: ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

/**
 * Wrap an async operation with timeout enforcement
 * @param operation - Async function to execute
 * @param operationName - Name of operation (for timeout lookup)
 * @param operationId - Unique operation ID for tracking
 * @returns Result or timeout error
 */
export async function executeWithTimeout<T>(
  operation: () => Promise<T>,
  operationName: string,
  operationId?: string
): Promise<T> {
  const timeoutMs = manager.getOperationTimeout(operationName);
  const actualOperationId = operationId || `${operationName}_${Date.now()}`;

  manager.startOperation(actualOperationId);

  try {
    // Race between operation and timeout
    const result = await Promise.race([
      operation(),
      createTimeoutPromise(timeoutMs),
    ]);

    const elapsed = manager.endOperation(actualOperationId);
    logger.debug(`Operation completed within timeout`, {
      operationName,
      operationId: actualOperationId,
      timeoutMs,
      elapsedMs: elapsed,
      utilizationPercent: Math.round((elapsed / timeoutMs) * 100),
    });

    return result;
  } catch (error) {
    const elapsed = manager.endOperation(actualOperationId);

    // Check if timeout error
    if (error instanceof Error && error.message.includes('timeout exceeded')) {
      logger.error(`Operation timeout exceeded`, {
        operationName,
        operationId: actualOperationId,
        timeoutMs,
        elapsedMs: elapsed,
      });
    }
    throw error;
  }
}

/**
 * Type-safe wrapper for MCP handlers that need timeout support
 * Usage: const result = await withOperationTimeout(async () => { ... }, 'operation_name');
 */
export async function withOperationTimeout<T>(
  fn: () => Promise<T>,
  operationName: string
): Promise<T> {
  return executeWithTimeout(fn, operationName);
}
