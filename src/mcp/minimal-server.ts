import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { NodeRepository } from '../database/node-repository';
import { DatabaseAdapter, createDatabaseAdapter } from '../database/database-adapter';

// Only the most essential tools for fast startup
const minimalTools = [
  {
    name: "list_nodes",
    description: "List all available n8n nodes with optional filtering",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Filter by node category"
        },
        search: {
          type: "string", 
          description: "Search in node names and descriptions"
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return",
          default: 50
        }
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
        nodeType: {
          type: "string",
          description: "The node type identifier (e.g., 'nodes-base.httpRequest')"
        }
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
        query: {
          type: "string",
          description: "Search query"
        },
        limit: {
          type: "number",
          description: "Maximum number of results",
          default: 20
        }
      },
      required: ["query"],
      additionalProperties: false
    }
  }
];

export class MinimalN8NServer {
  private server: Server;
  private db: DatabaseAdapter | null = null;
  private repository: NodeRepository | null = null;
  private initialized: Promise<void>;

  constructor() {
    // Find database
    const possiblePaths = [
      path.join(process.cwd(), 'data', 'nodes.db'),
      path.join(__dirname, '../../data', 'nodes.db'),
      './data/nodes.db'
    ];
    
    let dbPath: string | null = null;
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        dbPath = p;
        break;
      }
    }
    
    if (!dbPath) {
      logger.error('Database not found');
      throw new Error('Database nodes.db not found');
    }
    
    this.initialized = this.initializeDatabase(dbPath);
    
    this.server = new Server(
      {
        name: 'n8n-minimal-mcp',
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
  
  private async initializeDatabase(dbPath: string): Promise<void> {
    try {
      this.db = await createDatabaseAdapter(dbPath);
      this.repository = new NodeRepository(this.db);
      logger.info(`Minimal server initialized: ${dbPath}`);
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }
  
  private async ensureInitialized(): Promise<void> {
    await this.initialized;
    if (!this.db || !this.repository) {
      throw new Error('Database not initialized');
    }
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(InitializeRequestSchema, async () => {
      return {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'n8n-minimal-mcp',
          version: '1.0.0',
        },
      };
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: minimalTools
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      await this.ensureInitialized();
      
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "list_nodes":
            return await this.handleListNodes(args);
          case "get_node_info":
            return await this.handleGetNodeInfo(args);  
          case "search_nodes":
            return await this.handleSearchNodes(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
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
    if (!this.repository) throw new Error('Repository not initialized');
    
    const nodes = await this.repository.listNodes({
      category: args.category,
      search: args.search,
      limit: args.limit || 50
    });

    return {
      content: [
        {
          type: "text", 
          text: JSON.stringify(nodes, null, 2)
        }
      ]
    };
  }

  private async handleGetNodeInfo(args: any) {
    if (!this.repository) throw new Error('Repository not initialized');
    
    const node = await this.repository.getNode(args.nodeType);
    if (!node) {
      throw new Error(`Node type '${args.nodeType}' not found`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(node, null, 2)
        }
      ]
    };
  }

  private async handleSearchNodes(args: any) {
    if (!this.repository) throw new Error('Repository not initialized');
    
    const results = await this.repository.searchNodes(args.query, args.limit || 20);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2)
        }
      ]
    };
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Minimal n8n MCP server started');
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new MinimalN8NServer();
  server.start().catch((error) => {
    logger.error('Failed to start minimal server:', error);
    process.exit(1);
  });
}