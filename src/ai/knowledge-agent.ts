/**
 * Knowledge Management Agent
 * 
 * Autonomous agent that manages knowledge across the multi-agent system:
 * - Learns from workflow patterns and validation results
 * - Provides recommendations based on accumulated knowledge
 * - Manages semantic embeddings for intelligent search
 * - Coordinates knowledge sharing between agents
 * 
 * Subscribes to events from other agents and builds knowledge graph
 */

import { logger } from '../utils/logger';
import { getLLMRouter, LLMRouter } from './llm-router';
import { getEventBus, EventBus, EventTypes, BusEvent } from './event-bus';
import { getSharedMemory, SharedMemory } from './shared-memory';

// ============================================================================
// TYPES
// ============================================================================

export interface KnowledgeEntry {
  id: string;
  type: 'pattern' | 'insight' | 'recommendation' | 'error' | 'success';
  category: string;           // e.g., 'workflow', 'validation', 'node', 'integration'
  content: string;            // Human-readable description
  embedding?: number[];       // Semantic embedding for search
  metadata: Record<string, any>;
  confidence: number;         // 0-1 confidence score
  useCount: number;           // How often this knowledge has been used
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeQuery {
  query: string;
  category?: string;
  type?: string;
  minConfidence?: number;
  limit?: number;
}

export interface KnowledgeSearchResult {
  entry: KnowledgeEntry;
  similarity: number;
}

export interface AgentConfig {
  agentId?: string;
  enableLearning?: boolean;      // Auto-learn from events
  enableRecommendations?: boolean; // Provide proactive recommendations
  knowledgeRetention?: number;   // Max age of knowledge in days
  minConfidenceThreshold?: number;
}

// ============================================================================
// KNOWLEDGE MANAGEMENT AGENT
// ============================================================================

export class KnowledgeManagementAgent {
  private agentId: string;
  private config: Required<AgentConfig>;
  private llmRouter: LLMRouter | null = null;
  private eventBus: EventBus | null = null;
  private sharedMemory: SharedMemory | null = null;
  private initialized: boolean = false;
  private subscriptionIds: string[] = [];

  // In-memory knowledge cache (also persisted to SharedMemory)
  private knowledgeCache: Map<string, KnowledgeEntry> = new Map();

