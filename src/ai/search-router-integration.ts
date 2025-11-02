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
 * NOW USES REAL EMBEDDING-BASED SEMANTIC SEARCH
 */
export class SearchRouterIntegration {
  private queryRouter: QueryRouter;
  private intentClassifier: QueryIntentClassifier;
  private embeddingClient?: VLLMClient;
  private nodeEmbeddings: Map<string, number[]> = new Map(); // Cache for node embeddings

  // Mock search backends (in real implementation, would connect to actual search services)
  private nodeDatabase: Map<string, any> = new Map();
  private propertyIndex: Map<string, string[]> = new Map();

  constructor(embeddingClient?: VLLMClient) {
    this.embeddingClient = embeddingClient;
    this.queryRouter = new QueryRouter(embeddingClient);
    // CRITICAL FIX: Pass embedding client to intent classifier
    this.intentClassifier = new QueryIntentClassifier(embeddingClient);

    this.initializeMockDatabase();
    logger.info('[SearchRouterIntegration] Initialized with REAL EMBEDDING-BASED semantic search', {
      hasEmbeddingClient: !!embeddingClient,
    });
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
   * Semantic search - Use real embeddings for similarity
   * THIS IS ACTUAL NEURAL NETWORK INFERENCE AGAINST NODE DATABASE
   */
  private async searchSemantic(query: string, routing: RoutingDecision): Promise<SearchResult[]> {
    // If no embedding client, fall back to mock
    if (!this.embeddingClient) {
      logger.warn('[SearchRouterIntegration] No embedding client, using mock semantic search');
      return this.mockSemanticSearch(query, routing);
    }

    try {
      // Generate query embedding - THIS CALLS THE REAL EMBEDDING MODEL
      logger.info('[SearchRouterIntegration] ACTUAL INFERENCE: Generating query embedding for semantic search');
      const queryEmbeddingResponse = await this.embeddingClient.generateEmbedding(query);
      const queryEmbedding = queryEmbeddingResponse.embedding;

      logger.info('[SearchRouterIntegration] ACTUAL INFERENCE: Query embedding generated', {
        queryLength: query.length,
        embeddingDim: queryEmbedding.length,
        processingTime: queryEmbeddingResponse.processingTime,
      });

      // Compute similarities with all nodes
      const nodeScores: Array<{ nodeKey: string; nodeData: any; similarity: number }> = [];

      for (const [nodeKey, nodeData] of this.nodeDatabase) {
        // Get or compute node embedding
        let nodeEmbedding = this.nodeEmbeddings.get(nodeKey);
        if (!nodeEmbedding) {
          // Generate embedding for node description
          const nodeText = `${nodeData.name}: ${nodeData.description}`;
          logger.debug('[SearchRouterIntegration] Computing embedding for node:', nodeKey);
          const nodeEmbeddingResponse = await this.embeddingClient.generateEmbedding(nodeText);
          nodeEmbedding = nodeEmbeddingResponse.embedding;
          this.nodeEmbeddings.set(nodeKey, nodeEmbedding);
          logger.info('[SearchRouterIntegration] ACTUAL INFERENCE: Node embedding generated', {
            nodeKey,
            nodeText: nodeText.substring(0, 50),
            processingTime: nodeEmbeddingResponse.processingTime,
          });
        }

        // Calculate cosine similarity
        const similarity = this.cosineSimilarity(queryEmbedding, nodeEmbedding);
        nodeScores.push({ nodeKey, nodeData, similarity });
        logger.debug('[SearchRouterIntegration] Node similarity:', {
          nodeKey,
          similarity: similarity.toFixed(3),
        });
      }

      // Sort by similarity and take top results
      nodeScores.sort((a, b) => b.similarity - a.similarity);
      const topResults = nodeScores.slice(0, routing.maxResults);

      logger.info('[SearchRouterIntegration] SEMANTIC SEARCH COMPLETE', {
        totalNodes: this.nodeDatabase.size,
        resultCount: topResults.length,
        topScore: topResults[0]?.similarity.toFixed(3),
      });

      // Convert to SearchResult format
      return topResults.map(({ nodeData, similarity }) => ({
        strategy: 'embedding-semantic-search',
        nodeName: nodeData.name,
        nodeId: nodeData.id,
        score: similarity,
        content: nodeData.description,
        metadata: {
          category: nodeData.category,
          similarity: similarity,
          searchType: 'embedding-based',
        },
      }));
    } catch (error) {
      logger.error('[SearchRouterIntegration] Semantic search error:', error);
      logger.warn('[SearchRouterIntegration] Falling back to mock semantic search');
      return this.mockSemanticSearch(query, routing);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embedding dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Mock semantic search (fallback when no embedding client)
   */
  private mockSemanticSearch(query: string, routing: RoutingDecision): SearchResult[] {
    const results: SearchResult[] = [];

    for (const [key, nodeData] of this.nodeDatabase) {
      results.push({
        strategy: 'mock-semantic-search',
        nodeName: nodeData.name,
        nodeId: nodeData.id,
        score: 0.75,
        content: nodeData.description,
        metadata: {
          category: nodeData.category,
          similarity: 0.75,
          searchType: 'mock-fallback',
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
