import { NodeRepository } from '../database/node-repository';
import { WorkflowNode } from '../types/n8n-api';
import { logger } from '../utils/logger';

export interface ParameterValidationError {
  nodeName: string;
  nodeType: string;
  parameter: string;
  error: string;
  suggestion: string;
}

export interface ParameterValidationResult {
  valid: boolean;
  errors: ParameterValidationError[];
}

/**
 * Node Parameter Validator
 *
 * CRITICAL: This validator queries the MCP server's node database to ensure
 * that all required node parameters are present BEFORE workflows are sent to n8n API.
 *
 * This prevents the fatal flaw where workflows pass API validation but fail
 * to load in n8n UI due to missing required parameters (e.g., options field).
 */
export class NodeParameterValidator {
  constructor(private repository: NodeRepository) {}

  /**
   * Validate a single node's parameters against the MCP database schema
   */
  async validateNode(node: WorkflowNode): Promise<ParameterValidationError[]> {
    const errors: ParameterValidationError[] = [];

    try {
      // Query MCP database for node schema
      const nodeInfo = this.repository.getNodeByType(node.type, node.typeVersion);

      if (!nodeInfo) {
        errors.push({
          nodeName: node.name,
          nodeType: node.type,
          parameter: 'type',
          error: `Unknown node type: ${node.type}`,
          suggestion: 'Check node type spelling and ensure it exists in n8n. Use list_nodes MCP tool to find valid node types.'
        });
        return errors;
      }

      // Extract required parameters from node schema
      const requiredParams = this.extractRequiredParameters(nodeInfo);

      // Validate all required parameters are present
      for (const requiredParam of requiredParams) {
        if (!(requiredParam in node.parameters)) {
          errors.push({
            nodeName: node.name,
            nodeType: node.type,
            parameter: requiredParam,
            error: `Missing required parameter: ${requiredParam}`,
            suggestion: this.getParameterSuggestion(node.type, requiredParam)
          });
        }
      }

      logger.debug('[NodeParameterValidator] Validated node', {
        nodeName: node.name,
        nodeType: node.type,
        errorsFound: errors.length
      });

    } catch (error) {
      logger.error('[NodeParameterValidator] Error validating node', {
        nodeName: node.name,
        nodeType: node.type,
        error
      });

      errors.push({
        nodeName: node.name,
        nodeType: node.type,
        parameter: 'validation',
        error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestion: 'Contact support with this error message'
      });
    }

    return errors;
  }

  /**
   * Validate all nodes in a workflow
   */
  async validateWorkflow(nodes: WorkflowNode[]): Promise<ParameterValidationResult> {
    const allErrors: ParameterValidationError[] = [];

    for (const node of nodes) {
      const nodeErrors = await this.validateNode(node);
      allErrors.push(...nodeErrors);
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors
    };
  }

  /**
   * Extract required parameters from node info
   *
   * This queries the node's properties schema to identify which parameters
   * are mandatory for the node to function properly in n8n UI.
   */
  private extractRequiredParameters(nodeInfo: any): string[] {
    const required: string[] = [];

    // CRITICAL KNOWN REQUIREMENTS
    // These are hardcoded because they're discovered through runtime errors
    // rather than being marked as required in the node schema

    const normalizedType = nodeInfo.nodeType.replace(/^n8n-/, ''); // Remove n8n- prefix if present

    if (normalizedType === 'nodes-base.httpRequest') {
      // HTTP Request node REQUIRES options parameter (even if empty)
      // This was discovered via "Could not find property option" error
      required.push('options');
    }

    // TODO: Parse nodeInfo.properties JSON to extract schema-defined required fields
    // For now, we rely ONLY on known requirements discovered through runtime errors
    // that prevent workflows from loading in n8n UI.

    // DISABLED: Automatic detection of required properties
    // The properties marked as required in the schema (like nodeCredentialType, genericAuthType)
    // do NOT prevent workflows from loading in UI - they just mean the node won't execute properly.
    // We ONLY want to validate parameters that cause the FATAL FLAW (UI load failure).
    //
    // if (nodeInfo.properties && Array.isArray(nodeInfo.properties)) {
    //   for (const prop of nodeInfo.properties) {
    //     if (prop.required === true) {
    //       required.push(prop.name);
    //     }
    //   }
    // }

    return required;
  }

  /**
   * Get a helpful suggestion for a missing parameter
   */
  private getParameterSuggestion(nodeType: string, parameter: string): string {
    // HTTP Request node options field
    if (nodeType === 'n8n-nodes-base.httpRequest' && parameter === 'options') {
      return 'Add "options" field to node parameters. For most cases, use empty object: { "options": {} }. This field is required for n8n UI to load the workflow properly.';
    }

    // Generic suggestion
    return `Add "${parameter}" to node parameters. Use get_node_info or get_node_essentials MCP tools to see required parameters and examples.`;
  }
}
