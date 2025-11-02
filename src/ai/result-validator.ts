/**
 * Result Validator
 * Comprehensive validation of individual search results
 * Ensures each result meets content, structure, and semantic requirements
 */

import { logger } from '../utils/logger';

/**
 * Validation error for a single issue
 */
export interface ValidationError {
  field: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

/**
 * Validation result for a single result item
 */
export interface ValidationResult {
  isValid: boolean;
  score: number; // 0-1
  errors: ValidationError[];
  warnings: ValidationError[];
  metadata: {
    validFields: string[];
    missingFields: string[];
    contentLength: number;
    hasMetadata: boolean;
    scoreIsValid: boolean;
  };
}

/**
 * Result object to validate
 */
export interface SearchResultItem {
  nodeId?: string;
  nodeName?: string;
  score: number;
  content: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

/**
 * Result Validator - Validates individual search results
 */
export class ResultValidator {
  private readonly minContentLength: number = 10;
  private readonly maxContentLength: number = 10000;
  private readonly requiredFields: string[] = ['score', 'content'];
  private readonly recommendedFields: string[] = ['nodeName', 'nodeId', 'metadata'];

  constructor(config?: {
    minContentLength?: number;
    maxContentLength?: number;
    requiredFields?: string[];
    recommendedFields?: string[];
  }) {
    if (config?.minContentLength) this.minContentLength = config.minContentLength;
    if (config?.maxContentLength) this.maxContentLength = config.maxContentLength;
    if (config?.requiredFields) this.requiredFields = config.requiredFields;
    if (config?.recommendedFields) this.recommendedFields = config.recommendedFields;

    logger.info('[ResultValidator] Initialized with validation standards', {
      minContentLength: this.minContentLength,
      maxContentLength: this.maxContentLength,
      requiredFields: this.requiredFields.length,
      recommendedFields: this.recommendedFields.length,
    });
  }

  /**
   * Validate a single result
   */
  async validate(result: SearchResultItem, index?: number): Promise<ValidationResult> {
    logger.debug('[ResultValidator] Validating result:', {
      index,
      hasNodeName: !!result.nodeName,
      hasNodeId: !!result.nodeId,
      score: result.score,
    });

    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const validFields: string[] = [];
    const missingFields: string[] = [];

    // 1. Validate required fields
    for (const field of this.requiredFields) {
      if (!(field in result) || result[field] === null || result[field] === undefined) {
        errors.push({
          field,
          code: 'MISSING_REQUIRED',
          severity: 'error',
          message: `Required field '${field}' is missing or null`,
        });
        missingFields.push(field);
      } else {
        validFields.push(field);
      }
    }

    // 2. Validate recommended fields
    for (const field of this.recommendedFields) {
      if (!(field in result) || result[field] === null || result[field] === undefined) {
        warnings.push({
          field,
          code: 'MISSING_RECOMMENDED',
          severity: 'warning',
          message: `Recommended field '${field}' is missing`,
        });
        missingFields.push(field);
      } else {
        validFields.push(field);
      }
    }

    // 3. Validate score field
    const scoreValidation = this.validateScore(result.score);
    if (!scoreValidation.valid) {
      errors.push({
        field: 'score',
        code: scoreValidation.code,
        severity: 'error',
        message: scoreValidation.message,
      });
    }

    // 4. Validate content field
    const contentValidation = this.validateContent(result.content);
    if (!contentValidation.valid) {
      errors.push({
        field: 'content',
        code: contentValidation.code,
        severity: 'error',
        message: contentValidation.message,
      });
    } else {
      // Check for content quality
      const contentQuality = this.analyzeContentQuality(result.content);
      if (!contentQuality.isGood) {
        warnings.push({
          field: 'content',
          code: 'LOW_QUALITY_CONTENT',
          severity: 'warning',
          message: contentQuality.message,
        });
      }
    }

    // 5. Validate metadata if present
    if (result.metadata) {
      const metadataValidation = this.validateMetadata(result.metadata);
      if (!metadataValidation.valid) {
        warnings.push({
          field: 'metadata',
          code: metadataValidation.code,
          severity: 'warning',
          message: metadataValidation.message,
        });
      }
    }

    // 6. Validate node identifiers
    const nodeValidation = this.validateNodeIdentifiers(result);
    if (!nodeValidation.valid) {
      warnings.push({
        field: 'node-id',
        code: nodeValidation.code,
        severity: 'warning',
        message: nodeValidation.message,
      });
    }

    // Calculate overall validation score
    const totalIssues = errors.length + warnings.length * 0.5;
    const validationScore = Math.max(0, 1 - totalIssues / 10);

    const isValid = errors.length === 0;

    return {
      isValid,
      score: validationScore,
      errors,
      warnings,
      metadata: {
        validFields,
        missingFields,
        contentLength: result.content?.length || 0,
        hasMetadata: !!result.metadata && Object.keys(result.metadata).length > 0,
        scoreIsValid: scoreValidation.valid,
      },
    };
  }

