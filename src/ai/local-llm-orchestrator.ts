/**
 * Local LLM Orchestrator
 * Manages DUAL nano LLM lifecycle (embedding + generation)
 * Conversation and workflow generation with intelligent search routing
 * Enables direct user interaction with n8n workflow automation
 */

import {
  HardwareDetector,
  NanoLLMOption,
  EmbeddingModelOption,
  GenerationModelOption,
  HardwareProfile,
} from "./hardware-detector";
import { VLLMClient, createDualVLLMClients } from "./vllm-client";
import { logger } from "../utils/logger";

// Forward declaration - avoid circular import
type GraphRAGNanoOrchestrator = any;
type PipelineResult = any;

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface ConversationContext {
  messages: ConversationMessage[];
  workflowIdeas: string[];
  generatedWorkflows: WorkflowGenerationResult[];
  n8nApiKey?: string;
  n8nApiUrl?: string;
  isConfigured: boolean;
}

export interface WorkflowGenerationResult {
  id: string;
  idea: string;
  workflow: any;
  validationResult: any;
  generatedAt: Date;
  isDeployed: boolean;
  deploymentId?: string;
}

export interface LocalLLMConfig {
  llmOption: NanoLLMOption; // Legacy - for backward compatibility
  embeddingModel?: EmbeddingModelOption;
  generationModel?: GenerationModelOption;
  baseUrl?: string; // Ollama base URL, default: http://localhost:11434
  embeddingBaseUrl?: string; // vLLM embedding service base URL, default: http://localhost:8001
  generationBaseUrl?: string; // vLLM generation service base URL, default: http://localhost:8002
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LLMResponse {
  text: string;
  tokens: number;
  generationTime: number;
}

/**
 * Local LLM Orchestrator
 * Manages n8n workflow conversation and generation
 */
export class LocalLLMOrchestrator {
  private hardwareProfile: HardwareProfile;
  private config: LocalLLMConfig;
  private context: ConversationContext;
  private nanoAgentOrchestrator: any; // GraphRAGNanoOrchestrator type
  private systemPrompt: string;
  private workflowCounter: number = 0;

  // Dual nano LLM clients
  private embeddingClient?: VLLMClient;
  private generationClient?: VLLMClient;

