/**
 * Hardware Detection Module
 * Detects user's hardware and recommends appropriate nano LLM PAIRS
 * Uses separate embedding and generation models for optimal performance
 * Based on research into true nano models (<5B parameters)
 */

import os from 'os';
import { logger } from '../utils/logger';

/**
 * Embedding Models - For knowledge graph queries and semantic routing
 * These are small, fast models optimized for vector generation
 */
export enum EmbeddingModelOption {
  EMBEDDING_GEMMA_300M = 'embedding-gemma-300m',  // 300M - Best MTEB score, multilingual
  NOMIC_EMBED_TEXT = 'nomic-embed-text-v1.5',     // ~100M - Best for long documents
}

/**
 * Generation Models - For text generation and workflow generation
 * These are true nano LLMs (<5B parameters)
 */
export enum GenerationModelOption {
  GEMMA_3_270M = 'gemma-3-270m',           // 270M - Tier 1 (2GB RAM)
  LLAMA_3_2_1B = 'llama-3.2-1b',           // 1B - Tier 2 (4GB RAM)
  DEEPSEEK_R1_1_5B = 'deepseek-r1-distill-1.5b', // 1.5B - Tier 2 alt (reasoning)
  LLAMA_3_2_3B = 'llama-3.2-3b',           // 3B - Tier 3 (8GB RAM)
  NEMOTRON_NANO_4B = 'nemotron-nano-4b',  // 4B - Tier 3+ (8GB+) - Best reasoning
}

/**
 * Legacy single-LLM enum (kept for backward compatibility)
 */
export enum NanoLLMOption {
  PHI_3_MINI = 'phi-3.5-mini',           // 3.8B - Minimal (2GB RAM, 2 cores)
  PHI_3_SMALL = 'phi-3.5-small',         // ~7B - Low resource (4GB RAM, 4 cores)
  NEURAL_CHAT_7B = 'neural-chat-7b',     // 7B - Specialized for chat
  MIXTRAL_7B = 'mixtral-7b',             // 7B MoE - Balanced (8GB RAM, 4 cores)
  LLAMA_2_13B = 'llama-2-13b',           // 13B - Better quality (16GB RAM, 8 cores)
}

export interface HardwareProfile {
  cpuCores: number;
  cpuModel: string;
  ramGbytes: number;
  totalRamBytes: number;
  hasGpu: boolean;
  gpuVram?: number;
  osType: string;
  osRelease: string;
  arch: string;

  // Dual-nano LLM selection (new primary)
  embeddingModel: EmbeddingModelOption;
  generationModel: GenerationModelOption;

  // Recommendation details
  recommendationReason: string;
  embeddingModelReason: string;
  generationModelReason: string;

  // System classification
  isHighEnd: boolean;
  isLowEnd: boolean;

  // Performance estimates
  estimatedEmbeddingLatency: number; // milliseconds
  estimatedGenerationTokensPerSecond: number;

  // Legacy field (for backward compatibility)
  recommendedLlm?: NanoLLMOption;
}

