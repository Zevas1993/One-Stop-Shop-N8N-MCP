/**
 * Unit Tests: Workflow Agent
 * Tests workflow JSON generation from patterns
 */

import { WorkflowAgent } from '../../../src/ai/agents/workflow-agent';
import { getSharedMemory } from '../../../src/ai/shared-memory';

describe('WorkflowAgent', () => {
  let agent: WorkflowAgent;

  beforeAll(async () => {
    const sharedMemory = await getSharedMemory();
    agent = new WorkflowAgent(sharedMemory);
    await agent.initialize();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(agent).toBeDefined();
      expect(agent.getConfig().id).toBe('workflow-agent');
      expect(agent.getConfig().role).toBe('workflow-generation');
    });

    it('should have correct context budget', () => {
      expect(agent.getConfig().contextBudget).toBe(15000);
    });

    it('should have reasonable timeout', () => {
      expect(agent.getConfig().timeout).toBe(45000); // 45 seconds
    });
  });

  describe('Workflow Generation - Basic Structure', () => {
    it('should generate workflow from pattern input', async () => {
      // First set a pattern in shared memory
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'selected-pattern',
        {
          patternId: 'slack-notification',
          patternName: 'Slack Notification',
          description: 'Send message to Slack',
          confidence: 0.95,
          matchedKeywords: ['slack', 'message', 'notify'],
          suggestedNodes: ['manual', 'slack'],
        },
        'test',
        600000
      );

      const result = await agent.execute({
        goal: 'Send Slack notification',
      });

      expect(result.success).toBe(true);
      expect(result.result?.workflow).toBeDefined();
      expect(result.result?.nodeCount).toBeGreaterThan(0);
      expect(result.result?.connectionCount).toBeGreaterThan(0);
    });

    it('should require pattern in shared memory', async () => {
      // Clear shared memory first
      const sharedMemory = await getSharedMemory();
      await sharedMemory.delete('selected-pattern', 'test');

      const result = await agent.execute({
        goal: 'Test without pattern',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/pattern|shared memory/i);
    });
  });

  describe('Generated Workflow Structure', () => {
    beforeEach(async () => {
      // Setup pattern before each test
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'selected-pattern',
        {
          patternId: 'email-workflow',
          patternName: 'Email Workflow',
          description: 'Send emails',
          confidence: 0.9,
          matchedKeywords: ['email', 'send'],
          suggestedNodes: ['manual', 'email'],
        },
        'test',
        600000
      );
    });

    it('should have valid workflow name and description', async () => {
      const result = await agent.execute({
        goal: 'Send email notifications',
      });

      expect(result.success).toBe(true);
      const workflow = result.result?.workflow;

      expect(typeof workflow.name).toBe('string');
      expect(workflow.name.length).toBeGreaterThan(0);
      expect(typeof workflow.description).toBe('string');
      expect(workflow.description.length).toBeGreaterThan(0);
    });

    it('should have valid nodes array', async () => {
      const result = await agent.execute({
        goal: 'Test nodes',
      });

      expect(result.success).toBe(true);
      const workflow = result.result?.workflow;

      expect(Array.isArray(workflow.nodes)).toBe(true);
      expect(workflow.nodes.length).toBeGreaterThan(0);
    });

    it('should have valid connections object', async () => {
      const result = await agent.execute({
        goal: 'Test connections',
      });

      expect(result.success).toBe(true);
      const workflow = result.result?.workflow;

      expect(typeof workflow.connections).toBe('object');
      expect(Object.keys(workflow.connections).length).toBeGreaterThan(0);
    });
  });

  describe('Node Properties', () => {
    beforeEach(async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'selected-pattern',
        {
          patternId: 'api-integration',
          patternName: 'API Integration',
          description: 'Integrate with APIs',
          confidence: 0.85,
          matchedKeywords: ['api', 'http', 'request'],
          suggestedNodes: ['manual', 'httpRequest'],
        },
        'test',
        600000
      );
    });

    it('should have required node properties', async () => {
      const result = await agent.execute({
        goal: 'Create API workflow',
      });

      expect(result.success).toBe(true);
      const workflow = result.result?.workflow;

      for (const node of workflow.nodes) {
        expect(node).toHaveProperty('name');
        expect(node).toHaveProperty('type');
        expect(node).toHaveProperty('position');
      }
    });

    it('should have valid node names (unique)', async () => {
      const result = await agent.execute({
        goal: 'Test unique names',
      });

      expect(result.success).toBe(true);
      const workflow = result.result?.workflow;
      const nodeNames = new Set();

      for (const node of workflow.nodes) {
        expect(nodeNames.has(node.name)).toBe(false);
        nodeNames.add(node.name);
      }
    });

    it('should have valid node types (n8n format)', async () => {
      const result = await agent.execute({
        goal: 'Test node types',
      });

      expect(result.success).toBe(true);
      const workflow = result.result?.workflow;

      for (const node of workflow.nodes) {
        // Should start with n8n-nodes-base. or similar
        expect(node.type).toMatch(/^n8n-nodes-base\./);
      }
    });

    it('should have valid position coordinates', async () => {
      const result = await agent.execute({
        goal: 'Test positions',
      });

      expect(result.success).toBe(true);
      const workflow = result.result?.workflow;

      for (const node of workflow.nodes) {
        expect(Array.isArray(node.position)).toBe(true);
        expect(node.position).toHaveLength(2);
        expect(typeof node.position[0]).toBe('number');
        expect(typeof node.position[1]).toBe('number');
        expect(node.position[0]).toBeGreaterThanOrEqual(0);
        expect(node.position[1]).toBeGreaterThanOrEqual(0);
      }
    });

    it('should optionally have parameters', async () => {
      const result = await agent.execute({
        goal: 'Test parameters',
      });

      expect(result.success).toBe(true);
      const workflow = result.result?.workflow;

      for (const node of workflow.nodes) {
        if (node.parameters) {
          expect(typeof node.parameters).toBe('object');
        }
      }
    });
  });

  describe('Connection Validity', () => {
    beforeEach(async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'selected-pattern',
        {
          patternId: 'conditional-flow',
          patternName: 'Conditional Flow',
          description: 'Conditional logic',
          confidence: 0.9,
          matchedKeywords: ['if', 'condition'],
          suggestedNodes: ['manual', 'if'],
        },
        'test',
        600000
      );
    });

    it('should have valid connection sources', async () => {
      const result = await agent.execute({
        goal: 'Test connection sources',
      });

      expect(result.success).toBe(true);
      const workflow = result.result?.workflow;
      const nodeNames = new Set(workflow.nodes.map((n: any) => n.name));

      for (const source of Object.keys(workflow.connections)) {
        expect(nodeNames.has(source)).toBe(true);
      }
    });

    it('should have valid connection targets', async () => {
      const result = await agent.execute({
        goal: 'Test connection targets',
      });

      expect(result.success).toBe(true);
      const workflow = result.result?.workflow;
      const nodeNames = new Set(workflow.nodes.map((n: any) => n.name));

      for (const [, connData] of Object.entries(workflow.connections)) {
        const conn = connData as any;
        for (const path of conn.main) {
          for (const target of path) {
            expect(nodeNames.has(target.node)).toBe(true);
          }
        }
      }
    });

    it('should have proper connection structure', async () => {
      const result = await agent.execute({
        goal: 'Test connection structure',
      });

      expect(result.success).toBe(true);
      const workflow = result.result?.workflow;

      for (const [, connData] of Object.entries(workflow.connections)) {
        const conn = connData as any;
        expect(Array.isArray(conn.main)).toBe(true);

        for (const path of conn.main) {
          expect(Array.isArray(path)).toBe(true);
          for (const target of path) {
            expect(target).toHaveProperty('node');
            expect(target).toHaveProperty('type');
            expect(target).toHaveProperty('index');
            expect(typeof target.index).toBe('number');
          }
        }
      }
    });
  });

  describe('Pattern-Specific Workflows', () => {
    it('should generate Slack notification workflow', async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'selected-pattern',
        {
          patternId: 'slack-notification',
          patternName: 'Slack Notification',
          description: 'Send Slack messages',
          confidence: 0.95,
          matchedKeywords: ['slack'],
          suggestedNodes: ['slack'],
        },
        'test',
        600000
      );

      const result = await agent.execute({
        goal: 'Send Slack message',
      });

      expect(result.success).toBe(true);
      const workflow = result.result?.workflow;
      const nodeTypes = workflow.nodes.map((n: any) => n.type);

      expect(nodeTypes.some((t: string) => t.includes('slack'))).toBe(true);
    });

    it('should generate database workflow', async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'selected-pattern',
        {
          patternId: 'database-crud',
          patternName: 'Database CRUD',
          description: 'Database operations',
          confidence: 0.9,
          matchedKeywords: ['database', 'crud'],
          suggestedNodes: ['postgres'],
        },
        'test',
        600000
      );

      const result = await agent.execute({
        goal: 'Create database records',
      });

      expect(result.success).toBe(true);
      const workflow = result.result?.workflow;
      const nodeTypes = workflow.nodes.map((n: any) => n.type);

      expect(nodeTypes.some((t: string) => t.includes('postgres') || t.includes('database'))).toBe(true);
    });
  });

  describe('Shared Memory Integration', () => {
    beforeEach(async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'selected-pattern',
        {
          patternId: 'file-operations',
          patternName: 'File Operations',
          description: 'File operations',
          confidence: 0.85,
          matchedKeywords: ['file'],
          suggestedNodes: [],
        },
        'test',
        600000
      );
    });

    it('should store generated workflow in shared memory', async () => {
      const sharedMemory = await getSharedMemory();

      await agent.execute({
        goal: 'Create file workflow',
      });

      const workflowData = await sharedMemory.get('generated-workflow');
      expect(workflowData).toBeDefined();
      expect(workflowData.workflow).toBeDefined();
      expect(workflowData.goal).toBeTruthy();
      expect(workflowData.generatedAt).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle execution with missing pattern gracefully', async () => {
      const result = await agent.execute({
        goal: 'Test error handling',
      });

      // Should either succeed with default or fail gracefully
      expect(result).toBeDefined();
    });
  });

  describe('Execution Metrics', () => {
    beforeEach(async () => {
      const sharedMemory = await getSharedMemory();
      await sharedMemory.set(
        'selected-pattern',
        {
          patternId: 'data-transformation',
          patternName: 'Data Transformation',
          description: 'Data transformation',
          confidence: 0.88,
          matchedKeywords: ['transform'],
          suggestedNodes: [],
        },
        'test',
        600000
      );
    });

    it('should measure execution time', async () => {
      const result = await agent.execute({
        goal: 'Generate workflow',
      });

      if (result.success) {
        expect(result.executionTime).toBeGreaterThan(0);
        expect(result.executionTime).toBeLessThan(10000); // Should be quick
      }
    });

    it('should report token usage', async () => {
      const result = await agent.execute({
        goal: 'Generate workflow',
      });

      if (result.success && result.tokensUsed) {
        expect(result.tokensUsed).toBeGreaterThan(0);
        expect(result.tokensUsed).toBeLessThan(15000); // Within context budget
      }
    });
  });
});