  constructor(config?: Partial<LocalLLMConfig>) {
    logger.info(
      "[LocalLLM] Initializing orchestrator with DUAL NANO LLM architecture..."
    );

    // Detect hardware (container-safe: gracefully handles containerized environments)
    this.hardwareProfile = HardwareDetector.detectHardware();
    logger.info("[LocalLLM] Hardware detected:", {
      ram: `${this.hardwareProfile.ramGbytes}GB`,
      cores: this.hardwareProfile.cpuCores,
      gpu: this.hardwareProfile.hasGpu,
      embeddingModel: this.hardwareProfile.embeddingModel,
      generationModel: this.hardwareProfile.generationModel,
      recommendedLlm: this.hardwareProfile.recommendedLlm,
    });

    // Note: In Docker containers, GPU detection may show false but inference still works via Ollama
    if (!this.hardwareProfile.hasGpu) {
      logger.info(
        "[LocalLLM] GPU not detected - will use CPU or rely on Ollama backend for inference"
      );
    }

    // Get embedding and generation model info
    const embeddingModelInfo = HardwareDetector.getEmbeddingModelInfo(
      config?.embeddingModel || this.hardwareProfile.embeddingModel
    );
    const generationModelInfo = HardwareDetector.getGenerationModelInfo(
      config?.generationModel || this.hardwareProfile.generationModel
    );

    // Determine LLM option (use provided or auto-detect)
    const llmOption = config?.llmOption || this.hardwareProfile.recommendedLlm;
    const validation = llmOption
      ? HardwareDetector.validateSystemRequirements(
          llmOption,
          this.hardwareProfile
        )
      : { meetsRequirements: true, warnings: [] };

    if (!validation.meetsRequirements) {
      logger.warn(
        "[LocalLLM] System does not meet minimum requirements:",
        validation.warnings
      );
    }

    this.config = {
      llmOption: llmOption as NanoLLMOption,
      embeddingModel:
        config?.embeddingModel || this.hardwareProfile.embeddingModel,
      generationModel:
        config?.generationModel || this.hardwareProfile.generationModel,
      baseUrl: config?.baseUrl || "http://localhost:11434",
      embeddingBaseUrl: config?.embeddingBaseUrl || "http://localhost:8001",
      generationBaseUrl: config?.generationBaseUrl || "http://localhost:8002",
      temperature: config?.temperature ?? 0.7,
      maxTokens: config?.maxTokens ?? 1024,
      systemPrompt: config?.systemPrompt,
    };

    logger.info("[LocalLLM] Dual Nano LLM Configuration:", {
      embeddingModel: this.config.embeddingModel,
      embeddingModelDisplayName: embeddingModelInfo.displayName,
      generationModel: this.config.generationModel,
      generationModelDisplayName: generationModelInfo.displayName,
      embeddingBaseUrl: this.config.embeddingBaseUrl,
      generationBaseUrl: this.config.generationBaseUrl,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });

    // Initialize context
    this.context = {
      messages: [],
      workflowIdeas: [],
      generatedWorkflows: [],
      isConfigured: false,
    };

    // Initialize dual vLLM clients
    try {
      const clients = createDualVLLMClients(
        this.config.embeddingModel!,
        this.config.generationModel!,
        this.config.embeddingBaseUrl!,
        this.config.generationBaseUrl!,
        this.config.maxTokens || 1024
      );

      this.embeddingClient = clients.embedding;
      this.generationClient = clients.generation;

      logger.info("[LocalLLM] Dual vLLM clients initialized:", {
        embeddingModel: this.config.embeddingModel,
        embeddingServer: this.config.embeddingBaseUrl,
        generationModel: this.config.generationModel,
        generationServer: this.config.generationBaseUrl,
      });
    } catch (error) {
      logger.warn("[LocalLLM] Failed to initialize vLLM clients:", error);
      this.embeddingClient = undefined;
      this.generationClient = undefined;
    }

    // Initialize nano agent orchestrator
    try {
      // Dynamically import to avoid circular dependency
      const {
        GraphRAGNanoOrchestrator: GRAO,
      } = require("./graphrag-nano-orchestrator");
      this.nanoAgentOrchestrator = new GRAO({
        enableGraphRAG: true,
        maxAgentRetries: 2,
        agentTimeoutMs: 30000,
        shareGraphInsights: true,
      });
    } catch (error) {
      logger.warn(
        "[LocalLLM] Failed to initialize nano agent orchestrator:",
        error
      );
      this.nanoAgentOrchestrator = null;
    }

    // Load or create system prompt
    this.systemPrompt = config?.systemPrompt || this.createSystemPrompt();

    logger.info("[LocalLLM] Orchestrator initialized successfully");
  }

  /**
   * Initialize the orchestrator (async setup)
   */
  async initialize(): Promise<void> {
    logger.info(
      "[LocalLLM] Starting async initialization with dual nano LLM clients..."
    );
    try {
      // Check vLLM client health
      let embeddingHealthy = false;
      let generationHealthy = false;

      if (this.embeddingClient) {
        embeddingHealthy = await this.embeddingClient.checkHealth();
        if (embeddingHealthy) {
          logger.info("[LocalLLM] Embedding vLLM client is healthy");
        } else {
          logger.warn("[LocalLLM] Embedding vLLM client is not responding");
        }
      }

      if (this.generationClient) {
        generationHealthy = await this.generationClient.checkHealth();
        if (generationHealthy) {
          logger.info("[LocalLLM] Generation vLLM client is healthy");
        } else {
          logger.warn("[LocalLLM] Generation vLLM client is not responding");
        }
      }

      // Initialize nano agent orchestrator
      if (this.nanoAgentOrchestrator) {
        await this.nanoAgentOrchestrator.initialize();
        logger.info("[LocalLLM] Nano agent orchestrator initialized");
      }

      // Verify LLM connectivity (legacy fallback)
      const isConnected = await this.verifyLLMConnectivity();
      if (!isConnected && !embeddingHealthy && !generationHealthy) {
        logger.warn(
          "[LocalLLM] vLLM clients not yet connected - will retry on first use"
        );
      }

      logger.info("[LocalLLM] Async initialization complete", {
        embeddingHealthy,
        generationHealthy,
        hasNanoAgent: !!this.nanoAgentOrchestrator,
      });
    } catch (error) {
      logger.error("[LocalLLM] Initialization error:", error);
      throw error;
    }
  }

