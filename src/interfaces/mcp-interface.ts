/**
 * MCP Interface
 *
 * Exposes the n8n MCP Server core as MCP (Model Context Protocol) tools.
 * This is the interface that AI agents (like Claude) connect to.
 *
 * Key Features:
 * 1. All workflow operations go through ValidationGateway
 * 2. Live node catalog from connected n8n instance
 * 3. Semantic validation via embedded LLM
 * 4. Clear error messages with fix suggestions
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthTokens, OAuthClientMetadata, OAuthClientInformationMixed } from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logger";
import { PROJECT_VERSION } from "../utils/version";
import { getCore, CoreOrchestrator, isCoreReady } from "../core";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// KAPA.AI OAUTH PROVIDER
// ============================================================================

const KAPA_TOKENS_FILE = path.join(process.cwd(), ".kapa-tokens.json");
const KAPA_CLIENT_FILE = path.join(process.cwd(), ".kapa-client.json");
const KAPA_REDIRECT_URL = "http://localhost:9876/callback";

/**
 * OAuth provider for kapa.ai authentication.
 * At runtime (headless), tokens must already be cached from setup.
 * During setup, redirectToAuthorization opens the browser.
 */
class KapaOAuthProvider implements OAuthClientProvider {
  private _codeVerifier: string = "";
  private _isSetupMode: boolean;

  constructor(isSetupMode: boolean = false) {
    this._isSetupMode = isSetupMode;
  }

  get redirectUrl(): string {
    return KAPA_REDIRECT_URL;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [new URL(KAPA_REDIRECT_URL)],
      client_name: "n8n-mcp-copilot",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    } as OAuthClientMetadata;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    try {
      if (fs.existsSync(KAPA_CLIENT_FILE)) {
        return JSON.parse(fs.readFileSync(KAPA_CLIENT_FILE, "utf-8"));
      }
    } catch {
      // No saved client info
    }
    return undefined;
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    fs.writeFileSync(KAPA_CLIENT_FILE, JSON.stringify(info, null, 2));
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    try {
      if (fs.existsSync(KAPA_TOKENS_FILE)) {
        return JSON.parse(fs.readFileSync(KAPA_TOKENS_FILE, "utf-8"));
      }
    } catch {
      // No saved tokens
    }
    return undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    fs.writeFileSync(KAPA_TOKENS_FILE, JSON.stringify(tokens, null, 2));
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (!this._isSetupMode) {
      throw new Error(
        "kapa.ai authentication required. Run 'node start.js --setup-kapa' to authenticate."
      );
    }
    // In setup mode, this is handled by the setup script
    throw new Error(`REDIRECT:${authorizationUrl.toString()}`);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier;
  }

  async codeVerifier(): Promise<string> {
    return this._codeVerifier;
  }
}

// ============================================================================
// MCP TOOL DEFINITIONS
// ============================================================================

/**
 * Core tools for n8n workflow management
 * These are the primary tools AI agents will use
 */
