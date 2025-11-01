/**
 * vLLM Client
 * Handles communication with vLLM inference servers (embedding and generation)
 * Supports both embedding models (for semantic understanding) and generation models (for text)
 */

import { logger } from '../utils/logger';
import { EmbeddingModelOption, GenerationModelOption } from './hardware-detector';

export interface VLLMClientConfig {
  baseUrl: string; // vLLM server base URL (e.g., http://localhost:8001)
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

export interface VLLMHealthStatus {
  healthy: boolean;
  model: string;
  loadedModels: string[];
  maxBatchSize?: number;
  maxTokens?: number;
  gpu?: {
    available: boolean;
    name?: string;
    vram?: string;
  };
}

/**
 * vLLM Client for inference operations
 * Handles both embedding and text generation requests
 */
export class VLLMClient {
  private baseUrl: string;
  private model: string;
  private timeout: number;
  private retries: number;
  private isHealthy: boolean = false;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 60000; // 60 seconds

  constructor(config: VLLMClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.model = config.model;
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;

    logger.info('[vLLMClient] Initialized', {
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
        `vLLM server at ${this.baseUrl} is not responding. Please ensure the server is running.`
      );
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const response = await this.makeRequest(
          '/v1/embeddings',
          {
            input: text,
            model: this.model,
          },
          'POST'
        );

        if (!response.data || !response.data[0]) {
          throw new Error('Invalid embedding response format');
        }

        const processingTime = Date.now() - startTime;

        logger.debug('[vLLMClient] Embedding generated', {
          model: this.model,
          textLength: text.length,
          embeddingDimension: response.data[0].embedding.length,
          processingTime,
          attempt: attempt + 1,
        });

        return {
          embedding: response.data[0].embedding,
          modelId: this.model,
          processingTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn('[vLLMClient] Embedding request failed (attempt ' + (attempt + 1) + '):', lastError);

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
        `vLLM server at ${this.baseUrl} is not responding. Please ensure the server is running.`
      );
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const requestBody = {
          model: this.model,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: options?.maxTokens || 1024,
          temperature: options?.temperature ?? 0.7,
          top_p: options?.topP ?? 0.9,
          stop: options?.stopSequences || [],
        };

        const response = await this.makeRequest(
          '/v1/chat/completions',
          requestBody,
          'POST'
        );

        if (!response.choices || !response.choices[0]) {
          throw new Error('Invalid generation response format');
        }

        const generatedText = response.choices[0].message?.content || '';
        const generationTime = Date.now() - startTime;
        const tokenCount = response.usage?.completion_tokens || Math.ceil(generatedText.split(/\s+/).length);

        logger.debug('[vLLMClient] Text generated', {
          model: this.model,
          promptLength: prompt.length,
          generatedLength: generatedText.length,
          tokens: tokenCount,
          generationTime,
          stopReason: response.choices[0].finish_reason,
          attempt: attempt + 1,
        });

        return {
          text: generatedText,
          tokens: tokenCount,
          generationTime,
          stopReason: response.choices[0].finish_reason,
          modelId: this.model,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn('[vLLMClient] Text generation failed (attempt ' + (attempt + 1) + '):', lastError);

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
   * Check health of the vLLM server
   */
  async checkHealth(forceCheck: boolean = false): Promise<boolean> {
    // Use cached health status if recent
    if (!forceCheck && this.isHealthy && Date.now() - this.lastHealthCheck < this.healthCheckInterval) {
      return this.isHealthy;
    }

    try {
      const response = await this.makeRequest('/health', {}, 'GET', 5000);
      this.isHealthy = response.status === 'ok' || response.ready === true;
      this.lastHealthCheck = Date.now();

      if (this.isHealthy) {
        logger.debug('[vLLMClient] Health check passed:', {
          model: this.model,
          serverUrl: this.baseUrl,
        });
      } else {
        logger.warn('[vLLMClient] Health check failed - server not ready');
      }

      return this.isHealthy;
    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = Date.now();
      logger.warn('[vLLMClient] Health check error:', error);
      return false;
    }
  }

  /**
   * Get detailed health status information
   */
  async getHealthStatus(): Promise<VLLMHealthStatus> {
    try {
      const response = await this.makeRequest('/health', {}, 'GET');

      return {
        healthy: response.status === 'ok' || response.ready === true,
        model: this.model,
        loadedModels: response.loaded_models || [this.model],
        maxBatchSize: response.max_batch_size,
        maxTokens: response.max_tokens,
        gpu: response.gpu_info,
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
   * Unload the model from memory
   */
  async unloadModel(): Promise<boolean> {
    try {
      await this.makeRequest(
        `/unload/${this.model}`,
        {},
        'POST'
      );
      logger.info('[vLLMClient] Model unloaded:', { model: this.model });
      return true;
    } catch (error) {
      logger.warn('[vLLMClient] Failed to unload model:', error);
      return false;
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
   * Make an HTTP request to the vLLM server
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
          `vLLM API error ${response.status}: ${errorText || response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Request timeout (${timeout}ms) - vLLM server may be overloaded`);
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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create vLLM clients for embedding and generation models
 */
export function createVLLMClient(
  modelType: 'embedding' | 'generation',
  model: string,
  baseUrl: string,
  timeout?: number,
  retries?: number
): VLLMClient {
  return new VLLMClient({
    baseUrl,
    model,
    timeout,
    retries,
  });
}

/**
 * Factory function to create dual nano LLM clients
 */
export function createDualVLLMClients(
  embeddingModel: string,
  generationModel: string,
  embeddingBaseUrl: string,
  generationBaseUrl: string,
  timeout?: number
): {
  embedding: VLLMClient;
  generation: VLLMClient;
} {
  return {
    embedding: createVLLMClient('embedding', embeddingModel, embeddingBaseUrl, timeout),
    generation: createVLLMClient('generation', generationModel, generationBaseUrl, timeout),
  };
}