export class HardwareDetector {
  /**
   * Detect current hardware profile and recommend nano LLM PAIR
   * Container-safe: Gracefully handles missing GPU detection in Docker
   */
  static detectHardware(): HardwareProfile {
    const cpuCount = os.cpus().length;
    const cpuModel = os.cpus()[0]?.model || 'Unknown';
    const totalMem = os.totalmem();
    const ramGb = Math.round((totalMem / (1024 * 1024 * 1024)) * 10) / 10;
    const freeMem = os.freemem();
    const freeRamGb = Math.round((freeMem / (1024 * 1024 * 1024)) * 10) / 10;

    const osType = os.type();
    const osRelease = os.release();
    const arch = os.arch();

    // Check if running in container (Docker, Kubernetes, etc.)
    const isContainerized = this.isContainerEnvironment();

    // Try to detect GPU (gracefully handles containerization)
    const hasGpu = this.detectGpu();

    // Log detection context for debugging
    if (isContainerized) {
      logger.debug('[Hardware] Running in containerized environment - GPU detection may be limited');
    }

    // Determine if high-end or low-end
    const isHighEnd = ramGb >= 16 && cpuCount >= 8;
    const isLowEnd = ramGb < 4 || cpuCount < 4;

    // Get DUAL nano LLM models based on hardware tier
    const embeddingModel = this.selectEmbeddingModel(ramGb, cpuCount, hasGpu);
    const generationModel = this.selectGenerationModel(ramGb, cpuCount, hasGpu);

    // Estimate performance metrics
    const estimatedEmbeddingLatency = this.estimateEmbeddingLatency(
      embeddingModel,
      ramGb,
      cpuCount,
      hasGpu
    );

    const estimatedGenerationTokensPerSecond = this.estimateGenerationTokensPerSecond(
      generationModel,
      ramGb,
      cpuCount,
      hasGpu
    );

    // Get reasons for selection
    const embeddingModelReason = this.getEmbeddingModelReason(embeddingModel, ramGb, cpuCount);
    const generationModelReason = this.getGenerationModelReason(generationModel, ramGb, cpuCount);
    const recommendationReason = `Dual-nano architecture: ${embeddingModelReason.split(' - ')[0]} for embeddings, ${generationModelReason.split(' - ')[0]} for generation`;

    // Legacy single-model recommendation (for backward compatibility)
    const recommendedLlm = this.getLegacyRecommendedLLM(ramGb, cpuCount, hasGpu);

    const profile: HardwareProfile = {
      cpuCores: cpuCount,
      cpuModel,
      ramGbytes: ramGb,
      totalRamBytes: totalMem,
      hasGpu,
      gpuVram: undefined,
      osType,
      osRelease,
      arch,
      embeddingModel,
      generationModel,
      recommendationReason,
      embeddingModelReason,
      generationModelReason,
      isHighEnd,
      isLowEnd,
      estimatedEmbeddingLatency,
      estimatedGenerationTokensPerSecond,
      recommendedLlm, // legacy field
    };

    logger.info('[Hardware] Detected:', {
      cpu: `${cpuCount} cores (${cpuModel})`,
      ram: `${ramGb}GB (${freeRamGb}GB free)`,
      gpu: hasGpu ? 'Yes' : 'No',
      os: `${osType} ${osRelease}`,
      embeddingModel,
      generationModel,
      reason: recommendationReason,
    });

    return profile;
  }

  /**
   * Select embedding model based on hardware
   * All embedding models are lightweight (<500M parameters)
   */
  private static selectEmbeddingModel(
    ramGb: number,
    cpuCores: number,
    hasGpu: boolean
  ): EmbeddingModelOption {
    // EmbeddingGemma 300M is excellent for all tiers
    // But for high-end systems, Nomic-Embed offers better quality for long documents
    if (ramGb >= 8 && cpuCores >= 4) {
      // Tier 3+: Use Nomic-Embed for better quality
      return EmbeddingModelOption.NOMIC_EMBED_TEXT;
    }

    // All other tiers: EmbeddingGemma 300M (lightweight, fast, multilingual)
    return EmbeddingModelOption.EMBEDDING_GEMMA_300M;
  }

  /**
   * Select generation model based on hardware tier
   * These are true nano LLMs (<5B parameters)
   */
  private static selectGenerationModel(
    ramGb: number,
    cpuCores: number,
    hasGpu: boolean
  ): GenerationModelOption {
    // Tier 1: 2GB RAM, 2 cores - Minimal hardware
    if (ramGb < 4) {
      return GenerationModelOption.GEMMA_3_270M;
    }

    // Tier 2: 4GB RAM, 2-4 cores - Low-end laptops
    if (ramGb < 8) {
      // DeepSeek-R1 1.5B is slightly slower but better reasoning
      // Llama 3.2 1B is slightly faster but less capable
      // Choose based on reasoning importance - default to Llama 3.2 1B for speed
      return GenerationModelOption.LLAMA_3_2_1B;
    }

    // Tier 3: 8GB RAM, 4 cores - Standard laptops
    if (ramGb < 16) {
      return GenerationModelOption.LLAMA_3_2_3B;
    }

    // Tier 4: 16GB RAM, 8+ cores - High-end laptops
    if (ramGb >= 16 && cpuCores >= 8) {
      return GenerationModelOption.NEMOTRON_NANO_4B;
    }

    // Default for 16GB with fewer cores
    return GenerationModelOption.LLAMA_3_2_3B;
  }

