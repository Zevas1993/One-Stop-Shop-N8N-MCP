/**
 * Search Router Integration
 * Wires query router and intent classifier into the search pipeline
 * Integrates with existing semantic search to enable intent-driven routing
 */

import { logger } from '../utils/logger';
import { QueryRouter, QueryIntent, RoutingDecision } from './query_router';
import { QueryIntentClassifier, ClassificationResult } from './query_intent_classifier';
import { VLLMClient } from './vllm-client';

/**
 * Search strategy execution result
 */
export interface SearchResult {
  strategy: string;
  nodeId?: string;
  nodeName?: string;
  score: number;
  content: string;
  metadata: Record<string, any>;
}

/**
 * Integrated search pipeline result
 */
export interface IntegratedSearchResult {
  query: string;
  intent: QueryIntent;
  intentConfidence: number;
  results: SearchResult[];
  executionTime: number;
  routingStrategy: string;
  searchType: 'embedding' | 'hybrid' | 'pattern-match' | 'property-based';
}

/**
 * Search operation context
 */
export interface SearchContext {
  conversationHistory?: string[];
  userProfile?: {
    expertise: 'beginner' | 'intermediate' | 'expert';
  };
  previousIntents?: QueryIntent[];
  maxResults?: number;
}

/**
 * Search Router Integration - Wires routing into search pipeline
 */
export class SearchRouterIntegration {
  private queryRouter: QueryRouter;
  private intentClassifier: QueryIntentClassifier;
  private embeddingClient?: VLLMClient;

  // Mock search backends (in real implementation, would connect to actual search services)
  private nodeDatabase: Map<string, any> = new Map();
  private propertyIndex: Map<string, string[]> = new Map();

  constructor(embeddingClient?: VLLMClient) {
    this.embeddingClient = embeddingClient;
    this.queryRouter = new QueryRouter(embeddingClient);
    this.intentClassifier = new QueryIntentClassifier();

    this.initializeMockDatabase();
    logger.info('[SearchRouterIntegration] Initialized with intent-driven routing');
  }

  /**
   * Initialize mock database for testing
   */
  private initializeMockDatabase(): void {
    // Mock node database entries
    this.nodeDatabase.set('http-request', {
      id: 'n8n-nodes-base.httpRequest',
      name: 'HTTP Request',
      category: 'HTTP',
      description: 'Make HTTP requests',
    });

    this.nodeDatabase.set('slack', {
      id: 'n8n-nodes-base.slack',
      name: 'Slack',
      category: 'Communication',
      description: 'Send messages to Slack',
    });

    this.nodeDatabase.set('webhook', {
      id: 'n8n-nodes-base.webhook',
      name: 'Webhook',
      category: 'Webhook',
      description: 'Trigger workflow from webhook',
    });

    // Mock property index
    this.propertyIndex.set('http-request', [
      'url',
      'method',
      'headers',
      'authentication',
      'body',
    ]);
    this.propertyIndex.set('slack', ['channel', 'message', 'username', 'icon']);
  }

  /**
   * Execute integrated search with intent routing
   */
  async search(query: string, context?: SearchContext): Promise<IntegratedSearchResult> {
    const startTime = Date.now();

    logger.debug('[SearchRouterIntegration] Starting integrated search:', query.substring(0, 100));

    // Step 1: Classify intent
    const classification = await this.intentClassifier.classify(query, {
      conversationHistory: context?.conversationHistory || [],
      previousIntents: context?.previousIntents || [],
      userProfile: context?.userProfile ? {
        expertise: context.userProfile.expertise,
        preferredNodes: [],
      } : undefined,
    });

    logger.debug('[SearchRouterIntegration] Intent classified:', {
      primaryIntent: classification.primaryIntent,
      confidence: classification.primaryConfidence,
    });

    // Step 2: Make routing decision
    const routingDecision = await this.queryRouter.makeRoutingDecision(query);

    logger.debug('[SearchRouterIntegration] Routing decision made:', {
      primaryStrategy: routingDecision.primaryStrategy,
      searchType: routingDecision.searchType,
    });

    // Step 3: Execute search based on routing strategy
    const results = await this.executeSearch(query, routingDecision, classification);

    const executionTime = Date.now() - startTime;

    logger.info('[SearchRouterIntegration] Search complete:', {
      intent: classification.primaryIntent,
      resultCount: results.length,
      executionTime,
    });

    return {
      query,
      intent: classification.primaryIntent,
      intentConfidence: classification.primaryConfidence,
      results,
      executionTime,
      routingStrategy: routingDecision.primaryStrategy,
      searchType: routingDecision.searchType,
    };
  }

