/**
 * Docker Model Runner Client
 *
 * Client for Docker Desktop's built-in Model Runner with vLLM support.
 * Docker Desktop 4.54+ includes native vLLM inference for high-throughput
 * GPU-accelerated LLM inference on Windows with WSL2 and NVIDIA GPUs.
 *
 * Features:
 * - Auto-detect environment (host vs container)
 * - OpenAI-compatible API (/v1/chat/completions, /v1/embeddings)
 * - Automatic engine routing (GGUF → llama.cpp, Safetensors → vLLM)
 * - GPU memory configuration
 * - Health checking and model management
 *
 * API Documentation: https://docs.docker.com/ai/model-runner/api-reference/
 */

import { logger } from '../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface DockerModelRunnerConfig {
  baseUrl?: string;              // Auto-detect if not specified
  model?: string;                // Default: ai/smollm2-vllm
  embeddingModel?: string;       // Model for embeddings (optional)
  timeout?: number;              // Request timeout in ms (default: 60000)
  retries?: number;              // Number of retries (default: 2)
  gpuMemoryUtilization?: number; // 0.0-1.0, default 0.9
}

export interface ModelInfo {
  id: string;
  name: string;
  engine: 'llama.cpp' | 'vllm';
  format: 'gguf' | 'safetensors';
  size?: number;
  loaded?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  stream?: boolean;
}

export interface GenerateResult {
  text: string;
  model: string;
  tokens: number;
  latency: number;
  finishReason?: string;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  latency: number;
}

export interface ModelRunnerStatus {
  available: boolean;
  vllmEnabled: boolean;
  vllmVersion?: string;
  models: ModelInfo[];
  gpuInfo?: {
    available: boolean;
    name?: string;
    vram?: string;
  };
}

// ============================================================================
// DOCKER MODEL RUNNER CLIENT
// ============================================================================

export class DockerModelRunnerClient {
  private baseUrl: string;
  private model: string;
  private embeddingModel: string;
  private timeout: number;
  private retries: number;
  private gpuMemoryUtilization: number;

  private isHealthy: boolean = false;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 30000; // 30 seconds
  private cachedModels: ModelInfo[] = [];

  constructor(config: DockerModelRunnerConfig = {}) {
    this.baseUrl = config.baseUrl || this.detectBaseUrl();
    this.model = config.model || process.env.DOCKER_MODEL_RUNNER_MODEL || 'ai/smollm2-vllm';
    this.embeddingModel = config.embeddingModel || this.model;
    this.timeout = config.timeout || 60000;
    this.retries = config.retries || 2;
    this.gpuMemoryUtilization = config.gpuMemoryUtilization ||
      parseFloat(process.env.DOCKER_MODEL_RUNNER_GPU_MEMORY || '0.9');

    logger.info('[DockerModelRunner] Initialized', {
      baseUrl: this.baseUrl,
      model: this.model,
      embeddingModel: this.embeddingModel,
      gpuMemoryUtilization: this.gpuMemoryUtilization,
    });
  }

  // ==========================================================================
  // ENVIRONMENT DETECTION
  // ==========================================================================

  /**
   * Auto-detect the correct base URL based on environment
   */
  private detectBaseUrl(): string {
    // Check environment variable first
    const envUrl = process.env.DOCKER_MODEL_RUNNER_URL;
    if (envUrl) {
      return envUrl.replace(/\/$/, '');
    }

    // Check if we're running inside a Docker container
    const isInContainer = this.isRunningInContainer();

    if (isInContainer) {
      // Inside Docker container - use Docker's internal DNS
      return 'http://model-runner.docker.internal';
    } else {
      // Running on host - use localhost with default port
      return 'http://localhost:12434';
    }
  }

  /**
   * Check if we're running inside a Docker container
   */
  private isRunningInContainer(): boolean {
    try {
      // Check for Docker-specific files
      const fs = require('fs');

      // Check /.dockerenv file (exists in Docker containers)
      if (fs.existsSync('/.dockerenv')) {
        return true;
      }

      // Check cgroup for docker/container references
      if (fs.existsSync('/proc/1/cgroup')) {
        const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
        if (cgroup.includes('docker') || cgroup.includes('containerd')) {
          return true;
        }
      }

      return false;
    } catch {
      // If we can't determine, assume host
      return false;
    }
  }

  // ==========================================================================
  // HEALTH & STATUS
  // ==========================================================================

  /**
   * Check if Docker Model Runner is available and healthy
   */
  async checkHealth(forceCheck: boolean = false): Promise<boolean> {
    // Use cached result if recent
    if (!forceCheck && this.isHealthy &&
        Date.now() - this.lastHealthCheck < this.healthCheckInterval) {
      return this.isHealthy;
    }

    try {
      const response = await this.makeRequest('/v1/models', 'GET', null, 5000);

      this.isHealthy = Array.isArray(response.data) || response.object === 'list';
      this.lastHealthCheck = Date.now();

      if (this.isHealthy) {
        // Cache the models list
        this.cachedModels = this.parseModels(response);
        logger.debug('[DockerModelRunner] Health check passed', {
          modelCount: this.cachedModels.length,
        });
      }

      return this.isHealthy;
    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = Date.now();
      logger.debug('[DockerModelRunner] Health check failed:', error);
      return false;
    }
  }

