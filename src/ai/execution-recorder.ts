/**
 * Execution Recorder
 * Records all system executions for analysis, debugging, and learning
 * Captures metrics, errors, and outcomes for continuous improvement
 */

import { logger } from '../utils/logger';

/**
 * Execution event type
 */
export enum ExecutionEventType {
  QUERY_RECEIVED = 'query-received',
  INTENT_CLASSIFIED = 'intent-classified',
  SEARCH_STARTED = 'search-started',
  SEARCH_COMPLETED = 'search-completed',
  RESULTS_VALIDATED = 'results-validated',
  QUALITY_CHECKED = 'quality-checked',
  RESULTS_RETURNED = 'results-returned',
  ERROR_OCCURRED = 'error-occurred',
  USER_FEEDBACK = 'user-feedback',
}

/**
 * Single execution event
 */
export interface ExecutionEvent {
  eventId: string;
  eventType: ExecutionEventType;
  timestamp: number;
  duration?: number; // ms
  executionId: string;
  sessionId: string;

  // Event-specific data
  data: {
    query?: string;
    intent?: string;
    intentConfidence?: number;
    resultCount?: number;
    qualityScore?: number;
    executionTime?: number;
    errorMessage?: string;
    errorStack?: string;
    userRating?: number;
    userFeedback?: string;
    [key: string]: any;
  };

  // Performance metrics
  metrics?: {
    cpuUsage?: number;
    memoryUsage?: number;
    latency?: number;
  };

  // Result status
  status: 'success' | 'failure' | 'partial' | 'pending';
}

/**
 * Complete execution record
 */
export interface ExecutionRecord {
  executionId: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  duration?: number;

  // Execution flow
  events: ExecutionEvent[];
  timeline: string[]; // Simple timeline of event types

  // Overall status
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  success: boolean;

  // Summary metrics
  metrics: {
    totalEvents: number;
    errorEvents: number;
    successRate: number;
    totalDuration: number;
    averageEventLatency: number;
  };

  // User interaction
  userInteraction: {
    resultSelected?: number;
    userRating?: number;
    userFeedback?: string;
    timeToSelection?: number;
  };

  // Metadata
  metadata: {
    clientId?: string;
    version?: string;
    environment?: 'development' | 'staging' | 'production';
  };
}

/**
 * Execution Recorder - Records all system executions
 */
export class ExecutionRecorder {
  private executions: Map<string, ExecutionRecord> = new Map();
  private sessionExecutions: Map<string, ExecutionRecord[]> = new Map();
  private readonly maxExecutionsPerSession: number = 500;

  constructor(config?: { maxExecutionsPerSession?: number }) {
    if (config?.maxExecutionsPerSession) {
      // Validate to prevent DoS
    }

    logger.info('[ExecutionRecorder] Initialized', {
      maxExecutionsPerSession: this.maxExecutionsPerSession,
    });
  }

  /**
   * Start a new execution
   */
  startExecution(sessionId: string, executionId?: string): ExecutionRecord {
    const id = executionId || this.generateExecutionId();
    const startTime = Date.now();

    // Ensure session list exists
    if (!this.sessionExecutions.has(sessionId)) {
      this.sessionExecutions.set(sessionId, []);
    }

    const execution: ExecutionRecord = {
      executionId: id,
      sessionId,
      startTime,
      events: [],
      timeline: [],
      status: 'running',
      success: false,
      metrics: {
        totalEvents: 0,
        errorEvents: 0,
        successRate: 0,
        totalDuration: 0,
        averageEventLatency: 0,
      },
      userInteraction: {},
      metadata: {},
    };

    this.executions.set(id, execution);

    // Add to session
    const sessionList = this.sessionExecutions.get(sessionId)!;
    if (sessionList.length >= this.maxExecutionsPerSession) {
      logger.warn('[ExecutionRecorder] Session execution limit reached, removing oldest', {
        sessionId,
      });
      const oldest = sessionList.shift();
      if (oldest) {
        this.executions.delete(oldest.executionId);
      }
    }
    sessionList.push(execution);

    logger.debug('[ExecutionRecorder] Execution started', {
      executionId: id,
      sessionId,
    });

    return execution;
  }

