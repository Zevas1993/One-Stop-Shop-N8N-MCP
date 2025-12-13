/**
 * Unified LLM Router
 *
 * Smart router that automatically selects the best available LLM backend:
 * 1. Docker Model Runner (PREFERRED) - Docker Desktop 4.54+ with vLLM support
 * 2. Ollama (FALLBACK) - Cross-platform, easy setup, works everywhere
 * 3. vLLM (CUSTOM) - High-performance for custom Linux/Docker deployments
 *
 * Features:
 * - Automatic backend detection and health monitoring
 * - Graceful fallback between backends
 * - Dual-model architecture (embedding + generation)
 * - Hardware-aware model selection
 * - Unified API regardless of backend
 * - Docker Model Runner with vLLM for GPU-accelerated inference
 */

import { logger } from "../utils/logger";
import { OllamaClient, createOllamaClient } from "./ollama-client";
import { VLLMClient, createVLLMClient } from "./vllm-client";
import {
  DockerModelRunnerClient,
  createDockerModelRunnerClient,
} from "./docker-model-runner-client";
import {
  HardwareDetector,
  EmbeddingModelOption,
  GenerationModelOption,
} from "./hardware-detector";
import { EventBus, getEventBus, EventTypes } from "./event-bus";

// ============================================================================
// TYPES
// ============================================================================

export type LLMBackend = "docker-model-runner" | "ollama" | "vllm" | "none";

export interface LLMRouterConfig {
  // Docker Model Runner settings (preferred for Docker Desktop 4.54+)
  dockerModelRunnerUrl?: string; // Auto-detect if not specified
  dockerModelRunnerModel?: string; // Default: ai/smollm2-vllm
  preferDockerModelRunner?: boolean; // Default: true

  // Ollama settings (fallback)
  ollamaUrl?: string; // Default: http://localhost:11434

  // vLLM settings (for custom deployments)
  vllmEmbeddingUrl?: string; // Default: http://localhost:8001
  vllmGenerationUrl?: string; // Default: http://localhost:8002

  // Model overrides (auto-detected if not specified)
  embeddingModel?: string;
  generationModel?: string;

  // Behavior
  preferVLLM?: boolean; // Prefer standalone vLLM when available (default: false)
  autoFallback?: boolean; // Auto-switch on failure (default: true)
  healthCheckInterval?: number; // Health check interval in ms (default: 30000)
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
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RouterStatus {
  initialized: boolean;
  activeBackend: LLMBackend;
  dockerModelRunnerAvailable: boolean;
  dockerModelRunnerVLLMEnabled: boolean;
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
  private dockerModelRunnerClient: DockerModelRunnerClient | null = null;
  private ollamaClient: OllamaClient | null = null;
  private vllmEmbeddingClient: VLLMClient | null = null;
  private vllmGenerationClient: VLLMClient | null = null;

  private embeddingModel: string;
  private generationModel: string;
  private ollamaEmbeddingModel: string;
  private ollamaGenerationModel: string;

  private activeEmbeddingBackend: LLMBackend = "none";
  private activeGenerationBackend: LLMBackend = "none";

  private dockerModelRunnerAvailable: boolean = false;
  private dockerModelRunnerVLLMEnabled: boolean = false;
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
      // Docker Model Runner (preferred)
      dockerModelRunnerUrl:
        config.dockerModelRunnerUrl ||
        process.env.DOCKER_MODEL_RUNNER_URL ||
        "", // Auto-detect if empty
      dockerModelRunnerModel:
        config.dockerModelRunnerModel ||
        process.env.DOCKER_MODEL_RUNNER_MODEL ||
        "ai/smollm2-vllm",
      preferDockerModelRunner: config.preferDockerModelRunner ?? true,

      // Ollama (fallback)
      ollamaUrl:
        config.ollamaUrl || process.env.OLLAMA_URL || "http://localhost:11434",

      // Standalone vLLM (custom deployments)
      vllmEmbeddingUrl:
        config.vllmEmbeddingUrl ||
        process.env.VLLM_EMBEDDING_URL ||
        "http://localhost:8001",
      vllmGenerationUrl:
        config.vllmGenerationUrl ||
        process.env.VLLM_GENERATION_URL ||
        "http://localhost:8002",

      // Models
      embeddingModel: config.embeddingModel || hardware.embeddingModel,
      generationModel: config.generationModel || hardware.generationModel,

      // Behavior
      preferVLLM: config.preferVLLM ?? false,
      autoFallback: config.autoFallback ?? true,
      healthCheckInterval: config.healthCheckInterval ?? 30000,
    };