  /**
   * Legacy single-LLM recommendation (for backward compatibility)
   */
  private static getLegacyRecommendedLLM(
    ramGb: number,
    cpuCores: number,
    hasGpu: boolean
  ): NanoLLMOption {
    // High-end hardware (16GB+ RAM, 8+ cores)
    if (ramGb >= 16 && cpuCores >= 8) {
      return NanoLLMOption.LLAMA_2_13B;
    }

    // Mid-range (8-16GB RAM, 4-8 cores)
    if (ramGb >= 8 && cpuCores >= 4) {
      return hasGpu ? NanoLLMOption.LLAMA_2_13B : NanoLLMOption.MIXTRAL_7B;
    }

    // Standard (6-8GB RAM, 4+ cores)
    if (ramGb >= 6 && cpuCores >= 4) {
      return NanoLLMOption.MIXTRAL_7B;
    }

    // Low-end (4-6GB RAM, 2-4 cores)
    if (ramGb >= 4 && cpuCores >= 2) {
      return NanoLLMOption.PHI_3_SMALL;
    }

    // Minimal (2-4GB RAM, 2 cores)
    if (ramGb >= 2) {
      return NanoLLMOption.PHI_3_MINI;
    }

    // Fallback
    return NanoLLMOption.PHI_3_MINI;
  }

  /**
   * Get reason for embedding model selection
   */
  private static getEmbeddingModelReason(
    model: EmbeddingModelOption,
    ramGb: number,
    cpuCores: number
  ): string {
    const specs = `${ramGb}GB RAM, ${cpuCores} cores`;

    switch (model) {
      case EmbeddingModelOption.EMBEDDING_GEMMA_300M:
        return `EmbeddingGemma 300M - Lightweight (150MB), fast (<15ms), multilingual for your system (${specs})`;

      case EmbeddingModelOption.NOMIC_EMBED_TEXT:
        return `Nomic-Embed-Text v1.5 - High quality, 128K context window, best for long documents on your system (${specs})`;

      default:
        return `Embedding model: ${model}`;
    }
  }

  /**
   * Get reason for generation model selection
   */
  private static getGenerationModelReason(
    model: GenerationModelOption,
    ramGb: number,
    cpuCores: number
  ): string {
    const specs = `${ramGb}GB RAM, ${cpuCores} cores`;

    switch (model) {
      case GenerationModelOption.GEMMA_3_270M:
        return `Gemma 3 270M - Ultra-lightweight (300MB), ideal for minimal hardware (${specs})`;

      case GenerationModelOption.LLAMA_3_2_1B:
        return `Llama 3.2 1B - Fast generation, good balance for lower-end systems (${specs})`;

      case GenerationModelOption.DEEPSEEK_R1_1_5B:
        return `DeepSeek-R1-Distill 1.5B - Better reasoning capability, slightly slower, for systems needing logic (${specs})`;

      case GenerationModelOption.LLAMA_3_2_3B:
        return `Llama 3.2 3B - Excellent quality/speed balance for standard laptops (${specs})`;

      case GenerationModelOption.NEMOTRON_NANO_4B:
        return `Nemotron Nano 4B - Best reasoning among nano models, optimal for your high-end system (${specs})`;

      default:
        return `Generation model: ${model}`;
    }
  }