  /**
   * Execute search using appropriate strategy
   */
  private async executeSearch(
    query: string,
    routing: RoutingDecision,
    classification: ClassificationResult
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    switch (routing.intent) {
      case QueryIntent.DIRECT_NODE_LOOKUP:
        return this.searchDirectNodeLookup(query, classification);

      case QueryIntent.SEMANTIC_QUERY:
        return this.searchSemantic(query, routing);

      case QueryIntent.WORKFLOW_PATTERN:
        return this.searchWorkflowPatterns(query, classification);

      case QueryIntent.PROPERTY_SEARCH:
        return this.searchProperties(query, classification);

      case QueryIntent.INTEGRATION_TASK:
        return this.searchIntegrationTasks(query, classification);

      case QueryIntent.RECOMMENDATION:
        return this.searchRecommendations(query, classification);

      default:
        return this.searchSemantic(query, routing);
    }
  }

  /**
   * Direct node lookup - User knows exact node name
   */
  private async searchDirectNodeLookup(
    query: string,
    classification: ClassificationResult
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Use mentioned nodes from classification
    for (const nodeName of classification.features.mentionedNodes) {
      const nodeKey = nodeName.toLowerCase().replace(/\s+/g, '-');
      const nodeData = this.nodeDatabase.get(nodeKey);

      if (nodeData) {
        results.push({
          strategy: 'direct-node-lookup',
          nodeName: nodeData.name,
          nodeId: nodeData.id,
          score: 0.95,
          content: nodeData.description,
          metadata: {
            category: nodeData.category,
            exactMatch: true,
          },
        });
      }
    }

    return results.slice(0, 10);
  }

  /**
   * Semantic search - Use embeddings for similarity
   */
  private async searchSemantic(query: string, routing: RoutingDecision): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // In real implementation, would use embedding client
    // For now, return mock results
    for (const [key, nodeData] of this.nodeDatabase) {
      results.push({
        strategy: 'semantic-search',
        nodeName: nodeData.name,
        nodeId: nodeData.id,
        score: 0.75,
        content: nodeData.description,
        metadata: {
          category: nodeData.category,
          similarity: 0.75,
        },
      });
    }

    return results.slice(0, routing.maxResults);
  }

  /**
   * Workflow pattern search - Find workflow examples
   */
  private async searchWorkflowPatterns(
    query: string,
    classification: ClassificationResult
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Look for nodes related to mentioned services
    for (const service of classification.features.mentionedServices) {
      for (const [key, nodeData] of this.nodeDatabase) {
        if (nodeData.category.toLowerCase().includes(service)) {
          results.push({
            strategy: 'workflow-pattern-search',
            nodeName: nodeData.name,
            nodeId: nodeData.id,
            score: 0.8,
            content: `Workflow pattern for ${service}`,
            metadata: {
              category: nodeData.category,
              patternType: 'integration',
            },
          });
        }
      }
    }

    return results;
  }

  /**
   * Property search - Find node properties and options
   */
  private async searchProperties(
    query: string,
    classification: ClassificationResult
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Search for properties in mentioned nodes
    for (const nodeName of classification.features.mentionedNodes) {
      const nodeKey = nodeName.toLowerCase().replace(/\s+/g, '-');
      const properties = this.propertyIndex.get(nodeKey);

      if (properties) {
        results.push({
          strategy: 'property-search',
          nodeName: nodeName,
          score: 0.85,
          content: `Properties: ${properties.join(', ')}`,
          metadata: {
            properties: properties,
            propertyCount: properties.length,
          },
        });
      }
    }

    return results;
  }

  /**
   * Integration task search - Find service integrations
   */
  private async searchIntegrationTasks(
    query: string,
    classification: ClassificationResult
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Search for nodes that match mentioned services
    for (const service of classification.features.mentionedServices) {
      for (const [key, nodeData] of this.nodeDatabase) {
        if (
          nodeData.name.toLowerCase().includes(service) ||
          nodeData.description.toLowerCase().includes(service)
        ) {
          results.push({
            strategy: 'service-integration-search',
            nodeName: nodeData.name,
            nodeId: nodeData.id,
            score: 0.88,
            content: nodeData.description,
            metadata: {
              service: service,
              integrationType: 'api',
            },
          });
        }
      }
    }

    return results;
  }

  /**
   * Recommendation search - Find best practices
   */
  private async searchRecommendations(
    query: string,
    classification: ClassificationResult
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Return nodes with explanations
    for (const [key, nodeData] of this.nodeDatabase) {
      results.push({
        strategy: 'best-practice-recommendation',
        nodeName: nodeData.name,
        nodeId: nodeData.id,
        score: 0.7,
        content: `Recommended for: ${nodeData.description}`,
        metadata: {
          category: nodeData.category,
          recommendationReason: 'Best practice for this use case',
        },
      });
    }

    return results.slice(0, 5);
  }

  /**
   * Get integration statistics
   */
  getIntegrationStats(): {
    routerConfig: any;
    classifierConfig: any;
    databaseSize: number;
  } {
    return {
      routerConfig: this.queryRouter.getRouterConfig(),
      classifierConfig: this.intentClassifier.getClassifierConfig(),
      databaseSize: this.nodeDatabase.size,
    };
  }
}

/**
 * Factory function to create integrated search
 */
export function createSearchRouterIntegration(embeddingClient?: VLLMClient): SearchRouterIntegration {
  return new SearchRouterIntegration(embeddingClient);
}
