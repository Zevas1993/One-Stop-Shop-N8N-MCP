/**
 * Core Module
 * 
 * The heart of the n8n Co-Pilot MCP Server.
 * Exports all core components and provides unified initialization.
 * 
 * Architecture:
 * - N8nConnector: Stateless passthrough to n8n (source of truth)
 * - NodeCatalog: Live node sync from n8n instance
 * - ValidationGateway: Bulletproof validation (blocks broken workflows)
 * - LLMBrain: Embedded intelligence for semantic validation & chat
 */

import { logger } from '../utils/logger';
import { N8nConnector, initN8nConnector, getN8nConnector, ConnectorConfig } from './n8n-connector';
import { NodeCatalog, getNodeCatalog } from './node-catalog';
import { ValidationGateway, getValidationGateway, GatewayConfig } from './validation-gateway';
import { LLMBrain, initLLMBrain, getLLMBrain, LLMConfig } from './llm-brain';
import { EventEmitter } from 'events';

// Re-export all types
export * from './n8n-connector';
export * from './node-catalog';
export * from './validation-gateway';
export * from './llm-brain';

// ============================================================================
// CORE CONFIG
// ============================================================================

export interface CoreConfig {
  // n8n connection
  n8nUrl: string;
  n8nApiKey: string;
  
  // Validation settings
  enableDryRun?: boolean;           // Test workflows in n8n before accepting
  enableSemanticCheck?: boolean;    // Use LLM for semantic validation
  strictMode?: boolean;             // Fail on warnings too
  
  // LLM settings
  ollamaUrl?: string;               // Ollama URL (default: http://localhost:11434)
  embeddingModel?: string;          // Override auto-detected embedding model
  generationModel?: string;         // Override auto-detected generation model
  
  // Other settings
  autoSyncInterval?: number;        // Node catalog sync interval in ms (default: 5 min)
}

export interface CoreStatus {
  initialized: boolean;
  n8nConnected: boolean;
  n8nVersion: string | null;
  nodeCount: number;
  credentialTypeCount: number;
  llmAvailable: boolean;
  lastSync: Date | null;
  validationEnabled: boolean;
}

// ============================================================================
// CORE ORCHESTRATOR
// ============================================================================

/**
 * Core Orchestrator
 * 
 * Main entry point for the n8n Co-Pilot system.
 * Initializes and coordinates all core components.
 */
export class CoreOrchestrator extends EventEmitter {
  private connector: N8nConnector | null = null;
  private nodeCatalog: NodeCatalog | null = null;
  private validationGateway: ValidationGateway | null = null;
  private llmBrain: LLMBrain | null = null;
  private config: CoreConfig;
  private isInitialized: boolean = false;

  constructor(config: CoreConfig) {
    super();
    this.config = config;
    logger.info('[Core] Orchestrator created');
  }