  /**
   * Get human-readable explanation for LLM recommendation (legacy)
   */
  private static getRecommendationReason(
    ramGb: number,
    cpuCores: number,
    hasGpu: boolean,
    selectedLlm: NanoLLMOption
  ): string {
    const specs = `${ramGb}GB RAM, ${cpuCores} cores${hasGpu ? ', GPU available' : ''}`;

    switch (selectedLlm) {
      case NanoLLMOption.PHI_3_MINI:
        return `Your system (${specs}) is best suited for Phi-3.5-mini - lightweight, fast responses`;

      case NanoLLMOption.PHI_3_SMALL:
        return `Your system (${specs}) is best suited for Phi-3.5-small - good balance of speed and quality`;

      case NanoLLMOption.NEURAL_CHAT_7B:
        return `Your system (${specs}) is best suited for Neural-Chat-7B - specialized for conversation`;

      case NanoLLMOption.MIXTRAL_7B:
        return `Your system (${specs}) is best suited for Mixtral-7B - excellent quality and speed`;

      case NanoLLMOption.LLAMA_2_13B:
        return `Your system (${specs}) can handle Llama-2-13B - highest quality responses${hasGpu ? ' (GPU acceleration recommended)' : ''}`;

      default:
        return `Recommended LLM: ${selectedLlm}`;
    }
  }

  /**
   * Estimate embedding latency based on model and hardware
   * Embedding models are very fast (typically <100ms per query)
   */
  private static estimateEmbeddingLatency(
    model: EmbeddingModelOption,
    ramGb: number,
    cpuCores: number,
    hasGpu: boolean
  ): number {
    // Base latencies (in milliseconds) for different models
    const baseLatencies: Record<EmbeddingModelOption, number> = {
      [EmbeddingModelOption.EMBEDDING_GEMMA_300M]: 15,  // 300M model - very fast
      [EmbeddingModelOption.NOMIC_EMBED_TEXT]: 25,      // Slightly larger, better quality
    };

    let latency = baseLatencies[model] || 20;

    // Adjust for CPU cores
    if (cpuCores >= 8) {
      latency = Math.round(latency * 0.8); // Faster with more cores
    } else if (cpuCores >= 4) {
      latency = Math.round(latency * 0.9);
    } else if (cpuCores < 2) {
      latency = Math.round(latency * 1.3); // Slower with fewer cores
    }

    // GPU provides minimal improvement for embedding models (they're already fast)
    if (hasGpu) {
      latency = Math.round(latency * 0.7);
    }

    return Math.max(5, latency); // Minimum 5ms
  }

  /**
   * Estimate generation tokens per second based on model and hardware
   * These are realistic estimates for nano models
   */
  private static estimateGenerationTokensPerSecond(
    model: GenerationModelOption,
    ramGb: number,
    cpuCores: number,
    hasGpu: boolean
  ): number {
    // Base estimates for CPU-only inference (tokens per second)
    const baseTokensPerSecond: Record<GenerationModelOption, number> = {
      [GenerationModelOption.GEMMA_3_270M]: 20,          // 270M - very fast
      [GenerationModelOption.LLAMA_3_2_1B]: 15,          // 1B - fast
      [GenerationModelOption.DEEPSEEK_R1_1_5B]: 12,      // 1.5B - slightly slower (better reasoning)
      [GenerationModelOption.LLAMA_3_2_3B]: 8,           // 3B - medium speed
      [GenerationModelOption.NEMOTRON_NANO_4B]: 6,       // 4B - slower but best reasoning
    };

    let estimate = baseTokensPerSecond[model] || 10;

    // Adjust for CPU cores (more cores = better parallelization with vLLM)
    if (cpuCores >= 8) {
      estimate = Math.round(estimate * 1.8);
    } else if (cpuCores >= 4) {
      estimate = Math.round(estimate * 1.4);
    } else if (cpuCores < 2) {
      estimate = Math.round(estimate * 0.7);
    }

    // Adjust for GPU (2-5x speedup depending on model and GPU)
    if (hasGpu) {
      // Smaller models get bigger speedups
      if (model === GenerationModelOption.GEMMA_3_270M || model === GenerationModelOption.LLAMA_3_2_1B) {
        estimate = Math.round(estimate * 3.5); // 3-4x speedup for small models
      } else if (model === GenerationModelOption.LLAMA_3_2_3B || model === GenerationModelOption.DEEPSEEK_R1_1_5B) {
        estimate = Math.round(estimate * 3.0);
      } else {
        estimate = Math.round(estimate * 2.5); // Larger models get less speedup
      }
    }

    return Math.max(1, estimate); // At least 1 token per second
  }

