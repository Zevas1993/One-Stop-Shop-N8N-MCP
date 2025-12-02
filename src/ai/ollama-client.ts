/**
 * Ollama Client
 *
 * PRIMARY LLM backend for cross-platform compatibility.
 * Works on Windows, macOS, Linux without additional setup.
 *
 * Supports:
 * - Text generation (chat/completions)
 * - Embeddings
 * - Model management (pull, list)
 * - Health checking
 *
 * Falls back gracefully when Ollama isn't available.
 */

import { logger } from "../utils/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface OllamaConfig {
  baseUrl?: string; // Default: http://localhost:11434
  timeout?: number; // Request timeout in ms (default: 60000)
  retries?: number; // Retry count (default: 2)
}

export interface OllamaGenerateOptions {
  temperature?: number; // 0.0-1.0 (default: 0.7)
  maxTokens?: number; // Max tokens to generate (default: 2048)
  topP?: number; // Top-p sampling (default: 0.9)
  topK?: number; // Top-k sampling (default: 40)
  stop?: string[]; // Stop sequences
  system?: string; // System prompt
}

export interface OllamaGenerateResponse {
  text: string;
  model: string;
  tokens: number;
  generationTime: number;
  done: boolean;
}

export interface OllamaEmbeddingResponse {
  embedding: number[];
  model: string;
  processingTime: number;
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaModelInfo {
  name: string;
  size: number;
  digest: string;
  modifiedAt: string;
  details?: {
    format: string;
    family: string;
    parameterSize: string;
    quantizationLevel: string;
  };
}

// ============================================================================
// OLLAMA CLIENT CLASS
// ============================================================================

export class OllamaClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private isHealthy: boolean = false;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 30000; // 30 seconds

  constructor(config: OllamaConfig = {}) {
    this.baseUrl = (config.baseUrl || "http://localhost:11434").replace(
      /\/$/,
      ""
    );
    this.timeout = config.timeout || 60000;
    this.retries = config.retries || 2;

    logger.info("[OllamaClient] Initialized", {
      baseUrl: this.baseUrl,
      timeout: this.timeout,
    });
  }

  // ==========================================================================
  // HEALTH & CONNECTIVITY
  // ==========================================================================

  /**
   * Check if Ollama is available and responding
   */
  async checkHealth(forceCheck: boolean = false): Promise<boolean> {
    // Use cached result if recent
    if (
      !forceCheck &&
      Date.now() - this.lastHealthCheck < this.healthCheckInterval
    ) {
      return this.isHealthy;
    }

    try {
      const response = await this.makeRequest(
        "/api/tags",
        "GET",
        undefined,
        5000
      );
      this.isHealthy = response !== null && Array.isArray(response.models);
      this.lastHealthCheck = Date.now();

      if (this.isHealthy) {
        logger.debug("[OllamaClient] Health check passed");
      }
      return this.isHealthy;
    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = Date.now();
      logger.debug("[OllamaClient] Health check failed:", error);
      return false;
    }
  }

