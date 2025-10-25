/**
 * Validator Agent - Workflow Validation Specialist
 * Validates generated n8n workflows for correctness and completeness
 */

import { BaseAgent, AgentConfig, AgentInput, AgentOutput } from './base-agent';
import { SharedMemory } from '../shared-memory';
import { Logger } from '../../utils/logger';

export interface ValidationResult {
  valid: boolean;
  nodeCount: number;
  connectionCount: number;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: ValidationStats;
}

export interface ValidationError {
  type: string;
  message: string;
  node?: string;
  severity: 'critical' | 'high' | 'medium';
}

export interface ValidationWarning {
  type: string;
  message: string;
  node?: string;
  suggestion?: string;
}

export interface ValidationStats {
  totalNodes: number;
  totalConnections: number;
  triggerNodes: number;
  actionNodes: number;
  connectedNodes: number;
  orphanedNodes: number;
  complexity: 'simple' | 'medium' | 'complex';
}

/**
 * Validator Agent for validating n8n workflows
 */
export class ValidatorAgent extends BaseAgent {
  private validNodeTypes: Set<string>;
  private triggerNodeTypes: Set<string>;
  private actionNodeTypes: Set<string>;

  constructor(sharedMemory: SharedMemory) {
    const config: AgentConfig = {
      id: 'validator-agent',
      name: 'Workflow Validation Agent',
      description: 'Validates generated workflows for syntax and completeness',
      role: 'workflow-validation',
      contextBudget: 10000, // 10K tokens for validation
      timeout: 30000, // 30 seconds max
    };

    super(config, sharedMemory);
    this.validNodeTypes = new Set();
    this.triggerNodeTypes = new Set();
    this.actionNodeTypes = new Set();
  }

  /**
   * Initialize validator agent
   */
  async initialize(): Promise<void> {
    await super.initialize();
    this.loadNodeTypes();
    this.logger.info('Validator agent initialized with ' + this.validNodeTypes.size + ' known node types');
  }