  /**
   * Get detailed status including vLLM availability
   */
  async getStatus(): Promise<ModelRunnerStatus> {
    try {
      const isAvailable = await this.checkHealth(true);

      if (!isAvailable) {
        return {
          available: false,
          vllmEnabled: false,
          models: [],
        };
      }

      // Check if any vLLM models are available
      const vllmModels = this.cachedModels.filter(m =>
        m.engine === 'vllm' || m.id.includes('-vllm')
      );

      return {
        available: true,
        vllmEnabled: vllmModels.length > 0,
        vllmVersion: '0.12.0', // Docker Desktop 4.54+ uses vLLM 0.12.0
        models: this.cachedModels,
      };
    } catch (error) {
      logger.error('[DockerModelRunner] Status check failed:', error);
      return {
        available: false,
        vllmEnabled: false,
        models: [],
      };
    }
  }

  /**
   * Check if vLLM backend is specifically available
   */
  async isVLLMAvailable(): Promise<boolean> {
    const status = await this.getStatus();
    return status.vllmEnabled;
  }

  // ==========================================================================
  // MODEL MANAGEMENT
  // ==========================================================================

  /**
   * List available models
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await this.makeRequest('/v1/models', 'GET');
      return this.parseModels(response);
    } catch (error) {
      logger.error('[DockerModelRunner] Failed to list models:', error);
      return [];
    }
  }

  /**
   * Parse models from API response
   */
  private parseModels(response: any): ModelInfo[] {
    const models: ModelInfo[] = [];
    const data = response.data || response.models || [];

    for (const model of data) {
      const id = model.id || model.name || '';
      models.push({
        id,
        name: id.split('/').pop() || id,
        engine: id.includes('-vllm') || id.includes('safetensors') ? 'vllm' : 'llama.cpp',
        format: id.includes('-vllm') || id.includes('safetensors') ? 'safetensors' : 'gguf',
        size: model.size,
        loaded: model.loaded ?? true,
      });
    }

    return models;
  }

  /**
   * Check if a specific model is available
   */
  async hasModel(modelId: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some(m => m.id === modelId || m.name === modelId);
  }

  // ==========================================================================
  // TEXT GENERATION
  // ==========================================================================

  /**
   * Generate text using chat completions API
   */
  async chat(
    messages: ChatMessage[],
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    const startTime = Date.now();

    const requestBody = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      top_p: options.topP ?? 0.9,
      stop: options.stop || [],
      stream: false,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await this.makeRequest(
          '/v1/chat/completions',
          'POST',
          requestBody
        );

        if (!response.choices || !response.choices[0]) {
          throw new Error('Invalid response format from Model Runner');
        }

        const choice = response.choices[0];
        const text = choice.message?.content || '';
        const latency = Date.now() - startTime;

        logger.debug('[DockerModelRunner] Chat completed', {
          model: this.model,
          tokens: response.usage?.completion_tokens || 0,
          latency,
          attempt: attempt + 1,
        });

        return {
          text,
          model: this.model,
          tokens: response.usage?.completion_tokens || Math.ceil(text.split(/\s+/).length),
          latency,
          finishReason: choice.finish_reason,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`[DockerModelRunner] Chat failed (attempt ${attempt + 1}):`, lastError.message);

        if (attempt < this.retries) {
          await this.delay(Math.pow(2, attempt) * 500);
        }
      }
    }

    throw new Error(`Chat failed after ${this.retries + 1} attempts: ${lastError?.message}`);
  }

  /**
   * Generate text using completions API (non-chat)
   */
  async generate(
    prompt: string,
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    // Use chat API with single user message
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  // ==========================================================================
  // EMBEDDINGS
  // ==========================================================================

  /**
   * Generate embeddings for text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const startTime = Date.now();

    if (!text || text.trim().length === 0) {
      throw new Error('Text input cannot be empty');
    }

    const requestBody = {
      model: this.embeddingModel,
      input: text,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await this.makeRequest(
          '/v1/embeddings',
          'POST',
          requestBody
        );

        if (!response.data || !response.data[0]) {
          throw new Error('Invalid embedding response format');
        }

        const embedding = response.data[0].embedding;
        const latency = Date.now() - startTime;

        logger.debug('[DockerModelRunner] Embedding generated', {
          model: this.embeddingModel,
          dimension: embedding.length,
          latency,
        });

        return {
          embedding,
          model: this.embeddingModel,
          latency,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`[DockerModelRunner] Embedding failed (attempt ${attempt + 1}):`, lastError.message);

        if (attempt < this.retries) {
          await this.delay(Math.pow(2, attempt) * 500);
        }
      }
    }

    throw new Error(`Embedding failed after ${this.retries + 1} attempts: ${lastError?.message}`);
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateEmbeddingBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map(text => this.generateEmbedding(text)));
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  getModel(): string {
    return this.model;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Make HTTP request to Model Runner API
   */
  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body: any = null,
    timeout: number = this.timeout
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Model Runner API error ${response.status}: ${errorText || response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout (${timeout}ms) - Model Runner may be overloaded`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a Docker Model Runner client with auto-detection
 */
export function createDockerModelRunnerClient(
  config?: DockerModelRunnerConfig
): DockerModelRunnerClient {
  return new DockerModelRunnerClient(config);
}

/**
 * Quick check if Docker Model Runner is available
 * Useful for backend selection logic
 */
export async function isDockerModelRunnerAvailable(): Promise<boolean> {
  try {
    const client = new DockerModelRunnerClient();
    return await client.checkHealth();
  } catch {
    return false;
  }
}

/**
 * Get Docker Model Runner status including vLLM availability
 */
export async function getDockerModelRunnerStatus(): Promise<ModelRunnerStatus> {
  try {
    const client = new DockerModelRunnerClient();
    return await client.getStatus();
  } catch {
    return {
      available: false,
      vllmEnabled: false,
      models: [],
    };
  }
}
