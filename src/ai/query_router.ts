/**
 * Query Router
 * Routes queries to appropriate search strategies based on intent classification
 * Supports 6 different intent-based routing strategies for optimal search performance
 */

import { logger } from '../utils/logger';
import { VLLMClient } from './vllm-client';

/**
 * Query Intent Types - 6 core routing strategies
 */
export enum QueryIntent {
  // 1. Direct Node Lookup - User knows exactly what they want
  // "How do I use the HTTP Request node?"
  DIRECT_NODE_LOOKUP = 'direct-node-lookup',

  // 2. Semantic Query - User describes what they want to do
  // "I need to send data to an external API"
  SEMANTIC_QUERY = 'semantic-query',

  // 3. Workflow Pattern - User wants a complete workflow pattern
  // "How do I set up email to Slack notifications?"
  WORKFLOW_PATTERN = 'workflow-pattern',

  // 4. Property/Configuration - User wants to know about node properties
  // "What authentication methods does HTTP Request support?"
  PROPERTY_SEARCH = 'property-search',

  // 5. Integration Task - User wants to integrate specific services
  // "How do I connect to Google Sheets?"
  INTEGRATION_TASK = 'integration-task',

  // 6. Comparison/Recommendation - User wants to compare nodes
  // "What's the best way to read a CSV file?"
  RECOMMENDATION = 'recommendation',
}

/**
 * Query Intent Information
 */
export interface IntentInfo {
  intent: QueryIntent;
  confidence: number; // 0-1
  keyTerms: string[];
  suggestedStrategies: string[];
}

/**
 * Routing decision for a query
 */
export interface RoutingDecision {
  intent: QueryIntent;
  confidence: number;
  primaryStrategy: string;
  fallbackStrategies: string[];
  searchType: 'embedding' | 'hybrid' | 'pattern-match' | 'property-based';
  maxResults: number;
  scoreThreshold: number;
}

/**
 * Query Router - Routes queries to appropriate search strategies
 */
export class QueryRouter {
  private embeddingClient?: VLLMClient;
  private intentPatterns: Map<QueryIntent, RegExp[]> = new Map();
  private intentKeywords: Map<QueryIntent, string[]> = new Map();

  constructor(embeddingClient?: VLLMClient) {
    this.embeddingClient = embeddingClient;
    this.initializeIntentPatterns();
    this.initializeIntentKeywords();

    logger.info('[QueryRouter] Initialized with 6 intent-based routing strategies');
  }

  /**
   * Initialize pattern matching for intent detection
   */
  private initializeIntentPatterns(): void {
    this.intentPatterns = new Map([
      // Direct Node Lookup patterns
      [
        QueryIntent.DIRECT_NODE_LOOKUP,
        [
          /\buse\b.*\b(node|trigger|action)\b/i,
          /\bhow\b.*\b(node|trigger|action)\b/i,
          /\b(node|trigger|action)\b.*\bconfigur/i,
          /\b(what|which)\b.*\b(node|trigger)\b/i,
        ],
      ],

      // Semantic Query patterns
      [
        QueryIntent.SEMANTIC_QUERY,
        [
          /\b(send|receive|fetch|get|post|put|delete)\b.*\b(data|request|response)\b/i,
          /\b(how|way)\b.*\b(to|can|I)\b.*\b(transform|convert|process)\b/i,
          /\b(extract|parse|format|modify)\b/i,
        ],
      ],

      // Workflow Pattern patterns
      [
        QueryIntent.WORKFLOW_PATTERN,
        [
          /\b(workflow|automation|set up|setup|create|build)\b.*\b(notification|integration|pipeline)\b/i,
          /\b(from|trigger|when).*\b(to|then|send)\b/i,
          /\b(email|slack|teams|webhook)\b.*\b(to|from)\b.*\b(email|slack|teams|webhook)\b/i,
        ],
      ],

      // Property/Configuration patterns
      [
        QueryIntent.PROPERTY_SEARCH,
        [
          /\b(what|which)\b.*\b(property|option|setting|parameter|field)\b/i,
          /\b(configuration|config|parameter|auth|authentication)\b.*\b(method|type|option)\b/i,
          /\b(support|does|have)\b.*\b(option|field|method)\b/i,
        ],
      ],

      // Integration Task patterns
      [
        QueryIntent.INTEGRATION_TASK,
        [
          /\b(connect|integrate|sync|link)\b.*\b(to|with)\b.*\b(google|slack|salesforce|hubspot|stripe|paypal)\b/i,
          /\b(access|authenticate|auth)\b.*\b(google|slack|salesforce|hubspot|stripe|paypal|api|token)\b/i,
          /\b(how do I).*\b(use|access|connect)\b.*\b(api|service)\b/i,
        ],
      ],

      // Recommendation patterns
      [
        QueryIntent.RECOMMENDATION,
        [
          /\b(best|good|better|right|recommended|prefer)\b.*\b(way|method|node|approach)\b/i,
          /\b(compare|difference)\b.*\b(between|among)\b/i,
          /\b(should I use|which.*better|what.*best)\b/i,
          /\b(csv|json|database|spreadsheet|file)\b.*\b(read|write|parse|process)\b/i,
        ],
      ],
    ]);
  }

