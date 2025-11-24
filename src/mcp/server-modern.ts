import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { isN8nApiConfigured } from "../config/n8n-api";
import * as n8nHandlers from "./handlers-n8n-manager";
import { handleUpdatePartialWorkflow } from "./handlers-workflow-diff";
import { N8nVersionMonitor } from "../services/n8n-version-monitor";
import { logger } from "../utils/logger";
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

  constructor() {
    this.server = new McpServer({
      name: "n8n-mcp-unified",
      version: "3.0.0",
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
    const possiblePaths = [
      path.join(process.cwd(), "data", "nodes.db"),
      path.join(__dirname, "../../data", "nodes.db"),
      "./data/nodes.db",
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return p;
      }
    }

    // Default to creating in data directory
    return path.join(process.cwd(), "data", "nodes.db");
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
      "Find, search, and analyze n8n nodes",
      {
        action: z.enum([
          "search",
          "list",
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
      },
      async (args) => {
        await this.ensureInitialized();
        const { action, query, category, pkg, limit, nodeType } = args as any;
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
      "Validate node configurations and dependencies",
      {
        action: z.enum([
          "validate_minimal",
          "validate_operation",
          "get_dependencies",
          "get_for_task",
          "list_tasks",
        ]),
        nodeType: z.string().optional(),
        configuration: z.any().optional(),
        profile: z.string().optional(),
        options: z.any().optional(),
        task: z.string().optional(),
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
      "Create, read, update, and delete workflows (Requires API)",
      {
        action: z.enum([
          "create",
          "get",
          "update",
          "list",
          "search",
          "validate",
        ]),
        workflow: z.any().optional(),
        id: z.string().optional(),
        changes: z.any().optional(),
        filters: z.any().optional(),
        query: z.string().optional(),
        format: z.enum(["full", "simplified"]).optional(),
        autoFix: z.boolean().optional(),
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
          .optional(),
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
            case "update":
              if (!id || !changes) throw new Error("id and changes required");
              return this.formatResponse(
                await n8nHandlers.handleUpdateWorkflow(
                  { id, ...changes },
                  this.initManager.getRepository()
                )
              );
            case "list":
              return this.formatResponse(
                await n8nHandlers.handleListWorkflows(filters || {})
              );
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
      "Manage n8n credentials (Requires API)",
      {
        action: z.enum(["list", "get", "create", "update", "delete"]),
        id: z.string().optional(),
        name: z.string().optional(),
        type: z.string().optional(),
        data: z.any().optional(),
        limit: z.number().optional(),
        cursor: z.string().optional(),
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
      "Execute and monitor workflows (Requires API)",
      {
        action: z.enum([
          "trigger",
          "get",
          "list",
          "delete",
          "retry",
          "monitor_running",
          "list_mcp",
        ]),
        webhookUrl: z.string().optional(),
        httpMethod: z.string().optional(),
        data: z.any().optional(),
        headers: z.any().optional(),
        id: z.string().optional(),
        filters: z.any().optional(),
        waitForResponse: z.boolean().optional(),
        loadWorkflow: z.boolean().optional(),
        workflowId: z.string().optional(),
        includeStats: z.boolean().optional(),
        limit: z.number().optional(),
      },
      async (args) => {
        this.ensureN8nConfigured();
        const v3Handlers = await import("./handlers-v3-tools");
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
            case "list":
              return this.formatResponse(
                await n8nHandlers.handleListExecutions(filters || {})
              );
            case "delete":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await n8nHandlers.handleDeleteExecution({ id })
              );
            case "retry":
              if (!id) throw new Error("id required");
              return this.formatResponse(
                await v3Handlers.handleRetryExecution({
                  executionId: id,
                  loadWorkflow,
                })
              );
            case "monitor_running":
              return this.formatResponse(
                await v3Handlers.handleMonitorRunningExecutions({
                  workflowId,
                  includeStats,
                })
              );
            case "list_mcp":
              return this.formatResponse(
                await v3Handlers.handleListMcpWorkflows({ limit, includeStats })
              );
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
      "Precise incremental workflow updates",
      {
        id: z.string(),
        operations: z.array(z.any()),
        validateOnly: z.boolean().optional(),
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
          const service = new GraphPopulationService();
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
          .describe('Search pattern (e.g., "validation", "pattern", "workflow"). Supports glob patterns.'),
        agentId: z
          .string()
          .optional()
          .describe('Filter by agent ID (e.g., "validator-agent", "workflow-agent")'),
        keywordType: z
          .enum(["validation", "pattern", "workflow", "insight", "error", "all"])
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
        goal: z
          .string()
          .optional()
          .describe("Filter by goal/context"),
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
          return this.formatErrorResponse(error, "get_workflow_execution_history");
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
            explanation: `Selected ${result.selectedPath} pipeline (${(result.confidence * 100).toFixed(1)}% confidence, ${(result.successRate * 100).toFixed(1)}% success rate)`,
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
            summary: `Agent success: ${(result.agentSuccessRate * 100).toFixed(1)}%, Handler success: ${(result.handlerSuccessRate * 100).toFixed(1)}%, Current preference: ${result.currentPreference}`,
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

  private ensureN8nConfigured(): void {
    if (!isN8nApiConfigured()) {
      throw new Error(
        "n8n API not configured. Set N8N_API_URL and N8N_API_KEY environment variables."
      );
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

  async run(): Promise<void> {
    // Initialize nano agent orchestrator in background (non-blocking)
    // This prevents the server from hanging during startup
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

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info("Unified MCP Server running on stdio");
  }

  /**
   * Initialize nano agent orchestrator if not already done
   * Uses timeout to prevent hanging during startup
   */
  private async initializeNanoAgentOrchestrator(): Promise<void> {
    try {
      const { ensureOrchestratorReady } = await import("./tools-nano-agents");

      // Wrap with timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Orchestrator initialization timeout (30s)")), 30000)
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