  /**
   * Estimate tokens per second based on model and hardware (legacy version)
   */
  private static estimateTokensPerSecond(
    llm: NanoLLMOption,
    ramGb: number,
    cpuCores: number,
    hasGpu: boolean
  ): number {
    // Base estimates for CPU-only (CPU cores affect throughput)
    const baseTokensPerSecond: Record<NanoLLMOption, number> = {
      [NanoLLMOption.PHI_3_MINI]: 10,      // 3.8B model - very fast
      [NanoLLMOption.PHI_3_SMALL]: 8,      // 7B model - fast
      [NanoLLMOption.NEURAL_CHAT_7B]: 8,  // 7B model - fast
      [NanoLLMOption.MIXTRAL_7B]: 6,      // 7B MoE - medium
      [NanoLLMOption.LLAMA_2_13B]: 4,     // 13B model - slower
    };

    let estimate = baseTokensPerSecond[llm] || 5;

    // Adjust for CPU cores (more cores = better parallelization)
    if (cpuCores >= 8) {
      estimate = Math.round(estimate * 1.5);
    } else if (cpuCores >= 4) {
      estimate = Math.round(estimate * 1.2);
    } else if (cpuCores < 2) {
      estimate = Math.round(estimate * 0.7);
    }

    // Adjust for GPU (can be 2-5x faster depending on model)
    if (hasGpu) {
      estimate = Math.round(estimate * 2.5);
    }

    return Math.max(1, estimate); // At least 1 token per second
  }

  /**
   * Check if running in containerized environment (Docker, Kubernetes, etc.)
   * Container-safe: Uses multiple detection methods that work even in restricted environments
   */
  private static isContainerEnvironment(): boolean {
    try {
      // Method 1: Check for .dockerenv file (most reliable)
      const fs = require('fs');
      if (fs.existsSync('/.dockerenv')) {
        return true;
      }

      // Method 2: Check for DOCKER_CONTAINER env var
      if (process.env.DOCKER_CONTAINER === 'true' || process.env.DOCKER_HOST) {
        return true;
      }

      // Method 3: Check for Kubernetes
      if (process.env.KUBERNETES_SERVICE_HOST) {
        return true;
      }

      // Method 4: Check cgroup (works in most containers)
      try {
        const cgroup = fs.readFileSync('/proc/self/cgroup', 'utf8');
        if (cgroup.includes('docker') || cgroup.includes('kubepods') || cgroup.includes('lxc')) {
          return true;
        }
      } catch (e) {
        // File doesn't exist (not Linux or not in container)
      }

      return false;
    } catch (error) {
      logger.debug('[Hardware] Container detection error:', error);
      return false;
    }
  }

  private static detectGpu(): boolean {
    try {
      // Check for NVIDIA CUDA
      const hasNvidiaCuda = process.env.CUDA_HOME || process.env.NVIDIA_VISIBLE_DEVICES;

      // Check for AMD ROCm
      const hasAmdRocm = process.env.ROCM_HOME || process.env.HSA_OVERRIDE_GFX_VERSION;

      // Check for Apple Metal (on macOS)
      const hasMetal = os.platform() === 'darwin';

      // Try to detect from cpuinfo on Linux (unreliable in containers)
      if (os.platform() === 'linux') {
        try {
          const cpuInfo = os.cpus()[0]?.model || '';
          // Check for GPU-related keywords in CPU model
          if (
            cpuInfo.includes('GPU') ||
            cpuInfo.includes('NVIDIA') ||
            cpuInfo.includes('AMD')
          ) {
            return true;
          }
        } catch (e) {
          // Ignore errors
        }
      }

      return !!(hasNvidiaCuda || hasAmdRocm || hasMetal);
    } catch (error) {
      logger.debug('[Hardware] GPU detection error (non-critical in containerized environments):', error);
      return false; // Graceful fallback in containers
    }
  }

