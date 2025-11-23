/**
 * Workflow Agent - Workflow Generation Specialist
 * Generates n8n workflow JSON from selected patterns and user goals
 */

import { BaseAgent, AgentConfig, AgentInput, AgentOutput } from './base-agent';
import { SharedMemory } from '../shared-memory';
import { Logger } from '../../utils/logger';

export interface GeneratedWorkflow {
  name: string;
  description: string;
  nodes: WorkflowNode[];
  connections: Record<string, ConnectionData>;
  settings?: Record<string, any>;
}

export interface WorkflowNode {
  name: string;
  type: string;
  typeVersion?: number;
  position: [number, number];
  parameters?: Record<string, any>;
  credentials?: Record<string, string>;
}

export interface ConnectionData {
  main: Array<Array<{ node: string; type: string; index: number }>>;
}

/**
 * Workflow Agent for generating n8n workflows from patterns
 */
export class WorkflowAgent extends BaseAgent {
  private nodeRegistry: Map<string, NodeTemplate>;

  constructor(sharedMemory: SharedMemory) {
    const config: AgentConfig = {
      id: 'workflow-agent',
      name: 'Workflow Generation Agent',
      description: 'Generates n8n workflow JSON from selected patterns and goals',
      role: 'workflow-generation',
      contextBudget: 15000, // 15K tokens for workflow generation
      timeout: 45000, // 45 seconds max
    };

    super(config, sharedMemory);
    this.nodeRegistry = new Map();
  }

  /**
   * Initialize workflow agent
   */
  async initialize(): Promise<void> {
    await super.initialize();
    this.loadNodeRegistry();
    this.logger.info('Workflow agent initialized with ' + this.nodeRegistry.size + ' node templates');
  }

  /**
   * Execute workflow generation
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();

    try {
      this.logger.debug(`Workflow generation for goal: ${input.goal}`);

      // Get selected pattern from shared memory
      const selectedPattern = await this.sharedMemory.get('selected-pattern');

      if (!selectedPattern) {
        return {
          success: false,
          result: null,
          error: 'No selected pattern found in shared memory. Pattern Agent must run first.',
          executionTime: Date.now() - startTime,
        };
      }

      this.logger.debug(`Using pattern: ${selectedPattern.patternName}`);

      // Generate workflow from pattern
      const workflow = await this.generateWorkflowFromPattern(input.goal, selectedPattern);

      if (!workflow) {
        return {
          success: false,
          result: null,
          error: 'Failed to generate workflow from pattern',
          executionTime: Date.now() - startTime,
        };
      }

      // Store generated workflow in shared memory
      await this.sharedMemory.set(
        'generated-workflow',
        {
          workflow,
          patternId: selectedPattern.patternId,
          generatedAt: Date.now(),
          goal: input.goal,
        },
        this.config.id,
        600000 // 10 minutes TTL
      );

      this.logger.info(`Generated workflow: ${workflow.name}`);

      return {
        success: true,
        result: {
          workflow,
          nodeCount: workflow.nodes.length,
          connectionCount: Object.keys(workflow.connections).length,
        },
        executionTime: Date.now() - startTime,
        tokensUsed: Math.min(
          workflow.nodes.length * 200 + Object.keys(workflow.connections).length * 150,
          this.config.contextBudget
        ),
      };
    } catch (error) {
      this.logger.error('Workflow generation failed', error as Error);
      return {
        success: false,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Generate workflow from pattern
   */
  private async generateWorkflowFromPattern(
    goal: string,
    selectedPattern: Record<string, any>
  ): Promise<GeneratedWorkflow | null> {
    try {
      const patternId = selectedPattern.patternId;

      // Map patterns to workflow templates
      const workflow = this.createWorkflowTemplate(patternId, goal);

      if (!workflow) {
        return null;
      }

      // Enhance workflow with specific user goal details
      this.enhanceWorkflowWithGoal(workflow, goal);

      // Ensure workflow complies with n8n API schema
      this.ensureApiCompliance(workflow);

      return workflow;
    } catch (error) {
      this.logger.error('Failed to generate workflow from pattern', error as Error);
      return null;
    }
  }

