/**
 * n8n Connector
 *
 * Stateless passthrough to n8n - NO local storage of workflows.
 * n8n is the ONLY source of truth for workflow data.
 *
 * All workflow operations go through the ValidationGateway first,
 * ensuring nothing broken reaches n8n.
 *
 * Key Principles:
 * 1. STATELESS - No workflow caching, no local storage
 * 2. VALIDATED - All writes pass through ValidationGateway
 * 3. PASSTHROUGH - Read operations go directly to n8n
 * 4. LIVE - Node catalog synced from n8n on connect
 */

import axios, { AxiosInstance } from "axios";
import { logger } from "../utils/logger";
import { EventEmitter } from "events";
import { NodeCatalog, initNodeCatalog, getNodeCatalog } from "./node-catalog";
import {
  ValidationGateway,
  ValidationResult,
  initValidationGateway,
  GatewayConfig,
} from "./validation-gateway";

// ============================================================================
// TYPES
// ============================================================================

export interface Workflow {
  id?: string;
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, any>;
  settings?: Record<string, any>;
  staticData?: any;
  pinData?: Record<string, any>;
  tags?: any[];
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  versionId?: string;
}

export interface WorkflowNode {
  id?: string;
  name: string;
  type: string;
  typeVersion?: number;
  position?: [number, number] | { x: number; y: number };
  parameters?: Record<string, any>;
  credentials?: Record<string, any>;
  disabled?: boolean;
}

export interface Execution {
  id: string;
  workflowId: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt?: string;
  status: "running" | "success" | "error" | "waiting" | "canceled";
  data?: any;
  retryOf?: string;
  retrySuccessId?: string;
}

export interface Credential {
  id: string;
  name: string;
  type: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConnectorConfig {
  n8nUrl: string;
  apiKey: string;
  timeout?: number;
  validationConfig?: GatewayConfig;
}

export interface ConnectorStats {
  connected: boolean;
  n8nVersion: string | null;
  nodeCount: number;
  credentialTypeCount: number;
  lastSync: Date | null;
  validationEnabled: boolean;
}

// ============================================================================
// N8N CONNECTOR CLASS
// ============================================================================

export class N8nConnector extends EventEmitter {
  private client: AxiosInstance;
  private nodeCatalog: NodeCatalog | null = null;
  private validationGateway: ValidationGateway | null = null;
  private isConnected: boolean = false;
  private n8nVersion: string | null = null;
  private config: ConnectorConfig;

  constructor(config: ConnectorConfig) {
    super();
    this.config = config;

    // Normalize URL
    const baseUrl = config.n8nUrl.endsWith("/")
      ? config.n8nUrl.slice(0, -1)
      : config.n8nUrl;
    const apiUrl = `${baseUrl}/api/v1`;

    this.client = axios.create({
      baseURL: apiUrl,
      timeout: config.timeout || 30000,
      headers: {
        "X-N8N-API-KEY": config.apiKey,
        "Content-Type": "application/json",
      },
    });

    logger.info("[N8nConnector] Initialized for:", baseUrl);
  }

  // ==========================================================================
  // CONNECTION LIFECYCLE
  // ==========================================================================