  /**
   * Validate multiple results
   */
  async validateBatch(results: SearchResultItem[]): Promise<{
    results: Array<ValidationResult & { index: number }>;
    summary: {
      totalResults: number;
      validResults: number;
      invalidResults: number;
      errorCount: number;
      warningCount: number;
      averageScore: number;
    };
  }> {
    logger.debug('[ResultValidator] Validating batch:', { count: results.length });

    const validationResults = await Promise.all(
      results.map(async (result, index) => ({
        index,
        ...(await this.validate(result, index)),
      }))
    );

    const validResults = validationResults.filter((r) => r.isValid).length;
    const invalidResults = validationResults.filter((r) => !r.isValid).length;
    const totalErrors = validationResults.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = validationResults.reduce((sum, r) => sum + r.warnings.length, 0);
    const averageScore = validationResults.reduce((sum, r) => sum + r.score, 0) / results.length;

    return {
      results: validationResults,
      summary: {
        totalResults: results.length,
        validResults,
        invalidResults,
        errorCount: totalErrors,
        warningCount: totalWarnings,
        averageScore,
      },
    };
  }

  /**
   * Validate score field (0-1 range)
   */
  private validateScore(score: any): { valid: boolean; code: string; message: string } {
    if (score === null || score === undefined) {
      return {
        valid: false,
        code: 'NULL_SCORE',
        message: 'Score is null or undefined',
      };
    }

    if (typeof score !== 'number') {
      return {
        valid: false,
        code: 'INVALID_TYPE',
        message: `Score must be a number, got ${typeof score}`,
      };
    }

    if (isNaN(score)) {
      return {
        valid: false,
        code: 'NAN_SCORE',
        message: 'Score is NaN',
      };
    }

    if (score < 0 || score > 1) {
      return {
        valid: false,
        code: 'OUT_OF_RANGE',
        message: `Score must be between 0 and 1, got ${score}`,
      };
    }

    return {
      valid: true,
      code: 'OK',
      message: 'Score is valid',
    };
  }

  /**
   * Validate content field
   */
  private validateContent(content: any): { valid: boolean; code: string; message: string } {
    if (content === null || content === undefined) {
      return {
        valid: false,
        code: 'NULL_CONTENT',
        message: 'Content is null or undefined',
      };
    }

    if (typeof content !== 'string') {
      return {
        valid: false,
        code: 'INVALID_TYPE',
        message: `Content must be a string, got ${typeof content}`,
      };
    }

    const length = content.length;

    if (length < this.minContentLength) {
      return {
        valid: false,
        code: 'TOO_SHORT',
        message: `Content too short (${length} chars, min: ${this.minContentLength})`,
      };
    }

    if (length > this.maxContentLength) {
      return {
        valid: false,
        code: 'TOO_LONG',
        message: `Content too long (${length} chars, max: ${this.maxContentLength})`,
      };
    }

    if (content.trim().length === 0) {
      return {
        valid: false,
        code: 'EMPTY_CONTENT',
        message: 'Content is empty or whitespace-only',
      };
    }

    return {
      valid: true,
      code: 'OK',
      message: 'Content is valid',
    };
  }

