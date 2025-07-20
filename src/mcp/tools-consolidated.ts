import { ToolDefinition } from '../types';

/**
 * Consolidated MCP Tools - 8 Essential Tools
 * 
 * Reduces 60+ tools to 8 essential tools while preserving ALL capabilities.
 * Designed to eliminate AI agent choice paralysis and enforce proper workflows.
 */
export const consolidatedTools: ToolDefinition[] = [
  {
    name: 'node_discovery',
    description: `🔍 UNIFIED NODE DISCOVERY: Find, search, and get information about n8n nodes. Replaces 12 separate tools with one powerful interface.

🎯 ACTIONS:
• "search" - Find nodes by service/task (e.g., "slack", "email") 
• "list" - Browse nodes by category (trigger, AI, transform, etc.)
• "info" - Get node configuration details (summary/essentials/complete/ai_tool/docs)
• "ai_tools" - List all AI-capable nodes with usage guidance
• "find_property" - Search for specific settings within a node  
• "get_task" - Get pre-configured settings for common tasks

📋 WORKFLOW: Use this FIRST for any workflow building!
1️⃣ node_discovery({action: "search", query: "slack"}) 
2️⃣ node_discovery({action: "info", nodeType: "nodes-base.slack", detail: "essentials"})
3️⃣ node_discovery({action: "get_task", task: "send_slack_message"})`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'list', 'info', 'ai_tools', 'find_property', 'get_task'],
          description: 'Discovery action to perform'
        },
        query: {
          type: 'string',
          description: 'Search term for "search" or "find_property" actions'
        },
        category: {
          type: 'string',
          enum: ['trigger', 'transform', 'output', 'input', 'AI', 'ai_tools'],
          description: 'Node category filter for "list" action'
        },
        nodeType: {
          type: 'string',
          description: 'Full node type for "info" or "find_property" actions (e.g., "nodes-base.slack")'
        },
        detail: {
          type: 'string',
          enum: ['summary', 'essentials', 'complete', 'ai_tool', 'documentation'],
          description: 'Information detail level for "info" action',
          default: 'essentials'
        },
        task: {
          type: 'string',
          description: 'Task name for "get_task" action (e.g., "send_slack_message")'
        },
        limit: {
          type: 'number',
          description: 'Results limit (default: 50)',
          default: 50
        }
      },
      required: ['action']
    }
  },

  {
    name: 'node_validation',
    description: `🔧 UNIFIED NODE VALIDATION: Validate node configurations, check compatibility, and analyze dependencies. Replaces 6 separate validation tools.

🎯 ACTIONS:
• "validate" - Full node configuration validation (minimal/full modes)
• "compatibility" - Check if two nodes can connect
• "dependencies" - Analyze property dependencies and visibility
• "pre_flight" - Check if node fits in workflow context

⚡ MODES:
• minimal - Required fields only (fast)
• full - Complete validation (thorough)  
• operation - Operation-aware validation

🔗 Use BEFORE adding nodes to workflows!`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['validate', 'compatibility', 'dependencies', 'pre_flight'],
          description: 'Validation action to perform'
        },
        nodeType: {
          type: 'string',
          description: 'Node type to validate (required for all actions)'
        },
        config: {
          type: 'object',
          description: 'Node configuration to validate (for "validate" action)'
        },
        operation: {
          type: 'string',
          description: 'Specific operation for operation-aware validation'
        },
        mode: {
          type: 'string',
          enum: ['minimal', 'full'],
          description: 'Validation depth for "validate" action',
          default: 'full'
        },
        targetNode: {
          type: 'string',
          description: 'Target node type for "compatibility" action'
        },
        workflowContext: {
          type: 'object',
          properties: {
            existingNodes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Existing node types in workflow'
            },
            targetPosition: {
              type: 'string',
              enum: ['start', 'middle', 'end'],
              description: 'Where node will be placed'
            }
          },
          description: 'Workflow context for "pre_flight" action'
        }
      },
      required: ['action', 'nodeType']
    }
  },

  {
    name: 'workflow_manager',
    description: `🚨 UNIFIED WORKFLOW MANAGER: Validate, create, and manage workflows. Replaces 10+ workflow tools. ENFORCES validation-first workflow!

🎯 ACTIONS:
• "validate" - MANDATORY FIRST STEP before create! (full/quick/connections/expressions modes)
• "create" - Create workflow (BLOCKED without validation!)
• "get" - Download workflow by ID
• "update" - Update existing workflow  
• "list" - List workflows with filters
• "search" - Find workflows by name

🚨 ENFORCED WORKFLOW:
1️⃣ workflow_manager({action: "validate", workflow: {...}}) 
2️⃣ Fix ALL errors from validation
3️⃣ workflow_manager({action: "create", workflow: {...}})

⛔ CREATE WILL BE BLOCKED WITHOUT VALIDATION!`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['validate', 'create', 'get', 'update', 'list', 'search'],
          description: 'Workflow management action'
        },
        workflow: {
          type: 'object',
          description: 'Complete workflow JSON (required for validate/create actions)'
        },
        id: {
          type: 'string',
          description: 'Workflow ID (required for get/update actions)'
        },
        mode: {
          type: 'string',
          enum: ['quick', 'full', 'connections', 'expressions', 'nodes'],
          description: 'Validation mode for "validate" action',
          default: 'full'
        },
        changes: {
          type: 'object',
          description: 'Changes to apply for "update" action'
        },
        filters: {
          type: 'object',
          properties: {
            active: { type: 'boolean' },
            tags: { type: 'array', items: { type: 'string' } },
            limit: { type: 'number' }
          },
          description: 'Filters for "list" action'
        },
        query: {
          type: 'string',
          description: 'Search query for "search" action'
        },
        options: {
          type: 'object',
          properties: {
            validateNodes: { type: 'boolean' },
            validateConnections: { type: 'boolean' },
            validateExpressions: { type: 'boolean' },
            profile: {
              type: 'string',
              enum: ['minimal', 'runtime', 'ai-friendly', 'strict'],
              default: 'runtime'
            }
          },
          description: 'Validation options for "validate" action'
        }
      },
      required: ['action']
    }
  },

  {
    name: 'workflow_execution',
    description: `⚡ UNIFIED WORKFLOW EXECUTION: Trigger, monitor, and manage workflow executions. Replaces 4 execution tools.

🎯 ACTIONS:
• "trigger" - Execute workflow via webhook URL
• "get" - Get execution details by ID
• "list" - List executions with filters
• "delete" - Delete execution records

🚀 PREREQUISITES:
• Workflow must be ACTIVE in n8n
• Must have webhook trigger node for "trigger" action
• HTTP method must match webhook configuration`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['trigger', 'get', 'list', 'delete'],
          description: 'Execution action to perform'
        },
        webhookUrl: {
          type: 'string',
          description: 'Full webhook URL for "trigger" action'
        },
        httpMethod: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP method for "trigger" action (default: POST)',
          default: 'POST'
        },
        data: {
          type: 'object',
          description: 'Data to send with webhook for "trigger" action'
        },
        headers: {
          type: 'object',
          description: 'HTTP headers for "trigger" action'
        },
        id: {
          type: 'string',
          description: 'Execution ID for "get" or "delete" actions'
        },
        filters: {
          type: 'object',
          properties: {
            workflowId: { type: 'string' },
            status: { type: 'string', enum: ['success', 'error', 'waiting'] },
            limit: { type: 'number' },
            includeData: { type: 'boolean' }
          },
          description: 'Filters for "list" action'
        },
        waitForResponse: {
          type: 'boolean',
          description: 'Wait for completion for "trigger" action (default: true)',
          default: true
        }
      },
      required: ['action']
    }
  },

  {
    name: 'templates_and_guides',
    description: `📋 UNIFIED TEMPLATES & GUIDES: Get workflow templates, guides, and examples. Replaces 6 separate tools.

🎯 ACTIONS:
• "guide" - Get workflow building guidance for scenarios
• "template" - Download complete workflow template by ID
• "search_templates" - Find templates using specific nodes
• "task_templates" - Get curated templates for common tasks
• "list_tasks" - Show all available task templates
• "stats" - Get database statistics and metrics

🎯 SCENARIOS: webhook_to_api, ai_agent_tools, data_processing, notification_system, database_operations, file_handling

📋 PERFECT starting point for workflow building!`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['guide', 'template', 'search_templates', 'task_templates', 'list_tasks', 'stats'],
          description: 'Template/guide action to perform'
        },
        scenario: {
          type: 'string',
          enum: ['webhook_to_api', 'ai_agent_tools', 'data_processing', 'notification_system', 'database_operations', 'file_handling'],
          description: 'Workflow scenario for "guide" action'
        },
        templateId: {
          type: 'number',
          description: 'Template ID for "template" action'
        },
        nodeTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Node types to search for in "search_templates" action'
        },
        task: {
          type: 'string',
          enum: ['ai_automation', 'data_sync', 'webhook_processing', 'email_automation', 'slack_integration', 'data_transformation', 'file_processing', 'scheduling', 'api_integration', 'database_operations'],
          description: 'Task category for "task_templates" action'
        },
        limit: {
          type: 'number',
          description: 'Results limit (default: 20)',
          default: 20
        },
        includePerformance: {
          type: 'boolean',
          description: 'Include performance metrics for "stats" action',
          default: true
        }
      },
      required: ['action']
    }
  },

  {
    name: 'visual_verification',
    description: `👁️ UNIFIED VISUAL VERIFICATION: Advanced visual analysis with computer vision, OCR, and intelligence. Replaces 15+ visual tools. (OPTIONAL - Requires setup)

🎯 ACTIONS:
• "setup" - Initialize visual verification system
• "analyze" - Comprehensive visual and intelligence analysis
• "detect_issues" - Visual issue detection with auto-fix suggestions
• "monitor_start" - Start real-time execution monitoring
• "monitor_stop" - Stop execution monitoring
• "monitor_status" - Get monitoring status
• "live_data" - Get live execution data
• "intelligence" - Generate workflow intelligence report
• "compare" - Advanced workflow state comparison
• "screenshot" - Take workflow screenshot
• "cleanup" - Cleanup visual verification system

⚠️ ADVANCED FEATURE: Requires browser automation and n8n UI access`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['setup', 'analyze', 'detect_issues', 'monitor_start', 'monitor_stop', 'monitor_status', 'live_data', 'intelligence', 'compare', 'screenshot', 'cleanup'],
          description: 'Visual verification action'
        },
        workflowId: {
          type: 'string',
          description: 'Workflow ID for most actions'
        },
        n8nUrl: {
          type: 'string',
          description: 'n8n instance URL for "setup" action'
        },
        credentials: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            password: { type: 'string' }
          },
          description: 'n8n credentials for "setup" action'
        },
        config: {
          type: 'object',
          description: 'Configuration options for "setup" action'
        },
        analysisLevel: {
          type: 'string',
          enum: ['basic', 'comprehensive', 'deep'],
          description: 'Analysis depth for "analyze" action',
          default: 'comprehensive'
        },
        detectionTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Issue detection types for "detect_issues" action'
        }
      },
      required: ['action']
    }
  },

  {
    name: 'n8n_system',
    description: `⚙️ UNIFIED SYSTEM OPERATIONS: Check health, diagnose issues, and manage n8n system. Single tool for all system management.

🎯 OPERATIONS:
• "health" - Check n8n API connectivity and status
• "diagnose" - Troubleshoot connection and configuration issues  
• "list_tools" - Show all available MCP tools and capabilities

💡 Use "health" first to verify n8n connection before other operations!`,
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['health', 'diagnose', 'list_tools'],
          description: 'System operation to perform',
          default: 'health'
        },
        verbose: {
          type: 'boolean',
          description: 'Include detailed debug info for "diagnose" operation',
          default: false
        }
      }
    }
  },

  {
    name: 'workflow_diff',
    description: `🔄 ADVANCED WORKFLOW DIFF: Update workflows using precise diff operations. Specialized tool for incremental changes without sending entire workflow.

🎯 REQUIRED PARAMETERS BY OPERATION:

📦 addNode:
  - type: "addNode"
  - node: { name: "string", type: "n8n-nodes-base.X", position: [x,y], parameters: {} }

🗑️ removeNode:
  - type: "removeNode"  
  - nodeId: "string" OR nodeName: "string" (one required)

✏️ updateNode:
  - type: "updateNode"
  - nodeId: "string" OR nodeName: "string" (one required)  
  - changes: { "parameters.field": newValue, "name": "newName" }

🔗 addConnection:
  - type: "addConnection"
  - source: "sourceNodeName" (required)
  - target: "targetNodeName" (required)
  - sourceOutput: "main" (optional, default: "main")
  - targetInput: "main" (optional, default: "main")

📋 EXAMPLES:
Add Slack node: {"type":"addNode","node":{"name":"Send Alert","type":"n8n-nodes-base.slack","position":[400,200],"parameters":{"channel":"#alerts"}}}
Update webhook path: {"type":"updateNode","nodeName":"Webhook","changes":{"parameters.path":"new-path"}}
Connect nodes: {"type":"addConnection","source":"Webhook","target":"Send Alert"}

🚀 TRANSACTIONAL: All operations succeed or all fail (max 5 operations)
🧠 SMART DEPENDENCIES: Engine handles node/connection order automatically`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Workflow ID to update (required)'
        },
        operations: {
          type: 'array',
          description: 'Array of diff operations (max 5)',
          maxItems: 5,
          items: {
            oneOf: [
              {
                type: 'object',
                description: 'Add new node with full configuration',
                properties: {
                  type: { const: 'addNode' },
                  description: { type: 'string' },
                  node: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: 'Unique node name' },
                      type: { type: 'string', description: 'Node type (e.g., n8n-nodes-base.slack)' },
                      position: { 
                        type: 'array', 
                        items: { type: 'number' }, 
                        minItems: 2, 
                        maxItems: 2,
                        description: 'Node position [x, y]'
                      },
                      parameters: { type: 'object', description: 'Node configuration parameters' }
                    },
                    required: ['name', 'type', 'position'],
                    additionalProperties: true
                  }
                },
                required: ['type', 'node'],
                additionalProperties: false
              },
              {
                type: 'object',
                description: 'Remove node by ID or name',
                properties: {
                  type: { const: 'removeNode' },
                  description: { type: 'string' },
                  nodeId: { type: 'string', description: 'Node ID (alternative to nodeName)' },
                  nodeName: { type: 'string', description: 'Node name (alternative to nodeId)' }
                },
                required: ['type'],
                anyOf: [
                  { required: ['nodeId'] },
                  { required: ['nodeName'] }
                ],
                additionalProperties: false
              },
              {
                type: 'object',
                description: 'Update node properties with changes object',
                properties: {
                  type: { const: 'updateNode' },
                  description: { type: 'string' },
                  nodeId: { type: 'string', description: 'Node ID (alternative to nodeName)' },
                  nodeName: { type: 'string', description: 'Node name (alternative to nodeId)' },
                  changes: { 
                    type: 'object', 
                    description: 'Object with property paths and new values (e.g., {"parameters.field": "value"})' 
                  }
                },
                required: ['type', 'changes'],
                anyOf: [
                  { required: ['nodeId'] },
                  { required: ['nodeName'] }
                ],
                additionalProperties: false
              },
              {
                type: 'object',
                description: 'Move node to new position',
                properties: {
                  type: { const: 'moveNode' },
                  description: { type: 'string' },
                  nodeId: { type: 'string', description: 'Node ID (alternative to nodeName)' },
                  nodeName: { type: 'string', description: 'Node name (alternative to nodeId)' },
                  position: { 
                    type: 'array', 
                    items: { type: 'number' }, 
                    minItems: 2, 
                    maxItems: 2,
                    description: 'New position [x, y]'
                  }
                },
                required: ['type', 'position'],
                anyOf: [
                  { required: ['nodeId'] },
                  { required: ['nodeName'] }
                ],
                additionalProperties: false
              },
              {
                type: 'object',
                description: 'Add connection between nodes',
                properties: {
                  type: { const: 'addConnection' },
                  description: { type: 'string' },
                  source: { type: 'string', description: 'Source node name (required)' },
                  target: { type: 'string', description: 'Target node name (required)' },
                  sourceOutput: { type: 'string', description: 'Source output type (default: main)', default: 'main' },
                  targetInput: { type: 'string', description: 'Target input type (default: main)', default: 'main' },
                  sourceOutputIndex: { type: 'number', description: 'Source output index (default: 0)', default: 0 },
                  targetInputIndex: { type: 'number', description: 'Target input index (default: 0)', default: 0 }
                },
                required: ['type', 'source', 'target'],
                additionalProperties: false
              },
              {
                type: 'object',
                description: 'Remove connection between nodes',
                properties: {
                  type: { const: 'removeConnection' },
                  description: { type: 'string' },
                  source: { type: 'string', description: 'Source node name (required)' },
                  target: { type: 'string', description: 'Target node name (required)' },
                  sourceOutput: { type: 'string', description: 'Source output type (default: main)', default: 'main' },
                  targetInput: { type: 'string', description: 'Target input type (default: main)', default: 'main' }
                },
                required: ['type', 'source', 'target'],
                additionalProperties: false
              },
              {
                type: 'object',
                description: 'Enable node for execution',
                properties: {
                  type: { const: 'enableNode' },
                  description: { type: 'string' },
                  nodeId: { type: 'string', description: 'Node ID (alternative to nodeName)' },
                  nodeName: { type: 'string', description: 'Node name (alternative to nodeId)' }
                },
                required: ['type'],
                anyOf: [
                  { required: ['nodeId'] },
                  { required: ['nodeName'] }
                ],
                additionalProperties: false
              },
              {
                type: 'object',
                description: 'Disable node from execution',
                properties: {
                  type: { const: 'disableNode' },
                  description: { type: 'string' },
                  nodeId: { type: 'string', description: 'Node ID (alternative to nodeName)' },
                  nodeName: { type: 'string', description: 'Node name (alternative to nodeId)' }
                },
                required: ['type'],
                anyOf: [
                  { required: ['nodeId'] },
                  { required: ['nodeName'] }
                ],
                additionalProperties: false
              },
              {
                type: 'object',
                description: 'Update workflow settings',
                properties: {
                  type: { const: 'updateSettings' },
                  description: { type: 'string' },
                  settings: { 
                    type: 'object',
                    description: 'Workflow settings object'
                  }
                },
                required: ['type', 'settings'],
                additionalProperties: false
              },
              {
                type: 'object',
                description: 'Update workflow name',
                properties: {
                  type: { const: 'updateName' },
                  description: { type: 'string' },
                  name: { type: 'string', description: 'New workflow name' }
                },
                required: ['type', 'name'],
                additionalProperties: false
              },
              {
                type: 'object',
                description: 'Add tag to workflow',
                properties: {
                  type: { const: 'addTag' },
                  description: { type: 'string' },
                  tag: { type: 'string', description: 'Tag to add' }
                },
                required: ['type', 'tag'],
                additionalProperties: false
              },
              {
                type: 'object',
                description: 'Remove tag from workflow',
                properties: {
                  type: { const: 'removeTag' },
                  description: { type: 'string' },
                  tag: { type: 'string', description: 'Tag to remove' }
                },
                required: ['type', 'tag'],
                additionalProperties: false
              }
            ]
          }
        },
        validateOnly: {
          type: 'boolean',
          description: 'Test operations without applying (default: false)',
          default: false
        }
      },
      required: ['id', 'operations']
    }
  }
];

