/**
 * Search Router Integration
 * Wires query router and intent classifier into the search pipeline
 * Integrates with existing semantic search to enable intent-driven routing
 */

import { logger } from "../utils/logger";
import { QueryRouter, QueryIntent, RoutingDecision } from "./query_router";
import {
  QueryIntentClassifier,
  ClassificationResult,
} from "./query_intent_classifier";
import { VLLMClient } from "./vllm-client";
import { GraphRAGBridge } from "./graphrag-bridge";

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
  searchType: "embedding" | "hybrid" | "pattern-match" | "property-based";
}

/**
 * Search operation context
 */
export interface SearchContext {
  conversationHistory?: string[];
  userProfile?: {
    expertise: "beginner" | "intermediate" | "expert";
  };
  previousIntents?: QueryIntent[];
  maxResults?: number;
}

/**
 * Search Router Integration - Wires routing into search pipeline
 * NOW USES REAL EMBEDDING-BASED SEMANTIC SEARCH via GraphRAG
 */
export class SearchRouterIntegration {
  private queryRouter: QueryRouter;
  private intentClassifier: QueryIntentClassifier;
  private embeddingClient?: VLLMClient;
  private graphRag: GraphRAGBridge;

  constructor(embeddingClient?: VLLMClient) {
    this.embeddingClient = embeddingClient;
    this.queryRouter = new QueryRouter(embeddingClient);
    this.intentClassifier = new QueryIntentClassifier(embeddingClient);
    this.graphRag = GraphRAGBridge.get();

    logger.info("[SearchRouterIntegration] Initialized with GraphRAG Bridge", {
      hasEmbeddingClient: !!embeddingClient,
    });
  }