    // Map hardware detector models to actual model names
    this.embeddingModel = this.config.embeddingModel;
    this.generationModel = this.config.generationModel;

    // Ollama model names (may differ from vLLM)
    this.ollamaEmbeddingModel = this.mapToOllamaModel(
      this.embeddingModel,
      "embedding"
    );
    this.ollamaGenerationModel = this.mapToOllamaModel(
      this.generationModel,
      "generation"
    );

    logger.info("[LLMRouter] Configured", {
      dockerModelRunnerUrl: this.config.dockerModelRunnerUrl || "auto-detect",
      dockerModelRunnerModel: this.config.dockerModelRunnerModel,
      preferDockerModelRunner: this.config.preferDockerModelRunner,
      ollamaUrl: this.config.ollamaUrl,
      embeddingModel: this.embeddingModel,
      generationModel: this.generationModel,
    });
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the router - detects available backends
   */
  async initialize(): Promise<boolean> {
    logger.info("[LLMRouter] Initializing...");

    try {
      // Get event bus for publishing LLM events
      this.eventBus = await getEventBus();

      // Initialize Docker Model Runner client (preferred)
      this.dockerModelRunnerClient = createDockerModelRunnerClient({
        baseUrl: this.config.dockerModelRunnerUrl || undefined, // Auto-detect
        model: this.config.dockerModelRunnerModel,
      });

      // Initialize Ollama client (fallback)
      this.ollamaClient = createOllamaClient({
        baseUrl: this.config.ollamaUrl,
      });

      // Initialize standalone vLLM clients (custom deployments)
      this.vllmEmbeddingClient = createVLLMClient(
        "embedding",
        this.embeddingModel,
        this.config.vllmEmbeddingUrl
      );
      this.vllmGenerationClient = createVLLMClient(
        "generation",
        this.generationModel,
        this.config.vllmGenerationUrl
      );

      // Check availability of all backends
      await this.checkAllBackends();

      // Select active backends based on availability and preference
      this.selectActiveBackends();

      // Start periodic health checks
      this.startHealthChecks();

      this.initialized = true;

      // Ensure at least one backend is available
      if (
        this.activeEmbeddingBackend === "none" &&
        this.activeGenerationBackend === "none"
      ) {
        logger.warn(
          "[LLMRouter] No LLM backends available - LLM features will be disabled"
        );
        return false;
      }

      // Pull models if using Ollama and they're not present
      if (this.activeGenerationBackend === "ollama" && this.ollamaAvailable) {
        await this.ensureOllamaModels();
      }

      logger.info("[LLMRouter] ✅ Initialized", {
        embeddingBackend: this.activeEmbeddingBackend,
        generationBackend: this.activeGenerationBackend,
        dockerModelRunnerAvailable: this.dockerModelRunnerAvailable,
        dockerModelRunnerVLLM: this.dockerModelRunnerVLLMEnabled,
      });

      return true;
    } catch (error: any) {
      logger.error("[LLMRouter] Initialization failed:", error.message);
      return false;
    }
  }

  /**
   * Map hardware detector model enum to Ollama model name
   */
  private mapToOllamaModel(
    model: string,
    type: "embedding" | "generation"
  ): string {
    // Embedding models
    // Embedding models
    const embeddingMap: Record<string, string> = {
      [EmbeddingModelOption.EMBEDDING_GEMMA_300M]: "nomic-embed-text",
      [EmbeddingModelOption.NOMIC_EMBED_TEXT]: "nomic-embed-text",
    };

    // Generation models
    const generationMap: Record<string, string> = {
      [GenerationModelOption.GEMMA_3_270M]: "gemma:2b",
      [GenerationModelOption.LLAMA_3_2_1B]: "llama3.2:1b",
      [GenerationModelOption.DEEPSEEK_R1_1_5B]: "deepseek-r1:1.5b",
      [GenerationModelOption.LLAMA_3_2_3B]: "llama3.2:3b",
      [GenerationModelOption.NEMOTRON_NANO_4B]: "nemotron-mini",
    };

    if (type === "embedding") {
      return embeddingMap[model] || "nomic-embed-text";
    } else {
      return generationMap[model] || "llama3.2:1b";
    }
  }

