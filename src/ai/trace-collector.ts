/**
 * Trace Collector
 * Captures execution traces in POMDP (Partially Observable Markov Decision Process) format
 * Records observations, actions, rewards, and state transitions for reinforcement learning
 */

import { logger } from '../utils/logger';

/**
 * Observation: What the system sees
 */
export interface Observation {
  timestamp: number;
  query: string;
  queryFeatures: {
    length: number;
    hasTechnicalTerms: boolean;
    hasServiceMentions: boolean;
    hasNodeMentions: boolean;
    mentionedServices: string[];
    mentionedNodes: string[];
  };
  context?: {
    conversationHistory?: string[];
    userProfile?: {
      expertise: 'beginner' | 'intermediate' | 'expert';
    };
    previousIntents?: string[];
  };
}

/**
 * Action: What the system decides to do
 */
export interface Action {
  timestamp: number;
  actionType: 'query-routing' | 'search-execution' | 'result-filtering' | 'refinement';
  intent: string;
  intentConfidence: number;
  strategy: string;
  parameters: {
    searchType?: 'embedding' | 'hybrid' | 'pattern-match' | 'property-based';
    maxResults?: number;
    scoreThreshold?: number;
    [key: string]: any;
  };
}

/**
 * Result: What happened as a result of the action
 */
export interface Result {
  timestamp: number;
  resultCount: number;
  qualityScore: number;
  validResultCount: number;
  executionTimeMs: number;
  errors: number;
  warnings: number;
  resultQuality: {
    quantity: number; // 0-1
    relevance: number; // 0-1
    coverage: number; // 0-1
    diversity: number; // 0-1
    metadata: number; // 0-1
  };
}

/**
 * Reward: Feedback signal for learning
 */
export interface Reward {
  timestamp: number;
  immediate: number; // Immediate reward for this action (-1 to 1)
  components: {
    qualityReward: number; // Based on result quality
    efficiencyReward: number; // Based on execution time
    userSatisfactionReward?: number; // Optional: from explicit user feedback
    explorationBonus?: number; // Bonus for trying new strategies
  };
  metadata: {
    reason: string;
    factors: string[];
  };
}

/**
 * Execution Trace: Complete record of one query execution
 */
export interface ExecutionTrace {
  traceId: string;
  sessionId: string;
  timestamp: number;
  duration: number;

  // POMDP Elements
  observation: Observation;
  action: Action;
  result: Result;
  reward: Reward;

  // Additional Context
  metadata: {
    userExpertise?: 'beginner' | 'intermediate' | 'expert';
    isFollowUp?: boolean;
    refinementIteration?: number;
    endUserSatisfaction?: {
      rating?: number; // 1-5
      feedback?: string;
      selectedResult?: number; // Index of selected result
    };
  };

  // Success Indicators
  success: boolean;
  successMetrics: {
    userFoundAnswer: boolean;
    userSatisfaction: number; // 0-1
    correctNodeFound: boolean;
    correctPropertyFound: boolean;
  };
}

/**
 * Trace Collector - Captures execution traces
 */
export class TraceCollector {
  private traces: Map<string, ExecutionTrace> = new Map();
  private sessionTraces: Map<string, ExecutionTrace[]> = new Map();
  private readonly maxTracesPerSession: number = 1000;

  constructor(config?: { maxTracesPerSession?: number }) {
    if (config?.maxTracesPerSession) {
      // Validate to prevent DoS
    }

    logger.info('[TraceCollector] Initialized', {
      maxTracesPerSession: this.maxTracesPerSession,
    });
  }

  /**
   * Start a new trace by recording observation
   */
  startTrace(
    sessionId: string,
    query: string,
    context?: Observation['context']
  ): { traceId: string; timestamp: number } {
    const traceId = this.generateTraceId();
    const timestamp = Date.now();

    logger.debug('[TraceCollector] Starting trace', {
      traceId,
      sessionId,
      query: query.substring(0, 50),
    });

    // Store initial trace (will be completed later)
    if (!this.sessionTraces.has(sessionId)) {
      this.sessionTraces.set(sessionId, []);
    }

    const sessionTraceList = this.sessionTraces.get(sessionId)!;
    if (sessionTraceList.length >= this.maxTracesPerSession) {
      logger.warn('[TraceCollector] Session trace limit reached, removing oldest', {
        sessionId,
        oldestTraceId: sessionTraceList[0].traceId,
      });
      sessionTraceList.shift();
    }

    return { traceId, timestamp };
  }

  /**
   * Record action taken in response to observation
   */
  recordAction(traceId: string, action: Action): void {
    logger.debug('[TraceCollector] Recording action', {
      traceId,
      actionType: action.actionType,
      intent: action.intent,
    });

    // Actions are logged for later assembly into full trace
  }

  /**
   * Record result of action
   */
  recordResult(traceId: string, result: Result): void {
    logger.debug('[TraceCollector] Recording result', {
      traceId,
      resultCount: result.resultCount,
      qualityScore: result.qualityScore.toFixed(3),
      executionTime: result.executionTimeMs,
    });
  }

  /**
   * Complete a trace with all POMDP elements
   */
  completeTrace(
    traceId: string,
    sessionId: string,
    observation: Observation,
    action: Action,
    result: Result,
    reward: Reward,
    metadata?: ExecutionTrace['metadata'],
    successMetrics?: ExecutionTrace['successMetrics']
  ): ExecutionTrace {
    const duration = Date.now() - observation.timestamp;
    const success = reward.immediate > 0;

    const trace: ExecutionTrace = {
      traceId,
      sessionId,
      timestamp: observation.timestamp,
      duration,

      observation,
      action,
      result,
      reward,

      metadata: metadata || {
        isFollowUp: false,
        refinementIteration: 0,
      },

      success,
      successMetrics: successMetrics || {
        userFoundAnswer: success,
        userSatisfaction: Math.max(0, reward.immediate),
        correctNodeFound: false,
        correctPropertyFound: false,
      },
    };

    this.traces.set(traceId, trace);

    // Add to session traces
    const sessionTraceList = this.sessionTraces.get(sessionId);
    if (sessionTraceList) {
      sessionTraceList.push(trace);
    }

    logger.info('[TraceCollector] Trace completed', {
      traceId,
      success,
      reward: reward.immediate.toFixed(3),
      duration,
    });

    return trace;
  }

