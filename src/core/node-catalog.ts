/**
 * Live Node Catalog
 *
 * Syncs available node types directly from the connected n8n instance.
 * NO local storage - n8n is the source of truth.
 *
 * Key insight: n8n has an undocumented endpoint GET /types/nodes.json
 * that returns all available node types with their full schemas.
 */

import axios, { AxiosInstance } from "axios";
import { logger } from "../utils/logger";
import { EventEmitter } from "events";
import { NodeFilter } from "./node-filter";
import { N8nSessionManager } from "../services/n8n-session-manager";

// ============================================================================
// TYPES
// ============================================================================

export interface NodeTypeInfo {
  name: string; // e.g., "n8n-nodes-base.httpRequest"
  displayName: string; // e.g., "HTTP Request"
  description: string;
  version: number | number[]; // Current version(s)
  defaults: Record<string, any>;
  inputs: string[];
  outputs: string[];
  properties: NodeProperty[];
  credentials?: CredentialRequirement[];
  group: string[]; // e.g., ["transform", "output"]
  codex?: {
    // AI/documentation metadata
    categories?: string[];
    subcategories?: Record<string, string[]>;
    alias?: string[];
  };
}

export interface NodeProperty {
  displayName: string;
  name: string;
  type: string; // 'string' | 'number' | 'boolean' | 'options' | etc.
  default?: any;
  required?: boolean;
  description?: string;
  options?: Array<{ name: string; value: any; description?: string }>;
  displayOptions?: {
    show?: Record<string, any[]>;
    hide?: Record<string, any[]>;
  };
}

export interface CredentialRequirement {
  name: string; // e.g., "httpBasicAuth"
  required?: boolean;
  displayName?: string;
}

export interface CredentialTypeInfo {
  name: string;
  displayName: string;
  properties: NodeProperty[];
  authenticate?: any;
}

export interface CatalogStats {
  totalNodes: number;
  totalCredentialTypes: number;
  triggerNodes: number;
  actionNodes: number;
  aiNodes: number;
  lastSyncTime: Date | null;
  n8nVersion: string | null;
  syncSource: "live" | "cache" | "none";
}

// ============================================================================
// NODE CATALOG CLASS
// ============================================================================

export class NodeCatalog extends EventEmitter {
  private client: AxiosInstance;
  private nodeTypes: Map<string, NodeTypeInfo> = new Map();
  private credentialTypes: Map<string, CredentialTypeInfo> = new Map();
  private lastSync: Date | null = null;
  private n8nVersion: string | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private sessionManager: N8nSessionManager | null = null;

  // Sync settings
  private readonly SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly SYNC_TIMEOUT_MS = 30000; // 30 seconds

