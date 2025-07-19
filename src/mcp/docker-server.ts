import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger';
import { LiveDockerRepository } from '../database/live-docker-repository';
import { n8nManagementTools } from './tools-n8n-manager';
import { isN8nApiConfigured } from '../config/n8n-api';
import * as n8nHandlers from './handlers-n8n-manager';

// Core node discovery tools - no memory overhead
const coreTools = [
  {
    name: "list_nodes",
    description: "List all available n8n nodes with optional filtering",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter by node category" },
        search: { type: "string", description: "Search in node names and descriptions" },
        limit: { type: "number", description: "Maximum number of results to return", default: 50 }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_node_info",
    description: "Get comprehensive information about a specific n8n node",
    inputSchema: {
      type: "object",
      properties: {
        nodeType: { type: "string", description: "The node type identifier (e.g., 'n8n-nodes-base.httpRequest')" }
      },
      required: ["nodeType"],
      additionalProperties: false
    }
  },
  {
    name: "search_nodes", 
    description: "Search for nodes using full-text search",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Maximum number of results", default: 20 }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "find_workflows_by_name",
    description: "Find workflows by name pattern",
    inputSchema: {
      type: "object", 
      properties: {
        name: { type: "string", description: "Workflow name to search for" }
      },
      required: ["name"],
      additionalProperties: false
    }
  },
  {
    name: "docker_status",
    description: "Check Docker container status and cache statistics",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];

export class DockerN8NServer {
  private server: Server;
  private repository: LiveDockerRepository;
  private containerName: string;

  constructor() {
    this.containerName = process.env.N8N_CONTAINER_NAME || 'n8n';
    this.repository = new LiveDockerRepository(this.containerName);
    
    logger.info(`Initializing Docker-based n8n MCP server (container: ${this.containerName})`);
    
    // Log n8n API configuration
    const apiConfigured = isN8nApiConfigured();
    const totalTools = apiConfigured ? coreTools.length + n8nManagementTools.length : coreTools.length;
    
    logger.info(`Docker MCP server initialized with ${totalTools} tools (n8n API: ${apiConfigured ? 'configured' : 'not configured'})`);
    
    this.server = new Server(
      {
        name: 'n8n-docker-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(InitializeRequestSchema, async () => {
      return {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'n8n-docker-mcp',
          version: '1.0.0',
        },
      };
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [...coreTools];
      
      // Add simplified n8n management tools if API is configured
      if (isN8nApiConfigured()) {
        tools.push(
          {
            name: "n8n_list_workflows",
            description: "List workflows from n8n instance",
            inputSchema: { type: "object", properties: {}, additionalProperties: false }
          },
          {
            name: "n8n_create_workflow",
            description: "Create a new workflow",
            inputSchema: {
              type: "object",
              properties: {
                name: { type: "string", description: "Workflow name" },
                nodes: { type: "array", description: "Array of nodes" }
              },
              required: ["name", "nodes"],
              additionalProperties: false
            }
          }
        );
      }
      
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Handle core tools
        switch (name) {
          case "list_nodes":
            return await this.handleListNodes(args);
          case "get_node_info":
            return await this.handleGetNodeInfo(args);  
          case "search_nodes":
            return await this.handleSearchNodes(args);
          case "find_workflows_by_name":
            return await this.handleFindWorkflowsByName(args);
          case "docker_status":
            return await this.handleDockerStatus();
        }

        // Handle n8n management tools if API is configured
        if (isN8nApiConfigured() && (name === 'n8n_list_workflows' || name === 'n8n_create_workflow')) {
          return await this.handleN8nManagementTool(name, args);
        }

        throw new Error(`Unknown tool: ${name}`);
        
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          ]
        };
      }
    });
  }

  private async handleListNodes(args: any) {
    const nodes = await this.repository.listNodes({
      category: args.category,
      search: args.search,
      limit: args.limit || 50
    });

    return {
      content: [
        {
          type: "text", 
          text: JSON.stringify({
            nodes,
            total: nodes.length,
            source: 'docker_container'
          }, null, 2)
        }
      ]
    };
  }

  private async handleGetNodeInfo(args: any) {
    const node = await this.repository.getNode(args.nodeType);
    if (!node) {
      throw new Error(`Node type '${args.nodeType}' not found`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ...node,
            source: 'docker_container'
          }, null, 2)
        }
      ]
    };
  }

  private async handleSearchNodes(args: any) {
    const results = await this.repository.searchNodes(args.query, args.limit || 20);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            results,
            query: args.query,
            total: results.length,
            source: 'docker_container'
          }, null, 2)
        }
      ]
    };
  }

  private async handleFindWorkflowsByName(args: any) {
    // This would need to be implemented to query workflows from n8n API
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message: "find_workflows_by_name requires n8n API integration",
            workflows: [],
            search_name: args.name
          }, null, 2)
        }
      ]
    };
  }

  private async handleDockerStatus() {
    const isRunning = await this.repository.isContainerRunning();
    const cacheStats = this.repository.getCacheStats();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            container_name: this.containerName,
            container_running: isRunning,
            cache_stats: cacheStats,
            api_configured: isN8nApiConfigured()
          }, null, 2)
        }
      ]
    };
  }

  private async handleN8nManagementTool(toolName: string, args: any) {
    // Simplified n8n handlers
    switch (toolName) {
      case 'n8n_list_workflows':
        return await n8nHandlers.handleListWorkflows(args);
      case 'n8n_create_workflow':
        return await n8nHandlers.handleCreateWorkflow(args);
      default:
        throw new Error(`n8n management tool '${toolName}' not implemented`);
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Docker-based n8n MCP server started');
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new DockerN8NServer();
  server.start().catch((error) => {
    logger.error('Failed to start Docker server:', error);
    process.exit(1);
  });
}