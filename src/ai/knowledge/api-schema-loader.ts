/**
 * API Schema Loader
 * Loads and provides the official n8n API schema to Agentic GraphRAG agents
 * Helps agents understand the correct API structure, field requirements, and constraints
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/logger';

export interface APISchemaInfo {
  version: string;
  title: string;
  description: string;
  workflowSchema: WorkflowSchemaInfo;
  fieldRequirements: FieldRequirements;
  systemManagedFields: string[];
  userSettableFields: string[];
  nodeTypeGuidance: NodeTypeGuidance;
}

export interface WorkflowSchemaInfo {
  requiredFields: string[];
  optionalFields: string[];
  connectionFormat: string;
  nodeFormat: string;
  constraints: WorkflowConstraint[];
}

export interface WorkflowConstraint {
  field: string;
  rule: string;
  description: string;
  example: string;
}

export interface FieldRequirements {
  readonly: ReadOnlyFieldInfo[];
  userSettable: UserSettableFieldInfo[];
}

export interface ReadOnlyFieldInfo {
  name: string;
  description: string;
  reason: string;
}

export interface UserSettableFieldInfo {
  name: string;
  type: string;
  description: string;
  required: boolean;
  examples: any[];
}

export interface NodeTypeGuidance {
  commonErrors: NodeError[];
  bestPractices: string[];
  validationRules: ValidationRule[];
}

export interface NodeError {
  error: string;
  cause: string;
  solution: string;
}

export interface ValidationRule {
  rule: string;
  description: string;
  impact: string;
}

/**
 * API Schema Knowledge Source
 * Provides agents with official API specification knowledge
 */
export class APISchemaLoader {
  private static instance: APISchemaLoader;
  private schema: APISchemaInfo | null = null;
  private rawApiSchema: any = null;
  private logger: Logger;

  private constructor() {
    this.logger = new Logger({ prefix: '[APISchemaLoader]' });
  }

  static getInstance(): APISchemaLoader {
    if (!APISchemaLoader.instance) {
      APISchemaLoader.instance = new APISchemaLoader();
    }
    return APISchemaLoader.instance;
  }

  /**
   * Load API schema from file
   */
  async loadSchema(): Promise<APISchemaInfo> {
    if (this.schema) {
      return this.schema;
    }

    try {
      // Try to load the official API schema
      const apiSchemaPath = path.join('C:\\Users\\Chris Boyd\\Downloads\\api-1.json');

      if (!fs.existsSync(apiSchemaPath)) {
        this.logger.warn(
          `API schema not found at ${apiSchemaPath}, using fallback knowledge`
        );
        return this.getFallbackSchema();
      }

      const fileContent = fs.readFileSync(apiSchemaPath, 'utf-8');
      this.rawApiSchema = JSON.parse(fileContent);

      // Extract and structure the schema information
      this.schema = this.extractSchemaInfo(this.rawApiSchema);
      this.logger.info(
        `API schema loaded successfully (v${this.schema.version})`
      );

      return this.schema;
    } catch (error) {
      this.logger.error('Failed to load API schema', error as Error);
      return this.getFallbackSchema();
    }
  }

  /**
   * Extract schema information from raw OpenAPI schema
   */
  private extractSchemaInfo(apiSchema: any): APISchemaInfo {
    return {
      version: apiSchema.info?.version || '1.1.1',
      title: apiSchema.info?.title || 'n8n Public API',
      description: apiSchema.info?.description || 'n8n Public API',
      workflowSchema: this.extractWorkflowSchema(apiSchema),
      fieldRequirements: this.extractFieldRequirements(),
      systemManagedFields: this.getSystemManagedFields(),
      userSettableFields: this.getUserSettableFields(),
      nodeTypeGuidance: this.getNodeTypeGuidance(),
    };
  }

