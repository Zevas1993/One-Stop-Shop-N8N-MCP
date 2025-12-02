/**
 * Unified LLM Router
 * 
 * Smart router that automatically selects the best available LLM backend:
 * 1. Ollama (PRIMARY) - Cross-platform, easy setup, works everywhere
 * 2. vLLM (FALLBACK) - High-performance for Linux/Docker with GPU
 * 
 * Features:
 * - Automatic backend detection and health monitoring
 * - Graceful fallback between backends
 * - Dual-model architecture (embedding + generation)
 * - Hardware-aware model selection
 * - Unified API regardless of backend
 */

import { logger } from '../utils/logger';
import { OllamaClient, createOllamaClient } from './ollama-client';
import { VLLMClient, createVLLMClient } from './vllm-client';
import { HardwareDetector, EmbeddingModelOption, GenerationModelOption } from './hardware-detector';
import { EventBus, getEventBus, EventTypes } from './event-bus';

// ============================================================================
// TYPES
// ============================================================================

export type LLMBackend = 'ollama' | 'vllm' | 'none';

export interface LLMRouterConfig {
  // Ollama settings (primary)
  ollamaUrl?: string;                   // Default: http://localhost:11434
  
  // vLLM settings (fallback for high-performance)
  vllmEmbeddingUrl?: string;            // Default: http://localhost:8001
  vllmGenerationUrl?: string;           // Default: http://localhost:8002
  
  // Model overrides (auto-detected if not specified)
  embeddingModel?: string;
  generationModel?: string;
  
  // Behavior
  preferVLLM?: boolean;                 // Prefer vLLM when available (default: false)
  autoFallback?: boolean;               // Auto-switch on failure (default: true)
  healthCheckInterval?: number;         // Health check interval in ms (default: 30000)
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  system?: string;
}

export interface GenerateResult {
  text: string;
  model: string;
  backend: LLMBackend;
  tokens: number;
  latency: number;
}

export interface EmbedResult {
  embedding: number[];
  model: string;
  backend: LLMBackend;
  latency: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface RouterStatus {
  initialized: boolean;
  activeBackend: LLMBackend;
  ollamaAvailable: boolean;
  vllmEmbeddingAvailable: boolean;
  vllmGenerationAvailable: boolean;
  embeddingModel: string;
  generationModel: string;
  lastHealthCheck: number;
}

// ============================================================================
// LLM ROUTER CLASS
// ============================================================================

export class LLMRouter {
  private config: Required<LLMRouterConfig>;
  private ollamaClient: OllamaClient | null = null;
  private vllmEmbeddingClient: VLLMClient | null = null;
  private vllmGenerationClient: VLLMClient | null = null;
  
  private embeddingModel: string;
  private generationModel: string;
  private ollamaEmbeddingModel: string;
  private ollamaGenerationModel: string;
  
  private activeEmbeddingBackend: LLMBackend = 'none';
  private activeGenerationBackend: LLMBackend = 'none';
  
  private ollamaAvailable: boolean = false;
  private vllmEmbeddingAvailable: boolean = false;
  private vllmGenerationAvailable: boolean = false;
  
  private initialized: boolean = false;
  private lastHealthCheck: number = 0;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  
  private eventBus: EventBus | null = null;

