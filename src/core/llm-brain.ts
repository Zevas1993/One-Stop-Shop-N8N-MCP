/**
 * LLM Brain
 * 
 * Unified interface for embedded LLMs (via Ollama).
 * Uses the dual-model architecture:
 * - Embedding model: Fast vector generation for search/similarity
 * - Generation model: Text generation for validation, suggestions, chat
 * 
 * Responsibilities:
 * 1. Semantic workflow validation ("does this make sense?")
 * 2. Auto-fix suggestions for broken workflows
 * 3. Natural language → workflow intent parsing
 * 4. Node recommendations
 * 5. Chat-based workflow building assistance
 */

import { logger } from '../utils/logger';
import { HardwareDetector, EmbeddingModelOption, GenerationModelOption } from '../ai/hardware-detector';
import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface LLMConfig {
  ollamaUrl?: string;                    // Default: http://localhost:11434
  embeddingModel?: string;               // Auto-detected or override
  generationModel?: string;              // Auto-detected or override
  temperature?: number;                  // Default: 0.7
  maxTokens?: number;                    // Default: 2048
}

export interface SemanticAnalysis {
  valid: boolean;
  confidence: number;                    // 0-1
  issues: SemanticIssue[];
  suggestions: string[];
  summary: string;
}

export interface SemanticIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
  suggestion?: string;
}

export interface WorkflowIntent {
  action: 'create' | 'modify' | 'query' | 'help' | 'unknown';
  description: string;
  entities: {
    triggers?: string[];
    actions?: string[];
    integrations?: string[];
    conditions?: string[];
  };
  confidence: number;
}

export interface NodeRecommendation {
  nodeType: string;
  displayName: string;
  reason: string;
  confidence: number;
  usage?: string;
}

export interface FixSuggestion {
  issue: string;
  fix: string;
  confidence: number;
  autoApplicable: boolean;
  patch?: any;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  message: string;
  intent?: WorkflowIntent;
  recommendations?: NodeRecommendation[];
  suggestedWorkflow?: any;
}

// ============================================================================
// OLLAMA CLIENT
// ============================================================================

class OllamaClient {
  private baseUrl: string;
  private timeout: number = 60000;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const axios = (await import('axios')).default;
      const response = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const axios = (await import('axios')).default;
      const response = await axios.get(`${this.baseUrl}/api/tags`);
      return (response.data?.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }

  /**
   * Check if a specific model is available
   */
  async hasModel(model: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some(m => m.includes(model) || model.includes(m));
  }

  /**
   * Pull a model if not present
   */
  async pullModel(model: string): Promise<boolean> {
    try {
      const axios = (await import('axios')).default;
      logger.info(`[LLMBrain] Pulling model: ${model}...`);
      
      await axios.post(`${this.baseUrl}/api/pull`, { name: model }, {
        timeout: 300000, // 5 minutes for large models
      });
      
      logger.info(`[LLMBrain] Model ${model} pulled successfully`);
      return true;
    } catch (error: any) {
      logger.error(`[LLMBrain] Failed to pull model ${model}:`, error.message);
      return false;
    }
  }

  /**
   * Generate text completion
   */
  async generate(
    model: string,
    prompt: string,
    options?: { temperature?: number; maxTokens?: number; system?: string }
  ): Promise<string> {
    const axios = (await import('axios')).default;
    
    const response = await axios.post(`${this.baseUrl}/api/generate`, {
      model,
      prompt,
      system: options?.system,
      options: {
        temperature: options?.temperature || 0.7,
        num_predict: options?.maxTokens || 2048,
      },
      stream: false,
    }, { timeout: this.timeout });

    return response.data?.response || '';
  }

  /**
   * Chat completion (multi-turn)
   */
  async chat(
    model: string,
    messages: ChatMessage[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const axios = (await import('axios')).default;
    
    const response = await axios.post(`${this.baseUrl}/api/chat`, {
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      options: {
        temperature: options?.temperature || 0.7,
        num_predict: options?.maxTokens || 2048,
      },
      stream: false,
    }, { timeout: this.timeout });

    return response.data?.message?.content || '';
  }

  /**
   * Generate embeddings
   */
  async embed(model: string, text: string): Promise<number[]> {
    const axios = (await import('axios')).default;
    
    const response = await axios.post(`${this.baseUrl}/api/embeddings`, {
      model,
      prompt: text,
    }, { timeout: 30000 });

    return response.data?.embedding || [];
  }
}

// ============================================================================
// LLM BRAIN CLASS
// ============================================================================

export class LLMBrain extends EventEmitter {
  private ollama: OllamaClient;
  private embeddingModel: string;
  private generationModel: string;
  private config: LLMConfig;
  private isReady: boolean = false;
  private conversationHistory: ChatMessage[] = [];