  /**
   * Get embedding model information
   */
  static getEmbeddingModelInfo(option: EmbeddingModelOption): {
    displayName: string;
    modelSize: string;
    latency: string;
    contextWindow: string;
    quality: string;
    multilingual: boolean;
  } {
    const modelInfo: Record<
      EmbeddingModelOption,
      {
        displayName: string;
        modelSize: string;
        latency: string;
        contextWindow: string;
        quality: string;
        multilingual: boolean;
      }
    > = {
      [EmbeddingModelOption.EMBEDDING_GEMMA_300M]: {
        displayName: 'EmbeddingGemma 300M',
        modelSize: '300M parameters',
        latency: '<15ms',
        contextWindow: '1K tokens',
        quality: 'High (MTEB #1 under 500M)',
        multilingual: true,
      },
      [EmbeddingModelOption.NOMIC_EMBED_TEXT]: {
        displayName: 'Nomic-Embed-Text v1.5',
        modelSize: '~100M parameters',
        latency: '<25ms',
        contextWindow: '8K tokens',
        quality: 'Excellent (beats OpenAI)',
        multilingual: true,
      },
    };

    return (
      modelInfo[option] || {
        displayName: 'Unknown',
        modelSize: 'Unknown',
        latency: 'Unknown',
        contextWindow: 'Unknown',
        quality: 'Unknown',
        multilingual: false,
      }
    );
  }

  /**
   * Get generation model information
   */
  static getGenerationModelInfo(option: GenerationModelOption): {
    displayName: string;
    modelSize: string;
    speed: string;
    quality: string;
    contextWindow: string;
  } {
    const modelInfo: Record<
      GenerationModelOption,
      {
        displayName: string;
        modelSize: string;
        speed: string;
        quality: string;
        contextWindow: string;
      }
    > = {
      [GenerationModelOption.GEMMA_3_270M]: {
        displayName: 'Gemma 3 270M',
        modelSize: '270M parameters',
        speed: 'Ultra-Fast (20 tok/s)',
        quality: 'Basic',
        contextWindow: '6K tokens',
      },
      [GenerationModelOption.LLAMA_3_2_1B]: {
        displayName: 'Llama 3.2 1B',
        modelSize: '1B parameters',
        speed: 'Very Fast (15 tok/s)',
        quality: 'Good',
        contextWindow: '128K tokens',
      },
      [GenerationModelOption.DEEPSEEK_R1_1_5B]: {
        displayName: 'DeepSeek-R1-Distill 1.5B',
        modelSize: '1.5B parameters',
        speed: 'Fast (12 tok/s)',
        quality: 'Excellent Reasoning',
        contextWindow: '64K tokens',
      },
      [GenerationModelOption.LLAMA_3_2_3B]: {
        displayName: 'Llama 3.2 3B',
        modelSize: '3B parameters',
        speed: 'Fast (8 tok/s)',
        quality: 'Very Good',
        contextWindow: '128K tokens',
      },
      [GenerationModelOption.NEMOTRON_NANO_4B]: {
        displayName: 'Nemotron Nano 4B',
        modelSize: '4B parameters',
        speed: 'Medium (6 tok/s)',
        quality: 'Excellent',
        contextWindow: '128K tokens',
      },
    };

    return (
      modelInfo[option] || {
        displayName: 'Unknown',
        modelSize: 'Unknown',
        speed: 'Unknown',
        quality: 'Unknown',
        contextWindow: 'Unknown',
      }
    );
  }

