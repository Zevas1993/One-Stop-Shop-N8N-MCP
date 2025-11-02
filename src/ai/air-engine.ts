/**
 * Automatic Intermediate Rewarding (AIR) Engine
 * Computes intermediate rewards automatically from execution traces
 * Enables reinforcement learning without explicit user feedback
 */

import { logger } from '../utils/logger';
import { ExecutionTrace } from './trace-collector';
import { QualityAssessment } from './quality-checker';

/**
 * Reward components breakdown
 */
export interface RewardComponents {
  qualityReward: number; // Based on result quality (-1 to 1)
  efficiencyReward: number; // Based on execution efficiency (-1 to 1)
  explorationBonus: number; // Bonus for trying new strategies (-0.1 to 0.2)
  userFeedbackReward?: number; // From explicit user feedback (-1 to 1)
  implicit: number; // Implicit quality signals (0 to 0.3)
}

/**
 * Quality reward factors
 */
export interface QualityRewardFactors {
  quantityScore: number; // Do we have results?
  relevanceScore: number; // Are they relevant?
  coverageScore: number; // Is coverage diverse?
  diversityScore: number; // Is diversity good?
  metadataScore: number; // Do results have metadata?
  noErrorsBonus: number; // Bonus if no validation errors
}

/**
 * AIR Engine Configuration
 */
export interface AIRConfig {
  // Quality weights
  qualityWeights?: {
    quantity?: number;
    relevance?: number;
    coverage?: number;
    diversity?: number;
    metadata?: number;
  };
  // Efficiency targets
  targetExecutionTime?: number; // ms
  maxAcceptableTime?: number; // ms
  // Exploration strategy
  explorationDecay?: number; // How fast to reduce exploration bonus
  useContextualRewards?: boolean; // Use user expertise for scaling
}

/**
 * AIR Engine - Automatic Intermediate Rewarding
 */
export class AIREngine {
  private config: Required<AIRConfig>;
  private actionHistory: Map<string, { count: number; avgReward: number }> = new Map();

  constructor(config?: AIRConfig) {
    this.config = {
      qualityWeights: {
        quantity: config?.qualityWeights?.quantity ?? 0.15,
        relevance: config?.qualityWeights?.relevance ?? 0.35,
        coverage: config?.qualityWeights?.coverage ?? 0.2,
        diversity: config?.qualityWeights?.diversity ?? 0.15,
        metadata: config?.qualityWeights?.metadata ?? 0.15,
      },
      targetExecutionTime: config?.targetExecutionTime ?? 1000,
      maxAcceptableTime: config?.maxAcceptableTime ?? 5000,
      explorationDecay: config?.explorationDecay ?? 0.99,
      useContextualRewards: config?.useContextualRewards ?? true,
    };

    logger.info('[AIREngine] Initialized with automatic reward computation', {
      targetExecutionTime: this.config.targetExecutionTime,
      maxAcceptableTime: this.config.maxAcceptableTime,
    });
  }

  /**
   * Compute automatic reward for a trace
   */
  computeReward(
    trace: ExecutionTrace,
    qualityAssessment: QualityAssessment,
    userFeedback?: { rating?: number; isUserSatisfied?: boolean }
  ): { components: RewardComponents; immediate: number; reasoning: string[] } {
    const reasons: string[] = [];

    // 1. Compute quality reward
    const qualityReward = this.computeQualityReward(qualityAssessment, reasons);

    // 2. Compute efficiency reward
    const efficiencyReward = this.computeEfficiencyReward(trace.result.executionTimeMs, reasons);

    // 3. Compute exploration bonus
    const actionKey = `${trace.action.intent}:${trace.action.strategy}`;
    const explorationBonus = this.computeExplorationBonus(actionKey, reasons);

    // 4. Compute user feedback reward (if available)
    const userFeedbackReward = userFeedback?.rating
      ? (userFeedback.rating - 3) / 2 // Scale 1-5 to -1 to 1
      : undefined;

    // 5. Implicit signals (no errors, metadata complete, etc.)
    const implicitReward = this.computeImplicitReward(
      trace,
      qualityAssessment,
      userFeedback?.isUserSatisfied,
      reasons
    );

    const components: RewardComponents = {
      qualityReward,
      efficiencyReward,
      explorationBonus,
      userFeedbackReward,
      implicit: implicitReward,
    };

    // Compute immediate reward (weighted sum)
    const immediate = this.computeImmediate(components);

    // Apply contextual scaling
    let contextualImmediate = immediate;
    if (this.config.useContextualRewards && trace.metadata.userExpertise) {
      contextualImmediate = this.applyContextualScaling(immediate, trace.metadata.userExpertise);
    }

    logger.debug('[AIREngine] Reward computed', {
      traceId: trace.traceId,
      immediate: contextualImmediate.toFixed(3),
      components: {
        quality: qualityReward.toFixed(3),
        efficiency: efficiencyReward.toFixed(3),
        exploration: explorationBonus.toFixed(3),
      },
    });

    return {
      components,
      immediate: contextualImmediate,
      reasoning: reasons,
    };
  }