  // System prompts
  private readonly WORKFLOW_ANALYST_PROMPT = `You are an expert n8n workflow analyst. Your job is to analyze workflows for logical issues, potential problems, and improvements.

When analyzing workflows:
1. Check if the flow makes logical sense
2. Identify missing connections or orphaned nodes
3. Look for potential infinite loops
4. Check if data transformations are correct
5. Verify trigger → action flow is complete
6. Identify security concerns

Respond in JSON format with: { valid: boolean, confidence: number, issues: [], suggestions: [], summary: string }`;

  private readonly WORKFLOW_ASSISTANT_PROMPT = `You are an n8n workflow assistant. You help users build and troubleshoot workflows.

You know about:
- All n8n node types and their configurations
- Best practices for workflow design
- Common integration patterns
- Error handling strategies
- Performance optimization

Be concise but thorough. When suggesting workflows, provide specific node types and configurations.`;

  constructor(config: LLMConfig = {}) {
    super();
    this.config = config;
    this.ollama = new OllamaClient(config.ollamaUrl);

    // Detect optimal models based on hardware
    const hardware = HardwareDetector.detectHardware();
    
    this.embeddingModel = config.embeddingModel || 
      this.mapEmbeddingModel(hardware.embeddingModel);
    this.generationModel = config.generationModel || 
      this.mapGenerationModel(hardware.generationModel);

    logger.info('[LLMBrain] Configured models:', {
      embedding: this.embeddingModel,
      generation: this.generationModel,
    });
  }

  /**
   * Map hardware detector enum to Ollama model name
   */
  private mapEmbeddingModel(model: EmbeddingModelOption): string {
    const mapping: Record<EmbeddingModelOption, string> = {
      [EmbeddingModelOption.EMBEDDING_GEMMA_300M]: 'nomic-embed-text',
      [EmbeddingModelOption.NOMIC_EMBED_TEXT]: 'nomic-embed-text',
    };
    return mapping[model] || 'nomic-embed-text';
  }

  private mapGenerationModel(model: GenerationModelOption): string {
    const mapping: Record<GenerationModelOption, string> = {
      [GenerationModelOption.GEMMA_3_270M]: 'gemma:2b',
      [GenerationModelOption.LLAMA_3_2_1B]: 'llama3.2:1b',
      [GenerationModelOption.DEEPSEEK_R1_1_5B]: 'deepseek-r1:1.5b',
      [GenerationModelOption.LLAMA_3_2_3B]: 'llama3.2:3b',
      [GenerationModelOption.NEMOTRON_NANO_4B]: 'nemotron-mini',
    };
    return mapping[model] || 'llama3.2:1b';
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the LLM Brain
   * Checks Ollama availability and ensures models are present
   */
  async initialize(): Promise<boolean> {
    logger.info('[LLMBrain] Initializing...');

    // Check Ollama availability
    const available = await this.ollama.isAvailable();
    if (!available) {
      logger.warn('[LLMBrain] Ollama not available at', this.config.ollamaUrl || 'http://localhost:11434');
      logger.warn('[LLMBrain] Some features will be disabled');
      this.isReady = false;
      return false;
    }

    // Check/pull embedding model
    const hasEmbedding = await this.ollama.hasModel(this.embeddingModel);
    if (!hasEmbedding) {
      logger.info(`[LLMBrain] Embedding model ${this.embeddingModel} not found, pulling...`);
      await this.ollama.pullModel(this.embeddingModel);
    }

    // Check/pull generation model
    const hasGeneration = await this.ollama.hasModel(this.generationModel);
    if (!hasGeneration) {
      logger.info(`[LLMBrain] Generation model ${this.generationModel} not found, pulling...`);
      await this.ollama.pullModel(this.generationModel);
    }

    this.isReady = true;
    logger.info('[LLMBrain] ✅ Initialized successfully');
    this.emit('ready');
    
    return true;
  }

  /**
   * Check if brain is ready
   */
  isInitialized(): boolean {
    return this.isReady;
  }

  // ==========================================================================
  // SEMANTIC VALIDATION
  // ==========================================================================

  /**
   * Analyze workflow logic using LLM
   * Returns semantic issues that schema validation can't catch
   */
  async analyzeWorkflowLogic(workflow: any): Promise<SemanticAnalysis> {
    if (!this.isReady) {
      return {
        valid: true,
        confidence: 0,
        issues: [],
        suggestions: [],
        summary: 'LLM not available - semantic analysis skipped',
      };
    }

    try {
      const workflowSummary = this.summarizeWorkflow(workflow);
      
      const prompt = `Analyze this n8n workflow for logical issues:

${workflowSummary}

Respond in JSON format ONLY with this structure:
{
  "valid": true/false,
  "confidence": 0.0-1.0,
  "issues": [{"severity": "error|warning|info", "message": "...", "suggestion": "..."}],
  "suggestions": ["improvement suggestion 1", "..."],
  "summary": "brief analysis summary"
}`;

      const response = await this.ollama.generate(
        this.generationModel,
        prompt,
        { system: this.WORKFLOW_ANALYST_PROMPT, temperature: 0.3 }
      );

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return {
          valid: analysis.valid ?? true,
          confidence: analysis.confidence ?? 0.5,
          issues: analysis.issues || [],
          suggestions: analysis.suggestions || [],
          summary: analysis.summary || 'Analysis complete',
        };
      }

      return {
        valid: true,
        confidence: 0.3,
        issues: [],
        suggestions: [],
        summary: 'Could not parse LLM response',
      };

    } catch (error: any) {
      logger.error('[LLMBrain] Semantic analysis failed:', error.message);
      return {
        valid: true,
        confidence: 0,
        issues: [],
        suggestions: [],
        summary: `Analysis error: ${error.message}`,
      };
    }
  }