  /**
   * Get Ollama version
   */
  async getVersion(): Promise<string | null> {
    try {
      const response = await this.makeRequest(
        "/api/version",
        "GET",
        undefined,
        5000
      );
      return response?.version || null;
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // MODEL MANAGEMENT
  // ==========================================================================

  /**
   * List all available models
   */
  async listModels(): Promise<OllamaModelInfo[]> {
    try {
      const response = await this.makeRequest("/api/tags", "GET");
      return (response?.models || []).map((m: any) => ({
        name: m.name,
        size: m.size,
        digest: m.digest,
        modifiedAt: m.modified_at,
        details: m.details,
      }));
    } catch (error) {
      logger.warn("[OllamaClient] Failed to list models:", error);
      return [];
    }
  }

  /**
   * Check if a model is available locally
   */
  async hasModel(modelName: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some(
      (m) =>
        m.name === modelName ||
        m.name.startsWith(modelName + ":") ||
        modelName.includes(m.name)
    );
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(
    modelName: string,
    onProgress?: (status: string, completed?: number, total?: number) => void
  ): Promise<boolean> {
    logger.info(`[OllamaClient] Pulling model: ${modelName}`);

    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName, stream: false }),
      });

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.status}`);
      }

      // For streaming progress (if needed in future)
      const result = await response.json();

      logger.info(`[OllamaClient] Model ${modelName} pulled successfully`);
      return true;
    } catch (error: any) {
      logger.error(
        `[OllamaClient] Failed to pull model ${modelName}:`,
        error.message
      );
      return false;
    }
  }

  /**
   * Delete a model
   */
  async deleteModel(modelName: string): Promise<boolean> {
    try {
      await this.makeRequest("/api/delete", "DELETE", { name: modelName });
      logger.info(`[OllamaClient] Model ${modelName} deleted`);
      return true;
    } catch (error) {
      logger.warn(`[OllamaClient] Failed to delete model ${modelName}:`, error);
      return false;
    }
  }

  // ==========================================================================
  // TEXT GENERATION
  // ==========================================================================

  /**
   * Generate text completion
   */
  async generate(
    model: string,
    prompt: string,
    options: OllamaGenerateOptions = {}
  ): Promise<OllamaGenerateResponse> {
    const startTime = Date.now();

    const body = {
      model,
      prompt,
      system: options.system,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2048,
        top_p: options.topP ?? 0.9,
        top_k: options.topK ?? 40,
        stop: options.stop,
      },
    };

    const response = await this.makeRequestWithRetry(
      "/api/generate",
      "POST",
      body
    );

    if (!response || !response.response) {
      throw new Error("Invalid response from Ollama");
    }

    const generationTime = Date.now() - startTime;

    return {
      text: response.response,
      model: response.model || model,
      tokens:
        response.eval_count || Math.ceil(response.response.split(/\s+/).length),
      generationTime,
      done: response.done ?? true,
    };
  }

  /**
   * Chat completion (multi-turn conversation)
   */
  async chat(
    model: string,
    messages: OllamaChatMessage[],
    options: OllamaGenerateOptions = {}
  ): Promise<OllamaGenerateResponse> {
    const startTime = Date.now();

    const body = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2048,
        top_p: options.topP ?? 0.9,
        top_k: options.topK ?? 40,
        stop: options.stop,
      },
    };

    const response = await this.makeRequestWithRetry("/api/chat", "POST", body);

    if (!response || !response.message) {
      throw new Error("Invalid chat response from Ollama");
    }

    const generationTime = Date.now() - startTime;

    return {
      text: response.message.content,
      model: response.model || model,
      tokens:
        response.eval_count ||
        Math.ceil(response.message.content.split(/\s+/).length),
      generationTime,
      done: response.done ?? true,
    };
  }

  // ==========================================================================
  // EMBEDDINGS
  // ==========================================================================

  /**
   * Generate embeddings for text
   */
  async embed(model: string, text: string): Promise<OllamaEmbeddingResponse> {
    const startTime = Date.now();

    const body = {
      model,
      prompt: text,
    };

    const response = await this.makeRequestWithRetry(
      "/api/embeddings",
      "POST",
      body
    );

    if (!response || !response.embedding) {
      throw new Error("Invalid embedding response from Ollama");
    }

    return {
      embedding: response.embedding,
      model: model,
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(
    model: string,
    texts: string[]
  ): Promise<OllamaEmbeddingResponse[]> {
    // Ollama doesn't support batch embeddings natively, so we parallelize
    const results = await Promise.all(
      texts.map((text) => this.embed(model, text))
    );
    return results;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequestWithRetry(
    endpoint: string,
    method: "GET" | "POST" | "DELETE",
    body?: any
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const result = await this.makeRequest(endpoint, method, body);
        return result;
      } catch (error: any) {
        lastError = error;
        logger.warn(
          `[OllamaClient] Request failed (attempt ${attempt + 1}/${
            this.retries + 1
          }):`,
          error.message
        );

        if (attempt < this.retries) {
          // Exponential backoff
          await this.delay(Math.pow(2, attempt) * 500);
        }
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  /**
   * Make HTTP request to Ollama
   */
  private async makeRequest(
    endpoint: string,
    method: "GET" | "POST" | "DELETE",
    body?: any,
    timeout: number = this.timeout
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API error ${response.status}: ${
            errorText || response.statusText
          }`
        );
      }

      return await response.json();
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw new Error(`Request timeout (${timeout}ms) - Ollama may be busy`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Test if a model works with a simple prompt
   */
  async testModel(
    modelName: string
  ): Promise<{ success: boolean; latency?: number; error?: string }> {
    try {
      const startTime = Date.now();
      const response = await this.generate(
        modelName,
        'Say "hello" in one word.',
        {
          maxTokens: 10,
          temperature: 0,
        }
      );
      return {
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// ============================================================================
// SINGLETON & FACTORY
// ============================================================================

let defaultClient: OllamaClient | null = null;

/**
 * Get default Ollama client
 */
export function getOllamaClient(config?: OllamaConfig): OllamaClient {
  if (!defaultClient) {
    defaultClient = new OllamaClient(config);
  }
  return defaultClient;
}

/**
 * Create a new Ollama client
 */
export function createOllamaClient(config?: OllamaConfig): OllamaClient {
  return new OllamaClient(config);
}

/**
 * Create dual Ollama clients for embedding and generation
 */
export function createDualOllamaClients(
  embeddingModel: string,
  generationModel: string,
  embeddingBaseUrl?: string,
  generationBaseUrl?: string
): { embedding: OllamaClient; generation: OllamaClient } {
  const embeddingClient = new OllamaClient({
    baseUrl: embeddingBaseUrl,
  });

  const generationClient = new OllamaClient({
    baseUrl: generationBaseUrl,
  });

  return { embedding: embeddingClient, generation: generationClient };
}