  constructor(config: AgentConfig = {}) {
    this.agentId = config.agentId || 'knowledge-agent';
    this.config = {
      agentId: this.agentId,
      enableLearning: config.enableLearning ?? true,
      enableRecommendations: config.enableRecommendations ?? true,
      knowledgeRetention: config.knowledgeRetention ?? 30, // 30 days
      minConfidenceThreshold: config.minConfidenceThreshold ?? 0.5,
    };

    logger.info(`[${this.agentId}] Created with config:`, this.config);
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the agent
   */
  async initialize(): Promise<boolean> {
    logger.info(`[${this.agentId}] Initializing...`);

    try {
      // Get dependencies
      this.llmRouter = getLLMRouter();
      this.eventBus = await getEventBus();
      this.sharedMemory = await getSharedMemory();

      // Load existing knowledge from shared memory
      await this.loadKnowledge();

      // Subscribe to relevant events
      if (this.config.enableLearning) {
        this.subscribeToEvents();
      }

      // Register agent
      await this.eventBus.publish(EventTypes.AGENT_REGISTERED, {
        agentId: this.agentId,
        capabilities: ['knowledge', 'search', 'recommendations'],
      }, this.agentId);

      this.initialized = true;
      logger.info(`[${this.agentId}] ✅ Initialized with ${this.knowledgeCache.size} knowledge entries`);

      return true;

    } catch (error: any) {
      logger.error(`[${this.agentId}] Initialization failed:`, error.message);
      return false;
    }
  }

  /**
   * Subscribe to events for learning
   */
  private subscribeToEvents(): void {
    if (!this.eventBus) return;

    // Learn from validation events
    const validationSub = this.eventBus.subscribe(
      'validation:*',
      async (event) => this.handleValidationEvent(event),
      this.agentId
    );
    this.subscriptionIds.push(validationSub);

    // Learn from workflow events
    const workflowSub = this.eventBus.subscribe(
      'workflow:*',
      async (event) => this.handleWorkflowEvent(event),
      this.agentId
    );
    this.subscriptionIds.push(workflowSub);

    // Learn from pattern events
    const patternSub = this.eventBus.subscribe(
      'pattern:*',
      async (event) => this.handlePatternEvent(event),
      this.agentId
    );
    this.subscriptionIds.push(patternSub);

    // Learn from LLM events
    const llmSub = this.eventBus.subscribe(
      'llm:*',
      async (event) => this.handleLLMEvent(event),
      this.agentId
    );
    this.subscriptionIds.push(llmSub);

    logger.debug(`[${this.agentId}] Subscribed to ${this.subscriptionIds.length} event patterns`);
  }

  // ==========================================================================
  // EVENT HANDLERS (LEARNING)
  // ==========================================================================

  /**
   * Learn from validation events
   */
  private async handleValidationEvent(event: BusEvent): Promise<void> {
    try {
      const { type, data } = event;

      if (type === EventTypes.VALIDATION_COMPLETED && data.valid) {
        // Learn successful validation patterns
        await this.learnFromSuccess('validation', {
          workflowName: data.workflowName,
          passedLayers: data.passedLayers,
          nodeCount: data.nodeCount,
        });
      } else if (type === EventTypes.VALIDATION_FAILED) {
        // Learn from validation failures
        await this.learnFromError('validation', {
          errors: data.errors,
          failedLayer: data.failedLayer,
          workflowName: data.workflowName,
        });
      }
    } catch (error) {
      logger.warn(`[${this.agentId}] Failed to handle validation event:`, error);
    }
  }

  /**
   * Learn from workflow events
   */
  private async handleWorkflowEvent(event: BusEvent): Promise<void> {
    try {
      const { type, data } = event;

      if (type === EventTypes.WORKFLOW_CREATED) {
        // Record successful workflow patterns
        await this.addKnowledge({
          type: 'pattern',
          category: 'workflow',
          content: `Workflow "${data.name}" created successfully with ${data.nodeCount} nodes`,
          metadata: {
            nodeTypes: data.nodeTypes,
            hasTriiger: data.hasTrigger,
            connectionCount: data.connectionCount,
          },
          confidence: 0.7,
        });
      }
    } catch (error) {
      logger.warn(`[${this.agentId}] Failed to handle workflow event:`, error);
    }
  }

  /**
   * Learn from pattern discovery events
   */
  private async handlePatternEvent(event: BusEvent): Promise<void> {
    try {
      const { type, data } = event;

      if (type === EventTypes.PATTERN_DISCOVERED) {
        await this.addKnowledge({
          type: 'pattern',
          category: 'integration',
          content: `Discovered pattern: ${data.patternName} - ${data.description}`,
          metadata: {
            patternId: data.patternId,
            nodeTypes: data.nodeTypes,
            useCases: data.useCases,
          },
          confidence: data.confidence || 0.8,
        });
      }
    } catch (error) {
      logger.warn(`[${this.agentId}] Failed to handle pattern event:`, error);
    }
  }

  /**
   * Learn from LLM events (track what works)
   */
  private async handleLLMEvent(event: BusEvent): Promise<void> {
    try {
      const { type, data } = event;

      if (type === EventTypes.LLM_RESPONSE) {
        // Track successful LLM operations for optimization
        const key = `llm_perf_${data.backend}_${data.type}`;
        const existing = await this.sharedMemory?.get<{ count: number; avgLatency: number }>(key);

        if (existing) {
          await this.sharedMemory?.set(key, {
            count: existing.count + 1,
            avgLatency: (existing.avgLatency * existing.count + data.latency) / (existing.count + 1),
          }, this.agentId);
        } else {
          await this.sharedMemory?.set(key, {
            count: 1,
            avgLatency: data.latency,
          }, this.agentId);
        }
      }
    } catch (error) {
      logger.warn(`[${this.agentId}] Failed to handle LLM event:`, error);
    }
  }

  // ==========================================================================
  // KNOWLEDGE MANAGEMENT
  // ==========================================================================

  /**
   * Add new knowledge entry
   */
  async addKnowledge(entry: Omit<KnowledgeEntry, 'id' | 'useCount' | 'createdAt' | 'updatedAt' | 'embedding'>): Promise<KnowledgeEntry> {
    const id = `knowledge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    // Generate embedding if LLM is available
    let embedding: number[] | undefined;
    if (this.llmRouter?.isAvailable()) {
      try {
        const result = await this.llmRouter.embed(entry.content);
        embedding = result.embedding;
      } catch (error) {
        logger.debug(`[${this.agentId}] Failed to generate embedding:`, error);
      }
    }

    const knowledge: KnowledgeEntry = {
      id,
      type: entry.type,
      category: entry.category,
      content: entry.content,
      embedding,
      metadata: entry.metadata,
      confidence: entry.confidence,
      useCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Store in cache and shared memory
    this.knowledgeCache.set(id, knowledge);
    await this.sharedMemory?.set(`knowledge:${id}`, knowledge, this.agentId);

    // Publish event
    await this.eventBus?.publish(EventTypes.KNOWLEDGE_UPDATED, {
      action: 'add',
      knowledgeId: id,
      type: entry.type,
      category: entry.category,
    }, this.agentId);

    logger.debug(`[${this.agentId}] Added knowledge: ${id} (${entry.type}/${entry.category})`);

    return knowledge;
  }

  /**
   * Learn from successful operations
   */
  private async learnFromSuccess(category: string, data: Record<string, any>): Promise<void> {
    const content = this.generateSuccessDescription(category, data);
    
    await this.addKnowledge({
      type: 'success',
      category,
      content,
      metadata: data,
      confidence: 0.8,
    });
  }

  /**
   * Learn from errors
   */
  private async learnFromError(category: string, data: Record<string, any>): Promise<void> {
    const content = this.generateErrorDescription(category, data);
    
    await this.addKnowledge({
      type: 'error',
      category,
      content,
      metadata: data,
      confidence: 0.9, // Errors are valuable learning
    });
  }

  /**
   * Generate description for success
   */
  private generateSuccessDescription(category: string, data: Record<string, any>): string {
    if (category === 'validation') {
      return `Validation succeeded for workflow with ${data.nodeCount} nodes. Passed layers: ${data.passedLayers?.join(', ')}`;
    }
    return `Success in ${category}: ${JSON.stringify(data).substring(0, 100)}`;
  }

  /**
   * Generate description for error
   */
  private generateErrorDescription(category: string, data: Record<string, any>): string {
    if (category === 'validation') {
      const errors = data.errors?.map((e: any) => e.message).join('; ') || 'Unknown error';
      return `Validation failed at layer ${data.failedLayer}: ${errors}`;
    }
    return `Error in ${category}: ${JSON.stringify(data).substring(0, 100)}`;
  }

  // ==========================================================================
  // KNOWLEDGE SEARCH
  // ==========================================================================

  /**
   * Search knowledge base semantically
   */
  async search(query: KnowledgeQuery): Promise<KnowledgeSearchResult[]> {
    const results: KnowledgeSearchResult[] = [];

    // Get query embedding if LLM available
    let queryEmbedding: number[] | undefined;
    if (this.llmRouter?.isAvailable()) {
      try {
        const result = await this.llmRouter.embed(query.query);
        queryEmbedding = result.embedding;
      } catch (error) {
        logger.debug(`[${this.agentId}] Failed to get query embedding`);
      }
    }

    // Search through knowledge cache
    for (const entry of this.knowledgeCache.values()) {
      // Filter by category
      if (query.category && entry.category !== query.category) continue;
      
      // Filter by type
      if (query.type && entry.type !== query.type) continue;
      
      // Filter by confidence
      if (query.minConfidence && entry.confidence < query.minConfidence) continue;

      // Calculate similarity
      let similarity = 0;

      if (queryEmbedding && entry.embedding) {
        // Cosine similarity
        similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
      } else {
        // Fallback to keyword matching
        similarity = this.keywordSimilarity(query.query, entry.content);
      }

      if (similarity > 0.1) { // Threshold
        results.push({ entry, similarity });
      }
    }

    // Sort by similarity and limit
    results.sort((a, b) => b.similarity - a.similarity);
    const limited = results.slice(0, query.limit || 10);

    // Increment use count for returned entries
    for (const result of limited) {
      result.entry.useCount++;
      this.knowledgeCache.set(result.entry.id, result.entry);
    }

    return limited;
  }

  /**
   * Get recommendations for a context
   */
  async getRecommendations(context: string, category?: string): Promise<KnowledgeSearchResult[]> {
    if (!this.config.enableRecommendations) return [];

    return this.search({
      query: context,
      category,
      type: 'recommendation',
      minConfidence: this.config.minConfidenceThreshold,
      limit: 5,
    });
  }

  /**
   * Get insights related to a topic
   */
  async getInsights(topic: string): Promise<KnowledgeSearchResult[]> {
    return this.search({
      query: topic,
      type: 'insight',
      minConfidence: 0.6,
      limit: 10,
    });
  }

  /**
   * Get error patterns for troubleshooting
   */
  async getErrorPatterns(errorContext: string): Promise<KnowledgeSearchResult[]> {
    return this.search({
      query: errorContext,
      type: 'error',
      limit: 5,
    });
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Cosine similarity between embeddings
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Simple keyword similarity (fallback)
   */
  private keywordSimilarity(query: string, content: string): number {
    const queryWords = new Set(query.toLowerCase().split(/\W+/));
    const contentWords = new Set(content.toLowerCase().split(/\W+/));

    let matches = 0;
    for (const word of queryWords) {
      if (contentWords.has(word)) matches++;
    }

    return matches / Math.max(queryWords.size, 1);
  }

  /**
   * Load knowledge from shared memory
   */
  private async loadKnowledge(): Promise<void> {
    if (!this.sharedMemory) return;

    try {
      const entries = await this.sharedMemory.query({
        pattern: 'knowledge:%',
        limit: 1000,
      });

      for (const entry of entries) {
        if (entry.value && entry.value.id) {
          this.knowledgeCache.set(entry.value.id, entry.value);
        }
      }

      logger.debug(`[${this.agentId}] Loaded ${this.knowledgeCache.size} knowledge entries`);
    } catch (error) {
      logger.warn(`[${this.agentId}] Failed to load knowledge:`, error);
    }
  }

  /**
   * Clean up old knowledge
   */
  async cleanup(): Promise<number> {
    const cutoff = Date.now() - (this.config.knowledgeRetention * 24 * 60 * 60 * 1000);
    let removed = 0;

    for (const [id, entry] of this.knowledgeCache.entries()) {
      if (entry.createdAt < cutoff && entry.useCount < 3) {
        this.knowledgeCache.delete(id);
        await this.sharedMemory?.delete(`knowledge:${id}`, this.agentId);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info(`[${this.agentId}] Cleaned up ${removed} old knowledge entries`);
    }

    return removed;
  }

  // ==========================================================================
  // STATUS & MANAGEMENT
  // ==========================================================================

  /**
   * Get agent status
   */
  getStatus(): {
    initialized: boolean;
    knowledgeCount: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const entry of this.knowledgeCache.values()) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
    }

    return {
      initialized: this.initialized,
      knowledgeCount: this.knowledgeCache.size,
      byType,
      byCategory,
    };
  }

  /**
   * Shutdown the agent
   */
  async shutdown(): Promise<void> {
    // Unsubscribe from events
    if (this.eventBus) {
      for (const subId of this.subscriptionIds) {
        this.eventBus.unsubscribe(subId);
      }
    }

    this.initialized = false;
    logger.info(`[${this.agentId}] Shutdown complete`);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let knowledgeAgent: KnowledgeManagementAgent | null = null;

/**
 * Get global knowledge agent
 */
export function getKnowledgeAgent(): KnowledgeManagementAgent {
  if (!knowledgeAgent) {
    knowledgeAgent = new KnowledgeManagementAgent();
  }
  return knowledgeAgent;
}

/**
 * Initialize knowledge agent
 */
export async function initKnowledgeAgent(config?: AgentConfig): Promise<KnowledgeManagementAgent> {
  knowledgeAgent = new KnowledgeManagementAgent(config);
  await knowledgeAgent.initialize();
  return knowledgeAgent;
}
