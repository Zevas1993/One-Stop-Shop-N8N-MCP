/**
 * Ollama Client
 * Handles communication with Ollama inference servers for both embedding and generation models
 * Compatible with Ollama API (unlike VLLMClient which expects vLLM endpoints)
 */

import { logger } from '../utils/logger';

export interface OllamaClientConfig {
  baseUrl: string; // Ollama server base URL (e.g., http://localhost:11434)
  model: string; // Model name (embedding or generation)
  timeout?: number; // Request timeout in milliseconds (default: 30000)
  retries?: number; // Number of retries on failure (default: 3)
}

export interface EmbeddingResponse {
  embedding: number[];
  modelId: string;
  processingTime: number;
}

export interface GenerationResponse {
  text: string;
  tokens: number;
  generationTime: number;
  stopReason?: string;
  modelId: string;
}

export interface OllamaHealthStatus {
  healthy: boolean;
  model: string;
  loadedModels: string[];
}

/**
 * Ollama Client for inference operations
 * Handles both embedding and text generation requests via Ollama API
 */
export class OllamaClient {
  private baseUrl: string;
  private model: string;
  private timeout: number;
  private retries: number;
  private isHealthy: boolean = false;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 60000; // 60 seconds

  constructor(config: OllamaClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.model = config.model;
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;

    logger.info('[OllamaClient] Initialized', {
      model: this.model,
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      retries: this.retries,
    });
  }

  /**
   * Generate embeddings for a text input
   * Used for semantic understanding and knowledge graph queries
   */
  async generateEmbedding(text: string): Promise<EmbeddingResponse> {
    const startTime = Date.now();

    if (!text || text.trim().length === 0) {
      throw new Error('Text input cannot be empty');
    }

    // Ensure health before attempting request
    const isHealthy = await this.checkHealth(true);
    if (!isHealthy) {
      throw new Error(
        `Ollama server at ${this.baseUrl} is not responding. Please ensure the server is running.`
      );
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const response = await this.makeRequest(
          '/api/embeddings',
          {
            model: this.model,
            prompt: text,
          },
          'POST'
        );

        if (!response.embedding) {
          throw new Error('Invalid embedding response format');
        }

        const processingTime = Date.now() - startTime;

        logger.debug('[OllamaClient] Embedding generated', {
          model: this.model,
          textLength: text.length,
          embeddingDimension: response.embedding.length,
          processingTime,
          attempt: attempt + 1,
        });

        return {
          embedding: response.embedding,
          modelId: this.model,
          processingTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(
          '[OllamaClient] Embedding request failed (attempt ' + (attempt + 1) + '):',
          lastError
        );

        if (attempt < this.retries - 1) {
          // Wait before retry (exponential backoff)
          await this.delay(Math.pow(2, attempt) * 500);
        }
      }
    }

    throw new Error(
      `Failed to generate embedding after ${this.retries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Generate text using the generation model
   * Used for conversation responses and workflow generation
   */
  async generateText(
    prompt: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      stopSequences?: string[];
    }
  ): Promise<GenerationResponse> {
    const startTime = Date.now();

    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Prompt cannot be empty');
    }

    // Ensure health before attempting request
    const isHealthy = await this.checkHealth(true);
    if (!isHealthy) {
      throw new Error(
        `Ollama server at ${this.baseUrl} is not responding. Please ensure the server is running.`
      );
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const response = await this.makeRequest(
          '/api/generate',
          {
            model: this.model,
            prompt: prompt,
            stream: false,
            options: {
              temperature: options?.temperature ?? 0.7,
              top_p: options?.topP ?? 0.9,
              num_predict: options?.maxTokens ?? 256,
            },
            stop: options?.stopSequences,
          },
          'POST'
        );

        if (!response.response) {
          throw new Error('Invalid generation response format');
        }

        const processingTime = Date.now() - startTime;

        logger.debug('[OllamaClient] Text generated', {
          model: this.model,
          promptLength: prompt.length,
          responseLength: response.response.length,
          processingTime,
          attempt: attempt + 1,
        });

        return {
          text: response.response,
          tokens: response.eval_count || 0,
          generationTime: processingTime,
          stopReason: response.stop_reason || undefined,
          modelId: this.model,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(
          '[OllamaClient] Generation request failed (attempt ' + (attempt + 1) + '):',
          lastError
        );

        if (attempt < this.retries - 1) {
          // Wait before retry (exponential backoff)
          await this.delay(Math.pow(2, attempt) * 500);
        }
      }
    }

    throw new Error(
      `Failed to generate text after ${this.retries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Check if the Ollama server is healthy and the model is loaded
   */
  async checkHealth(forceCheck: boolean = false): Promise<boolean> {
    const now = Date.now();

    // Use cached health status if available and not forced
    if (!forceCheck && this.isHealthy && now - this.lastHealthCheck < this.healthCheckInterval) {
      return this.isHealthy;
    }

    this.lastHealthCheck = now;

    try {
      const response = await this.makeRequest('/api/tags', {}, 'GET', 5000);

      const models = response.models || [];
      const modelFound = models.some((m: any) => m.name === this.model || m.name.startsWith(this.model + ':'));

      if (modelFound) {
        this.isHealthy = true;
        logger.debug('[OllamaClient] Health check passed', { model: this.model });
      } else {
        this.isHealthy = false;
        logger.warn('[OllamaClient] Health check - model not loaded', { model: this.model });
      }

      return this.isHealthy;
    } catch (error) {
      this.isHealthy = false;
      logger.warn('[OllamaClient] Health check error:', error);
      return false;
    }
  }

  /**
   * Get detailed health status information
   */
  async getHealthStatus(): Promise<OllamaHealthStatus> {
    try {
      const response = await this.makeRequest('/api/tags', {}, 'GET');

      return {
        healthy: true,
        model: this.model,
        loadedModels: (response.models || []).map((m: any) => m.name),
      };
    } catch (error) {
      return {
        healthy: false,
        model: this.model,
        loadedModels: [],
      };
    }
  }

  /**
   * Get current model information
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Get the base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  // ==========================================
  // Private Helper Methods
  // ==========================================

  /**
   * Make an HTTP request to the Ollama server
   */
  private async makeRequest(
    endpoint: string,
    body: any,
    method: 'GET' | 'POST' = 'POST',
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
        body: method === 'GET' ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API error ${response.status}: ${errorText || response.statusText}`
        );
      }

      const data = await response.json();
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Delay helper for retries with exponential backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create an OllamaClient for embedding operations
 */
export function createOllamaClient(
  mode: 'embedding' | 'generation',
  model: string,
  baseUrl: string,
  timeout?: number
): OllamaClient {
  logger.info(`[OllamaClient] Creating ${mode} client`, { model, baseUrl });

  return new OllamaClient({
    baseUrl,
    model,
    timeout: timeout || 30000,
    retries: 3,
  });
}

/**
 * Create dual Ollama clients for embedding and generation
 */
export function createDualOllamaClients(
  embeddingModel: string,
  generationModel: string,
  embeddingBaseUrl: string,
  generationBaseUrl: string,
  timeout?: number
): {
  embedding: OllamaClient;
  generation: OllamaClient;
} {
  return {
    embedding: createOllamaClient('embedding', embeddingModel, embeddingBaseUrl, timeout),
    generation: createOllamaClient('generation', generationModel, generationBaseUrl, timeout),
  };
}
