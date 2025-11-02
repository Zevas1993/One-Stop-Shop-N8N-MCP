/**
 * Refinement Engine
 * Automatically refines queries based on result quality and user intent
 * Implements iterative search strategy selection for better results
 */

import { logger } from '../utils/logger';
import { QueryIntent } from './query_router';

/**
 * Refinement suggestion
 */
export interface RefinementSuggestion {
  iterationNumber: number;
  originalQuery: string;
  refinedQuery: string;
  reason: string;
  suggestedStrategy: QueryIntent;
  confidence: number;
  expectedImprovement: number;
}

/**
 * Refinement result
 */
export interface RefinementResult {
  originalQuery: string;
  refinedQuery: string;
  iterationCount: number;
  improvements: Array<{
    iteration: number;
    qualityBefore: number;
    qualityAfter: number;
    improvement: number;
    strategy: QueryIntent;
  }>;
  finalQuality: number;
  shouldContinue: boolean;
  reason: string;
}

/**
 * Refinement Engine Configuration
 */
export interface RefinementConfig {
  maxIterations?: number; // Maximum refinement iterations (3)
  qualityThreshold?: number; // Stop if quality > threshold (0.85)
  minImprovement?: number; // Minimum quality improvement to continue (0.05)
  aggressiveness?: number; // How aggressively to modify query (0-1)
}

/**
 * Refinement Engine - Automatic Query Refinement
 */
export class RefinementEngine {
  private config: Required<RefinementConfig>;

  constructor(config?: RefinementConfig) {
    this.config = {
      maxIterations: config?.maxIterations ?? 3,
      qualityThreshold: config?.qualityThreshold ?? 0.85,
      minImprovement: config?.minImprovement ?? 0.05,
      aggressiveness: config?.aggressiveness ?? 0.7,
    };

    logger.info('[RefinementEngine] Initialized for iterative query refinement', {
      maxIterations: this.config.maxIterations,
      qualityThreshold: this.config.qualityThreshold,
    });
  }

  /**
   * Suggest query refinement based on quality assessment
   */
  suggestRefinement(
    query: string,
    currentQuality: number,
    failedDimensions: string[],
    lastStrategy: QueryIntent,
    iterationNumber: number
  ): RefinementSuggestion | null {
    // Check if we should continue refining
    if (currentQuality >= this.config.qualityThreshold || iterationNumber >= this.config.maxIterations) {
      logger.debug('[RefinementEngine] Refinement not suggested', {
        quality: currentQuality.toFixed(3),
        iteration: iterationNumber,
      });
      return null;
    }

    // Analyze failures and suggest improvements
    const suggestion = this.analyzeAndSuggestRefinement(
      query,
      currentQuality,
      failedDimensions,
      lastStrategy,
      iterationNumber
    );

    if (suggestion) {
      logger.debug('[RefinementEngine] Refinement suggested', {
        originalQuery: query.substring(0, 50),
        refinedQuery: suggestion.refinedQuery.substring(0, 50),
        reason: suggestion.reason,
      });
    }

    return suggestion;
  }

