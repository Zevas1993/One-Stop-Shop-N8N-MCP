/**
 * AI Module
 * 
 * Complete AI infrastructure for the n8n Co-Pilot:
 * - LLM Router: Unified access to Ollama (primary) and vLLM (fallback)
 * - Event Bus: Inter-agent communication
 * - Knowledge Agent: Learning and recommendations
 * - Hardware Detection: Auto-selects optimal models
 * 
 * Usage:
 *   import { initAISystem, getLLMRouter, getKnowledgeAgent } from './ai';
 *   
 *   await initAISystem();
 *   const response = await getLLMRouter().generate('Hello!');
 */

// Core LLM clients
export * from './ollama-client';
export * from './vllm-client';

// Unified LLM router
export * from './llm-router';

// Event-driven architecture
export * from './event-bus';
export * from './shared-memory';

// Agents
export * from './knowledge-agent';

// Hardware detection
export * from './hardware-detector';

// Legacy orchestrator (for backward compatibility)
export * from './local-llm-orchestrator';

// ============================================================================
// UNIFIED INITIALIZATION
// ============================================================================

import { logger } from '../utils/logger';
import { initLLMRouter, getLLMRouter, LLMRouter } from './llm-router';
import { getEventBus, EventBus, EventTypes } from './event-bus';
import { getSharedMemory, SharedMemory } from './shared-memory';
import { initKnowledgeAgent, getKnowledgeAgent, KnowledgeManagementAgent } from './knowledge-agent';

export interface AISystemConfig {
  ollamaUrl?: string;
  vllmEmbeddingUrl?: string;
  vllmGenerationUrl?: string;
  embeddingModel?: string;
  generationModel?: string;
  enableLearning?: boolean;
  preferVLLM?: boolean;
}

export interface AISystemStatus {
  initialized: boolean;
  llmAvailable: boolean;
  llmBackend: string;
  embeddingModel: string;
  generationModel: string;
  eventBusReady: boolean;
  knowledgeAgentReady: boolean;
  knowledgeCount: number;
}

let aiSystemInitialized = false;

/**
 * Initialize the complete AI system
 * Call this once on application startup
 */
export async function initAISystem(config: AISystemConfig = {}): Promise<boolean> {
  logger.info('[AI] Initializing AI system...');

  try {
    // 1. Initialize shared memory first (needed by other components)
    const sharedMemory = await getSharedMemory();
    logger.info('[AI] Shared memory ready');

    // 2. Initialize event bus
    const eventBus = await getEventBus();
    logger.info('[AI] Event bus ready');

    // 3. Initialize LLM router
    const llmRouter = await initLLMRouter({
      ollamaUrl: config.ollamaUrl,
      vllmEmbeddingUrl: config.vllmEmbeddingUrl,
      vllmGenerationUrl: config.vllmGenerationUrl,
      embeddingModel: config.embeddingModel,
      generationModel: config.generationModel,
      preferVLLM: config.preferVLLM ?? false,
    });
    
    const llmStatus = llmRouter.getStatus();
    logger.info('[AI] LLM router ready:', {
      backend: llmStatus.activeBackend,
      embeddingModel: llmStatus.embeddingModel,
      generationModel: llmStatus.generationModel,
    });

    // 4. Initialize knowledge agent
    const knowledgeAgent = await initKnowledgeAgent({
      enableLearning: config.enableLearning ?? true,
      enableRecommendations: true,
    });
    logger.info('[AI] Knowledge agent ready');

    // 5. Publish system started event
    await eventBus.publish(EventTypes.SYSTEM_STARTED, {
      llmBackend: llmStatus.activeBackend,
      embeddingModel: llmStatus.embeddingModel,
      generationModel: llmStatus.generationModel,
    }, 'ai-system');

    aiSystemInitialized = true;
    logger.info('[AI] ✅ AI system initialized successfully');

    return true;

  } catch (error: any) {
    logger.error('[AI] AI system initialization failed:', error.message);
    return false;
  }
}

/**
 * Get AI system status
 */
export function getAISystemStatus(): AISystemStatus {
  const llmRouter = getLLMRouter();
  const llmStatus = llmRouter.getStatus();
  const knowledgeAgent = getKnowledgeAgent();
  const knowledgeStatus = knowledgeAgent.getStatus();

  return {
    initialized: aiSystemInitialized,
    llmAvailable: llmRouter.isAvailable(),
    llmBackend: llmStatus.activeBackend,
    embeddingModel: llmStatus.embeddingModel,
    generationModel: llmStatus.generationModel,
    eventBusReady: true, // If we got here, it's ready
    knowledgeAgentReady: knowledgeStatus.initialized,
    knowledgeCount: knowledgeStatus.knowledgeCount,
  };
}

/**
 * Shutdown AI system
 */
export async function shutdownAISystem(): Promise<void> {
  logger.info('[AI] Shutting down AI system...');

  try {
    // Shutdown in reverse order
    const knowledgeAgent = getKnowledgeAgent();
    await knowledgeAgent.shutdown();

    const llmRouter = getLLMRouter();
    await llmRouter.shutdown();

    const eventBus = await getEventBus();
    await eventBus.close();

    aiSystemInitialized = false;
    logger.info('[AI] AI system shutdown complete');
  } catch (error) {
    logger.error('[AI] Error during shutdown:', error);
  }
}

/**
 * Check if AI system is initialized
 */
export function isAISystemReady(): boolean {
  return aiSystemInitialized && getLLMRouter().isAvailable();
}