/**
 * QUICK REFERENCE for AI Agents:
 * 
 * 🔥 STREAMLINED WORKFLOW (8 tools only!):
 * 1️⃣ node_discovery({action: "search", query: "slack"}) - Find nodes
 * 2️⃣ node_discovery({action: "info", nodeType: "nodes-base.slack", detail: "essentials"}) - Get config
 * 3️⃣ node_validation({action: "validate", nodeType: "...", config: {...}}) - Validate node
 * 4️⃣ workflow_manager({action: "validate", workflow: {...}}) - MANDATORY validation
 * 5️⃣ workflow_manager({action: "create", workflow: {...}}) - Create (only after validation!)
 * 6️⃣ workflow_execution({action: "trigger", webhookUrl: "..."}) - Execute
 * 
 * 🚨 VALIDATION ENFORCEMENT:
 * - workflow_manager CREATE is BLOCKED without prior validation
 * - Server enforces validation-first workflow
 * - No more bypassing validation!
 * 
 * 📋 CAPABILITIES PRESERVED:
 * - All 60+ original capabilities available through unified interfaces
 * - Progressive disclosure - start simple, add complexity as needed
 * - Clear action-based organization eliminates choice paralysis
 * 
 * ⚡ PERFORMANCE:
 * - node_discovery with "essentials" - Fast configuration
 * - workflow_manager with "quick" validation - Basic checks
 * - templates_and_guides - Working examples and patterns
 */