  /**
   * Analyze content quality (beyond structure)
   */
  private analyzeContentQuality(content: string): { isGood: boolean; message: string } {
    const wordCount = content.split(/\s+/).length;
    const sentences = content.split(/[.!?]+/).length;
    const hasUrls = /https?:\/\//.test(content);
    const hasCodeBlocks = /```|<code>/.test(content);

    const quality = {
      wordCount: wordCount >= 5, // At least 5 words
      sentences: sentences >= 1, // At least 1 sentence
      diversity: true, // Allow any content diversity
    };

    if (!quality.wordCount) {
      return {
        isGood: false,
        message: 'Content has too few words (minimum 5)',
      };
    }

    if (!quality.sentences) {
      return {
        isGood: false,
        message: 'Content should contain complete sentences',
      };
    }

    return {
      isGood: true,
      message: 'Content quality is good',
    };
  }

  /**
   * Validate metadata structure
   */
  private validateMetadata(metadata: any): { valid: boolean; code: string; message: string } {
    if (typeof metadata !== 'object' || metadata === null) {
      return {
        valid: false,
        code: 'INVALID_METADATA_TYPE',
        message: 'Metadata must be an object',
      };
    }

    if (Array.isArray(metadata)) {
      return {
        valid: false,
        code: 'INVALID_METADATA_TYPE',
        message: 'Metadata must be an object, not an array',
      };
    }

    const keys = Object.keys(metadata);
    if (keys.length === 0) {
      return {
        valid: false,
        code: 'EMPTY_METADATA',
        message: 'Metadata is empty',
      };
    }

    // Check for excessively large metadata
    const metadataSize = JSON.stringify(metadata).length;
    if (metadataSize > 50000) {
      return {
        valid: false,
        code: 'OVERSIZED_METADATA',
        message: `Metadata is too large (${metadataSize} bytes)`,
      };
    }

    return {
      valid: true,
      code: 'OK',
      message: 'Metadata is valid',
    };
  }

  /**
   * Validate node identifiers
   */
  private validateNodeIdentifiers(result: SearchResultItem): { valid: boolean; code: string; message: string } {
    const hasNodeId = !!result.nodeId && typeof result.nodeId === 'string' && result.nodeId.length > 0;
    const hasNodeName = !!result.nodeName && typeof result.nodeName === 'string' && result.nodeName.length > 0;

    // At least one identifier should be present
    if (!hasNodeId && !hasNodeName) {
      return {
        valid: false,
        code: 'MISSING_NODE_IDENTIFIER',
        message: 'Result must have either nodeId or nodeName',
      };
    }

    // If both are present, they should be consistent
    if (hasNodeId && hasNodeName) {
      // This is good - provides redundancy
      return {
        valid: true,
        code: 'OK',
        message: 'Node identifiers are valid',
      };
    }

    return {
      valid: true,
      code: 'OK',
      message: 'Node identifiers are valid',
    };
  }

  /**
   * Get validation standards configuration
   */
  getValidationStandards(): {
    minContentLength: number;
    maxContentLength: number;
    requiredFields: string[];
    recommendedFields: string[];
  } {
    return {
      minContentLength: this.minContentLength,
      maxContentLength: this.maxContentLength,
      requiredFields: this.requiredFields,
      recommendedFields: this.recommendedFields,
    };
  }
}

/**
 * Factory function to create result validator
 */
export function createResultValidator(config?: {
  minContentLength?: number;
  maxContentLength?: number;
  requiredFields?: string[];
  recommendedFields?: string[];
}): ResultValidator {
  return new ResultValidator(config);
}