  /**
   * Extract workflow schema information
   */
  private extractWorkflowSchema(apiSchema: any): WorkflowSchemaInfo {
    return {
      requiredFields: [
        'name',
        'nodes',
        'connections',
        'createdAt',
        'updatedAt',
      ],
      optionalFields: [
        'active',
        'settings',
        'staticData',
        'pinData',
        'tags',
        'meta',
      ],
      connectionFormat:
        'Connections use NODE NAMES (not IDs) as keys. Format: { "SourceNodeName": { "main": [[{ "node": "TargetNodeName", "type": "main", "index": 0 }]] } }',
      nodeFormat:
        'Nodes contain: id, name, type (with package prefix), typeVersion, position, parameters, credentials, disabled, notes, etc.',
      constraints: [
        {
          field: 'connections',
          rule: 'Must use node NAMES as keys, not node IDs',
          description:
            'Connections reference nodes by their display name, not their system ID',
          example:
            '{ "My HTTP Request": { "main": [[{ "node": "My Set Node" }]] } }',
        },
        {
          field: 'nodes',
          rule: 'Must have at least one node',
          description: 'Empty workflows are invalid',
          example: 'A minimum viable workflow requires a trigger node',
        },
        {
          field: 'node.type',
          rule: 'Must include package prefix (e.g., "n8n-nodes-base.webhook")',
          description: 'Node types must follow the full package naming convention',
          example:
            'Valid: "n8n-nodes-base.webhook", Invalid: "webhook" or "nodes-base.webhook"',
        },
        {
          field: 'node.typeVersion',
          rule: 'Must be specified for all nodes',
          description:
            'typeVersion indicates which version of the node implementation to use',
          example: 'typeVersion: 1',
        },
      ],
    };
  }

  /**
   * Extract field requirements from API schema
   */
  private extractFieldRequirements(): FieldRequirements {
    return {
      readonly: [
        {
          name: 'id',
          description: 'System-generated workflow ID',
          reason: 'Generated by n8n API, cannot be set by user',
        },
        {
          name: 'createdAt',
          description: 'Workflow creation timestamp',
          reason: 'Set automatically when workflow is created',
        },
        {
          name: 'updatedAt',
          description: 'Last update timestamp',
          reason: 'Updated automatically by n8n',
        },
        {
          name: 'versionId',
          description: 'Workflow version identifier',
          reason: 'Managed by n8n version control',
        },
        {
          name: 'isArchived',
          description: 'Archive status flag',
          reason: 'Managed by n8n',
        },
        {
          name: 'triggerCount',
          description: 'Number of times workflow has been triggered',
          reason: 'Calculated by n8n',
        },
        {
          name: 'usedCredentials',
          description: 'Credentials used in workflow',
          reason: 'Calculated from workflow analysis',
        },
        {
          name: 'sharedWithProjects',
          description: 'Projects this workflow is shared with',
          reason: 'Managed by n8n sharing system',
        },
      ],
      userSettable: [
        {
          name: 'name',
          type: 'string',
          description: 'Workflow display name',
          required: true,
          examples: ['User Registration Workflow', 'Data Processing Pipeline'],
        },
        {
          name: 'nodes',
          type: 'array<WorkflowNode>',
          description: 'Array of workflow nodes',
          required: true,
          examples: [
            [
              {
                id: '1',
                name: 'Trigger',
                type: 'n8n-nodes-base.webhook',
                typeVersion: 1,
                position: [100, 100],
                parameters: {},
              },
            ],
          ],
        },
        {
          name: 'connections',
          type: 'object',
          description: 'Node connections (use node names, not IDs)',
          required: true,
          examples: [
            {
              'My Trigger': {
                main: [[{ node: 'My Action', type: 'main', index: 0 }]],
              },
            },
          ],
        },
        {
          name: 'active',
          type: 'boolean',
          description: 'Whether workflow is active/enabled',
          required: false,
          examples: [true, false],
        },
        {
          name: 'settings',
          type: 'object',
          description: 'Workflow-level settings',
          required: false,
          examples: [{ executionOrder: 'v1', timezone: 'UTC' }],
        },
        {
          name: 'staticData',
          type: 'object',
          description: 'Persistent state data across executions',
          required: false,
          examples: [{ lastProcessedId: 123 }],
        },
        {
          name: 'pinData',
          type: 'object',
          description: 'Pinned execution data for nodes',
          required: false,
          examples: [{ 'Node Name': [{ key: 'value' }] }],
        },
        {
          name: 'tags',
          type: 'array<string>',
          description: 'Tags for organizing workflows',
          required: false,
          examples: [['production', 'critical']],
        },
      ],
    };
  }