  /**
   * Get a single trace
   */
  getTrace(traceId: string): ExecutionTrace | undefined {
    return this.traces.get(traceId);
  }

  /**
   * Get all traces for a session
   */
  getSessionTraces(sessionId: string): ExecutionTrace[] {
    return this.sessionTraces.get(sessionId) || [];
  }

  /**
   * Get successful traces (for training data)
   */
  getSuccessfulTraces(sessionId?: string): ExecutionTrace[] {
    let traces: ExecutionTrace[] = [];

    if (sessionId) {
      traces = this.getSessionTraces(sessionId);
    } else {
      traces = Array.from(this.traces.values());
    }

    return traces.filter((t) => t.success);
  }

  /**
   * Get failed traces (for negative examples)
   */
  getFailedTraces(sessionId?: string): ExecutionTrace[] {
    let traces: ExecutionTrace[] = [];

    if (sessionId) {
      traces = this.getSessionTraces(sessionId);
    } else {
      traces = Array.from(this.traces.values());
    }

    return traces.filter((t) => !t.success);
  }

  /**
   * Get traces with explicit user feedback
   */
  getTracesWithFeedback(): ExecutionTrace[] {
    return Array.from(this.traces.values()).filter(
      (t) => t.metadata.endUserSatisfaction?.rating !== undefined
    );
  }

  /**
   * Calculate session statistics
   */
  getSessionStatistics(sessionId: string): {
    totalTraces: number;
    successfulTraces: number;
    failedTraces: number;
    successRate: number;
    averageReward: number;
    averageExecutionTime: number;
    averageQualityScore: number;
  } {
    const sessionTraces = this.getSessionTraces(sessionId);

    if (sessionTraces.length === 0) {
      return {
        totalTraces: 0,
        successfulTraces: 0,
        failedTraces: 0,
        successRate: 0,
        averageReward: 0,
        averageExecutionTime: 0,
        averageQualityScore: 0,
      };
    }

    const successful = sessionTraces.filter((t) => t.success).length;
    const failed = sessionTraces.length - successful;
    const avgReward = sessionTraces.reduce((sum, t) => sum + t.reward.immediate, 0) / sessionTraces.length;
    const avgTime = sessionTraces.reduce((sum, t) => sum + t.result.executionTimeMs, 0) / sessionTraces.length;
    const avgQuality = sessionTraces.reduce((sum, t) => sum + t.result.qualityScore, 0) / sessionTraces.length;

    return {
      totalTraces: sessionTraces.length,
      successfulTraces: successful,
      failedTraces: failed,
      successRate: successful / sessionTraces.length,
      averageReward: avgReward,
      averageExecutionTime: avgTime,
      averageQualityScore: avgQuality,
    };
  }

  /**
   * Export traces for analysis/training
   */
  exportTraces(
    format: 'json' | 'csv' = 'json',
    sessionId?: string
  ): string {
    const traces = sessionId ? this.getSessionTraces(sessionId) : Array.from(this.traces.values());

    if (format === 'json') {
      return JSON.stringify(traces, null, 2);
    } else {
      // CSV format
      const header = [
        'traceId',
        'sessionId',
        'timestamp',
        'duration',
        'query',
        'intent',
        'resultCount',
        'qualityScore',
        'reward',
        'success',
      ].join(',');

      const rows = traces.map((t) =>
        [
          t.traceId,
          t.sessionId,
          t.timestamp,
          t.duration,
          `"${t.observation.query.replace(/"/g, '""')}"`,
          t.action.intent,
          t.result.resultCount,
          t.result.qualityScore.toFixed(3),
          t.reward.immediate.toFixed(3),
          t.success,
        ].join(',')
      );

      return [header, ...rows].join('\n');
    }
  }

  /**
   * Clear traces (cleanup)
   */
  clearTraces(sessionId?: string): void {
    if (sessionId) {
      this.sessionTraces.delete(sessionId);
      logger.info('[TraceCollector] Session traces cleared', { sessionId });
    } else {
      this.traces.clear();
      this.sessionTraces.clear();
      logger.info('[TraceCollector] All traces cleared');
    }
  }

  /**
   * Get collector statistics
   */
  getStatistics(): {
    totalTraces: number;
    successfulTraces: number;
    failedTraces: number;
    totalSessions: number;
    averageTracesPerSession: number;
    overallSuccessRate: number;
  } {
    const totalTraces = this.traces.size;
    const successfulTraces = Array.from(this.traces.values()).filter((t) => t.success).length;
    const failedTraces = totalTraces - successfulTraces;
    const totalSessions = this.sessionTraces.size;
    const avgTracesPerSession = totalSessions > 0 ? totalTraces / totalSessions : 0;
    const overallSuccessRate = totalTraces > 0 ? successfulTraces / totalTraces : 0;

    return {
      totalTraces,
      successfulTraces,
      failedTraces,
      totalSessions,
      averageTracesPerSession: avgTracesPerSession,
      overallSuccessRate,
    };
  }

  /**
   * Generate trace ID
   */
  private generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Factory function to create trace collector
 */
export function createTraceCollector(config?: { maxTracesPerSession?: number }): TraceCollector {
  return new TraceCollector(config);
}