  /**
   * Compute quality reward from quality assessment
   */
  private computeQualityReward(assessment: QualityAssessment, reasons: string[]): number {
    const weights = this.config.qualityWeights;

    // Find individual scores
    const scores = {
      quantity: assessment.scores.find((s) => s.dimension === 'quantity')?.score ?? 0,
      relevance: assessment.scores.find((s) => s.dimension === 'relevance')?.score ?? 0,
      coverage: assessment.scores.find((s) => s.dimension === 'coverage')?.score ?? 0,
      diversity: assessment.scores.find((s) => s.dimension === 'diversity')?.score ?? 0,
      metadata: assessment.scores.find((s) => s.dimension === 'metadata')?.score ?? 0,
    };

    const qualityReward =
      scores.quantity * (weights.quantity ?? 0.15) +
      scores.relevance * (weights.relevance ?? 0.35) +
      scores.coverage * (weights.coverage ?? 0.2) +
      scores.diversity * (weights.diversity ?? 0.15) +
      scores.metadata * (weights.metadata ?? 0.15);

    // Convert to -1 to 1 scale (0 is neutral, negative is bad, positive is good)
    const normalizedReward = qualityReward * 2 - 1;

    if (qualityReward > 0.8) {
      reasons.push(`Excellent quality score: ${(qualityReward * 100).toFixed(0)}%`);
    } else if (qualityReward < 0.3) {
      reasons.push(`Poor quality score: ${(qualityReward * 100).toFixed(0)}%`);
    } else {
      reasons.push(`Fair quality score: ${(qualityReward * 100).toFixed(0)}%`);
    }

    return Math.max(-1, Math.min(1, normalizedReward));
  }

  /**
   * Compute efficiency reward based on execution time
   */
  private computeEfficiencyReward(executionTimeMs: number, reasons: string[]): number {
    const target = this.config.targetExecutionTime;
    const maxAcceptable = this.config.maxAcceptableTime;

    let efficiencyReward = 0;

    if (executionTimeMs <= target) {
      // Fast execution: reward increases from 0 to 1
      efficiencyReward = Math.min(1, (target - executionTimeMs) / target);
      reasons.push(`Fast execution: ${executionTimeMs}ms (target: ${target}ms)`);
    } else if (executionTimeMs <= maxAcceptable) {
      // Acceptable but slow: reward decreases from 0 to -0.5
      const overage = executionTimeMs - target;
      const maxOverage = maxAcceptable - target;
      efficiencyReward = -0.5 * (overage / maxOverage);
      reasons.push(`Slow execution: ${executionTimeMs}ms (max: ${maxAcceptable}ms)`);
    } else {
      // Too slow: penalize
      efficiencyReward = -1;
      reasons.push(`Very slow execution: ${executionTimeMs}ms (max: ${maxAcceptable}ms)`);
    }

    return Math.max(-1, Math.min(1, efficiencyReward));
  }