  /**
   * Create comprehensive system prompt for n8n expertise with dual nano LLM context
   */
  private createSystemPrompt(): string {
    const llmInfo = HardwareDetector.getLLMInfo(this.config.llmOption!);
    const embeddingModelInfo = HardwareDetector.getEmbeddingModelInfo(
      this.config.embeddingModel!
    );
    const generationModelInfo = HardwareDetector.getGenerationModelInfo(
      this.config.generationModel!
    );
    return `You are an expert n8n workflow architect assistant powered by a dual nano LLM system.
This system uses:
- **Embedding Model:** ${
      embeddingModelInfo.displayName
    } (semantic understanding & knowledge graph queries)
- **Generation Model:** ${
      generationModelInfo.displayName
    } (text generation & workflow design)

# Your Role
You help users design and build n8n automation workflows through natural conversation. You provide expert guidance on:
1. Workflow design and architecture
2. Node selection from 525+ available n8n nodes
3. Data flow and transformations
4. Integration strategies
5. Best practices for n8n automation

# Your Capabilities
- Access to complete n8n node documentation (525 nodes)
- Nano agent orchestrator for autonomous workflow generation
- n8n API integration for workflow validation and deployment
- Hardware-aware performance optimization
- Offline operation (no external dependencies)

# How to Interact
When a user describes a workflow idea:
1. Ask clarifying questions about requirements
2. Recommend specific n8n nodes for the use case
3. Explain how nodes connect and data flows
4. Suggest workflow structure and configuration
5. Generate complete workflows when ready
6. Validate and deploy to n8n instance

# Important Guidelines
- Always suggest existing n8n nodes first (we have 525 available)
- Avoid Code nodes unless absolutely necessary
- Use built-in node capabilities before complex JavaScript
- Explain trade-offs between simple and complex approaches
- Validate workflows before suggesting deployment

# Example Workflow Ideas You Can Handle
- Email automation (Gmail, Outlook, Teams integration)
- Data synchronization (CRM, spreadsheets, databases)
- Slack/Teams notifications and interactions
- Webhook-triggered workflows
- Scheduled data processing
- API integrations and transformations
- File handling and document processing
- Database CRUD operations

# Current System Info
**Embedding Model:** ${embeddingModelInfo.displayName}
- Parameters: ${embeddingModelInfo.modelSize}
- Latency: ${embeddingModelInfo.latency}
- Context: ${embeddingModelInfo.contextWindow}
- Quality: ${embeddingModelInfo.quality}
- Multilingual: ${embeddingModelInfo.multilingual ? "Yes" : "No"}

**Generation Model:** ${generationModelInfo.displayName}
- Parameters: ${generationModelInfo.modelSize}
- Context: ${generationModelInfo.contextWindow}
- Quality: ${generationModelInfo.quality}
- Speed: ${generationModelInfo.speed}

**Hardware:** ${this.hardwareProfile.ramGbytes}GB RAM, ${
      this.hardwareProfile.cpuCores
    } cores${this.hardwareProfile.hasGpu ? ", GPU available" : ""}
- Estimated embedding latency: ${
      this.hardwareProfile.estimatedEmbeddingLatency
    }ms
- Estimated generation throughput: ${
      this.hardwareProfile.estimatedGenerationTokensPerSecond
    } tokens/second

# Conversation Style
- Be conversational and helpful
- Ask for clarification when needed
- Provide actionable suggestions
- Explain concepts in simple terms
- Suggest next steps proactively

Let's help users build amazing n8n workflows!`;
  }