  /**
   * Check all backend availability
   */
  private async checkAllBackends(): Promise<void> {
    // Check Docker Model Runner first (preferred)
    let dockerModelRunnerStatus = { available: false, vllmEnabled: false };
    if (this.dockerModelRunnerClient) {
      try {
        const status = await this.dockerModelRunnerClient.getStatus();
        dockerModelRunnerStatus = {
          available: status.available,
          vllmEnabled: status.vllmEnabled,
        };
      } catch {
        dockerModelRunnerStatus = { available: false, vllmEnabled: false };
      }
    }

    // Check other backends in parallel
    const checks = await Promise.all([
      this.ollamaClient?.checkHealth().catch(() => false) || false,
      this.vllmEmbeddingClient?.checkHealth().catch(() => false) || false,
      this.vllmGenerationClient?.checkHealth().catch(() => false) || false,
    ]);

    this.dockerModelRunnerAvailable = dockerModelRunnerStatus.available;
    this.dockerModelRunnerVLLMEnabled = dockerModelRunnerStatus.vllmEnabled;
    this.ollamaAvailable = checks[0];
    this.vllmEmbeddingAvailable = checks[1];
    this.vllmGenerationAvailable = checks[2];
    this.lastHealthCheck = Date.now();

    logger.debug("[LLMRouter] Backend availability", {
      dockerModelRunner: this.dockerModelRunnerAvailable,
      dockerModelRunnerVLLM: this.dockerModelRunnerVLLMEnabled,
      ollama: this.ollamaAvailable,
      vllmEmbedding: this.vllmEmbeddingAvailable,
      vllmGeneration: this.vllmGenerationAvailable,
    });
  }

  /**
   * Select which backends to use based on availability and preference
   * Priority: Docker Model Runner > Ollama > Standalone vLLM
   */
  private selectActiveBackends(): void {
    // For embeddings - Docker Model Runner is preferred
    if (this.config.preferDockerModelRunner && this.dockerModelRunnerAvailable) {
      this.activeEmbeddingBackend = "docker-model-runner";
    } else if (this.config.preferVLLM && this.vllmEmbeddingAvailable) {
      this.activeEmbeddingBackend = "vllm";
    } else if (this.ollamaAvailable) {
      this.activeEmbeddingBackend = "ollama";
    } else if (this.dockerModelRunnerAvailable) {
      this.activeEmbeddingBackend = "docker-model-runner";
    } else if (this.vllmEmbeddingAvailable) {
      this.activeEmbeddingBackend = "vllm";
    } else {
      this.activeEmbeddingBackend = "none";
    }

    // For generation - Docker Model Runner is preferred
    if (this.config.preferDockerModelRunner && this.dockerModelRunnerAvailable) {
      this.activeGenerationBackend = "docker-model-runner";
    } else if (this.config.preferVLLM && this.vllmGenerationAvailable) {
      this.activeGenerationBackend = "vllm";
    } else if (this.ollamaAvailable) {
      this.activeGenerationBackend = "ollama";
    } else if (this.dockerModelRunnerAvailable) {
      this.activeGenerationBackend = "docker-model-runner";
    } else if (this.vllmGenerationAvailable) {
      this.activeGenerationBackend = "vllm";
    } else {
      this.activeGenerationBackend = "none";
    }

    logger.info("[LLMRouter] Selected backends", {
      embedding: this.activeEmbeddingBackend,
      generation: this.activeGenerationBackend,
    });
  }

