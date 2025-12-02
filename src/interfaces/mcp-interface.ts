/**
 * MCP Interface
 * 
 * Exposes the n8n Co-Pilot core as MCP (Model Context Protocol) tools.
 * This is the interface that AI agents (like Claude) connect to.
 * 
 * Key Features:
 * 1. All workflow operations go through ValidationGateway
 * 2. Live node catalog from connected n8n instance
 * 3. Semantic validation via embedded LLM
 * 4. Clear error messages with fix suggestions
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger';
import { getCore, CoreOrchestrator, isCoreReady } from '../core';

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
    name: 'n8n_create_workflow',
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
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the workflow',
        },
        nodes: {
          type: 'array',
          description: 'Array of node configurations',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Unique node name' },
              type: { type: 'string', description: 'Node type (e.g., n8n-nodes-base.httpRequest)' },
              typeVersion: { type: 'number', description: 'Node version' },
              position: { type: 'array', items: { type: 'number' }, description: '[x, y] position' },
              parameters: { type: 'object', description: 'Node parameters' },
              credentials: { type: 'object', description: 'Credential references' },
            },
            required: ['name', 'type'],
          },
        },
        connections: {
          type: 'object',
          description: 'Node connections. Format: { "NodeName": { "main": [[{ "node": "TargetNode", "type": "main", "index": 0 }]] } }',
        },
        settings: {
          type: 'object',
          description: 'Workflow settings (optional)',
        },
      },
      required: ['name', 'nodes', 'connections'],
    },
  },
  {
    name: 'n8n_get_workflow',
    description: 'Get a workflow by ID from n8n',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Workflow ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'n8n_update_workflow',
    description: `Update an existing workflow. 
    
⚠️ IMPORTANT: Updates are validated before applying. Invalid updates will be rejected.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Workflow ID to update',
        },
        workflow: {
          type: 'object',
          description: 'Updated workflow data',
        },
      },
      required: ['id', 'workflow'],
    },
  },
  {
    name: 'n8n_delete_workflow',
    description: 'Delete a workflow from n8n',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Workflow ID to delete',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'n8n_list_workflows',
    description: 'List all workflows in n8n',
    inputSchema: {
      type: 'object',
      properties: {
        active: {
          type: 'boolean',
          description: 'Filter by active status',
        },
        limit: {
          type: 'number',
          description: 'Maximum workflows to return (default: 50)',
        },
      },
    },
  },
  {
    name: 'n8n_activate_workflow',
    description: 'Activate or deactivate a workflow',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Workflow ID',
        },
        active: {
          type: 'boolean',
          description: 'Whether to activate (true) or deactivate (false)',
        },
      },
      required: ['id', 'active'],
    },
  },

  // === VALIDATION ===
  {
    name: 'n8n_validate_workflow',
    description: `Validate a workflow without creating it.

Returns detailed validation results including:
- Schema errors
- Missing or invalid node types
- Connection problems
- Credential issues
- Semantic analysis (if LLM available)

Use this to check workflows before submitting them.`,
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          description: 'Workflow to validate',
        },
      },
      required: ['workflow'],
    },
  },

  // === EXECUTION ===
  {
    name: 'n8n_execute_workflow',
    description: 'Execute a workflow directly (requires workflow to be saved)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Workflow ID to execute',
        },
        data: {
          type: 'object',
          description: 'Input data for the workflow (optional)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'n8n_get_execution',
    description: 'Get details of a workflow execution',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Execution ID',
        },
        includeData: {
          type: 'boolean',
          description: 'Include execution data (default: false)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'n8n_list_executions',
    description: 'List workflow executions',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Filter by workflow ID',
        },
        status: {
          type: 'string',
          enum: ['running', 'success', 'error', 'waiting'],
          description: 'Filter by status',
        },
        limit: {
          type: 'number',
          description: 'Maximum executions to return (default: 20)',
        },
      },
    },
  },

  // === NODE DISCOVERY ===
  {
    name: 'n8n_search_nodes',
    description: `Search for available node types in this n8n instance.

⚠️ IMPORTANT: Always search for nodes before using them in workflows. 
Only nodes returned by this search are guaranteed to exist.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "slack", "http", "database")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'n8n_get_node_info',
    description: 'Get detailed information about a specific node type',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Node type (e.g., "n8n-nodes-base.httpRequest")',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'n8n_list_trigger_nodes',
    description: 'List all available trigger nodes (nodes that can start a workflow)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'n8n_list_ai_nodes',
    description: 'List all AI-capable nodes (LangChain, AI Agent, etc.)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // === SYSTEM ===
  {
    name: 'n8n_status',
    description: 'Get the status of the n8n Co-Pilot system including connection status, node count, and LLM availability',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'n8n_resync_catalog',
    description: 'Force a resync of the node catalog from n8n. Use if nodes seem out of date.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // === CREDENTIALS ===
  {
    name: 'n8n_list_credentials',
    description: 'List available credentials (names and types only, not secrets)',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Filter by credential type',
        },
      },
    },
  },
];

// ============================================================================
// TOOL HANDLERS
// ============================================================================

type ToolHandler = (params: any) => Promise<any>;

function createToolHandlers(core: CoreOrchestrator): Record<string, ToolHandler> {
  const connector = core.getConnector();
  const catalog = core.getNodeCatalog();

  return {
    // Workflow Management
    async n8n_create_workflow(params) {
      const result = await core.createWorkflow({
        name: params.name,
        nodes: params.nodes,
        connections: params.connections,
        settings: params.settings,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          validation: result.validation ? {
            errors: result.validation.errors,
            warnings: result.validation.warnings,
            passedLayers: result.validation.passedLayers,
            failedLayer: result.validation.failedLayer,
          } : undefined,
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
        return { success: false, error: 'Workflow not found' };
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
        message: 'Workflow updated successfully',
      };
    },

    async n8n_delete_workflow(params) {
      const success = await connector.deleteWorkflow(params.id);
      return {
        success,
        message: success ? 'Workflow deleted' : 'Failed to delete workflow',
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
        workflows: result.data.map(w => ({
          id: w.id,
          name: w.name,
          active: w.active,
          updatedAt: w.updatedAt,
        })),
      };
    },

    async n8n_activate_workflow(params) {
      const success = await connector.setWorkflowActive(params.id, params.active);
      return {
        success,
        message: success 
          ? `Workflow ${params.active ? 'activated' : 'deactivated'}`
          : 'Failed to change workflow status',
      };
    },

    // Validation
    async n8n_validate_workflow(params) {
      const result = await core.validateWorkflow(params.workflow);
      if (!result) {
        return { success: false, error: 'Validation not available' };
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
    async n8n_execute_workflow(params) {
      const execution = await connector.executeWorkflow(params.id, params.data);
      if (!execution) {
        return { success: false, error: 'Failed to execute workflow' };
      }
      return {
        success: true,
        executionId: execution.id,
        status: execution.status,
      };
    },

    async n8n_get_execution(params) {
      const execution = await connector.getExecution(params.id, params.includeData);
      if (!execution) {
        return { success: false, error: 'Execution not found' };
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
        executions: result.data.map(e => ({
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
      const nodes = catalog.searchNodes(params.query);
      return {
        success: true,
        count: nodes.length,
        nodes: nodes.slice(0, 30).map(n => ({
          type: n.name,
          displayName: n.displayName,
          description: n.description?.substring(0, 150),
          group: n.group,
          version: n.version,
        })),
      };
    },

    async n8n_get_node_info(params) {
      const node = catalog.getNode(params.nodeType);
      if (!node) {
        // Try to find similar nodes
        const similar = catalog.searchNodes(params.nodeType.split('.').pop() || params.nodeType)
          .slice(0, 5)
          .map(n => n.name);
        
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
      const triggers = catalog.getTriggerNodes();
      return {
        success: true,
        count: triggers.length,
        triggers: triggers.map(n => ({
          type: n.name,
          displayName: n.displayName,
          description: n.description?.substring(0, 100),
        })),
      };
    },

    async n8n_list_ai_nodes() {
      const aiNodes = catalog.getAINodes();
      return {
        success: true,
        count: aiNodes.length,
        nodes: aiNodes.map(n => ({
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
      await connector.resyncCatalog();
      const stats = catalog.getStats();
      return {
        success: true,
        message: 'Catalog resynced',
        nodeCount: stats.totalNodes,
        lastSync: stats.lastSyncTime,
      };
    },

    // Credentials
    async n8n_list_credentials(params) {
      const credentials = await connector.listCredentials({ type: params.type });
      return {
        success: true,
        count: credentials.length,
        credentials: credentials.map(c => ({
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

  constructor() {
    this.server = new Server(
      {
        name: 'n8n-copilot-mcp',
        version: '3.0.0',
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
      throw new Error('Core not ready - ensure initCore() was called first');
    }

    // Create handlers
    this.handlers = createToolHandlers(core);

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
              type: 'text',
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
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        logger.error(`[MCP] Tool ${name} error:`, error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: error.message }),
            },
          ],
        };
      }
    });

    // Connect to transport (stdio for Claude Desktop)
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('[MCP] Server started');
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