  /**
   * Create a concise summary of workflow for LLM analysis
   */
  private summarizeWorkflow(workflow: any): string {
    const nodes = workflow.nodes || [];
    const connections = workflow.connections || {};

    let summary = `Workflow: ${workflow.name || 'Untitled'}\n`;
    summary += `Nodes (${nodes.length}):\n`;
    
    for (const node of nodes) {
      summary += `  - ${node.name} (${node.type})\n`;
    }

    summary += `\nConnections:\n`;
    for (const [from, conns] of Object.entries(connections)) {
      if ((conns as any)?.main) {
        for (const outputs of (conns as any).main) {
          for (const conn of outputs || []) {
            summary += `  ${from} → ${conn.node}\n`;
          }
        }
      }
    }

    return summary;
  }

  // ==========================================================================
  // FIX SUGGESTIONS
  // ==========================================================================

  /**
   * Suggest fixes for validation errors
   */
  async suggestFixes(errors: any[]): Promise<FixSuggestion[]> {
    if (!this.isReady || errors.length === 0) {
      return [];
    }

    try {
      const errorSummary = errors.map(e => `- ${e.message}`).join('\n');
      
      const prompt = `These n8n workflow validation errors occurred:

${errorSummary}

Suggest fixes for each error. Respond in JSON format:
[
  {
    "issue": "original error",
    "fix": "how to fix it",
    "confidence": 0.0-1.0,
    "autoApplicable": true/false
  }
]`;

      const response = await this.ollama.generate(
        this.generationModel,
        prompt,
        { system: this.WORKFLOW_ASSISTANT_PROMPT, temperature: 0.5 }
      );

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return [];

    } catch (error: any) {
      logger.error('[LLMBrain] Fix suggestion failed:', error.message);
      return [];
    }
  }

  // ==========================================================================
  // INTENT PARSING
  // ==========================================================================

  /**
   * Parse natural language into workflow intent
   */
  async parseIntent(message: string): Promise<WorkflowIntent> {
    if (!this.isReady) {
      return {
        action: 'unknown',
        description: message,
        entities: {},
        confidence: 0,
      };
    }

    try {
      const prompt = `Parse this user request about n8n workflows:

"${message}"

Respond in JSON format:
{
  "action": "create|modify|query|help",
  "description": "what the user wants to do",
  "entities": {
    "triggers": ["trigger types mentioned"],
    "actions": ["action types mentioned"],
    "integrations": ["services/apps mentioned"],
    "conditions": ["conditions mentioned"]
  },
  "confidence": 0.0-1.0
}`;

      const response = await this.ollama.generate(
        this.generationModel,
        prompt,
        { temperature: 0.3 }
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        action: 'unknown',
        description: message,
        entities: {},
        confidence: 0.3,
      };

    } catch (error: any) {
      logger.error('[LLMBrain] Intent parsing failed:', error.message);
      return {
        action: 'unknown',
        description: message,
        entities: {},
        confidence: 0,
      };
    }
  }