  /**
   * Connect to n8n and initialize all components
   * - Syncs node catalog from n8n
   * - Initializes validation gateway
   * - Starts periodic sync
   */
  async connect(): Promise<boolean> {
    logger.info("[N8nConnector] Connecting to n8n...");

    try {
      // 1. Health check
      const health = await this.healthCheck();
      if (!health.ok) {
        logger.error("[N8nConnector] n8n not reachable:", health.error);
        return false;
      }
      this.n8nVersion = health.version || null;
      logger.info(
        `[N8nConnector] n8n version: ${this.n8nVersion || "unknown"}`
      );

      // 2. Initialize node catalog
      this.nodeCatalog = getNodeCatalog(
        this.config.n8nUrl,
        this.config.apiKey
      );

      // 2a. Try session authentication for internal endpoints (optional)
      // This enables access to /types/nodes.json which provides the full node catalog
      if (process.env.N8N_USERNAME && process.env.N8N_PASSWORD) {
        try {
          const sessionSuccess =
            await this.nodeCatalog.initializeSessionAuth();
          if (sessionSuccess) {
            logger.info(
              "[N8nConnector] Session auth enabled - full node catalog available"
            );
          }
        } catch (sessionError: any) {
          logger.debug(
            "[N8nConnector] Session auth not available:",
            sessionError.message
          );
        }
      }

      // 2b. Connect and sync node catalog from n8n
      try {
        await this.nodeCatalog.connect();
      } catch (catalogError: any) {
        logger.warn(
          "[N8nConnector] NodeCatalog sync failed, continuing with empty catalog:",
          catalogError.message
        );
        // Continue with potentially empty catalog - graceful degradation
      }

      // 3. Initialize validation gateway
      this.validationGateway = initValidationGateway(
        this.nodeCatalog!, // Non-null assertion: set in try or catch above
        this.config.n8nUrl,
        this.config.apiKey,
        this.config.validationConfig
      );

      // 4. Set up event forwarding (null-safe)
      if (this.nodeCatalog) {
        this.nodeCatalog.on("synced", (stats) =>
          this.emit("catalogSynced", stats)
        );
        this.nodeCatalog.on("error", (err) => this.emit("catalogError", err));
      }
      this.validationGateway.on("validationFailed", (result) =>
        this.emit("validationFailed", result)
      );

      this.isConnected = true;
      this.emit("connected", this.getStats());

      logger.info("[N8nConnector] ✅ Connected successfully");
      return true;
    } catch (error: any) {
      logger.error("[N8nConnector] Connection failed:", error.message);
      this.isConnected = false;
      this.emit("error", error);
      return false;
    }
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.nodeCatalog) {
      this.nodeCatalog.disconnect();
    }
    this.isConnected = false;
    this.emit("disconnected");
    logger.info("[N8nConnector] Disconnected");
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected && this.nodeCatalog?.isReady() === true;
  }

  /**
   * Get connector statistics
   */
  getStats(): ConnectorStats {
    const catalogStats = this.nodeCatalog?.getStats();
    return {
      connected: this.isConnected,
      n8nVersion: this.n8nVersion,
      nodeCount: catalogStats?.totalNodes || 0,
      credentialTypeCount: catalogStats?.totalCredentialTypes || 0,
      lastSync: catalogStats?.lastSyncTime || null,
      validationEnabled: !!this.validationGateway,
    };
  }

  /**
   * Health check for n8n
   */
  async healthCheck(): Promise<{
    ok: boolean;
    version?: string;
    error?: string;
  }> {
    try {
      // Try the health endpoint
      const response = await this.client.get("/health");
      return { ok: true, version: response.data?.version };
    } catch (error) {
      // Fallback: try listing workflows
      try {
        const response = await this.client.get("/workflows", {
          params: { limit: 1 },
        });
        return { ok: true };
      } catch (fallbackError: any) {
        return { ok: false, error: fallbackError.message };
      }
    }
  }

  // ==========================================================================
  // WORKFLOW CRUD (STATELESS PASSTHROUGH WITH VALIDATION)
  // ==========================================================================