  /**
   * Initialize keyword-based intent classification
   */
  private initializeIntentKeywords(): void {
    this.intentKeywords = new Map([
      [
        QueryIntent.DIRECT_NODE_LOOKUP,
        ['node', 'trigger', 'action', 'step', 'block', 'use', 'configure', 'setup'],
      ],
      [
        QueryIntent.SEMANTIC_QUERY,
        ['send', 'receive', 'fetch', 'get', 'post', 'data', 'transform', 'convert', 'process'],
      ],
      [
        QueryIntent.WORKFLOW_PATTERN,
        [
          'workflow',
          'automation',
          'notification',
          'integration',
          'pipeline',
          'trigger',
          'from',
          'to',
          'when',
        ],
      ],
      [
        QueryIntent.PROPERTY_SEARCH,
        ['property', 'option', 'setting', 'parameter', 'field', 'config', 'authentication', 'method'],
      ],
      [
        QueryIntent.INTEGRATION_TASK,
        [
          'connect',
          'integrate',
          'sync',
          'google',
          'slack',
          'salesforce',
          'hubspot',
          'stripe',
          'api',
          'service',
        ],
      ],
      [
        QueryIntent.RECOMMENDATION,
        ['best', 'good', 'better', 'right', 'recommended', 'compare', 'difference', 'better', 'csv', 'json', 'database'],
      ],
    ]);
  }

  /**
   * Classify query intent
   */
  async classifyIntent(query: string): Promise<IntentInfo> {
    logger.debug('[QueryRouter] Classifying intent for query:', query.substring(0, 100));

    // Try pattern matching first (fastest)
    const patternResult = this.classifyByPatterns(query);
    if (patternResult.confidence > 0.7) {
      logger.debug('[QueryRouter] Intent classified by pattern matching:', {
        intent: patternResult.intent,
        confidence: patternResult.confidence,
      });
      return patternResult;
    }

    // Fall back to keyword scoring
    const keywordResult = this.classifyByKeywords(query);
    logger.debug('[QueryRouter] Intent classified by keyword analysis:', {
      intent: keywordResult.intent,
      confidence: keywordResult.confidence,
    });

    return keywordResult;
  }

  /**
   * Classify intent using pattern matching
   */
  private classifyByPatterns(query: string): IntentInfo {
    const scores: Map<QueryIntent, number> = new Map();

    // Score each intent based on pattern matches
    for (const [intent, patterns] of this.intentPatterns.entries()) {
      let matchCount = 0;
      for (const pattern of patterns) {
        if (pattern.test(query)) {
          matchCount++;
        }
      }
      if (matchCount > 0) {
        scores.set(intent, matchCount / patterns.length);
      }
    }

    // Find best match
    if (scores.size === 0) {
      return {
        intent: QueryIntent.SEMANTIC_QUERY,
        confidence: 0.3,
        keyTerms: [],
        suggestedStrategies: ['embedding-search', 'semantic-ranking'],
      };
    }

    let bestIntent = QueryIntent.SEMANTIC_QUERY;
    let bestScore = 0;

    for (const [intent, score] of scores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }

    return {
      intent: bestIntent,
      confidence: Math.min(bestScore, 1),
      keyTerms: this.extractKeyTerms(query, bestIntent),
      suggestedStrategies: this.getSuggestedStrategies(bestIntent),
    };
  }

  /**
   * Classify intent using keyword scoring
   */
  private classifyByKeywords(query: string): IntentInfo {
    const queryLower = query.toLowerCase();
    const scores: Map<QueryIntent, number> = new Map();

    // Score each intent based on keyword matches
    for (const [intent, keywords] of this.intentKeywords.entries()) {
      let matchCount = 0;
      for (const keyword of keywords) {
        if (queryLower.includes(keyword.toLowerCase())) {
          matchCount++;
        }
      }
      if (matchCount > 0) {
        // Normalize score to 0-1
        scores.set(intent, Math.min(matchCount / keywords.length, 1));
      }
    }

    // Default to semantic query if no matches
    if (scores.size === 0) {
      return {
        intent: QueryIntent.SEMANTIC_QUERY,
        confidence: 0.3,
        keyTerms: this.extractKeyTerms(queryLower),
        suggestedStrategies: ['embedding-search', 'semantic-ranking'],
      };
    }

    // Find best match
    let bestIntent = QueryIntent.SEMANTIC_QUERY;
    let bestScore = 0;

    for (const [intent, score] of scores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }

    return {
      intent: bestIntent,
      confidence: bestScore,
      keyTerms: this.extractKeyTerms(queryLower, bestIntent),
      suggestedStrategies: this.getSuggestedStrategies(bestIntent),
    };
  }