  /**
   * Get system-managed fields that should never be sent in API requests
   */
  private getSystemManagedFields(): string[] {
    return [
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
  }

  /**
   * Get user-settable fields
   */
  private getUserSettableFields(): string[] {
    return [
      'name',
      'nodes',
      'connections',
      'active',
      'settings',
      'staticData',
      'pinData',
      'tags',
    ];
  }

  /**
   * Get node type guidance for agents
   */
  private getNodeTypeGuidance(): NodeTypeGuidance {
    return {
      commonErrors: [
        {
          error: 'Invalid node type "webhook" - must use full package name',
          cause: 'Missing or incorrect package prefix in node type',
          solution:
            'Use "n8n-nodes-base.webhook" instead of "webhook" or "nodes-base.webhook"',
        },
        {
          error:
            'Connection references node ID instead of node name (e.g., "set-1")',
          cause: 'Using node system ID instead of display name in connections',
          solution:
            'Replace node IDs with display names. If node name is "Set", use "Set" not the ID',
        },
        {
          error: 'typeVersion is missing or invalid',
          cause: 'Node definition incomplete or using wrong version',
          solution:
            'Always specify typeVersion. Check n8n documentation for the correct version',
        },
        {
          error:
            'System-managed fields sent in request (id, createdAt, updatedAt, etc.)',
          cause: 'Attempting to set read-only fields',
          solution:
            'Remove system-managed fields before creating/updating workflows',
        },
        {
          error: 'Single-node workflow with no connections',
          cause: 'Workflow structure is incomplete',
          solution:
            'Add at least one more node or use proper single-trigger pattern with connections object',
        },
      ],
      bestPractices: [
        'Always use node NAMES in connections, never node IDs',
        'Include typeVersion for every node to ensure compatibility',
        'Remove all system-managed fields before API operations',
        'Use descriptive node names that match the operation being performed',
        'Test workflow structure validation before deployment',
        'Include proper error handling nodes (Error handling triggers)',
        'Keep workflows organized with meaningful node positioning',
        'Use tags and settings to document workflow purpose',
        'Validate connections reference existing nodes',
        'Ensure all trigger nodes have appropriate output connections',
      ],
      validationRules: [
        {
          rule: 'Connection keys must be node names',
          description:
            'All keys in the connections object must match existing node names',
          impact:
            'Invalid connections will cause workflow to fail or not execute properly',
        },
        {
          rule: 'Node types must use full package prefix',
          description: 'Node types must be in format "package.nodetype"',
          impact: 'Invalid node types will prevent node instantiation',
        },
        {
          rule: 'typeVersion must be a non-negative integer',
          description: 'Each node must specify a compatible typeVersion',
          impact: 'Wrong typeVersion may cause API incompatibilities',
        },
        {
          rule: 'Workflows must have at least one node',
          description: 'Empty workflows are not valid',
          impact: 'Cannot create or deploy empty workflows',
        },
        {
          rule: 'System-managed fields must not be included in requests',
          description:
            'Fields like id, createdAt, updatedAt are read-only and managed by n8n',
          impact:
            'API will reject requests containing system-managed fields',
        },
        {
          rule: 'Credentials must be properly formatted in node parameters',
          description: 'Credential references use specific format and structure',
          impact:
            'Workflows with invalid credentials will fail during execution',
        },
      ],
    };
  }

  /**
   * Get fallback schema when API schema file is not available
   */
  private getFallbackSchema(): APISchemaInfo {
    this.logger.warn('Using fallback API schema knowledge');
    return {
      version: '1.1.1',
      title: 'n8n Public API',
      description: 'n8n Public API - Fallback Knowledge',
      workflowSchema: this.extractWorkflowSchema({}),
      fieldRequirements: this.extractFieldRequirements(),
      systemManagedFields: this.getSystemManagedFields(),
      userSettableFields: this.getUserSettableFields(),
      nodeTypeGuidance: this.getNodeTypeGuidance(),
    };
  }

  /**
   * Get API schema info as formatted knowledge for agents
   */
  async getAgentKnowledge(): Promise<string> {
    const schema = await this.loadSchema();

    return `
# Official n8n API Schema (v${schema.version})

## Workflow Structure Requirements

### Required Fields
${schema.workflowSchema.requiredFields.map((f) => `- ${f}`).join('\n')}

### Optional Fields
${schema.workflowSchema.optionalFields.map((f) => `- ${f}`).join('\n')}

### Connection Format
${schema.workflowSchema.connectionFormat}

### Constraints
${schema.workflowSchema.constraints
  .map(
    (c) => `
- **${c.field}**: ${c.rule}
  - ${c.description}
  - Example: ${c.example}
`
  )
  .join('\n')}

## Field Requirements

### System-Managed (Read-Only) Fields
These fields are managed by n8n and must NEVER be sent in POST/PUT requests:
${schema.systemManagedFields.map((f) => `- ${f}`).join('\n')}

### User-Settable Fields
${schema.userSettableFields.map((f) => `- ${f}`).join('\n')}

## Node Type Guidance

### Common Errors to Avoid
${schema.nodeTypeGuidance.commonErrors
  .map(
    (e) => `
**Error**: ${e.error}
- Cause: ${e.cause}
- Solution: ${e.solution}
`
  )
  .join('\n')}

### Best Practices
${schema.nodeTypeGuidance.bestPractices.map((p) => `- ${p}`).join('\n')}

### Validation Rules
${schema.nodeTypeGuidance.validationRules
  .map((r) => `- **${r.rule}**: ${r.description} (Impact: ${r.impact})`)
  .join('\n')}
`;
  }

  /**
   * Get specific API guidance for a context
   */
  async getGuidanceFor(context: string): Promise<string> {
    const schema = await this.loadSchema();

    if (context.includes('connection')) {
      return schema.workflowSchema.constraints
        .filter((c) => c.field.includes('connection'))
        .map(
          (c) => `
${c.field}: ${c.rule}
Description: ${c.description}
Example: ${c.example}
`
        )
        .join('\n');
    }

    if (context.includes('node') || context.includes('type')) {
      return `
${schema.nodeTypeGuidance.commonErrors
  .filter(
    (e) =>
      e.error.toLowerCase().includes('node') ||
      e.error.toLowerCase().includes('type')
  )
  .map((e) => `Error: ${e.error}\nSolution: ${e.solution}`)
  .join('\n\n')}
`;
    }

    if (context.includes('field') || context.includes('create')) {
      return `
User-Settable Fields:
${schema.fieldRequirements.userSettable
  .map((f: UserSettableFieldInfo) => `- ${f.name} (${f.type}): ${f.description}`)
  .join('\n')}

System-Managed Fields (DO NOT SEND):
${schema.fieldRequirements.readonly
  .map((f) => `- ${f.name}: ${f.reason}`)
  .join('\n')}
`;
    }

    return await this.getAgentKnowledge();
  }

  /**
   * Clear cached schema (for testing)
   */
  clearCache(): void {
    this.schema = null;
    this.rawApiSchema = null;
  }
}

export default APISchemaLoader;
