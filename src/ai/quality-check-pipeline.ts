/**
 * Quality Check Pipeline
 * Integrates quality checking into the search result processing pipeline
 * Provides multi-stage validation: result validation → quality assessment → filtered results
 */

import { logger } from '../utils/logger';
import { QualityChecker, QualityAssessment, ResultSet } from './quality-checker';
import { ResultValidator, ValidationResult } from './result-validator';

/**
 * Pipeline result with quality metadata
 */
export interface PipelineResult {
  originalResults: any[];
  filteredResults: any[];
  validationResults: ValidationResult[];
  qualityAssessment: QualityAssessment;
  pipeline: {
    totalInputs: number;
    passedValidation: number;
    failedValidation: number;
    qualityScore: number;
    qualityPassed: boolean;
    executionTimeMs: number;
    filteringApplied: {
      minScoreFilter: number;
      errorFilter: boolean;
      warningFilter: 'strict' | 'lenient' | 'none';
    };
  };
}

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  minScoreFilter?: number; // Minimum result score to keep
  filterErrors?: boolean; // Remove results with validation errors
  filterWarnings?: 'strict' | 'lenient' | 'none'; // How strict to be with warnings
  qualityCheckConfig?: {
    minQuantity?: number;
    maxQuantity?: number;
    minRelevanceScore?: number;
    minDiversityRatio?: number;
    minCoverageMetadata?: number;
  };
  validatorConfig?: {
    minContentLength?: number;
    maxContentLength?: number;
    requiredFields?: string[];
    recommendedFields?: string[];
  };
}

/**
 * Quality Check Pipeline
 */
export class QualityCheckPipeline {
  private qualityChecker: QualityChecker;
  private resultValidator: ResultValidator;
  private config: Required<PipelineConfig>;

  constructor(config?: PipelineConfig) {
    this.qualityChecker = new QualityChecker(config?.qualityCheckConfig);
    this.resultValidator = new ResultValidator(config?.validatorConfig);

    this.config = {
      minScoreFilter: config?.minScoreFilter ?? 0.3,
      filterErrors: config?.filterErrors ?? true,
      filterWarnings: config?.filterWarnings ?? 'lenient',
      qualityCheckConfig: config?.qualityCheckConfig || {},
      validatorConfig: config?.validatorConfig || {},
    };

    logger.info('[QualityCheckPipeline] Initialized', {
      minScoreFilter: this.config.minScoreFilter,
      filterErrors: this.config.filterErrors,
      filterWarnings: this.config.filterWarnings,
    });
  }

  /**
   * Process results through quality pipeline
   */
  async process(
    results: any[],
    query: string,
    searchType?: 'embedding' | 'hybrid' | 'pattern-match' | 'property-based'
  ): Promise<PipelineResult> {
    const startTime = Date.now();

    logger.debug('[QualityCheckPipeline] Starting pipeline processing', {
      resultCount: results.length,
      query: query.substring(0, 100),
    });

    // Stage 1: Validate individual results
    const validationBatch = await this.resultValidator.validateBatch(results);

    logger.debug('[QualityCheckPipeline] Stage 1 complete: Result validation', {
      validResults: validationBatch.summary.validResults,
      invalidResults: validationBatch.summary.invalidResults,
      errorCount: validationBatch.summary.errorCount,
    });

    // Stage 2: Quality assessment of overall result set
    const resultSet: ResultSet = {
      query,
      results: results.map((r, idx) => ({
        nodeId: r.nodeId,
        nodeName: r.nodeName,
        score: r.score,
        content: r.content,
        metadata: r.metadata,
      })),
      executionTimeMs: 0,
      searchType,
    };

    const qualityAssessment = await this.qualityChecker.assess(resultSet);

    logger.debug('[QualityCheckPipeline] Stage 2 complete: Quality assessment', {
      overallScore: qualityAssessment.overallScore.toFixed(3),
      passed: qualityAssessment.passed,
      failedDimensions: qualityAssessment.failedDimensions,
    });

    // Stage 3: Filter results based on validation and configuration
    const filteredResults = this.filterResults(
      results,
      validationBatch.results,
      qualityAssessment
    );

    logger.debug('[QualityCheckPipeline] Stage 3 complete: Result filtering', {
      originalCount: results.length,
      filteredCount: filteredResults.length,
      removed: results.length - filteredResults.length,
    });

    const executionTime = Date.now() - startTime;

    const pipelineResult: PipelineResult = {
      originalResults: results,
      filteredResults,
      validationResults: validationBatch.results,
      qualityAssessment,
      pipeline: {
        totalInputs: results.length,
        passedValidation: validationBatch.summary.validResults,
        failedValidation: validationBatch.summary.invalidResults,
        qualityScore: qualityAssessment.overallScore,
        qualityPassed: qualityAssessment.passed,
        executionTimeMs: executionTime,
        filteringApplied: {
          minScoreFilter: this.config.minScoreFilter,
          errorFilter: this.config.filterErrors,
          warningFilter: this.config.filterWarnings,
        },
      },
    };

    logger.info('[QualityCheckPipeline] Processing complete', {
      totalTime: executionTime,
      inputResults: results.length,
      outputResults: filteredResults.length,
      qualityScore: qualityAssessment.overallScore.toFixed(3),
    });

    return pipelineResult;
  }

