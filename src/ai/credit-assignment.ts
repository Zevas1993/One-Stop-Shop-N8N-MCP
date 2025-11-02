/**
 * Credit Assignment Engine
 * Implements temporal difference (TD) learning for credit assignment
 * Distributes rewards across sequence of actions using TD(λ) algorithm
 */

import { logger } from '../utils/logger';
import { ExecutionTrace } from './trace-collector';

/**
 * TD Credit Assignment Result
 */
export interface TDCreditAssignment {
  traceId: string;
  stepCredits: Array<{
    stepIndex: number;
    actionType: string;
    immediateReward: number;
    discountedFutureReward: number;
    tdError: number;
    totalCredit: number;
    eligibilityTrace: number;
  }>;
  totalTraceReward: number;
  valueEstimate: number;
  tdLambdaTrace: number[];
}

/**
 * Node credit: value attributed to specific nodes
 */
export interface NodeCredit {
  nodeId: string;
  nodeName: string;
  totalCredit: number;
  occurrences: number;
  averageCredit: number;
  variance: number;
}

/**
 * Strategy credit: value attributed to routing/search strategies
 */
export interface StrategyCredit {
  strategy: string;
  totalCredit: number;
  occurrences: number;
  averageCredit: number;
  successRate: number;
}

/**
 * Credit Assignment Engine Configuration
 */
export interface CreditAssignmentConfig {
  gamma?: number; // Discount factor (0.99)
  lambda?: number; // Eligibility trace decay (0.95)
  alpha?: number; // Learning rate (0.1)
  initialValueEstimate?: number; // Initial V estimate (0)
}

/**
 * Credit Assignment Engine - TD(λ) Learning
 */
export class CreditAssignmentEngine {
  private config: Required<CreditAssignmentConfig>;
  private valueEstimates: Map<string, number> = new Map(); // V(s) estimates
  private nodeCredits: Map<string, NodeCredit> = new Map();
  private strategyCredits: Map<string, StrategyCredit> = new Map();
  private eligibilityTraces: Map<string, number> = new Map();

  constructor(config?: CreditAssignmentConfig) {
    this.config = {
      gamma: config?.gamma ?? 0.99, // Discount future rewards
      lambda: config?.lambda ?? 0.95, // Eligibility trace decay
      alpha: config?.alpha ?? 0.1, // Learning rate
      initialValueEstimate: config?.initialValueEstimate ?? 0,
    };

    logger.info('[CreditAssignmentEngine] Initialized with TD(λ) learning', {
      gamma: this.config.gamma,
      lambda: this.config.lambda,
      alpha: this.config.alpha,
    });
  }

  /**
   * Compute credit assignment for a trace using TD(λ)
   */
  computeCredits(trace: ExecutionTrace): TDCreditAssignment {
    const stepCredits = [];

    // Initialize eligibility traces
    const actionKey = `${trace.action.intent}:${trace.action.strategy}`;
    let currentEligibility = this.eligibilityTraces.get(actionKey) ?? 0;

    // Get current and next value estimates
    const currentState = this.getStateKey(trace.observation);
    const nextState = this.getStateKey(trace.observation); // Simplified - use same state
    const V_current = this.valueEstimates.get(currentState) ?? this.config.initialValueEstimate;
    const V_next = this.valueEstimates.get(nextState) ?? this.config.initialValueEstimate;

    // Compute TD error
    const tdError = trace.reward.immediate + this.config.gamma * V_next - V_current;

    // Update eligibility trace for this action
    currentEligibility = 1 + this.config.lambda * this.config.gamma * currentEligibility;
    this.eligibilityTraces.set(actionKey, currentEligibility);

    // Compute credit for this step
    const stepCredit = {
      stepIndex: 0,
      actionType: trace.action.actionType,
      immediateReward: trace.reward.immediate,
      discountedFutureReward: this.config.gamma * V_next,
      tdError,
      totalCredit: tdError * currentEligibility,
      eligibilityTrace: currentEligibility,
    };

    stepCredits.push(stepCredit);

    // Update value estimate
    const newValue = V_current + this.config.alpha * tdError;
    this.valueEstimates.set(currentState, newValue);

    // Distribute credits to nodes
    this.assignNodeCredits(trace, stepCredit.totalCredit);

    // Distribute credits to strategies
    this.assignStrategyCredits(trace, stepCredit.totalCredit, trace.success);

    // Build TD lambda trace for analysis
    const tdLambdaTrace = this.buildTDLambdaTrace(stepCredits);

    const assignment: TDCreditAssignment = {
      traceId: trace.traceId,
      stepCredits,
      totalTraceReward: trace.reward.immediate,
      valueEstimate: newValue,
      tdLambdaTrace,
    };

    logger.debug('[CreditAssignmentEngine] Credits computed', {
      traceId: trace.traceId,
      tdError: tdError.toFixed(3),
      totalCredit: stepCredit.totalCredit.toFixed(3),
      newValue: newValue.toFixed(3),
    });

    return assignment;
  }

