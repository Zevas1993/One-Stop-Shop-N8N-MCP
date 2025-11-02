/**
 * Node Value Calculator
 * Computes performance values for each n8n node based on historical usage
 * Enables intelligent node recommendations based on empirical performance
 */

import { logger } from '../utils/logger';
import { NodeCredit } from './credit-assignment';

/**
 * Node Performance Metrics
 */
export interface NodePerformance {
  nodeId: string;
  nodeName: string;

  // Usage statistics
  usageCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;

  // Credit-based metrics
  totalCredit: number;
  averageCredit: number;
  creditVariance: number;

  // Efficiency metrics
  averageExecutionTime: number;
  averageQualityScore: number;

  // Composite value score (0-1)
  valueScore: number;

  // Ranking
  rank: number;
  tier: 'gold' | 'silver' | 'bronze' | 'standard';
}

/**
 * Node Value Calculator Configuration
 */
export interface NodeValueConfig {
  // Weights for value computation
  weights?: {
    successRate?: number;
    creditScore?: number;
    qualityScore?: number;
    efficiencyScore?: number;
  };
  // Thresholds for tiers
  goldThreshold?: number; // 0.8
  silverThreshold?: number; // 0.6
  bronzeThreshold?: number; // 0.4
  // Learning parameters
  minUsageForRecommendation?: number; // Minimum uses before recommending
  decayFactor?: number; // How much to decay old performance
}

/**
 * Node Value Calculator
 */
export class NodeValueCalculator {
  private nodeMetrics: Map<string, NodePerformance> = new Map();
  private executionHistory: Array<{
    nodeId: string;
    success: boolean;
    credit: number;
    executionTime: number;
    qualityScore: number;
    timestamp: number;
  }> = [];
  private config: Required<NodeValueConfig>;

  constructor(config?: NodeValueConfig) {
    this.config = {
      weights: {
        successRate: config?.weights?.successRate ?? 0.35,
        creditScore: config?.weights?.creditScore ?? 0.3,
        qualityScore: config?.weights?.qualityScore ?? 0.2,
        efficiencyScore: config?.weights?.efficiencyScore ?? 0.15,
      },
      goldThreshold: config?.goldThreshold ?? 0.8,
      silverThreshold: config?.silverThreshold ?? 0.6,
      bronzeThreshold: config?.bronzeThreshold ?? 0.4,
      minUsageForRecommendation: config?.minUsageForRecommendation ?? 5,
      decayFactor: config?.decayFactor ?? 0.95,
    };

    logger.info('[NodeValueCalculator] Initialized for node performance valuation', {
      minUsageForRecommendation: this.config.minUsageForRecommendation,
      goldThreshold: this.config.goldThreshold,
    });
  }

  /**
   * Record node usage and compute updated metrics
   */
  recordNodeUsage(
    nodeId: string,
    nodeName: string,
    success: boolean,
    credit: number,
    executionTime: number,
    qualityScore: number
  ): NodePerformance {
    // Add to history
    this.executionHistory.push({
      nodeId,
      success,
      credit,
      executionTime,
      qualityScore,
      timestamp: Date.now(),
    });

    // Get or create metrics
    let metrics = this.nodeMetrics.get(nodeId);
    if (!metrics) {
      metrics = {
        nodeId,
        nodeName,
        usageCount: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        totalCredit: 0,
        averageCredit: 0,
        creditVariance: 0,
        averageExecutionTime: 0,
        averageQualityScore: 0,
        valueScore: 0,
        rank: 0,
        tier: 'standard',
      };
      this.nodeMetrics.set(nodeId, metrics);
    }

    // Update metrics
    metrics.usageCount++;
    if (success) {
      metrics.successCount++;
    } else {
      metrics.failureCount++;
    }
    metrics.successRate = metrics.successCount / metrics.usageCount;
    metrics.totalCredit += credit;
    metrics.averageCredit = metrics.totalCredit / metrics.usageCount;
    metrics.averageExecutionTime =
      (metrics.averageExecutionTime * (metrics.usageCount - 1) + executionTime) / metrics.usageCount;
    metrics.averageQualityScore =
      (metrics.averageQualityScore * (metrics.usageCount - 1) + qualityScore) / metrics.usageCount;

    // Compute value score
    metrics.valueScore = this.computeValueScore(metrics);
    metrics.tier = this.assignTier(metrics.valueScore);

    logger.debug('[NodeValueCalculator] Node usage recorded', {
      nodeId,
      usageCount: metrics.usageCount,
      successRate: metrics.successRate.toFixed(2),
      valueScore: metrics.valueScore.toFixed(3),
    });

    return metrics;
  }