  /**
   * Initialize all core components
   * Call this on startup
   */
  async initialize(): Promise<boolean> {
    logger.info('[Core] Initializing n8n Co-Pilot...');
    const startTime = Date.now();

    try {
      // 1. Initialize n8n Connector (includes NodeCatalog and ValidationGateway)
      logger.info('[Core] Step 1/3: Connecting to n8n...');
      this.connector = await initN8nConnector({
        n8nUrl: this.config.n8nUrl,
        apiKey: this.config.n8nApiKey,
        validationConfig: {
          enableDryRun: this.config.enableDryRun ?? true,
          enableSemanticCheck: false, // Will enable after LLM is ready
          strictMode: this.config.strictMode ?? false,
        },
      });

      if (!this.connector.isReady()) {
        logger.error('[Core] Failed to connect to n8n');
        return false;
      }

      this.nodeCatalog = this.connector.getNodeCatalog();
      this.validationGateway = this.connector.getValidationGateway();

      // 2. Initialize LLM Brain (optional - continues without if unavailable)
      logger.info('[Core] Step 2/3: Initializing LLM brain...');
      try {
        this.llmBrain = await initLLMBrain({
          ollamaUrl: this.config.ollamaUrl,
          embeddingModel: this.config.embeddingModel,
          generationModel: this.config.generationModel,
        });

        // Connect LLM to validation gateway for semantic checks
        if (this.llmBrain.isInitialized() && this.validationGateway) {
          this.validationGateway.setLLMBrain(this.llmBrain);
          logger.info('[Core] LLM brain connected to validation gateway');
        }
      } catch (llmError: any) {
        logger.warn('[Core] LLM brain not available:', llmError.message);
        logger.warn('[Core] Continuing without LLM features...');
      }

      // 3. Set up event forwarding
      logger.info('[Core] Step 3/3: Setting up event handlers...');
      this.setupEventHandlers();

      // Done!
      const duration = Date.now() - startTime;
      this.isInitialized = true;
      
      const status = this.getStatus();
      logger.info('[Core] ✅ Initialization complete:', {
        duration: `${duration}ms`,
        n8nVersion: status.n8nVersion,
        nodeCount: status.nodeCount,
        llmAvailable: status.llmAvailable,
      });

      this.emit('ready', status);
      return true;

    } catch (error: any) {
      logger.error('[Core] Initialization failed:', error.message);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Shutdown gracefully
   */
  shutdown(): void {
    logger.info('[Core] Shutting down...');
    
    if (this.connector) {
      this.connector.disconnect();
    }
    
    this.isInitialized = false;
    this.emit('shutdown');
    logger.info('[Core] Shutdown complete');
  }

  /**
   * Get current status
   */
  getStatus(): CoreStatus {
    const connectorStats = this.connector?.getStats();
    
    return {
      initialized: this.isInitialized,
      n8nConnected: connectorStats?.connected ?? false,
      n8nVersion: connectorStats?.n8nVersion ?? null,
      nodeCount: connectorStats?.nodeCount ?? 0,
      credentialTypeCount: connectorStats?.credentialTypeCount ?? 0,
      llmAvailable: this.llmBrain?.isInitialized() ?? false,
      lastSync: connectorStats?.lastSync ?? null,
      validationEnabled: !!this.validationGateway,
    };
  }

  /**
   * Check if ready
   */
  isReady(): boolean {
    return this.isInitialized && (this.connector?.isReady() ?? false);
  }

  // ==========================================================================
  // COMPONENT ACCESSORS
  // ==========================================================================

  getConnector(): N8nConnector {
    if (!this.connector) {
      throw new Error('Core not initialized - call initialize() first');
    }
    return this.connector;
  }

  getNodeCatalog(): NodeCatalog {
    if (!this.nodeCatalog) {
      throw new Error('Core not initialized - call initialize() first');
    }
    return this.nodeCatalog;
  }

  getValidationGateway(): ValidationGateway {
    if (!this.validationGateway) {
      throw new Error('Core not initialized - call initialize() first');
    }
    return this.validationGateway;
  }

  getLLMBrain(): LLMBrain | null {
    return this.llmBrain;
  }

  // ==========================================================================
  // CONVENIENCE METHODS
  // ==========================================================================

  /**
   * Create a workflow (validated and sent to n8n)
   */
  async createWorkflow(workflow: any) {
    return this.getConnector().createWorkflow(workflow);
  }

  /**
   * Get a workflow from n8n
   */
  async getWorkflow(id: string) {
    return this.getConnector().getWorkflow(id);
  }

  /**
   * Update a workflow (validated and sent to n8n)
   */
  async updateWorkflow(id: string, workflow: any) {
    return this.getConnector().updateWorkflow(id, workflow);
  }

  /**
   * Validate a workflow (without sending to n8n)
   */
  async validateWorkflow(workflow: any) {
    return this.getConnector().validateWorkflow(workflow);
  }

  /**
   * Chat with the LLM assistant
   */
  async chat(message: string) {
    if (!this.llmBrain) {
      return { message: 'LLM not available' };
    }
    return this.llmBrain.chat(message);
  }

  /**
   * Search for nodes
   */
  searchNodes(query: string) {
    return this.getNodeCatalog().searchNodes(query);
  }

  /**
   * Check if a node type exists
   */
  hasNode(nodeType: string) {
    return this.getNodeCatalog().hasNode(nodeType);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private setupEventHandlers(): void {
    if (this.connector) {
      this.connector.on('catalogSynced', (stats) => this.emit('catalogSynced', stats));
      this.connector.on('validationFailed', (result) => this.emit('validationFailed', result));
      this.connector.on('workflowCreated', (wf) => this.emit('workflowCreated', wf));
      this.connector.on('workflowUpdated', (wf) => this.emit('workflowUpdated', wf));
      this.connector.on('workflowDeleted', (info) => this.emit('workflowDeleted', info));
    }

    if (this.llmBrain) {
      this.llmBrain.on('ready', () => this.emit('llmReady'));
    }
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

let coreInstance: CoreOrchestrator | null = null;

/**
 * Get or create the global Core instance
 */
export function getCore(): CoreOrchestrator {
  if (!coreInstance) {
    throw new Error('Core not initialized - call initCore() first');
  }
  return coreInstance;
}

/**
 * Initialize the Core (call once on startup)
 */
export async function initCore(config?: Partial<CoreConfig>): Promise<CoreOrchestrator> {
  const finalConfig: CoreConfig = {
    n8nUrl: config?.n8nUrl || process.env.N8N_API_URL || 'http://localhost:5678',
    n8nApiKey: config?.n8nApiKey || process.env.N8N_API_KEY || '',
    enableDryRun: config?.enableDryRun ?? true,
    enableSemanticCheck: config?.enableSemanticCheck ?? true,
    strictMode: config?.strictMode ?? false,
    ollamaUrl: config?.ollamaUrl || process.env.OLLAMA_URL || 'http://localhost:11434',
    embeddingModel: config?.embeddingModel,
    generationModel: config?.generationModel,
    autoSyncInterval: config?.autoSyncInterval,
  };

  coreInstance = new CoreOrchestrator(finalConfig);
  await coreInstance.initialize();
  return coreInstance;
}

/**
 * Quick access to check if initialized
 */
export function isCoreReady(): boolean {
  return coreInstance?.isReady() ?? false;
}