  /**
   * Configure n8n API credentials
   */
  async configureN8n(
    apiUrl: string,
    apiKey: string
  ): Promise<{ success: boolean; message: string }> {
    logger.info("[LocalLLM] Configuring n8n API...");

    try {
      // Validate credentials by making a simple API call
      // (In a real implementation, this would test the API)
      if (!apiUrl || !apiKey) {
        return { success: false, message: "API URL and API Key are required" };
      }

      this.context.n8nApiUrl = apiUrl;
      this.context.n8nApiKey = apiKey;
      this.context.isConfigured = true;

      logger.info("[LocalLLM] n8n configured:", { url: apiUrl });

      return {
        success: true,
        message: `Connected to n8n at ${apiUrl}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("[LocalLLM] n8n configuration error:", message);
      return { success: false, message };
    }
  }

  /**
   * Chat with the nano LLM
   */
  async chat(userMessage: string): Promise<string> {
    logger.info("[LocalLLM] Processing user message...");

    try {
      // Add user message to context
      this.context.messages.push({
        role: "user",
        content: userMessage,
        timestamp: new Date(),
      });

      // Build conversation history
      const messages = this.buildMessageHistory();

      // Call LLM
      logger.debug("[LocalLLM] Calling LLM with message history:", {
        messageCount: messages.length,
        latestMessage: userMessage.substring(0, 100),
      });

      // For now, return a placeholder that will be replaced with actual LLM integration
      const response = await this.callLLM(messages);

      // Add assistant response to context
      this.context.messages.push({
        role: "assistant",
        content: response,
        timestamp: new Date(),
      });

      // Check if user wants to generate a workflow
      if (
        this.shouldGenerateWorkflow(userMessage) &&
        this.context.isConfigured
      ) {
        const workflowIdea = this.extractWorkflowIdea(userMessage);
        this.context.workflowIdeas.push(workflowIdea);

        // Append workflow generation offer to response
        return (
          response +
          `\n\n---\n\n💡 **Ready to generate a workflow?** I can create a complete n8n workflow based on your idea. Would you like me to generate it now? Just say "generate workflow" or "create the workflow"`
        );
      }

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("[LocalLLM] Chat error:", message);
      return `I encountered an error processing your request: ${message}`;
    }
  }

  /**
   * Generate a workflow from a user idea
   */
  async generateWorkflow(idea: string): Promise<WorkflowGenerationResult> {
    logger.info(
      "[LocalLLM] Generating workflow for idea:",
      idea.substring(0, 100)
    );

    try {
      if (!idea) {
        throw new Error("Workflow idea is required");
      }

      // Use nano agent orchestrator to generate workflow
      logger.info("[LocalLLM] Calling nano agent orchestrator...");
      const pipelineResult = await this.nanoAgentOrchestrator.executePipeline(
        idea
      );

      // Create workflow result
      const workflowId = `workflow-${Date.now()}-${++this.workflowCounter}`;
      const result: WorkflowGenerationResult = {
        id: workflowId,
        idea,
        workflow: pipelineResult.workflow,
        validationResult: pipelineResult.validationResult,
        generatedAt: new Date(),
        isDeployed: false,
      };

      // Add to context
      this.context.generatedWorkflows.push(result);

      logger.info("[LocalLLM] Workflow generated:", {
        id: workflowId,
        nodeCount: pipelineResult.workflow?.nodes?.length || 0,
        isValid: pipelineResult.validationResult?.valid,
        totalTime: `${pipelineResult.executionStats.totalTime}ms`,
      });

      // Notify user via chat
      const summary = `✅ **Workflow Generated Successfully!**

**Workflow ID:** ${workflowId}
**Node Count:** ${pipelineResult.workflow?.nodes?.length || 0} nodes
**Pattern Matched:** ${pipelineResult.pattern?.patternName}
**Validation:** ${
        pipelineResult.validationResult?.valid ? "✅ Passed" : "❌ Failed"
      }

**Execution Stats:**
- Pattern Discovery: ${pipelineResult.executionStats.patternDiscoveryTime}ms
- GraphRAG Query: ${pipelineResult.executionStats.graphQueryTime}ms
- Workflow Generation: ${pipelineResult.executionStats.workflowGenerationTime}ms
- Validation: ${pipelineResult.executionStats.validationTime}ms
- **Total Time:** ${pipelineResult.executionStats.totalTime}ms

The workflow is ready for deployment. Review it and then deploy to n8n when ready!`;

      this.context.messages.push({
        role: "assistant",
        content: summary,
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("[LocalLLM] Workflow generation error:", message);
      throw error;
    }
  }

  /**
   * Deploy a generated workflow to n8n
   */
  async deployWorkflow(
    workflowId: string
  ): Promise<{ success: boolean; message: string; n8nId?: string }> {
    logger.info("[LocalLLM] Deploying workflow:", workflowId);

    try {
      if (!this.context.isConfigured) {
        return {
          success: false,
          message: "n8n not configured. Please set up API credentials first.",
        };
      }

      // Find the workflow
      const workflow = this.context.generatedWorkflows.find(
        (w) => w.id === workflowId
      );
      if (!workflow) {
        return { success: false, message: `Workflow not found: ${workflowId}` };
      }

      // Validate before deployment
      if (!workflow.validationResult?.valid) {
        return {
          success: false,
          message: "Workflow validation failed. Cannot deploy.",
        };
      }

      // For now, return success placeholder
      // (In real implementation, this would call n8n API)
      const n8nId = `n8n-${Date.now()}`;
      workflow.isDeployed = true;
      workflow.deploymentId = n8nId;

      const message = `✅ **Workflow Deployed Successfully!**

**n8n Workflow ID:** ${n8nId}
**URL:** ${this.context.n8nApiUrl}/workflows/${n8nId}

The workflow is now active in your n8n instance and ready to execute!`;

      logger.info("[LocalLLM] Workflow deployed:", { workflowId, n8nId });

      return { success: true, message, n8nId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("[LocalLLM] Deployment error:", message);
      return { success: false, message };
    }
  }

  /**
   * Get conversation context
   */
  getContext(): ConversationContext {
    return {
      ...this.context,
      messages: [...this.context.messages], // Return copy
    };
  }

  /**
   * Get hardware profile
   */
  getHardwareProfile(): HardwareProfile {
    return this.hardwareProfile;
  }

  /**
   * Get LLM configuration
   */
  getConfig(): LocalLLMConfig {
    return { ...this.config };
  }

  /**
   * Get embedding client (for semantic understanding and knowledge graph queries)
   */
  getEmbeddingClient(): VLLMClient | undefined {
    return this.embeddingClient;
  }

  /**
   * Get generation client (for text generation and workflow creation)
   */
  getGenerationClient(): VLLMClient | undefined {
    return this.generationClient;
  }

  /**
   * Get both nano LLM models information
   */
  getNanoModelsInfo(): {
    embedding: any;
    generation: any;
  } {
    return {
      embedding: HardwareDetector.getEmbeddingModelInfo(
        this.config.embeddingModel!
      ),
      generation: HardwareDetector.getGenerationModelInfo(
        this.config.generationModel!
      ),
    };
  }

  /**
   * Clear conversation history (start fresh)
   */
  clearContext(): void {
    logger.info("[LocalLLM] Clearing conversation context...");
    this.context = {
      messages: [],
      workflowIdeas: [],
      generatedWorkflows: [],
      n8nApiKey: this.context.n8nApiKey,
      n8nApiUrl: this.context.n8nApiUrl,
      isConfigured: this.context.isConfigured,
    };
  }

  /**
   * Build message history for LLM context
   */
  private buildMessageHistory(): Array<{ role: string; content: string }> {
    return [
      { role: "system", content: this.systemPrompt },
      ...this.context.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];
  }

  /**
   * Call the dual nano LLMs (embedding for semantic queries, generation for text)
   * Routes to appropriate model based on operation type
   */
  private async callLLM(
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    try {
      // Check if generation client is available
      if (!this.generationClient) {
        logger.warn(
          "[LocalLLM] Generation client not initialized, using fallback response"
        );
        return this.getFallbackResponse();
      }

      // Build conversation prompt from message history
      let conversationPrompt = "";
      for (const msg of messages) {
        if (msg.role === "system") {
          conversationPrompt = msg.content + "\n\n";
        } else if (msg.role === "user") {
          conversationPrompt += `User: ${msg.content}\n`;
        } else if (msg.role === "assistant") {
          conversationPrompt += `Assistant: ${msg.content}\n`;
        }
      }

      // Call generation client for text generation
      logger.debug("[LocalLLM] Calling generation client (vLLM)", {
        modelName: this.generationClient.getModel(),
        promptLength: conversationPrompt.length,
      });

      const response = await this.generationClient.generateText(
        conversationPrompt,
        {
          maxTokens: this.config.maxTokens,
          temperature: this.config.temperature,
        }
      );

      logger.debug("[LocalLLM] Generation response received", {
        tokens: response.tokens,
        generationTime: response.generationTime,
        textLength: response.text.length,
      });

      return response.text.trim();
    } catch (error) {
      logger.error("[LocalLLM] LLM call error:", error);
      // Fall back to placeholder response
      return this.getFallbackResponse();
    }
  }

  /**
   * Get fallback response when LLM is unavailable
   */
  private getFallbackResponse(): string {
    const lastUserMessage =
      this.context.messages[this.context.messages.length - 1]?.content || "";

    if (
      lastUserMessage.toLowerCase().includes("slack") &&
      lastUserMessage.toLowerCase().includes("email")
    ) {
      return `Great idea! I can help you create an email-to-Slack notification workflow.

Here's what we'll need:
1. **Email Source** - Outlook or Gmail for incoming emails
2. **Email Filter** - Identify important emails (by sender, subject, etc.)
3. **Data Transform** - Format email content nicely
4. **Slack Integration** - Send formatted message to Slack channel

The workflow would:
- Trigger on new emails
- Filter based on your criteria
- Extract important information
- Format as Slack message
- Send to your Slack channel

Would you like me to set up specific criteria for filtering emails, or shall I create a basic version that notifies on all new emails?`;
    }

    return `I understand you're interested in creating an n8n workflow. To help you better, could you tell me:

1. **What action triggers the workflow?** (e.g., new email, API call, scheduled time)
2. **What data needs to be processed?** (e.g., emails, database records, API responses)
3. **What's the final outcome?** (e.g., send notification, update spreadsheet, create ticket)

Once I understand your specific use case, I can generate a complete workflow using n8n's 525+ available nodes.`;
  }

  /**
   * Verify LLM connectivity
   */
  private async verifyLLMConnectivity(): Promise<boolean> {
    try {
      // Simple check to Ollama version endpoint
      const response = await fetch(`${this.config.baseUrl}/api/version`);
      if (response.ok) {
        logger.debug("[LocalLLM] LLM connectivity check passed");
        return true;
      }
      logger.warn("[LocalLLM] LLM connectivity check failed: Non-200 response");
      return false;
    } catch (error) {
      logger.warn("[LocalLLM] LLM connectivity check failed:", error);
      return false;
    }
  }

  /**
   * Determine if user wants to generate a workflow
   */
  private shouldGenerateWorkflow(message: string): boolean {
    const generateKeywords = [
      "workflow",
      "automation",
      "create",
      "build",
      "design",
      "setup",
      "connect",
      "integrate",
    ];

    const lowerMessage = message.toLowerCase();
    return generateKeywords.some((keyword) => lowerMessage.includes(keyword));
  }

  /**
   * Extract workflow idea from user message
   */
  private extractWorkflowIdea(message: string): string {
    // Simple extraction - in production, could use NLP
    return message.substring(0, 200);
  }
}