export const MCP_TOOLS: Tool[] = [
  // === WORKFLOW MANAGEMENT ===
  {
    name: "n8n_create_workflow",
    description: `Create a new workflow in n8n.

⚠️ IMPORTANT: All workflows are validated before creation. Invalid workflows will be rejected with detailed error messages.

The workflow must include:
- name: Workflow name
- nodes: Array of node configurations (each with type, name, parameters)
- connections: Object mapping node names to their connections

Validation includes:
- Schema validation
- Node existence check (nodes must exist in this n8n instance)
- Connection integrity
- Credential requirements
- n8n dry-run test`,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the workflow",
        },
        nodes: {
          type: "array",
          description: "Array of node configurations",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Unique node name" },
              type: {
                type: "string",
                description: "Node type (e.g., n8n-nodes-base.httpRequest)",
              },
              typeVersion: { type: "number", description: "Node version" },
              position: {
                type: "array",
                items: { type: "number" },
                description: "[x, y] position",
              },
              parameters: { type: "object", description: "Node parameters" },
              credentials: {
                type: "object",
                description: "Credential references",
              },
            },
            required: ["name", "type"],
          },
        },
        connections: {
          type: "object",
          description:
            'Node connections. Format: { "NodeName": { "main": [[{ "node": "TargetNode", "type": "main", "index": 0 }]] } }',
        },
        settings: {
          type: "object",
          description: "Workflow settings (optional)",
        },
      },
      required: ["name", "nodes", "connections"],
    },
  },
  {
    name: "n8n_get_workflow",
    description: "Get a workflow by ID from n8n",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Workflow ID",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "n8n_update_workflow",
    description: `Update an existing workflow.

⚠️ IMPORTANT: Updates are validated before applying. Invalid updates will be rejected.`,
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Workflow ID to update",
        },
        workflow: {
          type: "object",
          description: "Updated workflow data",
        },
      },
      required: ["id", "workflow"],
    },
  },
  {
    name: "n8n_delete_workflow",
    description: "Delete a workflow from n8n",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Workflow ID to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "n8n_list_workflows",
    description: "List all workflows in n8n",
    inputSchema: {
      type: "object",
      properties: {
        active: {
          type: "boolean",
          description: "Filter by active status",
        },
        limit: {
          type: "number",
          description: "Maximum workflows to return (default: 50)",
        },
      },
    },
  },
  // === VALIDATION ===
  {
    name: "n8n_validate_workflow",
    description: `Validate a workflow without creating it.

Returns detailed validation results including:
- Schema errors
- Missing or invalid node types
- Connection problems
- Credential issues
- Semantic analysis (if LLM available)

Use this to check workflows before submitting them.`,
    inputSchema: {
      type: "object",
      properties: {
        workflow: {
          type: "object",
          description: "Workflow to validate",
        },
      },
      required: ["workflow"],
    },
  },

  // === EXECUTION ===
  {
    name: "n8n_get_execution",
    description: "Get details of a workflow execution",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Execution ID",
        },
        includeData: {
          type: "boolean",
          description: "Include execution data (default: false)",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "n8n_list_executions",
    description: "List workflow executions",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: {
          type: "string",
          description: "Filter by workflow ID",
        },
        status: {
          type: "string",
          enum: ["running", "success", "error", "waiting"],
          description: "Filter by status",
        },
        limit: {
          type: "number",
          description: "Maximum executions to return (default: 20)",
        },
      },
    },
  },

  // === NODE DISCOVERY ===
  {
    name: "n8n_search_nodes",
    description: `Search for available node types in this n8n instance.

⚠️ IMPORTANT: Always search for nodes before using them in workflows.
Only nodes returned by this search are guaranteed to exist.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: 'Search query (e.g., "slack", "http", "database")',
        },
      },
      required: ["query"],
    },
  },
  {
    name: "n8n_get_node_info",
    description: "Get detailed information about a specific node type",
    inputSchema: {
      type: "object",
      properties: {
        nodeType: {
          type: "string",
          description: 'Node type (e.g., "n8n-nodes-base.httpRequest")',
        },
      },
      required: ["nodeType"],
    },
  },
  {
    name: "n8n_list_trigger_nodes",
    description:
      "List all available trigger nodes (nodes that can start a workflow)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "n8n_list_ai_nodes",
    description: "List all AI-capable nodes (LangChain, AI Agent, etc.)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "n8n_list_core_nodes",
    description: "List all core nodes (essential workflow building blocks like Set, If, Switch, Merge, etc.)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "n8n_list_transform_nodes",
    description: "List all transform nodes (data transformation like Set, Code, Function, etc.)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "n8n_list_input_nodes",
    description: "List all input nodes (nodes that fetch data from external sources)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "n8n_list_output_nodes",
    description: "List all output nodes (nodes that send data to external destinations)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "n8n_list_nodes_by_category",
    description: "List nodes by codex category (AI, Development, Communication, Data & Storage, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: 'Category name (e.g., "AI", "Communication", "Core Nodes", "Data & Storage", "Development")',
        },
      },
      required: ["category"],
    },
  },

  // === SYSTEM ===
  {
    name: "n8n_status",
    description:
      "Get the status of the n8n MCP Server system including connection status, node count, and LLM availability",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "n8n_resync_catalog",
    description:
      "Force a resync of the node catalog from n8n. Use if nodes seem out of date.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // === DOCUMENTATION (kapa.ai proxy) ===
  {
    name: "n8n_docs",
    description:
      "Search and ask questions about official n8n documentation via kapa.ai. Use 'search' for keyword lookups, 'ask' for natural language questions.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search", "ask"],
          description:
            "'search' for keyword-based doc search, 'ask' for natural language questions",
        },
        query: {
          type: "string",
          description: "The search query or question about n8n",
        },
      },
      required: ["action", "query"],
    },
  },

  // === CREDENTIALS ===
  {
    name: "n8n_list_credentials",
    description:
      "List available credentials (names and types only, not secrets)",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Filter by credential type",
        },
      },
    },
  },
];

// ============================================================================
// TOOL HANDLERS
// ============================================================================

type ToolHandler = (params: any) => Promise<any>;

function createToolHandlers(
  core: CoreOrchestrator
): Record<string, ToolHandler> {
  // Handle case where core is not fully initialized
  let connector: any = null;
  let catalog: any = null;
  try {
    connector = core.getConnector();
    catalog = core.getNodeCatalog();
  } catch (e) {
    // Core not fully initialized - handlers will return errors
    logger.warn(
      "[MCP] Core not fully initialized - some tools will be unavailable"
    );
  }

  return {
    // Workflow Management
    async n8n_create_workflow(params) {
      const result = await core.createWorkflow({
        name: params.name,
        nodes: params.nodes,
        connections: params.connections,
        settings: params.settings || { executionOrder: "v1" },
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          validation: result.validation
            ? {
                errors: result.validation.errors,
                warnings: result.validation.warnings,
                passedLayers: result.validation.passedLayers,
                failedLayer: result.validation.failedLayer,
              }
            : undefined,
        };
      }

      return {
        success: true,
        workflowId: result.workflow?.id,
        name: result.workflow?.name,
        message: `Workflow "${result.workflow?.name}" created successfully`,
      };
    },

    async n8n_get_workflow(params) {
      const workflow = await connector.getWorkflow(params.id);
      if (!workflow) {
        return { success: false, error: "Workflow not found" };
      }
      return { success: true, workflow };
    },

    async n8n_update_workflow(params) {
      const result = await connector.updateWorkflow(params.id, params.workflow);
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          validation: result.validation,
        };
      }
      return {
        success: true,
        workflowId: result.workflow?.id,
        message: "Workflow updated successfully",
      };
    },

    async n8n_delete_workflow(params) {
      const success = await connector.deleteWorkflow(params.id);
      return {
        success,
        message: success ? "Workflow deleted" : "Failed to delete workflow",
      };
    },

    async n8n_list_workflows(params) {
      const result = await connector.listWorkflows({
        active: params.active,
        limit: params.limit || 50,
      });
      return {
        success: true,
        count: result.data.length,
        workflows: result.data.map((w) => ({
          id: w.id,
          name: w.name,
          active: w.active,
          updatedAt: w.updatedAt,
        })),
      };
    },

    // Validation
    async n8n_validate_workflow(params) {
      const result = await core.validateWorkflow(params.workflow);
      if (!result) {
        return { success: false, error: "Validation not available" };
      }
      return {
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        passedLayers: result.passedLayers,
        failedLayer: result.failedLayer,
        validationTime: result.validationTime,
      };
    },

    // Execution
    async n8n_get_execution(params) {
      const execution = await connector.getExecution(
        params.id,
        params.includeData
      );
      if (!execution) {
        return { success: false, error: "Execution not found" };
      }
      return { success: true, execution };
    },

    async n8n_list_executions(params) {
      const result = await connector.listExecutions({
        workflowId: params.workflowId,
        status: params.status,
        limit: params.limit || 20,
      });
      return {
        success: true,
        count: result.data.length,
        executions: result.data.map((e) => ({
          id: e.id,
          workflowId: e.workflowId,
          status: e.status,
          startedAt: e.startedAt,
          stoppedAt: e.stoppedAt,
        })),
      };
    },

    // Node Discovery
    async n8n_search_nodes(params) {
      if (!catalog) {
        return {
          success: false,
          error: "Node catalog not available - n8n sync may have failed",
        };
      }
      const nodes = catalog.searchNodes(params.query);
      return {
        success: true,
        count: nodes.length,
        nodes: nodes.slice(0, 30).map((n) => ({
          type: n.name,
          displayName: n.displayName,
          description: n.description?.substring(0, 150),
          group: n.group,
          version: n.version,
        })),
      };
    },

    async n8n_get_node_info(params) {
      if (!catalog) {
        return {
          success: false,
          error: "Node catalog not available - n8n sync may have failed",
        };
      }
      const node = catalog.getNode(params.nodeType);
      if (!node) {
        // Try to find similar nodes
        const similar = catalog
          .searchNodes(params.nodeType.split(".").pop() || params.nodeType)
          .slice(0, 5)
          .map((n) => n.name);

        return {
          success: false,
          error: `Node type "${params.nodeType}" not found`,
          suggestions: similar.length > 0 ? similar : undefined,
        };
      }
      return {
        success: true,
        node: {
          type: node.name,
          displayName: node.displayName,
          description: node.description,
          version: node.version,
          inputs: node.inputs,
          outputs: node.outputs,
          credentials: node.credentials,
          properties: node.properties.slice(0, 20),
        },
      };
    },

    async n8n_list_trigger_nodes() {
      if (!catalog) {
        return {
          success: false,
          error: "Node catalog not available - n8n sync may have failed",
        };
      }
      const triggers = catalog.getTriggerNodes();
      return {
        success: true,
        count: triggers.length,
        triggers: triggers.map((n) => ({
          type: n.name,
          displayName: n.displayName,
          description: n.description?.substring(0, 100),
        })),
      };
    },

    async n8n_list_ai_nodes() {
      if (!catalog) {
        return {
          success: false,
          error: "Node catalog not available - n8n sync may have failed",
        };
      }
      const aiNodes = catalog.getAINodes();
      return {
        success: true,
        count: aiNodes.length,
        nodes: aiNodes.map((n) => ({
          type: n.name,
          displayName: n.displayName,
          description: n.description?.substring(0, 100),
        })),
      };
    },

    async n8n_list_core_nodes() {
      if (!catalog) {
        return {
          success: false,
          error: "Node catalog not available - n8n sync may have failed",
        };
      }
      const allNodes = catalog.getAllNodes();
      const coreNodes = allNodes.filter((n) =>
        n.codex?.categories?.includes("Core Nodes")
      );
      return {
        success: true,
        count: coreNodes.length,
        nodes: coreNodes.map((n) => ({
          type: n.name,
          displayName: n.displayName,
          description: n.description?.substring(0, 100),
        })),
      };
    },

    async n8n_list_transform_nodes() {
      if (!catalog) {
        return {
          success: false,
          error: "Node catalog not available - n8n sync may have failed",
        };
      }
      const allNodes = catalog.getAllNodes();
      const transformNodes = allNodes.filter((n) =>
        n.group.includes("transform")
      );
      return {
        success: true,
        count: transformNodes.length,
        nodes: transformNodes.map((n) => ({
          type: n.name,
          displayName: n.displayName,
          description: n.description?.substring(0, 100),
        })),
      };
    },

    async n8n_list_input_nodes() {
      if (!catalog) {
        return {
          success: false,
          error: "Node catalog not available - n8n sync may have failed",
        };
      }
      const allNodes = catalog.getAllNodes();
      const inputNodes = allNodes.filter((n) =>
        n.group.includes("input")
      );
      return {
        success: true,
        count: inputNodes.length,
        nodes: inputNodes.map((n) => ({
          type: n.name,
          displayName: n.displayName,
          description: n.description?.substring(0, 100),
        })),
      };
    },

    async n8n_list_output_nodes() {
      if (!catalog) {
        return {
          success: false,
          error: "Node catalog not available - n8n sync may have failed",
        };
      }
      const allNodes = catalog.getAllNodes();
      const outputNodes = allNodes.filter((n) =>
        n.group.includes("output")
      );
      return {
        success: true,
        count: outputNodes.length,
        nodes: outputNodes.map((n) => ({
          type: n.name,
          displayName: n.displayName,
          description: n.description?.substring(0, 100),
        })),
      };
    },

    async n8n_list_nodes_by_category(params) {
      if (!catalog) {
        return {
          success: false,
          error: "Node catalog not available - n8n sync may have failed",
        };
      }
      const allNodes = catalog.getAllNodes();
      const categoryNodes = allNodes.filter((n) =>
        n.codex?.categories?.some(c =>
          c.toLowerCase() === params.category.toLowerCase()
        )
      );

      // Get all available categories for help
      const availableCategories = new Set<string>();
      allNodes.forEach(n => {
        n.codex?.categories?.forEach(c => availableCategories.add(c));
      });

      if (categoryNodes.length === 0) {
        return {
          success: false,
          error: `No nodes found in category "${params.category}"`,
          availableCategories: Array.from(availableCategories).sort(),
        };
      }

      return {
        success: true,
        category: params.category,
        count: categoryNodes.length,
        nodes: categoryNodes.map((n) => ({
          type: n.name,
          displayName: n.displayName,
          description: n.description?.substring(0, 100),
        })),
      };
    },

    // System
    async n8n_status() {
      return {
        success: true,
        ...core.getStatus(),
      };
    },

    async n8n_resync_catalog() {
      if (!catalog) {
        return {
          success: false,
          error: "Node catalog not available - cannot resync",
        };
      }
      await connector.resyncCatalog();
      const stats = catalog.getStats();
      return {
        success: true,
        message: "Catalog resynced",
        nodeCount: stats.totalNodes,
        lastSync: stats.lastSyncTime,
      };
    },

    // Credentials
    async n8n_list_credentials(params) {
      const credentials = await connector.listCredentials({
        type: params.type,
      });
      return {
        success: true,
        count: credentials.length,
        credentials: credentials.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
        })),
      };
    },
  };
}

// ============================================================================
// MCP SERVER
// ============================================================================

export class MCPInterface {
  private server: Server;
  private handlers: Record<string, ToolHandler> = {};
  private kapaClient: Client | null = null;
  private kapaConnecting: Promise<Client> | null = null;
  private kapaTools: Array<{ name: string; description?: string }> | null =
    null;

  private async getKapaClient(): Promise<Client> {
    if (this.kapaClient) return this.kapaClient;
    if (this.kapaConnecting) return this.kapaConnecting;

    // Check if tokens exist before attempting connection
    if (!fs.existsSync(KAPA_TOKENS_FILE)) {
      throw new Error(
        "kapa.ai not authenticated. Run 'node start.js --setup-kapa' to set up authentication."
      );
    }

    this.kapaConnecting = (async () => {
      const authProvider = new KapaOAuthProvider(false);
      const client = new Client({
        name: "n8n-mcp-kapa-proxy",
        version: PROJECT_VERSION,
      });
      const transport = new StreamableHTTPClientTransport(
        new URL("https://n8n.mcp.kapa.ai/"),
        { authProvider }
      );
      transport.onclose = () => {
        this.kapaClient = null;
        this.kapaTools = null;
      };
      transport.onerror = (err) => {
        logger.error("[Kapa] Transport error:", err);
        this.kapaClient = null;
        this.kapaTools = null;
      };
      await client.connect(transport);
      this.kapaClient = client;
      this.kapaConnecting = null;

      const { tools } = await client.listTools();
      this.kapaTools = tools.map((t) => ({
        name: t.name,
        description: t.description,
      }));
      logger.info(
        `[Kapa] Connected. Tools: ${this.kapaTools.map((t) => t.name).join(", ")}`
      );
      return client;
    })();

    return this.kapaConnecting;
  }

  constructor() {
    this.server = new Server(
      {
        name: "n8n-copilot-mcp",
        version: PROJECT_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  }

  /**
   * Initialize and start the MCP server
   */
  async start(): Promise<void> {
    // Wait for core to be ready
    const core = getCore();
    if (!core.isReady()) {
      throw new Error("Core not ready - ensure initCore() was called first");
    }

    // Create handlers
    this.handlers = createToolHandlers(core);

    // Add n8n_docs handler (kapa.ai proxy)
    this.handlers["n8n_docs"] = async (params: {
      action: string;
      query: string;
    }) => {
      try {
        const client = await this.getKapaClient();
        if (!this.kapaTools) {
          const { tools } = await client.listTools();
          this.kapaTools = tools.map((t) => ({
            name: t.name,
            description: t.description,
          }));
        }

        // kapa.ai has a single tool (search_n8n_knowledge_sources) that handles
        // both keyword searches and natural language questions
        const toolName = this.kapaTools[0]?.name;

        if (!toolName) {
          return {
            error: `No kapa.ai tool matching '${params.action}'. Available: ${this.kapaTools.map((t) => t.name).join(", ")}`,
          };
        }

        const result = await client.callTool({
          name: toolName,
          arguments: { query: params.query },
        });

        // Extract text content from MCP response
        if (result.content && Array.isArray(result.content)) {
          const texts = (result.content as Array<{ type: string; text?: string }>)
            .filter((c) => c.type === "text" && c.text)
            .map((c) => c.text);
          return { result: texts.join("\n") };
        }
        return { result: result.content };
      } catch (error: any) {
        this.kapaClient = null;
        this.kapaConnecting = null;
        this.kapaTools = null;
        logger.error("[Kapa] Error:", error);

        // Detect auth-related errors
        const msg = error.message || "";
        if (msg.includes("not authenticated") || msg.includes("setup-kapa")) {
          return {
            error: msg,
            hint: "Run 'node start.js --setup-kapa' to authenticate with Google for kapa.ai docs access.",
          };
        }
        if (msg.includes("Unauthorized") || msg.includes("401") || msg.includes("token")) {
          return {
            error: `Authentication expired: ${msg}`,
            hint: "Run 'node start.js --setup-kapa' to re-authenticate.",
          };
        }
        return { error: `n8n_docs failed: ${msg}` };
      }
    };

    // Register tool list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: MCP_TOOLS,
    }));

    // Register tool call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const handler = this.handlers[name];
      if (!handler) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Unknown tool: ${name}` }),
            },
          ],
        };
      }

      try {
        const result = await handler(args || {});
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        logger.error(`[MCP] Tool ${name} error:`, error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: error.message }),
            },
          ],
        };
      }
    });

    // Connect to transport (stdio for Claude Desktop)
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info("[MCP] Server started");
  }
}

/**
 * Start the MCP interface
 */
export async function startMCPInterface(): Promise<MCPInterface> {
  const mcp = new MCPInterface();
  await mcp.start();
  return mcp;
}
