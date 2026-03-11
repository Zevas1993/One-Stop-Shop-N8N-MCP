import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthTokens, OAuthClientMetadata, OAuthClientInformationMixed } from "@modelcontextprotocol/sdk/shared/auth.js";
import { z } from "zod";

import { isN8nApiConfigured, getN8nApiConfig } from "../config/n8n-api";
import * as n8nHandlers from "./handlers-n8n-manager";
import { handleUpdatePartialWorkflow } from "./handlers-workflow-diff";
import { N8nVersionMonitor } from "../services/n8n-version-monitor";
import { N8nNodeSync } from "../services/n8n-node-sync";
import { logger } from "../utils/logger";
import { PROJECT_VERSION } from "../utils/version";
import { MCPToolService } from "../services/mcp-tool-service";
import { LazyInitializationManager } from "./lazy-initialization-manager";
import { GraphPopulationService } from "../services/graph-population-service";
import { GraphOptimizationService } from "../services/graph-optimization-service";
import { graphRagTools, handleQueryGraph } from "./tools-graphrag";
import {
  nanoAgentTools,
  handleExecuteAgentPipeline,
  handleExecutePatternDiscovery,
  handleExecuteGraphRAGQuery,
  handleExecuteWorkflowGeneration,
  handleGetAgentStatus,
} from "./tools-nano-agents";
import { nanoLLMTools } from "./tools-nano-llm";
import { getNanoLLMPipelineHandler } from "./handlers-nano-llm-pipeline";
import { existsSync } from "fs";
import path from "path";
import {
  handleQueryAgentMemory,
  handleGetGraphInsights,
  handleGetValidationHistory,
  handleGetPatternRecommendations,
  handleGetWorkflowExecutionHistory,
  handleGetRecentErrors,
  handleGetAgentMemoryStats,
} from "./handlers-agent-memory-query";
import {
  getRoutingRecommendation,
  getRoutingStats,
  clearRoutingHistory,
} from "./router-integration";

/**
 * Unified MCP Server (MCP 2.0)
 *
 * Uses the high-level McpServer class for simplified Tool, Resource, and Prompt management.
 * Consolidates ALL functionality into a single efficient server.
 */
export class UnifiedMCPServer {
  private server: McpServer;
  private toolService: MCPToolService | null = null;
  private versionMonitor: N8nVersionMonitor;
  private initManager: LazyInitializationManager;
  private optimizationService: GraphOptimizationService;
  private toolHandlers = new Map<string, (args: any) => Promise<any>>();
  private toolDefinitions: any[] = [];

  // Kapa.ai MCP client for n8n docs proxy
  private kapaClient: Client | null = null;
  private kapaConnecting: Promise<Client> | null = null;
  private kapaTools: Array<{ name: string; description?: string }> | null = null;

  // n8n Configuration validation (Issue #1: Early configuration detection)
  private n8nConfigured: boolean = false;
  private n8nConfigCheckTime: number = 0;
  private readonly N8N_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.server = new McpServer({
      name: "n8n-mcp-unified",
      version: PROJECT_VERSION,
    });

    // Wrap the tool method to capture handlers and definitions
    const originalTool = this.server.tool.bind(this.server);
    (this.server as any).tool = (
      name: string,
      description: string,
      schema: any,
      handler: (args: any) => Promise<any>
    ) => {
      this.toolHandlers.set(name, handler);
      this.toolDefinitions.push({
        name,
        description,
        inputSchema: schema,
      });
      return originalTool(name, description, schema, handler);
    };

    // Initialize n8n configuration early (Issue #1: Fail fast on misconfiguration)
    this.initializeN8nConfiguration();

    // Initialize lazy manager
    this.initManager = new LazyInitializationManager();

    // Start background initialization
    const dbPath = this.findDatabasePath();
    this.initManager.startBackgroundInit(dbPath);

    // Initialize version monitor
    this.versionMonitor = new N8nVersionMonitor();

    // Initialize optimization service
    this.optimizationService = new GraphOptimizationService();
    this.optimizationService.startOptimizationLoop();

    this.setupTools();
    this.setupResources();
    this.setupPrompts();