  /**
   * Filter results based on validation results and configuration
   */
  private filterResults(
    originalResults: any[],
    validationResults: Array<ValidationResult & { index: number }>,
    qualityAssessment: QualityAssessment
  ): any[] {
    const filtered: any[] = [];

    for (const validation of validationResults) {
      const result = originalResults[validation.index];

      // Check 1: Minimum score filter
      if (result.score < this.config.minScoreFilter) {
        logger.debug('[QualityCheckPipeline] Filtering out low-score result', {
          index: validation.index,
          score: result.score,
          threshold: this.config.minScoreFilter,
        });
        continue;
      }

      // Check 2: Error filtering
      if (this.config.filterErrors && validation.errors.length > 0) {
        logger.debug('[QualityCheckPipeline] Filtering out result with errors', {
          index: validation.index,
          errorCount: validation.errors.length,
        });
        continue;
      }

      // Check 3: Warning filtering
      if (validation.warnings.length > 0) {
        if (this.config.filterWarnings === 'strict') {
          logger.debug('[QualityCheckPipeline] Filtering out result with warnings (strict)', {
            index: validation.index,
            warningCount: validation.warnings.length,
          });
          continue;
        } else if (this.config.filterWarnings === 'lenient') {
          // Allow warnings but downweight the result slightly
          if (validation.score < 0.3) {
            logger.debug('[QualityCheckPipeline] Filtering out low-scoring result with warnings', {
              index: validation.index,
              score: validation.score,
            });
            continue;
          }
        }
        // 'none' = keep all results regardless of warnings
      }

      // Result passed all filters
      filtered.push(result);
    }

    // Return at minimum 1 result if available, or enforce quality-based filtering
    if (filtered.length === 0 && originalResults.length > 0) {
      logger.warn('[QualityCheckPipeline] All results filtered out, returning top result', {
        originalCount: originalResults.length,
      });
      // Return the single best result by score
      return [originalResults.reduce((best, current) =>
        current.score > best.score ? current : best
      )];
    }

    return filtered;
  }

  /**
   * Get pipeline configuration
   */
  getConfiguration(): {
    minScoreFilter: number;
    filterErrors: boolean;
    filterWarnings: string;
  } {
    return {
      minScoreFilter: this.config.minScoreFilter,
      filterErrors: this.config.filterErrors,
      filterWarnings: this.config.filterWarnings,
    };
  }

  /**
   * Get quality checker instance (for direct use)
   */
  getQualityChecker(): QualityChecker {
    return this.qualityChecker;
  }

  /**
   * Get result validator instance (for direct use)
   */
  getResultValidator(): ResultValidator {
    return this.resultValidator;
  }
}

/**
 * Factory function to create quality check pipeline
 */
export function createQualityCheckPipeline(config?: PipelineConfig): QualityCheckPipeline {
  return new QualityCheckPipeline(config);
}
