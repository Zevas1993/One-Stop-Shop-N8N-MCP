import { NodeRepository } from '../../database/node-repository';
import { ConfigValidator } from '../../services/config-validator';
import { EnhancedConfigValidator, ValidationMode, ValidationProfile } from '../../services/enhanced-config-validator';
import { WorkflowValidator } from '../../services/workflow-validator';
import { SimpleCache } from '../../utils/simple-cache';
import { logger } from '../../utils/logger';
import { APISchemaLoader } from '../../ai/knowledge/api-schema-loader';

export class ValidationHandlers {
  constructor(
    private repository: NodeRepository,
    private cache: SimpleCache
  ) {}

  async validateNodeConfig(
    nodeType: string, 
    config: any, 
    mode: ValidationMode = 'operation', 
    profile: ValidationProfile = 'ai-friendly'
  ): Promise<any> {
    const nodeInfo = await this.repository.getNodeInfo(nodeType);
    if (!nodeInfo) {
      throw new Error(`Node type ${nodeType} not found`);
    }
    const validator = new EnhancedConfigValidator(this.repository);
    return validator.validateConfig(nodeType, config, nodeInfo.properties || [], mode, profile);
  }

  async validateNodeMinimal(nodeType: string, config: any): Promise<any> {
    const nodeInfo = await this.repository.getNodeInfo(nodeType);
    if (!nodeInfo) {
      throw new Error(`Node type ${nodeType} not found`);
    }
    const validator = new ConfigValidator(this.repository);
    return validator.validateMinimal(nodeType, config, nodeInfo.properties || []);
  }

  async validateWorkflow(workflow: any, options: any = {}): Promise<any> {
    const validator = new WorkflowValidator(this.repository);
    return validator.validateWorkflow(workflow, options);
  }

  async validateWorkflowConnections(workflow: any): Promise<any> {
    const validator = new WorkflowValidator(this.repository);
    return validator.validateConnections(workflow);
  }

  async validateWorkflowExpressions(workflow: any): Promise<any> {
    const validator = new WorkflowValidator(this.repository);
    return validator.validateExpressions(workflow);
  }

  async validateWorkflowStructure(workflow: any): Promise<any> {
    const validator = new WorkflowValidator(this.repository);
    
    const errors = [];
    const warnings = [];
    
    // Basic structure validation
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      errors.push('Workflow must contain a nodes array');
    }
    
    if (!workflow.connections || typeof workflow.connections !== 'object') {
      errors.push('Workflow must contain a connections object');
    }
    
    // Node validation
    if (workflow.nodes) {
      for (const node of workflow.nodes) {
        if (!node.type) {
          errors.push(`Node ${node.name || 'unknown'} is missing type`);
        }
        
        if (!node.name) {
          errors.push(`Node with type ${node.type || 'unknown'} is missing name`);
        }
        
        if (!node.parameters) {
          warnings.push(`Node ${node.name} has no parameters`);
        }
      }
    }
    
    // Connection validation
    if (workflow.connections && workflow.nodes) {
      const nodeNames = new Set(workflow.nodes.map((n: any) => n.name));
      
      for (const [sourceName, connections] of Object.entries(workflow.connections)) {
        if (!nodeNames.has(sourceName)) {
          errors.push(`Connection source '${sourceName}' not found in nodes`);
        }
        
        if (connections && typeof connections === 'object') {
          for (const [outputIndex, targets] of Object.entries(connections)) {
            if (Array.isArray(targets)) {
              for (const target of targets) {
                if (target.node && !nodeNames.has(target.node)) {
                  errors.push(`Connection target '${target.node}' not found in nodes`);
                }
              }
            }
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        nodeCount: workflow.nodes?.length || 0,
        connectionCount: Object.keys(workflow.connections || {}).length,
        errorCount: errors.length,
        warningCount: warnings.length
      }
    };
  }

  async validateNodeTypes(workflow: any): Promise<any> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      return {
        valid: false,
        errors: ['Workflow must contain a nodes array'],
        warnings: []
      };
    }

