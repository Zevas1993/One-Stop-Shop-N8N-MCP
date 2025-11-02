/**
 * Quality Checker
 * Validates search results against 5 quality dimensions
 * Ensures all search results meet minimum quality standards before returning to users
 */

import { logger } from '../utils/logger';

/**
 * Quality check result for a single dimension
 */
export interface QualityScore {
  dimension: 'quantity' | 'relevance' | 'coverage' | 'diversity' | 'metadata';
  score: number; // 0-1
  threshold: number; // 0-1
  passed: boolean;
  details: string;
}

/**
 * Overall quality assessment
 */
export interface QualityAssessment {
  overallScore: number; // 0-1 (weighted average)
  passed: boolean; // true if all checks pass
  scores: QualityScore[];
  failedDimensions: string[];
  recommendations: string[];
  timestamp: number;
}

/**
 * Input data structure for quality checking
 */
export interface ResultSet {
  query: string;
  results: Array<{
    nodeId?: string;
    nodeName?: string;
    score: number;
    content: string;
    metadata?: Record<string, any>;
  }>;
  executionTimeMs: number;
  searchType?: 'embedding' | 'hybrid' | 'pattern-match' | 'property-based';
}

/**
 * Quality Checker - Validates search results across 5 dimensions
 */
export class QualityChecker {
  private readonly minQuantity: number = 2;
  private readonly maxQuantity: number = 50;
  private readonly minRelevanceScore: number = 0.5;
  private readonly minDiversityRatio: number = 0.3; // At least 30% of results should have different scores
  private readonly minCoverageMetadata: number = 0.6; // 60% of results should have metadata

  constructor(config?: {
    minQuantity?: number;
    maxQuantity?: number;
    minRelevanceScore?: number;
    minDiversityRatio?: number;
    minCoverageMetadata?: number;
  }) {
    if (config?.minQuantity) this.minQuantity = config.minQuantity;
    if (config?.maxQuantity) this.maxQuantity = config.maxQuantity;
    if (config?.minRelevanceScore) this.minRelevanceScore = config.minRelevanceScore;
    if (config?.minDiversityRatio) this.minDiversityRatio = config.minDiversityRatio;
    if (config?.minCoverageMetadata) this.minCoverageMetadata = config.minCoverageMetadata;

    logger.info('[QualityChecker] Initialized with quality standards', {
      minQuantity: this.minQuantity,
      maxQuantity: this.maxQuantity,
      minRelevanceScore: this.minRelevanceScore,
      minDiversityRatio: this.minDiversityRatio,
      minCoverageMetadata: this.minCoverageMetadata,
    });
  }

  /**
   * Check quality of a result set
   */
  async assess(resultSet: ResultSet): Promise<QualityAssessment> {
    const startTime = Date.now();

    logger.debug('[QualityChecker] Starting quality assessment:', {
      query: resultSet.query.substring(0, 100),
      resultCount: resultSet.results.length,
    });

    const scores: QualityScore[] = [];

    // Check 1: Quantity - Ensure we have enough results
    scores.push(this.checkQuantity(resultSet));

    // Check 2: Relevance - Ensure results are relevant
    scores.push(this.checkRelevance(resultSet));

    // Check 3: Coverage - Ensure comprehensive coverage of node types
    scores.push(this.checkCoverage(resultSet));

    // Check 4: Diversity - Ensure diversity in result scores
    scores.push(this.checkDiversity(resultSet));

    // Check 5: Metadata - Ensure results have required metadata
    scores.push(this.checkMetadata(resultSet));

    // Calculate overall score (weighted average)
    const overallScore = this.calculateWeightedScore(scores);

    // Determine if all checks passed
    const failedDimensions = scores.filter((s) => !s.passed).map((s) => s.dimension);
    const passed = failedDimensions.length === 0;

    // Generate recommendations for failed checks
    const recommendations = this.generateRecommendations(scores, resultSet);

    const assessment: QualityAssessment = {
      overallScore,
      passed,
      scores,
      failedDimensions,
      recommendations,
      timestamp: Date.now(),
    };

    const elapsed = Date.now() - startTime;
    logger.info('[QualityChecker] Quality assessment complete:', {
      overallScore: overallScore.toFixed(3),
      passed,
      failedDimensions,
      elapsed,
    });

    return assessment;
  }