  /**
   * Assign credits to nodes mentioned in the trace
   */
  private assignNodeCredits(trace: ExecutionTrace, credit: number): void {
    // Credit nodes mentioned in the observation
    for (const nodeName of trace.observation.queryFeatures.mentionedNodes) {
      const nodeId = this.sanitizeKey(nodeName);

      let nodeCredit = this.nodeCredits.get(nodeId);
      if (!nodeCredit) {
        nodeCredit = {
          nodeId,
          nodeName,
          totalCredit: 0,
          occurrences: 0,
          averageCredit: 0,
          variance: 0,
        };
        this.nodeCredits.set(nodeId, nodeCredit);
      }

      // Update node credit statistics
      nodeCredit.totalCredit += credit;
      nodeCredit.occurrences++;
      nodeCredit.averageCredit = nodeCredit.totalCredit / nodeCredit.occurrences;
    }

    // If no nodes mentioned but results found, credit all results
    if (trace.observation.queryFeatures.mentionedNodes.length === 0 && trace.result.resultCount > 0) {
      // Distribute credit among result nodes
      const creditPerNode = credit / trace.result.resultCount;

      // This would require access to result nodes from trace
      // For now, just log
      logger.debug('[CreditAssignmentEngine] Distributed credit to results', {
        resultCount: trace.result.resultCount,
        creditPerNode: creditPerNode.toFixed(3),
      });
    }
  }

  /**
   * Assign credits to search/routing strategies
   */
  private assignStrategyCredits(trace: ExecutionTrace, credit: number, success: boolean): void {
    const strategyKey = trace.action.strategy;

    let strategyCredit = this.strategyCredits.get(strategyKey);
    if (!strategyCredit) {
      strategyCredit = {
        strategy: strategyKey,
        totalCredit: 0,
        occurrences: 0,
        averageCredit: 0,
        successRate: 0,
      };
      this.strategyCredits.set(strategyKey, strategyCredit);
    }

    // Update strategy credit statistics
    strategyCredit.totalCredit += credit;
    strategyCredit.occurrences++;
    strategyCredit.averageCredit = strategyCredit.totalCredit / strategyCredit.occurrences;

    // Update success rate
    const successCount = success ? 1 : 0;
    const oldSuccessCount = Math.round(strategyCredit.successRate * (strategyCredit.occurrences - 1));
    const newSuccessCount = oldSuccessCount + successCount;
    strategyCredit.successRate = newSuccessCount / strategyCredit.occurrences;
  }

  /**
   * Build TD lambda eligibility trace for analysis
   */
  private buildTDLambdaTrace(stepCredits: any[]): number[] {
    const trace: number[] = [];
    for (const step of stepCredits) {
      trace.push(step.eligibilityTrace);
    }
    return trace;
  }

  /**
   * Get node credits
   */
  getNodeCredits(sorted: boolean = true): NodeCredit[] {
    let credits = Array.from(this.nodeCredits.values());

    if (sorted) {
      credits.sort((a, b) => b.averageCredit - a.averageCredit);
    }

    return credits;
  }