  /**
   * Ensure Ollama models are available
   */
  private async ensureOllamaModels(): Promise<void> {
    if (!this.ollamaClient || !this.ollamaAvailable) return;

    // Check embedding model
    const hasEmbedding = await this.ollamaClient.hasModel(
      this.ollamaEmbeddingModel
    );
    if (!hasEmbedding) {
      logger.info(
        `[LLMRouter] Pulling embedding model: ${this.ollamaEmbeddingModel}`
      );
      await this.ollamaClient.pullModel(this.ollamaEmbeddingModel);
    }

    // Check generation model
    const hasGeneration = await this.ollamaClient.hasModel(
      this.ollamaGenerationModel
    );
    if (!hasGeneration) {
      logger.info(
        `[LLMRouter] Pulling generation model: ${this.ollamaGenerationModel}`
      );
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
  async generate(
    prompt: string,
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    const startTime = Date.now();

    // Publish event
    if (this.eventBus) {
      await this.eventBus.publish(
        EventTypes.LLM_REQUEST,
        {
          type: "generate",
          promptLength: prompt.length,
          options,
        },
        "llm-router"
      );
    }

    try {
      let result: GenerateResult;

      if (
        this.activeGenerationBackend === "docker-model-runner" &&
        this.dockerModelRunnerClient
      ) {
        result = await this.generateWithDockerModelRunner(prompt, options);
      } else if (this.activeGenerationBackend === "ollama" && this.ollamaClient) {
        result = await this.generateWithOllama(prompt, options);
      } else if (
        this.activeGenerationBackend === "vllm" &&
        this.vllmGenerationClient
      ) {
        result = await this.generateWithVLLM(prompt, options);
      } else {
        throw new Error("No generation backend available");
      }

      // Publish success event
      if (this.eventBus) {
        await this.eventBus.publish(
          EventTypes.LLM_RESPONSE,
          {
            type: "generate",
            backend: result.backend,
            tokens: result.tokens,
            latency: result.latency,
          },
          "llm-router"
        );
      }

      return result;
    } catch (error: any) {
      // Try fallback if enabled
      if (this.config.autoFallback) {
        const fallbackResult = await this.generateWithFallback(
          prompt,
          options,
          error
        );
        if (fallbackResult) return fallbackResult;
      }

      // Publish error event
      if (this.eventBus) {
        await this.eventBus.publish(
          EventTypes.LLM_ERROR,
          {
            type: "generate",
            error: error.message,
          },
          "llm-router"
        );
      }

      throw error;
    }
  }

  /**
   * Generate with Docker Model Runner (preferred)
   */
  private async generateWithDockerModelRunner(
    prompt: string,
    options: GenerateOptions
  ): Promise<GenerateResult> {
    if (!this.dockerModelRunnerClient)
      throw new Error("Docker Model Runner client not initialized");

    const response = await this.dockerModelRunnerClient.generate(prompt, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      stop: options.stop,
    });

    return {
      text: response.text,
      model: response.model,
      backend: "docker-model-runner",
      tokens: response.tokens,
      latency: response.latency,
    };
  }

  /**
   * Generate with Ollama
   */
  private async generateWithOllama(
    prompt: string,
    options: GenerateOptions
  ): Promise<GenerateResult> {
    if (!this.ollamaClient) throw new Error("Ollama client not initialized");

    const response = await this.ollamaClient.generate(
      this.ollamaGenerationModel,
      prompt,
      {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topP: options.topP,
        stop: options.stop,
        system: options.system,
      }
    );

    return {
      text: response.text,
      model: response.model,
      backend: "ollama",
      tokens: response.tokens,
      latency: response.generationTime,
    };
  }

  /**
   * Generate with vLLM
   */
  private async generateWithVLLM(
    prompt: string,
    options: GenerateOptions
  ): Promise<GenerateResult> {
    if (!this.vllmGenerationClient)
      throw new Error("vLLM client not initialized");

    const response = await this.vllmGenerationClient.generateText(prompt, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      stopSequences: options.stop,
    });

    return {
      text: response.text,
      model: response.modelId,
      backend: "vllm",
      tokens: response.tokens,
      latency: response.generationTime,
    };
  }