  constructor(config: LLMRouterConfig = {}) {
    // Detect optimal models based on hardware
    const hardware = HardwareDetector.detectHardware();
    
    this.config = {
      ollamaUrl: config.ollamaUrl || process.env.OLLAMA_URL || 'http://localhost:11434',
      vllmEmbeddingUrl: config.vllmEmbeddingUrl || process.env.VLLM_EMBEDDING_URL || 'http://localhost:8001',
      vllmGenerationUrl: config.vllmGenerationUrl || process.env.VLLM_GENERATION_URL || 'http://localhost:8002',
      embeddingModel: config.embeddingModel || hardware.embeddingModel,
      generationModel: config.generationModel || hardware.generationModel,
      preferVLLM: config.preferVLLM ?? false,
      autoFallback: config.autoFallback ?? true,
      healthCheckInterval: config.healthCheckInterval ?? 30000,
    };

    // Map hardware detector models to actual model names
    this.embeddingModel = this.config.embeddingModel;
    this.generationModel = this.config.generationModel;
    
    // Ollama model names (may differ from vLLM)
    this.ollamaEmbeddingModel = this.mapToOllamaModel(this.embeddingModel, 'embedding');
    this.ollamaGenerationModel = this.mapToOllamaModel(this.generationModel, 'generation');

    logger.info('[LLMRouter] Configured', {
      ollamaUrl: this.config.ollamaUrl,
      embeddingModel: this.embeddingModel,
      generationModel: this.generationModel,
      preferVLLM: this.config.preferVLLM,
    });
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the router - detects available backends
   */
  async initialize(): Promise<boolean> {
    logger.info('[LLMRouter] Initializing...');

    try {
      // Get event bus for publishing LLM events
      this.eventBus = await getEventBus();

      // Initialize clients
      this.ollamaClient = createOllamaClient({ baseUrl: this.config.ollamaUrl });
      this.vllmEmbeddingClient = createVLLMClient('embedding', this.embeddingModel, this.config.vllmEmbeddingUrl);
      this.vllmGenerationClient = createVLLMClient('generation', this.generationModel, this.config.vllmGenerationUrl);

      // Check availability
      await this.checkAllBackends();

      // Select active backends
      this.selectActiveBackends();

      // Start periodic health checks
      this.startHealthChecks();

      this.initialized = true;

      // Ensure at least one backend is available
      if (this.activeEmbeddingBackend === 'none' && this.activeGenerationBackend === 'none') {
        logger.warn('[LLMRouter] No LLM backends available - LLM features will be disabled');
        return false;
      }

      // Pull models if using Ollama and they're not present
      if (this.ollamaAvailable) {
        await this.ensureOllamaModels();
      }

      logger.info('[LLMRouter] ✅ Initialized', {
        embeddingBackend: this.activeEmbeddingBackend,
        generationBackend: this.activeGenerationBackend,
      });

      return true;

    } catch (error: any) {
      logger.error('[LLMRouter] Initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Map hardware detector model enum to Ollama model name
   */
  private mapToOllamaModel(model: string, type: 'embedding' | 'generation'): string {
    // Embedding models
    const embeddingMap: Record<string, string> = {
      [EmbeddingModelOption.EMBEDDING_GEMMA_300M]: 'nomic-embed-text',
      [EmbeddingModelOption.NOMIC_EMBED_TEXT]: 'nomic-embed-text',
      'embedding-gemma-300m': 'nomic-embed-text',
      'nomic-embed-text-v1.5': 'nomic-embed-text',
    };

    // Generation models
    const generationMap: Record<string, string> = {
      [GenerationModelOption.GEMMA_3_270M]: 'gemma:2b',
      [GenerationModelOption.LLAMA_3_2_1B]: 'llama3.2:1b',
      [GenerationModelOption.DEEPSEEK_R1_1_5B]: 'deepseek-r1:1.5b',
      [GenerationModelOption.LLAMA_3_2_3B]: 'llama3.2:3b',
      [GenerationModelOption.NEMOTRON_NANO_4B]: 'nemotron-mini',
      'gemma-3-270m': 'gemma:2b',
      'llama-3.2-1b': 'llama3.2:1b',
      'deepseek-r1-distill-1.5b': 'deepseek-r1:1.5b',
      'llama-3.2-3b': 'llama3.2:3b',
      'nemotron-nano-4b': 'nemotron-mini',
    };

    if (type === 'embedding') {
      return embeddingMap[model] || 'nomic-embed-text';
    } else {
      return generationMap[model] || 'llama3.2:1b';
    }
  }

  /**
   * Check all backend availability
   */
  private async checkAllBackends(): Promise<void> {
    const checks = await Promise.all([
      this.ollamaClient?.checkHealth().catch(() => false) || false,
      this.vllmEmbeddingClient?.checkHealth().catch(() => false) || false,
      this.vllmGenerationClient?.checkHealth().catch(() => false) || false,
    ]);

    this.ollamaAvailable = checks[0];
    this.vllmEmbeddingAvailable = checks[1];
    this.vllmGenerationAvailable = checks[2];
    this.lastHealthCheck = Date.now();

    logger.debug('[LLMRouter] Backend availability', {
      ollama: this.ollamaAvailable,
      vllmEmbedding: this.vllmEmbeddingAvailable,
      vllmGeneration: this.vllmGenerationAvailable,
    });
  }

  /**
   * Select which backends to use based on availability and preference
   */
  private selectActiveBackends(): void {
    // For embeddings
    if (this.config.preferVLLM && this.vllmEmbeddingAvailable) {
      this.activeEmbeddingBackend = 'vllm';
    } else if (this.ollamaAvailable) {
      this.activeEmbeddingBackend = 'ollama';
    } else if (this.vllmEmbeddingAvailable) {
      this.activeEmbeddingBackend = 'vllm';
    } else {
      this.activeEmbeddingBackend = 'none';
    }

    // For generation
    if (this.config.preferVLLM && this.vllmGenerationAvailable) {
      this.activeGenerationBackend = 'vllm';
    } else if (this.ollamaAvailable) {
      this.activeGenerationBackend = 'ollama';
    } else if (this.vllmGenerationAvailable) {
      this.activeGenerationBackend = 'vllm';
    } else {
      this.activeGenerationBackend = 'none';
    }
  }

  /**
   * Ensure Ollama models are available
   */
  private async ensureOllamaModels(): Promise<void> {
    if (!this.ollamaClient || !this.ollamaAvailable) return;

    // Check embedding model
    const hasEmbedding = await this.ollamaClient.hasModel(this.ollamaEmbeddingModel);
    if (!hasEmbedding) {
      logger.info(`[LLMRouter] Pulling embedding model: ${this.ollamaEmbeddingModel}`);
      await this.ollamaClient.pullModel(this.ollamaEmbeddingModel);
    }

    // Check generation model
    const hasGeneration = await this.ollamaClient.hasModel(this.ollamaGenerationModel);
    if (!hasGeneration) {
      logger.info(`[LLMRouter] Pulling generation model: ${this.ollamaGenerationModel}`);
      await this.ollamaClient.pullModel(this.ollamaGenerationModel);
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.checkAllBackends();
      this.selectActiveBackends();
    }, this.config.healthCheckInterval);
  }

  // ==========================================================================
  // GENERATION
  // ==========================================================================

  /**
   * Generate text completion
   */
  async generate(prompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
    const startTime = Date.now();

    // Publish event
    if (this.eventBus) {
      await this.eventBus.publish(EventTypes.LLM_REQUEST, {
        type: 'generate',
        promptLength: prompt.length,
        options,
      }, 'llm-router');
    }

    try {
      let result: GenerateResult;

      if (this.activeGenerationBackend === 'ollama' && this.ollamaClient) {
        result = await this.generateWithOllama(prompt, options);
      } else if (this.activeGenerationBackend === 'vllm' && this.vllmGenerationClient) {
        result = await this.generateWithVLLM(prompt, options);
      } else {
        throw new Error('No generation backend available');
      }

      // Publish success event
      if (this.eventBus) {
        await this.eventBus.publish(EventTypes.LLM_RESPONSE, {
          type: 'generate',
          backend: result.backend,
          tokens: result.tokens,
          latency: result.latency,
        }, 'llm-router');
      }

      return result;

    } catch (error: any) {
      // Try fallback if enabled
      if (this.config.autoFallback) {
        const fallbackResult = await this.generateWithFallback(prompt, options, error);
        if (fallbackResult) return fallbackResult;
      }

      // Publish error event
      if (this.eventBus) {
        await this.eventBus.publish(EventTypes.LLM_ERROR, {
          type: 'generate',
          error: error.message,
        }, 'llm-router');
      }

      throw error;
    }
  }

  /**
   * Generate with Ollama
   */
  private async generateWithOllama(prompt: string, options: GenerateOptions): Promise<GenerateResult> {
    if (!this.ollamaClient) throw new Error('Ollama client not initialized');

    const response = await this.ollamaClient.generate(this.ollamaGenerationModel, prompt, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      stop: options.stop,
      system: options.system,
    });

    return {
      text: response.text,
      model: response.model,
      backend: 'ollama',
      tokens: response.tokens,
      latency: response.generationTime,
    };
  }

  /**
   * Generate with vLLM
   */
  private async generateWithVLLM(prompt: string, options: GenerateOptions): Promise<GenerateResult> {
    if (!this.vllmGenerationClient) throw new Error('vLLM client not initialized');

    const response = await this.vllmGenerationClient.generateText(prompt, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      stopSequences: options.stop,
    });

    return {
      text: response.text,
      model: response.modelId,
      backend: 'vllm',
      tokens: response.tokens,
      latency: response.generationTime,
    };
  }

  /**
   * Try fallback backend for generation
   */
  private async generateWithFallback(prompt: string, options: GenerateOptions, originalError: Error): Promise<GenerateResult | null> {
    logger.warn(`[LLMRouter] Generation failed on ${this.activeGenerationBackend}, trying fallback...`);

    // Try the other backend
    if (this.activeGenerationBackend === 'ollama' && this.vllmGenerationAvailable && this.vllmGenerationClient) {
      try {
        return await this.generateWithVLLM(prompt, options);
      } catch (error) {
        logger.warn('[LLMRouter] vLLM fallback also failed:', error);
      }
    } else if (this.activeGenerationBackend === 'vllm' && this.ollamaAvailable && this.ollamaClient) {
      try {
        return await this.generateWithOllama(prompt, options);
      } catch (error) {
        logger.warn('[LLMRouter] Ollama fallback also failed:', error);
      }
    }

    return null;
  }

  // ==========================================================================
  // CHAT
  // ==========================================================================

  /**
   * Multi-turn chat completion
   */
  async chat(messages: ChatMessage[], options: GenerateOptions = {}): Promise<GenerateResult> {
    const startTime = Date.now();

    try {
      if (this.activeGenerationBackend === 'ollama' && this.ollamaClient) {
        const response = await this.ollamaClient.chat(this.ollamaGenerationModel, messages, {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP,
          stop: options.stop,
        });

        return {
          text: response.text,
          model: response.model,
          backend: 'ollama',
          tokens: response.tokens,
          latency: response.generationTime,
        };
      } else if (this.activeGenerationBackend === 'vllm' && this.vllmGenerationClient) {
        // vLLM chat endpoint - build prompt from messages
        const prompt = messages.map(m => {
          if (m.role === 'system') return `System: ${m.content}`;
          if (m.role === 'user') return `User: ${m.content}`;
          return `Assistant: ${m.content}`;
        }).join('\n');

        return await this.generateWithVLLM(prompt, options);
      } else {
        throw new Error('No generation backend available');
      }
    } catch (error: any) {
      logger.error('[LLMRouter] Chat failed:', error.message);
      throw error;
    }
  }

  // ==========================================================================
  // EMBEDDINGS
  // ==========================================================================

  /**
   * Generate embeddings for text
   */
  async embed(text: string): Promise<EmbedResult> {
    const startTime = Date.now();

    try {
      if (this.activeEmbeddingBackend === 'ollama' && this.ollamaClient) {
        const response = await this.ollamaClient.embed(this.ollamaEmbeddingModel, text);
        return {
          embedding: response.embedding,
          model: this.ollamaEmbeddingModel,
          backend: 'ollama',
          latency: response.processingTime,
        };
      } else if (this.activeEmbeddingBackend === 'vllm' && this.vllmEmbeddingClient) {
        const response = await this.vllmEmbeddingClient.generateEmbedding(text);
        return {
          embedding: response.embedding,
          model: response.modelId,
          backend: 'vllm',
          latency: response.processingTime,
        };
      } else {
        throw new Error('No embedding backend available');
      }
    } catch (error: any) {
      // Try fallback
      if (this.config.autoFallback) {
        const fallback = await this.embedWithFallback(text, error);
        if (fallback) return fallback;
      }
      throw error;
    }
  }

  /**
   * Try fallback for embeddings
   */
  private async embedWithFallback(text: string, originalError: Error): Promise<EmbedResult | null> {
    logger.warn(`[LLMRouter] Embedding failed on ${this.activeEmbeddingBackend}, trying fallback...`);

    if (this.activeEmbeddingBackend === 'ollama' && this.vllmEmbeddingAvailable && this.vllmEmbeddingClient) {
      try {
        const response = await this.vllmEmbeddingClient.generateEmbedding(text);
        return {
          embedding: response.embedding,
          model: response.modelId,
          backend: 'vllm',
          latency: response.processingTime,
        };
      } catch (error) {
        logger.warn('[LLMRouter] vLLM embedding fallback also failed');
      }
    } else if (this.activeEmbeddingBackend === 'vllm' && this.ollamaAvailable && this.ollamaClient) {
      try {
        const response = await this.ollamaClient.embed(this.ollamaEmbeddingModel, text);
        return {
          embedding: response.embedding,
          model: this.ollamaEmbeddingModel,
          backend: 'ollama',
          latency: response.processingTime,
        };
      } catch (error) {
        logger.warn('[LLMRouter] Ollama embedding fallback also failed');
      }
    }

    return null;
  }

  /**
   * Batch embeddings
   */
  async embedBatch(texts: string[]): Promise<EmbedResult[]> {
    return Promise.all(texts.map(text => this.embed(text)));
  }

  // ==========================================================================
  // STATUS & MANAGEMENT
  // ==========================================================================

  /**
   * Get router status
   */
  getStatus(): RouterStatus {
    return {
      initialized: this.initialized,
      activeBackend: this.activeGenerationBackend, // Primary indicator
      ollamaAvailable: this.ollamaAvailable,
      vllmEmbeddingAvailable: this.vllmEmbeddingAvailable,
      vllmGenerationAvailable: this.vllmGenerationAvailable,
      embeddingModel: this.activeEmbeddingBackend === 'ollama' ? this.ollamaEmbeddingModel : this.embeddingModel,
      generationModel: this.activeGenerationBackend === 'ollama' ? this.ollamaGenerationModel : this.generationModel,
      lastHealthCheck: this.lastHealthCheck,
    };
  }

  /**
   * Check if LLM is available
   */
  isAvailable(): boolean {
    return this.initialized && (this.activeGenerationBackend !== 'none' || this.activeEmbeddingBackend !== 'none');
  }

  /**
   * Force refresh backend availability
   */
  async refresh(): Promise<void> {
    await this.checkAllBackends();
    this.selectActiveBackends();
  }

  /**
   * Shutdown the router
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.initialized = false;
    logger.info('[LLMRouter] Shutdown complete');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let routerInstance: LLMRouter | null = null;

/**
 * Get global LLM router instance
 */
export function getLLMRouter(): LLMRouter {
  if (!routerInstance) {
    routerInstance = new LLMRouter();
  }
  return routerInstance;
}

/**
 * Initialize global LLM router
 */
export async function initLLMRouter(config?: LLMRouterConfig): Promise<LLMRouter> {
  routerInstance = new LLMRouter(config);
  await routerInstance.initialize();
  return routerInstance;
}