  /**
   * Get legacy LLM model information
   */
  static getLLMInfo(option: NanoLLMOption): {
    displayName: string;
    modelSize: string;
    context: string;
    speed: string;
    quality: string;
    ollama: string; // Ollama model name
  } {
    const llmInfo: Record<
      NanoLLMOption,
      {
        displayName: string;
        modelSize: string;
        context: string;
        speed: string;
        quality: string;
        ollama: string;
      }
    > = {
      [NanoLLMOption.PHI_3_MINI]: {
        displayName: 'Phi-3.5 Mini',
        modelSize: '3.8B parameters',
        context: '4K tokens',
        speed: 'Very Fast',
        quality: 'Basic',
        ollama: 'phi:3.5-mini',
      },
      [NanoLLMOption.PHI_3_SMALL]: {
        displayName: 'Phi-3.5 Small',
        modelSize: '7B parameters',
        context: '4K tokens',
        speed: 'Fast',
        quality: 'Good',
        ollama: 'phi:3.5',
      },
      [NanoLLMOption.NEURAL_CHAT_7B]: {
        displayName: 'Neural Chat 7B',
        modelSize: '7B parameters',
        context: '4K tokens',
        speed: 'Fast',
        quality: 'Good',
        ollama: 'neural-chat:7b',
      },
      [NanoLLMOption.MIXTRAL_7B]: {
        displayName: 'Mixtral 7B',
        modelSize: '7B parameters (MoE)',
        context: '32K tokens',
        speed: 'Very Fast',
        quality: 'Excellent',
        ollama: 'mixtral:7b',
      },
      [NanoLLMOption.LLAMA_2_13B]: {
        displayName: 'Llama 2 13B',
        modelSize: '13B parameters',
        context: '4K tokens',
        speed: 'Moderate',
        quality: 'Excellent',
        ollama: 'llama2:13b',
      },
    };

    return (
      llmInfo[option] || {
        displayName: 'Unknown',
        modelSize: 'Unknown',
        context: '4K tokens',
        speed: 'Unknown',
        quality: 'Unknown',
        ollama: 'unknown',
      }
    );
  }

  /**
   * Validate if system meets minimum requirements for LLM
   */
  static validateSystemRequirements(
    llm: NanoLLMOption,
    hardware: HardwareProfile
  ): {
    meetsRequirements: boolean;
    warnings: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Minimum requirements per LLM
    const requirements: Record<
      NanoLLMOption,
      { minRam: number; minCores: number; recommendedRam: number }
    > = {
      [NanoLLMOption.PHI_3_MINI]: {
        minRam: 2,
        minCores: 2,
        recommendedRam: 4,
      },
      [NanoLLMOption.PHI_3_SMALL]: {
        minRam: 4,
        minCores: 2,
        recommendedRam: 6,
      },
      [NanoLLMOption.NEURAL_CHAT_7B]: {
        minRam: 4,
        minCores: 2,
        recommendedRam: 8,
      },
      [NanoLLMOption.MIXTRAL_7B]: {
        minRam: 6,
        minCores: 4,
        recommendedRam: 12,
      },
      [NanoLLMOption.LLAMA_2_13B]: {
        minRam: 16,
        minCores: 4,
        recommendedRam: 20,
      },
    };

    const req = requirements[llm];
    if (!req) {
      return { meetsRequirements: false, warnings: ['Unknown LLM'], recommendations: [] };
    }

    let meetsRequirements = true;

    // Check RAM
    if (hardware.ramGbytes < req.minRam) {
      meetsRequirements = false;
      warnings.push(
        `System has ${hardware.ramGbytes}GB RAM, but ${llm} requires minimum ${req.minRam}GB`
      );
    } else if (hardware.ramGbytes < req.recommendedRam) {
      warnings.push(
        `System has ${hardware.ramGbytes}GB RAM, but ${req.recommendedRam}GB is recommended for optimal performance`
      );
    }

    // Check CPU cores
    if (hardware.cpuCores < req.minCores) {
      warnings.push(`System has ${hardware.cpuCores} cores, but ${req.minCores} is recommended`);
    }

    // GPU recommendations
    if (!hardware.hasGpu && (llm === NanoLLMOption.LLAMA_2_13B || llm === NanoLLMOption.MIXTRAL_7B)) {
      recommendations.push('GPU acceleration is recommended for better performance with this model');
    }

    // Memory pressure warnings
    if (hardware.ramGbytes >= req.minRam && hardware.ramGbytes < req.minRam * 1.5) {
      recommendations.push(
        `System is at minimum memory threshold. Close other applications before running LLM`
      );
    }

    return {
      meetsRequirements,
      warnings,
      recommendations,
    };
  }
}