  /**
   * Try fallback backend for generation
   */
  private async generateWithFallback(
    prompt: string,
    options: GenerateOptions,
    originalError: Error
  ): Promise<GenerateResult | null> {
    logger.warn(
      `[LLMRouter] Generation failed on ${this.activeGenerationBackend}, trying fallback...`
    );

    // Define fallback order based on current backend
    const fallbackOrder: LLMBackend[] = [];

    if (this.activeGenerationBackend === "docker-model-runner") {
      // Docker Model Runner failed, try Ollama then vLLM
      if (this.ollamaAvailable) fallbackOrder.push("ollama");
      if (this.vllmGenerationAvailable) fallbackOrder.push("vllm");
    } else if (this.activeGenerationBackend === "ollama") {
      // Ollama failed, try Docker Model Runner then vLLM
      if (this.dockerModelRunnerAvailable) fallbackOrder.push("docker-model-runner");
      if (this.vllmGenerationAvailable) fallbackOrder.push("vllm");
    } else if (this.activeGenerationBackend === "vllm") {
      // vLLM failed, try Docker Model Runner then Ollama
      if (this.dockerModelRunnerAvailable) fallbackOrder.push("docker-model-runner");
      if (this.ollamaAvailable) fallbackOrder.push("ollama");
    }

    // Try each fallback in order
    for (const backend of fallbackOrder) {
      try {
        if (backend === "docker-model-runner" && this.dockerModelRunnerClient) {
          return await this.generateWithDockerModelRunner(prompt, options);
        } else if (backend === "ollama" && this.ollamaClient) {
          return await this.generateWithOllama(prompt, options);
        } else if (backend === "vllm" && this.vllmGenerationClient) {
          return await this.generateWithVLLM(prompt, options);
        }
      } catch (error) {
        logger.warn(`[LLMRouter] ${backend} fallback also failed:`, error);
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
  async chat(
    messages: ChatMessage[],
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    const startTime = Date.now();

    try {
      // Docker Model Runner - native chat support
      if (
        this.activeGenerationBackend === "docker-model-runner" &&
        this.dockerModelRunnerClient
      ) {
        const response = await this.dockerModelRunnerClient.chat(messages, {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP,
          stop: options.stop,
        });

        return {
          text: response.text,
          model: response.model,
          backend: "docker-model-runner",
          tokens: response.tokens,
          latency: response.latency,
        };
      }

      // Ollama - native chat support
      if (this.activeGenerationBackend === "ollama" && this.ollamaClient) {
        const response = await this.ollamaClient.chat(
          this.ollamaGenerationModel,
          messages,
          {
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            topP: options.topP,
            stop: options.stop,
          }
        );

        return {
          text: response.text,
          model: response.model,
          backend: "ollama",
          tokens: response.tokens,
          latency: response.generationTime,
        };
      }

      // Standalone vLLM - build prompt from messages
      if (
        this.activeGenerationBackend === "vllm" &&
        this.vllmGenerationClient
      ) {
        const prompt = messages
          .map((m) => {
            if (m.role === "system") return `System: ${m.content}`;
            if (m.role === "user") return `User: ${m.content}`;
            return `Assistant: ${m.content}`;
          })
          .join("\n");

        return await this.generateWithVLLM(prompt, options);
      }

      throw new Error("No generation backend available");
    } catch (error: any) {
      logger.error("[LLMRouter] Chat failed:", error.message);
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
      // Docker Model Runner - preferred
      if (
        this.activeEmbeddingBackend === "docker-model-runner" &&
        this.dockerModelRunnerClient
      ) {
        const response = await this.dockerModelRunnerClient.generateEmbedding(text);
        return {
          embedding: response.embedding,
          model: response.model,
          backend: "docker-model-runner",
          latency: response.latency,
        };
      }

      // Ollama - fallback
      if (this.activeEmbeddingBackend === "ollama" && this.ollamaClient) {
        const response = await this.ollamaClient.embed(
          this.ollamaEmbeddingModel,
          text
        );
        return {
          embedding: response.embedding,
          model: this.ollamaEmbeddingModel,
          backend: "ollama",
          latency: response.processingTime,
        };
      }

      // Standalone vLLM
      if (
        this.activeEmbeddingBackend === "vllm" &&
        this.vllmEmbeddingClient
      ) {
        const response = await this.vllmEmbeddingClient.generateEmbedding(text);
        return {
          embedding: response.embedding,
          model: response.modelId,
          backend: "vllm",
          latency: response.processingTime,
        };
      }

      throw new Error("No embedding backend available");
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
  private async embedWithFallback(
    text: string,
    originalError: Error
  ): Promise<EmbedResult | null> {
    logger.warn(
      `[LLMRouter] Embedding failed on ${this.activeEmbeddingBackend}, trying fallback...`
    );

    // Define fallback order based on current backend
    const fallbackOrder: LLMBackend[] = [];

    if (this.activeEmbeddingBackend === "docker-model-runner") {
      if (this.ollamaAvailable) fallbackOrder.push("ollama");
      if (this.vllmEmbeddingAvailable) fallbackOrder.push("vllm");
    } else if (this.activeEmbeddingBackend === "ollama") {
      if (this.dockerModelRunnerAvailable) fallbackOrder.push("docker-model-runner");
      if (this.vllmEmbeddingAvailable) fallbackOrder.push("vllm");
    } else if (this.activeEmbeddingBackend === "vllm") {
      if (this.dockerModelRunnerAvailable) fallbackOrder.push("docker-model-runner");
      if (this.ollamaAvailable) fallbackOrder.push("ollama");
    }

    // Try each fallback
    for (const backend of fallbackOrder) {
      try {
        if (backend === "docker-model-runner" && this.dockerModelRunnerClient) {
          const response = await this.dockerModelRunnerClient.generateEmbedding(text);
          return {
            embedding: response.embedding,
            model: response.model,
            backend: "docker-model-runner",
            latency: response.latency,
          };
        } else if (backend === "ollama" && this.ollamaClient) {
          const response = await this.ollamaClient.embed(
            this.ollamaEmbeddingModel,
            text
          );
          return {
            embedding: response.embedding,
            model: this.ollamaEmbeddingModel,
            backend: "ollama",
            latency: response.processingTime,
          };
        } else if (backend === "vllm" && this.vllmEmbeddingClient) {
          const response = await this.vllmEmbeddingClient.generateEmbedding(text);
          return {
            embedding: response.embedding,
            model: response.modelId,
            backend: "vllm",
            latency: response.processingTime,
          };
        }
      } catch (error) {
        logger.warn(`[LLMRouter] ${backend} embedding fallback also failed`);
      }
    }

    return null;
  }

  /**
   * Batch embeddings
   */
  async embedBatch(texts: string[]): Promise<EmbedResult[]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  // ==========================================================================
  // STATUS & MANAGEMENT
  // ==========================================================================

  /**
   * Get router status
   */
  getStatus(): RouterStatus {
    // Determine which model is active
    let embeddingModel = this.embeddingModel;
    let generationModel = this.generationModel;

    if (this.activeEmbeddingBackend === "ollama") {
      embeddingModel = this.ollamaEmbeddingModel;
    } else if (this.activeEmbeddingBackend === "docker-model-runner") {
      embeddingModel = this.config.dockerModelRunnerModel;
    }

    if (this.activeGenerationBackend === "ollama") {
      generationModel = this.ollamaGenerationModel;
    } else if (this.activeGenerationBackend === "docker-model-runner") {
      generationModel = this.config.dockerModelRunnerModel;
    }

    return {
      initialized: this.initialized,
      activeBackend: this.activeGenerationBackend, // Primary indicator
      dockerModelRunnerAvailable: this.dockerModelRunnerAvailable,
      dockerModelRunnerVLLMEnabled: this.dockerModelRunnerVLLMEnabled,
      ollamaAvailable: this.ollamaAvailable,
      vllmEmbeddingAvailable: this.vllmEmbeddingAvailable,
      vllmGenerationAvailable: this.vllmGenerationAvailable,
      embeddingModel,
      generationModel,
      lastHealthCheck: this.lastHealthCheck,
    };
  }

  /**
   * Check if LLM is available
   */
  isAvailable(): boolean {
    return (
      this.initialized &&
      (this.activeGenerationBackend !== "none" ||
        this.activeEmbeddingBackend !== "none")
    );
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
    logger.info("[LLMRouter] Shutdown complete");
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
export async function initLLMRouter(
  config?: LLMRouterConfig
): Promise<LLMRouter> {
  routerInstance = new LLMRouter(config);
  await routerInstance.initialize();
  return routerInstance;
}