    for (const node of workflow.nodes) {
      if (!node.type) {
        errors.push(`Node ${node.name || 'unknown'} is missing type`);
        continue;
      }

      try {
        const nodeInfo = await this.repository.getNodeInfo(node.type);
        if (!nodeInfo) {
          errors.push(`Node type '${node.type}' not found in database`);
        }
      } catch (error) {
        errors.push(`Error validating node type '${node.type}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalNodes: workflow.nodes.length,
        validNodeTypes: workflow.nodes.length - errors.length,
        invalidNodeTypes: errors.length
      }
    };
  }

  /**
   * Validate workflow against official n8n API schema
   * Checks for system-managed fields, node type format, typeVersion, and connections
   */
  async validateAgainstApiSchema(workflow: any): Promise<any> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Load API schema
    const schemaLoader = APISchemaLoader.getInstance();
    const schemaLoaded = await schemaLoader.loadSchema();

    if (!schemaLoaded) {
      logger.warn('[ValidationHandlers] API schema not available for validation');
    }

    // Check for system-managed fields
    const systemManagedFields = [
      'id', 'createdAt', 'updatedAt', 'versionId', 'isArchived',
      'triggerCount', 'usedCredentials', 'sharedWithProjects', 'meta', 'shared'
    ];

    for (const field of systemManagedFields) {
      if (field in workflow && workflow[field] !== undefined && workflow[field] !== null) {
        errors.push(`❌ System-managed field '${field}' found - must be removed before API request`);
        suggestions.push(`Remove the '${field}' field from workflow object`);
      }
    }

    // Validate nodes
    if (workflow.nodes && Array.isArray(workflow.nodes)) {
      for (const node of workflow.nodes) {
        // Check for required fields
        if (!node.id) {
          errors.push(`Node missing required field: id`);
        }
        if (!node.name) {
          errors.push(`Node missing required field: name`);
        }
        if (!node.type) {
          errors.push(`Node missing required field: type`);
        }

        // Validate node type format
        if (node.type && typeof node.type === 'string') {
          // Check for missing package prefix
          if (!node.type.includes('.')) {
            errors.push(`❌ Node '${node.name}' has invalid type '${node.type}' - missing package prefix`);
            suggestions.push(`Change type from '${node.type}' to 'n8n-nodes-base.${node.type}'`);
          }
          // Check for incomplete prefix
          else if (node.type.startsWith('nodes-base.') && !node.type.startsWith('n8n-nodes-base.')) {
            errors.push(`❌ Node '${node.name}' has incomplete type prefix '${node.type}'`);
            suggestions.push(`Change type from '${node.type}' to 'n8n-${node.type}'`);
          }
        }

        // Check for typeVersion
        if (!node.typeVersion && node.typeVersion !== 0) {
          warnings.push(`⚠️ Node '${node.name}' missing typeVersion - will default to 1`);
          suggestions.push(`Add 'typeVersion: 1' to node '${node.name}'`);
        }

        // Check for parameters
        if (!node.parameters) {
          warnings.push(`Node '${node.name}' has no parameters object`);
        }
      }
    }

    // Validate connections format
    if (workflow.connections && typeof workflow.connections === 'object' && workflow.nodes) {
      const nodeNames = new Set(workflow.nodes.map((n: any) => n.name));
      const nodeIds = new Set(workflow.nodes.map((n: any) => n.id));

      for (const [sourceName, targets] of Object.entries(workflow.connections)) {
        // Check if source is in nodes
        if (!nodeNames.has(sourceName) && nodeIds.has(sourceName)) {
          errors.push(`❌ Connection source '${sourceName}' appears to be a node ID, not a name`);
          suggestions.push(`Use node NAMES in connections, not IDs. Example: "My Node Name" instead of "node-123"`);
        } else if (!nodeNames.has(sourceName)) {
          errors.push(`Connection source '${sourceName}' not found in nodes`);
        }

        // Validate connection structure
        if (targets && typeof targets === 'object') {
          for (const [outputIndex, targetArray] of Object.entries(targets)) {
            if (Array.isArray(targetArray)) {
              for (const target of targetArray) {
                if (target.node) {
                  // Check if target is using ID instead of name
                  if (!nodeNames.has(target.node) && nodeIds.has(target.node)) {
                    errors.push(`❌ Connection target '${target.node}' appears to be a node ID, not a name`);
                    suggestions.push(`Use node NAMES in connections - find the node's 'name' field and use that`);
                  } else if (!nodeNames.has(target.node)) {
                    errors.push(`Connection target '${target.node}' not found in nodes`);
                  }
                }
              }
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      apiSchemaValidated: schemaLoaded,
      errors,
      warnings,
      suggestions,
      summary: {
        errorCount: errors.length,
        warningCount: warnings.length,
        suggestionCount: suggestions.length,
        nodeCount: workflow.nodes?.length || 0,
        connectionCount: Object.keys(workflow.connections || {}).length
      }
    };
  }
}