  /**
   * Check 1: Quantity - Do we have enough results?
   */
  private checkQuantity(resultSet: ResultSet): QualityScore {
    const resultCount = resultSet.results.length;
    const passed = resultCount >= this.minQuantity && resultCount <= this.maxQuantity;

    let score = 0;
    if (resultCount === 0) {
      score = 0;
    } else if (resultCount < this.minQuantity) {
      score = resultCount / this.minQuantity;
    } else if (resultCount > this.maxQuantity) {
      score = Math.max(0, 1 - (resultCount - this.maxQuantity) / this.maxQuantity);
    } else {
      score = 1.0; // Ideal range
    }

    return {
      dimension: 'quantity',
      score: Math.min(score, 1),
      threshold: 0.7,
      passed,
      details: `${resultCount} results (min: ${this.minQuantity}, max: ${this.maxQuantity})`,
    };
  }

  /**
   * Check 2: Relevance - Are results above minimum relevance threshold?
   */
  private checkRelevance(resultSet: ResultSet): QualityScore {
    if (resultSet.results.length === 0) {
      return {
        dimension: 'relevance',
        score: 0,
        threshold: 0.7,
        passed: false,
        details: 'No results to assess',
      };
    }

    const relevantResults = resultSet.results.filter((r) => r.score >= this.minRelevanceScore);
    const relevanceRatio = relevantResults.length / resultSet.results.length;
    const averageScore = resultSet.results.reduce((sum, r) => sum + r.score, 0) / resultSet.results.length;

    const passed = relevanceRatio >= 0.8 && averageScore >= this.minRelevanceScore;

    return {
      dimension: 'relevance',
      score: Math.min(averageScore, 1),
      threshold: 0.7,
      passed,
      details: `Average score: ${averageScore.toFixed(3)}, Relevant: ${relevantResults.length}/${resultSet.results.length}`,
    };
  }

  /**
   * Check 3: Coverage - Do we have diverse node types?
   */
  private checkCoverage(resultSet: ResultSet): QualityScore {
    if (resultSet.results.length === 0) {
      return {
        dimension: 'coverage',
        score: 0,
        threshold: 0.6,
        passed: false,
        details: 'No results to assess',
      };
    }

    // Count unique node types
    const nodeNames = new Set(
      resultSet.results
        .filter((r) => r.nodeName)
        .map((r) => r.nodeName!)
    );

    const nodeIds = new Set(
      resultSet.results
        .filter((r) => r.nodeId)
        .map((r) => r.nodeId!)
    );

    const uniqueNodes = Math.max(nodeNames.size, nodeIds.size);
    const diversityRatio = uniqueNodes / resultSet.results.length;

    // Coverage score: higher is better
    const coverageScore = Math.min(diversityRatio, 1.0);
    const passed = diversityRatio >= 0.5; // At least 50% diversity

    return {
      dimension: 'coverage',
      score: coverageScore,
      threshold: 0.6,
      passed,
      details: `${uniqueNodes} unique nodes / ${resultSet.results.length} results (diversity: ${(diversityRatio * 100).toFixed(1)}%)`,
    };
  }