  constructor(private n8nUrl: string, private apiKey: string) {
    super();

    // Normalize URL
    const baseUrl = n8nUrl.endsWith("/") ? n8nUrl.slice(0, -1) : n8nUrl;

    this.client = axios.create({
      baseURL: baseUrl,
      timeout: this.SYNC_TIMEOUT_MS,
      headers: {
        "X-N8N-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
    });

    logger.info("[NodeCatalog] Initialized for n8n instance:", baseUrl);
  }

  // ==========================================================================
  // CONNECTION & SYNC
  // ==========================================================================

  /**
   * Connect to n8n and perform initial sync
   * Call this on startup - it will auto-refresh periodically
   */
  async connect(): Promise<boolean> {
    try {
      logger.info("[NodeCatalog] Connecting to n8n instance...");

      // 1. Health check
      const health = await this.healthCheck();
      if (!health.ok) {
        logger.error("[NodeCatalog] n8n health check failed:", health.error);
        return false;
      }

      this.n8nVersion = health.version || null;
      logger.info(
        `[NodeCatalog] Connected to n8n ${this.n8nVersion || "unknown version"}`
      );

      // 2. Initial sync
      await this.syncFromN8n();

      // 3. Start periodic sync
      this.startPeriodicSync();

      this.isConnected = true;
      this.emit("connected", {
        version: this.n8nVersion,
        nodeCount: this.nodeTypes.size,
      });

      return true;
    } catch (error) {
      logger.error("[NodeCatalog] Failed to connect:", error);
      this.isConnected = false;
      this.emit("error", error);
      return false;
    }
  }

  /**
   * Disconnect and stop syncing
   */
  disconnect(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isConnected = false;
    this.emit("disconnected");
    logger.info("[NodeCatalog] Disconnected from n8n");
  }

  /**
   * Health check for n8n instance
   */
  private async healthCheck(): Promise<{
    ok: boolean;
    version?: string;
    error?: string;
  }> {
    try {
      // Try the health endpoint first
      const response = await this.client.get("/healthz");
      return { ok: true, version: response.data?.version };
    } catch (error) {
      // Fallback: try listing workflows
      try {
        await this.client.get("/api/v1/workflows", { params: { limit: 1 } });
        return { ok: true };
      } catch (fallbackError: any) {
        return { ok: false, error: fallbackError.message };
      }
    }
  }

  /**
   * Initialize session-based authentication for internal endpoints
   * This enables access to /types/nodes.json which provides the full node catalog
   */
  async initializeSessionAuth(): Promise<boolean> {
    const username = process.env.N8N_USERNAME;
    const password = process.env.N8N_PASSWORD;

    if (!username || !password) {
      logger.debug(
        "[NodeCatalog] Session auth disabled (N8N_USERNAME/PASSWORD not set)"
      );
      return false;
    }

    try {
      this.sessionManager = new N8nSessionManager({
        n8nUrl: this.n8nUrl,
        username,
        password,
      });

      const success = await this.sessionManager.login();

      if (success) {
        logger.info(
          "[NodeCatalog] Session authentication enabled for internal endpoints"
        );
      }

      return success;
    } catch (error: any) {
      logger.warn(
        "[NodeCatalog] Session auth initialization failed:",
        error.message
      );
      this.sessionManager = null;
      return false;
    }
  }

  /**
   * Sync node catalog from live n8n instance
   * This is the core sync method - fetches all node types directly from n8n
   *
   * Priority order:
   * 1. Session-authenticated /types/nodes.json (full catalog)
   * 2. API-key /types/nodes.json (usually fails with 401)
   * 3. API-key /rest/node-types (fallback)
   * 4. Extract from existing workflows (last resort)
   */
  async syncFromN8n(): Promise<void> {
    const startTime = Date.now();
    logger.info("[NodeCatalog] Syncing node catalog from n8n...");

    try {
      let nodesData: any[] = [];

      // Method 1: Try session-authenticated /types/nodes.json (best - full catalog)
      if (this.sessionManager?.isSessionValid()) {
        try {
          nodesData = await this.sessionManager.requestInternal(
            "/types/nodes.json"
          );
          logger.info(
            `[NodeCatalog] Got ${nodesData?.length || 0} nodes via session auth /types/nodes.json`
          );
        } catch (error: any) {
          logger.debug(
            "[NodeCatalog] Session auth /types/nodes.json failed:",
            error.message
          );
          nodesData = [];
        }
      }

      // Method 2: Try API-key /types/nodes.json (usually returns 401)
      if (!nodesData || nodesData.length === 0) {
        try {
          const response = await this.client.get("/types/nodes.json");
          nodesData = response.data || [];
          logger.debug(
            `[NodeCatalog] Got ${nodesData.length} nodes from /types/nodes.json`
          );
        } catch (error) {
          logger.debug(
            "[NodeCatalog] /types/nodes.json not available, trying alternative..."
          );
        }
      }

      // Method 3: Try API-key /rest/node-types (fallback)
      if (!nodesData || nodesData.length === 0) {
        try {
          const response = await this.client.get("/rest/node-types");
          nodesData = response.data?.data || response.data || [];
          logger.debug(
            `[NodeCatalog] Got ${nodesData.length} nodes from /rest/node-types`
          );
        } catch (error2) {
          logger.debug(
            "[NodeCatalog] /rest/node-types not available, trying workflow extraction..."
          );
        }
      }

      // Method 4: Extract from existing workflows (last resort)
      if (!nodesData || nodesData.length === 0) {
        nodesData = await this.extractNodesFromWorkflows();
      }

      // Parse and store node types
      this.nodeTypes.clear();
      const nodeFilter = NodeFilter.getInstance();
      let skippedCount = 0;

      for (const node of nodesData) {
        const nodeInfo = this.parseNodeType(node);
        if (nodeInfo) {
          // Apply Node Restrictions
          if (nodeFilter.isNodeAllowed(nodeInfo.name)) {
            this.nodeTypes.set(nodeInfo.name, nodeInfo);
          } else {
            skippedCount++;
          }
        }
      }

      if (skippedCount > 0) {
        logger.info(
          `[NodeCatalog] Skipped ${skippedCount} nodes due to restrictions (ALLOW_COMMUNITY_NODES=${process.env.ALLOW_COMMUNITY_NODES})`
        );
      }

      // Sync credential types
      await this.syncCredentialTypes();

      this.lastSync = new Date();
      const duration = Date.now() - startTime;

      logger.info(
        `[NodeCatalog] Sync complete: ${this.nodeTypes.size} nodes, ${this.credentialTypes.size} credential types (${duration}ms)`
      );

      this.emit("synced", this.getStats());
    } catch (error) {
      logger.error("[NodeCatalog] Sync failed:", error);
      this.emit("syncError", error);
      // Do NOT throw - allow the connector to continue with an empty catalog
      // This enables graceful degradation when n8n node endpoints are unavailable
    }
  }

  /**
   * Extract node types from existing workflows (fallback method)
   */
  private async extractNodesFromWorkflows(): Promise<any[]> {
    logger.info(
      "[NodeCatalog] Extracting node types from existing workflows..."
    );

    const seenNodeTypes = new Map<string, any>();

    try {
      // Fetch all workflows with pagination (n8n API limit is 250)
      let allWorkflows: any[] = [];
      let cursor: string | undefined;
      const pageSize = 250;

      do {
        const params: any = { limit: pageSize };
        if (cursor) params.cursor = cursor;

        const response = await this.client.get("/api/v1/workflows", { params });
        const workflows = response.data?.data || [];
        allWorkflows = allWorkflows.concat(workflows);

        // Get next cursor for pagination
        cursor = response.data?.nextCursor;
      } while (cursor);

      const workflows = allWorkflows;

      for (const workflow of workflows) {
        // Fetch full workflow to get node details
        try {
          const fullWorkflow = await this.client.get(
            `/api/v1/workflows/${workflow.id}`
          );
          const nodes = fullWorkflow.data?.nodes || [];

          for (const node of nodes) {
            if (node.type && !seenNodeTypes.has(node.type)) {
              seenNodeTypes.set(node.type, {
                name: node.type,
                displayName: node.type.split(".").pop() || node.type,
                description: `Extracted from workflow: ${workflow.name}`,
                version: node.typeVersion || 1,
                properties: [], // Can't extract full schema from workflow
                inputs: ["main"],
                outputs: ["main"],
                group: [],
              });
            }
          }
        } catch (err) {
          // Skip workflows we can't access
        }
      }

      logger.info(
        `[NodeCatalog] Extracted ${seenNodeTypes.size} unique node types from ${workflows.length} workflows`
      );
      return Array.from(seenNodeTypes.values());
    } catch (error) {
      logger.error(
        "[NodeCatalog] Failed to extract nodes from workflows:",
        error
      );
      return [];
    }
  }

  /**
   * Sync credential types from n8n
   */
  private async syncCredentialTypes(): Promise<void> {
    try {
      // Try to get credential types
      const response = await this.client.get("/types/credentials.json");
      const credTypes = response.data || [];

      this.credentialTypes.clear();
      for (const cred of credTypes) {
        if (cred.name) {
          this.credentialTypes.set(cred.name, {
            name: cred.name,
            displayName: cred.displayName || cred.name,
            properties: cred.properties || [],
            authenticate: cred.authenticate,
          });
        }
      }
    } catch (error) {
      // Credential types endpoint might not be available
      logger.debug(
        "[NodeCatalog] Could not sync credential types (endpoint may not be available)"
      );
    }
  }

  /**
   * Parse raw node data into NodeTypeInfo
   */
  private parseNodeType(raw: any): NodeTypeInfo | null {
    if (!raw || !raw.name) return null;

    return {
      name: raw.name,
      displayName: raw.displayName || raw.name.split(".").pop() || raw.name,
      description: raw.description || "",
      version: raw.version || raw.typeVersion || 1,
      defaults: raw.defaults || {},
      inputs: raw.inputs || ["main"],
      outputs: raw.outputs || ["main"],
      properties: (raw.properties || []).map((p: any) => ({
        displayName: p.displayName || p.name,
        name: p.name,
        type: p.type || "string",
        default: p.default,
        required: p.required || false,
        description: p.description,
        options: p.options,
        displayOptions: p.displayOptions,
      })),
      credentials: raw.credentials,
      group: raw.group || [],
      codex: raw.codex,
    };
  }

  /**
   * Start periodic sync with n8n
   */
  private startPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      try {
        await this.syncFromN8n();
      } catch (error) {
        logger.error("[NodeCatalog] Periodic sync failed:", error);
      }
    }, this.SYNC_INTERVAL_MS);

    logger.debug(
      `[NodeCatalog] Periodic sync started (every ${
        this.SYNC_INTERVAL_MS / 1000
      }s)`
    );
  }

  /**
   * Force an immediate resync
   */
  async forceSync(): Promise<void> {
    await this.syncFromN8n();
  }

  // ==========================================================================
  // QUERY METHODS
  // ==========================================================================

  /**
   * Check if a node type exists in the catalog
   */
  hasNode(nodeType: string): boolean {
    return this.nodeTypes.has(nodeType);
  }

  /**
   * Get a specific node type
   */
  getNode(nodeType: string): NodeTypeInfo | undefined {
    return this.nodeTypes.get(nodeType);
  }

  /**
   * Get all node types
   */
  getAllNodes(): NodeTypeInfo[] {
    return Array.from(this.nodeTypes.values());
  }

  /**
   * Search nodes by name, displayName, or description
   */
  searchNodes(query: string): NodeTypeInfo[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllNodes().filter(
      (node) =>
        node.name.toLowerCase().includes(lowerQuery) ||
        node.displayName.toLowerCase().includes(lowerQuery) ||
        node.description.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get trigger nodes (nodes that can start a workflow)
   */
  getTriggerNodes(): NodeTypeInfo[] {
    return this.getAllNodes().filter(
      (node) =>
        node.group.includes("trigger") ||
        node.name.toLowerCase().includes("trigger") ||
        node.name.toLowerCase().includes("webhook")
    );
  }

  /**
   * Get AI-capable nodes
   */
  getAINodes(): NodeTypeInfo[] {
    return this.getAllNodes().filter(
      (node) =>
        node.name.includes("langchain") ||
        node.group.includes("ai") ||
        node.codex?.categories?.includes("AI")
    );
  }

  /**
   * Check if a credential type exists
   */
  hasCredentialType(credType: string): boolean {
    return this.credentialTypes.has(credType);
  }

  /**
   * Get a specific credential type
   */
  getCredentialType(credType: string): CredentialTypeInfo | undefined {
    return this.credentialTypes.get(credType);
  }

  /**
   * Get all credential types
   */
  getAllCredentialTypes(): CredentialTypeInfo[] {
    return Array.from(this.credentialTypes.values());
  }

  /**
   * Get catalog statistics
   */
  getStats(): CatalogStats {
    const nodes = this.getAllNodes();
    return {
      totalNodes: nodes.length,
      totalCredentialTypes: this.credentialTypes.size,
      triggerNodes: nodes.filter((n) => n.group.includes("trigger")).length,
      actionNodes: nodes.filter((n) => !n.group.includes("trigger")).length,
      aiNodes: this.getAINodes().length,
      lastSyncTime: this.lastSync,
      n8nVersion: this.n8nVersion,
      syncSource: this.lastSync ? "live" : "none",
    };
  }

  /**
   * Check if connected (doesn't require nodes to be synced)
   * We allow the system to start even with an empty catalog - graceful degradation
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Validate that all nodes in a workflow exist
   */
  /**
   * Validate that all nodes in a workflow exist and are allowed
   */
  validateWorkflowNodes(workflow: {
    nodes: Array<{ type: string; name: string }>;
  }): {
    valid: boolean;
    missingNodes: string[];
    disallowedNodes: string[];
    suggestions: Map<string, string[]>;
  } {
    const missingNodes: string[] = [];
    const disallowedNodes: string[] = [];
    const suggestions = new Map<string, string[]>();
    const nodeFilter = NodeFilter.getInstance();

    for (const node of workflow.nodes) {
      // 1. Check if allowed by policy
      if (!nodeFilter.isNodeAllowed(node.type)) {
        disallowedNodes.push(node.type);
        continue;
      }

      // 2. Check if exists in catalog
      if (!this.hasNode(node.type)) {
        missingNodes.push(node.type);

        // Find similar nodes as suggestions
        const similar = this.searchNodes(
          node.type.split(".").pop() || node.type
        )
          .slice(0, 3)
          .map((n) => n.name);

        if (similar.length > 0) {
          suggestions.set(node.type, similar);
        }
      }
    }

    return {
      valid: missingNodes.length === 0 && disallowedNodes.length === 0,
      missingNodes,
      disallowedNodes,
      suggestions,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let catalogInstance: NodeCatalog | null = null;

/**
 * Get or create the global NodeCatalog instance
 */
export function getNodeCatalog(n8nUrl?: string, apiKey?: string): NodeCatalog {
  if (!catalogInstance) {
    const url = n8nUrl || process.env.N8N_API_URL || "http://localhost:5678";
    const key = apiKey || process.env.N8N_API_KEY || "";

    if (!key) {
      logger.warn(
        "[NodeCatalog] N8N_API_KEY not set - some features may not work"
      );
    }

    catalogInstance = new NodeCatalog(url, key);
  }
  return catalogInstance;
}

/**
 * Initialize and connect the catalog (call on startup)
 */
export async function initNodeCatalog(
  n8nUrl?: string,
  apiKey?: string
): Promise<NodeCatalog> {
  const catalog = getNodeCatalog(n8nUrl, apiKey);
  await catalog.connect();
  return catalog;
}