  /**
   * Record an event in an execution
   */
  recordEvent(
    executionId: string,
    eventType: ExecutionEventType,
    data: ExecutionEvent['data'],
    status: 'success' | 'failure' | 'partial' | 'pending' = 'success',
    metrics?: ExecutionEvent['metrics']
  ): void {
    const execution = this.executions.get(executionId);
    if (!execution) {
      logger.warn('[ExecutionRecorder] Execution not found', { executionId });
      return;
    }

    const event: ExecutionEvent = {
      eventId: this.generateEventId(),
      eventType,
      timestamp: Date.now(),
      executionId,
      sessionId: execution.sessionId,
      data,
      metrics,
      status,
    };

    execution.events.push(event);
    execution.timeline.push(eventType);
    execution.metrics.totalEvents++;

    if (status === 'failure') {
      execution.metrics.errorEvents++;
    }

    logger.debug('[ExecutionRecorder] Event recorded', {
      executionId,
      eventType,
      status,
    });
  }

  /**
   * Complete an execution
   */
  completeExecution(executionId: string, success: boolean, status: 'completed' | 'failed' | 'cancelled' = 'completed'): ExecutionRecord {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    execution.endTime = Date.now();
    execution.duration = execution.endTime - execution.startTime;
    execution.status = status;
    execution.success = success;

    // Calculate metrics
    if (execution.events.length > 0) {
      execution.metrics.totalDuration = execution.duration || 0;
      execution.metrics.successRate = execution.metrics.errorEvents === 0 ? 1 : 0;
      execution.metrics.averageEventLatency = execution.duration / execution.events.length;
    }

    logger.info('[ExecutionRecorder] Execution completed', {
      executionId,
      success,
      status,
      duration: execution.duration,
      eventCount: execution.events.length,
    });

    return execution;
  }

  /**
   * Record user feedback
   */
  recordUserFeedback(
    executionId: string,
    rating: number,
    feedback?: string,
    resultSelected?: number
  ): void {
    const execution = this.executions.get(executionId);
    if (!execution) {
      logger.warn('[ExecutionRecorder] Execution not found for feedback', { executionId });
      return;
    }

    execution.userInteraction.userRating = rating;
    execution.userInteraction.userFeedback = feedback;
    execution.userInteraction.resultSelected = resultSelected;
    execution.userInteraction.timeToSelection = Date.now() - execution.startTime;

    // Record as event
    this.recordEvent(executionId, ExecutionEventType.USER_FEEDBACK, {
      userRating: rating,
      userFeedback: feedback,
      resultSelected,
    });

    logger.info('[ExecutionRecorder] User feedback recorded', {
      executionId,
      rating,
      hasComment: !!feedback,
    });
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): ExecutionRecord | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get executions for a session
   */
  getSessionExecutions(sessionId: string): ExecutionRecord[] {
    return this.sessionExecutions.get(sessionId) || [];
  }

  /**
   * Get successful executions
   */
  getSuccessfulExecutions(sessionId?: string): ExecutionRecord[] {
    const executions = sessionId ? this.getSessionExecutions(sessionId) : Array.from(this.executions.values());
    return executions.filter((e) => e.success);
  }

  /**
   * Get failed executions
   */
  getFailedExecutions(sessionId?: string): ExecutionRecord[] {
    const executions = sessionId ? this.getSessionExecutions(sessionId) : Array.from(this.executions.values());
    return executions.filter((e) => !e.success);
  }

  /**
   * Get executions with user feedback
   */
  getExecutionsWithFeedback(): ExecutionRecord[] {
    return Array.from(this.executions.values()).filter((e) => e.userInteraction.userRating !== undefined);
  }