  /**
   * Execute workflow validation
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();

    try {
      this.logger.debug('Validating workflow');

      // Get generated workflow from shared memory
      const workflowData = await this.sharedMemory.get('generated-workflow');

      if (!workflowData || !workflowData.workflow) {
        return {
          success: false,
          result: null,
          error: 'No generated workflow found in shared memory. Workflow Agent must run first.',
          executionTime: Date.now() - startTime,
        };
      }

      const workflow = workflowData.workflow;

      // Validate workflow structure
      const validationResult = this.validateWorkflow(workflow);

      // Store validation result in shared memory
      await this.sharedMemory.set(
        'workflow-validation-result',
        {
          validationResult,
          workflowName: workflow.name,
          validatedAt: Date.now(),
          goal: workflowData.goal,
        },
        this.config.id,
        600000 // 10 minutes TTL
      );

      this.logger.info(
        `Workflow validation complete: ${validationResult.valid ? 'VALID' : 'INVALID'} (${validationResult.errors.length} errors, ${validationResult.warnings.length} warnings)`
      );

      return {
        success: true,
        result: {
          validationResult,
          workflowName: workflow.name,
          isValid: validationResult.valid,
        },
        executionTime: Date.now() - startTime,
        tokensUsed: Math.min(
          validationResult.nodeCount * 50 + validationResult.errors.length * 100,
          this.config.contextBudget
        ),
      };
    } catch (error) {
      this.logger.error('Workflow validation failed', error as Error);
      return {
        success: false,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate workflow structure
   */
  private validateWorkflow(workflow: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const stats: ValidationStats = {
      totalNodes: 0,
      totalConnections: 0,
      triggerNodes: 0,
      actionNodes: 0,
      connectedNodes: 0,
      orphanedNodes: 0,
      complexity: 'simple',
    };

    // Check workflow structure
    if (!workflow) {
      errors.push({
        type: 'STRUCTURE_ERROR',
        message: 'Workflow is null or undefined',
        severity: 'critical',
      });
      return { valid: false, nodeCount: 0, connectionCount: 0, errors, warnings, stats };
    }

    // Check required fields
    if (!workflow.name || typeof workflow.name !== 'string') {
      errors.push({
        type: 'MISSING_FIELD',
        message: 'Workflow must have a valid name',
        severity: 'critical',
      });
    }

    if (!Array.isArray(workflow.nodes)) {
      errors.push({
        type: 'STRUCTURE_ERROR',
        message: 'Workflow must have a nodes array',
        severity: 'critical',
      });
      return { valid: false, nodeCount: 0, connectionCount: 0, errors, warnings, stats };
    }

    if (!workflow.connections || typeof workflow.connections !== 'object') {
      errors.push({
        type: 'STRUCTURE_ERROR',
        message: 'Workflow must have a connections object',
        severity: 'critical',
      });
      return { valid: false, nodeCount: 0, connectionCount: 0, errors, warnings, stats };
    }

    // Validate nodes
    stats.totalNodes = workflow.nodes.length;

    if (workflow.nodes.length === 0) {
      errors.push({
        type: 'STRUCTURE_ERROR',
        message: 'Workflow must have at least one node',
        severity: 'critical',
      });
      return { valid: false, nodeCount: 0, connectionCount: 0, errors, warnings, stats };
    }

    if (workflow.nodes.length > 100) {
      warnings.push({
        type: 'PERFORMANCE_WARNING',
        message: `Workflow has ${workflow.nodes.length} nodes which may impact performance`,
        suggestion: 'Consider breaking large workflows into smaller ones',
      });
    }

    // Track which nodes are connected
    const connectedNodeNames = new Set<string>();

    // Validate each node
    for (const node of workflow.nodes) {
      this.validateNode(node, errors, warnings, stats);

      if (this.isTriggerNode(node.type)) {
        stats.triggerNodes++;
      }
      if (this.isActionNode(node.type)) {
        stats.actionNodes++;
      }
    }

    // Validate connections
    const connectionResults = this.validateConnections(workflow, connectedNodeNames, errors, warnings);
    stats.totalConnections = connectionResults.connectionCount;
    stats.connectedNodes = connectedNodeNames.size;

    // Check for orphaned nodes
    const nodeNames = new Set(workflow.nodes.map((n: any) => n.name));
    for (const name of nodeNames) {
      const nodeName = name as string;
      if (!connectedNodeNames.has(nodeName)) {
        stats.orphanedNodes++;
        warnings.push({
          type: 'ORPHANED_NODE',
          message: `Node "${nodeName}" is not connected to the workflow`,
          node: nodeName,
          suggestion: 'Connect this node or remove it',
        });
      }
    }

    // Check for trigger nodes
    if (stats.triggerNodes === 0) {
      errors.push({
        type: 'MISSING_TRIGGER',
        message: 'Workflow must have at least one trigger node (e.g., Manual Trigger, Schedule)',
        severity: 'critical',
      });
    }

    if (stats.triggerNodes > 1) {
      warnings.push({
        type: 'MULTIPLE_TRIGGERS',
        message: `Workflow has ${stats.triggerNodes} trigger nodes which is unusual`,
        suggestion: 'Workflows typically have a single trigger node',
      });
    }

    // Check for action nodes
    if (stats.actionNodes === 0) {
      errors.push({
        type: 'NO_ACTIONS',
        message: 'Workflow must have at least one action node',
        severity: 'high',
      });
    }

    // Determine complexity
    if (stats.totalNodes <= 3) {
      stats.complexity = 'simple';
    } else if (stats.totalNodes <= 10) {
      stats.complexity = 'medium';
    } else {
      stats.complexity = 'complex';
    }

    // Final validation: valid if no critical errors
    const hasCriticalErrors = errors.some((e) => e.severity === 'critical');

    return {
      valid: !hasCriticalErrors,
      nodeCount: stats.totalNodes,
      connectionCount: stats.totalConnections,
      errors,
      warnings,
      stats,
    };
  }

  /**
   * Validate individual node
   */
  private validateNode(
    node: any,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    stats: ValidationStats
  ): void {
    // Check required node fields
    if (!node.name || typeof node.name !== 'string') {
      errors.push({
        type: 'INVALID_NODE_NAME',
        message: 'Node must have a valid name',
        severity: 'critical',
      });
      return;
    }

    if (!node.type || typeof node.type !== 'string') {
      errors.push({
        type: 'INVALID_NODE_TYPE',
        message: `Node "${node.name}" must have a valid type`,
        node: node.name,
        severity: 'critical',
      });
      return;
    }

    // Check if node type is known
    if (!this.validNodeTypes.has(node.type)) {
      warnings.push({
        type: 'UNKNOWN_NODE_TYPE',
        message: `Node "${node.name}" has unknown type: ${node.type}`,
        node: node.name,
        suggestion: 'Verify the node type exists in n8n',
      });
    }

    // Check position
    if (!Array.isArray(node.position) || node.position.length !== 2) {
      errors.push({
        type: 'INVALID_POSITION',
        message: `Node "${node.name}" must have a valid position [x, y]`,
        node: node.name,
        severity: 'high',
      });
    }

    // Check parameters (optional but good to have)
    if (node.parameters && typeof node.parameters !== 'object') {
      errors.push({
        type: 'INVALID_PARAMETERS',
        message: `Node "${node.name}" has invalid parameters`,
        node: node.name,
        severity: 'medium',
      });
    }

    this.logger.debug(`Validated node: ${node.name} (type: ${node.type})`);
  }