  /**
   * Create a workflow in n8n
   * VALIDATES before sending - will reject broken workflows
   */
  async createWorkflow(workflow: Partial<Workflow>): Promise<{
    success: boolean;
    workflow?: Workflow;
    validation?: ValidationResult;
    error?: string;
  }> {
    logger.info(`[N8nConnector] Creating workflow: ${workflow.name}`);

    // Validate first!
    if (this.validationGateway) {
      const validation = await this.validationGateway.validate(workflow);

      if (!validation.valid) {
        logger.warn(
          "[N8nConnector] Workflow validation failed:",
          validation.errors
        );
        return {
          success: false,
          validation,
          error: `Validation failed: ${validation.errors
            .map((e) => e.message)
            .join("; ")}`,
        };
      }
    }

    try {
      // Clean workflow for n8n API
      const cleanedWorkflow = this.cleanWorkflowForCreate(workflow);

      const response = await this.client.post("/workflows", cleanedWorkflow);
      const createdWorkflow = response.data;

      logger.info(`[N8nConnector] ✅ Created workflow: ${createdWorkflow.id}`);
      this.emit("workflowCreated", createdWorkflow);

      return { success: true, workflow: createdWorkflow };
    } catch (error: any) {
      const errorMsg = this.extractError(error);
      logger.error("[N8nConnector] Create workflow failed:", errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get a workflow from n8n (direct passthrough)
   */
  async getWorkflow(id: string): Promise<Workflow | null> {
    try {
      const response = await this.client.get(`/workflows/${id}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update a workflow in n8n
   * VALIDATES before sending - will reject broken workflows
   */
  async updateWorkflow(
    id: string,
    workflow: Partial<Workflow>
  ): Promise<{
    success: boolean;
    workflow?: Workflow;
    validation?: ValidationResult;
    error?: string;
  }> {
    logger.info(`[N8nConnector] Updating workflow: ${id}`);

    // Validate first!
    if (this.validationGateway) {
      const validation = await this.validationGateway.validate(workflow);

      if (!validation.valid) {
        logger.warn(
          "[N8nConnector] Workflow validation failed:",
          validation.errors
        );
        return {
          success: false,
          validation,
          error: `Validation failed: ${validation.errors
            .map((e) => e.message)
            .join("; ")}`,
        };
      }
    }

    try {
      const cleanedWorkflow = this.cleanWorkflowForUpdate(workflow);

      // Try PUT first, fallback to PATCH
      let response;
      try {
        response = await this.client.put(`/workflows/${id}`, cleanedWorkflow);
      } catch (putError: any) {
        if (putError.response?.status === 405) {
          response = await this.client.patch(
            `/workflows/${id}`,
            cleanedWorkflow
          );
        } else {
          throw putError;
        }
      }

      const updatedWorkflow = response.data;
      logger.info(`[N8nConnector] ✅ Updated workflow: ${id}`);
      this.emit("workflowUpdated", updatedWorkflow);

      return { success: true, workflow: updatedWorkflow };
    } catch (error: any) {
      const errorMsg = this.extractError(error);
      logger.error("[N8nConnector] Update workflow failed:", errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Delete a workflow from n8n (direct passthrough)
   */
  async deleteWorkflow(id: string): Promise<boolean> {
    try {
      await this.client.delete(`/workflows/${id}`);
      logger.info(`[N8nConnector] Deleted workflow: ${id}`);
      this.emit("workflowDeleted", { id });
      return true;
    } catch (error: any) {
      logger.error(
        "[N8nConnector] Delete workflow failed:",
        this.extractError(error)
      );
      return false;
    }
  }

  /**
   * List all workflows (direct passthrough)
   */
  async listWorkflows(params?: {
    active?: boolean;
    tags?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ data: Workflow[]; nextCursor?: string }> {
    try {
      const response = await this.client.get("/workflows", { params });
      return response.data;
    } catch (error: any) {
      logger.error(
        "[N8nConnector] List workflows failed:",
        this.extractError(error)
      );
      return { data: [] };
    }
  }

  /**
   * Activate/deactivate a workflow
   */
  async setWorkflowActive(id: string, active: boolean): Promise<boolean> {
    try {
      await this.client.patch(`/workflows/${id}`, { active });
      logger.info(
        `[N8nConnector] Workflow ${id} ${active ? "activated" : "deactivated"}`
      );
      return true;
    } catch (error: any) {
      logger.error(
        "[N8nConnector] Set workflow active failed:",
        this.extractError(error)
      );
      return false;
    }
  }

  // ==========================================================================
  // EXECUTION MANAGEMENT (DIRECT PASSTHROUGH)
  // ==========================================================================

  /**
   * Execute a workflow directly
   */
  async executeWorkflow(id: string, data?: any): Promise<Execution | null> {
    try {
      const response = await this.client.post(
        `/workflows/${id}/run`,
        data || {}
      );
      return response.data;
    } catch (error: any) {
      logger.error(
        "[N8nConnector] Execute workflow failed:",
        this.extractError(error)
      );
      return null;
    }
  }

  /**
   * Trigger a webhook workflow
   */
  async triggerWebhook(
    webhookUrl: string,
    data?: any,
    method: string = "POST"
  ): Promise<any> {
    try {
      const response = await axios({
        method: method as any,
        url: webhookUrl,
        data: method !== "GET" ? data : undefined,
        params: method === "GET" ? data : undefined,
        timeout: 120000, // Webhooks may take longer
      });
      return response.data;
    } catch (error: any) {
      logger.error(
        "[N8nConnector] Trigger webhook failed:",
        this.extractError(error)
      );
      throw error;
    }
  }

  /**
   * Get execution details
   */
  async getExecution(
    id: string,
    includeData: boolean = false
  ): Promise<Execution | null> {
    try {
      const response = await this.client.get(`/executions/${id}`, {
        params: { includeData },
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List executions
   */
  async listExecutions(params?: {
    workflowId?: string;
    status?: "running" | "success" | "error" | "waiting";
    limit?: number;
    cursor?: string;
  }): Promise<{ data: Execution[]; nextCursor?: string }> {
    try {
      const response = await this.client.get("/executions", { params });
      return response.data;
    } catch (error: any) {
      logger.error(
        "[N8nConnector] List executions failed:",
        this.extractError(error)
      );
      return { data: [] };
    }
  }

  /**
   * Stop a running execution
   */
  async stopExecution(id: string): Promise<boolean> {
    try {
      await this.client.post(`/executions/${id}/stop`);
      logger.info(`[N8nConnector] Stopped execution: ${id}`);
      return true;
    } catch (error: any) {
      logger.error(
        "[N8nConnector] Stop execution failed:",
        this.extractError(error)
      );
      return false;
    }
  }

  // ==========================================================================
  // CREDENTIAL MANAGEMENT (DIRECT PASSTHROUGH)
  // ==========================================================================

  /**
   * List available credentials
   */
  async listCredentials(params?: {
    type?: string;
    limit?: number;
  }): Promise<Credential[]> {
    try {
      const response = await this.client.get("/credentials", { params });
      return response.data?.data || [];
    } catch (error: any) {
      logger.error(
        "[N8nConnector] List credentials failed:",
        this.extractError(error)
      );
      return [];
    }
  }

  /**
   * Get credential by ID
   */
  async getCredential(id: string): Promise<Credential | null> {
    try {
      const response = await this.client.get(`/credentials/${id}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  // ==========================================================================
  // NODE CATALOG ACCESS
  // ==========================================================================

  /**
   * Get the node catalog
   */
  getNodeCatalog(): NodeCatalog | null {
    return this.nodeCatalog;
  }

  /**
   * Get the validation gateway
   */
  getValidationGateway(): ValidationGateway | null {
    return this.validationGateway;
  }

  /**
   * Check if a node type exists
   */
  hasNodeType(nodeType: string): boolean {
    return this.nodeCatalog?.hasNode(nodeType) || false;
  }

  /**
   * Search for nodes
   */
  searchNodes(query: string): any[] {
    return this.nodeCatalog?.searchNodes(query) || [];
  }

  /**
   * Force a catalog resync
   */
  async resyncCatalog(): Promise<void> {
    await this.nodeCatalog?.forceSync();
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate a workflow without sending to n8n
   */
  async validateWorkflow(
    workflow: Partial<Workflow>
  ): Promise<ValidationResult | null> {
    if (!this.validationGateway) {
      return null;
    }
    return this.validationGateway.validate(workflow);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Clean workflow for n8n create API
   * Removes read-only fields that n8n rejects
   */
  private cleanWorkflowForCreate(workflow: Partial<Workflow>): any {
    const { id, createdAt, updatedAt, versionId, active, ...clean } =
      workflow as any;
    return clean;
  }

  /**
   * Clean workflow for n8n update API
   */
  private cleanWorkflowForUpdate(workflow: Partial<Workflow>): any {
    const { id, createdAt, updatedAt, versionId, ...clean } = workflow as any;
    return clean;
  }

  /**
   * Extract error message from axios error
   */
  private extractError(error: any): string {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.response?.data?.error?.message) {
      return error.response.data.error.message;
    }
    if (error.message) {
      return error.message;
    }
    return "Unknown error";
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let connectorInstance: N8nConnector | null = null;

/**
 * Get or create the global N8nConnector instance
 */
export function getN8nConnector(): N8nConnector {
  if (!connectorInstance) {
    const n8nUrl = process.env.N8N_API_URL || "http://localhost:5678";
    const apiKey = process.env.N8N_API_KEY || "";

    connectorInstance = new N8nConnector({ n8nUrl, apiKey });
  }
  return connectorInstance;
}

/**
 * Initialize and connect (call on startup)
 */
export async function initN8nConnector(
  config?: ConnectorConfig
): Promise<N8nConnector> {
  const finalConfig = config || {
    n8nUrl: process.env.N8N_API_URL || "http://localhost:5678",
    apiKey: process.env.N8N_API_KEY || "",
  };

  connectorInstance = new N8nConnector(finalConfig);
  await connectorInstance.connect();
  return connectorInstance;
}