  /**
   * Compute exploration bonus to encourage trying new strategies
   */
  private computeExplorationBonus(actionKey: string, reasons: string[]): number {
    const history = this.actionHistory.get(actionKey);

    if (!history) {
      // First time trying this action - give exploration bonus
      this.actionHistory.set(actionKey, { count: 1, avgReward: 0 });
      reasons.push(`First attempt at action: ${actionKey}`);
      return 0.2; // Maximum exploration bonus
    }

    history.count++;

    // Reduce exploration bonus as we use the action more
    // Formula: 0.2 * (0.99)^count
    const bonus = 0.2 * Math.pow(this.config.explorationDecay, history.count);

    if (bonus > 0.15) {
      reasons.push(`Exploration bonus for relatively new action: ${bonus.toFixed(3)}`);
    }

    return bonus;
  }

  /**
   * Compute implicit reward from execution signals
   */
  private computeImplicitReward(
    trace: ExecutionTrace,
    assessment: QualityAssessment,
    isUserSatisfied?: boolean,
    reasons?: string[]
  ): number {
    let implicit = 0;

    // No validation errors = small bonus
    if (trace.result.errors === 0) {
      implicit += 0.1;
      reasons?.push('No validation errors');
    }

    // Has metadata = small bonus
    if (trace.result.resultCount > 0) {
      const hasMetadata = (trace.result.resultCount * 0.6) / trace.result.resultCount; // 60% coverage target
      implicit += hasMetadata * 0.05;
    }

    // User explicitly satisfied = bonus
    if (isUserSatisfied) {
      implicit += 0.15;
      reasons?.push('User satisfaction signal');
    }

    // All quality checks passed = bonus
    if (assessment.passed) {
      implicit += 0.1;
      reasons?.push('All quality checks passed');
    }

    return Math.min(implicit, 0.3);
  }

  /**
   * Compute immediate reward from components
   */
  private computeImmediate(components: RewardComponents): number {
    // Weighted average
    let total = 0;
    let totalWeight = 0;

    // Quality is most important
    total += components.qualityReward * 0.5;
    totalWeight += 0.5;

    // Efficiency is important
    total += components.efficiencyReward * 0.2;
    totalWeight += 0.2;

    // Exploration bonus for exploration
    total += components.explorationBonus * 0.15;
    totalWeight += 0.15;

    // Implicit signals
    total += components.implicit * 0.1;
    totalWeight += 0.1;

    // User feedback if available
    if (components.userFeedbackReward !== undefined) {
      total += components.userFeedbackReward * 0.25;
      totalWeight += 0.25;
    }

    return totalWeight > 0 ? total / totalWeight : 0;
  }

  /**
   * Apply contextual scaling based on user expertise
   */
  private applyContextualScaling(reward: number, expertise: 'beginner' | 'intermediate' | 'expert'): number {
    // Beginners: More forgiving (reduce negative rewards, amplify positive)
    // Experts: Stricter standards (amplify both positive and negative)
    const scales = {
      beginner: { negative: 0.7, positive: 1.1 },
      intermediate: { negative: 0.9, positive: 1.0 },
      expert: { negative: 1.2, positive: 1.0 },
    };

    const scale = scales[expertise];
    if (reward < 0) {
      return reward * scale.negative;
    } else {
      return reward * scale.positive;
    }
  }

  /**
   * Get action statistics
   */
  getActionStatistics(): {
    totalActionsAttempted: number;
    actionsWithHistory: number;
    averageRewardByAction: Record<string, number>;
  } {
    const averageRewardByAction: Record<string, number> = {};

    for (const [action, history] of this.actionHistory.entries()) {
      averageRewardByAction[action] = history.avgReward;
    }

    return {
      totalActionsAttempted: this.actionHistory.size,
      actionsWithHistory: this.actionHistory.size,
      averageRewardByAction,
    };
  }

  /**
   * Reset action history
   */
  resetActionHistory(): void {
    this.actionHistory.clear();
    logger.info('[AIREngine] Action history reset');
  }

  /**
   * Get AIR configuration
   */
  getConfiguration(): Required<AIRConfig> {
    return this.config;
  }
}

/**
 * Factory function to create AIR engine
 */
export function createAIREngine(config?: AIRConfig): AIREngine {
  return new AIREngine(config);
}