  /**
   * Analyze failures and suggest refinement strategy
   */
  private analyzeAndSuggestRefinement(
    query: string,
    currentQuality: number,
    failedDimensions: string[],
    lastStrategy: QueryIntent,
    iteration: number
  ): RefinementSuggestion | null {
    let refinedQuery = query;
    let reason = '';
    let suggestedStrategy = lastStrategy;
    let expectedImprovement = 0;

    // Analyze which dimensions failed and suggest refinement
    if (failedDimensions.includes('quantity')) {
      // Too few or too many results - broaden or narrow query
      if (currentQuality < 0.2) {
        // Too few results - broaden query
        refinedQuery = this.broadenQuery(query);
        reason = 'Too few results. Broadening search terms.';
        suggestedStrategy = QueryIntent.SEMANTIC_QUERY;
        expectedImprovement = 0.2;
      } else {
        // Too many results - narrow query
        refinedQuery = this.narrowQuery(query);
        reason = 'Too many results. Narrowing with specific terms.';
        suggestedStrategy = QueryIntent.PROPERTY_SEARCH;
        expectedImprovement = 0.15;
      }
    } else if (failedDimensions.includes('relevance')) {
      // Results not relevant - try different strategy
      if (lastStrategy === QueryIntent.SEMANTIC_QUERY) {
        // Try pattern matching if semantic failed
        refinedQuery = this.enhanceWithTechnicalTerms(query);
        reason = 'Poor relevance. Enhancing with technical terms.';
        suggestedStrategy = QueryIntent.DIRECT_NODE_LOOKUP;
        expectedImprovement = 0.25;
      } else {
        // Try semantic if other strategies failed
        refinedQuery = this.simplifyQuery(query);
        reason = 'Poor relevance. Simplifying for semantic search.';
        suggestedStrategy = QueryIntent.SEMANTIC_QUERY;
        expectedImprovement = 0.2;
      }
    } else if (failedDimensions.includes('coverage')) {
      // Too similar results - diversify
      refinedQuery = this.diversifyQuery(query);
      reason = 'Low diversity in results. Searching for alternatives.';
      suggestedStrategy = QueryIntent.WORKFLOW_PATTERN;
      expectedImprovement = 0.15;
    } else if (failedDimensions.includes('diversity')) {
      // Inconsistent scores - focus on specific aspect
      refinedQuery = this.addContextualTerms(query);
      reason = 'Inconsistent relevance scores. Adding context.';
      suggestedStrategy = QueryIntent.INTEGRATION_TASK;
      expectedImprovement = 0.1;
    } else if (failedDimensions.includes('metadata')) {
      // Missing metadata - try property-focused search
      refinedQuery = this.focusOnProperties(query);
      reason = 'Missing result details. Focusing on properties.';
      suggestedStrategy = QueryIntent.PROPERTY_SEARCH;
      expectedImprovement = 0.12;
    } else {
      return null; // No specific failure to address
    }

    // Prevent query from becoming too long
    if (refinedQuery.length > query.length * 1.5) {
      refinedQuery = refinedQuery.substring(0, 150);
    }

    return {
      iterationNumber: iteration,
      originalQuery: query,
      refinedQuery,
      reason,
      suggestedStrategy,
      confidence: 0.6 + expectedImprovement, // Confidence = base + expected improvement
      expectedImprovement,
    };
  }

  /**
   * Broaden query by removing specifics
   */
  private broadenQuery(query: string): string {
    // Remove specific property/field mentions
    let broadened = query
      .replace(/property\s+\w+/gi, 'option')
      .replace(/field\s+\w+/gi, 'setting')
      .replace(/config\s+\w+/gi, 'configuration');

    // Add generic terms to broaden search
    if (!broadened.toLowerCase().includes('how to')) {
      broadened = 'how to ' + broadened;
    }

    return broadened;
  }

  /**
   * Narrow query by adding specifics
   */
  private narrowQuery(query: string): string {
    let narrowed = query;

    // Add specific markers
    if (!narrowed.toLowerCase().includes('exact') && !narrowed.toLowerCase().includes('specific')) {
      narrowed = 'exact: ' + narrowed;
    }

    // Remove common words
    narrowed = narrowed
      .replace(/\b(how|way|to|do|make|use|set)\b/gi, '')
      .trim()
      .replace(/\s+/g, ' ');

    return narrowed;
  }

  /**
   * Enhance query with technical terms
   */
  private enhanceWithTechnicalTerms(query: string): string {
    const technicalTerms = [
      'api',
      'webhook',
      'payload',
      'parameter',
      'header',
      'authentication',
      'endpoint',
      'request',
      'response',
    ];

    let enhanced = query;

    // Add relevant technical terms if not present
    for (const term of technicalTerms) {
      if (query.toLowerCase().includes(term)) {
        return query; // Already has technical terms
      }
    }

    // Add technical context
    enhanced = enhanced + ' configuration properties';

    return enhanced;
  }

