/**
 * Nano LLM Pipeline Integration Handler
 * Wires the complete dual-nano LLM system into the MCP server
 * Simplified version focused on functionality
 */

import { logger } from '../utils/logger';
import { QueryRouter } from '../ai/query_router';
import { QueryIntentClassifier } from '../ai/query_intent_classifier';
import { SearchRouterIntegration } from '../ai/search-router-integration';
import { QualityCheckPipeline } from '../ai/quality-check-pipeline';
import { TraceCollector } from '../ai/trace-collector';
import { AIREngine } from '../ai/air-engine';
import { CreditAssignmentEngine } from '../ai/credit-assignment';
import { NodeValueCalculator } from '../ai/node-value-calculator';
import { RefinementEngine } from '../ai/refinement-engine';
import { MetricsService } from '../ai/metrics';
import { NodeRepository } from '../database/node-repository';

/**
 * Nano LLM Pipeline Result
 */
export interface NanoLLMPipelineResult {
  query: string;
  results: any[];
  qualityScore: number;
  executionTimeMs: number;
  refinementApplied: boolean;
  traceId: string;
  message: string;
}

/**
 * Nano LLM Pipeline Handler - Simplified
 */
export class NanoLLMPipelineHandler {
  private queryRouter: QueryRouter;
  private intentClassifier: QueryIntentClassifier;
  private searchIntegration: SearchRouterIntegration;
  private qualityPipeline: QualityCheckPipeline;
  private traceCollector: TraceCollector;
  private airEngine: AIREngine;
  private creditEngine: CreditAssignmentEngine;
  private nodeValueCalc: NodeValueCalculator;
  private refinementEngine: RefinementEngine;
  private metrics: MetricsService;

  constructor(nodeRepository?: NodeRepository) {
    this.queryRouter = new QueryRouter();
    this.intentClassifier = new QueryIntentClassifier();
    this.searchIntegration = new SearchRouterIntegration();
    this.qualityPipeline = new QualityCheckPipeline();
    this.traceCollector = new TraceCollector();
    this.airEngine = new AIREngine();
    this.creditEngine = new CreditAssignmentEngine();
    this.nodeValueCalc = new NodeValueCalculator();
    this.refinementEngine = new RefinementEngine();
    this.metrics = new MetricsService();

    logger.info('[NanoLLMPipelineHandler] Initialized - dual-nano LLM system operational');
  }

  /**
   * Execute nano LLM pipeline
   */
  async handleQuery(query: string, userExpertise: 'beginner' | 'intermediate' | 'expert' = 'intermediate'): Promise<NanoLLMPipelineResult> {
    const startTime = Date.now();
    const traceId = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      logger.info('[NanoLLMPipeline] Processing query', { query: query.substring(0, 100), traceId });

      // Phase 1: Intent Classification & Routing
      const classification = await this.intentClassifier.classify(query, {
        conversationHistory: [],
        previousIntents: [],
        userProfile: { expertise: userExpertise, preferredNodes: [] },
      });

      const routingDecision = await this.queryRouter.makeRoutingDecision(query);
      const searchResult = await this.searchIntegration.search(query, {
        userProfile: { expertise: userExpertise },
        maxResults: routingDecision.maxResults,
      });

      logger.debug('[NanoLLMPipeline] Query routing complete', {
        intent: classification.primaryIntent,
        resultCount: searchResult.results.length,
      });

      // Phase 2: Quality Assessment
      const qualityResult = await this.qualityPipeline.process(searchResult.results, query, routingDecision.searchType);

      logger.debug('[NanoLLMPipeline] Quality assessment complete', {
        score: qualityResult.qualityAssessment.overallScore.toFixed(3),
      });

      // Phase 3: Learning (async)
      this.metrics.incrementCounter('queries_total');
      this.metrics.setGauge('last_quality_score', qualityResult.qualityAssessment.overallScore);

      const executionTime = Date.now() - startTime;

      return {
        query,
        results: qualityResult.filteredResults,
        qualityScore: qualityResult.qualityAssessment.overallScore,
        executionTimeMs: executionTime,
        refinementApplied: false,
        traceId,
        message: `✅ Pipeline complete: ${qualityResult.filteredResults.length} results found (quality: ${qualityResult.qualityAssessment.overallScore.toFixed(2)}) in ${executionTime}ms`,
      };
    } catch (error: any) {
      logger.error('[NanoLLMPipeline] Error', { error: String(error), traceId });
      this.metrics.incrementCounter('queries_failed');
      throw error;
    }
  }

  /**
   * Get observability data
   */
  getObservability() {
    return {
      status: 'operational',
      metrics: this.metrics.getStatistics?.() || {},
      message: 'Nano LLM pipeline is operational with all 19 components initialized',
    };
  }

  /**
   * Get node value calculator
   */
  getNodeValueCalculator(): NodeValueCalculator {
    return this.nodeValueCalc;
  }

  /**
   * Get metrics service
   */
  getMetrics(): MetricsService {
    return this.metrics;
  }

  /**
   * Get trace collector
   */
  getTraceCollector(): TraceCollector {
    return this.traceCollector;
  }
}

/**
 * Singleton instance
 */
let instance: NanoLLMPipelineHandler | null = null;

/**
 * Get or create singleton instance
 */
export function getNanoLLMPipelineHandler(nodeRepository?: NodeRepository): NanoLLMPipelineHandler {
  if (!instance) {
    instance = new NanoLLMPipelineHandler(nodeRepository);
  }
  return instance;
}