  /**
   * Extract key terms from query
   */
  private extractKeyTerms(query: string, intent?: QueryIntent): string[] {
    const words = query.split(/\s+/).filter((w) => w.length > 3);
    const keyTerms: string[] = [];

    // Add keywords relevant to the intent
    if (intent && this.intentKeywords.has(intent)) {
      const intentKeywords = this.intentKeywords.get(intent)!;
      for (const word of words) {
        if (intentKeywords.includes(word.toLowerCase())) {
          keyTerms.push(word);
        }
      }
    }

    // Add any remaining significant words
    if (keyTerms.length < 3) {
      for (const word of words.slice(0, 5)) {
        if (!keyTerms.includes(word) && word.length > 4) {
          keyTerms.push(word);
        }
      }
    }

    return keyTerms.slice(0, 5);
  }

  /**
   * Get suggested search strategies for an intent
   */
  private getSuggestedStrategies(intent: QueryIntent): string[] {
    const strategies: Record<QueryIntent, string[]> = {
      [QueryIntent.DIRECT_NODE_LOOKUP]: ['node-lookup', 'exact-match', 'property-search'],
      [QueryIntent.SEMANTIC_QUERY]: ['embedding-search', 'semantic-ranking', 'relevance-scoring'],
      [QueryIntent.WORKFLOW_PATTERN]: ['pattern-match', 'example-workflow', 'tutorial-search'],
      [QueryIntent.PROPERTY_SEARCH]: ['property-lookup', 'configuration-guide', 'documentation'],
      [QueryIntent.INTEGRATION_TASK]: ['service-integration', 'api-documentation', 'authentication-guide'],
      [QueryIntent.RECOMMENDATION]: ['comparison', 'best-practices', 'use-case-analysis'],
    };

    return strategies[intent] || ['semantic-search'];
  }

  /**
   * Make routing decision based on intent
   */
  async makeRoutingDecision(query: string): Promise<RoutingDecision> {
    const intentInfo = await this.classifyIntent(query);

    const strategies: Record<QueryIntent, RoutingDecision> = {
      [QueryIntent.DIRECT_NODE_LOOKUP]: {
        intent: QueryIntent.DIRECT_NODE_LOOKUP,
        confidence: intentInfo.confidence,
        primaryStrategy: 'exact-node-search',
        fallbackStrategies: ['fuzzy-node-match', 'semantic-search'],
        searchType: 'pattern-match',
        maxResults: 10,
        scoreThreshold: 0.7,
      },

      [QueryIntent.SEMANTIC_QUERY]: {
        intent: QueryIntent.SEMANTIC_QUERY,
        confidence: intentInfo.confidence,
        primaryStrategy: 'semantic-search',
        fallbackStrategies: ['bm25-ranking', 'property-based-search'],
        searchType: 'embedding',
        maxResults: 20,
        scoreThreshold: 0.5,
      },

      [QueryIntent.WORKFLOW_PATTERN]: {
        intent: QueryIntent.WORKFLOW_PATTERN,
        confidence: intentInfo.confidence,
        primaryStrategy: 'pattern-template-search',
        fallbackStrategies: ['example-workflow-retrieval', 'semantic-workflow-match'],
        searchType: 'hybrid',
        maxResults: 5,
        scoreThreshold: 0.6,
      },

      [QueryIntent.PROPERTY_SEARCH]: {
        intent: QueryIntent.PROPERTY_SEARCH,
        confidence: intentInfo.confidence,
        primaryStrategy: 'property-based-search',
        fallbackStrategies: ['configuration-guide', 'semantic-search'],
        searchType: 'property-based',
        maxResults: 15,
        scoreThreshold: 0.55,
      },

      [QueryIntent.INTEGRATION_TASK]: {
        intent: QueryIntent.INTEGRATION_TASK,
        confidence: intentInfo.confidence,
        primaryStrategy: 'service-integration-search',
        fallbackStrategies: ['api-documentation', 'authentication-guide'],
        searchType: 'hybrid',
        maxResults: 10,
        scoreThreshold: 0.6,
      },

      [QueryIntent.RECOMMENDATION]: {
        intent: QueryIntent.RECOMMENDATION,
        confidence: intentInfo.confidence,
        primaryStrategy: 'best-practice-recommendation',
        fallbackStrategies: ['comparison-search', 'use-case-analysis'],
        searchType: 'hybrid',
        maxResults: 8,
        scoreThreshold: 0.65,
      },
    };

    const decision = strategies[intentInfo.intent];

    logger.debug('[QueryRouter] Routing decision made:', {
      intent: decision.intent,
      primaryStrategy: decision.primaryStrategy,
      searchType: decision.searchType,
      confidence: decision.confidence,
    });

    return decision;
  }

  /**
   * Get router statistics and configuration
   */
  getRouterConfig(): {
    strategies: number;
    intents: string[];
    supportedSearchTypes: string[];
  } {
    return {
      strategies: 6,
      intents: Object.values(QueryIntent),
      supportedSearchTypes: ['embedding', 'hybrid', 'pattern-match', 'property-based'],
    };
  }
}

/**
 * Factory function to create query router
 */
export function createQueryRouter(embeddingClient?: VLLMClient): QueryRouter {
  return new QueryRouter(embeddingClient);
}