  /**
   * Validate connections
   */
  private validateConnections(
    workflow: any,
    connectedNodeNames: Set<string>,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): { connectionCount: number } {
    let connectionCount = 0;
    const nodeNames = new Set(workflow.nodes.map((n: any) => n.name));

    for (const [sourceName, connectionData] of Object.entries(workflow.connections)) {
      // Track source node as connected
      connectedNodeNames.add(sourceName);

      if (!nodeNames.has(sourceName)) {
        errors.push({
          type: 'INVALID_CONNECTION_SOURCE',
          message: `Connection references unknown node: ${sourceName}`,
          severity: 'high',
        });
        continue;
      }

      const conn = connectionData as any;

      if (!conn.main || !Array.isArray(conn.main)) {
        errors.push({
          type: 'INVALID_CONNECTION_FORMAT',
          message: `Node "${sourceName}" has invalid connection format (missing main array)`,
          severity: 'high',
        });
        continue;
      }

      // Validate each connection path
      for (const connectionPath of conn.main) {
        if (!Array.isArray(connectionPath)) {
          errors.push({
            type: 'INVALID_CONNECTION_PATH',
            message: `Node "${sourceName}" has invalid connection path (not an array)`,
            severity: 'high',
          });
          continue;
        }

        for (const connectionPoint of connectionPath) {
          connectionCount++;

          if (!connectionPoint.node || !nodeNames.has(connectionPoint.node)) {
            errors.push({
              type: 'INVALID_CONNECTION_TARGET',
              message: `Connection from "${sourceName}" references unknown target: ${connectionPoint.node || 'undefined'}`,
              severity: 'high',
            });
            continue;
          }

          // Track target node as connected
          connectedNodeNames.add(connectionPoint.node);

          if (connectionPoint.type !== 'main') {
            warnings.push({
              type: 'UNUSUAL_CONNECTION_TYPE',
              message: `Connection has non-standard type: ${connectionPoint.type}`,
              suggestion: 'Standard connections should use "main" type',
            });
          }

          if (typeof connectionPoint.index !== 'number') {
            errors.push({
              type: 'INVALID_CONNECTION_INDEX',
              message: `Connection from "${sourceName}" to "${connectionPoint.node}" has invalid index`,
              severity: 'medium',
            });
          }
        }
      }
    }

    return { connectionCount };
  }

  /**
   * Check if node type is a trigger
   */
  private isTriggerNode(type: string): boolean {
    return this.triggerNodeTypes.has(type);
  }

  /**
   * Check if node type is an action
   */
  private isActionNode(type: string): boolean {
    return this.actionNodeTypes.has(type);
  }

  /**
   * Load valid node types
   */
  private loadNodeTypes(): void {
    // Trigger node types
    const triggerTypes = [
      'n8n-nodes-base.manualTrigger',
      'n8n-nodes-base.schedule',
      'n8n-nodes-base.webhook',
      'n8n-nodes-base.cron',
      'n8n-nodes-base.interval',
    ];

    // Action node types (sample - these would be much larger in production)
    const actionTypes = [
      'n8n-nodes-base.httpRequest',
      'n8n-nodes-base.slack',
      'n8n-nodes-base.emailSend',
      'n8n-nodes-base.set',
      'n8n-nodes-base.if',
      'n8n-nodes-base.noOp',
      'n8n-nodes-base.postgres',
      'n8n-nodes-base.mysql',
      'n8n-nodes-base.fileCreate',
      'n8n-nodes-base.function',
      'n8n-nodes-base.code',
      'n8n-nodes-base.switch',
      'n8n-nodes-base.merge',
      'n8n-nodes-base.split',
      'n8n-nodes-base.loop',
      'n8n-nodes-base.wait',
      'n8n-nodes-base.debug',
      'n8n-nodes-base.executeCommand',
    ];

    // All valid node types
    const allTypes = [...triggerTypes, ...actionTypes];

    for (const type of triggerTypes) {
      this.triggerNodeTypes.add(type);
      this.validNodeTypes.add(type);
    }

    for (const type of actionTypes) {
      this.actionNodeTypes.add(type);
      this.validNodeTypes.add(type);
    }

    this.logger.debug(`Loaded ${this.validNodeTypes.size} valid node types`);
  }
}
