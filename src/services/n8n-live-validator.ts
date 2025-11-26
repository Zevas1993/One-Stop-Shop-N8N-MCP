/**
 * n8n Live Validator
 *
 * Validates workflows directly against the running n8n instance.
 * This ensures that any workflow approved by the MCP server will
 * actually work in n8n, catching errors that local validation misses.
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

export interface Workflow {
  name: string;
  nodes: any[];
  connections: any;
  settings?: any;
  [key: string]: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  rawError?: any;
}

export class N8nLiveValidator {
  private client: AxiosInstance;
  private n8nUrl: string;
  private apiKey: string;

  constructor(n8nUrl: string, apiKey: string) {
    this.n8nUrl = n8nUrl;
    this.apiKey = apiKey;

    // Normalize URL
    const baseUrl = n8nUrl.endsWith('/') ? n8nUrl.slice(0, -1) : n8nUrl;
    const apiUrl = baseUrl.endsWith('/api/v1') ? baseUrl : `${baseUrl}/api/v1`;

    this.client = axios.create({
      baseURL: apiUrl,
      timeout: 30000,
      headers: {
        'X-N8N-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Validate a workflow by attempting to load it in n8n
   * This sends the workflow to n8n for validation and returns any errors
   */
  async validateWorkflow(workflow: Workflow): Promise<ValidationResult> {
    try {
      logger.debug(`Validating workflow against live n8n instance: ${this.n8nUrl}`);

      // Prepare the workflow for validation
      // Only include fields that are allowed by n8n API
      const workflowPayload: any = {
        name: workflow.name,
        nodes: workflow.nodes,
        connections: workflow.connections,
      };

      if (workflow.settings) {
        workflowPayload.settings = workflow.settings;
      }
      if (workflow.staticData) {
        workflowPayload.staticData = workflow.staticData;
      }
      if (workflow.pinData) {
        workflowPayload.pinData = workflow.pinData;
      }
      if (workflow.meta) {
        workflowPayload.meta = workflow.meta;
      }

      // Try to validate by creating a temporary workflow
      // n8n's validation happens during the create/update process
      const response = await this.client.post('/workflows', workflowPayload, {
        validateStatus: () => true, // Don't throw on any status
      });

      // If successful, delete it immediately since it was just for validation
      if (response.status === 200 && response.data?.id) {
        try {
          await this.client.delete(`/workflows/${response.data.id}`);
        } catch (err) {
          logger.warn(`Failed to delete temporary validation workflow ${response.data.id}`);
        }
        return { valid: true, errors: [], warnings: [] };
      }

      // If creation failed, n8n returned an error
      if (response.status >= 400) {
        const errorMessage = this.extractN8nError(response.data);
        logger.error(`n8n validation failed: ${errorMessage}`);
        return {
          valid: false,
          errors: [errorMessage],
          warnings: [],
          rawError: response.data,
        };
      }

      return { valid: true, errors: [], warnings: [] };
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      logger.error(`Failed to validate workflow against n8n: ${errorMessage}`);
      return {
        valid: false,
        errors: [errorMessage],
        warnings: [],
        rawError: error,
      };
    }
  }

  /**
   * Validate workflow structure and nodes exist in n8n
   * This is a lighter check that doesn't create workflows
   */
  async validateWorkflowStructure(workflow: Workflow): Promise<ValidationResult> {
    try {
      const errors: string[] = [];

      // Check that all nodes have valid types
      if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
        return {
          valid: false,
          errors: ['Workflow must have a nodes array'],
          warnings: [],
        };
      }

      if (workflow.nodes.length === 0) {
        return {
          valid: false,
          errors: ['Workflow must have at least one node'],
          warnings: [],
        };
      }

      // Validate each node
      for (const node of workflow.nodes) {
        if (!node.type) {
          errors.push(`Node "${node.name}" is missing a type`);
          continue;
        }

        if (!node.typeVersion && node.type !== 'n8n-nodes-base.start') {
          errors.push(`Node "${node.name}" (${node.type}) is missing typeVersion`);
        }
      }

      // Validate connections
      if (workflow.connections && typeof workflow.connections === 'object') {
        const nodeNames = new Set(workflow.nodes.map((n: any) => n.name));

        for (const [fromNode, connections] of Object.entries(workflow.connections)) {
          if (!nodeNames.has(fromNode)) {
            errors.push(`Connection references non-existent node: "${fromNode}"`);
          }

          if (connections && typeof connections === 'object') {
            const connObj = connections as any;
            if (connObj.main && Array.isArray(connObj.main)) {
              for (const outputs of connObj.main) {
                if (Array.isArray(outputs)) {
                  for (const output of outputs) {
                    if (output.node && !nodeNames.has(output.node)) {
                      errors.push(`Connection targets non-existent node: "${output.node}"`);
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (errors.length > 0) {
        return { valid: false, errors, warnings: [] };
      }

      return { valid: true, errors: [], warnings: [] };
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      return {
        valid: false,
        errors: [errorMessage],
        warnings: [],
        rawError: error,
      };
    }
  }

  /**
   * Check if n8n instance is available and API is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', {
        validateStatus: () => true,
      });
      return response.status === 200;
    } catch (error) {
      logger.warn(`n8n health check failed: ${this.extractErrorMessage(error)}`);
      return false;
    }
  }

  /**
   * Extract error message from n8n API response
   */
  private extractN8nError(response: any): string {
    if (!response) {
      return 'Unknown error from n8n';
    }

    // n8n returns detailed error messages in various formats
    if (response.message) {
      return response.message;
    }

    if (response.error) {
      if (typeof response.error === 'string') {
        return response.error;
      }
      if (response.error.message) {
        return response.error.message;
      }
    }

    if (response.errors && Array.isArray(response.errors)) {
      return response.errors.map((e: any) =>
        typeof e === 'string' ? e : e.message || String(e)
      ).join('; ');
    }

    return JSON.stringify(response).substring(0, 200);
  }

  /**
   * Extract error message from exception
   */
  private extractErrorMessage(error: any): string {
    if (!error) {
      return 'Unknown error';
    }

    if (typeof error === 'string') {
      return error;
    }

    if (error.message) {
      return error.message;
    }

    if (error.response?.data) {
      return this.extractN8nError(error.response.data);
    }

    if (error.code) {
      return `Error ${error.code}: ${error.message || 'Unknown'}`;
    }

    return String(error);
  }
}

/**
 * Singleton instance for global use
 */
let validatorInstance: N8nLiveValidator | null = null;

export function initN8nLiveValidator(n8nUrl: string, apiKey: string): N8nLiveValidator {
  validatorInstance = new N8nLiveValidator(n8nUrl, apiKey);
  return validatorInstance;
}

export function getN8nLiveValidator(): N8nLiveValidator {
  if (!validatorInstance) {
    const n8nUrl = process.env.N8N_API_URL || 'http://localhost:5678';
    const apiKey = process.env.N8N_API_KEY || '';

    if (!apiKey) {
      logger.warn('N8N_API_KEY not set - live validation will not work');
    }

    validatorInstance = new N8nLiveValidator(n8nUrl, apiKey);
  }
  return validatorInstance;
}