  /**
   * Simplify query for semantic search
   */
  private simplifyQuery(query: string): string {
    let simplified = query;

    // Remove technical terms for simpler semantic search
    simplified = simplified
      .replace(/property|field|config|parameter|setting|option/gi, '')
      .replace(/how\s+to|how\s+do|can\s+i/gi, '')
      .trim();

    // Focus on core intent
    if (simplified.split(/\s+/).length > 5) {
      simplified = simplified.split(/\s+/).slice(0, 5).join(' ');
    }

    return simplified;
  }

  /**
   * Diversify query to find different results
   */
  private diversifyQuery(query: string): string {
    let diversified = query;

    // Add diversity keywords
    const diversityTerms = ['alternative', 'different', 'another', 'related', 'similar'];
    const randomTerm = diversityTerms[Math.floor(Math.random() * diversityTerms.length)];

    if (!diversified.toLowerCase().includes(randomTerm)) {
      diversified = diversified + ' ' + randomTerm;
    }

    return diversified;
  }

  /**
   * Add contextual terms
   */
  private addContextualTerms(query: string): string {
    let contextual = query;

    // Add context keywords
    const contextTerms = ['workflow', 'integration', 'automation', 'process', 'task'];
    const randomTerm = contextTerms[Math.floor(Math.random() * contextTerms.length)];

    if (!contextual.toLowerCase().includes(randomTerm)) {
      contextual = contextual + ' ' + randomTerm;
    }

    return contextual;
  }

  /**
   * Focus on properties
   */
  private focusOnProperties(query: string): string {
    let focused = query;

    // Redirect to property search
    if (!focused.toLowerCase().includes('property') && !focused.toLowerCase().includes('option')) {
      focused = focused + ' properties options settings';
    }

    return focused;
  }

  /**
   * Check if refinement should continue
   */
  shouldContinueRefining(
    currentQuality: number,
    previousQuality: number,
    iterationNumber: number
  ): boolean {
    // Stop if quality is good enough
    if (currentQuality >= this.config.qualityThreshold) {
      logger.debug('[RefinementEngine] Stopping - quality threshold reached', {
        quality: currentQuality.toFixed(3),
        threshold: this.config.qualityThreshold,
      });
      return false;
    }

    // Stop if max iterations reached
    if (iterationNumber >= this.config.maxIterations) {
      logger.debug('[RefinementEngine] Stopping - max iterations reached', {
        iterations: iterationNumber,
      });
      return false;
    }

    // Stop if no significant improvement
    const improvement = currentQuality - previousQuality;
    if (improvement < this.config.minImprovement && iterationNumber > 1) {
      logger.debug('[RefinementEngine] Stopping - insufficient improvement', {
        improvement: improvement.toFixed(3),
        minRequired: this.config.minImprovement,
      });
      return false;
    }

    return true;
  }

  /**
   * Process refinement iteration
   */
  processRefinementIteration(
    query: string,
    currentQuality: number,
    previousQuality: number,
    failedDimensions: string[],
    lastStrategy: QueryIntent,
    iterationNumber: number
  ): RefinementResult | null {
    // Check if we should continue
    if (!this.shouldContinueRefining(currentQuality, previousQuality, iterationNumber)) {
      return null;
    }

    // Get suggestion
    const suggestion = this.suggestRefinement(
      query,
      currentQuality,
      failedDimensions,
      lastStrategy,
      iterationNumber
    );

    if (!suggestion) {
      return null;
    }

    const result: RefinementResult = {
      originalQuery: query,
      refinedQuery: suggestion.refinedQuery,
      iterationCount: iterationNumber,
      improvements: [
        {
          iteration: iterationNumber,
          qualityBefore: currentQuality,
          qualityAfter: currentQuality + suggestion.expectedImprovement,
          improvement: suggestion.expectedImprovement,
          strategy: suggestion.suggestedStrategy,
        },
      ],
      finalQuality: currentQuality + suggestion.expectedImprovement,
      shouldContinue: true,
      reason: suggestion.reason,
    };

    return result;
  }

  /**
   * Get configuration
   */
  getConfiguration(): Required<RefinementConfig> {
    return this.config;
  }
}

/**
 * Factory function to create refinement engine
 */
export function createRefinementEngine(config?: RefinementConfig): RefinementEngine {
  return new RefinementEngine(config);
}