  /**
   * Create workflow template from pattern
   */
  private createWorkflowTemplate(patternId: string, goal: string): GeneratedWorkflow | null {
    const timestamp = new Date().toISOString().split('T')[0];

    switch (patternId) {
      case 'slack-notification':
        return this.createSlackNotificationWorkflow(goal, timestamp);

      case 'email-workflow':
        return this.createEmailWorkflow(goal, timestamp);

      case 'data-transformation':
        return this.createDataTransformationWorkflow(goal, timestamp);

      case 'api-integration':
        return this.createApiIntegrationWorkflow(goal, timestamp);

      case 'database-crud':
        return this.createDatabaseCrudWorkflow(goal, timestamp);

      case 'conditional-flow':
        return this.createConditionalFlowWorkflow(goal, timestamp);

      case 'error-handling':
        return this.createErrorHandlingWorkflow(goal, timestamp);

      case 'scheduling':
        return this.createSchedulingWorkflow(goal, timestamp);

      case 'file-operations':
        return this.createFileOperationsWorkflow(goal, timestamp);

      case 'multi-step-workflow':
        return this.createMultiStepWorkflow(goal, timestamp);

      default:
        this.logger.warn(`Unknown pattern: ${patternId}`);
        return null;
    }
  }

  /**
   * Create Slack notification workflow
   */
  private createSlackNotificationWorkflow(goal: string, timestamp: string): GeneratedWorkflow {
    return {
      name: `Slack Notification - ${timestamp}`,
      description: `Send Slack notifications based on: ${goal}`,
      nodes: [
        {
          name: 'Manual Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          position: [100, 100],
        },
        {
          name: 'Slack Send Message',
          type: 'n8n-nodes-base.slack',
          position: [300, 100],
          parameters: {
            resource: 'message',
            operation: 'post',
            channel: '#general',
            text: 'Message from workflow',
          },
        },
      ],
      connections: {
        'Manual Trigger': {
          main: [[{ node: 'Slack Send Message', type: 'main', index: 0 }]],
        },
      },
    };
  }

  /**
   * Create email workflow
   */
  private createEmailWorkflow(goal: string, timestamp: string): GeneratedWorkflow {
    return {
      name: `Email Workflow - ${timestamp}`,
      description: `Send emails based on: ${goal}`,
      nodes: [
        {
          name: 'Manual Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          position: [100, 100],
        },
        {
          name: 'Send Email',
          type: 'n8n-nodes-base.sendemail',
          position: [300, 100],
          parameters: {
            toEmail: 'recipient@example.com',
            subject: 'Email from workflow',
            textOnly: false,
            htmlEmail: '<p>Message body</p>',
          },
        },
      ],
      connections: {
        'Manual Trigger': {
          main: [[{ node: 'Send Email', type: 'main', index: 0 }]],
        },
      },
    };
  }

  /**
   * Create data transformation workflow
   */
  private createDataTransformationWorkflow(goal: string, timestamp: string): GeneratedWorkflow {
    return {
      name: `Data Transformation - ${timestamp}`,
      description: `Transform data based on: ${goal}`,
      nodes: [
        {
          name: 'Input Data',
          type: 'n8n-nodes-base.manualTrigger',
          position: [100, 100],
        },
        {
          name: 'Transform Data',
          type: 'n8n-nodes-base.set',
          position: [300, 100],
          parameters: {
            assignments: {
              assignments: [
                {
                  name: 'transformedData',
                  value: '={{ $json }}',
                  type: 'expression',
                },
              ],
            },
          },
        },
      ],
      connections: {
        'Input Data': {
          main: [[{ node: 'Transform Data', type: 'main', index: 0 }]],
        },
      },
    };
  }

