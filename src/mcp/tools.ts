import { ToolDefinition } from '../types';

/**
 * n8n Documentation MCP Tools - FINAL OPTIMIZED VERSION
 * 
 * Incorporates all lessons learned from real workflow building.
 * Designed to help AI agents avoid common pitfalls and build workflows efficiently.
 */
export const n8nDocumentationToolsFinal: ToolDefinition[] = [
  {
    name: 'get_workflow_guide',
    description: `Get workflow building guidance for specific scenarios. Returns patterns and configurations.`,
    inputSchema: {
      type: 'object',
      properties: {
        scenario: {
          type: 'string',
          enum: ['webhook_to_api', 'ai_agent_tools', 'data_processing', 'notification_system', 'database_operations', 'file_handling'],
          description: 'Specific workflow scenario. Returns exact node configurations and connection patterns.',
        },
      },
    },
  },
  {
    name: 'get_node_info',
    description: `🔍 GET NODE DETAILS: Use when you need to configure a specific node. Always use 'essentials' first (5KB), then 'complete' if needed (50KB). NEVER guess node parameters - always get them from this tool.`,
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Full node type. Examples: "nodes-base.slack", "nodes-base.httpRequest", "nodes-langchain.openAi". Use exact values from list_nodes.',
        },
        detail: {
          type: 'string',
          enum: ['essentials', 'complete', 'ai_tool'],
          description: 'essentials=required+common properties (~5KB, fast). complete=full schema (~50KB, thorough). ai_tool=AI connection guidance (~10KB).',
          default: 'essentials'
        }
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'find_nodes',
    description: `🔎 FIND NODES: FIRST STEP for any workflow. Search for nodes by service name (e.g., "slack", "gmail") or task (e.g., "webhook", "database"). Use this before get_node_info.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term. Examples: "slack", "email", "http". Searches names and descriptions.',
        },
        category: {
          type: 'string',
          enum: ['trigger', 'transform', 'output', 'input', 'AI', 'ai_tools'],
          description: 'Node category. trigger=workflow starters, AI=LangChain nodes, ai_tools=optimized for AI agents.',
        },
        limit: {
          type: 'number',
          description: 'Results limit. Default 50.',
          default: 50,
        },
      },
    },
  },
  {
    name: 'get_node_summary',
    description: `⚡ QUICK NODE CHECK: Ultra-fast overview (<1KB). Use for browsing/discovery. For actual workflow building, use get_node_info with 'essentials'.`,
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Full node type. Examples: "nodes-base.slack", "nodes-base.httpRequest". Use exact values from find_nodes.',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'check_compatibility',
    description: `🔗 CONNECTION CHECK: Quick compatibility test between two nodes. Use before building connections. Prevents "nodes can't connect" errors.`,
    inputSchema: {
      type: 'object',
      properties: {
        sourceNode: {
          type: 'string',
          description: 'Source node type (e.g., "nodes-base.webhook")',
        },
        targetNode: {
          type: 'string',
          description: 'Target node type (e.g., "nodes-base.slack")',
        },
      },
      required: ['sourceNode', 'targetNode'],
    },
  },
  {
    name: 'validate_before_adding',
    description: `Quick pre-flight check if node will work in workflow context. Prevents common placement errors.`,
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Node type to validate for placement',
        },
        workflowContext: {
          type: 'object',
          properties: {
            existingNodes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of existing node types in workflow',
            },
            targetPosition: {
              type: 'string',
              enum: ['start', 'middle', 'end'],
              description: 'Where in workflow this node will be placed',
            },
          },
          required: ['existingNodes', 'targetPosition'],
        },
      },
      required: ['nodeType', 'workflowContext'],
    },
  },
  {
    name: 'get_database_statistics',
    description: `Get n8n ecosystem stats and server metrics. Returns node counts and performance data.`,
    inputSchema: {
      type: 'object',
      properties: {
        includePerformance: {
          type: 'boolean',
          description: 'Include cache hit rates and response time metrics. Default true.',
          default: true
        }
      },
    },
  },
  {
    name: 'get_node_config',
    description: `Get node configuration help: pre-configured settings, property search, or dependencies.`,
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Full node type. Required for property search and dependencies.',
        },
        mode: {
          type: 'string',
          enum: ['task', 'search_properties', 'dependencies', 'list_tasks'],
          description: 'task=get pre-configured settings, search_properties=find specific properties, dependencies=analyze property relationships, list_tasks=see available tasks.',
          default: 'task'
        },
        task: {
          type: 'string',
          description: 'Task name for mode=task. Examples: post_json_request, receive_webhook, send_slack_message.',
        },
        query: {
          type: 'string',
          description: 'Property search term for mode=search_properties. Examples: "auth", "header", "body".',
        },
        config: {
          type: 'object',
          description: 'Current configuration for mode=dependencies. Analyzes visibility impact.',
        }
      },
    },
  },
  {
    name: 'validate_node',
    description: `🔧 VALIDATE SINGLE NODE: Check if your node configuration is correct before adding to workflow. Catches missing properties, wrong types, invalid values.`,
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Node type to validate. Example: "nodes-base.slack".',
        },
        config: {
          type: 'object',
          description: 'Node configuration to validate.',
        },
        mode: {
          type: 'string',
          enum: ['minimal', 'full'],
          description: 'minimal=required fields only (fast), full=complete validation (thorough).',
          default: 'full'
        },
      },
      required: ['nodeType', 'config'],
    },
  },
  {
    name: 'get_template',
    description: `📋 GET TEMPLATE: Download complete working workflow by ID. Use after find_templates to get actual workflow JSON you can modify and deploy.`,
    inputSchema: {
      type: 'object',
      properties: {
        templateId: {
          type: 'number',
          description: 'The template ID to retrieve',
        },
      },
      required: ['templateId'],
    },
  },
  {
    name: 'validate_workflow',
    description: `🔍 CRITICAL: Always validate workflows BEFORE creating them! Catches credential placement errors, disconnected nodes, invalid connections, and other common issues. Use this tool before n8n_create_workflow to prevent broken workflows.`,
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          description: 'The complete workflow JSON to validate. Must include nodes array and connections object. Not needed for remote mode.',
        },
        workflowId: {
          type: 'string',
          description: 'Workflow ID to validate from n8n instance (only for remote mode). Requires N8N_API_URL and N8N_API_KEY.',
        },
        mode: {
          type: 'string',
          enum: ['quick', 'full', 'structure', 'connections', 'expressions', 'nodes', 'remote'],
          description: 'Validation mode. quick=basic checks only (<2KB response), full=complete validation. Other modes focus on specific areas.',
          default: 'full',
        },
        options: {
          type: 'object',
          properties: {
            validateNodes: {
              type: 'boolean',
              description: 'Validate individual node configurations. Default true for full mode.',
              default: true,
            },
            validateConnections: {
              type: 'boolean',
              description: 'Validate node connections and flow. Default true for full mode.',
              default: true,
            },
            validateExpressions: {
              type: 'boolean',
              description: 'Validate n8n expressions syntax and references. Default true for full mode.',
              default: true,
            },
            profile: {
              type: 'string',
              enum: ['minimal', 'runtime', 'ai-friendly', 'strict'],
              description: 'Validation profile for node validation. Default "runtime".',
              default: 'runtime',
            },
          },
          description: 'Optional validation settings. Mode automatically sets appropriate defaults.',
        },
      },
      required: [],
    },
  },
  // Missing tools that were in HandlerRegistry but not in tool definitions
  {
    name: 'list_nodes',
    description: '📋 LIST ALL NODES: Browse the complete catalog of 526 nodes. Use category filter to narrow down (trigger, AI, transform). START HERE for workflow discovery.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['trigger', 'transform', 'output', 'input', 'AI', 'ai_tools'],
          description: 'Node category filter. trigger=workflow starters, AI=LangChain nodes, ai_tools=optimized for AI agents.',
        },
        package: {
          type: 'string',
          description: 'Package filter. Examples: "n8n-nodes-base", "@n8n/n8n-nodes-langchain".',
        },
        limit: {
          type: 'number',
          description: 'Results limit. Default 100.',
          default: 100,
        },
      },
    },
  },
  {
    name: 'search_nodes',
    description: '🔍 SMART SEARCH: Powerful full-text search across 526 nodes. Use when you know what you want but not which node does it (e.g., "send email", "database query").',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query. Searches names, descriptions, and documentation.',
        },
        limit: {
          type: 'number',
          description: 'Results limit. Default 50.',
          default: 50,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_node_essentials',
    description: '⚡ ESSENTIAL CONFIG: Get only the 10-20 most important properties with examples (95% smaller than complete). PERFECT for quick workflow building.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Full node type. Examples: "nodes-base.slack", "nodes-base.httpRequest".',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'search_node_properties',
    description: '🎯 FIND PROPERTY: Search for specific settings within a node (e.g., "auth", "headers"). Use when you need ONE specific property without downloading 50KB.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Full node type to search within.',
        },
        query: {
          type: 'string',
          description: 'Property search term. Examples: "auth", "header", "body".',
        },
      },
      required: ['nodeType', 'query'],
    },
  },
  {
    name: 'get_node_as_tool_info',
    description: 'Get specific information about using ANY node as an AI tool. Connection guidance.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Full node type to get AI tool information for.',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'get_node_for_task',
    description: 'Get pre-configured node settings for common tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Task name. Examples: "post_json_request", "receive_webhook", "send_slack_message".',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List all available task templates.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'validate_node_operation',
    description: 'Verify node configuration with operation awareness and profiles.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Node type to validate.',
        },
        config: {
          type: 'object',
          description: 'Node configuration to validate.',
        },
        operation: {
          type: 'string',
          description: 'Specific operation being performed.',
        },
        profile: {
          type: 'string',
          enum: ['minimal', 'runtime', 'ai-friendly', 'strict'],
          description: 'Validation profile. Default "runtime".',
          default: 'runtime',
        },
      },
      required: ['nodeType', 'config'],
    },
  },
  {
    name: 'validate_node_minimal',
    description: 'Quick validation for just required fields.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Node type to validate.',
        },
        config: {
          type: 'object',
          description: 'Node configuration to validate.',
        },
      },
      required: ['nodeType', 'config'],
    },
  },
  {
    name: 'validate_workflow_connections',
    description: '🔍 Check workflow structure and connections for disconnected nodes and invalid connections. Use BEFORE creating workflows.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          description: 'Complete workflow JSON to validate connections.',
        },
      },
      required: ['workflow'],
    },
  },
  {
    name: 'validate_workflow_expressions',
    description: 'Validate all n8n expressions in a workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          description: 'Complete workflow JSON to validate expressions.',
        },
      },
      required: ['workflow'],
    },
  },
  {
    name: 'get_property_dependencies',
    description: 'Analyze property dependencies and visibility conditions.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Node type to analyze.',
        },
        config: {
          type: 'object',
          description: 'Current configuration for dependency analysis.',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'list_ai_tools',
    description: 'List all AI-capable nodes with usage guidance.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Results limit. Default 50.',
          default: 50,
        },
      },
    },
  },
  {
    name: 'get_node_documentation',
    description: 'Get parsed documentation from n8n-docs.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Node type to get documentation for.',
        },
      },
      required: ['nodeType'],
    },
  },
  {
    name: 'list_node_templates',
    description: 'Find workflow templates using specific nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of node types to search for in templates.',
        },
        limit: {
          type: 'number',
          description: 'Results limit. Default 20.',
          default: 20,
        },
      },
      required: ['nodeTypes'],
    },
  },
  {
    name: 'get_templates_for_task',
    description: 'Get curated templates for common tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          enum: ['ai_automation', 'data_sync', 'webhook_processing', 'email_automation', 'slack_integration', 'data_transformation', 'file_processing', 'scheduling', 'api_integration', 'database_operations'],
          description: 'Task category for templates.',
        },
        limit: {
          type: 'number',
          description: 'Results limit. Default 20.',
          default: 20,
        },
      },
      required: ['task'],
    },
  },
];

/**
 * QUICK REFERENCE for AI Agents:
 * 
 * 1. RECOMMENDED WORKFLOW:
 *    - Start: search_nodes → get_node_essentials → get_node_for_task → validate_node_operation
 *    - Discovery: list_nodes({category:"trigger"}) for browsing categories
 *    - Quick Config: get_node_essentials("nodes-base.httpRequest") - only essential properties
 *    - Full Details: get_node_info only when essentials aren't enough
 *    - Validation: Use validate_node_operation for complex nodes (Slack, Google Sheets, etc.)
 * 
 * 2. COMMON NODE TYPES:
 *    Triggers: webhook, schedule, emailReadImap, slackTrigger
 *    Core: httpRequest, code, set, if, merge, splitInBatches
 *    Integrations: slack, gmail, googleSheets, postgres, mongodb
 *    AI: agent, openAi, chainLlm, documentLoader
 * 
 * 3. SEARCH TIPS:
 *    - search_nodes returns ANY word match (OR logic)
 *    - Single words more precise, multiple words broader
 *    - If no results: use list_nodes with category filter
 * 
 * 4. TEMPLATE SEARCHING:
 *    - To find templates using Slack node: list_node_templates(["n8n-nodes-base.slack"])
 *    - For task-based templates: get_templates_for_task("slack_integration")
 *    - 399 templates available from the last year
 * 
 * 5. KNOWN ISSUES:
 *    - Some nodes have duplicate properties with different conditions
 *    - Package names: use 'n8n-nodes-base' not '@n8n/n8n-nodes-base'
 *    - Check showWhen/hideWhen to identify the right property variant
 * 
 * 6. PERFORMANCE:
 *    - get_node_essentials: Fast (<5KB)
 *    - get_node_info: Slow (100KB+) - use sparingly
 *    - search_nodes/list_nodes: Fast, cached
 */