  /**
   * Get execution timeline (for debugging)
   */
  getExecutionTimeline(executionId: string): string[] {
    const execution = this.executions.get(executionId);
    return execution?.timeline || [];
  }

  /**
   * Get session statistics
   */
  getSessionStatistics(sessionId: string): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    successRate: number;
    averageDuration: number;
    averageEvents: number;
    executionsWithFeedback: number;
    averageUserRating?: number;
  } {
    const executions = this.getSessionExecutions(sessionId);

    if (executions.length === 0) {
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        successRate: 0,
        averageDuration: 0,
        averageEvents: 0,
        executionsWithFeedback: 0,
      };
    }

    const successful = executions.filter((e) => e.success).length;
    const failed = executions.length - successful;
    const withFeedback = executions.filter((e) => e.userInteraction.userRating !== undefined);
    const avgDuration = executions.reduce((sum, e) => sum + (e.duration || 0), 0) / executions.length;
    const avgEvents = executions.reduce((sum, e) => sum + e.events.length, 0) / executions.length;
    const avgRating =
      withFeedback.length > 0
        ? withFeedback.reduce((sum, e) => sum + (e.userInteraction.userRating || 0), 0) / withFeedback.length
        : undefined;

    return {
      totalExecutions: executions.length,
      successfulExecutions: successful,
      failedExecutions: failed,
      successRate: successful / executions.length,
      averageDuration: avgDuration,
      averageEvents: avgEvents,
      executionsWithFeedback: withFeedback.length,
      averageUserRating: avgRating,
    };
  }

  /**
   * Export execution data
   */
  exportExecutions(sessionId?: string, format: 'json' | 'csv' = 'json'): string {
    const executions = sessionId ? this.getSessionExecutions(sessionId) : Array.from(this.executions.values());

    if (format === 'json') {
      return JSON.stringify(executions, null, 2);
    } else {
      // CSV format
      const header = [
        'executionId',
        'sessionId',
        'startTime',
        'duration',
        'status',
        'success',
        'eventCount',
        'errorCount',
        'userRating',
      ].join(',');

      const rows = executions.map((e) =>
        [
          e.executionId,
          e.sessionId,
          e.startTime,
          e.duration,
          e.status,
          e.success,
          e.events.length,
          e.metrics.errorEvents,
          e.userInteraction.userRating || '',
        ].join(',')
      );

      return [header, ...rows].join('\n');
    }
  }

  /**
   * Clear execution data
   */
  clearExecutions(sessionId?: string): void {
    if (sessionId) {
      const executions = this.sessionExecutions.get(sessionId) || [];
      for (const exec of executions) {
        this.executions.delete(exec.executionId);
      }
      this.sessionExecutions.delete(sessionId);
      logger.info('[ExecutionRecorder] Session executions cleared', { sessionId });
    } else {
      this.executions.clear();
      this.sessionExecutions.clear();
      logger.info('[ExecutionRecorder] All executions cleared');
    }
  }

  /**
   * Get recorder statistics
   */
  getStatistics(): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    totalSessions: number;
    averageExecutionsPerSession: number;
    overallSuccessRate: number;
  } {
    const executions = Array.from(this.executions.values());
    const successful = executions.filter((e) => e.success).length;
    const sessions = this.sessionExecutions.size;

    return {
      totalExecutions: executions.length,
      successfulExecutions: successful,
      failedExecutions: executions.length - successful,
      totalSessions: sessions,
      averageExecutionsPerSession: sessions > 0 ? executions.length / sessions : 0,
      overallSuccessRate: executions.length > 0 ? successful / executions.length : 0,
    };
  }

  /**
   * Generate execution ID
   */
  private generateExecutionId(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `event-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Factory function to create execution recorder
 */
export function createExecutionRecorder(config?: { maxExecutionsPerSession?: number }): ExecutionRecorder {
  return new ExecutionRecorder(config);
}