    // Start version monitoring in background (non-blocking)
    this.startVersionMonitoring().catch((error) => {
      logger.warn("Version monitoring failed:", error);
    });
  }

  private findDatabasePath(): string {
    // Use __dirname-relative paths first (NOT process.cwd() which can be
    // C:\WINDOWS\system32 when launched from Claude Desktop)
    const projectRoot = path.resolve(__dirname, "..", "..");
    const possiblePaths = [
      path.join(projectRoot, "data", "nodes.db"),
      path.join(process.cwd(), "data", "nodes.db"),
      "./data/nodes.db",
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return p;
      }
    }

    // Default to __dirname-relative data directory
    return path.join(projectRoot, "data", "nodes.db");
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.toolService) {
      try {
        // Wait for services to be ready
        await this.initManager.waitForComponent("services", 30000);

        // Create tool service with initialized dependencies
        this.toolService = new MCPToolService(
          this.initManager.getRepository(),
          this.initManager.getTemplateService()
        );
      } catch (error) {
        const status = this.initManager.getStatus();
        if (status.phase !== "ready" && status.phase !== "failed") {
          throw new Error(this.initManager.getWaitMessage());
        }
        throw error;
      }
    }
  }

  private async startVersionMonitoring() {
    try {
      const { hasUpdates, changes } =
        await this.versionMonitor.checkForUpdates();
      if (hasUpdates) {
        logger.warn(
          "⚠️  n8n packages have been updated since last database build!"
        );
        changes.forEach((change) => logger.warn(`   - ${change}`));
      }

      if (process.env.N8N_AUTO_SYNC === "true") {
        if (hasUpdates) {
          logger.info(
            "🔄 Auto-rebuild enabled: Triggering rebuild due to detected updates..."
          );
          await this.versionMonitor.triggerRebuild();
        }
        this.versionMonitor.startMonitoring(true);
      }
    } catch (error) {
      logger.warn("Failed to check n8n versions:", error);
    }
  }

  private setupTools() {
    // 1. Node Discovery
    this.server.tool(
      "node_discovery",
      "Find, search, and analyze n8n nodes. Use list_installed to see what nodes are in the connected n8n instance.",
      {
        action: z.enum([
          "search",
          "list",
          "list_installed",
          "get_info",
          "get_documentation",
          "search_properties",
        ]),
        query: z.string().optional(),
        category: z
          .enum(["trigger", "transform", "output", "input", "AI", "all"])
          .optional(),
        package: z.string().optional(),
        limit: z.number().optional(),
        nodeType: z.string().optional(),
        includeDocumentation: z.boolean().optional(),
        includeDetails: z.boolean().optional().describe("Include full node details in list_installed (slower)"),
        detectCommunity: z.boolean().optional().describe("Scan workflows to detect installed community nodes (list_installed)"),
      },
      async (args) => {
        await this.ensureInitialized();
        const { action, query, category, package: pkg, limit, nodeType } = args as any;
        try {
          switch (action) {
            case "search":
              if (!query) throw new Error("query required");
              return this.formatResponse(
                await this.toolService!.searchNodes(query, limit)
              );
            case "list":
              return this.formatResponse(
                await this.toolService!.listNodesOptimized({
                  category,
                  package: pkg,
                  limit,
                })
              );
            case "list_installed":
              // Live discovery of nodes installed in the connected n8n instance
              // Returns built-in nodes (from /rest/node-types or SQLite DB) + community nodes (from workflow scan)
              return this.formatResponse(
                await n8nHandlers.handleListInstalledNodes(
                  { includeDetails: args.includeDetails, detectCommunity: args.detectCommunity },
                  this.initManager.getRepository()
                )
              );
            case "get_info":
              if (!nodeType) throw new Error("nodeType required");
              return this.formatResponse(
                await this.toolService!.getNodeInfoUnified({ nodeType })
              );
            case "get_documentation":
              if (!nodeType) throw new Error("nodeType required");
              return this.formatResponse(
                await this.toolService!.getNodeDocumentation(nodeType)
              );
            case "search_properties":
              if (!nodeType || !query)
                throw new Error("nodeType and query required");
              return this.formatResponse(
                await this.toolService!.getNodeConfigUnified({
                  mode: "search_properties",
                  nodeType,
                  query,
                })
              );
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return this.formatErrorResponse(error, "node_discovery");
        }
      }
    );

    // 2. Node Validation
    this.server.tool(
      "node_validation",
      `Validate node configurations, get dependencies, and find nodes for tasks.

Actions:
- validate_minimal: Quick validation of a node config. Pass 'nodeType' + optional 'configuration'.
- validate_operation: Full validation including operations. Pass 'nodeType' + optional 'configuration'.
- get_dependencies: Get required credentials and connected nodes. Pass 'nodeType'.
- get_for_task: Find the best node for a task description. Pass 'task' (e.g. "send email", "parse JSON").
- list_tasks: List all available task categories.

Example: { action: "get_for_task", task: "send a Slack message" }`,
      {
        action: z.enum([
          "validate_minimal",
          "validate_operation",
          "get_dependencies",
          "get_for_task",
          "list_tasks",
        ]),
        nodeType: z.string().optional().describe("Node type, e.g. 'n8n-nodes-base.httpRequest' (for validate/dependencies)"),
        configuration: z.any().optional().describe("Node configuration object to validate"),
        profile: z.string().optional().describe("Validation profile"),
        options: z.any().optional().describe("Additional options for dependency analysis"),
        task: z.string().optional().describe("Task description, e.g. 'send email' (for get_for_task)"),
      },
      async (args) => {
        await this.ensureInitialized();
        const { action, nodeType, configuration, profile, options, task } =
          args as any;
        try {
          switch (action) {
            case "validate_minimal":
              if (!nodeType) throw new Error("nodeType required");
              return this.formatResponse(
                await this.toolService!.validateNodeUnified({
                  nodeType,
                  config: configuration,
                  mode: "minimal",
                })
              );
            case "validate_operation":
              if (!nodeType) throw new Error("nodeType required");
              return this.formatResponse(
                await this.toolService!.validateNodeUnified({
                  nodeType,
                  config: configuration,
                  mode: "full",
                })
              );
            case "get_dependencies":
              if (!nodeType) throw new Error("nodeType required");
              return this.formatResponse(
                await this.toolService!.getNodeConfigUnified({
                  mode: "dependencies",
                  nodeType,
                  config: options,
                })
              );
            case "get_for_task":
              if (!task) throw new Error("task required");
              return this.formatResponse(
                await this.toolService!.getNodeConfigUnified({
                  mode: "task",
                  task,
                })
              );
            case "list_tasks":
              return this.formatResponse(
                await this.toolService!.getNodeConfigUnified({
                  mode: "list_tasks",
                })
              );
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return this.formatErrorResponse(error, "node_validation");
        }
      }
    );

    // 3. Workflow Manager
    this.server.tool(
      "workflow_manager",
      `Create, read, update, and delete n8n workflows.

Actions:
- create: Pass 'workflow' with { name, nodes[], connections{}, settings{} }
- get / get_details / get_structure / get_minimal: Pass 'id' to fetch a workflow
- update: Pass 'id' + 'changes' with any of { name?, nodes?, connections?, settings? }. Missing fields are auto-filled from current workflow. You do NOT need to send the full workflow.
- list: Pass optional 'filters' { limit?, active?, tags? }
- search: Pass 'query' to search workflows by name
- validate: Pass 'id' with mode 'remote' to validate against your n8n instance (no workflow JSON needed). Or pass 'workflow' JSON + mode (full|quick|structure|connections|expressions|nodes) for local validation.
- activate: Pass 'id' + 'active' (true/false) to enable/disable a workflow
- duplicate: Pass 'id' + optional 'newName'
- clean: Pass 'id' to strip invalid fields from a workflow

Example update: { action: "update", id: "abc123", changes: { name: "New Name" } }
Example create: { action: "create", workflow: { name: "My Flow", nodes: [...], connections: {}, settings: { executionOrder: "v1" } } }

Requires N8N_API_URL and N8N_API_KEY.`,
      {
        action: z.enum([
          "create",
          "get",
          "get_details",
          "get_structure",
          "get_minimal",
          "update",
          "list",
          "search",
          "validate",
          "clean",
          "activate",
          "duplicate",
        ]),
        workflow: z.any().optional().describe("Full workflow object (for create/validate)"),
        id: z.string().optional().describe("Workflow ID (for get/update/activate/duplicate/clean)"),
        changes: z.any().optional().describe("Partial workflow changes for update: { name?, nodes?, connections?, settings? }. Missing fields auto-filled from current workflow."),
        filters: z.any().optional().describe("List filters: { limit?, active?, tags?, cursor? }"),
        query: z.string().optional().describe("Search query string (for search action)"),
        format: z.enum(["full", "simplified"]).optional().describe("Response format"),
        autoFix: z.boolean().optional().describe("Auto-fix validation issues"),
        active: z.boolean().optional().describe("Enable (true) or disable (false) workflow (for activate action)"),
        newName: z.string().optional().describe("New name for duplicated workflow"),
        mode: z
          .enum([
            "full",
            "quick",
            "remote",
            "structure",
            "connections",
            "expressions",
            "nodes",
          ])
          .optional()
          .describe("Validation mode (for validate action)"),
      },
      async (args) => {
        const { action, id, changes, filters, query } = args as any;

        // Process workflow input (expand simplified DSL)
        let workflow = args.workflow;
        if (workflow && (action === "create" || action === "validate")) {
          try {
            await this.ensureInitialized();
            workflow = await this.toolService!.processWorkflowInput(args);
          } catch (err) {
            // If expansion fails, we might want to return error or proceed with original
            // Proceeding might be safer if it was already full format but misidentified
            logger.warn("Workflow expansion failed", err);
          }
        }

        try {
          if (action === "validate") {
            await this.ensureInitialized();
            return this.formatResponse(
              await this.toolService!.validateWorkflowUnified({
                workflow,
                workflowId: id,
                mode: args.mode || "full",
              })
            );
          }

          this.ensureN8nConfigured();

          switch (action) {
            case "create":
              if (!workflow) throw new Error("workflow required");
              await this.ensureInitialized();
              return this.formatResponse(
                await n8nHandlers.handleCreateWorkflow(
                  workflow,
                  this.initManager.getRepository()
                )
              );
            case "get":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await n8nHandlers.handleGetWorkflow({ id })
              );
            case "get_details":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await n8nHandlers.handleGetWorkflowDetails({ id })
              );
            case "get_structure":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await n8nHandlers.handleGetWorkflowStructure({ id })
              );
            case "get_minimal":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await n8nHandlers.handleGetWorkflowMinimal({ id })
              );
            case "update": {
              if (!id || !changes) throw new Error("id and changes required");
              const parsedChanges = typeof changes === 'string' ? JSON.parse(changes) : changes;
              await this.ensureInitialized();
              return this.formatResponse(
                await n8nHandlers.handleUpdateWorkflow(
                  { id, ...parsedChanges },
                  this.initManager.getRepository()
                )
              );
            }
            case "list": {
              const parsedFilters = typeof filters === 'string' ? JSON.parse(filters) : (filters || {});
              return this.formatResponse(
                await n8nHandlers.handleListWorkflows(parsedFilters)
              );
            }
            case "search":
              if (!query) throw new Error("query required");
              const workflows = await n8nHandlers.handleListWorkflows({
                limit: 100,
              });
              if (!workflows.success) return this.formatResponse(workflows);
              const filtered = (workflows.data as any).workflows.filter(
                (w: any) => w.name.toLowerCase().includes(query.toLowerCase())
              );
              return this.formatResponse({
                success: true,
                data: { workflows: filtered, total: filtered.length },
              });
            case "activate":
              if (!id) throw new Error("id required");
              if (args.active === undefined) throw new Error("active (boolean) required");
              return this.formatResponse(
                await n8nHandlers.handleActivateWorkflow({ id, active: args.active })
              );
            case "duplicate":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await n8nHandlers.handleDuplicateWorkflow({ id, newName: args.newName })
              );
            case "clean":
              if (!id) throw new Error("id required");
              await this.ensureInitialized();
              return this.formatResponse(
                await n8nHandlers.handleCleanWorkflow(
                  { id },
                  this.initManager.getRepository()
                )
              );
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return this.formatErrorResponse(error, "workflow_manager");
        }
      }
    );

    // 3.5. Credentials Manager
    this.server.tool(
      "credentials_manager",
      `Manage n8n credentials for node authentication.

Actions:
- list: List all credentials. Optional 'limit'/'cursor' for pagination.
- get: Get credential details by 'id'.
- create: Create a credential. Pass 'name', 'type' (e.g. "httpHeaderAuth"), and 'data' (credential values).
- update: Update a credential. Pass 'id' + fields to change ('name', 'data').
- delete: Delete a credential by 'id'.

Example create: { action: "create", name: "My API Key", type: "httpHeaderAuth", data: { name: "Authorization", value: "Bearer sk-..." } }

Requires N8N_API_URL and N8N_API_KEY.`,
      {
        action: z.enum(["list", "get", "create", "update", "delete"]),
        id: z.string().optional().describe("Credential ID (for get/update/delete)"),
        name: z.string().optional().describe("Credential display name (for create/update)"),
        type: z.string().optional().describe("Credential type, e.g. 'httpHeaderAuth', 'oAuth2Api' (for create)"),
        data: z.any().optional().describe("Credential values object, e.g. { name: 'Authorization', value: 'Bearer ...' }"),
        limit: z.number().optional().describe("Max results for list"),
        cursor: z.string().optional().describe("Pagination cursor for list"),
      },
      async (args) => {
        this.ensureN8nConfigured();
        const { action, id, name, type, data, limit, cursor } = args as any;

        try {
          switch (action) {
            case "list":
              return this.formatResponse(
                await n8nHandlers.handleListCredentials({ limit, cursor })
              );
            case "get":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await n8nHandlers.handleGetCredential({ id })
              );
            case "create":
              if (!name || !type || !data)
                throw new Error("name, type, and data required");
              return this.formatResponse(
                await n8nHandlers.handleCreateCredential({ name, type, data })
              );
            case "update":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await n8nHandlers.handleUpdateCredential({ id, name, data })
              );
            case "delete":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await n8nHandlers.handleDeleteCredential({ id })
              );
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return this.formatErrorResponse(error, "credentials_manager");
        }
      }
    );

    // 4. Workflow Execution
    this.server.tool(
      "workflow_execution",
      `Execute and monitor n8n workflow runs.

Actions:
- run: Execute a workflow by ID via n8n API. Note: requires workflow to be active and may not work on all n8n editions. For webhook-triggered workflows, use 'trigger' instead. Pass 'workflowId' + optional 'data'.
- trigger: Execute via webhook URL. Pass 'webhookUrl' + 'httpMethod' (GET/POST) + optional 'data'/'headers'.
- get: Get execution details by execution 'id'.
- list: List executions. Pass optional 'filters' { workflowId?, status?, limit? }.
- stop: Stop a running execution by 'id'.
- retry: Retry a failed execution by 'id'.
- delete: Delete an execution record by 'id'.
- monitor_running: Get all currently running executions. Optional 'workflowId' to filter.
- list_mcp: List MCP-triggered executions.

Example run: { action: "run", workflowId: "abc123", data: { key: "value" } }
Example trigger: { action: "trigger", webhookUrl: "http://localhost:5678/webhook/xyz", httpMethod: "POST", data: { key: "value" } }

Requires N8N_API_URL and N8N_API_KEY.`,
      {
        action: z.enum([
          "run",
          "trigger",
          "get",
          "list",
          "delete",
          "stop",
          "retry",
          "monitor_running",
          "list_mcp",
        ]),
        workflowId: z.string().optional().describe("Workflow ID (for run/monitor_running)"),
        webhookUrl: z.string().optional().describe("Full webhook URL (for trigger action)"),
        httpMethod: z.string().optional().describe("HTTP method: GET or POST (for trigger action, default POST)"),
        data: z.any().optional().describe("Input data to pass to the workflow"),
        headers: z.any().optional().describe("Custom HTTP headers (for trigger action)"),
        id: z.string().optional().describe("Execution ID (for get/stop/retry/delete)"),
        filters: z.any().optional().describe("List filters: { workflowId?, status?, limit?, cursor? }"),
        waitForResponse: z.boolean().optional().describe("Wait for webhook response (for trigger action)"),
        loadWorkflow: z.boolean().optional().describe("Include workflow data in retry"),
        includeStats: z.boolean().optional().describe("Include execution statistics"),
        limit: z.number().optional().describe("Max results for list_mcp"),
      },
      async (args) => {
        this.ensureN8nConfigured();
        const {
          action,
          webhookUrl,
          httpMethod,
          data,
          headers,
          id,
          filters,
          waitForResponse,
          loadWorkflow,
          workflowId,
          includeStats,
          limit,
        } = args as any;

        try {
          switch (action) {
            case "run":
              // Direct API execution — runs a workflow by ID without needing a webhook URL
              if (!workflowId && !id) throw new Error("workflowId required");
              return this.formatResponse(
                await n8nHandlers.handleRunWorkflow({ id: workflowId || id, data })
              );
            case "trigger":
              if (!webhookUrl) throw new Error("webhookUrl required");
              return this.formatResponse(
                await n8nHandlers.handleTriggerWebhookWorkflow({
                  webhookUrl,
                  httpMethod,
                  data,
                  headers,
                  waitForResponse,
                })
              );
            case "get":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await n8nHandlers.handleGetExecution({
                  id,
                  includeData: filters?.includeData,
                })
              );
            case "list": {
              const parsedFilters = typeof filters === 'string' ? JSON.parse(filters) : (filters || {});
              return this.formatResponse(
                await n8nHandlers.handleListExecutions(parsedFilters)
              );
            }
            case "delete":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await n8nHandlers.handleDeleteExecution({ id })
              );
            case "stop":
              // Cancel a running execution
              if (!id) throw new Error("id (execution id) required");
              return this.formatResponse(
                await n8nHandlers.handleStopExecution({ id })
              );
            case "retry": {
              if (!id) throw new Error("id required");
              try {
                const v3Handlers = await import("./handlers-v3-tools.js");
                return this.formatResponse(
                  await v3Handlers.handleRetryExecution({
                    executionId: id,
                    loadWorkflow,
                  })
                );
              } catch (importErr: any) {
                return this.formatResponse({
                  success: false,
                  error: `Failed to load v3 handlers: ${importErr?.message}. Try restarting the MCP server after a fresh build.`,
                });
              }
            }
            case "monitor_running": {
              try {
                const v3Handlers = await import("./handlers-v3-tools.js");
                return this.formatResponse(
                  await v3Handlers.handleMonitorRunningExecutions({
                    workflowId,
                    includeStats,
                  })
                );
              } catch (importErr: any) {
                return this.formatResponse({
                  success: false,
                  error: `Failed to load v3 handlers: ${importErr?.message}. Try restarting the MCP server after a fresh build.`,
                });
              }
            }
            case "list_mcp": {
              try {
                const v3Handlers = await import("./handlers-v3-tools.js");
                return this.formatResponse(
                  await v3Handlers.handleListMcpWorkflows({ limit, includeStats })
                );
              } catch (importErr: any) {
                return this.formatResponse({
                  success: false,
                  error: `Failed to load v3 handlers: ${importErr?.message}. Try restarting the MCP server after a fresh build.`,
                });
              }
            }
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return this.formatErrorResponse(error, "workflow_execution");
        }
      }
    );

    // 5. Templates & Guides
    this.server.tool(
      "templates_and_guides",
      "Get templates and building guidance",
      {
        action: z.enum([
          "get_template",
          "search_templates",
          "list_node_templates",
          "get_templates_for_task",
          "get_workflow_guide",
          "get_ai_tools",
          "get_database_stats",
        ]),
        templateId: z.string().optional(),
        query: z.string().optional(),
        nodeTypes: z.array(z.string()).optional(),
        task: z.string().optional(),
        limit: z.number().optional(),
        includePerformance: z.boolean().optional(),
      },
      async (args) => {
        await this.ensureInitialized();
        const {
          action,
          templateId,
          query,
          nodeTypes,
          task,
          limit,
          includePerformance,
        } = args as any;
        try {
          switch (action) {
            case "get_template":
              if (!templateId) throw new Error("templateId required");
              return this.formatResponse(
                await this.toolService!.getTemplate(parseInt(templateId))
              );
            case "search_templates":
              if (!query) throw new Error("query required");
              return this.formatResponse(
                await this.toolService!.findTemplatesUnified({
                  mode: "keywords",
                  query,
                  limit,
                })
              );
            case "list_node_templates":
              return this.formatResponse(
                await this.toolService!.findTemplatesUnified({
                  mode: "nodes",
                  nodeTypes,
                  limit,
                })
              );
            case "get_templates_for_task":
              if (!task) throw new Error("task required");
              return this.formatResponse(
                await this.toolService!.findTemplatesUnified({
                  mode: "task",
                  task,
                })
              );
            case "get_workflow_guide":
              return this.formatResponse(
                await this.toolService!.getWorkflowGuide()
              );
            case "get_ai_tools":
              return this.formatResponse(await this.toolService!.listAITools());
            case "get_database_stats":
              return this.formatResponse(
                await this.toolService!.getDatabaseStatistics(
                  includePerformance
                )
              );
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return this.formatErrorResponse(error, "templates_and_guides");
        }
      }
    );

    // 6. N8n System
    this.server.tool(
      "n8n_system",
      "System health and diagnostics",
      {
        operation: z
          .enum(["health", "diagnose", "list_tools"])
          .default("health"),
        verbose: z.boolean().optional(),
      },
      async (args) => {
        this.ensureN8nConfigured();
        await this.ensureInitialized();
        const { operation, verbose } = args as any;
        try {
          return this.formatResponse(
            await this.toolService!.handleN8nSystemUnified({
              operation,
              verbose,
            })
          );
        } catch (error) {
          return this.formatErrorResponse(error, "n8n_system");
        }
      }
    );

    // 7. Workflow Diff
    this.server.tool(
      "workflow_diff",
      `Precise incremental workflow updates using diff operations. Max 5 operations per request.

Operations (use 'type' field to specify):
- addNode: { type: "addNode", node: { name, type, position: [x,y], parameters? } }
- removeNode: { type: "removeNode", nodeName: "Node Name" }
- updateNode: { type: "updateNode", nodeName: "Node Name", changes: { "parameters.key": value } }
- moveNode: { type: "moveNode", nodeName: "Node Name", position: [x, y] }
- enableNode / disableNode: { type: "enableNode", nodeName: "Node Name" }
- addConnection: { type: "addConnection", source: "Source Node", target: "Target Node" }
- removeConnection: { type: "removeConnection", source: "Source Node", target: "Target Node" }
- updateSettings: { type: "updateSettings", settings: { executionOrder: "v1" } }
- updateName: { type: "updateName", name: "New Workflow Name" }
- addTag / removeTag: { type: "addTag", tag: "my-tag" }

Example: { id: "abc123", operations: [{ type: "updateNode", nodeName: "HTTP Request", changes: { "parameters.url": "https://api.example.com" } }] }

Use nodeName (display name) or nodeId to reference nodes. Requires N8N_API_URL and N8N_API_KEY.`,
      {
        id: z.string().describe("Workflow ID to modify"),
        operations: z.array(z.any()).describe("Array of diff operations (see description for format of each type)"),
        validateOnly: z.boolean().optional().describe("If true, validate operations without applying changes"),
      },
      async (args) => {
        this.ensureN8nConfigured();
        const { id, operations, validateOnly } = args as any;
        try {
          return this.formatResponse(
            await handleUpdatePartialWorkflow({ id, operations, validateOnly })
          );
        } catch (error) {
          return this.formatErrorResponse(error, "workflow_diff");
        }
      }
    );

    // 7.5. Patch Workflow (convenience tool for single-parameter changes)
    this.server.tool(
      "patch_workflow",
      `Quick single-parameter update for a workflow node. Fetches the workflow, patches one value, and saves.

Use this instead of workflow_manager update when changing a single node parameter — no need to construct the full workflow JSON.

Example: { id: "abc123", nodeName: "HTTP Request", parameterPath: "url", value: "https://api.example.com" }
Example nested: { id: "abc123", nodeName: "Agent", parameterPath: "options.maxIterations", value: 15 }

Requires N8N_API_URL and N8N_API_KEY.`,
      {
        id: z.string().describe("Workflow ID"),
        nodeName: z.string().describe("Exact node name as shown in n8n UI"),
        parameterPath: z.string().describe("Dot-notation parameter path, e.g. 'options.maxIterations' or 'url'"),
        value: z.any().describe("New value to set"),
      },
      async (args) => {
        this.ensureN8nConfigured();
        const { id, nodeName, parameterPath, value } = args as any;
        try {
          return this.formatResponse(
            await n8nHandlers.handlePatchWorkflow({ id, nodeName, parameterPath, value })
          );
        } catch (error) {
          return this.formatErrorResponse(error, "patch_workflow");
        }
      }
    );

    // 8. GraphRAG Tools
    this.server.tool(
      "query_graph",
      "Query the knowledge graph using semantic search",
      {
        query: z.string(),
        top_k: z.number().optional(),
      },
      async (args) => {
        try {
          return this.formatResponse(await handleQueryGraph(args));
        } catch (error) {
          return this.formatErrorResponse(error, "query_graph");
        }
      }
    );

    this.server.tool(
      "populate_graph",
      "Populate the knowledge graph with n8n node data",
      {
        force: z
          .boolean()
          .optional()
          .describe("Force re-ingestion of all nodes"),
      },
      async (args) => {
        try {
          await this.ensureInitialized();
          const service = new GraphPopulationService(this.initManager.getRepository());
          const stats = await service.populate(args.force);
          return this.formatResponse(stats);
        } catch (error) {
          return this.formatErrorResponse(error, "populate_graph");
        }
      }
    );

    // 9. Nano Agent Tools
    this.server.tool(
      "execute_agent_pipeline",
      "Execute an agentic pipeline",
      {
        goal: z.string(),
        enableGraphRAG: z.boolean().optional(),
        shareInsights: z.boolean().optional(),
      },
      async (args) => {
        try {
          return this.formatResponse(await handleExecuteAgentPipeline(args));
        } catch (error) {
          return this.formatErrorResponse(error, "execute_agent_pipeline");
        }
      }
    );

    // ... Register other Nano Agent tools similarly ...
    this.server.tool(
      "execute_pattern_discovery",
      "Discover patterns",
      { goal: z.string() },
      async (args) =>
        this.formatResponse(await handleExecutePatternDiscovery(args))
    );
    this.server.tool(
      "execute_graphrag_query",
      "Execute GraphRAG query",
      { query: z.string(), topK: z.number().optional() },
      async (args) =>
        this.formatResponse(await handleExecuteGraphRAGQuery(args))
    );
    this.server.tool(
      "execute_workflow_generation",
      "Generate workflow",
      { goal: z.string(), patternId: z.string().optional() },
      async (args) =>
        this.formatResponse(await handleExecuteWorkflowGeneration(args))
    );
    this.server.tool(
      "get_agent_status",
      "Get agent status",
      { includeHistory: z.boolean().optional() },
      async (args) => this.formatResponse(await handleGetAgentStatus(args))
    );

    // 10. Nano LLM Tools
    this.server.tool(
      "nano_llm_query",
      "Query the Nano LLM pipeline",
      {
        query: z.string(),
        userExpertise: z.string().optional(),
        returnMetrics: z.boolean().optional(),
      },
      async (args) => {
        await this.ensureInitialized();
        const handler = getNanoLLMPipelineHandler(
          this.initManager.getRepository() || undefined
        );
        const result = await handler.handleQuery(
          args.query,
          (args.userExpertise as "beginner" | "intermediate" | "expert") ||
            "intermediate"
        );
        if (args.returnMetrics) {
          return this.formatResponse({
            ...result,
            observability: handler.getObservability(),
          });
        }
        return this.formatResponse(result);
      }
    );

    // PHASE 2 INTEGRATION: Agent Memory Query Tools
    // These tools expose the Agentic GraphRAG system's insights to users

    // 1. Query Agent Memory
    this.server.tool(
      "query_agent_memory",
      "Query agent insights and SharedMemory for transparency into agent decisions and recommendations",
      {
        pattern: z
          .string()
          .optional()
          .describe(
            'Search pattern (e.g., "validation", "pattern", "workflow"). Supports glob patterns.'
          ),
        agentId: z
          .string()
          .optional()
          .describe(
            'Filter by agent ID (e.g., "validator-agent", "workflow-agent")'
          ),
        keywordType: z
          .enum([
            "validation",
            "pattern",
            "workflow",
            "insight",
            "error",
            "all",
          ])
          .optional()
          .describe("Filter by entry type"),
        limit: z
          .number()
          .optional()
          .default(50)
          .describe("Maximum results (default 50)"),
        maxAgeHours: z
          .number()
          .optional()
          .default(24)
          .describe("Maximum age of entries in hours (default 24)"),
      },
      async (args) => {
        try {
          const result = await handleQueryAgentMemory(args);
          return this.formatResponse(result);
        } catch (error) {
          return this.formatErrorResponse(error, "query_agent_memory");
        }
      }
    );

    // 2. Get Graph Insights
    this.server.tool(
      "get_graph_insights",
      "Retrieve GraphRAG semantic knowledge including relationships, patterns, and recommendations",
      {
        detailed: z
          .boolean()
          .optional()
          .default(false)
          .describe("Return detailed insights (default false for summary)"),
      },
      async (args) => {
        try {
          const result = await handleGetGraphInsights(args);
          return this.formatResponse(result);
        } catch (error) {
          return this.formatErrorResponse(error, "get_graph_insights");
        }
      }
    );

    // 3. Get Validation History
    this.server.tool(
      "get_validation_history",
      "Get validation history to understand workflow compliance",
      {
        limit: z
          .number()
          .optional()
          .default(20)
          .describe("Number of records to return (default 20)"),
        successOnly: z
          .boolean()
          .optional()
          .default(false)
          .describe("Only return successful validations"),
      },
      async (args) => {
        try {
          const result = await handleGetValidationHistory(args);
          return this.formatResponse(result);
        } catch (error) {
          return this.formatErrorResponse(error, "get_validation_history");
        }
      }
    );

    // 4. Get Pattern Recommendations
    this.server.tool(
      "get_pattern_recommendations",
      "Get workflow pattern recommendations from agent analysis",
      {
        goal: z.string().optional().describe("Filter by goal/context"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Number of recommendations (default 10)"),
      },
      async (args) => {
        try {
          const result = await handleGetPatternRecommendations(args);
          return this.formatResponse(result);
        } catch (error) {
          return this.formatErrorResponse(error, "get_pattern_recommendations");
        }
      }
    );

    // 5. Get Workflow Execution History
    this.server.tool(
      "get_workflow_execution_history",
      "Get history of workflow executions via handlers",
      {
        limit: z
          .number()
          .optional()
          .default(20)
          .describe("Number of records (default 20)"),
        successOnly: z
          .boolean()
          .optional()
          .default(false)
          .describe("Only successful executions"),
      },
      async (args) => {
        try {
          const result = await handleGetWorkflowExecutionHistory(args);
          return this.formatResponse(result);
        } catch (error) {
          return this.formatErrorResponse(
            error,
            "get_workflow_execution_history"
          );
        }
      }
    );

    // 6. Get Recent Errors
    this.server.tool(
      "get_recent_errors",
      "Get recent errors for debugging and monitoring",
      {
        limit: z
          .number()
          .optional()
          .default(20)
          .describe("Number of records (default 20)"),
        errorType: z
          .enum(["validation", "api", "network", "unknown", "all"])
          .optional()
          .default("all")
          .describe("Filter by error type"),
      },
      async (args) => {
        try {
          const result = await handleGetRecentErrors(args);
          return this.formatResponse(result);
        } catch (error) {
          return this.formatErrorResponse(error, "get_recent_errors");
        }
      }
    );

    // 7. Get Agent Memory Stats
    this.server.tool(
      "get_agent_memory_stats",
      "Get statistics about agent memory usage and composition",
      {},
      async (args) => {
        try {
          const result = await handleGetAgentMemoryStats(args);
          return this.formatResponse(result);
        } catch (error) {
          return this.formatErrorResponse(error, "get_agent_memory_stats");
        }
      }
    );

    // PHASE 4 INTELLIGENCE: Smart Execution Router Tools
    // These tools enable intelligent routing between agent and handler pipelines

    // 1. Get Routing Recommendation
    this.server.tool(
      "get_routing_recommendation",
      "Get smart routing recommendation for a workflow request (agent vs handler pipeline)",
      {
        goal: z
          .string()
          .optional()
          .describe("High-level goal or requirement (use agent pipeline)"),
        workflow: z
          .any()
          .optional()
          .describe("Workflow JSON to deploy (use handler pipeline)"),
        context: z
          .string()
          .optional()
          .describe("Additional context for routing decision"),
        forceAgent: z
          .boolean()
          .optional()
          .describe("Force routing to agent pipeline"),
        forceHandler: z
          .boolean()
          .optional()
          .describe("Force routing to handler pipeline"),
      },
      async (args) => {
        try {
          const result = await getRoutingRecommendation({
            goal: args.goal,
            workflow: args.workflow,
            context: args.context,
            forceAgent: args.forceAgent,
            forceHandler: args.forceHandler,
          });
          return this.formatResponse({
            ...result,
            explanation: `Selected ${result.selectedPath} pipeline (${(
              result.confidence * 100
            ).toFixed(1)}% confidence, ${(result.successRate * 100).toFixed(
              1
            )}% success rate)`,
          });
        } catch (error) {
          return this.formatErrorResponse(error, "get_routing_recommendation");
        }
      }
    );

    // 2. Get Routing Statistics
    this.server.tool(
      "get_routing_statistics",
      "Get execution statistics and routing preferences based on historical success rates",
      {},
      async (args) => {
        try {
          const result = await getRoutingStats();
          return this.formatResponse({
            ...result,
            summary: `Agent success: ${(result.agentSuccessRate * 100).toFixed(
              1
            )}%, Handler success: ${(result.handlerSuccessRate * 100).toFixed(
              1
            )}%, Current preference: ${result.currentPreference}`,
          });
        } catch (error) {
          return this.formatErrorResponse(error, "get_routing_statistics");
        }
      }
    );

    // 3. Clear Routing History (for testing/reset)
    this.server.tool(
      "clear_routing_history",
      "Clear execution history and routing metrics (useful for testing or starting fresh)",
      {},
      async (args) => {
        try {
          await clearRoutingHistory();
          return this.formatResponse({
            success: true,
            message: "Routing history cleared successfully",
          });
        } catch (error) {
          return this.formatErrorResponse(error, "clear_routing_history");
        }
      }
    );

    // ═══════════════════════════════════════════════════════════════════
    // NEW TOOLS: Tags, Variables, Source Control
    // ═══════════════════════════════════════════════════════════════════

    // Tags Manager — organize workflows with tags
    this.server.tool(
      "tags_manager",
      "Manage n8n workflow tags (Requires API). Tags help organize and filter workflows.",
      {
        action: z.enum(["list", "create", "update", "delete"]),
        id: z.string().optional().describe("Tag ID (for update/delete)"),
        name: z.string().optional().describe("Tag name (for create/update)"),
        limit: z.number().optional(),
        cursor: z.string().optional(),
      },
      async (args) => {
        this.ensureN8nConfigured();
        const { action, id, name, limit, cursor } = args as any;
        try {
          switch (action) {
            case "list":
              return this.formatResponse(
                await n8nHandlers.handleListTags({ limit, cursor })
              );
            case "create":
              if (!name) throw new Error("name required");
              return this.formatResponse(
                await n8nHandlers.handleCreateTag({ name })
              );
            case "update":
              if (!id || !name) throw new Error("id and name required");
              return this.formatResponse(
                await n8nHandlers.handleUpdateTag({ id, name })
              );
            case "delete":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await n8nHandlers.handleDeleteTag({ id })
              );
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return this.formatErrorResponse(error, "tags_manager");
        }
      }
    );

    // Variables Manager — manage instance-level variables ($vars.*)
    this.server.tool(
      "variables_manager",
      "Manage n8n instance-level variables accessible in all workflows via $vars.variableName (Requires API)",
      {
        action: z.enum(["list", "create", "update", "delete"]),
        id: z.string().optional().describe("Variable ID (for update/delete)"),
        key: z.string().optional().describe("Variable key/name (for create)"),
        value: z.string().optional().describe("Variable value (for create/update)"),
        type: z.enum(["string", "number", "boolean", "secret"]).optional().describe("Variable type (for create)"),
      },
      async (args) => {
        this.ensureN8nConfigured();
        const { action, id, key, value, type } = args as any;
        try {
          switch (action) {
            case "list":
              return this.formatResponse(
                await n8nHandlers.handleGetVariables({})
              );
            case "create":
              if (!key || value === undefined) throw new Error("key and value required");
              return this.formatResponse(
                await n8nHandlers.handleCreateVariable({ key, value, type })
              );
            case "update":
              if (!id || value === undefined) throw new Error("id and value required");
              return this.formatResponse(
                await n8nHandlers.handleUpdateVariable({ id, value })
              );
            case "delete":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await n8nHandlers.handleDeleteVariable({ id })
              );
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return this.formatErrorResponse(error, "variables_manager");
        }
      }
    );

    // Source Control — Git integration for n8n Enterprise
    this.server.tool(
      "source_control",
      "Manage n8n Git source control integration (Enterprise feature — requires Git configured in n8n settings)",
      {
        action: z.enum(["status", "pull", "push"]),
        force: z.boolean().optional().describe("Force pull even if there are conflicts (for pull)"),
        message: z.string().optional().describe("Commit message (for push)"),
        fileNames: z.array(z.string()).optional().describe("Specific files to push (for push, omit for all)"),
      },
      async (args) => {
        this.ensureN8nConfigured();
        const { action, force, message, fileNames } = args as any;
        try {
          switch (action) {
            case "status":
              return this.formatResponse(
                await n8nHandlers.handleGetSourceControlStatus({})
              );
            case "pull":
              return this.formatResponse(
                await n8nHandlers.handlePullSourceControl({ force })
              );
            case "push":
              if (!message) throw new Error("message (commit message) required for push");
              return this.formatResponse(
                await n8nHandlers.handlePushSourceControl({ message, fileNames })
              );
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return this.formatErrorResponse(error, "source_control");
        }
      }
    );

    // ═══════════════════════════════════════════════════════════════
    // n8n DOCS (kapa.ai proxy) - Search & ask official n8n documentation
    // ═══════════════════════════════════════════════════════════════
    this.server.tool(
      "n8n_docs",
      "Search and ask questions about official n8n documentation via kapa.ai. Use action 'search' to find relevant docs, or 'ask' to get an AI-generated answer from n8n's knowledge base. No API key required.",
      {
        action: z.enum(["search", "ask"]).describe("'search' to find relevant documentation, 'ask' to get an AI-generated answer"),
        query: z.string().describe("The search query or question about n8n"),
      },
      async (args: { action: string; query: string }) => {
        try {
          const client = await this.getKapaClient();

          // Use cached tool list or re-fetch
          if (!this.kapaTools) {
            const { tools } = await client.listTools();
            this.kapaTools = tools.map(t => ({ name: t.name, description: t.description }));
          }

          // Map our action names to kapa.ai tool name keywords
          const actionKeywords: Record<string, string[]> = {
            "search": ["search"],
            "ask": ["search", "ask", "question", "knowledge"],
          };
          const keywords = actionKeywords[args.action] || [args.action];
          const toolName = this.kapaTools.find(t =>
            keywords.some(kw => t.name.toLowerCase().includes(kw))
          )?.name;

          if (!toolName) {
            return this.formatResponse({
              success: false,
              error: `No matching kapa.ai tool for action '${args.action}'. Available tools: ${this.kapaTools.map(t => t.name).join(", ")}`,
            });
          }

          const result = await client.callTool({
            name: toolName,
            arguments: { query: args.query },
          });

          return { content: result.content as any };
        } catch (error: any) {
          // Reset client on errors so next call reconnects
          this.kapaClient = null;
          this.kapaConnecting = null;
          this.kapaTools = null;
          const kapaUrl = process.env.KAPA_MCP_URL || "https://n8n.mcp.kapa.ai/";
          const hint = error?.message?.includes("404") || error?.message?.includes("ECONNREFUSED")
            ? ` The kapa.ai endpoint (${kapaUrl}) may be unavailable. Set KAPA_MCP_URL env var to override, or use the standalone n8n-docs MCP server as an alternative.`
            : "";
          return this.formatResponse({
            success: false,
            error: `n8n_docs failed: ${error?.message || "Unknown error"}.${hint}`,
          });
        }
      }
    );
  }

  private setupResources() {
    this.server.resource("n8n-nodes", "n8n://nodes/all", async (uri) => {
      await this.ensureInitialized();
      const nodes = await this.toolService!.listNodesOptimized({ limit: 1000 });
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(nodes, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    });

    if (isN8nApiConfigured()) {
      this.server.resource(
        "n8n-workflows",
        "n8n://workflows/list",
        async (uri) => {
          const workflows = await n8nHandlers.handleListWorkflows({
            limit: 100,
          });
          return {
            contents: [
              {
                uri: uri.href,
                text: JSON.stringify(workflows, null, 2),
                mimeType: "application/json",
              },
            ],
          };
        }
      );
    }
  }

  private setupPrompts() {
    this.server.prompt(
      "explain-node",
      { nodeType: z.string().describe("The node type to explain") },
      async ({ nodeType }) => {
        await this.ensureInitialized();
        const info = await this.toolService!.getNodeDocumentation(nodeType);
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please explain the n8n node "${nodeType}" based on this documentation:\n\n${JSON.stringify(
                  info,
                  null,
                  2
                )}`,
              },
            },
          ],
        };
      }
    );

    this.server.prompt(
      "generate-workflow",
      {
        description: z
          .string()
          .describe("Description of the workflow to generate"),
      },
      async ({ description }) => {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Create an n8n workflow for the following requirement: "${description}".\n\nUse the 'workflow_manager' tool with action='create' to build it.`,
              },
            },
          ],
        };
      }
    );
  }

  /**
   * Issue #1: Configuration Validation
   * Initialize and cache n8n configuration at server startup (early validation)
   * This prevents agents from wasting tokens on misconfigured servers.
   */
  private initializeN8nConfiguration(): void {
    try {
      const config = getN8nApiConfig();
      if (!config) {
        logger.warn(
          "⚠️  n8n API not configured. Workflow tools will be unavailable. " +
            "Required env vars: N8N_API_URL, N8N_API_KEY"
        );
        this.n8nConfigured = false;
        return;
      }
      this.n8nConfigured = true;
      this.n8nConfigCheckTime = Date.now();
      logger.info("✓ n8n API configured and available");
    } catch (error) {
      logger.warn(
        "Error checking n8n configuration:",
        error instanceof Error ? error.message : error
      );
      this.n8nConfigured = false;
    }
  }

  /**
   * Lazy-connect to kapa.ai MCP server for n8n docs proxy.
   * Reuses connection; auto-reconnects on failure.
   */
  private async getKapaClient(): Promise<Client> {
    if (this.kapaClient) return this.kapaClient;
    if (this.kapaConnecting) return this.kapaConnecting;

    this.kapaConnecting = (async () => {
      const client = new Client({ name: "n8n-mcp-kapa-proxy", version: PROJECT_VERSION });
      const kapaUrl = process.env.KAPA_MCP_URL || "https://n8n.mcp.kapa.ai/";

      // Build OAuth provider from saved tokens (created by --setup-kapa)
      const projectRoot = path.resolve(__dirname, "..", "..");
      const tokensPath = path.join(projectRoot, ".kapa-tokens.json");
      const clientPath = path.join(projectRoot, ".kapa-client.json");

      if (!existsSync(tokensPath)) {
        throw new Error(
          "kapa.ai OAuth tokens not found. Run 'node start.js --setup-kapa' to authenticate first, " +
          "or use the standalone n8n-docs MCP server (npx -y mcp-remote https://n8n.mcp.kapa.ai/) as an alternative."
        );
      }

      const authProvider: OAuthClientProvider = {
        get redirectUrl() { return "http://localhost:9876/callback"; },
        get clientMetadata(): OAuthClientMetadata {
          return {
            redirect_uris: [new URL("http://localhost:9876/callback")],
            client_name: "n8n-mcp-copilot",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
          } as OAuthClientMetadata;
        },
        async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
          try {
            if (existsSync(clientPath)) {
              const { readFileSync } = await import("fs");
              return JSON.parse(readFileSync(clientPath, "utf-8"));
            }
          } catch { /* no saved client info */ }
          return undefined;
        },
        async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
          const { writeFileSync } = await import("fs");
          writeFileSync(clientPath, JSON.stringify(info, null, 2));
        },
        async tokens(): Promise<OAuthTokens | undefined> {
          try {
            if (existsSync(tokensPath)) {
              const { readFileSync } = await import("fs");
              return JSON.parse(readFileSync(tokensPath, "utf-8"));
            }
          } catch { /* no saved tokens */ }
          return undefined;
        },
        async saveTokens(tokens: OAuthTokens): Promise<void> {
          const { writeFileSync } = await import("fs");
          writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
        },
        async redirectToAuthorization(): Promise<void> {
          throw new Error("Interactive OAuth not available in headless mode. Run 'node start.js --setup-kapa' first.");
        },
        async saveCodeVerifier(): Promise<void> { /* no-op */ },
        async codeVerifier(): Promise<string> { return ""; },
      };

      const transport = new StreamableHTTPClientTransport(
        new URL(kapaUrl),
        { authProvider }
      );

      await client.connect(transport);
      this.kapaClient = client;
      this.kapaConnecting = null;

      // Cache available tools
      const { tools } = await client.listTools();
      this.kapaTools = tools.map(t => ({ name: t.name, description: t.description }));
      logger.info(`Connected to kapa.ai MCP. Available tools: ${this.kapaTools.map(t => t.name).join(", ")}`);

      return client;
    })();

    return this.kapaConnecting;
  }

  /**
   * Issue #1: Configuration Validation
   * Ensure n8n is configured before executing workflow tools.
   * Called at the START of tool handlers (before input validation).
   * Fails fast if misconfigured instead of wasting tokens.
   */
  private ensureN8nConfigured(toolName?: string): void {
    // Check cache TTL - revalidate every 5 minutes
    const now = Date.now();
    if (now - this.n8nConfigCheckTime > this.N8N_CONFIG_CACHE_TTL) {
      this.initializeN8nConfiguration();
    }

    if (!this.n8nConfigured) {
      const message =
        `n8n API not configured. ${
          toolName ? `Tool '${toolName}' requires ` : ""
        }` + "environment variables: N8N_API_URL, N8N_API_KEY";
      logger.error(message);
      throw new Error(message);
    }
  }

  private formatResponse(data: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private formatErrorResponse(error: any, toolName: string) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
              tool: toolName,
              isError: true,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  private backgroundInitPromise: Promise<void> | null = null;

  /**
   * Ensure background initialization (node sync + orchestrator) runs exactly once.
   * Called from both run() and connect() so stdio-wrapper gets the same warmup.
   */
  private ensureBackgroundInit(): void {
    if (this.backgroundInitPromise) return;
    this.backgroundInitPromise = (async () => {
      // Initialize n8n node synchronization in background (non-blocking)
      if (process.env.N8N_AUTO_SYNC !== "false" && isN8nApiConfigured()) {
        this.syncN8nNodes()
          .then((syncResult) => {
            if (syncResult) {
              if (syncResult.synced) {
                logger.info(
                  `[Server] ✅ Node database synchronized with n8n ${syncResult.version}`
                );
                if (syncResult.nodesCount) {
                  logger.info(
                    `[Server]    Loaded ${syncResult.nodesCount} nodes via ${syncResult.method}`
                  );
                }
              } else {
                logger.info(
                  `[Server] ✅ Node database already up-to-date (${syncResult.version})`
                );
              }
            }
          })
          .catch((error) => {
            logger.warn(
              "[Server] Node sync failed (continuing with existing database):",
              error instanceof Error ? error.message : String(error)
            );
          });
      } else {
        logger.info(
          "[Server] Node auto-sync disabled (set N8N_API_URL and N8N_API_KEY to enable)"
        );
      }

      // Initialize nano agent orchestrator in background (non-blocking)
      this.initializeNanoAgentOrchestrator()
        .then(() => {
          logger.info("[Server] ✅ Nano agent orchestrator initialized");
        })
        .catch((error) => {
          logger.warn(
            "[Server] Failed to initialize nano agent orchestrator:",
            error instanceof Error ? error.message : String(error)
          );
        });
    })();
  }

  async run(): Promise<void> {
    this.ensureBackgroundInit();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info("Unified MCP Server running on stdio");
  }

  /**
   * Synchronize node database with connected n8n instance
   * Detects version changes and triggers rebuild if needed
   */
  private async syncN8nNodes(): Promise<any> {
    try {
      // Wait for repository to be ready
      await this.ensureInitialized();

      const config = getN8nApiConfig();
      if (!config) {
        throw new Error("n8n API configuration not available");
      }

      const { N8nApiClient } = await import("../services/n8n-api-client.js");
      const n8nClient = new N8nApiClient(config);

      const nodeSync = new N8nNodeSync(
        n8nClient,
        this.initManager.getRepository()
      );

      // Perform sync check and rebuild if needed
      const syncResult = await nodeSync.syncToInstance();

      // If nodes were updated, notify GraphRAG
      if (syncResult.synced) {
        await nodeSync.notifyGraphRAG();
      }

      return syncResult;
    } catch (error) {
      logger.error("[Server] Failed to sync nodes:", error);
      throw error;
    }
  }

  /**
   * Initialize nano agent orchestrator if not already done
   * Uses timeout to prevent hanging during startup
   */
  private async initializeNanoAgentOrchestrator(): Promise<void> {
    try {
      const { ensureOrchestratorReady } = await import("./tools-nano-agents.js");

      // Wrap with timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Orchestrator initialization timeout (30s)")),
          30000
        )
      );

      await Promise.race([ensureOrchestratorReady(), timeoutPromise]);
    } catch (error) {
      // Don't rethrow - orchestrator is optional for basic functionality
      logger.warn(
        "[Server] Orchestrator initialization skipped:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async connect(transport: any): Promise<void> {
    this.ensureBackgroundInit();
    await this.server.connect(transport);
    logger.info("Unified MCP Server connected to transport");
  }

  async executeTool(name: string, args: any): Promise<any> {
    const handler = this.toolHandlers.get(name);
    if (!handler) {
      throw new Error(`Tool not found: ${name}`);
    }
    await this.ensureInitialized();
    return handler(args);
  }

  getTools(): any[] {
    return this.toolDefinitions;
  }
}

export async function createUnifiedMCPServer(): Promise<UnifiedMCPServer> {
  return new UnifiedMCPServer();
}