  /**
   * Get strategy credits
   */
  getStrategyCredits(sorted: boolean = true): StrategyCredit[] {
    let credits = Array.from(this.strategyCredits.values());

    if (sorted) {
      credits.sort((a, b) => b.averageCredit - a.averageCredit);
    }

    return credits;
  }

  /**
   * Get single node credit
   */
  getNodeCredit(nodeId: string): NodeCredit | undefined {
    return this.nodeCredits.get(this.sanitizeKey(nodeId));
  }

  /**
   * Get single strategy credit
   */
  getStrategyCredit(strategy: string): StrategyCredit | undefined {
    return this.strategyCredits.get(strategy);
  }

  /**
   * Decay eligibility traces (for continuous learning)
   */
  decayEligibilityTraces(): void {
    for (const [key, trace] of this.eligibilityTraces.entries()) {
      const decayed = trace * this.config.lambda * this.config.gamma;
      if (decayed > 0.01) {
        // Keep if above threshold
        this.eligibilityTraces.set(key, decayed);
      } else {
        this.eligibilityTraces.delete(key);
      }
    }

    logger.debug('[CreditAssignmentEngine] Eligibility traces decayed', {
      remainingTraces: this.eligibilityTraces.size,
    });
  }

  /**
   * Reset eligibility traces
   */
  resetEligibilityTraces(): void {
    this.eligibilityTraces.clear();
    logger.info('[CreditAssignmentEngine] Eligibility traces reset');
  }

  /**
   * Get value estimate for state
   */
  getValueEstimate(stateKey: string): number {
    return this.valueEstimates.get(stateKey) ?? this.config.initialValueEstimate;
  }

  /**
   * Get all value estimates
   */
  getAllValueEstimates(): Record<string, number> {
    const estimates: Record<string, number> = {};
    for (const [key, value] of this.valueEstimates.entries()) {
      estimates[key] = value;
    }
    return estimates;
  }

  /**
   * Compute value function statistics
   */
  getValueStatistics(): {
    estimatedStates: number;
    averageValue: number;
    minValue: number;
    maxValue: number;
  } {
    if (this.valueEstimates.size === 0) {
      return {
        estimatedStates: 0,
        averageValue: 0,
        minValue: 0,
        maxValue: 0,
      };
    }

    const values = Array.from(this.valueEstimates.values());
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
      estimatedStates: this.valueEstimates.size,
      averageValue: average,
      minValue: min,
      maxValue: max,
    };
  }

  /**
   * Export credit assignments for analysis
   */
  exportCredits(): {
    nodes: NodeCredit[];
    strategies: StrategyCredit[];
    valueEstimates: Record<string, number>;
  } {
    return {
      nodes: this.getNodeCredits(true),
      strategies: this.getStrategyCredits(true),
      valueEstimates: this.getAllValueEstimates(),
    };
  }

  /**
   * Clear all credits (for new learning epoch)
   */
  clearCredits(): void {
    this.nodeCredits.clear();
    this.strategyCredits.clear();
    this.valueEstimates.clear();
    this.eligibilityTraces.clear();
    logger.info('[CreditAssignmentEngine] All credits cleared');
  }

  /**
   * Get configuration
   */
  getConfiguration(): Required<CreditAssignmentConfig> {
    return this.config;
  }

  /**
   * Generate state key from observation
   */
  private getStateKey(observation: any): string {
    // Simplified state representation - in production would use more features
    const features = [
      observation.queryFeatures.length,
      observation.queryFeatures.hasTechnicalTerms ? 1 : 0,
      observation.queryFeatures.hasServiceMentions ? 1 : 0,
      observation.queryFeatures.hasNodeMentions ? 1 : 0,
    ].join('-');

    return `state-${features}`;
  }

  /**
   * Sanitize key for storage
   */
  private sanitizeKey(key: string): string {
    return key.toLowerCase().replace(/\s+/g, '-');
  }
}

/**
 * Factory function to create credit assignment engine
 */
export function createCreditAssignmentEngine(config?: CreditAssignmentConfig): CreditAssignmentEngine {
  return new CreditAssignmentEngine(config);
}