  /**
   * Update metrics from credit assignment
   */
  updateFromCredits(credits: NodeCredit[]): void {
    for (const credit of credits) {
      const metrics = this.nodeMetrics.get(credit.nodeId);
      if (metrics) {
        // Update credit-based metrics
        metrics.totalCredit = credit.totalCredit;
        metrics.averageCredit = credit.averageCredit;
        metrics.valueScore = this.computeValueScore(metrics);
        metrics.tier = this.assignTier(metrics.valueScore);
      }
    }

    logger.debug('[NodeValueCalculator] Metrics updated from credits', {
      nodesUpdated: credits.length,
    });
  }

  /**
   * Compute composite value score (0-1)
   */
  private computeValueScore(metrics: NodePerformance): number {
    const weights = this.config.weights;

    // Normalize metrics to 0-1 range
    const successRateScore = metrics.successRate;

    // Credit score: normalize to 0-1 (assume credits are typically -1 to 1)
    const creditScore = Math.max(0, (metrics.averageCredit + 1) / 2);

    // Quality score: already 0-1
    const qualityScore = Math.max(0, Math.min(1, metrics.averageQualityScore));

    // Efficiency score: normalize execution time (lower is better)
    // Assume 5000ms is maximum acceptable
    const efficiencyScore = Math.max(0, 1 - metrics.averageExecutionTime / 5000);

    // Compute weighted sum
    const valueScore =
      successRateScore * (weights.successRate ?? 0.35) +
      creditScore * (weights.creditScore ?? 0.3) +
      qualityScore * (weights.qualityScore ?? 0.2) +
      efficiencyScore * (weights.efficiencyScore ?? 0.15);

    return Math.max(0, Math.min(1, valueScore));
  }

  /**
   * Assign performance tier
   */
  private assignTier(score: number): 'gold' | 'silver' | 'bronze' | 'standard' {
    if (score >= this.config.goldThreshold) {
      return 'gold';
    } else if (score >= this.config.silverThreshold) {
      return 'silver';
    } else if (score >= this.config.bronzeThreshold) {
      return 'bronze';
    } else {
      return 'standard';
    }
  }

  /**
   * Get node performance
   */
  getNodePerformance(nodeId: string): NodePerformance | undefined {
    return this.nodeMetrics.get(nodeId);
  }

  /**
   * Get all node performances
   */
  getAllNodePerformances(sorted: boolean = true): NodePerformance[] {
    let performances = Array.from(this.nodeMetrics.values());

    if (sorted) {
      // Rank and sort by value score
      performances.sort((a, b) => b.valueScore - a.valueScore);
      performances.forEach((p, index) => {
        p.rank = index + 1;
      });
    }

    return performances;
  }

  /**
   * Get top nodes by value
   */
  getTopNodes(count: number = 10): NodePerformance[] {
    return this.getAllNodePerformances(true).slice(0, count);
  }

  /**
   * Get nodes by tier
   */
  getNodesByTier(tier: 'gold' | 'silver' | 'bronze' | 'standard'): NodePerformance[] {
    return this.getAllNodePerformances(true).filter((p) => p.tier === tier);
  }

  /**
   * Get recommended nodes for a query/intent
   */
  getRecommendedNodes(intent: string, limit: number = 5): NodePerformance[] {
    // Get all nodes with sufficient usage
    const candidates = this.getAllNodePerformances(true).filter(
      (p) => p.usageCount >= this.config.minUsageForRecommendation
    );

    // Return top nodes sorted by value
    return candidates.slice(0, limit);
  }

  /**
   * Get nodes that are underperforming
   */
  getUnderperformingNodes(threshold: number = 0.3): NodePerformance[] {
    return this.getAllNodePerformances(true).filter(
      (p) => p.valueScore < threshold && p.usageCount >= this.config.minUsageForRecommendation
    );
  }