  /**
   * Create API integration workflow
   */
  private createApiIntegrationWorkflow(goal: string, timestamp: string): GeneratedWorkflow {
    return {
      name: `API Integration - ${timestamp}`,
      description: `Integrate with APIs based on: ${goal}`,
      nodes: [
        {
          name: 'Manual Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          position: [100, 100],
        },
        {
          name: 'HTTP Request',
          type: 'n8n-nodes-base.httprequest',
          position: [300, 100],
          parameters: {
            url: 'https://api.example.com/data',
            method: 'GET',
            sendHeaders: true,
            headerParameters: {
              parameters: [],
            },
          },
        },
      ],
      connections: {
        'Manual Trigger': {
          main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]],
        },
      },
    };
  }

  /**
   * Create database CRUD workflow
   */
  private createDatabaseCrudWorkflow(goal: string, timestamp: string): GeneratedWorkflow {
    return {
      name: `Database Operations - ${timestamp}`,
      description: `Database CRUD operations based on: ${goal}`,
      nodes: [
        {
          name: 'Manual Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          position: [100, 100],
        },
        {
          name: 'Database Operation',
          type: 'n8n-nodes-base.postgres',
          position: [300, 100],
          parameters: {
            operation: 'executeQuery',
            query: 'SELECT * FROM table_name LIMIT 10;',
          },
        },
      ],
      connections: {
        'Manual Trigger': {
          main: [[{ node: 'Database Operation', type: 'main', index: 0 }]],
        },
      },
    };
  }

  /**
   * Create conditional flow workflow
   */
  private createConditionalFlowWorkflow(goal: string, timestamp: string): GeneratedWorkflow {
    return {
      name: `Conditional Flow - ${timestamp}`,
      description: `Conditional workflow based on: ${goal}`,
      nodes: [
        {
          name: 'Manual Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          position: [100, 100],
        },
        {
          name: 'Check Condition',
          type: 'n8n-nodes-base.if',
          position: [300, 100],
          parameters: {
            conditions: {
              boolean: [
                {
                  condition: 'true',
                  value1: '={{ $json.value }}',
                },
              ],
            },
          },
        },
        {
          name: 'True Path',
          type: 'n8n-nodes-base.noop',
          position: [500, 50],
        },
        {
          name: 'False Path',
          type: 'n8n-nodes-base.noop',
          position: [500, 150],
        },
      ],
      connections: {
        'Manual Trigger': {
          main: [[{ node: 'Check Condition', type: 'main', index: 0 }]],
        },
        'Check Condition': {
          main: [
            [{ node: 'True Path', type: 'main', index: 0 }],
            [{ node: 'False Path', type: 'main', index: 0 }],
          ],
        },
      },
    };
  }

  /**
   * Create error handling workflow
   */
  private createErrorHandlingWorkflow(goal: string, timestamp: string): GeneratedWorkflow {
    return {
      name: `Error Handling - ${timestamp}`,
      description: `Error handling workflow based on: ${goal}`,
      nodes: [
        {
          name: 'Manual Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          position: [100, 100],
        },
        {
          name: 'Risky Operation',
          type: 'n8n-nodes-base.httprequest',
          position: [300, 100],
          parameters: {
            url: 'https://api.example.com/data',
            method: 'GET',
          },
        },
        {
          name: 'Error Handler',
          type: 'n8n-nodes-base.noop',
          position: [500, 100],
        },
      ],
      connections: {
        'Manual Trigger': {
          main: [[{ node: 'Risky Operation', type: 'main', index: 0 }]],
        },
        'Risky Operation': {
          main: [[{ node: 'Error Handler', type: 'main', index: 0 }]],
        },
      },
    };
  }

  /**
   * Create scheduling workflow
   */
  private createSchedulingWorkflow(goal: string, timestamp: string): GeneratedWorkflow {
    return {
      name: `Scheduled Execution - ${timestamp}`,
      description: `Scheduled workflow based on: ${goal}`,
      nodes: [
        {
          name: 'Schedule Trigger',
          type: 'n8n-nodes-base.scheduletrigger',
          position: [100, 100],
          parameters: {
            interval: ['days'],
            daysInterval: 1,
          },
        },
        {
          name: 'Execute Task',
          type: 'n8n-nodes-base.httprequest',
          position: [300, 100],
          parameters: {
            url: 'https://api.example.com/task',
            method: 'POST',
          },
        },
      ],
      connections: {
        'Schedule Trigger': {
          main: [[{ node: 'Execute Task', type: 'main', index: 0 }]],
        },
      },
    };
  }

  /**
   * Create file operations workflow
   */
  private createFileOperationsWorkflow(goal: string, timestamp: string): GeneratedWorkflow {
    return {
      name: `File Operations - ${timestamp}`,
      description: `File operations workflow based on: ${goal}`,
      nodes: [
        {
          name: 'Manual Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          position: [100, 100],
        },
        {
          name: 'File Operation',
          type: 'n8n-nodes-base.readwritefile',
          position: [300, 100],
          parameters: {
            fileName: 'output.txt',
            fileContent: 'File contents here',
            encoding: 'utf8',
          },
        },
      ],
      connections: {
        'Manual Trigger': {
          main: [[{ node: 'File Operation', type: 'main', index: 0 }]],
        },
      },
    };
  }

  /**
   * Create multi-step workflow
   */
  private createMultiStepWorkflow(goal: string, timestamp: string): GeneratedWorkflow {
    return {
      name: `Multi-Step Workflow - ${timestamp}`,
      description: `Complex multi-step workflow based on: ${goal}`,
      nodes: [
        {
          name: 'Start',
          type: 'n8n-nodes-base.manualTrigger',
          position: [100, 100],
        },
        {
          name: 'Step 1: Fetch Data',
          type: 'n8n-nodes-base.httprequest',
          position: [300, 100],
          parameters: {
            url: 'https://api.example.com/data',
            method: 'GET',
          },
        },
        {
          name: 'Step 2: Transform',
          type: 'n8n-nodes-base.set',
          position: [500, 100],
          parameters: {
            assignments: {
              assignments: [
                {
                  name: 'processedData',
                  value: '={{ $json }}',
                  type: 'expression',
                },
              ],
            },
          },
        },
        {
          name: 'Step 3: Store Results',
          type: 'n8n-nodes-base.noop',
          position: [700, 100],
        },
      ],
      connections: {
        'Start': {
          main: [[{ node: 'Step 1: Fetch Data', type: 'main', index: 0 }]],
        },
        'Step 1: Fetch Data': {
          main: [[{ node: 'Step 2: Transform', type: 'main', index: 0 }]],
        },
        'Step 2: Transform': {
          main: [[{ node: 'Step 3: Store Results', type: 'main', index: 0 }]],
        },
      },
    };
  }

  /**
   * Enhance workflow with goal-specific details
   */
  private enhanceWorkflowWithGoal(workflow: GeneratedWorkflow, goal: string): void {
    // Update workflow name to be more descriptive
    workflow.name = `${workflow.name.split(' - ')[0]} - ${goal.substring(0, 30)}...`;

    // Update description
    workflow.description = `Generated workflow for: ${goal}`;

    // Log enhancement
    this.logger.debug(`Enhanced workflow with goal context: ${goal.substring(0, 50)}...`);
  }

  /**
   * Load node registry with templates
   */
  private loadNodeRegistry(): void {
    const nodes: NodeTemplate[] = [
      {
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        description: 'Manually trigger a workflow',
      },
      {
        name: 'Schedule Trigger',
        type: 'n8n-nodes-base.scheduletrigger',
        description: 'Trigger a workflow on a schedule',
      },
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        description: 'Trigger a workflow via webhook',
      },
      {
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httprequest',
        description: 'Make HTTP requests',
      },
      {
        name: 'Slack',
        type: 'n8n-nodes-base.slack',
        description: 'Send messages to Slack',
      },
      {
        name: 'Email Send',
        type: 'n8n-nodes-base.sendemail',
        description: 'Send emails',
      },
      {
        name: 'Set',
        type: 'n8n-nodes-base.set',
        description: 'Transform and map data',
      },
      {
        name: 'If',
        type: 'n8n-nodes-base.if',
        description: 'Conditional logic',
      },
      {
        name: 'No Operation',
        type: 'n8n-nodes-base.noop',
        description: 'Placeholder node',
      },
      {
        name: 'PostgreSQL',
        type: 'n8n-nodes-base.postgres',
        description: 'Interact with PostgreSQL databases',
      },
    ];

    for (const node of nodes) {
      this.nodeRegistry.set(node.type, node);
    }
  }

  /**
   * Ensure generated workflow complies with n8n API schema
   */
  private ensureApiCompliance(workflow: GeneratedWorkflow): void {
    // Ensure all nodes have required fields for API compliance
    for (const node of workflow.nodes) {
      // Ensure typeVersion is set (required by n8n API)
      if (node.typeVersion === undefined) {
        node.typeVersion = 1;
        this.logger.debug(`Added default typeVersion=1 to node "${node.name}"`);
      }

      // Ensure node type has proper package prefix
      if (!node.type.includes('.')) {
        node.type = `n8n-nodes-base.${node.type}`;
        this.logger.debug(`Added package prefix to node type: ${node.type}`);
      }

      // Ensure parameters object exists
      if (!node.parameters) {
        node.parameters = {};
      }
    }

    // Remove any system-managed fields that might have been accidentally added
    const systemManagedFields = [
      'id',
      'createdAt',
      'updatedAt',
      'versionId',
      'isArchived',
      'triggerCount',
      'usedCredentials',
      'sharedWithProjects',
      'meta',
      'shared',
    ];

    for (const field of systemManagedFields) {
      if (field in (workflow as any)) {
        delete (workflow as any)[field];
        this.logger.debug(`Removed system-managed field "${field}" from workflow`);
      }
    }

    // Ensure connections use node NAMES not IDs
    const nodeNames = new Set(workflow.nodes.map((n) => n.name));

    for (const [source, connData] of Object.entries(workflow.connections)) {
      if (!nodeNames.has(source)) {
        this.logger.warn(
          `Connection source "${source}" does not match any node name. Check connection format.`
        );
      }

      const conn = connData as any;
      if (conn.main && Array.isArray(conn.main)) {
        for (const connPath of conn.main) {
          if (Array.isArray(connPath)) {
            for (const connPoint of connPath) {
              if (connPoint.node && !nodeNames.has(connPoint.node)) {
                this.logger.warn(
                  `Connection target "${connPoint.node}" does not match any node name. Check connection format.`
                );
              }
            }
          }
        }
      }
    }

    this.logger.debug('Workflow API compliance check completed');
  }
}

/**
 * Internal node template definition
 */
interface NodeTemplate {
  name: string;
  type: string;
  description: string;
}
