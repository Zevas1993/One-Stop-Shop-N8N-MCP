import { NodeRepository } from "../database/node-repository";
import { TemplateService } from "../templates/template-service";
import { SimpleCache } from "../utils/simple-cache";
import { PropertyFilter } from "./property-filter";
import { ExampleGenerator } from "./example-generator";
import { TaskTemplates } from "./task-templates";
import {
  EnhancedConfigValidator,
  ValidationMode,
  ValidationProfile,
} from "./enhanced-config-validator";
import { PropertyDependencies } from "./property-dependencies";
import { WorkflowValidator } from "./workflow-validator";
import * as n8nHandlers from "../mcp/handlers-n8n-manager";
import { logger } from "../utils/logger";
import { WorkflowSimplifierService } from "./workflow-simplifier";
import { NodeParser } from "./node-parser";
import { NodeFilter } from "../core/node-filter";

export class MCPToolService {
  private cache = new SimpleCache({ enabled: false, ttl: 300, maxSize: 10 });
  private nodeListCache = new Map<string, any>();
  private nodeInfoCache = new Map<string, any>();
  private performanceMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    avgResponseTime: 0,
  };

  constructor(
    private repository: NodeRepository,
    private templateService: TemplateService
  ) {
    // Initialize simplifier with a new NodeParser (using the repository's db if possible, or just new one)
    // NodeParser needs NodeRepository or similar.
    // Actually NodeParser is a service that uses NodeRepository? No, NodeParser uses its own cache/db access.
    // Let's assume we can create it or pass it.
    // For now, I'll create a new NodeParser instance as it seems to be self-contained or needs DB.
    // Looking at NodeParser source (from memory/previous views), it loads from DB.
    // We'll instantiate it here.
    const nodeParser = new NodeParser();
    // We need to ensure it's initialized? It usually lazy loads.
    this.simplifier = new WorkflowSimplifierService(nodeParser);
  }

  private simplifier: WorkflowSimplifierService;

  /**
   * Process workflow input: Expand simplified DSL and apply Auto-Fixes
   */
  async processWorkflowInput(args: any): Promise<any> {
    let workflow = args.workflow || args;

    // Check if it's a simplified workflow (missing 'nodes' array of full objects, or has simplified structure)
    // Simplified: nodes array elements don't have 'typeVersion' or 'position' usually, or just look simple.
    // Or explicitly passed via args.format = 'simplified'

    const isSimplified =
      args.format === "simplified" ||
      (workflow.nodes &&
        workflow.nodes.some((n: any) => !n.typeVersion && !n.position));

    if (isSimplified) {
      workflow = await this.simplifier.expandWorkflow(workflow);
    }

    // Auto-Fix logic could go here or be part of simplifier
    // For now, expansion handles ID generation and layout which are the main "fixes" needed for simplified input.

    return workflow;
  }

  // --- Node Discovery & Information ---

  async listNodesOptimized(filters: any = {}): Promise<any> {
    const optimizedFilters = {
      ...filters,
      limit: filters.limit || 200,
    };

    if (filters.category === "all") {
      delete optimizedFilters.category;
    } else if (
      !optimizedFilters.category &&
      !optimizedFilters.package &&
      !optimizedFilters.isAITool
    ) {
      optimizedFilters.category = "trigger";
    }

    const cacheKey = JSON.stringify(optimizedFilters);
    if (this.nodeListCache.has(cacheKey)) {
      this.performanceMetrics.cacheHits++;
      return this.nodeListCache.get(cacheKey);
    }

    this.performanceMetrics.cacheMisses++;
    const rawNodes = this.repository.listNodes(optimizedFilters);

    // Filter by node policy
    const nodeFilter = NodeFilter.getInstance();
    const filteredNodes = rawNodes.filter((node) =>
      nodeFilter.isNodeAllowed(node.type || node.name)
    );

    const result = {
      nodes: filteredNodes.slice(0, optimizedFilters.limit),
      totalCount: filteredNodes.length,
      policyActive: !nodeFilter.isCommunityNodesAllowed(),
    };

    this.nodeListCache.set(cacheKey, result);
    setTimeout(() => this.nodeListCache.delete(cacheKey), 5 * 60 * 1000);

    return result;
  }

  async searchNodes(query: string, limit: number = 20): Promise<any> {
    const nodeFilter = NodeFilter.getInstance();

    // Get raw results (fetch more than limit to account for filtering)
    const rawNodes = this.repository.searchNodes(query, { limit: limit * 2 });

    // Filter by node policy
    const filteredNodes = rawNodes.filter((node) =>
      nodeFilter.isNodeAllowed(node.nodeType || node.name)
    );

    // Apply limit after filtering
    const nodes = filteredNodes.slice(0, limit);

    // Calculate how many were filtered out
    const filteredCount = rawNodes.length - filteredNodes.length;

    return {
      query,
      results: nodes.map((node) => ({
        nodeType: node.nodeType,
        name: node.displayName,
        displayName: node.displayName,
        description: node.description,
        category: node.category,
        package: node.package,
      })),
      totalCount: nodes.length,
      filteredByPolicy: filteredCount,
      policyMessage:
        filteredCount > 0
          ? `${filteredCount} community node(s) hidden by policy. Set ALLOW_COMMUNITY_NODES=true to see all.`
          : undefined,
    };
  }

  async findNodesUnified(args: any): Promise<any> {
    const { query, category, limit = 50 } = args;

    if (query) {
      return this.searchNodes(query, limit);
    } else if (category) {
      if (category === "ai_tools") {
        return this.listAITools();
      } else {
        return this.listNodesOptimized({ category, limit });
      }
    } else {
      return this.listNodesOptimized({ category: "trigger", limit });
    }
  }

  async getNodeInfoUnified(args: any): Promise<any> {
    const { nodeType, detail = "essentials" } = args;

    // Check policy FIRST before any fetching
    const nodeFilter = NodeFilter.getInstance();
    if (!nodeFilter.isNodeAllowed(nodeType)) {
      const reason = nodeFilter.getRejectionReason(nodeType);
      return {
        success: false,
        error: reason,
        blockedByPolicy: true,
        suggestion:
          "Use only official n8n nodes (n8n-nodes-base.*, @n8n/n8n-nodes-langchain.*)",
      };
    }

    const cacheKey = `${nodeType}:${detail}`;
    if (
      (detail === "complete" || detail === "essentials") &&
      this.nodeInfoCache.has(cacheKey)
    ) {
      this.performanceMetrics.cacheHits++;
      return this.nodeInfoCache.get(cacheKey);
    }

    this.performanceMetrics.cacheMisses++;

    let result: any;
    switch (detail) {
      case "essentials":
        result = await this.getNodeEssentials(nodeType);
        break;
      case "complete":
        result = await this.getNodeInfo(nodeType);
        break;
      case "ai_tool":
        result = await this.getNodeAsToolInfo(nodeType);
        break;
      default:
        throw new Error(
          `INVALID: detail "${detail}" not supported. Valid options: essentials, complete, ai_tool.`
        );
    }

    const standardizedResult = this.standardizeNodeInfoResponse(result, detail);

    if (detail === "complete" || detail === "essentials") {
      this.nodeInfoCache.set(cacheKey, standardizedResult);
      setTimeout(() => this.nodeInfoCache.delete(cacheKey), 10 * 60 * 1000);
    }

    return standardizedResult;
  }

  private async getNodeInfo(nodeType: string): Promise<any> {
    let node = this.resolveNode(nodeType);

    const aiToolCapabilities = {
      canBeUsedAsTool: true,
      hasUsableAsToolProperty: node.isAITool,
      requiresEnvironmentVariable:
        !node.isAITool && node.package !== "n8n-nodes-base",
      toolConnectionType: "ai_tool",
      commonToolUseCases: this.getCommonAIToolUseCases(node.nodeType),
      environmentRequirement:
        node.package !== "n8n-nodes-base"
          ? "N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true"
          : null,
    };

    return {
      ...node,
      aiToolCapabilities,
    };
  }

  private async getNodeEssentials(nodeType: string): Promise<any> {
    const cacheKey = `essentials:${nodeType}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    let node = this.resolveNode(nodeType);

    const allProperties = node.properties || [];
    const essentials = PropertyFilter.getEssentials(
      allProperties,
      node.nodeType
    );
    const examples = ExampleGenerator.getExamples(node.nodeType, essentials);
    const operations = node.operations || [];

    const result = {
      nodeType: node.nodeType,
      displayName: node.displayName,
      description: node.description,
      category: node.category,
      version: node.version || "1",
      isVersioned: node.isVersioned || false,
      requiredProperties: essentials.required,
      commonProperties: essentials.common,
      operations: operations.map((op: any) => ({
        name: op.name || op.operation,
        description: op.description,
        action: op.action,
        resource: op.resource,
      })),
      examples,
      metadata: {
        totalProperties: allProperties.length,
        isAITool: node.isAITool,
        isTrigger: node.isTrigger,
        isWebhook: node.isWebhook,
        hasCredentials: node.credentials ? true : false,
        package: node.package,
        developmentStyle: node.developmentStyle || "programmatic",
      },
    };

    this.cache.set(cacheKey, result, 3600);
    return result;
  }

  private async getNodeAsToolInfo(nodeType: string): Promise<any> {
    let node = this.resolveNode(nodeType);

    const commonUseCases = this.getCommonAIToolUseCases(node.nodeType);

    const aiToolCapabilities = {
      canBeUsedAsTool: true,
      hasUsableAsToolProperty: node.isAITool,
      requiresEnvironmentVariable:
        !node.isAITool && node.package !== "n8n-nodes-base",
      connectionType: "ai_tool",
      commonUseCases,
      requirements: {
        connection: 'Connect to the "ai_tool" port of an AI Agent node',
        environment:
          node.package !== "n8n-nodes-base"
            ? "Set N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true for community nodes"
            : "No special environment variables needed for built-in nodes",
      },
      examples: this.getAIToolExamples(node.nodeType),
      tips: [
        "Give the tool a clear, descriptive name in the AI Agent settings",
        "Write a detailed tool description to help the AI understand when to use it",
        "Test the node independently before connecting it as a tool",
        node.isAITool
          ? "This node is optimized for AI tool usage"
          : "This is a regular node that can be used as an AI tool",
      ],
    };

    return {
      nodeType: node.nodeType,
      displayName: node.displayName,
      description: node.description,
      package: node.package,
      isMarkedAsAITool: node.isAITool,
      aiToolCapabilities,
    };
  }

  async getNodeDocumentation(nodeType: string): Promise<any> {
    const node = this.resolveNode(nodeType);
    const documentation = this.repository.getNodeDocumentation(nodeType);

    if (!documentation) {
      const essentials = await this.getNodeEssentials(nodeType);
      return {
        nodeType: node.nodeType,
        displayName: node.displayName,
        documentation: `
# ${node.displayName}

${node.description || "No description available."}

## Common Properties

${essentials.commonProperties
  .map(
    (p: any) => `### ${p.displayName}\n${p.description || `Type: ${p.type}`}`
  )
  .join("\n\n")}

## Note
Full documentation is being prepared. For now, use get_node_essentials for configuration help.
`,
        hasDocumentation: false,
      };
    }

    return {
      nodeType: node.nodeType,
      displayName: node.displayName,
      documentation,
      hasDocumentation: true,
    };
  }

  async getNodeSummary(args: any): Promise<any> {
    const { nodeType } = args;
    try {
      const fullInfo = await this.getNodeInfoUnified({
        nodeType,
        detail: "essentials",
      });
      return {
        nodeType: fullInfo.nodeType,
        displayName: fullInfo.displayName,
        description: fullInfo.description,
        category: fullInfo.metadata?.category || "unknown",
        keyProperties: fullInfo.requiredProperties?.slice(0, 3) || [],
        hasOperations: (fullInfo.operations?.length || 0) > 0,
        isAITool: fullInfo.metadata?.isAITool || false,
        responseSize: "<1KB",
        nextSteps: "Use get_node_info for complete configuration details",
      };
    } catch (error) {
      throw new Error(
        `Failed to get node summary: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // --- AI Tools ---

  async listAITools(): Promise<any> {
    const priorityAgentNodes = [
      "@n8n/n8n-nodes-langchain.agentExecutor",
      "n8n-nodes-langchain.agentExecutor",
      "@n8n/n8n-nodes-langchain.clusterAgent",
      "n8n-nodes-langchain.clusterAgent",
      "@n8n/n8n-nodes-langchain.agent",
      "n8n-nodes-langchain.agent",
      "nodes-langchain.agentExecutor",
      "nodes-langchain.clusterAgent",
      "nodes-langchain.agent",
    ];

    const recommendedAgents = [];
    for (const nodeType of priorityAgentNodes) {
      try {
        const agent = this.repository.getNode(nodeType);
        if (agent) {
          recommendedAgents.push({
            ...agent,
            category: "AI Agent (Recommended)",
            priority: 1,
            description: `${
              agent.description ||
              "AI Agent node for orchestrating AI-powered workflows"
            } - RECOMMENDED for AI workflows`,
            connectors: this.getNodeConnectors(agent),
            usage: {
              role: "AI Agent/Orchestrator",
              purpose: "Main AI agent that can use other nodes as tools",
              toolPorts: ["ai_tool"],
              requirements:
                "Requires API key for chosen AI model (OpenAI, Anthropic, etc.)",
            },
          });
        }
      } catch (error) {
        // Node not found, continue
      }
    }

    const allAITools = this.repository.getAITools();
    const otherTools = allAITools
      .filter((tool) => !priorityAgentNodes.includes(tool.nodeType))
      .map((tool) => {
        try {
          const fullNode = this.repository?.getNode(tool.nodeType);
          return {
            ...tool,
            ...(fullNode || {}),
            category: "AI Tool",
            priority: 2,
            connectors: fullNode ? this.getNodeConnectors(fullNode) : undefined,
            usage: {
              role: "AI Tool",
              purpose: "Can be connected to AI Agent as a tool",
              connection: "Connect to AI Agent's ai_tool port",
            },
          };
        } catch (error) {
          return {
            ...tool,
            category: "AI Tool",
            priority: 2,
            usage: {
              role: "AI Tool",
              purpose: "Can be connected to AI Agent as a tool",
            },
          };
        }
      });

    const allTools = [...recommendedAgents, ...otherTools].sort(
      (a, b) => (a.priority || 3) - (b.priority || 3)
    );

    return {
      recommendedAgents: recommendedAgents.length,
      tools: allTools,
      totalCount: allTools.length,
      categories: {
        "AI Agent (Recommended)": recommendedAgents.length,
        "AI Tool": otherTools.length,
      },
      quickStart: {
        step1: "Use a recommended AI Agent node as your main orchestrator",
        step2: "Connect other nodes to the AI Agent's ai_tool port",
        step3:
          "Configure each tool with $fromAI() expressions for dynamic values",
        defaultAgent:
          recommendedAgents.length > 0 ? recommendedAgents[0].nodeType : null,
      },
      requirements: {
        environmentVariable:
          "N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true (for community nodes)",
        nodeProperty: "usableAsTool: true (for optimized tools)",
      },
      usage: {
        description:
          "AI Agent nodes orchestrate workflows, while AI Tool nodes can be connected as tools.",
        note: "ANY node in n8n can be used as an AI tool by connecting it to the ai_tool port of an AI Agent node.",
        examples: [
          "AI Agent + Slack tool = AI can send messages",
          "AI Agent + HTTP Request tool = AI can call APIs",
          "AI Agent + Google Sheets tool = AI can read/write data",
        ],
      },
    };
  }

  // --- Validation & Configuration ---

  async getNodeConfigUnified(args: any): Promise<any> {
    const { nodeType, mode = "task", task, query, config } = args;

    switch (mode) {
      case "task":
        if (!task) {
          throw new Error(
            'REQUIRED: task parameter missing for task mode. Use mode="list_tasks" to see available tasks.'
          );
        }
        return this.getNodeForTask(task);
      case "search_properties":
        if (!nodeType || !query) {
          throw new Error(
            "REQUIRED: nodeType and query parameters missing for search_properties mode."
          );
        }
        return this.searchNodeProperties(nodeType, query, 20);
      case "dependencies":
        if (!nodeType) {
          throw new Error(
            "REQUIRED: nodeType parameter missing for dependencies mode."
          );
        }
        return this.getPropertyDependencies(nodeType, config);
      case "list_tasks":
        return this.listTasks();
      default:
        throw new Error(
          `INVALID: mode "${mode}". Valid options: task, search_properties, dependencies, list_tasks.`
        );
    }
  }

  async validateNodeUnified(args: any): Promise<any> {
    const { nodeType, config, mode = "full" } = args;

    if (mode === "minimal") {
      return this.validateNodeMinimal(nodeType, config);
    } else {
      return this.validateNodeConfig(
        nodeType,
        config,
        "operation",
        "ai-friendly"
      );
    }
  }

  async validateWorkflowUnified(args: any): Promise<any> {
    const { workflow, workflowId, mode = "full", options = {} } = args;

    if (mode === "remote") {
      if (!workflowId) {
        throw new Error("workflowId is required for remote mode");
      }
      return n8nHandlers.handleValidateWorkflow(
        { id: workflowId, options },
        this.repository
      );
    }

    if (!workflow) {
      throw new Error("workflow is required for local validation modes");
    }

    const validationOptions = { ...options };

    // Pass through skipApiFieldValidation if provided
    if ("skipApiFieldValidation" in options) {
      validationOptions.skipApiFieldValidation = options.skipApiFieldValidation;
    }

    switch (mode) {
      case "quick":
        validationOptions.validateNodes = false;
        validationOptions.validateConnections = true;
        validationOptions.validateExpressions = false;
        validationOptions.quickMode = true;
        break;
      case "full":
        validationOptions.validateNodes = options.validateNodes ?? true;
        validationOptions.validateConnections =
          options.validateConnections ?? true;
        validationOptions.validateExpressions =
          options.validateExpressions ?? true;
        break;
      case "structure":
        validationOptions.validateNodes = options.validateNodes ?? false;
        validationOptions.validateConnections =
          options.validateConnections ?? true;
        validationOptions.validateExpressions =
          options.validateExpressions ?? false;
        break;
      case "connections":
        validationOptions.validateNodes = false;
        validationOptions.validateConnections = true;
        validationOptions.validateExpressions = false;
        break;
      case "expressions":
        validationOptions.validateNodes = false;
        validationOptions.validateConnections = false;
        validationOptions.validateExpressions = true;
        break;
      case "nodes":
        validationOptions.validateNodes = true;
        validationOptions.validateConnections = false;
        validationOptions.validateExpressions = false;
        break;
      default:
        throw new Error(`Unknown validation mode: ${mode}`);
    }

    if (mode === "connections") {
      return this.validateWorkflowConnections(workflow);
    } else if (mode === "expressions") {
      return this.validateWorkflowExpressions(workflow);
    } else {
      const result = await this.validateWorkflow(workflow, validationOptions);
      return {
        ...result,
        mode,
        validationOptions,
        modeDescription: this.getModeDescription(mode),
      };
    }
  }

  async validateBeforeAdding(args: any): Promise<any> {
    const { nodeType, workflowContext } = args;

    try {
      const { existingNodes, targetPosition } = workflowContext;
      const nodeInfo = await this.getNodeSummary({ nodeType });

      const validations = [];

      if (targetPosition === "start" && nodeInfo.category !== "trigger") {
        validations.push({
          level: "warning",
          message: `Non-trigger node "${nodeInfo.displayName}" at workflow start may need manual trigger`,
          suggestion: "Consider adding a trigger node before this node",
        });
      }

      if (
        targetPosition === "start" &&
        existingNodes.some((n: string) => n.includes("trigger"))
      ) {
        validations.push({
          level: "error",
          message: "Workflow already has a trigger node",
          suggestion: "Move this node to middle or end position",
        });
      }

      const similarNodes = existingNodes.filter((existing: string) => {
        return existing.split(".")[1] === nodeType.split(".")[1];
      });

      if (similarNodes.length > 0) {
        validations.push({
          level: "info",
          message: `Similar node already exists: ${similarNodes.join(", ")}`,
          suggestion: "Consider if this duplication is intentional",
        });
      }

      const isValid = !validations.some((v) => v.level === "error");

      return {
        valid: isValid,
        nodeType,
        nodeInfo: {
          name: nodeInfo.displayName,
          category: nodeInfo.category,
        },
        workflowPosition: targetPosition,
        validations,
        summary: isValid
          ? "Node can be safely added"
          : "Issues found - review before adding",
        responseSize: "<2KB",
      };
    } catch (error) {
      throw new Error(
        `Failed to validate node placement: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async checkCompatibility(args: any): Promise<any> {
    const { sourceNode, targetNode } = args;

    try {
      const [sourceInfo, targetInfo] = await Promise.all([
        this.getNodeSummary({ nodeType: sourceNode }),
        this.getNodeSummary({ nodeType: targetNode }),
      ]);

      const isCompatible = this.performCompatibilityCheck(
        sourceInfo,
        targetInfo
      );

      return {
        compatible: isCompatible.result,
        reason: isCompatible.reason,
        sourceNode: {
          type: sourceNode,
          name: sourceInfo.displayName,
          category: sourceInfo.category,
        },
        targetNode: {
          type: targetNode,
          name: targetInfo.displayName,
          category: targetInfo.category,
        },
        confidence: isCompatible.confidence,
        responseSize: "<500B",
      };
    } catch (error) {
      throw new Error(
        `Failed to check compatibility: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // --- Templates ---

  async findTemplatesUnified(args: any): Promise<any> {
    const {
      mode = "keywords",
      nodeTypes,
      query,
      task,
      limit = 20,
      detail = "summary",
    } = args;

    switch (mode) {
      case "nodes":
        if (!nodeTypes || nodeTypes.length === 0) {
          throw new Error("nodeTypes array is required for nodes mode");
        }
        const nodeResult = await this.templateService.listNodeTemplates(
          nodeTypes,
          limit
        );
        return detail === "summary"
          ? this.summarizeTemplateResult(nodeResult)
          : { templates: nodeResult, count: nodeResult.length };
      case "keywords":
        if (!query) {
          throw new Error("query is required for keywords mode");
        }
        const keywordResult = await this.templateService.searchTemplates(
          query,
          limit
        );
        return detail === "summary"
          ? this.summarizeTemplateResult(keywordResult)
          : { templates: keywordResult, count: keywordResult.length };
      case "task":
        if (!task) {
          throw new Error("task is required for task mode");
        }
        const taskResult = await this.templateService.getTemplatesForTask(task);
        return detail === "summary"
          ? this.summarizeTemplateResult(taskResult)
          : { templates: taskResult, count: taskResult.length };
      case "all":
        const allResult = await this.templateService.searchTemplates("", limit);
        return detail === "summary"
          ? this.summarizeTemplateResult(allResult)
          : { templates: allResult, count: allResult.length };
      default:
        throw new Error(
          `Unknown search mode: ${mode}. Valid options: nodes, keywords, task, all`
        );
    }
  }

  async getTemplate(templateId: number): Promise<any> {
    const template = await this.templateService.getTemplate(templateId);

    if (!template) {
      return {
        error: `Template ${templateId} not found`,
        tip: "Use list_node_templates or get_templates_for_task to find available templates",
      };
    }

    return {
      template,
      usage:
        "Import this workflow JSON directly into n8n or use it as a reference for building workflows",
    };
  }

  // --- N8n Management ---

  async handleN8nSystemUnified(args: any): Promise<any> {
    const { operation = "health", verbose = false } = args;

    switch (operation) {
      case "health":
        return n8nHandlers.handleHealthCheck();
      case "list_tools":
        return n8nHandlers.handleListAvailableTools();
      case "diagnose":
        return n8nHandlers.handleDiagnostic({
          params: { arguments: { verbose } },
        });
      case "n8n_create_workflow":
        return await n8nHandlers.handleCreateWorkflow(args, this.repository);
      case "n8n_update_workflow":
        return await n8nHandlers.handleUpdateWorkflow(args, this.repository);
      default:
        throw new Error(
          `INVALID: operation "${operation}". Valid options: health, list_tools, diagnose, n8n_create_workflow, n8n_update_workflow.`
        );
    }
  }

  async handleGetWorkflowUnified(args: any): Promise<any> {
    const { id, detail = "complete" } = args;

    switch (detail) {
      case "complete":
        return n8nHandlers.handleGetWorkflow(args);
      case "details":
        return n8nHandlers.handleGetWorkflowDetails(args);
      case "structure":
        return n8nHandlers.handleGetWorkflowStructure(args);
      case "minimal":
        return n8nHandlers.handleGetWorkflowMinimal(args);
      default:
        throw new Error(
          `Unknown detail level: ${detail}. Valid options: complete, details, structure, minimal`
        );
    }
  }

  // --- Guides & Tasks ---

  async getWorkflowGuide(scenario?: string): Promise<any> {
    const scenarios: Record<string, any> = {
      webhook_to_api: {
        title: "Webhook → API Call Pattern",
        nodes: [
          { type: "nodes-base.webhook", role: "trigger", required: true },
          { type: "nodes-base.httpRequest", role: "action", required: true },
        ],
        connections: [{ from: "Webhook", to: "HTTP Request", port: "main" }],
        configuration: {
          webhook: {
            path: "/webhook-endpoint",
            httpMethod: "POST",
            responseMode: "onReceived",
          },
          httpRequest: {
            method: "POST",
            url: "{{ $json.targetUrl }}",
            sendBody: true,
            jsonBody: "{{ $json }}",
          },
        },
        validation: [
          "Webhook must have unique path",
          "HTTP Request URL must be valid",
          "Response mode affects workflow execution",
        ],
      },
      ai_agent_tools: {
        title: "AI Agent with Tools Pattern",
        nodes: [
          {
            type: "nodes-langchain.agent",
            role: "orchestrator",
            required: true,
          },
          { type: "nodes-base.slack", role: "tool", required: false },
          { type: "nodes-base.httpRequest", role: "tool", required: false },
        ],
        connections: [
          { from: "AI Agent", to: "Slack", port: "ai_tool" },
          { from: "AI Agent", to: "HTTP Request", port: "ai_tool" },
        ],
        configuration: {
          agent: {
            model: "gpt-4",
            toolDescription: "Use clear, specific descriptions for each tool",
            systemMessage: "You are a helpful automation assistant",
          },
          tools: {
            slack: {
              channel: "{{ $fromAI('channel', 'Slack channel to post to') }}",
              text: "{{ $fromAI('message', 'Message content to send') }}",
            },
          },
        },
        validation: [
          "AI Agent must be connected to tools via ai_tool port",
          "Tools must use $fromAI() expressions for dynamic values",
          "Tool descriptions must be clear and specific",
        ],
      },
      data_processing: {
        title: "Data Processing Pipeline",
        nodes: [
          { type: "nodes-base.webhook", role: "trigger", required: true },
          { type: "nodes-base.set", role: "transform", required: true },
          { type: "nodes-base.if", role: "control", required: false },
          { type: "nodes-base.code", role: "transform", required: false },
        ],
        connections: [
          { from: "Webhook", to: "Set", port: "main" },
          { from: "Set", to: "IF", port: "main" },
          { from: "IF", to: "Code", port: "true" },
        ],
        configuration: {
          set: {
            mode: "manual",
            values: [
              { name: "processedData", value: "{{ $json.inputData | upper }}" },
              { name: "timestamp", value: "{{ $now }}" },
            ],
          },
          if: {
            conditions: {
              number: [
                {
                  value1: "{{ $json.amount }}",
                  operation: "greaterThan",
                  value2: 100,
                },
              ],
            },
          },
        },
        validation: [
          "Set node values must have unique names",
          "IF conditions must reference valid data paths",
          "Code node must return valid JSON object",
        ],
      },
    };

    if (scenario && scenarios[scenario]) {
      return {
        scenario,
        ...scenarios[scenario],
        implementation: {
          steps: [
            "1. Create nodes in the specified order",
            "2. Configure each node with the provided settings",
            "3. Connect nodes using the connection patterns",
            "4. Validate configuration using validate_workflow",
            "5. Test with sample data before production",
          ],
          performance: {
            caching: "Enable for nodes that process static data",
            retries: "Configure retry logic for external API calls",
            timeout: "Set appropriate timeouts for long-running operations",
          },
        },
      };
    }

    return {
      title: "n8n Workflow Patterns for AI Agents",
      availableScenarios: Object.keys(scenarios),
      quickStart: [
        "1. Choose a scenario: webhook_to_api, ai_agent_tools, data_processing",
        "2. Call get_workflow_guide({scenario: 'chosen_scenario'})",
        "3. Use list_nodes({category: 'trigger'}) to find starting points",
        "4. Use get_node_info({nodeType: 'exact_type'}) for configuration",
        "5. Use validate_workflow() before deployment",
      ],
      commonPatterns: {
        triggers: ["webhook", "schedule", "manual"],
        transforms: ["set", "code", "merge"],
        outputs: ["httpRequest", "slack", "gmail"],
        control: ["if", "switch", "merge"],
      },
    };
  }

  async listTasks(category?: string): Promise<any> {
    if (category) {
      const categories = TaskTemplates.getTaskCategories();
      const tasks = categories[category];

      if (!tasks) {
        throw new Error(
          `Unknown category: ${category}. Available categories: ${Object.keys(
            categories
          ).join(", ")}`
        );
      }

      return {
        category,
        tasks: tasks.map((task) => {
          const template = TaskTemplates.getTaskTemplate(task);
          return {
            task,
            description: template?.description || "",
            nodeType: template?.nodeType || "",
          };
        }),
      };
    }

    const categories = TaskTemplates.getTaskCategories();
    const result: any = {
      totalTasks: TaskTemplates.getAllTasks().length,
      categories: {},
    };

    for (const [cat, tasks] of Object.entries(categories)) {
      result.categories[cat] = tasks.map((task) => {
        const template = TaskTemplates.getTaskTemplate(task);
        return {
          task,
          description: template?.description || "",
          nodeType: template?.nodeType || "",
        };
      });
    }

    return result;
  }

  async getDatabaseStatistics(
    includePerformance: boolean = true
  ): Promise<any> {
    const baseStats = this.repository.getDatabaseStatistics();

    if (includePerformance) {
      const totalCacheOperations =
        this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses;
      const cacheHitRate =
        totalCacheOperations > 0
          ? Math.round(
              (this.performanceMetrics.cacheHits / totalCacheOperations) * 100
            )
          : 0;

      return {
        ...baseStats,
        performance: {
          cacheStatistics: {
            hitRate: `${cacheHitRate}%`,
            totalHits: this.performanceMetrics.cacheHits,
            totalMisses: this.performanceMetrics.cacheMisses,
            activeNodeListCache: this.nodeListCache.size,
            activeNodeInfoCache: this.nodeInfoCache.size,
          },
          responseTime: {
            averageMs: Math.round(this.performanceMetrics.avgResponseTime),
            status:
              this.performanceMetrics.avgResponseTime < 100
                ? "excellent"
                : this.performanceMetrics.avgResponseTime < 500
                ? "good"
                : "slow",
          },
        },
      };
    }

    return baseStats;
  }

  // --- Private Helpers ---

  private resolveNode(nodeType: string): any {
    let node = this.repository.getNode(nodeType);

    if (!node) {
      const alternatives = [
        nodeType,
        nodeType.replace("n8n-nodes-base.", ""),
        `n8n-nodes-base.${nodeType}`,
        nodeType.toLowerCase(),
      ];

      for (const alt of alternatives) {
        const found = this.repository!.getNode(alt);
        if (found) {
          node = found;
          break;
        }
      }

      if (!node) {
        throw new Error(`Node ${nodeType} not found`);
      }
    }
    return node;
  }

  private standardizeNodeInfoResponse(data: any, detail: string): any {
    const base = {
      nodeType: data.nodeType || "",
      displayName: data.displayName || "",
      description: data.description || "",
      responseType: detail,
      performance: {
        cached: this.nodeInfoCache.has(`${data.nodeType}:${detail}`),
        responseTime: "fast",
      },
    };

    switch (detail) {
      case "essentials":
        return {
          ...base,
          requiredProperties: data.requiredProperties || [],
          commonProperties: data.commonProperties || [],
          operations: data.operations || [],
          examples: data.examples || {},
          metadata: {
            ...data.metadata,
            totalProperties: data.metadata?.totalProperties || 0,
            isAITool: data.metadata?.isAITool || false,
          },
        };
      case "complete":
        return {
          ...base,
          properties: data.properties || [],
          operations: data.operations || [],
          credentials: data.credentials || [],
          version: data.version || "1",
          aiToolCapabilities: data.aiToolCapabilities || null,
        };
      case "ai_tool":
        return {
          ...base,
          canBeUsedAsTool: data.aiToolCapabilities?.canBeUsedAsTool || true,
          connectionType: "ai_tool",
          requirements: data.aiToolCapabilities?.requirements || {},
          examples: data.aiToolCapabilities?.examples || {},
          commonUseCases: data.aiToolCapabilities?.commonUseCases || [],
        };
      default:
        return { ...base, ...data };
    }
  }

  private getCommonAIToolUseCases(nodeType: string): string[] {
    const useCaseMap: Record<string, string[]> = {
      "nodes-base.slack": [
        "Send notifications about task completion",
        "Post updates to channels",
        "Send direct messages",
        "Create alerts and reminders",
      ],
      "nodes-base.googleSheets": [
        "Read data for analysis",
        "Log results and outputs",
        "Update spreadsheet records",
        "Create reports",
      ],
      "nodes-base.gmail": [
        "Send email notifications",
        "Read and process emails",
        "Send reports and summaries",
        "Handle email-based workflows",
      ],
      "nodes-base.httpRequest": [
        "Call external APIs",
        "Fetch data from web services",
        "Send webhooks",
        "Integrate with any REST API",
      ],
      "nodes-base.postgres": [
        "Query database for information",
        "Store analysis results",
        "Update records based on AI decisions",
        "Generate reports from data",
      ],
      "nodes-base.webhook": [
        "Receive external triggers",
        "Create callback endpoints",
        "Handle incoming data",
        "Integrate with external systems",
      ],
    };

    for (const [key, useCases] of Object.entries(useCaseMap)) {
      if (nodeType.includes(key)) {
        return useCases;
      }
    }

    return [
      "Perform automated actions",
      "Integrate with external services",
      "Process and transform data",
      "Extend AI agent capabilities",
    ];
  }

  private getAIToolExamples(nodeType: string): any {
    const exampleMap: Record<string, any> = {
      "nodes-base.slack": {
        toolName: "Send Slack Message",
        toolDescription:
          "Sends a message to a specified Slack channel or user. Use this to notify team members about important events or results.",
        nodeConfig: {
          resource: "message",
          operation: "post",
          channel:
            '={{ $fromAI("channel", "The Slack channel to send to, e.g. #general") }}',
          text: '={{ $fromAI("message", "The message content to send") }}',
        },
      },
      "nodes-base.googleSheets": {
        toolName: "Update Google Sheet",
        toolDescription:
          "Reads or updates data in a Google Sheets spreadsheet. Use this to log information, retrieve data, or update records.",
        nodeConfig: {
          operation: "append",
          sheetId: "your-sheet-id",
          range: "A:Z",
          dataMode: "autoMap",
        },
      },
      "nodes-base.httpRequest": {
        toolName: "Call API",
        toolDescription:
          "Makes HTTP requests to external APIs. Use this to fetch data, trigger webhooks, or integrate with any web service.",
        nodeConfig: {
          method:
            '={{ $fromAI("method", "HTTP method: GET, POST, PUT, DELETE") }}',
          url: '={{ $fromAI("url", "The complete API endpoint URL") }}',
          sendBody: true,
          bodyContentType: "json",
          jsonBody: '={{ $fromAI("body", "Request body as JSON object") }}',
        },
      },
    };

    for (const [key, example] of Object.entries(exampleMap)) {
      if (nodeType.includes(key)) {
        return example;
      }
    }

    return {
      toolName: "Custom Tool",
      toolDescription:
        "Performs specific operations. Describe what this tool does and when to use it.",
      nodeConfig: {
        note: "Configure the node based on its specific requirements",
      },
    };
  }

  private async getNodeForTask(task: string): Promise<any> {
    const template = TaskTemplates.getTaskTemplate(task);

    if (!template) {
      const similar = TaskTemplates.searchTasks(task);
      throw new Error(
        `Unknown task: ${task}. ` +
          (similar.length > 0
            ? `Did you mean: ${similar.slice(0, 3).join(", ")}?`
            : `Use 'list_tasks' to see available tasks.`)
      );
    }

    return {
      task: template.task,
      description: template.description,
      nodeType: template.nodeType,
      configuration: template.configuration,
      userMustProvide: template.userMustProvide,
      optionalEnhancements: template.optionalEnhancements || [],
      notes: template.notes || [],
      example: {
        node: {
          type: template.nodeType,
          parameters: template.configuration,
        },
        userInputsNeeded: template.userMustProvide.map((p) => ({
          property: p.property,
          currentValue: this.getPropertyValue(
            template.configuration,
            p.property
          ),
          description: p.description,
          example: p.example,
        })),
      },
    };
  }

  private getPropertyValue(config: any, path: string): any {
    const parts = path.split(".");
    let value = config;

    for (const part of parts) {
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        value = value?.[arrayMatch[1]]?.[parseInt(arrayMatch[2])];
      } else {
        value = value?.[part];
      }
    }

    return value;
  }

  private async searchNodeProperties(
    nodeType: string,
    query: string,
    maxResults: number = 20
  ): Promise<any> {
    const node = this.resolveNode(nodeType);
    const allProperties = node.properties || [];
    const matches = PropertyFilter.searchProperties(
      allProperties,
      query,
      maxResults
    );

    return {
      nodeType: node.nodeType,
      query,
      matches: matches.map((match: any) => ({
        name: match.name,
        displayName: match.displayName,
        type: match.type,
        description: match.description,
        path: match.path || match.name,
        required: match.required,
        default: match.default,
        options: match.options,
        showWhen: match.showWhen,
      })),
      totalMatches: matches.length,
      searchedIn: allProperties.length + " properties",
    };
  }

  private async getPropertyDependencies(
    nodeType: string,
    config?: Record<string, any>
  ): Promise<any> {
    const node = this.resolveNode(nodeType);
    const properties = node.properties || [];
    const analysis = PropertyDependencies.analyze(properties);

    let visibilityImpact = null;
    if (config) {
      visibilityImpact = PropertyDependencies.getVisibilityImpact(
        properties,
        config
      );
    }

    return {
      nodeType: node.nodeType,
      displayName: node.displayName,
      ...analysis,
      currentConfig: config
        ? {
            providedValues: config,
            visibilityImpact,
          }
        : undefined,
    };
  }

  private async validateNodeMinimal(
    nodeType: string,
    config: Record<string, any>
  ): Promise<any> {
    const node = this.resolveNode(nodeType);
    const properties = node.properties || [];

    const missingFields: string[] = [];

    for (const prop of properties) {
      if (!prop.required) continue;

      if (prop.displayOptions) {
        let isVisible = true;
        if (prop.displayOptions.show) {
          for (const [key, values] of Object.entries(
            prop.displayOptions.show
          )) {
            const configValue = config[key];
            const expectedValues = Array.isArray(values) ? values : [values];
            if (!expectedValues.includes(configValue)) {
              isVisible = false;
              break;
            }
          }
        }
        if (isVisible && prop.displayOptions.hide) {
          for (const [key, values] of Object.entries(
            prop.displayOptions.hide
          )) {
            const configValue = config[key];
            const expectedValues = Array.isArray(values) ? values : [values];
            if (expectedValues.includes(configValue)) {
              isVisible = false;
              break;
            }
          }
        }
        if (!isVisible) continue;
      }

      if (!(prop.name in config)) {
        missingFields.push(prop.displayName || prop.name);
      }
    }

    return {
      nodeType: node.nodeType,
      displayName: node.displayName,
      valid: missingFields.length === 0,
      missingRequiredFields: missingFields,
    };
  }

  private async validateNodeConfig(
    nodeType: string,
    config: Record<string, any>,
    mode: ValidationMode = "operation",
    profile: ValidationProfile = "ai-friendly"
  ): Promise<any> {
    const node = this.resolveNode(nodeType);
    const properties = node.properties || [];

    const validationResult = EnhancedConfigValidator.validateWithMode(
      node.nodeType,
      config,
      properties,
      mode,
      profile
    );

    return {
      nodeType: node.nodeType,
      displayName: node.displayName,
      ...validationResult,
      summary: {
        hasErrors: !validationResult.valid,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length,
        suggestionCount: validationResult.suggestions.length,
      },
    };
  }

  private async validateWorkflow(workflow: any, options?: any): Promise<any> {
    const validator = new WorkflowValidator(
      this.repository,
      EnhancedConfigValidator
    );

    try {
      const result = await validator.validateWorkflow(workflow, options);

      const { validationCache } = await import("../utils/validation-cache");
      const cacheHash = validationCache.recordValidation(workflow, result);

      const response: any = {
        valid: result.valid,
        validationCached: true,
        cacheHash,
        summary: {
          totalNodes: result.statistics.totalNodes,
          enabledNodes: result.statistics.enabledNodes,
          triggerNodes: result.statistics.triggerNodes,
          validConnections: result.statistics.validConnections,
          invalidConnections: result.statistics.invalidConnections,
          expressionsValidated: result.statistics.expressionsValidated,
          errorCount: result.errors.length,
          warningCount: result.warnings.length,
        },
      };

      if (result.errors.length > 0) {
        response.errors = result.errors.map((e) => ({
          node: e.nodeName || "workflow",
          message: e.message,
          details: e.details,
        }));
      }

      if (result.warnings.length > 0) {
        response.warnings = result.warnings.map((w) => ({
          node: w.nodeName || "workflow",
          message: w.message,
          details: w.details,
        }));
      }

      if (result.suggestions.length > 0) {
        response.suggestions = result.suggestions;
      }

      return response;
    } catch (error) {
      logger.error("Error validating workflow:", error);
      return {
        valid: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error validating workflow",
        tip: "Ensure the workflow JSON includes nodes array and connections object",
      };
    }
  }

  private async validateWorkflowConnections(workflow: any): Promise<any> {
    const validator = new WorkflowValidator(
      this.repository,
      EnhancedConfigValidator
    );

    try {
      const result = await validator.validateWorkflow(workflow, {
        validateNodes: false,
        validateConnections: true,
        validateExpressions: false,
      });

      const response: any = {
        valid: result.errors.length === 0,
        statistics: {
          totalNodes: result.statistics.totalNodes,
          triggerNodes: result.statistics.triggerNodes,
          validConnections: result.statistics.validConnections,
          invalidConnections: result.statistics.invalidConnections,
        },
      };

      const connectionErrors = result.errors.filter(
        (e) =>
          e.message.includes("connection") ||
          e.message.includes("cycle") ||
          e.message.includes("orphaned")
      );

      const connectionWarnings = result.warnings.filter(
        (w) =>
          w.message.includes("connection") ||
          w.message.includes("orphaned") ||
          w.message.includes("trigger")
      );

      if (connectionErrors.length > 0) {
        response.errors = connectionErrors.map((e) => ({
          node: e.nodeName || "workflow",
          message: e.message,
        }));
      }

      if (connectionWarnings.length > 0) {
        response.warnings = connectionWarnings.map((w) => ({
          node: w.nodeName || "workflow",
          message: w.message,
        }));
      }

      return response;
    } catch (error) {
      logger.error("Error validating workflow connections:", error);
      return {
        valid: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error validating connections",
      };
    }
  }

  private async validateWorkflowExpressions(workflow: any): Promise<any> {
    const validator = new WorkflowValidator(
      this.repository,
      EnhancedConfigValidator
    );

    try {
      const result = await validator.validateWorkflow(workflow, {
        validateNodes: false,
        validateConnections: false,
        validateExpressions: true,
      });

      const response: any = {
        valid: result.errors.length === 0,
        statistics: {
          totalNodes: result.statistics.totalNodes,
          expressionsValidated: result.statistics.expressionsValidated,
        },
      };

      const expressionErrors = result.errors.filter(
        (e) =>
          e.message.includes("Expression") ||
          e.message.includes("$") ||
          e.message.includes("{{")
      );

      const expressionWarnings = result.warnings.filter(
        (w) =>
          w.message.includes("Expression") ||
          w.message.includes("$") ||
          w.message.includes("{{")
      );

      if (expressionErrors.length > 0) {
        response.errors = expressionErrors.map((e) => ({
          node: e.nodeName || "workflow",
          message: e.message,
        }));
      }

      if (expressionWarnings.length > 0) {
        response.warnings = expressionWarnings.map((w) => ({
          node: w.nodeName || "workflow",
          message: w.message,
        }));
      }

      if (expressionErrors.length > 0 || expressionWarnings.length > 0) {
        response.tips = [
          "Use {{ }} to wrap expressions",
          "Reference data with $json.propertyName",
          'Reference other nodes with $node["Node Name"].json',
          "Use $input.item for input data in loops",
        ];
      }

      return response;
    } catch (error) {
      logger.error("Error validating workflow expressions:", error);
      return {
        valid: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error validating expressions",
      };
    }
  }

  private summarizeTemplateResult(result: any): any {
    if (result.templates && Array.isArray(result.templates)) {
      return {
        ...result,
        templates: result.templates.map((template: any) => ({
          id: template.id,
          name: template.name,
          description:
            template.description?.substring(0, 150) +
            (template.description?.length > 150 ? "..." : ""),
          nodeCount:
            template.nodeCount || template.workflow?.nodes?.length || 0,
          responseSize: "summary",
        })),
        responseSize: "<2KB (summary mode)",
      };
    }

    if (Array.isArray(result)) {
      return result.map((template: any) => ({
        id: template.id,
        name: template.name,
        description:
          template.description?.substring(0, 150) +
          (template.description?.length > 150 ? "..." : ""),
        nodeCount: template.nodeCount || template.workflow?.nodes?.length || 0,
        responseSize: "summary",
      }));
    }

    return result;
  }

  private performCompatibilityCheck(
    source: any,
    target: any
  ): { result: boolean; reason: string; confidence: string } {
    if (source.category === "trigger" && target.category === "trigger") {
      return {
        result: false,
        reason: "Cannot connect two trigger nodes",
        confidence: "high",
      };
    }

    if (source.category !== "unknown" && target.category !== "unknown") {
      return {
        result: true,
        reason: "Standard JSON data flow compatibility",
        confidence: "medium",
      };
    }

    return {
      result: true,
      reason: "Basic compatibility assumed",
      confidence: "low",
    };
  }

  private getModeDescription(mode: string): string {
    const descriptions: Record<string, string> = {
      full: "Complete validation including nodes, connections, and expressions",
      structure: "Workflow structure and connections validation only",
      connections: "Node connections and flow validation only",
      expressions: "n8n expressions syntax and references validation only",
      nodes: "Individual node configurations validation only",
      remote: "Validation of workflow from n8n instance by ID",
    };
    return descriptions[mode] || "Unknown validation mode";
  }

  private getNodeConnectors(node: any): any {
    if (!node) return undefined;

    return {
      input: node.inputs || [],
      output: node.outputs || [],
    };
  }
}