  /**
   * Compute statistics across all nodes
   */
  getStatistics(): {
    totalNodes: number;
    goldNodes: number;
    silverNodes: number;
    bronzeNodes: number;
    standardNodes: number;
    averageValueScore: number;
    averageSuccessRate: number;
    totalUsages: number;
  } {
    const performances = this.getAllNodePerformances(false);

    if (performances.length === 0) {
      return {
        totalNodes: 0,
        goldNodes: 0,
        silverNodes: 0,
        bronzeNodes: 0,
        standardNodes: 0,
        averageValueScore: 0,
        averageSuccessRate: 0,
        totalUsages: 0,
      };
    }

    const tiers = {
      gold: performances.filter((p) => p.tier === 'gold').length,
      silver: performances.filter((p) => p.tier === 'silver').length,
      bronze: performances.filter((p) => p.tier === 'bronze').length,
      standard: performances.filter((p) => p.tier === 'standard').length,
    };

    const avgValueScore = performances.reduce((sum, p) => sum + p.valueScore, 0) / performances.length;
    const avgSuccessRate = performances.reduce((sum, p) => sum + p.successRate, 0) / performances.length;
    const totalUsages = performances.reduce((sum, p) => sum + p.usageCount, 0);

    return {
      totalNodes: performances.length,
      goldNodes: tiers.gold,
      silverNodes: tiers.silver,
      bronzeNodes: tiers.bronze,
      standardNodes: tiers.standard,
      averageValueScore: avgValueScore,
      averageSuccessRate: avgSuccessRate,
      totalUsages,
    };
  }

  /**
   * Export performance data
   */
  exportPerformances(tier?: 'gold' | 'silver' | 'bronze' | 'standard'): NodePerformance[] {
    let performances = this.getAllNodePerformances(true);

    if (tier) {
      performances = performances.filter((p) => p.tier === tier);
    }

    return performances;
  }

  /**
   * Clear performance data
   */
  clearMetrics(): void {
    this.nodeMetrics.clear();
    this.executionHistory = [];
    logger.info('[NodeValueCalculator] All metrics cleared');
  }

  /**
   * Decay older history to reduce outdated data influence
   */
  decayHistory(): void {
    const now = Date.now();
    const decayFactor = this.config.decayFactor;
    let historyCutoff = Date.now() - 86400000; // 24 hours

    // Keep only recent history
    this.executionHistory = this.executionHistory.filter((h) => h.timestamp > historyCutoff);

    logger.debug('[NodeValueCalculator] History decayed', {
      remainingRecords: this.executionHistory.length,
    });
  }

  /**
   * Get performance trend for a node
   */
  getNodeTrend(nodeId: string): {
    recentSuccessRate: number;
    recentAverageScore: number;
    trend: 'improving' | 'stable' | 'declining';
  } {
    const nodeHistory = this.executionHistory.filter((h) => h.nodeId === nodeId);

    if (nodeHistory.length === 0) {
      return {
        recentSuccessRate: 0,
        recentAverageScore: 0,
        trend: 'stable',
      };
    }

    const recentCount = Math.min(10, nodeHistory.length);
    const recentHistory = nodeHistory.slice(-recentCount);
    const olderHistory = nodeHistory.slice(0, Math.max(0, nodeHistory.length - recentCount));

    const recentSuccessRate = recentHistory.filter((h) => h.success).length / recentHistory.length;
    const recentAverageScore = recentHistory.reduce((sum, h) => sum + h.qualityScore, 0) / recentHistory.length;

    // Determine trend
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (olderHistory.length > 0) {
      const olderSuccessRate = olderHistory.filter((h) => h.success).length / olderHistory.length;
      if (recentSuccessRate > olderSuccessRate + 0.1) {
        trend = 'improving';
      } else if (recentSuccessRate < olderSuccessRate - 0.1) {
        trend = 'declining';
      }
    }

    return { recentSuccessRate, recentAverageScore, trend };
  }

  /**
   * Get configuration
   */
  getConfiguration(): Required<NodeValueConfig> {
    return this.config;
  }
}

/**
 * Factory function to create node value calculator
 */
export function createNodeValueCalculator(config?: NodeValueConfig): NodeValueCalculator {
  return new NodeValueCalculator(config);
}
