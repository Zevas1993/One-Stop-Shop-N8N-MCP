/**
 * Open WebUI Interface
 * 
 * Enables human interaction with n8n Co-Pilot through Open WebUI.
 * Open WebUI supports "Tools" (function calling) that we can register.
 * 
 * This interface:
 * 1. Exposes n8n operations as Open WebUI tools
 * 2. Provides a chat-based workflow building experience
 * 3. Uses the same validation gateway as agents (bulletproof)
 * 4. Leverages the embedded LLM for natural conversation
 * 
 * Open WebUI Integration Methods:
 * - Pipelines: Custom Python pipelines that call our HTTP API
 * - Functions: JavaScript functions that Open WebUI can execute
 * - Tools: OpenAI-compatible tool definitions
 */

import express, { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { getCore, CoreOrchestrator } from '../core';

// ============================================================================
// OPEN WEBUI TOOL DEFINITIONS
// ============================================================================

/**
 * Tool definitions in OpenAI function-calling format
 * Open WebUI uses these to understand what tools are available
 */
export const OPEN_WEBUI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_workflows',
      description: 'List all workflows in the connected n8n instance',
      parameters: {
        type: 'object',
        properties: {
          active: {
            type: 'boolean',
            description: 'Filter by active/inactive status',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of workflows to return (default: 20)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_workflow',
      description: 'Get details of a specific workflow by ID',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The workflow ID',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_workflow',
      description: 'Create a new workflow in n8n. The workflow will be validated before creation.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the workflow',
          },
          nodes: {
            type: 'array',
            description: 'Array of node configurations',
          },
          connections: {
            type: 'object',
            description: 'Node connections',
          },
        },
        required: ['name', 'nodes', 'connections'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'validate_workflow',
      description: 'Validate a workflow without creating it. Checks for errors and issues.',
      parameters: {
        type: 'object',
        properties: {
          workflow: {
            type: 'object',
            description: 'The workflow to validate',
          },
        },
        required: ['workflow'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_nodes',
      description: 'Search for available n8n nodes by name or description',
      parameters: {
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
  },
  {
    type: 'function',
    function: {
      name: 'get_node_info',
      description: 'Get detailed information about a specific node type',
      parameters: {
        type: 'object',
        properties: {
          nodeType: {
            type: 'string',
            description: 'The node type (e.g., "n8n-nodes-base.slack")',
          },
        },
        required: ['nodeType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_workflow',
      description: 'Execute a workflow by ID',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The workflow ID to execute',
          },
          data: {
            type: 'object',
            description: 'Optional input data for the workflow',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_system_status',
      description: 'Get the current status of the n8n Co-Pilot system',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_workflow',
      description: 'Get AI suggestions for building a workflow based on a description',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Description of what the workflow should do',
          },
        },
        required: ['description'],
      },
    },
  },
];

// ============================================================================
// TOOL HANDLERS
// ============================================================================

type ToolHandler = (params: any, core: CoreOrchestrator) => Promise<any>;

const toolHandlers: Record<string, ToolHandler> = {
  async list_workflows(params, core) {
    const connector = core.getConnector();
    const result = await connector.listWorkflows({
      active: params.active,
      limit: params.limit || 20,
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

  async get_workflow(params, core) {
    const connector = core.getConnector();
    const workflow = await connector.getWorkflow(params.id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }
    return { success: true, workflow };
  },

  async create_workflow(params, core) {
    const result = await core.createWorkflow({
      name: params.name,
      nodes: params.nodes,
      connections: params.connections,
    });
    return result;
  },

  async validate_workflow(params, core) {
    const result = await core.validateWorkflow(params.workflow);
    return {
      valid: result?.valid ?? false,
      errors: result?.errors || [],
      warnings: result?.warnings || [],
      passedLayers: result?.passedLayers || [],
    };
  },

  async search_nodes(params, core) {
    const nodes = core.searchNodes(params.query);
    return {
      success: true,
      count: nodes.length,
      nodes: nodes.slice(0, 20).map(n => ({
        name: n.name,
        displayName: n.displayName,
        description: n.description?.substring(0, 100),
        group: n.group,
      })),
    };
  },

  async get_node_info(params, core) {
    const catalog = core.getNodeCatalog();
    const node = catalog.getNode(params.nodeType);
    if (!node) {
      return { success: false, error: 'Node type not found' };
    }
    return {
      success: true,
      node: {
        name: node.name,
        displayName: node.displayName,
        description: node.description,
        version: node.version,
        inputs: node.inputs,
        outputs: node.outputs,
        properties: node.properties.slice(0, 10), // Limit for readability
        credentials: node.credentials,
      },
    };
  },

  async execute_workflow(params, core) {
    const connector = core.getConnector();
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

  async get_system_status(params, core) {
    return {
      success: true,
      status: core.getStatus(),
    };
  },

  async suggest_workflow(params, core) {
    const llm = core.getLLMBrain();
    if (!llm || !llm.isInitialized()) {
      return {
        success: false,
        error: 'LLM not available for suggestions',
      };
    }

    // Parse intent
    const intent = await llm.parseIntent(params.description);
    
    // Get node recommendations
    const catalog = core.getNodeCatalog();
    const allNodes = catalog.getAllNodes().map(n => n.name);
    const recommendations = await llm.recommendNodes(params.description, allNodes);

    return {
      success: true,
      intent,
      recommendations,
      suggestion: `Based on your description, I recommend using: ${recommendations.map(r => r.displayName).join(', ')}`,
    };
  },
};

// ============================================================================
// OPEN WEBUI API ROUTER
// ============================================================================

/**
 * Create Express router for Open WebUI integration
 */
export function createOpenWebUIRouter(): Router {
  const router = Router();

  /**
   * GET /openwebui/tools
   * Returns tool definitions for Open WebUI
   */
  router.get('/tools', (req: Request, res: Response) => {
    res.json({
      tools: OPEN_WEBUI_TOOLS,
    });
  });

  /**
   * POST /openwebui/execute
   * Execute a tool call from Open WebUI
   */
  router.post('/execute', async (req: Request, res: Response) => {
    try {
      const { tool, parameters } = req.body;

      if (!tool || typeof tool !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid tool name' });
      }

      const handler = toolHandlers[tool];
      if (!handler) {
        return res.status(404).json({ error: `Unknown tool: ${tool}` });
      }

      const core = getCore();
      if (!core.isReady()) {
        return res.status(503).json({ error: 'Core not ready' });
      }

      const result = await handler(parameters || {}, core);
      res.json(result);

    } catch (error: any) {
      logger.error('[OpenWebUI] Tool execution error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /openwebui/chat
   * Chat with the workflow assistant
   */
  router.post('/chat', async (req: Request, res: Response) => {
    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid message' });
      }

      const core = getCore();
      const response = await core.chat(message);
      
      res.json(response);

    } catch (error: any) {
      logger.error('[OpenWebUI] Chat error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /openwebui/status
   * Get system status for Open WebUI
   */
  router.get('/status', (req: Request, res: Response) => {
    try {
      const core = getCore();
      res.json({
        ready: core.isReady(),
        status: core.getStatus(),
      });
    } catch (error: any) {
      res.json({
        ready: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /openwebui/manifest
   * OpenAI-compatible manifest for Open WebUI Pipelines
   */
  router.get('/manifest', (req: Request, res: Response) => {
    res.json({
      schema_version: 'v1',
      name_for_human: 'n8n Co-Pilot',
      name_for_model: 'n8n_copilot',
      description_for_human: 'Build and manage n8n workflows through natural conversation',
      description_for_model: 'A tool for creating, managing, and executing n8n workflows. Use this when users want to automate tasks, create integrations, or work with n8n.',
      auth: {
        type: 'none',
      },
      api: {
        type: 'openapi',
        url: '/openwebui/openapi.json',
      },
      logo_url: '/openwebui/logo.png',
      contact_email: 'support@example.com',
      legal_info_url: 'https://example.com/legal',
    });
  });

  return router;
}

// ============================================================================
// OPEN WEBUI PIPELINE (PYTHON COMPATIBLE)
// ============================================================================

/**
 * Generate a Python pipeline file for Open WebUI
 * This can be installed directly in Open WebUI's Pipelines feature
 */
export function generateOpenWebUIPipeline(mcpServerUrl: string): string {
  return `"""
n8n Co-Pilot Pipeline for Open WebUI
Generated by n8n-mcp-server

This pipeline enables natural language workflow management.
Install this in Open WebUI > Admin > Pipelines
"""

from typing import List, Union, Generator, Iterator
from pydantic import BaseModel
import requests
import json

class Pipeline:
    class Valves(BaseModel):
        MCP_SERVER_URL: str = "${mcpServerUrl}"
        PRIORITY: int = 0

    def __init__(self):
        self.name = "n8n Co-Pilot"
        self.valves = self.Valves()

    async def on_startup(self):
        print(f"n8n Co-Pilot Pipeline starting, connecting to {self.valves.MCP_SERVER_URL}")

    async def on_shutdown(self):
        print("n8n Co-Pilot Pipeline shutting down")

    def pipe(
        self, user_message: str, model_id: str, messages: List[dict], body: dict
    ) -> Union[str, Generator, Iterator]:
        """
        Process user message and potentially call n8n tools
        """
        # Check if this is an n8n-related request
        n8n_keywords = ['workflow', 'n8n', 'automate', 'automation', 'trigger', 'node']
        is_n8n_request = any(kw in user_message.lower() for kw in n8n_keywords)

        if not is_n8n_request:
            # Not an n8n request, pass through
            return None

        try:
            # Call the chat endpoint
            response = requests.post(
                f"{self.valves.MCP_SERVER_URL}/openwebui/chat",
                json={"message": user_message},
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get('message', 'I processed your request.')
            else:
                return f"Error connecting to n8n Co-Pilot: {response.status_code}"
                
        except Exception as e:
            return f"Error: {str(e)}"
`;
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Open WebUI Function (for Function Calling feature)
 * This format is compatible with Open WebUI's built-in function system
 */
export function generateOpenWebUIFunction(functionName: string, tool: any): string {
  const params = tool.function.parameters.properties || {};
  const paramList = Object.keys(params).map(p => `${p}: ${params[p].type}`).join(', ');
  
  return `"""
${tool.function.description}
"""

async def ${functionName}(${paramList}) -> dict:
    import requests
    
    response = requests.post(
        "http://localhost:3001/openwebui/execute",
        json={
            "tool": "${tool.function.name}",
            "parameters": {
                ${Object.keys(params).map(p => `"${p}": ${p}`).join(',\n                ')}
            }
        }
    )
    
    return response.json()
`;
}

export default { createOpenWebUIRouter, OPEN_WEBUI_TOOLS, generateOpenWebUIPipeline };