  /**
   * Check 4: Diversity - Are scores well-distributed?
   */
  private checkDiversity(resultSet: ResultSet): QualityScore {
    if (resultSet.results.length < 2) {
      return {
        dimension: 'diversity',
        score: 0.5,
        threshold: 0.5,
        passed: true,
        details: 'Not enough results to assess diversity',
      };
    }

    const scores = resultSet.results.map((r) => r.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const scoreRange = maxScore - minScore;

    // Count score buckets
    const buckets = {
      high: scores.filter((s) => s >= 0.8).length,
      medium: scores.filter((s) => s >= 0.6 && s < 0.8).length,
      low: scores.filter((s) => s < 0.6).length,
    };

    const nonEmptyBuckets = Object.values(buckets).filter((count) => count > 0).length;

    // Diversity score based on score range and bucket distribution
    const rangeScore = Math.min(scoreRange, 1);
    const bucketScore = nonEmptyBuckets / 3; // Up to 3 buckets
    const diversityScore = (rangeScore + bucketScore) / 2;

    const passed = nonEmptyBuckets >= 2; // At least 2 different score levels

    return {
      dimension: 'diversity',
      score: diversityScore,
      threshold: 0.5,
      passed,
      details: `Score range: ${minScore.toFixed(3)}-${maxScore.toFixed(3)}, Buckets: ${nonEmptyBuckets}, Distribution: H:${buckets.high} M:${buckets.medium} L:${buckets.low}`,
    };
  }

  /**
   * Check 5: Metadata - Do results have required metadata?
   */
  private checkMetadata(resultSet: ResultSet): QualityScore {
    if (resultSet.results.length === 0) {
      return {
        dimension: 'metadata',
        score: 0,
        threshold: 0.6,
        passed: false,
        details: 'No results to assess',
      };
    }

    const resultsWithMetadata = resultSet.results.filter((r) => r.metadata && Object.keys(r.metadata).length > 0);
    const metadataCoverage = resultsWithMetadata.length / resultSet.results.length;

    // Check for required metadata fields
    let requiredFieldsPresent = true;
    for (const result of resultSet.results) {
      if (result.metadata) {
        const hasRequiredFields = 'nodeName' in result || 'nodeId' in result || 'score' in result;
        if (!hasRequiredFields) {
          requiredFieldsPresent = false;
          break;
        }
      }
    }

    const passed = metadataCoverage >= this.minCoverageMetadata;

    return {
      dimension: 'metadata',
      score: metadataCoverage,
      threshold: 0.6,
      passed,
      details: `${resultsWithMetadata.length}/${resultSet.results.length} results have metadata (${(metadataCoverage * 100).toFixed(1)}%)`,
    };
  }

  /**
   * Calculate weighted score across all dimensions
   */
  private calculateWeightedScore(scores: QualityScore[]): number {
    // Weights: quantity, relevance, coverage, diversity, metadata
    const weights = {
      quantity: 0.2,
      relevance: 0.35, // Most important
      coverage: 0.2,
      diversity: 0.15,
      metadata: 0.1,
    };

    let totalWeight = 0;
    let weightedSum = 0;

    for (const score of scores) {
      const weight = weights[score.dimension] || 0;
      weightedSum += score.score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Generate recommendations for failed quality checks
   */
  private generateRecommendations(scores: QualityScore[], resultSet: ResultSet): string[] {
    const recommendations: string[] = [];

    for (const score of scores) {
      if (!score.passed) {
        switch (score.dimension) {
          case 'quantity':
            if (resultSet.results.length < this.minQuantity) {
              recommendations.push(
                `Try broadening your search query to find at least ${this.minQuantity} results (currently: ${resultSet.results.length})`
              );
            } else if (resultSet.results.length > this.maxQuantity) {
              recommendations.push(`Try using more specific search terms to narrow results to ${this.maxQuantity} max`);
            }
            break;

          case 'relevance':
            recommendations.push(
              'Consider refining your query to match node properties more closely. Use technical terms or node names.'
            );
            break;

          case 'coverage':
            recommendations.push(
              'Results are showing too many instances of similar nodes. Try searching for different aspects (properties, services, workflows).'
            );
            break;

          case 'diversity':
            recommendations.push(
              'Results have inconsistent relevance scores. This may indicate a weak match. Consider rephrasing your query.'
            );
            break;

          case 'metadata':
            recommendations.push('Results are missing metadata. The search backend may need to refresh node information.');
            break;
        }
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Results meet quality standards. Good match for your query!');
    }

    return recommendations;
  }

  /**
   * Get quality standards configuration
   */
  getQualityStandards(): {
    minQuantity: number;
    maxQuantity: number;
    minRelevanceScore: number;
    minDiversityRatio: number;
    minCoverageMetadata: number;
  } {
    return {
      minQuantity: this.minQuantity,
      maxQuantity: this.maxQuantity,
      minRelevanceScore: this.minRelevanceScore,
      minDiversityRatio: this.minDiversityRatio,
      minCoverageMetadata: this.minCoverageMetadata,
    };
  }
}

/**
 * Factory function to create quality checker
 */
export function createQualityChecker(config?: {
  minQuantity?: number;
  maxQuantity?: number;
  minRelevanceScore?: number;
  minDiversityRatio?: number;
  minCoverageMetadata?: number;
}): QualityChecker {
  return new QualityChecker(config);
}