  // ==========================================================================
  // NODE RECOMMENDATIONS
  // ==========================================================================

  /**
   * Recommend nodes for a given task
   */
  async recommendNodes(task: string, availableNodes: string[]): Promise<NodeRecommendation[]> {
    if (!this.isReady) {
      return [];
    }

    try {
      // Sample of available nodes for context
      const nodeSample = availableNodes.slice(0, 50).join(', ');
      
      const prompt = `For this task: "${task}"

Available n8n node types include: ${nodeSample}

Recommend the best nodes to use. Respond in JSON format:
[
  {
    "nodeType": "n8n-nodes-base.xxx",
    "displayName": "Node Name",
    "reason": "why this node",
    "confidence": 0.0-1.0
  }
]`;

      const response = await this.ollama.generate(
        this.generationModel,
        prompt,
        { system: this.WORKFLOW_ASSISTANT_PROMPT, temperature: 0.5 }
      );

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return [];

    } catch (error: any) {
      logger.error('[LLMBrain] Node recommendation failed:', error.message);
      return [];
    }
  }

  // ==========================================================================
  // CHAT INTERFACE
  // ==========================================================================

  /**
   * Chat with the workflow assistant
   */
  async chat(message: string): Promise<ChatResponse> {
    if (!this.isReady) {
      return {
        message: 'LLM is not available. Please ensure Ollama is running.',
      };
    }

    try {
      // Add user message to history
      this.conversationHistory.push({ role: 'user', content: message });

      // Keep history manageable (last 10 messages)
      if (this.conversationHistory.length > 10) {
        this.conversationHistory = this.conversationHistory.slice(-10);
      }

      // Prepare messages with system prompt
      const messages: ChatMessage[] = [
        { role: 'system', content: this.WORKFLOW_ASSISTANT_PROMPT },
        ...this.conversationHistory,
      ];

      const response = await this.ollama.chat(this.generationModel, messages, {
        temperature: this.config.temperature || 0.7,
        maxTokens: this.config.maxTokens || 2048,
      });

      // Add assistant response to history
      this.conversationHistory.push({ role: 'assistant', content: response });

      // Parse intent if it seems like a workflow request
      let intent: WorkflowIntent | undefined;
      if (message.toLowerCase().includes('workflow') || 
          message.toLowerCase().includes('automate') ||
          message.toLowerCase().includes('create')) {
        intent = await this.parseIntent(message);
      }

      return {
        message: response,
        intent,
      };

    } catch (error: any) {
      logger.error('[LLMBrain] Chat failed:', error.message);
      return {
        message: `I encountered an error: ${error.message}. Please try again.`,
      };
    }
  }

  /**
   * Clear conversation history
   */
  clearConversation(): void {
    this.conversationHistory = [];
  }

  // ==========================================================================
  // EMBEDDINGS
  // ==========================================================================

  /**
   * Generate embedding for text
   */
  async embed(text: string): Promise<number[]> {
    if (!this.isReady) {
      return [];
    }

    try {
      return await this.ollama.embed(this.embeddingModel, text);
    } catch (error: any) {
      logger.error('[LLMBrain] Embedding failed:', error.message);
      return [];
    }
  }

  /**
   * Calculate similarity between two texts
   */
  async similarity(text1: string, text2: string): Promise<number> {
    const [emb1, emb2] = await Promise.all([
      this.embed(text1),
      this.embed(text2),
    ]);

    if (emb1.length === 0 || emb2.length === 0) {
      return 0;
    }

    // Cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < emb1.length; i++) {
      dotProduct += emb1[i] * emb2[i];
      norm1 += emb1[i] * emb1[i];
      norm2 += emb2[i] * emb2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let brainInstance: LLMBrain | null = null;

export function getLLMBrain(config?: LLMConfig): LLMBrain {
  if (!brainInstance) {
    brainInstance = new LLMBrain(config);
  }
  return brainInstance;
}

export async function initLLMBrain(config?: LLMConfig): Promise<LLMBrain> {
  const brain = getLLMBrain(config);
  await brain.initialize();
  return brain;
}