  /**
   * Execute integrated search with intent routing
   */
  async search(
    query: string,
    context?: SearchContext
  ): Promise<IntegratedSearchResult> {
    const startTime = Date.now();

    logger.debug(
      "[SearchRouterIntegration] Starting integrated search:",
      query.substring(0, 100)
    );

    // Step 1: Classify intent
    const classification = await this.intentClassifier.classify(query, {
      conversationHistory: context?.conversationHistory || [],
      previousIntents: context?.previousIntents || [],
      userProfile: context?.userProfile
        ? {
            expertise: context.userProfile.expertise,
            preferredNodes: [],
          }
        : undefined,
    });

    logger.debug("[SearchRouterIntegration] Intent classified:", {
      primaryIntent: classification.primaryIntent,
      confidence: classification.primaryConfidence,
    });

    // Step 2: Make routing decision
    const routingDecision = await this.queryRouter.makeRoutingDecision(query);

    logger.debug("[SearchRouterIntegration] Routing decision made:", {
      primaryStrategy: routingDecision.primaryStrategy,
      searchType: routingDecision.searchType,
    });

    // Step 3: Execute search based on routing strategy
    const results = await this.executeSearch(
      query,
      routingDecision,
      classification
    );

    const executionTime = Date.now() - startTime;

    logger.info("[SearchRouterIntegration] Search complete:", {
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
      const graphResult = await this.graphRag.queryGraph({
        text: nodeName,
        top_k: 1,
      });

      if (graphResult.nodes && graphResult.nodes.length > 0) {
        const node = graphResult.nodes[0];
        results.push({
          strategy: "direct-node-lookup",
          nodeName: node.label,
          nodeId: node.id,
          score: 0.95,
          content: node.description || "",
          metadata: {
            category: node.type,
            exactMatch: true,
            ...node.metadata,
          },
        });
      }
    }

    return results.slice(0, 10);
  }

  /**
   * Semantic search - Use GraphRAG for similarity
   */
  private async searchSemantic(
    query: string,
    routing: RoutingDecision
  ): Promise<SearchResult[]> {
    try {
      logger.info(
        "[SearchRouterIntegration] Executing GraphRAG semantic search"
      );

      const graphResult = await this.graphRag.queryGraph({
        text: query,
        top_k: routing.maxResults || 10,
      });

      return (graphResult.nodes || []).map((node) => ({
        strategy: "embedding-semantic-search",
        nodeName: node.label,
        nodeId: node.id,
        score: node.score || 0.8,
        content: node.description || "",
        metadata: {
          category: node.type,
          searchType: "graphrag-semantic",
          ...node.metadata,
        },
      }));
    } catch (error) {
      logger.error("[SearchRouterIntegration] Semantic search error:", error);
      return [];
    }
  }

  /**
   * Workflow pattern search - Find workflow examples
   */
  private async searchWorkflowPatterns(
    query: string,
    classification: ClassificationResult
  ): Promise<SearchResult[]> {
    // Use GraphRAG to find nodes related to the services, implying patterns
    const serviceQueries = classification.features.mentionedServices.map(
      (s) => `${s} workflow pattern`
    );
    const combinedQuery =
      serviceQueries.length > 0 ? serviceQueries.join(" ") : query;

    const graphResult = await this.graphRag.queryGraph({
      text: combinedQuery,
      top_k: 5,
    });

    return (graphResult.nodes || []).map((node) => ({
      strategy: "workflow-pattern-search",
      nodeName: node.label,
      nodeId: node.id,
      score: node.score || 0.8,
      content: `Workflow pattern involving ${node.label}: ${node.description}`,
      metadata: {
        category: node.type,
        patternType: "integration",
        ...node.metadata,
      },
    }));
  }

  /**
   * Property search - Find node properties and options
   */
  private async searchProperties(
    query: string,
    classification: ClassificationResult
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Search for properties in mentioned nodes via GraphRAG
    for (const nodeName of classification.features.mentionedNodes) {
      const graphResult = await this.graphRag.queryGraph({
        text: `${nodeName} properties parameters`,
        top_k: 1,
      });

      if (graphResult.nodes && graphResult.nodes.length > 0) {
        const node = graphResult.nodes[0];
        // Assuming metadata contains properties or we infer them from description
        const properties = node.metadata?.properties || [
          "(Properties not indexed)",
        ];

        results.push({
          strategy: "property-search",
          nodeName: node.label,
          score: 0.85,
          content: `Properties for ${node.label}: ${node.description}`,
          metadata: {
            properties: properties,
            propertyCount: properties.length,
            ...node.metadata,
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
    // Search for nodes that match mentioned services
    const serviceQueries = classification.features.mentionedServices.map(
      (s) => `${s} integration`
    );
    const combinedQuery =
      serviceQueries.length > 0 ? serviceQueries.join(" ") : query;

    const graphResult = await this.graphRag.queryGraph({
      text: combinedQuery,
      top_k: 8,
    });

    return (graphResult.nodes || []).map((node) => ({
      strategy: "service-integration-search",
      nodeName: node.label,
      nodeId: node.id,
      score: node.score || 0.88,
      content: node.description || "",
      metadata: {
        service: classification.features.mentionedServices.join(", "),
        integrationType: "api",
        ...node.metadata,
      },
    }));
  }

  /**
   * Recommendation search - Find best practices
   */
  private async searchRecommendations(
    query: string,
    classification: ClassificationResult
  ): Promise<SearchResult[]> {
    const graphResult = await this.graphRag.queryGraph({
      text: `${query} best practices recommendation`,
      top_k: 5,
    });

    return (graphResult.nodes || []).map((node) => ({
      strategy: "best-practice-recommendation",
      nodeName: node.label,
      nodeId: node.id,
      score: node.score || 0.7,
      content: `Recommended: ${node.description}`,
      metadata: {
        category: node.type,
        recommendationReason: "GraphRAG Match",
        ...node.metadata,
      },
    }));
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
      databaseSize: 0, // GraphRAG size not exposed yet
    };
  }
}

/**
 * Factory function to create integrated search
 */
export function createSearchRouterIntegration(
  embeddingClient?: VLLMClient
): SearchRouterIntegration {
  return new SearchRouterIntegration(embeddingClient);
}
